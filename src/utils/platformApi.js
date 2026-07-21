import { PLATFORM_API_URL } from '../data/constants.js';

const DEFAULT_TIMEOUT_MS = 12_000;
const DAILY_VIDEO_TIMEOUT_MS = 70_000;
const PUBLIC_DIRECTORY_TIMEOUT_MS = 120_000;
const ADMIN_DAILY_VIDEO_PREVIEW_REQUEST_KEYS = new Set(['adultPlaylistId', 'kidsPlaylistId']);
const ADMIN_DAILY_VIDEO_PREVIEW_RESPONSE_KEYS = new Set(['ok', 'action', 'requestId', 'serviceDate', 'previews']);
const ADMIN_DAILY_VIDEO_PREVIEWS_KEYS = new Set(['adult', 'kids']);
const REBUILD_PUBLIC_CHURCHES_REQUEST_KEYS = new Set(['dryRun']);
const REBUILD_PUBLIC_CHURCHES_RESPONSE_KEYS = new Set([
    'ok', 'action', 'requestId', 'dryRun', 'applied', 'mode', 'summary',
]);
const REBUILD_PUBLIC_CHURCHES_SUMMARY_KEYS = new Set([
    'sourceCount', 'expectedCount', 'publicCount', 'legacyCount', 'upsertCount',
    'deleteCount', 'legacyChanged', 'invalidCount',
]);
const ADMIN_SET_CHURCH_VISIBILITY_REQUEST_KEYS = new Set(['churchId', 'hidden']);
const ADMIN_SET_CHURCH_VISIBILITY_RESPONSE_KEYS = new Set([
    'ok', 'action', 'requestId', 'status', 'hidden',
]);
const ADMIN_RENAME_CHURCH_REQUEST_KEYS = new Set(['churchId', 'name']);
const ADMIN_RENAME_CHURCH_RESPONSE_KEYS = new Set([
    'ok', 'action', 'requestId', 'status', 'churchId', 'previousName', 'name',
]);
const ADMIN_CHURCH_LIFECYCLE_REQUEST_KEYS = new Set(['churchId', 'active']);
const ADMIN_CHURCH_LIFECYCLE_RESULT_KEYS = new Set([
    'status', 'churchId', 'active', 'affectedUsers', 'positiveRosterCount',
    'positiveTalentTotal', 'pendingPurchaseCount',
]);
const COMPLETE_CHURCH_ADMIN_SIGNUP_REQUEST_KEYS = new Set([
    'name', 'contactEmail', 'churchName', 'pastorName', 'denomination', 'entryCode',
    'departments', 'password', 'consent',
]);
const COMPLETE_CHURCH_ADMIN_SIGNUP_RESPONSE_KEYS = new Set([
    'ok', 'action', 'requestId', 'status', 'churchId',
]);
const ROTATE_CHURCH_ACCESS_CODE_REQUEST_KEYS = new Set([
    'churchId', 'entryCode', 'expectedVersion',
]);
const ROTATE_CHURCH_ACCESS_CODE_RESPONSE_KEYS = new Set([
    'ok', 'action', 'requestId', 'alreadyCompleted', 'committed', 'result',
]);
const ROTATE_CHURCH_ACCESS_CODE_RESULT_KEYS = new Set([
    'status', 'churchId', 'version',
]);
const ENSURE_UNAFFILIATED_CHURCH_RESPONSE_KEYS = new Set([
    'ok', 'action', 'requestId', 'alreadyCompleted', 'committed', 'result',
]);
const ENSURE_UNAFFILIATED_CHURCH_RESULT_KEYS = new Set(['status', 'churchId']);
const DAILY_VIDEO_PLAYLIST_ID_PATTERN = /^[A-Za-z0-9_-]{1,200}$/;
const RESERVED_PAYLOAD_KEYS = new Set(['action', 'requestId']);
const DAILY_VIDEO_RESPONSE_KEYS = new Set([
    'ok', 'action', 'requestId', 'serviceDate', 'video', 'transient', 'pending', 'retryAfterMs',
]);
const DAILY_VIDEO_PAYLOAD_KEYS = new Set(['adult', 'kids', 'autoFilled']);
const DAILY_VIDEO_ENTRY_KEYS = new Set(['url', 'chapters', 'title', 'publishedAt', 'matchedDate']);
const DAILY_VIDEO_CHAPTER_KEYS = new Set(['label', 'sec']);
const DAILY_VIDEO_CHAPTER_LABELS = new Set(['해설', '성경읽기', '기도']);
const DAILY_VIDEO_YOUTUBE_HOSTS = new Set(['youtube.com', 'www.youtube.com', 'youtu.be', 'www.youtu.be']);
const SUBMIT_QUIZ_REQUEST_KEYS = new Set(['progressKey', 'quizKey', 'selectedIndex', 'attemptSlot']);
const SKIP_QUIZ_REQUEST_KEYS = new Set(['progressKey', 'quizKey']);
const SUBMIT_QUIZ_RESPONSE_KEYS = new Set([
    'ok', 'action', 'requestId', 'calendarDate', 'alreadyCompleted', 'result', 'state',
]);
const SUBMIT_QUIZ_READY_RESULT_KEYS = new Set([
    'status', 'attempts', 'solved', 'skipped', 'isCorrect', 'reward', 'quizKey', 'entry',
    'rewardsUserWallet', 'rewardedRosterOrgIds',
]);
const SUBMIT_QUIZ_DONE_RESULT_KEYS = new Set([
    'status', 'attempts', 'solved', 'skipped', 'reward', 'quizKey',
]);
const SUBMIT_QUIZ_STATE_KEYS = new Set([
    'progressKey', 'progress', 'quizRewardDate', 'quizRewardAmount', 'userTalent', 'rosterTalents',
]);
const SKIP_QUIZ_RESPONSE_KEYS = new Set([
    'ok', 'action', 'requestId', 'calendarDate', 'alreadyCompleted', 'committed', 'state',
]);
const SKIP_QUIZ_STATE_KEYS = new Set(['progressKey', 'progress']);
const QUIZ_PROGRESS_ENTRY_KEYS = new Set([
    'attempts', 'solved', 'skipped', 'quizKey', 'reward', 'updatedDate',
]);
const QUIZ_ROSTER_TALENT_KEYS = new Set(['orgId', 'talent']);
const COMPLETE_READ_RESPONSE_KEYS = new Set([
    'ok', 'action', 'requestId', 'alreadyCompleted', 'committed', 'calendarDate', 'result', 'state',
]);
const COMPLETE_READ_STATE_KEYS = new Set(['user', 'rosters']);
const COMPLETE_READ_USER_KEYS = new Set([
    'currentDay', 'readCount', 'score', 'talent', 'streak', 'maxStreak', 'lastReadDate',
    'dailyAdvanceDate', 'dailyAdvanceCount', 'recentReadDates', 'secretShopUnlocked',
]);
const COMPLETE_READ_UPDATE_REQUIRED_KEYS = new Set([
    'currentDay', 'readCount', 'score', 'streak', 'maxStreak', 'lastReadDate',
    'dailyAdvanceDate', 'dailyAdvanceCount', 'recentReadDates',
]);
const COMPLETE_READ_UPDATE_ALLOWED_KEYS = new Set([
    ...COMPLETE_READ_UPDATE_REQUIRED_KEYS, 'talent', 'secretShopUnlocked',
]);
const COMPLETE_READ_SUMMARY_KEYS = new Set([
    'oldLevel', 'newLevel', 'scoreEarned', 'streakBonus', 'talentEarned', 'newStreak',
    'newReadCount', 'newProgressDay', 'nextViewingDay', 'completedRound',
    'secretShopJustUnlocked', 'rewardsUserWallet', 'talentProgramEnabled',
]);
const COMPLETE_READ_READY_KEYS = new Set(['status', 'updateData', 'summary']);
const COMPLETE_READ_POSITION_KEYS = new Set(['status', 'expected', 'received']);
const COMPLETE_READ_REQUEST_KEYS = new Set(['cycle', 'day', 'readingEpoch']);
const COMPLETE_READ_POSITION_VALUE_KEYS = new Set(['cycle', 'day']);
const RESTART_READING_REQUEST_KEYS = new Set(['cycle', 'day', 'readingEpoch']);
const RESTART_READING_RESPONSE_KEYS = new Set([
    'ok', 'action', 'requestId', 'alreadyCompleted', 'committed', 'calendarDate', 'result', 'state',
]);
const RESTART_READING_STATE_KEYS = new Set(['user', 'rosters']);
const RESTART_READING_USER_KEYS = new Set([
    'currentDay', 'readCount', 'readingEpoch', 'score', 'talent', 'streak', 'maxStreak',
    'startDate', 'lastReadDate', 'dailyAdvanceDate', 'dailyAdvanceCount', 'recentReadDates',
    'achievements', 'dayOffset', 'secretShopUnlocked', 'quizDate', 'quizAttempts',
    'quizSolved', 'quizSkipped', 'quizKey', 'quizRewardDate', 'quizRewardAmount',
]);
const RESTART_READING_ROSTER_KEYS = new Set([
    'orgId', 'currentDay', 'readCount', 'score', 'streak', 'lastReadDate', 'talent',
]);
const RESTART_READING_RESULT_KEYS = new Set(['status', 'previous', 'next']);
const RESTART_READING_POSITION_KEYS = new Set(['status', 'expected', 'received']);
const RESTART_READING_POSITION_VALUE_KEYS = new Set(['cycle', 'day', 'readingEpoch']);
const SYNC_ACHIEVEMENTS_REQUEST_KEYS = new Set(['trigger']);
const SYNC_ACHIEVEMENTS_RESPONSE_KEYS = new Set([
    'ok', 'action', 'requestId', 'alreadyCompleted', 'committed', 'result',
]);
const SYNC_ACHIEVEMENTS_RESULT_KEYS = new Set(['trigger', 'newIds']);
const SYNC_ACHIEVEMENT_TRIGGERS = new Set(['read', 'memo']);
const SYNC_ACHIEVEMENT_IDS = [
    'first_read',
    'streak_7', 'streak_30', 'streak_100',
    'day_30', 'day_100', 'day_200', 'day_365',
    'first_memo', 'memo_10', 'memo_50',
    'score_100', 'score_500', 'score_1000',
];
const SYNC_ACHIEVEMENT_INDEX = new Map(
    SYNC_ACHIEVEMENT_IDS.map((achievementId, index) => [achievementId, index]),
);
const MIGRATE_PERSONAL_TALENT_WALLET_RESPONSE_KEYS = new Set([
    'ok', 'action', 'requestId', 'alreadyCompleted', 'committed', 'result',
]);
const MIGRATE_PERSONAL_TALENT_WALLET_RESULT_KEYS = new Set(['status']);
const CONVERT_TO_PERSONAL_ACCOUNT_RESPONSE_KEYS = new Set([
    'ok', 'action', 'requestId', 'alreadyCompleted', 'committed', 'result',
]);
const CONVERT_TO_PERSONAL_ACCOUNT_RESULT_KEYS = new Set(['status', 'primaryOrgId']);
const JOIN_SOLO_COMMUNITY_RESPONSE_KEYS = new Set([
    'ok', 'action', 'requestId', 'alreadyCompleted', 'committed', 'result',
]);
const JOIN_SOLO_COMMUNITY_RESULT_KEYS = new Set(['status']);
const NORMALIZE_LEGACY_READING_POSITION_RESPONSE_KEYS = new Set([
    'ok', 'action', 'requestId', 'alreadyCompleted', 'committed', 'result',
]);
const NORMALIZE_LEGACY_READING_POSITION_RESULT_KEYS = new Set([
    'status', 'currentDay', 'readCount',
]);
const COMPLETE_MEMBER_ONBOARDING_RESPONSE_KEYS = new Set([
    'ok', 'action', 'requestId', 'alreadyCompleted', 'committed', 'result',
]);
const COMPLETE_MEMBER_ONBOARDING_RESULT_KEYS = new Set([
    'status', 'orgId', 'planId', 'departmentId', 'departmentName',
    'subgroupId', 'subgroupName',
]);
const MEMBER_ONBOARDING_PLAN_IDS = new Set([
    '1year_sequential', '1year_revised', '1year_new', 'nt_new',
]);
const ACTIVITY_REQUEST_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const QUIZ_PROGRESS_KEY_PATTERN = /^(?:e([1-9]\d*)_)?r([1-9]\d*)_d([1-9]\d*)$/;
const QUIZ_KEY_PATTERN = /^[A-Za-z0-9_-]{1,128}$/;
const LEGACY_CALENDAR_DATE_PATTERN = /^(Sun|Mon|Tue|Wed|Thu|Fri|Sat) (Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec) (0[1-9]|[12]\d|3[01]) (\d{4})$/;
const MAX_TALENT_BALANCE = 1_000_000_000;
const TALENT_STREAK_MILESTONE_BONUSES = Object.freeze({
    7: 6, 30: 10, 60: 15, 90: 20, 120: 20, 180: 25, 270: 30, 365: 40,
});
const loadAuth = async () => (await import('./platformAuth.js')).getPlatformAuth();
const isResponseRecord = value => Boolean(value) && typeof value === 'object' && !Array.isArray(value);

export class PlatformApiError extends Error {
    constructor(message, { code = 'PLATFORM_API_ERROR', status = 0, retryable = false, cause } = {}) {
        super(message, cause === undefined ? undefined : { cause });
        this.name = 'PlatformApiError';
        this.code = code;
        this.status = status;
        this.retryable = retryable;
    }
}

const formatUuidV4 = (bytes) => {
    bytes[6] = (bytes[6] & 0x0f) | 0x40;
    bytes[8] = (bytes[8] & 0x3f) | 0x80;
    const hex = Array.from(bytes, value => value.toString(16).padStart(2, '0'));
    return `${hex.slice(0, 4).join('')}-${hex.slice(4, 6).join('')}-${hex.slice(6, 8).join('')}-${hex.slice(8, 10).join('')}-${hex.slice(10).join('')}`;
};

// 의존성을 주입할 수 있게 해 Node 검증에서 crypto 완전 부재 분기도 직접 확인한다.
export const createRequestId = (cryptoImpl = globalThis.crypto, random = Math.random) => {
    if (typeof cryptoImpl?.randomUUID === 'function') {
        return cryptoImpl.randomUUID();
    }
    if (typeof cryptoImpl?.getRandomValues === 'function') {
        return formatUuidV4(cryptoImpl.getRandomValues(new Uint8Array(16)));
    }
    const bytes = Uint8Array.from({ length: 16 }, () => Math.floor(random() * 256) & 0xff);
    return formatUuidV4(bytes);
};

const asPlatformApiError = (error) => {
    if (error instanceof PlatformApiError) return error;
    if (error?.name === 'AbortError') {
        return new PlatformApiError('플랫폼 API 요청 시간이 초과되었습니다.', {
            code: 'TIMEOUT', status: 0, retryable: true, cause: error,
        });
    }
    return new PlatformApiError('플랫폼 API에 연결하지 못했습니다.', {
        code: 'NETWORK_ERROR', status: 0, retryable: true, cause: error,
    });
};

const parseResponseBody = async (response) => {
    const text = await response.text();
    if (!text) return {};
    try {
        return JSON.parse(text);
    } catch (cause) {
        throw new PlatformApiError('플랫폼 API 응답을 확인할 수 없습니다.', {
            code: 'INVALID_RESPONSE', status: response.status, retryable: response.status >= 500, cause,
        });
    }
};

const responseError = (response, body) => {
    const details = body?.error && typeof body.error === 'object' ? body.error : body;
    const message = details?.message || (typeof body?.error === 'string' ? body.error : null) || `플랫폼 API 요청에 실패했습니다. (${response.status})`;
    return new PlatformApiError(message, {
        code: details?.code || `HTTP_${response.status}`,
        status: response.status,
        retryable: details?.retryable === true,
    });
};

const authChangedError = () => new PlatformApiError('로그인 계정이 바뀌었습니다. 다시 시도해주세요.', {
    code: 'AUTH_CHANGED', status: 401, retryable: false,
});

