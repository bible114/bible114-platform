export type MemberSignupChurch = {
  name?: unknown;
  churchCodeHash?: unknown;
  isDeleted?: unknown;
  isVirtual?: unknown;
};

export type MemberSignupUser = {
  role?: unknown;
  churchId?: unknown;
  isDeleted?: unknown;
};

export type MemberSignupConsent = {
  schemaVersion?: unknown;
  policyVersions?: unknown;
  agreedAt?: unknown;
  audience?: unknown;
  ageAssessment?: unknown;
  agreements?: unknown;
};

export type MemberSignupFailureCode =
  | "CHURCH_UNAVAILABLE"
  | "INVALID_ENTRY_CODE"
  | "INVALID_PROFILE"
  | "INVALID_CONSENT"
  | "USER_CONFLICT"
  | "ROSTER_CONFLICT";

export class MemberSignupValidationError extends Error {
  readonly code: MemberSignupFailureCode;

  constructor(code: MemberSignupFailureCode) {
    super(code);
    this.name = "MemberSignupValidationError";
    this.code = code;
  }
}

const validDate = (value: string) => {
  const match = /^(\d{4})(\d{2})(\d{2})$/.exec(value);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 &&
      date.getUTCDate() === day
    ? { year, month, day }
    : null;
};

const calculateUnder14 = (birthdate: string, calendarDate: string) => {
  const birth = validDate(birthdate);
  const todayMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(calendarDate);
  if (!birth || !todayMatch) return null;
  const today = {
    year: Number(todayMatch[1]),
    month: Number(todayMatch[2]),
    day: Number(todayMatch[3]),
  };
  let age = today.year - birth.year;
  if (
    today.month < birth.month ||
    (today.month === birth.month && today.day < birth.day)
  ) age -= 1;
  return age < 0 ? null : age < 14;
};

const record = (value: unknown): Record<string, unknown> | null =>
  value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;

const legacyDateKey = (value: string) => {
  const match =
    /^(Sun|Mon|Tue|Wed|Thu|Fri|Sat) (Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec) (\d{2}) (\d{4})$/
      .exec(
        value,
      );
  if (!match) return null;
  const month = [
    "Jan",
    "Feb",
    "Mar",
    "Apr",
    "May",
    "Jun",
    "Jul",
    "Aug",
    "Sep",
    "Oct",
    "Nov",
    "Dec",
  ].indexOf(match[2]) + 1;
  const compact = `${match[4]}${String(month).padStart(2, "0")}${match[3]}`;
  return validDate(compact)
    ? `${match[4]}-${String(month).padStart(2, "0")}-${match[3]}`
    : null;
};

const validateConsent = (
  consent: MemberSignupConsent | null,
  birthdate: string,
  calendarDate: string,
) => {
  if (
    !consent || consent.schemaVersion !== 1 || consent.audience !== "member"
  ) {
    throw new MemberSignupValidationError("INVALID_CONSENT");
  }
  if (
    typeof consent.agreedAt !== "string" ||
    !/^\d{4}-\d{2}-\d{2}T/.test(consent.agreedAt) ||
    !Number.isFinite(Date.parse(consent.agreedAt))
  ) throw new MemberSignupValidationError("INVALID_CONSENT");

  const policyVersions = record(consent.policyVersions);
  const agreements = record(consent.agreements);
  const ageAssessment = record(consent.ageAssessment);
  const under14 = calculateUnder14(birthdate, calendarDate);
  if (!policyVersions || !agreements || !ageAssessment || under14 === null) {
    throw new MemberSignupValidationError("INVALID_CONSENT");
  }
  for (const key of ["terms", "privacy", "sensitive", "community"]) {
    if (
      typeof policyVersions[key] !== "string" || !policyVersions[key] ||
      record(agreements[key])?.agreed !== true
    ) throw new MemberSignupValidationError("INVALID_CONSENT");
  }
  if (
    ageAssessment.birthdate !== birthdate ||
    ageAssessment.under14 !== under14
  ) throw new MemberSignupValidationError("INVALID_CONSENT");
  const guardian = record(agreements.childGuardian);
  if (under14 && (!guardian || guardian.agreed !== true)) {
    throw new MemberSignupValidationError("INVALID_CONSENT");
  }
  return {
    schemaVersion: 1,
    policyVersions: Object.fromEntries(
      ["terms", "privacy", "sensitive", "community", "childGuardian"]
        .flatMap((key) =>
          typeof policyVersions[key] === "string"
            ? [[key, policyVersions[key]]]
            : []
        ),
    ),
    agreedAt: consent.agreedAt,
    audience: "member",
    under14,
    guardianConsentRecorded: guardian?.agreed === true,
  };
};

