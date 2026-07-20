import React from 'react';
import Icon from '../Icon';
import { getMembershipList } from '../../utils/memberships';

const sameMembership = (left, right) => {
    if (!left || !right || left.departmentId !== right.departmentId) return false;
    if (left.subgroupId === right.subgroupId) return true;
    // legacy subgroupId=name 호환. modern group끼리는 name-name만으로 같다고 보지 않는다.
    return Boolean(
        (left.subgroupId && right.subgroupName && left.subgroupId === right.subgroupName)
        || (right.subgroupId && left.subgroupName && right.subgroupId === left.subgroupName)
    );
};

const DashboardHeader = ({
    handleLogout,
    streak,
    talent,
    setShowAchievements,
    setShowDateSettings,
    setShowCalendar,
    setShowReadingGuide,
    setShowAccountHelp = () => {},
    getEncouragementMessage,
    departmentName,
    setShowFullRanking,
    topProgressGroups,
    departmentId,
    subgroupId,
    extraMemberships = [],
    // 새로운 props
    planTypeName,
    versionName,
    handleChangeVersionStart,
    setView,
    isChurchAdmin,
    hasCommunity = true,
    personalOrganizations = [],
    primaryOrgId,
    onPrimaryOrgChange,
    onOpenMemberships,
    currentOrganizationName,
}) => {
    const primaryMembership = { departmentId, departmentName, subgroupId, subgroupName: null };
    const normalizedExtraMemberships = getMembershipList({ extraMemberships })
        .filter(membership => !sameMembership(membership, primaryMembership));

    return (
        <header className="space-y-3 mb-4">
            {/* 자주 확인하는 정보만 남기고, 조작 메뉴는 한곳에 모은다. */}
            <div className="bg-white/95 backdrop-blur-md border-b border-slate-200/60 shadow-sm">
                <div className="mx-auto grid w-full max-w-5xl grid-cols-[minmax(0,1fr)_auto] items-center gap-2 px-4 py-2 md:flex md:gap-3">
                    <button
                        id="tut-version-btn"
                        onClick={handleChangeVersionStart}
                        className="group flex min-h-11 min-w-0 items-center gap-2 rounded-full bg-slate-100/80 px-3 py-2 transition-colors hover:bg-slate-200 md:shrink-0"
                    >
                        <span className="hidden text-[11px] font-bold tracking-tight text-slate-500 sm:inline">읽는 버전</span>
                        <div className="flex min-w-0 items-center gap-1.5">
                            <span className="truncate text-xs font-bold text-slate-700">{planTypeName}</span>
                            <span className="w-px h-2.5 bg-slate-300"></span>
                            <span className="truncate text-xs font-bold text-blue-600">{versionName}</span>
                            <Icon name="refresh" size={10} className="text-slate-400 group-hover:rotate-180 transition-transform duration-500" />
                        </div>
                    </button>

                    <div className="col-span-2 row-start-2 flex min-w-0 items-center gap-1.5 md:col-auto md:row-auto md:ml-auto">
                        <div id="tut-streak" className={`flex shrink-0 items-center gap-1 rounded-xl px-2.5 py-1.5 text-xs font-bold ${streak > 0 ? 'border border-orange-100 bg-orange-50 text-orange-600' : 'bg-slate-100 text-slate-400'}`}>
                            <Icon name="flame" size={12} />{streak}일
                        </div>
                        {talent !== undefined && (
                            <div className="truncate rounded-xl border border-orange-100 bg-orange-50 px-2.5 py-1.5 text-xs font-bold text-orange-600" title="성경 읽기로 모은 달란트">
                                ⭐ {talent || 0} 달란트
                            </div>
                        )}
                    </div>

                    <details className="relative col-start-2 row-start-1 shrink-0 md:col-auto md:row-auto">
                        <summary className="flex min-h-11 cursor-pointer list-none items-center gap-1.5 rounded-xl border border-slate-200 bg-slate-800 px-3 py-2 text-sm font-black text-white hover:bg-slate-700 [&::-webkit-details-marker]:hidden">
                            ☰ <span>메뉴</span> <span aria-hidden="true" className="text-[10px]">▾</span>
                        </summary>
                        <div className="absolute right-0 top-full z-50 mt-2 w-64 rounded-2xl border border-slate-200 bg-white p-2 shadow-2xl">
                            {onOpenMemberships && <button type="button" onClick={(e) => { e.currentTarget.closest('details')?.removeAttribute('open'); onOpenMemberships(); }} className="flex min-h-11 w-full items-center gap-2 rounded-xl px-3 text-left text-sm font-bold text-slate-700 hover:bg-slate-50"><span>⛪</span><span className="min-w-0 flex-1 truncate">{currentOrganizationName || '내 단체 관리'}</span></button>}
                            <button id="tut-achievements" type="button" onClick={(e) => { e.currentTarget.closest('details')?.removeAttribute('open'); setShowAchievements(true); }} className="flex min-h-11 w-full items-center gap-2 rounded-xl px-3 text-left text-sm font-bold text-slate-700 hover:bg-yellow-50">🏅 나의 업적·기록</button>
                            <button type="button" onClick={(e) => { e.currentTarget.closest('details')?.removeAttribute('open'); setShowCalendar(true); }} className="flex min-h-11 w-full items-center gap-2 rounded-xl px-3 text-left text-sm font-bold text-slate-700 hover:bg-green-50">📆 읽기 달력</button>
                            <button id="tut-date-settings" type="button" onClick={(e) => { e.currentTarget.closest('details')?.removeAttribute('open'); setShowDateSettings(true); }} className="flex min-h-11 w-full items-center gap-2 rounded-xl px-3 text-left text-sm font-bold text-slate-700 hover:bg-purple-50">⚙️ 읽기 날짜 설정</button>
                            <button type="button" onClick={(e) => { e.currentTarget.closest('details')?.removeAttribute('open'); setShowReadingGuide(true); }} className="flex min-h-11 w-full items-center gap-2 rounded-xl px-3 text-left text-sm font-bold text-slate-700 hover:bg-blue-50"><Icon name="helpbook" size={15} /> 읽는 방법·FAQ</button>
                            <button type="button" onClick={(e) => { e.currentTarget.closest('details')?.removeAttribute('open'); setShowAccountHelp(true); }} className="flex min-h-11 w-full items-center gap-2 rounded-xl px-3 text-left text-sm font-bold text-slate-700 hover:bg-emerald-50">📱 로그인·홈 화면 안내</button>
                            {isChurchAdmin && <button type="button" onClick={(e) => { e.currentTarget.closest('details')?.removeAttribute('open'); setView('church_admin'); }} className="flex min-h-11 w-full items-center gap-2 rounded-xl px-3 text-left text-sm font-bold text-indigo-700 hover:bg-indigo-50">⚙️ 공동체 관리</button>}
                            <div className="my-1 h-px bg-slate-100"></div>
                            <button type="button" onClick={handleLogout} className="flex min-h-11 w-full items-center gap-2 rounded-xl px-3 text-left text-sm font-bold text-red-600 hover:bg-red-50">↪ 로그아웃</button>
                        </div>
                    </details>
                </div>
            </div>

            {/* 랭킹은 핵심 요약만 노출하고, 상세는 전체보기에서 확인한다. */}
            {hasCommunity && <div className="px-4 w-full max-w-5xl mx-auto">
                <div className="flex items-center gap-3 rounded-2xl border border-slate-100 bg-white px-4 py-3 shadow-sm">
                    <div className="min-w-0 flex-1">
                        <p className="truncate text-xs font-bold text-blue-600">{getEncouragementMessage()}</p>
                        <div className="mt-1 flex min-w-0 items-center gap-2">
                            <span className="truncate text-sm font-black text-slate-800">🏆 {departmentName || '미배정'}</span>
                            {topProgressGroups[0] && <span className="hidden truncate text-xs font-bold text-slate-500 sm:inline">현재 1위 {topProgressGroups[0].name} · {topProgressGroups[0].progressRate}%</span>}
                            {normalizedExtraMemberships.length > 0 && <span className="shrink-0 rounded-full bg-slate-100 px-2 py-1 text-[10px] font-bold text-slate-500">+{normalizedExtraMemberships.length}개 소속</span>}
                        </div>
                    </div>
                    <button onClick={() => setShowFullRanking(true)} className="flex min-h-11 shrink-0 items-center gap-1 rounded-xl bg-slate-50 px-3 py-2 text-xs font-bold text-blue-600 hover:bg-blue-50">
                        전체 랭킹 <Icon name="right" size={10} />
                    </button>
                </div>
            </div>}
        </header>
    );
};

export default DashboardHeader;
