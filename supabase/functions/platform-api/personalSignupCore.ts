import {
  SignupConsentValidationError,
  type StoredSignupConsent,
  validateStoredSignupConsent,
} from "./signupConsentCore.ts";

export type PersonalSignupChurch = {
  name?: unknown;
  churchCodeHash?: unknown;
  departments?: unknown;
  communities?: unknown;
  isDeleted?: unknown;
};

export type PersonalSignupConsent = StoredSignupConsent;

export type PersonalSignupUser = {
  role?: unknown;
  accountType?: unknown;
  primaryOrgId?: unknown;
  isDeleted?: unknown;
};

export type PersonalSignupFailureCode =
  | "INVALID_PROFILE"
  | "INVALID_CONSENT"
  | "CHURCH_UNAVAILABLE"
  | "INVALID_ENTRY_CODE"
  | "INVALID_DEPARTMENT"
  | "INVALID_SUBGROUP"
  | "USER_CONFLICT"
  | "ROSTER_CONFLICT";

export class PersonalSignupValidationError extends Error {
  readonly code: PersonalSignupFailureCode;
  constructor(code: PersonalSignupFailureCode) {
    super(code);
    this.name = "PersonalSignupValidationError";
    this.code = code;
  }
}

const record = (value: unknown): Record<string, unknown> | null =>
  value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;

const validDate = (value: string) => {
  const match = /^(\d{4})(\d{2})(\d{2})$/.exec(value);
  if (!match) return null;
  const date = new Date(
    Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])),
  );
  return date.getUTCFullYear() === Number(match[1]) &&
      date.getUTCMonth() === Number(match[2]) - 1 &&
      date.getUTCDate() === Number(match[3])
    ? date
    : null;
};

