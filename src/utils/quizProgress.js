export const getQuizProgressKey = (readCount = 1, day = 1) => (
    `r${Math.max(1, Number(readCount) || 1)}_d${Math.max(1, Number(day) || 1)}`
);

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
