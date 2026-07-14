import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
    LEGACY_TALENT_MARKET_ID,
    canEarnTalent,
    getActiveTalentDepartments,
    getTalentMarketItems,
    getTalentMembershipDepartmentIds,
    isTalentProgramV2,
    normalizeTalentProgram,
    resolveTalentProgram,
} from '../src/utils/talentProgram.js';
import {
    mergeAdminTalentPurchases,
    resolvePurchaseRefundWalletKind,
} from '../src/utils/talentPurchases.js';

const user = {
    departmentId: 'senior',
    subgroupId: 'senior-1',
    extraMemberships: [
        { departmentId: 'elementary', subgroupId: 'elementary-1' },
        { departmentId: 'elementary', subgroupId: 'elementary-2' },
        { departmentId: 'youth', subgroupId: 'youth-1' },
    ],
};

const v2 = {
    schemaVersion: 2,
    enabled: true,
    departmentSettings: {
        senior: { enabled: false, marketId: null },
        elementary: { enabled: true, marketId: 'children' },
        youth: { enabled: true, marketId: 'children' },
    },
    markets: {
        children: {
            id: 'children', name: '교육부 통합 시장', enabled: true,
            items: [
                { id: 'snack', name: '간식', price: 20, active: true },
                { id: 'old', name: '지난 상품', price: 10, active: false },
            ],
        },
    },
};

assert.equal(isTalentProgramV2(v2), true);
assert.deepEqual(getTalentMembershipDepartmentIds(user), ['senior', 'elementary', 'youth']);
assert.deepEqual(getActiveTalentDepartments(user, v2), [
    { departmentId: 'elementary', marketId: 'children', marketEnabled: true },
    { departmentId: 'youth', marketId: 'children', marketEnabled: true },
]);

const defaultResolution = resolveTalentProgram({ user, talentShop: v2 });
assert.equal(defaultResolution.selectedDepartmentId, 'elementary');
assert.equal(defaultResolution.selectedMarketId, 'children');
assert.equal(defaultResolution.canEarnTalent, true);
assert.equal(defaultResolution.canUseMarket, true);
assert.equal(defaultResolution.shopEnabled, true);
assert.deepEqual(defaultResolution.items.map(item => item.id), ['snack']);
assert.equal(resolveTalentProgram({ user, talentShop: v2, departmentId: 'youth' }).selectedDepartmentId, 'youth');
assert.equal(resolveTalentProgram({ user: { ...user, talentDepartmentId: 'youth' }, talentShop: v2 }).selectedDepartmentId, 'youth');
assert.equal(resolveTalentProgram({ user, talentShop: v2, departmentId: 'senior' }).selectedDepartmentId, 'elementary');
assert.equal(canEarnTalent({ user, talentShop: v2 }), true);

const separateMarkets = {
    schemaVersion: 2,
    enabled: true,
    departmentSettings: {
        elementary: { enabled: true, marketId: 'elementary' },
        youth: { enabled: true, marketId: 'youth' },
    },
    markets: {
        elementary: { id: 'elementary', name: '아동부', enabled: true, items: [{ id: 'e', active: true }] },
        youth: { id: 'youth', name: '청소년부', enabled: true, items: [{ id: 'y', active: true }] },
    },
};
assert.deepEqual(resolveTalentProgram({ user, talentShop: separateMarkets, departmentId: 'elementary' }).items.map(item => item.id), ['e']);
assert.deepEqual(resolveTalentProgram({ user, talentShop: separateMarkets, departmentId: 'youth' }).items.map(item => item.id), ['y']);

const closedMarket = {
    ...separateMarkets,
    markets: { ...separateMarkets.markets, elementary: { ...separateMarkets.markets.elementary, enabled: false } },
};
const closedResolution = resolveTalentProgram({ user, talentShop: closedMarket, departmentId: 'elementary' });
assert.equal(closedResolution.canEarnTalent, true);
assert.equal(closedResolution.canUseMarket, false);
assert.equal(closedResolution.reason, 'MARKET_DISABLED');
assert.deepEqual(closedResolution.items, []);

