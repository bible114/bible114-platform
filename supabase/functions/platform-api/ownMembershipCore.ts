export const COMPLETE_MEMBER_ONBOARDING_ACTION =
  "completeMemberOnboarding" as const;

export const MEMBER_ONBOARDING_PLAN_IDS = [
  "1year_sequential",
  "1year_revised",
  "1year_new",
  "nt_new",
  "readable_revised",
  "readable_new",
] as const;

export type MemberOnboardingPlanId = typeof MEMBER_ONBOARDING_PLAN_IDS[number];

type UnknownRecord = Record<string, unknown>;

export type MemberOnboardingMembership = {
  departmentId: string;
  departmentName: string;
  subgroupId: string;
  subgroupName: string;
};

export type MemberOnboardingUser = {
  uid?: unknown;
  role?: unknown;
  accountType?: unknown;
  churchId?: unknown;
  isDeleted?: unknown;
  planId?: unknown;
  onboardingPending?: unknown;
  departmentId?: unknown;
  departmentName?: unknown;
  subgroupId?: unknown;
  subgroupName?: unknown;
};

export type MemberOnboardingChurch = {
  isDeleted?: unknown;
  departments?: unknown;
  communities?: unknown;
};

export type MemberOnboardingRoster = {
  uid?: unknown;
  isDeleted?: unknown;
  departmentId?: unknown;
  departmentName?: unknown;
  subgroupId?: unknown;
  subgroupName?: unknown;
};

export type CompleteMemberOnboardingDecision = {
  status: "completed" | "alreadyCompleted";
  orgId: string;
  planId: MemberOnboardingPlanId;
  membership: MemberOnboardingMembership;
  writeUser: boolean;
  writeRoster: boolean;
};

export type MemberOnboardingValidationCode =
  | "USER_UNAVAILABLE"
  | "INVALID_USER"
  | "PERSONAL_UNSUPPORTED"
  | "CHURCH_UNAVAILABLE"
  | "INVALID_CHURCH"
  | "INVALID_ROSTER"
  | "INVALID_PLAN"
  | "INVALID_DEPARTMENT"
  | "INVALID_SUBGROUP"
  | "ONBOARDING_CONFLICT";

export class MemberOnboardingValidationError extends Error {
  constructor(readonly code: MemberOnboardingValidationCode) {
    super(code);
    this.name = "MemberOnboardingValidationError";
  }
}

const isRecord = (value: unknown): value is UnknownRecord =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value);

const hasControlCharacters = (value: string): boolean =>
  /[\u0000-\u001f\u007f]/.test(value);

export const normalizeOwnMembershipDocumentId = (
  value: unknown,
  options: { allowEmpty?: boolean } = {},
): string | null => {
  if (typeof value !== "string") return null;
  if (options.allowEmpty && value === "") return "";
  const normalized = value.trim();
  return normalized && normalized === value && normalized.length <= 128 &&
      normalized !== "." && normalized !== ".." &&
      !normalized.includes("/") && !hasControlCharacters(normalized)
    ? normalized
    : null;
};

export const isMemberOnboardingPlanId = (
  value: unknown,
): value is MemberOnboardingPlanId =>
  typeof value === "string" &&
  (MEMBER_ONBOARDING_PLAN_IDS as readonly string[]).includes(value);

type NormalizedUnit = {
  id: string;
  name: string;
  subgroups: unknown[];
};

