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
  calculateReadCompletion,
  type ReadCompletionRequest,
  type ReadCompletionResult,
  type StoredReadUser,
} from "./readCore.ts";
import {
  normalizeStoredDocumentId,
  parseRosterTalentWallets,
  resolveTalentWalletPrograms,
  type TalentMembershipUser,
} from "./talentProgramCore.ts";

const COMPLETE_READ_ACTION = "completeRead";
const ACTIVITY_LEDGER_SCHEMA_VERSION = 2;
const LEGACY_ACTIVITY_LEDGER_SCHEMA_VERSION = 1;
const MAX_TRANSACTION_ATTEMPTS = 3;
const MAX_TALENT_VALUE = 1_000_000_000;
const REQUEST_ID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type ServiceAccess = { token: string; projectId: string };

export type CompleteReadIdentity = {
  uid: string;
  anonymous: boolean;
};

export type CompleteReadInput = ReadCompletionRequest & {
  requestId: string;
  readingEpoch?: number;
};

type ValidatedCompleteReadInput = ReadCompletionRequest & {
  requestId: string;
  readingEpoch: number;
};

type CompleteReadUserDocument = StoredReadUser & TalentMembershipUser & {
  readingEpoch?: unknown;
  uid?: unknown;
  role?: unknown;
  isDeleted?: unknown;
  churchId?: unknown;
  baseChurchId?: unknown;
  primaryOrgId?: unknown;
};

type CompleteReadRosterDocument = TalentMembershipUser & {
  uid?: unknown;
  talent?: unknown;
};

type CompleteReadLedgerDocument = {
  schemaVersion?: unknown;
  action?: unknown;
  requestId?: unknown;
  uid?: unknown;
  cycle?: unknown;
  day?: unknown;
  readingEpoch?: unknown;
  calendarDate?: unknown;
  result?: unknown;
};

type CompleteReadHistoryDocument = {
  action?: unknown;
  requestId?: unknown;
  uid?: unknown;
  cycle?: unknown;
  day?: unknown;
  readingEpoch?: unknown;
};

type PlatformStatsDocument = {
  today_date?: unknown;
  readers_today?: unknown;
  finished_total?: unknown;
};

export type CompleteReadFreshState = {
  user: {
    currentDay: number;
    readCount: number;
    score: number;
    talent: number;
    streak: number;
    maxStreak: number;
    lastReadDate: string | null;
    dailyAdvanceDate: string | null;
    dailyAdvanceCount: number;
    weeklyReadKey: string | null;
    weeklyReadCount: number;
    recentReadDates: string[];
    secretShopUnlocked: boolean;
  };
  rosters: Array<{ orgId: string; talent: number }>;
};

export type CompleteReadResponse = {
  alreadyCompleted: boolean;
  committed: boolean;
  calendarDate: string;
  result: ReadCompletionResult;
  state: CompleteReadFreshState;
};

export type CompleteReadDependencies = {
  beginTransaction: typeof beginTransaction;
  commitWrites: typeof commitWrites;
  getDocument: typeof getDocument;
  rollbackTransaction: typeof rollbackTransaction;
  runCollectionGroupQuery: typeof runCollectionGroupQuery;
  updateWrite: typeof updateWrite;
  now: () => Date;
  getTodayLegacy: (now: Date) => string;
};

const DEFAULT_DEPENDENCIES: CompleteReadDependencies = {
  beginTransaction,
  commitWrites,
  getDocument,
  rollbackTransaction,
  runCollectionGroupQuery,
  updateWrite,
  now: () => new Date(),
  getTodayLegacy: getLegacyCalendarDateStringKst,
};

type NormalizedUser = CompleteReadUserDocument & {
  readingEpoch: number;
  currentDay: number;
  readCount: number;
  score: number;
  talent: number;
  streak: number;
  maxStreak: number;
  dailyAdvanceCount: number;
  weeklyReadCount: number;
};

type NormalizedRoster = {
  orgId: string;
  user: CompleteReadRosterDocument;
  talent: number;
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value);

