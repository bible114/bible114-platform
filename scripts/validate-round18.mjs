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
assert.equal(getDefaultQuizLevel({ planId: 'nt_easy' }), 'easy');
assert.equal(getDefaultQuizLevel({ planId: 'nt_new', videoMode: 'kids' }), 'easy');
assert.equal(getDefaultQuizLevel({ planId: 'nt_new', departmentId: 'elementary' }), 'easy');
assert.equal(getDefaultQuizLevel({ planId: 'nt_new' }), 'standard');
assert.equal(getQuizLevel({ planId: 'nt_easy', quizLevel: 'standard' }), 'standard');

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
const quizSubmission = read('supabase/functions/platform-api/quizSubmission.ts');
const header = read('src/components/dashboard/DashboardHeader.jsx');
const achievements = read('src/components/modals/AchievementsModal.jsx');
const actions = read('src/hooks/useUserBibleActions.js');
const userStateSync = read('src/utils/userStateSync.js');
const rosterSource = read('src/utils/roster.js');
const settings = read('src/components/churchAdmin/SettingsTab.jsx');
const shop = read('src/components/dashboard/TalentShop.jsx');
const churchAdmin = read('src/components/ChurchAdminView.jsx');
const platformApiServer = read('supabase/functions/platform-api/index.ts');
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
const quizEngine = read('src/utils/quizEngine.js');
const guestStorage = read('src/utils/guestStorage.js');
const guestReader = read('src/components/GuestReaderView.jsx');

