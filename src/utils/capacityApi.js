import {
    callPlatformApi,
    createRequestId,
    PlatformApiError,
} from './platformApi.js';

const COMMUNITY_PROGRESS_RESPONSE_KEYS = new Set([
    'ok', 'action', 'requestId', 'members', 'rebuilt',
]);
const COMMUNITY_PROGRESS_MEMBER_KEYS = new Set([
    'uid', 'name', 'currentDay', 'readCount', 'readingYear', 'yearCompletedRounds',
    'lifetimeCompletedRounds', 'score', 'streak', 'lastReadDate', 'recentReadDates',
    'weeklyReadKey', 'weeklyReadCount', 'departmentId', 'departmentName',
    'subgroupId', 'subgroupName', 'extraMemberships',
]);
const COMMUNITY_PROGRESS_MEMBERSHIP_KEYS = new Set([
    'departmentId', 'departmentName', 'subgroupId', 'subgroupName',
]);
const READING_CALENDAR_RESPONSE_KEYS = new Set([
    'ok', 'action', 'requestId', 'year', 'dates', 'readDays',
]);
const LEGACY_CALENDAR_DATE_PATTERN =
    /^(Sun|Mon|Tue|Wed|Thu|Fri|Sat) (Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec) (0[1-9]|[12]\d|3[01]) (\d{4})$/;

const isRecord = value => Boolean(value) && typeof value === 'object' && !Array.isArray(value);
const hasExactKeys = (value, expectedKeys) => (
    isRecord(value)
    && Object.keys(value).length === expectedKeys.size
    && Object.keys(value).every(key => expectedKeys.has(key))
);
const isSafeIntegerInRange = (value, minimum, maximum) => (
    Number.isSafeInteger(value) && value >= minimum && value <= maximum
);
const isValidCanonicalId = value => (
    typeof value === 'string'
    && value.length >= 1 && value.length <= 128
    && value === value.trim()
    && value !== '.' && value !== '..'
    && !value.includes('/')
    && !/[\u0000-\u001f\u007f]/.test(value)
);
const isNullableSafeText = value => (
    value === null
    || (typeof value === 'string' && value.length <= 120
        && value === value.trim() && !/[\u0000-\u001f\u007f]/.test(value))
);
const isValidIsoDate = value => {
    if (typeof value !== 'string'
        || !/^\d{4}-(?:0[1-9]|1[0-2])-(?:0[1-9]|[12]\d|3[01])$/.test(value)) return false;
    const parsed = new Date(`${value}T00:00:00Z`);
    return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
};
const isValidLegacyDate = value => {
    const match = typeof value === 'string' ? LEGACY_CALENDAR_DATE_PATTERN.exec(value) : null;
    if (!match) return false;
    const weekdays = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const month = months.indexOf(match[2]);
    const day = Number(match[3]);
    const year = Number(match[4]);
    const parsed = new Date(Date.UTC(year, month, day));
    return parsed.getUTCFullYear() === year
        && parsed.getUTCMonth() === month
        && parsed.getUTCDate() === day
        && weekdays[parsed.getUTCDay()] === match[1];
};
const isValidStoredDate = value => isValidIsoDate(value) || isValidLegacyDate(value);
const invalidResponse = message => new PlatformApiError(message, {
    code: 'INVALID_RESPONSE', status: 200, retryable: true,
});

