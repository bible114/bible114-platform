import TalentShop from '../dashboard/TalentShop';

const SHOP_EMOJI_GROUPS = [
    { label: '간식·음료', emojis: ['☕', '🧃', '🥤', '🍞', '🍪', '🍫', '🍬', '🍭', '🍩', '🧁', '🍦', '🍎', '🍌', '🍊', '🍕', '🍗'] },
    { label: '장난감·놀이', emojis: ['🧸', '🚗', '🚂', '🤖', '🪀', '🪁', '🎨', '🖍️', '⚽', '🏀', '🎲', '🧩', '🎮', '👑', '🦖', '🎈'] },
    { label: '학용품', emojis: ['✏️', '🖊️', '📓', '📔', '📒', '🎒', '📐', '✂️', '📎', '🗂️', '🖌️', '📖'] },
    { label: '생필품', emojis: ['🧴', '🧻', '🧼', '🪥', '🧦', '🧤', '🧣', '🌂', '🥫', '🍚', '🧂', '🧺', '💊', '🩹', '👓', '🪮'] },
    { label: '특별 선물', emojis: ['🎁', '⭐', '💝', '💐', '🌹', '🌿', '🕯️', '📿', '🎫', '🏆'] },
];

const TalentShopTab = ({ ctx }) => {
    const {
        talentShop, toggleTalentShopEnabled, savingTalentShop,
        orgComms, talentMarketId, setTalentMarketId, activeTalentMarket, activeShopItems,
        setDepartmentTalentEnabled, setDepartmentTalentMarketMode,
        setShowShopPreview, showShopPreview, currentUser, setCurrentUser, shopPreviewTalent,
        shopItemDraft, setShopItemDraft, editingShopItemId, emojiGroupIdx, setEmojiGroupIdx,
        submitShopItem, resetShopItemDraft, editShopItem, deleteShopItem, printShopItems,
        deductForm, setDeductForm, members, requestManualDeduct, deducting,
        purchaseFilter, setPurchaseFilter, filteredPurchases, memberById,
        formatAnyDate, setConfirmAction, requestPurchaseRefund, deliverPurchase, refundPurchase,
    } = ctx;

    return (
                            <div className="space-y-5">
                                <div className="rounded-2xl border border-violet-100 bg-white p-5 shadow-sm">
                                    <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                                        <div>
                                            <h2 className="text-lg font-black text-slate-800">⭐ 달란트 상점</h2>
                                            <p className="mt-1 text-xs font-bold text-slate-400">
                                                끄면 교인에게 상점이 전혀 보이지 않아요. 언제든 다시 켤 수 있습니다.
                                            </p>
                                        </div>
                                        <div className="flex items-center gap-4">
                                            <button
                                                type="button"
                                                onClick={printShopItems}
                                                className="rounded-xl border border-violet-200 bg-white px-4 py-2 text-sm font-black text-violet-700 hover:bg-violet-50">
                                                🖨️ 상품 목록 인쇄
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => setShowShopPreview(true)}
                                                disabled={talentShop.enabled !== true}
                                                title={talentShop.enabled !== true ? '상점을 켜야 미리볼 수 있어요' : ''}
                                                className="rounded-xl bg-violet-600 px-4 py-2 text-sm font-black text-white hover:bg-violet-700 disabled:opacity-40">
                                                👀 교인 화면 미리보기
                                            </button>
                                            <label className="inline-flex cursor-pointer items-center gap-3">
                                                <span className="text-sm font-black text-slate-600">{talentShop.enabled ? '사용 중' : '꺼짐'}</span>
                                                <input
                                                    type="checkbox"
                                                    checked={talentShop.enabled === true}
                                                    onChange={e => toggleTalentShopEnabled(e.target.checked)}
                                                    disabled={savingTalentShop}
                                                    className="h-5 w-5 rounded border-slate-300"
                                                />
                                            </label>
                                        </div>
                                    </div>
                                </div>

                                <div className="rounded-2xl border border-blue-100 bg-white p-5 shadow-sm">
                                    <div>
                                        <h3 className="text-sm font-black text-slate-800">부서별 달란트 운영</h3>
                                        <p className="mt-1 text-xs font-bold leading-relaxed text-slate-400">
                                            달란트를 쓰는 부서만 켜세요. 같은 시장을 선택하면 상품을 통합 관리하고, 부서 전용 시장을 선택하면 상품을 따로 관리합니다. 달란트 잔액은 공동체 안에서 하나로 유지됩니다.
                                        </p>
                                    </div>
                                    <div className="mt-4 space-y-2">
                                        {orgComms.map(department => {
                                            const setting = talentShop.departmentSettings?.[department.id] || { enabled: false, marketId: 'shared' };
                                            const separate = setting.marketId === `department_${department.id}`;
                                            return (
                                                <div key={department.id} className="grid gap-3 rounded-xl border border-slate-100 bg-slate-50 p-3 sm:grid-cols-[1fr_auto_11rem] sm:items-center">
                                                    <div>
                                                        <p className="text-sm font-black text-slate-700">{department.name}</p>
                                                        <p className="text-[11px] font-bold text-slate-400">{setting.enabled ? '읽기·퀴즈 달란트 적립' : '달란트 미사용'}</p>
                                                    </div>
                                                    <label className="inline-flex items-center gap-2 text-xs font-black text-slate-600">
                                                        <input type="checkbox" checked={setting.enabled === true} disabled={savingTalentShop} onChange={event => setDepartmentTalentEnabled(department.id, event.target.checked)} />
                                                        {setting.enabled ? '사용' : '미사용'}
                                                    </label>
                                                    <select
                                                        value={separate ? 'department' : 'shared'}
                                                        disabled={!setting.enabled || savingTalentShop}
                                                        onChange={event => setDepartmentTalentMarketMode(department.id, event.target.value)}
                                                        className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-black text-slate-700 disabled:opacity-40"
                                                    >
                                                        <option value="shared">공동체 통합 시장</option>
                                                        <option value="department">이 부서 전용 시장</option>
                                                    </select>
                                                </div>
                                            );
                                        })}
                                        {orgComms.length === 0 && <p className="rounded-xl bg-slate-50 px-4 py-4 text-xs font-bold text-slate-400">조직 탭에서 부서를 먼저 만들어주세요.</p>}
                                    </div>
                                </div>

                                <div className="rounded-2xl border border-violet-100 bg-white p-4 shadow-sm">
                                    <p className="text-xs font-black text-slate-500">관리할 시장 선택</p>
                                    <div className="mt-2 flex flex-wrap gap-2">
                                        {Object.values(talentShop.markets || {}).map(market => (
                                            <button
                                                key={market.id}
                                                type="button"
                                                onClick={() => setTalentMarketId(market.id)}
                                                className={`rounded-full px-4 py-2 text-xs font-black ${talentMarketId === market.id ? 'bg-violet-700 text-white' : 'bg-violet-50 text-violet-700'}`}
                                            >
                                                {market.name || market.id} · 상품 {(market.items || []).length}개
                                            </button>
                                        ))}
                                    </div>
                                    <p className="mt-2 text-[11px] font-bold text-slate-400">현재 편집: {activeTalentMarket?.name || '시장을 선택해주세요'}</p>
                                </div>

                                {showShopPreview && (
                                    <div className="fixed inset-0 z-50 overflow-y-auto bg-black/60"
                                        onClick={e => { if (e.target === e.currentTarget) setShowShopPreview(false); }}>
                                        <div className="mx-auto my-8 w-full max-w-md px-4">
                                            <div className="mb-3 flex items-center justify-between">
                                                <span className="text-xs font-black text-white">👀 교인에게 보이는 화면 미리보기</span>
                                                <button
                                                    type="button"
                                                    onClick={() => setShowShopPreview(false)}
                                                    className="rounded-lg bg-white px-3 py-1.5 text-xs font-black text-slate-700 hover:bg-slate-100">
                                                    ✕ 닫기
                                                </button>
                                            </div>
                                            <div className="rounded-2xl bg-slate-100 p-4">
                                                <TalentShop
                                                    currentUser={{
                                                        ...currentUser,
                                                        uid: null,
                                                        name: '미리보기 성도',
                                                        talent: shopPreviewTalent,
                                                        departmentId: Object.entries(talentShop.departmentSettings || {}).find(([, setting]) => setting?.enabled && setting.marketId === talentMarketId)?.[0] || null,
                                                    }}
                                                    setCurrentUser={() => {}}
                                                    showUnlockModal={false}
                                                    onCloseUnlockModal={() => {}}
                                                />
                                            </div>
                                        </div>
                                    </div>
                                )}

                                {/* 창구 판매 — 앱 사용이 어려운 어르신을 위한 관리자 직접 차감 */}
                                <div className="rounded-2xl border border-amber-200 bg-amber-50 p-5 shadow-sm">
                                    <h3 className="text-sm font-black text-slate-800">🧾 창구 판매 — 관리자가 직접 차감</h3>
                                    <p className="mt-1 mb-4 text-xs font-bold text-amber-700">
                                        앱 사용이 어려운 어르신은 관리자에게 말씀만 하시면 돼요. 구입 물품을 기록해야 차감할 수 있습니다.
                                    </p>
                                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-[1.1fr_1.3fr_0.7fr_auto]">
                                        <select
                                            value={deductForm.uid}
                                            onChange={e => setDeductForm(prev => ({ ...prev, uid: e.target.value }))}
                                            className="rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-bold text-slate-700">
                                            <option value="">교인 선택</option>
                                            {[...members].sort((a, b) => (a.name || '').localeCompare(b.name || '', 'ko-KR')).map(m => (
                                                <option key={m.uid} value={m.uid}>{m.name} (⭐{m.talent || 0})</option>
                                            ))}
                                        </select>
                                        <input
                                            value={deductForm.itemName}
                                            onChange={e => setDeductForm(prev => ({ ...prev, itemName: e.target.value }))}
                                            placeholder="구입 물품 (필수, 예: 세탁세제)"
                                            className="rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-bold text-slate-700"
                                        />
                                        <input
                                            type="number"
                                            min="1"
                                            value={deductForm.price}
                                            onChange={e => setDeductForm(prev => ({ ...prev, price: e.target.value }))}
                                            placeholder="달란트"
                                            className="rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-bold text-slate-700"
                                        />
                                        <button
                                            type="button"
                                            onClick={requestManualDeduct}
                                            disabled={deducting}
                                            className="rounded-xl bg-amber-600 px-5 py-2.5 text-sm font-black text-white hover:bg-amber-700 disabled:opacity-50">
                                            {deducting ? '처리 중...' : '차감하기'}
                                        </button>
                                    </div>
                                    {activeShopItems.filter(i => i && i.active !== false).length > 0 && (
                                        <div className="mt-3">
                                            <p className="mb-1.5 text-[11px] font-bold text-amber-700/70">상품 빠른 선택 (물품·가격 자동 입력)</p>
                                            <div className="flex flex-wrap gap-2">
                                                {activeShopItems.filter(i => i && i.active !== false).map(item => (
                                                    <button
                                                        key={item.id}
                                                        type="button"
                                                        onClick={() => setDeductForm(prev => ({ ...prev, itemName: item.name, price: String(item.price) }))}
                                                        className="rounded-full border border-amber-300 bg-white px-3 py-1.5 text-xs font-bold text-slate-600 hover:bg-amber-100">
                                                        {item.emoji} {item.name} ⭐{item.price}
                                                    </button>
                                                ))}
                                            </div>
                                        </div>
                                    )}
                                </div>

                                <div className="grid grid-cols-1 lg:grid-cols-[0.85fr_1.15fr] gap-4">
                                    <div className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
                                        <h3 className="text-sm font-black text-slate-800 mb-4">{editingShopItemId ? '상품 수정' : '상품 추가'}</h3>
                                        <div className="space-y-3">
                                            <div>
                                                <p className="mb-2 text-xs font-black text-slate-500">이모지</p>
                                                <div className="mb-2 flex flex-wrap gap-1.5">
                                                    {SHOP_EMOJI_GROUPS.map((group, idx) => (
                                                        <button
                                                            key={group.label}
                                                            type="button"
                                                            onClick={() => setEmojiGroupIdx(idx)}
                                                            className={`rounded-full px-3 py-1.5 text-xs font-bold transition-colors ${emojiGroupIdx === idx
                                                                ? 'bg-violet-600 text-white'
                                                                : 'bg-slate-100 text-slate-500 hover:bg-slate-200'}`}
                                                        >
                                                            {group.emojis[0]} {group.label}
                                                        </button>
                                                    ))}
                                                </div>
                                                <div className="flex flex-wrap gap-2">
                                                    {SHOP_EMOJI_GROUPS[emojiGroupIdx].emojis.map(emoji => (
                                                        <button
                                                            key={emoji}
                                                            type="button"
                                                            onClick={() => setShopItemDraft(prev => ({ ...prev, emoji }))}
                                                            className={`h-10 w-10 rounded-xl border text-lg ${shopItemDraft.emoji === emoji ? 'border-violet-400 bg-violet-50' : 'border-slate-100 bg-slate-50'}`}
                                                        >
                                                            {emoji}
                                                        </button>
                                                    ))}
                                                </div>
                                            </div>
                                            <input
                                                type="text"
                                                value={shopItemDraft.name}
                                                onChange={e => setShopItemDraft(prev => ({ ...prev, name: e.target.value }))}
                                                placeholder="상품 이름"
                                                className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm font-bold"
                                            />
                                            <input
                                                type="number"
                                                min="1"
                                                value={shopItemDraft.price}
                                                onChange={e => setShopItemDraft(prev => ({ ...prev, price: e.target.value }))}
                                                placeholder="가격"
                                                className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm font-bold"
                                            />
                                            <textarea
                                                value={shopItemDraft.description}
                                                onChange={e => setShopItemDraft(prev => ({ ...prev, description: e.target.value }))}
                                                placeholder="설명"
                                                rows={3}
                                                className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm font-bold resize-none"
                                            />
                                            <label className="flex items-center gap-2 text-sm font-bold text-slate-600">
                                                <input
                                                    type="checkbox"
                                                    checked={shopItemDraft.active !== false}
                                                    onChange={e => setShopItemDraft(prev => ({ ...prev, active: e.target.checked }))}
                                                />
                                                판매중
                                            </label>
                                            <div className="flex gap-2">
                                                <button
                                                    type="button"
                                                    onClick={submitShopItem}
                                                    disabled={savingTalentShop}
                                                    className="flex-1 rounded-xl bg-violet-700 px-4 py-3 text-sm font-black text-white disabled:opacity-50"
                                                >
                                                    {editingShopItemId ? '수정 저장' : '상품 추가'}
                                                </button>
                                                {editingShopItemId && (
                                                    <button
                                                        type="button"
                                                        onClick={resetShopItemDraft}
                                                        className="rounded-xl border border-slate-200 px-4 py-3 text-sm font-bold text-slate-500"
                                                    >
                                                        취소
                                                    </button>
                                                )}
                                            </div>
                                        </div>
                                    </div>

                                    <div className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
                                        <div className="mb-4 flex items-center justify-between">
                                            <h3 className="text-sm font-black text-slate-800">상품 목록</h3>
                                            <span className="text-xs font-bold text-slate-400">{activeShopItems.length}개</span>
                                        </div>
                                        {activeShopItems.length === 0 ? (
                                            <p className="py-10 text-center text-xs font-bold text-slate-300">아직 상품이 없습니다.</p>
                                        ) : (
                                            <div className="space-y-2">
                                                {activeShopItems.map(item => (
                                                    <div key={item.id} className="flex items-center justify-between gap-3 rounded-2xl border border-slate-100 p-3">
                                                        <div className="flex min-w-0 items-center gap-3">
                                                            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-amber-50 text-2xl">{item.emoji || '🎁'}</span>
                                                            <div className="min-w-0">
                                                                <p className="truncate text-sm font-black text-slate-800">{item.name}</p>
                                                                <p className="truncate text-xs font-bold text-slate-400">⭐ {item.price} · {item.active === false ? '판매중지' : '판매중'}</p>
                                                            </div>
                                                        </div>
                                                        <div className="flex shrink-0 gap-2">
                                                            <button type="button" onClick={() => editShopItem(item)} className="rounded-lg bg-slate-100 px-3 py-2 text-xs font-black text-slate-600">수정</button>
                                                            <button type="button" onClick={() => deleteShopItem(item)} className="rounded-lg bg-red-50 px-3 py-2 text-xs font-black text-red-500">삭제</button>
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                </div>

                                <div className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
                                    <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                                        <div>
                                            <h3 className="text-sm font-black text-slate-800">구매 내역</h3>
                                            <p className="mt-1 text-xs font-bold text-slate-400">미처리 구매는 전체, 수령·취소 이력은 최근 200건을 표시합니다.</p>
                                        </div>
                                        <select
                                            value={purchaseFilter}
                                            onChange={e => setPurchaseFilter(e.target.value)}
                                            className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-bold text-slate-700"
                                        >
                                            <option value="pending">수령 대기</option>
                                            <option value="delivered">수령 완료</option>
                                            <option value="cancelled">취소</option>
                                            <option value="all">전체</option>
                                        </select>
                                    </div>
                                    {filteredPurchases.length === 0 ? (
                                        <p className="py-10 text-center text-xs font-bold text-slate-300">표시할 구매 내역이 없습니다.</p>
                                    ) : (
                                        <div className="overflow-x-auto">
                                            <table className="min-w-full divide-y divide-slate-100">
                                                <thead className="bg-slate-50">
                                                    <tr>
                                                        <th className="px-4 py-3 text-left text-xs font-black text-slate-400">교인</th>
                                                        <th className="px-4 py-3 text-left text-xs font-black text-slate-400">시장·상품</th>
                                                        <th className="px-4 py-3 text-left text-xs font-black text-slate-400">가격</th>
                                                        <th className="px-4 py-3 text-left text-xs font-black text-slate-400">구매일</th>
                                                        <th className="px-4 py-3 text-left text-xs font-black text-slate-400">잔여</th>
                                                        <th className="px-4 py-3 text-right text-xs font-black text-slate-400">처리</th>
                                                    </tr>
                                                </thead>
                                                <tbody className="divide-y divide-slate-100">
                                                    {filteredPurchases.map(purchase => {
                                                        const buyer = memberById[purchase.uid];
                                                        return (
                                                            <tr key={purchase.id}>
                                                                <td className="px-4 py-3 text-sm font-bold text-slate-700">{purchase.memberName || buyer?.name || '-'}</td>
                                                                <td className="px-4 py-3 text-sm text-slate-600">
                                                                    <p>{purchase.itemName}</p>
                                                                    {(purchase.departmentName || purchase.departmentId || purchase.marketId) && (
                                                                        <p className="mt-0.5 text-[10px] font-bold text-violet-500">
                                                                            {purchase.departmentName || purchase.departmentId || '통합'} · {purchase.marketId || '이전 시장'}
                                                                        </p>
                                                                    )}
                                                                </td>
                                                                <td className="px-4 py-3 text-sm font-black text-amber-600">⭐ {purchase.price || 0}</td>
                                                                <td className="px-4 py-3 text-xs font-bold text-slate-400">{formatAnyDate(purchase.createdAt)}</td>
                                                                <td className="px-4 py-3 text-sm font-black text-slate-600">{buyer ? `⭐ ${buyer.talent || 0}` : '-'}</td>
                                                                <td className="px-4 py-3">
                                                                    {purchase.status === 'pending' ? (
                                                                        <div className="flex justify-end gap-2">
                                                                            <button
                                                                                type="button"
                                                                                onClick={() => setConfirmAction({
                                                                                    type: 'deliverPurchase',
                                                                                    purchase,
                                                                                    title: `${purchase.itemName} 수령 완료 처리할까요?`,
                                                                                    message: `${purchase.memberName || buyer?.name || '교인'}님에게 상품을 전달한 뒤 눌러주세요.`,
                                                                                    confirmLabel: '수령 완료',
                                                                                })}
                                                                                className="rounded-lg bg-emerald-50 px-3 py-2 text-xs font-black text-emerald-600"
                                                                            >
                                                                                수령 완료
                                                                            </button>
                                                                            <button
                                                                                type="button"
                                                                                onClick={() => requestPurchaseRefund(purchase)}
                                                                                className="rounded-lg bg-red-50 px-3 py-2 text-xs font-black text-red-500"
                                                                            >
                                                                                취소·환불
                                                                            </button>
                                                                        </div>
                                                                    ) : (
                                                                        <p className="text-right text-xs font-black text-slate-400">{purchase.status === 'delivered' ? '수령 완료' : '취소됨'}</p>
                                                                    )}
                                                                </td>
                                                            </tr>
                                                        );
                                                    })}
                                                </tbody>
                                            </table>
                                        </div>
                                    )}
                                </div>
                            </div>
    );
};

export default TalentShopTab;