const legacyDateKey = (value: string) => {
  const match =
    /^(Sun|Mon|Tue|Wed|Thu|Fri|Sat) (Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec) (\d{2}) (\d{4})$/
      .exec(value);
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

const unit = (value: unknown) => {
  if (typeof value === "string") {
    const text = value.trim();
    return text ? { id: text, name: text, subgroups: [] as unknown[] } : null;
  }
  const data = record(value);
  if (!data) return null;
  const name = typeof data.name === "string" ? data.name.trim() : "";
  const id = typeof data.id === "string" && data.id.trim()
    ? data.id.trim()
    : name;
  return id
    ? {
      id,
      name: name || id,
      subgroups: Array.isArray(data.subgroups) ? data.subgroups : [],
    }
    : null;
};

export const validatePersonalSignup = (input: {
  uid: string;
  email: string | null;
  signInProvider: string | null;
  authProvider: string;
  name: string;
  birthdate: string;
  guestProgress: {
    currentDay: number;
    streak: number;
    lastReadDate: string | null;
    planId: string;
  };
  calendarDate: string;
  now: Date;
  churchId: string;
  entryCodeHash: string;
  departmentId: string;
  subgroupId: string;
  church: PersonalSignupChurch | null;
  consent: PersonalSignupConsent | null;
  existingUser: PersonalSignupUser | null;
  existingRoster: Record<string, unknown> | null;
}) => {
  const name = input.name.trim();
  const email = input.email?.trim().toLowerCase() || null;
  const providerValid = (input.authProvider === "password" &&
    input.signInProvider === "password") ||
    (input.authProvider === "google.com" &&
      input.signInProvider === "google.com") ||
    (input.authProvider === "kakao.com" && input.signInProvider === "custom");
  const progress = input.guestProgress;
  const plans = new Set([
    "1year_sequential",
    "1year_revised",
    "1year_new",
    "nt_new",
    "readable_revised",
    "readable_new",
  ]);
  const lastDate = progress?.lastReadDate === null
    ? null
    : legacyDateKey(String(progress?.lastReadDate || ""));
  if (
    !input.uid || !name || name.length > 50 || !validDate(input.birthdate) ||
    !providerValid ||
    (input.signInProvider !== "custom" &&
      (!email || email.length > 254 || !email.includes("@"))) ||
    !progress || !Number.isInteger(progress.currentDay) ||
    progress.currentDay < 1 || progress.currentDay > 365 ||
    !Number.isInteger(progress.streak) || progress.streak < 0 ||
    progress.streak > 400 ||
    !plans.has(progress.planId) ||
    (progress.lastReadDate !== null &&
      (!lastDate || lastDate > input.calendarDate))
  ) {
    throw new PersonalSignupValidationError("INVALID_PROFILE");
  }
  const planTotalDays = progress.planId === "readable_revised" ||
      progress.planId === "readable_new"
    ? 60
    : 365;
  const guestProgress = {
    ...progress,
    currentDay: ((progress.currentDay - 1) % planTotalDays) + 1,
  };
  let summary;
  try {
    const allowedSources = input.authProvider === "password"
      ? ["manual_personal_signup"]
      : input.authProvider === "google.com"
      ? ["google_personal_signup", "google.com_personal_signup"]
      : ["kakao_personal_signup", "kakao.com_personal_signup"];
    summary = validateStoredSignupConsent({
      consent: input.consent,
      birthdate: input.birthdate,
      calendarDate: input.calendarDate,
      now: input.now,
      audience: "personal",
      allowedSources,
    });
  } catch (error) {
    if (error instanceof SignupConsentValidationError) {
      throw new PersonalSignupValidationError("INVALID_CONSENT");
    }
    throw error;
  }

  let membership: Record<string, unknown> | null = null;
  if (input.churchId) {
    if (input.churchId === "unaffiliated_v1") {
      membership = {
        departmentId: null,
        departmentName: null,
        subgroupId: null,
        subgroupName: null,
      };
    } else {
      if (
        !input.church || input.church.isDeleted === true ||
        typeof input.church.name !== "string" || !input.church.name.trim()
      ) {
        throw new PersonalSignupValidationError("CHURCH_UNAVAILABLE");
      }
      if (input.church.churchCodeHash !== input.entryCodeHash) {
        throw new PersonalSignupValidationError("INVALID_ENTRY_CODE");
      }
      const raw = Array.isArray(input.church.departments)
        ? input.church.departments
        : (Array.isArray(input.church.communities)
          ? input.church.communities
          : []);
      const department = raw.map(unit).find((item) =>
        item?.id === input.departmentId
      );
      if (!department) {
        throw new PersonalSignupValidationError("INVALID_DEPARTMENT");
      }
      const subgroups = department.subgroups.map(unit).filter(Boolean) as Array<
        { id: string; name: string }
      >;
      const subgroup = input.subgroupId
        ? subgroups.find((item) => item.id === input.subgroupId)
        : null;
      if (
        (subgroups.length && !subgroup) ||
        (!subgroups.length && input.subgroupId)
      ) {
        throw new PersonalSignupValidationError("INVALID_SUBGROUP");
      }
      membership = {
        departmentId: department.id,
        departmentName: department.name,
        subgroupId: subgroup?.id || "",
        subgroupName: subgroup?.name || "",
      };
    }
  }

  if (input.existingUser) {
    if (
      input.existingUser.isDeleted === true ||
      input.existingUser.role !== "member" ||
      input.existingUser.accountType !== "personal" ||
      (input.existingUser.primaryOrgId || "") !== input.churchId
    ) {
      throw new PersonalSignupValidationError("USER_CONFLICT");
    }
    if (
      input.churchId &&
      (!input.existingRoster || input.existingRoster.uid !== input.uid)
    ) {
      throw new PersonalSignupValidationError("ROSTER_CONFLICT");
    }
    return {
      status: "alreadyCompleted" as const,
      membership,
      consentSummary: summary,
      email,
      guestProgress,
    };
  }
  if (input.existingRoster) {
    throw new PersonalSignupValidationError("ROSTER_CONFLICT");
  }
  return {
    status: "create" as const,
    membership,
    consentSummary: summary,
    email,
    guestProgress,
  };
};
