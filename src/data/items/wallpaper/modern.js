/**
 * 모던/미니멀 벽지 컬렉션
 * 세련된 현대적 스타일 벽지 10종
 */

export const MODERN_WALLPAPERS = [
    // === 무채색 모던 (4종) ===
    {
        id: 'wall_modern_white',
        category: 'wallpaper',
        subcategory: 'modern',
        name: '퓨어 화이트',
        description: '깨끗하고 순수한 화이트',
        price: 30,
        rarity: 'common',
        color: '#FFFFFF',
        isDefault: true,
        tags: ['모던', '화이트', '미니멀']
    },
    {
        id: 'wall_modern_gray_light',
        category: 'wallpaper',
        subcategory: 'modern',
        name: '라이트 그레이',
        description: '은은한 라이트 그레이',
        price: 40,
        rarity: 'common',
        color: '#F1F5F9',
        tags: ['모던', '그레이', '미니멀']
    },
    {
        id: 'wall_modern_gray_mid',
        category: 'wallpaper',
        subcategory: 'modern',
        name: '미드 그레이',
        description: '차분한 미드톤 그레이',
        price: 45,
        rarity: 'common',
        color: '#CBD5E1',
        tags: ['모던', '그레이', '차분']
    },
    {
        id: 'wall_modern_black',
        category: 'wallpaper',
        subcategory: 'modern',
        name: '시크 블랙',
        description: '세련된 블랙 월',
        price: 60,
        rarity: 'rare',
        color: '#1E293B',
        tags: ['모던', '블랙', '시크']
    },

    // === 콘크리트/질감 (3종) ===
    {
        id: 'wall_modern_concrete',
        category: 'wallpaper',
        subcategory: 'modern',
        name: '콘크리트 월',
        description: '인더스트리얼 콘크리트 질감',
        price: 70,
        rarity: 'common',
        spriteSheet: 'wallpapers_modern',
        spriteX: 0, spriteY: 0,
        width: 64, height: 64,
        tags: ['모던', '콘크리트', '인더스트리얼']
    },
    {
        id: 'wall_modern_marble',
        category: 'wallpaper',
        subcategory: 'modern',
        name: '화이트 마블',
        description: '고급스러운 대리석 무늬',
        price: 150,
        rarity: 'epic',
        spriteSheet: 'wallpapers_modern',
        spriteX: 1, spriteY: 0,
        width: 64, height: 64,
        tags: ['모던', '마블', '럭셔리']
    },
    {
        id: 'wall_modern_plaster',
        category: 'wallpaper',
        subcategory: 'modern',
        name: '플라스터 질감',
        description: '부드러운 회벽 질감',
        price: 60,
        rarity: 'common',
        spriteSheet: 'wallpapers_modern',
        spriteX: 2, spriteY: 0,
        width: 64, height: 64,
        tags: ['모던', '플라스터', '텍스처']
    },

    // === 기하학 패턴 (3종) ===
    {
        id: 'wall_modern_geometric',
        category: 'wallpaper',
        subcategory: 'modern',
        name: '기하학 패턴',
        description: '세련된 기하학적 패턴',
        price: 80,
        rarity: 'rare',
        spriteSheet: 'wallpapers_modern',
        spriteX: 0, spriteY: 1,
        width: 64, height: 64,
        tags: ['모던', '기하학', '패턴']
    },
    {
        id: 'wall_modern_hexagon',
        category: 'wallpaper',
        subcategory: 'modern',
        name: '헥사곤 패턴',
        description: '트렌디한 육각형 패턴',
        price: 90,
        rarity: 'rare',
        spriteSheet: 'wallpapers_modern',
        spriteX: 1, spriteY: 1,
        width: 64, height: 64,
        tags: ['모던', '육각형', '트렌디']
    },
    {
        id: 'wall_modern_lines',
        category: 'wallpaper',
        subcategory: 'modern',
        name: '미니멀 라인',
        description: '심플한 라인 패턴',
        price: 55,
        rarity: 'common',
        spriteSheet: 'wallpapers_modern',
        spriteX: 2, spriteY: 1,
        width: 64, height: 64,
        tags: ['모던', '라인', '미니멀']
    }
];
