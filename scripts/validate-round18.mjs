import assert from 'node:assert/strict';
import fs from 'node:fs';
import { getQuizProgressKey, getQuizRewardForAnswer } from '../src/utils/quizProgress.js';
import {
    getRosterOrgIds,
    getViewedTalent,
    updateRosterTalents,
    usesRosterTalentWallet,
} from '../src/utils/talentWallet.js';

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
assert.match(quiz, /getRosterOrgIds\(currentUser\)/);
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

console.log('라운드 18 계약 검증 통과: 첫 화면, 소셜 연결, 읽기 흐름, 기록 허브, DAY별 퀴즈, 공동체별 달란트 지갑, 관리자 읽기 기본');
