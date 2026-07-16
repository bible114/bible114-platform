import { db } from './firebase';
import { rosterSnapshotToExtraOrgs, strictCanonicalRosterEntries } from './rosterSnapshot';

export { rosterSnapshotToExtraOrgs, strictCanonicalRosterEntries } from './rosterSnapshot';

const rosterLoadPromises = new Map();
const MAX_CANONICAL_USER_ORGS = 3;

const normalizeReadSource = (options) => options?.source === 'server' ? 'server' : 'default';

const loadRosterRows = (normalizedUid, maxOrgs, quiet, options = {}) => {
    const source = normalizeReadSource(options);
    const requestKey = `${normalizedUid}:${maxOrgs}:${source}`;
    // source:'server'는 각 action 커밋 뒤의 freshness boundary가 다르므로
    // 앞선 in-flight query를 공유하면 안 된다.
    const shouldDedupe = source !== 'server';
    if (shouldDedupe && rosterLoadPromises.has(requestKey)) return rosterLoadPromises.get(requestKey);
    const query = db.collectionGroup('roster')
        .where('uid', '==', normalizedUid);
    const loadPromise = (source === 'server'
        ? query.get({ source: 'server' })
        : query.get())
        .then(snapshot => rosterSnapshotToExtraOrgs(snapshot, normalizedUid, maxOrgs))
        .catch(error => {
            if (quiet) return [];
            throw error;
        })
        .finally(() => {
            if (shouldDedupe && rosterLoadPromises.get(requestKey) === loadPromise) {
                rosterLoadPromises.delete(requestKey);
            }
        });
    if (shouldDedupe) rosterLoadPromises.set(requestKey, loadPromise);
    return loadPromise;
};

// 같은 transaction에서 읽을 canonical DocumentReference 집합만 찾는다.
// 이 query snapshot의 필드 값은 사용자 상태에 사용하지 않는다.
export const loadCanonicalRosterRefsFromServer = async (uid, options = {}) => {
    const normalizedUid = String(uid || '').trim();
    const dbInstance = options.dbInstance || db;
    if (!normalizedUid || !dbInstance) throw new Error('roster unavailable');
    const snapshot = await dbInstance.collectionGroup('roster')
        .where('uid', '==', normalizedUid)
        .get({ source: 'server' });
    return strictCanonicalRosterEntries(snapshot, normalizedUid, MAX_CANONICAL_USER_ORGS)
        .map(({ orgId, rosterPath, ref }) => ({ orgId, rosterPath, ref }));
};

// 로그인 사용자가 가입한 외부 조직 명부 행을 찾는다.
// 규칙/인덱스가 아직 전파되지 않았거나 네트워크가 실패해도 로그인은 빈 배열로 계속한다.
export const loadUserExtraOrgs = async (uid, options = {}) => {
    const normalizedUid = String(uid || '').trim();
    if (!normalizedUid || !db) return [];
    return loadRosterRows(normalizedUid, 3, true, options);
};

export const loadUserExtraOrgsStrict = async (uid, options = {}) => {
    const normalizedUid = String(uid || '').trim();
    if (!normalizedUid || !db) throw new Error('roster unavailable');
    return loadRosterRows(normalizedUid, Number.MAX_SAFE_INTEGER, false, options);
};
