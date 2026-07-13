/**
 * 🍀 싸이월드 미니홈피 스타일 소품 통합 인덱스
 * 
 * 현재 구현된 소품 개수:
 * - 벽지: 50종 (파스텔 20 + 자연 15 + 모던 10 + 빈티지 5)
 * - 바닥: 50종 (우드 15 + 타일 15 + 카펫 10 + 특수 10)
 * - 가구: 150종 (침대 30 + 소파 25 + 테이블 35 + 의자 25 + 수납 25 + 기타 10)
 * - 조명: 50종 (천장 10 + 테이블 10 + 플로어 10 + LED/특수 10 + 벽등 10)
 * - 식물: 40종 (소형 10 + 중형 10 + 대형 10 + 특수 10)
 * - 기독교 테마: 80종 (상징물 20 + 성화 20 + 예배용품 20 + 장식 20)
 * - 기존 아이템: ~80종
 * 
 * 총계: ~500종 (1,000종 목표 중 50% 완료)
 */

// === 벽지 카테고리 ===
import { ALL_WALLPAPERS } from './wallpaper';

// === 바닥 카테고리 ===
import { ALL_FLOORS } from './floor';

// === 가구 카테고리 (새로 추가된 150종) ===
import { ALL_FURNITURE } from './furniture/index.js';

// === 조명 카테고리 ===
import { LIGHTING_ITEMS } from './lighting/index.js';

// === 식물/생활 카테고리 ===
import { PLANT_ITEMS } from './living/plants';

// === 테마 카테고리 ===
import { ALL_CHRISTIAN_ITEMS } from './themes/christian';

// === 기존 아이템들 (레거시) ===
import { WALLPAPER_FLOOR_ITEMS } from './wallpaper_floor';
import { FURNITURE_ITEMS as LEGACY_FURNITURE_ITEMS } from './furniture.js';
import { ELECTRONIC_ITEMS } from './electronic';
import { KITCHEN_ITEMS } from './kitchen';
import { AMUSEMENT_ITEMS } from './amusement';
import { HOBBY_INSTRUMENT_ITEMS } from './hobby_instruments';
import { CHARACTER_ITEMS } from './character_items';
import { LIVING_HOBBY_MISC_ITEMS } from './living_hobby_misc';

// === 카테고리 정의 (확장) ===
export const SHOP_CATEGORIES = [
    // 미니룸 기본
    { id: 'wallpaper', name: '벽지', icon: '🎨', count: ALL_WALLPAPERS.length },
    { id: 'floor', name: '바닥', icon: '🧱', count: ALL_FLOORS.length },
    { id: 'furniture', name: '가구', icon: '🛋️', count: ALL_FURNITURE.length },
    { id: 'lighting', name: '조명', icon: '💡', count: LIGHTING_ITEMS.length },
    { id: 'electronic', name: '가전', icon: '📺', count: ELECTRONIC_ITEMS.length },
    { id: 'kitchen', name: '주방', icon: '🍳', count: KITCHEN_ITEMS.length },
    { id: 'living', name: '식물/생활', icon: '🪴', count: PLANT_ITEMS.length + LIVING_HOBBY_MISC_ITEMS.length },
    { id: 'hobby', name: '취미/악기', icon: '🎸', count: HOBBY_INSTRUMENT_ITEMS.length },
    { id: 'amusement', name: '놀이동산', icon: '🎡', count: AMUSEMENT_ITEMS.length },

    // 캐릭터 꾸미기
    { id: 'character', name: '캐릭터', icon: '👤', count: CHARACTER_ITEMS.filter(i => i.category === 'character').length },
    { id: 'hair', name: '머리/모자', icon: '💇', count: CHARACTER_ITEMS.filter(i => i.category === 'hair').length },
    { id: 'eye', name: '눈 모양', icon: '👀', count: CHARACTER_ITEMS.filter(i => i.category === 'eye').length },
    { id: 'expression', name: '표정', icon: '😊', count: CHARACTER_ITEMS.filter(i => i.category === 'expression').length },
    { id: 'hand', name: '손 아이템', icon: '🤲', count: CHARACTER_ITEMS.filter(i => i.category === 'hand').length },
    { id: 'accessory', name: '악세서리', icon: '👓', count: CHARACTER_ITEMS.filter(i => i.category === 'accessory').length },
    { id: 'outfit', name: '의상', icon: '👕', count: CHARACTER_ITEMS.filter(i => i.category === 'outfit').length },

    // 테마
    { id: 'christian', name: '기독교', icon: '✝️', count: ALL_CHRISTIAN_ITEMS.length }
];

// === 모든 아이템 통합 ===
export const SHOP_ITEMS = [
    // 새로운 확장 아이템들
    ...ALL_WALLPAPERS,
    ...ALL_FLOORS,
    ...ALL_FURNITURE,
    ...LIGHTING_ITEMS,
    ...PLANT_ITEMS,
    ...ALL_CHRISTIAN_ITEMS,

    // 기존 아이템들 (레거시)
    ...WALLPAPER_FLOOR_ITEMS,
    ...ELECTRONIC_ITEMS,
    ...KITCHEN_ITEMS,
    ...AMUSEMENT_ITEMS,
    ...HOBBY_INSTRUMENT_ITEMS,
    ...CHARACTER_ITEMS,
    ...LIVING_HOBBY_MISC_ITEMS
];

// === 카테고리별 아이템 가져오기 ===
export const getItemsByCategory = (category) => {
    return SHOP_ITEMS.filter(item => item.category === category);
};

// === 희귀도별 아이템 가져오기 ===
export const getItemsByRarity = (rarity) => {
    return SHOP_ITEMS.filter(item => item.rarity === rarity);
};

// === 태그로 아이템 검색 ===
export const searchItemsByTag = (tag) => {
    return SHOP_ITEMS.filter(item =>
        item.tags && item.tags.some(t => t.includes(tag))
    );
};

// === 계절별 아이템 가져오기 ===
export const getSeasonalItems = (season) => {
    return SHOP_ITEMS.filter(item => item.season === season);
};

// === 통계 ===
export const getItemStats = () => {
    const stats = {
        total: SHOP_ITEMS.length,
        byCategory: {},
        byRarity: {
            common: 0,
            rare: 0,
            epic: 0,
            legendary: 0
        }
    };

    SHOP_ITEMS.forEach(item => {
        // 카테고리별 집계
        stats.byCategory[item.category] = (stats.byCategory[item.category] || 0) + 1;

        // 희귀도별 집계
        if (item.rarity) {
            stats.byRarity[item.rarity]++;
        }
    });

    return stats;
};

// === Export all ===
export {
    ALL_WALLPAPERS,
    ALL_FLOORS,
    ALL_FURNITURE,
    LIGHTING_ITEMS,
    PLANT_ITEMS,
    ALL_CHRISTIAN_ITEMS,
    WALLPAPER_FLOOR_ITEMS,
    ELECTRONIC_ITEMS,
    KITCHEN_ITEMS,
    AMUSEMENT_ITEMS,
    HOBBY_INSTRUMENT_ITEMS,
    CHARACTER_ITEMS,
    LIVING_HOBBY_MISC_ITEMS
};
