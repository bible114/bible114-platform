import assert from 'node:assert/strict';
import fs from 'node:fs';
import { getQuizProgressKey, getQuizRewardForAnswer } from '../src/utils/quizProgress.js';
import {
    getRosterOrgIds,
    getViewedTalent,
    updateRosterTalents,
    usesRosterTalentWallet,
} from '../src/utils/talentWallet.js';
import { getVisibleBibleVersions, isPlanIdAllowedForUser } from '../src/data/bible_options.js';

const read = path => fs.readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

assert.equal(getQuizProgressKey(1, 1), 'r1_d1');
assert.equal(getQuizProgressKey(1, 2), 'r1_d2');
assert.notEqual(getQuizProgressKey(1, 1), getQuizProgressKey(1, 2));
assert.equal(getQuizRewardForAnswer({ attempts: 1, isCorrect: true, rewardDate: null, todayKey: 'today' }), 10);
assert.equal(getQuizRewardForAnswer({ attempts: 2, isCorrect: true, rewardDate: null, todayKey: 'today' }), 5);
assert.equal(getQuizRewardForAnswer({ attempts: 1, isCorrect: true, rewardDate: 'today', todayKey: 'today' }), 0);
assert.equal(getQuizRewardForAnswer({ attempts: 1, isCorrect: true, rewardDate: 'yesterday', todayKey: 'today' }), 10);
assert.equal(getQuizRewardForAnswer({ attempts: 1, isCorrect: true, rewardDate: null, todayKey: 'today', legacyRewardedToday: true }), 0);

const personalWalletFixture = {
    uid: 'personal-1', accountType: 'personal', churchId: 'org-b', primaryOrgId: 'org-b', talent: 99,
    extraOrgs: [{ orgId: 'org-a', talent: 7 }, { orgId: 'org-b', talent: 21 }],
};
assert.equal(usesRosterTalentWallet(personalWalletFixture), true);
assert.equal(getViewedTalent(personalWalletFixture), 21);
assert.deepEqual(getRosterOrgIds(personalWalletFixture), ['org-a', 'org-b']);
assert.deepEqual(
    updateRosterTalents(personalWalletFixture, { 'org-a': 17, 'org-b': 31 }).extraOrgs.map(org => org.talent),
    [17, 31]
);
assert.equal(getViewedTalent({ ...personalWalletFixture, accountType: 'church', talent: 99 }), 99);

assert.deepEqual(getVisibleBibleVersions('1year', null).map(version => version.id), ['sequential', 'revised', 'new']);
assert.deepEqual(getVisibleBibleVersions('nt', null).map(version => version.id), ['new']);
assert.equal(isPlanIdAllowedForUser('1year_saehangul', null), false);
assert.equal(isPlanIdAllowedForUser('nt_message', null), false);
assert.equal(isPlanIdAllowedForUser('1year_revised', null), true);

const login = read('src/components/LoginView.jsx');
const reader = read('src/components/dashboard/BibleReader.jsx');
const dashboard = read('src/components/DashboardView.jsx');
const quiz = read('src/components/dashboard/BibleQuizCard.jsx');
const header = read('src/components/dashboard/DashboardHeader.jsx');
const achievements = read('src/components/modals/AchievementsModal.jsx');
const actions = read('src/hooks/useUserBibleActions.js');
const settings = read('src/components/churchAdmin/SettingsTab.jsx');
const shop = read('src/components/dashboard/TalentShop.jsx');
const churchAdmin = read('src/components/ChurchAdminView.jsx');
const platformAdmin = read('src/components/PlatformAdminView.jsx');
const helpers = read('src/utils/helpers.js');
const app = read('src/App.jsx');
const socialBanner = read('src/components/dashboard/SocialLinkBanner.jsx');
const authFlow = read('src/hooks/useAuth.js');
const socialOnboarding = read('src/components/SocialOnboardingView.jsx');
const rules = read('firestore.rules');
const constants = read('src/data/constants.js');
const viteConfig = read('vite.config.js');
const manifest = read('public/manifest.webmanifest');
const firebaseConfig = read('firebase.json');
const userAuth = read('src/hooks/useUserAuth.js');
const helperSource = read('src/utils/helpers.js');

