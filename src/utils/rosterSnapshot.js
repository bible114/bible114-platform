import { normalizeExtraMemberships } from './memberships.js';

const ROSTER_FIELDS = [
    'talent',
    'departmentId', 'departmentName', 'subgroupId', 'subgroupName',
    'extraMemberships',
    'joinedAt', 'updatedAt',
];

// 서버 권위 동기화처럼 일부 문서라도 누락되면 안 되는 경로에서 사용한다.
// 일반 화면용 mapper와 달리 잘못된 collectionGroup 결과를 조용히 버리거나
// 상한 밖의 행을 잘라내지 않고 전체 조회를 fail-closed로 검증한다.
export const strictCanonicalRosterEntries = (snapshot, uid, maxOrgs = 3) => {
    const normalizedUid = String(uid || '').trim();
    if (
        !normalizedUid
        || !Array.isArray(snapshot?.docs)
        || !Number.isSafeInteger(maxOrgs)
        || maxOrgs < 0
    ) {
        throw new Error('invalid canonical roster snapshot');
    }

    const seenOrgIds = new Set();
    const seenPaths = new Set();
    const entries = snapshot.docs.map(doc => {
        const data = doc?.data?.();
        const orgId = String(doc?.ref?.parent?.parent?.id || '').trim();
        const rosterPath = String(doc?.ref?.path || '');
        const pathParts = rosterPath.split('/');
        const canonicalPath = pathParts.length === 4
            && pathParts[0] === 'churches'
            && pathParts[1] === orgId
            && pathParts[2] === 'roster'
            && pathParts[3] === normalizedUid;
        if (
            doc?.exists === false
            || !data || typeof data !== 'object'
            || doc?.id !== normalizedUid
            || data.uid !== normalizedUid
            || !orgId
            || !canonicalPath
            || seenOrgIds.has(orgId)
            || seenPaths.has(rosterPath)
        ) {
            throw new Error('invalid canonical roster row');
        }
        seenOrgIds.add(orgId);
        seenPaths.add(rosterPath);
        return { orgId, rosterPath, ref: doc.ref, snapshot: doc };
    });

    if (entries.length > maxOrgs) throw new Error('canonical roster limit exceeded');
    return entries.sort((left, right) => left.orgId.localeCompare(right.orgId));
};

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
            extraMemberships: [],
            joinedAt: null,
            updatedAt: null,
            talent: 0,
        };
        ROSTER_FIELDS.forEach(field => {
            if (data[field] !== undefined) row[field] = data[field];
        });
        row.extraMemberships = normalizeExtraMemberships(row.extraMemberships);
        return [row];
    }).sort((left, right) => left.orgId.localeCompare(right.orgId)).slice(0, maxOrgs);
};
