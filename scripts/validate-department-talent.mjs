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
    hasValidV2RefundWalletSnapshot,
    isValidTalentPurchasePrice,
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
assert.equal(hasValidV2RefundWalletSnapshot({ schemaVersion: 2, walletKind: 'roster' }, 'church-1'), false);
assert.equal(hasValidV2RefundWalletSnapshot({ schemaVersion: 2, walletKind: 'roster', walletOrgId: 'church-2' }, 'church-1'), false);
assert.equal(hasValidV2RefundWalletSnapshot({ schemaVersion: 2, walletKind: 'roster', walletOrgId: 'church-1' }, 'church-1'), true);
assert.equal(hasValidV2RefundWalletSnapshot({ schemaVersion: 2, walletKind: 'user', walletOrgId: 'church-1' }, 'church-1'), true);
assert.equal(isValidTalentPurchasePrice(1), true);
assert.equal(isValidTalentPurchasePrice(0), false);
assert.equal(isValidTalentPurchasePrice(-1), false);
assert.equal(isValidTalentPurchasePrice('10'), false);
assert.equal(isValidTalentPurchasePrice(Number.POSITIVE_INFINITY), false);

const normalized = normalizeTalentProgram(v2);
normalized.markets.children.items[0].name = 'changed';
assert.equal(v2.markets.children.items[0].name, '간식', 'normalization must not mutate source fixtures');

const read = path => fs.readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const readActions = read('src/hooks/useUserBibleActions.js');
const quizCard = read('src/components/dashboard/BibleQuizCard.jsx');
const memberShop = read('src/components/dashboard/TalentShop.jsx');
const adminView = read('src/components/ChurchAdminView.jsx');
const adminTalentTab = read('src/components/churchAdmin/TalentShopTab.jsx');
const helpers = read('src/utils/helpers.js');
const firestoreIndexes = read('firestore.indexes.json');
const rules = read('firestore.rules');
const platformApi = read('src/utils/platformApi.js');
const platformApiServer = read('supabase/functions/platform-api/index.ts');
const purchaseCore = read('supabase/functions/platform-api/purchaseCore.ts');

assert.match(readActions, /loadTalentProgramsStrict/);
assert.match(readActions, /rewardedRosterOrgIds[\s\S]*rosterWallets\.forEach[\s\S]*transaction\.update\(wallet\.ref, rosterProgress\)/,
    '달란트 미사용 부서도 명부 읽기 진도는 갱신해야 한다.');
assert.match(readActions, /isFirstReadToday: resultData\.isFirstReadToday/,
    '달란트 적립 여부와 첫 읽기 여부를 분리해야 한다.');
assert.match(quizCard, /resolveTalentProgram[\s\S]*rewardedRosterWallets/);
assert.match(memberShop, /const purchasePrice = Number\(item\?\.price\)[\s\S]*isValidTalentPurchasePrice\(purchasePrice\)/,
    '모든 상점 구매는 쓰기 전에 양수 숫자 가격으로 정규화해야 한다.');
