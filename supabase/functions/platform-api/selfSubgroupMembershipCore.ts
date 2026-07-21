export type SelfSubgroupOperation = "add" | "remove";

export type SelfSubgroupMembership = {
  departmentId: string;
  departmentName: string;
  subgroupId: string;
  subgroupName: string;
};

export class SelfSubgroupMembershipError extends Error {
  constructor(
    readonly code:
      | "CHURCH_INACTIVE"
      | "INVALID_MEMBERSHIP"
      | "MEMBERSHIP_NOT_FOUND"
      | "PRIMARY_MEMBERSHIP"
      | "TOO_MANY_MEMBERSHIPS",
  ) {
    super(code);
    this.name = "SelfSubgroupMembershipError";
  }
}

const cleanId = (value: unknown) =>
  typeof value === "string" && value.trim() === value && value.length > 0 &&
    value.length <= 128 && !value.includes("/") &&
    !/[\u0000-\u001f\u007f]/.test(value)
    ? value
    : null;

const cleanName = (value: unknown, fallback: string) =>
  typeof value === "string" && value.trim() && value.length <= 100
    ? value.trim()
    : fallback;

const pairKey = (
  membership: Pick<SelfSubgroupMembership, "departmentId" | "subgroupId">,
) => `${membership.departmentId}\u0000${membership.subgroupId}`;

const normalizeStoredMembership = (
  value: unknown,
): SelfSubgroupMembership | null => {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  const departmentId = cleanId(record.departmentId);
  const subgroupId = cleanId(record.subgroupId);
  if (!departmentId || !subgroupId) return null;
  return {
    departmentId,
    departmentName: cleanName(record.departmentName, departmentId),
    subgroupId,
    subgroupName: cleanName(record.subgroupName, subgroupId),
  };
};

const resolveRequestedMembership = (
  departments: unknown,
  departmentId: string,
  subgroupId: string,
): SelfSubgroupMembership | null => {
  if (!Array.isArray(departments)) return null;
  for (const departmentValue of departments) {
    if (
      !departmentValue || typeof departmentValue !== "object" ||
      Array.isArray(departmentValue)
    ) continue;
    const department = departmentValue as Record<string, unknown>;
    const candidateDepartmentId = cleanId(department.id) ||
      cleanId(department.name);
    if (candidateDepartmentId !== departmentId) continue;
    const subgroups = Array.isArray(department.subgroups)
      ? department.subgroups
      : [];
    for (const subgroupValue of subgroups) {
      const subgroup = typeof subgroupValue === "string"
        ? { id: subgroupValue, name: subgroupValue }
        : (subgroupValue && typeof subgroupValue === "object" &&
            !Array.isArray(subgroupValue)
          ? subgroupValue as Record<string, unknown>
          : null);
      if (!subgroup) continue;
      const candidateSubgroupId = cleanId(subgroup.id) ||
        cleanId(subgroup.name);
      if (candidateSubgroupId !== subgroupId) continue;
      return {
        departmentId,
        departmentName: cleanName(department.name, departmentId),
        subgroupId,
        subgroupName: cleanName(subgroup.name, subgroupId),
      };
    }
  }
  return null;
};

export const updateSelfSubgroupMembership = (input: {
  operation: SelfSubgroupOperation;
  departmentId: string;
  subgroupId: string;
  church: Record<string, unknown>;
  membershipDocument: Record<string, unknown>;
}) => {
  if (input.church.active === false || input.church.isActive === false) {
    throw new SelfSubgroupMembershipError("CHURCH_INACTIVE");
  }
  const departments = Array.isArray(input.church.departments)
    ? input.church.departments
    : input.church.communities;
  const requested = resolveRequestedMembership(
    departments,
    input.departmentId,
    input.subgroupId,
  );
  if (!requested) throw new SelfSubgroupMembershipError("INVALID_MEMBERSHIP");

  const primaryDepartmentId = cleanId(input.membershipDocument.departmentId);
  const primarySubgroupId = cleanId(input.membershipDocument.subgroupId);
  if (!primaryDepartmentId || !primarySubgroupId) {
    throw new SelfSubgroupMembershipError("INVALID_MEMBERSHIP");
  }
  const primaryKey = pairKey({
    departmentId: primaryDepartmentId,
    subgroupId: primarySubgroupId,
  });
  const requestedKey = pairKey(requested);
  if (primaryKey === requestedKey) {
    throw new SelfSubgroupMembershipError("PRIMARY_MEMBERSHIP");
  }

  const rawExtras = input.membershipDocument.extraMemberships ?? [];
  if (!Array.isArray(rawExtras) || rawExtras.length > 3) {
    throw new SelfSubgroupMembershipError("INVALID_MEMBERSHIP");
  }
  const extras = rawExtras.map(normalizeStoredMembership);
  if (extras.some((membership) => !membership)) {
    throw new SelfSubgroupMembershipError("INVALID_MEMBERSHIP");
  }
  const normalizedExtras = extras as SelfSubgroupMembership[];
  const existingIndex = normalizedExtras.findIndex((membership) =>
    pairKey(membership) === requestedKey
  );

  if (input.operation === "add") {
    if (existingIndex >= 0) {
      return {
        status: "alreadyJoined" as const,
        extraMemberships: normalizedExtras,
      };
    }
    if (normalizedExtras.length >= 3) {
      throw new SelfSubgroupMembershipError("TOO_MANY_MEMBERSHIPS");
    }
    return {
      status: "added" as const,
      extraMemberships: [...normalizedExtras, requested],
    };
  }
  if (existingIndex < 0) {
    return {
      status: "alreadyLeft" as const,
      extraMemberships: normalizedExtras,
    };
  }
  return {
    status: "removed" as const,
    extraMemberships: normalizedExtras.filter((_, index) =>
      index !== existingIndex
    ),
  };
};
