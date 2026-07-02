/**
 * 벽지 카테고리 통합 인덱스
 * 총 50종 벽지 아이템
 */

import { PASTEL_WALLPAPERS } from './pastel';
import { NATURE_WALLPAPERS } from './nature';
import { MODERN_WALLPAPERS } from './modern';
import { VINTAGE_WALLPAPERS } from './vintage';

export const ALL_WALLPAPERS = [
    ...PASTEL_WALLPAPERS,
    ...NATURE_WALLPAPERS,
    ...MODERN_WALLPAPERS,
    ...VINTAGE_WALLPAPERS
];

export {
    PASTEL_WALLPAPERS,
    NATURE_WALLPAPERS,
    MODERN_WALLPAPERS,
    VINTAGE_WALLPAPERS
};
