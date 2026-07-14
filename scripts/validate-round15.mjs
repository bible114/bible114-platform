import assert from 'node:assert/strict';
import fs from 'node:fs';
import { ACHIEVEMENTS, getNewAchievementIds, mergeAchievementIds } from '../src/data/achievements.js';
import { DAILY_READ_ADVANCE_LIMIT, getDailyAdvanceState } from '../src/utils/readPolicy.js';
import { getTTSUnavailableApp } from '../src/utils/ttsAvailability.js';

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
assert.equal(getTTSUnavailableApp('NAVER(inapp; search; 2000; 12.0.0)'), 'naver');
assert.equal(getTTSUnavailableApp('Mozilla/5.0 NAVER(inapp; search; 1100; 12.15.1)'), 'naver');
assert.equal(getTTSUnavailableApp('Mozilla/5.0 GSA/380.0.800000000 Mobile'), 'google');
assert.equal(getTTSUnavailableApp('Mozilla/5.0 (Linux; Android 15) GSA/380.0.800000000 Mobile Safari/537.36'), 'google');
assert.equal(getTTSUnavailableApp('Mozilla/5.0 Chrome/140.0.0.0 Safari/537.36'), null);
assert.equal(getTTSUnavailableApp('Mozilla/5.0 Version/18.0 Mobile Safari/604.1'), null);
assert.equal(getTTSUnavailableApp('KAKAOTALK 25.0'), null);
assert.equal(getTTSUnavailableApp('Googlebot/2.1'), null);
assert(reader.includes('네이버, 구글앱은 TTS를 지원하지 않습니다. 영상을 활용해 주세요.'));
assert(reader.includes('onSegmentClick={ttsUnavailableApp ? null : jumpToChunk}'));
assert(tts.includes("ua.indexOf('KAKAOTALK') > -1"));
assert(tts.includes('네이버/카카오 앱에서는 읽기 기능이 지원되지 않습니다.'));

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
