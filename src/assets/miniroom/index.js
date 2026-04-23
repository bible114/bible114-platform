import wallpapers_set from './wallpapers_set.png';
import floors_set from './floors_set.png';
import furniture_beds from './furniture_beds.png';
import furniture_desks from './furniture_desks.png';
import furniture_chairs from './furniture_chairs.png';

export const Assets = {
    wallpapers_set,
    // 벽지 카테고리별 매핑
    wallpapers_modern: wallpapers_set,
    wallpapers_nature: wallpapers_set,
    wallpapers_vintage: wallpapers_set,
    wallpapers_pastel: wallpapers_set,

    floors_set,
    // 바닥재 카테고리별 매핑
    floors_wood: floors_set,
    floors_tile: floors_set,
    floors_carpet: floors_set,
    floors_special: floors_set,

    furniture_beds,
    furniture_chairs,
    furniture_desks,
    // 추가 가구 카테고리 매핑 (현재 보유한 시트로 대응)
    furniture_sofas: furniture_chairs,
    furniture_tables: furniture_desks,
    furniture_storage: furniture_desks,
    furniture_misc: furniture_desks,

    // 기타 카테고리 (임시 대응)
    lighting_items: furniture_desks,
    plants_items: furniture_desks,
    christian_items: furniture_desks
};
