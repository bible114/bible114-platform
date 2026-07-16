import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
    buildRecoveredPersonalMigrationState,
    PERSONAL_MIGRATION_STEPS,
    nextPersonalMigrationStep,
} from '../src/utils/personalMigrationSteps.js';
import {
    validateConvertToPersonalAccountResponse,
} from '../src/utils/platformApi.js';

const migrationSource = fs.readFileSync(new URL('../src/utils/personalAccountMigration.js', import.meta.url), 'utf8');
const cardSource = fs.readFileSync(new URL('../src/components/dashboard/PersonalAccountMigrationCard.jsx', import.meta.url), 'utf8');
const authSource = fs.readFileSync(new URL('../src/hooks/useAuth.js', import.meta.url), 'utf8');
const userAuthSource = fs.readFileSync(new URL('../src/hooks/useUserAuth.js', import.meta.url), 'utf8');
const loginSource = fs.readFileSync(new URL('../src/components/LoginView.jsx', import.meta.url), 'utf8');
const appSource = fs.readFileSync(new URL('../src/App.jsx', import.meta.url), 'utf8');

assert.deepEqual(PERSONAL_MIGRATION_STEPS, ['start', 'email', 'credentials', 'roster', 'user']);
assert.equal(nextPersonalMigrationStep('user'), 'complete');
assert.equal(nextPersonalMigrationStep('start'), 'email');
assert.equal(nextPersonalMigrationStep('email'), 'credentials');
assert.equal(nextPersonalMigrationStep('credentials'), 'roster');
assert.equal(nextPersonalMigrationStep('roster'), 'user');

const recoveryRequestId = '22222222-2222-4222-8222-222222222222';
const recoveryDeps = {
    makePseudoEmail: (name, identity) => `${encodeURIComponent(name)}_${identity}@bible.local`,
    makeUnaffiliatedIdentity: (birthdate, phone4) => `${birthdate}p${phone4}`,
    createRequestId: () => recoveryRequestId,
};
const recoveryUser = {
    uid: 'user-1',
    name: '성도님',
    birthdate: '19900101',
    role: 'member',
    accountType: 'church',
    churchId: 'church-1',
    churchName: '출발교회',
    primaryOrgId: null,
    isDeleted: false,
    departmentId: 'adult',
};
const recoveryFirebaseUser = {
    uid: 'user-1',
    email: `${encodeURIComponent('성도님')}_19900101p1234@bible.local`,
};
assert.deepEqual(buildRecoveredPersonalMigrationState(
    { firebaseUser: recoveryFirebaseUser, userData: recoveryUser },
    recoveryDeps,
), {
    uid: 'user-1',
    step: 'email',
    phone4: '1234',
    newEmail: recoveryFirebaseUser.email,
    source: {
        churchId: 'church-1',
        churchName: '출발교회',
        departmentId: 'adult',
        departmentName: null,
        subgroupId: null,
        subgroupName: null,
    },
    conversionRequestId: recoveryRequestId,
    recoveredFromAuth: true,
});
for (const [firebasePatch, userPatch] of [
    [{ email: `${encodeURIComponent('다른이름')}_19900101p1234@bible.local` }, {}],
    [{ email: `${encodeURIComponent('성도님')}_19900101p123@bible.local` }, {}],
    [{ uid: 'other' }, {}],
    [{}, { uid: 'other' }],
    [{}, { role: 'churchAdmin' }],
    [{}, { accountType: 'personal' }],
    [{}, { churchId: 'unaffiliated_v1' }],
    [{}, { primaryOrgId: 'church-1' }],
    [{}, { isDeleted: true }],
    [{}, { birthdate: '19900230' }],
]) {
    assert.equal(buildRecoveredPersonalMigrationState({
        firebaseUser: { ...recoveryFirebaseUser, ...firebasePatch },
        userData: { ...recoveryUser, ...userPatch },
    }, recoveryDeps), null);
}