const postOnce = async ({ action, payload, requestId, timeoutMs, forceRefresh, expectedUid }) => {
    let auth;
    try {
        auth = await loadAuth();
    } catch (cause) {
        throw new PlatformApiError('로그인 모듈을 준비하지 못했습니다.', {
            code: 'AUTH_INIT_ERROR', status: 0, retryable: true, cause,
        });
    }
    if (!auth?.currentUser) {
        throw new PlatformApiError('로그인이 필요합니다.', {
            code: 'AUTH_REQUIRED', status: 401, retryable: false,
        });
    }
    const requestUser = auth.currentUser;
    if (expectedUid && requestUser.uid !== expectedUid) throw authChangedError();

    let token;
    try {
        token = await requestUser.getIdToken(forceRefresh);
    } catch (cause) {
        throw new PlatformApiError('로그인 인증 정보를 확인하지 못했습니다.', {
            code: 'AUTH_TOKEN_ERROR', status: 401, retryable: true, cause,
        });
    }
    if (auth.currentUser?.uid !== requestUser.uid
        || (expectedUid && auth.currentUser.uid !== expectedUid)) {
        throw authChangedError();
    }
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
    try {
        const response = await fetch(PLATFORM_API_URL, {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${token}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ action, requestId, ...payload }),
            signal: controller.signal,
        });
        const body = response.status === 401
            ? await parseResponseBody(response).catch(() => ({}))
            : await parseResponseBody(response);
        return { response, body };
    } catch (error) {
        throw asPlatformApiError(error);
    } finally {
        clearTimeout(timeoutId);
    }
};

const postPublicOnce = async ({ action, payload, requestId, timeoutMs }) => {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
    try {
        const response = await fetch(PLATFORM_API_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action, requestId, ...payload }),
            signal: controller.signal,
        });
        const body = await parseResponseBody(response);
        return { response, body };
    } catch (error) {
        throw asPlatformApiError(error);
    } finally {
        clearTimeout(timeoutId);
    }
};

export const callPlatformApi = async (action, payload = {}, options = {}) => {
    if (!PLATFORM_API_URL) {
        throw new PlatformApiError('플랫폼 API가 아직 활성화되지 않았습니다.', {
            code: 'FEATURE_DISABLED', status: 0, retryable: false,
        });
    }
    if (typeof action !== 'string' || !action.trim()) {
        throw new PlatformApiError('플랫폼 API 작업 이름이 필요합니다.', {
            code: 'INVALID_ACTION', status: 0, retryable: false,
        });
    }
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
        throw new PlatformApiError('플랫폼 API 요청 형식이 올바르지 않습니다.', {
            code: 'INVALID_PAYLOAD', status: 0, retryable: false,
        });
    }
    if (Object.keys(payload).some(key => RESERVED_PAYLOAD_KEYS.has(key))) {
        throw new PlatformApiError('플랫폼 API 예약 필드는 payload에 넣을 수 없습니다.', {
            code: 'INVALID_PAYLOAD', status: 0, retryable: false,
        });
    }

    const requestId = options.requestId || createRequestId();
    const timeoutMs = Number.isFinite(options.timeoutMs) && options.timeoutMs > 0
        ? options.timeoutMs
        : DEFAULT_TIMEOUT_MS;
    const expectedUid = typeof options.expectedUid === 'string' && options.expectedUid
        ? options.expectedUid
        : null;
    const request = {
        action: action.trim(), payload, requestId, timeoutMs, expectedUid,
    };

    const first = await postOnce({ ...request, forceRefresh: false });
    if (first.response.status !== 401) {
        if (!first.response.ok) throw responseError(first.response, first.body);
        return first.body;
    }

    // 만료 토큰만 한 번 갱신한다. idempotency를 위해 requestId는 첫 요청과 동일하다.
    const second = await postOnce({ ...request, forceRefresh: true });
    if (!second.response.ok) throw responseError(second.response, second.body);
    return second.body;
};

export const callPlatformApiPublic = async (action, payload = {}, options = {}) => {
    if (!PLATFORM_API_URL) {
        throw new PlatformApiError('플랫폼 API가 아직 활성화되지 않았습니다.', {
            code: 'FEATURE_DISABLED', status: 0, retryable: false,
        });
    }
    if (typeof action !== 'string' || !action.trim()) {
        throw new PlatformApiError('플랫폼 API 작업 이름이 필요합니다.', {
            code: 'INVALID_ACTION', status: 0, retryable: false,
        });
    }
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)
        || Object.keys(payload).some(key => RESERVED_PAYLOAD_KEYS.has(key))) {
        throw new PlatformApiError('플랫폼 API 요청 형식이 올바르지 않습니다.', {
            code: 'INVALID_PAYLOAD', status: 0, retryable: false,
        });
    }
    const requestId = options.requestId || createRequestId();
    const timeoutMs = Number.isFinite(options.timeoutMs) && options.timeoutMs > 0
        ? options.timeoutMs
        : DEFAULT_TIMEOUT_MS;
    const { response, body } = await postPublicOnce({ action: action.trim(), payload, requestId, timeoutMs });
    if (!response.ok) throw responseError(response, body);
    return body;
};

export const preflightPlatformApi = (options = {}) => callPlatformApi('preflight', {}, options);

export const previewReadCompletion = (cycle, day, options = {}) => {
    if (!Number.isInteger(cycle) || cycle < 1 || !Number.isInteger(day) || day < 1 || day > 365) {
        throw new PlatformApiError('읽기 완료 확인 범위가 올바르지 않습니다.', {
            code: 'INVALID_PAYLOAD', status: 0, retryable: false,
        });
    }
    return callPlatformApi('previewReadCompletion', { cycle, day }, options);
};

export const previewQuizSubmission = (progressKey, quizKey, selectedIndex, options = {}) => {
    const progressMatch = typeof progressKey === 'string' ? QUIZ_PROGRESS_KEY_PATTERN.exec(progressKey) : null;
    const progressEpoch = progressMatch?.[1] ? Number(progressMatch[1]) : 0;
    const progressCycle = progressMatch ? Number(progressMatch[2]) : NaN;
    const progressDay = progressMatch ? Number(progressMatch[3]) : NaN;
    if (!Number.isSafeInteger(progressCycle) || !Number.isSafeInteger(progressDay) || progressDay < 1 || progressDay > 365) {
        throw new PlatformApiError('퀴즈 진행 위치가 올바르지 않습니다.', {
            code: 'INVALID_PAYLOAD', status: 0, retryable: false,
        });
    }
    if (!Number.isSafeInteger(progressEpoch) || progressEpoch < 0) {
        throw new PlatformApiError('퀴즈 진행 회차가 올바르지 않습니다.', {
            code: 'INVALID_PAYLOAD', status: 0, retryable: false,
        });
    }
    if (typeof quizKey !== 'string' || !/^[A-Za-z0-9_-]{1,128}$/.test(quizKey)) {
        throw new PlatformApiError('퀴즈 문항 정보가 올바르지 않습니다.', {
            code: 'INVALID_PAYLOAD', status: 0, retryable: false,
        });
    }
    if (!Number.isInteger(selectedIndex) || selectedIndex < 0 || selectedIndex > 3) {
        throw new PlatformApiError('선택한 퀴즈 답안이 올바르지 않습니다.', {
            code: 'INVALID_PAYLOAD', status: 0, retryable: false,
        });
    }
    return callPlatformApi('previewQuizSubmission', { progressKey, quizKey, selectedIndex }, options);
};

const invalidSubmitQuizResponse = () => {
    throw new PlatformApiError('퀴즈 처리 결과를 안전하게 확인하지 못했습니다.', {
        code: 'INVALID_RESPONSE', status: 200, retryable: true,
    });
};

const hasExactKeys = (value, expectedKeys) => (
    isResponseRecord(value)
    && Object.keys(value).length === expectedKeys.size
    && Object.keys(value).every(key => expectedKeys.has(key))
);

const isSafeIntegerInRange = (value, minimum, maximum) => (
    Number.isSafeInteger(value) && value >= minimum && value <= maximum
);

const isValidQuizProgressKey = (value) => {
    const match = typeof value === 'string' ? QUIZ_PROGRESS_KEY_PATTERN.exec(value) : null;
    const epoch = match?.[1] ? Number(match[1]) : 0;
    const cycle = match ? Number(match[2]) : NaN;
    const day = match ? Number(match[3]) : NaN;
    return Number.isSafeInteger(epoch) && epoch >= 0
        && Number.isSafeInteger(cycle) && cycle >= 1
        && Number.isSafeInteger(day) && day >= 1 && day <= 365;
};

const isValidQuizKey = value => typeof value === 'string' && QUIZ_KEY_PATTERN.test(value);

const isValidCanonicalOrgId = value => (
    typeof value === 'string'
    && value.length >= 1 && value.length <= 128
    && value === value.trim()
    && value !== '.' && value !== '..'
    && !value.includes('/')
    && !/[\u0000-\u001f\u007f]/.test(value)
);

const compareCanonicalIds = (left, right) => (left < right ? -1 : left > right ? 1 : 0);

const isValidLegacyCalendarDate = (value) => {
    const match = typeof value === 'string' ? LEGACY_CALENDAR_DATE_PATTERN.exec(value) : null;
    if (!match) return false;
    const weekdays = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const month = months.indexOf(match[2]);
    const day = Number(match[3]);
    const year = Number(match[4]);
    const parsed = new Date(Date.UTC(year, month, day));
    return Number.isSafeInteger(year)
        && parsed.getUTCFullYear() === year
        && parsed.getUTCMonth() === month
        && parsed.getUTCDate() === day
        && weekdays[parsed.getUTCDay()] === match[1];
};

const normalizeQuizProgressEntry = (value) => {
    const expectedReward = value?.attempts === 1 ? 10 : value?.attempts === 2 ? 5 : 0;
    if (!hasExactKeys(value, QUIZ_PROGRESS_ENTRY_KEYS)
        || !isSafeIntegerInRange(value.attempts, 0, 2)
        || typeof value.solved !== 'boolean'
        || typeof value.skipped !== 'boolean'
        || !isValidQuizKey(value.quizKey)
        || ![0, 5, 10].includes(value.reward)
        || !isValidLegacyCalendarDate(value.updatedDate)
        || (value.solved && (value.skipped || value.attempts < 1
            || ![0, expectedReward].includes(value.reward)))
        || (!value.solved && value.reward !== 0)
        || (value.skipped && value.attempts > 1)) {
        return invalidSubmitQuizResponse();
    }
    return {
        attempts: value.attempts,
        solved: value.solved,
        skipped: value.skipped,
        quizKey: value.quizKey,
        reward: value.reward,
        updatedDate: value.updatedDate,
    };
};

const normalizeQuizRosterTalents = (value) => {
    if (!Array.isArray(value) || value.length > 3) return invalidSubmitQuizResponse();
    const normalized = value.map((row) => {
        if (!hasExactKeys(row, QUIZ_ROSTER_TALENT_KEYS)
            || !isValidCanonicalOrgId(row.orgId)
            || !isSafeIntegerInRange(row.talent, 0, MAX_TALENT_BALANCE)) {
            return invalidSubmitQuizResponse();
        }
        return { orgId: row.orgId, talent: row.talent };
    });
    if (normalized.some((row, index) => (
        index > 0 && compareCanonicalIds(normalized[index - 1].orgId, row.orgId) >= 0
    ))) return invalidSubmitQuizResponse();
    return normalized;
};

const entriesMatch = (left, right) => (
    QUIZ_PROGRESS_ENTRY_KEYS.size === Object.keys(left).length
    && Object.keys(left).every(key => Object.is(left[key], right[key]))
);

const legacyDateTimestamp = (value) => {
    const match = LEGACY_CALENDAR_DATE_PATTERN.exec(value);
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    return match ? Date.UTC(Number(match[4]), months.indexOf(match[2]), Number(match[3])) : NaN;
};

const progressCanFollowSubmission = (entry, progress) => {
    if (entriesMatch(entry, progress)) return true;
    if (entry.quizKey !== progress.quizKey || entry.solved || entry.skipped
        || entry.attempts !== 1 || entry.reward !== 0
        || legacyDateTimestamp(progress.updatedDate) < legacyDateTimestamp(entry.updatedDate)) return false;
    if (progress.solved) {
        return !progress.skipped && progress.attempts === 2 && [0, 5].includes(progress.reward);
    }
    if (progress.skipped) return progress.attempts === 1 && progress.reward === 0;
    return progress.attempts === 2 && progress.reward === 0;
};

export const validateSubmitQuizResponse = (payload, result, expectedRequestId) => {
    if (!hasExactKeys(payload, SUBMIT_QUIZ_REQUEST_KEYS)
        || !isValidQuizProgressKey(payload.progressKey)
        || !isValidQuizKey(payload.quizKey)
        || !isSafeIntegerInRange(payload.selectedIndex, 0, 3)
        || ![1, 2].includes(payload.attemptSlot)
        || !ACTIVITY_REQUEST_ID_PATTERN.test(expectedRequestId)
        || !hasExactKeys(result, SUBMIT_QUIZ_RESPONSE_KEYS)
        || result.ok !== true || result.action !== 'submitQuiz'
        || result.requestId !== expectedRequestId
        || !isValidLegacyCalendarDate(result.calendarDate)
        || typeof result.alreadyCompleted !== 'boolean'
        || !hasExactKeys(result.state, SUBMIT_QUIZ_STATE_KEYS)
        || result.state.progressKey !== payload.progressKey
        || ![0, 5, 10].includes(result.state.quizRewardAmount)
        || !isSafeIntegerInRange(result.state.userTalent, 0, MAX_TALENT_BALANCE)
        || (result.state.quizRewardDate !== null
            && !isValidLegacyCalendarDate(result.state.quizRewardDate))
        || ((result.state.quizRewardDate === null)
            !== (result.state.quizRewardAmount === 0))) {
        return invalidSubmitQuizResponse();
    }

    const progress = normalizeQuizProgressEntry(result.state.progress);
    const rosterTalents = normalizeQuizRosterTalents(result.state.rosterTalents);
    if (progress.quizKey !== payload.quizKey) return invalidSubmitQuizResponse();

    let normalizedResult;
    if (hasExactKeys(result.result, SUBMIT_QUIZ_READY_RESULT_KEYS)
        && result.result.status === 'ready') {
        const ready = result.result;
        const entry = normalizeQuizProgressEntry(ready.entry);
        const expectedCorrectReward = ready.attempts === 1 ? 10 : 5;
        if (!isSafeIntegerInRange(ready.attempts, 1, 2)
            || ready.attempts !== payload.attemptSlot
            || typeof ready.solved !== 'boolean' || ready.skipped !== false
            || typeof ready.isCorrect !== 'boolean' || ready.solved !== ready.isCorrect
            || ![0, expectedCorrectReward].includes(ready.reward)
            || (!ready.isCorrect && ready.reward !== 0)
            || !isValidQuizKey(ready.quizKey) || ready.quizKey !== payload.quizKey
            || typeof ready.rewardsUserWallet !== 'boolean'
            || !Array.isArray(ready.rewardedRosterOrgIds)
            || ready.rewardedRosterOrgIds.length > 3
            || ready.rewardedRosterOrgIds.some((orgId, index, orgIds) => (
                typeof orgId !== 'string' || !orgId || orgId.length > 128 || orgId.includes('/')
                || /[\u0000-\u001f\u007f]/.test(orgId)
                || (index > 0 && compareCanonicalIds(orgIds[index - 1], orgId) >= 0)
            ))
            || entry.attempts !== ready.attempts
            || entry.solved !== ready.solved || entry.skipped !== false
            || entry.quizKey !== ready.quizKey || entry.reward !== ready.reward
            || entry.updatedDate !== result.calendarDate
            || (ready.reward === 0
                && (ready.rewardsUserWallet || ready.rewardedRosterOrgIds.length > 0))
            || (ready.reward > 0
                && !ready.rewardsUserWallet && ready.rewardedRosterOrgIds.length === 0)
            || (!result.alreadyCompleted && ready.reward > 0
                && (result.state.quizRewardDate !== result.calendarDate
                    || result.state.quizRewardAmount !== ready.reward))
            || (!entriesMatch(entry, progress)
                && (!result.alreadyCompleted || !progressCanFollowSubmission(entry, progress)))) {
            return invalidSubmitQuizResponse();
        }
        normalizedResult = {
            status: 'ready', attempts: ready.attempts, solved: ready.solved, skipped: false,
            isCorrect: ready.isCorrect, reward: ready.reward, quizKey: ready.quizKey, entry,
            rewardsUserWallet: ready.rewardsUserWallet,
            rewardedRosterOrgIds: [...ready.rewardedRosterOrgIds],
        };
    } else if (hasExactKeys(result.result, SUBMIT_QUIZ_DONE_RESULT_KEYS)
        && result.result.status === 'alreadyDone') {
        const done = result.result;
        if (result.alreadyCompleted
            || !isSafeIntegerInRange(done.attempts, 0, 2)
            || typeof done.solved !== 'boolean' || typeof done.skipped !== 'boolean'
            || (!done.solved && !done.skipped && done.attempts < 2)
            || ![0, done.attempts === 1 ? 10 : 5].includes(done.reward)
            || (!done.solved && done.reward !== 0)
            || !isValidQuizKey(done.quizKey) || done.quizKey !== payload.quizKey
            || progress.attempts !== done.attempts
            || progress.solved !== done.solved || progress.skipped !== done.skipped
            || progress.reward !== done.reward || progress.quizKey !== done.quizKey) {
            return invalidSubmitQuizResponse();
        }
        normalizedResult = {
            status: 'alreadyDone', attempts: done.attempts, solved: done.solved,
            skipped: done.skipped, reward: done.reward, quizKey: done.quizKey,
        };
    } else {
        return invalidSubmitQuizResponse();
    }

    return {
        ok: true,
        action: 'submitQuiz',
        requestId: expectedRequestId,
        calendarDate: result.calendarDate,
        alreadyCompleted: result.alreadyCompleted,
        result: normalizedResult,
        state: {
            progressKey: payload.progressKey,
            progress,
            quizRewardDate: result.state.quizRewardDate,
            quizRewardAmount: result.state.quizRewardAmount,
            userTalent: result.state.userTalent,
            rosterTalents,
        },
    };
};

