const resolveStandalone = () => {
    if (typeof window !== 'undefined' && window.matchMedia?.('(display-mode: standalone)').matches) {
        return true;
    }
    return typeof navigator !== 'undefined' && navigator.standalone === true;
};

export const detectMobileSessionContext = ({
    userAgent = typeof navigator !== 'undefined' ? navigator.userAgent : '',
    standalone = resolveStandalone(),
} = {}) => {
    const normalizedUserAgent = String(userAgent || '');
    if (/KAKAOTALK/i.test(normalizedUserAgent)) return 'kakao';
    if (/NAVER/i.test(normalizedUserAgent)) return 'naver';
    if (/Instagram/i.test(normalizedUserAgent)) return 'instagram';
    if (/FBAN|FBAV/i.test(normalizedUserAgent)) return 'facebook';
    if (/\bLine\//i.test(normalizedUserAgent)) return 'line';
    if (/DaumApps/i.test(normalizedUserAgent)) return 'daum';
    if (/;\s*wv\)/i.test(normalizedUserAgent)) return 'android-webview';

    const isIOS = /iPhone|iPad|iPod/i.test(normalizedUserAgent)
        || (/Macintosh/i.test(normalizedUserAgent) && /Mobile/i.test(normalizedUserAgent));
    if (standalone && isIOS) return 'ios-standalone';

    return null;
};

const IN_APP_CONTEXTS = new Set([
    'kakao',
    'naver',
    'instagram',
    'facebook',
    'line',
    'daum',
    'android-webview',
]);

export const isInAppBrowserContext = context => IN_APP_CONTEXTS.has(context);

export const getMobileSessionContextLabel = context => ({
    kakao: '카카오톡',
    naver: '네이버',
    instagram: '인스타그램',
    facebook: '페이스북',
    line: 'LINE',
    daum: '다음',
    'android-webview': '현재 앱',
}[context] || '현재 앱');
