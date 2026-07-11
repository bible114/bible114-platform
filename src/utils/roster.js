import { db } from './firebase';
import { rosterSnapshotToExtraOrgs } from './rosterSnapshot';

export { rosterSnapshotToExtraOrgs } from './rosterSnapshot';

const rosterLoadPromises = new Map();

// 로그인 사용자가 가입한 외부 조직 명부 행을 찾는다.
// 규칙/인덱스가 아직 전파되지 않았거나 네트워크가 실패해도 로그인은 빈 배열로 계속한다.
export const loadUserExtraOrgs = async (uid) => {
    const normalizedUid = String(uid || '').trim();
    if (!normalizedUid || !db) return [];
    if (rosterLoadPromises.has(normalizedUid)) return rosterLoadPromises.get(normalizedUid);

    const loadPromise = db.collectionGroup('roster')
        .where('uid', '==', normalizedUid)
        .get()
        .then(snapshot => rosterSnapshotToExtraOrgs(snapshot, normalizedUid))
        .catch(() => [])
        .finally(() => {
            if (rosterLoadPromises.get(normalizedUid) === loadPromise) {
                rosterLoadPromises.delete(normalizedUid);
            }
        });
    rosterLoadPromises.set(normalizedUid, loadPromise);
    return loadPromise;
};
