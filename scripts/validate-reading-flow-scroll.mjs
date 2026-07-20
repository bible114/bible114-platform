import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
    scheduleScrollIntoView,
    scrollElementIntoView,
    shouldScrollToReadingHeader,
} from '../src/utils/readingFlowScroll.js';

const readSource = path => fs.readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const dashboardSource = readSource('src/components/DashboardView.jsx');
const quizCardSource = readSource('src/components/dashboard/BibleQuizCard.jsx');
const readerSource = readSource('src/components/dashboard/BibleReader.jsx');
const tutorialSource = readSource('src/components/TutorialOverlay.jsx');
const userBibleActionsSource = readSource('src/hooks/useUserBibleActions.js');

assert.doesNotMatch(dashboardSource, /pendingQuizTerminalRef|onQuizTerminal=|readActionRef/);
assert.doesNotMatch(dashboardSource, /quizGate|setQuizGate|onQuizGateLocked/);
assert.doesNotMatch(quizCardSource, /onQuizTerminal|outcome: 'solved'|outcome: 'attemptsExhausted'/);
assert.match(readerSource, /ref=\{bibleHeaderRef\} id="tut-bible-header"/);
assert.equal((readerSource.match(/id="tut-read-btn"/g) || []).length, 2);
assert.match(userBibleActionsSource, /const nextCompletionSummary = \{\s*uid,\s*requestId: response\.requestId,\s*completedDay:/);
assert.match(userBibleActionsSource, /Number\(requestedDay\) !== Number\(currentProgressDay\)[\s\S]*return;[\s\S]*readSubmittingRef\.current = true/);
assert.doesNotMatch(readerSource, /선택 활동 · 퀴즈를 풀지 않아도/);
assert.doesNotMatch(quizCardSource, /선택 퀴즈예요|풀지 않아도 읽기 완료/);
assert.doesNotMatch(readerSource, /isQuizGateLocked|quizGateOpen/);
assert.match(readerSource, /disabled=\{readSubmitting \|\| !isCurrentProgressDay\}/);
assert.match(readerSource, /aria-label=\{`이전 본문 DAY/);
assert.match(readerSource, /aria-label=\{`다음 본문 DAY/);
assert.match(readerSource, /내 진도 DAY \{currentUser\.currentDay\}로 돌아가기/);
assert.match(readerSource, /본문 다시 불러오기/);
const bibleReaderPosition = dashboardSource.indexOf('<BibleReader');
const announcementPosition = dashboardSource.indexOf('<AnnouncementBanner');
const dailyVideoPosition = dashboardSource.indexOf('<DailyVideoCard');
assert.ok(bibleReaderPosition > -1, '대시보드에 성경 본문이 있어야 합니다.');
assert.ok(
    bibleReaderPosition < announcementPosition && bibleReaderPosition < dailyVideoPosition,
    '별도 바로가기 버튼 없이도 성경 본문이 공지와 영상보다 먼저 보여야 합니다.',
);
assert.doesNotMatch(dashboardSource, /오늘 말씀 DAY \{currentDay\} 바로가기/);
assert.match(tutorialSource, /id: 'tut-quiz-area'[\s\S]*title: '오늘의 퀴즈 \(선택\)'/);
assert.match(tutorialSource, /퀴즈를 풀거나 건너뛰지 않아도 읽기 완료와 다음 DAY 진행은 언제든 가능합니다/);

const completedRead = {
    uid: 'user-1',
    requestId: 'read-request-1',
    scoreEarned: 10,
    isFirstReadToday: true,
};
assert.equal(shouldScrollToReadingHeader(
    { uid: 'user-1', summary: null },
    { uid: 'user-1', summary: completedRead },
), true, '읽기 완료가 확정되면 다음 본문 헤더로 이동해야 합니다.');
assert.equal(shouldScrollToReadingHeader(
    { uid: 'user-1', summary: completedRead },
    { uid: 'user-1', summary: completedRead },
), false, '같은 완료 결과를 다시 렌더링할 때는 반복 이동하지 않아야 합니다.');
assert.equal(shouldScrollToReadingHeader(
    { uid: 'user-1', summary: null },
    { uid: 'user-2', summary: { ...completedRead, uid: 'user-2' } },
), false, '계정 전환은 읽기 완료 이동으로 취급하지 않아야 합니다.');

assert.equal(shouldScrollToReadingHeader(
    { uid: 'user-1', summary: completedRead },
    { uid: 'user-1', summary: { ...completedRead } },
), false, '같은 requestId의 replay는 반복 이동하지 않아야 합니다.');

let scrollOptions = null;
const element = {
    scrollIntoView: options => { scrollOptions = options; },
};
const reducedMotionWindow = {
    matchMedia: () => ({ matches: true }),
};

assert.equal(scrollElementIntoView(element, {
    block: 'center',
    windowObject: reducedMotionWindow,
}), true);
assert.deepEqual(scrollOptions, { behavior: 'auto', block: 'center' }, '움직임 감소 설정을 존중해야 합니다.');

let scheduledFrame = null;
const scheduledFrames = [];
let scheduledScrolls = 0;
const scheduledWindow = {
    matchMedia: () => ({ matches: false }),
    requestAnimationFrame: callback => {
        scheduledFrame = callback;
        scheduledFrames.push(callback);
        return 17;
    },
    cancelAnimationFrame: () => {},
};

scheduleScrollIntoView(() => ({
    scrollIntoView: options => {
        scheduledScrolls += 1;
        assert.deepEqual(options, { behavior: 'smooth', block: 'start' });
    },
}), { windowObject: scheduledWindow });
assert.equal(scheduledScrolls, 0, '렌더가 반영되기 전에 이동하지 않아야 합니다.');
scheduledFrame();
assert.equal(scheduledScrolls, 1, '다음 렌더 프레임에서 이동해야 합니다.');

scheduledScrolls = 0;
scheduledFrames.length = 0;
scheduleScrollIntoView(() => ({
    scrollIntoView: () => { scheduledScrolls += 1; },
}), { frameCount: 2, windowObject: scheduledWindow });
assert.equal(scheduledFrames.length, 1);
scheduledFrames[0]();
assert.equal(scheduledScrolls, 0, '퀴즈 카드가 접히는 첫 프레임에는 이동하지 않아야 합니다.');
assert.equal(scheduledFrames.length, 2);
scheduledFrames[1]();
assert.equal(scheduledScrolls, 1, '레이아웃이 안정된 두 번째 프레임에 이동해야 합니다.');

let staleFrame = null;
scheduleScrollIntoView(() => element, {
    isStillCurrent: () => false,
    windowObject: {
        ...scheduledWindow,
        requestAnimationFrame: callback => {
            staleFrame = callback;
            return 18;
        },
    },
});
scrollOptions = null;
staleFrame();
assert.equal(scrollOptions, null, '계정·본문 전환 후의 오래된 이동 예약은 무시해야 합니다.');

console.log('읽기 흐름 자동 이동 검증 통과');
