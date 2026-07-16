export const ENSURE_UNAFFILIATED_CHURCH_ACTION =
  "ensureUnaffiliatedChurch" as const;
export const UNAFFILIATED_CHURCH_ID = "unaffiliated_v1" as const;
export const UNAFFILIATED_CHURCH_NAME = "성경 읽는 사람들" as const;

type UnknownRecord = Record<string, unknown>;

export type EnsureUnaffiliatedChurchActor = {
  uid?: unknown;
  role?: unknown;
  isDeleted?: unknown;
};

export type EnsureUnaffiliatedPublicChurch = {
  id: string;
  name: string;
  hidden?: true;
};

export type EnsureUnaffiliatedChurchDecision = {
  churchExists: boolean;
  churchNeedsWrite: boolean;
  preservedCreatedAt: string | null;
  legacyExists: boolean;
  legacyNeedsWrite: boolean;
  legacyChurches: EnsureUnaffiliatedPublicChurch[];
  publicExists: boolean;
  publicMetaExists: boolean;
  publicMetaNeedsFallback: boolean;
};

export type EnsureUnaffiliatedChurchValidationCode =
  | "INVALID_IDENTITY"
  | "ACTOR_UNAVAILABLE"
  | "INVALID_ACTOR"
  | "INVALID_DIRECTORY";

export class EnsureUnaffiliatedChurchValidationError extends Error {
  constructor(readonly code: EnsureUnaffiliatedChurchValidationCode) {
    super(code);
    this.name = "EnsureUnaffiliatedChurchValidationError";
  }
}

const CHURCH_KEYS = [
  "name",
  "pastorName",
  "denomination",
  "isVirtual",
  "departments",
  "createdAt",
  "updatedAt",
] as const;

const isRecord = (value: unknown): value is UnknownRecord =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value);

const hasControlCharacters = (value: string): boolean =>
  /[\u0000-\u001f\u007f]/.test(value);

export const normalizeEnsureUnaffiliatedDocumentId = (
  value: unknown,
): string | null => {
  if (typeof value !== "string") return null;
  return value && value === value.trim() && value.length <= 128 &&
      value !== "." && value !== ".." && !value.includes("/") &&
      !hasControlCharacters(value)
    ? value
    : null;
};

export const isEnsureUnaffiliatedTimestamp = (
  value: unknown,
): value is string => {
  if (typeof value !== "string" || value.length > 64) return false;
  const parsed = new Date(value);
  return /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?Z$/.test(
    value,
  ) && Number.isFinite(parsed.getTime()) &&
    parsed.toISOString().slice(0, 19) ===
      value.slice(0, 19);
};

const exactKeys = (value: UnknownRecord, expected: readonly string[]) => {
  const keys = Object.keys(value).sort();
  const sorted = [...expected].sort();
  return keys.length === sorted.length &&
    keys.every((key, index) => key === sorted[index]);
};

const exactDepartments = (value: unknown): boolean => {
  if (!Array.isArray(value) || value.length !== 1) return false;
  const department = value[0];
  return isRecord(department) &&
    exactKeys(department, ["id", "name", "color", "subgroups"]) &&
    department.id === "personal" && department.name === "개인 성도" &&
    department.color === "bg-emerald-500" &&
    Array.isArray(department.subgroups) &&
    department.subgroups.length === 1 &&
    department.subgroups[0] === "성경읽기 동행";
};

export const isCanonicalUnaffiliatedChurch = (value: unknown): boolean =>
  isRecord(value) && exactKeys(value, CHURCH_KEYS) &&
  value.name === UNAFFILIATED_CHURCH_NAME && value.pastorName === "" &&
  value.denomination === "" && value.isVirtual === true &&
  exactDepartments(value.departments) &&
  isEnsureUnaffiliatedTimestamp(value.createdAt) &&
  isEnsureUnaffiliatedTimestamp(value.updatedAt);

const validateActor = (
  authenticatedUid: string,
  actor: EnsureUnaffiliatedChurchActor | null,
) => {
  const uid = normalizeEnsureUnaffiliatedDocumentId(authenticatedUid);
  if (!uid || uid !== authenticatedUid) {
    throw new EnsureUnaffiliatedChurchValidationError("INVALID_IDENTITY");
  }
  if (!isRecord(actor)) {
    throw new EnsureUnaffiliatedChurchValidationError("ACTOR_UNAVAILABLE");
  }
  if (actor.uid !== undefined && actor.uid !== null && actor.uid !== uid) {
    throw new EnsureUnaffiliatedChurchValidationError("INVALID_ACTOR");
  }
  if (actor.isDeleted === true) {
    throw new EnsureUnaffiliatedChurchValidationError("ACTOR_UNAVAILABLE");
  }
  if (actor.isDeleted !== undefined && actor.isDeleted !== false) {
    throw new EnsureUnaffiliatedChurchValidationError("INVALID_ACTOR");
  }
  if (actor.role !== "platformAdmin" && actor.role !== "superAdmin") {
    throw new EnsureUnaffiliatedChurchValidationError("ACTOR_UNAVAILABLE");
  }
};

