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
const guestReaderSource = readSource('src/components/GuestReaderView.jsx');
const bibleContentSource = readSource('src/hooks/useBibleContent.js');
const appSource = readSource('src/App.jsx');
const communityMembershipSource = readSource('src/components/dashboard/CommunityMembershipCard.jsx');

assert.doesNotMatch(dashboardSource, /pendingQuizTerminalRef|onQuizTerminal=|readActionRef/);
assert.doesNotMatch(dashboardSource, /quizGate|setQuizGate|onQuizGateLocked/);
assert.doesNotMatch(quizCardSource, /onQuizTerminal|outcome: 'solved'|outcome: 'attemptsExhausted'/);
assert.match(readerSource, /ref=\{bibleHeaderRef\} id="tut-bible-header"/);
assert.equal((readerSource.match(/id="tut-read-btn"/g) || []).length, 2);
assert.match(userBibleActionsSource, /const nextCompletionSummary = \{\s*uid,\s*requestId: response\.requestId,\s*completedDay:/);
assert.match(userBibleActionsSource, /Number\(requestedDay\) !== Number\(currentProgressDay\)[\s\S]*return;[\s\S]*readSubmittingRef\.current = true/);
assert.doesNotMatch(dashboardSource, /currentScrollContextRef|quizScrollContextKey/);
assert.match(
    dashboardSource,
    /observedReadingPositionRef[\s\S]*const moved = previous\.uid === next\.uid[\s\S]*Number\(viewingDay\) !== Number\(next\.day\)[\s\S]*behavior: 'auto'[\s\S]*frameCount: 2/,
);
assert.match(
    userBibleActionsSource,
    /releaseReadSubmission\(submissionToken\)[\s\S]*const summary = response\.result\.summary/,
    '핵심 저장 확인 후에는 업적 후처리보다 먼저 다음 본문 읽기를 열어야 합니다.',
);
assert.match(
    userBibleActionsSource,
    /readSubmissionTokenRef\.current !== submissionToken[\s\S]*readSubmittingRef\.current = false/,
    '이전 후처리가 새 읽기 요청의 버튼 잠금을 풀면 안 됩니다.',
);
assert.doesNotMatch(readerSource, /선택 활동 · 퀴즈를 풀지 않아도/);
assert.doesNotMatch(quizCardSource, /선택 퀴즈예요|풀지 않아도 읽기 완료/);
assert.doesNotMatch(readerSource, /isQuizGateLocked|quizGateOpen/);
assert.match(readerSource, /disabled=\{readSubmitting \|\| !isCurrentProgressDay\}/);
assert.match(readerSource, /aria-label=\{`이전 본문 DAY/);
assert.match(readerSource, /aria-label=\{`다음 본문 DAY/);
assert.match(readerSource, /Math\.min\(totalPlanDays, prev \+ 1\)/);
assert.match(readerSource, /disabled=\{viewingDay >= totalPlanDays\}/);
assert.match(readerSource, /grid-cols-\[44px_minmax\(0,1fr\)_44px\]/);
assert.match(readerSource, /mt-3 flex flex-wrap items-center justify-center gap-2/);
assert.match(readerSource, /내 진도 DAY \{currentUser\.currentDay\}로 돌아가기/);
assert.match(readerSource, /본문 다시 불러오기/);
assert.match(readerSource, /const handleAdvanceRead = \(\) => \{[\s\S]*scheduleScrollIntoView\(\(\) => bibleHeaderRef\?\.current,[\s\S]*behavior: 'auto'[\s\S]*return handleRead\(\)/);
assert.match(readerSource, /한 장 더 읽기[\s\S]*onClick=\{handleAdvanceRead\}/);
assert.match(readerSource, /onClick=\{isAdvanceRead \? handleAdvanceRead : handleRead\}/);
assert.match(
    guestReaderSource,
    /const bibleHeaderRef = useRef\(null\)[\s\S]*scheduleScrollIntoView\(\(\) => bibleHeaderRef\.current,[\s\S]*frameCount: 2/,
);
assert.match(
    guestReaderSource,
    /useLayoutEffect\(\(\) => \{[\s\S]*scrollRestoration = 'manual'[\s\S]*requestAnimationFrame\(\(\) => \{[\s\S]*requestAnimationFrame\(resetGuestEntry\)/,
    '게스트 진입은 브라우저의 지연 스크롤 복원 뒤에도 두 프레임에 걸쳐 상단을 확정해야 합니다.',
);
assert.match(
    guestReaderSource,
    /pageHeadingRef\.current\?\.focus\(\{ preventScroll: true \}\)[\s\S]*scrollRestoration = previousScrollRestoration/,
    '게스트 상단 제목으로 접근성 초점을 옮기고 종료 시 브라우저 복원 설정을 되돌려야 합니다.',
);
assert.match(
    guestReaderSource,
    /<h1 ref=\{pageHeadingRef\} tabIndex=\{-1\} className="sr-only">성경통독 114 게스트 읽기<\/h1>/,
    '게스트 화면에는 상단 진입을 알리는 전용 제목이 있어야 합니다.',
);
assert.match(guestReaderSource, /totalPlanDays=\{totalPlanDays\}[\s\S]*bibleHeaderRef=\{bibleHeaderRef\}/);
assert.match(
    guestReaderSource,
    /const totalDays = getPlanTotalDays\(newPlanId\)[\s\S]*\(\(previousDay - 1\) % totalDays\) \+ 1/,
);
assert.match(
    appSource,
    /const totalDays = getPlanTotalDays\(fullPlanId\)[\s\S]*\(\(previousDay - 1\) % totalDays\) \+ 1[\s\S]*currentDay: normalizedDay/,
);
assert.match(
    appSource,
    /tempUser\.accountType === 'personal'[\s\S]*get\(\{ source: 'server' \}\)[\s\S]*canonicalDay = \(\(canonicalPreviousDay - 1\) % totalDays\) \+ 1[\s\S]*planId: fullPlanId,[\s\S]*currentDay: canonicalDay/,
    '개인 신규 온보딩은 공동체 roster 생성 전에 서버 users 플랜과 진도를 정규화해야 합니다.',
);
assert.match(
    appSource,
    /loadCanonicalUserStateFromServer\(requestUid\)[\s\S]*canonicalUser\.planId !== expectedPlanId[\s\S]*canonicalUser\.currentDay !== expectedDay/,
    '개인 온보딩 완료는 users와 roster의 canonical server snapshot을 확인해야 합니다.',
);
assert.doesNotMatch(
    communityMembershipSource,
    /onboarding && onJoinComplete[\s\S]{0,800}collection\('users'\).*planId/,
    '공동체 참여 뒤 늦은 브라우저 plan 쓰기로 users와 roster를 어긋나게 하면 안 됩니다.',
);
assert.match(
    bibleContentSource,
    /const contentRequestRef = useRef\(0\)[\s\S]*const requestId = \+\+contentRequestRef\.current[\s\S]*contentRequestRef\.current !== requestId/,
);
const bibleReaderPosition = dashboardSource.indexOf('<BibleReader');
const raceMapPosition = dashboardSource.indexOf('<RaceMap');
const announcementPosition = dashboardSource.indexOf('<AnnouncementBanner');
const dailyVideoPosition = dashboardSource.indexOf('<DailyVideoCard');
assert.ok(bibleReaderPosition > -1, '대시보드에 성경 본문이 있어야 합니다.');
assert.ok(
    raceMapPosition < dailyVideoPosition
        && dailyVideoPosition < announcementPosition
        && announcementPosition < bibleReaderPosition,
    '천로역정 레이스 다음에 매일성경 영상, 교회 광고, 성경 본문 순서로 보여야 합니다.',
);
assert.match(dashboardSource, /quizContent=\{\([\s\S]*BibleQuizCard[\s\S]*belowQuizContent=\{hasCommunity && talentMarketVisible \? \([\s\S]*TalentShop/);
assert.doesNotMatch(dashboardSource, /오늘 말씀 DAY \{currentDay\} 바로가기/);
assert.match(quizCardSource, /DAY \{progressDay\} 성경퀴즈[\s\S]*QuizLevelToggle/);
assert.doesNotMatch(quizCardSource, /scrollIntoView|keepQuizCardInView/,
    '퀴즈 정답 확인은 사용자가 누른 위치에서 화면을 강제로 이동시키면 안 됩니다.');
assert.match(tutorialSource, /id: 'tut-quiz-area'[\s\S]*title: '오늘의 퀴즈 \(선택\)'/);
assert.match(tutorialSource, /퀴즈를 풀거나 건너뛰지 않아도 읽기 완료와 다음 DAY 진행은 언제든 가능합니다/);
assert.match(
    quizCardSource,
    /const prepareNextQuiz[\s\S]*buildDayQuiz\(currentUser, progressDay \+ 1\)[\s\S]*requestIdleCallback\(prepareNextQuiz/,
    '다음 DAY 퀴즈는 현재 본문을 읽는 동안 미리 준비해야 합니다.',
);
assert.match(
    quizCardSource,
    /QUIZ_LOAD_TIMEOUT_MS[\s\S]*withAsyncTimeout\([\s\S]*quiz load timed out/,
    '퀴즈 로딩은 느린 네트워크에서도 영구 대기하지 않도록 시간 제한이 있어야 합니다.',
);
assert.match(
    quizCardSource,
    /finally \{\s*setSubmitting\(false\);\s*\}/,
    '퀴즈 저장 실패 뒤에도 제출 버튼 잠금을 반드시 해제해야 합니다.',
);

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

assert.equal(scrollElementIntoView(element, {
    block: 'start',
    behavior: 'auto',
    windowObject: { matchMedia: () => ({ matches: false }) },
}), true);
assert.deepEqual(scrollOptions, { behavior: 'auto', block: 'start' }, '한 장 더 읽기는 긴 화면을 애니메이션 없이 즉시 이동해야 합니다.');

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
assert.equal(scheduledScrolls, 0, '첫 렌더 프레임에는 아직 이동하지 않아야 합니다.');
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
