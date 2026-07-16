export const COMPLETE_CHURCH_ADMIN_SIGNUP_ACTION =
  "completeChurchAdminSignup" as const;

export const COMMUNITY_ADMIN_POLICY_VERSION = "2026-07-14" as const;

const REQUEST_ID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const CONTROL_CHARACTER_PATTERN = /[\u0000-\u001f\u007f]/;
const ISO_TIMESTAMP_PATTERN =
  /^(\d{4})-(\d{2})-(\d{2})T([01]\d|2[0-3]):([0-5]\d):([0-5]\d)(?:\.(?:\d{3}|\d{6}|\d{9}))?Z$/;
const DATE_ONLY_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;
const ACTION_CHURCH_ID_PATTERN = /^church_[0-9a-f]{32}$/i;

type UnknownRecord = Record<string, unknown>;

export type ChurchAdminSignupProvider = "password" | "google.com";

export type CompleteChurchAdminSignupIdentity = {
  uid: unknown;
  tokenEmail: unknown;
  signInProvider: unknown;
};

export type ChurchAdminSignupSubgroup = {
  id: string;
  name: string;
};

export type ChurchAdminSignupDepartment = {
  id: string;
  name: string;
  subgroups: ChurchAdminSignupSubgroup[];
};

export type ChurchAdminConsentSummary = {
  schemaVersion: 1;
  policyVersions: {
    terms: string;
    privacy: string;
    sensitive: string;
    community: string;
    childGuardian: string;
  };
  agreedAt: string;
  audience: "communityAdmin";
  under14: false;
  guardianConsentRecorded: false;
};

export type ChurchAdminSignupConsent = {
  schemaVersion: 1;
  policyVersions: ChurchAdminConsentSummary["policyVersions"];
  agreedAt: string;
  source:
    | "email_community_admin_signup"
    | "google_community_admin_signup";
  locale: "ko-KR";
  audience: "communityAdmin";
  ageAssessment: {
    birthdate: null;
    asOfDate: string;
    age: null;
    under14: false;
    confirmed14Plus: true;
  };
  agreements: {
    terms: { agreed: true };
    privacy: { agreed: true };
    sensitive: { agreed: true };
    community: { agreed: true };
    childGuardian: {
      required: false;
      agreed: false;
      method: null;
      identityVerifiedByPlatform: false;
      legalAuthorityVerifiedByPlatform: false;
    };
  };
};

export type CompleteChurchAdminSignupInput = {
  requestId: unknown;
  name: unknown;
  churchName: unknown;
  pastorName: unknown;
  denomination: unknown;
  entryCode: unknown;
  departments: unknown;
  password: unknown;
  consent: unknown;
};

export type ValidatedChurchAdminSignup = {
  requestId: string;
  churchId: string;
  uid: string;
  tokenEmail: string;
  signInProvider: ChurchAdminSignupProvider;
  name: string;
  churchName: string;
  pastorName: string;
  denomination: string;
  entryCode: string;
  departments: ChurchAdminSignupDepartment[];
  password: string | null;
  consent: ChurchAdminSignupConsent;
  consentSummary: ChurchAdminConsentSummary;
};

export type PublicChurchProjection = {
  id: string;
  name: string;
  hidden?: true;
};

export type CompleteChurchAdminSignupUser = {
  uid?: unknown;
  name?: unknown;
  email?: unknown;
  password?: unknown;
  role?: unknown;
  churchId?: unknown;
  churchName?: unknown;
  isDeleted?: unknown;
};

export type CompleteChurchAdminSignupChurch = {
  name?: unknown;
  pastorName?: unknown;
  denomination?: unknown;
  departments?: unknown;
  isDeleted?: unknown;
  hiddenFromDirectory?: unknown;
};

export type CompleteChurchAdminSignupAdmin = {
  adminUid?: unknown;
  adminEmail?: unknown;
  updatedAt?: unknown;
};

export type CompleteChurchAdminSignupAccess = {
  codeHash?: unknown;
  updatedAt?: unknown;
};

