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
import {
  normalizeStoredDocumentId,
  parseRosterTalentWallets,
  type TalentMembershipUser,
} from "./talentProgramCore.ts";

export const NORMALIZE_LEGACY_READING_POSITION_ACTION =
  "normalizeLegacyReadingPosition" as const;

const ACTIVITY_LEDGER_SCHEMA_VERSION = 1;
const MAX_TRANSACTION_ATTEMPTS = 3;
const REQUEST_ID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const FIRESTORE_TIMESTAMP_PATTERN =
  /^(\d{4})-(\d{2})-(\d{2})T([01]\d|2[0-3]):([0-5]\d):([0-5]\d)(?:\.\d{1,9})?Z$/;

type ServiceAccess = { token: string; projectId: string };
type UnknownRecord = Record<string, unknown>;

export type NormalizeLegacyReadingPositionIdentity = {
  uid: string;
  anonymous: boolean;
};

export type NormalizeLegacyReadingPositionInput = {
  requestId: string;
};

export type NormalizeLegacyReadingPositionResult =
  | {
    status: "normalized";
    currentDay: number;
    readCount: number;
  }
  | {
    status: "alreadyNormalized";
    currentDay: number;
    readCount: number;
  };

export type NormalizeLegacyReadingPositionResponse = {
  alreadyCompleted: boolean;
  committed: boolean;
  result: NormalizeLegacyReadingPositionResult;
};

type LegacyReadingUser = {
  uid?: unknown;
  isDeleted?: unknown;
  accountType?: unknown;
  churchId?: unknown;
  churchName?: unknown;
  currentDay?: unknown;
  readCount?: unknown;
};

type LegacyReadingChurch = {
  name?: unknown;
  isDeleted?: unknown;
};

type LegacyReadingRoster = TalentMembershipUser & {
  uid?: unknown;
  currentDay?: unknown;
  readCount?: unknown;
};

type StoredNormalizationLedger = {
  schemaVersion?: unknown;
  action?: unknown;
  requestId?: unknown;
  input?: unknown;
  result?: unknown;
  createdAt?: unknown;
};

type NormalizedRoster = {
  orgId: string;
  needsRepair: boolean;
};

export type NormalizeLegacyReadingPositionDependencies = {
  beginTransaction: typeof beginTransaction;
  commitWrites: typeof commitWrites;
  getDocument: typeof getDocument;
  rollbackTransaction: typeof rollbackTransaction;
  runCollectionGroupQuery: typeof runCollectionGroupQuery;
  updateWrite: typeof updateWrite;
  now: () => Date;
};

const DEFAULT_DEPENDENCIES: NormalizeLegacyReadingPositionDependencies = {
  beginTransaction,
  commitWrites,
  getDocument,
  rollbackTransaction,
  runCollectionGroupQuery,
  updateWrite,
  now: () => new Date(),
};

const isRecord = (value: unknown): value is UnknownRecord =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value);

const hasControlCharacters = (value: string): boolean =>
  /[\u0000-\u001f\u007f]/.test(value);

const conflict = (
  message = "읽기 진도 상태를 안전하게 보정할 수 없습니다.",
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
  options: { fallback?: number } = {},
): number => {
  const hasFallback = Object.prototype.hasOwnProperty.call(
    options,
    "fallback",
  );
  const fallback = options.fallback;
  const candidate = value === undefined || value === null
    ? (hasFallback ? fallback : undefined)
    : value;
  if (
    typeof candidate !== "number" || !Number.isSafeInteger(candidate) ||
    candidate < 1
  ) throw conflict(`안전하지 않은 정수 상태입니다: ${field}`);
  return candidate;
};

