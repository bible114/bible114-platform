const ROSTER_FIELDS = [
    'departmentId', 'departmentName', 'subgroupId', 'subgroupName',
    'joinedAt', 'updatedAt',
];

export const rosterSnapshotToExtraOrgs = (snapshot, uid, maxOrgs = 3) => {
    const normalizedUid = String(uid || '').trim();
    if (!normalizedUid || !Array.isArray(snapshot?.docs)) return [];

    const seenOrgIds = new Set();
    return snapshot.docs.flatMap(doc => {
        const data = doc.data?.() || {};
        const orgId = doc.ref?.parent?.parent?.id || '';
        const path = String(doc.ref?.path || '');
        const pathParts = path.split('/');
        const isCanonicalRow = doc.id === normalizedUid
            && data.uid === normalizedUid
            && pathParts.length === 4
            && pathParts[0] === 'churches'
            && pathParts[1] === orgId
            && pathParts[2] === 'roster'
            && pathParts[3] === normalizedUid;
        if (!isCanonicalRow || !orgId || seenOrgIds.has(orgId)) return [];
        seenOrgIds.add(orgId);

        const row = {
            uid: normalizedUid,
            orgId,
            rosterPath: path,
            departmentId: null,
            departmentName: null,
            subgroupId: null,
            subgroupName: null,
            joinedAt: null,
            updatedAt: null,
        };
        ROSTER_FIELDS.forEach(field => {
            if (data[field] !== undefined) row[field] = data[field];
        });
        return [row];
    }).sort((left, right) => left.orgId.localeCompare(right.orgId)).slice(0, maxOrgs);
};
