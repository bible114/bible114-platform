export const MAX_EXTRA_MEMBERSHIPS = 3;

const normalizeString = (value) => {
    if (typeof value !== 'string') return null;
    const normalized = value.trim();
    return normalized || null;
};

export const normalizeMembership = (membership) => {
    if (!membership || typeof membership !== 'object' || Array.isArray(membership)) return null;

    const departmentId = normalizeString(membership.departmentId);
    if (!departmentId) return null;

    const subgroupId = normalizeString(membership.subgroupId);
    return {
        departmentId,
        departmentName: normalizeString(membership.departmentName),
        subgroupId,
        subgroupName: subgroupId ? normalizeString(membership.subgroupName) : null,
    };
};

export const normalizeExtraMemberships = (memberships) => {
    if (!Array.isArray(memberships)) return [];

    const normalized = [];
    const seen = new Set();
    memberships.slice(0, MAX_EXTRA_MEMBERSHIPS).forEach(candidate => {
        const membership = normalizeMembership(candidate);
        if (!membership) return;
        const key = JSON.stringify([membership.departmentId, membership.subgroupId]);
        if (seen.has(key)) return;
        seen.add(key);
        normalized.push(membership);
    });
    return normalized;
};

// 주 소속 1개와 저장 순서상 앞의 추가 소속 최대 3개를 새 객체로 정규화한다.
// 같은 (departmentId, subgroupId)는 주 소속/앞선 항목을 우선해 한 번만 반환한다.
export const getMembershipList = (user) => {
    if (!user || typeof user !== 'object' || Array.isArray(user)) return [];

    const primaryMembership = normalizeMembership({
        departmentId: user.departmentId,
        departmentName: user.departmentName,
        subgroupId: user.subgroupId,
        subgroupName: user.subgroupName,
    });
    const extraMemberships = normalizeExtraMemberships(user.extraMemberships);

    const memberships = [];
    const seen = new Set();
    const candidates = primaryMembership ? [primaryMembership, ...extraMemberships] : extraMemberships;

    candidates.forEach(candidate => {
        const membership = candidate;
        if (!membership) return;

        const key = JSON.stringify([membership.departmentId, membership.subgroupId]);
        if (seen.has(key)) return;
        seen.add(key);
        memberships.push(membership);
    });

    return memberships;
};

export const belongsToDepartment = (user, deptId) => {
    const normalizedDepartmentId = normalizeString(deptId);
    if (!normalizedDepartmentId) return false;
    return getMembershipList(user)
        .some(membership => membership.departmentId === normalizedDepartmentId);
};

export const belongsToSubgroup = (user, deptId, subId) => {
    const normalizedDepartmentId = normalizeString(deptId);
    const normalizedSubgroupId = normalizeString(subId);
    if (!normalizedDepartmentId || !normalizedSubgroupId) return false;
    return getMembershipList(user).some(membership => (
        membership.departmentId === normalizedDepartmentId
        && membership.subgroupId === normalizedSubgroupId
    ));
};
