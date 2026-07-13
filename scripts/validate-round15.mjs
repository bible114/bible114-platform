import assert from 'node:assert/strict';
import fs from 'node:fs';
import { ACHIEVEMENTS, getNewAchievementIds, mergeAchievementIds } from '../src/data/achievements.js';
import { DAILY_READ_ADVANCE_LIMIT, getDailyAdvanceState } from '../src/utils/readPolicy.js';

const read = path => fs.readFileSync(path, 'utf8');

assert.equal(DAILY_READ_ADVANCE_LIMIT, 3);
assert.deepEqual(getDailyAdvanceState({}, '2026-07-13', 'Mon Jul 13 2026'), {
    count: 0,
    isFirstReadToday: true,
});
assert.deepEqual(getDailyAdvanceState({ lastReadDate: 'Mon Jul 13 2026' }, '2026-07-13', 'Mon Jul 13 2026'), {
    count: 1,
    isFirstReadToday: false,
});
assert.deepEqual(getDailyAdvanceState({ dailyAdvanceDate: '2026-07-13', dailyAdvanceCount: 3 }, '2026-07-13', 'Mon Jul 13 2026'), {
    count: 3,
    isFirstReadToday: false,
});

const firstMemo = getNewAchievementIds({ achievements: [], currentDay: 1, score: 0, streak: 0 }, { '1_0': {} });
assert(firstMemo.includes('first_memo'));
assert.deepEqual(mergeAchievementIds(['first_memo'], ['first_memo', 'score_100']), ['first_memo', 'score_100']);
assert.equal(ACHIEVEMENTS.length, 14);

const actions = read('src/hooks/useUserBibleActions.js');
assert(actions.includes("blockedReason: 'DAILY_ADVANCE_LIMIT'"));
assert(actions.includes('addedScore = isFirstReadToday ? 10 + streakBonus : 0'));
assert(actions.includes('dailyAdvanceCount: nextDailyAdvanceCount'));

const reader = read('src/components/dashboard/BibleReader.jsx');
assert(!/isCurrentProgressDay\s*&&\s*!hasReadToday\s*&&\s*!quizGateOpen/.test(reader));
assert(!reader.includes('handleSpeak(verseData.text, currentIndex)'));

const quizCard = read('src/components/dashboard/BibleQuizCard.jsx');
assert(quizCard.includes('skipped: true'));
assert(quizCard.includes('[`quizProgress.${progressKey}`]'));

const dashboard = read('src/components/DashboardView.jsx');
assert(dashboard.includes('currentUser={currentUser}'));
assert(dashboard.includes('--app-fixed-bottom-clearance'));

const kakaoButton = read('src/components/dashboard/KakaoChannelButton.jsx');
assert(kakaoButton.includes('absolute md:fixed'));

const tts = read('src/hooks/useTTS.js');
assert(tts.includes('Eddy|Flo|Grandma|Grandpa|Reed|Rocko|Sandy|Shelley'));
assert(tts.includes('(?:\\s|\\(|$)'));
assert(tts.includes('if (!voiceExists || !selectedVoiceURI)'));

const memberships = read('src/components/dashboard/CommunityMembershipCard.jsx');
assert(memberships.includes('busy || isPrimary'));
assert(memberships.includes('기준 공동체는 바로 탈퇴할 수 없어요'));

const auth = read('src/hooks/useAuth.js');
assert(auth.includes('setCurrentUser(runtimeUser)'));

const raceMap = read('src/components/dashboard/RaceMap.jsx');
assert(raceMap.includes('Math.max(8, Math.min'));

const quizValidator = read('scripts/validate-quiz.mjs');
assert(quizValidator.includes('필수 스케줄에 문항이 없는 본문'));
assert(quizValidator.includes('errors.push'));

console.log('라운드 15 계약 검증 통과: 일일 상한·보상·퀴즈·업적·TTS·모바일·탈퇴·가입·여정지도');
