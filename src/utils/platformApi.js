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

export const preflightPlatformApi = (options = {}) => callPlatformApi('preflight', {}, options);

export const previewReadCompletion = (cycle, day, options = {}) => {
    if (!Number.isInteger(cycle) || cycle < 1 || !Number.isInteger(day) || day < 1 || day > 365) {
        throw new PlatformApiError('읽기 완료 확인 범위가 올바르지 않습니다.', {
            code: 'INVALID_PAYLOAD', status: 0, retryable: false,
        });
    }
    return callPlatformApi('previewReadCompletion', { cycle, day }, options);
};
