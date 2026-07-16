import { PlatformError } from "../_shared/errors.ts";
import {
  beginTransaction,
  commitWrites,
  getDocument,
  rollbackTransaction,
  updateWrite,
} from "../_shared/firestore.ts";
import {
  type AchievementId,
  type AchievementTrigger,
  calculateAchievementSync,
  isCatalogOrderedAchievementSubset,
  isKnownAchievementId,
} from "./achievementCore.ts";

export const SYNC_ACHIEVEMENTS_ACTION = "syncAchievements" as const;

const ACTIVITY_LEDGER_SCHEMA_VERSION = 1;
const MAX_TRANSACTION_ATTEMPTS = 3;
const MAX_ACHIEVEMENT_IDS = 100;
const REQUEST_ID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const FIRESTORE_TIMESTAMP_PATTERN =
  /^(\d{4})-(\d{2})-(\d{2})T([01]\d|2[0-3]):([0-5]\d):([0-5]\d)(?:\.\d{1,9})?Z$/;

type ServiceAccess = { token: string; projectId: string };
type UnknownRecord = Record<string, unknown>;

export type SyncAchievementsIdentity = {
  uid: string;
  anonymous: boolean;
};

export type SyncAchievementsInput = {
  requestId: string;
  trigger: AchievementTrigger;
};

export type SyncAchievementsResult = {
  trigger: AchievementTrigger;
  newIds: AchievementId[];
};

export type SyncAchievementsResponse = {
  alreadyCompleted: boolean;
  committed: boolean;
  result: SyncAchievementsResult;
};

type StoredAchievementUser = {
  isDeleted?: unknown;
  currentDay?: unknown;
  streak?: unknown;
  score?: unknown;
  achievements?: unknown;
  memos?: unknown;
};

type StoredAchievementLedger = {
  schemaVersion?: unknown;
  action?: unknown;
  requestId?: unknown;
  uid?: unknown;
  input?: unknown;
  result?: unknown;
  createdAt?: unknown;
};

type NormalizedAchievementUser = {
  currentDay: number;
  streak: number;
  score: number;
  achievements: string[];
  memoCount: number;
};

export type SyncAchievementsDependencies = {
  beginTransaction: typeof beginTransaction;
  commitWrites: typeof commitWrites;
  getDocument: typeof getDocument;
  rollbackTransaction: typeof rollbackTransaction;
  updateWrite: typeof updateWrite;
  now: () => Date;
};

const DEFAULT_DEPENDENCIES: SyncAchievementsDependencies = {
  beginTransaction,
  commitWrites,
  getDocument,
  rollbackTransaction,
  updateWrite,
  now: () => new Date(),
};

const isRecord = (value: unknown): value is UnknownRecord =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value);

const hasControlCharacters = (value: string): boolean =>
  Array.from(value).some((character) => {
    const code = character.charCodeAt(0);
    return code <= 0x1f || code === 0x7f;
  });

