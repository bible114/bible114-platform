const FALLBACK_PREFIX = 'b114_auth_return_fallback:';
const FALLBACK_TTL_MS = 10 * 60 * 1000;

const resolveStorage = name => {
    if (typeof window === 'undefined') return null;
    try {
        return window[name] || null;
    } catch {
        return null;
    }
};

const fallbackKey = key => `${FALLBACK_PREFIX}${key}`;

const readFallback = key => {
    const storage = resolveStorage('localStorage');
    if (!storage) return null;
    try {
        const raw = storage.getItem(fallbackKey(key));
        if (!raw) return null;
        const entry = JSON.parse(raw);
        if (!entry || typeof entry.value !== 'string' || !Number.isFinite(entry.expiresAt)) {
            storage.removeItem(fallbackKey(key));
            return null;
        }
        if (entry.expiresAt <= Date.now()) {
            storage.removeItem(fallbackKey(key));
            return null;
        }
        return entry.value;
    } catch {
        return null;
    }
};

export const getAuthSessionValue = key => {
    const storage = resolveStorage('sessionStorage');
    if (storage) {
        try {
            const value = storage.getItem(key);
            if (value !== null) return value;
        } catch {
            // 새 탭 복귀용 짧은 localStorage 사본을 확인한다.
        }
    }
    return readFallback(key);
};

export const setAuthSessionValue = (key, value) => {
    const normalizedValue = String(value);
    let stored = false;
    const session = resolveStorage('sessionStorage');
    if (session) {
        try {
            session.setItem(key, normalizedValue);
            stored = true;
        } catch {
            // localStorage 짧은 사본으로 계속 시도한다.
        }
    }

    const local = resolveStorage('localStorage');
    if (local) {
        try {
            local.setItem(fallbackKey(key), JSON.stringify({
                value: normalizedValue,
                expiresAt: Date.now() + FALLBACK_TTL_MS,
            }));
            stored = true;
        } catch {
            // 두 저장소가 모두 막힌 경우 아래에서 명시적으로 실패한다.
        }
    }

    if (!stored) {
        const error = new Error('AUTH_SESSION_STORAGE_UNAVAILABLE');
        error.code = 'AUTH_SESSION_STORAGE_UNAVAILABLE';
        throw error;
    }
};

export const removeAuthSessionValue = key => {
    const session = resolveStorage('sessionStorage');
    if (session) {
        try {
            session.removeItem(key);
        } catch {
            // 저장소가 차단돼도 인증 흐름 정리는 계속한다.
        }
    }
    const local = resolveStorage('localStorage');
    if (local) {
        try {
            local.removeItem(fallbackKey(key));
        } catch {
            // 저장소가 차단돼도 인증 흐름 정리는 계속한다.
        }
    }
};

export const removeAuthSessionValues = keys => {
    keys.forEach(removeAuthSessionValue);
};
