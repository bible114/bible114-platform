export const ADMIN_SET_CHURCH_VISIBILITY_ACTION =
  "adminSetChurchVisibility" as const;
export const UNAFFILIATED_CHURCH_ID = "unaffiliated_v1" as const;

type UnknownRecord = Record<string, unknown>;

export type AdminChurchVisibilityActor = {
  uid?: unknown;
  role?: unknown;
  isDeleted?: unknown;
};

export type AdminChurchVisibilityChurch = {
  name?: unknown;
  isDeleted?: unknown;
  hiddenFromDirectory?: unknown;
};

export type AdminChurchVisibilityProjection = {
  id: string;
  name: string;
  hidden?: true;
};

export type AdminChurchVisibilityDecision = {
  status: "updated" | "alreadySet";
  hidden: boolean;
  projection: AdminChurchVisibilityProjection;
  legacyChurches: AdminChurchVisibilityProjection[];
  publicExists: boolean;
};

export type AdminChurchVisibilityValidationCode =
  | "INVALID_IDENTITY"
  | "ACTOR_UNAVAILABLE"
  | "INVALID_ACTOR"
  | "CHURCH_UNAVAILABLE"
  | "INVALID_CHURCH"
  | "INVALID_DIRECTORY";

export class AdminChurchVisibilityValidationError extends Error {
  constructor(readonly code: AdminChurchVisibilityValidationCode) {
    super(code);
    this.name = "AdminChurchVisibilityValidationError";
  }
}

const LEGACY_ENTRY_KEYS = new Set([
  "id",
  "name",
  "hidden",
  // These legacy secret fields are accepted only so this operation can remove
  // them. They are never copied into the sanitized compatibility projection.
  "codeHash",
  "churchCodeHash",
  "churchCode",
  "code",
]);
const MINIMAL_ENTRY_KEYS = new Set(["id", "name", "hidden"]);
const LEGACY_DOCUMENT_KEYS = new Set(["churches", "updatedAt"]);
const FIRESTORE_TIMESTAMP_PATTERN =
  /^(\d{4})-(\d{2})-(\d{2})T([01]\d|2[0-3]):([0-5]\d):([0-5]\d)(?:\.\d{1,9})?Z$/;

const isRecord = (value: unknown): value is UnknownRecord =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value);

const hasControlCharacters = (value: string): boolean =>
  /[\u0000-\u001f\u007f]/.test(value);

export const normalizeAdminChurchDocumentId = (
  value: unknown,
): string | null => {
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  return normalized && normalized === value && normalized.length <= 128 &&
      normalized !== "." && normalized !== ".." &&
      !normalized.includes("/") && !hasControlCharacters(normalized)
    ? normalized
    : null;
};

const canonicalName = (value: unknown): value is string =>
  typeof value === "string" && value === value.trim() &&
  value.length >= 1 && value.length <= 200 &&
  !hasControlCharacters(value);

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
  expected: AdminChurchVisibilityProjection,
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
  expected: AdminChurchVisibilityProjection[],
): boolean =>
  Array.isArray(value) && value.length === expected.length &&
  value.every((entry, index) => exactProjectionEqual(entry, expected[index]));

const validateActor = (
  uid: string,
  actor: AdminChurchVisibilityActor | null,
) => {
  if (!isRecord(actor)) {
    throw new AdminChurchVisibilityValidationError("ACTOR_UNAVAILABLE");
  }
  if (
    actor.uid !== undefined && actor.uid !== null && actor.uid !== uid
  ) throw new AdminChurchVisibilityValidationError("INVALID_ACTOR");
  if (
    actor.role !== "platformAdmin" && actor.role !== "superAdmin"
  ) throw new AdminChurchVisibilityValidationError("ACTOR_UNAVAILABLE");
  if (actor.isDeleted === true) {
    throw new AdminChurchVisibilityValidationError("ACTOR_UNAVAILABLE");
  }
  if (actor.isDeleted !== undefined && actor.isDeleted !== false) {
    throw new AdminChurchVisibilityValidationError("INVALID_ACTOR");
  }
};

const validateChurch = (
  church: AdminChurchVisibilityChurch | null,
): { name: string; hiddenFromDirectory: boolean | undefined } => {
  if (!isRecord(church)) {
    throw new AdminChurchVisibilityValidationError("CHURCH_UNAVAILABLE");
  }
  if (church.isDeleted === true) {
    throw new AdminChurchVisibilityValidationError("CHURCH_UNAVAILABLE");
  }
  if (church.isDeleted !== undefined && church.isDeleted !== false) {
    throw new AdminChurchVisibilityValidationError("INVALID_CHURCH");
  }
  if (!canonicalName(church.name)) {
    throw new AdminChurchVisibilityValidationError("INVALID_CHURCH");
  }
  if (
    church.hiddenFromDirectory !== undefined &&
    typeof church.hiddenFromDirectory !== "boolean"
  ) throw new AdminChurchVisibilityValidationError("INVALID_CHURCH");
  return {
    name: church.name,
    hiddenFromDirectory: church.hiddenFromDirectory as boolean | undefined,
  };
};