export type CompleteChurchAdminSignupValidationCode =
  | "INVALID_IDENTITY"
  | "INVALID_INPUT"
  | "INVALID_DEPARTMENTS"
  | "INVALID_CONSENT"
  | "INVALID_DIRECTORY"
  | "INVALID_EXISTING_STATE";

export class CompleteChurchAdminSignupValidationError extends Error {
  constructor(readonly code: CompleteChurchAdminSignupValidationCode) {
    super(code);
    this.name = "CompleteChurchAdminSignupValidationError";
  }
}

const isRecord = (value: unknown): value is UnknownRecord =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value);

const exactKeys = (value: UnknownRecord, expected: readonly string[]) => {
  const keys = Object.keys(value).sort();
  const canonical = [...expected].sort();
  return keys.length === canonical.length &&
    keys.every((key, index) => key === canonical[index]);
};

const validDateOnly = (value: unknown): value is string => {
  if (typeof value !== "string") return false;
  const match = DATE_ONLY_PATTERN.exec(value);
  if (!match) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() + 1 === month &&
    date.getUTCDate() === day;
};

export const isCanonicalFirestoreTimestamp = (
  value: unknown,
): value is string => {
  if (typeof value !== "string") return false;
  const match = ISO_TIMESTAMP_PATTERN.exec(value);
  if (!match || Number(match[1]) < 1) return false;
  const parsed = new Date(value);
  return Number.isFinite(parsed.getTime()) &&
    parsed.getUTCFullYear() === Number(match[1]) &&
    parsed.getUTCMonth() + 1 === Number(match[2]) &&
    parsed.getUTCDate() === Number(match[3]) &&
    parsed.getUTCHours() === Number(match[4]) &&
    parsed.getUTCMinutes() === Number(match[5]) &&
    parsed.getUTCSeconds() === Number(match[6]);
};

export const normalizeChurchAdminSignupDocumentId = (
  value: unknown,
): string | null => {
  if (typeof value !== "string") return null;
  return value && value === value.trim() && value.length <= 128 &&
      value !== "." && value !== ".." && !value.includes("/") &&
      !CONTROL_CHARACTER_PATTERN.test(value)
    ? value
    : null;
};

const canonicalText = (
  value: unknown,
  { min = 0, max }: { min?: number; max: number },
): string | null => {
  if (
    typeof value !== "string" || value !== value.trim() ||
    value.length < min || value.length > max ||
    CONTROL_CHARACTER_PATTERN.test(value)
  ) return null;
  return value;
};

const canonicalEmail = (value: unknown): string | null => {
  if (typeof value !== "string") return null;
  const normalized = value.trim().toLowerCase();
  if (
    !normalized || normalized.length > 254 ||
    CONTROL_CHARACTER_PATTERN.test(normalized) ||
    !/^[^\s@]+@[^\s@]+$/.test(normalized)
  ) return null;
  return normalized;
};

const validateAgreement = (value: unknown): value is { agreed: true } =>
  isRecord(value) && exactKeys(value, ["agreed"]) && value.agreed === true;

