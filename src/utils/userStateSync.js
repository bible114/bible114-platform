import { db } from './firebase';
import { userDocToState } from './helpers';
import {
    loadCanonicalRosterRefsFromServer,
    rosterSnapshotToExtraOrgs,
    strictCanonicalRosterEntries,
} from './roster';

const normalizeUid = uid => String(uid || '').trim();
const MAX_CANONICAL_ROSTERS = 3;
const MAX_MEMBERSHIP_SNAPSHOT_ATTEMPTS = 3;
const latestSyncGenerationByUid = new Map();
const stateSyncGeneration = new WeakMap();

class MembershipSnapshotChangedError extends Error {
    constructor() {
        super('canonical roster membership changed');
        this.name = 'MembershipSnapshotChangedError';
    }
}

const rosterPaths = entries => entries.map(entry => entry.rosterPath).sort();
const sameRosterPaths = (left, right) => (
    left.length === right.length && left.every((path, index) => path === right[index])
);

export const isLatestCanonicalUserState = (uid, state) => {
    const normalizedUid = normalizeUid(uid);
    const metadata = state && typeof state === 'object' ? stateSyncGeneration.get(state) : null;
    return Boolean(normalizedUid && metadata?.uid === normalizedUid
        && latestSyncGenerationByUid.get(normalizedUid) === metadata.generation);
};

// 서버 action의 응답 snapshot은 다른 탭에서 바로 이어진 쓰기보다 오래됐을 수 있다.
// server query는 canonical roster 경로만 찾고, 실제 사용자/roster 값은 모두 같은
// read-only Firestore transaction snapshot에서 읽는다. 경로가 조회 전후 달라지면
// 제한된 횟수만 다시 시도하고 끝까지 안정되지 않는 상태는 적용하지 않는다.
export const loadCanonicalUserStateFromServer = async (uid, dependencies = {}) => {
    const normalizedUid = normalizeUid(uid);
    const dbInstance = dependencies.dbInstance || db;
    const convertUser = dependencies.convertUser || userDocToState;
    const discoverCanonicalRosters = dependencies.discoverCanonicalRosters
        || (targetUid => loadCanonicalRosterRefsFromServer(targetUid, { dbInstance }));
    if (!normalizedUid || !dbInstance) throw new Error('user state sync unavailable');
    const generation = (latestSyncGenerationByUid.get(normalizedUid) || 0) + 1;
    latestSyncGenerationByUid.set(normalizedUid, generation);
    const userRef = dbInstance.collection('users').doc(normalizedUid);

    for (let attempt = 0; attempt < MAX_MEMBERSHIP_SNAPSHOT_ATTEMPTS; attempt += 1) {
        const discoveredBefore = await discoverCanonicalRosters(normalizedUid);
        const expectedPaths = rosterPaths(discoveredBefore);
        let transactionState;
        try {
            transactionState = await dbInstance.runTransaction(async transaction => {
                const [userSnapshot, ...rosterSnapshots] = await Promise.all([
                    transaction.get(userRef),
                    ...discoveredBefore.map(entry => transaction.get(entry.ref)),
                ]);
                if (!userSnapshot?.exists) throw new Error('user state sync missing user');

                let transactionRosters;
                try {
                    transactionRosters = strictCanonicalRosterEntries(
                        { docs: rosterSnapshots },
                        normalizedUid,
                        MAX_CANONICAL_ROSTERS,
                    );
                } catch {
                    // 조회한 경로가 transaction 전에 삭제되거나 uid가 바뀐 경우다.
                    throw new MembershipSnapshotChangedError();
                }
                if (!sameRosterPaths(expectedPaths, rosterPaths(transactionRosters))) {
                    throw new MembershipSnapshotChangedError();
                }

                const user = convertUser(userSnapshot);
                if (user?.uid !== normalizedUid || user.isDeleted === true) {
                    throw new Error('user state sync invalid user');
                }
                const extraOrgs = rosterSnapshotToExtraOrgs(
                    { docs: transactionRosters.map(entry => entry.snapshot) },
                    normalizedUid,
                    MAX_CANONICAL_ROSTERS,
                );
                if (extraOrgs.length !== transactionRosters.length) {
                    throw new MembershipSnapshotChangedError();
                }
                return { user, extraOrgs };
            });
        } catch (error) {
            if (!(error instanceof MembershipSnapshotChangedError)) throw error;
            if (attempt + 1 >= MAX_MEMBERSHIP_SNAPSHOT_ATTEMPTS) {
                throw new Error('user state sync unstable membership');
            }
            continue;
        }

        const discoveredAfter = await discoverCanonicalRosters(normalizedUid);
        if (!sameRosterPaths(expectedPaths, rosterPaths(discoveredAfter))) {
            if (attempt + 1 >= MAX_MEMBERSHIP_SNAPSHOT_ATTEMPTS) {
                throw new Error('user state sync unstable membership');
            }
            continue;
        }

        const state = { ...transactionState.user, extraOrgs: transactionState.extraOrgs };
        stateSyncGeneration.set(state, { uid: normalizedUid, generation });
        return state;
    }

    throw new Error('user state sync unstable membership');
};
