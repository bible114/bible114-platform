// 플랜 타입 (대분류)
export const PLAN_TYPES = [
    { id: '1year', title: '일년 일독', desc: '1년에 성경 1독을 합니다.' },
    { id: 'nt', title: '신약 일독', desc: '1년 동안 신약 1독을 합니다.' },
    {
        id: 'readable',
        title: '60일간 연대순으로 성경읽기(어! 성경이 읽어지네)',
        desc: '60일간 성경의 시간 흐름에 따라 읽습니다.',
    },
];

// 각 플랜별 성경 버전 — 운영 번역은 개역개정·새번역 2종으로 고정 (2026-07-11 사용자 결정,
// 쉬운성경·새한글·메시지 코드는 2026-07-18 제거)
// tagName: 노션 데이터베이스의 태그와 일치해야 함
export const BIBLE_VERSIONS = {
    '1year': [  // 일년 일독 버전들
        { id: 'sequential', name: '개역개정(순서대로)', desc: '창세기부터 요한계시록까지 순서대로 일독', tagName: '개역개정 순서대로' },
        { id: 'revised', name: '개역개정 114', desc: '교회에서 평소에 사용하는 성경', tagName: '개역개정 일년일독' },
        { id: 'new', name: '새번역 114', desc: '쉬운 현대어로 읽을 수 있는 성경', tagName: '새번역 일년일독' },
    ],
    'nt': [  // 신약 일독 버전들
        { id: 'new', name: '새번역 114', desc: '쉬운 현대어로 읽을 수 있는 성경', tagName: '새번역 신약일독' },
    ],
    'readable': [
        { id: 'revised', name: '개역개정', desc: '개역개정으로 읽는 60일 성경 통독', tagName: '개역개정 어성경 60일' },
        { id: 'new', name: '새번역', desc: '새번역으로 읽는 60일 성경 통독', tagName: '새번역 어성경 60일' },
    ],
};

export const getVisibleBibleVersions = (planType) =>
    BIBLE_VERSIONS[planType] || [];

// planId 형식: `${planType}_${versionId}` (예: '1year_revised')
export const isPlanIdAllowedForUser = (planId) =>
    Object.entries(BIBLE_VERSIONS).some(([planType, versions]) =>
        versions.some(version => `${planType}_${version.id}` === planId));
