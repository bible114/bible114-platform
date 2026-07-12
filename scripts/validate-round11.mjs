import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = path => fs.readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const login = read('src/components/LoginView.jsx');
const auth = read('src/hooks/useAuth.js');
const onboarding = read('src/components/SocialOnboardingView.jsx');
const dashboard = read('src/components/DashboardView.jsx');
const membership = read('src/components/dashboard/CommunityMembershipCard.jsx');
const department = read('src/hooks/useDepartment.js');

for (const text of ['카카오로 시작하기', '구글로 시작하기', '기존 회원 로그인 (이름·생년월일로)', '로그인 없이 둘러보기']) assert.match(login, new RegExp(text.replace(/[()·]/g, '\\$&')));
assert.match(login, /교회 관리자 로그인/);
assert.match(login, /소셜 계정이 없어요/);
assert.match(auth, /OAuthProvider\('oidc\.kakao'\)/);
assert.match(auth, /signInWithRedirect/);
assert.match(auth, /getRedirectResult/);
assert.match(auth, /openSocialOnboarding\(cred\.user, 'google\.com'\)/);
assert.match(onboarding, /1단계 \/ 3단계/);
assert.match(onboarding, /2단계 \/ 3단계/);
assert.match(onboarding, /3단계 \/ 3단계/);
assert.match(onboarding, /UNAFFILIATED_CHURCH_ID/);
assert.match(auth, /transaction\.set\(rosterRef/);
assert.match(auth, /transaction\.set\(userRef/);
assert.match(dashboard, /내 단체 관리/);
assert.match(membership, /기준으로 보기/);
assert.match(membership, /혼자 읽기 모임으로 돌아가기/);
assert.match(department, /currentUser\.churchId === UNAFFILIATED_CHURCH_ID[\s\S]*Promise\.resolve\(\{ docs: \[\] \}\)/);
console.log('라운드 11 계약 검증 통과: 첫 화면, 소셜, 3단계 온보딩, 소속 관리, roster-only');