const conflict = (message = "읽기 상태를 안전하게 확인할 수 없습니다.") =>
  new PlatformError("CONFLICT", { message });

const requireSafeInteger = (
  value: unknown,
  field: string,
  options: { fallback?: number; min?: number; max?: number } = {},
): number => {
  const hasFallback = Object.prototype.hasOwnProperty.call(options, "fallback");
  const candidate = value === undefined || value === null
    ? (hasFallback ? options.fallback : undefined)
    : value;
  const min = options.min ?? 0;
  const max = options.max ?? Number.MAX_SAFE_INTEGER;
  if (
    typeof candidate !== "number" || !Number.isSafeInteger(candidate) ||
    candidate < min || candidate > max
  ) {
    throw conflict(`안전하지 않은 정수 상태입니다: ${field}`);
  }
  return candidate;
};

const safeAdd = (left: number, right: number, field: string): number => {
  if (!Number.isSafeInteger(left) || !Number.isSafeInteger(right)) {
    throw conflict(`안전하지 않은 정수 상태입니다: ${field}`);
  }
  const result = left + right;
  if (!Number.isSafeInteger(result) || result < 0) {
    throw conflict(`정수 범위를 초과했습니다: ${field}`);
  }
  return result;
};

const STORED_WEEKDAYS = [
  "Sun",
  "Mon",
  "Tue",
  "Wed",
  "Thu",
  "Fri",
  "Sat",
] as const;
const STORED_MONTHS = [
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
] as const;

