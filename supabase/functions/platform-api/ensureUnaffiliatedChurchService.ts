import { PlatformError } from "../_shared/errors.ts";
import {
  beginTransaction,
  commitWrites,
  deleteWrite,
  getDocument,
  rollbackTransaction,
  updateWrite,
} from "../_shared/firestore.ts";
import {
  decideEnsureUnaffiliatedChurch,
  ENSURE_UNAFFILIATED_CHURCH_ACTION,
  type EnsureUnaffiliatedChurchActor,
  EnsureUnaffiliatedChurchValidationError,
  isCanonicalUnaffiliatedChurch,
  isEnsureUnaffiliatedTimestamp,
  normalizeEnsureUnaffiliatedDocumentId,
  UNAFFILIATED_CHURCH_ID,
  UNAFFILIATED_CHURCH_NAME,
} from "./ensureUnaffiliatedChurchCore.ts";

const LEDGER_SCHEMA_VERSION = 1;
const MAX_TRANSACTION_ATTEMPTS = 3;
const PUBLIC_META_PATH = "publicDirectoryMeta/current";
const PUBLIC_REBUILD_LOCK_PATH = "platformInternal/publicDirectoryRebuild";
const REQUEST_ID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type ServiceAccess = { token: string; projectId: string };
type UnknownRecord = Record<string, unknown>;

export type EnsureUnaffiliatedChurchIdentity = {
  uid: string;
  anonymous: boolean;
};

export type EnsureUnaffiliatedChurchInput = { requestId: string };

export type EnsureUnaffiliatedChurchResult = {
  status: "ensured";
  churchId: typeof UNAFFILIATED_CHURCH_ID;
};

export type EnsureUnaffiliatedChurchResponse = {
  alreadyCompleted: boolean;
  committed: boolean;
  result: EnsureUnaffiliatedChurchResult;
};

type StoredEnsureUnaffiliatedChurchLedger = {
  schemaVersion?: unknown;
  action?: unknown;
  requestId?: unknown;
  actorUid?: unknown;
  input?: unknown;
  result?: unknown;
  createdAt?: unknown;
};

export type EnsureUnaffiliatedChurchDependencies = {
  beginTransaction: typeof beginTransaction;
  commitWrites: typeof commitWrites;
  deleteWrite: typeof deleteWrite;
  getDocument: typeof getDocument;
  rollbackTransaction: typeof rollbackTransaction;
  updateWrite: typeof updateWrite;
  now: () => Date;
};

const DEFAULT_DEPENDENCIES: EnsureUnaffiliatedChurchDependencies = {
  beginTransaction,
  commitWrites,
  deleteWrite,
  getDocument,
  rollbackTransaction,
  updateWrite,
  now: () => new Date(),
};

const isRecord = (value: unknown): value is UnknownRecord =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value);

const conflict = (
  message = "무소속 공동체 상태를 안전하게 확인할 수 없습니다.",
) => new PlatformError("CONFLICT", { message });

const retryableConflict = (message: string) =>
  new PlatformError("CONFLICT", { message, retryable: true });

const requireExactKeys = (
  value: UnknownRecord,
  expected: readonly string[],
  field: string,
) => {
  const keys = Object.keys(value).sort();
  const exact = [...expected].sort();
  if (
    keys.length !== exact.length ||
    keys.some((key, index) => key !== exact[index])
  ) throw conflict(`저장된 ${field} 필드가 올바르지 않습니다.`);
};

const canonicalIdentity = (
  identity: EnsureUnaffiliatedChurchIdentity,
): string => {
  if (identity?.anonymous !== false) {
    throw new PlatformError("ANONYMOUS_NOT_ALLOWED");
  }
  const uid = normalizeEnsureUnaffiliatedDocumentId(identity?.uid);
  if (!uid || uid !== identity.uid) throw new PlatformError("BAD_REQUEST");
  return uid;
};

const validateInput = (
  input: EnsureUnaffiliatedChurchInput,
): EnsureUnaffiliatedChurchInput => {
  if (
    !isRecord(input) || Object.keys(input).length !== 1 ||
    typeof input.requestId !== "string" ||
    !REQUEST_ID_PATTERN.test(input.requestId)
  ) throw new PlatformError("BAD_REQUEST");
  return { requestId: input.requestId };
};

