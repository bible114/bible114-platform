export const getRosterOrgIds = (user) => Array.from(new Set(
    (Array.isArray(user?.extraOrgs) ? user.extraOrgs : [])
        .map(org => String(org?.orgId || '').trim())
        .filter(Boolean)
)).slice(0, 3);

export const usesRosterTalentWallet = (user) => (
    user?.accountType === 'personal' && Boolean(user?.churchId)
);

export const getViewedTalent = (user) => {
    if (!usesRosterTalentWallet(user)) return Number(user?.talent) || 0;
    const orgId = user.churchId || user.primaryOrgId;
    const row = (Array.isArray(user.extraOrgs) ? user.extraOrgs : [])
        .find(org => org?.orgId === orgId);
    return Number(row?.talent) || 0;
};

const emptyRosterRow = (user, orgId, talent) => ({
    uid: user?.uid || null,
    orgId,
    rosterPath: user?.uid ? `churches/${orgId}/roster/${user.uid}` : null,
    departmentId: null,
    departmentName: null,
    subgroupId: null,
    subgroupName: null,
    extraMemberships: [],
    joinedAt: null,
    updatedAt: null,
    talent,
});

export const updateRosterTalents = (user, talentByOrgId, options = {}) => {
    if (!user || !talentByOrgId) return user;
    const existing = Array.isArray(user.extraOrgs) ? user.extraOrgs : [];
    if (options.authoritative === true) {
        const existingByOrgId = new Map(existing.map(org => [org?.orgId, org]));
        return {
            ...user,
            extraOrgs: Object.keys(talentByOrgId)
                .sort((left, right) => (left < right ? -1 : left > right ? 1 : 0))
                .map(orgId => existingByOrgId.has(orgId)
                    ? { ...existingByOrgId.get(orgId), talent: talentByOrgId[orgId] }
                    : emptyRosterRow(user, orgId, talentByOrgId[orgId])),
        };
    }
    return {
        ...user,
        extraOrgs: existing.map(org => (
            Object.prototype.hasOwnProperty.call(talentByOrgId, org?.orgId)
                ? { ...org, talent: talentByOrgId[org.orgId] }
                : org
        )),
    };
};
