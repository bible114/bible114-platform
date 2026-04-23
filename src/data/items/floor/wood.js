/**
 * 우드 바닥재 컬렉션
 * 다양한 나무 종류의 마루 15종
 */

export const WOOD_FLOORS = [
    // === 라이트 우드 (5종) ===
    {
        id: 'floor_wood_oak_light',
        category: 'floor',
        subcategory: 'wood',
        name: '라이트 오크',
        description: '밝고 깨끗한 오크 마루',
        price: 50,
        rarity: 'common',
        spriteSheet: 'floors_wood',
        spriteX: 0, spriteY: 0,
        width: 64, height: 64,
        tags: ['우드', '오크', '밝은']
    },
    {
        id: 'floor_wood_maple',
        category: 'floor',
        subcategory: 'wood',
        name: '메이플 내추럴',
        description: '부드러운 단풍나무 마루',
        price: 55,
        rarity: 'common',
        spriteSheet: 'floors_wood',
        spriteX: 1, spriteY: 0,
        width: 64, height: 64,
        tags: ['우드', '메이플', '내추럴']
    },
    {
        id: 'floor_wood_ash',
        category: 'floor',
        subcategory: 'wood',
        name: '애쉬 화이트',
        description: '하얀빛 물푸레나무',
        price: 60,
        rarity: 'common',
        spriteSheet: 'floors_wood',
        spriteX: 2, spriteY: 0,
        width: 64, height: 64,
        tags: ['우드', '애쉬', '화이트']
    },
    {
        id: 'floor_wood_birch',
        category: 'floor',
        subcategory: 'wood',
        name: '버치 라이트',
        description: '가벼운 느낌의 자작나무',
        price: 50,
        rarity: 'common',
        spriteSheet: 'floors_wood',
        spriteX: 3, spriteY: 0,
        width: 64, height: 64,
        tags: ['우드', '버치', '밝은']
    },
    {
        id: 'floor_wood_pine',
        category: 'floor',
        subcategory: 'wood',
        name: '파인 네추럴',
        description: '따뜻한 소나무 마루',
        price: 45,
        rarity: 'common',
        spriteSheet: 'floors_wood',
        spriteX: 4, spriteY: 0,
        width: 64, height: 64,
        tags: ['우드', '소나무', '웜톤']
    },

    // === 미디엄 우드 (5종) ===
    {
        id: 'floor_wood_oak_medium',
        category: 'floor',
        subcategory: 'wood',
        name: '미디엄 오크',
        description: '클래식한 오크 톤',
        price: 60,
        rarity: 'common',
        spriteSheet: 'floors_wood',
        spriteX: 0, spriteY: 1,
        width: 64, height: 64,
        tags: ['우드', '오크', '클래식']
    },
    {
        id: 'floor_wood_cherry',
        category: 'floor',
        subcategory: 'wood',
        name: '체리 우드',
        description: '따뜻한 체리나무 색상',
        price: 70,
        rarity: 'rare',
        spriteSheet: 'floors_wood',
        spriteX: 1, spriteY: 1,
        width: 64, height: 64,
        tags: ['우드', '체리', '웜톤']
    },
    {
        id: 'floor_wood_teak',
        category: 'floor',
        subcategory: 'wood',
        name: '티크 골드',
        description: '황금빛 티크 우드',
        price: 80,
        rarity: 'rare',
        spriteSheet: 'floors_wood',
        spriteX: 2, spriteY: 1,
        width: 64, height: 64,
        tags: ['우드', '티크', '럭셔리']
    },
    {
        id: 'floor_wood_herringbone',
        category: 'floor',
        subcategory: 'wood',
        name: '헤링본 미디엄',
        description: '세련된 헤링본 패턴',
        price: 100,
        rarity: 'rare',
        spriteSheet: 'floors_wood',
        spriteX: 3, spriteY: 1,
        width: 64, height: 64,
        tags: ['우드', '헤링본', '패턴']
    },
    {
        id: 'floor_wood_parquet',
        category: 'floor',
        subcategory: 'wood',
        name: '파케이 클래식',
        description: '전통적인 파케이 패턴',
        price: 90,
        rarity: 'rare',
        spriteSheet: 'floors_wood',
        spriteX: 4, spriteY: 1,
        width: 64, height: 64,
        tags: ['우드', '파케이', '전통']
    },

    // === 다크 우드 (5종) ===
    {
        id: 'floor_wood_walnut',
        category: 'floor',
        subcategory: 'wood',
        name: '월넛 다크',
        description: '고급스러운 호두나무',
        price: 80,
        rarity: 'rare',
        spriteSheet: 'floors_wood',
        spriteX: 0, spriteY: 2,
        width: 64, height: 64,
        tags: ['우드', '월넛', '다크']
    },
    {
        id: 'floor_wood_mahogany',
        category: 'floor',
        subcategory: 'wood',
        name: '마호가니 리치',
        description: '깊은 마호가니 색상',
        price: 100,
        rarity: 'epic',
        spriteSheet: 'floors_wood',
        spriteX: 1, spriteY: 2,
        width: 64, height: 64,
        tags: ['우드', '마호가니', '럭셔리']
    },
    {
        id: 'floor_wood_ebony',
        category: 'floor',
        subcategory: 'wood',
        name: '에보니 블랙',
        description: '진한 흑단 우드',
        price: 120,
        rarity: 'epic',
        spriteSheet: 'floors_wood',
        spriteX: 2, spriteY: 2,
        width: 64, height: 64,
        tags: ['우드', '에보니', '블랙']
    },
    {
        id: 'floor_wood_weathered',
        category: 'floor',
        subcategory: 'wood',
        name: '웨더드 빈티지',
        description: '오래된 느낌의 빈티지 우드',
        price: 70,
        rarity: 'common',
        spriteSheet: 'floors_wood',
        spriteX: 3, spriteY: 2,
        width: 64, height: 64,
        tags: ['우드', '빈티지', '앤티크']
    },
    {
        id: 'floor_wood_rustic',
        category: 'floor',
        subcategory: 'wood',
        name: '러스틱 리클레임',
        description: '재생 목재 느낌',
        price: 75,
        rarity: 'rare',
        spriteSheet: 'floors_wood',
        spriteX: 4, spriteY: 2,
        width: 64, height: 64,
        tags: ['우드', '러스틱', '친환경']
    }
];
