export const SIGNUP_POLICY_VERSION = "2026-07-16" as const;

export type SignupAudience = "member" | "personal";

export type StoredSignupConsent = Record<string, unknown>;

export type SignupConsentSummary = {
  schemaVersion: 1;
  policyVersions: Record<string, string>;
  agreedAt: string;
  audience: SignupAudience;
  under14: boolean;
  guardianConsentRecorded: boolean;
};

export class SignupConsentValidationError extends Error {
  constructor() {
    super("INVALID_CONSENT");
    this.name = "SignupConsentValidationError";
  }
}

const POLICY_KEYS = [
  "terms",
  "privacy",
  "sensitive",
  "community",
  "childGuardian",
] as const;
const REQUIRED_AGREEMENT_KEYS = POLICY_KEYS.slice(0, 4);
const GUARDIAN_RELATIONSHIPS = new Set(["부", "모", "후견인", "기타"]);
const MAX_CLOCK_SKEW_MS = 5 * 60 * 1_000;

const record = (value: unknown): Record<string, unknown> | null =>
  value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;

const exactKeys = (
  value: Record<string, unknown>,
  expected: readonly string[],
) => {
  const actual = Object.keys(value).sort();
  const canonical = [...expected].sort();
  return actual.length === canonical.length &&
    actual.every((key, index) => key === canonical[index]);
};

const validDateParts = (year: number, month: number, day: number) => {
  if (![year, month, day].every(Number.isInteger)) return false;
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day;
};

const parseBirthdate = (value: string) => {
  const match = /^(\d{4})(\d{2})(\d{2})$/.exec(value);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  return validDateParts(year, month, day) ? { year, month, day } : null;
};

const parseCalendarDate = (value: string) => {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  return validDateParts(year, month, day) ? { year, month, day } : null;
};

const ageAt = (birthdate: string, calendarDate: string) => {
  const birth = parseBirthdate(birthdate);
  const today = parseCalendarDate(calendarDate);
  if (!birth || !today) return null;
  let age = today.year - birth.year;
  if (
    today.month < birth.month ||
    (today.month === birth.month && today.day < birth.day)
  ) age -= 1;
  return age >= 0 ? age : null;
};

