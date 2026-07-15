const VALID_WALLET_KINDS = new Set(['user', 'roster']);

export const isValidTalentPurchasePrice = value => (
    typeof value === 'number' && Number.isSafeInteger(value)
    && value > 0 && value <= 1_000_000
);

const toMillis = value => {
    if (typeof value?.toMillis === 'function') return value.toMillis();
    const raw = typeof value?.toDate === 'function' ? value.toDate() : value;
    const millis = new Date(raw || 0).getTime();
    return Number.isNaN(millis) ? 0 : millis;
};

// pending 문서는 제한 없이, 완료/취소 이력은 최근 조회 결과만 합친다.
// 구매자가 현재 명부에서 사라졌더라도 환불/수령 처리를 위해 행을 보존한다.
export const mergeAdminTalentPurchases = ({ pendingDocs = [], recentDocs = [], externalMemberIds = [] } = {}) => {
    const externalIds = externalMemberIds instanceof Set
        ? externalMemberIds
        : new Set(externalMemberIds);
    const purchaseById = new Map();
    [...pendingDocs, ...recentDocs].forEach(doc => {
        if (!doc?.id || typeof doc.data !== 'function') return;
        const data = doc.data() || {};
        purchaseById.set(doc.id, {
            id: doc.id,
            ...data,
            isExternalBuyer: externalIds.has(data.uid),
        });
    });
    return [...purchaseById.values()]
        .sort((left, right) => toMillis(right.createdAt) - toMillis(left.createdAt));
};

// v2는 구매 당시 스냅샷만 신뢰한다. 스냅샷이 없는 레거시 건에 한해
// 관리자가 명시적으로 고른 지갑을 허용하며 현재 소속으로 자동 추론하지 않는다.
export const resolvePurchaseRefundWalletKind = (purchase, legacyWalletKind = null) => {
    if (VALID_WALLET_KINDS.has(purchase?.walletKind)) return purchase.walletKind;
    if (purchase?.schemaVersion === 2) return null;
    return VALID_WALLET_KINDS.has(legacyWalletKind) ? legacyWalletKind : null;
};

export const hasValidV2RefundWalletSnapshot = (purchase, expectedOrgId = null) => {
    if (purchase?.schemaVersion !== 2 || !VALID_WALLET_KINDS.has(purchase?.walletKind)) return false;
    const walletOrgId = typeof purchase.walletOrgId === 'string' ? purchase.walletOrgId.trim() : '';
    if (!walletOrgId) return false;
    return !expectedOrgId || walletOrgId === expectedOrgId;
};
