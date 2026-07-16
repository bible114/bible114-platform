import { PlatformError } from "../_shared/errors.ts";
import {
  beginTransaction,
  commitWrites,
  getDocument,
  rollbackTransaction,
  updateWrite,
} from "../_shared/firestore.ts";
import {
  ADMIN_SET_CHURCH_VISIBILITY_ACTION,
  type AdminChurchVisibilityActor,
  type AdminChurchVisibilityChurch,
  type AdminChurchVisibilityDecision,
  AdminChurchVisibilityValidationError,
  decideAdminChurchVisibility,
  normalizeAdminChurchDocumentId,
  UNAFFILIATED_CHURCH_ID,
} from "./adminChurchVisibilityCore.ts";

const LEDGER_SCHEMA_VERSION = 1;
const MAX_TRANSACTION_ATTEMPTS = 3;
const REQUEST_ID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const FIRESTORE_TIMESTAMP_PATTERN =
  /^(\d{4})-(\d{2})-(\d{2})T([01]\d|2[0-3]):([0-5]\d):([0-5]\d)(?:\.\d{1,9})?Z$/;

type ServiceAccess = { token: string; projectId: string };
type UnknownRecord = Record<string, unknown>;

export type AdminChurchVisibilityIdentity = {
  uid: string;
  anonymous: boolean;
};

export type AdminChurchVisibilityInput = {
  requestId: string;
  churchId: string;
  hidden: boolean;
};

export type AdminChurchVisibilityResult = {
  status: "updated" | "alreadySet";
  hidden: boolean;
};

type StoredAdminChurchVisibilityLedger = {
  schemaVersion?: unknown;
  action?: unknown;
  requestId?: unknown;
  actorUid?: unknown;
  input?: unknown;
  result?: unknown;
  createdAt?: unknown;
};

export type AdminChurchVisibilityDependencies = {
  beginTransaction: typeof beginTransaction;
  commitWrites: typeof commitWrites;
  getDocument: typeof getDocument;
  rollbackTransaction: typeof rollbackTransaction;
  updateWrite: typeof updateWrite;
  now: () => Date;
};

const DEFAULT_DEPENDENCIES: AdminChurchVisibilityDependencies = {
  beginTransaction,
  commitWrites,
  getDocument,
  rollbackTransaction,
  updateWrite,
  now: () => new Date(),
};

const isRecord = (value: unknown): value is UnknownRecord =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value);

const conflict = (
  message = "공동체 검색 노출 상태를 안전하게 확인할 수 없습니다.",
) => new PlatformError("CONFLICT", { message });

