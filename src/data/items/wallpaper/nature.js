/**
 * 자연 테마 벽지 컬렉션
 * 숲, 바다, 하늘 등 자연 풍경 벽지 15종
 */

export const NATURE_WALLPAPERS = [
    // === 하늘/구름 (4종) ===
    {
        id: 'wall_sky_blue',
        category: 'wallpaper',
        subcategory: 'nature',
        name: '맑은 푸른 하늘',
        description: '구름 한 점 없는 청명한 하늘',
        price: 50,
        rarity: 'common',
        spriteSheet: 'wallpapers_nature',
        spriteX: 0, spriteY: 0,
        width: 64, height: 64,
        tags: ['하늘', '블루', '청명']
    },
    {
        id: 'wall_sky_sunset',
        category: 'wallpaper',
        subcategory: 'nature',
        name: '노을 지는 하늘',
        description: '붉게 물든 저녁 하늘',
        price: 80,
        rarity: 'rare',
        spriteSheet: 'wallpapers_nature',
        spriteX: 1, spriteY: 0,
        width: 64, height: 64,
        tags: ['하늘', '노을', '석양']
    },
    {
        id: 'wall_sky_night',
        category: 'wallpaper',
        subcategory: 'nature',
        name: '별이 빛나는 밤',
        description: '반짝이는 별들이 수놓인 밤하늘',
        price: 100,
        rarity: 'rare',
        spriteSheet: 'wallpapers_nature',
        spriteX: 2, spriteY: 0,
        width: 64, height: 64,
        tags: ['하늘', '밤', '별']
    },
    {
        id: 'wall_sky_rainbow',
        category: 'wallpaper',
        subcategory: 'nature',
        name: '무지개 하늘',
        description: '비 온 뒤 펼쳐진 무지개',
        price: 120,
        rarity: 'epic',
        spriteSheet: 'wallpapers_nature',
        spriteX: 3, spriteY: 0,
        width: 64, height: 64,
        tags: ['하늘', '무지개', '희망']
    },

    // === 숲/나무 (4종) ===
    {
        id: 'wall_forest_spring',
        category: 'wallpaper',
        subcategory: 'nature',
        name: '봄의 숲',
        description: '새싹이 돋아나는 봄 숲',
        price: 70,
        rarity: 'common',
        spriteSheet: 'wallpapers_nature',
        spriteX: 0, spriteY: 1,
        width: 64, height: 64,
        season: 'spring',
        tags: ['숲', '봄', '새싹']
    },
    {
        id: 'wall_forest_summer',
        category: 'wallpaper',
        subcategory: 'nature',
        name: '여름 초록 숲',
        description: '울창한 초록 잎의 숲',
        price: 70,
        rarity: 'common',
        spriteSheet: 'wallpapers_nature',
        spriteX: 1, spriteY: 1,
        width: 64, height: 64,
        season: 'summer',
        tags: ['숲', '여름', '초록']
    },
    {
        id: 'wall_forest_autumn',
        category: 'wallpaper',
        subcategory: 'nature',
        name: '단풍 숲',
        description: '빨갛게 물든 가을 단풍',
        price: 80,
        rarity: 'rare',
        spriteSheet: 'wallpapers_nature',
        spriteX: 2, spriteY: 1,
        width: 64, height: 64,
        season: 'autumn',
        tags: ['숲', '가을', '단풍']
    },
    {
        id: 'wall_forest_winter',
        category: 'wallpaper',
        subcategory: 'nature',
        name: '눈 덮인 숲',
        description: '하얀 눈으로 뒤덮인 겨울 숲',
        price: 80,
        rarity: 'rare',
        spriteSheet: 'wallpapers_nature',
        spriteX: 3, spriteY: 1,
        width: 64, height: 64,
        season: 'winter',
        tags: ['숲', '겨울', '눈']
    },

    // === 바다/물 (4종) ===
    {
        id: 'wall_ocean_calm',
        category: 'wallpaper',
        subcategory: 'nature',
        name: '잔잔한 바다',
        description: '평화로운 푸른 바다',
        price: 70,
        rarity: 'common',
        spriteSheet: 'wallpapers_nature',
        spriteX: 0, spriteY: 2,
        width: 64, height: 64,
        tags: ['바다', '평화', '블루']
    },
    {
        id: 'wall_ocean_beach',
        category: 'wallpaper',
        subcategory: 'nature',
        name: '해변 풍경',
        description: '모래사장과 파도가 어우러진 해변',
        price: 90,
        rarity: 'rare',
        spriteSheet: 'wallpapers_nature',
        spriteX: 1, spriteY: 2,
        width: 64, height: 64,
        tags: ['바다', '해변', '여름']
    },
    {
        id: 'wall_ocean_deep',
        category: 'wallpaper',
        subcategory: 'nature',
        name: '심해 세계',
        description: '신비로운 심해의 풍경',
        price: 120,
        rarity: 'epic',
        spriteSheet: 'wallpapers_nature',
        spriteX: 2, spriteY: 2,
        width: 64, height: 64,
        tags: ['바다', '심해', '신비']
    },
    {
        id: 'wall_ocean_coral',
        category: 'wallpaper',
        subcategory: 'nature',
        name: '산호초 바다',
        description: '알록달록한 산호초가 있는 바다',
        price: 100,
        rarity: 'rare',
        spriteSheet: 'wallpapers_nature',
        spriteX: 3, spriteY: 2,
        width: 64, height: 64,
        tags: ['바다', '산호초', '열대']
    },

    // === 꽃/정원 (3종) ===
    {
        id: 'wall_garden_rose',
        category: 'wallpaper',
        subcategory: 'nature',
        name: '장미 정원',
        description: '탐스러운 장미가 가득한 정원',
        price: 90,
        rarity: 'rare',
        spriteSheet: 'wallpapers_nature',
        spriteX: 0, spriteY: 3,
        width: 64, height: 64,
        tags: ['꽃', '장미', '정원']
    },
    {
        id: 'wall_garden_cherry',
        category: 'wallpaper',
        subcategory: 'nature',
        name: '벚꽃 만개',
        description: '분홍빛 벚꽃이 흩날리는 풍경',
        price: 100,
        rarity: 'rare',
        spriteSheet: 'wallpapers_nature',
        spriteX: 1, spriteY: 3,
        width: 64, height: 64,
        season: 'spring',
        tags: ['꽃', '벚꽃', '봄']
    },
    {
        id: 'wall_garden_sunflower',
        category: 'wallpaper',
        subcategory: 'nature',
        name: '해바라기 밭',
        description: '태양을 향해 핀 해바라기',
        price: 80,
        rarity: 'common',
        spriteSheet: 'wallpapers_nature',
        spriteX: 2, spriteY: 3,
        width: 64, height: 64,
        season: 'summer',
        tags: ['꽃', '해바라기', '여름']
    }
];