const validateStoredLedger = (
  ledger: StoredEnsureUnaffiliatedChurchLedger,
  uid: string,
  input: EnsureUnaffiliatedChurchInput,
): EnsureUnaffiliatedChurchResult => {
  if (!isRecord(ledger)) {
    throw conflict("무소속 공동체 원장이 올바르지 않습니다.");
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
    "무소속 공동체 원장",
  );
  if (
    ledger.schemaVersion !== LEDGER_SCHEMA_VERSION ||
    ledger.action !== ENSURE_UNAFFILIATED_CHURCH_ACTION ||
    ledger.requestId !== input.requestId || ledger.actorUid !== uid ||
    !isRecord(ledger.input) || !isRecord(ledger.result) ||
    !isEnsureUnaffiliatedTimestamp(ledger.createdAt)
  ) throw conflict("같은 요청 번호가 다른 작업에 사용되었습니다.");
  requireExactKeys(ledger.input, [], "무소속 공동체 원장 입력");
  requireExactKeys(
    ledger.result,
    ["status", "churchId"],
    "무소속 공동체 원장 결과",
  );
  if (
    ledger.result.status !== "ensured" ||
    ledger.result.churchId !== UNAFFILIATED_CHURCH_ID
  ) throw conflict("무소속 공동체 원장 결과가 올바르지 않습니다.");
  return { status: "ensured", churchId: UNAFFILIATED_CHURCH_ID };
};

const mapValidationError = (error: unknown): never => {
  if (!(error instanceof EnsureUnaffiliatedChurchValidationError)) throw error;
  if (error.code === "ACTOR_UNAVAILABLE") {
    throw new PlatformError("FORBIDDEN");
  }
  if (error.code === "INVALID_IDENTITY") {
    throw new PlatformError("BAD_REQUEST");
  }
  throw conflict();
};

const isContention = (error: unknown): boolean =>
  error instanceof PlatformError &&
  ["FIRESTORE_READ_FAILED", "FIRESTORE_WRITE_FAILED"].includes(error.code) &&
  error.details?.status === 409;

const rollbackQuietly = async (
  dependencies: EnsureUnaffiliatedChurchDependencies,
  service: ServiceAccess,
  transaction: string,
) => {
  await dependencies.rollbackTransaction(
    service.token,
    service.projectId,
    transaction,
  ).catch(() => {});
};