const requireExactKeys = (
  value: UnknownRecord,
  expected: readonly string[],
  label: string,
) => {
  const keys = Object.keys(value).sort();
  const exact = [...expected].sort();
  if (
    keys.length !== exact.length ||
    keys.some((key, index) => key !== exact[index])
  ) throw conflict(`저장된 ${label} 필드가 올바르지 않습니다.`);
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

const canonicalIdentity = (
  identity: AdminChurchVisibilityIdentity,
): string => {
  if (identity?.anonymous !== false) {
    throw new PlatformError("ANONYMOUS_NOT_ALLOWED");
  }
  const uid = normalizeAdminChurchDocumentId(identity?.uid);
  if (!uid || uid !== identity.uid) throw new PlatformError("BAD_REQUEST");
  return uid;
};

const validateInput = (
  rawInput: AdminChurchVisibilityInput,
): AdminChurchVisibilityInput => {
  if (!isRecord(rawInput)) throw new PlatformError("BAD_REQUEST");
  const inputKeys = Object.keys(rawInput).sort();
  const expectedKeys = ["churchId", "hidden", "requestId"];
  if (
    inputKeys.length !== expectedKeys.length ||
    inputKeys.some((key, index) => key !== expectedKeys[index])
  ) throw new PlatformError("BAD_REQUEST");
  const churchId = normalizeAdminChurchDocumentId(rawInput.churchId);
  if (
    typeof rawInput.requestId !== "string" ||
    !REQUEST_ID_PATTERN.test(rawInput.requestId) ||
    !churchId || churchId !== rawInput.churchId ||
    churchId === UNAFFILIATED_CHURCH_ID ||
    typeof rawInput.hidden !== "boolean"
  ) throw new PlatformError("BAD_REQUEST");
  return {
    requestId: rawInput.requestId,
    churchId,
    hidden: rawInput.hidden,
  };
};

const resultFromDecision = (
  decision: AdminChurchVisibilityDecision,
): AdminChurchVisibilityResult => ({
  status: decision.status,
  hidden: decision.hidden,
});

const validateStoredResult = (value: unknown): AdminChurchVisibilityResult => {
  if (!isRecord(value)) {
    throw conflict("저장된 공동체 검색 노출 결과가 올바르지 않습니다.");
  }
  requireExactKeys(value, ["status", "hidden"], "공동체 검색 노출 결과");
  if (value.status !== "updated" || typeof value.hidden !== "boolean") {
    throw conflict("저장된 공동체 검색 노출 결과가 올바르지 않습니다.");
  }
  return { status: "updated", hidden: value.hidden };
};

const validateReplay = (
  ledger: StoredAdminChurchVisibilityLedger,
  uid: string,
  input: AdminChurchVisibilityInput,
  decision: AdminChurchVisibilityDecision,
): AdminChurchVisibilityResult => {
  if (!isRecord(ledger)) {
    throw conflict("공동체 검색 노출 원장이 올바르지 않습니다.");
  }
  requireExactKeys(
    ledger,
    [
      "schemaVersion",
      "action",
      "requestId",
      "actorUid",
      "input",
      "result",
      "createdAt",
    ],
    "공동체 검색 노출 원장",
  );
  if (
    ledger.schemaVersion !== LEDGER_SCHEMA_VERSION ||
    ledger.action !== ADMIN_SET_CHURCH_VISIBILITY_ACTION ||
    ledger.requestId !== input.requestId || ledger.actorUid !== uid ||
    !isRecord(ledger.input) || !isFirestoreTimestamp(ledger.createdAt)
  ) throw conflict("같은 요청 번호가 다른 작업에 사용되었습니다.");
  requireExactKeys(ledger.input, ["churchId", "hidden"], "원장 입력");
  if (
    ledger.input.churchId !== input.churchId ||
    ledger.input.hidden !== input.hidden
  ) throw conflict("같은 요청 번호가 다른 입력에 사용되었습니다.");
  const result = validateStoredResult(ledger.result);
  if (
    result.hidden !== input.hidden || decision.status !== "alreadySet" ||
    decision.hidden !== input.hidden
  ) throw conflict("원장과 현재 공동체 검색 노출 상태가 일치하지 않습니다.");
  return result;
};

const mapValidationError = (error: unknown): never => {
  if (!(error instanceof AdminChurchVisibilityValidationError)) throw error;
  if (error.code === "INVALID_IDENTITY") {
    throw new PlatformError("BAD_REQUEST");
  }
  if (error.code === "ACTOR_UNAVAILABLE") {
    throw new PlatformError("FORBIDDEN");
  }
  if (error.code === "CHURCH_UNAVAILABLE") {
    throw new PlatformError("NOT_FOUND", {
      message: "변경할 공동체를 찾을 수 없습니다.",
    });
  }
  throw conflict();
};

const isContention = (error: unknown): boolean =>
  error instanceof PlatformError &&
  ["FIRESTORE_READ_FAILED", "FIRESTORE_WRITE_FAILED"].includes(error.code) &&
  error.details?.status === 409;

const rollbackQuietly = async (
  dependencies: AdminChurchVisibilityDependencies,
  service: ServiceAccess,
  transaction: string,
) => {
  await dependencies.rollbackTransaction(
    service.token,
    service.projectId,
    transaction,
  ).catch(() => {});
};

const executeAdminSetChurchVisibility = async (
  service: ServiceAccess,
  uid: string,
  input: AdminChurchVisibilityInput,
  dependencies: AdminChurchVisibilityDependencies,
): Promise<AdminChurchVisibilityResult> => {
  const transaction = await dependencies.beginTransaction(
    service.token,
    service.projectId,
  );
  const actorPath = `users/${uid}`;
  const churchPath = `churches/${input.churchId}`;
  const legacyDirectoryPath = "settings/churchDirectory";
  const publicChurchPath = `publicChurches/${input.churchId}`;
  const ledgerPath = `platformAdminActions/${input.requestId}`;
  try {
    const [
      actorDocument,
      churchDocument,
      legacyDirectoryDocument,
      publicChurchDocument,
      ledgerDocument,
    ] = await Promise.all([
      dependencies.getDocument<AdminChurchVisibilityActor>(
        service.token,
        service.projectId,
        actorPath,
        { transaction },
      ),
      dependencies.getDocument<AdminChurchVisibilityChurch>(
        service.token,
        service.projectId,
        churchPath,
        { transaction },
      ),
      dependencies.getDocument<UnknownRecord>(
        service.token,
        service.projectId,
        legacyDirectoryPath,
        { transaction },
      ),
      dependencies.getDocument<UnknownRecord>(
        service.token,
        service.projectId,
        publicChurchPath,
        { transaction },
      ),
      dependencies.getDocument<StoredAdminChurchVisibilityLedger>(
        service.token,
        service.projectId,
        ledgerPath,
        { transaction },
      ),
    ]);
    const decision = (() => {
      try {
        return decideAdminChurchVisibility({
          authenticatedUid: uid,
          actor: actorDocument?.data || null,
          churchId: input.churchId,
          church: churchDocument?.data || null,
          legacyDirectory: legacyDirectoryDocument?.data || null,
          publicChurch: publicChurchDocument?.data || null,
          hidden: input.hidden,
        });
      } catch (error) {
        return mapValidationError(error);
      }
    })();

    if (ledgerDocument) {
      const result = validateReplay(ledgerDocument.data, uid, input, decision);
      await rollbackQuietly(dependencies, service, transaction);
      return result;
    }
    // Canonical no-op requests deliberately do not consume a UUID. A later
    // real state change may therefore use the same UUID and create the ledger.
    if (decision.status === "alreadySet") {
      await rollbackQuietly(dependencies, service, transaction);
      return resultFromDecision(decision);
    }

    const now = dependencies.now();
    if (!(now instanceof Date) || !Number.isFinite(now.getTime())) {
      throw new PlatformError("INTERNAL");
    }
    const result: AdminChurchVisibilityResult = {
      status: "updated",
      hidden: decision.hidden,
    };
    const writes = [
      dependencies.updateWrite(
        service.projectId,
        churchPath,
        { hiddenFromDirectory: decision.hidden, updatedAt: now },
        {
          updateMask: ["hiddenFromDirectory", "updatedAt"],
          exists: true,
        },
      ),
      // Full replacement is intentional: every legacy entry has already been
      // strictly validated and reduced to {id,name,hidden?}. This both strips
      // old secret fields and invalidates a stale rebuild's updateTime fence.
      dependencies.updateWrite(
        service.projectId,
        legacyDirectoryPath,
        { churches: decision.legacyChurches, updatedAt: now },
        { exists: true },
      ),
      // Missing public projections are drift. Create them with exists:false;
      // existing projections use exists:true so either direction races safely
      // through the transaction retry path instead of overwriting blindly.
      dependencies.updateWrite(
        service.projectId,
        publicChurchPath,
        decision.projection,
        { exists: decision.publicExists },
      ),
      dependencies.updateWrite(
        service.projectId,
        ledgerPath,
        {
          schemaVersion: LEDGER_SCHEMA_VERSION,
          action: ADMIN_SET_CHURCH_VISIBILITY_ACTION,
          requestId: input.requestId,
          actorUid: uid,
          input: { churchId: input.churchId, hidden: input.hidden },
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
    return result;
  } catch (error) {
    await rollbackQuietly(dependencies, service, transaction);
    throw error;
  }
};

export const adminSetChurchVisibility = async (
  service: ServiceAccess,
  identity: AdminChurchVisibilityIdentity,
  rawInput: AdminChurchVisibilityInput,
  overrides: Partial<AdminChurchVisibilityDependencies> = {},
): Promise<AdminChurchVisibilityResult> => {
  const uid = canonicalIdentity(identity);
  const input = validateInput(rawInput);
  const dependencies = { ...DEFAULT_DEPENDENCIES, ...overrides };
  let lastError: unknown = null;
  for (let attempt = 0; attempt < MAX_TRANSACTION_ATTEMPTS; attempt += 1) {
    try {
      return await executeAdminSetChurchVisibility(
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