// joinCore의 legacy string/object 호환 규칙을 유지하되, 서버 응답과 저장에
// 사용될 ID/name이 안전하지 않으면 교회 설정 자체를 신뢰하지 않는다.
const normalizeUnit = (value: unknown): NormalizedUnit | null => {
  let id = "";
  let name = "";
  let subgroups: unknown[] = [];
  if (typeof value === "string") {
    id = value.trim();
    name = id;
  } else if (isRecord(value)) {
    name = typeof value.name === "string" ? value.name.trim() : "";
    const idValue = typeof value.id === "string" ? value.id.trim() : "";
    id = idValue || name;
    name = name || id;
    subgroups = Array.isArray(value.subgroups) ? value.subgroups : [];
  } else {
    return null;
  }
  if (!id) return null;
  if (
    normalizeOwnMembershipDocumentId(id) !== id || !name ||
    name.length > 200 || hasControlCharacters(name)
  ) {
    throw new MemberOnboardingValidationError("INVALID_CHURCH");
  }
  return { id, name, subgroups };
};

const normalizeUnits = (values: unknown[]): NormalizedUnit[] => {
  const normalized = values.map(normalizeUnit).filter(
    (unit): unit is NormalizedUnit => unit !== null,
  );
  const ids = new Set<string>();
  for (const unit of normalized) {
    if (ids.has(unit.id)) {
      throw new MemberOnboardingValidationError("INVALID_CHURCH");
    }
    ids.add(unit.id);
  }
  return normalized;
};

const resolveMembership = (
  church: MemberOnboardingChurch,
  departmentId: string,
  subgroupId: string,
): MemberOnboardingMembership => {
  if (
    church.isDeleted !== undefined && typeof church.isDeleted !== "boolean"
  ) {
    throw new MemberOnboardingValidationError("INVALID_CHURCH");
  }
  if (church.isDeleted === true) {
    throw new MemberOnboardingValidationError("CHURCH_UNAVAILABLE");
  }
  const rawDepartments = Array.isArray(church.departments)
    ? church.departments
    : (Array.isArray(church.communities) ? church.communities : []);
  const departments = normalizeUnits(rawDepartments);
  const department = departments.find((unit) => unit.id === departmentId);
  if (!department) {
    throw new MemberOnboardingValidationError("INVALID_DEPARTMENT");
  }
  const subgroups = normalizeUnits(department.subgroups);
  const subgroup = subgroupId
    ? subgroups.find((unit) => unit.id === subgroupId)
    : null;
  if (
    (subgroups.length > 0 && !subgroup) ||
    (subgroups.length === 0 && subgroupId !== "")
  ) {
    throw new MemberOnboardingValidationError("INVALID_SUBGROUP");
  }
  return {
    departmentId: department.id,
    departmentName: department.name,
    subgroupId: subgroup?.id || "",
    subgroupName: subgroup?.name || "",
  };
};

type MembershipState = "empty" | "exact" | "other";

const membershipState = (
  source: MemberOnboardingUser | MemberOnboardingRoster,
  target: MemberOnboardingMembership,
): MembershipState => {
  const current = [
    source.departmentId,
    source.departmentName,
    source.subgroupId,
    source.subgroupName,
  ];
  if (
    current.every((value) =>
      value === undefined || value === null || value === ""
    )
  ) {
    return "empty";
  }
  return source.departmentId === target.departmentId &&
      source.departmentName === target.departmentName &&
      source.subgroupId === target.subgroupId &&
      source.subgroupName === target.subgroupName
    ? "exact"
    : "other";
};

const validateActiveRoster = (
  roster: MemberOnboardingRoster,
  uid: string,
) => {
  if (
    roster.isDeleted !== undefined && typeof roster.isDeleted !== "boolean"
  ) {
    throw new MemberOnboardingValidationError("INVALID_ROSTER");
  }
  if (roster.isDeleted === true || roster.uid !== uid) {
    throw new MemberOnboardingValidationError("INVALID_ROSTER");
  }
};

