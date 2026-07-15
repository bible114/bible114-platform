export const TALENT_PROGRAM_SCHEMA_VERSION = 2;
export const LEGACY_TALENT_MARKET_ID = "shared";

type UnknownRecord = Record<string, unknown>;

export type TalentMembershipUser = {
  departmentId?: unknown;
  departmentName?: unknown;
  subgroupId?: unknown;
  subgroupName?: unknown;
  extraMemberships?: unknown;
  talentDepartmentId?: unknown;
};

export type NormalizedTalentMarket = UnknownRecord & {
  id: string;
  name: string;
  enabled: boolean;
  items: UnknownRecord[];
};

export type NormalizedTalentProgram = {
  schemaVersion: 1 | 2;
  legacy: boolean;
  enabled: boolean;
  shopEnabled: boolean;
  departmentSettings: Record<
    string,
    { enabled: boolean; marketId: string | null }
  >;
  markets: Record<string, NormalizedTalentMarket>;
};

export type TalentProgramResolution = {
  schemaVersion: 1 | 2;
  legacy: boolean;
  shopEnabled: boolean;
  activeDepartments: Array<{
    departmentId: string | null;
    marketId: string;
    marketEnabled: boolean;
  }>;
  selectedDepartmentId: string | null;
  selectedMarketId: string | null;
  canEarnTalent: boolean;
  canUseMarket: boolean;
  reason: "MARKET_DISABLED" | "NO_ACTIVE_DEPARTMENT" | "NO_MEMBERSHIP" | null;
};

const asRecord = (value: unknown): UnknownRecord | null =>
  value && typeof value === "object" && !Array.isArray(value)
    ? value as UnknownRecord
    : null;

const normalizeId = (value: unknown): string | null => {
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  return normalized || null;
};

export const normalizeStoredDocumentId = (value: unknown): string | null => {
  const normalized = normalizeId(value);
  return normalized && !normalized.includes("/") ? normalized : null;
};

export type RosterTalentWalletDocument = {
  name: string;
  data: TalentMembershipUser & { uid?: unknown };
};

export type ParsedRosterTalentWallet = {
  orgId: string;
  user: TalentMembershipUser;
};

export const parseRosterTalentWallets = (
  documents: RosterTalentWalletDocument[],
  authenticatedUid: string,
):
  | { ok: true; wallets: ParsedRosterTalentWallet[] }
  | { ok: false; reason: "INVALID_ROSTER" | "DUPLICATE_ORG" | "TOO_MANY" } => {
  const uid = normalizeStoredDocumentId(authenticatedUid);
  if (
    !uid || uid !== authenticatedUid || uid.length > 128 || uid === "." ||
    uid === ".." || /[\u0000-\u001f\u007f]/.test(uid)
  ) return { ok: false, reason: "INVALID_ROSTER" };
  const marker = "/documents/churches/";
  const wallets: ParsedRosterTalentWallet[] = [];
  const seen = new Set<string>();
  for (const document of documents) {
    const markerIndex = document.name.indexOf(marker);
    const segments = markerIndex < 0
      ? []
      : document.name.slice(markerIndex + marker.length).split("/");
    const rawOrgId = segments.length === 3 && segments[1] === "roster"
      ? segments[0]
      : null;
    const orgId = normalizeStoredDocumentId(rawOrgId);
    if (
      !orgId || orgId !== rawOrgId || orgId.length > 128 || orgId === "." ||
      orgId === ".." || /[\u0000-\u001f\u007f]/.test(orgId) ||
      segments[2] !== uid || document.data.uid !== uid
    ) return { ok: false, reason: "INVALID_ROSTER" };
    if (seen.has(orgId)) return { ok: false, reason: "DUPLICATE_ORG" };
    seen.add(orgId);
    wallets.push({ orgId, user: document.data });
  }
  if (wallets.length > 3) return { ok: false, reason: "TOO_MANY" };
  wallets.sort((left, right) =>
    left.orgId < right.orgId ? -1 : left.orgId > right.orgId ? 1 : 0
  );
  return { ok: true, wallets };
};

const normalizeItems = (items: unknown): UnknownRecord[] =>
  (Array.isArray(items) ? items : []).flatMap((item) => {
    const record = asRecord(item);
    return record ? [{ ...record }] : [];
  });

const normalizeMarket = (
  value: unknown,
  fallbackId: string,
): NormalizedTalentMarket | null => {
  const market = asRecord(value);
  if (!market) return null;
  const id = normalizeId(market.id) || normalizeId(fallbackId);
  if (!id) return null;
  return {
    ...market,
    id,
    name: normalizeId(market.name) || id,
    enabled: market.enabled !== false,
    items: normalizeItems(market.items),
  };
};

const getLegacySource = (talentShop: unknown): UnknownRecord => {
  const shop = asRecord(talentShop);
  if (!shop) return {};
  const legacy = asRecord(shop.legacy);
  return shop.schemaVersion === TALENT_PROGRAM_SCHEMA_VERSION && legacy
    ? legacy
    : shop;
};

export const isTalentProgramV2 = (talentShop: unknown): boolean => {
  const shop = asRecord(talentShop);
  return Boolean(
    shop?.schemaVersion === TALENT_PROGRAM_SCHEMA_VERSION &&
      asRecord(shop.departmentSettings) && asRecord(shop.markets),
  );
};