for (const text of ['5초만에 빠른 시작', '카카오로 시작', '기존 회원 로그인(이름으로)', '공동체 등록하기']) assert.match(login, new RegExp(text.replace(/[()]/g, '\\$&')));
for (const text of ['공동체 등록이란?', '성도이신가요?', '무료 · 약 5분 소요']) assert.match(login, new RegExp(text.replace(/[()?]/g, '\\$&')));
assert.match(read('src/App.jsx'), /공동체 등록 완료![\s\S]*성도용 가입 안내문 인쇄\(QR\)/);
assert.doesNotMatch(settings, /우리 교회 로그인 링크|\?church=/);
assert.match(dashboard, /quizContent=\{\(/);
assert.match(reader, /quizContent[\s\S]*tut-read-btn/);
assert.match(reader, /오늘 읽기 완료! 🎉/);
assert.match(reader, /const isAdvanceRead = hasReadToday && isCurrentProgressDay;[\s\S]*const isQuizGateLocked = [\s\S]*&& !isAdvanceRead[\s\S]*&& !quizGateOpen;/);
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
assert.match(scheduleAliases, /'nt_easy': schedules\.new_testament/);
assert.match(scheduleAliases, /'nt_message': schedules\.new_testament/);
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
assert.doesNotMatch(actions, /\{ \.\.\.previous, \.\.\.response\.state\.user \}/);
assert.match(actions, /loadCanonicalUserStateFromServer\(uid\)/);
assert.match(userStateSync, /loadCanonicalRosterRefsFromServer/);
assert.match(userStateSync, /dbInstance\.runTransaction\(async transaction =>[\s\S]*transaction\.get\(userRef\)/);
assert.match(rosterSource, /\.get\(\{ source:\s*['"]server['"] \}\)/);
assert.match(quizSubmission, /quizProgress\.\$\{input\.progressKey\}/);
assert.match(quiz, /퀴즈 달란트는 하루 1번만 적립돼요/);
assert.match(quiz, /if \(solved\)[\s\S]*>정답!<\/p>/);
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
assert.match(helpers, /transaction\.update\(userRef, \{ talent: 0, talentWalletMigrated: true \}\)/);
assert.match(shop, /공동체별 내 달란트/);
assert.match(shop, /onOrganizationChange/);
assert.match(app, /talentOrganizations/);
assert.match(app, /org\.orgId === \(activeRosterOrgId \|\| currentUser\.primaryOrgId\)/);
assert.match(app, /baseChurchId: currentUser\.churchId[\s\S]*baseChurchName: currentUser\.churchName/);
assert.match(app, /handlePrimaryOrgChange[\s\S]*activeOrgBeforeChange[\s\S]*setActiveRosterOrgId\(activeOrgBeforeChange === orgId \? null : activeOrgBeforeChange\)/);
assert.match(app, /handleActiveOrgChange[\s\S]*currentUser\.accountType === 'personal'[\s\S]*setActiveRosterOrgId\(orgId === currentUser\.primaryOrgId \? null : orgId\)/);
assert.doesNotMatch(app, /handleActiveOrgChange[\s\S]{0,300}handlePrimaryOrgChange\(orgId\)/);
assert.match(shop, /★ 기준 공동체는 바뀌지 않아요/);
assert.match(header, /title="공동체 관리">⚙️ <span>관리<\/span>/);
assert.match(socialBanner, /\['member', 'churchAdmin'\]\.includes/);
assert.doesNotMatch(settings, /GoogleLinkCard/);
assert.doesNotMatch(login, /교회 관리자/);
assert.match(authFlow, /\['member', 'churchAdmin'\]\.includes\(data\.role\)/);
assert.match(socialOnboarding, /getVisibleBibleVersions\(planType, \{ \.\.\.tempUser, name \}\)/);
assert.doesNotMatch(socialOnboarding, /\(BIBLE_VERSIONS\[planType\] \|\| \[\]\)\.map/);
assert.match(authFlow, /isPlanIdAllowedForUser\(guest\.planId, null\)/);
assert.match(authFlow, /isPlanIdAllowedForUser\(planId, newUser\)/);
assert.match(rules, /hasAny\(\['role', 'churchId', 'accountType', 'isDeleted', 'extraMemberships',[\s\S]*'talentWalletMigrated', 'departmentId', 'departmentName',[\s\S]*'subgroupId', 'subgroupName'\]\)/);
assert.match(rules, /existsAfter\([\s\S]*primaryOrgId[\s\S]*roster/);
assert.match(rules, /get\('talent', 0\) <= resource\.data\.get\('talent', 0\) \+ 17/);
assert.match(rules, /isExactPersonalTalentTransfer[\s\S]*userAfter\.diff\(userBefore\)[\s\S]*rosterAfter\.diff\(rosterBefore\)[\s\S]*rosterAfter\.get\('talent', 0\) - rosterBefore\.get\('talent', 0\) ==[\s\S]*userBefore\.get\('talent', 0\) - userAfter\.get\('talent', 0\)/);
assert.match(rules, /get\('score', 0\) <= resource\.data\.get\('score', 0\) \+ 15/);
assert.match(rules, /match \/churches\/\{churchId\} \{[\s\S]*allow read: if isRealUser\(\)/);
assert.match(rules, /match \/private\/\{privateId\} \{[\s\S]*isChurchAdminAfter\(churchId\)/);
assert.match(adminPurchaseCore, /text\(purchase\.status\) !== "pending"[\s\S]*PURCHASE_ALREADY_PROCESSED/);
assert.match(platformApiServer, /parsed\.action === "adminRefundPurchase"[\s\S]*getDocument<AdminPurchaseRecord>[\s\S]*updateWrite\(service\.projectId, walletPath[\s\S]*updateWrite\(service\.projectId, purchasePath[\s\S]*\{ transaction \}/);
assert.doesNotMatch(churchAdmin, /FieldValue\.increment\(refundAmount\)|transaction\.update\(purchaseRef/);
assert.doesNotMatch(churchAdmin, /batch\.update\(walletRef[\s\S]*FieldValue\.increment\(purchase\.price/);
assert.match(rules, /resource\.data\.status == 'pending'[\s\S]*request\.resource\.data\.status in \['delivered', 'cancelled'\]/);
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
assert.match(quiz, /어린이 영상을 선택하면 쉬운 퀴즈로 자동 변경돼요/);
assert.match(helperSource, /export \{ parseChapters, mapToStandardLabel, parseAndMapChapters \} from '\.\/dailyVideoChapters\.js'/);
assert.match(dailyVideoChaptersSource, /label\.includes\('해설'\) \|\| label\.includes\('묵상'\)/);
assert.match(app, /\['dashboard', 'church_admin'\]\.includes\(view\)[\s\S]*sessionStorage\.setItem\(ADMIN_ENTRY_SESSION_KEY, view\)/);

console.log('라운드 18 계약 검증 통과: 첫 화면, 소셜 연결, 읽기 흐름, 기록 허브, DAY별 퀴즈, 공동체별 달란트 지갑, 관리자 읽기 기본');
