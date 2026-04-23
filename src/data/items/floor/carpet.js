/**
 * 카펫/러그 바닥재 컬렉션
 * 부드러운 카펫과 러그 10종
 */

export const CARPET_FLOORS = [
    // === 단색 카펫 (4종) ===
    {
        id: 'floor_carpet_cream',
        category: 'floor',
        subcategory: 'carpet',
        name: '크림 플러시',
        description: '부드러운 크림색 카펫',
        price: 80,
        rarity: 'common',
        color: '#FFF8F0',
        tags: ['카펫', '크림', '부드러운']
    },
    {
        id: 'floor_carpet_pink',
        category: 'floor',
        subcategory: 'carpet',
        name: '로즈 핑크',
        description: '로맨틱한 핑크 카펫',
        price: 90,
        rarity: 'rare',
        color: '#FFD6E8',
        tags: ['카펫', '핑크', '로맨틱']
    },
    {
        id: 'floor_carpet_gray',
        category: 'floor',
        subcategory: 'carpet',
        name: '실버 그레이',
        description: '세련된 그레이 카펫',
        price: 85,
        rarity: 'common',
        color: '#CBD5E1',
        tags: ['카펫', '그레이', '세련된']
    },
    {
        id: 'floor_carpet_navy',
        category: 'floor',
        subcategory: 'carpet',
        name: '딥 네이비',
        description: '고급스러운 네이비 카펫',
        price: 100,
        rarity: 'rare',
        color: '#1E3A5F',
        tags: ['카펫', '네이비', '고급']
    },

    // === 패턴 러그 (4종) ===
    {
        id: 'floor_rug_persian',
        category: 'floor',
        subcategory: 'carpet',
        name: '페르시안 러그',
        description: '전통 페르시안 패턴',
        price: 150,
        rarity: 'epic',
        spriteSheet: 'floors_carpet',
        spriteX: 0, spriteY: 0,
        width: 64, height: 64,
        tags: ['러그', '페르시안', '전통']
    },
    {
        id: 'floor_rug_bohemian',
        category: 'floor',
        subcategory: 'carpet',
        name: '보헤미안 러그',
        description: '자유로운 보헤미안 스타일',
        price: 120,
        rarity: 'rare',
        spriteSheet: 'floors_carpet',
        spriteX: 1, spriteY: 0,
        width: 64, height: 64,
        tags: ['러그', '보헤미안', '컬러풀']
    },
    {
        id: 'floor_rug_nordic',
        category: 'floor',
        subcategory: 'carpet',
        name: '노르딕 패턴',
        description: '북유럽 감성의 기하학 패턴',
        price: 100,
        rarity: 'rare',
        spriteSheet: 'floors_carpet',
        spriteX: 2, spriteY: 0,
        width: 64, height: 64,
        tags: ['러그', '노르딕', '기하학']
    },
    {
        id: 'floor_rug_kilim',
        category: 'floor',
        subcategory: 'carpet',
        name: '킬림 러그',
        description: '터키 전통 킬림 패턴',
        price: 130,
        rarity: 'epic',
        spriteSheet: 'floors_carpet',
        spriteX: 3, spriteY: 0,
        width: 64, height: 64,
        tags: ['러그', '킬림', '터키']
    },

    // === 특수 러그 (2종) ===
    {
        id: 'floor_rug_fur_white',
        category: 'floor',
        subcategory: 'carpet',
        name: '화이트 퍼 러그',
        description: '푹신한 화이트 퍼',
        price: 180,
        rarity: 'legendary',
        spriteSheet: 'floors_carpet',
        spriteX: 0, spriteY: 1,
        width: 64, height: 64,
        tags: ['러그', '퍼', '럭셔리']
    },
    {
        id: 'floor_rug_round_shag',
        category: 'floor',
        subcategory: 'carpet',
        name: '라운드 샤기 러그',
        description: '동글동글 샤기 러그',
        price: 110,
        rarity: 'rare',
        spriteSheet: 'floors_carpet',
        spriteX: 1, spriteY: 1,
        width: 64, height: 64,
        tags: ['러그', '샤기', '라운드']
    }
];
