export const ROTATE_CHURCH_ACCESS_CODE_ACTION =
  "rotateChurchAccessCode" as const;

export const UNAFFILIATED_CHURCH_ID = "unaffiliated_v1" as const;

type UnknownRecord = Record<string, unknown>;

export type RotateChurchAccessCodeActor = {
  uid?: unknown;
  role?: unknown;
  churchId?: unknown;
  isDeleted?: unknown;
};

export type RotateChurchAccessCodeChurch = {
  name?: unknown;
  isDeleted?: unknown;
  isVirtual?: unknown;
  adminUid?: unknown;
};

export type RotateChurchAccessCodeAdminProof = {
  adminUid?: unknown;
  adminEmail?: unknown;
  updatedAt?: unknown;
};

export type RotateChurchAccessCodeAccess = {
  codeHash?: unknown;
  version?: unknown;
  updatedAt?: unknown;
};

export type RotateChurchAccessCodeInspection = {
  accessExists: boolean;
  currentVersion: number;
  currentCodeHash: string;
};

export type RotateChurchAccessCodeDecision =
  & RotateChurchAccessCodeInspection
  & {
    nextVersion: number;
    nextCodeHash: string;
  };

export type RotateChurchAccessCodeValidationCode =
  | "INVALID_IDENTITY"
  | "ACTOR_UNAVAILABLE"
  | "INVALID_ACTOR"
  | "CHURCH_UNAVAILABLE"
  | "INVALID_CHURCH"
  | "ADMIN_PROOF_UNAVAILABLE"
  | "INVALID_ADMIN_PROOF"
  | "INVALID_ACCESS"
  | "VERSION_CONFLICT"
  | "INVALID_HASH";

export class RotateChurchAccessCodeValidationError extends Error {
  constructor(readonly code: RotateChurchAccessCodeValidationCode) {
    super(code);
    this.name = "RotateChurchAccessCodeValidationError";
  }
}

const isRecord = (value: unknown): value is UnknownRecord =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value);
const MAX_ACCESS_VERSION = 999_999_999;

const hasControlCharacters = (value: string): boolean =>
  /[\u0000-\u001f\u007f]/.test(value);

const isTimestamp = (value: unknown): value is string => {
  if (typeof value !== "string" || value.length > 64) return false;
  const parsed = new Date(value);
  return /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?Z$/.test(
    value,
  ) && Number.isFinite(parsed.getTime()) &&
    parsed.toISOString().slice(0, 19) ===
      value.slice(0, 19);
};

export const normalizeRotateChurchDocumentId = (
  value: unknown,
): string | null => {
  if (typeof value !== "string") return null;
  return value && value === value.trim() && value.length <= 128 &&
      value !== "." && value !== ".." && !value.includes("/") &&
      !hasControlCharacters(value)
    ? value
    : null;
};

const canonicalName = (value: unknown): value is string =>
  typeof value === "string" && value === value.trim() &&
  value.length >= 1 && value.length <= 200 && !hasControlCharacters(value);

const canonicalHash = (value: unknown): string | null =>
  typeof value === "string" && /^[0-9a-f]{64}$/.test(value) ? value : null;

const validateIdentity = (
  authenticatedUid: string,
  actor: RotateChurchAccessCodeActor | null,
): { uid: string; role: "churchAdmin" | "platformAdmin" | "superAdmin" } => {
  const uid = normalizeRotateChurchDocumentId(authenticatedUid);
  if (!uid || uid !== authenticatedUid) {
    throw new RotateChurchAccessCodeValidationError("INVALID_IDENTITY");
  }
  if (!isRecord(actor)) {
    throw new RotateChurchAccessCodeValidationError("ACTOR_UNAVAILABLE");
  }
  if (actor.uid !== undefined && actor.uid !== null && actor.uid !== uid) {
    throw new RotateChurchAccessCodeValidationError("INVALID_ACTOR");
  }
  if (actor.isDeleted === true) {
    throw new RotateChurchAccessCodeValidationError("ACTOR_UNAVAILABLE");
  }
  if (actor.isDeleted !== undefined && actor.isDeleted !== false) {
    throw new RotateChurchAccessCodeValidationError("INVALID_ACTOR");
  }
  if (
    actor.role !== "churchAdmin" && actor.role !== "platformAdmin" &&
    actor.role !== "superAdmin"
  ) {
    throw new RotateChurchAccessCodeValidationError("ACTOR_UNAVAILABLE");
  }
  return { uid, role: actor.role };
};

const validateChurch = (
  churchId: string,
  church: RotateChurchAccessCodeChurch | null,
) => {
  if (!isRecord(church) || church.isDeleted === true) {
    throw new RotateChurchAccessCodeValidationError("CHURCH_UNAVAILABLE");
  }
  if (
    church.isDeleted !== undefined && church.isDeleted !== false ||
    church.isVirtual !== undefined && church.isVirtual !== false ||
    !canonicalName(church.name)
  ) {
    throw new RotateChurchAccessCodeValidationError("INVALID_CHURCH");
  }
  if (
    church.adminUid !== undefined && church.adminUid !== null &&
    !normalizeRotateChurchDocumentId(church.adminUid)
  ) {
    throw new RotateChurchAccessCodeValidationError("INVALID_CHURCH");
  }
  if (churchId === UNAFFILIATED_CHURCH_ID) {
    throw new RotateChurchAccessCodeValidationError("INVALID_CHURCH");
  }
};

