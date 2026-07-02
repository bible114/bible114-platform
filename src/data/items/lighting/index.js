/**
 * 조명 카테고리 컬렉션
 * 50종
 */

export const LIGHTING_ITEMS = [
    // === 천장 조명 (10종) ===
    { id: 'light_ceiling_simple', category: 'lighting', subcategory: 'ceiling', name: '심플 천장등', description: '기본 원형 조명', price: 60, rarity: 'common', spriteSheet: 'lighting', spriteX: 0, spriteY: 0, width: 48, height: 32, tags: ['조명', '천장', '심플'] },
    { id: 'light_chandelier_crystal', category: 'lighting', subcategory: 'ceiling', name: '크리스탈 샹들리에', description: '화려한 크리스탈', price: 500, rarity: 'legendary', spriteSheet: 'lighting', spriteX: 1, spriteY: 0, width: 64, height: 64, animation: 'sparkle', tags: ['조명', '샹들리에', '럭셔리'] },
    { id: 'light_chandelier_modern', category: 'lighting', subcategory: 'ceiling', name: '모던 샹들리에', description: '현대적 디자인', price: 300, rarity: 'epic', spriteSheet: 'lighting', spriteX: 2, spriteY: 0, width: 64, height: 48, tags: ['조명', '샹들리에', '모던'] },
    { id: 'light_pendant_single', category: 'lighting', subcategory: 'ceiling', name: '펜던트 조명', description: '1등 펜던트', price: 80, rarity: 'common', spriteSheet: 'lighting', spriteX: 3, spriteY: 0, width: 24, height: 48, tags: ['조명', '펜던트', '미니멀'] },
    { id: 'light_pendant_cluster', category: 'lighting', subcategory: 'ceiling', name: '클러스터 펜던트', description: '여러 개 묶음', price: 200, rarity: 'rare', spriteSheet: 'lighting', spriteX: 4, spriteY: 0, width: 64, height: 64, tags: ['조명', '펜던트', '클러스터'] },
    { id: 'light_industrial', category: 'lighting', subcategory: 'ceiling', name: '인더스트리얼 조명', description: '철제 느낌 조명', price: 120, rarity: 'rare', spriteSheet: 'lighting', spriteX: 5, spriteY: 0, width: 48, height: 48, tags: ['조명', '인더스트리얼', '빈티지'] },
    { id: 'light_lantern', category: 'lighting', subcategory: 'ceiling', name: '랜턴 조명', description: '등불 스타일', price: 100, rarity: 'common', spriteSheet: 'lighting', spriteX: 6, spriteY: 0, width: 32, height: 48, tags: ['조명', '랜턴', '클래식'] },
    { id: 'light_paper_sphere', category: 'lighting', subcategory: 'ceiling', name: '한지 조명', description: '한국 전통 한지등', price: 90, rarity: 'rare', spriteSheet: 'lighting', spriteX: 7, spriteY: 0, width: 48, height: 48, tags: ['조명', '한지', '전통'] },
    { id: 'light_track', category: 'lighting', subcategory: 'ceiling', name: '트랙 조명', description: '레일형 스팟', price: 150, rarity: 'rare', spriteSheet: 'lighting', spriteX: 0, spriteY: 1, width: 64, height: 24, tags: ['조명', '트랙', '스팟'] },
    { id: 'light_recessed', category: 'lighting', subcategory: 'ceiling', name: '매입등', description: '천장 매입형', price: 40, rarity: 'common', spriteSheet: 'lighting', spriteX: 1, spriteY: 1, width: 24, height: 16, tags: ['조명', '매입', '심플'] },

    // === 테이블 램프 (10종) ===
    { id: 'lamp_table_simple', category: 'lighting', subcategory: 'table', name: '심플 테이블 램프', description: '기본 스탠드', price: 50, rarity: 'common', spriteSheet: 'lighting', spriteX: 2, spriteY: 1, width: 24, height: 48, tags: ['조명', '테이블', '심플'] },
    { id: 'lamp_table_tiffany', category: 'lighting', subcategory: 'table', name: '티파니 램프', description: '스테인드글라스', price: 250, rarity: 'epic', spriteSheet: 'lighting', spriteX: 3, spriteY: 1, width: 32, height: 48, tags: ['조명', '티파니', '앤티크'] },
    { id: 'lamp_table_minimalist', category: 'lighting', subcategory: 'table', name: '미니멀리스트 램프', description: '심플 모던 스탠드', price: 80, rarity: 'common', spriteSheet: 'lighting', spriteX: 4, spriteY: 1, width: 24, height: 48, tags: ['조명', '미니멀', '모던'] },
    { id: 'lamp_table_ceramic', category: 'lighting', subcategory: 'table', name: '세라믹 램프', description: '도자기 베이스', price: 100, rarity: 'rare', spriteSheet: 'lighting', spriteX: 5, spriteY: 1, width: 32, height: 48, tags: ['조명', '세라믹', '인테리어'] },
    { id: 'lamp_table_crystal', category: 'lighting', subcategory: 'table', name: '크리스탈 테이블 램프', description: '반짝이는 크리스탈', price: 180, rarity: 'epic', spriteSheet: 'lighting', spriteX: 6, spriteY: 1, width: 32, height: 48, animation: 'sparkle', tags: ['조명', '크리스탈', '럭셔리'] },
    { id: 'lamp_desk_adjustable', category: 'lighting', subcategory: 'table', name: '각도조절 스탠드', description: '책상용 스탠드', price: 70, rarity: 'common', spriteSheet: 'lighting', spriteX: 7, spriteY: 1, width: 24, height: 48, tags: ['조명', '책상', '조절'] },
    { id: 'lamp_desk_led', category: 'lighting', subcategory: 'table', name: 'LED 데스크 램프', description: '현대적 LED', price: 100, rarity: 'common', spriteSheet: 'lighting', spriteX: 0, spriteY: 2, width: 24, height: 48, tags: ['조명', 'LED', '학습'] },
    { id: 'lamp_touch_sphere', category: 'lighting', subcategory: 'table', name: '터치 무드등', description: '터치로 밝기 조절', price: 60, rarity: 'common', spriteSheet: 'lighting', spriteX: 1, spriteY: 2, width: 24, height: 32, tags: ['조명', '터치', '무드등'] },
    { id: 'lamp_lava', category: 'lighting', subcategory: 'table', name: '라바 램프', description: '움직이는 라바', price: 80, rarity: 'rare', spriteSheet: 'lighting', spriteX: 2, spriteY: 2, width: 24, height: 48, animation: 'lava_flow', tags: ['조명', '라바', '레트로'] },
    { id: 'lamp_salt', category: 'lighting', subcategory: 'table', name: '소금 램프', description: '히말라야 소금', price: 70, rarity: 'common', spriteSheet: 'lighting', spriteX: 3, spriteY: 2, width: 24, height: 32, tags: ['조명', '소금', '힐링'] },

    // === 플로어 램프 (10종) ===
    { id: 'lamp_floor_arc', category: 'lighting', subcategory: 'floor', name: '아크 플로어 램프', description: '곡선 디자인', price: 200, rarity: 'rare', spriteSheet: 'lighting', spriteX: 4, spriteY: 2, width: 64, height: 96, tags: ['조명', '플로어', '아크'] },
    { id: 'lamp_floor_tripod', category: 'lighting', subcategory: 'floor', name: '삼각 스탠드', description: '3발 스탠드', price: 150, rarity: 'rare', spriteSheet: 'lighting', spriteX: 5, spriteY: 2, width: 48, height: 96, tags: ['조명', '삼각', '인테리어'] },
    { id: 'lamp_floor_torchiere', category: 'lighting', subcategory: 'floor', name: '토치 플로어 램프', description: '위를 비추는 조명', price: 120, rarity: 'common', spriteSheet: 'lighting', spriteX: 6, spriteY: 2, width: 32, height: 96, tags: ['조명', '토치', '간접'] },
    { id: 'lamp_floor_reading', category: 'lighting', subcategory: 'floor', name: '독서등 스탠드', description: '독서용 스탠드', price: 100, rarity: 'common', spriteSheet: 'lighting', spriteX: 7, spriteY: 2, width: 32, height: 96, tags: ['조명', '독서', '스탠드'] },
    { id: 'lamp_floor_tree', category: 'lighting', subcategory: 'floor', name: '트리 플로어 램프', description: '여러 조명 달린', price: 180, rarity: 'rare', spriteSheet: 'lighting', spriteX: 0, spriteY: 3, width: 48, height: 96, tags: ['조명', '트리', '다등'] },
    { id: 'lamp_floor_paper', category: 'lighting', subcategory: 'floor', name: '종이 플로어 램프', description: '간접 조명', price: 80, rarity: 'common', spriteSheet: 'lighting', spriteX: 1, spriteY: 3, width: 32, height: 96, tags: ['조명', '종이', '간접'] },
    { id: 'lamp_floor_rattan', category: 'lighting', subcategory: 'floor', name: '라탄 플로어 램프', description: '자연 소재', price: 130, rarity: 'rare', spriteSheet: 'lighting', spriteX: 2, spriteY: 3, width: 48, height: 80, tags: ['조명', '라탄', '내추럴'] },
    { id: 'lamp_floor_corner', category: 'lighting', subcategory: 'floor', name: '코너 조명', description: '코너 간접등', price: 90, rarity: 'common', spriteSheet: 'lighting', spriteX: 3, spriteY: 3, width: 24, height: 96, tags: ['조명', '코너', '간접'] },
    { id: 'lamp_floor_kids_star', category: 'lighting', subcategory: 'floor', name: '별 무드등', description: '아이방 무드등', price: 70, rarity: 'common', spriteSheet: 'lighting', spriteX: 4, spriteY: 3, width: 32, height: 64, tags: ['조명', '별', '아이방'] },
    { id: 'lamp_floor_kids_moon', category: 'lighting', subcategory: 'floor', name: '달 무드등', description: '달 모양 조명', price: 80, rarity: 'rare', spriteSheet: 'lighting', spriteX: 5, spriteY: 3, width: 32, height: 64, tags: ['조명', '달', '무드'] },

    // === LED/네온/특수 (10종) ===
    { id: 'light_strip_rgb', category: 'lighting', subcategory: 'special', name: 'RGB LED 스트립', description: '다양한 색상', price: 60, rarity: 'common', spriteSheet: 'lighting', spriteX: 6, spriteY: 3, width: 64, height: 8, animation: 'rgb_cycle', tags: ['조명', 'LED', 'RGB'] },
    { id: 'light_neon_love', category: 'lighting', subcategory: 'special', name: '네온 LOVE', description: 'LOVE 네온사인', price: 150, rarity: 'rare', spriteSheet: 'lighting', spriteX: 7, spriteY: 3, width: 48, height: 32, animation: 'glow_pulse', tags: ['조명', '네온', '사인'] },
    { id: 'light_neon_heart', category: 'lighting', subcategory: 'special', name: '네온 하트', description: '하트 네온사인', price: 100, rarity: 'rare', spriteSheet: 'lighting', spriteX: 0, spriteY: 4, width: 32, height: 32, animation: 'glow_pulse', tags: ['조명', '네온', '하트'] },
    { id: 'light_neon_star', category: 'lighting', subcategory: 'special', name: '네온 별', description: '별 네온사인', price: 100, rarity: 'rare', spriteSheet: 'lighting', spriteX: 1, spriteY: 4, width: 32, height: 32, animation: 'glow_pulse', tags: ['조명', '네온', '별'] },
    { id: 'light_fairy_string', category: 'lighting', subcategory: 'special', name: '페어리 스트링', description: '반짝이는 전구', price: 50, rarity: 'common', spriteSheet: 'lighting', spriteX: 2, spriteY: 4, width: 64, height: 32, animation: 'twinkle', tags: ['조명', '전구', '로맨틱'] },
    { id: 'light_globe_string', category: 'lighting', subcategory: 'special', name: '구슬 스트링', description: '구슬 전구 줄', price: 70, rarity: 'common', spriteSheet: 'lighting', spriteX: 3, spriteY: 4, width: 64, height: 32, tags: ['조명', '구슬', '장식'] },
    { id: 'light_projector_star', category: 'lighting', subcategory: 'special', name: '별 프로젝터', description: '천장에 별을', price: 100, rarity: 'rare', spriteSheet: 'lighting', spriteX: 4, spriteY: 4, width: 24, height: 32, tags: ['조명', '프로젝터', '별'] },
    { id: 'light_projector_galaxy', category: 'lighting', subcategory: 'special', name: '갤럭시 프로젝터', description: '은하수 조명', price: 150, rarity: 'epic', spriteSheet: 'lighting', spriteX: 5, spriteY: 4, width: 24, height: 32, tags: ['조명', '프로젝터', '은하'] },
    { id: 'candle_electric', category: 'lighting', subcategory: 'special', name: '전기 양초', description: '안전한 전기 양초', price: 30, rarity: 'common', spriteSheet: 'lighting', spriteX: 6, spriteY: 4, width: 16, height: 24, animation: 'flicker', tags: ['조명', '양초', '안전'] },
    { id: 'candle_set', category: 'lighting', subcategory: 'special', name: '양초 세트', description: '3개 양초 세트', price: 50, rarity: 'common', spriteSheet: 'lighting', spriteX: 7, spriteY: 4, width: 48, height: 32, animation: 'flicker', tags: ['조명', '양초', '세트'] },

    // === 벽 등 (10종) ===
    { id: 'light_wall_sconce', category: 'lighting', subcategory: 'wall', name: '벽 스콘스', description: '벽 부착 조명', price: 70, rarity: 'common', spriteSheet: 'lighting', spriteX: 0, spriteY: 5, width: 24, height: 32, tags: ['조명', '벽', '스콘스'] },
    { id: 'light_wall_modern', category: 'lighting', subcategory: 'wall', name: '모던 벽등', description: '현대적 벽 조명', price: 90, rarity: 'common', spriteSheet: 'lighting', spriteX: 1, spriteY: 5, width: 24, height: 24, tags: ['조명', '벽', '모던'] },
    { id: 'light_wall_industrial', category: 'lighting', subcategory: 'wall', name: '인더스트리얼 벽등', description: '철제 벽 조명', price: 100, rarity: 'rare', spriteSheet: 'lighting', spriteX: 2, spriteY: 5, width: 32, height: 32, tags: ['조명', '벽', '인더스트리얼'] },
    { id: 'light_wall_swing_arm', category: 'lighting', subcategory: 'wall', name: '스윙암 벽등', description: '조절 가능 벽등', price: 120, rarity: 'rare', spriteSheet: 'lighting', spriteX: 3, spriteY: 5, width: 48, height: 32, tags: ['조명', '벽', '조절'] },
    { id: 'light_wall_picture', category: 'lighting', subcategory: 'wall', name: '그림 조명', description: '액자 위 조명', price: 80, rarity: 'common', spriteSheet: 'lighting', spriteX: 4, spriteY: 5, width: 48, height: 16, tags: ['조명', '그림', '액자'] },
    { id: 'light_wall_vintage', category: 'lighting', subcategory: 'wall', name: '빈티지 벽등', description: '앤티크 벽 조명', price: 130, rarity: 'rare', spriteSheet: 'lighting', spriteX: 5, spriteY: 5, width: 32, height: 40, tags: ['조명', '벽', '빈티지'] },
    { id: 'light_wall_lantern', category: 'lighting', subcategory: 'wall', name: '랜턴 벽등', description: '랜턴 스타일', price: 110, rarity: 'rare', spriteSheet: 'lighting', spriteX: 6, spriteY: 5, width: 24, height: 48, tags: ['조명', '벽', '랜턴'] },
    { id: 'light_wall_crystal', category: 'lighting', subcategory: 'wall', name: '크리스탈 벽등', description: '고급 크리스탈', price: 200, rarity: 'epic', spriteSheet: 'lighting', spriteX: 7, spriteY: 5, width: 32, height: 48, animation: 'sparkle', tags: ['조명', '벽', '크리스탈'] },
    { id: 'light_mirror', category: 'lighting', subcategory: 'wall', name: '거울 조명', description: '화장대 거울등', price: 100, rarity: 'common', spriteSheet: 'lighting', spriteX: 0, spriteY: 6, width: 48, height: 48, tags: ['조명', '거울', '화장대'] },
    { id: 'light_vanity', category: 'lighting', subcategory: 'wall', name: '배니티 조명', description: '할리우드 스타일', price: 150, rarity: 'rare', spriteSheet: 'lighting', spriteX: 1, spriteY: 6, width: 64, height: 16, tags: ['조명', '배니티', '할리우드'] }
];
