import type { FirestoreDocument } from "../_shared/firestore.ts";
import { projectCommunityProgressIdentity } from "./communityProgressCore.ts";
import {
  normalizeStoredDocumentId,
  parseRosterTalentWallets,
  type TalentMembershipUser,
} from "./talentProgramCore.ts";

export const JOIN_SOLO_COMMUNITY_ACTION = "joinSoloCommunity" as const;
export const SOLO_COMMUNITY_ID = "unaffiliated_v1" as const;
export const MAX_SOLO_COMMUNITY_BALANCE = 1_000_000_000;

type UnknownRecord = Record<string, unknown>;

export type JoinSoloCommunityUser = {
  uid?: unknown;
  name?: unknown;
  role?: unknown;
  accountType?: unknown;
  churchId?: unknown;
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
  planId?: unknown;
  fixtureType?: unknown;
};

export type JoinSoloCommunityRoster = TalentMembershipUser & {
  uid?: unknown;
  name?: unknown;
  isDeleted?: unknown;
  score?: unknown;
  talent?: unknown;
  currentDay?: unknown;
  streak?: unknown;
  readCount?: unknown;
  lastReadDate?: unknown;
  planId?: unknown;
  fixtureType?: unknown;
  joinedAt?: unknown;
  updatedAt?: unknown;
};

export type JoinSoloCommunityRosterSeed = {
  uid: string;
  name: string;
  score: number;
  talent: 0;
  currentDay: number;
  streak: number;
  readCount: number;
  lastReadDate: string | null;
  planId: string;
  fixtureType: "reading-badge-test" | null;
  departmentId: null;
  departmentName: null;
  subgroupId: null;
  subgroupName: null;
  extraMemberships: [];
};

export type JoinSoloCommunityDecision = {
  status:
    | "joined"
    | "rosterRepaired"
    | "primaryRepaired"
    | "alreadyJoined";
  writeRoster: boolean;
  writeUser: boolean;
  rosterSeed: JoinSoloCommunityRosterSeed | null;
  rosterPatch: { talent?: 0; extraMemberships?: [] } | null;
};

export type JoinSoloCommunityValidationCode =
  | "USER_UNAVAILABLE"
  | "INVALID_USER"
  | "INVALID_ROSTERS"
  | "ROSTER_LIMIT"
  | "INVALID_TARGET"
  | "INVALID_PRIMARY";

export class JoinSoloCommunityValidationError extends Error {
  constructor(readonly code: JoinSoloCommunityValidationCode) {
    super(code);
    this.name = "JoinSoloCommunityValidationError";
  }
}

const isRecord = (value: unknown): value is UnknownRecord =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value);

const hasControlCharacters = (value: string): boolean =>
  /[\u0000-\u001f\u007f]/.test(value);

