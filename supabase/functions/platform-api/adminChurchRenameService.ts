import { PlatformError } from "../_shared/errors.ts";
import {
  beginTransaction,
  commitWrites,
  getDocument,
  rollbackTransaction,
  updateWrite,
} from "../_shared/firestore.ts";
import {
  normalizeAdminChurchDocumentId,
  UNAFFILIATED_CHURCH_ID,
} from "./adminChurchVisibilityCore.ts";

export const ADMIN_RENAME_CHURCH_ACTION = "adminRenameChurch" as const;

const LEDGER_SCHEMA_VERSION = 1;
const MAX_TRANSACTION_ATTEMPTS = 3;
const REQUEST_ID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const FIRESTORE_TIMESTAMP_PATTERN =
  /^(\d{4})-(\d{2})-(\d{2})T([01]\d|2[0-3]):([0-5]\d):([0-5]\d)(?:\.\d{1,9})?Z$/;

type ServiceAccess = { token: string; projectId: string };
type UnknownRecord = Record<string, unknown>;

type RenameActor = {
  uid?: unknown;
  role?: unknown;
  isDeleted?: unknown;
};

type RenameChurch = {
  name?: unknown;
  isDeleted?: unknown;
  hiddenFromDirectory?: unknown;
};

type DirectoryProjection = {
  id: string;
  name: string;
  hidden?: true;
};

type StoredRenameLedger = {
  schemaVersion?: unknown;
  action?: unknown;
  requestId?: unknown;
  actorUid?: unknown;
  input?: unknown;
  result?: unknown;
  createdAt?: unknown;
};

export type AdminChurchRenameIdentity = {
  uid: string;
  anonymous: boolean;
};

export type AdminChurchRenameInput = {
  requestId: string;
  churchId: string;
  name: string;
};

export type AdminChurchRenameResult = {
  status: "renamed" | "alreadyNamed";
  churchId: string;
  previousName: string;
  name: string;
};

export type AdminChurchRenameDependencies = {
  beginTransaction: typeof beginTransaction;
  commitWrites: typeof commitWrites;
  getDocument: typeof getDocument;
  rollbackTransaction: typeof rollbackTransaction;
  updateWrite: typeof updateWrite;
  now: () => Date;
};

const DEFAULT_DEPENDENCIES: AdminChurchRenameDependencies = {
  beginTransaction,
  commitWrites,
  getDocument,
  rollbackTransaction,
  updateWrite,
  now: () => new Date(),
};

const LEGACY_ENTRY_KEYS = new Set([
  "id",
  "name",
  "hidden",
  "codeHash",
  "churchCodeHash",
  "churchCode",
  "code",
]);
const MINIMAL_ENTRY_KEYS = new Set(["id", "name", "hidden"]);
const LEGACY_DOCUMENT_KEYS = new Set(["churches", "updatedAt"]);

const isRecord = (value: unknown): value is UnknownRecord =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value);

const hasControlCharacters = (value: string): boolean =>
  /[\u0000-\u001f\u007f]/.test(value);

const canonicalName = (value: unknown): value is string =>
  typeof value === "string" && value === value.trim() &&
  value.length >= 1 && value.length <= 200 &&
  !hasControlCharacters(value);

