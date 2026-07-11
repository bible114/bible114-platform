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
        return [{
            uid: doc.id,
            name: data.name || '이름 없음',
            role: 'member',
            score: data.score || 0,
            currentDay: data.currentDay || 1,
            streak: data.streak || 0,
            readCount: data.readCount || 1,
            lastReadDate: data.lastReadDate || null,
            departmentId: data.departmentId || null,
            departmentName: data.departmentName || null,
            subgroupId: data.subgroupId || null,
            subgroupName: data.subgroupName || null,
            extraMemberships: [],
            isExternalOrgMember: true,
            rosterOrgId: orgId,
        }];
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
