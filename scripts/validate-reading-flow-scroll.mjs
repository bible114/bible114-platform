import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
    getQuizTerminalSignalToken,
    scheduleScrollIntoView,
    scrollElementIntoView,
    shouldScrollToReadAction,
    shouldScrollToReadingHeader,
} from '../src/utils/readingFlowScroll.js';

const readSource = path => fs.readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const dashboardSource = readSource('src/components/DashboardView.jsx');
const quizCardSource = readSource('src/components/dashboard/BibleQuizCard.jsx');
const readerSource = readSource('src/components/dashboard/BibleReader.jsx');
const userBibleActionsSource = readSource('src/hooks/useUserBibleActions.js');

assert.match(dashboardSource, /pendingQuizTerminalRef/);
assert.match(dashboardSource, /quizGate\.gateOpen/);
assert.match(dashboardSource, /frameCount: 2/);
assert.match(dashboardSource, /onQuizTerminal=\{handleQuizTerminal\}/);
assert.match(
    dashboardSource,
    /const expectedContextKey = currentScrollContextRef\.current;[\s\S]*currentUserUidRef\.current === expectedUid[\s\S]*currentScrollContextRef\.current === expectedContextKey/,
    '읽기 완료 뒤 예약된 이동도 같은 UID뿐 아니라 같은 읽기 문맥에 결속해야 합니다.',
);
assert.equal((quizCardSource.match(/onQuizTerminal\?\.\(/g) || []).length, 3,
    '서버 원본으로 확정한 정답·2회 소진·건너뛰기 경로만 종료 신호를 보내야 합니다.');
assert.match(quizCardSource, /outcome: 'solved'/);
assert.match(quizCardSource, /outcome: freshProgress\.skipped \? 'skipped' : 'attemptsExhausted'/);
assert.match(readerSource, /ref=\{bibleHeaderRef\} id="tut-bible-header"/);
assert.equal((readerSource.match(/ref=\{readActionRef\} id="tut-read-btn"/g) || []).length, 2);
assert.match(userBibleActionsSource, /setCompletionSummary\(\{\s*uid,\s*requestId: response\.requestId,/);

const terminalSignal = {
    uid: 'user-1',
    progressKey: 'epoch0-cycle1-day7',
    requestId: 'request-1',
    outcome: 'solved',
};
const pendingTerminal = {
    ...terminalSignal,
    token: getQuizTerminalSignalToken(terminalSignal),
    contextKey: 'user-1:nt:1:7',
};
const openGate = {
    uid: 'user-1',
    contextKey: 'user-1:nt:1:7',
    hasQuestion: true,
    gateOpen: true,
};

assert.equal(shouldScrollToReadAction(pendingTerminal, openGate), true,
    '현재 클릭이 종료 상태로 확정되고 gate가 열리면 읽기 버튼으로 이동해야 합니다.');

assert.equal(shouldScrollToReadAction(null, {
    ...openGate,
}), false, '이미 완료한 퀴즈로 첫 렌더링할 때는 자동 이동하지 않아야 합니다.');

assert.equal(shouldScrollToReadAction(pendingTerminal, {
    ...openGate,
    uid: 'user-2',
    contextKey: 'user-2:nt:1:7',
}), false, '계정이 바뀐 뒤 도착한 이전 퀴즈 결과로는 이동하지 않아야 합니다.');

assert.equal(shouldScrollToReadAction(pendingTerminal, {
    ...openGate,
    hasQuestion: false,
}), false, '문항이 없어 gate가 열린 경우는 퀴즈 완료 이동으로 취급하지 않아야 합니다.');

assert.equal(shouldScrollToReadAction(pendingTerminal, {
    ...openGate,
    gateOpen: false,
}), false, '종료 신호가 먼저 도착해도 gate가 열릴 때까지 기다려야 합니다.');

assert.equal(getQuizTerminalSignalToken({
    ...terminalSignal,
    outcome: 'retry',
}), null, '첫 오답은 종료 신호가 아닙니다.');

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
