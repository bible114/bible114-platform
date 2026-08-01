export const MEMO_STORAGE_VERSION = 2;
export const MEMO_BUCKET_COLLECTION = 'memoBuckets';
export const MAX_MEMO_TEXT_CHARS = 5000;
export const MAX_MEMO_DAY_CHARS = 20000;

const validYear = value => Number.isSafeInteger(value) && value >= 2000 && value <= 2200;
const validMonth = value => Number.isSafeInteger(value) && value >= 1 && value <= 12;
const validDayOfMonth = value => Number.isSafeInteger(value) && value >= 1 && value <= 31;

export const memoDateParts = (value, fallbackDate = new Date()) => {
    const parsed = value ? new Date(value) : fallbackDate;
    if (!(parsed instanceof Date) || Number.isNaN(parsed.getTime())) {
        return { year: null, month: null };
    }
    return {
        year: parsed.getFullYear(),
        month: parsed.getMonth() + 1,
        day: parsed.getDate(),
    };
};

export const memoBucketId = (year, month, day = 1) => (
    validYear(year) && validMonth(month) && validDayOfMonth(day)
        ? `${year}_${String(month).padStart(2, '0')}_${Math.ceil(day / 7)}`
        : 'legacy_undated'
);

export const normalizeMemoRecord = (memo, fallback = {}) => {
    const texts = Array.isArray(memo?.texts)
        ? memo.texts.filter(text => typeof text === 'string' && text.trim())
        : (typeof memo?.text === 'string' && memo.text.trim() ? [memo.text] : []);
    return {
        texts,
        date: typeof memo?.date === 'string' ? memo.date : (fallback.date || null),
        title: typeof memo?.title === 'string' ? memo.title : '',
        round: Number.isSafeInteger(memo?.round) ? memo.round : (fallback.round || 1),
        day: Number.isSafeInteger(memo?.day) ? memo.day : (fallback.day || 0),
    };
};

export const groupMemosByCalendarBucket = (memos) => {
    const buckets = {};
    Object.entries(memos || {}).forEach(([key, memo]) => {
        const normalized = normalizeMemoRecord(memo);
        if (normalized.texts.length === 0) return;
        const { year, month, day } = memoDateParts(normalized.date, null);
        const bucketId = memoBucketId(year, month, day);
        if (!buckets[bucketId]) {
            buckets[bucketId] = { year, month, shard: Math.ceil(day / 7), entries: {} };
        }
        normalized.texts.forEach((text, index) => {
            const entryKey = normalized.texts.length === 1 ? key : `${key}__${index + 1}`;
            buckets[bucketId].entries[entryKey] = {
                ...normalized,
                texts: [text],
            };
        });
    });
    return buckets;
};

export const expandMemoEntries = (entries) => {
    const expanded = {};
    Object.entries(entries || {}).forEach(([key, memo]) => {
        const normalized = normalizeMemoRecord(memo);
        normalized.texts.forEach((text, index) => {
            const entryKey = normalized.texts.length === 1 ? key : `${key}__${index + 1}`;
            expanded[entryKey] = {
                ...normalized,
                texts: [text],
            };
        });
    });
    return expanded;
};

export const flattenMemoBuckets = (snapshot) => {
    const memos = {};
    snapshot?.docs?.forEach(doc => {
        const entries = doc.data()?.entries;
        if (!entries || typeof entries !== 'object' || Array.isArray(entries)) return;
        Object.assign(memos, expandMemoEntries(entries));
    });
    return memos;
};

export const memoYearsBefore = (memos, currentYear = new Date().getFullYear()) => (
    Array.from(new Set(Object.values(memos || {}).flatMap(memo => {
        const { year } = memoDateParts(memo?.date, null);
        return validYear(year) && year < currentYear ? [year] : [];
    }))).sort((left, right) => left - right)
);

export const filterMemosByYear = (memos, year) => Object.fromEntries(
    Object.entries(memos || {}).filter(([, memo]) => memoDateParts(memo?.date, null).year === year),
);

export const totalMemoCharacters = texts => (
    (Array.isArray(texts) ? texts : []).reduce((total, text) => total + String(text || '').length, 0)
);
