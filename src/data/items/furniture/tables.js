/**
 * 테이블/책상 가구 컬렉션
 * 35종
 */

export const TABLE_ITEMS = [
    // === 식탁 (8종) ===
    { id: 'table_dining_wood_4', category: 'furniture', subcategory: 'tables', name: '원목 4인 식탁', description: '따뜻한 원목 4인용 식탁', price: 200, rarity: 'common', spriteSheet: 'furniture_tables', spriteX: 0, spriteY: 0, width: 64, height: 64, tags: ['테이블', '식탁', '원목'] },
    { id: 'table_dining_wood_6', category: 'furniture', subcategory: 'tables', name: '원목 6인 식탁', description: '넉넉한 6인용 식탁', price: 280, rarity: 'rare', spriteSheet: 'furniture_tables', spriteX: 1, spriteY: 0, width: 80, height: 64, tags: ['테이블', '식탁', '대형'] },
    { id: 'table_dining_glass_round', category: 'furniture', subcategory: 'tables', name: '유리 원형 식탁', description: '모던한 유리 원형 테이블', price: 250, rarity: 'rare', spriteSheet: 'furniture_tables', spriteX: 2, spriteY: 0, width: 64, height: 64, tags: ['테이블', '유리', '원형'] },
    { id: 'table_dining_marble', category: 'furniture', subcategory: 'tables', name: '대리석 식탁', description: '고급 대리석 식탁', price: 400, rarity: 'epic', spriteSheet: 'furniture_tables', spriteX: 3, spriteY: 0, width: 64, height: 64, tags: ['테이블', '대리석', '럭셔리'] },
    { id: 'table_dining_folding', category: 'furniture', subcategory: 'tables', name: '접이식 식탁', description: '공간 활용 접이식', price: 150, rarity: 'common', spriteSheet: 'furniture_tables', spriteX: 4, spriteY: 0, width: 48, height: 48, tags: ['테이블', '접이식', '실용'] },
    { id: 'table_dining_extendable', category: 'furniture', subcategory: 'tables', name: '확장형 식탁', description: '필요시 확장 가능', price: 350, rarity: 'epic', spriteSheet: 'furniture_tables', spriteX: 5, spriteY: 0, width: 80, height: 64, tags: ['테이블', '확장', '실용'] },
    { id: 'table_dining_industrial', category: 'furniture', subcategory: 'tables', name: '인더스트리얼 식탁', description: '금속+나무 조합', price: 300, rarity: 'rare', spriteSheet: 'furniture_tables', spriteX: 6, spriteY: 0, width: 64, height: 64, tags: ['테이블', '인더스트리얼', '모던'] },
    { id: 'table_dining_rustic', category: 'furniture', subcategory: 'tables', name: '러스틱 농가 테이블', description: '빈티지 농가 스타일', price: 280, rarity: 'rare', spriteSheet: 'furniture_tables', spriteX: 7, spriteY: 0, width: 80, height: 64, tags: ['테이블', '러스틱', '빈티지'] },

    // === 책상 (10종) ===
    { id: 'desk_study_simple', category: 'furniture', subcategory: 'tables', name: '심플 학습 책상', description: '기본 학생 책상', price: 100, rarity: 'common', spriteSheet: 'furniture_tables', spriteX: 0, spriteY: 1, width: 64, height: 48, tags: ['책상', '학습', '심플'] },
    { id: 'desk_study_drawer', category: 'furniture', subcategory: 'tables', name: '서랍형 학습 책상', description: '서랍이 있는 책상', price: 150, rarity: 'common', spriteSheet: 'furniture_tables', spriteX: 1, spriteY: 1, width: 64, height: 48, tags: ['책상', '서랍', '학습'] },
    { id: 'desk_computer_gaming', category: 'furniture', subcategory: 'tables', name: '게이밍 데스크', description: 'RGB 조명 장착', price: 300, rarity: 'epic', spriteSheet: 'furniture_tables', spriteX: 2, spriteY: 1, width: 80, height: 48, animation: 'glow_pulse', tags: ['책상', '게이밍', 'RGB'] },
    { id: 'desk_computer_l_shape', category: 'furniture', subcategory: 'tables', name: 'L자 컴퓨터 책상', description: '넓은 작업 공간', price: 250, rarity: 'rare', spriteSheet: 'furniture_tables', spriteX: 3, spriteY: 1, width: 80, height: 64, tags: ['책상', 'L자', '컴퓨터'] },
    { id: 'desk_standing', category: 'furniture', subcategory: 'tables', name: '스탠딩 책상', description: '높이 조절 가능', price: 350, rarity: 'epic', spriteSheet: 'furniture_tables', spriteX: 4, spriteY: 1, width: 64, height: 48, tags: ['책상', '스탠딩', '건강'] },
    { id: 'desk_secretary', category: 'furniture', subcategory: 'tables', name: '세크러터리 책상', description: '접이식 덮개 책상', price: 280, rarity: 'rare', spriteSheet: 'furniture_tables', spriteX: 5, spriteY: 1, width: 48, height: 64, tags: ['책상', '앤티크', '접이식'] },
    { id: 'desk_executive', category: 'furniture', subcategory: 'tables', name: '임원용 대형 책상', description: '위엄 있는 대형 책상', price: 500, rarity: 'legendary', spriteSheet: 'furniture_tables', spriteX: 6, spriteY: 1, width: 96, height: 64, tags: ['책상', '임원', '럭셔리'] },
    { id: 'desk_kids_pink', category: 'furniture', subcategory: 'tables', name: '핑크 아동 책상', description: '귀여운 핑크 책상', price: 120, rarity: 'common', spriteSheet: 'furniture_tables', spriteX: 7, spriteY: 1, width: 48, height: 48, tags: ['책상', '아동', '핑크'] },
    { id: 'desk_kids_blue', category: 'furniture', subcategory: 'tables', name: '블루 아동 책상', description: '시원한 블루 책상', price: 120, rarity: 'common', spriteSheet: 'furniture_tables', spriteX: 0, spriteY: 2, width: 48, height: 48, tags: ['책상', '아동', '블루'] },
    { id: 'desk_vanity', category: 'furniture', subcategory: 'tables', name: '화장대', description: '거울 달린 화장대', price: 200, rarity: 'rare', spriteSheet: 'furniture_tables', spriteX: 1, spriteY: 2, width: 64, height: 64, tags: ['책상', '화장대', '거울'] },

    // === 커피/사이드 테이블 (10종) ===
    { id: 'table_coffee_wood', category: 'furniture', subcategory: 'tables', name: '원목 커피테이블', description: '거실용 원목 테이블', price: 100, rarity: 'common', spriteSheet: 'furniture_tables', spriteX: 2, spriteY: 2, width: 48, height: 32, tags: ['테이블', '커피', '거실'] },
    { id: 'table_coffee_glass', category: 'furniture', subcategory: 'tables', name: '유리 커피테이블', description: '모던 유리 테이블', price: 150, rarity: 'rare', spriteSheet: 'furniture_tables', spriteX: 3, spriteY: 2, width: 48, height: 32, tags: ['테이블', '유리', '모던'] },
    { id: 'table_coffee_marble', category: 'furniture', subcategory: 'tables', name: '마블 커피테이블', description: '대리석 상판 테이블', price: 250, rarity: 'epic', spriteSheet: 'furniture_tables', spriteX: 4, spriteY: 2, width: 48, height: 32, tags: ['테이블', '대리석', '럭셔리'] },
    { id: 'table_side_round', category: 'furniture', subcategory: 'tables', name: '원형 사이드테이블', description: '침대 옆 원형 테이블', price: 60, rarity: 'common', spriteSheet: 'furniture_tables', spriteX: 5, spriteY: 2, width: 32, height: 32, tags: ['테이블', '사이드', '원형'] },
    { id: 'table_side_drawer', category: 'furniture', subcategory: 'tables', name: '서랍 사이드테이블', description: '서랍 있는 협탁', price: 80, rarity: 'common', spriteSheet: 'furniture_tables', spriteX: 6, spriteY: 2, width: 32, height: 48, tags: ['테이블', '서랍', '협탁'] },
    { id: 'table_nesting', category: 'furniture', subcategory: 'tables', name: '네스팅 테이블 세트', description: '겹쳐 놓는 테이블', price: 180, rarity: 'rare', spriteSheet: 'furniture_tables', spriteX: 7, spriteY: 2, width: 48, height: 32, tags: ['테이블', '네스팅', '세트'] },
    { id: 'table_console', category: 'furniture', subcategory: 'tables', name: '콘솔 테이블', description: '현관/복도용 테이블', price: 150, rarity: 'common', spriteSheet: 'furniture_tables', spriteX: 0, spriteY: 3, width: 64, height: 32, tags: ['테이블', '콘솔', '현관'] },
    { id: 'table_end_c_shape', category: 'furniture', subcategory: 'tables', name: 'C자형 테이블', description: '소파 옆 C자 테이블', price: 90, rarity: 'common', spriteSheet: 'furniture_tables', spriteX: 1, spriteY: 3, width: 32, height: 48, tags: ['테이블', 'C자', '소파'] },
    { id: 'table_tray', category: 'furniture', subcategory: 'tables', name: '트레이 테이블', description: '이동식 트레이 테이블', price: 70, rarity: 'common', spriteSheet: 'furniture_tables', spriteX: 2, spriteY: 3, width: 32, height: 48, tags: ['테이블', '트레이', '이동식'] },
    { id: 'table_ottoman', category: 'furniture', subcategory: 'tables', name: '오토만 테이블', description: '발받침 겸용 테이블', price: 120, rarity: 'rare', spriteSheet: 'furniture_tables', spriteX: 3, spriteY: 3, width: 48, height: 32, tags: ['테이블', '오토만', '발받침'] },

    // === 특수 테이블 (7종) ===
    { id: 'table_bar_high', category: 'furniture', subcategory: 'tables', name: '바 테이블', description: '높은 바 테이블', price: 150, rarity: 'rare', spriteSheet: 'furniture_tables', spriteX: 4, spriteY: 3, width: 48, height: 64, tags: ['테이블', '바', '높은'] },
    { id: 'table_picnic', category: 'furniture', subcategory: 'tables', name: '피크닉 테이블', description: '야외 피크닉용', price: 120, rarity: 'common', spriteSheet: 'furniture_tables', spriteX: 5, spriteY: 3, width: 64, height: 48, tags: ['테이블', '피크닉', '야외'] },
    { id: 'table_kotatsu', category: 'furniture', subcategory: 'tables', name: '코타츠', description: '일본식 난방 테이블', price: 180, rarity: 'rare', spriteSheet: 'furniture_tables', spriteX: 6, spriteY: 3, width: 48, height: 32, tags: ['테이블', '코타츠', '일본'] },
    { id: 'table_korean_low', category: 'furniture', subcategory: 'tables', name: '한국 좌식 상', description: '전통 좌식 밥상', price: 100, rarity: 'common', spriteSheet: 'furniture_tables', spriteX: 7, spriteY: 3, width: 48, height: 32, tags: ['테이블', '좌식', '한국'] },
    { id: 'table_pool', category: 'furniture', subcategory: 'tables', name: '당구대', description: '미니 당구 테이블', price: 400, rarity: 'epic', spriteSheet: 'furniture_tables', spriteX: 0, spriteY: 4, width: 80, height: 48, tags: ['테이블', '당구', '게임'] },
    { id: 'table_foosball', category: 'furniture', subcategory: 'tables', name: '테이블 축구', description: '미니 축구 게임', price: 250, rarity: 'rare', spriteSheet: 'furniture_tables', spriteX: 1, spriteY: 4, width: 64, height: 48, tags: ['테이블', '축구', '게임'] },
    { id: 'table_air_hockey', category: 'furniture', subcategory: 'tables', name: '에어하키 테이블', description: '에어하키 게임', price: 300, rarity: 'epic', spriteSheet: 'furniture_tables', spriteX: 2, spriteY: 4, width: 64, height: 48, tags: ['테이블', '에어하키', '게임'] }
];
