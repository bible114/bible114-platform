import { PlatformError } from "../_shared/errors.ts";
import {
  beginTransaction,
  commitWrites,
  type FirestoreDocument,
  getDocument,
  rollbackTransaction,
  runCollectionGroupQuery,
  runCollectionQuery,
  updateWrite,
} from "../_shared/firestore.ts";
import { getLegacyCalendarDateStringKst } from "../_shared/time.ts";
import { isRequestId } from "./core.ts";
import quizAnswerIndex from "./quiz-answer-index.json" with { type: "json" };
import {
  parseQuizProgressKey,
  type QuizIndexRecord,
  type StoredQuizEntry,
  type StoredQuizUser,
  validateQuizSubmission,
} from "./quizCore.ts";
import {
  normalizeStoredDocumentId,
  parseRosterTalentWallets,
  resolveTalentWalletPrograms,
  type TalentMembershipUser,
} from "./talentProgramCore.ts";

export const SUBMIT_QUIZ_ACTION = "submitQuiz" as const;
export const SKIP_QUIZ_ACTION = "skipQuiz" as const;
export const QUIZ_ACTIVITY_LEDGER_SCHEMA_VERSION = 2;
const LEGACY_QUIZ_ACTIVITY_LEDGER_SCHEMA_VERSION = 1;

const MAX_TALENT_VALUE = 1_000_000_000;
const QUIZ_KEY_PATTERN = /^[A-Za-z0-9_-]{1,128}$/;
const LEGACY_DATE_PATTERN =
  /^(Sun|Mon|Tue|Wed|Thu|Fri|Sat) (Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec) (0[1-9]|[12]\d|3[01]) (\d{4})$/;
const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

type ServiceAccess = { token: string; projectId: string };
type UnknownRecord = Record<string, unknown>;

type QuizUserDocument = StoredQuizUser & TalentMembershipUser & {
  isDeleted?: unknown;
  churchId?: unknown;
  baseChurchId?: unknown;
  talent?: unknown;
  quizRewardAmount?: unknown;
};

type QuizRosterDocument = TalentMembershipUser & {
  uid?: unknown;
  talent?: unknown;
};

export type SubmitQuizInput = {
  uid: string;
  requestId: string;
  progressKey: string;
  quizKey: string;
  selectedIndex: number;
  attemptSlot: 1 | 2;
};

type BoundQuizInput = Pick<
  SubmitQuizInput,
  "progressKey" | "quizKey" | "selectedIndex" | "attemptSlot"
>;

export type PublicQuizProgressEntry = {
  attempts: number;
  solved: boolean;
  skipped: boolean;
  quizKey: string;
  reward: number;
  updatedDate: string;
};

export type SubmitQuizResult =
  | {
    status: "ready";
    attempts: number;
    solved: boolean;
    skipped: false;
    isCorrect: boolean;
    reward: number;
    quizKey: string;
    entry: PublicQuizProgressEntry;
    rewardsUserWallet: boolean;
    rewardedRosterOrgIds: string[];
  }
  | {
    status: "alreadyDone";
    attempts: number;
    solved: boolean;
    skipped: boolean;
    reward: number;
    quizKey: string;
  };

export type SubmitQuizState = {
  progressKey: string;
  progress: PublicQuizProgressEntry;
  quizRewardDate: string | null;
  quizRewardAmount: number;
  userTalent: number;
  rosterTalents: Array<{ orgId: string; talent: number }>;
};

export type SubmitQuizResponse = {
  ok: true;
  action: typeof SUBMIT_QUIZ_ACTION;
  requestId: string;
  calendarDate: string;
  alreadyCompleted: boolean;
  result: SubmitQuizResult;
  state: SubmitQuizState;
};

export type SkipQuizInput = {
  uid: string;
  requestId: string;
  progressKey: string;
  quizKey: string;
};

export type SkipQuizResponse = {
  ok: true;
  action: typeof SKIP_QUIZ_ACTION;
  requestId: string;
  calendarDate: string;
  alreadyCompleted: boolean;
  committed: boolean;
  state: {
    progressKey: string;
    progress: PublicQuizProgressEntry;
  };
};

type QuizActivityLedger = {
  schemaVersion?: unknown;
  readingEpoch?: unknown;
  action?: unknown;
  requestId?: unknown;
  input?: unknown;
  calendarDate?: unknown;
  result?: unknown;
  createdAt?: unknown;
};

type SemanticSubmitLedger = {
  requestId: string;
  input: BoundQuizInput;
  calendarDate: string;
  result: Extract<SubmitQuizResult, { status: "ready" }>;
};

type SemanticSkipLedger = {
  requestId: string;
  input: BoundSkipQuizInput;
  calendarDate: string;
  progress: PublicQuizProgressEntry;
};

type SemanticQuizState = {
  slot1: SemanticSubmitLedger | null;
  slot2: SemanticSubmitLedger | null;
  skip: SemanticSkipLedger | null;
};

type QuizSubmissionDependencies = {
  beginTransaction: typeof beginTransaction;
  commitWrites: typeof commitWrites;
  getDocument: typeof getDocument;
  rollbackTransaction: typeof rollbackTransaction;
  runCollectionQuery: typeof runCollectionQuery;
  runCollectionGroupQuery: typeof runCollectionGroupQuery;
  updateWrite: typeof updateWrite;
  now: () => Date;
  questions: Record<string, QuizIndexRecord | undefined>;
};

const DEFAULT_DEPENDENCIES: QuizSubmissionDependencies = {
  beginTransaction,
  commitWrites,
  getDocument,
  rollbackTransaction,
  runCollectionQuery,
  runCollectionGroupQuery,
  updateWrite,
  now: () => new Date(),
  questions: quizAnswerIndex.questions as Record<
    string,
    QuizIndexRecord | undefined
  >,
};

const record = (value: unknown): UnknownRecord | null =>
  value && typeof value === "object" && !Array.isArray(value)
    ? value as UnknownRecord
    : null;

const stateConflict = (message = "퀴즈 저장 상태를 확인해 주세요.") =>
  new PlatformError("CONFLICT", { message });

const readNonNegativeSafeInteger = (
  value: unknown,
  fallback: number,
  maximum = Number.MAX_SAFE_INTEGER,
): number => {
  if (value === null || value === undefined) return fallback;
  if (
    typeof value !== "number" || !Number.isSafeInteger(value) || value < 0 ||
    value > maximum
  ) {
    throw stateConflict();
  }
  return value;
};

const readTalent = (value: unknown): number =>
  readNonNegativeSafeInteger(value, 0, MAX_TALENT_VALUE);

const addTalent = (balance: number, reward: number): number => {
  if (
    !Number.isSafeInteger(reward) || reward < 0 || reward > 10 ||
    balance > MAX_TALENT_VALUE - reward
  ) {
    throw stateConflict("달란트 잔액을 확인해 주세요.");
  }
  return balance + reward;
};