// src/utils/talentProgram.js와 같은 규칙으로 v1/v2를 정규화한다.
export const normalizeTalentProgram = (
  talentShop: unknown,
): NormalizedTalentProgram => {
  if (!isTalentProgramV2(talentShop)) {
    const legacy = getLegacySource(talentShop);
    const enabled = legacy.enabled === true;
    return {
      schemaVersion: 1,
      legacy: true,
      enabled,
      shopEnabled: enabled,
      departmentSettings: {},
      markets: {
        [LEGACY_TALENT_MARKET_ID]: {
          id: LEGACY_TALENT_MARKET_ID,
          name: normalizeId(legacy.name) || "통합 달란트 시장",
          enabled,
          items: normalizeItems(legacy.items),
        },
      },
    };
  }

  const shop = asRecord(talentShop)!;
  const departmentSettings: NormalizedTalentProgram["departmentSettings"] = {};
  for (
    const [rawDepartmentId, rawSetting] of Object.entries(
      asRecord(shop.departmentSettings)!,
    )
  ) {
    const departmentId = normalizeId(rawDepartmentId);
    const setting = asRecord(rawSetting);
    if (!departmentId || !setting) continue;
    departmentSettings[departmentId] = {
      enabled: setting.enabled === true,
      marketId: normalizeId(setting.marketId),
    };
  }

  const markets: Record<string, NormalizedTalentMarket> = {};
  for (
    const [rawMarketId, rawMarket] of Object.entries(asRecord(shop.markets)!)
  ) {
    const market = normalizeMarket(rawMarket, rawMarketId);
    if (market) markets[market.id] = market;
  }

  return {
    schemaVersion: 2,
    legacy: false,
    enabled: Object.values(departmentSettings).some((item) => item.enabled),
    shopEnabled: shop.enabled === true,
    departmentSettings,
    markets,
  };
};

const normalizeMembership = (
  value: unknown,
): { departmentId: string } | null => {
  const membership = asRecord(value);
  const departmentId = normalizeId(membership?.departmentId);
  return departmentId ? { departmentId } : null;
};

export const getTalentMembershipDepartmentIds = (
  user: TalentMembershipUser | null | undefined,
): string[] => {
  if (!user) return [];
  const primary = normalizeMembership({ departmentId: user.departmentId });
  const extras =
    (Array.isArray(user.extraMemberships)
      ? user.extraMemberships.slice(0, 3)
      : []).flatMap((value) => {
        const membership = normalizeMembership(value);
        return membership ? [membership] : [];
      });
  return Array.from(
    new Set(
      [...(primary ? [primary] : []), ...extras].map((item) =>
        item.departmentId
      ),
    ),
  );
};

export const resolveTalentProgram = ({
  user,
  talentShop,
  departmentId = null,
}: {
  user?: TalentMembershipUser | null;
  talentShop?: unknown;
  departmentId?: unknown;
} = {}): TalentProgramResolution => {
  const program = normalizeTalentProgram(talentShop);
  const membershipDepartmentIds = getTalentMembershipDepartmentIds(user);
  const activeDepartments = program.legacy
    ? (membershipDepartmentIds.length > 0 ? membershipDepartmentIds : [null])
      .map((membershipDepartmentId) => ({
        departmentId: membershipDepartmentId,
        marketId: LEGACY_TALENT_MARKET_ID,
        marketEnabled: program.shopEnabled,
      }))
    : membershipDepartmentIds.flatMap((membershipDepartmentId) => {
      const setting = program.departmentSettings[membershipDepartmentId];
      if (!setting?.enabled || !setting.marketId) return [];
      const market = program.markets[setting.marketId];
      return market
        ? [{
          departmentId: membershipDepartmentId,
          marketId: market.id,
          marketEnabled: program.shopEnabled && market.enabled,
        }]
        : [];
    });
  const requestedDepartmentId = normalizeId(departmentId) ||
    normalizeId(user?.talentDepartmentId);
  const selectedDepartment =
    activeDepartments.find((item) =>
      item.departmentId === requestedDepartmentId
    ) || activeDepartments[0] || null;
  const selectedMarket = selectedDepartment
    ? program.markets[selectedDepartment.marketId] || null
    : null;
  const marketEnabled = Boolean(
    program.shopEnabled && selectedMarket?.enabled === true,
  );

  return {
    schemaVersion: program.schemaVersion,
    legacy: program.legacy,
    shopEnabled: program.shopEnabled,
    activeDepartments,
    selectedDepartmentId: selectedDepartment?.departmentId || null,
    selectedMarketId: selectedMarket?.id || null,
    canEarnTalent: Boolean(selectedDepartment),
    canUseMarket: Boolean(selectedDepartment && marketEnabled),
    reason: selectedDepartment
      ? (marketEnabled ? null : "MARKET_DISABLED")
      : (membershipDepartmentIds.length > 0
        ? "NO_ACTIVE_DEPARTMENT"
        : "NO_MEMBERSHIP"),
  };
};

export const resolveTalentWalletPrograms = ({
  direct,
  rosters = [],
}: {
  direct?: { user: TalentMembershipUser; talentShop: unknown } | null;
  rosters?: Array<{ user: TalentMembershipUser; talentShop: unknown }>;
}) => {
  const directCanEarnTalent = direct
    ? resolveTalentProgram(direct).canEarnTalent
    : false;
  const rosterCanEarnTalent = rosters.map((roster) =>
    resolveTalentProgram(roster).canEarnTalent
  );
  return {
    directCanEarnTalent,
    rosterCanEarnTalent,
    canEarnAny: directCanEarnTalent || rosterCanEarnTalent.some(Boolean),
  };
};
