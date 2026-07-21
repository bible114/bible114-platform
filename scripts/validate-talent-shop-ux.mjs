import assert from 'node:assert/strict';
import fs from 'node:fs';

const shop = fs.readFileSync(new URL('../src/components/dashboard/TalentShop.jsx', import.meta.url), 'utf8');
const dashboard = fs.readFileSync(new URL('../src/components/DashboardView.jsx', import.meta.url), 'utf8');

assert.doesNotMatch(
    shop,
    /if \(loading \|\| !enabled\) return null/,
    '비활성 상점이 설명 없이 사라지면 안 된다.'
);
assert.match(
    shop,
    /if \(!enabled\)[\s\S]*ShopUnavailableCard[\s\S]*getShopUnavailableNotice/,
    '상점 이용 불가 상태는 안내 카드로 보여야 한다.'
);
assert.match(shop, /우리 교회 상점은 지금 준비 중이에요/);
assert.match(shop, /내 소속 상점은 지금 준비 중이에요/);
assert.match(dashboard, /setTalentMarketVisible\(resolution\.canUseMarket\)/);
assert.match(dashboard, /belowQuizContent=\{hasCommunity && talentMarketVisible \?/,
    '상점을 이용할 수 없는 공동체에서는 준비 중 안내를 포함한 상점 영역 전체를 숨겨야 한다.');
assert.match(shop, /내 소속 상품을 준비하고 있어요/);
assert.match(shop, /ALWAYS_UNLOCKED_TEST_CHURCH_IDS = new Set\(\['test_church_kakao'\]\)/);
assert.match(shop, /ALWAYS_UNLOCKED_TEST_CHURCH_IDS\.has\(currentUser\.churchId\)/,
    '천로역정테스트교회에서는 회원도 7일 조건 없이 달란트 시장을 테스트할 수 있어야 한다.');
assert.match(
    shop,
    /담당 선생님에게 (확인|문의)/,
    '이용 불가 안내에는 성도가 취할 다음 행동이 있어야 한다.'
);

assert.match(
    shop,
    /ShopLockedCard[\s\S]*7일 연속 읽으면 열려요[\s\S]*role="progressbar"[\s\S]*7일 중 \{progress\}일/,
    '미해금 성도에게 7일 진행률을 보여야 한다.'
);
assert.match(
    shop,
    /한 번 열리면 연속 기록이 끊겨도 계속 이용할 수 있어요/,
    '영구 해금 정책을 성도에게 알려야 한다.'
);

assert.match(shop, /pending: '수령 대기'/);
assert.match(shop, /delivered: '수령 완료'/);
assert.match(shop, /cancelled: '취소·환불 완료'/);
assert.match(
    shop,
    /구매하면 \$\{purchasePrice\}달란트가 즉시 차감됩니다[\s\S]*상품은 교회에서 직접 받아요[\s\S]*성도 화면에서는 직접 취소할 수 없어요/,
    '구매 확인 전에 차감·수령·취소 정책을 모두 안내해야 한다.'
);
assert.match(
    shop,
    /수령 대기는 구매와 달란트 차감이 끝난 상태예요[\s\S]*상품을 받기 전에 담당 선생님께 말씀해주세요/,
    '구매 내역에 수령 대기와 취소 문의 행동 안내가 있어야 한다.'
);

assert.match(shop, /달란트는 공동체마다 따로 쌓이며 서로 합쳐지지 않아요/);
assert.match(shop, /아직 준비된 상품이 없어요[\s\S]*이용 시기는 담당 선생님에게 확인해주세요/);

assert.match(
    shop,
    /purchaseItemViaApi\(/,
    '기존 서버 구매 경로를 유지해야 한다.'
);
assert.doesNotMatch(
    shop,
    /adminRefundPurchase|adminDeliverPurchase/,
    '성도 상점에 관리자 환불·수령 처리 경로를 추가하면 안 된다.'
);

console.log('talent shop novice UX validation passed');
