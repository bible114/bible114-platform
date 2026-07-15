import { PLATFORM_API_URL } from '../data/constants.js';

const DEFAULT_TIMEOUT_MS = 12_000;
const DAILY_VIDEO_TIMEOUT_MS = 70_000;
const ADMIN_DAILY_VIDEO_PREVIEW_REQUEST_KEYS = new Set(['adultPlaylistId', 'kidsPlaylistId']);
const ADMIN_DAILY_VIDEO_PREVIEW_RESPONSE_KEYS = new Set(['ok', 'action', 'requestId', 'serviceDate', 'previews']);
const ADMIN_DAILY_VIDEO_PREVIEWS_KEYS = new Set(['adult', 'kids']);
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
const loadAuth = async () => (await import('./firebase.js')).auth;
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

const postOnce = async ({ action, payload, requestId, timeoutMs, forceRefresh }) => {
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

    let token;
    try {
        token = await auth.currentUser.getIdToken(forceRefresh);
    } catch (cause) {
        throw new PlatformApiError('로그인 인증 정보를 확인하지 못했습니다.', {
            code: 'AUTH_TOKEN_ERROR', status: 401, retryable: true, cause,
        });
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
    const request = { action: action.trim(), payload, requestId, timeoutMs };

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
    const progressMatch = typeof progressKey === 'string' ? /^r([1-9]\d*)_d([1-9]\d*)$/.exec(progressKey) : null;
    const progressCycle = progressMatch ? Number(progressMatch[1]) : NaN;
    const progressDay = progressMatch ? Number(progressMatch[2]) : NaN;
    if (!Number.isSafeInteger(progressCycle) || !Number.isSafeInteger(progressDay) || progressDay < 1 || progressDay > 365) {
        throw new PlatformApiError('퀴즈 진행 위치가 올바르지 않습니다.', {
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
