import {
  type SignupConsentSummary,
  SignupConsentValidationError,
  type StoredSignupConsent,
  validateStoredSignupConsent,
} from "./signupConsentCore.ts";
import { PLATFORM_STATS_READER_COUNTED_FIELD } from "./platformStatsCore.ts";

export type MemberSignupChurch = {
  name?: unknown;
  churchCodeHash?: unknown;
  isDeleted?: unknown;
  isVirtual?: unknown;
};

export type MemberSignupUser = {
  [key: string]: unknown;
  role?: unknown;
  churchId?: unknown;
  isDeleted?: unknown;
};

export const buildMemberReactivation = ({
  existingUser,
  consentSummary,
  now,
}: {
  existingUser: MemberSignupUser;
  consentSummary: SignupConsentSummary;
  now: Date;
}) => {
  if (
    existingUser.isDeleted !== true ||
    existingUser[PLATFORM_STATS_READER_COUNTED_FIELD] !== false
  ) {
    throw new MemberSignupValidationError("STATS_REBUILD_REQUIRED");
  }
  const countedAfter = existingUser.excludeFromPublicStats !== true;
  const patch = {
    isDeleted: false,
    deletedAt: null,
    deletedBy: null,
    [PLATFORM_STATS_READER_COUNTED_FIELD]: countedAfter,
    consentSummary,
    updatedAt: now,
  };
  return {
    patch,
    updateMask: [
      "isDeleted",
      "deletedAt",
      "deletedBy",
      PLATFORM_STATS_READER_COUNTED_FIELD,
      "consentSummary",
      "updatedAt",
    ],
    responseUser: { ...existingUser, ...patch } as
      & MemberSignupUser
      & typeof patch,
    readerDelta: countedAfter ? 1 as const : 0 as const,
  };
};

export type MemberSignupConsent = StoredSignupConsent;

export type MemberSignupCredentials = {
  password?: unknown;
  phone4?: unknown;
};

export type MemberSignupFailureCode =
  | "CHURCH_UNAVAILABLE"
  | "INVALID_ENTRY_CODE"
  | "INVALID_PROFILE"
  | "INVALID_CONSENT"
  | "USER_CONFLICT"
  | "ROSTER_CONFLICT"
  | "STATS_REBUILD_REQUIRED";

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

export const validateMemberSignup = (input: {
  uid: string;
  email: string;
  signInProvider: string | null;
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
  now: Date;
  church: MemberSignupChurch | null;
  consent: MemberSignupConsent | null;
  credentials: MemberSignupCredentials | null;
  existingUser: MemberSignupUser | null;
  existingRoster: Record<string, unknown> | null;
}) => {
  const name = input.name.trim();
  const email = input.email.trim().toLowerCase();
  const password = typeof input.credentials?.password === "string"
    ? input.credentials.password
    : "";
  const expectedEmail = `${
    encodeURIComponent(name)
  }_${input.birthdate}_${input.churchId}@bible.local`
    .toLowerCase();
  if (
    !input.uid || !name || name.length > 50 || !validDate(input.birthdate) ||
    !email || email.length > 254 || !email.includes("@") ||
    input.signInProvider !== "password" ||
    password.length < 6 || password.length > 128 ||
    /[\u0000-\u001f\u007f]/.test(password)
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
  const planTotalDays = guestProgress.planId === "readable_revised" ||
      guestProgress.planId === "readable_new"
    ? 60
    : 365;
  const normalizedCurrentDay =
    ((guestProgress.currentDay - 1) % planTotalDays) + 1;
  const isUnaffiliated = input.churchId === "unaffiliated_v1";
  if (isUnaffiliated) {
    const phone4 = typeof input.credentials?.phone4 === "string"
      ? input.credentials.phone4.trim()
      : "";
    const expectedUnaffiliatedEmail = `${
      encodeURIComponent(name)
    }_${input.birthdate}p${phone4}_unaffiliated_v1@bible.local`
      .toLowerCase();
    if (
      !/^\d{4}$/.test(phone4) ||
      email !== expectedUnaffiliatedEmail
    ) throw new MemberSignupValidationError("INVALID_PROFILE");
  } else if (email !== expectedEmail) {
    throw new MemberSignupValidationError("INVALID_PROFILE");
  }
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

  let consentSummary;
  try {
    consentSummary = validateStoredSignupConsent({
      consent: input.consent,
      birthdate: input.birthdate,
      calendarDate: input.calendarDate,
      now: input.now,
      audience: "member",
      allowedSources: ["church_member_signup"],
    });
  } catch (error) {
    if (error instanceof SignupConsentValidationError) {
      throw new MemberSignupValidationError("INVALID_CONSENT");
    }
    throw error;
  }
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
        currentDay: normalizedCurrentDay,
        streak: guestProgress.streak,
        lastReadDate: guestProgress.lastReadDate,
        planId: guestProgress.planId,
      },
    },
  };
};
