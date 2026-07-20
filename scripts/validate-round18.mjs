import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
    getDailyVideoFillState,
    selectDailyVideoCandidate,
    titleMatchesDate,
} from '../src/utils/dailyVideoPolicy.js';
import {
    DAILY_VIDEO_CLIENT_TTL_MS,
    clearDailyVideoRetryNotBefore,
    getDailyVideoClientRefreshDelay,
    getDailyVideoDisplaySignature,
    getDailyVideoRetryDelay,
    getDailyVideoRetryNotBefore,
    getSafeCachedDailyVideo,
    isDailyVideoClientRefreshDue,
    recordDailyVideoRetryNotBefore,
    selectDailyVideoDisplay,
    shouldDiscardDailyVideoResolveResult,
    shouldReopenDailyVideoAfterSnapshot,
    shouldResolveDailyVideo,
} from '../src/utils/dailyVideoClient.js';
import {
    getDefaultQuizLevel,
    getQuizLevel,
    getQuizProgressKey,
    getQuizRewardForAnswer,
} from '../src/utils/quizProgress.js';
import {
    getRosterOrgIds,
    getViewedTalent,
    updateRosterTalents,
    usesRosterTalentWallet,
} from '../src/utils/talentWallet.js';
import { getVisibleBibleVersions, isPlanIdAllowedForUser } from '../src/data/bible_options.js';

const read = path => fs.readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const exists = path => fs.existsSync(new URL(`../${path}`, import.meta.url));

assert.equal(getQuizProgressKey(1, 1), 'r1_d1');
assert.equal(getQuizProgressKey(1, 2), 'r1_d2');
assert.notEqual(getQuizProgressKey(1, 1), getQuizProgressKey(1, 2));
assert.equal(getQuizRewardForAnswer({ attempts: 1, isCorrect: true, rewardDate: null, todayKey: 'today' }), 10);
assert.equal(getQuizRewardForAnswer({ attempts: 2, isCorrect: true, rewardDate: null, todayKey: 'today' }), 5);
assert.equal(getQuizRewardForAnswer({ attempts: 1, isCorrect: true, rewardDate: 'today', todayKey: 'today' }), 0);
assert.equal(getQuizRewardForAnswer({ attempts: 1, isCorrect: true, rewardDate: 'yesterday', todayKey: 'today' }), 10);
assert.equal(getQuizRewardForAnswer({ attempts: 1, isCorrect: true, rewardDate: null, todayKey: 'today', legacyRewardedToday: true }), 0);
assert.equal(getDefaultQuizLevel({ planId: 'nt_new', videoMode: 'kids' }), 'easy');
assert.equal(getDefaultQuizLevel({ planId: 'nt_new', departmentId: 'elementary' }), 'easy');
assert.equal(getDefaultQuizLevel({ planId: 'nt_new' }), 'standard');
assert.equal(getQuizLevel({ planId: 'nt_new', departmentId: 'elementary', quizLevel: 'standard' }), 'standard');

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

assert.deepEqual(getVisibleBibleVersions('1year').map(version => version.id), ['sequential', 'revised', 'new']);
assert.deepEqual(getVisibleBibleVersions('nt').map(version => version.id), ['new']);
// 쉬운성경·새한글·메시지 버전은 2026-07-18 코드에서 제거 — 레거시 planId는 계속 비허용
assert.equal(isPlanIdAllowedForUser('1year_saehangul'), false);
assert.equal(isPlanIdAllowedForUser('nt_easy'), false);
assert.equal(isPlanIdAllowedForUser('nt_message'), false);
assert.equal(isPlanIdAllowedForUser('1year_revised'), true);

const login = read('src/components/LoginView.jsx');
const reader = read('src/components/dashboard/BibleReader.jsx');
const dashboard = read('src/components/DashboardView.jsx');
const churchAdminReaderGuide = read('src/components/dashboard/ChurchAdminReaderGuide.jsx');
const quiz = read('src/components/dashboard/BibleQuizCard.jsx');
const quizSubmission = read('supabase/functions/platform-api/quizSubmission.ts');
const header = read('src/components/dashboard/DashboardHeader.jsx');
const achievements = read('src/components/modals/AchievementsModal.jsx');
const calendarModal = read('src/components/modals/CalendarModal.jsx');
const actions = read('src/hooks/useUserBibleActions.js');
const userStateSync = read('src/utils/userStateSync.js');
const rosterSource = read('src/utils/roster.js');
const settings = read('src/components/churchAdmin/SettingsTab.jsx');
const shop = read('src/components/dashboard/TalentShop.jsx');
const churchAdmin = read('src/components/ChurchAdminView.jsx');
const platformApiServer = read('supabase/functions/platform-api/index.ts');
const churchAdminSignupService = read('supabase/functions/platform-api/completeChurchAdminSignupService.ts');
const adminPurchaseCore = read('supabase/functions/platform-api/adminPurchaseCore.ts');
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
const dailyVideoChaptersSource = read('src/utils/dailyVideoChapters.js');
const dailyVideo = read('src/components/dashboard/DailyVideoCard.jsx');
const departmentHook = read('src/hooks/useDepartment.js');
const bibleLogic = read('src/hooks/useBibleLogic.js');
const rankingModal = read('src/components/modals/RankingModal.jsx');
const membershipCard = read('src/components/dashboard/CommunityMembershipCard.jsx');
const scheduleAliases = read('src/data/schedules.js');
assert.match(scheduleAliases, /import sequentialSchedule from '\.\/sequential_schedule\.json'/);
assert.match(scheduleAliases, /'1year_sequential': sequentialSchedule/);
const quizEngine = read('src/utils/quizEngine.js');
const guestStorage = read('src/utils/guestStorage.js');
const guestReader = read('src/components/GuestReaderView.jsx');

