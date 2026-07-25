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
assert.equal(isValidTalentPurchasePrice(1.5), false);
assert.equal(isValidTalentPurchasePrice(1_000_001), false);
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
const membership = read('src/components/dashboard/CommunityMembershipCard.jsx');
const churchAdmin = read('src/components/ChurchAdminView.jsx');
const platformApi = read('src/utils/platformApi.js');
const platformApiServer = read('supabase/functions/platform-api/index.ts');
const purchaseCore = read('supabase/functions/platform-api/purchaseCore.ts');
const adminPurchaseCore = read('supabase/functions/platform-api/adminPurchaseCore.ts');
const churchAdminSignupService = read('supabase/functions/platform-api/completeChurchAdminSignupService.ts');

assert.match(readActions, /loadCanonicalUserStateFromServer\(uid\)[\s\S]*setCurrentUser\(freshUser\)[\s\S]*\(freshUser\.extraOrgs \|\| \[\]\)\.map\(org => \[org\.orgId, Number\(org\.talent\) \|\| 0\]\)[\s\S]*rosterTalentByOrgId/,
    '읽기 완료는 Firestore 서버에서 다시 읽은 최신 사용자·명부 지갑 상태를 적용해야 한다.');
assert.match(readActions, /const isFirstReadToday = summary\.scoreEarned > 0/,
    '서버 읽기 요약의 점수 적립 여부와 첫 읽기 여부를 연결해야 한다.');
