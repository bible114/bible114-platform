import { getMembershipList } from './memberships.js';

export const TALENT_PROGRAM_SCHEMA_VERSION = 2;
export const LEGACY_TALENT_MARKET_ID = 'shared';

const normalizeId = value => {
    if (typeof value !== 'string') return null;
    const normalized = value.trim();
    return normalized || null;
};

const normalizeItems = items => (Array.isArray(items) ? items : [])
    .filter(item => item && typeof item === 'object' && !Array.isArray(item))
    .map(item => ({ ...item }));

const normalizeMarket = (market, fallbackId) => {
    if (!market || typeof market !== 'object' || Array.isArray(market)) return null;
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

const getLegacySource = talentShop => {
    if (!talentShop || typeof talentShop !== 'object' || Array.isArray(talentShop)) return {};
    if (
        talentShop.schemaVersion === TALENT_PROGRAM_SCHEMA_VERSION
        && talentShop.legacy
        && typeof talentShop.legacy === 'object'
        && !Array.isArray(talentShop.legacy)
    ) return talentShop.legacy;
    return talentShop;
};

export const isTalentProgramV2 = talentShop => (
    talentShop?.schemaVersion === TALENT_PROGRAM_SCHEMA_VERSION
    && talentShop?.departmentSettings
    && typeof talentShop.departmentSettings === 'object'
    && !Array.isArray(talentShop.departmentSettings)
    && talentShop?.markets
    && typeof talentShop.markets === 'object'
    && !Array.isArray(talentShop.markets)
);

// 화면과 보상 로직이 같은 해석을 사용하도록 v1/v2를 하나의 형태로 정규화한다.
// v1의 enabled/items는 모든 소속 부서가 쓰는 shared 시장으로 취급한다.
export const normalizeTalentProgram = talentShop => {
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
                    name: normalizeId(legacy.name) || '통합 달란트 시장',
                    enabled,
                    items: normalizeItems(legacy.items),
                },
            },
        };
    }

    const departmentSettings = {};
    Object.entries(talentShop.departmentSettings).forEach(([rawDepartmentId, rawSetting]) => {
        const departmentId = normalizeId(rawDepartmentId);
        if (!departmentId || !rawSetting || typeof rawSetting !== 'object' || Array.isArray(rawSetting)) return;
        departmentSettings[departmentId] = {
            enabled: rawSetting.enabled === true,
            marketId: normalizeId(rawSetting.marketId),
        };
    });

    const markets = {};
    Object.entries(talentShop.markets).forEach(([rawMarketId, rawMarket]) => {
        const market = normalizeMarket(rawMarket, rawMarketId);
        if (market) markets[market.id] = market;
    });

    return {
        schemaVersion: TALENT_PROGRAM_SCHEMA_VERSION,
        legacy: false,
        enabled: Object.values(departmentSettings).some(setting => setting.enabled === true),
        shopEnabled: talentShop.enabled === true,
        departmentSettings,
        markets,
    };
};

export const getTalentMembershipDepartmentIds = user => Array.from(new Set(
    getMembershipList(user)
        .map(membership => normalizeId(membership.departmentId))
        .filter(Boolean)
));

export const getActiveTalentDepartments = (user, talentShop) => {
    const program = normalizeTalentProgram(talentShop);
    const membershipDepartmentIds = getTalentMembershipDepartmentIds(user);
    if (program.legacy) {
        // 구버전의 enabled는 상점 표시 여부였고 적립 여부가 아니었다.
        // 부서가 없는 오래된 계정도 기존처럼 적립되도록 가상 shared context를 준다.
        const legacyDepartmentIds = membershipDepartmentIds.length > 0 ? membershipDepartmentIds : [null];
        return legacyDepartmentIds.map(departmentId => ({
                departmentId,
                marketId: LEGACY_TALENT_MARKET_ID,
                marketEnabled: program.shopEnabled,
            }));
    }

    return membershipDepartmentIds.flatMap(departmentId => {
        const setting = program.departmentSettings[departmentId];
        if (!setting?.enabled || !setting.marketId) return [];
        const market = program.markets[setting.marketId];
        if (!market) return [];
        return [{
            departmentId,
            marketId: market.id,
            marketEnabled: program.shopEnabled && market.enabled === true,
        }];
    });
};

export const getTalentMarketItems = (talentShop, marketId, { includeInactive = false } = {}) => {
    const program = normalizeTalentProgram(talentShop);
    const normalizedMarketId = normalizeId(marketId);
    const market = normalizedMarketId ? program.markets[normalizedMarketId] : null;
    if (!market) return [];
    return market.items
        .filter(item => includeInactive || item.active !== false)
        .map(item => ({ ...item }));
};

// 한 공동체 안에서 달란트를 적립하고 사용할 대표 부서를 하나만 선택한다.
// 명시 선택 → user.talentDepartmentId → 주/추가 소속 순서의 첫 활성 부서 순이다.
export const resolveTalentProgram = ({ user, talentShop, departmentId = null } = {}) => {
    const program = normalizeTalentProgram(talentShop);
    const activeDepartments = getActiveTalentDepartments(user, talentShop);
    const requestedDepartmentId = normalizeId(departmentId) || normalizeId(user?.talentDepartmentId);
    const selectedDepartment = activeDepartments.find(item => item.departmentId === requestedDepartmentId)
        || activeDepartments[0]
        || null;
    const selectedMarket = selectedDepartment
        ? program.markets[selectedDepartment.marketId] || null
        : null;
    const marketEnabled = program.shopEnabled && selectedMarket?.enabled === true;

    return {
        schemaVersion: program.schemaVersion,
        legacy: program.legacy,
        shopEnabled: program.shopEnabled,
        activeDepartments,
        selectedDepartmentId: selectedDepartment?.departmentId || null,
        selectedMarketId: selectedMarket?.id || null,
        selectedMarket: selectedMarket ? { ...selectedMarket, items: selectedMarket.items.map(item => ({ ...item })) } : null,
        items: marketEnabled
            ? getTalentMarketItems(talentShop, selectedMarket.id)
            : [],
        canEarnTalent: Boolean(selectedDepartment),
        canUseMarket: Boolean(selectedDepartment && marketEnabled),
        reason: selectedDepartment
            ? (marketEnabled ? null : 'MARKET_DISABLED')
            : (getTalentMembershipDepartmentIds(user).length > 0 ? 'NO_ACTIVE_DEPARTMENT' : 'NO_MEMBERSHIP'),
    };
};

export const canEarnTalent = options => resolveTalentProgram(options).canEarnTalent;