assert.match(memberShop, /purchaseItemViaApi\(\{[\s\S]*churchId:[\s\S]*itemId:[\s\S]*departmentId:[\s\S]*marketId:/,
    '교인 구매는 서버 purchaseItem 경로만 사용해야 한다.');
assert.match(memberShop, /PURCHASE_REQUEST_STORAGE_PREFIX[\s\S]*sessionStorage\.getItem[\s\S]*createRequestId\(\)[\s\S]*sessionStorage\.setItem/,
    '결과를 알 수 없는 구매를 같은 requestId로 재확인하도록 세션에 보존해야 한다.');
assert.match(memberShop, /purchaseItemViaApi\(\{[\s\S]*\}, \{ requestId \}\)[\s\S]*clearPurchaseRequestId\(requestKey\)/,
    '서버 성공 응답 후에만 멱등 구매 키를 정리해야 한다.');
assert.match(memberShop, /definiteClientFailure = e\.status >= 400 && e\.status < 500[\s\S]*if \(definiteClientFailure\) clearPurchaseRequestId[\s\S]*같은 상품을 다시 누르면 중복 차감 없이/,
    'timeout·network·server 결과불명은 requestId를 유지하고 재확인 안내를 보여야 한다.');
assert.doesNotMatch(memberShop, /collection\('talentPurchases'\)\.doc\(\)[\s\S]*transaction\.set\(/,
    '교인 화면이 구매 문서를 직접 만들면 안 된다.');
assert.match(platformApi, /callPlatformApi\('purchaseItem', payload, options\)/);
assert.match(purchaseCore, /shop\.schemaVersion === 2[\s\S]*departmentSettings[\s\S]*setting\?\.enabled !== true[\s\S]*market\?\.enabled === false/,
    '서버는 실제 부서와 활성 시장을 다시 검증해야 한다.');
assert.match(purchaseCore, /items\.map\(record\)\.find[\s\S]*candidate\.active !== false[\s\S]*Number\(item\?\.price\)[\s\S]*price <= 0/,
    '서버 저장 상품과 양수 가격만 사용해야 한다.');
assert.match(purchaseCore, /input\.user\.isDeleted === true[\s\S]*MEMBERSHIP_REQUIRED[\s\S]*INSUFFICIENT_TALENT/);
assert.match(platformApiServer, /purchasePath = `\$\{churchPath\}\/talentPurchases\/\$\{parsed\.requestId\}`[\s\S]*existingPurchase[\s\S]*alreadyCompleted: true/,
    '결정적 purchase id로 재요청을 멱등 처리해야 한다.');
assert.match(platformApiServer, /beginTransaction[\s\S]*validatePurchase\([\s\S]*updateWrite\(service\.projectId, walletPath[\s\S]*updateWrite\(service\.projectId, purchasePath[\s\S]*\{ transaction \}/,
    '서버가 지갑 차감과 구매 생성을 같은 트랜잭션으로 커밋해야 한다.');
assert.match(adminView, /setDepartmentTalentEnabled/);
assert.match(adminView, /setDepartmentTalentMarketMode/);
assert.match(adminView, /where\('status', '==', 'pending'\)[\s\S]*FieldPath\.documentId\(\)[\s\S]*PENDING_PURCHASE_PAGE_SIZE \+ 1/,
    '미처리 구매는 안정적인 문서 id 기준으로 상한 페이징해야 한다.');
assert.match(adminView, /Promise\.allSettled\([\s\S]*pendingResult\.status === 'fulfilled'[\s\S]*recentResult\.status === 'fulfilled'/,
    '미처리와 이력 중 한 조회가 실패해도 다른 결과를 보존해야 한다.');
assert.match(adminView, /where\('status', 'in', \['delivered', 'cancelled'\]\)[\s\S]*orderBy\('createdAt', 'desc'\)[\s\S]*RECENT_PURCHASE_LIMIT/,
    '최근 이력 조회에서 pending이 완료·취소 이력을 밀어내면 안 된다.');
assert.match(adminView, /startAfter\(pendingPurchaseCursor\)[\s\S]*PENDING_PURCHASE_PAGE_SIZE \+ 1/,
    '미처리 대량 데이터는 관리자가 페이지별로 추가 로드할 수 있어야 한다.');
assert.match(adminTalentTab, /purchaseFilter === 'pending' \|\| purchaseFilter === 'all'[\s\S]*미처리 구매 100건 더 보기/,
    '미처리 더보기는 관련 필터에서만 현재 로드 건수와 함께 보여야 한다.');
assert.doesNotMatch(adminView, /\.filter\(p => memberIds\.has\(p\.uid\)\)/,
    '탈퇴·제명 회원의 미처리 구매를 관리자 목록에서 숨기면 안 된다.');
assert.match(adminView, /purchase\.status === 'pending' \|\| !talentMarketId/,
    '미처리 구매는 삭제·변경된 시장 기록이어도 관리자가 볼 수 있어야 한다.');
assert.match(adminView, /refundLegacyPurchase[\s\S]*legacyWalletKind[\s\S]*PURCHASE_WALLET_UNRESOLVED/,
    '레거시 구매는 현재 소속으로 지갑을 추론하지 말고 명시 선택을 강제해야 한다.');
assert.match(adminView, /refundWalletKind === 'roster'[\s\S]*collection\('users'\)\.doc\(latestPurchase\.uid\)[\s\S]*FieldValue\.increment\(refundAmount\)/,
    '환불은 현재 roster 존재를 추정하지 말고 구매 당시 지갑 종류에 원자 증분해야 한다.');
assert.doesNotMatch(adminView, /PURCHASE_WALLET_MOVED_TO_ROSTER|refundMigratedPurchase|transaction\.get\(migratedUserRef\)/,
    '관리자에게 personal users read를 열지 않으므로 이관 추정용 사용자 읽기가 없어야 한다.');
assert.match(helpers, /talentWalletMigrated === true && \(Number\(knownUserData\.talent\) \|\| 0\) <= 0/,
    '이관 완료 뒤 users 지갑에 늦은 환불 잔액이 생기면 재이관을 건너뛰면 안 된다.');
assert.match(helpers, /return db\.runTransaction\(async transaction =>[\s\S]*transaction\.get\(userRef\)[\s\S]*transaction\.get\(rosterRef\)[\s\S]*transaction\.update\(userRef, \{ talent: 0, talentWalletMigrated: true \}\);[\s\S]*transaction\.update\(rosterRef, \{ talent: nextRosterTalent \}\)/,
    '재이관은 최신 두 지갑을 읽고 단일 트랜잭션으로 전액 이동해야 한다.');
assert.match(firestoreIndexes, /"collectionGroup": "talentPurchases"[\s\S]*"fieldPath": "status"[\s\S]*"fieldPath": "createdAt"/,
    '상태별 최근 이력 조회에 필요한 복합 인덱스를 선언해야 한다.');
const purchaseRules = rules.match(/match \/talentPurchases\/\{purchaseId\} \{([\s\S]*?)\n      \}/)?.[1] || '';
assert.doesNotMatch(purchaseRules, /allow create: if isRealUser\(\)/,
    '일반 교인의 구매 직접 생성은 규칙에서 닫혀 있어야 한다.');
assert.match(purchaseRules, /allow create: if \(isChurchAdmin\(churchId\) \|\| isPlatformAdmin\(\)\)[\s\S]*status == 'delivered'/,
    '관리자 창구 판매는 유지해야 한다.');
assert.match(rules, /hasAny\(\['role', 'churchId', 'accountType', 'isDeleted', 'extraMemberships',[\s\S]*'departmentId', 'departmentName',[\s\S]*'subgroupId', 'subgroupName'\]\)/,
    'users 소속 필드는 최초 설정도 본인이 직접 바꾸지 못해야 한다.');
assert.match(rules, /match \/roster\/\{memberUid\}[\s\S]*allow update: if \(isRealUser\(\)[\s\S]*affectedKeys\(\)[\s\S]*hasAny\(\['departmentId', 'departmentName', 'subgroupId', 'subgroupName'\]\)/,
    'roster 본인 update는 조직이 배정한 소속 4필드를 보존해야 한다.');
assert.match(rules, /data\.churchId == churchId[\s\S]*request\.resource\.data\.name == get\([\s\S]*request\.resource\.data\.score == get\([\s\S]*request\.resource\.data\.get\('departmentId', null\) == get\(/,
    '개인계정 전환용 base roster create는 users 원장과 진도·소속이 일치해야 한다.');
assert.match(rules, /resource\.data\.get\('isDeleted', false\) != true[\s\S]*request\.resource\.data\.get\('isDeleted', false\) != true[\s\S]*resource\.data\.churchId != 'unaffiliated_v1'[\s\S]*affectedKeys\(\)\.hasOnly\([\s\S]*'accountType', 'email', 'churchId', 'churchName', 'primaryOrgId', 'updatedAt'/,
    'member→personal 전환은 삭제 복구·seed talent·다른 민감 필드 변경을 허용하면 안 된다.');

console.log('department talent validation passed');