const conflict = (
  message = "공동체 이름을 안전하게 변경할 수 없습니다.",
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

const exactProjectionEqual = (
  value: unknown,
  expected: DirectoryProjection,
): boolean => {
  if (!isRecord(value)) return false;
  const expectedKeys = expected.hidden === true
    ? ["id", "name", "hidden"]
    : ["id", "name"];
  const keys = Object.keys(value);
  return keys.length === expectedKeys.length &&
    keys.every((key) => expectedKeys.includes(key)) &&
    value.id === expected.id && value.name === expected.name &&
    (expected.hidden === true ? value.hidden === true : !("hidden" in value));
};

const exactProjectionListEqual = (
  value: unknown,
  expected: DirectoryProjection[],
): boolean =>
  Array.isArray(value) && value.length === expected.length &&
  value.every((entry, index) => exactProjectionEqual(entry, expected[index]));

const sanitizeLegacyDirectory = (
  value: unknown,
): { churches: DirectoryProjection[]; wasMinimal: boolean } => {
  if (!isRecord(value)) throw conflict("공개 공동체 목록이 올바르지 않습니다.");
  const documentKeys = Object.keys(value);
  if (
    documentKeys.some((key) => !LEGACY_DOCUMENT_KEYS.has(key)) ||
    !Object.prototype.hasOwnProperty.call(value, "churches") ||
    !Array.isArray(value.churches) ||
    (Object.prototype.hasOwnProperty.call(value, "updatedAt") &&
      !isFirestoreTimestamp(value.updatedAt))
  ) throw conflict("공개 공동체 목록이 올바르지 않습니다.");

  const seen = new Set<string>();
  let wasMinimal = Object.prototype.hasOwnProperty.call(value, "updatedAt");
  const churches = value.churches.map((entry) => {
    if (!isRecord(entry)) {
      throw conflict("공개 공동체 항목이 올바르지 않습니다.");
    }
    const keys = Object.keys(entry);
    if (
      keys.some((key) => !LEGACY_ENTRY_KEYS.has(key)) ||
      !keys.includes("id") || !keys.includes("name")
    ) throw conflict("공개 공동체 항목이 올바르지 않습니다.");
    if (keys.some((key) => !MINIMAL_ENTRY_KEYS.has(key))) wasMinimal = false;
    const id = normalizeAdminChurchDocumentId(entry.id);
    if (
      !id || id !== entry.id || id === UNAFFILIATED_CHURCH_ID ||
      seen.has(id) || !canonicalName(entry.name) ||
      (Object.prototype.hasOwnProperty.call(entry, "hidden") &&
        typeof entry.hidden !== "boolean")
    ) throw conflict("공개 공동체 항목이 올바르지 않습니다.");
    seen.add(id);
    const projection: DirectoryProjection = {
      id,
      name: entry.name,
      ...(entry.hidden === true ? { hidden: true } : {}),
    };
    if (!exactProjectionEqual(entry, projection)) wasMinimal = false;
    return projection;
  });
  return { churches, wasMinimal };
};

const canonicalIdentity = (identity: AdminChurchRenameIdentity): string => {
  if (identity?.anonymous !== false) {
    throw new PlatformError("ANONYMOUS_NOT_ALLOWED");
  }
  const uid = normalizeAdminChurchDocumentId(identity?.uid);
  if (!uid || uid !== identity.uid) throw new PlatformError("BAD_REQUEST");
  return uid;
};

const validateInput = (rawInput: AdminChurchRenameInput) => {
  if (!isRecord(rawInput)) throw new PlatformError("BAD_REQUEST");
  const keys = Object.keys(rawInput).sort();
  const expectedKeys = ["churchId", "name", "requestId"];
  if (
    keys.length !== expectedKeys.length ||
    keys.some((key, index) => key !== expectedKeys[index])
  ) throw new PlatformError("BAD_REQUEST");
  const churchId = normalizeAdminChurchDocumentId(rawInput.churchId);
  if (
    typeof rawInput.requestId !== "string" ||
    !REQUEST_ID_PATTERN.test(rawInput.requestId) ||
    !churchId || churchId !== rawInput.churchId ||
    churchId === UNAFFILIATED_CHURCH_ID || !canonicalName(rawInput.name)
  ) throw new PlatformError("BAD_REQUEST");
  return { requestId: rawInput.requestId, churchId, name: rawInput.name };
};

const validateActor = (uid: string, actor: RenameActor | null) => {
  if (!isRecord(actor)) throw new PlatformError("FORBIDDEN");
  if (actor.uid !== undefined && actor.uid !== null && actor.uid !== uid) {
    throw conflict("관리자 식별자가 현재 로그인과 일치하지 않습니다.");
  }
  if (
    actor.role !== "platformAdmin" && actor.role !== "superAdmin"
  ) throw new PlatformError("FORBIDDEN");
  if (actor.isDeleted === true) throw new PlatformError("FORBIDDEN");
  if (actor.isDeleted !== undefined && actor.isDeleted !== false) {
    throw conflict("관리자 삭제 상태가 올바르지 않습니다.");
  }
};

const validateChurch = (church: RenameChurch | null) => {
  if (!isRecord(church) || church.isDeleted === true) {
    throw new PlatformError("NOT_FOUND", {
      message: "이름을 변경할 공동체를 찾을 수 없습니다.",
    });
  }
  if (
    church.isDeleted !== undefined && church.isDeleted !== false ||
    !canonicalName(church.name) ||
    (church.hiddenFromDirectory !== undefined &&
      typeof church.hiddenFromDirectory !== "boolean")
  ) throw conflict("공동체 원본이 올바르지 않습니다.");
  return {
    name: church.name,
    hidden: church.hiddenFromDirectory === true,
  };
};

export const decideAdminChurchRename = (input: {
  authenticatedUid: string;
  actor: RenameActor | null;
  churchId: string;
  church: RenameChurch | null;
  legacyDirectory: unknown;
  publicChurch: unknown | null;
  name: string;
}) => {
  validateActor(input.authenticatedUid, input.actor);
  const church = validateChurch(input.church);
  const directory = sanitizeLegacyDirectory(input.legacyDirectory);
  const projection: DirectoryProjection = {
    id: input.churchId,
    name: input.name,
    ...(church.hidden ? { hidden: true } : {}),
  };
  const targetIndex = directory.churches.findIndex((entry) =>
    entry.id === input.churchId
  );
  const legacyChurches = [...directory.churches];
  if (targetIndex < 0) legacyChurches.push(projection);
  else legacyChurches[targetIndex] = projection;
  const legacyAlreadyExact = directory.wasMinimal && exactProjectionListEqual(
    (input.legacyDirectory as UnknownRecord).churches,
    legacyChurches,
  );
  const publicExists = input.publicChurch !== null;
  const publicAlreadyExact = publicExists &&
    exactProjectionEqual(input.publicChurch, projection);
  const alreadyNamed = church.name === input.name && legacyAlreadyExact &&
    publicAlreadyExact;
  return {
    status: alreadyNamed ? "alreadyNamed" as const : "renamed" as const,
    churchId: input.churchId,
    previousName: church.name,
    name: input.name,
    projection,
    legacyChurches,
    publicExists,
  };
};

const validateStoredResult = (value: unknown): AdminChurchRenameResult => {
  if (!isRecord(value)) {
    throw conflict("저장된 이름 변경 결과가 올바르지 않습니다.");
  }
  requireExactKeys(
    value,
    ["status", "churchId", "previousName", "name"],
    "이름 변경 결과",
  );
  if (
    value.status !== "renamed" ||
    !normalizeAdminChurchDocumentId(value.churchId) ||
    !canonicalName(value.previousName) || !canonicalName(value.name)
  ) throw conflict("저장된 이름 변경 결과가 올바르지 않습니다.");
  return value as AdminChurchRenameResult;
};

const validateReplay = (
  ledger: StoredRenameLedger,
  uid: string,
  input: AdminChurchRenameInput,
  decision: ReturnType<typeof decideAdminChurchRename>,
): AdminChurchRenameResult => {
  if (!isRecord(ledger)) throw conflict("이름 변경 원장이 올바르지 않습니다.");
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
    "이름 변경 원장",
  );
  if (
    ledger.schemaVersion !== LEDGER_SCHEMA_VERSION ||
    ledger.action !== ADMIN_RENAME_CHURCH_ACTION ||
    ledger.requestId !== input.requestId || ledger.actorUid !== uid ||
    !isRecord(ledger.input) || !isFirestoreTimestamp(ledger.createdAt)
  ) throw conflict("같은 요청 번호가 다른 작업에 사용되었습니다.");
  requireExactKeys(ledger.input, ["churchId", "name"], "원장 입력");
  if (
    ledger.input.churchId !== input.churchId ||
    ledger.input.name !== input.name
  ) throw conflict("같은 요청 번호가 다른 입력에 사용되었습니다.");
  const result = validateStoredResult(ledger.result);
  if (
    result.churchId !== input.churchId || result.name !== input.name ||
    decision.status !== "alreadyNamed" || decision.name !== input.name
  ) throw conflict("원장과 현재 공동체 이름이 일치하지 않습니다.");
  return result;
};

