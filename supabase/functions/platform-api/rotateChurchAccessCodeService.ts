import { PlatformError } from "../_shared/errors.ts";
import {
  beginTransaction,
  commitWrites,
  getDocument,
  rollbackTransaction,
  updateWrite,
} from "../_shared/firestore.ts";
import {
  decideRotateChurchAccessCode,
  inspectRotateChurchAccessCode,
  normalizeRotateChurchDocumentId,
  ROTATE_CHURCH_ACCESS_CODE_ACTION,
  type RotateChurchAccessCodeAccess,
  type RotateChurchAccessCodeActor,
  type RotateChurchAccessCodeAdminProof,
  type RotateChurchAccessCodeChurch,
  RotateChurchAccessCodeValidationError,
} from "./rotateChurchAccessCodeCore.ts";

const LEDGER_SCHEMA_VERSION = 1;
const MAX_TRANSACTION_ATTEMPTS = 3;
const REQUEST_ID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const HASH_PATTERN = /^[0-9a-f]{64}$/;
const MAX_ACCESS_VERSION = 999_999_999;
const TIMESTAMP_PATTERN =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?Z$/;

type ServiceAccess = { token: string; projectId: string };
type UnknownRecord = Record<string, unknown>;

export type RotateChurchAccessCodeIdentity = {
  uid: string;
  anonymous: boolean;
};

export type RotateChurchAccessCodeInput = {
  requestId: string;
  churchId: string;
  entryCode: string;
  expectedVersion: number;
};

export type RotateChurchAccessCodeResult = {
  status: "rotated";
  churchId: string;
  version: number;
};

export type RotateChurchAccessCodeResponse = {
  alreadyCompleted: boolean;
  committed: boolean;
  result: RotateChurchAccessCodeResult;
};

type StoredRotateChurchAccessCodeLedger = {
  schemaVersion?: unknown;
  action?: unknown;
  requestId?: unknown;
  actorUid?: unknown;
  input?: unknown;
  result?: unknown;
  createdAt?: unknown;
};

type HashText = (value: string) => Promise<string>;

export type RotateChurchAccessCodeDependencies = {
  beginTransaction: typeof beginTransaction;
  commitWrites: typeof commitWrites;
  getDocument: typeof getDocument;
  rollbackTransaction: typeof rollbackTransaction;
  updateWrite: typeof updateWrite;
  hashText: HashText;
  now: () => Date;
};

const sha256Hex: HashText = async (value) => {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(value),
  );
  return Array.from(
    new Uint8Array(digest),
    (byte) => byte.toString(16).padStart(2, "0"),
  ).join("");
};

const DEFAULT_DEPENDENCIES: RotateChurchAccessCodeDependencies = {
  beginTransaction,
  commitWrites,
  getDocument,
  rollbackTransaction,
  updateWrite,
  hashText: sha256Hex,
  now: () => new Date(),
};

const isRecord = (value: unknown): value is UnknownRecord =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value);

const conflict = (
  message = "공동체 입장코드 변경 상태를 안전하게 확인할 수 없습니다.",
) => new PlatformError("CONFLICT", { message });

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

const validTimestamp = (value: unknown): value is string => {
  if (
    typeof value !== "string" || value.length > 64 ||
    !TIMESTAMP_PATTERN.test(value)
  ) return false;
  const parsed = new Date(value);
  return Number.isFinite(parsed.getTime()) &&
    parsed.toISOString().slice(0, 19) === value.slice(0, 19);
};

const canonicalIdentity = (
  identity: RotateChurchAccessCodeIdentity,
): string => {
  if (identity?.anonymous !== false) {
    throw new PlatformError("ANONYMOUS_NOT_ALLOWED");
  }
  const uid = normalizeRotateChurchDocumentId(identity?.uid);
  if (!uid || uid !== identity.uid) throw new PlatformError("BAD_REQUEST");
  return uid;
};

const validateInput = (
  rawInput: RotateChurchAccessCodeInput,
): RotateChurchAccessCodeInput => {
  if (!isRecord(rawInput)) throw new PlatformError("BAD_REQUEST");
  const keys = Object.keys(rawInput).sort();
  const exact = ["churchId", "entryCode", "expectedVersion", "requestId"];
  const churchId = normalizeRotateChurchDocumentId(rawInput.churchId);
  const entryCode = typeof rawInput.entryCode === "string"
    ? rawInput.entryCode.trim()
    : "";
  if (
    keys.length !== exact.length ||
    keys.some((key, index) => key !== exact[index]) ||
    typeof rawInput.requestId !== "string" ||
    !REQUEST_ID_PATTERN.test(rawInput.requestId) || !churchId ||
    churchId !== rawInput.churchId || churchId === "unaffiliated_v1" ||
    entryCode.length < 4 || entryCode.length > 128 ||
    /[\u0000-\u001f\u007f]/.test(entryCode) ||
    !Number.isSafeInteger(rawInput.expectedVersion) ||
    rawInput.expectedVersion < 0 ||
    rawInput.expectedVersion >= MAX_ACCESS_VERSION
  ) {
    throw new PlatformError("BAD_REQUEST");
  }
  return {
    requestId: rawInput.requestId,
    churchId,
    entryCode,
    expectedVersion: rawInput.expectedVersion,
  };
};

