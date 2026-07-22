export const LOGIN_TRANSITION_KEY = 'b114_login_transition_v1';
const LOGIN_TRANSITION_MAX_AGE_MS = 2 * 60 * 1000;

export const markLoginTransitionPending = () => {
    if (typeof sessionStorage === 'undefined') return;
    try {
        sessionStorage.setItem(LOGIN_TRANSITION_KEY, String(Date.now()));
    } catch {
        // 저장 공간이 막혀도 현재 화면의 React 상태로 전환 화면은 유지한다.
    }
};

export const clearLoginTransitionPending = () => {
    if (typeof sessionStorage === 'undefined') return;
    try {
        sessionStorage.removeItem(LOGIN_TRANSITION_KEY);
    } catch {
        // 저장 공간이 막힌 브라우저에서도 로그인 자체는 계속 진행한다.
    }
};

export const hasPendingLoginTransition = (now = Date.now()) => {
    if (typeof sessionStorage === 'undefined') return false;
    try {
        const startedAt = Number(sessionStorage.getItem(LOGIN_TRANSITION_KEY));
        const pending = Number.isFinite(startedAt)
            && startedAt > 0
            && now - startedAt >= 0
            && now - startedAt <= LOGIN_TRANSITION_MAX_AGE_MS;
        if (!pending) sessionStorage.removeItem(LOGIN_TRANSITION_KEY);
        return pending;
    } catch {
        return false;
    }
};
