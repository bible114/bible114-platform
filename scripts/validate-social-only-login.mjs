import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = path => fs.readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const login = read('src/components/LoginView.jsx');
const onboarding = read('src/components/SocialOnboardingView.jsx');
const auth = read('src/hooks/useAuth.js');
const app = read('src/App.jsx');
const dashboard = read('src/components/DashboardView.jsx');
const transitionModal = read('src/components/modals/SocialLoginTransitionModal.jsx');
const transition = read('src/utils/socialLoginTransition.js');
const transitionAudit = read('scripts/audit-unlinked-social-accounts.mjs');
const transitionHelpers = await import('../src/utils/socialLoginTransition.js');

const entry = login.slice(
    login.indexOf('const renderEntryChoice ='),
    login.indexOf('// ── Render login card content'),
);
assert.match(entry, /카카오로 시작/);
assert.match(entry, /구글로 시작/);
assert.match(entry, /기존 성도이신가요\? 안내 보기/);
assert.doesNotMatch(entry, /교인 로그인|관리자 로그인|비밀번호로 로그인/);

const adminSignup = login.slice(
    login.indexOf('// ── Admin Signup Step 1'),
    login.indexOf('// ── Admin Signup Step 2'),
);
assert.match(adminSignup, /카카오로 공동체 등록 시작/);
assert.match(adminSignup, /구글 계정으로 시작/);
assert.match(adminSignup, /aria-label="카카오 계정으로 공동체 등록 시작"[\s\S]*rounded-2xl bg-\[#FEE500\] px-5 py-4 text-base[\s\S]*viewBox="0 0 24 24"/);
assert.match(adminSignup, /aria-label="구글 계정으로 공동체 등록 시작"[\s\S]*rounded-2xl bg-slate-100 px-5 py-4 text-base[\s\S]*viewBox="0 0 48 48"/);
assert.doesNotMatch(adminSignup, /이메일과 비밀번호로 등록|placeholder="비밀번호/);
assert.doesNotMatch(adminSignup, /setActiveTab\('admin'\)/);
assert.match(login, /if \(!isSocialSignup\)[\s\S]{0,160}카카오 또는 구글 계정을 먼저 확인/);
assert.match(login, /password: null/);
assert.match(login, /shouldShowSocialLoginTransition\('landing'\)/);
assert.match(login, /dismissSocialLoginTransition\('landing'\)/);
assert.match(login, /SocialLoginTransitionModal/);
assert.match(transitionModal, /SOCIAL_LOGIN_TRANSITION_DEADLINE_LABEL/);
assert.match(transitionModal, /카카오·구글 로그인만 이용합니다/);
assert.match(transitionModal, /기존 가입자는 새로 가입하지 마세요/);
assert.match(transitionModal, /기존 진도와 달란트를 그대로 연결하고, 소속 교회도 유지/);
assert.match(transitionModal, /‘처음 시작하기’로 새 계정을 만들면 이전 기록과 달란트가 나뉠 수/);
assert.match(transition, /2026-08-01T00:00:00\+09:00/);
assert.match(transition, /SOCIAL_LOGIN_TRANSITION_NOTICE_VERSION = '20260731_v1'/);
assert.match(dashboard, /hasSocialLoginProvider\(currentUser, auth\.currentUser\)/);
assert.match(dashboard, /shouldShowSocialLoginTransition\(currentUser\?\.uid\)/);
assert.match(dashboard, /accountLinkMode/);
assert.equal(
    transitionHelpers.isSocialLoginTransitionActive(Date.parse('2026-07-31T23:59:59+09:00')),
    true,
);
assert.equal(
    transitionHelpers.isSocialLoginTransitionActive(Date.parse('2026-08-01T00:00:00+09:00')),
    false,
);
assert.equal(transitionHelpers.hasSocialLoginProvider({ authProvider: 'google.com' }), true);
assert.equal(transitionHelpers.hasSocialLoginProvider({ authProviders: ['kakao.com'] }), true);
assert.equal(transitionHelpers.hasSocialLoginProvider({ authProvider: 'password' }), false);

assert.match(onboarding, /기존 진도·달란트 이어보기/);
assert.match(onboarding, /처음 시작하기/);
assert.match(onboarding, /accountKind === 'admin'/);
assert.match(onboarding, /legacyRecoveryOnly/);
assert.match(onboarding, /처음 화면에서 다시 시작/);

const churchAdmin = read('src/components/ChurchAdminView.jsx');
const churchAdminSettings = read('src/components/churchAdmin/SettingsTab.jsx');
const readingGuide = read('src/components/modals/ReadingGuideModal.jsx');
const migration = read('src/components/dashboard/PersonalAccountMigrationCard.jsx');
assert.match(churchAdmin, /기존 성도님:[\s\S]*새로 가입하거나 교회를 다시 찾지 마세요/);
assert.match(churchAdmin, /신규 성도만[\s\S]*처음 시작하기/);
assert.match(churchAdmin, /신규 성도의 교회 입장코드/);
assert.match(churchAdmin, /7월 31일까지[\s\S]*8월 1일부터는 카카오·구글 로그인만/);
assert.match(churchAdminSettings, /7월 31일까지[\s\S]*8월 1일부터는 카카오·구글 로그인만/);
assert.match(readingGuide, /휴대폰을 바꿨어요[\s\S]*카카오 또는 구글[\s\S]*기존 진도·달란트 이어보기/);
assert.doesNotMatch(readingGuide, /로그인이 안 돼요|비밀번호를 잊었어요/);
assert.match(migration, /카카오·구글[\s\S]*기존 진도·달란트 이어보기[\s\S]*소속 교회 없이 혼자 읽었어요/);

const recovery = auth.slice(
    auth.indexOf('const handleLegacySocialRecovery ='),
    auth.indexOf('const handleSocialOnboardingComplete ='),
);
assert.match(recovery, /get\(\{ source: 'server' \}\)/);
assert.match(recovery, /if \(pendingDoc\.exists\) throw new Error\('SOCIAL_RECOVERY_ALREADY_REGISTERED'\)/);
assert.ok(recovery.indexOf('pendingDoc.exists') < recovery.indexOf('await pendingSocialUser.delete()'));
assert.ok(recovery.indexOf('signInLegacyMemberForSocialRecovery') < recovery.indexOf('linkWithPopup'));
assert.match(recovery, /linkWithCredential\(pendingGoogleCredential\)/);
assert.match(recovery, /handleKakaoLinkStart\(\)/);
assert.match(auth, /auth\/account-exists-with-different-credential/);
assert.match(auth, /legacyRecoveryOnly: true/);
assert.match(transitionAudit, /transitionRoles = new Set\(\['member', 'churchAdmin', 'platformAdmin', 'superAdmin'\]\)/);
assert.match(transitionAudit, /transitionUnlinkedWithAuth/);
assert.match(transitionAudit, /transitionUnlinkedWithoutAuth/);

assert.match(app, /onLegacyLink=\{handleLegacySocialRecovery\}/);
assert.match(app, /const handleGuestSignupStart = \(\) => \{\s*setLoginInitialTab\('member'\)/);

console.log('social-only login validation passed');