const legacyCalendarTimestamp = (value: string): number | null => {
  const legacy =
    /^(Sun|Mon|Tue|Wed|Thu|Fri|Sat) (Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec) (0[1-9]|[12]\d|3[01]) (\d{4})$/
      .exec(
        value,
      );
  if (!legacy) return null;
  const month = STORED_MONTHS.indexOf(
    legacy[2] as typeof STORED_MONTHS[number],
  );
  const day = Number(legacy[3]);
  const year = Number(legacy[4]);
  const date = new Date(Date.UTC(year, month, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month &&
      date.getUTCDate() === day &&
      STORED_WEEKDAYS[date.getUTCDay()] === legacy[1]
    ? date.getTime()
    : null;
};

const isLegacyCalendarDateString = (value: string): boolean =>
  legacyCalendarTimestamp(value) !== null;

const isStoredDateString = (value: string): boolean => {
  if (isLegacyCalendarDateString(value)) return true;
  const iso = /^(\d{4})-(\d{2})-(\d{2})(?:T.*)?$/.exec(value);
  if (!iso || !Number.isFinite(Date.parse(value))) return false;
  const year = Number(iso[1]);
  const month = Number(iso[2]) - 1;
  const day = Number(iso[3]);
  const date = new Date(Date.UTC(year, month, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month &&
    date.getUTCDate() === day;
};

const storedDateTimestamp = (value: string): number | null => {
  const legacyTimestamp = legacyCalendarTimestamp(value);
  if (legacyTimestamp !== null) return legacyTimestamp;
  const iso = /^(\d{4})-(\d{2})-(\d{2})(?:T.*)?$/.exec(value);
  if (!iso || !Number.isFinite(Date.parse(value))) return null;
  const year = Number(iso[1]);
  const month = Number(iso[2]) - 1;
  const day = Number(iso[3]);
  const date = new Date(Date.UTC(year, month, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month &&
      date.getUTCDate() === day
    ? date.getTime()
    : null;
};

const optionalDateString = (value: unknown, field: string): string | null => {
  if (value === undefined || value === null || value === "") return null;
  if (
    typeof value !== "string" || value.length > 64 ||
    !isLegacyCalendarDateString(value)
  ) {
    throw conflict(`날짜 상태가 올바르지 않습니다: ${field}`);
  }
  return value;
};

const recentReadDates = (value: unknown): string[] => {
  if (value === undefined || value === null) return [];
  if (
    !Array.isArray(value) || value.length > 14 ||
    value.some((item) =>
      typeof item !== "string" || item.length > 64 ||
      !isStoredDateString(item)
    )
  ) {
    throw conflict("최근 읽기 날짜 상태가 올바르지 않습니다.");
  }
  return [...value] as string[];
};

const canonicalIdentity = (identity: CompleteReadIdentity): string => {
  if (identity?.anonymous !== false) {
    throw new PlatformError("ANONYMOUS_NOT_ALLOWED");
  }
  const raw = typeof identity?.uid === "string" ? identity.uid.trim() : "";
  const uid = normalizeStoredDocumentId(raw);
  if (
    !uid || uid !== raw || uid.length > 128 || uid === "." || uid === ".." ||
    /[\u0000-\u001f\u007f]/.test(uid)
  ) {
    throw new PlatformError("BAD_REQUEST");
  }
  return uid;
};

const validateInput = (
  input: CompleteReadInput,
): ValidatedCompleteReadInput => {
  const readingEpoch = input?.readingEpoch === undefined
    ? 0
    : input.readingEpoch;
  if (
    !input || typeof input !== "object" ||
    typeof input.requestId !== "string" ||
    !REQUEST_ID_PATTERN.test(input.requestId) ||
    !Number.isSafeInteger(readingEpoch) || readingEpoch < 0 ||
    !Number.isSafeInteger(input.cycle) || input.cycle < 1 ||
    !Number.isSafeInteger(input.day) || input.day < 1 || input.day > 365
  ) {
    throw new PlatformError("BAD_REQUEST");
  }
  return {
    requestId: input.requestId,
    cycle: input.cycle,
    day: input.day,
    readingEpoch,
  };
};

const normalizeUser = (
  uid: string,
  data: CompleteReadUserDocument,
): NormalizedUser => {
  if (data.uid !== undefined && data.uid !== null && data.uid !== uid) {
    throw conflict("사용자 식별자가 현재 로그인과 일치하지 않습니다.");
  }
  const streak = requireSafeInteger(data.streak, "users.streak", {
    fallback: 0,
  });
  return {
    ...data,
    readingEpoch: requireSafeInteger(
      data.readingEpoch,
      "users.readingEpoch",
      { fallback: 0 },
    ),
    currentDay: requireSafeInteger(data.currentDay, "users.currentDay", {
      fallback: 1,
      min: 1,
      max: 365,
    }),
    readCount: requireSafeInteger(data.readCount, "users.readCount", {
      fallback: 1,
      min: 1,
    }),
    score: requireSafeInteger(data.score, "users.score", { fallback: 0 }),
    talent: requireSafeInteger(data.talent, "users.talent", {
      fallback: 0,
      max: MAX_TALENT_VALUE,
    }),
    streak,
    maxStreak: requireSafeInteger(data.maxStreak, "users.maxStreak", {
      fallback: streak,
    }),
    dailyAdvanceCount: requireSafeInteger(
      data.dailyAdvanceCount,
      "users.dailyAdvanceCount",
      { fallback: 0 },
    ),
    weeklyReadKey: optionalDateString(
      data.weeklyReadKey,
      "users.weeklyReadKey",
    ),
    weeklyReadCount: requireSafeInteger(
      data.weeklyReadCount,
      "users.weeklyReadCount",
      { fallback: 0 },
    ),
    lastReadDate: optionalDateString(data.lastReadDate, "users.lastReadDate"),
    dailyAdvanceDate: optionalDateString(
      data.dailyAdvanceDate,
      "users.dailyAdvanceDate",
    ),
    recentReadDates: recentReadDates(data.recentReadDates),
  };
};

const canonicalOrgId = (value: unknown, field: string): string | null => {
  if (value === undefined || value === null || value === "") return null;
  if (typeof value !== "string") {
    throw conflict(`공동체 식별자가 올바르지 않습니다: ${field}`);
  }
  const orgId = normalizeStoredDocumentId(value);
  if (
    !orgId || orgId !== value || orgId.length > 128 || orgId === "." ||
    orgId === ".." ||
    /[\u0000-\u001f\u007f]/.test(orgId)
  ) throw conflict(`공동체 식별자가 올바르지 않습니다: ${field}`);
  return orgId;
};

const directOrgIdForUser = (user: NormalizedUser): string | null => {
  if (user.accountType === "personal") return null;
  const baseChurchId = canonicalOrgId(
    user.baseChurchId,
    "users.baseChurchId",
  );
  const churchId = canonicalOrgId(user.churchId, "users.churchId");
  if (baseChurchId && churchId && baseChurchId !== churchId) {
    throw conflict("사용자의 기본 공동체 정보가 서로 일치하지 않습니다.");
  }
  return baseChurchId || churchId;
};

const normalizeRosters = (
  uid: string,
  documents: FirestoreDocument<CompleteReadRosterDocument>[],
): NormalizedRoster[] => {
  const parsed = parseRosterTalentWallets(documents, uid);
  if (!parsed.ok) {
    throw conflict("가입 공동체 수 또는 명부 상태를 확인해 주세요.");
  }
  return parsed.wallets.map(({ orgId: rawOrgId, user }) => {
    const orgId = canonicalOrgId(rawOrgId, "roster.orgId");
    if (!orgId) throw conflict("명부 공동체 식별자가 비어 있습니다.");
    return {
      orgId,
      user: user as CompleteReadRosterDocument,
      talent: requireSafeInteger(
        (user as CompleteReadRosterDocument).talent,
        `roster.${orgId}.talent`,
        { fallback: 0, max: MAX_TALENT_VALUE },
      ),
    };
  });
};

const projectState = (
  user: NormalizedUser,
  rosters: NormalizedRoster[],
): CompleteReadFreshState => ({
  user: {
    currentDay: user.currentDay,
    readCount: user.readCount,
    score: user.score,
    talent: user.talent,
    streak: user.streak,
    maxStreak: user.maxStreak,
    lastReadDate: optionalDateString(user.lastReadDate, "users.lastReadDate"),
    dailyAdvanceDate: optionalDateString(
      user.dailyAdvanceDate,
      "users.dailyAdvanceDate",
    ),
    dailyAdvanceCount: user.dailyAdvanceCount,
    weeklyReadKey: optionalDateString(
      user.weeklyReadKey,
      "users.weeklyReadKey",
    ),
    weeklyReadCount: user.weeklyReadCount,
    recentReadDates: recentReadDates(user.recentReadDates),
    secretShopUnlocked: user.secretShopUnlocked === true,
  },
  rosters: rosters.map(({ orgId, talent }) => ({ orgId, talent })),
});

const requireBoolean = (value: unknown, field: string): boolean => {
  if (typeof value !== "boolean") {
    throw conflict(`잘못된 ledger 필드: ${field}`);
  }
  return value;
};

const requireString = (value: unknown, field: string): string => {
  if (typeof value !== "string" || !value || value.length > 128) {
    throw conflict(`잘못된 ledger 필드: ${field}`);
  }
  return value;
};

const parseReadyResult = (value: unknown): ReadCompletionResult => {
  const record = isRecord(value) ? value : null;
  const update = isRecord(record?.updateData) ? record.updateData : null;
  const summary = isRecord(record?.summary) ? record.summary : null;
  if (record?.status !== "ready" || !update || !summary) {
    throw conflict("저장된 읽기 완료 결과가 올바르지 않습니다.");
  }
  const normalizedUpdate = {
    currentDay: requireSafeInteger(update.currentDay, "ledger.currentDay", {
      min: 1,
      max: 365,
    }),
    readCount: requireSafeInteger(update.readCount, "ledger.readCount", {
      min: 1,
    }),
    score: requireSafeInteger(update.score, "ledger.score"),
    streak: requireSafeInteger(update.streak, "ledger.streak"),
    maxStreak: requireSafeInteger(update.maxStreak, "ledger.maxStreak"),
    lastReadDate: requireString(update.lastReadDate, "ledger.lastReadDate"),
    dailyAdvanceDate: requireString(
      update.dailyAdvanceDate,
      "ledger.dailyAdvanceDate",
    ),
    dailyAdvanceCount: requireSafeInteger(
      update.dailyAdvanceCount,
      "ledger.dailyAdvanceCount",
    ),
    weeklyReadKey: update.weeklyReadKey === undefined
      ? requireString(update.dailyAdvanceDate, "ledger.dailyAdvanceDate")
      : requireString(update.weeklyReadKey, "ledger.weeklyReadKey"),
    weeklyReadCount: update.weeklyReadCount === undefined
      ? requireSafeInteger(update.dailyAdvanceCount, "ledger.dailyAdvanceCount")
      : requireSafeInteger(update.weeklyReadCount, "ledger.weeklyReadCount"),
    recentReadDates: recentReadDates(update.recentReadDates),
    ...(update.talent === undefined ? {} : {
      talent: requireSafeInteger(update.talent, "ledger.talent", {
        max: MAX_TALENT_VALUE,
      }),
    }),
    ...(update.secretShopUnlocked === undefined ? {} : {
      secretShopUnlocked: requireBoolean(
        update.secretShopUnlocked,
        "ledger.secretShopUnlocked",
      ) as true,
    }),
  };
  if (
    "secretShopUnlocked" in normalizedUpdate &&
    normalizedUpdate.secretShopUnlocked !== true
  ) throw conflict("잘못된 ledger 필드: ledger.secretShopUnlocked");

  return {
    status: "ready",
    updateData: normalizedUpdate,
    summary: {
      oldLevel: requireSafeInteger(summary.oldLevel, "ledger.oldLevel"),
      newLevel: requireSafeInteger(summary.newLevel, "ledger.newLevel"),
      scoreEarned: requireSafeInteger(
        summary.scoreEarned,
        "ledger.scoreEarned",
      ),
      streakBonus: requireSafeInteger(
        summary.streakBonus,
        "ledger.streakBonus",
      ),
      talentEarned: requireSafeInteger(
        summary.talentEarned,
        "ledger.talentEarned",
      ),
      newStreak: requireSafeInteger(summary.newStreak, "ledger.newStreak"),
      newReadCount: requireSafeInteger(
        summary.newReadCount,
        "ledger.newReadCount",
        { min: 1 },
      ),
      newProgressDay: requireSafeInteger(
        summary.newProgressDay,
        "ledger.newProgressDay",
        { min: 1, max: 365 },
      ),
      nextViewingDay: requireSafeInteger(
        summary.nextViewingDay,
        "ledger.nextViewingDay",
        { min: 1, max: 365 },
      ),
      completedRound: requireBoolean(
        summary.completedRound,
        "ledger.completedRound",
      ),
      secretShopJustUnlocked: requireBoolean(
        summary.secretShopJustUnlocked,
        "ledger.secretShopJustUnlocked",
      ),
      rewardsUserWallet: requireBoolean(
        summary.rewardsUserWallet,
        "ledger.rewardsUserWallet",
      ),
      talentProgramEnabled: requireBoolean(
        summary.talentProgramEnabled,
        "ledger.talentProgramEnabled",
      ),
    },
  };
};

const validateReadyResult = (
  result: ReadCompletionResult,
): Extract<ReadCompletionResult, { status: "ready" }> => {
  if (result.status !== "ready") throw conflict();
  return parseReadyResult(result) as Extract<
    ReadCompletionResult,
    { status: "ready" }
  >;
};

const validateReplay = (
  ledger: CompleteReadLedgerDocument,
  history: CompleteReadHistoryDocument | null,
  uid: string,
  input: ValidatedCompleteReadInput,
  currentReadingEpoch: number,
  currentCalendarDate: string,
): { calendarDate: string; result: ReadCompletionResult } => {
  const isLegacyLedger =
    ledger.schemaVersion === LEGACY_ACTIVITY_LEDGER_SCHEMA_VERSION &&
    ledger.readingEpoch === undefined;
  const ledgerReadingEpoch = isLegacyLedger
    ? 0
    : requireSafeInteger(ledger.readingEpoch, "ledger.readingEpoch");
  const historyReadingEpoch = history?.readingEpoch === undefined
    ? 0
    : requireSafeInteger(history.readingEpoch, "history.readingEpoch");
  const matches = (isLegacyLedger ||
    ledger.schemaVersion === ACTIVITY_LEDGER_SCHEMA_VERSION) &&
    ledger.action === COMPLETE_READ_ACTION &&
    ledger.requestId === input.requestId &&
    ledger.uid === uid && ledger.cycle === input.cycle &&
    ledger.day === input.day && ledgerReadingEpoch === input.readingEpoch &&
    ledgerReadingEpoch === currentReadingEpoch;
  const historyMatches = history?.action === COMPLETE_READ_ACTION &&
    history.requestId === input.requestId && history.uid === uid &&
    history.cycle === input.cycle && history.day === input.day &&
    historyReadingEpoch === input.readingEpoch;
  if (!matches || !historyMatches) {
    throw conflict("같은 요청 번호가 다른 읽기 작업에 사용되었습니다.");
  }
  const calendarDate = requireString(
    ledger.calendarDate,
    "ledger.calendarDate",
  );
  const ledgerTimestamp = legacyCalendarTimestamp(calendarDate);
  const currentTimestamp = legacyCalendarTimestamp(currentCalendarDate);
  if (
    ledgerTimestamp === null || currentTimestamp === null ||
    ledgerTimestamp > currentTimestamp
  ) throw conflict("저장된 읽기 완료 날짜가 올바르지 않습니다.");
  const result = parseReadyResult(ledger.result);
  if (
    result.status !== "ready" ||
    result.updateData.lastReadDate !== calendarDate ||
    result.updateData.dailyAdvanceDate !== calendarDate
  ) throw conflict("저장된 읽기 완료 날짜가 결과와 일치하지 않습니다.");
  return {
    calendarDate,
    result,
  };
};

const isContention = (error: unknown): boolean =>
  error instanceof PlatformError &&
  ["FIRESTORE_READ_FAILED", "FIRESTORE_WRITE_FAILED"].includes(error.code) &&
  error.details?.status === 409;

const rollbackQuietly = async (
  dependencies: CompleteReadDependencies,
  service: ServiceAccess,
  transaction: string,
) => {
  await dependencies.rollbackTransaction(
    service.token,
    service.projectId,
    transaction,
  ).catch(() => {});
};

const executeCompleteRead = async (
  service: ServiceAccess,
  uid: string,
  input: ValidatedCompleteReadInput,
  dependencies: CompleteReadDependencies,
): Promise<CompleteReadResponse> => {
  const transaction = await dependencies.beginTransaction(
    service.token,
    service.projectId,
  );
  const userPath = `users/${uid}`;
  const ledgerPath = `${userPath}/activityActions/${input.requestId}`;
  const historyPath = `${userPath}/history/${input.requestId}`;
  try {
    const now = dependencies.now();
    if (!(now instanceof Date) || !Number.isFinite(now.getTime())) {
      throw new PlatformError("INTERNAL");
    }
    const calendarDate = dependencies.getTodayLegacy(now);
    const todayTimestamp = legacyCalendarTimestamp(calendarDate);
    if (todayTimestamp === null) throw new PlatformError("INTERNAL");

    const [userDocument, ledgerDocument, historyDocument, rosterDocuments] =
      await Promise.all([
        dependencies.getDocument<CompleteReadUserDocument>(
          service.token,
          service.projectId,
          userPath,
          { transaction },
        ),
        dependencies.getDocument<CompleteReadLedgerDocument>(
          service.token,
          service.projectId,
          ledgerPath,
          { transaction },
        ),
        dependencies.getDocument<CompleteReadHistoryDocument>(
          service.token,
          service.projectId,
          historyPath,
          { transaction },
        ),
        dependencies.runCollectionGroupQuery<CompleteReadRosterDocument>(
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
    const rosters = normalizeRosters(uid, rosterDocuments);
    if (user.readingEpoch !== input.readingEpoch) {
      throw conflict("재시작 전 읽기 요청은 처리할 수 없습니다.");
    }
    for (
      const [field, value] of [
        ["users.lastReadDate", user.lastReadDate],
        ["users.dailyAdvanceDate", user.dailyAdvanceDate],
        ...recentReadDates(user.recentReadDates).map((
          value,
          index,
        ) => [`users.recentReadDates.${index}`, value]),
      ] as Array<[string, string | null]>
    ) {
      if (
        value !== null &&
        (storedDateTimestamp(value) ?? Number.POSITIVE_INFINITY) >
          todayTimestamp
      ) {
        throw conflict(`미래 읽기 날짜 상태입니다: ${field}`);
      }
    }

    if (ledgerDocument) {
      const replay = validateReplay(
        ledgerDocument.data,
        historyDocument?.data || null,
        uid,
        input,
        user.readingEpoch,
        calendarDate,
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
    if (historyDocument) {
      throw conflict("읽기 기록 요청 번호가 기존 기록과 충돌합니다.");
    }

    const directOrgId = directOrgIdForUser(user);
    if (directOrgId && rosters.some(({ orgId }) => orgId === directOrgId)) {
      throw conflict("기본 공동체와 추가 공동체 지갑이 중복됩니다.");
    }
    const orgIds = Array.from(
      new Set([
        ...(directOrgId ? [directOrgId] : []),
        ...rosters.map(({ orgId }) => orgId),
      ]),
    );
    const talentShopDocuments = await Promise.all(
      orgIds.map((orgId) =>
        dependencies.getDocument<Record<string, unknown>>(
          service.token,
          service.projectId,
          `churches/${orgId}/settings/talentShop`,
          { transaction },
        )
      ),
    );
    const shopByOrgId = new Map(
      orgIds.map((orgId, index) => [
        orgId,
        talentShopDocuments[index]?.data || null,
      ]),
    );
    const routing = resolveTalentWalletPrograms({
      direct: directOrgId
        ? { user, talentShop: shopByOrgId.get(directOrgId) || null }
        : null,
      rosters: rosters.map(({ orgId, user: rosterUser }) => ({
        user: rosterUser,
        talentShop: shopByOrgId.get(orgId) || null,
      })),
    });
    const calculated = calculateReadCompletion(
      user,
      { cycle: input.cycle, day: input.day },
      calendarDate,
      {
        directCanEarnTalent: routing.directCanEarnTalent,
        rosterCanEarnTalent: routing.rosterCanEarnTalent.some(Boolean),
      },
    );
    if (calculated.status !== "ready") {
      await rollbackQuietly(dependencies, service, transaction);
      return {
        alreadyCompleted: false,
        committed: false,
        calendarDate,
        result: calculated,
        state: projectState(user, rosters),
      };
    }
    const result = validateReadyResult(calculated);
    const userUpdate = { ...result.updateData, updatedAt: now };
    const nextUser = normalizeUser(uid, { ...user, ...result.updateData });
    const rosterProgress = {
      currentDay: result.updateData.currentDay,
      readCount: result.updateData.readCount,
      score: result.updateData.score,
      streak: result.updateData.streak,
      lastReadDate: result.updateData.lastReadDate,
      recentReadDates: result.updateData.recentReadDates,
      weeklyReadKey: result.updateData.weeklyReadKey,
      weeklyReadCount: result.updateData.weeklyReadCount,
      updatedAt: now,
    };
    const nextRosters = rosters.map((roster, index) => {
      const talent = routing.rosterCanEarnTalent[index]
        ? requireSafeInteger(
          safeAdd(
            roster.talent,
            result.summary.talentEarned,
            `roster.${roster.orgId}.talent`,
          ),
          `roster.${roster.orgId}.talent`,
          { max: MAX_TALENT_VALUE },
        )
        : roster.talent;
      return { ...roster, talent };
    });

    const writes = [
      dependencies.updateWrite(service.projectId, userPath, userUpdate, {
        updateMask: Object.keys(userUpdate),
        exists: true,
      }),
      ...rosters.map((roster, index) => {
        const update = routing.rosterCanEarnTalent[index]
          ? { ...rosterProgress, talent: nextRosters[index].talent }
          : rosterProgress;
        return dependencies.updateWrite(
          service.projectId,
          `churches/${roster.orgId}/roster/${uid}`,
          update,
          { updateMask: Object.keys(update), exists: true },
        );
      }),
      dependencies.updateWrite(service.projectId, historyPath, {
        action: COMPLETE_READ_ACTION,
        requestId: input.requestId,
        uid,
        cycle: input.cycle,
        day: input.day,
        readingEpoch: input.readingEpoch,
        date: calendarDate,
        score: result.summary.scoreEarned,
        talent: result.summary.talentEarned,
        ts: now,
      }, { exists: false }),
      dependencies.updateWrite(service.projectId, ledgerPath, {
        schemaVersion: ACTIVITY_LEDGER_SCHEMA_VERSION,
        action: COMPLETE_READ_ACTION,
        requestId: input.requestId,
        uid,
        cycle: input.cycle,
        day: input.day,
        readingEpoch: input.readingEpoch,
        calendarDate,
        result,
        createdAt: now,
      }, { exists: false }),
    ];

    const isFirstReadToday = result.summary.scoreEarned > 0;
    if (isFirstReadToday || result.summary.completedRound) {
      const statsPath = "settings/platformStats";
      const statsDocument = await dependencies.getDocument<
        PlatformStatsDocument
      >(
        service.token,
        service.projectId,
        statsPath,
        { transaction },
      );
      const previous = statsDocument?.data || {};
      if (previous.today_date !== undefined && previous.today_date !== null) {
        if (
          typeof previous.today_date !== "string" ||
          !isLegacyCalendarDateString(previous.today_date)
        ) throw conflict("플랫폼 통계 날짜 상태가 올바르지 않습니다.");
        const statsTimestamp = legacyCalendarTimestamp(previous.today_date)!;
        if (statsTimestamp > todayTimestamp) {
          throw conflict("플랫폼 통계 날짜가 서버 날짜보다 미래입니다.");
        }
      }
      const statsUpdate: Record<string, unknown> = {
        updatedAt: now,
      };
      if (isFirstReadToday) {
        statsUpdate.readers_today = previous.today_date === calendarDate
          ? safeAdd(
            requireSafeInteger(
              previous.readers_today,
              "platformStats.readers_today",
              { fallback: 0 },
            ),
            1,
            "platformStats.readers_today",
          )
          : 1;
        statsUpdate.today_date = calendarDate;
      }
      if (result.summary.completedRound) {
        statsUpdate.finished_total = safeAdd(
          requireSafeInteger(
            previous.finished_total,
            "platformStats.finished_total",
            { fallback: 0 },
          ),
          1,
          "platformStats.finished_total",
        );
      }
      writes.push(dependencies.updateWrite(
        service.projectId,
        statsPath,
        statsUpdate,
        { updateMask: Object.keys(statsUpdate) },
      ));
    }

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

/**
 * Executes the authoritative read-completion transaction for a Firebase user
 * already verified with allowAnonymous:false.
 */
export const completeReadTransaction = async (
  service: ServiceAccess,
  identity: CompleteReadIdentity,
  rawInput: CompleteReadInput,
  overrides: Partial<CompleteReadDependencies> = {},
): Promise<CompleteReadResponse> => {
  const uid = canonicalIdentity(identity);
  const input = validateInput(rawInput);
  const dependencies = { ...DEFAULT_DEPENDENCIES, ...overrides };
  let lastError: unknown = null;
  for (let attempt = 0; attempt < MAX_TRANSACTION_ATTEMPTS; attempt += 1) {
    try {
      return await executeCompleteRead(
        service,
        uid,
        input,
        dependencies,
      );
    } catch (error) {
      lastError = error;
      if (!isContention(error) || attempt + 1 >= MAX_TRANSACTION_ATTEMPTS) {
        throw error;
      }
    }
  }
  throw lastError;
};
