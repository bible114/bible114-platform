export const MAX_PERSONAL_TALENT_WALLET_VALUE = 1_000_000_000;

type UnknownRecord = Record<string, unknown>;

export type PersonalTalentWalletUser = {
  role?: unknown;
  accountType?: unknown;
  isDeleted?: unknown;
  primaryOrgId?: unknown;
  talent?: unknown;
  talentWalletMigrated?: unknown;
};

export type PersonalTalentWalletRoster = {
  uid?: unknown;
  isDeleted?: unknown;
  talent?: unknown;
  extraMemberships?: unknown;
};

export type PersonalTalentWalletRosterPatch = {
  talent?: number;
  extraMemberships?: unknown[];
};

export type PersonalTalentWalletMigrationDecision =
  | {
    status: "primaryMissing";
    primaryOrgId: string;
    userTalent: number;
    writeUser: false;
    writeRoster: false;
  }
  | {
    status: "migrated" | "alreadyMigrated";
    primaryOrgId: string;
    userTalent: number;
    rosterTalent: number;
    nextRosterTalent: number;
    writeUser: boolean;
    writeRoster: boolean;
    rosterPatch: PersonalTalentWalletRosterPatch | null;
  };

export type PersonalTalentWalletMigrationValidationCode =
  | "USER_UNAVAILABLE"
  | "INVALID_USER"
  | "INVALID_PRIMARY_ORG"
  | "INVALID_ROSTER"
  | "INVALID_WALLET";

export class PersonalTalentWalletMigrationValidationError extends Error {
  constructor(readonly code: PersonalTalentWalletMigrationValidationCode) {
    super(code);
    this.name = "PersonalTalentWalletMigrationValidationError";
  }
}

const isRecord = (value: unknown): value is UnknownRecord =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value);

const hasControlCharacters = (value: string): boolean =>
  /[\u0000-\u001f\u007f]/.test(value);

export const normalizePersonalWalletDocumentId = (
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

const readTalent = (value: unknown): number | null =>
  typeof value === "number" && Number.isSafeInteger(value) && value >= 0 &&
    value <= MAX_PERSONAL_TALENT_WALLET_VALUE
    ? value
    : null;

export const decidePersonalTalentWalletMigration = (input: {
  authenticatedUid: string;
  user: PersonalTalentWalletUser | null;
  roster: PersonalTalentWalletRoster | null;
}): PersonalTalentWalletMigrationDecision => {
  const uid = normalizePersonalWalletDocumentId(input.authenticatedUid);
  if (!uid || uid !== input.authenticatedUid) {
    throw new PersonalTalentWalletMigrationValidationError("INVALID_USER");
  }
  if (!isRecord(input.user)) {
    throw new PersonalTalentWalletMigrationValidationError(
      "USER_UNAVAILABLE",
    );
  }
  if (
    input.user.isDeleted !== undefined &&
    typeof input.user.isDeleted !== "boolean"
  ) {
    throw new PersonalTalentWalletMigrationValidationError("INVALID_USER");
  }
  if (
    input.user.isDeleted === true || input.user.role !== "member" ||
    input.user.accountType !== "personal"
  ) {
    throw new PersonalTalentWalletMigrationValidationError(
      "USER_UNAVAILABLE",
    );
  }
  if (
    input.user.talentWalletMigrated !== undefined &&
    typeof input.user.talentWalletMigrated !== "boolean"
  ) {
    throw new PersonalTalentWalletMigrationValidationError("INVALID_USER");
  }

  const primaryOrgId = normalizePersonalWalletDocumentId(
    input.user.primaryOrgId,
  );
  if (!primaryOrgId || primaryOrgId !== input.user.primaryOrgId) {
    throw new PersonalTalentWalletMigrationValidationError(
      "INVALID_PRIMARY_ORG",
    );
  }
  const userTalent = readTalent(input.user.talent);
  if (userTalent === null) {
    throw new PersonalTalentWalletMigrationValidationError("INVALID_WALLET");
  }
  // 과거 브라우저 제명 경로가 personal 사용자의 primary roster만 지운 계정은
  // 로그인 자체를 막지 않는다. user 정체성과 지갑이 모두 canonical일 때만
  // 무쓰기 상태를 돌려주며 primaryOrgId나 잔액을 임의로 고치지 않는다.
  if (input.roster === null) {
    return {
      status: "primaryMissing",
      primaryOrgId,
      userTalent,
      writeUser: false,
      writeRoster: false,
    };
  }
  if (!isRecord(input.roster)) {
    throw new PersonalTalentWalletMigrationValidationError("INVALID_ROSTER");
  }
  if (
    input.roster.isDeleted !== undefined &&
    typeof input.roster.isDeleted !== "boolean"
  ) {
    throw new PersonalTalentWalletMigrationValidationError("INVALID_ROSTER");
  }
  if (
    input.roster.isDeleted === true || input.roster.uid !== uid
  ) {
    throw new PersonalTalentWalletMigrationValidationError("INVALID_ROSTER");
  }

  // T97 이전 개인/전환 명부에는 talent와 extraMemberships가 아예 없을 수
  // 있었다. 오직 undefined만 legacy 0/[]로 해석하고, null·문자열·음수 등
  // 명시된 손상 값은 기존처럼 fail closed한다.
  const legacyTalentMissing = input.roster.talent === undefined;
  const rosterTalent = legacyTalentMissing
    ? 0
    : readTalent(input.roster.talent);
  if (rosterTalent === null) {
    throw new PersonalTalentWalletMigrationValidationError("INVALID_WALLET");
  }
  const legacyExtraMembershipsMissing =
    input.roster.extraMemberships === undefined;
  if (
    !legacyExtraMembershipsMissing &&
    !Array.isArray(input.roster.extraMemberships)
  ) {
    throw new PersonalTalentWalletMigrationValidationError("INVALID_ROSTER");
  }
  if (
    userTalent > MAX_PERSONAL_TALENT_WALLET_VALUE - rosterTalent
  ) {
    throw new PersonalTalentWalletMigrationValidationError("INVALID_WALLET");
  }

  const nextRosterTalent = rosterTalent + userTalent;
  const rosterPatch: PersonalTalentWalletRosterPatch = {
    ...((legacyTalentMissing || userTalent > 0)
      ? { talent: nextRosterTalent }
      : {}),
    ...(legacyExtraMembershipsMissing ? { extraMemberships: [] } : {}),
  };
  const writeRoster = Object.keys(rosterPatch).length > 0;
  const writeUser = userTalent > 0 ||
    input.user.talentWalletMigrated !== true;

  if (!writeUser && !writeRoster) {
    return {
      status: "alreadyMigrated",
      primaryOrgId,
      userTalent,
      rosterTalent,
      nextRosterTalent,
      writeUser: false,
      writeRoster: false,
      rosterPatch: null,
    };
  }
  return {
    status: "migrated",
    primaryOrgId,
    userTalent,
    rosterTalent,
    nextRosterTalent,
    writeUser,
    writeRoster,
    rosterPatch: writeRoster ? rosterPatch : null,
  };
};
