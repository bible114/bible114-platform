import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
    GUARDIAN_CONSENT_METHODS,
    SIGNUP_POLICY_VERSIONS,
    buildSignupConsentSummary,
    buildSignupConsentSnapshot,
    getAgeAssessment,
    parseBirthdate,
    validateSignupConsent,
} from '../src/utils/signupConsent.js';

const read = path => fs.readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

assert.deepEqual(parseBirthdate('20120229'), { year: 2012, month: 2, day: 29, value: '20120229' });
for (const invalid of ['', '20120230', '20121301', '2012011', 'not-a-date']) {
    assert.equal(parseBirthdate(invalid), null, `${invalid}는 유효한 생년월일이 아니어야 한다.`);
}

assert.deepEqual(getAgeAssessment('20120714', '2026-07-14'), {
    birthdate: '20120714', asOfDate: '2026-07-14', age: 14, under14: false,
});
assert.deepEqual(getAgeAssessment('20120715', '2026-07-14'), {
    birthdate: '20120715', asOfDate: '2026-07-14', age: 13, under14: true,
});
assert.equal(getAgeAssessment('20300101', '2026-07-14'), null, '미래 생년월일을 허용하면 안 된다.');
assert.equal(
    getAgeAssessment('20120714', new Date('2026-07-13T15:00:00.000Z')).under14,
    false,
    'UTC 날짜가 전날이어도 KST 자정이면 생일 경계가 안정적이어야 한다.',
);

const adultConsents = {
    terms: true,
    privacy: true,
    sensitive: true,
    community: true,
};
assert.equal(validateSignupConsent({ birthdate: '19900101', consents: adultConsents }, { asOf: '2026-07-14' }).ok, true);
for (const key of ['terms', 'privacy', 'sensitive', 'community']) {
    const consents = { ...adultConsents, [key]: false };
    const result = validateSignupConsent({ birthdate: '19900101', consents }, { asOf: '2026-07-14' });
    assert.equal(result.ok, false);
    assert.ok(result.errors.some(error => error.field === key));
}

const childBase = { birthdate: '20150101', consents: adultConsents };
assert.equal(validateSignupConsent(childBase, { asOf: '2026-07-14' }).ok, false, '만 14세 미만은 보호자 동의가 필요하다.');

const guardianAssertion = {
    agreed: true,
    method: GUARDIAN_CONSENT_METHODS.GUARDIAN_ASSERTION,
    guardianName: '홍보호',
    relationship: '부',
};
assert.equal(validateSignupConsent({
    ...childBase,
    consents: { ...adultConsents, childGuardian: guardianAssertion },
}, { asOf: '2026-07-14' }).ok, true);

const googleSignal = {
    agreed: true,
    method: GUARDIAN_CONSENT_METHODS.GOOGLE_PROVIDER_SIGNAL,
    provider: 'google',
    evidenceRef: 'family-link-evidence:opaque-123',
};
assert.equal(validateSignupConsent({
    ...childBase,
    consents: { ...adultConsents, childGuardian: googleSignal },
}, { asOf: '2026-07-14' }).ok, true);
assert.equal(validateSignupConsent({
    ...childBase,
    consents: { ...adultConsents, childGuardian: { ...googleSignal, evidenceRef: '' } },
}, { asOf: '2026-07-14' }).ok, false, '일반 Google 로그인만으로 보호자 동의를 통과시키면 안 된다.');

const snapshot = buildSignupConsentSnapshot({
    ...childBase,
    consents: { ...adultConsents, childGuardian: guardianAssertion },
}, {
    asOf: '2026-07-14',
    agreedAt: '2026-07-14T12:34:56.000Z',
    source: 'manual_personal_signup',
});
assert.equal(snapshot.schemaVersion, 1);
assert.deepEqual(snapshot.policyVersions, SIGNUP_POLICY_VERSIONS);
assert.equal(snapshot.agreements.childGuardian.required, true);
assert.equal(snapshot.agreements.childGuardian.method, 'guardian_assertion');
assert.equal(snapshot.agreements.childGuardian.identityVerifiedByPlatform, false);
assert.equal(snapshot.agreements.childGuardian.legalAuthorityVerifiedByPlatform, false);
assert.doesNotThrow(() => JSON.stringify(snapshot), 'snapshot은 Firestore에 저장 가능한 순수 JSON 형태여야 한다.');
const summary = buildSignupConsentSummary(snapshot);
assert.equal(summary.under14, true);
assert.equal(summary.guardianConsentRecorded, true);
assert.equal('guardianName' in summary, false, '공개 사용자 문서 요약에 보호자 성명이 있으면 안 된다.');

const adultSnapshot = buildSignupConsentSnapshot({ birthdate: '19900101', consents: adultConsents }, {
    asOf: '2026-07-14', agreedAt: '2026-07-14T00:00:00.000Z',
});
assert.deepEqual(adultSnapshot.agreements.childGuardian, {
    required: false,
    agreed: false,
    method: null,
    identityVerifiedByPlatform: false,
    legalAuthorityVerifiedByPlatform: false,
});

assert.throws(
    () => buildSignupConsentSnapshot({ birthdate: '19900101', consents: { ...adultConsents, terms: false } }),
    error => error.code === 'INVALID_SIGNUP_CONSENT' && Array.isArray(error.details),
);
assert.throws(
    () => buildSignupConsentSnapshot({ birthdate: '19900101', consents: adultConsents }, { agreedAt: 'not-a-date' }),
    error => error.code === 'INVALID_CONSENT_TIMESTAMP',
);