const validateConsent = (
  value: unknown,
  provider: ChurchAdminSignupProvider,
): {
  consent: ChurchAdminSignupConsent;
  summary: ChurchAdminConsentSummary;
} => {
  if (
    !isRecord(value) ||
    !exactKeys(value, [
      "schemaVersion",
      "policyVersions",
      "agreedAt",
      "source",
      "locale",
      "audience",
      "ageAssessment",
      "agreements",
    ]) || value.schemaVersion !== 1 || value.locale !== "ko-KR" ||
    value.audience !== "communityAdmin" ||
    value.source !==
      (provider === "password"
        ? "email_community_admin_signup"
        : "google_community_admin_signup") ||
    !isCanonicalFirestoreTimestamp(value.agreedAt) ||
    !isRecord(value.policyVersions) ||
    !exactKeys(value.policyVersions, [
      "terms",
      "privacy",
      "sensitive",
      "community",
      "childGuardian",
    ]) ||
    Object.values(value.policyVersions).some((version) =>
      version !== COMMUNITY_ADMIN_POLICY_VERSION
    ) || !isRecord(value.ageAssessment) ||
    !exactKeys(value.ageAssessment, [
      "birthdate",
      "asOfDate",
      "age",
      "under14",
      "confirmed14Plus",
    ]) || value.ageAssessment.birthdate !== null ||
    !validDateOnly(value.ageAssessment.asOfDate) ||
    value.ageAssessment.age !== null || value.ageAssessment.under14 !== false ||
    value.ageAssessment.confirmed14Plus !== true ||
    !isRecord(value.agreements) ||
    !exactKeys(value.agreements, [
      "terms",
      "privacy",
      "sensitive",
      "community",
      "childGuardian",
    ]) || !validateAgreement(value.agreements.terms) ||
    !validateAgreement(value.agreements.privacy) ||
    !validateAgreement(value.agreements.sensitive) ||
    !validateAgreement(value.agreements.community) ||
    !isRecord(value.agreements.childGuardian) ||
    !exactKeys(value.agreements.childGuardian, [
      "required",
      "agreed",
      "method",
      "identityVerifiedByPlatform",
      "legalAuthorityVerifiedByPlatform",
    ]) || value.agreements.childGuardian.required !== false ||
    value.agreements.childGuardian.agreed !== false ||
    value.agreements.childGuardian.method !== null ||
    value.agreements.childGuardian.identityVerifiedByPlatform !== false ||
    value.agreements.childGuardian.legalAuthorityVerifiedByPlatform !== false
  ) {
    throw new CompleteChurchAdminSignupValidationError("INVALID_CONSENT");
  }
  const consent = structuredClone(value) as ChurchAdminSignupConsent;
  const summary: ChurchAdminConsentSummary = {
    schemaVersion: 1,
    policyVersions: structuredClone(consent.policyVersions),
    agreedAt: consent.agreedAt,
    audience: "communityAdmin",
    under14: false,
    guardianConsentRecorded: false,
  };
  return { consent, summary };
};

const validateDepartments = (
  value: unknown,
): ChurchAdminSignupDepartment[] => {
  if (!Array.isArray(value) || value.length < 1 || value.length > 50) {
    throw new CompleteChurchAdminSignupValidationError(
      "INVALID_DEPARTMENTS",
    );
  }
  const departmentIds = new Set<string>();
  let totalSubgroups = 0;
  const departments = value.map((department) => {
    if (
      !isRecord(department) ||
      !exactKeys(department, ["id", "name", "subgroups"])
    ) {
      throw new CompleteChurchAdminSignupValidationError(
        "INVALID_DEPARTMENTS",
      );
    }
    const id = normalizeChurchAdminSignupDocumentId(department.id);
    const name = canonicalText(department.name, { min: 1, max: 100 });
    if (
      !id || !name || departmentIds.has(id) ||
      !Array.isArray(department.subgroups) ||
      department.subgroups.length < 1 || department.subgroups.length > 100
    ) {
      throw new CompleteChurchAdminSignupValidationError(
        "INVALID_DEPARTMENTS",
      );
    }
    departmentIds.add(id);
    const subgroupIds = new Set<string>();
    const subgroups = department.subgroups.map((subgroup) => {
      if (!isRecord(subgroup) || !exactKeys(subgroup, ["id", "name"])) {
        throw new CompleteChurchAdminSignupValidationError(
          "INVALID_DEPARTMENTS",
        );
      }
      const subgroupId = normalizeChurchAdminSignupDocumentId(subgroup.id);
      const subgroupName = canonicalText(subgroup.name, { min: 1, max: 100 });
      if (!subgroupId || !subgroupName || subgroupIds.has(subgroupId)) {
        throw new CompleteChurchAdminSignupValidationError(
          "INVALID_DEPARTMENTS",
        );
      }
      subgroupIds.add(subgroupId);
      return { id: subgroupId, name: subgroupName };
    });
    totalSubgroups += subgroups.length;
    if (totalSubgroups > 300) {
      throw new CompleteChurchAdminSignupValidationError(
        "INVALID_DEPARTMENTS",
      );
    }
    return { id, name, subgroups };
  });
  return departments;
};

export const churchIdForAdminSignupRequest = (requestId: string): string =>
  `church_${requestId.replaceAll("-", "")}`;

