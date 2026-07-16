import { PlatformError } from "../_shared/errors.ts";
import {
  beginTransaction,
  commitWrites,
  type FirestoreDocument,
  getDocument,
  rollbackTransaction,
  runCollectionGroupQuery,
  updateWrite,
} from "../_shared/firestore.ts";
import { getLegacyCalendarDateStringKst } from "../_shared/time.ts";
import {
  normalizeStoredDocumentId,
  parseRosterTalentWallets,
  type TalentMembershipUser,
} from "./talentProgramCore.ts";

export const RESTART_READING_ACTION = "restartReading" as const;
const ACTIVITY_LEDGER_SCHEMA_VERSION = 1;
const MAX_TRANSACTION_ATTEMPTS = 3;
const MAX_TALENT_VALUE = 1_000_000_000;
const REQUEST_ID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
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

export type RestartReadingIdentity = {
  uid: string;
  anonymous: boolean;
};

export type ReadingPosition = {
  cycle: number;
  day: number;
  readingEpoch: number;
};

export type RestartReadingInput = ReadingPosition & {
  requestId: string;
};

export type RestartReadingResult =
  | {
    status: "restarted";
    previous: ReadingPosition;
    next: ReadingPosition;
  }
  | {
    status: "positionMismatch";
    expected: ReadingPosition;
    received: ReadingPosition;
  };

type RestartUserDocument = TalentMembershipUser & {
  uid?: unknown;
  isDeleted?: unknown;
  currentDay?: unknown;
  readCount?: unknown;
  readingEpoch?: unknown;
  score?: unknown;
  talent?: unknown;
  streak?: unknown;
  maxStreak?: unknown;
  startDate?: unknown;
  lastReadDate?: unknown;
  dailyAdvanceDate?: unknown;
  dailyAdvanceCount?: unknown;
  recentReadDates?: unknown;
  achievements?: unknown;
  dayOffset?: unknown;
  secretShopUnlocked?: unknown;
  quizDate?: unknown;
  quizAttempts?: unknown;
  quizSolved?: unknown;
  quizSkipped?: unknown;
  quizKey?: unknown;
  quizRewardDate?: unknown;
  quizRewardAmount?: unknown;
};

type RestartRosterDocument = TalentMembershipUser & {
  uid?: unknown;
  currentDay?: unknown;
  readCount?: unknown;
  score?: unknown;
  talent?: unknown;
  streak?: unknown;
  lastReadDate?: unknown;
};

type RestartLedgerDocument = {
  schemaVersion?: unknown;
  action?: unknown;
  requestId?: unknown;
  uid?: unknown;
  input?: unknown;
  calendarDate?: unknown;
  result?: unknown;
  createdAt?: unknown;
};

type NormalizedUser = RestartUserDocument & {
  currentDay: number;
  readCount: number;
  readingEpoch: number;
  score: number;
  talent: number;
  streak: number;
  maxStreak: number;
  startDate: string | null;
  lastReadDate: string | null;
  dailyAdvanceDate: string | null;
  dailyAdvanceCount: number;
  recentReadDates: string[];
  achievements: string[];
  dayOffset: number;
  secretShopUnlocked: boolean;
  quizDate: string | null;
  quizAttempts: number;
  quizSolved: boolean;
  quizSkipped: boolean;
  quizKey: string | null;
  quizRewardDate: string | null;
  quizRewardAmount: number;
};

type NormalizedRoster = {
  orgId: string;
  user: RestartRosterDocument;
  currentDay: number;
  readCount: number;
  score: number;
  talent: number;
  streak: number;
  lastReadDate: string | null;
};

