export const getTTSUnavailableApp = (userAgent = '') => {
    if (/NAVER/i.test(userAgent)) return 'naver';
    if (/GSA\//i.test(userAgent)) return 'google';
    return null;
};

// 카카오톡은 작은 안내문으로 TTS 영역 전체를 대체하는 대상은 아니지만,
// 기존 정책대로 낭독을 누르면 외부 브라우저 안내를 보여주는 별도 대상이다.
export const getTTSLegacyBlockedApp = (userAgent = '') => (
    /KAKAOTALK/i.test(userAgent) ? 'kakao' : null
);