export const validateCompleteChurchAdminSignup = (
  identityValue: CompleteChurchAdminSignupIdentity,
  inputValue: CompleteChurchAdminSignupInput,
): ValidatedChurchAdminSignup => {
  if (!isRecord(identityValue)) {
    throw new CompleteChurchAdminSignupValidationError("INVALID_IDENTITY");
  }
  const uid = normalizeChurchAdminSignupDocumentId(identityValue.uid);
  const tokenEmail = canonicalEmail(identityValue.tokenEmail);
  const provider = identityValue.signInProvider;
  if (
    !uid || !tokenEmail ||
    (provider !== "password" && provider !== "google.com")
  ) {
    throw new CompleteChurchAdminSignupValidationError("INVALID_IDENTITY");
  }
  if (
    !isRecord(inputValue) || !exactKeys(inputValue, [
      "requestId",
      "name",
      "churchName",
      "pastorName",
      "denomination",
      "entryCode",
      "departments",
      "password",
      "consent",
    ])
  ) {
    throw new CompleteChurchAdminSignupValidationError("INVALID_INPUT");
  }
  const requestId = typeof inputValue.requestId === "string" &&
      REQUEST_ID_PATTERN.test(inputValue.requestId)
    ? inputValue.requestId
    : null;
  const name = canonicalText(inputValue.name, { min: 1, max: 50 });
  const churchName = canonicalText(inputValue.churchName, { min: 1, max: 200 });
  const pastorName = canonicalText(inputValue.pastorName, { min: 1, max: 100 });
  const denomination = canonicalText(inputValue.denomination, {
    min: 0,
    max: 100,
  });
  const entryCode = canonicalText(inputValue.entryCode, { min: 4, max: 128 });
  const password = inputValue.password;
  if (
    !requestId || !name || !churchName || !pastorName ||
    denomination === null || !entryCode ||
    (provider === "password" &&
      (typeof password !== "string" || password.length < 6 ||
        password.length > 128 || CONTROL_CHARACTER_PATTERN.test(password))) ||
    (provider === "google.com" && password !== null)
  ) {
    throw new CompleteChurchAdminSignupValidationError("INVALID_INPUT");
  }
  const departments = validateDepartments(inputValue.departments);
  const { consent, summary } = validateConsent(inputValue.consent, provider);
  return {
    requestId,
    churchId: churchIdForAdminSignupRequest(requestId),
    uid,
    tokenEmail,
    signInProvider: provider,
    name,
    churchName,
    pastorName,
    denomination,
    entryCode,
    departments,
    password: password as string | null,
    consent,
    consentSummary: summary,
  };
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

export const sanitizeChurchAdminSignupLegacyDirectory = (
  value: unknown,
): { exists: boolean; churches: PublicChurchProjection[] } => {
  if (value === null) return { exists: false, churches: [] };
  if (
    !isRecord(value) ||
    !Object.prototype.hasOwnProperty.call(value, "churches") ||
    !Array.isArray(value.churches) ||
    Object.keys(value).some((key) =>
      !["churches", "updatedAt"].includes(key)
    ) ||
    (Object.prototype.hasOwnProperty.call(value, "updatedAt") &&
      !isCanonicalFirestoreTimestamp(value.updatedAt))
  ) {
    throw new CompleteChurchAdminSignupValidationError("INVALID_DIRECTORY");
  }
  const seen = new Set<string>();
  const churches = value.churches.map((entry) => {
    if (
      !isRecord(entry) || Object.keys(entry).some((key) =>
        !LEGACY_ENTRY_KEYS.has(key)
      ) ||
      !Object.prototype.hasOwnProperty.call(entry, "id") ||
      !Object.prototype.hasOwnProperty.call(entry, "name")
    ) {
      throw new CompleteChurchAdminSignupValidationError("INVALID_DIRECTORY");
    }
    const id = normalizeChurchAdminSignupDocumentId(entry.id);
    const name = canonicalText(entry.name, { min: 1, max: 200 });
    if (
      !id || id === "unaffiliated_v1" || !name || seen.has(id) ||
      (Object.prototype.hasOwnProperty.call(entry, "hidden") &&
        typeof entry.hidden !== "boolean")
    ) {
      throw new CompleteChurchAdminSignupValidationError("INVALID_DIRECTORY");
    }
    seen.add(id);
    return {
      id,
      name,
      ...(entry.hidden === true ? { hidden: true as const } : {}),
    };
  });
  return { exists: true, churches };
};

export const isActionChurchId = (value: unknown): value is string =>
  typeof value === "string" && ACTION_CHURCH_ID_PATTERN.test(value);

export const exactDeepEqual = (left: unknown, right: unknown): boolean => {
  if (left === right) return true;
  if (Array.isArray(left) || Array.isArray(right)) {
    return Array.isArray(left) && Array.isArray(right) &&
      left.length === right.length &&
      left.every((entry, index) => exactDeepEqual(entry, right[index]));
  }
  if (!isRecord(left) || !isRecord(right)) return false;
  const leftKeys = Object.keys(left).sort();
  const rightKeys = Object.keys(right).sort();
  return leftKeys.length === rightKeys.length &&
    leftKeys.every((key, index) =>
      key === rightKeys[index] && exactDeepEqual(left[key], right[key])
    );
};

export const validateCanonicalChurchAdminSignupState = (input: {
  signup: ValidatedChurchAdminSignup;
  entryCodeHash: string;
  churchId: string;
  user: CompleteChurchAdminSignupUser | null;
  church: CompleteChurchAdminSignupChurch | null;
  admin: CompleteChurchAdminSignupAdmin | null;
  access: CompleteChurchAdminSignupAccess | null;
  consent: unknown | null;
  legacyDirectory: unknown;
  publicChurch: unknown | null;
}): void => {
  const { signup, churchId } = input;
  const directory = sanitizeChurchAdminSignupLegacyDirectory(
    input.legacyDirectory,
  );
  const target = directory.churches.filter((entry) => entry.id === churchId);
  const expectedProjection = { id: churchId, name: signup.churchName };
  const storedConsent = isRecord(input.consent)
    ? Object.fromEntries(
      Object.entries(input.consent).filter(([key]) => key !== "recordedAt"),
    )
    : null;
  if (
    !isActionChurchId(churchId) || !isRecord(input.user) ||
    (input.user.uid !== undefined && input.user.uid !== signup.uid) ||
    input.user.role !== "churchAdmin" || input.user.churchId !== churchId ||
    input.user.name !== signup.name || input.user.email !== signup.tokenEmail ||
    input.user.churchName !== signup.churchName ||
    (input.user.isDeleted !== undefined && input.user.isDeleted !== false) ||
    (input.user.password !== signup.password && input.user.password !== null) ||
    !isRecord(input.church) || input.church.name !== signup.churchName ||
    input.church.pastorName !== signup.pastorName ||
    input.church.denomination !== signup.denomination ||
    !exactDeepEqual(input.church.departments, signup.departments) ||
    (input.church.isDeleted !== undefined &&
      input.church.isDeleted !== false) ||
    (input.church.hiddenFromDirectory !== undefined &&
      input.church.hiddenFromDirectory !== false) ||
    !isRecord(input.admin) || input.admin.adminUid !== signup.uid ||
    !exactKeys(input.admin, ["adminUid", "adminEmail", "updatedAt"]) ||
    input.admin.adminEmail !== signup.tokenEmail ||
    !isCanonicalFirestoreTimestamp(input.admin.updatedAt) ||
    !isRecord(input.access) ||
    !exactKeys(input.access, ["codeHash", "updatedAt"]) ||
    input.access.codeHash !== input.entryCodeHash ||
    !isCanonicalFirestoreTimestamp(input.access.updatedAt) ||
    !isRecord(input.consent) ||
    !isCanonicalFirestoreTimestamp(input.consent.recordedAt) ||
    !exactDeepEqual(storedConsent, signup.consent) || !directory.exists ||
    target.length !== 1 || !exactDeepEqual(target[0], expectedProjection) ||
    !exactDeepEqual(input.publicChurch, expectedProjection)
  ) {
    throw new CompleteChurchAdminSignupValidationError(
      "INVALID_EXISTING_STATE",
    );
  }
};
