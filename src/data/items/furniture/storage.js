/**
 * 수납 가구 컬렉션
 * 25종
 */

export const STORAGE_ITEMS = [
    // === 옷장/서랍장 (10종) ===
    { id: 'wardrobe_white_2door', category: 'furniture', subcategory: 'storage', name: '화이트 2도어 옷장', description: '기본 2문 옷장', price: 200, rarity: 'common', spriteSheet: 'furniture_storage', spriteX: 0, spriteY: 0, width: 64, height: 96, tags: ['수납', '옷장', '화이트'] },
    { id: 'wardrobe_wood_3door', category: 'furniture', subcategory: 'storage', name: '원목 3도어 옷장', description: '넉넉한 3문 옷장', price: 350, rarity: 'rare', spriteSheet: 'furniture_storage', spriteX: 1, spriteY: 0, width: 80, height: 96, tags: ['수납', '옷장', '원목'] },
    { id: 'wardrobe_sliding', category: 'furniture', subcategory: 'storage', name: '슬라이딩 옷장', description: '미닫이 옷장', price: 400, rarity: 'epic', spriteSheet: 'furniture_storage', spriteX: 2, spriteY: 0, width: 96, height: 96, tags: ['수납', '옷장', '슬라이딩'] },
    { id: 'wardrobe_open', category: 'furniture', subcategory: 'storage', name: '오픈형 옷장', description: '문 없는 오픈 옷장', price: 180, rarity: 'common', spriteSheet: 'furniture_storage', spriteX: 3, spriteY: 0, width: 64, height: 96, tags: ['수납', '옷장', '오픈'] },
    { id: 'dresser_3drawer', category: 'furniture', subcategory: 'storage', name: '3단 서랍장', description: '기본 3단 서랍장', price: 120, rarity: 'common', spriteSheet: 'furniture_storage', spriteX: 4, spriteY: 0, width: 48, height: 48, tags: ['수납', '서랍장', '3단'] },
    { id: 'dresser_6drawer', category: 'furniture', subcategory: 'storage', name: '6단 서랍장', description: '넉넉한 6단 옷서랍', price: 200, rarity: 'rare', spriteSheet: 'furniture_storage', spriteX: 5, spriteY: 0, width: 64, height: 64, tags: ['수납', '서랍장', '6단'] },
    { id: 'dresser_tall', category: 'furniture', subcategory: 'storage', name: '하이 체스트', description: '높은 서랍장', price: 250, rarity: 'rare', spriteSheet: 'furniture_storage', spriteX: 6, spriteY: 0, width: 48, height: 80, tags: ['수납', '서랍장', '하이'] },
    { id: 'dresser_pink_kids', category: 'furniture', subcategory: 'storage', name: '핑크 아동 서랍장', description: '아이용 핑크 서랍장', price: 150, rarity: 'common', spriteSheet: 'furniture_storage', spriteX: 7, spriteY: 0, width: 48, height: 48, tags: ['수납', '아동', '핑크'] },
    { id: 'armoire_antique', category: 'furniture', subcategory: 'storage', name: '앤티크 아모어', description: '고풍스러운 장', price: 400, rarity: 'epic', spriteSheet: 'furniture_storage', spriteX: 0, spriteY: 1, width: 64, height: 96, tags: ['수납', '앤티크', '고급'] },
    { id: 'closet_system', category: 'furniture', subcategory: 'storage', name: '시스템 옷장', description: '맞춤형 시스템', price: 500, rarity: 'legendary', spriteSheet: 'furniture_storage', spriteX: 1, spriteY: 1, width: 96, height: 96, tags: ['수납', '시스템', '맞춤'] },

    // === 책장/선반 (10종) ===
    { id: 'bookshelf_small', category: 'furniture', subcategory: 'storage', name: '소형 책장', description: '작은 3단 책장', price: 80, rarity: 'common', spriteSheet: 'furniture_storage', spriteX: 2, spriteY: 1, width: 48, height: 64, tags: ['수납', '책장', '소형'] },
    { id: 'bookshelf_large', category: 'furniture', subcategory: 'storage', name: '대형 책장', description: '넉넉한 5단 책장', price: 180, rarity: 'common', spriteSheet: 'furniture_storage', spriteX: 3, spriteY: 1, width: 64, height: 96, tags: ['수납', '책장', '대형'] },
    { id: 'bookshelf_wall', category: 'furniture', subcategory: 'storage', name: '월 책장', description: '벽면 가득 책장', price: 350, rarity: 'epic', spriteSheet: 'furniture_storage', spriteX: 4, spriteY: 1, width: 96, height: 96, tags: ['수납', '책장', '월'] },
    { id: 'bookshelf_ladder', category: 'furniture', subcategory: 'storage', name: '래더 선반', description: '사다리형 선반', price: 120, rarity: 'rare', spriteSheet: 'furniture_storage', spriteX: 5, spriteY: 1, width: 48, height: 80, tags: ['수납', '선반', '래더'] },
    { id: 'bookshelf_cube', category: 'furniture', subcategory: 'storage', name: '큐브 선반', description: '모듈형 큐브 선반', price: 150, rarity: 'rare', spriteSheet: 'furniture_storage', spriteX: 6, spriteY: 1, width: 64, height: 64, tags: ['수납', '선반', '큐브'] },
    { id: 'shelf_floating', category: 'furniture', subcategory: 'storage', name: '플로팅 선반', description: '벽 부착 선반', price: 40, rarity: 'common', spriteSheet: 'furniture_storage', spriteX: 7, spriteY: 1, width: 48, height: 16, tags: ['수납', '선반', '벽면'] },
    { id: 'shelf_corner', category: 'furniture', subcategory: 'storage', name: '코너 선반', description: '모서리 활용 선반', price: 60, rarity: 'common', spriteSheet: 'furniture_storage', spriteX: 0, spriteY: 2, width: 32, height: 64, tags: ['수납', '선반', '코너'] },
    { id: 'rack_magazine', category: 'furniture', subcategory: 'storage', name: '잡지 꽂이', description: '잡지 수납대', price: 50, rarity: 'common', spriteSheet: 'furniture_storage', spriteX: 1, spriteY: 2, width: 32, height: 48, tags: ['수납', '잡지', '꽂이'] },
    { id: 'bookend_pair', category: 'furniture', subcategory: 'storage', name: '북엔드', description: '책 정리용 북엔드', price: 25, rarity: 'common', spriteSheet: 'furniture_storage', spriteX: 2, spriteY: 2, width: 24, height: 24, tags: ['수납', '북엔드', '소품'] },
    { id: 'display_cabinet', category: 'furniture', subcategory: 'storage', name: '디스플레이 캐비닛', description: '유리문 진열장', price: 280, rarity: 'epic', spriteSheet: 'furniture_storage', spriteX: 3, spriteY: 2, width: 64, height: 80, tags: ['수납', '진열장', '유리'] },

    // === 기타 수납 (5종) ===
    { id: 'basket_woven', category: 'furniture', subcategory: 'storage', name: '라탄 바구니', description: '수납용 바구니', price: 30, rarity: 'common', spriteSheet: 'furniture_storage', spriteX: 4, spriteY: 2, width: 32, height: 32, tags: ['수납', '바구니', '라탄'] },
    { id: 'box_storage', category: 'furniture', subcategory: 'storage', name: '수납 박스', description: '정리용 박스', price: 20, rarity: 'common', spriteSheet: 'furniture_storage', spriteX: 5, spriteY: 2, width: 32, height: 24, tags: ['수납', '박스', '정리'] },
    { id: 'trunk_vintage', category: 'furniture', subcategory: 'storage', name: '빈티지 트렁크', description: '앤티크 여행 트렁크', price: 150, rarity: 'rare', spriteSheet: 'furniture_storage', spriteX: 6, spriteY: 2, width: 48, height: 32, tags: ['수납', '트렁크', '빈티지'] },
    { id: 'shoe_rack', category: 'furniture', subcategory: 'storage', name: '신발장', description: '신발 정리대', price: 80, rarity: 'common', spriteSheet: 'furniture_storage', spriteX: 7, spriteY: 2, width: 48, height: 64, tags: ['수납', '신발', '정리'] },
    { id: 'coat_rack', category: 'furniture', subcategory: 'storage', name: '코트 걸이', description: '현관 코트 걸이', price: 60, rarity: 'common', spriteSheet: 'furniture_storage', spriteX: 0, spriteY: 3, width: 32, height: 80, tags: ['수납', '코트', '걸이'] }
];
