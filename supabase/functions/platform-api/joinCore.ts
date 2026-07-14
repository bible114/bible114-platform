export type JoinCommunityUser = {
  uid?: unknown;
  name?: unknown;
  churchId?: unknown;
  accountType?: unknown;
  primaryOrgId?: unknown;
  score?: unknown;
  talent?: unknown;
  currentDay?: unknown;
  streak?: unknown;
  readCount?: unknown;
  lastReadDate?: unknown;
  isDeleted?: unknown;
};

export type JoinCommunityChurch = {
  churchCodeHash?: unknown;
  departments?: unknown;
  communities?: unknown;
  isDeleted?: unknown;
};

export type JoinCommunityInput = {
  uid: string;
  churchId: string;
  entryCodeHash: string;
  departmentId: string;
  subgroupId: string;
  rosterCount: number;
  existingRoster: Record<string, unknown> | null;
  user: JoinCommunityUser;
  church: JoinCommunityChurch;
};

export type JoinCommunityFailureCode =
  | "USER_UNAVAILABLE"
  | "CHURCH_UNAVAILABLE"
  | "UNSUPPORTED_CHURCH"
  | "BASE_CHURCH"
  | "INVALID_ENTRY_CODE"
  | "MEMBERSHIP_LIMIT"
  | "INVALID_DEPARTMENT"
  | "INVALID_SUBGROUP";

export class JoinCommunityValidationError extends Error {
  readonly code: JoinCommunityFailureCode;

  constructor(code: JoinCommunityFailureCode) {
    super(code);
    this.name = "JoinCommunityValidationError";
    this.code = code;
  }
}

const finiteNumber = (value: unknown, fallback: number) => {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
};

const normalizedUnit = (value: unknown) => {
  if (typeof value === "string") {
    const text = value.trim();
    return text ? { id: text, name: text, subgroups: [] as unknown[] } : null;
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  const name = typeof record.name === "string" ? record.name.trim() : "";
  const idValue = typeof record.id === "string" ? record.id.trim() : "";
  const id = idValue || name;
  if (!id) return null;
  return {
    id,
    name: name || id,
    subgroups: Array.isArray(record.subgroups) ? record.subgroups : [],
  };
};

export const validateJoinCommunity = (input: JoinCommunityInput) => {
  if (!input.user || input.user.isDeleted === true) {
    throw new JoinCommunityValidationError("USER_UNAVAILABLE");
  }
  if (!input.church || input.church.isDeleted === true) {
    throw new JoinCommunityValidationError("CHURCH_UNAVAILABLE");
  }
  if (input.churchId === "unaffiliated_v1") {
    throw new JoinCommunityValidationError("UNSUPPORTED_CHURCH");
  }
  if (input.user.churchId === input.churchId) {
    throw new JoinCommunityValidationError("BASE_CHURCH");
  }
  if (
    typeof input.church.churchCodeHash !== "string" ||
    !input.church.churchCodeHash ||
    input.church.churchCodeHash !== input.entryCodeHash
  ) {
    throw new JoinCommunityValidationError("INVALID_ENTRY_CODE");
  }

  if (input.existingRoster) {
    return {
      status: "alreadyJoined" as const,
      shouldAssignPrimary: false,
      membership: input.existingRoster,
    };
  }
  if (!Number.isInteger(input.rosterCount) || input.rosterCount >= 3) {
    throw new JoinCommunityValidationError("MEMBERSHIP_LIMIT");
  }

  const rawDepartments = Array.isArray(input.church.departments)
    ? input.church.departments
    : (Array.isArray(input.church.communities) ? input.church.communities : []);
  const department = rawDepartments.map(normalizedUnit).find((unit) =>
    unit?.id === input.departmentId
  );
  if (!department) {
    throw new JoinCommunityValidationError("INVALID_DEPARTMENT");
  }
  const subgroups = department.subgroups.map(normalizedUnit).filter(
    Boolean,
  ) as Array<{
    id: string;
    name: string;
  }>;
  const subgroup = input.subgroupId
    ? subgroups.find((unit) => unit.id === input.subgroupId)
    : null;
  if (
    (subgroups.length > 0 && !subgroup) ||
    (subgroups.length === 0 && input.subgroupId)
  ) {
    throw new JoinCommunityValidationError("INVALID_SUBGROUP");
  }

  const shouldAssignPrimary = input.user.accountType === "personal" &&
    (typeof input.user.primaryOrgId !== "string" || !input.user.primaryOrgId);
  return {
    status: "ready" as const,
    shouldAssignPrimary,
    membership: {
      uid: input.uid,
      name: typeof input.user.name === "string" ? input.user.name : "",
      score: finiteNumber(input.user.score, 0),
      talent: 0,
      currentDay: finiteNumber(input.user.currentDay, 1),
      streak: finiteNumber(input.user.streak, 0),
      readCount: finiteNumber(input.user.readCount, 1),
      lastReadDate: input.user.lastReadDate ?? null,
      departmentId: department.id,
      departmentName: department.name,
      subgroupId: subgroup?.id || "",
      subgroupName: subgroup?.name || "",
      extraMemberships: [],
    },
  };
};
