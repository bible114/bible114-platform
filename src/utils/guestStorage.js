import { dateToOffset } from './helpers';

const GUEST_STORAGE_KEY = 'b114_guest_v1';

// 오늘 날짜에 해당하는 통독 Day (1월 1일 = Day 1, 12월 31일 = Day 365).
// 게스트 "로그인 없이 오늘 말씀 먼저 읽어보기"는 개인 진도가 없으므로
// 교회 통독처럼 날짜에 맞는 본문을 보여준다.
const getTodayPlanDay = () => {
    const now = new Date();
    return Math.min(365, dateToOffset(now.getMonth() + 1, now.getDate()) + 1);
};

const DEFAULT_GUEST_STATE = {
    planId: '1year_revised',
    currentDay: 1,
    streak: 0,
    lastReadDate: null,
    readDates: [],
    videoType: 'adult',
    quizLevel: null,
    migratedAt: null,
};

const normalizeGuestState = (raw) => ({
    ...DEFAULT_GUEST_STATE,
    ...(raw && typeof raw === 'object' ? raw : {}),
    currentDay: Math.min(365, Math.max(1, parseInt(raw?.currentDay, 10) || 1)),
    streak: Math.max(0, parseInt(raw?.streak, 10) || 0),
    readDates: Array.isArray(raw?.readDates) ? raw.readDates.slice(-400) : [],
    videoType: raw?.videoType === 'kids' ? 'kids' : 'adult',
    quizLevel: ['standard', 'easy'].includes(raw?.quizLevel) ? raw.quizLevel : null,
});

const readRawGuestState = () => {
    try {
        const raw = localStorage.getItem(GUEST_STORAGE_KEY);
        return raw ? JSON.parse(raw) : null;
    } catch {
        return null;
    }
};

const writeGuestState = (state) => {
    try {
        localStorage.setItem(GUEST_STORAGE_KEY, JSON.stringify(state));
    } catch {
        // localStorage를 사용할 수 없는 환경에서는 메모리 반영 없이 조용히 실패한다.
    }
};

export const getGuestState = () => {
    const state = normalizeGuestState(readRawGuestState());
    // 아직 한 번도 읽기 완료를 하지 않은 게스트는 저장된 진도가 의미 없으므로
    // 방문할 때마다 오늘 날짜의 본문으로 맞춘다. 한 번이라도 읽은 게스트는
    // 자기 진도(마지막 읽은 다음 Day)를 그대로 이어간다.
    if (!state.lastReadDate) state.currentDay = getTodayPlanDay();
    return state;
};

export const saveGuestState = (partial) => {
    const next = normalizeGuestState({
        ...getGuestState(),
        ...(partial && typeof partial === 'object' ? partial : {}),
    });
    writeGuestState(next);
    return next;
};

export const recordGuestRead = (viewingDay) => {
    const today = new Date().toDateString();
    const current = getGuestState();
    const completedDay = Math.min(365, Math.max(1, parseInt(viewingDay, 10) || current.currentDay));

    // 첫 완료 직후 같은 화면에서 이벤트가 다시 들어오면 currentDay는 이미 다음 날을
    // 가리킨다. 이 재호출은 무시하되, 다음 날 화면에서 누르는 "한 장 더 읽기"
    // (completedDay === currentDay)는 정상적으로 진행한다.
    const isRepeatedCompletion = current.lastReadDate === today && (
        current.currentDay === 1
            ? completedDay === 365
            : completedDay < current.currentDay
    );
    if (isRepeatedCompletion) return { ...current, didRecord: false };

    const readDates = current.readDates.includes(today)
        ? current.readDates
        : [...current.readDates, today].slice(-400);

    let streak = 1;
    if (current.lastReadDate) {
        const diffDays = Math.floor(
            (new Date(today) - new Date(current.lastReadDate)) / 86400000
        );
        if (diffDays === 1) streak = current.streak + 1;
        else if (diffDays === 0) streak = current.streak;
    }

    const next = saveGuestState({
        currentDay: current.currentDay >= 365 ? 1 : current.currentDay + 1,
        streak,
        lastReadDate: today,
        readDates,
    });
    return { ...next, didRecord: true };
};