const closedV2Shop = {
    ...v2,
    enabled: false,
};
const closedV2ShopResolution = resolveTalentProgram({ user, talentShop: closedV2Shop });
assert.equal(closedV2ShopResolution.canEarnTalent, true, 'top-level shop toggle must not disable v2 rewards');
assert.equal(closedV2ShopResolution.canUseMarket, false);
assert.equal(closedV2ShopResolution.shopEnabled, false);
assert.equal(closedV2ShopResolution.reason, 'MARKET_DISABLED');
assert.deepEqual(closedV2ShopResolution.items, []);
assert.equal(getActiveTalentDepartments(user, closedV2Shop)[0].marketEnabled, false);

const legacy = {
    enabled: true,
    items: [{ id: 'legacy-active', active: true }, { id: 'legacy-hidden', active: false }],
};
const normalizedLegacy = normalizeTalentProgram(legacy);
assert.equal(normalizedLegacy.legacy, true);
assert.equal(normalizedLegacy.markets[LEGACY_TALENT_MARKET_ID].enabled, true);
assert.equal(resolveTalentProgram({ user, talentShop: legacy }).selectedMarketId, LEGACY_TALENT_MARKET_ID);
assert.deepEqual(getTalentMarketItems(legacy, LEGACY_TALENT_MARKET_ID).map(item => item.id), ['legacy-active']);
assert.deepEqual(getTalentMarketItems(legacy, LEGACY_TALENT_MARKET_ID, { includeInactive: true }).map(item => item.id), ['legacy-active', 'legacy-hidden']);
const closedLegacy = resolveTalentProgram({ user, talentShop: { enabled: false, items: [] } });
assert.equal(closedLegacy.canEarnTalent, true, 'legacy shop closed must not disable legacy rewards');
assert.equal(closedLegacy.canUseMarket, false);
assert.equal(closedLegacy.reason, 'MARKET_DISABLED');

const missingLegacyShop = resolveTalentProgram({ user: {}, talentShop: null });
assert.equal(missingLegacyShop.canEarnTalent, true, 'legacy member without department/shop keeps earning');
assert.equal(missingLegacyShop.canUseMarket, false);
assert.equal(missingLegacyShop.selectedDepartmentId, null);
assert.equal(missingLegacyShop.selectedMarketId, LEGACY_TALENT_MARKET_ID);
assert.deepEqual(missingLegacyShop.activeDepartments, [{
    departmentId: null,
    marketId: LEGACY_TALENT_MARKET_ID,
    marketEnabled: false,
}]);
assert.equal(canEarnTalent({ user: {}, talentShop: undefined }), true);

const nestedLegacy = { schemaVersion: 2, legacy: { enabled: true, items: [{ id: 'nested' }] } };
assert.equal(resolveTalentProgram({ user, talentShop: nestedLegacy }).selectedMarketId, LEGACY_TALENT_MARKET_ID);

const noMembership = resolveTalentProgram({ user: {}, talentShop: v2 });
assert.equal(noMembership.canEarnTalent, false);
assert.equal(noMembership.reason, 'NO_MEMBERSHIP');
const inactiveOnly = resolveTalentProgram({ user: { departmentId: 'senior' }, talentShop: v2 });
assert.equal(inactiveOnly.canEarnTalent, false);
assert.equal(inactiveOnly.reason, 'NO_ACTIVE_DEPARTMENT');

const missingMarket = {
    schemaVersion: 2,
    departmentSettings: { elementary: { enabled: true, marketId: 'missing' } },
    markets: {},
};
assert.equal(resolveTalentProgram({ user: { departmentId: 'elementary' }, talentShop: missingMarket }).canEarnTalent, false);