const sanitizeLegacyDirectory = (
  legacyDirectory: unknown,
): {
  churches: AdminChurchVisibilityProjection[];
  wasMinimal: boolean;
} => {
  if (!isRecord(legacyDirectory)) {
    throw new AdminChurchVisibilityValidationError("INVALID_DIRECTORY");
  }
  const documentKeys = Object.keys(legacyDirectory);
  if (
    documentKeys.some((key) => !LEGACY_DOCUMENT_KEYS.has(key)) ||
    !Object.prototype.hasOwnProperty.call(legacyDirectory, "churches") ||
    !Array.isArray(legacyDirectory.churches) ||
    (Object.prototype.hasOwnProperty.call(legacyDirectory, "updatedAt") &&
      !isFirestoreTimestamp(legacyDirectory.updatedAt))
  ) throw new AdminChurchVisibilityValidationError("INVALID_DIRECTORY");

  const seen = new Set<string>();
  // A missing update timestamp is accepted as a repairable legacy state, but
  // it is not a no-op: the service must touch this document to create the
  // updateTime fence used by public-directory rebuilds.
  let wasMinimal = Object.prototype.hasOwnProperty.call(
    legacyDirectory,
    "updatedAt",
  );
  const churches = legacyDirectory.churches.map((entry) => {
    if (!isRecord(entry)) {
      throw new AdminChurchVisibilityValidationError("INVALID_DIRECTORY");
    }
    const keys = Object.keys(entry);
    if (
      keys.some((key) => !LEGACY_ENTRY_KEYS.has(key)) ||
      !keys.includes("id") || !keys.includes("name")
    ) throw new AdminChurchVisibilityValidationError("INVALID_DIRECTORY");
    if (keys.some((key) => !MINIMAL_ENTRY_KEYS.has(key))) wasMinimal = false;
    const id = normalizeAdminChurchDocumentId(entry.id);
    if (
      !id || id !== entry.id || id === UNAFFILIATED_CHURCH_ID ||
      seen.has(id) || !canonicalName(entry.name) ||
      (Object.prototype.hasOwnProperty.call(entry, "hidden") &&
        typeof entry.hidden !== "boolean")
    ) throw new AdminChurchVisibilityValidationError("INVALID_DIRECTORY");
    seen.add(id);
    const sanitized: AdminChurchVisibilityProjection = {
      id,
      name: entry.name,
      ...(entry.hidden === true ? { hidden: true } : {}),
    };
    if (!exactProjectionEqual(entry, sanitized)) wasMinimal = false;
    return sanitized;
  });
  return { churches, wasMinimal };
};

export const decideAdminChurchVisibility = (input: {
  authenticatedUid: string;
  actor: AdminChurchVisibilityActor | null;
  churchId: string;
  church: AdminChurchVisibilityChurch | null;
  legacyDirectory: unknown;
  publicChurch: unknown | null;
  hidden: boolean;
}): AdminChurchVisibilityDecision => {
  const uid = normalizeAdminChurchDocumentId(input.authenticatedUid);
  if (!uid || uid !== input.authenticatedUid) {
    throw new AdminChurchVisibilityValidationError("INVALID_IDENTITY");
  }
  validateActor(uid, input.actor);
  const churchId = normalizeAdminChurchDocumentId(input.churchId);
  if (
    !churchId || churchId !== input.churchId ||
    churchId === UNAFFILIATED_CHURCH_ID || typeof input.hidden !== "boolean"
  ) throw new AdminChurchVisibilityValidationError("INVALID_CHURCH");

  const church = validateChurch(input.church);
  const sanitizedDirectory = sanitizeLegacyDirectory(input.legacyDirectory);
  const projection: AdminChurchVisibilityProjection = {
    id: churchId,
    name: church.name,
    ...(input.hidden ? { hidden: true } : {}),
  };
  const targetIndex = sanitizedDirectory.churches.findIndex((entry) =>
    entry.id === churchId
  );
  const legacyChurches = [...sanitizedDirectory.churches];
  if (targetIndex < 0) legacyChurches.push(projection);
  else legacyChurches[targetIndex] = projection;

  const directoryAlreadyExact = sanitizedDirectory.wasMinimal &&
    exactProjectionListEqual(
      (input.legacyDirectory as UnknownRecord).churches,
      legacyChurches,
    );
  const publicExists = input.publicChurch !== null;
  // Every active church must have a canonical public projection. A missing
  // document is drift that this operation repairs; it can never be a no-op.
  const publicAlreadyExact = publicExists &&
    exactProjectionEqual(input.publicChurch, projection);
  const churchAlreadyExact = church.hiddenFromDirectory === input.hidden;

  return {
    status: churchAlreadyExact && directoryAlreadyExact && publicAlreadyExact
      ? "alreadySet"
      : "updated",
    hidden: input.hidden,
    projection,
    legacyChurches,
    publicExists,
  };
};