export type RestartReadingState = {
  user: {
    currentDay: number;
    readCount: number;
    readingEpoch: number;
    score: number;
    talent: number;
    streak: number;
    maxStreak: number;
    startDate: string | null;
    lastReadDate: string | null;
    dailyAdvanceDate: string | null;
    dailyAdvanceCount: number;
    recentReadDates: string[];
    achievements: string[];
    dayOffset: number;
    secretShopUnlocked: boolean;
    quizDate: string | null;
    quizAttempts: number;
    quizSolved: boolean;
    quizSkipped: boolean;
    quizKey: string | null;
    quizRewardDate: string | null;
    quizRewardAmount: number;
  };
  rosters: Array<{
    orgId: string;
    currentDay: number;
    readCount: number;
    score: number;
    streak: number;
    lastReadDate: string | null;
    talent: number;
  }>;
};

export type RestartReadingResponse = {
  alreadyCompleted: boolean;
  committed: boolean;
  calendarDate: string;
  result: RestartReadingResult;
  state: RestartReadingState;
};

export type RestartReadingDependencies = {
  beginTransaction: typeof beginTransaction;
  commitWrites: typeof commitWrites;
  getDocument: typeof getDocument;
  rollbackTransaction: typeof rollbackTransaction;
  runCollectionGroupQuery: typeof runCollectionGroupQuery;
  updateWrite: typeof updateWrite;
  now: () => Date;
  getTodayLegacy: (now: Date) => string;
};

const DEFAULT_DEPENDENCIES: RestartReadingDependencies = {
  beginTransaction,
  commitWrites,
  getDocument,
  rollbackTransaction,
  runCollectionGroupQuery,
  updateWrite,
  now: () => new Date(),
  getTodayLegacy: getLegacyCalendarDateStringKst,
};

const isRecord = (value: unknown): value is UnknownRecord =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value);

const hasControlCharacters = (value: string): boolean =>
  Array.from(value).some((character) => {
    const code = character.charCodeAt(0);
    return code <= 0x1f || code === 0x7f;
  });

const conflict = (
  message = "읽기 재시작 상태를 안전하게 확인할 수 없습니다.",
) => new PlatformError("CONFLICT", { message });

const requireExactKeys = (
  value: UnknownRecord,
  expected: readonly string[],
  field: string,
) => {
  const keys = Object.keys(value).sort();
  const allowed = [...expected].sort();
  if (
    keys.length !== allowed.length ||
    keys.some((key, index) => key !== allowed[index])
  ) throw conflict(`저장된 ${field} 필드가 올바르지 않습니다.`);
};

const requireSafeInteger = (
  value: unknown,
  field: string,
  options: { fallback?: number; min?: number; max?: number } = {},
): number => {
  const hasFallback = Object.prototype.hasOwnProperty.call(options, "fallback");
  const candidate = value === undefined || value === null
    ? (hasFallback ? options.fallback : undefined)
    : value;
  if (
    typeof candidate !== "number" || !Number.isSafeInteger(candidate) ||
    candidate < (options.min ?? 0) ||
    candidate > (options.max ?? Number.MAX_SAFE_INTEGER)
  ) throw conflict(`안전하지 않은 정수 상태입니다: ${field}`);
  return candidate;
};

const requireBoolean = (
  value: unknown,
  field: string,
  fallback: boolean,
): boolean => {
  if (value === undefined || value === null) return fallback;
  if (typeof value !== "boolean") {
    throw conflict(`불리언 상태가 올바르지 않습니다: ${field}`);
  }
  return value;
};