for (const text of ['카카오로 시작', '구글로 시작', '기존 성도이신가요? 안내 보기', '공동체 등록하기']) assert.match(login, new RegExp(text.replace(/[()?]/g, '\\$&')));
for (const text of ['공동체 등록이란?', '성도이신가요?', '무료 · 약 5분 소요']) assert.match(login, new RegExp(text.replace(/[()?]/g, '\\$&')));
assert.match(read('src/App.jsx'), /공동체 등록 완료![\s\S]*성도용 로그인·가입 안내문 인쇄\(QR\)/);
assert.doesNotMatch(settings, /우리 교회 로그인 링크|\?church=/);
assert.match(dashboard, /quizContent=\{\(/);
assert.match(reader, /quizContent[\s\S]*tut-read-btn/);
assert.match(reader, /DAY \{completionForViewingDay\.completedDay\}[\s\S]*읽기 완료! 🎉/);
assert.match(reader, /const isAdvanceRead = hasReadToday && isCurrentProgressDay;/);
assert.doesNotMatch(reader, /isQuizGateLocked|quizGateOpen|onQuizGateLocked/);
assert.doesNotMatch(reader, /선택 활동 · 퀴즈를 풀지 않아도/);
assert.doesNotMatch(quiz, /선택 퀴즈예요|풀지 않아도 읽기 완료/);
assert.match(reader, /disabled=\{readSubmitting \|\| !isCurrentProgressDay\}/);
assert.match(reader, /isAdvanceRead[\s\S]*\? '한 장 더 읽기'/);
assert.match(departmentHook, /loadAllMembers = useCallback\(async \(orgIdOverride\)/);
assert.match(departmentHook, /const orgId = orgIdOverride \|\| currentUser\?\.churchId/);
assert.match(departmentHook, /where\('churchId', '==', orgId\)[\s\S]*where\('password', '==', null\)/);
assert.match(departmentHook, /announcementRequestRef[\s\S]*setAnnouncement\(null\)/);
assert.match(departmentHook, /kakaoRequestRef[\s\S]*setKakaoLink\(null\)/);
assert.match(bibleLogic, /communityRequestRef[\s\S]*setAllMembersForRace\(\[\]\)[\s\S]*isCurrentRequest\(\)/);
assert.doesNotMatch(app, /loadOrgRankingData|handleTalentOrgChange|viewingRosterOrgId/);
assert.doesNotMatch(dashboard, /viewedRankingOrg|orgRankingData|openOrgRanking|onViewOrgRanking/);
assert.match(dashboard, /selectActiveOrganization[\s\S]*handleStop\?\.\(\)[\s\S]*onActiveOrgChange\?\.\(orgId\)/);
assert.match(dashboard, /activeOrgId=\{currentUser\.churchId\}[\s\S]*onSelectOrg=\{selectActiveOrganization\}/);
assert.doesNotMatch(rankingModal, /orgTabs|viewedOrgName|orgLoading|orgError|onSelectOrg/);
assert.match(rankingModal, /progressRanking\.length === 0 && flatMembers\.length > 0[\s\S]*renderFlatRanking/);
assert.match(membershipCard, /activeOrgId[\s\S]*onSelectOrg/);
assert.match(membershipCard, /aria-current=\{isActive \? 'page'[\s\S]*aria-pressed=\{isActive\}/);
assert.match(membershipCard, /현재 보고 있음/);
assert.doesNotMatch(membershipCard, /🏆 순위|onViewOrgRanking/);
assert.doesNotMatch(scheduleAliases, /nt_easy|nt_message|saehangul/);
assert.match(scheduleAliases, /'nt_new': schedules\.new_testament/);
assert.match(quizEngine, /import\.meta\.glob\('\.\.\/data\/quizNtEasy\/\*\.json'\)/);
assert.match(quizEngine, /loadNtEasyPoolForDay[\s\S]*`ntEasy-\$\{day\}-\$\{index \+ 1\}`/);
assert.match(quizEngine, /loadNtEasyQuestionByKey[\s\S]*\^ntEasy-/);
assert.match(quizEngine, /selectNtEasyQuiz[\s\S]*createSeededRandom/);
assert.match(quiz, /planType === 'nt' && getQuizLevel\(currentUser\) === 'easy'/);
assert.match(quiz, /easySeed = \(readCount - 1\) \* 365 \+ range\.actualDay/);
assert.match(quizEngine, /nextIndex === selectedIndex[\s\S]*nextIndex \+ 1/);
assert.match(quiz, /오늘 본문에서 쉬운 문제로 나왔어요/);
assert.match(helperSource, /quizLevel: \['standard', 'easy'\]\.includes\(d\.quizLevel\)/);
assert.match(guestStorage, /quizLevel: \['standard', 'easy'\]\.includes\(raw\?\.quizLevel\)/);
assert.match(userAuth, /quizLevel: guest\.quizLevel \|\| null/);
assert.match(quiz, /QuizLevelToggle[\s\S]*planType !== 'nt'/);
assert.match(quiz, /currentUser\?\.role === 'guest'[\s\S]*saveGuestState\(\{ quizLevel: nextLevel \}\)/);
assert.match(quiz, /collection\('users'\)\.doc\(currentUser\.uid\)\.set\(\{[\s\S]*quizLevel: nextLevel/);
assert.match(quiz, /변경한 난이도는 내일부터 적용돼요/);
assert.match(guestReader, /currentPlanId\.startsWith\('nt_'\)[\s\S]*QuizLevelToggle/);
assert.doesNotMatch(header, /tut-score|\{score \|\| 0\}pt/);
assert.match(achievements, /총 읽은 날/);
assert.match(achievements, /최장 연속/);
assert.match(achievements, /z-\[170\]/, '업적 창은 상단 메뉴보다 위에 표시되어야 한다.');
assert.match(achievements, /h-\[100dvh\][\s\S]*overflow-y-auto/, '모바일 업적 창은 전체 화면 안에서 본문만 스크롤되어야 한다.');
assert.match(achievements, /min-h-0 flex-1 overflow-y-auto/, '업적 목록만 스크롤되고 하단 닫기 버튼은 고정되어야 한다.');
assert.match(achievements, /role="dialog"[\s\S]*aria-modal="true"/, '업적 창은 접근 가능한 모달이어야 한다.');
assert.match(achievements, /document\.body\.style\.overflow = 'hidden'/, '업적 창이 열리면 배경 스크롤을 막아야 한다.');
assert.match(calendarModal, /while \(days\.length < 42\) days\.push\(null\)/, '달을 넘겨도 캘린더 높이가 바뀌지 않아야 한다.');
assert.match(calendarModal, /if \(!day\) return <div key=\{idx\} className="aspect-square"/, '빈 날짜 칸도 같은 높이를 유지해야 한다.');
assert.match(calendarModal, /z-\[160\]/, '읽기 캘린더는 상단 메뉴보다 위에 표시되어야 한다.');
assert.doesNotMatch(actions, /\{ \.\.\.previous, \.\.\.response\.state\.user \}/);
assert.match(actions, /loadCanonicalUserStateFromServer\(uid\)/);
assert.match(userStateSync, /loadCanonicalRosterRefsFromServer/);
assert.match(userStateSync, /dbInstance\.runTransaction\(async transaction =>[\s\S]*transaction\.get\(userRef\)/);
assert.match(rosterSource, /\.get\(\{ source:\s*['"]server['"] \}\)/);
assert.match(quizSubmission, /quizProgress\.\$\{input\.progressKey\}/);
assert.match(quiz, /퀴즈 달란트는 하루 1번만 적립돼요/);
assert.doesNotMatch(quiz, /if \(solved\) \{\s*return \(/);
assert.match(quiz, /showAnswer[\s\S]*feedback\.message[\s\S]*정답: \{quiz\.choices\[quiz\.answerIndex\]\}/);
assert.match(quiz, /다시 선택해 보세요/);
assert.doesNotMatch(quiz, /이어서 본문 읽기/);
assert.match(actions, /rosterTalentByOrgId/);
assert.match(actions, /\(freshUser\.extraOrgs \|\| \[\]\)\.map\(org => \[org\.orgId, Number\(org\.talent\) \|\| 0\]\)/);
assert.doesNotMatch(actions, /refreshedExtraOrgs = \[\]/);
assert.match(quiz, /const response = await submitQuiz\(/);
assert.match(quiz, /loadCanonicalUserStateFromServer\(submittedUid\)/);
assert.match(quiz, /setCurrentUser\(freshUser\)/);
assert.match(quiz, /freshUser\.quizProgress\?\.\[submittedProgressKey\]/);
assert.match(shop, /purchaseItemViaApi\(\{[\s\S]*churchId:[\s\S]*itemId:[\s\S]*departmentId:[\s\S]*marketId:/);
assert.match(shop, /result\.walletKind === 'roster'/);
assert.match(churchAdmin, /collection\('roster'\)\.doc\(member\.uid\)/);
assert.match(platformAdmin, /collectionGroup\('roster'\)/);
assert.match(helpers, /await migratePersonalTalentWalletViaApi\(\{ expectedUid: requestUid \}\)/);
assert.match(shop, /공동체별 내 달란트/);
assert.match(shop, /onOrganizationChange/);
assert.match(app, /talentOrganizations/);
assert.match(app, /org\.orgId === \(activeRosterOrgId \|\| currentUser\.primaryOrgId\)/);
assert.match(app, /baseChurchId: currentUser\.churchId[\s\S]*baseChurchName: currentUser\.churchName/);
assert.match(app, /handlePrimaryOrgChange[\s\S]*activeOrgBeforeChange[\s\S]*setActiveRosterOrgId\(activeOrgBeforeChange === orgId \? null : activeOrgBeforeChange\)/);
assert.match(app, /handleActiveOrgChange[\s\S]*currentUser\.accountType === 'personal'[\s\S]*setActiveRosterOrgId\(orgId === currentUser\.primaryOrgId \? null : orgId\)/);
assert.doesNotMatch(app, /handleActiveOrgChange[\s\S]{0,300}handlePrimaryOrgChange\(orgId\)/);
assert.match(shop, /★ 기준 공동체는 바뀌지 않아요/);
assert.match(header, /isChurchAdmin[\s\S]*⚙️ 공동체 관리/);
assert.match(socialBanner, /\['member', 'churchAdmin'\]\.includes/);
assert.doesNotMatch(settings, /GoogleLinkCard/);
assert.doesNotMatch(login, /setActiveTab\('admin'\)/);
assert.match(authFlow, /\['member', 'churchAdmin'\]\.includes\(data\.role\)/);
assert.match(socialOnboarding, /getVisibleBibleVersions\(planType, \{ \.\.\.tempUser, name \}\)/);
assert.doesNotMatch(socialOnboarding, /\(BIBLE_VERSIONS\[planType\] \|\| \[\]\)\.map/);
assert.match(authFlow, /isPlanIdAllowedForUser\(guest\.planId, null\)/);
assert.match(authFlow, /isPlanIdAllowedForUser\(planId, newUser\)/);
assert.match(rules, /hasAny\(\['role', 'churchId', 'accountType', 'isDeleted', 'extraMemberships',[\s\S]*'talentWalletMigrated', 'departmentId', 'departmentName',[\s\S]*'subgroupId', 'subgroupName'\]\)/);
assert.match(rules, /existsAfter\([\s\S]*primaryOrgId[\s\S]*roster/);
assert.match(rules, /function isPersonalPrimaryRoster\(churchId, memberUid\)[\s\S]*get\('accountType', null\) == 'personal'[\s\S]*get\('primaryOrgId', null\) == churchId/);
assert.match(rules, /function isPersonalPrimaryRoster\(churchId, memberUid\)[\s\S]*let before = get\([\s\S]*let after = getAfter\([\s\S]*before\.get\('primaryOrgId', null\) == churchId[\s\S]*after\.get\('primaryOrgId', null\) == churchId/);
assert.match(rules, /allow delete: if !isPersonalPrimaryRoster\(churchId, memberUid\)[\s\S]*request\.auth\.uid == memberUid[\s\S]*isChurchAdmin\(churchId\)[\s\S]*isPlatformAdmin\(\)/);
assert.match(rules, /allow delete: if !isPersonalPrimaryRoster\(churchId, memberUid\)[\s\S]*resource\.data\.get\('talent', 0\) == 0[\s\S]*request\.auth\.uid == memberUid/);
assert.match(membershipCard, /transaction\.get\(rosterRef\)[\s\S]*latestTalent > 0[\s\S]*남아 있어 탈퇴할 수 없어요/);
assert.match(churchAdmin, /executeExpelRosterMember[\s\S]*transaction\.get\(rosterRef\)[\s\S]*latestTalent > 0[\s\S]*남아 있어 제명할 수 없습니다/);
assert.match(churchAdmin, /executeExpelRosterMember[\s\S]*error\?\.code === 'permission-denied'[\s\S]*기본 공동체이거나 달란트 잔액이 남은 명부에서는 제명할 수 없습니다/);
assert.match(rules, /function isSafeSelfScoreTalentUpdate\(before, after\)[\s\S]*!wasMigrated && !isMigrated[\s\S]*afterScore == beforeScore && afterTalent == beforeTalent/,
    '미이관 상태에서는 일반 users 쓰기로 score/talent를 먼저 부풀릴 수 없어야 한다.');
assert.match(rules, /!wasMigrated && isMigrated[\s\S]*afterTalent == beforeScore && afterScore >= beforeScore/,
    '최초 legacy 이관의 spendable talent는 이관 전 score와 정확히 같아야 한다.');
assert.match(rules, /wasMigrated && isMigrated[\s\S]*before\.get\('accountType', null\) == 'personal'[\s\S]*afterTalent == beforeTalent[\s\S]*afterScore == beforeScore/,
    '이관 완료 personal users는 본인 브라우저에서 score/talent를 더 이상 바꾸지 못해야 한다.');
assert.match(rules, /before\.get\('accountType', null\) != 'personal'[\s\S]*afterTalent <= beforeTalent \+ 17[\s\S]*afterScore <= beforeScore \+ 15/,
    '일반 공동체 계정의 이관 완료 브라우저 보상 호환 상한은 유지해야 한다.');
const rosterRules = rules.match(/match \/roster\/\{memberUid\} \{([\s\S]*?)\n        allow delete/)?.[1] || '';
assert.match(rosterRules, /getAfter\([\s\S]*users\/\$\(request\.auth\.uid\)[\s\S]*get\('accountType', null\) == 'personal'[\s\S]*get\('score', 0\) == resource\.data\.get\('score', 0\)[\s\S]*get\('talent', 0\) == resource\.data\.get\('talent', 0\)/,
    'personal의 모든 roster 지갑은 브라우저 self-update에서도 동결해야 한다.');
const usersRules = rules.match(/match \/users\/\{uid\} \{([\s\S]*?)\n      match \/private\/consent/)?.[1] || '';
const primaryUserUpdateRule = usersRules.slice(
    usersRules.indexOf('allow update: if'),
    usersRules.indexOf('// users.talent'),
);
assert.match(usersRules, /resource\.data\.role == 'member'[\s\S]*request\.resource\.data\.role == 'member'[\s\S]*isChurchAdmin\(resource\.data\.churchId\)[\s\S]*affectedKeys\(\)\.hasOnly\(\[[\s\S]*'isDeleted'[\s\S]*'extraMemberships'[\s\S]*'updatedAt'/,
    '교회 관리자의 same-church users 수정은 일반 교인 삭제·복원·소속 필드만 허용해야 한다.');
assert.match(usersRules, /deletedAt == request\.time[\s\S]*deletedBy == request\.auth\.uid/,
    '교회 관리자 삭제 감사값은 현재 요청에 결속해야 한다.');
assert.doesNotMatch(primaryUserUpdateRule, /\(isSignedIn\(\) && isChurchAdmin\(resource\.data\.churchId\)\) \|\|/,
    '교회 관리자에게 same-church users 전체 update 권한을 주면 역할 상승이 가능하다.');
assert.doesNotMatch(rules, /isExactPersonalTalentTransfer|isZeroPersonalTalentFinalization/,
    '개인 지갑 이전용 브라우저 규칙 예외가 남으면 안 된다.');
assert.doesNotMatch(usersRules, /users\.talent → primary roster|resource\.data\.primaryOrgId, uid/,
    'users 개인 지갑 감소는 서버 action 외 규칙 분기로 열면 안 된다.');
assert.doesNotMatch(rules, /request\.resource\.data\.get\('talent', 0\) <= resource\.data\.get\('talent', 0\) \+ 17 \|\|/,
    'roster 본인 보상 상한에 개인 지갑 이관 우회 조건이 남으면 안 된다.');
assert.match(rules, /get\('score', 0\) <= resource\.data\.get\('score', 0\) \+ 15/);
assert.match(rules, /match \/churches\/\{churchId\} \{[\s\S]*allow read: if isRealUser\(\)/);
assert.match(rules, /match \/churches\/\{churchId\} \{[\s\S]*allow create: if false;/,
    '공동체 생성은 completeChurchAdminSignup 서버만 수행해야 한다.');
assert.match(rules, /match \/private\/\{privateId\} \{[\s\S]*allow write: if false;/,
    '공동체 private 관리자·입장코드는 서버 action만 써야 한다.');
assert.match(adminPurchaseCore, /text\(purchase\.status\) !== "pending"[\s\S]*PURCHASE_ALREADY_PROCESSED/);
assert.match(platformApiServer, /parsed\.action === "adminRefundPurchase"[\s\S]*getDocument<AdminPurchaseRecord>[\s\S]*updateWrite\(service\.projectId, walletPath[\s\S]*updateWrite\(service\.projectId, purchasePath[\s\S]*\{ transaction \}/);
assert.doesNotMatch(churchAdmin, /FieldValue\.increment\(refundAmount\)|transaction\.update\(purchaseRef/);
assert.doesNotMatch(churchAdmin, /batch\.update\(walletRef[\s\S]*FieldValue\.increment\(purchase\.price/);
assert.match(rules, /resource\.data\.status == 'pending'[\s\S]*request\.resource\.data\.status in \['delivered', 'cancelled'\]/);
assert.match(churchAdminSignupService, /const adminPath = `\$\{churchPath\}\/private\/admin`[\s\S]*updateWrite\(service\.projectId, adminPath,[\s\S]*adminUid: signup\.uid/,
    '공동체 관리자 소유 증명은 서버 가입 transaction이 만들어야 한다.');
assert.match(constants, /KAKAO_CHANNEL_URL = "https:\/\/pf\.kakao\.com/);
assert.match(viteConfig, /transformIndexHtml[\s\S]*%BUILD_ID%/);
assert.match(manifest, /"start_url": "\/"/);
for (const header of ['X-Content-Type-Options', 'Referrer-Policy', 'Permissions-Policy', 'Content-Security-Policy-Report-Only']) {
    assert.match(firebaseConfig, new RegExp(header));
}
assert.match(helperSource, /migratePersonalTalentWalletIfNeeded = async \(uid, primaryOrgId, knownUserData = null\)/);
assert.match(helperSource, /await migratePersonalTalentWalletViaApi\(\{ expectedUid: requestUid \}\)/);
const personalWalletMigrationStart = helperSource.indexOf('export const migratePersonalTalentWalletIfNeeded');
const personalWalletMigrationEnd = helperSource.indexOf('\n};', personalWalletMigrationStart) + 3;
const personalWalletMigration = helperSource.slice(personalWalletMigrationStart, personalWalletMigrationEnd);
assert.ok(personalWalletMigration.indexOf('auth?.currentUser?.uid !== requestUid')
    < personalWalletMigration.indexOf("knownUserData && knownUserData.accountType !== 'personal'"));
assert.match(personalWalletMigration, /migrationResponse\.result\.status === 'primaryMissing'[\s\S]*userRef\.get\(\{ source: 'server' \}\)/);
assert.match(personalWalletMigration, /user\.role !== 'member'[\s\S]*user\.accountType !== 'personal'[\s\S]*!validDeletedState[\s\S]*!validMigrationFlag[\s\S]*!isCanonicalOrgId\(user\.primaryOrgId\)[\s\S]*!Number\.isSafeInteger\(user\.talent\)/);
assert.doesNotMatch(personalWalletMigration, /migrationResponse\.result\.(?:orgId|primaryOrgId|talent|balance)/);
assert.match(personalWalletMigration, /const userSnap = await transaction\.get\(userRef\)[\s\S]*const orgId = user\.primaryOrgId[\s\S]*const rosterSnap = await transaction\.get\(rosterRef\)/);
assert.match(personalWalletMigration, /user\.talentWalletMigrated !== true[\s\S]*user\.talent !== 0/);
assert.match(personalWalletMigration, /roster\.uid !== requestUid[\s\S]*Number\.isSafeInteger\(roster\.talent\)/);
assert.match(personalWalletMigration, /if \(!hasKnownPrimaryOrg\) return null/);
assert.doesNotMatch(personalWalletMigration, /talentWalletMigrated === true[\s\S]{0,200}return null/);
assert.doesNotMatch(personalWalletMigration, /transaction\.(?:set|update|delete)\(/);
assert.match(authFlow, /migratePersonalTalentWalletIfNeeded\(user\.uid, user\.primaryOrgId, user\)/);
assert.match(authFlow, /talent: 0,[\s\S]*talentWalletMigrated: true/);
assert.match(userAuth, /user\.primaryOrgId,[\s\S]*user[\s\S]*\);/);
assert.doesNotMatch(authFlow, /await loadChurchCommunities\(user\.churchId\)/);
assert.match(authFlow, /const extraOrgsPromise = loadUserExtraOrgs\(firebaseUser\.uid\)/);
assert.match(authFlow, /\[로그인 속도\]/);
assert.match(app, /sessionStorage\.removeItem\(ADMIN_ENTRY_SESSION_KEY\)/);
assert.doesNotMatch(app, /view === 'admin_entry'/);
assert.match(app, /savedAdminEntry === 'church_admin' \? 'church_admin' : 'dashboard'/);
assert.match(app, /currentUser\.role === 'superAdmin' \|\| currentUser\.role === 'platformAdmin'[\s\S]*loadSuperAdminData\(\{ expectedUid: currentUser\.uid \}\)/);
assert.match(app, /const loadSuperAdminData = async \(\{ expectedUid = null \} = \{\}\) => \{\s*if \(expectedUid && auth\.currentUser\?\.uid !== expectedUid\) return false;[\s\S]*if \(expectedUid && auth\.currentUser\?\.uid !== expectedUid\) return false;[\s\S]*if \(expectedUid && auth\.currentUser\?\.uid !== expectedUid\) return false;[\s\S]*setAllUsers/);
assert.doesNotMatch(authFlow, /getChurchAdminEntryView|['"]admin_entry['"]/);
assert.match(authFlow, /const targetView = requiresOnboarding[\s\S]*\? 'plan_type_select'[\s\S]*: 'dashboard'/);
const existingPersonalStart = authFlow.indexOf('const openExistingPersonalUser = async');
const existingSocialStart = authFlow.indexOf('const openExistingSocialUser = async');
const existingSocialEnd = authFlow.indexOf('const openSocialOnboarding =', existingSocialStart);
const existingPersonalFlow = authFlow.slice(existingPersonalStart, existingSocialStart);
const existingSocialFlow = authFlow.slice(existingSocialStart, existingSocialEnd);
assert.match(existingPersonalFlow, /const openExistingPersonalUser = async \(firebaseUser, doc, loginTiming = null\) => \{\s*if \(auth\.currentUser\?\.uid !== firebaseUser\.uid\) throw new Error\('SOCIAL_AUTH_CHANGED'\);\s*const data = doc\.data\(\)/);
assert.match(existingSocialFlow, /const openExistingSocialUser = async \(firebaseUser, doc, loginTiming = null\) => \{\s*if \(auth\.currentUser\?\.uid !== firebaseUser\.uid\) throw new Error\('SOCIAL_AUTH_CHANGED'\);\s*const data = doc\.data\(\)/);
assert.match(existingPersonalFlow, /migratePersonalWallet\(user\)[\s\S]*auth\.currentUser\?\.uid !== firebaseUser\.uid[\s\S]*throw new Error\('SOCIAL_AUTH_CHANGED'\)[\s\S]*setCurrentUser\(user\)/);
assert.match(existingSocialFlow, /migratePersonalWallet\(user\)[\s\S]*auth\.currentUser\?\.uid !== firebaseUser\.uid[\s\S]*throw new Error\('SOCIAL_AUTH_CHANGED'\)[\s\S]*setCurrentUser\(user\)/);
assert.match(authFlow, /const canDeferPersonalWalletAudit = user => \{[\s\S]*user\.talentWalletMigrated !== true[\s\S]*user\.talent !== 0[\s\S]*primaryRoster\.talent <= 1_000_000_000/);
assert.match(authFlow, /const auditPersonalWalletAfterLogin = user => \{[\s\S]*const initialExtraOrgs = user\.extraOrgs;[\s\S]*auth\.currentUser\?\.uid !== user\.uid[\s\S]*current\.extraOrgs !== initialExtraOrgs[\s\S]*extraOrgs: auditedUser\.extraOrgs/);
assert.match(existingPersonalFlow, /user\.extraOrgs = await extraOrgsPromise;[\s\S]*const deferWalletAudit = canDeferPersonalWalletAudit\(user\);[\s\S]*if \(!deferWalletAudit\) user = await migratePersonalWallet\(user\);[\s\S]*setCurrentUser\(user\)[\s\S]*if \(deferWalletAudit\) auditPersonalWalletAfterLogin\(user\)/);

const googlePersonalStart = authFlow.slice(
    authFlow.indexOf('const handleGooglePersonalSignup = async'),
    authFlow.indexOf('const handleGoogleLink = async'),
);
assert.match(googlePersonalStart, /existingDoc = await userRef\.get\(\{ source: 'server' \}\)/);
assert.match(googlePersonalStart, /existingDoc = await userRef\.get\(\{ source: 'server' \}\);\s*if \(auth\.currentUser\?\.uid !== cred\.user\.uid\) throw new Error\('SOCIAL_AUTH_CHANGED'\);\s*if \(existingDoc\.exists\)/);
assert.match(googlePersonalStart, /let popupUid = null[\s\S]*popupUid = cred\?\.user\?\.uid \|\| null/);
assert.match(googlePersonalStart, /if \(GOOGLE_ADMIN_ROLES\.has\(existingDoc\.data\(\)\?\.role\)\) \{\s*await finishAdminLogin\(cred, \{ requireRegisteredAdmin: true, loginTiming \}\);\s*return;\s*\}\s*await openExistingSocialUser/);
assert.match(googlePersonalStart, /popupUid && auth\.currentUser\?\.uid === popupUid[\s\S]*setCurrentUser\(null\)[\s\S]*setTempUser\(null\)[\s\S]*await auth\.signOut/);
assert.ok(
    googlePersonalStart.indexOf('finishAdminLogin(cred') < googlePersonalStart.indexOf('openExistingSocialUser(cred.user'),
    '첫 화면 Google 로그인은 저장된 관리자 역할을 일반 사용자 처리보다 먼저 판정해야 한다.',
);

const finishAdminLoginStart = authFlow.indexOf('const finishAdminLogin = async');
const finishAdminLoginEnd = authFlow.indexOf('// ── 교회 관리자 / 슈퍼 관리자 로그인', finishAdminLoginStart);
const finishAdminLogin = authFlow.slice(finishAdminLoginStart, finishAdminLoginEnd);
assert.match(finishAdminLogin, /doc\(cred\.user\.uid\)\.get\(\{ source: 'server' \}\)/);
assert.match(finishAdminLogin, /user\.role === 'superAdmin' \|\| user\.role === 'platformAdmin'[\s\S]*await loadSuperAdminData\(\{ expectedUid: cred\.user\.uid \}\)[\s\S]*auth\.currentUser\?\.uid !== cred\.user\.uid[\s\S]*setCurrentUser\(user\)/);
assert.match(finishAdminLogin, /const targetView = requiresOnboarding\s*\? 'plan_type_select'\s*: 'dashboard';\s*if \(requiresOnboarding\) setTempUser\(user\);\s*setView\(targetView\)/);
assert.match(authFlow, /const handleChurchAdminLogin = async[\s\S]*await finishAdminLogin\(cred, \{ loginTiming \}\)/);
assert.match(authFlow, /const handleGoogleAdminLogin = async[\s\S]*await finishAdminLogin\(cred, \{ requireRegisteredAdmin: true, loginTiming \}\)/);

assert.match(dashboard, /CHURCH_ADMIN_READER_GUIDE_KEY_PREFIX = 'b114_church_admin_reader_guide_v1'/);
const adminReaderGuideEffectStart = dashboard.indexOf('useEffect(() => {\n        if (!isChurchAdmin || !currentUser?.uid)');
const adminReaderGuideEffectEnd = dashboard.indexOf('    }, [currentUser?.uid, isChurchAdmin]);', adminReaderGuideEffectStart);
const adminReaderGuideEffect = dashboard.slice(adminReaderGuideEffectStart, adminReaderGuideEffectEnd);
assert.ok(adminReaderGuideEffectStart >= 0 && adminReaderGuideEffectEnd > adminReaderGuideEffectStart, '관리자 읽기 안내 effect가 필요하다.');
assert.match(adminReaderGuideEffect, /if \(!isChurchAdmin \|\| !currentUser\?\.uid\)[\s\S]*const storageKey = `\$\{CHURCH_ADMIN_READER_GUIDE_KEY_PREFIX\}:\$\{currentUser\.uid\}`[\s\S]*setShowChurchAdminReaderGuide\(localStorage\.getItem\(storageKey\) !== 'seen'\)/);
const dismissAdminGuideStart = dashboard.indexOf('const dismissChurchAdminReaderGuide = () =>');
const openAdminGuideEnd = dashboard.indexOf('const handleQuizTerminal =', dismissAdminGuideStart);
const adminGuideHandlers = dashboard.slice(dismissAdminGuideStart, openAdminGuideEnd);
assert.match(adminGuideHandlers, /localStorage\.setItem\(`\$\{CHURCH_ADMIN_READER_GUIDE_KEY_PREFIX\}:\$\{uid\}`, 'seen'\)[\s\S]*setShowChurchAdminReaderGuide\(false\)[\s\S]*const openAdminFromReaderGuide[\s\S]*dismissChurchAdminReaderGuide\(\);\s*setView\('church_admin'\)/);
assert.match(dashboard, /<ChurchAdminReaderGuide\s*show=\{showChurchAdminReaderGuide\}\s*onClose=\{dismissChurchAdminReaderGuide\}\s*onOpenAdmin=\{openAdminFromReaderGuide\}/);
assert.match(churchAdminReaderGuide, /관리자도 성경 읽기부터 시작해요[\s\S]*⚙️ 관리[\s\S]*지금 관리 화면 열기/);
assert.match(churchAdminReaderGuide, /onClick=\{onClose\}[\s\S]*onClick=\{onOpenAdmin\}/);
assert.match(app, /setCurrentUser\(null\); setTempUser\(null\); setChurchCommunities\(\[\]\);\s*setAllUsers\(\[\]\); setAllChurches\(\[\]\)/);
const dailyVideoCandidates = [
    { snippet: { title: '7월 14일 매일성경' }, contentDetails: { videoPublishedAt: '2026-07-14T03:00:00Z', videoId: 'todayVideo1' } },
    { snippet: { title: '7월 13일 매일성경' }, contentDetails: { videoPublishedAt: '2026-07-13T03:00:00Z', videoId: 'pastVideo01' } },
];
assert.equal(titleMatchesDate('7월 15일 매일성경', '2026-07-15'), true);
assert.equal(titleMatchesDate('07.15 신앙생활 1분만', '2026-07-15'), true);
assert.equal(titleMatchesDate('[7/15] 어린이 매일성경', '2026-07-15'), true);
assert.equal(titleMatchesDate('20260715 매일성경', '2026-07-15'), true);
assert.equal(titleMatchesDate('0715 매일성경', '2026-07-15'), true);
assert.equal(titleMatchesDate('요한복음 7.15 말씀', '2026-07-15'), false);
assert.equal(titleMatchesDate('창세기 7/15 본문', '2026-07-15'), false);
assert.equal(titleMatchesDate('로마서 0715 해설', '2026-07-15'), false);
assert.equal(titleMatchesDate('7월 14일 매일성경', '2026-07-15'), false);
assert.equal(titleMatchesDate('2월 29일 매일성경', '2026-02-29'), false);
assert.deepEqual(
    getDailyVideoFillState(['adult', 'kids'], { adult: { url: 'adult' }, kids: null }),
    { hasAny: true, allReady: false, missingModes: ['kids'] }
);
assert.deepEqual(
    getDailyVideoFillState(['adult'], { adult: { url: 'adult' }, kids: null }),
    { hasAny: true, allReady: true, missingModes: [] }
);
const matchesDate = (title, dateKey) => title.includes(dateKey === '2026-07-14' ? '7월 14일' : '7월 15일');
const matchedDailyVideo = selectDailyVideoCandidate(dailyVideoCandidates, {
    targetDateKey: '2026-07-14',
    now: new Date('2026-07-15T00:00:00Z').getTime(),
    matchesDate,
});
assert.equal(matchedDailyVideo.candidate?.it?.contentDetails?.videoId, 'todayVideo1');
assert.equal(matchedDailyVideo.matchedDate, true);
assert.equal(matchedDailyVideo.pending, false);
const pendingDailyVideo = selectDailyVideoCandidate(dailyVideoCandidates, {
    targetDateKey: '2026-07-15',
    now: new Date('2026-07-15T00:00:00Z').getTime(),
    matchesDate,
});
assert.equal(pendingDailyVideo.candidate, null);
assert.equal(pendingDailyVideo.pending, true);
assert.equal(pendingDailyVideo.stale, true);
const clientNow = Date.parse('2026-07-15T00:00:00.000Z');
const cachedManual = {
    adult: { url: 'https://youtu.be/M1234567890', chapters: [{ label: '해설', sec: 0 }] },
    kids: null,
    autoFilled: false,
    chaptersRefreshedAt: new Date(clientNow - 60_000).toISOString(),
    updatedAt: new Date(clientNow - 60_000).toISOString(),
};
const cachedAuto = {
    adult: { url: 'https://youtu.be/A1234567890', chapters: [], matchedDate: true },
    kids: { url: 'https://youtu.be/K1234567890', chapters: [], matchedDate: true },
    autoFilled: true,
    chaptersRefreshedAt: { toMillis: () => clientNow - 60_000 },
};
assert.equal(DAILY_VIDEO_CLIENT_TTL_MS, 45 * 60 * 1000);
assert.equal(shouldResolveDailyVideo(null, clientNow), true);
assert.equal(shouldResolveDailyVideo(cachedManual, clientNow), false);
assert.equal(shouldResolveDailyVideo(cachedAuto, clientNow), false);
assert.equal(shouldResolveDailyVideo({ ...cachedAuto, kids: null }, clientNow), true);
assert.equal(isDailyVideoClientRefreshDue({ ...cachedManual, chaptersRefreshedAt: clientNow - DAILY_VIDEO_CLIENT_TTL_MS }, clientNow), true);
assert.equal(isDailyVideoClientRefreshDue({ ...cachedManual, updatedAt: clientNow + 86_400_000 }, clientNow), false);
assert.equal(
    getDailyVideoClientRefreshDelay(cachedAuto, clientNow),
    DAILY_VIDEO_CLIENT_TTL_MS - 60_000,
    'fresh 캐시는 TTL 경계까지 남은 시간을 반환해야 한다.',
);
assert.equal(
    getDailyVideoClientRefreshDelay({
        ...cachedAuto,
        updatedAt: clientNow + 2 * 60_000,
    }, clientNow),
    2 * 60_000,
    '미래 updatedAt은 그 시각 전까지 반복 resolve를 막되 TTL보다 길게 미루면 안 된다.',
);
assert.equal(getDailyVideoRetryDelay(0), 2 * 60 * 1000);
assert.equal(getDailyVideoRetryDelay(1, 30 * 60 * 1000), 30 * 60 * 1000);
assert.equal(getDailyVideoRetryDelay(9), 60 * 60 * 1000);
assert.equal(getSafeCachedDailyVideo({
    ...cachedAuto,
    kids: { ...cachedAuto.kids, matchedDate: false },
})?.kids, null);
const transientVideo = {
    adult: cachedAuto.adult,
    kids: null,
    autoFilled: true,
};
assert.equal(selectDailyVideoDisplay(cachedManual, {
    video: cachedManual,
    transient: transientVideo,
})?.autoFilled, true, 'partial transient가 저장 캐시보다 먼저 표시돼야 한다.');
const previousPartialDisplay = {
    ...cachedAuto,
    adult: { ...cachedAuto.adult, chapters: [{ label: '해설', sec: 10 }] },
    kids: { ...cachedAuto.kids, chapters: [{ label: '기도', sec: 20 }] },
};
const nextPartialDisplay = selectDailyVideoDisplay(previousPartialDisplay, {
    video: {
        ...cachedAuto,
        adult: { ...cachedAuto.adult, chapters: [{ label: '해설', sec: 30 }] },
        kids: null,
    },
    transient: null,
});
assert.equal(nextPartialDisplay?.adult?.chapters?.[0]?.sec, 30, '새 응답의 모드는 우선해야 한다.');
assert.equal(nextPartialDisplay?.kids?.chapters?.[0]?.sec, 20, '새 응답에서 빠진 안전 모드는 보존해야 한다.');
const manualKidsOnly = {
    adult: null,
    kids: cachedManual.adult,
    autoFilled: false,
};
const manualOverrideDisplay = selectDailyVideoDisplay(previousPartialDisplay, {
    video: manualKidsOnly,
    transient: null,
});
assert.equal(manualOverrideDisplay?.adult, null, '수동 문서가 비운 모드를 이전 자동 영상으로 채우면 안 된다.');
assert.equal(manualOverrideDisplay?.kids?.url, cachedManual.adult.url);
const resolveFenceBase = {
    requestSnapshotSignature: 'snapshot-a',
    currentSnapshotSignature: 'snapshot-b',
    pending: false,
    resultVideo: cachedAuto,
    latestVideo: cachedAuto,
    latestRefreshDue: false,
};
assert.equal(
    shouldDiscardDailyVideoResolveResult(resolveFenceBase),
    false,
    'HTTP보다 먼저 관찰한 동일 payload 자체 write는 중복 resolve를 만들면 안 된다.',
);
assert.equal(
    shouldDiscardDailyVideoResolveResult({ ...resolveFenceBase, latestRefreshDue: true }),
    true,
    '동일 표시여도 최신 metadata가 refresh-due이면 완료 응답을 폐기해야 한다.',
);
assert.equal(
    shouldDiscardDailyVideoResolveResult({
        ...resolveFenceBase,
        pending: true,
        latestRefreshDue: true,
    }),
    false,
    '동일 payload의 partial write는 서버 backoff를 보존해야 한다.',
);
assert.equal(
    shouldDiscardDailyVideoResolveResult({ ...resolveFenceBase, latestVideo: manualKidsOnly }),
    true,
    '요청 중 수동 authority가 등장하면 늦은 자동 응답을 폐기해야 한다.',
);
const freshOneModeAuto = { ...cachedAuto, kids: null };
const reopenBase = {
    settledByResponse: true,
    settledResponseSnapshotSignature: 'snapshot-a',
    currentSnapshotSignature: 'snapshot-b',
    settledResponseDisplaySignature: getDailyVideoDisplaySignature(freshOneModeAuto),
    latestStoredVideo: freshOneModeAuto,
    nowMs: clientNow,
};
assert.equal(
    shouldReopenDailyVideoAfterSnapshot(reopenBase),
    false,
    'HTTP보다 늦게 온 fresh one-mode 자체 snapshot은 중복 resolve를 만들면 안 된다.',
);
assert.equal(
    shouldReopenDailyVideoAfterSnapshot({
        ...reopenBase,
        settledResponseDisplaySignature: getDailyVideoDisplaySignature(cachedManual),
        latestStoredVideo: {
            ...cachedManual,
            chaptersRefreshedAt: clientNow - 60_000,
            updatedAt: clientNow,
        },
    }),
    true,
    '응답 뒤 수동 metadata가 갱신되면 같은 표시값이어도 refresh를 다시 열어야 한다.',
);

const retryStorageValues = new Map();
const retryStorage = {
    getItem: key => retryStorageValues.get(key) ?? null,
    setItem: (key, value) => retryStorageValues.set(key, value),
    removeItem: key => retryStorageValues.delete(key),
};
const retryDate = '2099-07-15';
const retryNow = Date.parse('2099-07-15T00:00:00.000Z');
clearDailyVideoRetryNotBefore(retryDate, retryStorage);
assert.equal(
    recordDailyVideoRetryNotBefore(retryDate, 30 * 60 * 1000, retryNow, retryStorage),
    retryNow + 30 * 60 * 1000,
);
assert.equal(
    getDailyVideoRetryNotBefore(retryDate, retryNow + 60_000, retryStorage),
    retryNow + 30 * 60 * 1000,
    'uid/effect 재시작 뒤에도 서버 최소 재시각을 복원해야 한다.',
);
const reloadedDailyVideoClient = await import('../src/utils/dailyVideoClient.js?round18-reload');
assert.equal(
    reloadedDailyVideoClient.getDailyVideoRetryNotBefore(
        retryDate,
        retryNow + 60_000,
        retryStorage,
    ),
    retryNow + 30 * 60 * 1000,
    '모듈이 다시 로드돼도 sessionStorage의 최소 재시각을 복원해야 한다.',
);
assert.equal(
    recordDailyVideoRetryNotBefore(retryDate, 2 * 60 * 1000, retryNow + 60_000, retryStorage),
    retryNow + 30 * 60 * 1000,
    '늦게 도착한 짧은 backoff가 기존 최소 재시각을 앞당기면 안 된다.',
);
assert.equal(
    getDailyVideoRetryNotBefore(retryDate, retryNow + 30 * 60 * 1000, retryStorage),
    0,
    '최소 재시각이 지나면 저장값을 정리해야 한다.',
);

assert.match(dailyVideo, /import \{ resolveDailyVideo \} from '\.\.\/\.\.\/utils\/platformApi'/);
assert.match(dailyVideo, /db\.collection\('dailyVideos'\)\.doc\(dateKey\)/);
const cacheThenResolveBlock = dailyVideo.slice(dailyVideo.indexOf('docRef.onSnapshot('));
assert.match(
    cacheThenResolveBlock,
    /const cachedVideo = getSafeCachedDailyVideo\(storedVideo\);[\s\S]*shouldResolveDailyVideo\(storedVideo\)[\s\S]*const displayedVideo[\s\S]*applyVideoDoc\(displayedVideo\)[\s\S]*if \(fromCache\) return;[\s\S]*resolveWhenAllowed\(cachedVideo\)/,
    'Firestore 캐시를 먼저 표시한 뒤 준비되지 않은 경우에만 서버 resolve를 호출해야 한다.',
);
for (const forbidden of [
    /googleapis\.com\/youtube\/v3/,
    /videoAutoConfig/,
    /fetchLatestFromPlaylist/,
    /fetchVideoDescriptionChapters/,
    /refreshDescriptionChapters/,
    /docRef\.set\(/,
    /firebase\.firestore\.FieldValue/,
]) assert.doesNotMatch(dailyVideo, forbidden, '일반 사용자 영상 카드에 직접 YouTube/설정/쓰기가 남아 있다.');
assert.match(dailyVideo, /const result = await resolveDailyVideo\(\)/);
assert.match(dailyVideo, /recordDailyVideoRetryNotBefore\([\s\S]*result\.serviceDate[\s\S]*result\.retryAfterMs/);
assert.match(dailyVideo, /result\.serviceDate !== dateKey[\s\S]*carriedResolveRef\.current = result;[\s\S]*setDateKey\(result\.serviceDate\)/);
assert.match(dailyVideo, /if \(cancelled\) return;/);
assert.match(dailyVideo, /selectDailyVideoDisplay\([\s\S]*result\.pending[\s\S]*pendingDisplayVideo/);
assert.match(dailyVideo, /let retryNotBeforeAt = getDailyVideoRetryNotBefore\(dateKey\)/);
assert.match(dailyVideo, /scheduleAutoRetry[\s\S]*getDailyVideoRetryNotBefore\(dateKey, now\)/);
assert.match(dailyVideo, /Math\.max\(delay, retryNotBeforeAt - now\)/);
assert.match(dailyVideo, /now < retryNotBeforeAt[\s\S]*AUTO_RETRY_FOCUS_COOLDOWN_MS/);
assert.match(dailyVideo, /docRef\.onSnapshot\([\s\S]*includeMetadataChanges: true[\s\S]*unsubscribeCache/);
assert.match(dailyVideo, /const fromCache = doc\.metadata\?\.fromCache === true/);
assert.match(dailyVideo, /if \(!fromCache\) \{[\s\S]*clearDailyVideoRetryNotBefore\(dateKey\);[\s\S]*clearAutoRetry\(\)/);
assert.match(dailyVideo, /if \(fromCache\) return;[\s\S]*resolveWhenAllowed\(cachedVideo\)/);
assert.match(dailyVideo, /cachedVideo\?\.autoFilled === false[\s\S]*pendingDisplayVideo = null/);
assert.match(dailyVideo, /dailyVideoSnapshotSignature[\s\S]*updatedAt:[\s\S]*chaptersRefreshedAt:/);
assert.match(dailyVideo, /const requestSnapshotSignature = latestSnapshotSignature[\s\S]*shouldDiscardDailyVideoResolveResult\(\{/);
assert.match(dailyVideo, /latestRefreshDue: isDailyVideoClientRefreshDue\(latestStoredVideo\)[\s\S]*clearAutoRetry\(\);[\s\S]*reevaluateAfterResponse = true/);
assert.match(dailyVideo, /shouldReopenDailyVideoAfterSnapshot\(\{[\s\S]*currentSnapshotSignature: latestSnapshotSignature[\s\S]*if \(shouldReopen\)[\s\S]*serverSettled = false/);
assert.match(dailyVideo, /function scheduleRefreshRecheck\(storedVideo\)[\s\S]*getDailyVideoClientRefreshDelay\(storedVideo\)[\s\S]*refreshTimer = setTimeout/);
assert.match(dailyVideo, /function reopenForRefresh\(\)[\s\S]*isDailyVideoClientRefreshDue\(latestStoredVideo\)[\s\S]*resolveWhenAllowed\(latestCachedVideo\)/);
assert.match(dailyVideo, /if \(reopenForRefresh\(\)\) return;[\s\S]*!retryCallback/);
assert.match(dailyVideo, /else if \(responseSnapshotChanged\)[\s\S]*settledResponseSnapshotSignature = latestSnapshotSignature;[\s\S]*if \(serverSettled && !reopenForRefresh\(\)\)[\s\S]*scheduleRefreshRecheck\(storedVideo\)/);
assert.match(dailyVideo, /return \(\) => \{[\s\S]*cancelRefreshTimer\(\)/);
assert.match(dailyVideo, /reevaluateAfterResponse && !cancelled[\s\S]*resolveWhenAllowed\(latestCachedVideo\)/);
assert.match(dailyVideo, /document\.addEventListener\('visibilitychange', retryOnReturn\)/);
assert.match(dailyVideo, /window\.addEventListener\('focus', retryOnReturn\)/);
assert.match(
    platformAdmin,
    /import \{[^}]*\badminPreviewDailyVideo\b[^}]*\} from '\.\.\/utils\/platformApi'/,
);
assert.equal(
    exists('src/utils/adminDailyVideoPreview.js'),
    false,
    '브라우저 YouTube 미리보기 helper는 서버 전환 뒤 제거해야 한다.',
);
for (const forbidden of [
    /adminDailyVideoPreview/,
    /fetchLatestFromPlaylist/,
    /googleapis\.com/,
    /\bautoApiKey\b/,
    /\bsetAutoApiKey\b/,
    /\bd\.apiKey\b/,
]) assert.doesNotMatch(platformAdmin, forbidden, '플랫폼 관리자 화면에 브라우저 API 키/YouTube 호출 흔적이 남아 있다.');

const autoConfigStart = platformAdmin.indexOf('const saveAutoConfig = async () =>');
const autoConfigEnd = platformAdmin.indexOf('\n    React.useEffect(', autoConfigStart);
assert.ok(autoConfigStart >= 0 && autoConfigEnd > autoConfigStart, '자동 영상 설정 저장 구간이 필요하다.');
const autoConfigBlock = platformAdmin.slice(autoConfigStart, autoConfigEnd);
assert.match(autoConfigBlock, /collection\('settings'\)\.doc\('videoAutoConfig'\)\.set\(\{/);
for (const field of ['adultPlaylistId', 'kidsPlaylistId', 'enabled', 'updatedAt']) {
    assert.match(autoConfigBlock, new RegExp(`\\b${field}:`), `자동 영상 설정에 ${field}가 필요하다.`);
}
assert.match(autoConfigBlock, /\}, \{ merge: true \}\)/, '기존 설정 문서에는 안전한 merge 저장을 사용해야 한다.');
assert.doesNotMatch(autoConfigBlock, /\bapiKey\b/, '브라우저가 YouTube API 키를 설정 문서에 저장하면 안 된다.');

const connectionTestStart = platformAdmin.indexOf('const testAutoConnection = async () =>');
const connectionTestEnd = platformAdmin.indexOf('\n    const loadVideoList', connectionTestStart);
assert.ok(connectionTestStart >= 0 && connectionTestEnd > connectionTestStart, '자동 영상 연결 확인 구간이 필요하다.');
const connectionTestBlock = platformAdmin.slice(connectionTestStart, connectionTestEnd);
assert.match(connectionTestBlock, /await adminPreviewDailyVideo\(\{ adultPlaylistId, kidsPlaylistId \}\)/);
assert.match(connectionTestBlock, /result\.previews\[mode\]/, '미리보기는 서버의 adult/kids 객체 응답을 사용해야 한다.');
assert.match(connectionTestBlock, /result\.serviceDate/, '미리보기 기준일은 서버 serviceDate를 사용해야 한다.');
assert.doesNotMatch(connectionTestBlock, /\bfetch\s*\(|getVideoDateKST\(/, '관리자 미리보기에서 브라우저 직접 조회/기준일 계산을 하면 안 된다.');
assert.match(platformAdmin, /서버 Secret\([\s\S]*YOUTUBE_API_KEY/, 'API 키가 서버 Secret으로 이동했다는 안내가 필요하다.');

const manualSaveStart = platformAdmin.indexOf('const saveDailyVideo = async () =>');
const manualSaveEnd = platformAdmin.indexOf('\n    const deleteDailyVideo', manualSaveStart);
assert.ok(manualSaveStart >= 0 && manualSaveEnd > manualSaveStart, '수동 매일 영상 저장 구간이 필요하다.');
assert.match(
    platformAdmin.slice(manualSaveStart, manualSaveEnd),
    /collection\('dailyVideos'\)\.doc\(videoDate\)\.set\(payload, \{ merge: true \}\)/,
    '관리자 수동 영상 등록/수정 경로는 유지해야 한다.',
);
const manualDeleteStart = platformAdmin.indexOf('const deleteDailyVideo = async (date) =>');
const manualDeleteEnd = platformAdmin.indexOf('\n    React.useEffect(', manualDeleteStart);
assert.ok(manualDeleteStart >= 0 && manualDeleteEnd > manualDeleteStart, '수동 매일 영상 삭제 구간이 필요하다.');
assert.match(
    platformAdmin.slice(manualDeleteStart, manualDeleteEnd),
    /collection\('dailyVideos'\)\.doc\(date\)\.delete\(\)/,
    '관리자 수동 영상 삭제 경로는 유지해야 한다.',
);
assert.match(dailyVideo, /newMode === 'kids'[\s\S]*startsWith\('nt_'\)/);
assert.match(dailyVideo, /saveGuestState\(\{ videoType: newMode,[\s\S]*quizLevel: 'easy'/);
assert.match(dailyVideo, /videoMode: newMode,[\s\S]*quizLevel: 'easy'/);
assert.match(dailyVideo, /currentUser\?\.dailyVideoCollapsed === true/);
assert.match(dailyVideo, /saveGuestState\(\{ dailyVideoCollapsed: nextCollapsed \}\)/);
assert.match(dailyVideo, /collection\('users'\)\.doc\(currentUser\.uid\)\.set\(\{[\s\S]*dailyVideoCollapsed: nextCollapsed/);
assert.match(guestStorage, /dailyVideoCollapsed: raw\?\.dailyVideoCollapsed === true/);
assert.match(quiz, /어린이 영상을 선택하면 쉬운 퀴즈로 자동 변경돼요/);
assert.match(helperSource, /export \{ parseChapters, mapToStandardLabel, parseAndMapChapters \} from '\.\/dailyVideoChapters\.js'/);
assert.match(dailyVideoChaptersSource, /label\.includes\('해설'\) \|\| label\.includes\('묵상'\)/);
assert.match(app, /\['dashboard', 'church_admin'\]\.includes\(view\)[\s\S]*sessionStorage\.setItem\(ADMIN_ENTRY_SESSION_KEY, view\)/);

console.log('라운드 18 계약 검증 통과: 첫 화면, 소셜 연결, 읽기 흐름, 기록 허브, DAY별 퀴즈, 공동체별 달란트 지갑, 관리자 읽기 기본');
