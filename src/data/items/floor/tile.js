/**
 * 타일 바닥재 컬렉션
 * 다양한 타일 패턴 15종
 */

export const TILE_FLOORS = [
    // === 모던 타일 (5종) ===
    {
        id: 'floor_tile_white',
        category: 'floor',
        subcategory: 'tile',
        name: '퓨어 화이트 타일',
        description: '깨끗한 화이트 타일',
        price: 50,
        rarity: 'common',
        color: '#FFFFFF',
        isDefault: true,
        tags: ['타일', '화이트', '모던']
    },
    {
        id: 'floor_tile_gray',
        category: 'floor',
        subcategory: 'tile',
        name: '그레이 포세린',
        description: '세련된 그레이 포세린',
        price: 60,
        rarity: 'common',
        spriteSheet: 'floors_tile',
        spriteX: 0, spriteY: 0,
        width: 64, height: 64,
        tags: ['타일', '그레이', '모던']
    },
    {
        id: 'floor_tile_black',
        category: 'floor',
        subcategory: 'tile',
        name: '슬레이트 블랙',
        description: '고급스러운 블랙 타일',
        price: 70,
        rarity: 'rare',
        spriteSheet: 'floors_tile',
        spriteX: 1, spriteY: 0,
        width: 64, height: 64,
        tags: ['타일', '블랙', '시크']
    },
    {
        id: 'floor_tile_large_format',
        category: 'floor',
        subcategory: 'tile',
        name: '대형 포맷 타일',
        description: '트렌디한 대형 타일',
        price: 80,
        rarity: 'rare',
        spriteSheet: 'floors_tile',
        spriteX: 2, spriteY: 0,
        width: 64, height: 64,
        tags: ['타일', '대형', '트렌디']
    },
    {
        id: 'floor_tile_concrete',
        category: 'floor',
        subcategory: 'tile',
        name: '콘크리트 룩',
        description: '인더스트리얼 콘크리트 느낌',
        price: 65,
        rarity: 'common',
        spriteSheet: 'floors_tile',
        spriteX: 3, spriteY: 0,
        width: 64, height: 64,
        tags: ['타일', '콘크리트', '인더스트리얼']
    },

    // === 패턴 타일 (5종) ===
    {
        id: 'floor_tile_checker_bw',
        category: 'floor',
        subcategory: 'tile',
        name: '체커보드 B/W',
        description: '클래식 흑백 체크',
        price: 70,
        rarity: 'rare',
        spriteSheet: 'floors_tile',
        spriteX: 0, spriteY: 1,
        width: 64, height: 64,
        tags: ['타일', '체커', '클래식']
    },
    {
        id: 'floor_tile_checker_pink',
        category: 'floor',
        subcategory: 'tile',
        name: '체커보드 핑크',
        description: '핑크 & 화이트 체크',
        price: 75,
        rarity: 'rare',
        spriteSheet: 'floors_tile',
        spriteX: 1, spriteY: 1,
        width: 64, height: 64,
        tags: ['타일', '체커', '핑크']
    },
    {
        id: 'floor_tile_hexagon',
        category: 'floor',
        subcategory: 'tile',
        name: '헥사곤 타일',
        description: '트렌디한 육각 타일',
        price: 90,
        rarity: 'rare',
        spriteSheet: 'floors_tile',
        spriteX: 2, spriteY: 1,
        width: 64, height: 64,
        tags: ['타일', '헥사곤', '트렌디']
    },
    {
        id: 'floor_tile_moroccan',
        category: 'floor',
        subcategory: 'tile',
        name: '모로칸 패턴',
        description: '이국적인 모로칸 문양',
        price: 100,
        rarity: 'epic',
        spriteSheet: 'floors_tile',
        spriteX: 3, spriteY: 1,
        width: 64, height: 64,
        tags: ['타일', '모로칸', '패턴']
    },
    {
        id: 'floor_tile_subway',
        category: 'floor',
        subcategory: 'tile',
        name: '서브웨이 타일',
        description: '심플한 서브웨이 패턴',
        price: 55,
        rarity: 'common',
        spriteSheet: 'floors_tile',
        spriteX: 4, spriteY: 1,
        width: 64, height: 64,
        tags: ['타일', '서브웨이', '심플']
    },

    // === 대리석/프리미엄 (5종) ===
    {
        id: 'floor_tile_marble_white',
        category: 'floor',
        subcategory: 'tile',
        name: '화이트 마블',
        description: '고급스러운 백색 대리석',
        price: 150,
        rarity: 'epic',
        spriteSheet: 'floors_tile',
        spriteX: 0, spriteY: 2,
        width: 64, height: 64,
        tags: ['타일', '마블', '럭셔리']
    },
    {
        id: 'floor_tile_marble_gray',
        category: 'floor',
        subcategory: 'tile',
        name: '그레이 마블',
        description: '세련된 그레이 대리석',
        price: 140,
        rarity: 'epic',
        spriteSheet: 'floors_tile',
        spriteX: 1, spriteY: 2,
        width: 64, height: 64,
        tags: ['타일', '마블', '그레이']
    },
    {
        id: 'floor_tile_marble_pink',
        category: 'floor',
        subcategory: 'tile',
        name: '핑크 마블',
        description: '로맨틱한 핑크 대리석',
        price: 180,
        rarity: 'legendary',
        spriteSheet: 'floors_tile',
        spriteX: 2, spriteY: 2,
        width: 64, height: 64,
        tags: ['타일', '마블', '핑크']
    },
    {
        id: 'floor_tile_marble_black',
        category: 'floor',
        subcategory: 'tile',
        name: '블랙 마블',
        description: '고급스러운 블랙 대리석',
        price: 160,
        rarity: 'epic',
        spriteSheet: 'floors_tile',
        spriteX: 3, spriteY: 2,
        width: 64, height: 64,
        tags: ['타일', '마블', '블랙']
    },
    {
        id: 'floor_tile_terrazzo',
        category: 'floor',
        subcategory: 'tile',
        name: '테라조',
        description: '레트로한 테라조 바닥',
        price: 120,
        rarity: 'rare',
        spriteSheet: 'floors_tile',
        spriteX: 4, spriteY: 2,
        width: 64, height: 64,
        tags: ['타일', '테라조', '레트로']
    }
];