export const submitQuiz = (progressKey, quizKey, selectedIndex, attemptSlot, options = {}) => {
    const payload = { progressKey, quizKey, selectedIndex, attemptSlot };
    if (!isValidQuizProgressKey(progressKey)
        || !isValidQuizKey(quizKey)
        || !isSafeIntegerInRange(selectedIndex, 0, 3)
        || ![1, 2].includes(attemptSlot)) {
        throw new PlatformApiError('퀴즈 제출 정보가 올바르지 않습니다.', {
            code: 'INVALID_PAYLOAD', status: 0, retryable: false,
        });
    }
    const requestId = options.requestId || createRequestId();
    if (!ACTIVITY_REQUEST_ID_PATTERN.test(requestId)) {
        throw new PlatformApiError('퀴즈 요청 번호가 올바르지 않습니다.', {
            code: 'INVALID_PAYLOAD', status: 0, retryable: false,
        });
    }
    return callPlatformApi('submitQuiz', payload, { ...options, requestId })
        .then(result => validateSubmitQuizResponse(payload, result, requestId));
};

export const validateSkipQuizResponse = (payload, result, expectedRequestId) => {
    if (!hasExactKeys(payload, SKIP_QUIZ_REQUEST_KEYS)
        || !isValidQuizProgressKey(payload.progressKey)
        || !isValidQuizKey(payload.quizKey)
        || !ACTIVITY_REQUEST_ID_PATTERN.test(expectedRequestId)
        || !hasExactKeys(result, SKIP_QUIZ_RESPONSE_KEYS)
        || result.ok !== true || result.action !== 'skipQuiz'
        || result.requestId !== expectedRequestId
        || !isValidLegacyCalendarDate(result.calendarDate)
        || typeof result.alreadyCompleted !== 'boolean'
        || typeof result.committed !== 'boolean'
        || (result.alreadyCompleted && !result.committed)
        || !hasExactKeys(result.state, SKIP_QUIZ_STATE_KEYS)
        || result.state.progressKey !== payload.progressKey) {
        return invalidSubmitQuizResponse();
    }
    const progress = normalizeQuizProgressEntry(result.state.progress);
    if (progress.quizKey !== payload.quizKey) return invalidSubmitQuizResponse();
    if (result.committed
        && (!progress.skipped || progress.solved || progress.reward !== 0
            || progress.attempts > 1 || progress.updatedDate !== result.calendarDate)) {
        return invalidSubmitQuizResponse();
    }
    if (!result.committed
        && !(progress.solved || progress.skipped || progress.attempts >= 2)) {
        return invalidSubmitQuizResponse();
    }
    return {
        ok: true,
        action: 'skipQuiz',
        requestId: expectedRequestId,
        calendarDate: result.calendarDate,
        alreadyCompleted: result.alreadyCompleted,
        committed: result.committed,
        state: { progressKey: payload.progressKey, progress },
    };
};

export const skipQuiz = (progressKey, quizKey, options = {}) => {
    const payload = { progressKey, quizKey };
    if (!isValidQuizProgressKey(progressKey) || !isValidQuizKey(quizKey)) {
        throw new PlatformApiError('퀴즈 건너뛰기 정보가 올바르지 않습니다.', {
            code: 'INVALID_PAYLOAD', status: 0, retryable: false,
        });
    }
    const requestId = options.requestId || createRequestId();
    if (!ACTIVITY_REQUEST_ID_PATTERN.test(requestId)) {
        throw new PlatformApiError('퀴즈 건너뛰기 요청 번호가 올바르지 않습니다.', {
            code: 'INVALID_PAYLOAD', status: 0, retryable: false,
        });
    }
    return callPlatformApi('skipQuiz', payload, { ...options, requestId })
        .then(result => validateSkipQuizResponse(payload, result, requestId));
};

const invalidCompleteReadResponse = () => {
    throw new PlatformApiError('읽기 저장 결과를 안전하게 확인하지 못했습니다.', {
        code: 'INVALID_RESPONSE', status: 200, retryable: true,
    });
};

const normalizeReadRosterTalents = (value) => {
    if (!Array.isArray(value) || value.length > 3) return invalidCompleteReadResponse();
    const normalized = value.map((row) => {
        if (!hasExactKeys(row, QUIZ_ROSTER_TALENT_KEYS)
            || !isValidCanonicalOrgId(row.orgId)
            || !isSafeIntegerInRange(row.talent, 0, MAX_TALENT_BALANCE)) {
            return invalidCompleteReadResponse();
        }
        return { orgId: row.orgId, talent: row.talent };
    });
    if (normalized.some((row, index) => (
        index > 0 && compareCanonicalIds(normalized[index - 1].orgId, row.orgId) >= 0
    ))) return invalidCompleteReadResponse();
    return normalized;
};

const hasRequiredAndAllowedKeys = (value, requiredKeys, allowedKeys) => (
    isResponseRecord(value)
    && [...requiredKeys].every(key => Object.prototype.hasOwnProperty.call(value, key))
    && Object.keys(value).every(key => allowedKeys.has(key))
);

const isValidStoredDate = (value) => {
    if (typeof value !== 'string' || value.length > 64) return false;
    if (isValidLegacyCalendarDate(value)) return true;
    const match = /^(\d{4})-(\d{2})-(\d{2})(?:T.*)?$/.exec(value);
    if (!match || !Number.isFinite(Date.parse(value))) return false;
    const year = Number(match[1]);
    const month = Number(match[2]) - 1;
    const day = Number(match[3]);
    const parsed = new Date(Date.UTC(year, month, day));
    return parsed.getUTCFullYear() === year
        && parsed.getUTCMonth() === month
        && parsed.getUTCDate() === day;
};

const normalizeReadDates = (value) => {
    if (!Array.isArray(value) || value.length > 14 || value.some(item => !isValidStoredDate(item))) {
        return invalidCompleteReadResponse();
    }
    return [...value];
};

const normalizeReadStateUser = (value) => {
    if (!hasExactKeys(value, COMPLETE_READ_USER_KEYS)
        || !isSafeIntegerInRange(value.currentDay, 1, 365)
        || !isSafeIntegerInRange(value.readCount, 1, Number.MAX_SAFE_INTEGER)
        || !isSafeIntegerInRange(value.score, 0, Number.MAX_SAFE_INTEGER)
        || !isSafeIntegerInRange(value.talent, 0, MAX_TALENT_BALANCE)
        || !isSafeIntegerInRange(value.streak, 0, Number.MAX_SAFE_INTEGER)
        || !isSafeIntegerInRange(value.maxStreak, 0, Number.MAX_SAFE_INTEGER)
        || (value.lastReadDate !== null && !isValidLegacyCalendarDate(value.lastReadDate))
        || (value.dailyAdvanceDate !== null && !isValidLegacyCalendarDate(value.dailyAdvanceDate))
        || !isSafeIntegerInRange(value.dailyAdvanceCount, 0, Number.MAX_SAFE_INTEGER)
        || (value.dailyAdvanceDate === null && value.dailyAdvanceCount > 0)
        || typeof value.secretShopUnlocked !== 'boolean') {
        return invalidCompleteReadResponse();
    }
    return {
        currentDay: value.currentDay,
        readCount: value.readCount,
        score: value.score,
        talent: value.talent,
        streak: value.streak,
        maxStreak: value.maxStreak,
        lastReadDate: value.lastReadDate,
        dailyAdvanceDate: value.dailyAdvanceDate,
        dailyAdvanceCount: value.dailyAdvanceCount,
        recentReadDates: normalizeReadDates(value.recentReadDates),
        secretShopUnlocked: value.secretShopUnlocked,
    };
};

const normalizeReadUpdate = (value) => {
    if (!hasRequiredAndAllowedKeys(
        value,
        COMPLETE_READ_UPDATE_REQUIRED_KEYS,
        COMPLETE_READ_UPDATE_ALLOWED_KEYS,
    )
        || !isSafeIntegerInRange(value.currentDay, 1, 365)
        || !isSafeIntegerInRange(value.readCount, 1, Number.MAX_SAFE_INTEGER)
        || !isSafeIntegerInRange(value.score, 0, Number.MAX_SAFE_INTEGER)
        || !isSafeIntegerInRange(value.streak, 0, Number.MAX_SAFE_INTEGER)
        || !isSafeIntegerInRange(value.maxStreak, 0, Number.MAX_SAFE_INTEGER)
        || !isValidLegacyCalendarDate(value.lastReadDate)
        || !isValidLegacyCalendarDate(value.dailyAdvanceDate)
        || !isSafeIntegerInRange(value.dailyAdvanceCount, 1, Number.MAX_SAFE_INTEGER)
        || (Object.prototype.hasOwnProperty.call(value, 'talent')
            && !isSafeIntegerInRange(value.talent, 0, MAX_TALENT_BALANCE))
        || (Object.prototype.hasOwnProperty.call(value, 'secretShopUnlocked')
            && value.secretShopUnlocked !== true)) {
        return invalidCompleteReadResponse();
    }
    return {
        currentDay: value.currentDay,
        readCount: value.readCount,
        score: value.score,
        streak: value.streak,
        maxStreak: value.maxStreak,
        lastReadDate: value.lastReadDate,
        dailyAdvanceDate: value.dailyAdvanceDate,
        dailyAdvanceCount: value.dailyAdvanceCount,
        recentReadDates: normalizeReadDates(value.recentReadDates),
        ...(Object.prototype.hasOwnProperty.call(value, 'talent') ? { talent: value.talent } : {}),
        ...(Object.prototype.hasOwnProperty.call(value, 'secretShopUnlocked')
            ? { secretShopUnlocked: true }
            : {}),
    };
};

const normalizeReadSummary = (value) => {
    if (!hasExactKeys(value, COMPLETE_READ_SUMMARY_KEYS)
        || !isSafeIntegerInRange(value.oldLevel, 0, Number.MAX_SAFE_INTEGER)
        || !isSafeIntegerInRange(value.newLevel, value.oldLevel, Number.MAX_SAFE_INTEGER)
        || !isSafeIntegerInRange(value.scoreEarned, 0, 15)
        || !isSafeIntegerInRange(value.streakBonus, 0, 5)
        || !isSafeIntegerInRange(value.talentEarned, 0, 57)
        || !isSafeIntegerInRange(value.newStreak, 0, Number.MAX_SAFE_INTEGER)
        || !isSafeIntegerInRange(value.newReadCount, 1, Number.MAX_SAFE_INTEGER)
        || !isSafeIntegerInRange(value.newProgressDay, 1, 365)
        || !isSafeIntegerInRange(value.nextViewingDay, 1, 365)
        || typeof value.completedRound !== 'boolean'
        || typeof value.secretShopJustUnlocked !== 'boolean'
        || typeof value.rewardsUserWallet !== 'boolean'
        || typeof value.talentProgramEnabled !== 'boolean'
        || (value.scoreEarned !== 0 && value.scoreEarned !== 10 + value.streakBonus)
        || (value.scoreEarned === 0 && value.streakBonus !== 0)
        || value.talentEarned !== (value.scoreEarned > 0 && value.talentProgramEnabled
            ? 10 + Math.min(value.newStreak, 7) + (TALENT_STREAK_MILESTONE_BONUSES[value.newStreak] || 0)
            : 0)
        || (value.rewardsUserWallet && !value.talentProgramEnabled)
        || (value.secretShopJustUnlocked && value.newStreak < 7)
        || value.nextViewingDay !== value.newProgressDay
        || (value.completedRound !== (value.newProgressDay === 1))) {
        return invalidCompleteReadResponse();
    }
    return { ...value };
};

const sameReadUpdateState = (update, stateUser) => (
    [...COMPLETE_READ_UPDATE_REQUIRED_KEYS].every(key => (
        key === 'recentReadDates'
            ? JSON.stringify(update[key]) === JSON.stringify(stateUser[key])
            : Object.is(update[key], stateUser[key])
    ))
    && (!Object.prototype.hasOwnProperty.call(update, 'talent')
        || update.talent === stateUser.talent)
    && (!Object.prototype.hasOwnProperty.call(update, 'secretShopUnlocked')
        || stateUser.secretShopUnlocked === true)
);

