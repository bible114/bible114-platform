// 플랜 타입 (대분류)
export const PLAN_TYPES = [
    { id: '1year', title: '일년 일독', desc: '1년에 성경 1독을 합니다.' },
    { id: 'nt', title: '신약 일독', desc: '1년 동안 신약 1독을 합니다.' }
];

// 각 플랜별 성경 버전
// tagName: 노션 데이터베이스의 태그와 일치해야 함
export const BIBLE_VERSIONS = {
    '1year': [  // 일년 일독 버전들
        { id: 'revised', name: '개역개정', desc: '교회에서 평소에 사용하는 성경', tagName: '개역개정 일년일독' },
        { id: 'new', name: '새번역', desc: '쉬운 현대어로 읽을 수 있는 성경', tagName: '새번역 일년일독' },
        { id: 'easy', name: '쉬운성경', desc: '어린이도 쉽게 읽을 수 있는 성경', tagName: '쉬운성경 일년일독' },
        { id: 'saehangul', name: '새한글', desc: '가장 최근에 번역된 현대어 성경', tagName: '새한글 일년일독' },
        { id: 'sequential', name: '개역개정(순서대로)', desc: '창세기부터 요한계시록까지 순서대로 일독', tagName: '개역개정 순서대로' }
    ],
    'nt': [  // 신약 일독 버전들
        { id: 'new', name: '새번역', desc: '쉬운 현대어로 읽을 수 있는 성경', tagName: '새번역 신약일독' },
        { id: 'easy', name: '쉬운성경', desc: '어린이도 쉽게 읽을 수 있는 성경', tagName: '쉬운성경 신약일독' },
        { id: 'saehangul', name: '새한글', desc: '가장 최근에 번역된 현대어 성경', tagName: '새한글 신약일독' },
        { id: 'message', name: '메시지 성경', desc: '현대 문화와 일상 언어로 생생하게 재해석한 의역 성경', tagName: '메시지 신약일독' }
    ]
};