const conflict = (
  message = "업적 상태를 안전하게 확인할 수 없습니다.",
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

const normalizeInteger = (
  value: unknown,
  fallback: number,
  minimum: number,
  maximum: number,
  field: string,
): number => {
  const candidate = value === undefined ? fallback : value;
  if (
    typeof candidate !== "number" || !Number.isSafeInteger(candidate) ||
    candidate < minimum || candidate > maximum
  ) throw conflict(`업적 수치 상태가 올바르지 않습니다: ${field}`);
  return candidate;
};

const normalizeAchievements = (value: unknown): string[] => {
  if (value === undefined) return [];
  if (
    !Array.isArray(value) || value.length > MAX_ACHIEVEMENT_IDS ||
    value.some((item) =>
      typeof item !== "string" || !item || item.length > 128 ||
      hasControlCharacters(item)
    )
  ) throw conflict("업적 목록 상태가 올바르지 않습니다.");
  return [...value] as string[];
};

const normalizeMemos = (value: unknown): UnknownRecord => {
  if (value === undefined) return {};
  if (!isRecord(value)) throw conflict("묵상 메모 상태가 올바르지 않습니다.");
  return value;
};

const normalizeUser = (
  value: unknown,
): NormalizedAchievementUser => {
  if (!isRecord(value)) throw conflict("사용자 상태가 올바르지 않습니다.");
  if (
    value.isDeleted !== undefined && typeof value.isDeleted !== "boolean"
  ) throw conflict("사용자 삭제 상태가 올바르지 않습니다.");
  const memos = normalizeMemos(value.memos);
  return {
    currentDay: normalizeInteger(value.currentDay, 1, 1, 365, "currentDay"),
    streak: normalizeInteger(
      value.streak,
      0,
      0,
      Number.MAX_SAFE_INTEGER,
      "streak",
    ),
    score: normalizeInteger(
      value.score,
      0,
      0,
      Number.MAX_SAFE_INTEGER,
      "score",
    ),
    achievements: normalizeAchievements(value.achievements),
    memoCount: Object.keys(memos).length,
  };
};

const canonicalIdentity = (identity: SyncAchievementsIdentity): string => {
  if (identity?.anonymous !== false) {
    throw new PlatformError("ANONYMOUS_NOT_ALLOWED");
  }
  const raw = typeof identity?.uid === "string" ? identity.uid.trim() : "";
  if (
    !raw || raw.length > 128 || raw === "." || raw === ".." ||
    raw.includes("/") || hasControlCharacters(raw) || raw !== identity.uid
  ) throw new PlatformError("BAD_REQUEST");
  return raw;
};

const validateInput = (
  input: SyncAchievementsInput,
): SyncAchievementsInput => {
  if (!isRecord(input)) throw new PlatformError("BAD_REQUEST");
  const keys = Object.keys(input).sort();
  if (
    keys.length !== 2 || keys[0] !== "requestId" || keys[1] !== "trigger" ||
    typeof input.requestId !== "string" ||
    !REQUEST_ID_PATTERN.test(input.requestId) ||
    (input.trigger !== "read" && input.trigger !== "memo")
  ) throw new PlatformError("BAD_REQUEST");
  return { requestId: input.requestId, trigger: input.trigger };
};

const isFirestoreTimestamp = (value: unknown): value is string => {
  if (typeof value !== "string" || value.length > 64) return false;
  const match = FIRESTORE_TIMESTAMP_PATTERN.exec(value);
  if (!match) return false;
  const parsed = new Date(value);
  return Number.isFinite(parsed.getTime()) &&
    parsed.getUTCFullYear() === Number(match[1]) &&
    parsed.getUTCMonth() + 1 === Number(match[2]) &&
    parsed.getUTCDate() === Number(match[3]) &&
    parsed.getUTCHours() === Number(match[4]) &&
    parsed.getUTCMinutes() === Number(match[5]) &&
    parsed.getUTCSeconds() === Number(match[6]);
};

const parseStoredResult = (
  value: unknown,
  expectedTrigger: AchievementTrigger,
): SyncAchievementsResult => {
  if (!isRecord(value)) throw conflict("업적 원장 결과가 올바르지 않습니다.");
  requireExactKeys(value, ["trigger", "newIds"], "업적 원장 결과");
  if (
    value.trigger !== expectedTrigger || !Array.isArray(value.newIds) ||
    value.newIds.length === 0 ||
    value.newIds.length > MAX_ACHIEVEMENT_IDS ||
    !value.newIds.every(isKnownAchievementId)
  ) throw conflict("업적 원장 결과가 올바르지 않습니다.");
  const newIds = [...value.newIds] as AchievementId[];
  if (
    new Set(newIds).size !== newIds.length ||
    !isCatalogOrderedAchievementSubset(newIds)
  ) throw conflict("업적 원장 결과 순서가 올바르지 않습니다.");
  return { trigger: expectedTrigger, newIds };
};

const validateReplay = (
  ledger: StoredAchievementLedger,
  uid: string,
  input: SyncAchievementsInput,
): SyncAchievementsResult => {
  if (!isRecord(ledger)) throw conflict("업적 원장이 올바르지 않습니다.");
  requireExactKeys(
    ledger,
    [
      "schemaVersion",
      "action",
      "requestId",
      "uid",
      "input",
      "result",
      "createdAt",
    ],
    "업적 원장",
  );
  if (
    ledger.schemaVersion !== ACTIVITY_LEDGER_SCHEMA_VERSION ||
    ledger.action !== SYNC_ACHIEVEMENTS_ACTION ||
    ledger.requestId !== input.requestId || ledger.uid !== uid ||
    !isFirestoreTimestamp(ledger.createdAt) ||
    !isRecord(ledger.input)
  ) throw conflict("같은 요청 번호가 다른 업적 작업에 사용되었습니다.");
  requireExactKeys(ledger.input, ["trigger"], "업적 원장 입력");
  if (ledger.input.trigger !== input.trigger) {
    throw conflict("같은 요청 번호가 다른 업적 작업에 사용되었습니다.");
  }
  return parseStoredResult(ledger.result, input.trigger);
};

const isContention = (error: unknown): boolean =>
  error instanceof PlatformError &&
  ["FIRESTORE_READ_FAILED", "FIRESTORE_WRITE_FAILED"].includes(error.code) &&
  error.details?.status === 409;

const rollbackQuietly = async (
  dependencies: SyncAchievementsDependencies,
  service: ServiceAccess,
  transaction: string,
) => {
  await dependencies.rollbackTransaction(
    service.token,
    service.projectId,
    transaction,
  ).catch(() => {});
};

const executeSync = async (
  service: ServiceAccess,
  uid: string,
  input: SyncAchievementsInput,
  dependencies: SyncAchievementsDependencies,
): Promise<SyncAchievementsResponse> => {
  const transaction = await dependencies.beginTransaction(
    service.token,
    service.projectId,
  );
  const userPath = `users/${uid}`;
  const ledgerPath = `${userPath}/activityActions/${input.requestId}`;
  try {
    const [userDocument, ledgerDocument] = await Promise.all([
      dependencies.getDocument<StoredAchievementUser>(
        service.token,
        service.projectId,
        userPath,
        { transaction },
      ),
      dependencies.getDocument<StoredAchievementLedger>(
        service.token,
        service.projectId,
        ledgerPath,
        { transaction },
      ),
    ]);
    if (!userDocument) throw new PlatformError("NOT_FOUND");
    if (userDocument.data.isDeleted === true) {
      throw new PlatformError("FORBIDDEN");
    }
    const user = normalizeUser(userDocument.data);

    if (ledgerDocument) {
      const result = validateReplay(ledgerDocument.data, uid, input);
      await rollbackQuietly(dependencies, service, transaction);
      return {
        alreadyCompleted: true,
        committed: true,
        result,
      };
    }

    const calculation = calculateAchievementSync({
      currentIds: user.achievements,
      currentDay: user.currentDay,
      streak: user.streak,
      score: user.score,
      memoCount: input.trigger === "memo" ? user.memoCount : 0,
      trigger: input.trigger,
    });
    if (calculation.newIds.length === 0) {
      await rollbackQuietly(dependencies, service, transaction);
      return {
        alreadyCompleted: false,
        committed: false,
        result: { trigger: input.trigger, newIds: [] },
      };
    }
    if (calculation.mergedIds.length > MAX_ACHIEVEMENT_IDS) {
      throw conflict("업적 목록 한도를 초과했습니다.");
    }

    const now = dependencies.now();
    if (!(now instanceof Date) || !Number.isFinite(now.getTime())) {
      throw new PlatformError("INTERNAL");
    }
    const result: SyncAchievementsResult = {
      trigger: input.trigger,
      newIds: calculation.newIds,
    };
    const writes = [
      dependencies.updateWrite(
        service.projectId,
        userPath,
        { achievements: calculation.mergedIds },
        { updateMask: ["achievements"], exists: true },
      ),
      dependencies.updateWrite(
        service.projectId,
        ledgerPath,
        {
          schemaVersion: ACTIVITY_LEDGER_SCHEMA_VERSION,
          action: SYNC_ACHIEVEMENTS_ACTION,
          requestId: input.requestId,
          uid,
          input: { trigger: input.trigger },
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
      { transaction },
    );
    return {
      alreadyCompleted: false,
      committed: true,
      result,
    };
  } catch (error) {
    await rollbackQuietly(dependencies, service, transaction);
    throw error;
  }
};

export const syncAchievements = async (
  service: ServiceAccess,
  identity: SyncAchievementsIdentity,
  rawInput: SyncAchievementsInput,
  overrides: Partial<SyncAchievementsDependencies> = {},
): Promise<SyncAchievementsResponse> => {
  const uid = canonicalIdentity(identity);
  const input = validateInput(rawInput);
  const dependencies = { ...DEFAULT_DEPENDENCIES, ...overrides };
  let lastError: unknown = null;
  for (let attempt = 0; attempt < MAX_TRANSACTION_ATTEMPTS; attempt += 1) {
    try {
      return await executeSync(service, uid, input, dependencies);
    } catch (error) {
      lastError = error;
      if (!isContention(error) || attempt + 1 >= MAX_TRANSACTION_ATTEMPTS) {
        throw error;
      }
    }
  }
  throw lastError;
};
