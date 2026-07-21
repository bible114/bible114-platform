import assert from 'node:assert/strict';
import fs from 'node:fs';
import { ACHIEVEMENTS, getNewAchievementIds, mergeAchievementIds } from '../src/data/achievements.js';
import { getDailyAdvanceState } from '../src/utils/readPolicy.js';
import { getTTSLegacyBlockedApp, getTTSUnavailableApp } from '../src/utils/ttsAvailability.js';

const read = path => fs.readFileSync(path, 'utf8');

assert.deepEqual(getDailyAdvanceState({}, '2026-07-13', 'Mon Jul 13 2026'), {
    count: 0,
    isFirstReadToday: true,
});
assert.deepEqual(getDailyAdvanceState({ lastReadDate: 'Mon Jul 13 2026' }, '2026-07-13', 'Mon Jul 13 2026'), {
    count: 1,
    isFirstReadToday: false,
});
assert.deepEqual(getDailyAdvanceState({ dailyAdvanceDate: '2026-07-13', dailyAdvanceCount: 365 }, '2026-07-13', 'Mon Jul 13 2026'), {
    count: 365,
    isFirstReadToday: false,
});

const firstMemo = getNewAchievementIds({ achievements: [], currentDay: 1, score: 0, streak: 0 }, { '1_0': {} });
assert(firstMemo.includes('first_memo'));
assert.deepEqual(mergeAchievementIds(['first_memo'], ['first_memo', 'score_100']), ['first_memo', 'score_100']);
const achievementThresholdContract = [
    ['first_read', 'currentDay', 2],
    ['streak_7', 'streak', 7],
    ['streak_30', 'streak', 30],
    ['streak_100', 'streak', 100],
    ['day_30', 'currentDay', 30],
    ['day_100', 'currentDay', 100],
    ['day_200', 'currentDay', 200],
    ['day_365', 'currentDay', 365],
    ['first_memo', 'memoCount', 1],
    ['memo_10', 'memoCount', 10],
    ['memo_50', 'memoCount', 50],
    ['score_100', 'score', 100],
    ['score_500', 'score', 500],
    ['score_1000', 'score', 1000],
];
assert.deepEqual(
    ACHIEVEMENTS.map(item => item.id),
    achievementThresholdContract.map(([id]) => id),
    '클라이언트 업적 ID와 표시 순서는 서버 계약과 같은 14개여야 한다.',
);
const memosOfSize = count => Object.fromEntries(
    Array.from({ length: count }, (_, index) => [`memo-${index + 1}`, {}]),
);
for (const [id, field, threshold] of achievementThresholdContract) {
    const achievement = ACHIEVEMENTS.find(item => item.id === id);
    assert.ok(achievement, `${id} 업적이 필요하다.`);
    const belowUser = { currentDay: 1, streak: 0, score: 0 };
    const atUser = { ...belowUser };
    let belowMemos = {};
    let atMemos = {};
    if (field === 'memoCount') {
        belowMemos = memosOfSize(threshold - 1);
        atMemos = memosOfSize(threshold);
    } else {
        belowUser[field] = threshold - 1;
        atUser[field] = threshold;
    }
    assert.equal(achievement.condition(belowUser, belowMemos), false, `${id}는 경계값 직전에 열리면 안 된다.`);
    assert.equal(achievement.condition(atUser, atMemos), true, `${id}는 정확한 경계값에서 열려야 한다.`);
}
assert.deepEqual(
    getNewAchievementIds(
        { achievements: [], currentDay: 365, streak: 100, score: 1000 },
        memosOfSize(50),
    ),
    achievementThresholdContract.map(([id]) => id),
    '동시에 달성한 업적도 canonical 순서로 반환해야 한다.',
);

