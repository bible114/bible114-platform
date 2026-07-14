import { PurchaseValidationError, validatePurchase } from "./purchaseCore.ts";

const assert = (condition: unknown, message: string) => { if (!condition) throw new Error(message); };
const fixture = (overrides: Record<string, unknown> = {}) => ({
  uid: "u1", churchId: "c1", itemId: "snack", departmentId: "kids", marketId: "kids-market",
  user: { role: "member", churchId: "c1", departmentId: "kids", talent: 10, name: "아이" },
  roster: null,
  talentShop: {
    schemaVersion: 2, enabled: true,
    departmentSettings: { kids: { enabled: true, marketId: "kids-market" } },
    markets: { "kids-market": { enabled: true, items: [{ id: "snack", name: "간식", price: 7 }] } },
  },
  ...overrides,
});
const rejects = (code: string, overrides: Record<string, unknown>) => {
  try { validatePurchase(fixture(overrides)); throw new Error("expected rejection"); }
  catch (error) { assert(error instanceof PurchaseValidationError && error.code === code, `expected ${code}`); }
};

Deno.test("서버 상품 가격과 user 지갑으로 구매를 계산한다", () => {
  const result = validatePurchase(fixture());
  assert(result.item.price === 7 && result.nextTalent === 3 && result.walletKind === "user", "canonical purchase expected");
});
Deno.test("개인계정은 roster 지갑을 사용한다", () => {
  const result = validatePurchase(fixture({
    user: { role: "member", accountType: "personal", churchId: "c1", talent: 999 },
    roster: { uid: "u1", departmentId: "kids", talent: 8 },
  }));
  assert(result.walletKind === "roster" && result.nextTalent === 1, "roster debit expected");
});
Deno.test("위조 상품, 부서, 부족 잔액, 삭제 사용자를 거부한다", () => {
  rejects("ITEM_UNAVAILABLE", { itemId: "fake" });
  rejects("INVALID_DEPARTMENT", { departmentId: "adult" });
  rejects("INSUFFICIENT_TALENT", { user: { role: "member", churchId: "c1", departmentId: "kids", talent: 1 } });
  rejects("USER_UNAVAILABLE", { user: { role: "member", churchId: "c1", departmentId: "kids", talent: 10, isDeleted: true } });
});
Deno.test("레거시 shared 시장도 서버 상품을 사용한다", () => {
  const result = validatePurchase(fixture({
    marketId: "shared",
    talentShop: { enabled: true, items: [{ id: "snack", name: "간식", price: 4 }] },
  }));
  assert(result.item.price === 4 && result.nextTalent === 6, "legacy purchase expected");
});