const adminConsents = { ...adultConsents, community: true };
const adminSnapshot = buildSignupConsentSnapshot({
    birthdate: null,
    consents: adminConsents,
    audience: 'communityAdmin',
    ageConfirmed14Plus: true,
}, { asOf: '2026-07-14', agreedAt: '2026-07-14T00:00:00.000Z' });
assert.equal(adminSnapshot.ageAssessment.confirmed14Plus, true);
assert.equal(adminSnapshot.agreements.community.agreed, true);
assert.equal(validateSignupConsent({
    birthdate: null, consents: adminConsents, audience: 'communityAdmin', ageConfirmed14Plus: false,
}, { asOf: '2026-07-14' }).ok, false, '공동체 관리자의 연령 확인이 없으면 안 된다.');

const guardianComponent = read('src/components/policies/GuardianConsent.jsx');
const policyIndex = read('src/components/policies/index.js');
const loginView = read('src/components/LoginView.jsx');
const socialOnboarding = read('src/components/SocialOnboardingView.jsx');
const authHook = read('src/hooks/useAuth.js');
const firestoreRules = read('firestore.rules');
assert.match(guardianComponent, /getAgeAssessment\(normalizedBirthdate\)/, '보호자 UI는 공용 만14세 판정을 사용해야 한다.');
assert.match(guardianComponent, /if \(!assessment\.under14\) return null;/, '만14세 이상에게 보호자 입력을 표시하면 안 된다.');
assert.match(guardianComponent, /GUARDIAN_CONSENT_METHODS\.GUARDIAN_ASSERTION/, 'UI payload는 guardian_assertion 방식이어야 한다.');
for (const relationship of ['부', '모', '후견인', '기타']) assert.match(guardianComponent, new RegExp(relationship));
assert.match(guardianComponent, /보호자인 제가 직접 이용약관, 개인정보 수집·이용, 민감정보 처리와 공동체 명부·랭킹 표시 내용을 확인했으며 이에 동의합니다/);
assert.match(guardianComponent, /본인인증한 것은 아닙니다/);
assert.match(guardianComponent, /role="alert"[\s\S]*생년월일을 확인해주세요/);
assert.match(policyIndex, /export \{ default as GuardianConsent \} from '\.\/GuardianConsent';/);
assert.match(policyIndex, /default as PolicyConsent, PolicyDialog/);
assert.match(loginView, /audience="communityAdmin"/);
assert.match(loginView, /주요 교단의 공식 결의/);
assert.match(loginView, /openPublicPolicyId/);
assert.match(socialOnboarding, /<GuardianConsent/);
assert.match(socialOnboarding, /<PolicyConsent/);
assert.match(authHook, /writeSignupConsent\(/);
assert.match(authHook, /consentSummary: buildSignupConsentSummary\(signupConsent\)/);
assert.match(
    firestoreRules,
    /request\.resource\.data\.role == 'churchAdmin'[\s\S]*!exists\(\/databases\/\$\(database\)\/documents\/churches\/\$\(request\.resource\.data\.churchId\)\)[\s\S]*getAfter\(\/databases\/\$\(database\)\/documents\/churches\/\$\(request\.resource\.data\.churchId\)\/private\/admin\)\.data\.adminUid == uid/,
    '이미 존재하는 공동체를 지정한 churchAdmin 자가 생성은 규칙에서 차단해야 한다.',
);
assert.match(
    firestoreRules,
    /match \/private\/consent \{[\s\S]*allow read: if isRealUser\(\) && \(request\.auth\.uid == uid \|\| isPlatformAdmin\(\)\);[\s\S]*allow create, update: if isRealUser\(\) && request\.auth\.uid == uid;[\s\S]*allow delete: if false;/,
    '동의 원문은 공동체 관리자가 읽거나 수정할 수 없어야 한다.',
);
assert.match(
    firestoreRules,
    /match \/private\/\{privateId\} \{[\s\S]*allow read, write: if privateId != 'consent'/,
    '포괄 private 규칙이 consent 전용 제한을 우회하면 안 된다.',
);
assert.match(
    authHook,
    /이메일 가입도 Google 가입과 동일하게[\s\S]*db\.runTransaction\(async transaction =>[\s\S]*transaction\.set\(churchRef,[\s\S]*transaction\.set\(userRef, newUser\);[\s\S]*transaction\.set\(consentRef,[\s\S]*transaction\.set\(churchAdminRef,/,
    '이메일 공동체 관리자 가입도 소유 증명과 계정을 원자적으로 생성해야 한다.',
);
assert.match(
    authHook,
    /canResumeEmailSignup[\s\S]*provider\?\.providerId === 'password'[\s\S]*if \(!existingUserDoc\.exists\)[\s\S]*cred = \{ user: currentAuthUser \}/,
    'Auth 생성 뒤 Firestore 실패 시 같은 password 인증 세션으로 관리자 가입을 재개해야 한다.',
);
assert.match(
    authHook,
    /existingUserDoc\.exists && existingUserDoc\.data\(\)\?\.role === 'churchAdmin'[\s\S]*loadChurchCommunities\(recoveredUser\.churchId\)[\s\S]*recovered: true/,
    'commit 응답 유실 시 이미 생성된 관리자 문서를 복구하고 공동체를 중복 생성하면 안 된다.',
);
assert.match(
    authHook,
    /transactionError\.emailAdminSignupIncomplete = true;[\s\S]*transactionError\.emailAdminSignupResumable = authSessionPreserved;/,
    '이메일 관리자 Firestore 실패는 인증 세션 보존 여부를 호출부에 전달해야 한다.',
);
assert.match(authHook, /인증 계정은 만들어졌지만 공동체 정보 저장이 완료되지 않았습니다/);
assert.match(authHook, /로그인 상태가 변경되어 자동 재개할 수 없습니다/);

console.log('가입 동의 모델 검증 통과: 정책 버전·필수 동의·만14세·보호자 방식·Firestore snapshot');
