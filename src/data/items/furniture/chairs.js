/**
 * 의자 가구 컬렉션
 * 25종
 */

export const CHAIR_ITEMS = [
    // === 식당/주방 의자 (8종) ===
    { id: 'chair_dining_wood', category: 'furniture', subcategory: 'chairs', name: '원목 식탁 의자', description: '기본 원목 의자', price: 50, rarity: 'common', spriteSheet: 'furniture_chairs', spriteX: 0, spriteY: 0, width: 32, height: 48, tags: ['의자', '식탁', '원목'] },
    { id: 'chair_dining_white', category: 'furniture', subcategory: 'chairs', name: '화이트 식탁 의자', description: '깔끔한 화이트 의자', price: 55, rarity: 'common', spriteSheet: 'furniture_chairs', spriteX: 1, spriteY: 0, width: 32, height: 48, tags: ['의자', '식탁', '화이트'] },
    { id: 'chair_dining_upholstered', category: 'furniture', subcategory: 'chairs', name: '패브릭 식탁 의자', description: '편한 패브릭 의자', price: 80, rarity: 'common', spriteSheet: 'furniture_chairs', spriteX: 2, spriteY: 0, width: 32, height: 48, tags: ['의자', '식탁', '패브릭'] },
    { id: 'chair_dining_eames', category: 'furniture', subcategory: 'chairs', name: '임스 체어', description: '유명 디자인 의자', price: 150, rarity: 'rare', spriteSheet: 'furniture_chairs', spriteX: 3, spriteY: 0, width: 32, height: 48, tags: ['의자', '임스', '디자인'] },
    { id: 'chair_dining_wishbone', category: 'furniture', subcategory: 'chairs', name: '위시본 체어', description: '북유럽 스타일', price: 180, rarity: 'rare', spriteSheet: 'furniture_chairs', spriteX: 4, spriteY: 0, width: 32, height: 48, tags: ['의자', '위시본', '북유럽'] },
    { id: 'chair_dining_thonet', category: 'furniture', subcategory: 'chairs', name: '토넷 체어', description: '클래식 벤트우드', price: 120, rarity: 'rare', spriteSheet: 'furniture_chairs', spriteX: 5, spriteY: 0, width: 32, height: 48, tags: ['의자', '토넷', '클래식'] },
    { id: 'chair_bar_stool', category: 'furniture', subcategory: 'chairs', name: '바 스툴', description: '높은 바 의자', price: 70, rarity: 'common', spriteSheet: 'furniture_chairs', spriteX: 6, spriteY: 0, width: 32, height: 64, tags: ['의자', '바', '스툴'] },
    { id: 'chair_counter_stool', category: 'furniture', subcategory: 'chairs', name: '카운터 스툴', description: '중간 높이 스툴', price: 65, rarity: 'common', spriteSheet: 'furniture_chairs', spriteX: 7, spriteY: 0, width: 32, height: 56, tags: ['의자', '카운터', '스툴'] },

    // === 사무/학습 의자 (8종) ===
    { id: 'chair_office_basic', category: 'furniture', subcategory: 'chairs', name: '기본 사무 의자', description: '실용적인 사무 의자', price: 80, rarity: 'common', spriteSheet: 'furniture_chairs', spriteX: 0, spriteY: 1, width: 32, height: 48, tags: ['의자', '사무', '기본'] },
    { id: 'chair_office_mesh', category: 'furniture', subcategory: 'chairs', name: '메쉬 사무 의자', description: '통기성 좋은 메쉬', price: 120, rarity: 'common', spriteSheet: 'furniture_chairs', spriteX: 1, spriteY: 1, width: 32, height: 48, tags: ['의자', '사무', '메쉬'] },
    { id: 'chair_office_ergonomic', category: 'furniture', subcategory: 'chairs', name: '인체공학 의자', description: '건강한 자세 유지', price: 300, rarity: 'epic', spriteSheet: 'furniture_chairs', spriteX: 2, spriteY: 1, width: 32, height: 48, tags: ['의자', '인체공학', '건강'] },
    { id: 'chair_office_executive', category: 'furniture', subcategory: 'chairs', name: '임원용 가죽 의자', description: '고급 가죽 임원 의자', price: 400, rarity: 'epic', spriteSheet: 'furniture_chairs', spriteX: 3, spriteY: 1, width: 48, height: 64, tags: ['의자', '임원', '가죽'] },
    { id: 'chair_gaming', category: 'furniture', subcategory: 'chairs', name: '게이밍 체어', description: 'RGB 게이밍 의자', price: 350, rarity: 'epic', spriteSheet: 'furniture_chairs', spriteX: 4, spriteY: 1, width: 48, height: 64, animation: 'glow_pulse', tags: ['의자', '게이밍', 'RGB'] },
    { id: 'chair_study_kids', category: 'furniture', subcategory: 'chairs', name: '아동 학습 의자', description: '높이 조절 아동용', price: 100, rarity: 'common', spriteSheet: 'furniture_chairs', spriteX: 5, spriteY: 1, width: 32, height: 48, tags: ['의자', '아동', '학습'] },
    { id: 'chair_kneeling', category: 'furniture', subcategory: 'chairs', name: '니링 체어', description: '무릎 기대는 의자', price: 150, rarity: 'rare', spriteSheet: 'furniture_chairs', spriteX: 6, spriteY: 1, width: 32, height: 48, tags: ['의자', '니링', '자세'] },
    { id: 'chair_balance_ball', category: 'furniture', subcategory: 'chairs', name: '밸런스 볼 의자', description: '운동하며 앉기', price: 80, rarity: 'common', spriteSheet: 'furniture_chairs', spriteX: 7, spriteY: 1, width: 32, height: 48, tags: ['의자', '밸런스', '운동'] },

    // === 특수/장식 의자 (9종) ===
    { id: 'chair_folding', category: 'furniture', subcategory: 'chairs', name: '접이식 의자', description: '간편 접이식', price: 30, rarity: 'common', spriteSheet: 'furniture_chairs', spriteX: 0, spriteY: 2, width: 32, height: 48, tags: ['의자', '접이식', '간편'] },
    { id: 'chair_stacking', category: 'furniture', subcategory: 'chairs', name: '스태킹 의자', description: '쌓아 보관하는 의자', price: 40, rarity: 'common', spriteSheet: 'furniture_chairs', spriteX: 1, spriteY: 2, width: 32, height: 48, tags: ['의자', '스태킹', '보관'] },
    { id: 'chair_swing_indoor', category: 'furniture', subcategory: 'chairs', name: '실내 그네 의자', description: '매달린 스윙 의자', price: 250, rarity: 'epic', spriteSheet: 'furniture_chairs', spriteX: 2, spriteY: 2, width: 48, height: 80, animation: 'swing', tags: ['의자', '그네', '인테리어'] },
    { id: 'chair_papasan', category: 'furniture', subcategory: 'chairs', name: '파파산 체어', description: '포근한 라탄 의자', price: 180, rarity: 'rare', spriteSheet: 'furniture_chairs', spriteX: 3, spriteY: 2, width: 48, height: 48, tags: ['의자', '파파산', '라탄'] },
    { id: 'chair_butterfly', category: 'furniture', subcategory: 'chairs', name: '버터플라이 체어', description: '클래식 디자인 의자', price: 150, rarity: 'rare', spriteSheet: 'furniture_chairs', spriteX: 4, spriteY: 2, width: 48, height: 48, tags: ['의자', '버터플라이', '디자인'] },
    { id: 'chair_adirondack', category: 'furniture', subcategory: 'chairs', name: '아디론댁 의자', description: '야외용 나무 의자', price: 120, rarity: 'common', spriteSheet: 'furniture_chairs', spriteX: 5, spriteY: 2, width: 48, height: 48, tags: ['의자', '야외', '나무'] },
    { id: 'chair_director', category: 'furniture', subcategory: 'chairs', name: '디렉터스 체어', description: '접이식 캔버스 의자', price: 100, rarity: 'common', spriteSheet: 'furniture_chairs', spriteX: 6, spriteY: 2, width: 32, height: 48, tags: ['의자', '디렉터', '캔버스'] },
    { id: 'chair_throne', category: 'furniture', subcategory: 'chairs', name: '왕좌 의자', description: '왕실 스타일 왕좌', price: 500, rarity: 'legendary', spriteSheet: 'furniture_chairs', spriteX: 7, spriteY: 2, width: 48, height: 80, tags: ['의자', '왕좌', '럭셔리'] },
    { id: 'cushion_floor', category: 'furniture', subcategory: 'chairs', name: '방석', description: '전통식 방석', price: 20, rarity: 'common', spriteSheet: 'furniture_chairs', spriteX: 0, spriteY: 3, width: 32, height: 16, tags: ['의자', '방석', '전통'] }
];