const isLegacyDate = (value: string): boolean => {
  const match = LEGACY_DATE_PATTERN.exec(value);
  if (!match) return false;
  const month = MONTHS.indexOf(match[2]);
  const day = Number(match[3]);
  const year = Number(match[4]);
  const date = new Date(Date.UTC(year, month, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month &&
    date.getUTCDate() === day && WEEKDAYS[date.getUTCDay()] === match[1];
};

const optionalDate = (value: unknown, field: string): string | null => {
  if (value === undefined || value === null || value === "") return null;
  if (typeof value !== "string" || value.length > 64 || !isLegacyDate(value)) {
    throw conflict(`날짜 상태가 올바르지 않습니다: ${field}`);
  }
  return value;
};

const storedDateTimestamp = (value: string): number => {
  const match = LEGACY_DATE_PATTERN.exec(value);
  if (!match || !isLegacyDate(value)) throw conflict();
  return Date.UTC(Number(match[4]), MONTHS.indexOf(match[2]), Number(match[3]));
};

// readCompletionService와 같은 저장 날짜 의미를 recentReadDates에만 적용한다.
// lastReadDate/dailyAdvanceDate/quiz 날짜는 optionalDate를 거치므로 기존
// legacy `Date#toDateString()` 계약을 그대로 유지한다.
const storedReadDateTimestamp = (value: string): number => {
  if (isLegacyDate(value)) return storedDateTimestamp(value);
  const iso = /^(\d{4})-(\d{2})-(\d{2})(?:T.*)?$/.exec(value);
  if (!iso || !Number.isFinite(Date.parse(value))) throw conflict();
  const year = Number(iso[1]);
  const month = Number(iso[2]) - 1;
  const day = Number(iso[3]);
  const date = new Date(Date.UTC(year, month, day));
  if (
    date.getUTCFullYear() !== year || date.getUTCMonth() !== month ||
    date.getUTCDate() !== day
  ) throw conflict();
  return date.getTime();
};

const isStoredReadDate = (value: string): boolean => {
  try {
    storedReadDateTimestamp(value);
    return true;
  } catch {
    return false;
  }
};

const normalizeRecentReadDates = (value: unknown): string[] => {
  if (value === undefined || value === null) return [];
  if (
    !Array.isArray(value) || value.length > 14 ||
    value.some((item) =>
      typeof item !== "string" || item.length > 64 || !isStoredReadDate(item)
    )
  ) throw conflict("최근 읽기 날짜 상태가 올바르지 않습니다.");
  return [...value] as string[];
};

const normalizeAchievements = (value: unknown): string[] => {
  if (value === undefined || value === null) return [];
  if (
    !Array.isArray(value) || value.length > 100 ||
    value.some((item) =>
      typeof item !== "string" || !item || item.length > 128 ||
      hasControlCharacters(item)
    )
  ) throw conflict("업적 상태가 올바르지 않습니다.");
  return [...value] as string[];
};

const normalizeQuizKey = (value: unknown): string | null => {
  if (value === undefined || value === null || value === "") return null;
  if (typeof value !== "string" || !QUIZ_KEY_PATTERN.test(value)) {
    throw conflict("퀴즈 식별자가 올바르지 않습니다.");
  }
  return value;
};

const canonicalIdentity = (identity: RestartReadingIdentity): string => {
  if (identity?.anonymous !== false) {
    throw new PlatformError("ANONYMOUS_NOT_ALLOWED");
  }
  const raw = typeof identity?.uid === "string" ? identity.uid.trim() : "";
  const uid = normalizeStoredDocumentId(raw);
  if (
    !uid || uid !== raw || uid.length > 128 || uid === "." || uid === ".." ||
    hasControlCharacters(uid)
  ) throw new PlatformError("BAD_REQUEST");
  return uid;
};

const validateInput = (input: RestartReadingInput): RestartReadingInput => {
  if (
    !input || typeof input !== "object" ||
    typeof input.requestId !== "string" ||
    !REQUEST_ID_PATTERN.test(input.requestId) ||
    !Number.isSafeInteger(input.cycle) || input.cycle < 1 ||
    !Number.isSafeInteger(input.day) || input.day < 1 || input.day > 365 ||
    !Number.isSafeInteger(input.readingEpoch) || input.readingEpoch < 0
  ) throw new PlatformError("BAD_REQUEST");
  return {
    requestId: input.requestId,
    cycle: input.cycle,
    day: input.day,
    readingEpoch: input.readingEpoch,
  };
};

const normalizeUser = (
  uid: string,
  data: RestartUserDocument,
): NormalizedUser => {
  if (data.uid !== undefined && data.uid !== null && data.uid !== uid) {
    throw conflict("사용자 식별자가 현재 로그인과 일치하지 않습니다.");
  }
  const streak = requireSafeInteger(data.streak, "users.streak", {
    fallback: 0,
  });
  const maxStreak = requireSafeInteger(data.maxStreak, "users.maxStreak", {
    fallback: streak,
  });
  if (maxStreak < streak) {
    throw conflict("최고 연속 읽기 상태가 현재 연속 읽기보다 작습니다.");
  }
  const lastReadDate = optionalDate(data.lastReadDate, "users.lastReadDate");
  const storedDailyAdvanceCount = requireSafeInteger(
    data.dailyAdvanceCount,
    "users.dailyAdvanceCount",
    { fallback: 0 },
  );
  const storedDailyAdvanceDate = optionalDate(
    data.dailyAdvanceDate,
    "users.dailyAdvanceDate",
  );
  // 초기 서버 이관 전 문서는 lastReadDate만 있거나, 더 오래된 날짜의 일일
  // 제한 표식이 남아 있을 수 있다. 더 최신인 lastReadDate를 최소 1회로
  // 복구해 같은 날 보상을 다시 받지 못하게 한다. 이전 날짜의 count는 새
  // 날짜에 속하지 않으므로 날짜를 승격할 때 1로 다시 시작한다.
  // 반대로 같은 날짜의 명시 date + count 0은 readCore의 유효한 guard다.
  let dailyAdvanceDate = storedDailyAdvanceDate;
  let dailyAdvanceCount = storedDailyAdvanceCount;
  if (!dailyAdvanceDate && lastReadDate) {
    dailyAdvanceDate = lastReadDate;
    dailyAdvanceCount = Math.max(1, dailyAdvanceCount);
  } else if (
    dailyAdvanceDate && lastReadDate &&
    storedDateTimestamp(lastReadDate) > storedDateTimestamp(dailyAdvanceDate)
  ) {
    dailyAdvanceDate = lastReadDate;
    dailyAdvanceCount = 1;
  }
  if (!dailyAdvanceDate && dailyAdvanceCount > 0) {
    throw conflict("일일 읽기 횟수 표식을 확인해 주세요.");
  }
  const quizDate = optionalDate(data.quizDate, "users.quizDate");
  const quizAttempts = requireSafeInteger(
    data.quizAttempts,
    "users.quizAttempts",
    { fallback: 0, max: 2 },
  );
  const quizSolved = requireBoolean(
    data.quizSolved,
    "users.quizSolved",
    false,
  );
  const quizSkipped = requireBoolean(
    data.quizSkipped,
    "users.quizSkipped",
    false,
  );
  let quizRewardDate = optionalDate(
    data.quizRewardDate,
    "users.quizRewardDate",
  );
  let quizRewardAmount = requireSafeInteger(
    data.quizRewardAmount,
    "users.quizRewardAmount",
    { fallback: 0, max: 10 },
  );
  if (
    ![0, 5, 10].includes(quizRewardAmount) ||
    (quizRewardDate === null) !== (quizRewardAmount === 0)
  ) throw conflict("퀴즈 보상 표식을 확인해 주세요.");
  // 구버전 클라이언트의 완료 흔적이 신규 보상 표식보다 더 최신이면 그
  // 날짜를 승격한 뒤 활성 legacy 필드를 지운다. 시도 횟수가 없거나 0인
  // 더 오래된 문서는 실제 지급액을 확정할 수 없으므로, 기존 1회 상한인
  // 10을 보수적 guard amount로 사용해 재지급 가능성부터 닫는다.
  if (
    quizDate && quizSolved &&
    (quizRewardDate === null ||
      storedDateTimestamp(quizDate) > storedDateTimestamp(quizRewardDate))
  ) {
    quizRewardDate = quizDate;
    quizRewardAmount = quizAttempts === 2 ? 5 : 10;
  }
  return {
    ...data,
    currentDay: requireSafeInteger(data.currentDay, "users.currentDay", {
      fallback: 1,
      min: 1,
      max: 365,
    }),
    readCount: requireSafeInteger(data.readCount, "users.readCount", {
      fallback: 1,
      min: 1,
    }),
    readingEpoch: requireSafeInteger(
      data.readingEpoch,
      "users.readingEpoch",
      { fallback: 0, max: Number.MAX_SAFE_INTEGER - 1 },
    ),
    score: requireSafeInteger(data.score, "users.score", { fallback: 0 }),
    talent: requireSafeInteger(data.talent, "users.talent", {
      fallback: 0,
      max: MAX_TALENT_VALUE,
    }),
    streak,
    maxStreak,
    startDate: optionalDate(data.startDate, "users.startDate"),
    lastReadDate,
    dailyAdvanceDate,
    dailyAdvanceCount,
    recentReadDates: normalizeRecentReadDates(data.recentReadDates),
    achievements: normalizeAchievements(data.achievements),
    dayOffset: requireSafeInteger(data.dayOffset, "users.dayOffset", {
      fallback: 0,
      min: Number.MIN_SAFE_INTEGER,
    }),
    secretShopUnlocked: requireBoolean(
      data.secretShopUnlocked,
      "users.secretShopUnlocked",
      false,
    ),
    quizDate,
    quizAttempts,
    quizSolved,
    quizSkipped,
    quizKey: normalizeQuizKey(data.quizKey),
    quizRewardDate,
    quizRewardAmount,
  };
};

const normalizeRosters = (
  uid: string,
  documents: FirestoreDocument<RestartRosterDocument>[],
  user: NormalizedUser,
): NormalizedRoster[] => {
  const parsed = parseRosterTalentWallets(documents, uid);
  if (!parsed.ok) {
    throw conflict("가입 공동체 수 또는 명부 상태를 확인해 주세요.");
  }
  return parsed.wallets.map(({ orgId, user: rawRoster }) => {
    const roster = rawRoster as RestartRosterDocument;
    return {
      orgId,
      user: roster,
      currentDay: requireSafeInteger(
        roster.currentDay,
        `roster.${orgId}.currentDay`,
        { fallback: user.currentDay, min: 1, max: 365 },
      ),
      readCount: requireSafeInteger(
        roster.readCount,
        `roster.${orgId}.readCount`,
        { fallback: user.readCount, min: 1 },
      ),
      score: requireSafeInteger(roster.score, `roster.${orgId}.score`, {
        fallback: user.score,
      }),
      talent: requireSafeInteger(roster.talent, `roster.${orgId}.talent`, {
        fallback: 0,
        max: MAX_TALENT_VALUE,
      }),
      streak: requireSafeInteger(roster.streak, `roster.${orgId}.streak`, {
        fallback: user.streak,
      }),
      lastReadDate: roster.lastReadDate === undefined
        ? user.lastReadDate
        : optionalDate(roster.lastReadDate, `roster.${orgId}.lastReadDate`),
    };
  });
};

const projectState = (
  user: NormalizedUser,
  rosters: NormalizedRoster[],
): RestartReadingState => ({
  user: {
    currentDay: user.currentDay,
    readCount: user.readCount,
    readingEpoch: user.readingEpoch,
    score: user.score,
    talent: user.talent,
    streak: user.streak,
    maxStreak: user.maxStreak,
    startDate: user.startDate,
    lastReadDate: user.lastReadDate,
    dailyAdvanceDate: user.dailyAdvanceDate,
    dailyAdvanceCount: user.dailyAdvanceCount,
    recentReadDates: [...user.recentReadDates],
    achievements: [...user.achievements],
    dayOffset: user.dayOffset,
    secretShopUnlocked: user.secretShopUnlocked,
    quizDate: user.quizDate,
    quizAttempts: user.quizAttempts,
    quizSolved: user.quizSolved,
    quizSkipped: user.quizSkipped,
    quizKey: user.quizKey,
    quizRewardDate: user.quizRewardDate,
    quizRewardAmount: user.quizRewardAmount,
  },
  rosters: rosters.map((roster) => ({
    orgId: roster.orgId,
    currentDay: roster.currentDay,
    readCount: roster.readCount,
    score: roster.score,
    streak: roster.streak,
    lastReadDate: roster.lastReadDate,
    talent: roster.talent,
  })),
});

const parsePosition = (value: unknown, field: string): ReadingPosition => {
  if (!isRecord(value)) throw conflict(`저장된 ${field}가 올바르지 않습니다.`);
  requireExactKeys(value, ["cycle", "day", "readingEpoch"], field);
  return {
    cycle: requireSafeInteger(value.cycle, `${field}.cycle`, { min: 1 }),
    day: requireSafeInteger(value.day, `${field}.day`, { min: 1, max: 365 }),
    readingEpoch: requireSafeInteger(
      value.readingEpoch,
      `${field}.readingEpoch`,
    ),
  };
};

const samePosition = (left: ReadingPosition, right: ReadingPosition) =>
  left.cycle === right.cycle && left.day === right.day &&
  left.readingEpoch === right.readingEpoch;

const parseStoredResult = (value: unknown): RestartReadingResult => {
  if (!isRecord(value)) {
    throw conflict("저장된 재시작 결과가 올바르지 않습니다.");
  }
  if (value.status === "restarted") {
    requireExactKeys(value, ["status", "previous", "next"], "재시작 결과");
    const previous = parsePosition(value.previous, "재시작 이전 위치");
    const next = parsePosition(value.next, "재시작 이후 위치");
    if (
      next.cycle !== previous.cycle || next.day !== 1 ||
      next.readingEpoch !== previous.readingEpoch + 1
    ) throw conflict("저장된 재시작 결과의 위치가 올바르지 않습니다.");
    return { status: "restarted", previous, next };
  }
  if (value.status === "positionMismatch") {
    requireExactKeys(
      value,
      ["status", "expected", "received"],
      "위치 불일치 결과",
    );
    return {
      status: "positionMismatch",
      expected: parsePosition(value.expected, "기대 위치"),
      received: parsePosition(value.received, "요청 위치"),
    };
  }
  throw conflict("저장된 재시작 결과 상태가 올바르지 않습니다.");
};

const validateReplay = (
  ledger: RestartLedgerDocument,
  uid: string,
  input: RestartReadingInput,
  currentCalendarDate: string,
  user: NormalizedUser,
): {
  calendarDate: string;
  result: Extract<RestartReadingResult, { status: "restarted" }>;
} => {
  const ledgerRecord = ledger as UnknownRecord;
  requireExactKeys(
    ledgerRecord,
    [
      "schemaVersion",
      "action",
      "requestId",
      "uid",
      "input",
      "calendarDate",
      "result",
      "createdAt",
    ],
    "재시작 원장",
  );
  if (
    ledger.schemaVersion !== ACTIVITY_LEDGER_SCHEMA_VERSION ||
    ledger.action !== RESTART_READING_ACTION ||
    ledger.requestId !== input.requestId || ledger.uid !== uid
  ) throw conflict("같은 요청 번호가 다른 읽기 재시작 작업에 사용되었습니다.");
  const storedInput = parsePosition(ledger.input, "재시작 원장 입력");
  const received: ReadingPosition = {
    cycle: input.cycle,
    day: input.day,
    readingEpoch: input.readingEpoch,
  };
  if (!samePosition(storedInput, received)) {
    throw conflict("같은 요청 번호가 다른 읽기 재시작 작업에 사용되었습니다.");
  }
  const calendarDate = optionalDate(ledger.calendarDate, "재시작 원장 날짜");
  if (
    !calendarDate ||
    storedDateTimestamp(calendarDate) > storedDateTimestamp(currentCalendarDate)
  ) throw conflict("저장된 읽기 재시작 날짜가 올바르지 않습니다.");
  const result = parseStoredResult(ledger.result);
  if (
    result.status !== "restarted" ||
    !samePosition(result.previous, storedInput) ||
    user.readingEpoch < result.next.readingEpoch
  ) throw conflict("저장된 읽기 재시작 결과가 현재 상태와 일치하지 않습니다.");
  return { calendarDate, result };
};

const isContention = (error: unknown): boolean =>
  error instanceof PlatformError &&
  ["FIRESTORE_READ_FAILED", "FIRESTORE_WRITE_FAILED"].includes(error.code) &&
  error.details?.status === 409;

const rollbackQuietly = async (
  dependencies: RestartReadingDependencies,
  service: ServiceAccess,
  transaction: string,
) => {
  await dependencies.rollbackTransaction(
    service.token,
    service.projectId,
    transaction,
  ).catch(() => {});
};

const executeRestart = async (
  service: ServiceAccess,
  uid: string,
  input: RestartReadingInput,
  dependencies: RestartReadingDependencies,
): Promise<RestartReadingResponse> => {
  const transaction = await dependencies.beginTransaction(
    service.token,
    service.projectId,
  );
  const userPath = `users/${uid}`;
  const ledgerPath = `${userPath}/activityActions/${input.requestId}`;
  try {
    const now = dependencies.now();
    if (!(now instanceof Date) || !Number.isFinite(now.getTime())) {
      throw new PlatformError("INTERNAL");
    }
    const calendarDate = dependencies.getTodayLegacy(now);
    if (!isLegacyDate(calendarDate)) throw new PlatformError("INTERNAL");
    const [userDocument, ledgerDocument, rosterDocuments] = await Promise.all([
      dependencies.getDocument<RestartUserDocument>(
        service.token,
        service.projectId,
        userPath,
        { transaction },
      ),
      dependencies.getDocument<RestartLedgerDocument>(
        service.token,
        service.projectId,
        ledgerPath,
        { transaction },
      ),
      dependencies.runCollectionGroupQuery<RestartRosterDocument>(
        service.token,
        service.projectId,
        "roster",
        "uid",
        uid,
        { limit: 4, transaction },
      ),
    ]);
    if (!userDocument) throw new PlatformError("NOT_FOUND");
    if (userDocument.data.isDeleted === true) {
      throw new PlatformError("FORBIDDEN");
    }
    const user = normalizeUser(uid, userDocument.data);
    const rosters = normalizeRosters(uid, rosterDocuments, user);
    const todayTimestamp = storedDateTimestamp(calendarDate);
    for (
      const [field, value] of [
        ["users.lastReadDate", user.lastReadDate],
        ["users.dailyAdvanceDate", user.dailyAdvanceDate],
        ["users.quizDate", user.quizDate],
        ["users.quizRewardDate", user.quizRewardDate],
      ] as Array<[string, string | null]>
    ) {
      if (value !== null && storedDateTimestamp(value) > todayTimestamp) {
        throw conflict(`미래 날짜 상태입니다: ${field}`);
      }
    }
    user.recentReadDates.forEach((value, index) => {
      if (storedReadDateTimestamp(value) > todayTimestamp) {
        throw conflict(`미래 날짜 상태입니다: users.recentReadDates.${index}`);
      }
    });

    if (ledgerDocument) {
      const replay = validateReplay(
        ledgerDocument.data,
        uid,
        input,
        calendarDate,
        user,
      );
      await rollbackQuietly(dependencies, service, transaction);
      return {
        alreadyCompleted: true,
        committed: true,
        calendarDate: replay.calendarDate,
        result: replay.result,
        state: projectState(user, rosters),
      };
    }

    const received: ReadingPosition = {
      cycle: input.cycle,
      day: input.day,
      readingEpoch: input.readingEpoch,
    };
    const expected: ReadingPosition = {
      cycle: user.readCount,
      day: user.currentDay,
      readingEpoch: user.readingEpoch,
    };
    if (!samePosition(received, expected)) {
      await rollbackQuietly(dependencies, service, transaction);
      return {
        alreadyCompleted: false,
        committed: false,
        calendarDate,
        result: { status: "positionMismatch", expected, received },
        state: projectState(user, rosters),
      };
    }

    const nextPosition: ReadingPosition = {
      cycle: user.readCount,
      day: 1,
      readingEpoch: user.readingEpoch + 1,
    };
    const result: Extract<RestartReadingResult, { status: "restarted" }> = {
      status: "restarted",
      previous: expected,
      next: nextPosition,
    };
    const userUpdate = {
      currentDay: 1,
      readingEpoch: nextPosition.readingEpoch,
      score: 0,
      streak: 0,
      startDate: calendarDate,
      lastReadDate: null,
      achievements: [],
      dayOffset: 0,
      quizDate: null,
      quizAttempts: 0,
      quizSolved: false,
      quizSkipped: false,
      quizKey: null,
      dailyAdvanceDate: user.dailyAdvanceDate,
      dailyAdvanceCount: user.dailyAdvanceCount,
      quizRewardDate: user.quizRewardDate,
      quizRewardAmount: user.quizRewardAmount,
      updatedAt: now,
    };
    const nextUser = normalizeUser(uid, { ...user, ...userUpdate });
    const rosterUpdate = {
      currentDay: 1,
      readCount: user.readCount,
      score: 0,
      streak: 0,
      lastReadDate: null,
      updatedAt: now,
    };
    const nextRosters = rosters.map((roster) => ({
      ...roster,
      ...rosterUpdate,
    }));
    const ledgerInput: ReadingPosition = { ...received };
    const writes = [
      dependencies.updateWrite(service.projectId, userPath, userUpdate, {
        updateMask: Object.keys(userUpdate),
        exists: true,
      }),
      ...rosters.map((roster) =>
        dependencies.updateWrite(
          service.projectId,
          `churches/${roster.orgId}/roster/${uid}`,
          rosterUpdate,
          { updateMask: Object.keys(rosterUpdate), exists: true },
        )
      ),
      dependencies.updateWrite(service.projectId, ledgerPath, {
        schemaVersion: ACTIVITY_LEDGER_SCHEMA_VERSION,
        action: RESTART_READING_ACTION,
        requestId: input.requestId,
        uid,
        input: ledgerInput,
        calendarDate,
        result,
        createdAt: now,
      }, { exists: false }),
    ];
    await dependencies.commitWrites(
      service.token,
      service.projectId,
      writes,
      { transaction },
    );
    return {
      alreadyCompleted: false,
      committed: true,
      calendarDate,
      result,
      state: projectState(nextUser, nextRosters),
    };
  } catch (error) {
    await rollbackQuietly(dependencies, service, transaction);
    throw error;
  }
};

export const restartReading = async (
  service: ServiceAccess,
  identity: RestartReadingIdentity,
  rawInput: RestartReadingInput,
  overrides: Partial<RestartReadingDependencies> = {},
): Promise<RestartReadingResponse> => {
  const uid = canonicalIdentity(identity);
  const input = validateInput(rawInput);
  const dependencies = { ...DEFAULT_DEPENDENCIES, ...overrides };
  let lastError: unknown = null;
  for (let attempt = 0; attempt < MAX_TRANSACTION_ATTEMPTS; attempt += 1) {
    try {
      return await executeRestart(service, uid, input, dependencies);
    } catch (error) {
      lastError = error;
      if (!isContention(error) || attempt + 1 >= MAX_TRANSACTION_ATTEMPTS) {
        throw error;
      }
    }
  }
  throw lastError;
};
