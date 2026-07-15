export type AdminPurchaseRecord = Record<string, unknown>;

export type AdminPurchaseValidationCode =
  | "TARGET_UNAVAILABLE"
  | "INVALID_WALLET"
  | "INVALID_DEPARTMENT"
  | "MARKET_UNAVAILABLE"
  | "INVALID_ITEM"
  | "INSUFFICIENT_TALENT"
  | "PURCHASE_UNAVAILABLE"
  | "PURCHASE_ALREADY_PROCESSED"
  | "REFUND_MIGRATION_CONFIRM_REQUIRED"
  | "REFUND_WALLET_UNRESOLVED"
  | "INVALID_PURCHASE_PRICE";

export class AdminPurchaseValidationError extends Error {
  constructor(readonly code: AdminPurchaseValidationCode) {
    super(code);
    this.name = "AdminPurchaseValidationError";
  }
}

const record = (value: unknown): AdminPurchaseRecord | null =>
  value && typeof value === "object" && !Array.isArray(value)
    ? value as AdminPurchaseRecord
    : null;
const text = (value: unknown) => typeof value === "string" ? value.trim() : "";
const VALID_WALLET_KINDS = new Set(["user", "roster"]);
const MAX_TALENT_VALUE = 1_000_000_000;

const membershipRows = (source: AdminPurchaseRecord) => {
  const rows = new Map<string, string>();
  const primaryId = text(source.departmentId);
  if (primaryId) {
    rows.set(primaryId, text(source.departmentName) || primaryId);
  }
  if (Array.isArray(source.extraMemberships)) {
    source.extraMemberships.forEach((entry) => {
      const membership = record(entry);
      const departmentId = text(membership?.departmentId);
      if (departmentId && !rows.has(departmentId)) {
        rows.set(
          departmentId,
          text(membership?.departmentName) || departmentId,
        );
      }
    });
  }
  return rows;
};

export const readAdminTalentBalance = (value: unknown) => {
  if (value === null || value === undefined) return 0;
  if (typeof value !== "number") return null;
  const balance = value;
  return Number.isSafeInteger(balance) && balance >= 0 &&
      balance <= MAX_TALENT_VALUE
    ? balance
    : null;
};

export const validateAdminCounterSale = (input: {
  churchId: string;
  memberUid: string;
  departmentId: string;
  marketId: string;
  itemName: string;
  price: number;
  user: AdminPurchaseRecord | null;
  roster: AdminPurchaseRecord | null;
  talentShop: AdminPurchaseRecord | null;
}) => {
  const user = input.user;
  if (!user || user.isDeleted === true) {
    throw new AdminPurchaseValidationError("TARGET_UNAVAILABLE");
  }
  const baseMember = text(user.churchId) === input.churchId &&
    text(user.accountType) !== "personal";
  const rosterMember = Boolean(input.roster) &&
    input.roster?.isDeleted !== true &&
    (!text(input.roster?.uid) || text(input.roster?.uid) === input.memberUid);
  if (!baseMember && !rosterMember) {
    throw new AdminPurchaseValidationError("TARGET_UNAVAILABLE");
  }

  // 일반 구매와 동일하게 주 소속이면 users, 개인·외부 소속이면 해당
  // 공동체 roster를 원장으로 사용한다. 클라이언트가 지갑을 고르지 않는다.
  const walletKind = baseMember ? "user" : "roster";
  const wallet = walletKind === "user" ? user : input.roster;
  if (!wallet) throw new AdminPurchaseValidationError("INVALID_WALLET");

  const memberships = membershipRows(wallet);
  if (!memberships.has(input.departmentId)) {
    throw new AdminPurchaseValidationError("INVALID_DEPARTMENT");
  }
  const shop = input.talentShop;
  if (!shop || shop.enabled !== true) {
    throw new AdminPurchaseValidationError("MARKET_UNAVAILABLE");
  }
  if (shop.schemaVersion === 2) {
    const setting = record(
      record(shop.departmentSettings)?.[input.departmentId],
    );
    const market = record(record(shop.markets)?.[input.marketId]);
    if (
      setting?.enabled !== true || text(setting.marketId) !== input.marketId ||
      !market || market.enabled === false
    ) {
      throw new AdminPurchaseValidationError("MARKET_UNAVAILABLE");
    }
  } else if (input.marketId !== "shared") {
    throw new AdminPurchaseValidationError("MARKET_UNAVAILABLE");
  }

  const itemName = text(input.itemName);
  if (
    !itemName || itemName.length > 100 ||
    /[\u0000-\u001f\u007f]/.test(itemName) ||
    !Number.isSafeInteger(input.price) || input.price <= 0 ||
    input.price > 1_000_000
  ) {
    throw new AdminPurchaseValidationError("INVALID_ITEM");
  }
  const balance = readAdminTalentBalance(wallet.talent);
  if (balance === null) {
    throw new AdminPurchaseValidationError("INVALID_WALLET");
  }
  if (balance < input.price) {
    throw new AdminPurchaseValidationError("INSUFFICIENT_TALENT");
  }
  return {
    walletKind,
    nextTalent: balance - input.price,
    memberName: text(wallet.name) || text(user.name) || "교인",
    departmentId: input.departmentId,
    departmentName: memberships.get(input.departmentId) || input.departmentId,
    marketId: input.marketId,
    itemName,
    price: input.price,
  } as const;
};

