export const SOCIAL_LOGIN_TRANSITION_DEADLINE_LABEL = '2026년 7월 31일';
export const SOCIAL_LOGIN_TRANSITION_START_LABEL = '2026년 8월 1일';
export const SOCIAL_LOGIN_TRANSITION_END_AT = Date.parse('2026-08-01T00:00:00+09:00');
export const SOCIAL_LOGIN_TRANSITION_NOTICE_VERSION = '20260731_v1';

const dismissKey = uid => (
    `b114_social_login_transition_${SOCIAL_LOGIN_TRANSITION_NOTICE_VERSION}_${uid || 'landing'}`
);

export const isSocialLoginTransitionActive = (now = Date.now()) => (
    Number.isFinite(now) && now < SOCIAL_LOGIN_TRANSITION_END_AT
);

export const hasSocialLoginProvider = (user, authUser = null) => {
    const providers = new Set([
        ...(Array.isArray(user?.authProviders) ? user.authProviders : []),
        user?.authProvider,
        ...(Array.isArray(authUser?.providerData)
            ? authUser.providerData.map(item => item?.providerId)
            : []),
    ].filter(Boolean));
    return providers.has('google.com')
        || providers.has('kakao.com')
        || providers.has('oidc.kakao');
};

export const shouldShowSocialLoginTransition = (uid = 'landing', now = Date.now()) => {
    if (!isSocialLoginTransitionActive(now) || typeof localStorage === 'undefined') return false;
    return localStorage.getItem(dismissKey(uid)) !== 'dismissed';
};

export const dismissSocialLoginTransition = (uid = 'landing') => {
    if (typeof localStorage === 'undefined') return;
    localStorage.setItem(dismissKey(uid), 'dismissed');
};