export const normalizeSoloCommunityDocumentId = (
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

const safeName = (value: unknown): value is string =>
  typeof value === "string" && value === value.trim() && value.length >= 1 &&
  value.length <= 200 && !hasControlCharacters(value);

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

const validateSafeProgressAndWallet = (
  value: JoinSoloCommunityUser | JoinSoloCommunityRoster,
  code: "INVALID_USER" | "INVALID_ROSTERS" | "INVALID_TARGET",
  options: { allowMissingTalent?: boolean } = {},
) => {
  const validTalent = options.allowMissingTalent && value.talent === undefined
    ? true
    : safeInteger(value.talent, 0, MAX_SOLO_COMMUNITY_BALANCE);
  if (
    !safeInteger(value.score, 0, MAX_SOLO_COMMUNITY_BALANCE) ||
    !validTalent ||
    !safeInteger(value.currentDay, 1, 365) ||
    !safeInteger(value.streak, 0) ||
    !safeInteger(value.readCount, 1) ||
    !safeLastReadDate(value.lastReadDate)
  ) throw new JoinSoloCommunityValidationError(code);
};

const validateUser = (
  uid: string,
  user: JoinSoloCommunityUser | null,
): { primaryOrgId: string | null; rosterSeed: JoinSoloCommunityRosterSeed } => {
  if (!isRecord(user)) {
    throw new JoinSoloCommunityValidationError("USER_UNAVAILABLE");
  }
  if (user.uid !== undefined && user.uid !== null && user.uid !== uid) {
    throw new JoinSoloCommunityValidationError("INVALID_USER");
  }
  if (
    user.role !== "member" || user.accountType !== "personal" ||
    user.churchId !== null || user.isDeleted === true
  ) throw new JoinSoloCommunityValidationError("USER_UNAVAILABLE");
  if (
    (user.isDeleted !== undefined && user.isDeleted !== false) ||
    user.talentMigrated !== true || !safeName(user.name)
  ) throw new JoinSoloCommunityValidationError("INVALID_USER");
  if (
    user.talentWalletMigrated !== undefined &&
    typeof user.talentWalletMigrated !== "boolean"
  ) throw new JoinSoloCommunityValidationError("INVALID_USER");
  validateSafeProgressAndWallet(user, "INVALID_USER");

  let primaryOrgId: string | null = null;
  if (user.primaryOrgId !== null) {
    primaryOrgId = normalizeSoloCommunityDocumentId(user.primaryOrgId);
    if (!primaryOrgId || primaryOrgId !== user.primaryOrgId) {
      throw new JoinSoloCommunityValidationError("INVALID_PRIMARY");
    }
  }
  return {
    primaryOrgId,
    rosterSeed: {
      uid,
      name: user.name,
      score: user.score as number,
      talent: 0,
      currentDay: user.currentDay as number,
      streak: user.streak as number,
      readCount: user.readCount as number,
      lastReadDate: user.lastReadDate as string | null,
      ...projectCommunityProgressIdentity(user),
      departmentId: null,
      departmentName: null,
      subgroupId: null,
      subgroupName: null,
      extraMemberships: [],
    },
  };
};

const validateActiveRoster = (
  roster: JoinSoloCommunityRoster,
  uid: string,
  code: "INVALID_ROSTERS" | "INVALID_TARGET",
) => {
  if (!isRecord(roster) || roster.uid !== uid || !safeName(roster.name)) {
    throw new JoinSoloCommunityValidationError(code);
  }
  if (
    roster.isDeleted !== undefined && roster.isDeleted !== false
  ) throw new JoinSoloCommunityValidationError(code);
  // T97 이전 일반 개인 명부도 talent/extraMemberships가 없을 수 있다.
  // join 자체는 이 지갑을 사용하지 않으며 후속 primary wallet action이
  // undefined만 0/[]로 materialize한다. 명시된 손상 값은 계속 거부한다.
  validateSafeProgressAndWallet(roster, code, { allowMissingTalent: true });
  if (
    roster.extraMemberships !== undefined &&
    !Array.isArray(roster.extraMemberships)
  ) throw new JoinSoloCommunityValidationError(code);
};

const validateSoloTarget = (
  roster: JoinSoloCommunityRoster,
  uid: string,
): { talent?: 0; extraMemberships?: [] } | null => {
  if (!isRecord(roster) || roster.uid !== uid || !safeName(roster.name)) {
    throw new JoinSoloCommunityValidationError("INVALID_TARGET");
  }
  if (roster.isDeleted !== undefined && roster.isDeleted !== false) {
    throw new JoinSoloCommunityValidationError("INVALID_TARGET");
  }
  validateSafeProgressAndWallet(roster, "INVALID_TARGET", {
    allowMissingTalent: true,
  });
  const legacyTalentMissing = roster.talent === undefined;
  const legacyExtraMissing = roster.extraMemberships === undefined;
  if (
    roster.departmentId !== null || roster.departmentName !== null ||
    roster.subgroupId !== null || roster.subgroupName !== null ||
    (!legacyExtraMissing && (!Array.isArray(roster.extraMemberships) ||
      roster.extraMemberships.length !== 0)) ||
    !isFirestoreTimestamp(roster.joinedAt) ||
    !isFirestoreTimestamp(roster.updatedAt)
  ) throw new JoinSoloCommunityValidationError("INVALID_TARGET");
  return legacyTalentMissing || legacyExtraMissing
    ? {
      ...(legacyTalentMissing ? { talent: 0 as const } : {}),
      ...(legacyExtraMissing ? { extraMemberships: [] as [] } : {}),
    }
    : null;
};

const targetPathSuffix = (uid: string) =>
  `/documents/churches/${SOLO_COMMUNITY_ID}/roster/${uid}`;

const validateTargetDocumentPath = (
  document: FirestoreDocument<JoinSoloCommunityRoster>,
  uid: string,
) => {
  if (!document.name.endsWith(targetPathSuffix(uid))) {
    throw new JoinSoloCommunityValidationError("INVALID_TARGET");
  }
};

export const decideJoinSoloCommunity = (input: {
  authenticatedUid: string;
  user: JoinSoloCommunityUser | null;
  rosterDocuments: FirestoreDocument<JoinSoloCommunityRoster>[];
  targetDocument: FirestoreDocument<JoinSoloCommunityRoster> | null;
}): JoinSoloCommunityDecision => {
  const uid = normalizeSoloCommunityDocumentId(input.authenticatedUid);
  if (!uid || uid !== input.authenticatedUid) {
    throw new JoinSoloCommunityValidationError("INVALID_USER");
  }
  const user = validateUser(uid, input.user);
  if (!Array.isArray(input.rosterDocuments)) {
    throw new JoinSoloCommunityValidationError("INVALID_ROSTERS");
  }
  const parsed = parseRosterTalentWallets(input.rosterDocuments, uid);
  if (!parsed.ok) {
    throw new JoinSoloCommunityValidationError(
      parsed.reason === "TOO_MANY" ? "ROSTER_LIMIT" : "INVALID_ROSTERS",
    );
  }
  for (const { orgId, user: roster } of parsed.wallets) {
    if (orgId === SOLO_COMMUNITY_ID && input.targetDocument) continue;
    validateActiveRoster(
      roster as JoinSoloCommunityRoster,
      uid,
      "INVALID_ROSTERS",
    );
  }

  const queriedTarget = parsed.wallets.find(({ orgId }) =>
    orgId === SOLO_COMMUNITY_ID
  )?.user as JoinSoloCommunityRoster | undefined;
  let rosterPatch: { talent?: 0; extraMemberships?: [] } | null = null;
  if (input.targetDocument) {
    validateTargetDocumentPath(input.targetDocument, uid);
    rosterPatch = validateSoloTarget(input.targetDocument.data, uid);
    if (!queriedTarget) {
      throw new JoinSoloCommunityValidationError("INVALID_TARGET");
    }
    validateSoloTarget(queriedTarget, uid);
    for (
      const field of [
        "uid",
        "name",
        "score",
        "talent",
        "currentDay",
        "streak",
        "readCount",
        "lastReadDate",
        "departmentId",
        "departmentName",
        "subgroupId",
        "subgroupName",
        "joinedAt",
        "updatedAt",
      ] as const
    ) {
      if (queriedTarget[field] !== input.targetDocument.data[field]) {
        throw new JoinSoloCommunityValidationError("INVALID_TARGET");
      }
    }
    if (
      JSON.stringify(queriedTarget.extraMemberships) !==
        JSON.stringify(input.targetDocument.data.extraMemberships)
    ) throw new JoinSoloCommunityValidationError("INVALID_TARGET");
  } else if (queriedTarget) {
    throw new JoinSoloCommunityValidationError("INVALID_TARGET");
  }

  const orgIds = new Set(parsed.wallets.map(({ orgId }) => orgId));
  const repairsMissingSoloPrimary = !input.targetDocument &&
    user.primaryOrgId === SOLO_COMMUNITY_ID;
  if (
    user.primaryOrgId && !orgIds.has(user.primaryOrgId) &&
    !repairsMissingSoloPrimary
  ) {
    throw new JoinSoloCommunityValidationError("INVALID_PRIMARY");
  }
  if (!input.targetDocument && parsed.wallets.length >= 3) {
    throw new JoinSoloCommunityValidationError("ROSTER_LIMIT");
  }

  if (!input.targetDocument) {
    return {
      status: repairsMissingSoloPrimary ? "rosterRepaired" : "joined",
      writeRoster: true,
      writeUser: user.primaryOrgId === null,
      rosterSeed: user.rosterSeed,
      rosterPatch: null,
    };
  }
  if (rosterPatch) {
    return {
      status: "rosterRepaired",
      writeRoster: true,
      writeUser: user.primaryOrgId === null,
      rosterSeed: null,
      rosterPatch,
    };
  }
  if (user.primaryOrgId === null) {
    return {
      status: "primaryRepaired",
      writeRoster: false,
      writeUser: true,
      rosterSeed: null,
      rosterPatch: null,
    };
  }
  return {
    status: "alreadyJoined",
    writeRoster: false,
    writeUser: false,
    rosterSeed: null,
    rosterPatch: null,
  };
};