export const validateMemberSignup = (input: {
  uid: string;
  email: string;
  churchId: string;
  entryCodeHash: string;
  name: string;
  birthdate: string;
  guestProgress: {
    currentDay: number;
    streak: number;
    lastReadDate: string | null;
    planId: string;
  };
  calendarDate: string;
  church: MemberSignupChurch | null;
  consent: MemberSignupConsent | null;
  existingUser: MemberSignupUser | null;
  existingRoster: Record<string, unknown> | null;
}) => {
  const name = input.name.trim();
  const email = input.email.trim().toLowerCase();
  if (
    !input.uid || !name || name.length > 50 || !validDate(input.birthdate) ||
    !email || email.length > 254 || !email.includes("@")
  ) throw new MemberSignupValidationError("INVALID_PROFILE");
  const allowedPlans = new Set([
    "1year_sequential",
    "1year_revised",
    "1year_new",
    "nt_new",
    "readable_revised",
    "readable_new",
  ]);
  const guestProgress = input.guestProgress;
  const lastReadDateKey = guestProgress?.lastReadDate === null
    ? null
    : legacyDateKey(String(guestProgress?.lastReadDate || ""));
  if (
    !guestProgress || !Number.isInteger(guestProgress.currentDay) ||
    guestProgress.currentDay < 1 || guestProgress.currentDay > 365 ||
    !Number.isInteger(guestProgress.streak) || guestProgress.streak < 0 ||
    guestProgress.streak > 400 || !allowedPlans.has(guestProgress.planId) ||
    (guestProgress.lastReadDate !== null &&
      (!lastReadDateKey || lastReadDateKey > input.calendarDate))
  ) throw new MemberSignupValidationError("INVALID_PROFILE");
  const isUnaffiliated = input.churchId === "unaffiliated_v1";
  if (
    !input.church || input.church.isDeleted === true ||
    typeof input.church.name !== "string" || !input.church.name.trim() ||
    (isUnaffiliated && input.church.isVirtual !== true)
  ) throw new MemberSignupValidationError("CHURCH_UNAVAILABLE");
  if (
    !isUnaffiliated &&
    (typeof input.church.churchCodeHash !== "string" ||
      !input.church.churchCodeHash ||
      input.church.churchCodeHash !== input.entryCodeHash)
  ) throw new MemberSignupValidationError("INVALID_ENTRY_CODE");

  const consentSummary = validateConsent(
    input.consent,
    input.birthdate,
    input.calendarDate,
  );
  let status: "create" | "reactivate" | "alreadyCompleted" = "create";
  if (input.existingUser) {
    if (
      input.existingUser.role !== "member" ||
      input.existingUser.churchId !== input.churchId
    ) throw new MemberSignupValidationError("USER_CONFLICT");
    status = input.existingUser.isDeleted === true
      ? "reactivate"
      : "alreadyCompleted";
  }
  if (
    input.existingRoster &&
    (status === "create" ||
      (typeof input.existingRoster.uid === "string" &&
        input.existingRoster.uid !== input.uid))
  ) throw new MemberSignupValidationError("ROSTER_CONFLICT");

  return {
    status,
    profile: {
      name,
      email,
      birthdate: input.birthdate,
      churchName: input.church.name.trim(),
      consentSummary,
      guestProgress: {
        currentDay: guestProgress.currentDay,
        streak: guestProgress.streak,
        lastReadDate: guestProgress.lastReadDate,
        planId: guestProgress.planId,
      },
    },
  };
};
