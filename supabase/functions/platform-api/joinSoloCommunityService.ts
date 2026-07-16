import { PlatformError } from "../_shared/errors.ts";
import {
  beginTransaction,
  commitWrites,
  getDocument,
  rollbackTransaction,
  runCollectionGroupQuery,
  updateWrite,
} from "../_shared/firestore.ts";
import {
  decideJoinSoloCommunity,
  JOIN_SOLO_COMMUNITY_ACTION,
  type JoinSoloCommunityDecision,
  type JoinSoloCommunityRoster,
  type JoinSoloCommunityUser,
  JoinSoloCommunityValidationError,
  normalizeSoloCommunityDocumentId,
  SOLO_COMMUNITY_ID,
} from "./joinSoloCommunityCore.ts";

const ACTIVITY_LEDGER_SCHEMA_VERSION = 1;
const MAX_TRANSACTION_ATTEMPTS = 3;
const REQUEST_ID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const FIRESTORE_TIMESTAMP_PATTERN =
  /^(\d{4})-(\d{2})-(\d{2})T([01]\d|2[0-3]):([0-5]\d):([0-5]\d)(?:\.\d{1,9})?Z$/;

type ServiceAccess = { token: string; projectId: string };
type UnknownRecord = Record<string, unknown>;

export type JoinSoloCommunityIdentity = {
  uid: string;
  anonymous: boolean;
};

export type JoinSoloCommunityInput = {
  requestId: string;
};

export type JoinSoloCommunityResult = {
  status:
    | "joined"
    | "rosterRepaired"
    | "primaryRepaired"
    | "alreadyJoined";
};

export type JoinSoloCommunityResponse = {
  alreadyCompleted: boolean;
  committed: boolean;
  result: JoinSoloCommunityResult;
};

type StoredJoinSoloCommunityLedger = {
  schemaVersion?: unknown;
  action?: unknown;
  requestId?: unknown;
  input?: unknown;
  result?: unknown;
  createdAt?: unknown;
};

export type JoinSoloCommunityDependencies = {
  beginTransaction: typeof beginTransaction;
  commitWrites: typeof commitWrites;
  getDocument: typeof getDocument;
  rollbackTransaction: typeof rollbackTransaction;
  runCollectionGroupQuery: typeof runCollectionGroupQuery;
  updateWrite: typeof updateWrite;
  now: () => Date;
};

