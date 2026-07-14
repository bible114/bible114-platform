import React, { useEffect, useMemo, useState } from 'react';
import { db } from '../../utils/firebase';
import { getMembershipList } from '../../utils/memberships';
import { LEGACY_TALENT_MARKET_ID, normalizeTalentProgram, resolveTalentProgram } from '../../utils/talentProgram';
import { updateRosterTalents } from '../../utils/talentWallet';
import { isValidTalentPurchasePrice } from '../../utils/talentPurchases';
import { createRequestId, purchaseItem as purchaseItemViaApi } from '../../utils/platformApi';

const LEGACY_TALENT_DEPARTMENT_ID = 'legacy_shared';
const PURCHASE_REQUEST_STORAGE_PREFIX = 'b114_purchase_request_v1:';
const purchaseRequestFallback = new Map();

const purchaseRequestKey = ({ uid, churchId, departmentId, marketId, itemId }) => (
    `${PURCHASE_REQUEST_STORAGE_PREFIX}${[uid, churchId, departmentId, marketId, itemId]
        .map(value => encodeURIComponent(String(value || ''))).join(':')}`
);

const getOrCreatePurchaseRequestId = (key) => {
    try {
        const stored = window.sessionStorage.getItem(key);
        if (stored) {
            purchaseRequestFallback.set(key, stored);
            return stored;
        }
    } catch {
        // sessionStorage를 막는 브라우저에서도 현재 페이지 재시도는 멱등을 유지한다.
    }
    const pending = purchaseRequestFallback.get(key);
    if (pending) return pending;
    const requestId = createRequestId();
    purchaseRequestFallback.set(key, requestId);
    try {
        window.sessionStorage.setItem(key, requestId);
    } catch {
        // in-memory fallback 유지
    }
    return requestId;
};

const clearPurchaseRequestId = (key) => {
    purchaseRequestFallback.delete(key);
    try {
        window.sessionStorage.removeItem(key);
    } catch {
        // in-memory fallback은 이미 정리됨
    }
};

const statusLabel = {
    pending: '대기',
    delivered: '수령 완료',
    cancelled: '취소',
};

const statusClass = {
    pending: 'bg-amber-50 text-amber-700',
    delivered: 'bg-emerald-50 text-emerald-700',
    cancelled: 'bg-slate-100 text-slate-500',
};

const toMillis = (value) => {
    if (!value) return 0;
    if (value.toDate) return value.toDate().getTime();
    const parsed = new Date(value).getTime();
    return Number.isNaN(parsed) ? 0 : parsed;
};

const formatDate = (value) => {
    if (!value) return '-';
    const date = value.toDate ? value.toDate() : new Date(value);
    if (Number.isNaN(date.getTime())) return '-';
    return `${date.getFullYear()}. ${date.getMonth() + 1}. ${date.getDate()}.`;
};

