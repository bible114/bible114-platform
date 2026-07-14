export type PurchaseRecord = Record<string, unknown>;

export type PurchaseInput = {
  uid: string;
  churchId: string;
  itemId: string;
  departmentId: string;
  marketId: string;
  user: PurchaseRecord;
  roster: PurchaseRecord | null;
  talentShop: PurchaseRecord | null;
};

export type PurchaseValidationCode =
  | "USER_UNAVAILABLE"
  | "MEMBERSHIP_REQUIRED"
  | "MARKET_UNAVAILABLE"
  | "INVALID_DEPARTMENT"
  | "ITEM_UNAVAILABLE"
  | "INSUFFICIENT_TALENT";

export class PurchaseValidationError extends Error {
  constructor(readonly code: PurchaseValidationCode) {
    super(code);
    this.name = "PurchaseValidationError";
  }
}

const record = (value: unknown): PurchaseRecord | null =>
  value && typeof value === "object" && !Array.isArray(value)
    ? value as PurchaseRecord
    : null;
const text = (value: unknown) => typeof value === "string" ? value.trim() : "";
const memberships = (source: PurchaseRecord) => {
  const rows = new Map<string, string>();
  const primary = text(source.departmentId);
  if (primary) rows.set(primary, text(source.departmentName) || primary);
  if (Array.isArray(source.extraMemberships)) {
    source.extraMemberships.forEach((entry) => {
      const row = record(entry);
      const id = text(row?.departmentId);
      if (id && !rows.has(id)) rows.set(id, text(row?.departmentName) || id);
    });
  }
  return rows;
};

export const validatePurchase = (input: PurchaseInput) => {
  if (input.user.isDeleted === true || !["member", "churchAdmin"].includes(text(input.user.role))) {
    throw new PurchaseValidationError("USER_UNAVAILABLE");
  }
  const baseMember = text(input.user.churchId) === input.churchId;
  const rosterMember = Boolean(input.roster) && input.roster?.isDeleted !== true &&
    (!text(input.roster?.uid) || text(input.roster?.uid) === input.uid);
  if (!baseMember && !rosterMember) {
    throw new PurchaseValidationError("MEMBERSHIP_REQUIRED");
  }
  const member = rosterMember ? input.roster! : input.user;
  const departmentRows = memberships(member);
  const shop = input.talentShop;
  if (!shop) throw new PurchaseValidationError("MARKET_UNAVAILABLE");

  let market: PurchaseRecord | null = null;
  let canonicalDepartmentId = input.departmentId;
  if (shop.schemaVersion === 2) {
    if (shop.enabled !== true || !departmentRows.has(input.departmentId)) {
      throw new PurchaseValidationError("INVALID_DEPARTMENT");
    }
    const setting = record(record(shop.departmentSettings)?.[input.departmentId]);
    if (setting?.enabled !== true || text(setting.marketId) !== input.marketId) {
      throw new PurchaseValidationError("MARKET_UNAVAILABLE");
    }
    market = record(record(shop.markets)?.[input.marketId]);
    if (market?.enabled === false) throw new PurchaseValidationError("MARKET_UNAVAILABLE");
  } else {
    if (shop.enabled !== true || input.marketId !== "shared") {
      throw new PurchaseValidationError("MARKET_UNAVAILABLE");
    }
    if (departmentRows.size > 0 && !departmentRows.has(input.departmentId)) {
      throw new PurchaseValidationError("INVALID_DEPARTMENT");
    }
    if (departmentRows.size === 0) canonicalDepartmentId = "legacy_shared";
    market = shop;
  }
  const items = Array.isArray(market?.items) ? market.items : [];
  const item = items.map(record).find((candidate) =>
    candidate && text(candidate.id) === input.itemId && candidate.active !== false
  );
  const price = Number(item?.price);
  if (!item || !Number.isFinite(price) || price <= 0) {
    throw new PurchaseValidationError("ITEM_UNAVAILABLE");
  }

  const walletKind = input.user.accountType === "personal" || !baseMember
    ? "roster"
    : "user";
  const wallet = walletKind === "roster" ? input.roster : input.user;
  if (!wallet) throw new PurchaseValidationError("MEMBERSHIP_REQUIRED");
  const balance = Number(wallet.talent) || 0;
  if (balance < price) throw new PurchaseValidationError("INSUFFICIENT_TALENT");
  return {
    walletKind,
    nextTalent: balance - price,
    item: { id: input.itemId, name: text(item.name) || input.itemId, price },
    departmentId: canonicalDepartmentId,
    departmentName: departmentRows.get(canonicalDepartmentId) || canonicalDepartmentId,
    marketId: input.marketId,
  } as const;
};
