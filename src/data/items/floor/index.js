/**
 * 바닥재 카테고리 통합 인덱스
 * 총 50종 바닥재 아이템
 */

import { WOOD_FLOORS } from './wood';
import { TILE_FLOORS } from './tile';
import { CARPET_FLOORS } from './carpet';
import { SPECIAL_FLOORS } from './special';

export const ALL_FLOORS = [
    ...WOOD_FLOORS,
    ...TILE_FLOORS,
    ...CARPET_FLOORS,
    ...SPECIAL_FLOORS
];

export {
    WOOD_FLOORS,
    TILE_FLOORS,
    CARPET_FLOORS,
    SPECIAL_FLOORS
};
