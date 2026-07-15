import { PLATFORM_API_URL } from '../data/constants.js';

const DEFAULT_TIMEOUT_MS = 12_000;
const RESERVED_PAYLOAD_KEYS = new Set(['action', 'requestId']);
const loadAuth = async () => (await import('./firebase.js')).auth;

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
    return callPlatformApi('purchaseItem', payload, options);
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