export const validateCompleteReadResponse = (payload, result, expectedRequestId) => {
    if (!hasExactKeys(payload, COMPLETE_READ_REQUEST_KEYS)
        || !isSafeIntegerInRange(payload.cycle, 1, Number.MAX_SAFE_INTEGER)
        || !isSafeIntegerInRange(payload.day, 1, 365)
        || !isSafeIntegerInRange(payload.readingEpoch, 0, Number.MAX_SAFE_INTEGER)
        || !ACTIVITY_REQUEST_ID_PATTERN.test(expectedRequestId)
        || !hasExactKeys(result, COMPLETE_READ_RESPONSE_KEYS)
        || result.ok !== true || result.action !== 'completeRead'
        || result.requestId !== expectedRequestId
        || typeof result.alreadyCompleted !== 'boolean'
        || typeof result.committed !== 'boolean'
        || !isValidLegacyCalendarDate(result.calendarDate)
        || !hasExactKeys(result.state, COMPLETE_READ_STATE_KEYS)) {
        return invalidCompleteReadResponse();
    }
    const user = normalizeReadStateUser(result.state.user);
    const rosters = normalizeReadRosterTalents(result.state.rosters);

    let normalizedResult;
    if (hasExactKeys(result.result, COMPLETE_READ_READY_KEYS)
        && result.result.status === 'ready') {
        const updateData = normalizeReadUpdate(result.result.updateData);
        const summary = normalizeReadSummary(result.result.summary);
        const completedRound = payload.day === 365;
        const expectedProgressDay = completedRound ? 1 : payload.day + 1;
        const expectedReadCount = completedRound ? payload.cycle + 1 : payload.cycle;
        const previousScore = updateData.score - summary.scoreEarned;
        if (!result.committed
            || updateData.lastReadDate !== result.calendarDate
            || updateData.dailyAdvanceDate !== result.calendarDate
            || !updateData.recentReadDates.includes(result.calendarDate)
            || updateData.readCount !== summary.newReadCount
            || updateData.currentDay !== summary.newProgressDay
            || updateData.streak !== summary.newStreak
            || updateData.maxStreak < updateData.streak
            || !Number.isSafeInteger(expectedReadCount)
            || summary.completedRound !== completedRound
            || summary.newProgressDay !== expectedProgressDay
            || summary.nextViewingDay !== expectedProgressDay
            || summary.newReadCount !== expectedReadCount
            || !Number.isSafeInteger(previousScore) || previousScore < 0
            || Math.floor(previousScore / 100) !== summary.oldLevel
            || Math.floor(updateData.score / 100) !== summary.newLevel
            || (Object.prototype.hasOwnProperty.call(updateData, 'talent')
                !== summary.rewardsUserWallet)
            || (Object.prototype.hasOwnProperty.call(updateData, 'secretShopUnlocked')
                !== summary.secretShopJustUnlocked)
            || (!result.alreadyCompleted && !sameReadUpdateState(updateData, user))) {
            return invalidCompleteReadResponse();
        }
        normalizedResult = { status: 'ready', updateData, summary };
    } else if (hasExactKeys(result.result, COMPLETE_READ_POSITION_KEYS)
        && result.result.status === 'positionMismatch') {
        if (result.alreadyCompleted || result.committed
            || !hasExactKeys(result.result.expected, COMPLETE_READ_POSITION_VALUE_KEYS)
            || !hasExactKeys(result.result.received, COMPLETE_READ_POSITION_VALUE_KEYS)
            || !isSafeIntegerInRange(result.result.expected.cycle, 1, Number.MAX_SAFE_INTEGER)
            || !isSafeIntegerInRange(result.result.expected.day, 1, 365)
            || result.result.received.cycle !== payload.cycle
            || result.result.received.day !== payload.day
            || user.readCount !== result.result.expected.cycle
            || user.currentDay !== result.result.expected.day
            || (result.result.expected.cycle === payload.cycle
                && result.result.expected.day === payload.day)) {
            return invalidCompleteReadResponse();
        }
        normalizedResult = {
            status: 'positionMismatch',
            expected: { ...result.result.expected },
            received: { ...result.result.received },
        };
    } else {
        return invalidCompleteReadResponse();
    }

    return {
        ok: true,
        action: 'completeRead',
        requestId: expectedRequestId,
        alreadyCompleted: result.alreadyCompleted,
        committed: result.committed,
        calendarDate: result.calendarDate,
        result: normalizedResult,
        state: { user, rosters },
    };
};

export const completeRead = (cycle, day, options = {}) => {
    const readingEpoch = options.readingEpoch ?? 0;
    const payload = { cycle, day, readingEpoch };
    if (!isSafeIntegerInRange(cycle, 1, Number.MAX_SAFE_INTEGER)
        || !isSafeIntegerInRange(day, 1, 365)
        || !isSafeIntegerInRange(readingEpoch, 0, Number.MAX_SAFE_INTEGER)) {
        throw new PlatformApiError('읽기 완료 위치가 올바르지 않습니다.', {
            code: 'INVALID_PAYLOAD', status: 0, retryable: false,
        });
    }
    const requestId = options.requestId || createRequestId();
    if (!ACTIVITY_REQUEST_ID_PATTERN.test(requestId)) {
        throw new PlatformApiError('읽기 완료 요청 번호가 올바르지 않습니다.', {
            code: 'INVALID_PAYLOAD', status: 0, retryable: false,
        });
    }
    const callOptions = { ...options };
    delete callOptions.readingEpoch;
    return callPlatformApi('completeRead', payload, { ...callOptions, requestId })
        .then(result => validateCompleteReadResponse(payload, result, requestId));
};

const invalidRestartReadingResponse = () => {
    throw new PlatformApiError('Day 1 재시작 결과를 안전하게 확인하지 못했습니다.', {
        code: 'INVALID_RESPONSE', status: 200, retryable: true,
    });
};

const normalizeRestartPosition = (value) => {
    if (!hasExactKeys(value, RESTART_READING_POSITION_VALUE_KEYS)
        || !isSafeIntegerInRange(value.cycle, 1, Number.MAX_SAFE_INTEGER)
        || !isSafeIntegerInRange(value.day, 1, 365)
        || !isSafeIntegerInRange(value.readingEpoch, 0, Number.MAX_SAFE_INTEGER)) {
        return invalidRestartReadingResponse();
    }
    return { cycle: value.cycle, day: value.day, readingEpoch: value.readingEpoch };
};

const normalizeRestartAchievements = (value) => {
    if (!Array.isArray(value) || value.length > 100
        || value.some(item => typeof item !== 'string'
            || !item || item.length > 128
            || /[\u0000-\u001f\u007f]/.test(item))) {
        return invalidRestartReadingResponse();
    }
    return [...value];
};

const normalizeRestartReadDates = (value) => {
    if (!Array.isArray(value) || value.length > 14
        || value.some(item => !isValidStoredDate(item))) {
        return invalidRestartReadingResponse();
    }
    return [...value];
};

const normalizeRestartStateUser = (value) => {
    if (!hasExactKeys(value, RESTART_READING_USER_KEYS)
        || !isSafeIntegerInRange(value.currentDay, 1, 365)
        || !isSafeIntegerInRange(value.readCount, 1, Number.MAX_SAFE_INTEGER)
        || !isSafeIntegerInRange(value.readingEpoch, 0, Number.MAX_SAFE_INTEGER)
        || !isSafeIntegerInRange(value.score, 0, Number.MAX_SAFE_INTEGER)
        || !isSafeIntegerInRange(value.talent, 0, MAX_TALENT_BALANCE)
        || !isSafeIntegerInRange(value.streak, 0, Number.MAX_SAFE_INTEGER)
        || !isSafeIntegerInRange(value.maxStreak, value.streak, Number.MAX_SAFE_INTEGER)
        || (value.startDate !== null && !isValidStoredDate(value.startDate))
        || (value.lastReadDate !== null && !isValidLegacyCalendarDate(value.lastReadDate))
        || (value.dailyAdvanceDate !== null && !isValidLegacyCalendarDate(value.dailyAdvanceDate))
        || !isSafeIntegerInRange(value.dailyAdvanceCount, 0, Number.MAX_SAFE_INTEGER)
        || (value.dailyAdvanceDate === null && value.dailyAdvanceCount > 0)
        || !Number.isSafeInteger(value.dayOffset)
        || typeof value.secretShopUnlocked !== 'boolean'
        || (value.quizDate !== null && !isValidLegacyCalendarDate(value.quizDate))
        || !isSafeIntegerInRange(value.quizAttempts, 0, 2)
        || typeof value.quizSolved !== 'boolean'
        || typeof value.quizSkipped !== 'boolean'
        || (value.quizKey !== null && !isValidQuizKey(value.quizKey))
        || (value.quizRewardDate !== null && !isValidLegacyCalendarDate(value.quizRewardDate))
        || ![0, 5, 10].includes(value.quizRewardAmount)
        || ((value.quizRewardDate === null) !== (value.quizRewardAmount === 0))) {
        return invalidRestartReadingResponse();
    }
    return {
        currentDay: value.currentDay,
        readCount: value.readCount,
        readingEpoch: value.readingEpoch,
        score: value.score,
        talent: value.talent,
        streak: value.streak,
        maxStreak: value.maxStreak,
        startDate: value.startDate,
        lastReadDate: value.lastReadDate,
        dailyAdvanceDate: value.dailyAdvanceDate,
        dailyAdvanceCount: value.dailyAdvanceCount,
        recentReadDates: normalizeRestartReadDates(value.recentReadDates),
        achievements: normalizeRestartAchievements(value.achievements),
        dayOffset: value.dayOffset,
        secretShopUnlocked: value.secretShopUnlocked,
        quizDate: value.quizDate,
        quizAttempts: value.quizAttempts,
        quizSolved: value.quizSolved,
        quizSkipped: value.quizSkipped,
        quizKey: value.quizKey,
        quizRewardDate: value.quizRewardDate,
        quizRewardAmount: value.quizRewardAmount,
    };
};

const normalizeRestartRosters = (value) => {
    if (!Array.isArray(value) || value.length > 3) return invalidRestartReadingResponse();
    const normalized = value.map((row) => {
        if (!hasExactKeys(row, RESTART_READING_ROSTER_KEYS)
            || !isValidCanonicalOrgId(row.orgId)
            || !isSafeIntegerInRange(row.currentDay, 1, 365)
            || !isSafeIntegerInRange(row.readCount, 1, Number.MAX_SAFE_INTEGER)
            || !isSafeIntegerInRange(row.score, 0, Number.MAX_SAFE_INTEGER)
            || !isSafeIntegerInRange(row.streak, 0, Number.MAX_SAFE_INTEGER)
            || (row.lastReadDate !== null && !isValidLegacyCalendarDate(row.lastReadDate))
            || !isSafeIntegerInRange(row.talent, 0, MAX_TALENT_BALANCE)) {
            return invalidRestartReadingResponse();
        }
        return { ...row };
    });
    if (normalized.some((row, index) => (
        index > 0 && compareCanonicalIds(normalized[index - 1].orgId, row.orgId) >= 0
    ))) return invalidRestartReadingResponse();
    return normalized;
};

export const validateRestartReadingResponse = (payload, result, expectedRequestId) => {
    if (!hasExactKeys(payload, RESTART_READING_REQUEST_KEYS)
        || !isSafeIntegerInRange(payload.cycle, 1, Number.MAX_SAFE_INTEGER)
        || !isSafeIntegerInRange(payload.day, 1, 365)
        || !isSafeIntegerInRange(payload.readingEpoch, 0, Number.MAX_SAFE_INTEGER)
        || !ACTIVITY_REQUEST_ID_PATTERN.test(expectedRequestId)
        || !hasExactKeys(result, RESTART_READING_RESPONSE_KEYS)
        || result.ok !== true || result.action !== 'restartReading'
        || result.requestId !== expectedRequestId
        || typeof result.alreadyCompleted !== 'boolean'
        || typeof result.committed !== 'boolean'
        || (result.alreadyCompleted && !result.committed)
        || !isValidLegacyCalendarDate(result.calendarDate)
        || !hasExactKeys(result.state, RESTART_READING_STATE_KEYS)) {
        return invalidRestartReadingResponse();
    }
    const user = normalizeRestartStateUser(result.state.user);
    const rosters = normalizeRestartRosters(result.state.rosters);
    const submitted = normalizeRestartPosition(payload);

    let normalizedResult;
    if (hasExactKeys(result.result, RESTART_READING_RESULT_KEYS)
        && result.result.status === 'restarted') {
        const previous = normalizeRestartPosition(result.result.previous);
        const next = normalizeRestartPosition(result.result.next);
        if (!result.committed
            || previous.cycle !== submitted.cycle
            || previous.day !== submitted.day
            || previous.readingEpoch !== submitted.readingEpoch
            || next.cycle !== submitted.cycle
            || next.day !== 1
            || next.readingEpoch !== submitted.readingEpoch + 1
            || !Number.isSafeInteger(next.readingEpoch)
            || user.readCount < next.cycle
            || user.readingEpoch < next.readingEpoch
            || (!result.alreadyCompleted && (
                user.currentDay !== 1
                || user.readCount !== next.cycle
                || user.readingEpoch !== next.readingEpoch
                || user.score !== 0
                || user.streak !== 0
                || user.startDate !== result.calendarDate
                || user.lastReadDate !== null
                || user.achievements.length !== 0
                || user.dayOffset !== 0
                || user.quizDate !== null
                || user.quizAttempts !== 0
                || user.quizSolved
                || user.quizSkipped
                || user.quizKey !== null
                || rosters.some(row => row.currentDay !== 1
                    || row.readCount !== next.cycle
                    || row.score !== 0
                    || row.streak !== 0
                    || row.lastReadDate !== null)
            ))) {
            return invalidRestartReadingResponse();
        }
        normalizedResult = { status: 'restarted', previous, next };
    } else if (hasExactKeys(result.result, RESTART_READING_POSITION_KEYS)
        && result.result.status === 'positionMismatch') {
        const expected = normalizeRestartPosition(result.result.expected);
        const received = normalizeRestartPosition(result.result.received);
        if (result.alreadyCompleted || result.committed
            || received.cycle !== submitted.cycle
            || received.day !== submitted.day
            || received.readingEpoch !== submitted.readingEpoch
            || expected.cycle !== user.readCount
            || expected.day !== user.currentDay
            || expected.readingEpoch !== user.readingEpoch
            || (expected.cycle === received.cycle
                && expected.day === received.day
                && expected.readingEpoch === received.readingEpoch)) {
            return invalidRestartReadingResponse();
        }
        normalizedResult = { status: 'positionMismatch', expected, received };
    } else {
        return invalidRestartReadingResponse();
    }

    return {
        ok: true,
        action: 'restartReading',
        requestId: expectedRequestId,
        alreadyCompleted: result.alreadyCompleted,
        committed: result.committed,
        calendarDate: result.calendarDate,
        result: normalizedResult,
        state: { user, rosters },
    };
};

export const restartReading = (cycle, day, options = {}) => {
    const readingEpoch = options.readingEpoch ?? 0;
    const payload = { cycle, day, readingEpoch };
    if (!isSafeIntegerInRange(cycle, 1, Number.MAX_SAFE_INTEGER)
        || !isSafeIntegerInRange(day, 1, 365)
        || !isSafeIntegerInRange(readingEpoch, 0, Number.MAX_SAFE_INTEGER)) {
        throw new PlatformApiError('Day 1 재시작 위치가 올바르지 않습니다.', {
            code: 'INVALID_PAYLOAD', status: 0, retryable: false,
        });
    }
    const requestId = options.requestId || createRequestId();
    if (!ACTIVITY_REQUEST_ID_PATTERN.test(requestId)) {
        throw new PlatformApiError('Day 1 재시작 요청 번호가 올바르지 않습니다.', {
            code: 'INVALID_PAYLOAD', status: 0, retryable: false,
        });
    }
    const callOptions = { ...options };
    delete callOptions.readingEpoch;
    return callPlatformApi('restartReading', payload, { ...callOptions, requestId })
        .then(result => validateRestartReadingResponse(payload, result, requestId));
};

const invalidSyncAchievementsResponse = () => {
    throw new PlatformApiError('업적 동기화 결과를 안전하게 확인하지 못했습니다.', {
        code: 'INVALID_RESPONSE', status: 200, retryable: true,
    });
};

const normalizeSyncAchievementIds = (value) => {
    if (!Array.isArray(value) || value.length > SYNC_ACHIEVEMENT_IDS.length) {
        return invalidSyncAchievementsResponse();
    }
    let previousCatalogIndex = -1;
    const normalized = value.map((achievementId) => {
        const catalogIndex = SYNC_ACHIEVEMENT_INDEX.get(achievementId);
        if (!Number.isSafeInteger(catalogIndex) || catalogIndex <= previousCatalogIndex) {
            return invalidSyncAchievementsResponse();
        }
        previousCatalogIndex = catalogIndex;
        return achievementId;
    });
    return normalized;
};