assert.match(migrationSource, /makePseudoEmail\([\s\S]*makeUnaffiliatedIdentity/);
assert.match(migrationSource, /auth\/email-already-in-use/);
assert.match(migrationSource, /같은 이름·생년월일·전화번호 조합의 계정이 이미 있어요/);
assert.match(migrationSource, /auth\/requires-recent-login/);
assert.match(migrationSource, /conversionRequestId[\s\S]*createRequestId\(\)/,
    '응답 유실 재시도를 위해 서버 전환 requestId를 로컬 단계에 먼저 저장해야 한다.');
assert.match(migrationSource, /state\.step === 'credentials' \|\| state\.step === 'roster'/,
    '새 credentials 단계와 구 브라우저 roster 단계를 같은 서버 action으로 재개해야 한다.');
assert.match(migrationSource, /state\.step === 'roster'[\s\S]*get\(\{ source: 'server' \}\)[\s\S]*legacyUser\.accountType === 'personal'[\s\S]*legacyUser\.primaryOrgId === source\.churchId[\s\S]*legacyUser\.email === newEmail[\s\S]*step: 'user'/,
    '구 브라우저가 users commit 뒤 단계 저장만 잃은 roster 상태를 canonical 서버 users로 복구해야 한다.');
assert.match(migrationSource, /getIdToken\(true\)[\s\S]*convertToPersonalAccount\(\{[\s\S]*requestId: state\.conversionRequestId/,
    'Auth 이메일 변경 후 새 email claim을 강제 갱신하고 동일 requestId로 전환해야 한다.');
assert.match(migrationSource, /step: 'user'[\s\S]*churchId: conversion\.result\.primaryOrgId/,
    '서버가 확정한 primary 조직으로 후속 지갑 이관 단계를 저장해야 한다.');
assert.match(migrationSource, /get\(\{ source: 'server' \}\)[\s\S]*loadUserExtraOrgs\(currentUser\.uid, \{ source: 'server' \}\)/,
    '전환·지갑 이관 뒤 users와 roster를 서버 원장에서 다시 읽어야 한다.');
assert.doesNotMatch(migrationSource, /db\.runTransaction|transaction\.set|\.collection\('users'\)\.doc\([^)]*\)\.update|firebase\.firestore/,
    '브라우저가 users 또는 roster 전환 상태를 직접 쓰면 안 된다.');
assert.match(migrationSource, /buildRecoveredPersonalMigrationState\([\s\S]*makePseudoEmail[\s\S]*makeUnaffiliatedIdentity[\s\S]*createRequestId/,
    '인증된 개인 pseudo-email 복구는 검증된 순수 상태 builder만 사용해야 한다.');

const requestId = '11111111-1111-4111-8111-111111111111';
assert.deepEqual(validateConvertToPersonalAccountResponse({
    ok: true,
    action: 'convertToPersonalAccount',
    requestId,
    alreadyCompleted: false,
    committed: true,
    result: { status: 'converted', primaryOrgId: 'church-1' },
}, requestId), {
    ok: true,
    action: 'convertToPersonalAccount',
    requestId,
    alreadyCompleted: false,
    committed: true,
    result: { status: 'converted', primaryOrgId: 'church-1' },
});
assert.throws(() => validateConvertToPersonalAccountResponse({
    ok: true,
    action: 'convertToPersonalAccount',
    requestId,
    alreadyCompleted: true,
    committed: true,
    result: { status: 'converted', primaryOrgId: 'church-1', extra: true },
}, requestId), /안전하게 확인하지 못했습니다/);

assert.match(cardSource, /currentUser\?\.role === 'member'/);
assert.match(cardSource, /currentUser\.accountType !== 'personal'/);
assert.match(cardSource, /currentUser\.churchId !== UNAFFILIATED_CHURCH_ID/);
assert.match(cardSource, /\^\\d\{4\}\$/);
assert.match(authSource, /error\?\.code !== 'auth\/email-already-in-use'/);
assert.match(authSource, /getPendingPersonalMigration\(firebaseUser\.uid\)/);
assert.match(authSource, /getPendingPersonalMigration\(firebaseUser\.uid\)[\s\S]*restorePendingPersonalMigrationFromAuth\(\{ firebaseUser, userData: data \}\)/,
    '새 기기 개인 로그인도 Auth 이메일에서 전환 pending을 복구해야 한다.');
assert.match(userAuthSource, /restorePendingPersonalMigrationFromAuth\(\{ firebaseUser, userData \}\)[\s\S]*userDocToState/,
    '저장된 Auth 세션 복원도 currentUser 적용 전에 전환 pending을 복구해야 한다.');
assert.match(loginSource, /시작하기 · 개인 계정 로그인/);
const resumeEffectStart = appSource.indexOf('const pending = getPendingPersonalMigration(currentUser.uid);');
assert.ok(resumeEffectStart >= 0, 'App에 개인 계정 전환 재개 effect가 필요하다.');
const resumeEffect = appSource.slice(Math.max(0, resumeEffectStart - 180), resumeEffectStart + 300);
assert.doesNotMatch(resumeEffect, /accountType === 'personal'\) return/,
    '서버 commit 응답 유실 뒤 personal 계정도 pending 정리를 재개해야 한다.');
assert.match(resumeEffect, /handlePersonalAccountMigrate\(pending\.phone4\)/);

console.log('개인 계정 전환 검증 통과: 멱등 서버 전환, 레거시 재개, 충돌, 비노출, 로그인 겸용 계약');
