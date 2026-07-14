import { auth, db, firebase } from './firebase';
import { makePseudoEmail, makeUnaffiliatedIdentity, userDocToState, migratePersonalTalentWalletIfNeeded } from './helpers';
import { writeMemberCredentials } from './memberCredentials';
import { loadUserExtraOrgs } from './roster';
import { nextPersonalMigrationStep } from './personalMigrationSteps';

export const PERSONAL_MIGRATION_KEY = 'b114_migration_v1';

const readState = () => {
    try {
        const value = JSON.parse(localStorage.getItem(PERSONAL_MIGRATION_KEY) || 'null');
        return value && typeof value === 'object' ? value : null;
    } catch {
        return null;
    }
};

const writeState = state => localStorage.setItem(PERSONAL_MIGRATION_KEY, JSON.stringify(state));

export const getPendingPersonalMigration = uid => {
    const state = readState();
    return state?.uid === uid && state.step !== 'complete' ? state : null;
};

export const clearPersonalMigration = () => localStorage.removeItem(PERSONAL_MIGRATION_KEY);

const migrationError = (code, message) => Object.assign(new Error(message), { code });
const migrationPromises = new Map();

const runMigration = async ({ currentUser, phone4 }) => {
    const firebaseUser = auth.currentUser;
    if (!firebaseUser || !currentUser?.uid || firebaseUser.uid !== currentUser.uid) {
        throw migrationError('migration/auth-changed', '로그인 상태가 변경되었습니다. 다시 로그인해주세요.');
    }

    const pending = getPendingPersonalMigration(currentUser.uid);
    const normalizedPhone4 = String(phone4 || pending?.phone4 || '').trim();
    if (!/^\d{4}$/.test(normalizedPhone4)) {
        throw migrationError('migration/phone4-required', '전화번호 뒤 4자리를 입력해주세요.');
    }

    const source = pending?.source || {
        churchId: currentUser.churchId,
        churchName: currentUser.churchName || null,
        departmentId: currentUser.departmentId || null,
        departmentName: currentUser.departmentName || null,
        subgroupId: currentUser.subgroupId || null,
        subgroupName: currentUser.subgroupName || null,
    };
    if (!source.churchId) throw migrationError('migration/source-missing', '기존 교회 정보를 확인할 수 없습니다.');

    const newEmail = makePseudoEmail(
        currentUser.name,
        makeUnaffiliatedIdentity(currentUser.birthdate, normalizedPhone4)
    );
    let state = pending || { uid: currentUser.uid, step: 'start', phone4: normalizedPhone4, newEmail, source };
    state = { ...state, phone4: normalizedPhone4, newEmail, source };
    writeState(state);

    if (state.step === 'start') {
        if (String(firebaseUser.email || '').toLowerCase() !== newEmail.toLowerCase()) {
            try {
                await firebaseUser.updateEmail(newEmail);
            } catch (error) {
                if (error?.code === 'auth/email-already-in-use') {
                    throw migrationError('migration/email-in-use', '같은 이름·생년월일·전화번호 조합의 계정이 이미 있어요.');
                }
                if (error?.code === 'auth/requires-recent-login') {
                    throw migrationError('migration/recent-login', '안전을 위해 다시 로그인한 뒤 전환해주세요.');
                }
                throw error;
            }
        }
        state = { ...state, step: nextPersonalMigrationStep(state.step) };
        writeState(state);
    }

    if (state.step === 'email') {
        await writeMemberCredentials(currentUser.uid, { phone4: normalizedPhone4 });
        state = { ...state, step: nextPersonalMigrationStep(state.step) };
        writeState(state);
    }

    const rosterRef = db.collection('churches').doc(source.churchId).collection('roster').doc(currentUser.uid);
    if (state.step === 'credentials') {
        const userRef = db.collection('users').doc(currentUser.uid);
        await db.runTransaction(async transaction => {
            const [userSnap, rosterSnap] = await Promise.all([
                transaction.get(userRef),
                transaction.get(rosterRef),
            ]);
            if (rosterSnap.exists) return;
            if (!userSnap.exists) throw migrationError('migration/user-missing', '회원 정보를 확인할 수 없습니다.');
            const latestUser = userSnap.data();
            const now = firebase.firestore.FieldValue.serverTimestamp();
            transaction.set(rosterRef, {
                uid: currentUser.uid,
                name: latestUser.name ?? '',
                score: latestUser.score ?? 0,
                talent: 0,
                currentDay: latestUser.currentDay ?? 1,
                streak: latestUser.streak ?? 0,
                readCount: latestUser.readCount ?? 1,
                lastReadDate: latestUser.lastReadDate ?? null,
                departmentId: latestUser.departmentId ?? null,
                departmentName: latestUser.departmentName ?? null,
                subgroupId: latestUser.subgroupId ?? null,
                subgroupName: latestUser.subgroupName ?? null,
                extraMemberships: [],
                joinedAt: now,
                updatedAt: now,
            });
        });
        state = { ...state, step: nextPersonalMigrationStep(state.step) };
        writeState(state);
    }

    if (state.step === 'roster') {
        await db.collection('users').doc(currentUser.uid).update({
            accountType: 'personal',
            email: newEmail,
            churchId: null,
            churchName: null,
            primaryOrgId: source.churchId,
            updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
        });
        state = { ...state, step: nextPersonalMigrationStep(state.step) };
        writeState(state);
    }

    await migratePersonalTalentWalletIfNeeded(currentUser.uid, source.churchId);

    const userDoc = await db.collection('users').doc(currentUser.uid).get();
    if (!userDoc.exists) throw migrationError('migration/user-missing', '회원 정보를 다시 불러오지 못했습니다.');
    const migratedUser = userDocToState(userDoc);
    migratedUser.extraOrgs = await loadUserExtraOrgs(currentUser.uid);
    clearPersonalMigration();
    return migratedUser;
};

export const migrateChurchMemberToPersonal = ({ currentUser, phone4 }) => {
    const uid = currentUser?.uid;
    if (uid && migrationPromises.has(uid)) return migrationPromises.get(uid);
    const request = runMigration({ currentUser, phone4 }).finally(() => {
        if (migrationPromises.get(uid) === request) migrationPromises.delete(uid);
    });
    if (uid) migrationPromises.set(uid, request);
    return request;
};
