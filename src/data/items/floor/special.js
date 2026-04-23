/**
 * 특수 바닥재 컬렉션
 * 잔디, 모래 등 특수 바닥 10종
 */

export const SPECIAL_FLOORS = [
    // === 자연 바닥 (5종) ===
    {
        id: 'floor_grass_meadow',
        category: 'floor',
        subcategory: 'special',
        name: '푸른 잔디밭',
        description: '상쾌한 초록 잔디',
        price: 70,
        rarity: 'common',
        spriteSheet: 'floors_special',
        spriteX: 0, spriteY: 0,
        width: 64, height: 64,
        tags: ['자연', '잔디', '초록']
    },
    {
        id: 'floor_grass_flower',
        category: 'floor',
        subcategory: 'special',
        name: '꽃잔디',
        description: '꽃이 피어있는 잔디',
        price: 90,
        rarity: 'rare',
        spriteSheet: 'floors_special',
        spriteX: 1, spriteY: 0,
        width: 64, height: 64,
        tags: ['자연', '잔디', '꽃']
    },
    {
        id: 'floor_sand_beach',
        category: 'floor',
        subcategory: 'special',
        name: '해변 모래',
        description: '따스한 해변 모래사장',
        price: 80,
        rarity: 'rare',
        spriteSheet: 'floors_special',
        spriteX: 2, spriteY: 0,
        width: 64, height: 64,
        tags: ['자연', '모래', '해변']
    },
    {
        id: 'floor_stone_path',
        category: 'floor',
        subcategory: 'special',
        name: '정원 돌길',
        description: '아기자기한 정원 돌',
        price: 75,
        rarity: 'common',
        spriteSheet: 'floors_special',
        spriteX: 3, spriteY: 0,
        width: 64, height: 64,
        tags: ['자연', '돌', '정원']
    },
    {
        id: 'floor_water_shallow',
        category: 'floor',
        subcategory: 'special',
        name: '얕은 물가',
        description: '투명한 얕은 물',
        price: 100,
        rarity: 'epic',
        spriteSheet: 'floors_special',
        spriteX: 4, spriteY: 0,
        width: 64, height: 64,
        animation: 'water_ripple',
        tags: ['자연', '물', '시원']
    },

    // === 특수 효과 바닥 (5종) ===
    {
        id: 'floor_cloud_fluffy',
        category: 'floor',
        subcategory: 'special',
        name: '뭉게구름 바닥',
        description: '푹신한 구름 위',
        price: 150,
        rarity: 'legendary',
        spriteSheet: 'floors_special',
        spriteX: 0, spriteY: 1,
        width: 64, height: 64,
        animation: 'float_slow',
        tags: ['판타지', '구름', '푹신']
    },
    {
        id: 'floor_star_galaxy',
        category: 'floor',
        subcategory: 'special',
        name: '은하수 바닥',
        description: '반짝이는 우주의 바닥',
        price: 200,
        rarity: 'legendary',
        spriteSheet: 'floors_special',
        spriteX: 1, spriteY: 1,
        width: 64, height: 64,
        animation: 'sparkle',
        tags: ['판타지', '우주', '반짝']
    },
    {
        id: 'floor_rainbow_path',
        category: 'floor',
        subcategory: 'special',
        name: '무지개 길',
        description: '컬러풀한 무지개 바닥',
        price: 120,
        rarity: 'epic',
        spriteSheet: 'floors_special',
        spriteX: 2, spriteY: 1,
        width: 64, height: 64,
        tags: ['판타지', '무지개', '컬러풀']
    },
    {
        id: 'floor_snow_fresh',
        category: 'floor',
        subcategory: 'special',
        name: '하얀 눈밭',
        description: '새로 내린 하얀 눈',
        price: 80,
        rarity: 'rare',
        spriteSheet: 'floors_special',
        spriteX: 3, spriteY: 1,
        width: 64, height: 64,
        season: 'winter',
        tags: ['자연', '눈', '겨울']
    },
    {
        id: 'floor_tatami',
        category: 'floor',
        subcategory: 'special',
        name: '다다미',
        description: '일본 전통 다다미 바닥',
        price: 90,
        rarity: 'rare',
        spriteSheet: 'floors_special',
        spriteX: 4, spriteY: 1,
        width: 64, height: 64,
        tags: ['전통', '일본', '다다미']
    }
];