const isStoredDateString = (value: string): boolean => {
  const legacy = LEGACY_DATE_PATTERN.exec(value);
  if (!legacy) return false;
  const month = MONTHS.indexOf(legacy[2]);
  const day = Number(legacy[3]);
  const year = Number(legacy[4]);
  const date = new Date(Date.UTC(year, month, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month &&
    date.getUTCDate() === day && WEEKDAYS[date.getUTCDay()] === legacy[1];
};

const readOptionalDateString = (value: unknown): string | null => {
  if (value === null || value === undefined || value === "") return null;
  if (
    typeof value !== "string" || value.length > 128 ||
    !isStoredDateString(value)
  ) {
    throw stateConflict();
  }
  return value;
};

const storedDateTimestamp = (value: string): number => {
  const match = LEGACY_DATE_PATTERN.exec(value);
  if (!match || !isStoredDateString(value)) throw stateConflict();
  return Date.UTC(Number(match[4]), MONTHS.indexOf(match[2]), Number(match[3]));
};

const validQuizKey = (value: unknown): value is string =>
  typeof value === "string" && QUIZ_KEY_PATTERN.test(value);

const assertStoredQuizNumbers = (
  user: QuizUserDocument,
  progressKey: string,
  calendarDate: string,
) => {
  const todayTimestamp = storedDateTimestamp(calendarDate);
  readNonNegativeSafeInteger(user.readingEpoch, 0);
  if (user.currentDay !== null && user.currentDay !== undefined) {
    const currentDay = readNonNegativeSafeInteger(user.currentDay, 1, 365);
    if (currentDay < 1) throw stateConflict();
  }
  if (user.readCount !== null && user.readCount !== undefined) {
    const readCount = readNonNegativeSafeInteger(user.readCount, 1);
    if (readCount < 1) throw stateConflict();
  }
  if (user.dayOffset !== null && user.dayOffset !== undefined) {
    if (
      typeof user.dayOffset !== "number" ||
      !Number.isSafeInteger(user.dayOffset)
    ) throw stateConflict();
  }
  const legacyAttempts = readNonNegativeSafeInteger(user.quizAttempts, 0, 2);
  const quizRewardAmount = readNonNegativeSafeInteger(
    user.quizRewardAmount,
    0,
    10,
  );
  const lastReadDate = readOptionalDateString(user.lastReadDate);
  const quizDate = readOptionalDateString(user.quizDate);
  const quizRewardDate = readOptionalDateString(user.quizRewardDate);
  for (const date of [lastReadDate, quizDate, quizRewardDate]) {
    if (date && storedDateTimestamp(date) > todayTimestamp) {
      throw stateConflict("퀴즈 날짜가 서버 날짜보다 미래입니다.");
    }
  }
  if (
    ![0, 5, 10].includes(quizRewardAmount) ||
    (quizRewardDate === null) !== (quizRewardAmount === 0)
  ) throw stateConflict("퀴즈 보상 표식을 확인해 주세요.");
  for (const value of [user.quizSolved, user.quizSkipped]) {
    if (
      value !== undefined && value !== null && typeof value !== "boolean"
    ) throw stateConflict();
  }
  const legacySolved = user.quizSolved === true;
  const legacySkipped = user.quizSkipped === true;
  if (
    quizDate === calendarDate &&
    (!validQuizKey(user.quizKey) || legacySolved && legacySkipped ||
      (legacySolved && (legacyAttempts < 1 || legacyAttempts > 2)))
  ) throw stateConflict();

  if (
    user.quizProgress !== null && user.quizProgress !== undefined &&
    !record(user.quizProgress)
  ) throw stateConflict();
  const stored = record(user.quizProgress)?.[progressKey];
  if (stored === null || stored === undefined) return;
  const entry = record(stored);
  if (!entry) throw stateConflict();
  const attempts = readNonNegativeSafeInteger(entry.attempts, 0, 2);
  const reward = readNonNegativeSafeInteger(entry.reward, 0, 10);
  for (const value of [entry.solved, entry.skipped]) {
    if (
      value !== undefined && value !== null && typeof value !== "boolean"
    ) throw stateConflict();
  }
  const solved = entry.solved === true;
  const skipped = entry.skipped === true;
  const expectedReward = attempts === 1 ? 10 : attempts === 2 ? 5 : 0;
  if (
    (entry.quizKey !== undefined && entry.quizKey !== null &&
      entry.quizKey !== "" && !validQuizKey(entry.quizKey)) ||
    ((attempts > 0 || solved || skipped) && !validQuizKey(entry.quizKey)) ||
    (solved && skipped) || (solved && attempts < 1) ||
    (!solved && reward !== 0) || (skipped && reward !== 0) ||
    (skipped && attempts > 1) ||
    (reward > 0 && reward !== expectedReward)
  ) throw stateConflict();
  const updatedDate = readOptionalDateString(entry.updatedDate);
  if (updatedDate && storedDateTimestamp(updatedDate) > todayTimestamp) {
    throw stateConflict("퀴즈 진행 날짜가 서버 날짜보다 미래입니다.");
  }
  if (
    reward > 0 && updatedDate === calendarDate &&
    (quizRewardDate !== updatedDate || quizRewardAmount !== reward)
  ) throw stateConflict("퀴즈 진행과 보상 표식이 일치하지 않습니다.");
};

const publicProgressEntry = (
  value: StoredQuizEntry | UnknownRecord,
  fallbackDate: string,
): PublicQuizProgressEntry => {
  const attempts = readNonNegativeSafeInteger(value.attempts, 0, 2);
  const reward = readNonNegativeSafeInteger(value.reward, 0, 10);
  if (!validQuizKey(value.quizKey)) throw stateConflict();
  if (
    value.solved !== true && value.solved !== false &&
    value.solved !== null && value.solved !== undefined
  ) throw stateConflict();
  if (
    value.skipped !== true && value.skipped !== false &&
    value.skipped !== null && value.skipped !== undefined
  ) throw stateConflict();
  const updatedDate = value.updatedDate === null ||
      value.updatedDate === undefined || value.updatedDate === ""
    ? fallbackDate
    : readOptionalDateString(value.updatedDate);
  if (!updatedDate) throw stateConflict();
  const solved = value.solved === true;
  const skipped = value.skipped === true;
  const expectedReward = attempts === 1 ? 10 : attempts === 2 ? 5 : 0;
  if (
    solved &&
      (skipped || attempts < 1 || ![0, expectedReward].includes(reward)) ||
    !solved && reward !== 0 || skipped && attempts > 1
  ) throw stateConflict();
  return {
    attempts,
    solved,
    skipped,
    quizKey: value.quizKey,
    reward,
    updatedDate,
  };
};

const sameProgress = (
  left: PublicQuizProgressEntry,
  right: PublicQuizProgressEntry,
): boolean =>
  left.attempts === right.attempts && left.solved === right.solved &&
  left.skipped === right.skipped && left.quizKey === right.quizKey &&
  left.reward === right.reward && left.updatedDate === right.updatedDate;

// 같은 submit request의 replay 뒤 현재 progress가 달라도, 첫 오답 뒤의 정상적인
// 2차 제출·건너뛰기만 후속 상태로 인정한다. terminal ledger는 항상 우선한다.
const progressCanFollowSubmission = (
  ledgerProgress: PublicQuizProgressEntry,
  currentProgress: PublicQuizProgressEntry,
): boolean => {
  if (sameProgress(ledgerProgress, currentProgress)) return true;
  if (
    ledgerProgress.quizKey !== currentProgress.quizKey ||
    ledgerProgress.solved || ledgerProgress.skipped ||
    ledgerProgress.attempts !== 1 || ledgerProgress.reward !== 0 ||
    storedDateTimestamp(currentProgress.updatedDate) <
      storedDateTimestamp(ledgerProgress.updatedDate)
  ) return false;
  if (currentProgress.solved) {
    return !currentProgress.skipped && currentProgress.attempts === 2 &&
      [0, 5].includes(currentProgress.reward);
  }
  if (currentProgress.skipped) {
    return currentProgress.attempts === 1 && currentProgress.reward === 0;
  }
  return currentProgress.attempts === 2 && currentProgress.reward === 0;
};

const inputMatches = (value: unknown, expected: BoundQuizInput): boolean => {
  const input = record(value);
  return Boolean(
    input && Object.keys(input).length === 4 &&
      input.progressKey === expected.progressKey &&
      input.quizKey === expected.quizKey &&
      input.selectedIndex === expected.selectedIndex &&
      input.attemptSlot === expected.attemptSlot,
  );
};

const progressReadingEpoch = (progressKey: unknown): number => {
  const position = parseQuizProgressKey(progressKey);
  if (!position) throw stateConflict("퀴즈 진도 회차를 확인해 주세요.");
  return position.epoch;
};

const ledgerReadingEpoch = (ledger: QuizActivityLedger): number => {
  const input = record(ledger.input);
  const progressEpoch = progressReadingEpoch(input?.progressKey);
  if (ledger.schemaVersion === LEGACY_QUIZ_ACTIVITY_LEDGER_SCHEMA_VERSION) {
    if (ledger.readingEpoch !== undefined || progressEpoch !== 0) {
      throw stateConflict("저장된 퀴즈 재시작 회차를 확인해 주세요.");
    }
    return 0;
  }
  if (ledger.schemaVersion !== QUIZ_ACTIVITY_LEDGER_SCHEMA_VERSION) {
    throw stateConflict("저장된 퀴즈 원장 버전을 확인해 주세요.");
  }
  if (ledger.readingEpoch === undefined || ledger.readingEpoch === null) {
    throw stateConflict("저장된 퀴즈 재시작 회차가 없습니다.");
  }
  const epoch = readNonNegativeSafeInteger(ledger.readingEpoch, 0);
  if (epoch !== progressEpoch) {
    throw stateConflict("저장된 퀴즈 재시작 회차가 일치하지 않습니다.");
  }
  return epoch;
};

const readStringArray = (value: unknown): string[] | null => {
  if (!Array.isArray(value) || value.length > 3) return null;
  const normalized = value.flatMap((item) => {
    const id = normalizeStoredDocumentId(item);
    return id ? [id] : [];
  });
  if (
    normalized.length !== value.length ||
    new Set(normalized).size !== normalized.length ||
    normalized.some((item, index) => item !== value[index]) ||
    normalized.some((item, index) => index > 0 && normalized[index - 1] > item)
  ) return null;
  return normalized;
};

const readLedgerResult = (value: unknown): SubmitQuizResult => {
  const stored = record(value);
  if (!stored || stored.status !== "ready") throw stateConflict();
  const attempts = readNonNegativeSafeInteger(stored.attempts, -1, 2);
  const reward = readNonNegativeSafeInteger(stored.reward, -1, 10);
  const entryRecord = record(stored.entry);
  const rosterIds = readStringArray(stored.rewardedRosterOrgIds);
  if (
    attempts < 1 || !entryRecord || !rosterIds ||
    typeof stored.solved !== "boolean" || stored.skipped !== false ||
    typeof stored.isCorrect !== "boolean" ||
    typeof stored.rewardsUserWallet !== "boolean" ||
    !validQuizKey(stored.quizKey)
  ) throw stateConflict();
  const entry = publicProgressEntry(entryRecord, "");
  if (
    entry.attempts !== attempts || entry.solved !== stored.solved ||
    entry.skipped !== false || entry.quizKey !== stored.quizKey ||
    entry.reward !== reward || entry.solved !== stored.isCorrect ||
    (reward === 0 &&
      (stored.rewardsUserWallet === true || rosterIds.length > 0))
  ) throw stateConflict();
  return {
    status: "ready",
    attempts,
    solved: stored.solved,
    skipped: false,
    isCorrect: stored.isCorrect,
    reward,
    quizKey: stored.quizKey,
    entry,
    rewardsUserWallet: stored.rewardsUserWallet,
    rewardedRosterOrgIds: rosterIds,
  };
};

const readLedger = (
  ledger: QuizActivityLedger,
  requestId: string,
  expectedInput: BoundQuizInput,
  currentCalendarDate: string,
): { calendarDate: string; result: SubmitQuizResult } => {
  const expectedReadingEpoch = progressReadingEpoch(expectedInput.progressKey);
  if (
    ledgerReadingEpoch(ledger) !== expectedReadingEpoch ||
    ledger.action !== SUBMIT_QUIZ_ACTION || ledger.requestId !== requestId ||
    !inputMatches(ledger.input, expectedInput) ||
    typeof ledger.calendarDate !== "string" ||
    !isStoredDateString(ledger.calendarDate) ||
    storedDateTimestamp(ledger.calendarDate) >
      storedDateTimestamp(currentCalendarDate)
  ) {
    throw stateConflict("같은 요청 번호의 처리 내역과 입력이 다릅니다.");
  }
  const result = readLedgerResult(ledger.result);
  if (
    result.status !== "ready" ||
    result.entry.updatedDate !== ledger.calendarDate
  ) {
    throw stateConflict("저장된 퀴즈 날짜가 결과와 일치하지 않습니다.");
  }
  return { calendarDate: ledger.calendarDate, result };
};

const sameReadyResult = (
  left: Extract<SubmitQuizResult, { status: "ready" }>,
  right: Extract<SubmitQuizResult, { status: "ready" }>,
): boolean =>
  left.status === right.status && left.attempts === right.attempts &&
  left.solved === right.solved && left.skipped === right.skipped &&
  left.isCorrect === right.isCorrect && left.reward === right.reward &&
  left.quizKey === right.quizKey && sameProgress(left.entry, right.entry) &&
  left.rewardsUserWallet === right.rewardsUserWallet &&
  left.rewardedRosterOrgIds.length === right.rewardedRosterOrgIds.length &&
  left.rewardedRosterOrgIds.every((id, index) =>
    id === right.rewardedRosterOrgIds[index]
  );

const readSemanticSubmitLedger = (
  ledger: QuizActivityLedger,
  progressKey: string,
  quizKey: string,
  attemptSlot: 1 | 2,
  currentCalendarDate: string,
): SemanticSubmitLedger => {
  const input = record(ledger.input);
  if (
    !isRequestId(ledger.requestId) || !input ||
    !Number.isSafeInteger(input.selectedIndex) ||
    Number(input.selectedIndex) < 0 || Number(input.selectedIndex) > 3 ||
    input.progressKey !== progressKey || input.quizKey !== quizKey ||
    input.attemptSlot !== attemptSlot
  ) throw stateConflict("저장된 퀴즈 시도 내역을 확인해 주세요.");
  const boundInput: BoundQuizInput = {
    progressKey,
    quizKey,
    selectedIndex: Number(input.selectedIndex),
    attemptSlot,
  };
  const replay = readLedger(
    ledger,
    ledger.requestId,
    boundInput,
    currentCalendarDate,
  );
  if (
    replay.result.status !== "ready" ||
    replay.result.attempts !== attemptSlot
  ) throw stateConflict("저장된 퀴즈 시도 순서를 확인해 주세요.");
  return {
    requestId: ledger.requestId,
    input: boundInput,
    calendarDate: replay.calendarDate,
    result: replay.result,
  };
};

const readDailyAwardedReward = (
  ledger: QuizActivityLedger,
  calendarDate: string,
): number | null => {
  if (ledger.action !== SUBMIT_QUIZ_ACTION) return null;
  ledgerReadingEpoch(ledger);
  if (
    !isRequestId(ledger.requestId) || ledger.calendarDate !== calendarDate
  ) throw stateConflict("저장된 당일 퀴즈 내역을 확인해 주세요.");
  const result = readLedgerResult(ledger.result);
  if (result.status !== "ready" || result.entry.updatedDate !== calendarDate) {
    throw stateConflict("저장된 당일 퀴즈 날짜를 확인해 주세요.");
  }
  return result.reward > 0 ? result.reward : null;
};

const canonicalOrganizationId = (
  value: unknown,
  field: string,
): string | null => {
  if (value === undefined || value === null || value === "") return null;
  if (typeof value !== "string") {
    throw stateConflict(`${field}를 확인해 주세요.`);
  }
  const organizationId = normalizeStoredDocumentId(value);
  if (
    !organizationId || organizationId !== value ||
    organizationId.length > 128 || organizationId === "." ||
    organizationId === ".." || /[\u0000-\u001f\u007f]/.test(organizationId)
  ) throw stateConflict(`${field}를 확인해 주세요.`);
  return organizationId;
};

const directOrganizationId = (user: QuizUserDocument): string | null => {
  if (user.accountType === "personal") return null;
  const baseChurchId = canonicalOrganizationId(
    user.baseChurchId,
    "기본 공동체",
  );
  const churchId = canonicalOrganizationId(user.churchId, "공동체");
  if (baseChurchId && churchId && baseChurchId !== churchId) {
    throw stateConflict("기본 공동체 정보가 서로 일치하지 않습니다.");
  }
  return baseChurchId || churchId;
};

const rosterConflict = () =>
  new PlatformError("CONFLICT", {
    message: "가입 공동체 수를 확인해 주세요.",
  });

const parseCanonicalRosters = (
  documents: FirestoreDocument<QuizRosterDocument>[],
  uid: string,
): Array<{ orgId: string; user: QuizRosterDocument }> => {
  const parsed = parseRosterTalentWallets(documents, uid);
  if (!parsed.ok) throw rosterConflict();
  return parsed.wallets.map(({ orgId: rawOrgId, user }) => {
    const orgId = canonicalOrganizationId(rawOrgId, "명부 공동체");
    if (!orgId) throw rosterConflict();
    return { orgId, user: user as QuizRosterDocument };
  });
};

const existingProgress = (
  user: QuizUserDocument,
  progressKey: string,
): StoredQuizEntry | null => {
  const quizProgress = record(user.quizProgress);
  const entry = quizProgress ? record(quizProgress[progressKey]) : null;
  return entry as StoredQuizEntry | null;
};

const stateFor = (
  user: QuizUserDocument,
  rosters: Array<{ orgId: string; user: QuizRosterDocument }>,
  progressKey: string,
  progress: PublicQuizProgressEntry,
): SubmitQuizState => ({
  progressKey,
  progress,
  quizRewardDate: readOptionalDateString(user.quizRewardDate),
  quizRewardAmount: readNonNegativeSafeInteger(user.quizRewardAmount, 0, 10),
  userTalent: readTalent(user.talent),
  rosterTalents: rosters.map(({ orgId, user: roster }) => ({
    orgId,
    talent: readTalent(roster.talent),
  })),
});

const resultForAlreadyDone = (
  result: Extract<
    ReturnType<typeof validateQuizSubmission>,
    { status: "alreadyDone" }
  >,
): Extract<SubmitQuizResult, { status: "alreadyDone" }> => ({
  status: "alreadyDone",
  attempts: readNonNegativeSafeInteger(result.attempts, 0, 2),
  solved: result.solved,
  skipped: result.skipped,
  reward: readNonNegativeSafeInteger(result.reward, 0, 10),
  quizKey: result.quizKey,
});

const progressForAlreadyDone = (
  user: QuizUserDocument,
  progressKey: string,
  result: Extract<SubmitQuizResult, { status: "alreadyDone" }>,
  calendarDate: string,
): PublicQuizProgressEntry => {
  const stored = existingProgress(user, progressKey);
  return stored ? publicProgressEntry(stored, calendarDate) : {
    attempts: result.attempts,
    solved: result.solved,
    skipped: result.skipped,
    reward: result.reward,
    quizKey: result.quizKey,
    updatedDate: readOptionalDateString(user.quizDate) || calendarDate,
  };
};

const isFirestoreContention = (error: unknown): boolean =>
  error instanceof PlatformError &&
  ["FIRESTORE_READ_FAILED", "FIRESTORE_WRITE_FAILED"].includes(error.code) &&
  error.details?.status === 409;

const rollbackQuietly = async (
  dependencies: QuizSubmissionDependencies,
  service: ServiceAccess,
  transaction: string,
) => {
  await dependencies.rollbackTransaction(
    service.token,
    service.projectId,
    transaction,
  ).catch(() => {});
};

const validateInput = (input: SubmitQuizInput): BoundQuizInput => {
  const uid = normalizeStoredDocumentId(input.uid);
  if (
    !uid || uid !== input.uid || uid.length > 128 || uid === "." ||
    uid === ".." || /[\u0000-\u001f\u007f]/.test(uid) ||
    !isRequestId(input.requestId) ||
    !parseQuizProgressKey(input.progressKey) ||
    !validQuizKey(input.quizKey) ||
    !Number.isSafeInteger(input.selectedIndex) ||
    input.selectedIndex < 0 || input.selectedIndex > 3 ||
    ![1, 2].includes(input.attemptSlot)
  ) throw new PlatformError("BAD_REQUEST");
  return {
    progressKey: input.progressKey,
    quizKey: input.quizKey,
    selectedIndex: input.selectedIndex,
    attemptSlot: input.attemptSlot,
  };
};

export const submitQuiz = async (
  service: ServiceAccess,
  input: SubmitQuizInput,
  options: { dependencies?: Partial<QuizSubmissionDependencies> } = {},
): Promise<SubmitQuizResponse> => {
  const boundInput = validateInput(input);
  const readingEpoch = progressReadingEpoch(boundInput.progressKey);
  const dependencies = {
    ...DEFAULT_DEPENDENCIES,
    ...(options.dependencies || {}),
  } as QuizSubmissionDependencies;
  const calendarDate = getLegacyCalendarDateStringKst(dependencies.now());
  const userPath = `users/${input.uid}`;
  const ledgerPath = `${userPath}/activityActions/${input.requestId}`;
  const slot1Path = `${userPath}/quizAttemptSlots/${input.progressKey}_a1`;
  const slot2Path = `${userPath}/quizAttemptSlots/${input.progressKey}_a2`;
  const skipPath = `${userPath}/quizAttemptSlots/${input.progressKey}_skip`;
  const requestedSlotPath = input.attemptSlot === 1 ? slot1Path : slot2Path;

  for (let contentionAttempt = 0; contentionAttempt < 3; contentionAttempt++) {
    let transaction: string | null = null;
    try {
      const activeTransaction = await dependencies.beginTransaction(
        service.token,
        service.projectId,
      );
      transaction = activeTransaction;
      const [
        userDocument,
        ledgerDocument,
        slot1Document,
        slot2Document,
        skipDocument,
        rosterDocuments,
        dailyActivityDocuments,
      ] = await Promise.all(
        [
          dependencies.getDocument<QuizUserDocument>(
            service.token,
            service.projectId,
            userPath,
            { transaction: activeTransaction },
          ),
          dependencies.getDocument<QuizActivityLedger>(
            service.token,
            service.projectId,
            ledgerPath,
            { transaction: activeTransaction },
          ),
          dependencies.getDocument<QuizActivityLedger>(
            service.token,
            service.projectId,
            slot1Path,
            { transaction: activeTransaction },
          ),
          dependencies.getDocument<QuizActivityLedger>(
            service.token,
            service.projectId,
            slot2Path,
            { transaction: activeTransaction },
          ),
          dependencies.getDocument<QuizActivityLedger>(
            service.token,
            service.projectId,
            skipPath,
            { transaction: activeTransaction },
          ),
          dependencies.runCollectionGroupQuery<QuizRosterDocument>(
            service.token,
            service.projectId,
            "roster",
            "uid",
            input.uid,
            { limit: 4, transaction: activeTransaction },
          ),
          dependencies.runCollectionQuery<QuizActivityLedger>(
            service.token,
            service.projectId,
            userPath,
            "activityActions",
            "calendarDate",
            calendarDate,
            { limit: 101, transaction: activeTransaction },
          ),
        ],
      );
      if (!userDocument || userDocument.data.isDeleted === true) {
        throw new PlatformError("NOT_FOUND");
      }
      if (
        readNonNegativeSafeInteger(userDocument.data.readingEpoch, 0) !==
          readingEpoch
      ) {
        throw stateConflict("재시작 전 퀴즈 요청은 처리할 수 없습니다.");
      }
      if (rosterDocuments.length >= 4) throw rosterConflict();
      if (dailyActivityDocuments.length >= 101) {
        throw stateConflict("당일 퀴즈 처리 내역이 너무 많습니다.");
      }
      const rosters = parseCanonicalRosters(rosterDocuments, input.uid);
      const awardedRewards = dailyActivityDocuments.flatMap(({ data }) => {
        const reward = readDailyAwardedReward(data, calendarDate);
        return reward === null ? [] : [reward];
      });
      if (awardedRewards.length > 1) {
        throw stateConflict("당일 퀴즈 보상 내역이 중복되었습니다.");
      }
      const authoritativeReward = awardedRewards[0] ?? null;
      const effectiveUser: QuizUserDocument = authoritativeReward === null
        ? userDocument.data
        : {
          ...userDocument.data,
          quizRewardDate: calendarDate,
          quizRewardAmount: authoritativeReward,
        };
      assertStoredQuizNumbers(
        effectiveUser,
        input.progressKey,
        calendarDate,
      );

      const semantic: SemanticQuizState = {
        slot1: slot1Document
          ? readSemanticSubmitLedger(
            slot1Document.data,
            input.progressKey,
            input.quizKey,
            1,
            calendarDate,
          )
          : null,
        slot2: slot2Document
          ? readSemanticSubmitLedger(
            slot2Document.data,
            input.progressKey,
            input.quizKey,
            2,
            calendarDate,
          )
          : null,
        skip: skipDocument
          ? readSemanticSkipLedger(
            skipDocument.data,
            input.progressKey,
            input.quizKey,
            calendarDate,
          )
          : null,
      };
      const semanticProgress = canonicalSemanticProgress(semantic);
      const stored = existingProgress(effectiveUser, input.progressKey);
      const currentProgress = stored
        ? publicProgressEntry(stored, calendarDate)
        : null;
      const canonicalProgress = progressAfterSemantic(
        semanticProgress,
        currentProgress,
      );
      const requestedSemantic = input.attemptSlot === 1
        ? semantic.slot1
        : semantic.slot2;

      const repairCanonicalState = async (
        progress: PublicQuizProgressEntry,
      ): Promise<SubmitQuizState> => {
        const progressNeedsRepair = semanticProgress !== null &&
          (!currentProgress || !sameProgress(currentProgress, progress));
        const markerNeedsRepair = authoritativeReward !== null &&
          (userDocument.data.quizRewardDate !== calendarDate ||
            userDocument.data.quizRewardAmount !== authoritativeReward);
        let stateUser = effectiveUser;
        if (progressNeedsRepair || markerNeedsRepair) {
          const now = dependencies.now();
          const userUpdate: UnknownRecord = { updatedAt: now };
          const updateMask = ["updatedAt"];
          if (progressNeedsRepair) {
            userUpdate.quizProgress = { [input.progressKey]: progress };
            updateMask.push(`quizProgress.${input.progressKey}`);
          }
          if (markerNeedsRepair) {
            userUpdate.quizRewardDate = calendarDate;
            userUpdate.quizRewardAmount = authoritativeReward;
            updateMask.push("quizRewardDate", "quizRewardAmount");
          }
          await dependencies.commitWrites(
            service.token,
            service.projectId,
            [dependencies.updateWrite(
              service.projectId,
              userPath,
              userUpdate,
              { exists: true, updateMask },
            )],
            { transaction: activeTransaction },
          );
          stateUser = {
            ...effectiveUser,
            ...(progressNeedsRepair
              ? {
                quizProgress: {
                  ...(record(effectiveUser.quizProgress) || {}),
                  [input.progressKey]: progress,
                },
              }
              : {}),
            ...(markerNeedsRepair
              ? {
                quizRewardDate: calendarDate,
                quizRewardAmount: authoritativeReward,
              }
              : {}),
          };
        } else {
          await rollbackQuietly(dependencies, service, activeTransaction);
        }
        return stateFor(
          stateUser,
          rosters,
          input.progressKey,
          progress,
        );
      };

      if (ledgerDocument) {
        const replay = readLedger(
          ledgerDocument.data,
          input.requestId,
          boundInput,
          calendarDate,
        );
        if (
          replay.result.status !== "ready" || !requestedSemantic ||
          requestedSemantic.requestId !== input.requestId ||
          requestedSemantic.input.selectedIndex !== input.selectedIndex ||
          !sameReadyResult(requestedSemantic.result, replay.result) ||
          !canonicalProgress
        ) throw stateConflict("요청 내역과 퀴즈 시도 내역이 다릅니다.");
        return {
          ok: true,
          action: SUBMIT_QUIZ_ACTION,
          requestId: input.requestId,
          calendarDate: replay.calendarDate,
          alreadyCompleted: true,
          result: replay.result,
          state: await repairCanonicalState(canonicalProgress),
        };
      }

      if (requestedSemantic) {
        if (requestedSemantic.input.selectedIndex !== input.selectedIndex) {
          throw stateConflict("이미 처리된 시도의 답안과 다릅니다.");
        }
        if (!canonicalProgress) throw stateConflict();
        return {
          ok: true,
          action: SUBMIT_QUIZ_ACTION,
          requestId: input.requestId,
          calendarDate: requestedSemantic.calendarDate,
          alreadyCompleted: true,
          result: requestedSemantic.result,
          state: await repairCanonicalState(canonicalProgress),
        };
      }

      if (canonicalProgress && progressIsTerminal(canonicalProgress)) {
        const state = await repairCanonicalState(canonicalProgress);
        return {
          ok: true,
          action: SUBMIT_QUIZ_ACTION,
          requestId: input.requestId,
          calendarDate,
          alreadyCompleted: false,
          result: resultAlreadyDoneFromProgress(canonicalProgress),
          state,
        };
      }

      const decisionUser: QuizUserDocument = semanticProgress &&
          canonicalProgress
        ? {
          ...effectiveUser,
          quizProgress: {
            ...(record(effectiveUser.quizProgress) || {}),
            [input.progressKey]: canonicalProgress,
          },
        }
        : effectiveUser;

      const directOrgId = directOrganizationId(decisionUser);
      if (directOrgId && rosters.some(({ orgId }) => orgId === directOrgId)) {
        throw stateConflict("기본 공동체와 추가 공동체 지갑이 중복됩니다.");
      }
      const organizationIds = Array.from(
        new Set([
          ...(directOrgId ? [directOrgId] : []),
          ...rosters.map(({ orgId }) => orgId),
        ]),
      );
      const shopDocuments = await Promise.all(
        organizationIds.map((orgId) =>
          dependencies.getDocument<UnknownRecord>(
            service.token,
            service.projectId,
            `churches/${orgId}/settings/talentShop`,
            { transaction: activeTransaction },
          )
        ),
      );
      const shopByOrgId = new Map(
        organizationIds.map((orgId, index) => [
          orgId,
          shopDocuments[index]?.data || null,
        ]),
      );
      const talentRouting = resolveTalentWalletPrograms({
        direct: directOrgId
          ? {
            user: decisionUser,
            talentShop: shopByOrgId.get(directOrgId) || null,
          }
          : null,
        rosters: rosters.map(({ orgId, user }) => ({
          user,
          talentShop: shopByOrgId.get(orgId) || null,
        })),
      });
      const decision = validateQuizSubmission({
        user: decisionUser,
        progressKey: input.progressKey,
        quizKey: input.quizKey,
        selectedIndex: input.selectedIndex,
        todayLegacy: calendarDate,
        indexRecord: dependencies.questions[input.quizKey],
        talentRouting: {
          directCanEarnTalent: talentRouting.directCanEarnTalent,
          rosterCanEarnTalent: talentRouting.rosterCanEarnTalent.some(Boolean),
        },
      });
      if (decision.status === "invalidPosition") {
        throw new PlatformError("CONFLICT", {
          message: "현재 진도에서 제출할 수 없는 퀴즈입니다.",
        });
      }
      if (decision.status === "invalidQuiz") {
        throw new PlatformError("BAD_REQUEST", {
          message: "퀴즈 문항을 확인해 주세요.",
        });
      }
      if (decision.status === "alreadyDone") {
        const result = resultForAlreadyDone(decision);
        const state = stateFor(
          decisionUser,
          rosters,
          input.progressKey,
          progressForAlreadyDone(
            decisionUser,
            input.progressKey,
            result,
            calendarDate,
          ),
        );
        await rollbackQuietly(dependencies, service, activeTransaction);
        return {
          ok: true,
          action: SUBMIT_QUIZ_ACTION,
          requestId: input.requestId,
          calendarDate,
          alreadyCompleted: false,
          result,
          state,
        };
      }

      if (decision.nextAttempts !== input.attemptSlot) {
        throw stateConflict("퀴즈 시도 순서가 이미 변경되었습니다.");
      }

      const userTalentBefore = readTalent(decisionUser.talent);
      const rosterTalentBefore = rosters.map(({ user }) =>
        readTalent(user.talent)
      );
      const rewardedRosterOrgIds = decision.reward > 0
        ? rosters.flatMap(({ orgId }, index) =>
          talentRouting.rosterCanEarnTalent[index] ? [orgId] : []
        )
        : [];
      const rewardsUserWallet = decision.reward > 0 &&
        decision.rewardsUserWallet;
      const result: Extract<SubmitQuizResult, { status: "ready" }> = {
        status: "ready",
        attempts: decision.nextAttempts,
        solved: decision.isCorrect,
        skipped: false,
        isCorrect: decision.isCorrect,
        reward: decision.reward,
        quizKey: decision.entry.quizKey,
        entry: publicProgressEntry(decision.entry, calendarDate),
        rewardsUserWallet,
        rewardedRosterOrgIds,
      };
      const now = dependencies.now();
      const userUpdate: UnknownRecord = {
        quizProgress: { [input.progressKey]: result.entry },
        updatedAt: now,
      };
      const userUpdateMask = [
        `quizProgress.${input.progressKey}`,
        "updatedAt",
      ];
      const markerNeedsRepair = authoritativeReward !== null &&
        (userDocument.data.quizRewardDate !== calendarDate ||
          userDocument.data.quizRewardAmount !== authoritativeReward);
      if (markerNeedsRepair) {
        userUpdate.quizRewardDate = calendarDate;
        userUpdate.quizRewardAmount = authoritativeReward;
        userUpdateMask.push("quizRewardDate", "quizRewardAmount");
      }
      const nextUserTalent = rewardsUserWallet
        ? addTalent(userTalentBefore, result.reward)
        : userTalentBefore;
      if (result.reward > 0) {
        userUpdate.quizRewardDate = calendarDate;
        userUpdate.quizRewardAmount = result.reward;
        if (!markerNeedsRepair) {
          userUpdateMask.push("quizRewardDate", "quizRewardAmount");
        }
        if (rewardsUserWallet) {
          userUpdate.talent = nextUserTalent;
          userUpdateMask.push("talent");
        }
      }

      const nextRosterTalents = rosterTalentBefore.map((talent, index) =>
        result.reward > 0 && talentRouting.rosterCanEarnTalent[index]
          ? addTalent(talent, result.reward)
          : talent
      );
      const writes = [
        dependencies.updateWrite(
          service.projectId,
          userPath,
          userUpdate,
          { exists: true, updateMask: userUpdateMask },
        ),
        ...rosters.flatMap(({ orgId }, index) =>
          result.reward > 0 && talentRouting.rosterCanEarnTalent[index]
            ? [dependencies.updateWrite(
              service.projectId,
              `churches/${orgId}/roster/${input.uid}`,
              { talent: nextRosterTalents[index], updatedAt: now },
              { exists: true, updateMask: ["talent", "updatedAt"] },
            )]
            : []
        ),
        dependencies.updateWrite(
          service.projectId,
          ledgerPath,
          {
            schemaVersion: QUIZ_ACTIVITY_LEDGER_SCHEMA_VERSION,
            readingEpoch,
            action: SUBMIT_QUIZ_ACTION,
            requestId: input.requestId,
            input: boundInput,
            calendarDate,
            result,
            createdAt: now,
          },
          { exists: false },
        ),
        dependencies.updateWrite(
          service.projectId,
          requestedSlotPath,
          {
            schemaVersion: QUIZ_ACTIVITY_LEDGER_SCHEMA_VERSION,
            readingEpoch,
            action: SUBMIT_QUIZ_ACTION,
            requestId: input.requestId,
            input: boundInput,
            calendarDate,
            result,
            createdAt: now,
          },
          { exists: false },
        ),
      ];
      await dependencies.commitWrites(
        service.token,
        service.projectId,
        writes,
        { transaction: activeTransaction },
      );

      const nextUser: QuizUserDocument = {
        ...decisionUser,
        quizProgress: {
          ...(record(decisionUser.quizProgress) || {}),
          [input.progressKey]: result.entry,
        },
        ...(result.reward > 0
          ? {
            quizRewardDate: calendarDate,
            quizRewardAmount: result.reward,
          }
          : {}),
        ...(rewardsUserWallet ? { talent: nextUserTalent } : {}),
      };
      const nextRosters = rosters.map(({ orgId, user }, index) => ({
        orgId,
        user: { ...user, talent: nextRosterTalents[index] },
      }));
      return {
        ok: true,
        action: SUBMIT_QUIZ_ACTION,
        requestId: input.requestId,
        calendarDate,
        alreadyCompleted: false,
        result,
        state: stateFor(nextUser, nextRosters, input.progressKey, result.entry),
      };
    } catch (error) {
      if (transaction) {
        await rollbackQuietly(dependencies, service, transaction);
      }
      if (isFirestoreContention(error) && contentionAttempt < 2) continue;
      throw error;
    }
  }
  throw new PlatformError("FIRESTORE_WRITE_FAILED");
};

type BoundSkipQuizInput = Pick<SkipQuizInput, "progressKey" | "quizKey">;

const validateSkipInput = (input: SkipQuizInput): BoundSkipQuizInput => {
  const uid = normalizeStoredDocumentId(input.uid);
  if (
    !uid || uid !== input.uid || uid.length > 128 || uid === "." ||
    uid === ".." || /[\u0000-\u001f\u007f]/.test(uid) ||
    !isRequestId(input.requestId) ||
    !parseQuizProgressKey(input.progressKey) ||
    !validQuizKey(input.quizKey)
  ) throw new PlatformError("BAD_REQUEST");
  return { progressKey: input.progressKey, quizKey: input.quizKey };
};

const skipInputMatches = (
  value: unknown,
  expected: BoundSkipQuizInput,
): boolean => {
  const input = record(value);
  return Boolean(
    input && Object.keys(input).length === 2 &&
      input.progressKey === expected.progressKey &&
      input.quizKey === expected.quizKey,
  );
};

const readSkipLedger = (
  ledger: QuizActivityLedger,
  requestId: string,
  expectedInput: BoundSkipQuizInput,
  currentCalendarDate: string,
): { calendarDate: string; progress: PublicQuizProgressEntry } => {
  const storedResult = record(ledger.result);
  const progressRecord = record(storedResult?.progress);
  const expectedReadingEpoch = progressReadingEpoch(expectedInput.progressKey);
  if (
    ledgerReadingEpoch(ledger) !== expectedReadingEpoch ||
    ledger.action !== SKIP_QUIZ_ACTION || ledger.requestId !== requestId ||
    !skipInputMatches(ledger.input, expectedInput) ||
    typeof ledger.calendarDate !== "string" ||
    !isStoredDateString(ledger.calendarDate) ||
    storedDateTimestamp(ledger.calendarDate) >
      storedDateTimestamp(currentCalendarDate) ||
    !storedResult || Object.keys(storedResult).length !== 2 ||
    storedResult.progressKey !== expectedInput.progressKey || !progressRecord
  ) throw stateConflict("같은 요청 번호의 건너뛰기 내역과 입력이 다릅니다.");
  const progress = publicProgressEntry(progressRecord, "");
  if (
    progress.quizKey !== expectedInput.quizKey || progress.solved ||
    !progress.skipped || progress.reward !== 0 ||
    progress.updatedDate !== ledger.calendarDate || progress.attempts > 1
  ) throw stateConflict("저장된 건너뛰기 결과를 확인해 주세요.");
  return { calendarDate: ledger.calendarDate, progress };
};

const readSemanticSkipLedger = (
  ledger: QuizActivityLedger,
  progressKey: string,
  quizKey: string,
  currentCalendarDate: string,
): SemanticSkipLedger => {
  if (!isRequestId(ledger.requestId)) {
    throw stateConflict("저장된 건너뛰기 시도 내역을 확인해 주세요.");
  }
  const input = { progressKey, quizKey };
  const replay = readSkipLedger(
    ledger,
    ledger.requestId,
    input,
    currentCalendarDate,
  );
  return {
    requestId: ledger.requestId,
    input,
    calendarDate: replay.calendarDate,
    progress: replay.progress,
  };
};

const canonicalSemanticProgress = (
  semantic: SemanticQuizState,
): PublicQuizProgressEntry | null => {
  const slot1 = semantic.slot1?.result.entry || null;
  const slot2 = semantic.slot2?.result.entry || null;
  const skipped = semantic.skip?.progress || null;
  if (slot2 && skipped) {
    throw stateConflict("퀴즈 완료 내역이 중복되었습니다.");
  }
  if (slot1?.solved && (slot2 || skipped)) {
    throw stateConflict("첫 시도 완료 뒤 후속 내역이 존재합니다.");
  }
  if (slot1 && !slot1.solved && slot1.attempts !== 1) {
    throw stateConflict("첫 퀴즈 시도 내역을 확인해 주세요.");
  }
  if (slot2 && slot2.attempts !== 2) {
    throw stateConflict("둘째 퀴즈 시도 내역을 확인해 주세요.");
  }
  if (
    skipped && ((skipped.attempts === 0 && slot1) ||
      (skipped.attempts === 1 && slot1?.solved))
  ) throw stateConflict("퀴즈 건너뛰기 순서를 확인해 주세요.");
  return slot2 || skipped || slot1;
};

const progressAfterSemantic = (
  semanticProgress: PublicQuizProgressEntry | null,
  storedProgress: PublicQuizProgressEntry | null,
): PublicQuizProgressEntry | null => {
  if (!semanticProgress) return storedProgress;
  if (
    !semanticProgress.solved && !semanticProgress.skipped &&
    semanticProgress.attempts === 1 && storedProgress &&
    progressCanFollowSubmission(semanticProgress, storedProgress)
  ) return storedProgress;
  return semanticProgress;
};

const progressIsTerminal = (progress: PublicQuizProgressEntry): boolean =>
  progress.solved || progress.skipped || progress.attempts >= 2;

const resultAlreadyDoneFromProgress = (
  progress: PublicQuizProgressEntry,
): Extract<SubmitQuizResult, { status: "alreadyDone" }> => ({
  status: "alreadyDone",
  attempts: progress.attempts,
  solved: progress.solved,
  skipped: progress.skipped,
  reward: progress.reward,
  quizKey: progress.quizKey,
});

export const skipQuiz = async (
  service: ServiceAccess,
  input: SkipQuizInput,
  options: { dependencies?: Partial<QuizSubmissionDependencies> } = {},
): Promise<SkipQuizResponse> => {
  const boundInput = validateSkipInput(input);
  const readingEpoch = progressReadingEpoch(boundInput.progressKey);
  const dependencies = {
    ...DEFAULT_DEPENDENCIES,
    ...(options.dependencies || {}),
  } as QuizSubmissionDependencies;
  const calendarDate = getLegacyCalendarDateStringKst(dependencies.now());
  const userPath = `users/${input.uid}`;
  const ledgerPath = `${userPath}/activityActions/${input.requestId}`;
  const slot1Path = `${userPath}/quizAttemptSlots/${input.progressKey}_a1`;
  const slot2Path = `${userPath}/quizAttemptSlots/${input.progressKey}_a2`;
  const skipPath = `${userPath}/quizAttemptSlots/${input.progressKey}_skip`;

  for (let contentionAttempt = 0; contentionAttempt < 3; contentionAttempt++) {
    let transaction: string | null = null;
    try {
      const activeTransaction = await dependencies.beginTransaction(
        service.token,
        service.projectId,
      );
      transaction = activeTransaction;
      const [
        userDocument,
        ledgerDocument,
        slot1Document,
        slot2Document,
        skipDocument,
      ] = await Promise.all([
        dependencies.getDocument<QuizUserDocument>(
          service.token,
          service.projectId,
          userPath,
          { transaction: activeTransaction },
        ),
        dependencies.getDocument<QuizActivityLedger>(
          service.token,
          service.projectId,
          ledgerPath,
          { transaction: activeTransaction },
        ),
        dependencies.getDocument<QuizActivityLedger>(
          service.token,
          service.projectId,
          slot1Path,
          { transaction: activeTransaction },
        ),
        dependencies.getDocument<QuizActivityLedger>(
          service.token,
          service.projectId,
          slot2Path,
          { transaction: activeTransaction },
        ),
        dependencies.getDocument<QuizActivityLedger>(
          service.token,
          service.projectId,
          skipPath,
          { transaction: activeTransaction },
        ),
      ]);
      if (!userDocument || userDocument.data.isDeleted === true) {
        throw new PlatformError("NOT_FOUND");
      }
      if (
        readNonNegativeSafeInteger(userDocument.data.readingEpoch, 0) !==
          readingEpoch
      ) {
        throw stateConflict("재시작 전 퀴즈 요청은 처리할 수 없습니다.");
      }
      assertStoredQuizNumbers(
        userDocument.data,
        input.progressKey,
        calendarDate,
      );

      const semantic: SemanticQuizState = {
        slot1: slot1Document
          ? readSemanticSubmitLedger(
            slot1Document.data,
            input.progressKey,
            input.quizKey,
            1,
            calendarDate,
          )
          : null,
        slot2: slot2Document
          ? readSemanticSubmitLedger(
            slot2Document.data,
            input.progressKey,
            input.quizKey,
            2,
            calendarDate,
          )
          : null,
        skip: skipDocument
          ? readSemanticSkipLedger(
            skipDocument.data,
            input.progressKey,
            input.quizKey,
            calendarDate,
          )
          : null,
      };
      const semanticProgress = canonicalSemanticProgress(semantic);
      const stored = existingProgress(userDocument.data, input.progressKey);
      const storedProgress = stored
        ? publicProgressEntry(stored, calendarDate)
        : null;
      const canonicalProgress = progressAfterSemantic(
        semanticProgress,
        storedProgress,
      );

      const repairCanonicalProgress = async (
        progress: PublicQuizProgressEntry,
      ) => {
        const needsRepair = semanticProgress !== null &&
          (!storedProgress || !sameProgress(storedProgress, progress));
        if (needsRepair) {
          await dependencies.commitWrites(
            service.token,
            service.projectId,
            [dependencies.updateWrite(
              service.projectId,
              userPath,
              {
                quizProgress: { [input.progressKey]: progress },
                updatedAt: dependencies.now(),
              },
              {
                exists: true,
                updateMask: [
                  `quizProgress.${input.progressKey}`,
                  "updatedAt",
                ],
              },
            )],
            { transaction: activeTransaction },
          );
        } else {
          await rollbackQuietly(dependencies, service, activeTransaction);
        }
      };

      if (ledgerDocument) {
        const replay = readSkipLedger(
          ledgerDocument.data,
          input.requestId,
          boundInput,
          calendarDate,
        );
        if (
          !semantic.skip || semantic.skip.requestId !== input.requestId ||
          !sameProgress(semantic.skip.progress, replay.progress) ||
          !canonicalProgress
        ) throw stateConflict("요청 내역과 건너뛰기 시도 내역이 다릅니다.");
        await repairCanonicalProgress(canonicalProgress);
        return {
          ok: true,
          action: SKIP_QUIZ_ACTION,
          requestId: input.requestId,
          calendarDate: replay.calendarDate,
          alreadyCompleted: true,
          committed: true,
          state: {
            progressKey: input.progressKey,
            progress: canonicalProgress,
          },
        };
      }

      if (semantic.skip) {
        if (!canonicalProgress) throw stateConflict();
        await repairCanonicalProgress(canonicalProgress);
        return {
          ok: true,
          action: SKIP_QUIZ_ACTION,
          requestId: input.requestId,
          calendarDate: semantic.skip.calendarDate,
          alreadyCompleted: true,
          committed: true,
          state: {
            progressKey: input.progressKey,
            progress: canonicalProgress,
          },
        };
      }

      if (canonicalProgress && progressIsTerminal(canonicalProgress)) {
        await repairCanonicalProgress(canonicalProgress);
        return {
          ok: true,
          action: SKIP_QUIZ_ACTION,
          requestId: input.requestId,
          calendarDate,
          alreadyCompleted: false,
          committed: false,
          state: {
            progressKey: input.progressKey,
            progress: canonicalProgress,
          },
        };
      }

      const decisionUser: QuizUserDocument = semanticProgress &&
          canonicalProgress
        ? {
          ...userDocument.data,
          quizProgress: {
            ...(record(userDocument.data.quizProgress) || {}),
            [input.progressKey]: canonicalProgress,
          },
        }
        : userDocument.data;

      const question = dependencies.questions[input.quizKey];
      const answerIndex = question?.answerIndex;
      const probeIndex =
        Number.isInteger(answerIndex) && Number(answerIndex) >= 0 &&
          Number(answerIndex) <= 3
          ? (Number(answerIndex) + 1) % 4
          : 0;
      const decision = validateQuizSubmission({
        user: decisionUser,
        progressKey: input.progressKey,
        quizKey: input.quizKey,
        selectedIndex: probeIndex,
        todayLegacy: calendarDate,
        indexRecord: question,
        talentRouting: {
          directCanEarnTalent: false,
          rosterCanEarnTalent: false,
        },
      });
      if (decision.status === "invalidPosition") {
        throw new PlatformError("CONFLICT", {
          message: "현재 진도에서 건너뛸 수 없는 퀴즈입니다.",
        });
      }
      if (decision.status === "invalidQuiz") {
        throw new PlatformError("BAD_REQUEST", {
          message: "퀴즈 문항을 확인해 주세요.",
        });
      }
      if (decision.status === "alreadyDone") {
        const progress = progressForAlreadyDone(
          decisionUser,
          input.progressKey,
          resultForAlreadyDone(decision),
          calendarDate,
        );
        await rollbackQuietly(dependencies, service, activeTransaction);
        return {
          ok: true,
          action: SKIP_QUIZ_ACTION,
          requestId: input.requestId,
          calendarDate,
          alreadyCompleted: false,
          committed: false,
          state: { progressKey: input.progressKey, progress },
        };
      }

      const progress: PublicQuizProgressEntry = {
        attempts: decision.nextAttempts - 1,
        solved: false,
        skipped: true,
        quizKey: input.quizKey,
        reward: 0,
        updatedDate: calendarDate,
      };
      const now = dependencies.now();
      await dependencies.commitWrites(
        service.token,
        service.projectId,
        [
          dependencies.updateWrite(
            service.projectId,
            userPath,
            {
              quizProgress: { [input.progressKey]: progress },
              updatedAt: now,
            },
            {
              exists: true,
              updateMask: [`quizProgress.${input.progressKey}`, "updatedAt"],
            },
          ),
          dependencies.updateWrite(
            service.projectId,
            ledgerPath,
            {
              schemaVersion: QUIZ_ACTIVITY_LEDGER_SCHEMA_VERSION,
              readingEpoch,
              action: SKIP_QUIZ_ACTION,
              requestId: input.requestId,
              input: boundInput,
              calendarDate,
              result: { progressKey: input.progressKey, progress },
              createdAt: now,
            },
            { exists: false },
          ),
          dependencies.updateWrite(
            service.projectId,
            skipPath,
            {
              schemaVersion: QUIZ_ACTIVITY_LEDGER_SCHEMA_VERSION,
              readingEpoch,
              action: SKIP_QUIZ_ACTION,
              requestId: input.requestId,
              input: boundInput,
              calendarDate,
              result: { progressKey: input.progressKey, progress },
              createdAt: now,
            },
            { exists: false },
          ),
        ],
        { transaction: activeTransaction },
      );
      return {
        ok: true,
        action: SKIP_QUIZ_ACTION,
        requestId: input.requestId,
        calendarDate,
        alreadyCompleted: false,
        committed: true,
        state: { progressKey: input.progressKey, progress },
      };
    } catch (error) {
      if (transaction) {
        await rollbackQuietly(dependencies, service, transaction);
      }
      if (isFirestoreContention(error) && contentionAttempt < 2) continue;
      throw error;
    }
  }
  throw new PlatformError("FIRESTORE_WRITE_FAILED");
};