const executeEnsureUnaffiliatedChurch = async (
  service: ServiceAccess,
  uid: string,
  input: EnsureUnaffiliatedChurchInput,
  dependencies: EnsureUnaffiliatedChurchDependencies,
): Promise<EnsureUnaffiliatedChurchResponse> => {
  const transaction = await dependencies.beginTransaction(
    service.token,
    service.projectId,
  );
  const actorPath = `users/${uid}`;
  const churchPath = `churches/${UNAFFILIATED_CHURCH_ID}`;
  const legacyPath = "settings/churchDirectory";
  const publicPath = `publicChurches/${UNAFFILIATED_CHURCH_ID}`;
  const ledgerPath = `platformAdminActions/${input.requestId}`;
  try {
    const [
      actorDocument,
      churchDocument,
      legacyDocument,
      publicDocument,
      publicMetaDocument,
      rebuildLockDocument,
      ledger,
    ] = await Promise.all([
      dependencies.getDocument<EnsureUnaffiliatedChurchActor>(
        service.token,
        service.projectId,
        actorPath,
        { transaction },
      ),
      dependencies.getDocument<UnknownRecord>(
        service.token,
        service.projectId,
        churchPath,
        { transaction },
      ),
      dependencies.getDocument<UnknownRecord>(
        service.token,
        service.projectId,
        legacyPath,
        { transaction },
      ),
      dependencies.getDocument<UnknownRecord>(
        service.token,
        service.projectId,
        publicPath,
        { transaction },
      ),
      dependencies.getDocument<UnknownRecord>(
        service.token,
        service.projectId,
        PUBLIC_META_PATH,
        { transaction },
      ),
      dependencies.getDocument<UnknownRecord>(
        service.token,
        service.projectId,
        PUBLIC_REBUILD_LOCK_PATH,
        { transaction },
      ),
      dependencies.getDocument<StoredEnsureUnaffiliatedChurchLedger>(
        service.token,
        service.projectId,
        ledgerPath,
        { transaction },
      ),
    ]);
    if (rebuildLockDocument) {
      throw retryableConflict(
        "공개 공동체 디렉터리를 정리하고 있습니다. 잠시 후 다시 시도해 주세요.",
      );
    }
    const decision = (() => {
      try {
        return decideEnsureUnaffiliatedChurch({
          authenticatedUid: uid,
          actor: actorDocument?.data || null,
          church: churchDocument?.data || null,
          legacyDirectory: legacyDocument?.data || null,
          publicExists: Boolean(publicDocument),
          publicDirectoryMeta: publicMetaDocument?.data || null,
        });
      } catch (error) {
        return mapValidationError(error);
      }
    })();
    if (ledger) {
      const result = validateStoredLedger(ledger.data, uid, input);
      if (
        decision.churchNeedsWrite || decision.legacyNeedsWrite ||
        decision.publicExists ||
        !isCanonicalUnaffiliatedChurch(churchDocument?.data || null)
      ) throw conflict("무소속 공동체 원장과 현재 상태가 일치하지 않습니다.");
      await rollbackQuietly(dependencies, service, transaction);
      return { alreadyCompleted: true, committed: false, result };
    }
    const now = dependencies.now();
    if (!(now instanceof Date) || !Number.isFinite(now.getTime())) {
      throw new PlatformError("INTERNAL");
    }
    const result: EnsureUnaffiliatedChurchResult = {
      status: "ensured",
      churchId: UNAFFILIATED_CHURCH_ID,
    };
    const writes = [];
    if (decision.churchNeedsWrite) {
      writes.push(dependencies.updateWrite(service.projectId, churchPath, {
        name: UNAFFILIATED_CHURCH_NAME,
        pastorName: "",
        denomination: "",
        isVirtual: true,
        departments: [{
          id: "personal",
          name: "개인 성도",
          color: "bg-emerald-500",
          subgroups: ["성경읽기 동행"],
        }],
        createdAt: decision.preservedCreatedAt || now,
        updatedAt: now,
      }, { exists: decision.churchExists }));
    }
    if (decision.legacyNeedsWrite) {
      writes.push(dependencies.updateWrite(service.projectId, legacyPath, {
        churches: decision.legacyChurches,
        updatedAt: now,
      }, {
        exists: true,
      }));
    }
    if (decision.publicExists) {
      writes.push(
        dependencies.deleteWrite(service.projectId, publicPath, true),
      );
    }
    if (decision.publicMetaNeedsFallback) {
      writes.push(
        dependencies.updateWrite(service.projectId, PUBLIC_META_PATH, {
          ready: false,
          mode: "legacy",
          schemaVersion: 1,
          updatedAt: now,
        }, {
          updateMask: ["ready", "mode", "schemaVersion", "updatedAt"],
          exists: true,
        }),
      );
    }
    writes.push(dependencies.updateWrite(service.projectId, ledgerPath, {
      schemaVersion: LEDGER_SCHEMA_VERSION,
      action: ENSURE_UNAFFILIATED_CHURCH_ACTION,
      requestId: input.requestId,
      actorUid: uid,
      input: {},
      result,
      createdAt: now,
    }, { exists: false }));
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

export const ensureUnaffiliatedChurch = async (
  service: ServiceAccess,
  identity: EnsureUnaffiliatedChurchIdentity,
  rawInput: EnsureUnaffiliatedChurchInput,
  overrides: Partial<EnsureUnaffiliatedChurchDependencies> = {},
): Promise<EnsureUnaffiliatedChurchResponse> => {
  const uid = canonicalIdentity(identity);
  const input = validateInput(rawInput);
  const dependencies = { ...DEFAULT_DEPENDENCIES, ...overrides };
  let lastError: unknown = null;
  for (let attempt = 0; attempt < MAX_TRANSACTION_ATTEMPTS; attempt += 1) {
    try {
      return await executeEnsureUnaffiliatedChurch(
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