const purchaseDoc = (id, data) => ({ id, data: () => data });
const mergedPurchases = mergeAdminTalentPurchases({
    pendingDocs: [purchaseDoc('old-pending', { uid: 'departed', status: 'pending', createdAt: 1 })],
    recentDocs: [
        purchaseDoc('recent-delivered', { uid: 'active', status: 'delivered', createdAt: 3 }),
        purchaseDoc('old-pending', { uid: 'departed', status: 'pending', createdAt: 1 }),
    ],
    externalMemberIds: new Set(['active']),
});
assert.deepEqual(mergedPurchases.map(purchase => purchase.id), ['recent-delivered', 'old-pending']);
assert.equal(mergedPurchases.find(purchase => purchase.id === 'old-pending').uid, 'departed',
    '현재 명부에 없는 구매자의 pending도 유지해야 한다.');
assert.equal(resolvePurchaseRefundWalletKind({ schemaVersion: 2, walletKind: 'roster' }, 'user'), 'roster');
assert.equal(resolvePurchaseRefundWalletKind({ schemaVersion: 2 }, 'user'), null,
    '손상된 v2 기록은 명시 선택으로도 추론하지 않는다.');
assert.equal(resolvePurchaseRefundWalletKind({}, null), null);
assert.equal(resolvePurchaseRefundWalletKind({}, 'user'), 'user');
assert.equal(resolvePurchaseRefundWalletKind({}, 'roster'), 'roster');

const normalized = normalizeTalentProgram(v2);
normalized.markets.children.items[0].name = 'changed';
assert.equal(v2.markets.children.items[0].name, '간식', 'normalization must not mutate source fixtures');

const read = path => fs.readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const readActions = read('src/hooks/useUserBibleActions.js');
const quizCard = read('src/components/dashboard/BibleQuizCard.jsx');
const memberShop = read('src/components/dashboard/TalentShop.jsx');
const adminView = read('src/components/ChurchAdminView.jsx');
const rules = read('firestore.rules');

assert.match(readActions, /loadTalentProgramsStrict/);
assert.match(readActions, /rewardedRosterOrgIds[\s\S]*rosterWallets\.forEach[\s\S]*transaction\.update\(wallet\.ref, rosterProgress\)/,
    '달란트 미사용 부서도 명부 읽기 진도는 갱신해야 한다.');
assert.match(readActions, /isFirstReadToday: resultData\.isFirstReadToday/,
    '달란트 적립 여부와 첫 읽기 여부를 분리해야 한다.');
assert.match(quizCard, /resolveTalentProgram[\s\S]*rewardedRosterWallets/);
assert.match(memberShop, /schemaVersion: 2[\s\S]*departmentId:[\s\S]*marketId:[\s\S]*walletKind/);
assert.match(adminView, /setDepartmentTalentEnabled/);
assert.match(adminView, /setDepartmentTalentMarketMode/);
assert.match(adminView, /where\('status', '==', 'pending'\)[\s\S]*orderBy\('createdAt', 'desc'\)\.limit\(200\)/,
    '미처리 구매는 전체를 불러오고 완료 이력만 최근 범위로 제한해야 한다.');
assert.doesNotMatch(adminView, /\.filter\(p => memberIds\.has\(p\.uid\)\)/,
    '탈퇴·제명 회원의 미처리 구매를 관리자 목록에서 숨기면 안 된다.');
assert.match(adminView, /purchase\.status === 'pending' \|\| !talentMarketId/,
    '미처리 구매는 삭제·변경된 시장 기록이어도 관리자가 볼 수 있어야 한다.');
assert.match(adminView, /refundLegacyPurchase[\s\S]*legacyWalletKind[\s\S]*PURCHASE_WALLET_UNRESOLVED/,
    '레거시 구매는 현재 소속으로 지갑을 추론하지 말고 명시 선택을 강제해야 한다.');
assert.match(rules, /request\.resource\.data\.schemaVersion == 2/);
assert.match(rules, /request\.resource\.data\.walletKind in \['user', 'roster'\]/);

console.log('department talent validation passed');
