// 플랜 타입 (대분류)
export const PLAN_TYPES = [
    { id: '1year', title: '일년 일독', desc: '1년에 성경 1독을 합니다.' },
    { id: 'nt', title: '신약 일독', desc: '1년 동안 신약 1독을 합니다.' }
];

// 전체 버전(쉬운성경·새한글·메시지) 노출 허용 교회 — 2026-07-11 사용자 결정으로 전부 회수
// (개역개정·새번역만 노출). 다시 열려면 교회 ID/이름을 배열에 추가.
export const ALL_VERSION_ALLOWED_CHURCH_IDS = [];
export const ALL_VERSION_ALLOWED_CHURCH_NAMES = [];

export const isBibleVersionVisibleForUser = (version, user) => {
    if (!version?.allowedChurchIds) return true;
    return version.allowedChurchIds.includes(user?.churchId) ||
        ALL_VERSION_ALLOWED_CHURCH_NAMES.includes(user?.churchName);
};

// 각 플랜별 성경 버전
// tagName: 노션 데이터베이스의 태그와 일치해야 함
export const BIBLE_VERSIONS = {
    '1year': [  // 일년 일독 버전들
        { id: 'sequential', name: '개역개정(순서대로)', desc: '창세기부터 요한계시록까지 순서대로 일독', tagName: '개역개정 순서대로' },
        { id: 'revised', name: '개역개정 114', desc: '교회에서 평소에 사용하는 성경', tagName: '개역개정 일년일독' },
        { id: 'new', name: '새번역 114', desc: '쉬운 현대어로 읽을 수 있는 성경', tagName: '새번역 일년일독' },
        { id: 'easy', name: '쉬운성경 114', desc: '어린이도 쉽게 읽을 수 있는 성경', tagName: '쉬운성경 일년일독', allowedChurchIds: ALL_VERSION_ALLOWED_CHURCH_IDS },
        { id: 'saehangul', name: '새한글 114', desc: '새한글성경으로 읽는 1년 일독', tagName: '새한글성경 일년일독', allowedChurchIds: ALL_VERSION_ALLOWED_CHURCH_IDS },
    ],
    'nt': [  // 신약 일독 버전들
        { id: 'new', name: '새번역 114', desc: '쉬운 현대어로 읽을 수 있는 성경', tagName: '새번역 신약일독' },
        { id: 'easy', name: '쉬운성경 114', desc: '어린이도 쉽게 읽을 수 있는 성경', tagName: '쉬운성경 신약일독', allowedChurchIds: ALL_VERSION_ALLOWED_CHURCH_IDS },
        { id: 'message', name: '메시지 성경 114', desc: '현대 문화와 일상 언어로 생생하게 재해석한 의역 성경', tagName: '메시지 신약일독', allowedChurchIds: ALL_VERSION_ALLOWED_CHURCH_IDS },
        { id: 'saehangul', name: '새한글 114', desc: '새한글성경으로 읽는 신약 일독', tagName: '새한글성경 신약일독', allowedChurchIds: ALL_VERSION_ALLOWED_CHURCH_IDS },
    ]
};

export const getVisibleBibleVersions = (planType, user) =>
    (BIBLE_VERSIONS[planType] || []).filter(version => isBibleVersionVisibleForUser(version, user));

// planId 형식: `${planType}_${versionId}` (예: '1year_revised')
export const isPlanIdAllowedForUser = (planId, user) =>
    Object.entries(BIBLE_VERSIONS).some(([planType, versions]) =>
        versions.some(version => `${planType}_${version.id}` === planId &&
            isBibleVersionVisibleForUser(version, user)));