const validateChurchAdminProof = (
  uid: string,
  actor: RotateChurchAccessCodeActor,
  churchId: string,
  church: RotateChurchAccessCodeChurch,
  privateAdmin: RotateChurchAccessCodeAdminProof | null,
) => {
  if (actor.churchId !== churchId) {
    throw new RotateChurchAccessCodeValidationError(
      "ADMIN_PROOF_UNAVAILABLE",
    );
  }
  if (privateAdmin !== null) {
    if (!isRecord(privateAdmin)) {
      throw new RotateChurchAccessCodeValidationError("INVALID_ADMIN_PROOF");
    }
    const proofUid = normalizeRotateChurchDocumentId(privateAdmin.adminUid);
    const emailValid = privateAdmin.adminEmail === undefined ||
      privateAdmin.adminEmail === null ||
      (typeof privateAdmin.adminEmail === "string" &&
        privateAdmin.adminEmail === privateAdmin.adminEmail.trim() &&
        privateAdmin.adminEmail.length <= 254 &&
        !hasControlCharacters(privateAdmin.adminEmail));
    const updatedAtValid = privateAdmin.updatedAt === undefined ||
      isTimestamp(privateAdmin.updatedAt);
    if (!proofUid || !emailValid || !updatedAtValid) {
      throw new RotateChurchAccessCodeValidationError("INVALID_ADMIN_PROOF");
    }
    if (proofUid !== uid) {
      throw new RotateChurchAccessCodeValidationError(
        "ADMIN_PROOF_UNAVAILABLE",
      );
    }
    return;
  }
  const legacyUid = normalizeRotateChurchDocumentId(church.adminUid);
  if (!legacyUid || legacyUid !== uid) {
    throw new RotateChurchAccessCodeValidationError(
      "ADMIN_PROOF_UNAVAILABLE",
    );
  }
};

const inspectAccess = (
  access: RotateChurchAccessCodeAccess | null,
): RotateChurchAccessCodeInspection => {
  if (access === null) {
    return { accessExists: false, currentVersion: 0, currentCodeHash: "" };
  }
  if (!isRecord(access)) {
    throw new RotateChurchAccessCodeValidationError("INVALID_ACCESS");
  }
  const currentVersion = access.version === undefined ? 0 : access.version;
  if (
    !Number.isSafeInteger(currentVersion) || Number(currentVersion) < 0 ||
    Number(currentVersion) >= MAX_ACCESS_VERSION
  ) {
    throw new RotateChurchAccessCodeValidationError("INVALID_ACCESS");
  }
  const currentCodeHash = access.codeHash === undefined ||
      access.codeHash === null || access.codeHash === ""
    ? ""
    : canonicalHash(access.codeHash);
  if (currentCodeHash === null) {
    throw new RotateChurchAccessCodeValidationError("INVALID_ACCESS");
  }
  if (Number(currentVersion) > 0 && !currentCodeHash) {
    throw new RotateChurchAccessCodeValidationError("INVALID_ACCESS");
  }
  if (access.updatedAt !== undefined && !isTimestamp(access.updatedAt)) {
    throw new RotateChurchAccessCodeValidationError("INVALID_ACCESS");
  }
  return {
    accessExists: true,
    currentVersion: Number(currentVersion),
    currentCodeHash,
  };
};

export const inspectRotateChurchAccessCode = (input: {
  authenticatedUid: string;
  actor: RotateChurchAccessCodeActor | null;
  churchId: string;
  church: RotateChurchAccessCodeChurch | null;
  privateAdmin: RotateChurchAccessCodeAdminProof | null;
  access: RotateChurchAccessCodeAccess | null;
}): RotateChurchAccessCodeInspection => {
  const identity = validateIdentity(input.authenticatedUid, input.actor);
  const churchId = normalizeRotateChurchDocumentId(input.churchId);
  if (!churchId || churchId !== input.churchId) {
    throw new RotateChurchAccessCodeValidationError("INVALID_CHURCH");
  }
  validateChurch(churchId, input.church);
  if (identity.role === "churchAdmin") {
    validateChurchAdminProof(
      identity.uid,
      input.actor!,
      churchId,
      input.church!,
      input.privateAdmin,
    );
  }
  return inspectAccess(input.access);
};

export const decideRotateChurchAccessCode = (input: {
  authenticatedUid: string;
  actor: RotateChurchAccessCodeActor | null;
  churchId: string;
  church: RotateChurchAccessCodeChurch | null;
  privateAdmin: RotateChurchAccessCodeAdminProof | null;
  access: RotateChurchAccessCodeAccess | null;
  expectedVersion: number;
  nextCodeHash: string;
}): RotateChurchAccessCodeDecision => {
  const inspection = inspectRotateChurchAccessCode(input);
  if (
    !Number.isSafeInteger(input.expectedVersion) || input.expectedVersion < 0 ||
    input.expectedVersion >= MAX_ACCESS_VERSION
  ) {
    throw new RotateChurchAccessCodeValidationError("VERSION_CONFLICT");
  }
  if (inspection.currentVersion !== input.expectedVersion) {
    throw new RotateChurchAccessCodeValidationError("VERSION_CONFLICT");
  }
  const nextCodeHash = canonicalHash(input.nextCodeHash);
  if (!nextCodeHash) {
    throw new RotateChurchAccessCodeValidationError("INVALID_HASH");
  }
  return {
    ...inspection,
    nextVersion: inspection.currentVersion + 1,
    nextCodeHash,
  };
};