export const validateAdminPurchaseDelivery = (
  purchase: AdminPurchaseRecord | null,
) => {
  if (!purchase) {
    throw new AdminPurchaseValidationError("PURCHASE_UNAVAILABLE");
  }
  if (text(purchase.status) !== "pending") {
    throw new AdminPurchaseValidationError("PURCHASE_ALREADY_PROCESSED");
  }
  return { status: "delivered" as const };
};

export const resolveAdminRefundWalletKind = (
  purchase: AdminPurchaseRecord,
  churchId: string,
  legacyWalletKind = "",
) => {
  if (purchase.schemaVersion === 2) {
    const walletKind = text(purchase.walletKind);
    if (
      !VALID_WALLET_KINDS.has(walletKind) ||
      text(purchase.walletOrgId) !== churchId
    ) {
      throw new AdminPurchaseValidationError("REFUND_WALLET_UNRESOLVED");
    }
    return walletKind as "user" | "roster";
  }
  const walletKind = text(legacyWalletKind);
  const storedOrgId = text(purchase.walletOrgId);
  if (
    !VALID_WALLET_KINDS.has(walletKind) ||
    (storedOrgId && storedOrgId !== churchId)
  ) {
    throw new AdminPurchaseValidationError("REFUND_WALLET_UNRESOLVED");
  }
  return walletKind as "user" | "roster";
};

export const validateAdminPurchaseRefund = (input: {
  purchase: AdminPurchaseRecord | null;
  churchId: string;
  memberUid: string;
  legacyWalletKind?: string;
  user: AdminPurchaseRecord | null;
  roster: AdminPurchaseRecord | null;
  migratedWalletConfirmed?: boolean;
}) => {
  validateAdminPurchaseDelivery(input.purchase);
  const purchase = input.purchase!;
  const purchaseUid = text(purchase.uid);
  if (!purchaseUid || purchaseUid !== input.memberUid) {
    throw new AdminPurchaseValidationError("PURCHASE_UNAVAILABLE");
  }
  const snapshotWalletKind = resolveAdminRefundWalletKind(
    purchase,
    input.churchId,
    input.legacyWalletKind,
  );
  const canonicalRoster = Boolean(
    input.roster && input.roster.isDeleted !== true &&
      (!text(input.roster.uid) || text(input.roster.uid) === purchaseUid),
  );
  // v2 구매 당시 users 지갑을 사용했지만 이후 개인 계정으로 전환되어 같은
  // 공동체 roster가 생긴 경우에만 관리자 2차 확인 뒤 환불 대상을 옮긴다.
  // roster 존재만으로 추정하면 전환 도중/비정상 데이터에 잘못 환불할 수 있다.
  const movedToRoster = purchase.schemaVersion === 2 &&
    snapshotWalletKind === "user" &&
    input.user?.isDeleted !== true &&
    text(input.user?.role) === "member" &&
    text(input.user?.accountType) === "personal" &&
    input.user?.churchId === null && canonicalRoster &&
    text(input.roster?.uid) === purchaseUid;
  if (movedToRoster && input.migratedWalletConfirmed !== true) {
    throw new AdminPurchaseValidationError(
      "REFUND_MIGRATION_CONFIRM_REQUIRED",
    );
  }
  if (!movedToRoster && input.migratedWalletConfirmed === true) {
    throw new AdminPurchaseValidationError("INVALID_WALLET");
  }
  const walletKind = movedToRoster ? "roster" : snapshotWalletKind;
  const wallet = walletKind === "user" ? input.user : input.roster;
  const canonicalWallet = walletKind === "user"
    ? Boolean(
      wallet && wallet.isDeleted !== true &&
        text(wallet.churchId) === input.churchId &&
        text(wallet.accountType) !== "personal",
    )
    : canonicalRoster;
  if (!canonicalWallet) {
    throw new AdminPurchaseValidationError("INVALID_WALLET");
  }
  const price = purchase.price;
  if (
    typeof price !== "number" || !Number.isSafeInteger(price) || price <= 0 ||
    price > MAX_TALENT_VALUE
  ) {
    throw new AdminPurchaseValidationError("INVALID_PURCHASE_PRICE");
  }
  const balance = readAdminTalentBalance(wallet?.talent);
  if (balance === null || balance + price > MAX_TALENT_VALUE) {
    throw new AdminPurchaseValidationError("INVALID_WALLET");
  }
  return {
    walletKind,
    refundAmount: price,
    nextTalent: balance + price,
  } as const;
};
