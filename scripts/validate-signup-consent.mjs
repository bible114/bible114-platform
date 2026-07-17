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
const app = read('src/App.jsx');
const loginView = read('src/components/LoginView.jsx');
const socialOnboarding = read('src/components/SocialOnboardingView.jsx');
const authHook = read('src/hooks/useAuth.js');
const userAuthHook = read('src/hooks/useUserAuth.js');
const platformApiClient = read('src/utils/platformApi.js');
const platformApiCore = read('supabase/functions/platform-api/core.ts');
const platformApiIndex = read('supabase/functions/platform-api/index.ts');
const kakaoAuthClient = read('src/utils/kakaoAuth.js');
const servicePolicies = read('src/data/servicePolicies.js');
const adminSignupCore = read('supabase/functions/platform-api/completeChurchAdminSignupCore.ts');
const adminSignupCoreTest = read('supabase/functions/platform-api/completeChurchAdminSignupCore_test.ts');
const adminSignupService = read('supabase/functions/platform-api/completeChurchAdminSignupService.ts');
const adminSignupServiceTest = read('supabase/functions/platform-api/completeChurchAdminSignupService_test.ts');
const firestoreRules = read('firestore.rules');
assert.match(firestoreRules, /function isChurchAdmin\(churchId\)[\s\S]*myData\(\)\.get\('isDeleted', false\) != true/);
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
assert.match(servicePolicies, /SERVICE_POLICY_VERSION = '2026-07-16'/);
assert.match(adminSignupCore, /COMMUNITY_ADMIN_POLICY_VERSION = "2026-07-16"/);
assert.match(loginView, /onKakaoAdminSignupStart[\s\S]*contactEmail:\s*aEmail[\s\S]*policyConsents:\s*aPolicyConsents/);
assert.match(loginView, /initialKakaoAdminSignup\.uid && initialKakaoAdminSignup\.provider === 'kakao\.com'[\s\S]*provider:\s*'kakao\.com'[\s\S]*setAEmail\(String\(draft\.contactEmail/);
assert.match(loginView, /카카오로 공동체 등록 시작[\s\S]*관리자 연락 이메일/);
assert.match(kakaoAuthClient, /KAKAO_ADMIN_SIGNUP_RETURNING_KEY[\s\S]*KAKAO_ADMIN_SIGNUP_DRAFT_KEY/);
assert.match(authHook, /handleKakaoAdminSignupStart[\s\S]*KAKAO_ADMIN_SIGNUP_RETURNING_KEY, 'pending'[\s\S]*KAKAO_ADMIN_SIGNUP_DRAFT_KEY, JSON\.stringify/);
assert.match(authHook, /isAdminSignupReturn[\s\S]*signInWithCustomToken\(profile\.token\)[\s\S]*\/\^kakao:\[1-9\]\[0-9\]\*\$\/[\s\S]*get\(\{ source: 'server' \}\)[\s\S]*onKakaoAdminSignupReady\(pendingProfile\)/);
const kakaoPersonalStartFlow = authHook.slice(
    authHook.indexOf('const handleKakaoStart = async'),
    authHook.indexOf('const handleGoogleLink = async'),
);
const kakaoLinkStartFlow = authHook.slice(
    authHook.indexOf('const handleKakaoLinkStart = async'),
    authHook.indexOf('const handleSocialOnboardingComplete = async'),
);
const kakaoAdminStartFlow = authHook.slice(
    authHook.indexOf('const handleKakaoAdminSignupStart = async'),
    authHook.indexOf('const cancelGoogleAdminSignup = async'),
);
assert.match(kakaoPersonalStartFlow, /removeItem\(KAKAO_LINK_RETURNING_KEY\)[\s\S]*removeItem\(KAKAO_ADMIN_SIGNUP_RETURNING_KEY\)[\s\S]*removeItem\(KAKAO_ADMIN_SIGNUP_DRAFT_KEY\)/);
assert.match(kakaoLinkStartFlow, /removeItem\(KAKAO_SIGNUP_DRAFT_KEY\)[\s\S]*removeItem\(KAKAO_ADMIN_SIGNUP_RETURNING_KEY\)[\s\S]*removeItem\(KAKAO_ADMIN_SIGNUP_DRAFT_KEY\)/);
assert.match(kakaoAdminStartFlow, /removeItem\(KAKAO_LINK_RETURNING_KEY\)[\s\S]*removeItem\(KAKAO_SIGNUP_DRAFT_KEY\)[\s\S]*setItem\(KAKAO_ADMIN_SIGNUP_RETURNING_KEY, 'pending'\)/);
assert.match(authHook, /이미 등록된 카카오 계정입니다\. 첫 화면의 카카오로 시작 버튼으로 로그인해주세요\./);
assert.match(authHook, /finally \{[\s\S]*if \(finalResult\.ok \|\| finalResult\.resetGoogleProfile\) \{[\s\S]*onKakaoAdminSignupReady\(null\)[\s\S]*if \(isSocialSignup\)/);
assert.match(app, /const handleLogout = \(\) => \{[\s\S]*setPendingKakaoAdminSignup\(null\)[\s\S]*setLoginInitialTab\('member'\)/);
assert.match(app, /const handleGuestSignupStart = \(\) => \{[\s\S]*setPendingKakaoAdminSignup\(null\)[\s\S]*setView\('login'\)/);
assert.match(socialOnboarding, /<GuardianConsent/);
assert.match(socialOnboarding, /<PolicyConsent/);
assert.match(authHook, /writeSignupConsent\(/);
assert.match(authHook, /consentSummary: buildSignupConsentSummary\(signupConsent\)/);

// 일반 교인·개인 계정 가입의 기존 서버 authority 계약도 계속 유지되어야 한다.
assert.match(authHook, /completeMemberSignupViaApi\(\{[\s\S]*churchId,[\s\S]*entryCode:\s*churchId === UNAFFILIATED_CHURCH_ID \|\| joinTicket \? '' : churchCode,[\s\S]*joinTicket:\s*churchId === UNAFFILIATED_CHURCH_ID \? '' : joinTicket,[\s\S]*name:\s*newUser\.name,[\s\S]*birthdate:\s*newUser\.birthdate,[\s\S]*guestProgress:/);
assert.doesNotMatch(authHook, /collection\('settings'\)\.doc\('platformStats'\)/);
assert.match(authHook, /const migrateGuest = shouldMigrateGuestState\(\);[\s\S]*if \(migrateGuest\)[\s\S]*migratedAt/);
assert.match(authHook, /finishMemberSignup\(\{\s*user:\s*cred\.user,[\s\S]*churchCode,[\s\S]*joinTicket,[\s\S]*signupConsent\s*\}\)/);
assert.match(
    firestoreRules,
    /request\.resource\.data\.role == 'member'[\s\S]*request\.resource\.data\.churchId == 'unaffiliated_v1'[\s\S]*accountType', null\) != 'personal'/,
    '개인 계정의 users 직접 create는 닫고 기존 무소속 교인 예외만 남겨야 한다.',
);
assert.doesNotMatch(firestoreRules, /request\.resource\.data\.accountType == 'personal'[\s\S]*request\.resource\.data\.churchId == null/);
assert.match(authHook, /completePersonalSignupViaApi\(\{[\s\S]*authProvider:[\s\S]*guestProgress:/);
assert.doesNotMatch(authHook, /transaction\.set\(rosterRef,[\s\S]*transaction\.set\(userRef, newUser\)/);

// 공동체 관리자 가입은 브라우저 Firestore transaction이 아니라 검증된 ID token을
// 사용하는 completeChurchAdminSignup 서버 action 하나만 authority로 삼는다.
const adminSignupStart = authHook.indexOf('const handleChurchAdminSignup = async');
const adminSignupEnd = authHook.indexOf('\n    return {', adminSignupStart);
assert.ok(adminSignupStart >= 0 && adminSignupEnd > adminSignupStart, '공동체 관리자 가입 함수 범위를 찾을 수 있어야 한다.');
const adminSignupFlow = authHook.slice(adminSignupStart, adminSignupEnd);
assert.match(authHook, /completeChurchAdminSignup as completeChurchAdminSignupViaApi/);
assert.equal(
    [...adminSignupFlow.matchAll(/completeChurchAdminSignupViaApi\(/g)].length,
    1,
    '관리자 가입의 서버 action 호출 지점은 하나여야 한다.',
);
assert.doesNotMatch(adminSignupFlow, /db\.runTransaction\s*\(/, '관리자 가입 브라우저 transaction을 되살리면 안 된다.');
assert.doesNotMatch(adminSignupFlow, /\b(?:transaction|batch)\.(?:set|create|update|delete)\s*\(/);
assert.doesNotMatch(adminSignupFlow, /db\.collection\(['"]churches['"]\)/, '브라우저에서 churches를 직접 만들면 안 된다.');
assert.doesNotMatch(
    adminSignupFlow,
    /db\.collection\(['"]users['"]\)\.doc\([\s\S]{0,120}?\)\.(?:set|update|delete)\s*\(/,
    '브라우저에서 churchAdmin users 문서를 직접 만들거나 고치면 안 된다.',
);
assert.match(
    adminSignupFlow,
    /completeChurchAdminSignupViaApi\(\{[\s\S]*name,[\s\S]*contactEmail:[\s\S]*churchName,[\s\S]*pastorName:[\s\S]*denomination:[\s\S]*entryCode:\s*churchCode,[\s\S]*departments:[\s\S]*password:\s*signupPassword,[\s\S]*consent,[\s\S]*\},\s*\{[\s\S]*expectedUid:\s*authUser\.uid[\s\S]*requestId/,
    '브라우저는 서버 action에 조직 정보·비밀·동의와 기대 uid를 전달해야 한다.',
);

// Kakao·Google·이메일 모두 같은 action을 사용하되, provider에 맞는 source/password를 보낸다.
assert.match(
    adminSignupFlow,
    /buildSignupConsentSnapshot\([\s\S]*audience:\s*'communityAdmin',[\s\S]*ageConfirmed14Plus,[\s\S]*source:\s*socialProvider === 'kakao\.com'[\s\S]*'kakao_community_admin_signup'[\s\S]*'google_community_admin_signup'[\s\S]*'email_community_admin_signup'/,
);
assert.match(
    adminSignupFlow,
    /if \(isSocialSignup\)[\s\S]*existingDoc = await db\.collection\('users'\)\.doc\(profileUid\)\.get\(\{ source: 'server' \}\)[\s\S]*finishServerChurchAdminSignup\(googleUser, null, \{[\s\S]*requestId: googleSignupRequestId/,
    '소셜 경로는 서버 사용자 상태를 확인하고 null password로 action을 호출해야 한다.',
);
assert.match(
    adminSignupFlow,
    /googleAdminSignupPendingRef\.current[\s\S]*pending\?\.attemptKey === googleSignupAttemptKey[\s\S]*googleSignupRequestId = pending\.requestId[\s\S]*googleSignupConsent = pending\.consent[\s\S]*googleSignupRequestId = createRequestId\(\)/,
    'Google 가입의 모호한 실패 재시도는 같은 payload에 같은 UUID와 동의 원문을 재사용해야 한다.',
);
const googleExistingStart = adminSignupFlow.indexOf("const existingDoc = await db.collection('users').doc(profileUid).get({ source: 'server' });");
const googleExistingEnd = adminSignupFlow.indexOf('\n                const googleUser = auth.currentUser;', googleExistingStart);
assert.ok(googleExistingStart >= 0 && googleExistingEnd > googleExistingStart, 'Google 기존 사용자 복구 범위를 찾을 수 없습니다.');
const googleExistingRecovery = adminSignupFlow.slice(googleExistingStart, googleExistingEnd);
assert.match(
    googleExistingRecovery,
    /providerIdentityMatches = socialProvider === 'kakao\.com'[\s\S]*existingUser\?\.authProvider === 'kakao\.com'[\s\S]*storedEmail === profileEmail[\s\S]*existingUser\?\.role === 'churchAdmin'[\s\S]*existingUser\?\.isDeleted !== true[\s\S]*existingUser\?\.onboardingPending === true[\s\S]*\/\^church_\[0-9a-f\]\{32\}\$\/i[\s\S]*providerIdentityMatches/,
    '응답 유실 복구는 provider identity가 일치하는 활성·온보딩 대기 churchAdmin만 후보로 삼아야 한다.',
);
assert.match(
    googleExistingRecovery,
    /collection\('private'\)\.doc\('consent'\)\.get\(\{ source: 'server' \}\)[\s\S]*recordedAt:[\s\S]*consentWithoutRecordedAt[\s\S]*finishServerChurchAdminSignup\(auth\.currentUser, null,[\s\S]*requestId: googleSignupRequestId/,
    '새 화면에서 복구할 때는 저장된 동의 원문을 source-server로 읽고 recordedAt만 제외한 뒤 서버 canonical 검증을 다시 거쳐야 한다.',
);
assert.match(
    googleExistingRecovery,
    /if \(!recoverableCommittedSignup\)[\s\S]*finishGoogleSignupTerminal[\s\S]*recoveryError instanceof PlatformApiError && recoveryError\.retryable !== true[\s\S]*finishGoogleSignupTerminal/,
    '기존 정상·삭제·다른 역할 계정과 canonical 불일치는 새 가입으로 수용하지 말고 기존 로그인 안내로 닫아야 한다.',
);
assert.match(
    adminSignupFlow,
    /auth\.createUserWithEmailAndPassword\(email, password\)[\s\S]*finishServerChurchAdminSignup\(cred\.user, password\)/,
    '이메일 경로는 password Auth 소유권을 확보한 뒤 같은 서버 action을 호출해야 한다.',
);

// action 응답만 믿지 않고 canonical users 문서와 공동체를 source-server로 다시 읽는다.
assert.match(
    adminSignupFlow,
    /const userDoc = await db\.collection\('users'\)\.doc\(authUser\.uid\)\.get\(\{ source: 'server' \}\);[\s\S]*storedUser\.role !== 'churchAdmin'[\s\S]*storedUser\.churchId !== result\.churchId[\s\S]*loadChurchCommunities\(result\.churchId, \{ requireServer: true \}\)/,
    'action 완료 뒤 서버 canonical 사용자·공동체를 확인해야 한다.',
);
assert.match(
    adminSignupFlow,
    /if \(canResumeEmailSignup\)[\s\S]*existingUserDoc = await db\.collection\('users'\)\.doc\(currentAuthUser\.uid\)\.get\(\{ source: 'server' \}\)[\s\S]*existingUserData\?\.role === 'churchAdmin'[\s\S]*loadChurchCommunities\(recoveredUser\.churchId, \{ requireServer: true \}\)[\s\S]*recovered: true/,
    '같은 세션 응답 유실 복구도 캐시가 아닌 서버 상태만 정답으로 삼아야 한다.',
);
assert.match(
    adminSignupFlow,
    /createError\?\.code === 'auth\/email-already-in-use'[\s\S]*auth\.signInWithEmailAndPassword\(normalizedSignupEmail, password\)[\s\S]*resumedDoc = await db\.collection\('users'\)\.doc\(cred\.user\.uid\)\.get\(\{ source: 'server' \}\)[\s\S]*if \(resumedUser\?\.role === 'churchAdmin'\)[\s\S]*loadChurchCommunities\(resumedUser\.churchId, \{ requireServer: true \}\)[\s\S]*if \(resumedDoc\.exists\)[\s\S]*finishServerChurchAdminSignup\(cred\.user, password\)/,
    '다른 기기의 고아 Auth도 비밀번호 재로그인·서버 문서 확인 뒤 복구하거나 action으로 이어가야 한다.',
);
assert.match(
    adminSignupFlow,
    /transactionError\.emailAdminSignupIncomplete = true;[\s\S]*transactionError\.emailAdminSignupResumable = authSessionPreserved;/,
    '서버 action 실패 후 재개 가능 여부를 UI에 전달해야 한다.',
);

// 클라이언트 wrapper와 Edge route는 exact request/response 및 verified token identity를 강제한다.
assert.match(platformApiClient, /const COMPLETE_CHURCH_ADMIN_SIGNUP_REQUEST_KEYS = new Set\(\[[\s\S]*'consent'[\s\S]*\]\)/);
assert.match(
    platformApiClient,
    /const validateCompleteChurchAdminSignupInput = input => \{[\s\S]*hasExactKeys\(input, COMPLETE_CHURCH_ADMIN_SIGNUP_REQUEST_KEYS\)[\s\S]*return \{[\s\S]*consent: \{ \.\.\.input\.consent \}/,
    '클라이언트 wrapper 입력은 exact payload여야 한다.',
);
assert.match(
    platformApiClient,
    /export const completeChurchAdminSignup = \(input, options = \{\}\) => \{[\s\S]*validateCompleteChurchAdminSignupInput\(input\)[\s\S]*callPlatformApi\('completeChurchAdminSignup', payload,[\s\S]*\['created', 'alreadyCompleted'\]\.includes\(result\.status\)[\s\S]*\/\^church_\[0-9a-f\]\{32\}\$\/i\.test\(result\.churchId\)/,
    '클라이언트 wrapper는 exact payload와 canonical action 결과만 받아야 한다.',
);
assert.match(
    platformApiCore,
    /if \(action === COMPLETE_CHURCH_ADMIN_SIGNUP_ACTION\) \{[\s\S]*const allowedKeys = new Set\(\[[\s\S]*"consent"[\s\S]*Object\.keys\(body\)\.some\(\(key\) => !allowedKeys\.has\(key\)\)[\s\S]*consent: consent as Record<string, unknown>/,
    'Edge parser도 관리자 가입 payload의 추가 필드를 거부해야 한다.',
);
const adminRouteStart = platformApiIndex.indexOf('if (parsed.action === "completeChurchAdminSignup")');
const canonicalUserLookupStart = platformApiIndex.indexOf('const userDocument = await getDocument<UserDocument>');
assert.ok(adminRouteStart >= 0 && adminRouteStart < canonicalUserLookupStart, '최초 가입 action은 기존 users 조회보다 먼저 처리돼야 한다.');
const adminRoute = platformApiIndex.slice(adminRouteStart, platformApiIndex.indexOf('\n    if (parsed.action === "rotateChurchAccessCode")', adminRouteStart));
assert.match(
    adminRoute,
    /churchAdminSignupIdentityFromVerifiedUser\(\{[\s\S]*uid: verifiedUser\.uid,[\s\S]*signInProvider: verifiedUser\.signInProvider,[\s\S]*claims: verifiedUser\.claims/,
    'uid/email/provider는 요청 body가 아니라 검증된 ID token claim에서 가져와야 한다.',
);

// 서버 core는 provider-source와 성인 동의 원문을 strict 검증하고 공개 users에는 요약만 만든다.
assert.match(
    adminSignupCore,
    /const validateConsent = \([\s\S]*exactKeys\(value, \[[\s\S]*"policyVersions"[\s\S]*"agreements"[\s\S]*value\.source !==[\s\S]*provider === "password"[\s\S]*"email_community_admin_signup"[\s\S]*provider === "google\.com"[\s\S]*"google_community_admin_signup"[\s\S]*"kakao_community_admin_signup"[\s\S]*confirmed14Plus !== true/,
);
assert.match(
    adminSignupCore,
    /rawProvider === "custom"[\s\S]*kakaoProviderAttestation === "kakao\.com"[\s\S]*uid === `kakao:\$\{kakaoId\}`[\s\S]*provider === "password"[\s\S]*provider !== "password" && password !== null[\s\S]*const \{ consent, summary \} = validateConsent/,
    '검증된 provider와 password·동의 source가 서로 어긋나면 거부해야 한다.',
);
assert.match(adminSignupCore, /consentSummary: summary/);
assert.match(
    adminSignupService,
    /updateWrite\(service\.projectId, userPath,[\s\S]*consentSummary: signup\.consentSummary[\s\S]*updateWrite\(service\.projectId, consentPath, \{[\s\S]*\.\.\.signup\.consent,[\s\S]*recordedAt: now/,
    '동의 요약은 users에, 원문은 users/{uid}/private/consent에 저장해야 한다.',
);
assert.match(
    adminSignupService,
    /const writes = \[[\s\S]*churchPath[\s\S]*userPath[\s\S]*consentPath[\s\S]*adminPath[\s\S]*accessPath[\s\S]*LEGACY_DIRECTORY_PATH[\s\S]*publicChurchPath[\s\S]*ledgerPath[\s\S]*commitWrites\([\s\S]*writes,[\s\S]*\{ transaction \}/,
    '공동체·관리자·동의·비밀·디렉토리·원장은 서버 transaction 하나로 생성해야 한다.',
);
assert.match(adminSignupCoreTest, /Google 가입은 google\.com token과 null password만 허용한다/);
assert.match(adminSignupCoreTest, /Kakao 가입은 custom token attestation을 canonical kakao\.com으로 만든다/);
assert.match(adminSignupServiceTest, /Kakao 생성은 attested kakao UID를 쓰고 수동 연락 이메일은 private admin에만 둔다/);
assert.match(adminSignupCoreTest, /동의 정책 버전·source·성인 확인·agreement exact schema를 검증한다/);
assert.match(adminSignupServiceTest, /공동체·관리자·private·두 디렉토리·원장을 한 transaction으로 생성한다/);
assert.match(adminSignupServiceTest, /응답 유실 뒤 새 UUID도 canonical 기존 churchAdmin으로 수렴한다/);

// 브라우저 규칙에는 무소속 교인 호환 create만 남고 관리자·공동체·보호 문서는 닫혀 있어야 한다.
const usersRuleStart = firestoreRules.indexOf('match /users/{uid}');
const usersCreateStart = firestoreRules.indexOf('allow create:', usersRuleStart);
const usersCreateEnd = firestoreRules.indexOf('// 본인 수정', usersCreateStart);
assert.ok(usersRuleStart >= 0 && usersCreateStart > usersRuleStart && usersCreateEnd > usersCreateStart);
const usersCreateRule = firestoreRules.slice(usersCreateStart, usersCreateEnd);
assert.match(
    usersCreateRule,
    /request\.resource\.data\.role == 'member'[\s\S]*request\.resource\.data\.churchId == 'unaffiliated_v1'/,
    '기존 무소속 교인 호환 create만 남아야 한다.',
);
assert.doesNotMatch(usersCreateRule, /churchAdmin/, '브라우저 churchAdmin users create 권한을 다시 열면 안 된다.');
const churchRuleStart = firestoreRules.indexOf('match /churches/{churchId}');
const churchPrivateRuleStart = firestoreRules.indexOf('match /private/{privateId}', churchRuleStart);
assert.ok(churchRuleStart >= 0 && churchPrivateRuleStart > churchRuleStart);
assert.match(firestoreRules.slice(churchRuleStart, churchPrivateRuleStart), /allow create: if false;[\s\S]*allow delete: if false;/);
assert.match(
    firestoreRules.slice(churchPrivateRuleStart, firestoreRules.indexOf('match /settings/{settingId}', churchPrivateRuleStart)),
    /allow write: if false;/,
    '브라우저가 private/admin 또는 private/access를 만들면 안 된다.',
);
assert.match(firestoreRules, /match \/publicChurches\/\{churchId\} \{[\s\S]*allow write: if false;/);
assert.match(firestoreRules, /match \/platformInternal\/\{documentId\} \{[\s\S]*allow read, write: if false;/);
assert.match(firestoreRules, /match \/settings\/churchDirectory \{[\s\S]*allow read: if true;[\s\S]*allow write: if false;/);
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
assert.match(authHook, /인증 계정은 만들어졌지만 공동체 정보 저장이 완료되지 않았습니다/);
assert.match(authHook, /로그인 상태가 변경되어 자동 재개할 수 없습니다/);
assert.match(
    userAuthHook,
    /userData\.isDeleted === true[\s\S]*setCurrentUser\(null\)[\s\S]*auth\.signOut\(\)[\s\S]*return;/,
    '삭제된 모든 계정은 남아 있는 Auth 세션으로 화면에 복원되면 안 된다.',
);
assert.match(
    authHook,
    /data\.isDeleted === true[\s\S]*rejectDeletedUser\([\s\S]*return false;/,
    '삭제된 계정의 이메일·Google 로그인을 차단해야 한다.',
);
assert.match(
    authHook,
    /existingUserData\?\.isDeleted === true[\s\S]*rejectDeletedUser\([\s\S]*retryable: false/,
    '삭제된 공동체 관리자 문서를 이메일 가입 복구 성공으로 취급하면 안 된다.',
);
assert.match(authHook, /삭제된 공동체 관리자 계정입니다/);

console.log('가입 동의 모델 검증 통과: 정책 버전·필수 동의·만14세·보호자 방식·Firestore snapshot');