const normalizeCommunityProgressMember = value => {
    if (!hasExactKeys(value, COMMUNITY_PROGRESS_MEMBER_KEYS)
        || !isValidCanonicalId(value.uid)
        || typeof value.name !== 'string' || !value.name || value.name.length > 120
        || !isSafeIntegerInRange(value.currentDay, 1, 365)
        || !isSafeIntegerInRange(value.readCount, 1, Number.MAX_SAFE_INTEGER)
        || !(value.readingYear === null || isSafeIntegerInRange(value.readingYear, 2000, 2200))
        || !(value.yearCompletedRounds === null
            || isSafeIntegerInRange(value.yearCompletedRounds, 0, Number.MAX_SAFE_INTEGER))
        || !(value.lifetimeCompletedRounds === null
            || isSafeIntegerInRange(value.lifetimeCompletedRounds, 0, Number.MAX_SAFE_INTEGER))
        || !isSafeIntegerInRange(value.score, 0, Number.MAX_SAFE_INTEGER)
        || !isSafeIntegerInRange(value.streak, 0, Number.MAX_SAFE_INTEGER)
        || !isNullableSafeText(value.lastReadDate)
        || !Array.isArray(value.recentReadDates) || value.recentReadDates.length > 14
        || value.recentReadDates.some(date => !isValidStoredDate(date))
        || !isNullableSafeText(value.weeklyReadKey)
        || !isSafeIntegerInRange(value.weeklyReadCount, 0, Number.MAX_SAFE_INTEGER)
        || !isNullableSafeText(value.departmentId)
        || !isNullableSafeText(value.departmentName)
        || !isNullableSafeText(value.subgroupId)
        || !isNullableSafeText(value.subgroupName)
        || !Array.isArray(value.extraMemberships) || value.extraMemberships.length > 3
        || value.extraMemberships.some(entry => (
            !hasExactKeys(entry, COMMUNITY_PROGRESS_MEMBERSHIP_KEYS)
            || !isValidCanonicalId(entry.departmentId)
            || !isNullableSafeText(entry.departmentName)
            || !isNullableSafeText(entry.subgroupId)
            || !isNullableSafeText(entry.subgroupName)
        ))) {
        throw invalidResponse('공동체 진행판 결과를 안전하게 확인하지 못했습니다.');
    }
    return {
        ...value,
        recentReadDates: [...value.recentReadDates],
        extraMemberships: value.extraMemberships.map(entry => ({ ...entry })),
    };
};

export const getCommunityProgress = (orgId, options = {}) => {
    if (!isValidCanonicalId(orgId)) {
        throw new PlatformApiError('공동체 정보가 올바르지 않습니다.', {
            code: 'INVALID_PAYLOAD', status: 0, retryable: false,
        });
    }
    const requestId = options.requestId || createRequestId();
    return callPlatformApi('getCommunityProgress', { orgId }, { ...options, requestId })
        .then(result => {
            if (!hasExactKeys(result, COMMUNITY_PROGRESS_RESPONSE_KEYS)
                || result.ok !== true || result.action !== 'getCommunityProgress'
                || result.requestId !== requestId || typeof result.rebuilt !== 'boolean'
                || !Array.isArray(result.members) || result.members.length > 5_000) {
                throw invalidResponse('공동체 진행판 결과를 안전하게 확인하지 못했습니다.');
            }
            const members = result.members.map(normalizeCommunityProgressMember);
            if (new Set(members.map(member => member.uid)).size !== members.length) {
                throw invalidResponse('공동체 진행판에 중복 사용자가 있습니다.');
            }
            return { ...result, members };
        });
};

export const getReadingCalendar = (year, options = {}) => {
    if (!isSafeIntegerInRange(year, 2000, 2200)) {
        throw new PlatformApiError('읽기 달력 연도가 올바르지 않습니다.', {
            code: 'INVALID_PAYLOAD', status: 0, retryable: false,
        });
    }
    const requestId = options.requestId || createRequestId();
    return callPlatformApi('getReadingCalendar', { year }, { ...options, requestId })
        .then(result => {
            if (!hasExactKeys(result, READING_CALENDAR_RESPONSE_KEYS)
                || result.ok !== true || result.action !== 'getReadingCalendar'
                || result.requestId !== requestId || result.year !== year
                || !Array.isArray(result.dates) || result.dates.length > 366
                || result.dates.some(date => !isValidIsoDate(date) || !date.startsWith(`${year}-`))
                || new Set(result.dates).size !== result.dates.length
                || result.readDays !== result.dates.length) {
                throw invalidResponse('읽기 달력 결과를 안전하게 확인하지 못했습니다.');
            }
            return { ...result, dates: [...result.dates] };
        });
};
