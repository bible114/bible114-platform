import { normalizeExtraMemberships } from './memberships.js';

const COMMUNITY_PROGRESS_PLAN_IDS = new Set([
    '1year_sequential', '1year_revised', '1year_new', 'nt_new',
    'readable_revised', 'readable_new',
]);
const COMMUNITY_PROGRESS_FIELDS = [
    'planId', 'fixtureType', 'currentDay', 'readCount', 'readingYear',
    'yearCompletedRounds', 'lifetimeCompletedRounds', 'score', 'streak',
    'lastReadDate', 'recentReadDates', 'weeklyReadKey', 'weeklyReadCount',
];

export const hasVerifiedCommunityProgress = member => (
    !member?.isExternalOrgMember
    || member.communityProgressIdentityVerified === true
);

export const rosterSnapshotToMembers = (snapshot) => {
    if (!Array.isArray(snapshot?.docs)) return [];
    return snapshot.docs.flatMap(doc => {
        const data = doc.data?.() || {};
        const path = String(doc.ref?.path || '');
        const pathParts = path.split('/');
        const orgId = doc.ref?.parent?.parent?.id || '';
        if (!doc.id || data.uid !== doc.id || !orgId
            || pathParts.length !== 4 || pathParts[0] !== 'churches'
            || pathParts[1] !== orgId || pathParts[2] !== 'roster' || pathParts[3] !== doc.id) return [];
        const hasFixtureSnapshot = Object.prototype.hasOwnProperty.call(data, 'fixtureType')
            && (data.fixtureType === null || data.fixtureType === 'reading-badge-test');
        const hasProgressIdentity = COMMUNITY_PROGRESS_PLAN_IDS.has(data.planId)
            && hasFixtureSnapshot;
        return [{
            uid: doc.id,
            name: data.name || '이름 없음',
            role: 'member',
            planId: hasProgressIdentity ? data.planId : null,
            fixtureType: hasProgressIdentity ? data.fixtureType : null,
            communityProgressIdentityVerified: hasProgressIdentity,
            score: hasProgressIdentity ? (data.score || 0) : 0,
            talent: data.talent || 0,
            currentDay: hasProgressIdentity ? (data.currentDay || 1) : 1,
            streak: hasProgressIdentity ? (data.streak || 0) : 0,
            readCount: hasProgressIdentity ? (data.readCount || 1) : 1,
            readingYear: hasProgressIdentity ? (data.readingYear ?? null) : null,
            yearCompletedRounds: hasProgressIdentity ? (data.yearCompletedRounds ?? null) : null,
            lifetimeCompletedRounds: hasProgressIdentity ? (data.lifetimeCompletedRounds ?? null) : null,
            lastReadDate: hasProgressIdentity ? (data.lastReadDate || null) : null,
            recentReadDates: hasProgressIdentity && Array.isArray(data.recentReadDates)
                ? data.recentReadDates
                : [],
            weeklyReadKey: hasProgressIdentity ? (data.weeklyReadKey || null) : null,
            weeklyReadCount: hasProgressIdentity ? (data.weeklyReadCount || 0) : 0,
            departmentId: data.departmentId || null,
            departmentName: data.departmentName || null,
            subgroupId: data.subgroupId || null,
            subgroupName: data.subgroupName || null,
            extraMemberships: normalizeExtraMemberships(data.extraMemberships),
            isExternalOrgMember: true,
            rosterOrgId: orgId,
        }];
    });
};

export const mergeCanonicalProgressIntoRosterMembers = (
    members,
    canonicalMembers
) => {
    const canonicalByUid = new Map(
        (Array.isArray(canonicalMembers) ? canonicalMembers : []).flatMap(member => (
            member?.uid && COMMUNITY_PROGRESS_PLAN_IDS.has(member.planId)
            && (member.fixtureType === null || member.fixtureType === 'reading-badge-test')
                ? [[member.uid, member]]
                : []
        ))
    );
    return (Array.isArray(members) ? members : []).map(member => {
        if (!member?.isExternalOrgMember) return member;
        const canonical = canonicalByUid.get(member.uid);
        if (!canonical) return member;
        return {
            ...member,
            ...Object.fromEntries(COMMUNITY_PROGRESS_FIELDS.flatMap(field => (
                Object.prototype.hasOwnProperty.call(canonical, field)
                    ? [[field, canonical[field]]]
                    : []
            ))),
            communityProgressIdentityVerified: true,
        };
    });
};

export const mergePrimaryAndRosterMembers = (primaryMembers, rosterMembers) => {
    const merged = new Map();
    (Array.isArray(primaryMembers) ? primaryMembers : []).forEach(member => {
        if (member?.uid && !merged.has(member.uid)) merged.set(member.uid, member);
    });
    (Array.isArray(rosterMembers) ? rosterMembers : []).forEach(member => {
        if (member?.uid && !merged.has(member.uid)) merged.set(member.uid, member);
    });
    return [...merged.values()];
};
