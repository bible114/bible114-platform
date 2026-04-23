/**
 * 파스텔 톤 벽지 컬렉션
 * 싸이월드 감성의 부드러운 파스텔 색상 벽지 20종
 */

export const PASTEL_WALLPAPERS = [
    // === 단색 파스텔 (8종) ===
    {
        id: 'wall_pastel_pink',
        category: 'wallpaper',
        subcategory: 'pastel',
        name: '달콤한 핑크',
        description: '사랑스러운 파스텔 핑크',
        price: 40,
        rarity: 'common',
        color: '#FFD6E8',
        tags: ['파스텔', '핑크', '러블리']
    },
    {
        id: 'wall_pastel_mint',
        category: 'wallpaper',
        subcategory: 'pastel',
        name: '청량한 민트',
        description: '시원한 민트 그린',
        price: 40,
        rarity: 'common',
        color: '#D1F2EB',
        tags: ['파스텔', '민트', '청량']
    },
    {
        id: 'wall_pastel_lavender',
        category: 'wallpaper',
        subcategory: 'pastel',
        name: '몽글 라벤더',
        description: '은은한 라벤더 퍼플',
        price: 40,
        rarity: 'common',
        color: '#E8DAEF',
        tags: ['파스텔', '라벤더', '퍼플']
    },
    {
        id: 'wall_pastel_peach',
        category: 'wallpaper',
        subcategory: 'pastel',
        name: '복숭아빛 피치',
        description: '따뜻한 복숭아 색',
        price: 40,
        rarity: 'common',
        color: '#FFDAB3',
        tags: ['파스텔', '피치', '웜톤']
    },
    {
        id: 'wall_pastel_sky',
        category: 'wallpaper',
        subcategory: 'pastel',
        name: '맑은 하늘색',
        description: '청명한 하늘빛 블루',
        price: 40,
        rarity: 'common',
        color: '#B3E0FF',
        tags: ['파스텔', '하늘', '블루']
    },
    {
        id: 'wall_pastel_lemon',
        category: 'wallpaper',
        subcategory: 'pastel',
        name: '상큼 레몬',
        description: '밝은 레몬 옐로우',
        price: 40,
        rarity: 'common',
        color: '#FFF0B3',
        tags: ['파스텔', '레몬', '옐로우']
    },
    {
        id: 'wall_pastel_cream',
        category: 'wallpaper',
        subcategory: 'pastel',
        name: '부드러운 크림',
        description: '따뜻한 크림 아이보리',
        price: 35,
        rarity: 'common',
        color: '#FFF8F0',
        tags: ['파스텔', '크림', '아이보리']
    },
    {
        id: 'wall_pastel_coral',
        category: 'wallpaper',
        subcategory: 'pastel',
        name: '사랑스러운 코랄',
        description: '생기 있는 코랄 핑크',
        price: 45,
        rarity: 'common',
        color: '#FFB3B3',
        tags: ['파스텔', '코랄', '핑크']
    },

    // === 그라데이션 파스텔 (6종) ===
    {
        id: 'wall_gradient_sunset',
        category: 'wallpaper',
        subcategory: 'pastel',
        name: '노을 그라데이션',
        description: '핑크에서 오렌지로 이어지는 석양',
        price: 80,
        rarity: 'rare',
        gradient: 'linear-gradient(180deg, #FFE8D6 0%, #FFD6E8 50%, #E8D6FF 100%)',
        tags: ['그라데이션', '노을', '석양']
    },
    {
        id: 'wall_gradient_ocean',
        category: 'wallpaper',
        subcategory: 'pastel',
        name: '바다 그라데이션',
        description: '청명한 하늘에서 바다로',
        price: 80,
        rarity: 'rare',
        gradient: 'linear-gradient(180deg, #E0F2FE 0%, #BAE6FD 50%, #7DD3FC 100%)',
        tags: ['그라데이션', '바다', '하늘']
    },
    {
        id: 'wall_gradient_candy',
        category: 'wallpaper',
        subcategory: 'pastel',
        name: '캔디 그라데이션',
        description: '달콤한 캔디 색상의 조화',
        price: 100,
        rarity: 'rare',
        gradient: 'linear-gradient(135deg, #FCE7F3 0%, #DDD6FE 50%, #CFFAFE 100%)',
        tags: ['그라데이션', '캔디', '달콤']
    },
    {
        id: 'wall_gradient_aurora',
        category: 'wallpaper',
        subcategory: 'pastel',
        name: '오로라 그라데이션',
        description: '신비로운 오로라의 빛',
        price: 150,
        rarity: 'epic',
        gradient: 'linear-gradient(135deg, #A7F3D0 0%, #C4B5FD 50%, #FBCFE8 100%)',
        tags: ['그라데이션', '오로라', '신비']
    },
    {
        id: 'wall_gradient_rainbow',
        category: 'wallpaper',
        subcategory: 'pastel',
        name: '무지개 그라데이션',
        description: '파스텔 무지개 색상',
        price: 200,
        rarity: 'epic',
        gradient: 'linear-gradient(135deg, #FFB3B3 0%, #FFE0B3 20%, #FFFFB3 40%, #B3FFB3 60%, #B3E0FF 80%, #E0B3FF 100%)',
        tags: ['그라데이션', '무지개', '컬러풀']
    },
    {
        id: 'wall_gradient_dawn',
        category: 'wallpaper',
        subcategory: 'pastel',
        name: '새벽 그라데이션',
        description: '고요한 새벽녘의 하늘',
        price: 90,
        rarity: 'rare',
        gradient: 'linear-gradient(180deg, #1E3A5F 0%, #7B68EE 30%, #FFB6C1 70%, #FFF0F5 100%)',
        tags: ['그라데이션', '새벽', '고요']
    },

    // === 패턴 파스텔 (6종) ===
    {
        id: 'wall_pattern_dots_pink',
        category: 'wallpaper',
        subcategory: 'pastel',
        name: '핑크 물방울',
        description: '귀여운 핑크 도트 패턴',
        price: 60,
        rarity: 'common',
        pattern: 'polka_dots',
        baseColor: '#FFD6E8',
        patternColor: '#FF80BF',
        tags: ['패턴', '물방울', '핑크']
    },
    {
        id: 'wall_pattern_hearts',
        category: 'wallpaper',
        subcategory: 'pastel',
        name: '사랑의 하트',
        description: '로맨틱한 하트 패턴',
        price: 70,
        rarity: 'rare',
        pattern: 'hearts',
        baseColor: '#FFF0F5',
        patternColor: '#FFB3D9',
        tags: ['패턴', '하트', '러블리']
    },
    {
        id: 'wall_pattern_stars',
        category: 'wallpaper',
        subcategory: 'pastel',
        name: '반짝반짝 별빛',
        description: '귀여운 별 모양 패턴',
        price: 70,
        rarity: 'rare',
        pattern: 'stars',
        baseColor: '#E8DAEF',
        patternColor: '#FFE066',
        tags: ['패턴', '별', '반짝']
    },
    {
        id: 'wall_pattern_stripes_mint',
        category: 'wallpaper',
        subcategory: 'pastel',
        name: '민트 스트라이프',
        description: '깔끔한 민트 줄무늬',
        price: 55,
        rarity: 'common',
        pattern: 'stripes',
        baseColor: '#FFFFFF',
        patternColor: '#A3E4D7',
        tags: ['패턴', '줄무늬', '민트']
    },
    {
        id: 'wall_pattern_checkered',
        category: 'wallpaper',
        subcategory: 'pastel',
        name: '체커보드 피치',
        description: '레트로 체크 패턴',
        price: 60,
        rarity: 'common',
        pattern: 'checkered',
        baseColor: '#FFF8F0',
        patternColor: '#FFDAB3',
        tags: ['패턴', '체크', '레트로']
    },
    {
        id: 'wall_pattern_clouds',
        category: 'wallpaper',
        subcategory: 'pastel',
        name: '뭉게뭉게 구름',
        description: '하늘에 떠있는 구름',
        price: 80,
        rarity: 'rare',
        pattern: 'clouds',
        baseColor: '#B3E0FF',
        patternColor: '#FFFFFF',
        tags: ['패턴', '구름', '하늘']
    }
];
