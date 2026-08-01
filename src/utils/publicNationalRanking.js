export const PUBLIC_NATIONAL_RANKING_LIMIT = 50;
export const PUBLIC_NATIONAL_RANKING_SCHEMA_VERSION = 2;
export const PUBLIC_NATIONAL_RANKING_STATUS = 'published_masked_individual_v2';

const safePositiveInteger = value => (
    Number.isSafeInteger(value) && value >= 1 ? value : null
);

const exactKeys = (value, keys) => (
    value
    && typeof value === 'object'
    && !Array.isArray(value)
    && Object.keys(value).sort().join('\0') === [...keys].sort().join('\0')
);

const isMaskedName = value => {
    const characters = Array.from(String(value || ''));
    return (
        (characters.length === 1 && characters[0] === '＊')
        || (characters.length === 2 && characters[1] === '＊')
        || (characters.length === 3 && characters[1] === '＊')
    );
};

export const formatNationalReadingProgress = ({ readCount, currentDay } = {}) => {
    const normalizedReadCount = safePositiveInteger(readCount);
    const normalizedCurrentDay = safePositiveInteger(currentDay);
    if (!normalizedReadCount || !normalizedCurrentDay || normalizedCurrentDay > 365) return '';

    const completedReadCount = normalizedReadCount - 1;
    return completedReadCount > 0
        ? `${completedReadCount}독 · ${normalizedCurrentDay}일째 읽는 중`
        : `${normalizedCurrentDay}일째 읽는 중`;
};

export const normalizePublicNationalRanking = value => {
    if (!Array.isArray(value) || value.length > PUBLIC_NATIONAL_RANKING_LIMIT) return [];

    const normalized = [];
    for (const [index, entry] of value.entries()) {
        if (!exactKeys(entry, ['rank', 'churchName', 'maskedName', 'readCount', 'currentDay'])) {
            return [];
        }
        const rank = safePositiveInteger(entry.rank);
        const readCount = safePositiveInteger(entry.readCount);
        const currentDay = safePositiveInteger(entry.currentDay);
        const churchName = typeof entry.churchName === 'string' ? entry.churchName.trim() : '';
        const maskedName = typeof entry.maskedName === 'string' ? entry.maskedName.trim() : '';
        if (
            rank !== index + 1
            || !readCount
            || !currentDay
            || currentDay > 365
            || !churchName
            || !isMaskedName(maskedName)
        ) {
            return [];
        }
        normalized.push({ rank, churchName, maskedName, readCount, currentDay });
    }
    return normalized;
};

export const normalizePublicNationalRankingSnapshot = value => {
    if (
        !value
        || value.national_ranking_schema_version !== PUBLIC_NATIONAL_RANKING_SCHEMA_VERSION
        || value.national_ranking_publication_status !== PUBLIC_NATIONAL_RANKING_STATUS
    ) {
        return [];
    }
    return normalizePublicNationalRanking(value.national_ranking);
};