const DEFAULT_DEPENDENCIES: JoinSoloCommunityDependencies = {
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

const conflict = (
  message = "혼자 읽기 모임 상태를 안전하게 확인할 수 없습니다.",
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

const canonicalIdentity = (identity: JoinSoloCommunityIdentity): string => {
  if (identity?.anonymous !== false) {
    throw new PlatformError("ANONYMOUS_NOT_ALLOWED");
  }
  const uid = normalizeSoloCommunityDocumentId(identity?.uid);
  if (!uid || uid !== identity.uid) throw new PlatformError("BAD_REQUEST");
  return uid;
};

const validateInput = (
  input: JoinSoloCommunityInput,
): JoinSoloCommunityInput => {
  if (
    !isRecord(input) || Object.keys(input).length !== 1 ||
    typeof input.requestId !== "string" ||
    !REQUEST_ID_PATTERN.test(input.requestId)
  ) throw new PlatformError("BAD_REQUEST");
  return { requestId: input.requestId };
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

const resultFromDecision = (
  decision: JoinSoloCommunityDecision,
): JoinSoloCommunityResult => ({ status: decision.status });

const validateStoredResult = (value: unknown): JoinSoloCommunityResult => {
  if (!isRecord(value)) {
    throw conflict("저장된 혼자 읽기 참여 결과가 올바르지 않습니다.");
  }
  requireExactKeys(value, ["status"], "혼자 읽기 참여 결과");
  if (
    value.status !== "joined" && value.status !== "rosterRepaired" &&
    value.status !== "primaryRepaired"
  ) throw conflict("저장된 혼자 읽기 참여 결과가 올바르지 않습니다.");
  return { status: value.status };
};

const validateReplay = (
  ledger: StoredJoinSoloCommunityLedger,
  input: JoinSoloCommunityInput,
  decision: JoinSoloCommunityDecision,
): JoinSoloCommunityResult => {
  if (!isRecord(ledger)) {
    throw conflict("혼자 읽기 참여 원장이 올바르지 않습니다.");
  }
  requireExactKeys(
    ledger,
    ["schemaVersion", "action", "requestId", "input", "result", "createdAt"],
    "혼자 읽기 참여 원장",
  );
  if (
    ledger.schemaVersion !== ACTIVITY_LEDGER_SCHEMA_VERSION ||
    ledger.action !== JOIN_SOLO_COMMUNITY_ACTION ||
    ledger.requestId !== input.requestId || !isRecord(ledger.input) ||
    !isFirestoreTimestamp(ledger.createdAt)
  ) throw conflict("같은 요청 번호가 다른 작업에 사용되었습니다.");
  requireExactKeys(ledger.input, [], "혼자 읽기 참여 원장 입력");
  const result = validateStoredResult(ledger.result);
  // 생성/primary 복구와 원장은 같은 transaction에 기록된다. replay 시점에
  // canonical target가 사라졌거나 primary가 다시 비어 있으면 과거 결과를
  // 현재 완료 상태로 오인하지 않는다.
  if (decision.status !== "alreadyJoined") {
    throw conflict("혼자 읽기 참여 완료 상태가 원장과 일치하지 않습니다.");
  }
  return result;
};

const mapValidationError = (error: unknown): never => {
  if (!(error instanceof JoinSoloCommunityValidationError)) throw error;
  if (error.code === "USER_UNAVAILABLE") {
    throw new PlatformError("FORBIDDEN", {
      message: "개인 성도 계정에서만 참여할 수 있습니다.",
    });
  }
  if (error.code === "ROSTER_LIMIT") {
    throw conflict("공동체는 최대 3개까지 추가할 수 있습니다.");
  }
  throw conflict();
};

const isContention = (error: unknown): boolean =>
  error instanceof PlatformError &&
  ["FIRESTORE_READ_FAILED", "FIRESTORE_WRITE_FAILED"].includes(error.code) &&
  error.details?.status === 409;

const rollbackQuietly = async (
  dependencies: JoinSoloCommunityDependencies,
  service: ServiceAccess,
  transaction: string,
) => {
  await dependencies.rollbackTransaction(
    service.token,
    service.projectId,
    transaction,
  ).catch(() => {});
};

const executeJoinSoloCommunity = async (
  service: ServiceAccess,
  uid: string,
  input: JoinSoloCommunityInput,
  dependencies: JoinSoloCommunityDependencies,
): Promise<JoinSoloCommunityResponse> => {
  const transaction = await dependencies.beginTransaction(
    service.token,
    service.projectId,
  );
  const userPath = `users/${uid}`;
  const targetPath = `churches/${SOLO_COMMUNITY_ID}/roster/${uid}`;
  const ledgerPath = `${userPath}/activityActions/${input.requestId}`;
  try {
    const [userDocument, ledgerDocument, targetDocument, rosterDocuments] =
      await Promise.all([
        dependencies.getDocument<JoinSoloCommunityUser>(
          service.token,
          service.projectId,
          userPath,
          { transaction },
        ),
        dependencies.getDocument<StoredJoinSoloCommunityLedger>(
          service.token,
          service.projectId,
          ledgerPath,
          { transaction },
        ),
        dependencies.getDocument<JoinSoloCommunityRoster>(
          service.token,
          service.projectId,
          targetPath,
          { transaction },
        ),
        dependencies.runCollectionGroupQuery<JoinSoloCommunityRoster>(
          service.token,
          service.projectId,
          "roster",
          "uid",
          uid,
          { limit: 4, transaction },
        ),
      ]);
    if (!userDocument) throw new PlatformError("NOT_FOUND");
    const decision = (() => {
      try {
        return decideJoinSoloCommunity({
          authenticatedUid: uid,
          user: userDocument.data,
          rosterDocuments,
          targetDocument,
        });
      } catch (error) {
        return mapValidationError(error);
      }
    })();

    if (ledgerDocument) {
      const result = validateReplay(ledgerDocument.data, input, decision);
      await rollbackQuietly(dependencies, service, transaction);
      return { alreadyCompleted: true, committed: true, result };
    }
    if (decision.status === "alreadyJoined") {
      await rollbackQuietly(dependencies, service, transaction);
      return {
        alreadyCompleted: false,
        committed: false,
        result: resultFromDecision(decision),
      };
    }

    const now = dependencies.now();
    if (!(now instanceof Date) || !Number.isFinite(now.getTime())) {
      throw new PlatformError("INTERNAL");
    }
    const result = resultFromDecision(decision);
    const writes = [
      ...(decision.writeRoster && decision.rosterSeed
        ? [
          dependencies.updateWrite(
            service.projectId,
            targetPath,
            { ...decision.rosterSeed, joinedAt: now, updatedAt: now },
            { exists: false },
          ),
        ]
        : []),
      ...(decision.writeRoster && decision.rosterPatch
        ? [
          dependencies.updateWrite(
            service.projectId,
            targetPath,
            { ...decision.rosterPatch, updatedAt: now },
            {
              updateMask: [...Object.keys(decision.rosterPatch), "updatedAt"],
              exists: true,
            },
          ),
        ]
        : []),
      ...(decision.writeUser
        ? [
          dependencies.updateWrite(
            service.projectId,
            userPath,
            { primaryOrgId: SOLO_COMMUNITY_ID, updatedAt: now },
            {
              updateMask: ["primaryOrgId", "updatedAt"],
              exists: true,
            },
          ),
        ]
        : []),
      dependencies.updateWrite(
        service.projectId,
        ledgerPath,
        {
          schemaVersion: ACTIVITY_LEDGER_SCHEMA_VERSION,
          action: JOIN_SOLO_COMMUNITY_ACTION,
          requestId: input.requestId,
          input: {},
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
    return { alreadyCompleted: false, committed: true, result };
  } catch (error) {
    await rollbackQuietly(dependencies, service, transaction);
    throw error;
  }
};

export const joinSoloCommunity = async (
  service: ServiceAccess,
  identity: JoinSoloCommunityIdentity,
  rawInput: JoinSoloCommunityInput,
  overrides: Partial<JoinSoloCommunityDependencies> = {},
): Promise<JoinSoloCommunityResponse> => {
  const uid = canonicalIdentity(identity);
  const input = validateInput(rawInput);
  const dependencies = { ...DEFAULT_DEPENDENCIES, ...overrides };
  let lastError: unknown = null;
  for (let attempt = 0; attempt < MAX_TRANSACTION_ATTEMPTS; attempt += 1) {
    try {
      return await executeJoinSoloCommunity(service, uid, input, dependencies);
    } catch (error) {
      lastError = error;
      if (!isContention(error) || attempt + 1 >= MAX_TRANSACTION_ATTEMPTS) {
        throw error;
      }
    }
  }
  throw lastError;
};
