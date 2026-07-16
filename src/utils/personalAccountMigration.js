import { auth, db } from './firebase';
import { makePseudoEmail, makeUnaffiliatedIdentity, userDocToState, migratePersonalTalentWalletIfNeeded } from './helpers';
import { writeMemberCredentials } from './memberCredentials';
import { loadUserExtraOrgs } from './roster';
import { convertToPersonalAccount, createRequestId } from './platformApi';
import {
    buildRecoveredPersonalMigrationState,
    PERSONAL_MIGRATION_STEPS,
    nextPersonalMigrationStep,
} from './personalMigrationSteps';

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
const REQUEST_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

// Auth 이메일 변경은 Firestore 전환보다 먼저 일어난다. 브라우저 저장소가
// 사라져도 새 개인 pseudo-email 자체를 durable intent로 사용해 어느 기기에서나
// 동일 uid의 전환을 재개한다. users 값만으로 임의 전환을 시작하지 않고,
// 인증된 Auth 이메일이 users 이름·생년월일+전화4자리 계약과 정확히 맞을 때만 복구한다.
export const restorePendingPersonalMigrationFromAuth = ({ firebaseUser, userData }) => {
    const existing = getPendingPersonalMigration(firebaseUser?.uid);
    if (existing) return existing;
    const state = buildRecoveredPersonalMigrationState(
        { firebaseUser, userData },
        { makePseudoEmail, makeUnaffiliatedIdentity, createRequestId },
    );
    if (!state) return null;
    writeState(state);
    return state;
};

const assertMigrationAuth = uid => {
    if (!auth.currentUser || auth.currentUser.uid !== uid) {
        throw migrationError('migration/auth-changed', '로그인 상태가 변경되었습니다. 다시 로그인해주세요.');
    }
    return auth.currentUser;
};

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
    if (!PERSONAL_MIGRATION_STEPS.includes(state.step)) {
        throw migrationError('migration/state-invalid', '개인 계정 전환 상태를 다시 확인해주세요.');
    }
    const conversionRequestId = REQUEST_ID_PATTERN.test(state.conversionRequestId || '')
        ? state.conversionRequestId
        : createRequestId();
    state = { ...state, phone4: normalizedPhone4, newEmail, source, conversionRequestId };
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

    // 구 브라우저는 roster 생성 뒤 users 전환을 직접 썼다. users commit 직후
    // 단계 저장만 유실된 경우에는 새 action 원장이 없으므로 canonical 완료
    // 상태를 서버에서 확인해 user 단계에 안전하게 합류시킨다.
    if (state.step === 'roster') {
        const legacyUserDoc = await db.collection('users').doc(currentUser.uid).get({ source: 'server' });
        if (!legacyUserDoc.exists) {
            throw migrationError('migration/user-missing', '회원 정보를 확인할 수 없습니다.');
        }
        const legacyUser = legacyUserDoc.data() || {};
        const legacyConversionCompleted = legacyUser.role === 'member'
            && legacyUser.accountType === 'personal'
            && legacyUser.churchId === null
            && legacyUser.churchName === null
            && legacyUser.primaryOrgId === source.churchId
            && legacyUser.email === newEmail
            && (legacyUser.isDeleted === undefined || legacyUser.isDeleted === false);
        if (legacyConversionCompleted) {
            state = { ...state, step: 'user' };
            writeState(state);
        }
    }

    // credentials는 새 흐름, 남아 있는 roster는 구 흐름의 users 미완료 지점이다.
    // 둘 다 같은 requestId의 서버 transaction으로 수렴시킨다.
    if (state.step === 'credentials' || state.step === 'roster') {
        const latestFirebaseUser = assertMigrationAuth(currentUser.uid);
        await latestFirebaseUser.getIdToken(true);
        assertMigrationAuth(currentUser.uid);
        const conversion = await convertToPersonalAccount({
            expectedUid: currentUser.uid,
            requestId: state.conversionRequestId,
        });
        assertMigrationAuth(currentUser.uid);
        state = {
            ...state,
            step: 'user',
            source: { ...source, churchId: conversion.result.primaryOrgId },
        };
        writeState(state);
    }

    const primaryOrgId = state.source?.churchId || source.churchId;
    await migratePersonalTalentWalletIfNeeded(currentUser.uid, primaryOrgId);
    assertMigrationAuth(currentUser.uid);

    const userDoc = await db.collection('users').doc(currentUser.uid).get({ source: 'server' });
    if (!userDoc.exists) throw migrationError('migration/user-missing', '회원 정보를 다시 불러오지 못했습니다.');
    const migratedUser = userDocToState(userDoc);
    if (migratedUser.uid !== currentUser.uid
        || migratedUser.accountType !== 'personal'
        || migratedUser.churchId !== null
        || migratedUser.primaryOrgId !== primaryOrgId) {
        throw migrationError('migration/state-invalid', '개인 계정 전환 결과를 다시 확인해주세요.');
    }
    migratedUser.extraOrgs = await loadUserExtraOrgs(currentUser.uid, { source: 'server' });
    assertMigrationAuth(currentUser.uid);
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
