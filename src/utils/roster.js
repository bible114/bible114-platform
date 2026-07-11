import { db } from './firebase';
import { rosterSnapshotToExtraOrgs } from './rosterSnapshot';

export { rosterSnapshotToExtraOrgs } from './rosterSnapshot';

const rosterLoadPromises = new Map();

const loadRosterRows = (normalizedUid, maxOrgs, quiet) => {
    const requestKey = `${normalizedUid}:${maxOrgs}`;
    if (rosterLoadPromises.has(requestKey)) return rosterLoadPromises.get(requestKey);
    const loadPromise = db.collectionGroup('roster')
        .where('uid', '==', normalizedUid)
        .get()
        .then(snapshot => rosterSnapshotToExtraOrgs(snapshot, normalizedUid, maxOrgs))
        .catch(error => {
            if (quiet) return [];
            throw error;
        })
        .finally(() => {
            if (rosterLoadPromises.get(requestKey) === loadPromise) rosterLoadPromises.delete(requestKey);
        });
    rosterLoadPromises.set(requestKey, loadPromise);
    return loadPromise;
};

// 로그인 사용자가 가입한 외부 조직 명부 행을 찾는다.
// 규칙/인덱스가 아직 전파되지 않았거나 네트워크가 실패해도 로그인은 빈 배열로 계속한다.
export const loadUserExtraOrgs = async (uid) => {
    const normalizedUid = String(uid || '').trim();
    if (!normalizedUid || !db) return [];
    return loadRosterRows(normalizedUid, 3, true);
};

export const loadUserExtraOrgsStrict = async (uid) => {
    const normalizedUid = String(uid || '').trim();
    if (!normalizedUid || !db) throw new Error('roster unavailable');
    return loadRosterRows(normalizedUid, Number.MAX_SAFE_INTEGER, false);
};
