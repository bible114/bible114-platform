import {
  AdminPurchaseValidationError,
  resolveAdminRefundWalletKind,
  validateAdminCounterSale,
  validateAdminPurchaseDelivery,
  validateAdminPurchaseRefund,
} from "./adminPurchaseCore.ts";

const assert = (condition: unknown, message: string) => {
  if (!condition) throw new Error(message);
};
const baseSale = (overrides: Record<string, unknown> = {}) => ({
  churchId: "c1",
  memberUid: "u1",
  departmentId: "adult",
  marketId: "shared",
  itemName: "세탁세제",
  price: 7,
  user: {
    name: "교인",
    role: "member",
    churchId: "c1",
    departmentId: "adult",
    talent: 10,
  },
  roster: null,
  talentShop: {
    schemaVersion: 2,
    enabled: true,
    departmentSettings: { adult: { enabled: true, marketId: "shared" } },
    markets: { shared: { enabled: true, items: [] } },
  },
  ...overrides,
});
const rejects = (code: string, callback: () => unknown) => {
  try {
    callback();
    throw new Error("expected rejection");
  } catch (error) {
    assert(
      error instanceof AdminPurchaseValidationError && error.code === code,
      `expected ${code}`,
    );
  }
};

Deno.test("관리자 창구 판매는 주 소속 users 지갑을 서버에서 결정한다", () => {
  const result = validateAdminCounterSale(baseSale());
  assert(
    result.walletKind === "user" && result.nextTalent === 3 &&
      result.departmentName === "adult",
    "canonical user debit expected",
  );
});

Deno.test("개인·외부 회원은 현재 공동체 roster 지갑만 차감한다", () => {
  const result = validateAdminCounterSale(baseSale({
    user: { name: "외부", accountType: "personal", churchId: null },
    roster: {
      uid: "u1",
      name: "외부",
      departmentId: "adult",
      talent: 9,
    },
  }));
  assert(
    result.walletKind === "roster" && result.nextTalent === 2,
    "canonical roster debit expected",
  );
});

Deno.test("창구 판매는 타 공동체·시장·잔액·입력 변조를 거부한다", () => {
  rejects("TARGET_UNAVAILABLE", () =>
    validateAdminCounterSale(baseSale({
      user: { churchId: "c2", departmentId: "adult", talent: 10 },
    })));
  rejects(
    "MARKET_UNAVAILABLE",
    () => validateAdminCounterSale(baseSale({ marketId: "other" })),
  );
  rejects("INSUFFICIENT_TALENT", () =>
    validateAdminCounterSale(baseSale({
      user: { churchId: "c1", departmentId: "adult", talent: 1 },
    })));
  rejects(
    "INVALID_ITEM",
    () => validateAdminCounterSale(baseSale({ price: 1.5 })),
  );
});

Deno.test("수령 처리는 pending 구매만 허용한다", () => {
  assert(
    validateAdminPurchaseDelivery({ status: "pending" }).status ===
      "delivered",
    "delivery expected",
  );
  rejects(
    "PURCHASE_ALREADY_PROCESSED",
    () => validateAdminPurchaseDelivery({ status: "cancelled" }),
  );
});

Deno.test("v2 환불은 구매 당시 지갑 스냅샷만 신뢰한다", () => {
  const purchase = {
    schemaVersion: 2,
    status: "pending",
    uid: "u1",
    walletKind: "roster",
    walletOrgId: "c1",
    price: 7,
  };
  const result = validateAdminPurchaseRefund({
    purchase,
    churchId: "c1",
    memberUid: "u1",
    legacyWalletKind: "user",
    user: null,
    roster: { uid: "u1", talent: 3 },
  });
  assert(
    result.walletKind === "roster" && result.nextTalent === 10,
    "snapshot roster refund expected",
  );
  rejects("REFUND_WALLET_UNRESOLVED", () =>
    resolveAdminRefundWalletKind(
      { ...purchase, walletOrgId: "c2" },
      "c1",
      "roster",
    ));
});

Deno.test("레거시 환불은 관리자가 고른 현재 공동체 지갑을 검증한다", () => {
  const purchase = { status: "pending", uid: "u1", price: 4 };
  rejects("REFUND_WALLET_UNRESOLVED", () =>
    validateAdminPurchaseRefund({
      purchase,
      churchId: "c1",
      memberUid: "u1",
      user: null,
      roster: null,
    }));
  const result = validateAdminPurchaseRefund({
    purchase,
    churchId: "c1",
    memberUid: "u1",
    legacyWalletKind: "user",
    user: { churchId: "c1", talent: 6 },
    roster: null,
  });
  assert(
    result.walletKind === "user" && result.nextTalent === 10,
    "legacy explicit user refund expected",
  );
  rejects("INVALID_WALLET", () =>
    validateAdminPurchaseRefund({
      purchase,
      churchId: "c1",
      memberUid: "u1",
      legacyWalletKind: "user",
      user: { churchId: "c2", talent: 6 },
      roster: null,
    }));
});