const TalentShop = ({
    currentUser,
    setCurrentUser,
    organizations = [],
    onOrganizationChange,
    showUnlockModal,
    onCloseUnlockModal,
}) => {
    const [shop, setShop] = useState(null);
    const [loading, setLoading] = useState(true);
    const [open, setOpen] = useState(false);
    const [purchases, setPurchases] = useState([]);
    const [message, setMessage] = useState(null);
    const [buyingId, setBuyingId] = useState(null);
    const [selectedDepartmentId, setSelectedDepartmentId] = useState(null);

    useEffect(() => {
        if (!db || !currentUser?.churchId || currentUser.role === 'guest') {
            setShop(null);
            setLoading(false);
            return undefined;
        }

        let alive = true;
        setLoading(true);
        db.collection('churches').doc(currentUser.churchId).collection('settings').doc('talentShop')
            .get()
            .then(doc => {
                if (!alive) return;
                setShop(doc.exists ? doc.data() : null);
            })
            .catch(err => {
                console.error('달란트 상점 설정 로드 실패:', err);
                if (alive) setShop(null);
            })
            .finally(() => {
                if (alive) setLoading(false);
            });
        return () => { alive = false; };
    }, [currentUser?.churchId, currentUser?.role]);

    useEffect(() => {
        setPurchases([]);
        if (!db || !open || !currentUser?.uid || !currentUser?.churchId) return undefined;
        let alive = true;
        db.collection('churches').doc(currentUser.churchId).collection('talentPurchases')
            .where('uid', '==', currentUser.uid).get()
            .then(snap => {
                if (!alive) return;
                const rows = snap.docs
                    .map(doc => ({ id: doc.id, ...doc.data() }))
                    .sort((a, b) => toMillis(b.createdAt) - toMillis(a.createdAt));
                setPurchases(rows);
            })
            .catch(err => {
                console.error('달란트 구매 내역 로드 실패:', err);
                if (alive) setPurchases([]);
            });
        return () => { alive = false; };
    }, [open, currentUser?.churchId, currentUser?.uid]);

    const program = useMemo(() => normalizeTalentProgram(shop), [shop]);
    const membershipByDepartment = useMemo(() => {
        const entries = getMembershipList(currentUser).map(membership => [
            membership.departmentId,
            membership.departmentName || membership.departmentId,
        ]);
        return new Map(entries);
    }, [currentUser]);
    const baseResolution = useMemo(() => resolveTalentProgram({
        user: currentUser,
        talentShop: shop,
    }), [currentUser, shop]);
    const marketContexts = useMemo(() => {
        if (baseResolution.legacy) return [];
        const seenMarkets = new Set();
        return baseResolution.activeDepartments.flatMap(department => {
            if (!department.marketEnabled || seenMarkets.has(department.marketId)) return [];
            const resolved = resolveTalentProgram({
                user: currentUser,
                talentShop: shop,
                departmentId: department.departmentId,
            });
            if (!resolved.canUseMarket || !resolved.selectedMarket) return [];
            seenMarkets.add(department.marketId);
            return [{
                departmentId: department.departmentId,
                departmentName: membershipByDepartment.get(department.departmentId) || department.departmentId,
                marketId: resolved.selectedMarketId,
                marketName: resolved.selectedMarket.name || resolved.selectedMarketId,
            }];
        });
    }, [baseResolution, currentUser, membershipByDepartment, shop]);
    const effectiveDepartmentId = marketContexts.some(context => context.departmentId === selectedDepartmentId)
        ? selectedDepartmentId
        : marketContexts[0]?.departmentId || null;
    const selectedResolution = useMemo(() => resolveTalentProgram({
        user: currentUser,
        talentShop: shop,
        departmentId: effectiveDepartmentId,
    }), [currentUser, effectiveDepartmentId, shop]);
    const selectedMarketContext = marketContexts.find(context => context.departmentId === effectiveDepartmentId) || null;
    const enabled = baseResolution.legacy ? baseResolution.canUseMarket : marketContexts.length > 0;
    const activeItems = baseResolution.legacy
        ? baseResolution.items
        : selectedResolution.items;

    useEffect(() => {
        setSelectedDepartmentId(null);
        setMessage(null);
    }, [currentUser?.churchId]);

    useEffect(() => {
        if (baseResolution.legacy) return;
        if (effectiveDepartmentId !== selectedDepartmentId) {
            setSelectedDepartmentId(effectiveDepartmentId);
        }
    }, [baseResolution.legacy, effectiveDepartmentId, selectedDepartmentId]);

    if (loading || !enabled) return null;

    // 교회 관리자는 7일 연속 해금 없이 항상 볼 수 있다 (상품 구성·교인 화면 확인용).
    const unlocked = currentUser.secretShopUnlocked === true || currentUser.role === 'churchAdmin';
    if (!unlocked) return null;

    const buyItem = async (item) => {
        if (buyingId) return;
        // 슈퍼관리자 미리보기(fakeChurchAdmin)는 uid가 없어 구매 불가
        if (!currentUser.uid) {
            setMessage({ type: 'error', text: '미리보기 모드에서는 구매할 수 없어요.' });
            return;
        }
        const purchasePrice = Number(item?.price);
        if (!isValidTalentPurchasePrice(purchasePrice)) {
            setMessage({ type: 'error', text: '상품 가격이 올바르지 않습니다. 관리자에게 문의해주세요.' });
            return;
        }
        if ((currentUser.talent || 0) < purchasePrice) {
            setMessage({ type: 'error', text: '달란트가 부족합니다.' });
            return;
        }
        if (!baseResolution.legacy && (!selectedResolution.canUseMarket || !selectedMarketContext)) {
            setMessage({ type: 'error', text: '이 부서의 달란트 시장을 이용할 수 없습니다.' });
            return;
        }
        if (!window.confirm(`${item.name}을(를) ${purchasePrice}달란트로 구매할까요?\n\n구매한 상품은 교회에서 직접 받아요.`)) return;

        const buyingKey = baseResolution.legacy ? item.id : `${selectedResolution.selectedMarketId}:${item.id}`;
        setBuyingId(buyingKey);
        setMessage(null);
        try {
            const purchaseDepartmentId = baseResolution.legacy
                ? (baseResolution.selectedDepartmentId || LEGACY_TALENT_DEPARTMENT_ID)
                : selectedMarketContext.departmentId;
            const purchaseMarketId = baseResolution.legacy
                ? (baseResolution.selectedMarketId || LEGACY_TALENT_MARKET_ID)
                : selectedMarketContext.marketId;
            const requestKey = purchaseRequestKey({
                uid: currentUser.uid,
                churchId: currentUser.churchId,
                departmentId: purchaseDepartmentId,
                marketId: purchaseMarketId,
                itemId: item.id,
            });
            const requestId = getOrCreatePurchaseRequestId(requestKey);
            const result = await purchaseItemViaApi({
                churchId: currentUser.churchId,
                itemId: item.id,
                departmentId: purchaseDepartmentId,
                marketId: purchaseMarketId,
            }, { requestId });
            clearPurchaseRequestId(requestKey);

            if (typeof setCurrentUser === 'function') {
                setCurrentUser(prev => {
                    if (prev?.uid !== currentUser.uid) return prev;
                    if (result.walletKind === 'roster') {
                        return updateRosterTalents(prev, { [currentUser.churchId]: result.nextTalent });
                    }
                    return { ...prev, talent: result.nextTalent };
                });
            }
            setMessage({ type: 'success', text: '구매 완료! 교회에서 상품을 받아가세요.' });
            setPurchases(prev => [{
                ...result.purchase,
                uid: currentUser.uid,
                memberName: currentUser.name,
                walletKind: result.walletKind,
                walletOrgId: currentUser.churchId,
            }, ...prev]);
        } catch (e) {
            console.error('달란트 상품 구매 실패:', e);
            const purchaseDepartmentId = baseResolution.legacy
                ? (baseResolution.selectedDepartmentId || LEGACY_TALENT_DEPARTMENT_ID)
                : selectedMarketContext?.departmentId;
            const purchaseMarketId = baseResolution.legacy
                ? (baseResolution.selectedMarketId || LEGACY_TALENT_MARKET_ID)
                : selectedMarketContext?.marketId;
            const requestKey = purchaseRequestKey({
                uid: currentUser.uid,
                churchId: currentUser.churchId,
                departmentId: purchaseDepartmentId,
                marketId: purchaseMarketId,
                itemId: item.id,
            });
            const definiteClientFailure = e.status >= 400 && e.status < 500 && e.retryable !== true;
            if (definiteClientFailure) clearPurchaseRequestId(requestKey);
            const resultUnknown = !definiteClientFailure && (
                e.retryable === true || e.status >= 500 || e.code === 'TIMEOUT' || e.code === 'NETWORK_ERROR'
            );
            setMessage({
                type: 'error',
                text: resultUnknown
                    ? '구매 결과를 확인하지 못했어요. 같은 상품을 다시 누르면 중복 차감 없이 구매 결과를 다시 확인합니다.'
                    : e.code === 'CONFLICT' || e.message === '달란트가 부족합니다.'
                    ? '달란트가 부족합니다.' : (e.message || '구매 처리에 실패했습니다.'),
            });
        } finally {
            setBuyingId(null);
        }
    };

    return (
        <>
            <section className="rounded-3xl bg-gradient-to-br from-violet-950 via-violet-800 to-violet-600 p-5 text-white shadow-xl overflow-hidden relative">
                <div className="absolute right-4 top-4 text-5xl opacity-20">⭐</div>
                <p className="text-xs font-black text-amber-300 mb-1">비밀 달란트 상점</p>
                <h2 className="text-xl font-black">7일의 꾸준함으로 열린 특별한 선물</h2>
                <p className="mt-2 text-sm font-semibold text-violet-100">모은 달란트로 교회에서 직접 받을 수 있는 상품을 신청하세요.</p>
                <div className="mt-4 flex flex-wrap items-center gap-3">
                    <span className="rounded-full bg-white/10 px-4 py-2 text-sm font-black text-amber-200">⭐ {currentUser.talent || 0} 달란트</span>
                    <button
                        type="button"
                        onClick={() => setOpen(true)}
                        className="rounded-full bg-amber-300 px-5 py-2.5 text-sm font-black text-violet-950 shadow-lg"
                    >
                        상점 열기
                    </button>
                </div>
            </section>

            {showUnlockModal && (
                <div className="fixed inset-0 z-[120] flex items-center justify-center bg-slate-950/60 px-4">
                    <div className="w-full max-w-sm rounded-3xl bg-white p-6 text-center shadow-2xl">
                        <div className="text-5xl mb-3">🎉</div>
                        <h2 className="text-xl font-black text-slate-900">7일 연속 달성!</h2>
                        <p className="mt-2 text-sm font-bold text-slate-500">숨겨진 달란트 상점을 발견했어요.</p>
                        <button
                            type="button"
                            onClick={onCloseUnlockModal}
                            className="mt-5 w-full rounded-2xl bg-violet-700 px-5 py-3 text-sm font-black text-white"
                        >
                            확인
                        </button>
                    </div>
                </div>
            )}

            {open && (
                <div className="fixed inset-0 z-[115] bg-slate-950/60 px-4 py-6 overflow-y-auto">
                    <div className="mx-auto max-w-3xl overflow-hidden rounded-3xl bg-slate-50 shadow-2xl">
                        <header className="bg-gradient-to-br from-violet-950 via-violet-800 to-violet-600 px-5 py-5 text-white">
                            <div className="flex items-start justify-between gap-4">
                                <div>
                                    <p className="text-xs font-black text-amber-300">비밀 달란트 상점</p>
                                    <h2 className="mt-1 text-2xl font-black">교회에서 직접 받는 선물</h2>
                                    <p className="mt-2 text-sm font-semibold text-violet-100">구매한 상품은 교회에서 직접 받아요.</p>
                                    {!baseResolution.legacy && selectedMarketContext && (
                                        <p className="mt-2 text-xs font-black text-amber-200">
                                            {selectedMarketContext.marketName} · {selectedMarketContext.departmentName}
                                        </p>
                                    )}
                                </div>
                                <button
                                    type="button"
                                    onClick={() => setOpen(false)}
                                    className="rounded-2xl bg-white/10 px-3 py-2 text-sm font-black"
                                >
                                    닫기
                                </button>
                            </div>
                            <div className="mt-4 inline-flex rounded-full bg-white/10 px-4 py-2 text-sm font-black text-amber-200">
                                ⭐ 잔액 {currentUser.talent || 0} 달란트
                            </div>
                        </header>

                        <div className="p-5 space-y-5">
                            {organizations.length > 0 && (
                                <section className="rounded-3xl border border-violet-100 bg-white p-4 shadow-sm">
                                    <h3 className="text-sm font-black text-slate-800">공동체별 내 달란트</h3>
                                    <p className="mt-1 text-xs font-bold text-slate-400">공동체를 누르면 그곳의 상점과 잔액으로 바뀝니다.</p>
                                    <p className="mt-1 text-xs font-bold text-violet-600">★ 기준 공동체는 바뀌지 않아요.</p>
                                    <div className="mt-3 space-y-2">
                                        {organizations.map(org => {
                                            const active = org.orgId === currentUser.churchId;
                                            return (
                                                <button
                                                    key={`${org.walletType || 'roster'}:${org.orgId}`}
                                                    type="button"
                                                    disabled={active}
                                                    onClick={() => onOrganizationChange?.(org.orgId)}
                                                    className={`flex w-full items-center justify-between gap-3 rounded-2xl px-4 py-3 text-left text-sm font-black ${active ? 'bg-violet-100 text-violet-900 ring-2 ring-violet-300' : 'bg-slate-50 text-slate-700 hover:bg-violet-50'}`}
                                                >
                                                    <span className="min-w-0 truncate">{active ? '★ ' : '⛪ '}{org.name || org.orgId}</span>
                                                    <span className="shrink-0 text-amber-600">⭐ {Number(org.talent) || 0}</span>
                                                </button>
                                            );
                                        })}
                                    </div>
                                </section>
                            )}
                            {!baseResolution.legacy && marketContexts.length > 1 && (
                                <section className="rounded-3xl border border-violet-100 bg-white p-4 shadow-sm">
                                    <h3 className="text-sm font-black text-slate-800">이용할 달란트 시장</h3>
                                    <p className="mt-1 text-xs font-bold text-slate-400">소속 부서가 연결된 시장만 이용할 수 있어요.</p>
                                    <div className="mt-3 flex flex-wrap gap-2">
                                        {marketContexts.map(context => {
                                            const active = context.departmentId === effectiveDepartmentId;
                                            return (
                                                <button
                                                    key={context.marketId}
                                                    type="button"
                                                    onClick={() => {
                                                        setSelectedDepartmentId(context.departmentId);
                                                        setMessage(null);
                                                    }}
                                                    className={`rounded-full px-4 py-2 text-xs font-black ${active
                                                        ? 'bg-violet-700 text-white shadow-sm'
                                                        : 'bg-violet-50 text-violet-700 hover:bg-violet-100'}`}
                                                >
                                                    {context.marketName}
                                                </button>
                                            );
                                        })}
                                    </div>
                                </section>
                            )}
                            {message && (
                                <div className={`rounded-2xl px-4 py-3 text-sm font-bold ${message.type === 'success' ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-600'}`}>
                                    {message.text}
                                </div>
                            )}

                            {activeItems.length === 0 ? (
                                <div className="rounded-3xl bg-white p-10 text-center text-sm font-bold text-slate-400">아직 준비된 상품이 없어요.</div>
                            ) : (
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                    {activeItems.map(item => {
                                        const enough = (currentUser.talent || 0) >= item.price;
                                        const itemBuyingKey = baseResolution.legacy
                                            ? item.id
                                            : `${selectedResolution.selectedMarketId}:${item.id}`;
                                        return (
                                            <div key={itemBuyingKey} className="rounded-2xl bg-white p-4 shadow-sm border border-slate-100">
                                                <div className="flex items-start gap-3">
                                                    <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-amber-50 text-2xl">{item.emoji || '🎁'}</div>
                                                    <div className="min-w-0 flex-1">
                                                        <h3 className="font-black text-slate-800">{item.name}</h3>
                                                        <p className="mt-1 text-xs font-bold text-slate-400">{item.description || '교회에서 직접 받는 상품입니다.'}</p>
                                                    </div>
                                                </div>
                                                <div className="mt-4 flex items-center justify-between gap-3">
                                                    <span className="text-sm font-black text-amber-600">⭐ {item.price}</span>
                                                    <button
                                                        type="button"
                                                        disabled={!enough || buyingId === itemBuyingKey}
                                                        onClick={() => buyItem(item)}
                                                        className="rounded-xl bg-violet-700 px-4 py-2 text-xs font-black text-white disabled:bg-slate-200 disabled:text-slate-400"
                                                    >
                                                        {enough ? (buyingId === itemBuyingKey ? '처리 중...' : '구매') : '달란트 부족'}
                                                    </button>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            )}

                            <section className="rounded-3xl bg-white p-4 shadow-sm border border-slate-100">
                                <div className="mb-3 flex items-center justify-between">
                                    <h3 className="text-sm font-black text-slate-800">내 구매 내역</h3>
                                    <span className="text-xs font-bold text-slate-400">{purchases.length}건</span>
                                </div>
                                {purchases.length === 0 ? (
                                    <p className="py-8 text-center text-xs font-bold text-slate-300">아직 구매 내역이 없습니다.</p>
                                ) : (
                                    <div className="divide-y divide-slate-100">
                                        {purchases.map(purchase => {
                                            const purchaseMarketName = program.markets?.[purchase.marketId]?.name || purchase.marketId;
                                            const purchaseContext = [purchaseMarketName, purchase.departmentName]
                                                .filter(Boolean)
                                                .filter((value, index, values) => values.indexOf(value) === index)
                                                .join(' · ');
                                            return (
                                                <div key={purchase.id} className="flex items-center justify-between gap-3 py-3">
                                                    <div className="min-w-0">
                                                        <p className="truncate text-sm font-black text-slate-700">{purchase.itemName}</p>
                                                        <p className="text-xs font-bold text-slate-400">⭐ {purchase.price} · {formatDate(purchase.createdAt)}</p>
                                                        {purchase.schemaVersion === 2 && purchaseContext && (
                                                            <p className="mt-1 truncate text-[11px] font-bold text-violet-500">{purchaseContext}</p>
                                                        )}
                                                    </div>
                                                    <span className={`shrink-0 rounded-full px-3 py-1 text-xs font-black ${statusClass[purchase.status] || statusClass.pending}`}>
                                                        {statusLabel[purchase.status] || purchase.status}
                                                    </span>
                                                </div>
                                            );
                                        })}
                                    </div>
                                )}
                            </section>
                        </div>
                    </div>
                </div>
            )}
        </>
    );
};

export default TalentShop;