export const validateSyncAchievementsResponse = (payload, result, expectedRequestId) => {
    if (!hasExactKeys(payload, SYNC_ACHIEVEMENTS_REQUEST_KEYS)
        || !SYNC_ACHIEVEMENT_TRIGGERS.has(payload.trigger)
        || !ACTIVITY_REQUEST_ID_PATTERN.test(expectedRequestId)
        || !hasExactKeys(result, SYNC_ACHIEVEMENTS_RESPONSE_KEYS)
        || result.ok !== true
        || result.action !== 'syncAchievements'
        || result.requestId !== expectedRequestId
        || typeof result.alreadyCompleted !== 'boolean'
        || typeof result.committed !== 'boolean'
        || !hasExactKeys(result.result, SYNC_ACHIEVEMENTS_RESULT_KEYS)
        || result.result.trigger !== payload.trigger) {
        return invalidSyncAchievementsResponse();
    }

    const newIds = normalizeSyncAchievementIds(result.result.newIds);
    const hasNewAchievements = newIds.length > 0;
    const validOutcome = (
        (!result.alreadyCompleted && !result.committed && !hasNewAchievements)
        || (!result.alreadyCompleted && result.committed && hasNewAchievements)
        || (result.alreadyCompleted && result.committed && hasNewAchievements)
    );
    if (!validOutcome) return invalidSyncAchievementsResponse();

    return {
        ok: true,
        action: 'syncAchievements',
        requestId: expectedRequestId,
        alreadyCompleted: result.alreadyCompleted,
        committed: result.committed,
        result: { trigger: payload.trigger, newIds },
    };
};

export const syncAchievements = (trigger, options = {}) => {
    if (!SYNC_ACHIEVEMENT_TRIGGERS.has(trigger)) {
        throw new PlatformApiError('업적 동기화 종류가 올바르지 않습니다.', {
            code: 'INVALID_PAYLOAD', status: 0, retryable: false,
        });
    }
    const requestId = options.requestId || createRequestId();
    if (!ACTIVITY_REQUEST_ID_PATTERN.test(requestId)) {
        throw new PlatformApiError('업적 동기화 요청 번호가 올바르지 않습니다.', {
            code: 'INVALID_PAYLOAD', status: 0, retryable: false,
        });
    }
    const payload = { trigger };
    return callPlatformApi('syncAchievements', payload, { ...options, requestId })
        .then(result => validateSyncAchievementsResponse(payload, result, requestId));
};

const invalidMigratePersonalTalentWalletResponse = () => {
    throw new PlatformApiError('개인 달란트 지갑 이관 결과를 안전하게 확인하지 못했습니다.', {
        code: 'INVALID_RESPONSE', status: 200, retryable: true,
    });
};

export const validateMigratePersonalTalentWalletResponse = (result, expectedRequestId) => {
    if (!ACTIVITY_REQUEST_ID_PATTERN.test(expectedRequestId)
        || !hasExactKeys(result, MIGRATE_PERSONAL_TALENT_WALLET_RESPONSE_KEYS)
        || result.ok !== true
        || result.action !== 'migratePersonalTalentWallet'
        || result.requestId !== expectedRequestId
        || typeof result.alreadyCompleted !== 'boolean'
        || typeof result.committed !== 'boolean'
        || !hasExactKeys(result.result, MIGRATE_PERSONAL_TALENT_WALLET_RESULT_KEYS)) {
        return invalidMigratePersonalTalentWalletResponse();
    }

    const status = result.result.status;
    const validOutcome = (
        (status === 'migrated'
            && !result.alreadyCompleted
            && result.committed)
        || (status === 'migrated'
            && result.alreadyCompleted
            && result.committed)
        || (status === 'alreadyMigrated'
            && !result.alreadyCompleted
            && !result.committed)
        || (status === 'primaryMissing'
            && !result.alreadyCompleted
            && !result.committed)
    );
    if (!validOutcome) return invalidMigratePersonalTalentWalletResponse();

    return {
        ok: true,
        action: 'migratePersonalTalentWallet',
        requestId: expectedRequestId,
        alreadyCompleted: result.alreadyCompleted,
        committed: result.committed,
        result: { status },
    };
};

// 지갑의 조직·금액·uid는 모두 서버가 인증 사용자 문서에서 결정한다.
// 브라우저는 멱등 requestId 외에는 어떤 이관 상태도 보내지 않는다.
export const migratePersonalTalentWallet = (options = {}) => {
    const requestId = options.requestId || createRequestId();
    if (!ACTIVITY_REQUEST_ID_PATTERN.test(requestId)) {
        throw new PlatformApiError('개인 달란트 지갑 이관 요청 번호가 올바르지 않습니다.', {
            code: 'INVALID_PAYLOAD', status: 0, retryable: false,
        });
    }
    return callPlatformApi('migratePersonalTalentWallet', {}, { ...options, requestId })
        .then(result => validateMigratePersonalTalentWalletResponse(result, requestId));
};

const invalidConvertToPersonalAccountResponse = () => {
    throw new PlatformApiError('개인 계정 전환 결과를 안전하게 확인하지 못했습니다.', {
        code: 'INVALID_RESPONSE', status: 200, retryable: true,
    });
};

export const validateConvertToPersonalAccountResponse = (result, expectedRequestId) => {
    if (!ACTIVITY_REQUEST_ID_PATTERN.test(expectedRequestId)
        || !hasExactKeys(result, CONVERT_TO_PERSONAL_ACCOUNT_RESPONSE_KEYS)
        || result.ok !== true
        || result.action !== 'convertToPersonalAccount'
        || result.requestId !== expectedRequestId
        || typeof result.alreadyCompleted !== 'boolean'
        || result.committed !== true
        || !hasExactKeys(result.result, CONVERT_TO_PERSONAL_ACCOUNT_RESULT_KEYS)
        || result.result.status !== 'converted'
        || !isValidCanonicalOrgId(result.result.primaryOrgId)
        || result.result.primaryOrgId === 'unaffiliated_v1') {
        return invalidConvertToPersonalAccountResponse();
    }
    return {
        ok: true,
        action: 'convertToPersonalAccount',
        requestId: expectedRequestId,
        alreadyCompleted: result.alreadyCompleted,
        committed: true,
        result: {
            status: 'converted',
            primaryOrgId: result.result.primaryOrgId,
        },
    };
};

// 이메일 변경 뒤 새 ID token의 email claim으로 본인 전환을 검증한다.
// 브라우저는 멱등 requestId 외에 users/roster 상태를 보내지 않는다.
export const convertToPersonalAccount = (options = {}) => {
    const requestId = options.requestId || createRequestId();
    if (!ACTIVITY_REQUEST_ID_PATTERN.test(requestId)) {
        throw new PlatformApiError('개인 계정 전환 요청 번호가 올바르지 않습니다.', {
            code: 'INVALID_PAYLOAD', status: 0, retryable: false,
        });
    }
    return callPlatformApi('convertToPersonalAccount', {}, { ...options, requestId })
        .then(result => validateConvertToPersonalAccountResponse(result, requestId));
};

const invalidJoinSoloCommunityResponse = () => {
    throw new PlatformApiError('혼자 읽기 모임 참여 결과를 안전하게 확인하지 못했습니다.', {
        code: 'INVALID_RESPONSE', status: 200, retryable: true,
    });
};

export const validateJoinSoloCommunityResponse = (result, expectedRequestId) => {
    if (!ACTIVITY_REQUEST_ID_PATTERN.test(expectedRequestId)
        || !hasExactKeys(result, JOIN_SOLO_COMMUNITY_RESPONSE_KEYS)
        || result.ok !== true
        || result.action !== 'joinSoloCommunity'
        || result.requestId !== expectedRequestId
        || typeof result.alreadyCompleted !== 'boolean'
        || typeof result.committed !== 'boolean'
        || !hasExactKeys(result.result, JOIN_SOLO_COMMUNITY_RESULT_KEYS)) {
        return invalidJoinSoloCommunityResponse();
    }

    const status = result.result.status;
    const committedStatus = status === 'joined'
        || status === 'rosterRepaired'
        || status === 'primaryRepaired';
    const validOutcome = (
        (committedStatus && result.committed)
        || (status === 'alreadyJoined'
            && !result.alreadyCompleted
            && !result.committed)
    );
    if (!validOutcome || (result.alreadyCompleted && !committedStatus)) {
        return invalidJoinSoloCommunityResponse();
    }

    return {
        ok: true,
        action: 'joinSoloCommunity',
        requestId: expectedRequestId,
        alreadyCompleted: result.alreadyCompleted,
        committed: result.committed,
        result: { status },
    };
};

// uid·조직·진도·지갑은 전부 서버 users/roster에서 결정한다.
// 브라우저는 멱등 requestId 외에 어떤 상태도 보내지 않는다.
export const joinSoloCommunity = (options = {}) => {
    const requestId = options.requestId || createRequestId();
    if (!ACTIVITY_REQUEST_ID_PATTERN.test(requestId)) {
        throw new PlatformApiError('혼자 읽기 모임 참여 요청 번호가 올바르지 않습니다.', {
            code: 'INVALID_PAYLOAD', status: 0, retryable: false,
        });
    }
    return callPlatformApi('joinSoloCommunity', {}, { ...options, requestId })
        .then(result => validateJoinSoloCommunityResponse(result, requestId));
};

const invalidNormalizeLegacyReadingPositionResponse = () => {
    throw new PlatformApiError('읽기 진도 보정 결과를 안전하게 확인하지 못했습니다.', {
        code: 'INVALID_RESPONSE', status: 200, retryable: true,
    });
};

export const validateNormalizeLegacyReadingPositionResponse = (result, expectedRequestId) => {
    if (!ACTIVITY_REQUEST_ID_PATTERN.test(expectedRequestId)
        || !hasExactKeys(result, NORMALIZE_LEGACY_READING_POSITION_RESPONSE_KEYS)
        || result.ok !== true
        || result.action !== 'normalizeLegacyReadingPosition'
        || result.requestId !== expectedRequestId
        || typeof result.alreadyCompleted !== 'boolean'
        || typeof result.committed !== 'boolean'
        || !hasExactKeys(result.result, NORMALIZE_LEGACY_READING_POSITION_RESULT_KEYS)
        || !isSafeIntegerInRange(result.result.currentDay, 1, 365)
        || !isSafeIntegerInRange(result.result.readCount, 1, Number.MAX_SAFE_INTEGER)) {
        return invalidNormalizeLegacyReadingPositionResponse();
    }

    const { status, currentDay, readCount } = result.result;
    const validOutcome = (
        (status === 'normalized' && result.committed)
        || (status === 'alreadyNormalized'
            && !result.alreadyCompleted
            && !result.committed)
    );
    if (!validOutcome || (result.alreadyCompleted && status !== 'normalized')) {
        return invalidNormalizeLegacyReadingPositionResponse();
    }

    return {
        ok: true,
        action: 'normalizeLegacyReadingPosition',
        requestId: expectedRequestId,
        alreadyCompleted: result.alreadyCompleted,
        committed: result.committed,
        result: { status, currentDay, readCount },
    };
};

// uid·진도·회차는 인증 사용자 문서에서만 읽는다. 브라우저는 멱등 키 외에
// 어떤 진도 값도 서버에 보내지 않는다.
export const normalizeLegacyReadingPosition = (options = {}) => {
    const requestId = options.requestId || createRequestId();
    if (!ACTIVITY_REQUEST_ID_PATTERN.test(requestId)) {
        throw new PlatformApiError('읽기 진도 보정 요청 번호가 올바르지 않습니다.', {
            code: 'INVALID_PAYLOAD', status: 0, retryable: false,
        });
    }
    return callPlatformApi('normalizeLegacyReadingPosition', {}, { ...options, requestId })
        .then(result => validateNormalizeLegacyReadingPositionResponse(result, requestId));
};

const invalidCompleteMemberOnboardingResponse = () => {
    throw new PlatformApiError('최초 소속 설정 결과를 안전하게 확인하지 못했습니다.', {
        code: 'INVALID_RESPONSE', status: 200, retryable: true,
    });
};

const isSafeMembershipName = (value, { optional = false } = {}) => (
    typeof value === 'string'
    && (optional ? value.length <= 200 : value.length >= 1 && value.length <= 200)
    && value === value.trim()
    && !/[\u0000-\u001f\u007f]/.test(value)
);

export const validateCompleteMemberOnboardingResponse = (
    payload,
    result,
    expectedRequestId,
) => {
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)
        || !ACTIVITY_REQUEST_ID_PATTERN.test(expectedRequestId)
        || !hasExactKeys(result, COMPLETE_MEMBER_ONBOARDING_RESPONSE_KEYS)
        || result.ok !== true
        || result.action !== 'completeMemberOnboarding'
        || result.requestId !== expectedRequestId
        || typeof result.alreadyCompleted !== 'boolean'
        || typeof result.committed !== 'boolean'
        || !hasExactKeys(result.result, COMPLETE_MEMBER_ONBOARDING_RESULT_KEYS)) {
        return invalidCompleteMemberOnboardingResponse();
    }

    const membership = result.result;
    const exactEcho = membership.orgId === payload.orgId
        && membership.planId === payload.planId
        && membership.departmentId === payload.departmentId
        && membership.subgroupId === payload.subgroupId;
    const validIds = isValidCanonicalOrgId(membership.orgId)
        && isValidCanonicalOrgId(membership.departmentId)
        && (membership.subgroupId === '' || isValidCanonicalOrgId(membership.subgroupId));
    const validNames = isSafeMembershipName(membership.departmentName)
        && isSafeMembershipName(membership.subgroupName, { optional: true })
        && ((membership.subgroupId === '') === (membership.subgroupName === ''));
    const validOutcome = (
        (membership.status === 'completed' && result.committed)
        || (membership.status === 'alreadyCompleted'
            && !result.alreadyCompleted
            && !result.committed)
    );
    if (!exactEcho || !validIds || !validNames
        || !MEMBER_ONBOARDING_PLAN_IDS.has(membership.planId)
        || !validOutcome
        || (result.alreadyCompleted && membership.status !== 'completed')) {
        return invalidCompleteMemberOnboardingResponse();
    }

    return {
        ok: true,
        action: 'completeMemberOnboarding',
        requestId: expectedRequestId,
        alreadyCompleted: result.alreadyCompleted,
        committed: result.committed,
        result: {
            status: membership.status,
            orgId: membership.orgId,
            planId: membership.planId,
            departmentId: membership.departmentId,
            departmentName: membership.departmentName,
            subgroupId: membership.subgroupId,
            subgroupName: membership.subgroupName,
        },
    };
};

export const completeMemberOnboarding = (input, options = {}) => {
    const payload = {
        orgId: input?.orgId,
        planId: input?.planId,
        departmentId: input?.departmentId,
        subgroupId: input?.subgroupId ?? '',
    };
    if (!isValidCanonicalOrgId(payload.orgId)
        || !MEMBER_ONBOARDING_PLAN_IDS.has(payload.planId)
        || !isValidCanonicalOrgId(payload.departmentId)
        || !(payload.subgroupId === '' || isValidCanonicalOrgId(payload.subgroupId))) {
        throw new PlatformApiError('최초 소속 설정 요청이 올바르지 않습니다.', {
            code: 'INVALID_PAYLOAD', status: 0, retryable: false,
        });
    }
    const requestId = options.requestId || createRequestId();
    if (!ACTIVITY_REQUEST_ID_PATTERN.test(requestId)) {
        throw new PlatformApiError('최초 소속 설정 요청 번호가 올바르지 않습니다.', {
            code: 'INVALID_PAYLOAD', status: 0, retryable: false,
        });
    }
    return callPlatformApi('completeMemberOnboarding', payload, { ...options, requestId })
        .then(result => validateCompleteMemberOnboardingResponse(payload, result, requestId));
};

const invalidDailyVideoResponse = () => {
    throw new PlatformApiError('매일 영상 정보를 안전하게 확인하지 못했습니다.', {
        code: 'INVALID_RESPONSE', status: 200, retryable: true,
    });
};

