const GUEST_STORAGE_KEY = 'b114_guest_v1';

const DEFAULT_GUEST_STATE = {
    planId: '1year_revised',
    currentDay: 1,
    streak: 0,
    lastReadDate: null,
    readDates: [],
    videoType: 'adult',
    migratedAt: null,
};

const normalizeGuestState = (raw) => ({
    ...DEFAULT_GUEST_STATE,
    ...(raw && typeof raw === 'object' ? raw : {}),
    currentDay: Math.min(365, Math.max(1, parseInt(raw?.currentDay, 10) || 1)),
    streak: Math.max(0, parseInt(raw?.streak, 10) || 0),
    readDates: Array.isArray(raw?.readDates) ? raw.readDates.slice(-400) : [],
    videoType: raw?.videoType === 'kids' ? 'kids' : 'adult',
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

export const getGuestState = () => normalizeGuestState(readRawGuestState());

export const saveGuestState = (partial) => {
    const next = normalizeGuestState({
        ...getGuestState(),
        ...(partial && typeof partial === 'object' ? partial : {}),
    });
    writeGuestState(next);
    return next;
};

export const recordGuestRead = () => {
    const today = new Date().toDateString();
    const current = getGuestState();
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

    return saveGuestState({
        currentDay: current.currentDay >= 365 ? 1 : current.currentDay + 1,
        streak,
        lastReadDate: today,
        readDates,
    });
};

export const clearGuestMigrated = () => saveGuestState({ migratedAt: null });