assert.match(quizCard, /const response = await submitQuiz\([\s\S]*loadCanonicalUserStateFromServer\(submittedUid\)[\s\S]*setCurrentUser\(freshUser\)/,
    '퀴즈 완료는 Firestore 서버에서 다시 읽은 최신 사용자·명부 지갑 상태를 적용해야 한다.');
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
assert.match(platformApi, /callValidatedPurchaseAction\(payload, options\)[\s\S]*callPlatformApi\('purchaseItem', payload, \{ \.\.\.options, requestId \}\)[\s\S]*validatePurchaseItemResponse/);
assert.match(purchaseCore, /shop\.schemaVersion === 2[\s\S]*departmentSettings[\s\S]*setting\?\.enabled !== true[\s\S]*market\?\.enabled === false/,
    '서버는 실제 부서와 활성 시장을 다시 검증해야 한다.');
assert.match(purchaseCore, /items\.map\(record\)\.find[\s\S]*candidate\.active !== false[\s\S]*typeof price !== "number"[\s\S]*Number\.isSafeInteger\(price\)[\s\S]*price <= 0/,
    '서버 저장 상품과 안전한 양수 정수 가격만 사용해야 한다.');
assert.match(purchaseCore, /input\.user\.isDeleted === true[\s\S]*MEMBERSHIP_REQUIRED[\s\S]*INSUFFICIENT_TALENT/);
assert.match(platformApiServer, /purchasePath\s*=\s*[\s\S]*`\$\{churchPath\}\/talentPurchases\/\$\{parsed\.requestId\}`[\s\S]*existingPurchase[\s\S]*alreadyCompleted: true/,
    '결정적 purchase id로 재요청을 멱등 처리해야 한다.');
assert.match(platformApiServer, /existingPurchase\.data\.itemId === parsed\.itemId[\s\S]*existingPurchase\.data\.departmentId === parsed\.departmentId[\s\S]*existingPurchase\.data\.marketId === parsed\.marketId[\s\S]*latestWallet[\s\S]*latestTalent[\s\S]*nextTalent: latestTalent/,
    '일반 구매 재요청은 원래 입력에 결속하고 과거 잔액이 아닌 최신 지갑을 반환해야 한다.');
assert.match(memberShop, /reconcilePurchaseRequestIds\(new Set\(rows\.map\(row => row\.id\)\)\)/,
    '서버 반영이 확인된 일반 구매는 보존된 재시도 requestId를 정리해야 한다.');
assert.match(platformApiServer, /latestTalent[^\n]*=[\s\S]*Number\.isSafeInteger\(latestTalent\)[\s\S]*nextTalent:\s*latestTalent/,
    '일반 구매 재전송 잔액도 안전한 최신 정수만 반환해야 한다.');
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
assert.match(adminView, /ADMIN_TALENT_REQUEST_STORAGE_PREFIX[\s\S]*sessionStorage\.getItem[\s\S]*createRequestId\(\)[\s\S]*sessionStorage\.setItem/,
    '관리자 판매·환불 결과가 불명확할 때 같은 requestId를 세션에서 재사용해야 한다.');
assert.match(adminView, /adminCounterSale\(\{[\s\S]*memberUid:[\s\S]*departmentId:[\s\S]*marketId,[\s\S]*itemName,[\s\S]*price,[\s\S]*\}, \{ requestId \}\)/,
    '관리자 창구 판매는 서버 action만 사용해야 한다.');
assert.match(adminView, /adminRefundPurchase\(\{[\s\S]*legacyWalletKind:[\s\S]*migratedWalletConfirmed,[\s\S]*\}, \{ requestId \}\)[\s\S]*adminDeliverPurchase\(\{/,
    '관리자 수령·환불은 분리된 서버 action을 사용해야 한다.');
assert.doesNotMatch(adminView, /collection\('talentPurchases'\)\.doc\(\)[\s\S]*transaction\.set\(/,
    '관리자 화면이 창구 판매 문서를 직접 만들면 안 된다.');
assert.doesNotMatch(adminView, /FieldValue\.increment\(refundAmount\)|PURCHASE_WALLET_UNRESOLVED/,
    '관리자 화면이 환불 지갑을 직접 증액하거나 서버 판정을 흉내 내면 안 된다.');
const counterBranchStart = platformApiServer.indexOf('if (parsed.action === "adminCounterSale")');
const deliverBranchStart = platformApiServer.indexOf('if (parsed.action === "adminDeliverPurchase")', counterBranchStart);
const refundBranchStart = platformApiServer.indexOf('if (parsed.action === "adminRefundPurchase")', deliverBranchStart);
const memberPurchaseBranchStart = platformApiServer.indexOf('if (parsed.action === "purchaseItem")', refundBranchStart);
assert.ok(counterBranchStart >= 0 && deliverBranchStart > counterBranchStart && refundBranchStart > deliverBranchStart
    && memberPurchaseBranchStart > refundBranchStart, '관리자 판매·수령·환불 서버 분기가 순서대로 필요하다.');
const counterBranch = platformApiServer.slice(counterBranchStart, deliverBranchStart);
for (const pattern of [/beginTransaction\(/, /talentAdminActions\/\$\{parsed\.requestId\}/,
    /requireOrganizationAdmin\(/, /validateAdminCounterSale\(/, /validateAdminPurchaseReplay\(/,
    /await commitWrites\([\s\S]*updateWrite\(service\.projectId, ledgerPath,[\s\S]*\{ exists: false \}\),[\s\S]*\], \{ transaction \}\);/]) {
    assert.match(counterBranch, pattern, '창구 판매는 최신 관리자 권한·대상 지갑·불변 ledger를 한 transaction에서 처리해야 한다.');
}
const deliverBranch = platformApiServer.slice(deliverBranchStart, refundBranchStart);
for (const pattern of [/beginTransaction\(/, /talentAdminActions\/\$\{parsed\.requestId\}/,
    /requireOrganizationAdmin\(/, /validateAdminPurchaseDelivery\(/, /validateAdminPurchaseReplay\(/,
    /adminActionRequestId:\s*parsed\.requestId/,
    /await commitWrites\([\s\S]*updateWrite\(service\.projectId, ledgerPath,[\s\S]*\{ exists: false \}\),[\s\S]*\], \{ transaction \}\);/]) {
    assert.match(deliverBranch, pattern, '수령 처리는 최신 관리자 권한·불변 ledger·완료 요청 ID를 자체 transaction에서 처리해야 한다.');
}
const refundBranch = platformApiServer.slice(refundBranchStart, memberPurchaseBranchStart);
for (const pattern of [/beginTransaction\(/, /talentAdminActions\/\$\{parsed\.requestId\}/,
    /requireOrganizationAdmin\(/, /resolveAdminRefundWalletKind\(/, /validateAdminPurchaseRefund\(/,
    /validateAdminPurchaseReplay\(/,
    /migratedWalletConfirmed:\s*parsed\.migratedWalletConfirmed/, /balanceBefore:/,
    /balanceAfter:/, /adminActionRequestId:\s*parsed\.requestId/,
    /await commitWrites\([\s\S]*updateWrite\(service\.projectId, ledgerPath,[\s\S]*\{ exists: false \}\),[\s\S]*\], \{ transaction \}\);/]) {
    assert.match(refundBranch, pattern, '환불은 구매 당시 지갑과 전후 잔액을 서버 ledger에 기록해야 한다.');
}
assert.match(adminPurchaseCore, /purchase\.schemaVersion === 2[\s\S]*purchase\.walletKind[\s\S]*purchase\.walletOrgId/,
    'v2 환불은 구매 당시 지갑 스냅샷만 신뢰해야 한다.');
assert.match(adminPurchaseCore, /const walletKind = baseMember \? "user" : "roster"/,
    '창구 판매 대상 지갑은 서버가 주 소속과 roster 원장으로 결정해야 한다.');
assert.match(adminView, /refundMigratedPurchase[\s\S]*updatePurchaseStatus\(action\.purchase, 'cancelled', null, true\)/,
    '개인 계정 전환 뒤 환불 확인은 명시적인 서버 확인 플래그로 이어져야 한다.');
assert.match(adminView, /migratedWalletConfirmed[\s\S]*REFUND_MIGRATION_CONFIRM_REQUIRED[\s\S]*type: 'refundMigratedPurchase'/,
    '개인 계정 전환 뒤 환불은 서버 판정에 따라 관리자 2차 확인을 받아야 한다.');
assert.doesNotMatch(adminView, /transaction\.get\(migratedUserRef\)|collection\('users'\)\.doc\([^)]*purchase/,
    '개인 전환 여부와 환불 지갑은 관리자 브라우저가 users를 직접 읽어 추정하면 안 된다.');
assert.match(rules, /match \/talentAdminActions\/\{requestId\} \{[\s\S]*allow read, write: if false;/,
    '관리자 action ledger는 브라우저 역할과 무관하게 읽기·쓰기를 모두 거부해야 한다.');
const walletMigrationStart = helpers.indexOf('export const migratePersonalTalentWalletIfNeeded');
const walletMigrationEnd = helpers.indexOf('\n};', walletMigrationStart) + 3;
const walletMigrationHelper = helpers.slice(walletMigrationStart, walletMigrationEnd);
assert.ok(walletMigrationHelper.indexOf('auth?.currentUser?.uid !== requestUid')
    < walletMigrationHelper.indexOf("knownUserData && knownUserData.accountType !== 'personal'"),
    '계정 UID 검증은 지갑 이관의 모든 early return보다 먼저 실행해야 한다.');
assert.match(platformApi, /callPlatformApi\('migratePersonalTalentWallet', \{\}, \{ \.\.\.options, requestId \}\)[\s\S]*validateMigratePersonalTalentWalletResponse/,
    '개인 지갑 이관 API는 uid·조직·금액 없이 빈 payload만 보내야 한다.');
assert.match(walletMigrationHelper, /await migratePersonalTalentWalletViaApi\(\{ expectedUid: requestUid \}\)/,
    '개인 지갑 이관 쓰기는 인증된 서버 action에서만 수행해야 한다.');
assert.match(walletMigrationHelper, /if \(!hasKnownPrimaryOrg\) return null/,
    '공동체가 없는 혼자 읽기 개인 계정만 지갑 이관 호출을 생략해야 한다.');
assert.doesNotMatch(walletMigrationHelper, /talentWalletMigrated === true[\s\S]{0,200}return null/,
    '완료 힌트도 서버가 canonical roster와 최신 환불 경합을 확인해야 한다.');
assert.match(walletMigrationHelper, /migrationResponse\.result\.status === 'primaryMissing'[\s\S]*userRef\.get\(\{ source: 'server' \}\)/,
    '기본 명부 누락은 users source-server 스냅샷으로 다시 확인해야 한다.');
assert.match(walletMigrationHelper, /user\.role !== 'member'[\s\S]*user\.accountType !== 'personal'[\s\S]*!validDeletedState[\s\S]*!validMigrationFlag[\s\S]*!isCanonicalOrgId\(user\.primaryOrgId\)[\s\S]*!Number\.isSafeInteger\(user\.talent\)/,
    '명부 누락 계정도 역할·삭제·이관·조직·잔액 형식을 fail-closed 검증해야 한다.');
assert.doesNotMatch(walletMigrationHelper, /migrationResponse\.result\.(?:orgId|primaryOrgId|talent|balance)/,
    '브라우저는 지갑 이관 API 응답의 조직·잔액을 권위 값으로 쓰면 안 된다.');
assert.match(walletMigrationHelper, /const userSnap = await transaction\.get\(userRef\)[\s\S]*const orgId = user\.primaryOrgId[\s\S]*const rosterSnap = await transaction\.get\(rosterRef\)/,
    '서버 성공 뒤 users와 저장된 primary roster를 한 read-only transaction에서 확인해야 한다.');
assert.match(walletMigrationHelper, /user\.talentWalletMigrated !== true[\s\S]*user\.talent !== 0[\s\S]*roster\.uid !== requestUid[\s\S]*Number\.isSafeInteger\(roster\.talent\)/,
    '반영 상태와 roster uid·잔액을 source-server snapshot에서 fail-closed 검증해야 한다.');
assert.doesNotMatch(walletMigrationHelper, /transaction\.(?:set|update|delete)\(/,
    '개인 지갑 이관 helper에 브라우저 직접 쓰기가 남으면 안 된다.');
assert.doesNotMatch(walletMigrationHelper, /migratePersonalTalentWalletViaApi\(\{[^}]+(?:uid|orgId|talent|primaryOrgId)/,
    'knownUserData와 인자 primaryOrgId를 API payload 권위로 보내면 안 된다.');
assert.match(firestoreIndexes, /"collectionGroup": "talentPurchases"[\s\S]*"fieldPath": "status"[\s\S]*"fieldPath": "createdAt"/,
    '상태별 최근 이력 조회에 필요한 복합 인덱스를 선언해야 한다.');
const purchaseRules = rules.match(/match \/talentPurchases\/\{purchaseId\} \{([\s\S]*?)\n      \}/)?.[1] || '';
assert.doesNotMatch(purchaseRules, /allow create: if isRealUser\(\)/,
    '일반 교인의 구매 직접 생성은 규칙에서 닫혀 있어야 한다.');
assert.match(purchaseRules, /allow create, update, delete: if false;/,
    '판매·수령·환불은 관리자도 브라우저에서 직접 쓰지 못하고 서버 action만 사용해야 한다.');
assert.match(rules, /hasAny\(\['role', 'churchId', 'accountType', 'isDeleted', 'extraMemberships',[\s\S]*'departmentId', 'departmentName',[\s\S]*'subgroupId', 'subgroupName'\]\)/,
    'users 소속 필드는 최초 설정도 본인이 직접 바꾸지 못해야 한다.');
assert.match(rules, /resource\.data\.role == 'member'[\s\S]*isChurchAdmin\(resource\.data\.churchId\)[\s\S]*affectedKeys\(\)\.hasOnly\(\[[\s\S]*'departmentId', 'departmentName', 'subgroupId', 'subgroupName'[\s\S]*'extraMemberships', 'updatedAt'/,
    '공동체 관리자의 users 쓰기는 삭제·소속 필드 allowlist를 벗어나면 안 된다.');
assert.match(rules, /deletedAt == request\.time[\s\S]*deletedBy == request\.auth\.uid[\s\S]*hasAll\(\['isDeleted', 'deletedAt', 'deletedBy'\]\)/,
    '교인 삭제 감사 시각·행위자는 삭제 전이와 함께 서버 시각·현재 관리자에 결속해야 한다.');
assert.match(rules, /isDeleted == false[\s\S]*deletedAt == null[\s\S]*deletedBy == null[\s\S]*hasAll\(\['isDeleted', 'deletedAt', 'deletedBy'\]\)/,
    '교인 복원은 삭제 감사 필드를 함께 비워야 한다.');
assert.match(rules, /function isSafeSelfScoreTalentUpdate\(before, after\)[\s\S]*before\.get\('talentMigrated', false\) == true[\s\S]*after\.get\('talentMigrated', false\) == true/,
    'talentMigrated true 표식은 본인이 false로 되돌려 이관 예외를 재사용할 수 없어야 한다.');
const usersCreateRule = rules.slice(
    rules.indexOf('allow create:', rules.indexOf('match /users/{uid}')),
    rules.indexOf('// 본인 수정', rules.indexOf('match /users/{uid}')),
);
assert.doesNotMatch(usersCreateRule, /churchAdmin/,
    '브라우저는 신규 공동체 관리자 문서를 직접 만들 수 없어야 한다.');
assert.match(churchAdminSignupService, /role: "churchAdmin",[\s\S]*extraMemberships: \[\],[\s\S]*score: 0,[\s\S]*talent: 0,[\s\S]*talentMigrated: true/,
    '서버 신규 공동체 관리자 문서는 추가소속·점수·지갑을 canonical 초기값으로 만들어야 한다.');
assert.match(rules, /afterTalent == beforeTalent[\s\S]*afterScore == beforeScore/,
    '이관 완료 users의 true→true 본인 쓰기는 계정 유형과 무관하게 score/talent를 완전히 동결해야 한다.');
assert.doesNotMatch(rules, /!wasMigrated|!isMigrated|afterTalent == beforeScore|afterScore >= beforeScore/,
    '백필 완료 뒤 legacy 브라우저 이관 분기가 남으면 안 된다.');
assert.doesNotMatch(rules, /afterTalent <= beforeTalent \+ 17|afterScore <= beforeScore \+ 15/,
    '일반 공동체 users의 구버전 브라우저 보상 호환 상한은 최종 차단 뒤 남으면 안 된다.');
assert.doesNotMatch(rules, /resource\.data\.accountType == 'personal'[\s\S]{0,300}isChurchAdmin\(resource\.data\.get\('primaryOrgId', null\)\)[\s\S]{0,300}hasOnly\(\['talent', 'updatedAt'\]\)/,
    '공동체 관리자가 개인 users.talent를 임의 양수로 직접 설정할 수 없어야 한다.');
const rosterUpdateRule = rules.match(/match \/roster\/\{memberUid\} \{([\s\S]*?)\n        allow delete/)?.[1] || '';
assert.match(rosterUpdateRule, /isChurchAdmin\(churchId\)[\s\S]*affectedKeys\(\)\.hasOnly\(\[[\s\S]*'departmentId', 'departmentName', 'subgroupId', 'subgroupName'[\s\S]*'extraMemberships', 'updatedAt'/,
    '공동체 관리자의 roster update는 소속 배정 필드만 허용해야 한다.');
assert.doesNotMatch(rosterUpdateRule, /\(\(isChurchAdmin\(churchId\) \|\| isPlatformAdmin\(\)\) &&/,
    '공동체 관리자에게 roster 전체 update 권한을 열면 진도·달란트를 임의 조작할 수 있다.');
assert.match(rules, /function isPersonalPrimaryRoster\(churchId, memberUid\)[\s\S]*get\('accountType', null\) == 'personal'[\s\S]*get\('primaryOrgId', null\) == churchId/,
    '개인 계정의 기본 roster를 users 원장으로 판별해야 한다.');
assert.match(rules, /function isPersonalPrimaryRoster\(churchId, memberUid\)[\s\S]*let before = get\([\s\S]*let after = getAfter\([\s\S]*before\.get\('primaryOrgId', null\) == churchId[\s\S]*after\.get\('primaryOrgId', null\) == churchId/,
    '개인계정 전환·기본 변경과 같은 transaction에서도 전후 primary roster 삭제를 모두 막아야 한다.');
assert.match(rules, /allow delete: if !isPersonalPrimaryRoster\(churchId, memberUid\)[\s\S]*request\.auth\.uid == memberUid[\s\S]*isChurchAdmin\(churchId\)[\s\S]*isPlatformAdmin\(\)/,
    '기본 roster는 본인·공동체 관리자·플랫폼 관리자 브라우저에서 삭제할 수 없어야 한다.');
assert.match(rules, /allow delete: if !isPersonalPrimaryRoster\(churchId, memberUid\)[\s\S]*resource\.data\.get\('talent', 0\) == 0[\s\S]*request\.auth\.uid == memberUid/,
    '양수 달란트가 남은 secondary roster도 브라우저 탈퇴·제명으로 삭제할 수 없어야 한다.');
assert.match(membership, /transaction\.get\(rosterRef\)[\s\S]*latestTalent > 0[\s\S]*달란트[^\n]*남아 있어 탈퇴할 수 없어요/,
    '본인 탈퇴 UI는 source transaction의 최신 roster 잔액을 확인해야 한다.');
assert.match(churchAdmin, /executeExpelRosterMember[\s\S]*transaction\.get\(rosterRef\)[\s\S]*latestTalent > 0[\s\S]*남아 있어 제명할 수 없습니다/,
    '관리자 제명 UI는 source transaction의 최신 roster 잔액을 확인해야 한다.');
assert.match(rosterUpdateRule, /get\('score', 0\) == resource\.data\.get\('score', 0\)[\s\S]*get\('talent', 0\) == resource\.data\.get\('talent', 0\)[\s\S]*get\('currentDay', 1\) == resource\.data\.get\('currentDay', 1\)[\s\S]*get\('lastReadDate', null\) == resource\.data\.get\('lastReadDate', null\)/,
    '모든 roster 진도·점수·달란트는 브라우저 self-update에서 exact-freeze해야 한다.');
assert.doesNotMatch(rosterUpdateRule, /\+ 15|\+ 17/,
    '일반 공동체 roster의 구버전 보상 호환 상한은 최종 차단 뒤 남으면 안 된다.');
assert.match(adminView, /executeExpelRosterMember[\s\S]*error\?\.code === 'permission-denied'[\s\S]*기본 공동체이거나 달란트 잔액이 남은 명부에서는 제명할 수 없습니다/,
    '기본 또는 양수 잔액 roster 삭제 거부는 관리자에게 별도로 안내해야 한다.');
assert.match(rules, /match \/roster\/\{memberUid\}[\s\S]*allow update: if \(isRealUser\(\)[\s\S]*affectedKeys\(\)[\s\S]*hasAny\(\['departmentId', 'departmentName', 'subgroupId', 'subgroupName'\]\)/,
    'roster 본인 update는 조직이 배정한 소속 4필드를 보존해야 한다.');
assert.match(rules, /data\.churchId == churchId[\s\S]*request\.resource\.data\.name == get\([\s\S]*request\.resource\.data\.score == get\([\s\S]*request\.resource\.data\.get\('departmentId', null\) == get\(/,
    '개인계정 전환용 base roster create는 users 원장과 진도·소속이 일치해야 한다.');
assert.match(rules, /resource\.data\.get\('isDeleted', false\) != true[\s\S]*request\.resource\.data\.get\('isDeleted', false\) != true[\s\S]*resource\.data\.churchId != 'unaffiliated_v1'[\s\S]*affectedKeys\(\)\.hasOnly\([\s\S]*'accountType', 'email', 'churchId', 'churchName', 'primaryOrgId', 'updatedAt'/,
    'member→personal 전환은 삭제 복구·seed talent·다른 민감 필드 변경을 허용하면 안 된다.');

console.log('department talent validation passed');
