import type { FirestoreDocument } from "../_shared/firestore.ts";
import {
  parseRosterTalentWallets,
  type TalentMembershipUser,
} from "./talentProgramCore.ts";

export const CONVERT_TO_PERSONAL_ACCOUNT_ACTION =
  "convertToPersonalAccount" as const;
export const MAX_CONVERT_PERSONAL_BALANCE = 1_000_000_000;

type UnknownRecord = Record<string, unknown>;

export type ConvertToPersonalAccountUser = TalentMembershipUser & {
  uid?: unknown;
  name?: unknown;
  birthdate?: unknown;
  email?: unknown;
  role?: unknown;
  accountType?: unknown;
  churchId?: unknown;
  churchName?: unknown;
  primaryOrgId?: unknown;
  isDeleted?: unknown;
  score?: unknown;
  talent?: unknown;
  talentMigrated?: unknown;
  talentWalletMigrated?: unknown;
  currentDay?: unknown;
  streak?: unknown;
  readCount?: unknown;
  lastReadDate?: unknown;
};

export type ConvertToPersonalAccountChurch = {
  name?: unknown;
  isDeleted?: unknown;
};

export type ConvertToPersonalAccountRoster = TalentMembershipUser & {
  uid?: unknown;
  name?: unknown;
  isDeleted?: unknown;
  score?: unknown;
  talent?: unknown;
  currentDay?: unknown;
  streak?: unknown;
  readCount?: unknown;
  lastReadDate?: unknown;
  joinedAt?: unknown;
  updatedAt?: unknown;
};

export type ConvertMembership = {
  departmentId: string;
  departmentName: string;
  subgroupId: string | null;
  subgroupName: string | null;
};

export type ConvertToPersonalAccountRosterSeed = {
  uid: string;
  name: string;
  score: number;
  talent: 0;
  currentDay: number;
  streak: number;
  readCount: number;
  lastReadDate: string | null;
  departmentId: string | null;
  departmentName: string | null;
  subgroupId: string | null;
  subgroupName: string | null;
  extraMemberships: ConvertMembership[];
};

export type ConvertToPersonalAccountRosterPatch = {
  talent?: 0;
  extraMemberships?: ConvertMembership[];
};

export type ConvertToPersonalAccountDecision = {
  status: "converted" | "alreadyConverted";
  primaryOrgId: string;
  tokenEmail: string;
  writeUser: boolean;
  writeRoster: boolean;
  rosterSeed: ConvertToPersonalAccountRosterSeed | null;
  rosterPatch: ConvertToPersonalAccountRosterPatch | null;
};

export type ConvertToPersonalAccountValidationCode =
  | "USER_UNAVAILABLE"
  | "INVALID_USER"
  | "INVALID_IDENTITY_EMAIL"
  | "SOURCE_CHURCH_UNAVAILABLE"
  | "INVALID_SOURCE_CHURCH"
  | "INVALID_ROSTERS"
  | "ROSTER_LIMIT"
  | "INVALID_SOURCE_ROSTER"
  | "INVALID_WALLET"
  | "INVALID_REPLAY_STATE";

export class ConvertToPersonalAccountValidationError extends Error {
  constructor(readonly code: ConvertToPersonalAccountValidationCode) {
    super(code);
    this.name = "ConvertToPersonalAccountValidationError";
  }
}

const isRecord = (value: unknown): value is UnknownRecord =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value);

const hasControlCharacters = (value: string): boolean =>
  [...value].some((character) => {
    const code = character.charCodeAt(0);
    return code <= 31 || code === 127;
  });