const isContention = (error: unknown): boolean =>
  error instanceof PlatformError &&
  ["FIRESTORE_READ_FAILED", "FIRESTORE_WRITE_FAILED"].includes(error.code) &&
  error.details?.status === 409;

const rollbackQuietly = async (
  dependencies: AdminChurchRenameDependencies,
  service: ServiceAccess,
  transaction: string,
) => {
  await dependencies.rollbackTransaction(
    service.token,
    service.projectId,
    transaction,
  ).catch(() => {});
};

const executeRename = async (
  service: ServiceAccess,
  uid: string,
  input: AdminChurchRenameInput,
  dependencies: AdminChurchRenameDependencies,
): Promise<AdminChurchRenameResult> => {
  const transaction = await dependencies.beginTransaction(
    service.token,
    service.projectId,
  );
  const actorPath = `users/${uid}`;
  const churchPath = `churches/${input.churchId}`;
  const legacyPath = "settings/churchDirectory";
  const publicPath = `publicChurches/${input.churchId}`;
  const ledgerPath = `platformAdminActions/${input.requestId}`;
  try {
    const [actor, church, legacy, publicChurch, ledger] = await Promise.all([
      dependencies.getDocument<RenameActor>(
        service.token,
        service.projectId,
        actorPath,
        { transaction },
      ),
      dependencies.getDocument<RenameChurch>(
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
      dependencies.getDocument<StoredRenameLedger>(
        service.token,
        service.projectId,
        ledgerPath,
        { transaction },
      ),
    ]);
    const decision = decideAdminChurchRename({
      authenticatedUid: uid,
      actor: actor?.data || null,
      churchId: input.churchId,
      church: church?.data || null,
      legacyDirectory: legacy?.data || null,
      publicChurch: publicChurch?.data || null,
      name: input.name,
    });
    if (ledger) {
      const result = validateReplay(ledger.data, uid, input, decision);
      await rollbackQuietly(dependencies, service, transaction);
      return result;
    }
    if (decision.status === "alreadyNamed") {
      await rollbackQuietly(dependencies, service, transaction);
      return {
        status: "alreadyNamed",
        churchId: input.churchId,
        previousName: input.name,
        name: input.name,
      };
    }

    const now = dependencies.now();
    if (!(now instanceof Date) || !Number.isFinite(now.getTime())) {
      throw new PlatformError("INTERNAL");
    }
    const result: AdminChurchRenameResult = {
      status: "renamed",
      churchId: input.churchId,
      previousName: decision.previousName,
      name: input.name,
    };
    const writes = [
      dependencies.updateWrite(
        service.projectId,
        churchPath,
        { name: input.name, updatedAt: now },
        { updateMask: ["name", "updatedAt"], exists: true },
      ),
      dependencies.updateWrite(
        service.projectId,
        legacyPath,
        { churches: decision.legacyChurches, updatedAt: now },
        { exists: true },
      ),
      dependencies.updateWrite(
        service.projectId,
        publicPath,
        decision.projection,
        { exists: decision.publicExists },
      ),
      dependencies.updateWrite(
        service.projectId,
        ledgerPath,
        {
          schemaVersion: LEDGER_SCHEMA_VERSION,
          action: ADMIN_RENAME_CHURCH_ACTION,
          requestId: input.requestId,
          actorUid: uid,
          input: { churchId: input.churchId, name: input.name },
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

export const adminRenameChurch = async (
  service: ServiceAccess,
  identity: AdminChurchRenameIdentity,
  rawInput: AdminChurchRenameInput,
  overrides: Partial<AdminChurchRenameDependencies> = {},
): Promise<AdminChurchRenameResult> => {
  const uid = canonicalIdentity(identity);
  const input = validateInput(rawInput);
  const dependencies = { ...DEFAULT_DEPENDENCIES, ...overrides };
  let lastError: unknown = null;
  for (let attempt = 0; attempt < MAX_TRANSACTION_ATTEMPTS; attempt += 1) {
    try {
      return await executeRename(service, uid, input, dependencies);
    } catch (error) {
      lastError = error;
      if (!isContention(error) || attempt + 1 >= MAX_TRANSACTION_ATTEMPTS) {
        throw error;
      }
    }
  }
  throw lastError;
};