const withoutUnaffiliated = (
  legacyDirectory: unknown | null,
): {
  exists: boolean;
  needsWrite: boolean;
  churches: EnsureUnaffiliatedPublicChurch[];
} => {
  if (legacyDirectory === null) {
    return { exists: false, needsWrite: false, churches: [] };
  }
  if (
    !isRecord(legacyDirectory) ||
    !Object.prototype.hasOwnProperty.call(legacyDirectory, "churches") ||
    !Array.isArray(legacyDirectory.churches)
  ) {
    throw new EnsureUnaffiliatedChurchValidationError("INVALID_DIRECTORY");
  }
  const rootKeys = Object.keys(legacyDirectory).sort();
  const rootCanonical = (
    rootKeys.length === 1 && rootKeys[0] === "churches"
  ) || (
    rootKeys.length === 2 && rootKeys[0] === "churches" &&
    rootKeys[1] === "updatedAt" &&
    isEnsureUnaffiliatedTimestamp(legacyDirectory.updatedAt)
  );
  const churches: EnsureUnaffiliatedPublicChurch[] = [];
  const seen = new Set<string>();
  let needsWrite = !rootCanonical;
  for (const entry of legacyDirectory.churches) {
    if (!isRecord(entry)) {
      throw new EnsureUnaffiliatedChurchValidationError("INVALID_DIRECTORY");
    }
    const id = normalizeEnsureUnaffiliatedDocumentId(entry.id);
    const name = typeof entry.name === "string" &&
        entry.name === entry.name.trim() && entry.name.length > 0 &&
        entry.name.length <= 200 && !hasControlCharacters(entry.name)
      ? entry.name
      : null;
    if (
      !id || !name || seen.has(id) ||
      (Object.prototype.hasOwnProperty.call(entry, "hidden") &&
        typeof entry.hidden !== "boolean")
    ) {
      throw new EnsureUnaffiliatedChurchValidationError("INVALID_DIRECTORY");
    }
    seen.add(id);
    if (id === UNAFFILIATED_CHURCH_ID) {
      needsWrite = true;
      continue;
    }
    const projection: EnsureUnaffiliatedPublicChurch = {
      id,
      name,
      ...(entry.hidden === true ? { hidden: true } : {}),
    };
    const expectedKeys = entry.hidden === true
      ? ["hidden", "id", "name"]
      : ["id", "name"];
    const actualKeys = Object.keys(entry).sort();
    if (
      actualKeys.length !== expectedKeys.length ||
      actualKeys.some((key, index) => key !== expectedKeys[index])
    ) needsWrite = true;
    churches.push(projection);
  }
  return { exists: true, needsWrite, churches };
};

const inspectPublicDirectoryMeta = (
  value: unknown | null,
): { exists: boolean; ready: boolean; mode: "legacy" | "public" } => {
  if (value === null) {
    return { exists: false, ready: false, mode: "legacy" };
  }
  if (!isRecord(value)) {
    throw new EnsureUnaffiliatedChurchValidationError("INVALID_DIRECTORY");
  }
  const allowedKeys = ["ready", "mode", "schemaVersion", "count", "updatedAt"];
  if (
    Object.keys(value).some((key) => !allowedKeys.includes(key)) ||
    !Object.prototype.hasOwnProperty.call(value, "ready") ||
    !Object.prototype.hasOwnProperty.call(value, "mode") ||
    !Object.prototype.hasOwnProperty.call(value, "schemaVersion") ||
    typeof value.ready !== "boolean" ||
    (value.mode !== "legacy" && value.mode !== "public") ||
    value.schemaVersion !== 1 ||
    (Object.prototype.hasOwnProperty.call(value, "count") &&
      (!Number.isSafeInteger(value.count) || Number(value.count) < 0)) ||
    (value.ready === true && !Number.isSafeInteger(value.count)) ||
    (Object.prototype.hasOwnProperty.call(value, "updatedAt") &&
      !isEnsureUnaffiliatedTimestamp(value.updatedAt))
  ) {
    throw new EnsureUnaffiliatedChurchValidationError("INVALID_DIRECTORY");
  }
  return { exists: true, ready: value.ready, mode: value.mode };
};

export const decideEnsureUnaffiliatedChurch = (input: {
  authenticatedUid: string;
  actor: EnsureUnaffiliatedChurchActor | null;
  church: unknown | null;
  legacyDirectory: unknown | null;
  publicExists: boolean;
  publicDirectoryMeta: unknown | null;
}): EnsureUnaffiliatedChurchDecision => {
  validateActor(input.authenticatedUid, input.actor);
  if (typeof input.publicExists !== "boolean") {
    throw new EnsureUnaffiliatedChurchValidationError("INVALID_DIRECTORY");
  }
  const legacy = withoutUnaffiliated(input.legacyDirectory);
  const publicMeta = inspectPublicDirectoryMeta(input.publicDirectoryMeta);
  const churchExists = input.church !== null;
  const preservedCreatedAt = isRecord(input.church) &&
      isEnsureUnaffiliatedTimestamp(input.church.createdAt)
    ? input.church.createdAt
    : null;
  return {
    churchExists,
    churchNeedsWrite: !isCanonicalUnaffiliatedChurch(input.church),
    preservedCreatedAt,
    legacyExists: legacy.exists,
    legacyNeedsWrite: legacy.needsWrite,
    legacyChurches: legacy.churches,
    publicExists: input.publicExists,
    publicMetaExists: publicMeta.exists,
    publicMetaNeedsFallback: input.publicExists && publicMeta.exists &&
      (publicMeta.ready || publicMeta.mode !== "legacy"),
  };
};