const actions = read('src/hooks/useUserBibleActions.js');
assert.match(actions, /import\s*\{[^}]*syncAchievements[^}]*\}\s*from\s*['"]\.\.\/utils\/platformApi['"]/);
const checkAchievementsSource = actions.slice(
    actions.indexOf('const checkAchievements = useCallback('),
    actions.indexOf('const handleRead = useCallback(', actions.indexOf('const checkAchievements = useCallback(')),
);
assert.ok(checkAchievementsSource.length > 0, '서버 업적 동기화 helper가 필요하다.');
assert.match(checkAchievementsSource, /await syncAchievements\(\s*trigger,\s*\{[\s\S]*expectedUid:\s*uid/);
assert.match(checkAchievementsSource, /await syncLatestUser\(uid\)/);
assert.match(checkAchievementsSource, /response\.result\.newIds/);
assert.match(checkAchievementsSource, /freshUser\.achievements/);
assert.doesNotMatch(
    checkAchievementsSource,
    /db\.runTransaction|getNewAchievementIds|mergeAchievementIds|transaction\.(?:get|set|update|delete)/,
    '업적 판정·merge·저장은 서버 syncAchievements만 수행해야 한다.',
);
const handleReadSource = actions.slice(
    actions.indexOf('const handleRead'),
    actions.indexOf('const handleRestart'),
);
const handleRestartSource = actions.slice(
    actions.indexOf('const handleRestart'),
    actions.indexOf('\n    return {', actions.indexOf('const handleRestart')),
);
const restartToastInvalidationIndex = handleRestartSource.indexOf('achievementToastScheduleRef.current += 1');
const restartApiIndex = handleRestartSource.indexOf('const response = await restartReading(');
assert.ok(
    restartToastInvalidationIndex >= 0 && restartToastInvalidationIndex < restartApiIndex,
    '재시작 응답이 유실돼도 이전 epoch의 지연 업적 toast는 요청 시작 전에 무효화해야 한다.',
);
const restartUiClearIndex = handleRestartSource.indexOf('setCompletionSummary(null)');
const restartReplayIndex = handleRestartSource.indexOf('if (response.alreadyCompleted)');
assert.ok(
    restartUiClearIndex >= 0 && restartUiClearIndex < restartReplayIndex,
    '재시작 응답 유실 뒤 exact replay도 이전 epoch 완료·보너스 UI를 먼저 정리해야 한다.',
);
assert.match(actions, /import\s*\{[^}]*completeRead[^}]*restartReading[^}]*\}\s*from\s*['"]\.\.\/utils\/platformApi['"]/);
assert(handleReadSource.includes('response = await completeRead('));
assert(!handleReadSource.includes("response.result.status === 'dailyLimit'"));
assert(!handleReadSource.includes('db.runTransaction'));

const memosHook = read('src/hooks/useMemos.js');
const saveMemoSource = memosHook.slice(
    memosHook.indexOf('const saveMemo = useCallback('),
    memosHook.indexOf('\n    return {', memosHook.indexOf('const saveMemo = useCallback(')),
);
const memoWriteIndex = saveMemoSource.indexOf("await db.collection('users').doc(uid).set(");
const memoAchievementIndex = saveMemoSource.indexOf("await checkAchievements(currentUser, 'memo')");
const memoCompleteIndex = saveMemoSource.indexOf("typeof onComplete === 'function'");
assert.ok(memoWriteIndex >= 0 && memoAchievementIndex > memoWriteIndex, '메모 저장 후 memo 업적을 서버에서 동기화해야 한다.');
assert.ok(memoCompleteIndex > memoAchievementIndex, '업적 확인 뒤에도 기존 onComplete 호출을 보존해야 한다.');
assert.match(
    saveMemoSource.slice(memoWriteIndex, memoCompleteIndex),
    /try\s*\{[\s\S]*await checkAchievements\(currentUser, 'memo'\)[\s\S]*\}\s*catch\s*\(/,
    '업적 동기화 실패는 이미 성공한 메모 저장과 분리해야 한다.',
);

const reader = read('src/components/dashboard/BibleReader.jsx');
assert(!/isCurrentProgressDay\s*&&\s*!hasReadToday\s*&&\s*!quizGateOpen/.test(reader));
assert(!reader.includes('handleSpeak(verseData.text, currentIndex)'));

const quizCard = read('src/components/dashboard/BibleQuizCard.jsx');
const skipTodaySource = quizCard.slice(
    quizCard.indexOf('const skipToday'),
    quizCard.indexOf('const submitAnswer'),
);
assert(quizCard.includes('getOrCreateQuizSkipActivityRequest'));
assert(skipTodaySource.includes('await skipQuiz('));
assert(!skipTodaySource.includes('db.runTransaction'));
const quizSubmission = read('supabase/functions/platform-api/quizSubmission.ts');
assert(quizSubmission.includes('skipped: true'));
assert(quizSubmission.includes('`quizProgress.${input.progressKey}`'));

const dashboard = read('src/components/DashboardView.jsx');
assert(dashboard.includes('currentUser={currentUser}'));
assert(dashboard.includes('--app-fixed-bottom-clearance'));

const kakaoButton = read('src/components/dashboard/KakaoChannelButton.jsx');
assert(kakaoButton.includes('absolute md:fixed'));

const tts = read('src/hooks/useTTS.js');
assert(tts.includes('Eddy|Flo|Grandma|Grandpa|Reed|Rocko|Sandy|Shelley'));
assert(tts.includes('(?:\\s|\\(|$)'));
assert(tts.includes('if (!voiceExists || !selectedVoiceURI)'));
assert.equal(getTTSUnavailableApp('NAVER(inapp; search; 2000; 12.0.0)'), 'naver');
assert.equal(getTTSUnavailableApp('Mozilla/5.0 NAVER(inapp; search; 1100; 12.15.1)'), 'naver');
assert.equal(getTTSUnavailableApp('Mozilla/5.0 GSA/380.0.800000000 Mobile'), 'google');
assert.equal(getTTSUnavailableApp('Mozilla/5.0 (Linux; Android 15) GSA/380.0.800000000 Mobile Safari/537.36'), 'google');
assert.equal(getTTSUnavailableApp('Mozilla/5.0 Chrome/140.0.0.0 Safari/537.36'), null);
assert.equal(getTTSUnavailableApp('Mozilla/5.0 Version/18.0 Mobile Safari/604.1'), null);
assert.equal(getTTSUnavailableApp('KAKAOTALK 25.0'), null);
assert.equal(getTTSUnavailableApp('Googlebot/2.1'), null);
assert.equal(getTTSLegacyBlockedApp('KAKAOTALK 25.0'), 'kakao');
assert.equal(getTTSLegacyBlockedApp('NAVER(inapp; search; 2000; 12.0.0)'), null);
assert.equal(getTTSLegacyBlockedApp('Mozilla/5.0 GSA/380.0.800000000 Mobile'), null);
assert.equal(getTTSLegacyBlockedApp('Mozilla/5.0 Chrome/140.0.0.0 Safari/537.36'), null);
assert(reader.includes('네이버, 구글앱은 TTS를 지원하지 않습니다. 영상을 활용해 주세요.'));
assert(reader.includes('onSegmentClick={ttsUnavailableApp ? null : jumpToChunk}'));
assert(tts.includes("ttsLegacyBlockedApp === 'kakao'"));
assert(tts.includes('카카오톡 앱에서는 음성 듣기가 어려워요.'));
assert(tts.includes('ttsError'));
assert(!tts.includes('네이버/카카오 앱에서는'));

const guestReader = read('src/components/GuestReaderView.jsx');
assert(guestReader.includes('ttsUnavailableApp={ttsUnavailableApp}'));
assert(dashboard.includes('ttsUnavailableApp={ttsUnavailableApp}'));

const memberships = read('src/components/dashboard/CommunityMembershipCard.jsx');
assert(memberships.includes('busy || isPrimary'));
assert(memberships.includes('기본 공동체는 바로 탈퇴할 수 없어요'));

const auth = read('src/hooks/useAuth.js');
assert(auth.includes('setCurrentUser(runtimeUser)'));

const raceMap = read('src/components/dashboard/RaceMap.jsx');
assert(raceMap.includes('Math.max(8, Math.min'));

const quizValidator = read('scripts/validate-quiz.mjs');
assert(quizValidator.includes('필수 스케줄에 문항이 없는 본문'));
assert(quizValidator.includes('errors.push'));

console.log('라운드 15 계약 검증 통과: 일일 상한·보상·퀴즈·업적·TTS·모바일·탈퇴·가입·여정지도');
