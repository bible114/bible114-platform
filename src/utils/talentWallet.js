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

export const updateRosterTalents = (user, talentByOrgId) => {
    if (!user || !talentByOrgId) return user;
    return {
        ...user,
        extraOrgs: (Array.isArray(user.extraOrgs) ? user.extraOrgs : []).map(org => (
            Object.prototype.hasOwnProperty.call(talentByOrgId, org?.orgId)
                ? { ...org, talent: talentByOrgId[org.orgId] }
                : org
        )),
    };
};
