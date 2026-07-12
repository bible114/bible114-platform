import { KAKAO_AUTH_URL, KAKAO_REST_KEY } from '../data/constants.js';

export const KAKAO_STATE_KEY = 'b114_kakao_state_v1';
export const KAKAO_RETURNING_KEY = 'b114_kakao_returning_v1';

export const createKakaoState = () => {
    const bytes = new Uint8Array(24);
    crypto.getRandomValues(bytes);
    return Array.from(bytes, value => value.toString(16).padStart(2, '0')).join('');
};

export const getKakaoRedirectUri = () => `${window.location.origin}/`;

export const buildKakaoAuthorizeUrl = ({ state, redirectUri = getKakaoRedirectUri() }) => {
    if (!KAKAO_REST_KEY) throw new Error('KAKAO_REST_KEY_MISSING');
    const url = new URL('https://kauth.kakao.com/oauth/authorize');
    url.search = new URLSearchParams({
        client_id: KAKAO_REST_KEY,
        redirect_uri: redirectUri,
        response_type: 'code',
        state,
    }).toString();
    return url.toString();
};

export const readKakaoCallback = (href = window.location.href) => {
    const url = new URL(href);
    return {
        code: url.searchParams.get('code'),
        state: url.searchParams.get('state'),
        error: url.searchParams.get('error'),
        errorDescription: url.searchParams.get('error_description'),
    };
};

export const isValidKakaoState = (receivedState, expectedState) => (
    Boolean(receivedState && expectedState) && receivedState === expectedState
);

export const sanitizeKakaoCallbackUrl = (href) => {
    const url = new URL(href);
    ['code', 'state', 'error', 'error_description'].forEach(key => url.searchParams.delete(key));
    return `${url.pathname}${url.search}${url.hash}`;
};

export const clearKakaoCallbackUrl = () => {
    window.history.replaceState({}, document.title, sanitizeKakaoCallbackUrl(window.location.href));
};

export const exchangeKakaoCode = async ({ code, redirectUri }) => {
    if (!KAKAO_AUTH_URL) throw new Error('KAKAO_AUTH_URL_MISSING');
    const response = await fetch(KAKAO_AUTH_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code, redirectUri }),
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok || !payload.token) {
        const error = new Error(payload.error || 'KAKAO_EXCHANGE_FAILED');
        error.status = response.status;
        throw error;
    }
    return payload;
};