export const decideCompleteMemberOnboarding = (input: {
  authenticatedUid: string;
  orgId: string;
  planId: string;
  departmentId: string;
  subgroupId: string;
  user: MemberOnboardingUser | null;
  church: MemberOnboardingChurch | null;
  roster: MemberOnboardingRoster | null;
}): CompleteMemberOnboardingDecision => {
  const uid = normalizeOwnMembershipDocumentId(input.authenticatedUid);
  const orgId = normalizeOwnMembershipDocumentId(input.orgId);
  const departmentId = normalizeOwnMembershipDocumentId(input.departmentId);
  const subgroupId = normalizeOwnMembershipDocumentId(input.subgroupId, {
    allowEmpty: true,
  });
  if (
    !uid || uid !== input.authenticatedUid || !orgId || orgId !== input.orgId
  ) {
    throw new MemberOnboardingValidationError("INVALID_USER");
  }
  if (
    !departmentId || departmentId !== input.departmentId ||
    subgroupId === null || subgroupId !== input.subgroupId
  ) {
    throw new MemberOnboardingValidationError("INVALID_DEPARTMENT");
  }
  if (!isMemberOnboardingPlanId(input.planId)) {
    throw new MemberOnboardingValidationError("INVALID_PLAN");
  }
  if (!isRecord(input.user)) {
    throw new MemberOnboardingValidationError("USER_UNAVAILABLE");
  }
  if (
    input.user.isDeleted !== undefined &&
    typeof input.user.isDeleted !== "boolean"
  ) {
    throw new MemberOnboardingValidationError("INVALID_USER");
  }
  if (input.user.isDeleted === true) {
    throw new MemberOnboardingValidationError("USER_UNAVAILABLE");
  }
  if (
    input.user.uid !== undefined && input.user.uid !== null &&
    input.user.uid !== uid
  ) {
    throw new MemberOnboardingValidationError("INVALID_USER");
  }
  if (
    input.user.accountType !== undefined && input.user.accountType !== null &&
    typeof input.user.accountType !== "string"
  ) {
    throw new MemberOnboardingValidationError("INVALID_USER");
  }
  if (input.user.accountType === "personal") {
    throw new MemberOnboardingValidationError("PERSONAL_UNSUPPORTED");
  }
  if (
    input.user.role !== "member" && input.user.role !== "churchAdmin"
  ) {
    throw new MemberOnboardingValidationError("USER_UNAVAILABLE");
  }
  const storedOrgId = normalizeOwnMembershipDocumentId(input.user.churchId);
  if (!storedOrgId || storedOrgId !== orgId || input.user.churchId !== orgId) {
    throw new MemberOnboardingValidationError("USER_UNAVAILABLE");
  }
  if (!isRecord(input.church)) {
    throw new MemberOnboardingValidationError("CHURCH_UNAVAILABLE");
  }

  const membership = resolveMembership(
    input.church,
    departmentId,
    subgroupId,
  );
  if (input.roster) validateActiveRoster(input.roster, uid);

  const userState = membershipState(input.user, membership);
  const rosterState = input.roster
    ? membershipState(input.roster, membership)
    : null;
  const rosterConsistent = rosterState === null || rosterState === userState;

  if (
    input.user.onboardingPending !== undefined &&
    typeof input.user.onboardingPending !== "boolean"
  ) {
    throw new MemberOnboardingValidationError("INVALID_USER");
  }
  if (
    input.user.role === "churchAdmin" &&
    ((userState === "empty" && input.user.onboardingPending !== true) ||
      (userState === "exact" && input.user.onboardingPending !== false))
  ) {
    throw new MemberOnboardingValidationError("ONBOARDING_CONFLICT");
  }

  if (
    userState === "exact" && rosterConsistent &&
    input.user.planId === input.planId
  ) {
    return {
      status: "alreadyCompleted",
      orgId,
      planId: input.planId,
      membership,
      writeUser: false,
      writeRoster: false,
    };
  }
  if (userState !== "empty" || !rosterConsistent) {
    throw new MemberOnboardingValidationError("ONBOARDING_CONFLICT");
  }
  return {
    status: "completed",
    orgId,
    planId: input.planId,
    membership,
    writeUser: true,
    writeRoster: Boolean(input.roster),
  };
};
