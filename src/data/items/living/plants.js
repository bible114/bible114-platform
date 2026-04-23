/**
 * 식물/화분 컬렉션
 * 40종
 */

export const PLANT_ITEMS = [
    // === 소형 식물 (10종) ===
    { id: 'plant_succulent_small', category: 'living', subcategory: 'plants', name: '미니 다육이', description: '귀여운 소형 다육', price: 30, rarity: 'common', spriteSheet: 'plants', spriteX: 0, spriteY: 0, width: 24, height: 32, tags: ['식물', '다육', '미니'] },
    { id: 'plant_cactus_small', category: 'living', subcategory: 'plants', name: '미니 선인장', description: '작은 선인장', price: 25, rarity: 'common', spriteSheet: 'plants', spriteX: 1, spriteY: 0, width: 24, height: 32, tags: ['식물', '선인장', '미니'] },
    { id: 'plant_pothos_small', category: 'living', subcategory: 'plants', name: '미니 스킨답서스', description: '잎이 예쁜 식물', price: 35, rarity: 'common', spriteSheet: 'plants', spriteX: 2, spriteY: 0, width: 32, height: 32, tags: ['식물', '관엽', '미니'] },
    { id: 'plant_flower_pot_pink', category: 'living', subcategory: 'plants', name: '핑크 꽃화분', description: '분홍 꽃이 핀 화분', price: 40, rarity: 'common', spriteSheet: 'plants', spriteX: 3, spriteY: 0, width: 24, height: 32, tags: ['식물', '꽃', '핑크'] },
    { id: 'plant_flower_pot_yellow', category: 'living', subcategory: 'plants', name: '노랑 꽃화분', description: '노란 꽃이 핀 화분', price: 40, rarity: 'common', spriteSheet: 'plants', spriteX: 4, spriteY: 0, width: 24, height: 32, tags: ['식물', '꽃', '옐로우'] },
    { id: 'plant_aloe', category: 'living', subcategory: 'plants', name: '알로에', description: '관리 쉬운 알로에', price: 35, rarity: 'common', spriteSheet: 'plants', spriteX: 5, spriteY: 0, width: 32, height: 32, tags: ['식물', '알로에', '다육'] },
    { id: 'plant_airplant', category: 'living', subcategory: 'plants', name: '에어플랜트', description: '물이 필요 없는 식물', price: 50, rarity: 'rare', spriteSheet: 'plants', spriteX: 6, spriteY: 0, width: 24, height: 24, tags: ['식물', '에어플랜트', '특이'] },
    { id: 'plant_bamboo_lucky', category: 'living', subcategory: 'plants', name: '개운죽', description: '행운을 주는 대나무', price: 45, rarity: 'common', spriteSheet: 'plants', spriteX: 7, spriteY: 0, width: 24, height: 48, tags: ['식물', '개운죽', '행운'] },
    { id: 'plant_herbs_mint', category: 'living', subcategory: 'plants', name: '민트 허브', description: '향기로운 민트', price: 30, rarity: 'common', spriteSheet: 'plants', spriteX: 0, spriteY: 1, width: 24, height: 32, tags: ['식물', '허브', '민트'] },
    { id: 'plant_violet', category: 'living', subcategory: 'plants', name: '아프리칸 바이올렛', description: '보라색 작은 꽃', price: 55, rarity: 'rare', spriteSheet: 'plants', spriteX: 1, spriteY: 1, width: 32, height: 32, tags: ['식물', '꽃', '보라'] },

    // === 중형 식물 (10종) ===
    { id: 'plant_monstera', category: 'living', subcategory: 'plants', name: '몬스테라', description: '인기 있는 관엽식물', price: 100, rarity: 'rare', spriteSheet: 'plants', spriteX: 2, spriteY: 1, width: 48, height: 64, tags: ['식물', '몬스테라', '관엽'] },
    { id: 'plant_fiddle_leaf', category: 'living', subcategory: 'plants', name: '식물스티커리', description: '넓은 잎 식물', price: 120, rarity: 'rare', spriteSheet: 'plants', spriteX: 3, spriteY: 1, width: 48, height: 64, tags: ['식물', '관엽', '인테리어'] },
    { id: 'plant_snake', category: 'living', subcategory: 'plants', name: '스네이크 플랜트', description: '공기정화 식물', price: 80, rarity: 'common', spriteSheet: 'plants', spriteX: 4, spriteY: 1, width: 32, height: 64, tags: ['식물', '스네이크', '공기정화'] },
    { id: 'plant_peace_lily', category: 'living', subcategory: 'plants', name: '스파티필름', description: '흰 꽃 피는 식물', price: 90, rarity: 'rare', spriteSheet: 'plants', spriteX: 5, spriteY: 1, width: 48, height: 64, tags: ['식물', '꽃', '흰색'] },
    { id: 'plant_rubber', category: 'living', subcategory: 'plants', name: '고무나무', description: '튼튼한 고무나무', price: 85, rarity: 'common', spriteSheet: 'plants', spriteX: 6, spriteY: 1, width: 48, height: 64, tags: ['식물', '고무나무', '관엽'] },
    { id: 'plant_philodendron', category: 'living', subcategory: 'plants', name: '필로덴드론', description: '하트 모양 잎', price: 95, rarity: 'rare', spriteSheet: 'plants', spriteX: 7, spriteY: 1, width: 48, height: 64, tags: ['식물', '필로덴드론', '하트'] },
    { id: 'plant_pothos_hanging', category: 'living', subcategory: 'plants', name: '행잉 스킨답서스', description: '늘어지는 덩굴 식물', price: 75, rarity: 'common', spriteSheet: 'plants', spriteX: 0, spriteY: 2, width: 48, height: 64, tags: ['식물', '행잉', '덩굴'] },
    { id: 'plant_bonsai', category: 'living', subcategory: 'plants', name: '분재', description: '예술적인 분재', price: 200, rarity: 'epic', spriteSheet: 'plants', spriteX: 1, spriteY: 2, width: 48, height: 48, tags: ['식물', '분재', '예술'] },
    { id: 'plant_orchid_purple', category: 'living', subcategory: 'plants', name: '보라 호접란', description: '우아한 난초', price: 150, rarity: 'epic', spriteSheet: 'plants', spriteX: 2, spriteY: 2, width: 32, height: 64, tags: ['식물', '난초', '보라'] },
    { id: 'plant_orchid_white', category: 'living', subcategory: 'plants', name: '흰 호접란', description: '순결한 흰 난초', price: 150, rarity: 'epic', spriteSheet: 'plants', spriteX: 3, spriteY: 2, width: 32, height: 64, tags: ['식물', '난초', '흰색'] },

    // === 대형 식물 (10종) ===
    { id: 'plant_palm_areca', category: 'living', subcategory: 'plants', name: '아레카 야자', description: '트로피컬 무드', price: 180, rarity: 'rare', spriteSheet: 'plants', spriteX: 4, spriteY: 2, width: 64, height: 96, tags: ['식물', '야자', '대형'] },
    { id: 'plant_palm_kentia', category: 'living', subcategory: 'plants', name: '켄티아 야자', description: '우아한 야자', price: 200, rarity: 'epic', spriteSheet: 'plants', spriteX: 5, spriteY: 2, width: 64, height: 96, tags: ['식물', '야자', '대형'] },
    { id: 'plant_bird_of_paradise', category: 'living', subcategory: 'plants', name: '극락조', description: '이국적인 식물', price: 220, rarity: 'epic', spriteSheet: 'plants', spriteX: 6, spriteY: 2, width: 64, height: 96, tags: ['식물', '극락조', '이국'] },
    { id: 'plant_tree_indoor', category: 'living', subcategory: 'plants', name: '실내 나무', description: '큰 실내 나무', price: 250, rarity: 'epic', spriteSheet: 'plants', spriteX: 7, spriteY: 2, width: 64, height: 112, tags: ['식물', '나무', '대형'] },
    { id: 'plant_bamboo_tall', category: 'living', subcategory: 'plants', name: '대나무 화분', description: '높은 대나무', price: 180, rarity: 'rare', spriteSheet: 'plants', spriteX: 0, spriteY: 3, width: 48, height: 112, tags: ['식물', '대나무', '높은'] },
    { id: 'plant_money_tree', category: 'living', subcategory: 'plants', name: '돈나무', description: '재물운 식물', price: 150, rarity: 'rare', spriteSheet: 'plants', spriteX: 1, spriteY: 3, width: 48, height: 80, tags: ['식물', '돈나무', '행운'] },
    { id: 'plant_ficus_lyrata', category: 'living', subcategory: 'plants', name: '떡갈고무나무', description: '큰 잎 고무나무', price: 160, rarity: 'rare', spriteSheet: 'plants', spriteX: 2, spriteY: 3, width: 48, height: 96, tags: ['식물', '고무나무', '대형'] },
    { id: 'plant_olive_tree', category: 'living', subcategory: 'plants', name: '올리브 나무', description: '지중해 느낌', price: 200, rarity: 'epic', spriteSheet: 'plants', spriteX: 3, spriteY: 3, width: 48, height: 96, tags: ['식물', '올리브', '지중해'] },
    { id: 'plant_citrus_tree', category: 'living', subcategory: 'plants', name: '레몬 나무', description: '열매 맺는 나무', price: 180, rarity: 'epic', spriteSheet: 'plants', spriteX: 4, spriteY: 3, width: 48, height: 80, tags: ['식물', '레몬', '과일'] },
    { id: 'plant_cherry_blossom', category: 'living', subcategory: 'plants', name: '벚꽃 화분', description: '분홍빛 벚꽃', price: 250, rarity: 'legendary', spriteSheet: 'plants', spriteX: 5, spriteY: 3, width: 64, height: 96, season: 'spring', tags: ['식물', '벚꽃', '봄'] },

    // === 특수/장식 (10종) ===
    { id: 'plant_terrarium', category: 'living', subcategory: 'plants', name: '테라리움', description: '유리 속 미니 정원', price: 120, rarity: 'rare', spriteSheet: 'plants', spriteX: 6, spriteY: 3, width: 32, height: 48, tags: ['식물', '테라리움', '유리'] },
    { id: 'plant_kokedama', category: 'living', subcategory: 'plants', name: '코케다마', description: '이끼 공 식물', price: 80, rarity: 'rare', spriteSheet: 'plants', spriteX: 7, spriteY: 3, width: 32, height: 48, tags: ['식물', '코케다마', '이끼'] },
    { id: 'plant_flower_arrangement', category: 'living', subcategory: 'plants', name: '꽃꽂이', description: '예쁜 꽃꽂이', price: 100, rarity: 'rare', spriteSheet: 'plants', spriteX: 0, spriteY: 4, width: 48, height: 48, tags: ['식물', '꽃꽂이', '장식'] },
    { id: 'plant_rose_vase', category: 'living', subcategory: 'plants', name: '장미 꽃병', description: '빨간 장미 꽃병', price: 70, rarity: 'common', spriteSheet: 'plants', spriteX: 1, spriteY: 4, width: 24, height: 48, tags: ['식물', '장미', '꽃병'] },
    { id: 'plant_sunflower_pot', category: 'living', subcategory: 'plants', name: '해바라기 화분', description: '밝은 해바라기', price: 80, rarity: 'rare', spriteSheet: 'plants', spriteX: 2, spriteY: 4, width: 32, height: 64, season: 'summer', tags: ['식물', '해바라기', '여름'] },
    { id: 'plant_christmas_tree_small', category: 'living', subcategory: 'plants', name: '미니 크리스마스 트리', description: '작은 크리스마스 트리', price: 100, rarity: 'rare', spriteSheet: 'plants', spriteX: 3, spriteY: 4, width: 48, height: 64, season: 'christmas', tags: ['식물', '크리스마스', '트리'] },
    { id: 'plant_poinsettia', category: 'living', subcategory: 'plants', name: '포인세티아', description: '크리스마스 꽃', price: 60, rarity: 'common', spriteSheet: 'plants', spriteX: 4, spriteY: 4, width: 32, height: 48, season: 'christmas', tags: ['식물', '포인세티아', '겨울'] },
    { id: 'plant_tulip_pot', category: 'living', subcategory: 'plants', name: '튤립 화분', description: '봄꽃 튤립', price: 60, rarity: 'common', spriteSheet: 'plants', spriteX: 5, spriteY: 4, width: 32, height: 48, season: 'spring', tags: ['식물', '튤립', '봄'] },
    { id: 'plant_dried_flowers', category: 'living', subcategory: 'plants', name: '드라이플라워', description: '오래 가는 건조 꽃', price: 90, rarity: 'rare', spriteSheet: 'plants', spriteX: 6, spriteY: 4, width: 32, height: 48, tags: ['식물', '드라이플라워', '장식'] },
    { id: 'plant_fake_plant', category: 'living', subcategory: 'plants', name: '조화 식물', description: '관리 필요 없는 조화', price: 40, rarity: 'common', spriteSheet: 'plants', spriteX: 7, spriteY: 4, width: 32, height: 48, tags: ['식물', '조화', '인조'] }
];