Deno.test("개인 계정 전환 뒤 v2 users 구매는 2차 확인 후 같은 공동체 roster로 환불한다", () => {
  const input = {
    purchase: {
      schemaVersion: 2,
      status: "pending",
      uid: "u1",
      walletKind: "user",
      walletOrgId: "c1",
      price: 4,
    },
    churchId: "c1",
    memberUid: "u1",
    user: {
      role: "member",
      accountType: "personal",
      churchId: null,
      primaryOrgId: "c2",
      talent: 0,
    },
    roster: { uid: "u1", talent: 6 },
  };
  rejects(
    "REFUND_MIGRATION_CONFIRM_REQUIRED",
    () => validateAdminPurchaseRefund(input),
  );
  const result = validateAdminPurchaseRefund({
    ...input,
    migratedWalletConfirmed: true,
  });
  assert(
    result.walletKind === "roster" && result.nextTalent === 10,
    "confirmed same-church roster refund expected",
  );
});

Deno.test("이관 상태가 아니면 명부 환불 2차 확인을 재사용할 수 없다", () => {
  rejects("INVALID_WALLET", () =>
    validateAdminPurchaseRefund({
      purchase: {
        schemaVersion: 2,
        status: "pending",
        uid: "u1",
        walletKind: "user",
        walletOrgId: "c1",
        price: 4,
      },
      churchId: "c1",
      memberUid: "u1",
      user: { churchId: "c1", accountType: "church", talent: 6 },
      roster: { uid: "u1", talent: 2 },
      migratedWalletConfirmed: true,
    }));
});

Deno.test("관리자 지갑 계산은 분수·안전 범위 밖 숫자를 거부한다", () => {
  for (const talent of [10.5, "10", false, "", -1, 1_000_000_001]) {
    rejects("INVALID_WALLET", () =>
      validateAdminCounterSale(baseSale({
        user: { churchId: "c1", departmentId: "adult", talent },
      })));
  }
  for (const price of [1.5, "4", Number.MAX_SAFE_INTEGER]) {
    rejects("INVALID_PURCHASE_PRICE", () =>
      validateAdminPurchaseRefund({
        purchase: {
          status: "pending",
          uid: "u1",
          price,
        },
        churchId: "c1",
        memberUid: "u1",
        legacyWalletKind: "user",
        user: { churchId: "c1", talent: 6 },
        roster: null,
      }));
  }
  rejects("INVALID_WALLET", () =>
    validateAdminPurchaseRefund({
      purchase: { status: "pending", uid: "u1", price: 2 },
      churchId: "c1",
      memberUid: "u1",
      legacyWalletKind: "user",
      user: { churchId: "c1", talent: 999_999_999 },
      roster: null,
    }));
});

Deno.test("개인 전환 환불은 활성 사용자와 동일 uid 명부를 모두 요구한다", () => {
  const purchase = {
    schemaVersion: 2,
    status: "pending",
    uid: "u1",
    walletKind: "user",
    walletOrgId: "c1",
    price: 4,
  };
  for (
    const [user, roster] of [
      [{
        role: "member",
        accountType: "personal",
        churchId: null,
        isDeleted: true,
      }, {
        uid: "u1",
        talent: 6,
      }],
      [{ role: "member", accountType: "personal", churchId: null }, {
        uid: "other",
        talent: 6,
      }],
      [{ role: "member", accountType: "personal", churchId: null }, {
        uid: "u1",
        talent: 6,
        isDeleted: true,
      }],
      [{ role: "churchAdmin", accountType: "personal", churchId: null }, {
        uid: "u1",
        talent: 6,
      }],
      [{ role: "member", accountType: "personal", churchId: "" }, {
        uid: "u1",
        talent: 6,
      }],
      [{ role: "member", accountType: "personal" }, {
        uid: "u1",
        talent: 6,
      }],
    ] as const
  ) {
    rejects("INVALID_WALLET", () =>
      validateAdminPurchaseRefund({
        purchase,
        churchId: "c1",
        memberUid: "u1",
        user,
        roster,
        migratedWalletConfirmed: true,
      }));
  }
  rejects("INVALID_WALLET", () =>
    validateAdminPurchaseRefund({
      purchase: { ...purchase, walletKind: "roster" },
      churchId: "c1",
      memberUid: "u1",
      user: { role: "member", accountType: "personal", churchId: null },
      roster: { uid: "u1", talent: 6 },
      migratedWalletConfirmed: true,
    }));
});
