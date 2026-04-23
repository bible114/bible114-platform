/**
 * 기독교 테마 소품 카테고리 통합 인덱스
 * 총 80종 기독교 관련 소품
 */

import { CHRISTIAN_SYMBOLS } from './symbols';
import { CHRISTIAN_ART } from './art';
import { CHRISTIAN_WORSHIP } from './worship';
import { CHRISTIAN_DECOR } from './decor';

export const ALL_CHRISTIAN_ITEMS = [
    ...CHRISTIAN_SYMBOLS,
    ...CHRISTIAN_ART,
    ...CHRISTIAN_WORSHIP,
    ...CHRISTIAN_DECOR
];

export {
    CHRISTIAN_SYMBOLS,
    CHRISTIAN_ART,
    CHRISTIAN_WORSHIP,
    CHRISTIAN_DECOR
};