export const normalizeConvertPersonalDocumentId = (
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

const safeInteger = (
  value: unknown,
  min: number,
  max = Number.MAX_SAFE_INTEGER,
): value is number =>
  typeof value === "number" && Number.isSafeInteger(value) && value >= min &&
  value <= max;

const safeName = (value: unknown, max = 200): value is string =>
  typeof value === "string" && value === value.trim() && value.length >= 1 &&
  value.length <= max && !hasControlCharacters(value);

const safeLastReadDate = (value: unknown): value is string | null =>
  value === null || (typeof value === "string" && value === value.trim() &&
    value.length <= 128 && !hasControlCharacters(value));

const FIRESTORE_TIMESTAMP_PATTERN =
  /^(\d{4})-(\d{2})-(\d{2})T([01]\d|2[0-3]):([0-5]\d):([0-5]\d)(?:\.\d{1,9})?Z$/;

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

const isValidBirthdate = (value: unknown): value is string => {
  if (typeof value !== "string") return false;
  const match = /^(\d{4})(\d{2})(\d{2})$/.exec(value);
  if (!match) return false;
  const date = new Date(Date.UTC(
    Number(match[1]),
    Number(match[2]) - 1,
    Number(match[3]),
  ));
  return date.getUTCFullYear() === Number(match[1]) &&
    date.getUTCMonth() + 1 === Number(match[2]) &&
    date.getUTCDate() === Number(match[3]);
};

const validatePersonalPseudoEmail = (
  value: unknown,
  name: string,
  birthdate: string,
): string => {
  if (
    typeof value !== "string" || value !== value.trim() || value.length > 254 ||
    hasControlCharacters(value)
  ) {
    throw new ConvertToPersonalAccountValidationError(
      "INVALID_IDENTITY_EMAIL",
    );
  }
  let encodedName: string;
  try {
    encodedName = encodeURIComponent(name);
  } catch {
    throw new ConvertToPersonalAccountValidationError(
      "INVALID_IDENTITY_EMAIL",
    );
  }
  const expectedPrefix = `${encodedName}_${birthdate}p`;
  const expectedSuffix = "@bible.local";
  const lower = value.toLowerCase();
  const lowerPrefix = expectedPrefix.toLowerCase();
  if (!lower.startsWith(lowerPrefix) || !lower.endsWith(expectedSuffix)) {
    throw new ConvertToPersonalAccountValidationError(
      "INVALID_IDENTITY_EMAIL",
    );
  }
  const phone4 = value.slice(
    expectedPrefix.length,
    value.length - expectedSuffix.length,
  );
  if (!/^\d{4}$/.test(phone4)) {
    throw new ConvertToPersonalAccountValidationError(
      "INVALID_IDENTITY_EMAIL",
    );
  }
  return value;
};

const optionalId = (value: unknown): string | null => {
  if (value === undefined || value === null || value === "") return null;
  return normalizeConvertPersonalDocumentId(value);
};

const normalizeMembershipFields = (
  value: TalentMembershipUser,
  code: "INVALID_USER" | "INVALID_ROSTERS" | "INVALID_SOURCE_ROSTER",
) => {
  const departmentId = optionalId(value.departmentId);
  const subgroupId = optionalId(value.subgroupId);
  if (
    (value.departmentId !== undefined && value.departmentId !== null &&
      value.departmentId !== "" && !departmentId) ||
    (value.subgroupId !== undefined && value.subgroupId !== null &&
      value.subgroupId !== "" && !subgroupId) ||
    (departmentId === null && subgroupId !== null)
  ) throw new ConvertToPersonalAccountValidationError(code);

  const departmentName = departmentId === null
    ? null
    : (safeName(value.departmentName) ? value.departmentName : null);
  const subgroupName = subgroupId === null
    ? null
    : (safeName(value.subgroupName) ? value.subgroupName : null);
  if (
    (departmentId === null && ![undefined, null, ""].includes(
      value.departmentName as undefined | null | string,
    )) ||
    (subgroupId === null && ![undefined, null, ""].includes(
      value.subgroupName as undefined | null | string,
    )) ||
    (departmentId !== null && !departmentName) ||
    (subgroupId !== null && !subgroupName)
  ) throw new ConvertToPersonalAccountValidationError(code);

  return { departmentId, departmentName, subgroupId, subgroupName };
};

const normalizeExtraMemberships = (
  value: unknown,
  code: "INVALID_USER" | "INVALID_ROSTERS" | "INVALID_SOURCE_ROSTER",
  options: { allowMissing?: boolean } = {},
): { memberships: ConvertMembership[]; missing: boolean } => {
  if (value === undefined && options.allowMissing) {
    return { memberships: [], missing: true };
  }
  if (!Array.isArray(value) || value.length > 3) {
    throw new ConvertToPersonalAccountValidationError(code);
  }
  const seen = new Set<string>();
  const memberships = value.map((candidate) => {
    if (!isRecord(candidate)) {
      throw new ConvertToPersonalAccountValidationError(code);
    }
    const fields = normalizeMembershipFields(candidate, code);
    if (!fields.departmentId) {
      throw new ConvertToPersonalAccountValidationError(code);
    }
    const key = `${fields.departmentId}\u0000${fields.subgroupId || ""}`;
    if (seen.has(key)) throw new ConvertToPersonalAccountValidationError(code);
    seen.add(key);
    return {
      departmentId: fields.departmentId,
      departmentName: fields.departmentName!,
      subgroupId: fields.subgroupId,
      subgroupName: fields.subgroupName,
    };
  });
  return { memberships, missing: false };
};

const normalizeProgress = (
  value: ConvertToPersonalAccountUser | ConvertToPersonalAccountRoster,
  code: "INVALID_USER" | "INVALID_ROSTERS" | "INVALID_SOURCE_ROSTER",
) => {
  if (
    !safeInteger(value.score, 0, MAX_CONVERT_PERSONAL_BALANCE) ||
    !safeInteger(value.currentDay, 1, 365) ||
    !safeInteger(value.streak, 0, MAX_CONVERT_PERSONAL_BALANCE) ||
    !safeInteger(value.readCount, 1, MAX_CONVERT_PERSONAL_BALANCE) ||
    !safeLastReadDate(value.lastReadDate)
  ) throw new ConvertToPersonalAccountValidationError(code);
  return {
    score: value.score,
    currentDay: value.currentDay,
    streak: value.streak,
    readCount: value.readCount,
    lastReadDate: value.lastReadDate,
  };
};

const readTalent = (
  value: unknown,
  code: "INVALID_USER" | "INVALID_ROSTERS" | "INVALID_SOURCE_ROSTER",
  options: { allowMissing?: boolean } = {},
): { talent: number; missing: boolean } => {
  if (value === undefined && options.allowMissing) {
    return { talent: 0, missing: true };
  }
  if (!safeInteger(value, 0, MAX_CONVERT_PERSONAL_BALANCE)) {
    throw new ConvertToPersonalAccountValidationError(code);
  }
  return { talent: value, missing: false };
};

const validateChurch = (church: ConvertToPersonalAccountChurch | null) => {
  if (!isRecord(church)) {
    throw new ConvertToPersonalAccountValidationError(
      "SOURCE_CHURCH_UNAVAILABLE",
    );
  }
  if (church.isDeleted === true) {
    throw new ConvertToPersonalAccountValidationError(
      "SOURCE_CHURCH_UNAVAILABLE",
    );
  }
  if (
    (church.isDeleted !== undefined && church.isDeleted !== false) ||
    !safeName(church.name)
  ) {
    throw new ConvertToPersonalAccountValidationError("INVALID_SOURCE_CHURCH");
  }
};

const stableJson = (value: unknown): string => {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (isRecord(value)) {
    return `{${
      Object.keys(value).sort().map((key) =>
        `${JSON.stringify(key)}:${stableJson(value[key])}`
      ).join(",")
    }}`;
  }
  return JSON.stringify(value);
};

const sourcePathSuffix = (orgId: string, uid: string) =>
  `/documents/churches/${orgId}/roster/${uid}`;

export const decideConvertToPersonalAccount = (input: {
  authenticatedUid: string;
  tokenEmail: string;
  expectedSourceOrgId?: string | null;
  user: ConvertToPersonalAccountUser | null;
  sourceChurch: ConvertToPersonalAccountChurch | null;
  rosterDocuments: FirestoreDocument<ConvertToPersonalAccountRoster>[];
  sourceRosterDocument:
    | FirestoreDocument<ConvertToPersonalAccountRoster>
    | null;
}): ConvertToPersonalAccountDecision => {
  const uid = normalizeConvertPersonalDocumentId(input.authenticatedUid);
  if (!uid || uid !== input.authenticatedUid) {
    throw new ConvertToPersonalAccountValidationError("INVALID_USER");
  }
  if (!isRecord(input.user)) {
    throw new ConvertToPersonalAccountValidationError("USER_UNAVAILABLE");
  }
  const user = input.user;
  if (user.uid !== undefined && user.uid !== null && user.uid !== uid) {
    throw new ConvertToPersonalAccountValidationError("INVALID_USER");
  }
  if (
    user.role !== "member" || user.isDeleted === true ||
    (user.isDeleted !== undefined && user.isDeleted !== false)
  ) throw new ConvertToPersonalAccountValidationError("USER_UNAVAILABLE");
  if (
    !safeName(user.name, 50) || !isValidBirthdate(user.birthdate) ||
    user.talentMigrated !== true
  ) throw new ConvertToPersonalAccountValidationError("INVALID_USER");

  const tokenEmail = validatePersonalPseudoEmail(
    input.tokenEmail,
    user.name,
    user.birthdate,
  );
  const progress = normalizeProgress(user, "INVALID_USER");
  const userTalent = readTalent(user.talent, "INVALID_USER").talent;
  const membership = normalizeMembershipFields(user, "INVALID_USER");
  const userExtras = normalizeExtraMemberships(
    user.extraMemberships,
    "INVALID_USER",
    { allowMissing: true },
  ).memberships;

  const replay = input.expectedSourceOrgId !== undefined &&
    input.expectedSourceOrgId !== null;
  const rawSourceOrgId = replay ? input.expectedSourceOrgId : user.churchId;
  const sourceOrgId = normalizeConvertPersonalDocumentId(rawSourceOrgId);
  if (
    !sourceOrgId || sourceOrgId !== rawSourceOrgId ||
    sourceOrgId === "unaffiliated_v1"
  ) {
    throw new ConvertToPersonalAccountValidationError(
      replay ? "INVALID_REPLAY_STATE" : "USER_UNAVAILABLE",
    );
  }
  validateChurch(input.sourceChurch);

  if (replay) {
    if (
      user.accountType !== "personal" || user.churchId !== null ||
      user.churchName !== null || user.primaryOrgId !== sourceOrgId ||
      user.email !== tokenEmail
    ) {
      throw new ConvertToPersonalAccountValidationError(
        "INVALID_REPLAY_STATE",
      );
    }
  } else {
    const validLegacyAccountType = user.accountType === undefined ||
      user.accountType === null || user.accountType === "church" ||
      user.accountType === "member";
    if (
      !validLegacyAccountType ||
      (user.primaryOrgId !== undefined && user.primaryOrgId !== null) ||
      (user.talentWalletMigrated !== undefined &&
        typeof user.talentWalletMigrated !== "boolean")
    ) throw new ConvertToPersonalAccountValidationError("USER_UNAVAILABLE");
  }

  if (!Array.isArray(input.rosterDocuments)) {
    throw new ConvertToPersonalAccountValidationError("INVALID_ROSTERS");
  }
  const parsed = parseRosterTalentWallets(input.rosterDocuments, uid);
  if (!parsed.ok) {
    throw new ConvertToPersonalAccountValidationError(
      parsed.reason === "TOO_MANY" ? "ROSTER_LIMIT" : "INVALID_ROSTERS",
    );
  }
  for (const { user: rawRoster } of parsed.wallets) {
    const roster = rawRoster as ConvertToPersonalAccountRoster;
    if (
      !isRecord(roster) || roster.uid !== uid || !safeName(roster.name) ||
      (roster.isDeleted !== undefined && roster.isDeleted !== false)
    ) throw new ConvertToPersonalAccountValidationError("INVALID_ROSTERS");
    normalizeProgress(roster, "INVALID_ROSTERS");
    readTalent(roster.talent, "INVALID_ROSTERS", { allowMissing: true });
    normalizeMembershipFields(roster, "INVALID_ROSTERS");
    normalizeExtraMemberships(roster.extraMemberships, "INVALID_ROSTERS", {
      allowMissing: true,
    });
  }

  const queriedSource = parsed.wallets.find(({ orgId }) =>
    orgId === sourceOrgId
  )?.user as ConvertToPersonalAccountRoster | undefined;
  if (Boolean(queriedSource) !== Boolean(input.sourceRosterDocument)) {
    throw new ConvertToPersonalAccountValidationError(
      "INVALID_SOURCE_ROSTER",
    );
  }
  let rosterPatch: ConvertToPersonalAccountRosterPatch | null = null;
  let sourceRosterTalent = 0;
  if (input.sourceRosterDocument) {
    if (
      !input.sourceRosterDocument.name.endsWith(
        sourcePathSuffix(sourceOrgId, uid),
      ) || !queriedSource ||
      stableJson(queriedSource) !== stableJson(input.sourceRosterDocument.data)
    ) {
      throw new ConvertToPersonalAccountValidationError(
        "INVALID_SOURCE_ROSTER",
      );
    }
    const sourceRoster = input.sourceRosterDocument.data;
    if (
      !isFirestoreTimestamp(sourceRoster.joinedAt) ||
      !isFirestoreTimestamp(sourceRoster.updatedAt)
    ) {
      throw new ConvertToPersonalAccountValidationError(
        "INVALID_SOURCE_ROSTER",
      );
    }
    normalizeProgress(sourceRoster, "INVALID_SOURCE_ROSTER");
    normalizeMembershipFields(sourceRoster, "INVALID_SOURCE_ROSTER");
    const talentState = readTalent(
      sourceRoster.talent,
      "INVALID_SOURCE_ROSTER",
      { allowMissing: true },
    );
    const extraState = normalizeExtraMemberships(
      sourceRoster.extraMemberships,
      "INVALID_SOURCE_ROSTER",
      { allowMissing: true },
    );
    sourceRosterTalent = talentState.talent;
    rosterPatch = talentState.missing || extraState.missing
      ? {
        ...(talentState.missing ? { talent: 0 as const } : {}),
        ...(extraState.missing ? { extraMemberships: userExtras } : {}),
      }
      : null;
  } else if (replay) {
    throw new ConvertToPersonalAccountValidationError("INVALID_REPLAY_STATE");
  } else if (parsed.wallets.length >= 3) {
    throw new ConvertToPersonalAccountValidationError("ROSTER_LIMIT");
  }

  if (userTalent > MAX_CONVERT_PERSONAL_BALANCE - sourceRosterTalent) {
    throw new ConvertToPersonalAccountValidationError("INVALID_WALLET");
  }
  if (replay) {
    if (
      (user.talentWalletMigrated !== undefined &&
        typeof user.talentWalletMigrated !== "boolean")
    ) {
      throw new ConvertToPersonalAccountValidationError(
        "INVALID_REPLAY_STATE",
      );
    }
    return {
      status: "alreadyConverted",
      primaryOrgId: sourceOrgId,
      tokenEmail,
      writeUser: false,
      writeRoster: Boolean(rosterPatch),
      rosterSeed: null,
      rosterPatch,
    };
  }

  const rosterSeed: ConvertToPersonalAccountRosterSeed | null =
    input.sourceRosterDocument ? null : {
      uid,
      name: user.name,
      ...progress,
      talent: 0,
      ...membership,
      extraMemberships: userExtras,
    };
  return {
    status: "converted",
    primaryOrgId: sourceOrgId,
    tokenEmail,
    writeUser: true,
    writeRoster: Boolean(rosterSeed || rosterPatch),
    rosterSeed,
    rosterPatch,
  };
};