const canonicalIdentity = (
  identity: NormalizeLegacyReadingPositionIdentity,
): string => {
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

const validateInput = (
  input: NormalizeLegacyReadingPositionInput,
): NormalizeLegacyReadingPositionInput => {
  if (
    !isRecord(input) || Object.keys(input).length !== 1 ||
    typeof input.requestId !== "string" ||
    !REQUEST_ID_PATTERN.test(input.requestId)
  ) throw new PlatformError("BAD_REQUEST");
  return { requestId: input.requestId };
};

const normalizeUser = (
  uid: string,
  user: LegacyReadingUser,
): {
  currentDay: number;
  readCount: number;
  churchId: string | null;
  churchName: unknown;
} => {
  if (user.uid !== undefined && user.uid !== null && user.uid !== uid) {
    throw conflict("사용자 식별자가 현재 로그인과 일치하지 않습니다.");
  }
  if (user.isDeleted === true) throw new PlatformError("FORBIDDEN");
  if (
    user.isDeleted !== undefined && user.isDeleted !== null &&
    user.isDeleted !== false
  ) throw conflict("사용자 삭제 상태가 올바르지 않습니다.");
  let churchId: string | null = null;
  if (
    user.accountType !== "personal" && user.churchId !== undefined &&
    user.churchId !== null
  ) {
    if (typeof user.churchId !== "string") {
      throw conflict("사용자 공동체 식별자가 올바르지 않습니다.");
    }
    const normalizedChurchId = normalizeStoredDocumentId(user.churchId);
    if (
      !normalizedChurchId || normalizedChurchId !== user.churchId ||
      normalizedChurchId.length > 128 || normalizedChurchId === "." ||
      normalizedChurchId === ".." || hasControlCharacters(normalizedChurchId)
    ) throw conflict("사용자 공동체 식별자가 올바르지 않습니다.");
    churchId = normalizedChurchId;
  }
  return {
    currentDay: requireSafeInteger(user.currentDay, "users.currentDay"),
    // 구버전 문서는 readCount 자체가 없을 수 있으며 기존 클라이언트도 이를
    // 1회차로 해석했다. 명시된 손상 값은 그대로 fail closed 한다.
    readCount: requireSafeInteger(user.readCount, "users.readCount", {
      fallback: 1,
    }),
    churchId,
    churchName: user.churchName,
  };
};

const canonicalChurchName = (
  churchId: string,
  church: LegacyReadingChurch | null,
): string => {
  if (!isRecord(church) || church.isDeleted === true) {
    throw conflict("사용자의 기준 공동체를 찾을 수 없습니다.");
  }
  if (
    church.isDeleted !== undefined && church.isDeleted !== false ||
    typeof church.name !== "string" || church.name !== church.name.trim() ||
    church.name.length < 1 || church.name.length > 200 ||
    hasControlCharacters(church.name)
  ) throw conflict(`공동체 이름 상태가 올바르지 않습니다: ${churchId}`);
  return church.name;
};

const normalizeRosters = (
  uid: string,
  documents: FirestoreDocument<LegacyReadingRoster>[],
  user: { currentDay: number; readCount: number },
): NormalizedRoster[] => {
  const parsed = parseRosterTalentWallets(documents, uid);
  if (!parsed.ok) {
    throw conflict("가입 공동체 수 또는 명부 상태를 확인해 주세요.");
  }
  return parsed.wallets.map(({ orgId, user: rawRoster }) => {
    const roster = rawRoster as LegacyReadingRoster;
    const currentDay = requireSafeInteger(
      roster.currentDay,
      `roster.${orgId}.currentDay`,
      {
        fallback: user.currentDay,
      },
    );
    const readCount = requireSafeInteger(
      roster.readCount,
      `roster.${orgId}.readCount`,
      {
        fallback: user.readCount,
      },
    );
    return {
      orgId,
      // 누락/null도 users 값과 같다고 추정하지 않고 실제 미러 복구 대상으로
      // 남긴다. 명시된 잘못된 값은 위 정수 검증에서 이미 fail closed 된다.
      needsRepair: roster.currentDay === undefined ||
        roster.currentDay === null || roster.readCount === undefined ||
        roster.readCount === null || currentDay !== user.currentDay ||
        readCount !== user.readCount,
    };
  });
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

const validateStoredResult = (
  value: unknown,
): Extract<NormalizeLegacyReadingPositionResult, { status: "normalized" }> => {
  if (!isRecord(value)) {
    throw conflict("저장된 읽기 진도 보정 결과가 올바르지 않습니다.");
  }
  requireExactKeys(
    value,
    ["status", "currentDay", "readCount"],
    "읽기 진도 보정 결과",
  );
  if (value.status !== "normalized") {
    throw conflict("저장된 읽기 진도 보정 결과가 올바르지 않습니다.");
  }
  const currentDay = requireSafeInteger(value.currentDay, "ledger.currentDay");
  const readCount = requireSafeInteger(value.readCount, "ledger.readCount");
  if (currentDay > 365) {
    throw conflict("저장된 읽기 진도 보정 결과가 올바르지 않습니다.");
  }
  return { status: "normalized", currentDay, readCount };
};

const validateReplay = (
  ledger: StoredNormalizationLedger,
  input: NormalizeLegacyReadingPositionInput,
): Extract<NormalizeLegacyReadingPositionResult, { status: "normalized" }> => {
  if (!isRecord(ledger)) {
    throw conflict("읽기 진도 보정 원장이 올바르지 않습니다.");
  }
  requireExactKeys(
    ledger,
    ["schemaVersion", "action", "requestId", "input", "result", "createdAt"],
    "읽기 진도 보정 원장",
  );
  if (
    ledger.schemaVersion !== ACTIVITY_LEDGER_SCHEMA_VERSION ||
    ledger.action !== NORMALIZE_LEGACY_READING_POSITION_ACTION ||
    ledger.requestId !== input.requestId || !isRecord(ledger.input) ||
    !isFirestoreTimestamp(ledger.createdAt)
  ) throw conflict("같은 요청 번호가 다른 읽기 진도 작업에 사용되었습니다.");
  requireExactKeys(ledger.input, [], "읽기 진도 보정 원장 입력");
  return validateStoredResult(ledger.result);
};

const normalizedResult = (
  currentDay: number,
  readCount: number,
): Extract<NormalizeLegacyReadingPositionResult, { status: "normalized" }> => {
  const extraRounds = Math.floor((currentDay - 1) / 365);
  const nextDay = ((currentDay - 1) % 365) + 1;
  const nextReadCount = readCount + extraRounds;
  if (
    !Number.isSafeInteger(extraRounds) || extraRounds < 1 ||
    !Number.isSafeInteger(nextDay) || nextDay < 1 || nextDay > 365 ||
    !Number.isSafeInteger(nextReadCount) || nextReadCount < readCount
  ) throw conflict("읽기 진도 보정 결과가 안전한 정수 범위를 벗어났습니다.");
  return {
    status: "normalized",
    currentDay: nextDay,
    readCount: nextReadCount,
  };
};

const isContention = (error: unknown): boolean =>
  error instanceof PlatformError &&
  ["FIRESTORE_READ_FAILED", "FIRESTORE_WRITE_FAILED"].includes(error.code) &&
  error.details?.status === 409;

const rollbackQuietly = async (
  dependencies: NormalizeLegacyReadingPositionDependencies,
  service: ServiceAccess,
  transaction: string,
) => {
  await dependencies.rollbackTransaction(
    service.token,
    service.projectId,
    transaction,
  ).catch(() => {});
};

const executeNormalization = async (
  service: ServiceAccess,
  uid: string,
  input: NormalizeLegacyReadingPositionInput,
  dependencies: NormalizeLegacyReadingPositionDependencies,
): Promise<NormalizeLegacyReadingPositionResponse> => {
  const transaction = await dependencies.beginTransaction(
    service.token,
    service.projectId,
  );
  const userPath = `users/${uid}`;
  const ledgerPath = `${userPath}/activityActions/${input.requestId}`;
  try {
    const [userDocument, ledgerDocument, rosterDocuments] = await Promise.all([
      dependencies.getDocument<LegacyReadingUser>(
        service.token,
        service.projectId,
        userPath,
        { transaction },
      ),
      dependencies.getDocument<StoredNormalizationLedger>(
        service.token,
        service.projectId,
        ledgerPath,
        { transaction },
      ),
      dependencies.runCollectionGroupQuery<LegacyReadingRoster>(
        service.token,
        service.projectId,
        "roster",
        "uid",
        uid,
        { limit: 4, transaction },
      ),
    ]);
    if (!userDocument) throw new PlatformError("NOT_FOUND");
    const user = normalizeUser(uid, userDocument.data);
    const rosters = normalizeRosters(uid, rosterDocuments, user);
    const churchDocument = user.churchId
      ? await dependencies.getDocument<LegacyReadingChurch>(
        service.token,
        service.projectId,
        `churches/${user.churchId}`,
        { transaction },
      )
      : null;
    const authoritativeChurchName = user.churchId
      ? canonicalChurchName(user.churchId, churchDocument?.data || null)
      : null;
    const churchNameNeedsRepair = authoritativeChurchName !== null &&
      user.churchName !== authoritativeChurchName;

    if (ledgerDocument) {
      const result = validateReplay(ledgerDocument.data, input);
      await rollbackQuietly(dependencies, service, transaction);
      return { alreadyCompleted: true, committed: true, result };
    }

    const userNeedsNormalization = user.currentDay > 365;
    const rosterTargets = userNeedsNormalization
      ? rosters
      : rosters.filter((roster) => roster.needsRepair);
    if (
      !userNeedsNormalization && !churchNameNeedsRepair &&
      rosterTargets.length === 0
    ) {
      await rollbackQuietly(dependencies, service, transaction);
      return {
        alreadyCompleted: false,
        committed: false,
        result: {
          status: "alreadyNormalized",
          currentDay: user.currentDay,
          readCount: user.readCount,
        },
      };
    }

    const result: Extract<
      NormalizeLegacyReadingPositionResult,
      { status: "normalized" }
    > = userNeedsNormalization
      ? normalizedResult(user.currentDay, user.readCount)
      : {
        status: "normalized",
        currentDay: user.currentDay,
        readCount: user.readCount,
      };
    const now = dependencies.now();
    if (!(now instanceof Date) || !Number.isFinite(now.getTime())) {
      throw new PlatformError("INTERNAL");
    }
    const progressUpdate = {
      currentDay: result.currentDay,
      readCount: result.readCount,
    };
    const userUpdate = {
      ...(userNeedsNormalization ? progressUpdate : {}),
      ...(churchNameNeedsRepair ? { churchName: authoritativeChurchName } : {}),
    };
    const writes = [
      ...(userNeedsNormalization || churchNameNeedsRepair
        ? [
          dependencies.updateWrite(
            service.projectId,
            userPath,
            userUpdate,
            {
              updateMask: Object.keys(userUpdate),
              exists: true,
            },
          ),
        ]
        : []),
      ...rosterTargets.map(({ orgId }) =>
        dependencies.updateWrite(
          service.projectId,
          `churches/${orgId}/roster/${uid}`,
          progressUpdate,
          { updateMask: ["currentDay", "readCount"], exists: true },
        )
      ),
      dependencies.updateWrite(service.projectId, ledgerPath, {
        schemaVersion: ACTIVITY_LEDGER_SCHEMA_VERSION,
        action: NORMALIZE_LEGACY_READING_POSITION_ACTION,
        requestId: input.requestId,
        input: {},
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
    return { alreadyCompleted: false, committed: true, result };
  } catch (error) {
    await rollbackQuietly(dependencies, service, transaction);
    throw error;
  }
};

export const normalizeLegacyReadingPosition = async (
  service: ServiceAccess,
  identity: NormalizeLegacyReadingPositionIdentity,
  rawInput: NormalizeLegacyReadingPositionInput,
  overrides: Partial<NormalizeLegacyReadingPositionDependencies> = {},
): Promise<NormalizeLegacyReadingPositionResponse> => {
  const uid = canonicalIdentity(identity);
  const input = validateInput(rawInput);
  const dependencies = { ...DEFAULT_DEPENDENCIES, ...overrides };
  let lastError: unknown = null;
  for (let attempt = 0; attempt < MAX_TRANSACTION_ATTEMPTS; attempt += 1) {
    try {
      return await executeNormalization(service, uid, input, dependencies);
    } catch (error) {
      lastError = error;
      if (!isContention(error) || attempt + 1 >= MAX_TRANSACTION_ATTEMPTS) {
        throw error;
      }
    }
  }
  throw lastError;
};
