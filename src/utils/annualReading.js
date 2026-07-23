const KST_OFFSET_MS = 9 * 60 * 60 * 1000;

export const getCalendarYearKst = (now = Date.now()) => (
    new Date(Number(now) + KST_OFFSET_MS).getUTCFullYear()
);

const nonNegativeInteger = (value, fallback = 0) => (
    Number.isSafeInteger(value) && value >= 0 ? value : fallback
);

export const getLifetimeCompletedRounds = user => Math.max(
    nonNegativeInteger(user?.lifetimeCompletedRounds),
    nonNegativeInteger(user?.yearCompletedRounds),
    Math.max(0, nonNegativeInteger(user?.readCount, 1) - 1),
);

export const getYearCompletedRounds = (user, year = getCalendarYearKst()) => {
    if (Number.isSafeInteger(user?.readingYear)) {
        return user.readingYear === year
            ? nonNegativeInteger(user?.yearCompletedRounds)
            : 0;
    }
    return Math.max(0, nonNegativeInteger(user?.readCount, 1) - 1);
};

export const needsAnnualReadingSync = (user, year = getCalendarYearKst()) => (
    !Number.isSafeInteger(user?.readingYear)
    || user.readingYear !== year
    || !Number.isSafeInteger(user?.yearCompletedRounds)
    || user.yearCompletedRounds < 0
    || !Number.isSafeInteger(user?.lifetimeCompletedRounds)
    || user.lifetimeCompletedRounds < 0
);