const validateStoredLedger = (
  ledger: StoredRotateChurchAccessCodeLedger,
  uid: string,
  input: RotateChurchAccessCodeInput,
  inputFingerprint: string,
): RotateChurchAccessCodeResult => {
  if (!isRecord(ledger)) {
    throw conflict("입장코드 변경 원장이 올바르지 않습니다.");
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
    "입장코드 변경 원장",
  );
  if (
    ledger.schemaVersion !== LEDGER_SCHEMA_VERSION ||
    ledger.action !== ROTATE_CHURCH_ACCESS_CODE_ACTION ||
    ledger.requestId !== input.requestId || ledger.actorUid !== uid ||
    !isRecord(ledger.input) || !isRecord(ledger.result) ||
    !validTimestamp(ledger.createdAt)
  ) throw conflict("같은 요청 번호가 다른 작업에 사용되었습니다.");
  requireExactKeys(
    ledger.input,
    ["churchId", "expectedVersion", "fingerprint"],
    "입장코드 변경 원장 입력",
  );
  requireExactKeys(
    ledger.result,
    ["status", "churchId", "version"],
    "입장코드 변경 원장 결과",
  );
  if (
    ledger.input.churchId !== input.churchId ||
    ledger.input.expectedVersion !== input.expectedVersion ||
    ledger.input.fingerprint !== inputFingerprint ||
    ledger.result.status !== "rotated" ||
    ledger.result.churchId !== input.churchId ||
    ledger.result.version !== input.expectedVersion + 1
  ) throw conflict("같은 요청 번호가 다른 입력에 사용되었습니다.");
  return {
    status: "rotated",
    churchId: input.churchId,
    version: input.expectedVersion + 1,
  };
};

const exactAccessPostState = (
  access: RotateChurchAccessCodeAccess | null,
  codeHash: string,
  version: number,
) =>
  isRecord(access) &&
  Object.keys(access).sort().join(",") === "codeHash,updatedAt,version" &&
  access.codeHash === codeHash && access.version === version &&
  validTimestamp(access.updatedAt);

const hasLegacySecret = (church: RotateChurchAccessCodeChurch | null) =>
  isRecord(church) &&
  ["churchCode", "churchCodeHash", "code"].some((key) =>
    Object.prototype.hasOwnProperty.call(church, key)
  );

const mapValidationError = (error: unknown): never => {
  if (!(error instanceof RotateChurchAccessCodeValidationError)) throw error;
  if (
    error.code === "ACTOR_UNAVAILABLE" ||
    error.code === "ADMIN_PROOF_UNAVAILABLE"
  ) throw new PlatformError("FORBIDDEN");
  if (error.code === "CHURCH_UNAVAILABLE") {
    throw new PlatformError("NOT_FOUND", {
      message: "입장코드를 변경할 공동체를 찾을 수 없습니다.",
    });
  }
  if (error.code === "INVALID_IDENTITY") {
    throw new PlatformError("BAD_REQUEST");
  }
  if (error.code === "INVALID_HASH") throw new PlatformError("INTERNAL");
  if (error.code === "VERSION_CONFLICT") {
    throw conflict(
      "입장코드가 다른 화면에서 먼저 변경되었습니다. 새로고침해 주세요.",
    );
  }
  throw conflict();
};

const isContention = (error: unknown): boolean =>
  error instanceof PlatformError &&
  ["FIRESTORE_READ_FAILED", "FIRESTORE_WRITE_FAILED"].includes(error.code) &&
  error.details?.status === 409;

const rollbackQuietly = async (
  dependencies: RotateChurchAccessCodeDependencies,
  service: ServiceAccess,
  transaction: string,
) => {
  await dependencies.rollbackTransaction(
    service.token,
    service.projectId,
    transaction,
  ).catch(() => {});
};

