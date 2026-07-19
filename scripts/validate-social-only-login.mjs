import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = path => fs.readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const login = read('src/components/LoginView.jsx');
const onboarding = read('src/components/SocialOnboardingView.jsx');
const auth = read('src/hooks/useAuth.js');
const app = read('src/App.jsx');

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
assert.doesNotMatch(adminSignup, /이메일과 비밀번호로 등록|placeholder="비밀번호/);
assert.doesNotMatch(adminSignup, /setActiveTab\('admin'\)/);
assert.match(login, /if \(!isSocialSignup\)[\s\S]{0,160}카카오 또는 구글 계정을 먼저 확인/);
assert.match(login, /password: null/);
assert.match(login, /기존 성도님 필독/);
assert.match(login, /새로 가입하거나 교회를 다시 찾지 마세요/);
assert.match(login, /‘처음 시작하기’와 교회 찾기는 신규 성도만/);
assert.doesNotMatch(login, /setShowExistingMemberNotice\(true\)[\s\S]{0,300}localStorage|EXISTING_MEMBER_NOTICE_KEY/);

assert.match(onboarding, /기존 진도·달란트 이어보기/);
assert.match(onboarding, /처음 시작하기/);
assert.match(onboarding, /accountKind === 'admin'/);
assert.match(onboarding, /legacyRecoveryOnly/);
assert.match(onboarding, /처음 화면에서 다시 시작/);

const churchAdmin = read('src/components/ChurchAdminView.jsx');
const readingGuide = read('src/components/modals/ReadingGuideModal.jsx');
const migration = read('src/components/dashboard/PersonalAccountMigrationCard.jsx');
assert.match(churchAdmin, /기존 성도님:[\s\S]*새로 가입하거나 교회를 다시 찾지 마세요/);
assert.match(churchAdmin, /신규 성도만[\s\S]*처음 시작하기/);
assert.match(churchAdmin, /신규 성도의 교회 입장코드/);
assert.match(readingGuide, /새로 가입하거나 교회를 다시 찾지 말고/);
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

assert.match(app, /onLegacyLink=\{handleLegacySocialRecovery\}/);
assert.match(app, /const handleGuestSignupStart = \(\) => \{\s*setLoginInitialTab\('member'\)/);

console.log('social-only login validation passed');