const timestampMs = (value: unknown) => {
  if (
    typeof value !== "string" ||
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?(?:Z|[+-]\d{2}:\d{2})$/
      .test(value)
  ) return null;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const safeText = (value: unknown, max: number) =>
  typeof value === "string" && value === value.trim() &&
  value.length >= 1 && value.length <= max &&
  !/[\u0000-\u001f\u007f]/.test(value);

const validateRequiredAgreement = (value: unknown) => {
  const agreement = record(value);
  return Boolean(
    agreement && exactKeys(agreement, ["agreed"]) &&
      agreement.agreed === true,
  );
};

const validateGuardian = (value: unknown, under14: boolean) => {
  const guardian = record(value);
  if (!guardian) throw new SignupConsentValidationError();
  if (!under14) {
    if (
      !exactKeys(guardian, [
        "required",
        "agreed",
        "method",
        "identityVerifiedByPlatform",
        "legalAuthorityVerifiedByPlatform",
      ]) ||
      guardian.required !== false || guardian.agreed !== false ||
      guardian.method !== null ||
      guardian.identityVerifiedByPlatform !== false ||
      guardian.legalAuthorityVerifiedByPlatform !== false
    ) throw new SignupConsentValidationError();
    return false;
  }

  const commonValid = guardian.required === true &&
    guardian.agreed === true &&
    guardian.identityVerifiedByPlatform === false &&
    guardian.legalAuthorityVerifiedByPlatform === false;
  if (!commonValid) throw new SignupConsentValidationError();

  if (guardian.method === "guardian_assertion") {
    if (
      !exactKeys(guardian, [
        "required",
        "agreed",
        "method",
        "guardianName",
        "relationship",
        "identityVerifiedByPlatform",
        "legalAuthorityVerifiedByPlatform",
      ]) ||
      !safeText(guardian.guardianName, 50) ||
      typeof guardian.relationship !== "string" ||
      !GUARDIAN_RELATIONSHIPS.has(guardian.relationship)
    ) throw new SignupConsentValidationError();
    return true;
  }

  if (guardian.method === "google_provider_signal") {
    if (
      !exactKeys(guardian, [
        "required",
        "agreed",
        "method",
        "provider",
        "evidenceRef",
        "identityVerifiedByPlatform",
        "legalAuthorityVerifiedByPlatform",
      ]) ||
      guardian.provider !== "google" ||
      !safeText(guardian.evidenceRef, 200)
    ) throw new SignupConsentValidationError();
    return true;
  }

  throw new SignupConsentValidationError();
};

export const validateStoredSignupConsent = ({
  consent,
  birthdate,
  calendarDate,
  now,
  audience,
  allowedSources,
}: {
  consent: StoredSignupConsent | null;
  birthdate: string;
  calendarDate: string;
  now: Date;
  audience: SignupAudience;
  allowedSources: readonly string[];
}): SignupConsentSummary => {
  if (!consent) throw new SignupConsentValidationError();
  if (
    !exactKeys(consent, [
      "schemaVersion",
      "policyVersions",
      "agreedAt",
      "source",
      "locale",
      "audience",
      "ageAssessment",
      "agreements",
      "recordedAt",
    ]) ||
    consent.schemaVersion !== 1 ||
    consent.audience !== audience ||
    consent.locale !== "ko-KR" ||
    typeof consent.source !== "string" ||
    !allowedSources.includes(consent.source)
  ) throw new SignupConsentValidationError();

  const nowMs = now.getTime();
  const agreedAtMs = timestampMs(consent.agreedAt);
  const recordedAtMs = timestampMs(consent.recordedAt);
  if (
    !Number.isFinite(nowMs) || agreedAtMs === null || recordedAtMs === null ||
    agreedAtMs > nowMs + MAX_CLOCK_SKEW_MS ||
    recordedAtMs > nowMs + MAX_CLOCK_SKEW_MS ||
    recordedAtMs + MAX_CLOCK_SKEW_MS < agreedAtMs
  ) throw new SignupConsentValidationError();

  const policies = record(consent.policyVersions);
  if (!policies) throw new SignupConsentValidationError();
  if (
    !exactKeys(policies, POLICY_KEYS) ||
    POLICY_KEYS.some((key) => policies[key] !== SIGNUP_POLICY_VERSION)
  ) throw new SignupConsentValidationError();

  const expectedAge = ageAt(birthdate, calendarDate);
  const assessment = record(consent.ageAssessment);
  if (expectedAge === null || !assessment) {
    throw new SignupConsentValidationError();
  }
  if (
    !exactKeys(assessment, ["birthdate", "asOfDate", "age", "under14"]) ||
    assessment.birthdate !== birthdate ||
    assessment.asOfDate !== calendarDate ||
    assessment.age !== expectedAge ||
    assessment.under14 !== (expectedAge < 14)
  ) throw new SignupConsentValidationError();

  const agreements = record(consent.agreements);
  if (!agreements) throw new SignupConsentValidationError();
  if (
    !exactKeys(agreements, POLICY_KEYS) ||
    REQUIRED_AGREEMENT_KEYS.some((key) =>
      !validateRequiredAgreement(agreements[key])
    )
  ) throw new SignupConsentValidationError();
  const guardianConsentRecorded = validateGuardian(
    agreements.childGuardian,
    expectedAge < 14,
  );

  return {
    schemaVersion: 1,
    policyVersions: Object.fromEntries(
      POLICY_KEYS.map((key) => [key, SIGNUP_POLICY_VERSION]),
    ),
    agreedAt: consent.agreedAt as string,
    audience,
    under14: expectedAge < 14,
    guardianConsentRecorded,
  };
};