const executeRotateChurchAccessCode = async (
  service: ServiceAccess,
  uid: string,
  input: RotateChurchAccessCodeInput,
  nextCodeHash: string,
  inputFingerprint: string,
  dependencies: RotateChurchAccessCodeDependencies,
): Promise<RotateChurchAccessCodeResponse> => {
  const transaction = await dependencies.beginTransaction(
    service.token,
    service.projectId,
  );
  const actorPath = `users/${uid}`;
  const churchPath = `churches/${input.churchId}`;
  const adminPath = `${churchPath}/private/admin`;
  const accessPath = `${churchPath}/private/access`;
  const ledgerPath = `${churchPath}/adminActions/${input.requestId}`;
  try {
    const [
      actorDocument,
      churchDocument,
      adminDocument,
      accessDocument,
      ledger,
    ] = await Promise.all([
      dependencies.getDocument<RotateChurchAccessCodeActor>(
        service.token,
        service.projectId,
        actorPath,
        { transaction },
      ),
      dependencies.getDocument<RotateChurchAccessCodeChurch>(
        service.token,
        service.projectId,
        churchPath,
        { transaction },
      ),
      dependencies.getDocument<RotateChurchAccessCodeAdminProof>(
        service.token,
        service.projectId,
        adminPath,
        { transaction },
      ),
      dependencies.getDocument<RotateChurchAccessCodeAccess>(
        service.token,
        service.projectId,
        accessPath,
        { transaction },
      ),
      dependencies.getDocument<StoredRotateChurchAccessCodeLedger>(
        service.token,
        service.projectId,
        ledgerPath,
        { transaction },
      ),
    ]);
    const inspection = (() => {
      try {
        return inspectRotateChurchAccessCode({
          authenticatedUid: uid,
          actor: actorDocument?.data || null,
          churchId: input.churchId,
          church: churchDocument?.data || null,
          privateAdmin: adminDocument?.data || null,
          access: accessDocument?.data || null,
        });
      } catch (error) {
        return mapValidationError(error);
      }
    })();
    if (ledger) {
      const result = validateStoredLedger(
        ledger.data,
        uid,
        input,
        inputFingerprint,
      );
      if (
        inspection.currentVersion !== result.version ||
        inspection.currentCodeHash !== nextCodeHash ||
        !exactAccessPostState(
          accessDocument?.data || null,
          nextCodeHash,
          result.version,
        ) ||
        hasLegacySecret(churchDocument?.data || null)
      ) throw conflict("입장코드 변경 원장과 현재 상태가 일치하지 않습니다.");
      await rollbackQuietly(dependencies, service, transaction);
      return { alreadyCompleted: true, committed: false, result };
    }
    const decision = (() => {
      try {
        return decideRotateChurchAccessCode({
          authenticatedUid: uid,
          actor: actorDocument?.data || null,
          churchId: input.churchId,
          church: churchDocument?.data || null,
          privateAdmin: adminDocument?.data || null,
          access: accessDocument?.data || null,
          expectedVersion: input.expectedVersion,
          nextCodeHash,
        });
      } catch (error) {
        return mapValidationError(error);
      }
    })();
    const now = dependencies.now();
    if (!(now instanceof Date) || !Number.isFinite(now.getTime())) {
      throw new PlatformError("INTERNAL");
    }
    const result: RotateChurchAccessCodeResult = {
      status: "rotated",
      churchId: input.churchId,
      version: decision.nextVersion,
    };
    await dependencies.commitWrites(
      service.token,
      service.projectId,
      [
        dependencies.updateWrite(service.projectId, accessPath, {
          codeHash: decision.nextCodeHash,
          version: decision.nextVersion,
          updatedAt: now,
        }, { exists: decision.accessExists }),
        dependencies.updateWrite(service.projectId, churchPath, {
          updatedAt: now,
        }, {
          updateMask: ["churchCode", "churchCodeHash", "code", "updatedAt"],
          exists: true,
        }),
        dependencies.updateWrite(service.projectId, ledgerPath, {
          schemaVersion: LEDGER_SCHEMA_VERSION,
          action: ROTATE_CHURCH_ACCESS_CODE_ACTION,
          requestId: input.requestId,
          actorUid: uid,
          input: {
            churchId: input.churchId,
            expectedVersion: input.expectedVersion,
            fingerprint: inputFingerprint,
          },
          result,
          createdAt: now,
        }, { exists: false }),
      ],
      { transaction },
    );
    return { alreadyCompleted: false, committed: true, result };
  } catch (error) {
    await rollbackQuietly(dependencies, service, transaction);
    throw error;
  }
};

export const rotateChurchAccessCode = async (
  service: ServiceAccess,
  identity: RotateChurchAccessCodeIdentity,
  rawInput: RotateChurchAccessCodeInput,
  overrides: Partial<RotateChurchAccessCodeDependencies> = {},
): Promise<RotateChurchAccessCodeResponse> => {
  const uid = canonicalIdentity(identity);
  const input = validateInput(rawInput);
  const dependencies = { ...DEFAULT_DEPENDENCIES, ...overrides };
  const nextCodeHash = await dependencies.hashText(input.entryCode);
  const inputFingerprint = await dependencies.hashText(
    `${ROTATE_CHURCH_ACCESS_CODE_ACTION}:v1\u0000${input.requestId}\u0000${input.churchId}\u0000${input.expectedVersion}\u0000${input.entryCode}`,
  );
  if (
    !HASH_PATTERN.test(nextCodeHash) || !HASH_PATTERN.test(inputFingerprint)
  ) {
    throw new PlatformError("INTERNAL");
  }
  let lastError: unknown = null;
  for (let attempt = 0; attempt < MAX_TRANSACTION_ATTEMPTS; attempt += 1) {
    try {
      return await executeRotateChurchAccessCode(
        service,
        uid,
        input,
        nextCodeHash,
        inputFingerprint,
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
