/**
 * 가구 카테고리 통합 인덱스
 * 총 150종 가구 아이템
 */

import { BED_ITEMS } from './beds';
import { SOFA_ITEMS } from './sofas';
import { TABLE_ITEMS } from './tables';
import { CHAIR_ITEMS } from './chairs';
import { STORAGE_ITEMS } from './storage';
import { MISC_FURNITURE } from './misc';

export const ALL_FURNITURE = [
    ...BED_ITEMS,
    ...SOFA_ITEMS,
    ...TABLE_ITEMS,
    ...CHAIR_ITEMS,
    ...STORAGE_ITEMS,
    ...MISC_FURNITURE
];

export {
    BED_ITEMS,
    SOFA_ITEMS,
    TABLE_ITEMS,
    CHAIR_ITEMS,
    STORAGE_ITEMS,
    MISC_FURNITURE
};