const normalizeDailyVideoUrl = value => {
    if (typeof value !== 'string' || !value.trim()) return null;
    const normalized = value.trim();
    if (normalized !== value) return null;
    const authority = /^https:\/\/([^/?#]+)(?:[/?#]|$)/i.exec(normalized)?.[1];
    if (!authority || !DAILY_VIDEO_YOUTUBE_HOSTS.has(authority.toLowerCase())) return null;
    try {
        const parsed = new URL(normalized);
        if (parsed.protocol !== 'https:' || parsed.username || parsed.password || parsed.port
            || !DAILY_VIDEO_YOUTUBE_HOSTS.has(parsed.hostname)) return null;
        return parsed.toString() === value ? value : null;
    } catch {
        return null;
    }
};

const normalizeDailyVideoEntry = value => {
    if (value === null) return null;
    if (!isResponseRecord(value)
        || Object.keys(value).some(key => !DAILY_VIDEO_ENTRY_KEYS.has(key))) {
        return invalidDailyVideoResponse();
    }
    const url = normalizeDailyVideoUrl(value.url);
    if (!url || !Array.isArray(value.chapters) || value.chapters.length > 3) {
        return invalidDailyVideoResponse();
    }
    const labels = new Set();
    const chapters = value.chapters.map(chapter => {
        if (!isResponseRecord(chapter)
            || Object.keys(chapter).some(key => !DAILY_VIDEO_CHAPTER_KEYS.has(key))
            || !DAILY_VIDEO_CHAPTER_LABELS.has(chapter.label)
            || labels.has(chapter.label)
            || !Number.isSafeInteger(chapter.sec) || chapter.sec < 0) {
            return invalidDailyVideoResponse();
        }
        labels.add(chapter.label);
        return { label: chapter.label, sec: chapter.sec };
    });
    const entry = { url, chapters };
    if (value.title !== undefined) {
        if (typeof value.title !== 'string') return invalidDailyVideoResponse();
        entry.title = value.title;
    }
    if (value.publishedAt !== undefined) {
        if (typeof value.publishedAt !== 'string' || !Number.isFinite(Date.parse(value.publishedAt))) {
            return invalidDailyVideoResponse();
        }
        entry.publishedAt = value.publishedAt;
    }
    if (value.matchedDate !== undefined) {
        if (typeof value.matchedDate !== 'boolean') return invalidDailyVideoResponse();
        entry.matchedDate = value.matchedDate;
    }
    return entry;
};

const normalizeDailyVideoPayload = value => {
    if (value === null) return null;
    if (!isResponseRecord(value)
        || Object.keys(value).some(key => !DAILY_VIDEO_PAYLOAD_KEYS.has(key))
        || typeof value.autoFilled !== 'boolean'
        || !Object.prototype.hasOwnProperty.call(value, 'adult')
        || !Object.prototype.hasOwnProperty.call(value, 'kids')) {
        return invalidDailyVideoResponse();
    }
    const payload = {
        adult: normalizeDailyVideoEntry(value.adult),
        kids: normalizeDailyVideoEntry(value.kids),
        autoFilled: value.autoFilled,
    };
    if (!payload.adult && !payload.kids
        || (payload.autoFilled && [payload.adult, payload.kids].some(entry => entry && entry.matchedDate !== true))) {
        return invalidDailyVideoResponse();
    }
    return payload;
};

const isValidServiceDate = value => {
    if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
    const [year, month, day] = value.split('-').map(Number);
    const parsed = new Date(Date.UTC(year, month - 1, day));
    return Number.isFinite(parsed.getTime())
        && parsed.getUTCFullYear() === year
        && parsed.getUTCMonth() === month - 1
        && parsed.getUTCDate() === day;
};

export const validateDailyVideoResolveResponse = (result, expectedRequestId) => {
    if (!isResponseRecord(result)
        || Object.keys(result).some(key => !DAILY_VIDEO_RESPONSE_KEYS.has(key))
        || result.ok !== true || result.action !== 'resolveDailyVideo'
        || result.requestId !== expectedRequestId
        || !isValidServiceDate(result.serviceDate)
        || typeof result.pending !== 'boolean'
        || !Object.prototype.hasOwnProperty.call(result, 'video')
        || !Object.prototype.hasOwnProperty.call(result, 'transient')) {
        return invalidDailyVideoResponse();
    }
    const hasRetryAfter = Object.prototype.hasOwnProperty.call(result, 'retryAfterMs');
    if ((result.pending && (!hasRetryAfter || !Number.isSafeInteger(result.retryAfterMs)
        || result.retryAfterMs < 1 || result.retryAfterMs > 3_600_000))
        || (!result.pending && hasRetryAfter)) {
        return invalidDailyVideoResponse();
    }
    const video = normalizeDailyVideoPayload(result.video);
    const transient = normalizeDailyVideoPayload(result.transient);
    if ((!result.pending && transient !== null)
        || (transient !== null && transient.autoFilled !== true)
        || (transient !== null && video?.autoFilled === false)) {
        return invalidDailyVideoResponse();
    }
    const normalized = {
        ok: true,
        action: 'resolveDailyVideo',
        requestId: expectedRequestId,
        serviceDate: result.serviceDate,
        video,
        transient,
        pending: result.pending,
    };
    if (result.pending) normalized.retryAfterMs = result.retryAfterMs;
    return normalized;
};

export const resolveDailyVideo = (options = {}) => {
    const requestId = options.requestId || createRequestId();
    const timeoutMs = Number.isFinite(options.timeoutMs) && options.timeoutMs > 0
        ? options.timeoutMs
        : DAILY_VIDEO_TIMEOUT_MS;
    return callPlatformApi('resolveDailyVideo', {}, { ...options, requestId, timeoutMs })
        .then(result => validateDailyVideoResolveResponse(result, requestId));
};

const invalidAdminDailyVideoPreviewResponse = () => {
    throw new PlatformApiError('매일 영상 미리보기 정보를 안전하게 확인하지 못했습니다.', {
        code: 'INVALID_RESPONSE', status: 200, retryable: true,
    });
};

export const validateAdminDailyVideoPreviewResponse = (payload, result, expectedRequestId) => {
    if (!isResponseRecord(payload)
        || Object.keys(payload).some(key => !ADMIN_DAILY_VIDEO_PREVIEW_REQUEST_KEYS.has(key))
        || !Object.prototype.hasOwnProperty.call(payload, 'adultPlaylistId')
        || !Object.prototype.hasOwnProperty.call(payload, 'kidsPlaylistId')
        || typeof payload.adultPlaylistId !== 'string'
        || typeof payload.kidsPlaylistId !== 'string'
        || !DAILY_VIDEO_PLAYLIST_ID_PATTERN.test(payload.adultPlaylistId)
        || (payload.kidsPlaylistId && !DAILY_VIDEO_PLAYLIST_ID_PATTERN.test(payload.kidsPlaylistId))
        || !isResponseRecord(result)
        || Object.keys(result).some(key => !ADMIN_DAILY_VIDEO_PREVIEW_RESPONSE_KEYS.has(key))
        || result.ok !== true || result.action !== 'adminPreviewDailyVideo'
        || result.requestId !== expectedRequestId
        || !isValidServiceDate(result.serviceDate)
        || !isResponseRecord(result.previews)
        || Object.keys(result.previews).some(key => !ADMIN_DAILY_VIDEO_PREVIEWS_KEYS.has(key))
        || !Object.prototype.hasOwnProperty.call(result.previews, 'adult')
        || !Object.prototype.hasOwnProperty.call(result.previews, 'kids')) {
        return invalidAdminDailyVideoPreviewResponse();
    }
    const adult = normalizeDailyVideoEntry(result.previews.adult);
    const kids = normalizeDailyVideoEntry(result.previews.kids);
    if ((adult && adult.matchedDate !== true)
        || (kids && kids.matchedDate !== true)
        || (!payload.kidsPlaylistId && kids !== null)) {
        return invalidAdminDailyVideoPreviewResponse();
    }
    return {
        ok: true,
        action: 'adminPreviewDailyVideo',
        requestId: expectedRequestId,
        serviceDate: result.serviceDate,
        previews: { adult, kids },
    };
};

export const adminPreviewDailyVideo = (input, options = {}) => {
    if (!isResponseRecord(input)) {
        throw new PlatformApiError('매일 영상 미리보기 설정이 올바르지 않습니다.', {
            code: 'INVALID_PAYLOAD', status: 0, retryable: false,
        });
    }
    const { adultPlaylistId, kidsPlaylistId = '', ...unknownFields } = input;
    if (Object.keys(unknownFields).length > 0
        || typeof adultPlaylistId !== 'string'
        || typeof kidsPlaylistId !== 'string') {
        throw new PlatformApiError('매일 영상 미리보기 설정이 올바르지 않습니다.', {
            code: 'INVALID_PAYLOAD', status: 0, retryable: false,
        });
    }
    const normalizedAdultPlaylistId = adultPlaylistId.trim();
    const normalizedKidsPlaylistId = kidsPlaylistId.trim();
    if (!DAILY_VIDEO_PLAYLIST_ID_PATTERN.test(normalizedAdultPlaylistId)
        || (normalizedKidsPlaylistId && !DAILY_VIDEO_PLAYLIST_ID_PATTERN.test(normalizedKidsPlaylistId))) {
        throw new PlatformApiError('매일 영상 재생목록 정보를 다시 확인해주세요.', {
            code: 'INVALID_PAYLOAD', status: 0, retryable: false,
        });
    }
    const payload = {
        adultPlaylistId: normalizedAdultPlaylistId,
        kidsPlaylistId: normalizedKidsPlaylistId,
    };
    const requestId = options.requestId || createRequestId();
    const timeoutMs = Number.isFinite(options.timeoutMs) && options.timeoutMs > 0
        ? options.timeoutMs
        : DAILY_VIDEO_TIMEOUT_MS;
    return callPlatformApi('adminPreviewDailyVideo', payload, { ...options, requestId, timeoutMs })
        .then(result => validateAdminDailyVideoPreviewResponse(payload, result, requestId));
};

const invalidRebuildPublicChurchesResponse = () => {
    throw new PlatformApiError('공개 교회 디렉토리 처리 결과를 안전하게 확인하지 못했습니다.', {
        code: 'INVALID_RESPONSE', status: 200, retryable: true,
    });
};

export const validateRebuildPublicChurchesResponse = (payload, result, expectedRequestId) => {
    if (!hasExactKeys(payload, REBUILD_PUBLIC_CHURCHES_REQUEST_KEYS)
        || typeof payload.dryRun !== 'boolean'
        || !ACTIVITY_REQUEST_ID_PATTERN.test(expectedRequestId)
        || !hasExactKeys(result, REBUILD_PUBLIC_CHURCHES_RESPONSE_KEYS)
        || result.ok !== true || result.action !== 'rebuildPublicChurches'
        || result.requestId !== expectedRequestId
        || result.dryRun !== payload.dryRun
        || typeof result.applied !== 'boolean'
        || result.applied !== !payload.dryRun
        || result.mode !== 'legacy'
        || !hasExactKeys(result.summary, REBUILD_PUBLIC_CHURCHES_SUMMARY_KEYS)
        || typeof result.summary.legacyChanged !== 'boolean'
        || [...REBUILD_PUBLIC_CHURCHES_SUMMARY_KEYS]
            .filter(key => key !== 'legacyChanged')
            .some(key => !Number.isSafeInteger(result.summary[key]) || result.summary[key] < 0)) {
        return invalidRebuildPublicChurchesResponse();
    }
    return {
        ok: true,
        action: 'rebuildPublicChurches',
        requestId: expectedRequestId,
        dryRun: result.dryRun,
        applied: result.applied,
        mode: 'legacy',
        summary: { ...result.summary },
    };
};

export const rebuildPublicChurches = (dryRun, options = {}) => {
    if (typeof dryRun !== 'boolean') {
        throw new PlatformApiError('공개 교회 디렉토리 요청 형식이 올바르지 않습니다.', {
            code: 'INVALID_PAYLOAD', status: 0, retryable: false,
        });
    }
    const payload = { dryRun };
    const requestId = options.requestId || createRequestId();
    if (!ACTIVITY_REQUEST_ID_PATTERN.test(requestId)) {
        throw new PlatformApiError('공개 교회 디렉토리 요청 번호가 올바르지 않습니다.', {
            code: 'INVALID_PAYLOAD', status: 0, retryable: false,
        });
    }
    const timeoutMs = Number.isFinite(options.timeoutMs) && options.timeoutMs > 0
        ? options.timeoutMs
        : PUBLIC_DIRECTORY_TIMEOUT_MS;
    return callPlatformApi('rebuildPublicChurches', payload, { ...options, requestId, timeoutMs })
        .then(result => validateRebuildPublicChurchesResponse(payload, result, requestId));
};

const invalidAdminSetChurchVisibilityResponse = () => {
    throw new PlatformApiError('교회 검색 노출 처리 결과를 안전하게 확인하지 못했습니다.', {
        code: 'INVALID_RESPONSE', status: 200, retryable: true,
    });
};

export const validateAdminSetChurchVisibilityResponse = (
    payload,
    result,
    expectedRequestId,
) => {
    if (!hasExactKeys(payload, ADMIN_SET_CHURCH_VISIBILITY_REQUEST_KEYS)
        || typeof payload.churchId !== 'string'
        || !payload.churchId || payload.churchId !== payload.churchId.trim()
        || payload.churchId.length > 128 || payload.churchId.includes('/')
        || payload.churchId === '.' || payload.churchId === '..'
        || payload.churchId === 'unaffiliated_v1'
        || /[\u0000-\u001f\u007f]/.test(payload.churchId)
        || typeof payload.hidden !== 'boolean'
        || !ACTIVITY_REQUEST_ID_PATTERN.test(expectedRequestId)
        || !hasExactKeys(result, ADMIN_SET_CHURCH_VISIBILITY_RESPONSE_KEYS)
        || result.ok !== true
        || result.action !== 'adminSetChurchVisibility'
        || result.requestId !== expectedRequestId
        || !['updated', 'alreadySet'].includes(result.status)
        || result.hidden !== payload.hidden) {
        return invalidAdminSetChurchVisibilityResponse();
    }
    return {
        ok: true,
        action: 'adminSetChurchVisibility',
        requestId: expectedRequestId,
        status: result.status,
        hidden: result.hidden,
    };
};

export const adminSetChurchVisibility = (input, options = {}) => {
    if (!isResponseRecord(input) || !hasExactKeys(input, ADMIN_SET_CHURCH_VISIBILITY_REQUEST_KEYS)) {
        throw new PlatformApiError('교회 검색 노출 요청 형식이 올바르지 않습니다.', {
            code: 'INVALID_PAYLOAD', status: 0, retryable: false,
        });
    }
    const churchId = typeof input.churchId === 'string' ? input.churchId.trim() : '';
    if (!churchId || churchId !== input.churchId || churchId.length > 128
        || churchId.includes('/') || churchId === '.' || churchId === '..'
        || churchId === 'unaffiliated_v1' || /[\u0000-\u001f\u007f]/.test(churchId)
        || typeof input.hidden !== 'boolean') {
        throw new PlatformApiError('교회 검색 노출 요청 형식이 올바르지 않습니다.', {
            code: 'INVALID_PAYLOAD', status: 0, retryable: false,
        });
    }
    const payload = { churchId, hidden: input.hidden };
    const requestId = options.requestId || createRequestId();
    if (!ACTIVITY_REQUEST_ID_PATTERN.test(requestId)) {
        throw new PlatformApiError('교회 검색 노출 요청 번호가 올바르지 않습니다.', {
            code: 'INVALID_PAYLOAD', status: 0, retryable: false,
        });
    }
    return callPlatformApi('adminSetChurchVisibility', payload, { ...options, requestId })
        .then(result => validateAdminSetChurchVisibilityResponse(payload, result, requestId));
};

const invalidAdminRenameChurchResponse = () => {
    throw new PlatformApiError('공동체 이름 변경 결과를 안전하게 확인하지 못했습니다.', {
        code: 'INVALID_RESPONSE', status: 200, retryable: true,
    });
};

export const validateAdminRenameChurchResponse = (payload, result, expectedRequestId) => {
    const validName = value => typeof value === 'string'
        && value === value.trim() && value.length >= 1 && value.length <= 200
        && !/[\u0000-\u001f\u007f]/.test(value);
    if (!hasExactKeys(payload, ADMIN_RENAME_CHURCH_REQUEST_KEYS)
        || typeof payload.churchId !== 'string'
        || !payload.churchId || payload.churchId !== payload.churchId.trim()
        || payload.churchId.length > 128 || payload.churchId.includes('/')
        || payload.churchId === '.' || payload.churchId === '..'
        || payload.churchId === 'unaffiliated_v1'
        || /[\u0000-\u001f\u007f]/.test(payload.churchId)
        || !validName(payload.name)
        || !ACTIVITY_REQUEST_ID_PATTERN.test(expectedRequestId)
        || !hasExactKeys(result, ADMIN_RENAME_CHURCH_RESPONSE_KEYS)
        || result.ok !== true || result.action !== 'adminRenameChurch'
        || result.requestId !== expectedRequestId
        || !['renamed', 'alreadyNamed'].includes(result.status)
        || result.churchId !== payload.churchId
        || !validName(result.previousName) || !validName(result.name)
        || result.name !== payload.name
        || (result.status === 'alreadyNamed' && result.previousName !== result.name)) {
        return invalidAdminRenameChurchResponse();
    }
    return {
        ok: true,
        action: 'adminRenameChurch',
        requestId: expectedRequestId,
        status: result.status,
        churchId: result.churchId,
        previousName: result.previousName,
        name: result.name,
    };
};

export const adminRenameChurch = (input, options = {}) => {
    if (!isResponseRecord(input) || !hasExactKeys(input, ADMIN_RENAME_CHURCH_REQUEST_KEYS)) {
        throw new PlatformApiError('공동체 이름 변경 요청 형식이 올바르지 않습니다.', {
            code: 'INVALID_PAYLOAD', status: 0, retryable: false,
        });
    }
    const churchId = typeof input.churchId === 'string' ? input.churchId.trim() : '';
    const name = typeof input.name === 'string' ? input.name.trim() : '';
    if (!churchId || churchId !== input.churchId || churchId.length > 128
        || churchId.includes('/') || churchId === '.' || churchId === '..'
        || churchId === 'unaffiliated_v1' || /[\u0000-\u001f\u007f]/.test(churchId)
        || !name || name !== input.name || name.length > 200
        || /[\u0000-\u001f\u007f]/.test(name)) {
        throw new PlatformApiError('공동체 이름 변경 요청 형식이 올바르지 않습니다.', {
            code: 'INVALID_PAYLOAD', status: 0, retryable: false,
        });
    }
    const payload = { churchId, name };
    const requestId = options.requestId || createRequestId();
    if (!ACTIVITY_REQUEST_ID_PATTERN.test(requestId)) {
        throw new PlatformApiError('공동체 이름 변경 요청 번호가 올바르지 않습니다.', {
            code: 'INVALID_PAYLOAD', status: 0, retryable: false,
        });
    }
    return callPlatformApi('adminRenameChurch', payload, { ...options, requestId })
        .then(result => validateAdminRenameChurchResponse(payload, result, requestId));
};

export const adminSetChurchLifecycle = (input, options = {}) => {
    if (!isResponseRecord(input) || !hasExactKeys(input, ADMIN_CHURCH_LIFECYCLE_REQUEST_KEYS)) {
        throw new PlatformApiError('공동체 활성 상태 요청 형식이 올바르지 않습니다.', { code: 'INVALID_PAYLOAD' });
    }
    const churchId = typeof input.churchId === 'string' ? input.churchId.trim() : '';
    if (!churchId || churchId !== input.churchId || churchId.length > 128 || churchId.includes('/')
        || churchId === '.' || churchId === '..' || churchId === 'unaffiliated_v1'
        || /[\u0000-\u001f\u007f]/.test(churchId) || typeof input.active !== 'boolean') {
        throw new PlatformApiError('공동체 활성 상태 요청 형식이 올바르지 않습니다.', { code: 'INVALID_PAYLOAD' });
    }
    const payload = { churchId, active: input.active };
    const requestId = options.requestId || createRequestId();
    return callPlatformApi('adminSetChurchLifecycle', payload, { ...options, requestId, timeoutMs: 120_000 })
        .then(response => {
            const result = response?.result;
            if (!hasExactKeys(response, new Set(['ok', 'action', 'requestId', 'result']))
                || response.ok !== true || response.action !== 'adminSetChurchLifecycle'
                || response.requestId !== requestId || !hasExactKeys(result, ADMIN_CHURCH_LIFECYCLE_RESULT_KEYS)
                || result.churchId !== churchId || result.active !== input.active
                || !['deactivated', 'restored', 'alreadySet'].includes(result.status)
                || ['affectedUsers', 'positiveRosterCount', 'positiveTalentTotal', 'pendingPurchaseCount']
                    .some(key => !Number.isSafeInteger(result[key]) || result[key] < 0)) {
                throw new PlatformApiError('공동체 활성 상태 결과를 안전하게 확인하지 못했습니다.', {
                    code: 'INVALID_RESPONSE', status: 200, retryable: true,
                });
            }
            return result;
        });
};

export const rebuildPlatformStats = ({ dryRun = true } = {}, options = {}) => {
    if (typeof dryRun !== 'boolean') {
        throw new PlatformApiError('통계 재계산 요청 형식이 올바르지 않습니다.', { code: 'INVALID_PAYLOAD' });
    }
    const requestId = options.requestId || createRequestId();
    return callPlatformApi('rebuildPlatformStats', { dryRun }, { ...options, requestId, timeoutMs: 120_000 })
        .then(response => {
            const result = response?.result;
            const statsKeys = ['total_readers', 'total_churches', 'readers_today', 'finished_total', 'today_date'];
            if (!hasExactKeys(response, new Set(['ok', 'action', 'requestId', 'result']))
                || response.ok !== true || response.action !== 'rebuildPlatformStats'
                || response.requestId !== requestId || !isResponseRecord(result)
                || !hasExactKeys(result, new Set(['dryRun', 'applied', 'expected', 'current', 'changed']))
                || result.dryRun !== dryRun || typeof result.applied !== 'boolean'
                || !isResponseRecord(result.expected) || !isResponseRecord(result.current)
                || !Array.isArray(result.changed) || result.changed.some(key => !statsKeys.includes(key))
                || statsKeys.slice(0, 4).some(key => !Number.isSafeInteger(result.expected[key]) || result.expected[key] < 0)
                || typeof result.expected.today_date !== 'string') {
                throw new PlatformApiError('통계 재계산 결과를 안전하게 확인하지 못했습니다.', { code: 'INVALID_RESPONSE', status: 200, retryable: true });
            }
            return result;
        });
};

const isCanonicalChurchAdminSignupText = (value, min, max) => (
    typeof value === 'string' && value === value.trim()
    && value.length >= min && value.length <= max
    && !/[\u0000-\u001f\u007f]/.test(value)
);

const isCanonicalChurchAdminDepartments = value => {
    if (!Array.isArray(value) || value.length < 1 || value.length > 50) return false;
    let subgroupCount = 0;
    const departmentIds = new Set();
    return value.every(department => {
        if (!isResponseRecord(department)
            || !hasExactKeys(department, new Set(['id', 'name', 'subgroups']))
            || !isCanonicalChurchAdminSignupText(department.id, 1, 128)
            || department.id.includes('/') || department.id === '.' || department.id === '..'
            || departmentIds.has(department.id)
            || !isCanonicalChurchAdminSignupText(department.name, 1, 100)
            || !Array.isArray(department.subgroups)
            || department.subgroups.length < 1 || department.subgroups.length > 100) return false;
        departmentIds.add(department.id);
        const subgroupIds = new Set();
        subgroupCount += department.subgroups.length;
        if (subgroupCount > 300) return false;
        return department.subgroups.every(subgroup => {
            if (!isResponseRecord(subgroup)
                || !hasExactKeys(subgroup, new Set(['id', 'name']))
                || !isCanonicalChurchAdminSignupText(subgroup.id, 1, 128)
                || subgroup.id.includes('/') || subgroup.id === '.' || subgroup.id === '..'
                || subgroupIds.has(subgroup.id)
                || !isCanonicalChurchAdminSignupText(subgroup.name, 1, 100)) return false;
            subgroupIds.add(subgroup.id);
            return true;
        });
    });
};

const validateCompleteChurchAdminSignupInput = input => {
    if (!isResponseRecord(input)
        || !hasExactKeys(input, COMPLETE_CHURCH_ADMIN_SIGNUP_REQUEST_KEYS)
        || !isCanonicalChurchAdminSignupText(input.name, 1, 50)
        || typeof input.contactEmail !== 'string'
        || input.contactEmail !== input.contactEmail.trim().toLowerCase()
        || input.contactEmail.length > 254
        || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.contactEmail)
        || /[\u0000-\u001f\u007f]/.test(input.contactEmail)
        || !isCanonicalChurchAdminSignupText(input.churchName, 1, 200)
        || !isCanonicalChurchAdminSignupText(input.pastorName, 1, 100)
        || !isCanonicalChurchAdminSignupText(input.denomination, 0, 100)
        || !isCanonicalChurchAdminSignupText(input.entryCode, 4, 128)
        || !isCanonicalChurchAdminDepartments(input.departments)
        || !isResponseRecord(input.consent)
        || !(input.password === null
            || (typeof input.password === 'string' && input.password.length >= 6
                && input.password.length <= 128
                && !/[\u0000-\u001f\u007f]/.test(input.password)))) {
        throw new PlatformApiError('교회 등록 요청 정보를 다시 확인해주세요.', {
            code: 'INVALID_PAYLOAD', status: 0, retryable: false,
        });
    }
    return {
        name: input.name,
        contactEmail: input.contactEmail,
        churchName: input.churchName,
        pastorName: input.pastorName,
        denomination: input.denomination,
        entryCode: input.entryCode,
        departments: input.departments.map(department => ({
            id: department.id,
            name: department.name,
            subgroups: department.subgroups.map(subgroup => ({ ...subgroup })),
        })),
        password: input.password,
        consent: { ...input.consent },
    };
};

export const completeChurchAdminSignup = (input, options = {}) => {
    const payload = validateCompleteChurchAdminSignupInput(input);
    const requestId = options.requestId || createRequestId();
    if (!ACTIVITY_REQUEST_ID_PATTERN.test(requestId)) {
        throw new PlatformApiError('교회 등록 요청 번호가 올바르지 않습니다.', {
            code: 'INVALID_PAYLOAD', status: 0, retryable: false,
        });
    }
    return callPlatformApi('completeChurchAdminSignup', payload, { ...options, requestId })
        .then(result => {
            if (!hasExactKeys(result, COMPLETE_CHURCH_ADMIN_SIGNUP_RESPONSE_KEYS)
                || result.ok !== true || result.action !== 'completeChurchAdminSignup'
                || result.requestId !== requestId
                || !['created', 'alreadyCompleted'].includes(result.status)
                || typeof result.churchId !== 'string'
                || !/^church_[0-9a-f]{32}$/i.test(result.churchId)) {
                throw new PlatformApiError('교회 등록 결과를 안전하게 확인하지 못했습니다.', {
                    code: 'INVALID_RESPONSE', status: 200, retryable: true,
                });
            }
            return {
                ok: true,
                action: 'completeChurchAdminSignup',
                requestId,
                status: result.status,
                churchId: result.churchId,
            };
        });
};

export const rotateChurchAccessCode = (input, options = {}) => {
    if (!isResponseRecord(input)
        || !hasExactKeys(input, ROTATE_CHURCH_ACCESS_CODE_REQUEST_KEYS)
        || !isCanonicalChurchAdminSignupText(input.churchId, 1, 128)
        || input.churchId.includes('/') || input.churchId === '.' || input.churchId === '..'
        || input.churchId === 'unaffiliated_v1'
        || !isCanonicalChurchAdminSignupText(input.entryCode, 4, 128)
        || !Number.isSafeInteger(input.expectedVersion)
        || input.expectedVersion < 0 || input.expectedVersion >= 999_999_999) {
        throw new PlatformApiError('입장코드 변경 요청 정보를 다시 확인해주세요.', {
            code: 'INVALID_PAYLOAD', status: 0, retryable: false,
        });
    }
    const payload = { ...input };
    const requestId = options.requestId || createRequestId();
    if (!ACTIVITY_REQUEST_ID_PATTERN.test(requestId)) {
        throw new PlatformApiError('입장코드 변경 요청 번호가 올바르지 않습니다.', {
            code: 'INVALID_PAYLOAD', status: 0, retryable: false,
        });
    }
    return callPlatformApi('rotateChurchAccessCode', payload, { ...options, requestId })
        .then(result => {
            if (!hasExactKeys(result, ROTATE_CHURCH_ACCESS_CODE_RESPONSE_KEYS)
                || result.ok !== true || result.action !== 'rotateChurchAccessCode'
                || result.requestId !== requestId
                || typeof result.alreadyCompleted !== 'boolean'
                || typeof result.committed !== 'boolean'
                || !isResponseRecord(result.result)
                || !hasExactKeys(result.result, ROTATE_CHURCH_ACCESS_CODE_RESULT_KEYS)
                || result.result.status !== 'rotated'
                || result.result.churchId !== payload.churchId
                || !Number.isSafeInteger(result.result.version)
                || result.result.version !== payload.expectedVersion + 1
                || (result.alreadyCompleted === result.committed)) {
                throw new PlatformApiError('입장코드 변경 결과를 안전하게 확인하지 못했습니다.', {
                    code: 'INVALID_RESPONSE', status: 200, retryable: true,
                });
            }
            return {
                ok: true,
                action: 'rotateChurchAccessCode',
                requestId,
                alreadyCompleted: result.alreadyCompleted,
                committed: result.committed,
                result: { ...result.result },
            };
        });
};

export const ensureUnaffiliatedChurch = (options = {}) => {
    const requestId = options.requestId || createRequestId();
    if (!ACTIVITY_REQUEST_ID_PATTERN.test(requestId)) {
        throw new PlatformApiError('무소속 공동체 점검 요청 번호가 올바르지 않습니다.', {
            code: 'INVALID_PAYLOAD', status: 0, retryable: false,
        });
    }
    return callPlatformApi('ensureUnaffiliatedChurch', {}, { ...options, requestId })
        .then(result => {
            if (!hasExactKeys(result, ENSURE_UNAFFILIATED_CHURCH_RESPONSE_KEYS)
                || result.ok !== true || result.action !== 'ensureUnaffiliatedChurch'
                || result.requestId !== requestId
                || typeof result.alreadyCompleted !== 'boolean'
                || typeof result.committed !== 'boolean'
                || !isResponseRecord(result.result)
                || !hasExactKeys(result.result, ENSURE_UNAFFILIATED_CHURCH_RESULT_KEYS)
                || result.result.status !== 'ensured'
                || result.result.churchId !== 'unaffiliated_v1'
                || (result.alreadyCompleted === result.committed)) {
                throw new PlatformApiError('무소속 공동체 점검 결과를 안전하게 확인하지 못했습니다.', {
                    code: 'INVALID_RESPONSE', status: 200, retryable: true,
                });
            }
            return {
                ok: true,
                action: 'ensureUnaffiliatedChurch',
                requestId,
                alreadyCompleted: result.alreadyCompleted,
                committed: result.committed,
                result: { ...result.result },
            };
        });
};

export const issueJoinTicket = ({ churchId, entryCode, purpose }, options = {}) => {
    const normalizedChurchId = typeof churchId === 'string' ? churchId.trim() : '';
    const normalizedEntryCode = typeof entryCode === 'string' ? entryCode.trim() : '';
    if (!normalizedChurchId || normalizedChurchId === 'unaffiliated_v1'
        || normalizedChurchId.length > 128 || normalizedChurchId.includes('/')
        || /[\u0000-\u001f\u007f]/.test(normalizedChurchId)
        || normalizedEntryCode.length < 4 || normalizedEntryCode.length > 128
        || !['memberSignup', 'personalSignup', 'joinCommunity'].includes(purpose)) {
        throw new PlatformApiError('입장코드 정보를 다시 확인해주세요.', {
            code: 'INVALID_PAYLOAD', status: 0, retryable: false,
        });
    }
    return callPlatformApiPublic('issueJoinTicket', {
        churchId: normalizedChurchId,
        entryCode: normalizedEntryCode,
        purpose,
    }, options);
};

export const joinCommunity = ({ churchId, entryCode = '', joinTicket = '', departmentId, subgroupId = '' }, options = {}) => {
    const safeId = (value, { optional = false } = {}) => {
        if (typeof value !== 'string') return null;
        const normalized = value.trim();
        if (optional && !normalized) return '';
        if (!normalized || normalized.length > 128 || normalized.includes('/') || /[\u0000-\u001f\u007f]/.test(normalized)) return null;
        return normalized;
    };
    const normalizedChurchId = safeId(churchId);
    const normalizedDepartmentId = safeId(departmentId);
    const normalizedSubgroupId = safeId(subgroupId, { optional: true });
    const normalizedEntryCode = typeof entryCode === 'string' ? entryCode.trim() : '';
    const normalizedJoinTicket = typeof joinTicket === 'string' ? joinTicket.trim() : '';
    if (!normalizedChurchId || !normalizedDepartmentId || normalizedSubgroupId === null
        || ((normalizedEntryCode.length >= 4 && normalizedEntryCode.length <= 128) === /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(normalizedJoinTicket))) {
        throw new PlatformApiError('공동체 참여 정보가 올바르지 않습니다.', {
            code: 'INVALID_PAYLOAD', status: 0, retryable: false,
        });
    }
    return callPlatformApi('joinCommunity', {
        churchId: normalizedChurchId,
        entryCode: normalizedEntryCode,
        joinTicket: normalizedJoinTicket,
        departmentId: normalizedDepartmentId,
        subgroupId: normalizedSubgroupId,
    }, options);
};

export const updateSelfSubgroupMembership = ({ churchId, operation, departmentId, subgroupId }, options = {}) => {
    const safeId = value => {
        if (typeof value !== 'string') return null;
        const normalized = value.trim();
        return normalized && normalized.length <= 128 && !normalized.includes('/')
            && !/[\u0000-\u001f\u007f]/.test(normalized) ? normalized : null;
    };
    const payload = {
        churchId: safeId(churchId),
        operation,
        departmentId: safeId(departmentId),
        subgroupId: safeId(subgroupId),
    };
    if (!payload.churchId || payload.churchId === 'unaffiliated_v1'
        || !['add', 'remove'].includes(operation)
        || !payload.departmentId || !payload.subgroupId) {
        throw new PlatformApiError('소그룹 참여 정보를 다시 확인해주세요.', {
            code: 'INVALID_PAYLOAD', status: 0, retryable: false,
        });
    }
    const requestId = options.requestId || createRequestId();
    return callPlatformApi('updateSelfSubgroupMembership', payload, { ...options, requestId })
        .then(result => {
            const allowedStatuses = new Set(['added', 'removed', 'alreadyJoined', 'alreadyLeft']);
            const membershipsValid = Array.isArray(result?.extraMemberships)
                && result.extraMemberships.length <= 3
                && result.extraMemberships.every(membership => isResponseRecord(membership)
                    && hasExactKeys(membership, new Set([
                        'departmentId', 'departmentName', 'subgroupId', 'subgroupName',
                    ]))
                    && ['departmentId', 'departmentName', 'subgroupId', 'subgroupName']
                        .every(key => typeof membership[key] === 'string' && membership[key].length > 0));
            if (!hasExactKeys(result, new Set([
                'ok', 'action', 'requestId', 'status', 'churchId', 'extraMemberships',
            ])) || result.ok !== true || result.action !== 'updateSelfSubgroupMembership'
                || result.requestId !== requestId || result.churchId !== payload.churchId
                || !allowedStatuses.has(result.status) || !membershipsValid) {
                throw new PlatformApiError('소그룹 변경 결과를 안전하게 확인하지 못했습니다.', {
                    code: 'INVALID_RESPONSE', status: 200, retryable: true,
                });
            }
            return result;
        });
};

export const purchaseItem = ({ churchId, itemId, departmentId, marketId }, options = {}) => {
    const safeId = value => {
        if (typeof value !== 'string') return null;
        const normalized = value.trim();
        return normalized && normalized.length <= 128 && !normalized.includes('/')
            && !/[\u0000-\u001f\u007f]/.test(normalized) ? normalized : null;
    };
    const payload = {
        churchId: safeId(churchId), itemId: safeId(itemId),
        departmentId: safeId(departmentId), marketId: safeId(marketId),
    };
    if (Object.values(payload).some(value => !value)) {
        throw new PlatformApiError('상품 구매 정보가 올바르지 않습니다.', {
            code: 'INVALID_PAYLOAD', status: 0, retryable: false,
        });
    }
    return callValidatedPurchaseAction(payload, options);
};

const safePlatformDocumentId = value => {
    if (typeof value !== 'string') return null;
    const normalized = value.trim();
    return normalized && normalized.length <= 128 && !normalized.includes('/')
        && !/[\u0000-\u001f\u007f]/.test(normalized) ? normalized : null;
};

const isAdminTalentBalance = value => (
    typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 && value <= 1_000_000_000
);

const invalidAdminTalentResponse = () => {
    throw new PlatformApiError('플랫폼 API 처리 결과를 안전하게 확인하지 못했습니다.', {
        code: 'INVALID_RESPONSE', status: 200, retryable: true,
    });
};

export const validatePurchaseItemResponse = (payload, result, expectedRequestId) => {
    const purchase = isResponseRecord(result?.purchase) ? result.purchase : null;
    if (!isResponseRecord(payload) || !isResponseRecord(result)
        || result.ok !== true || result.action !== 'purchaseItem'
        || result.requestId !== expectedRequestId
        || typeof result.alreadyCompleted !== 'boolean'
        || !isAdminTalentBalance(result.nextTalent)
        || !['user', 'roster'].includes(result.walletKind)
        || !purchase || purchase.id !== expectedRequestId
        || purchase.itemId !== payload.itemId
        || purchase.departmentId !== payload.departmentId
        || purchase.marketId !== payload.marketId
        || !['pending', 'delivered', 'cancelled'].includes(purchase.status)
        || purchase.schemaVersion !== 2
        || typeof purchase.price !== 'number' || !Number.isSafeInteger(purchase.price)
        || purchase.price <= 0 || purchase.price > 1_000_000) {
        return invalidAdminTalentResponse();
    }
    return result;
};

const callValidatedPurchaseAction = (payload, options = {}) => {
    const requestId = options.requestId || createRequestId();
    return callPlatformApi('purchaseItem', payload, { ...options, requestId })
        .then(result => validatePurchaseItemResponse(payload, result, requestId));
};

// 쓰기 성공 뒤 연결이 끊겨도 같은 requestId로 재조회할 수 있도록, 호출자가
// request key를 지우기 전에 서버의 2xx 본문을 작업별로 엄격히 확인한다.
export const validateAdminTalentResponse = (action, payload, result, expectedRequestId) => {
    if (!isResponseRecord(payload) || !isResponseRecord(result)
        || result.ok !== true || result.action !== action
        || result.requestId !== expectedRequestId
        || typeof result.alreadyCompleted !== 'boolean'
        || !isResponseRecord(result.purchase)) {
        return invalidAdminTalentResponse();
    }
    const purchase = result.purchase;
    if (action === 'adminCounterSale') {
        if (!isAdminTalentBalance(result.nextTalent)
            || !['user', 'roster'].includes(result.walletKind)
            || purchase.id !== expectedRequestId || purchase.requestId !== expectedRequestId
            || purchase.uid !== payload.memberUid || purchase.status !== 'delivered'
            || purchase.walletKind !== result.walletKind
            || purchase.departmentId !== payload.departmentId
            || purchase.marketId !== payload.marketId
            || purchase.itemName !== payload.itemName || purchase.price !== payload.price) {
            return invalidAdminTalentResponse();
        }
        return result;
    }
    if (action === 'adminDeliverPurchase') {
        if (purchase.id !== payload.purchaseId || purchase.status !== 'delivered'
            || purchase.adminActionRequestId !== expectedRequestId) {
            return invalidAdminTalentResponse();
        }
        return result;
    }
    if (action === 'adminRefundPurchase') {
        if (!isAdminTalentBalance(result.nextTalent)
            || !['user', 'roster'].includes(result.walletKind)
            || purchase.id !== payload.purchaseId || purchase.status !== 'cancelled'
            || !safePlatformDocumentId(purchase.uid)
            || purchase.adminActionRequestId !== expectedRequestId) {
            return invalidAdminTalentResponse();
        }
        return result;
    }
    return invalidAdminTalentResponse();
};

const callValidatedAdminTalentAction = (action, payload, options = {}) => {
    const requestId = options.requestId || createRequestId();
    return callPlatformApi(action, payload, { ...options, requestId })
        .then(result => validateAdminTalentResponse(action, payload, result, requestId));
};

export const adminCounterSale = ({
    churchId, memberUid, departmentId, marketId, itemName, price,
}, options = {}) => {
    const payload = {
        churchId: safePlatformDocumentId(churchId),
        memberUid: safePlatformDocumentId(memberUid),
        departmentId: safePlatformDocumentId(departmentId),
        marketId: safePlatformDocumentId(marketId),
        itemName: typeof itemName === 'string' ? itemName.trim() : '',
        price: Number(price),
    };
    if (Object.values(payload).slice(0, 4).some(value => !value)
        || !payload.itemName || payload.itemName.length > 100
        || /[\u0000-\u001f\u007f]/.test(payload.itemName)
        || !Number.isSafeInteger(payload.price) || payload.price <= 0 || payload.price > 1_000_000) {
        throw new PlatformApiError('창구 판매 정보를 다시 확인해주세요.', {
            code: 'INVALID_PAYLOAD', status: 0, retryable: false,
        });
    }
    return callValidatedAdminTalentAction('adminCounterSale', payload, options);
};

export const adminDeliverPurchase = ({ churchId, purchaseId }, options = {}) => {
    const payload = {
        churchId: safePlatformDocumentId(churchId),
        purchaseId: safePlatformDocumentId(purchaseId),
    };
    if (Object.values(payload).some(value => !value)) {
        throw new PlatformApiError('수령 처리할 구매 정보를 다시 확인해주세요.', {
            code: 'INVALID_PAYLOAD', status: 0, retryable: false,
        });
    }
    return callValidatedAdminTalentAction('adminDeliverPurchase', payload, options);
};

export const adminRefundPurchase = ({
    churchId, purchaseId, legacyWalletKind = '', migratedWalletConfirmed = false,
}, options = {}) => {
    const payload = {
        churchId: safePlatformDocumentId(churchId),
        purchaseId: safePlatformDocumentId(purchaseId),
        legacyWalletKind: typeof legacyWalletKind === 'string' ? legacyWalletKind.trim() : '',
        migratedWalletConfirmed,
    };
    if (!payload.churchId || !payload.purchaseId
        || !['', 'user', 'roster'].includes(payload.legacyWalletKind)
        || typeof payload.migratedWalletConfirmed !== 'boolean') {
        throw new PlatformApiError('환불할 구매 정보를 다시 확인해주세요.', {
            code: 'INVALID_PAYLOAD', status: 0, retryable: false,
        });
    }
    return callValidatedAdminTalentAction('adminRefundPurchase', payload, options);
};

export const completeMemberSignup = ({ churchId, entryCode = '', joinTicket = '', name, birthdate, guestProgress }, options = {}) => {
    const normalizedChurchId = typeof churchId === 'string' ? churchId.trim() : '';
    const normalizedEntryCode = typeof entryCode === 'string' ? entryCode.trim() : '';
    const normalizedJoinTicket = typeof joinTicket === 'string' ? joinTicket.trim() : '';
    const normalizedName = typeof name === 'string' ? name.trim() : '';
    const normalizedBirthdate = typeof birthdate === 'string' ? birthdate.trim() : '';
    const normalizedGuestProgress = guestProgress && typeof guestProgress === 'object' && !Array.isArray(guestProgress)
        ? {
            currentDay: Number(guestProgress.currentDay),
            streak: Number(guestProgress.streak),
            lastReadDate: guestProgress.lastReadDate === null ? null : String(guestProgress.lastReadDate || ''),
            planId: String(guestProgress.planId || ''),
        }
        : null;
    if (!normalizedChurchId || normalizedChurchId === 'unaffiliated_v1'
        || normalizedChurchId.length > 128 || normalizedChurchId.includes('/')
        || /[\u0000-\u001f\u007f]/.test(normalizedChurchId)
        || ((normalizedEntryCode.length >= 4 && normalizedEntryCode.length <= 128) === /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(normalizedJoinTicket))
        || !normalizedName || normalizedName.length > 50
        || !/^\d{8}$/.test(normalizedBirthdate)
        || !normalizedGuestProgress
        || !Number.isInteger(normalizedGuestProgress.currentDay)
        || normalizedGuestProgress.currentDay < 1 || normalizedGuestProgress.currentDay > 365
        || !Number.isInteger(normalizedGuestProgress.streak)
        || normalizedGuestProgress.streak < 0 || normalizedGuestProgress.streak > 400
        || !['1year_sequential', '1year_revised', '1year_new', 'nt_new'].includes(normalizedGuestProgress.planId)
        || (normalizedGuestProgress.lastReadDate !== null
            && !/^(Sun|Mon|Tue|Wed|Thu|Fri|Sat) /.test(normalizedGuestProgress.lastReadDate))) {
        throw new PlatformApiError('교회 교인 가입 정보가 올바르지 않습니다.', {
            code: 'INVALID_PAYLOAD', status: 0, retryable: false,
        });
    }
    return callPlatformApi('completeMemberSignup', {
        churchId: normalizedChurchId,
        entryCode: normalizedEntryCode,
        joinTicket: normalizedJoinTicket,
        name: normalizedName,
        birthdate: normalizedBirthdate,
        guestProgress: normalizedGuestProgress,
    }, options);
};

export const completePersonalSignup = ({
    churchId = '', entryCode = '', joinTicket = '', departmentId = '', subgroupId = '',
    name, birthdate, authProvider, guestProgress,
}, options = {}) => {
    const safeId = value => {
        if (typeof value !== 'string') return null;
        const normalized = value.trim();
        return normalized.length <= 128 && !normalized.includes('/')
            && !/[\u0000-\u001f\u007f]/.test(normalized) ? normalized : null;
    };
    const payload = {
        churchId: safeId(churchId),
        entryCode: typeof entryCode === 'string' ? entryCode.trim() : '',
        joinTicket: typeof joinTicket === 'string' ? joinTicket.trim() : '',
        departmentId: safeId(departmentId),
        subgroupId: safeId(subgroupId),
        name: typeof name === 'string' ? name.trim() : '',
        birthdate: typeof birthdate === 'string' ? birthdate.trim() : '',
        authProvider: typeof authProvider === 'string' ? authProvider.trim() : '',
        guestProgress: guestProgress && typeof guestProgress === 'object' && !Array.isArray(guestProgress)
            ? {
                currentDay: Number(guestProgress.currentDay),
                streak: Number(guestProgress.streak),
                lastReadDate: guestProgress.lastReadDate === null ? null : String(guestProgress.lastReadDate || ''),
                planId: String(guestProgress.planId || ''),
            }
            : null,
    };
    const realChurch = Boolean(payload.churchId && payload.churchId !== 'unaffiliated_v1');
    if (payload.churchId === null || payload.departmentId === null || payload.subgroupId === null
        || !payload.name || payload.name.length > 50 || !/^\d{8}$/.test(payload.birthdate)
        || !['password', 'google.com', 'kakao.com'].includes(payload.authProvider)
        || !payload.guestProgress || (realChurch && (((payload.entryCode.length >= 4
            && payload.entryCode.length <= 128) === /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(payload.joinTicket))
            || /[\u0000-\u001f\u007f]/.test(payload.entryCode) || !payload.departmentId))
        || (!realChurch && (payload.entryCode || payload.joinTicket || payload.departmentId || payload.subgroupId))) {
        throw new PlatformApiError('개인 계정 가입 정보가 올바르지 않습니다.', {
            code: 'INVALID_PAYLOAD', status: 0, retryable: false,
        });
    }
    return callPlatformApi('completePersonalSignup', payload, options);
};