for (const text of ['5초만에 빠른 시작', '카카오로 시작', '기존 회원 로그인(이름으로)', '공동체 등록하기']) assert.match(login, new RegExp(text.replace(/[()]/g, '\\$&')));
for (const text of ['공동체 등록이란?', '성도이신가요?', '무료 · 약 5분 소요']) assert.match(login, new RegExp(text.replace(/[()?]/g, '\\$&')));
assert.match(read('src/App.jsx'), /공동체 등록 완료![\s\S]*성도용 가입 안내문 인쇄\(QR\)/);
assert.doesNotMatch(settings, /우리 교회 로그인 링크|\?church=/);
assert.match(dashboard, /quizContent=\{\(/);
assert.match(reader, /quizContent[\s\S]*tut-read-btn/);
assert.match(reader, /오늘 읽기 완료! 🎉/);
assert.doesNotMatch(header, /tut-score|\{score \|\| 0\}pt/);
assert.match(achievements, /총 읽은 날/);
assert.match(achievements, /최장 연속/);
assert.match(actions, /maxStreak/);
assert.match(quiz, /quizProgress\.\$\{progressKey\}/);
assert.match(quiz, /퀴즈 달란트는 하루 1번만 적립돼요/);
assert.match(actions, /rosterTalentByOrgId/);
assert.match(actions, /let refreshedExtraOrgs = \(await loadUserExtraOrgsStrict\(uid\)\)\.slice\(0, 3\)/);
assert.doesNotMatch(actions, /refreshedExtraOrgs = \[\]/);
assert.match(quiz, /import \{ loadUserExtraOrgsStrict \} from '\.\.\/\.\.\/utils\/roster'/);
assert.match(quiz, /selectedIndex === quiz\.answerIndex[\s\S]*loadUserExtraOrgsStrict\(currentUser\.uid\)/);
assert.match(quiz, /getRosterOrgIds\(\{[\s\S]*extraOrgs: rewardRosterOrgs \|\| \[\]/);
assert.match(shop, /talentWalletType === 'roster'/);
assert.match(churchAdmin, /collection\('roster'\)\.doc\(member\.uid\)/);
assert.match(platformAdmin, /collectionGroup\('roster'\)/);
assert.match(helpers, /talentWalletMigrated: true/);
assert.match(shop, /공동체별 내 달란트/);
assert.match(shop, /onOrganizationChange/);
assert.match(app, /talentOrganizations/);
assert.match(header, /title="공동체 관리">⚙️ <span>관리<\/span>/);
assert.match(socialBanner, /\['member', 'churchAdmin'\]\.includes/);
assert.doesNotMatch(settings, /GoogleLinkCard/);
assert.doesNotMatch(login, /교회 관리자/);
assert.match(authFlow, /\['member', 'churchAdmin'\]\.includes\(data\.role\)/);
assert.match(socialOnboarding, /getVisibleBibleVersions\(planType, \{ \.\.\.tempUser, name \}\)/);
assert.doesNotMatch(socialOnboarding, /\(BIBLE_VERSIONS\[planType\] \|\| \[\]\)\.map/);
assert.match(authFlow, /isPlanIdAllowedForUser\(guest\.planId, null\)/);
assert.match(authFlow, /isPlanIdAllowedForUser\(planId, newUser\)/);
assert.match(rules, /hasAny\(\['role', 'churchId', 'accountType', 'isDeleted'\]\)/);
assert.match(rules, /existsAfter\([\s\S]*primaryOrgId[\s\S]*roster/);
assert.match(rules, /get\('talent', 0\) <= resource\.data\.get\('talent', 0\) \+ 17/);
assert.match(rules, /get\('score', 0\) <= resource\.data\.get\('score', 0\) \+ 15/);
assert.match(rules, /match \/churches\/\{churchId\} \{[\s\S]*allow read: if isRealUser\(\)/);
assert.match(rules, /match \/private\/\{privateId\} \{[\s\S]*isChurchAdminAfter\(churchId\)/);
assert.match(authFlow, /churchRef\.collection\('private'\)\.doc\('admin'\)/);
assert.match(constants, /KAKAO_CHANNEL_URL = "https:\/\/pf\.kakao\.com/);
assert.match(viteConfig, /transformIndexHtml[\s\S]*%BUILD_ID%/);
assert.match(manifest, /"start_url": "\/"/);
for (const header of ['X-Content-Type-Options', 'Referrer-Policy', 'Permissions-Policy', 'Content-Security-Policy-Report-Only']) {
    assert.match(firebaseConfig, new RegExp(header));
}
assert.match(helperSource, /migratePersonalTalentWalletIfNeeded = async \(uid, primaryOrgId, knownUserData = null\)/);
assert.match(helperSource, /knownUserData\.talentWalletMigrated === true/);
assert.match(authFlow, /migratePersonalTalentWalletIfNeeded\(user\.uid, user\.primaryOrgId, user\)/);
assert.match(userAuth, /user\.primaryOrgId,[\s\S]*user[\s\S]*\);/);
assert.doesNotMatch(authFlow, /await loadChurchCommunities\(user\.churchId\)/);
assert.match(authFlow, /const extraOrgsPromise = loadUserExtraOrgs\(firebaseUser\.uid\)/);
assert.match(authFlow, /\[로그인 속도\]/);
assert.match(app, /view === 'admin_entry'[\s\S]*📖 성경 읽기[\s\S]*⚙️ 공동체 관리/);
assert.match(app, /sessionStorage\.removeItem\(ADMIN_ENTRY_SESSION_KEY\)/);
assert.match(app, /\['dashboard', 'church_admin'\]\.includes\(savedAdminEntry\)/);
assert.match(app, /\['dashboard', 'church_admin'\]\.includes\(view\)[\s\S]*sessionStorage\.setItem\(ADMIN_ENTRY_SESSION_KEY, view\)/);

console.log('라운드 18 계약 검증 통과: 첫 화면, 소셜 연결, 읽기 흐름, 기록 허브, DAY별 퀴즈, 공동체별 달란트 지갑, 관리자 읽기 기본');
