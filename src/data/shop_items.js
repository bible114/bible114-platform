/**
 * 🍀 싸이월드 미니홈피 스타일 소품 시스템
 * 
 * 이 파일은 하위 호환성을 위해 유지됩니다.
 * 새로운 아이템 시스템은 ./items/index.js를 참조하세요.
 */

// 새로운 통합 아이템 시스템 사용
export {
    SHOP_CATEGORIES,
    SHOP_ITEMS,
    getItemsByCategory,
    getItemsByRarity,
    searchItemsByTag,
    getSeasonalItems,
    getItemStats,
    ALL_WALLPAPERS,
    ALL_FLOORS,
    ALL_CHRISTIAN_ITEMS
} from './items';

// 레거시 export (하위 호환성)
export { WALLPAPER_FLOOR_ITEMS } from './items/wallpaper_floor';
export { FURNITURE_ITEMS } from './items/furniture';
export { ELECTRONIC_ITEMS } from './items/electronic';
export { KITCHEN_ITEMS } from './items/kitchen';
export { AMUSEMENT_ITEMS } from './items/amusement';
export { HOBBY_INSTRUMENT_ITEMS } from './items/hobby_instruments';
export { CHARACTER_ITEMS } from './items/character_items';
export { LIVING_HOBBY_MISC_ITEMS } from './items/living_hobby_misc';

