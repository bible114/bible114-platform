export const getQuizProgressKey = (readCount = 1, day = 1, readingEpoch = 0) => {
    const cycle = Number.isSafeInteger(Number(readCount)) && Number(readCount) >= 1
        ? Number(readCount)
        : 1;
    const normalizedDay = Number.isSafeInteger(Number(day)) && Number(day) >= 1
        ? Number(day)
        : 1;
    const epoch = Number.isSafeInteger(Number(readingEpoch)) && Number(readingEpoch) >= 0
        ? Number(readingEpoch)
        : 0;
    const legacyKey = `r${cycle}_d${normalizedDay}`;
    return epoch === 0 ? legacyKey : `e${epoch}_${legacyKey}`;
};

export const userAllowsQuizProgressKey = (user, progressKey, calendarDate) => {
    if (!user?.uid || typeof progressKey !== 'string') return false;
    const cycle = Number.isSafeInteger(Number(user.readCount)) && Number(user.readCount) >= 1
        ? Number(user.readCount)
        : 1;
    const day = Number.isSafeInteger(Number(user.currentDay)) && Number(user.currentDay) >= 1
        ? Number(user.currentDay)
        : 1;
    const epoch = Number.isSafeInteger(Number(user.readingEpoch)) && Number(user.readingEpoch) >= 0
        ? Number(user.readingEpoch)
        : 0;
    if (getQuizProgressKey(cycle, day, epoch) === progressKey) return true;
    if (!calendarDate || user.lastReadDate !== calendarDate) return false;

    const completedCycle = day === 1 ? cycle - 1 : cycle;
    const completedDay = day === 1 ? 365 : day - 1;
    return completedCycle >= 1
        && getQuizProgressKey(completedCycle, completedDay, epoch) === progressKey;
};

export const getDefaultQuizLevel = (user) => {
    if (user?.planId === 'nt_easy') return 'easy';
    if (user?.videoMode === 'kids' || user?.videoType === 'kids') return 'easy';
    if (['elementary', 'kinder'].includes(user?.departmentId)) return 'easy';
    return 'standard';
};

export const getQuizLevel = (user) => (
    ['standard', 'easy'].includes(user?.quizLevel)
        ? user.quizLevel
        : getDefaultQuizLevel(user)
);

export const getQuizConfigurationKey = user => JSON.stringify({
    dayOffset: Number.isSafeInteger(Number(user?.dayOffset)) ? Number(user.dayOffset) : 0,
    planId: user?.planId || '1year_revised',
    quizLevel: getQuizLevel(user),
});

export const getQuizRewardForAnswer = ({
    attempts,
    isCorrect,
    rewardDate,
    todayKey,
    legacyRewardedToday = false,
}) => {
    if (!isCorrect || rewardDate === todayKey || legacyRewardedToday) return 0;
    if (attempts === 1) return 10;
    if (attempts === 2) return 5;
    return 0;
};
