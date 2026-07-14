export const getTTSUnavailableApp = (userAgent = '') => {
    if (/NAVER/i.test(userAgent)) return 'naver';
    if (/GSA\//i.test(userAgent)) return 'google';
    return null;
};

