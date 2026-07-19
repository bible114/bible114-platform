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
            {/* 상단 내비게이션 바 - 통합 및 정돈 */}
            <div className="bg-white/95 backdrop-blur-md border-b border-slate-200/60 shadow-sm">
                <div className="px-4 py-2 flex flex-col md:flex-row justify-between items-center max-w-5xl mx-auto w-full gap-2.5 md:gap-4">
                    {/* 상단: 사용자 상태 및 로그아웃 (모바일에서 먼저보이고 좌우 꽉차게) */}
                    <div className="flex flex-wrap items-center gap-1.5 w-full py-1 md:order-2 md:ml-auto md:w-auto md:flex-nowrap md:justify-end">
                            <div id="tut-streak" className={`text-xs font-bold px-2.5 py-1.5 rounded-xl flex items-center gap-1 shrink-0 ${streak > 0 ? 'bg-orange-50 text-orange-600 border border-orange-100' : 'bg-slate-100 text-slate-400'}`}>
                                <Icon name="flame" size={12} />{streak}일
                            </div>
                            {talent !== undefined && (
                                <div className="text-xs font-bold text-orange-600 bg-orange-50 border border-orange-100 px-2.5 py-1.5 rounded-xl shrink-0" title="성경 읽기로 모은 달란트">
                                    ⭐ {talent || 0} 달란트
                                </div>
                            )}
                            {isChurchAdmin && (
                                <button type="button" onClick={(e) => { e.stopPropagation(); setView('church_admin'); }} className="flex min-h-11 shrink-0 items-center gap-1 rounded-xl border border-indigo-100 bg-indigo-50 px-3 py-2 text-xs font-bold text-indigo-600 hover:bg-indigo-100" title="공동체 관리">⚙️ <span>관리</span></button>
                            )}
                            <button id="tut-achievements" type="button" aria-label="나의 업적과 기록" onClick={(e) => { e.stopPropagation(); setShowAchievements(true); }} className="min-h-11 min-w-11 p-2 text-xs font-bold text-yellow-600 bg-yellow-50 border border-yellow-100 rounded-xl hover:bg-yellow-100 shrink-0">🏅</button>
                            <details className="relative shrink-0">
                                <summary id="tut-date-settings" className="flex min-h-11 cursor-pointer list-none items-center gap-1.5 rounded-xl border border-purple-100 bg-purple-50 px-3 py-2 text-xs font-bold text-purple-700 hover:bg-purple-100 [&::-webkit-details-marker]:hidden">
                                    📅 <span>날짜·달력</span> <span aria-hidden="true" className="text-[10px]">▾</span>
                                </summary>
                                <div className="absolute right-0 top-full z-40 mt-2 w-44 rounded-2xl border border-slate-200 bg-white p-2 shadow-xl">
                                    <button type="button" onClick={(e) => { e.currentTarget.closest('details')?.removeAttribute('open'); setShowCalendar(true); }} className="flex min-h-11 w-full items-center gap-2 rounded-xl px-3 text-left text-sm font-bold text-slate-700 hover:bg-green-50">
                                        📆 읽기 달력 보기
                                    </button>
                                    <button type="button" onClick={(e) => { e.currentTarget.closest('details')?.removeAttribute('open'); setShowDateSettings(true); }} className="flex min-h-11 w-full items-center gap-2 rounded-xl px-3 text-left text-sm font-bold text-slate-700 hover:bg-purple-50">
                                        ⚙️ 읽기 날짜 설정
                                    </button>
                                </div>
                            </details>
                            <button type="button" aria-label="읽는 방법 도움말" onClick={(e) => { e.stopPropagation(); setShowReadingGuide(true); }} className="min-h-11 flex items-center gap-1.5 px-3 py-2 text-xs font-bold text-slate-700 bg-slate-100 border border-slate-200 rounded-xl hover:bg-slate-200 shrink-0">
                                <Icon name="helpbook" size={14} />
                                <span>도움말</span>
                            </button>
                        <div className="hidden h-4 w-px shrink-0 bg-slate-200 md:block md:mx-1"></div>
                        <button onClick={handleLogout} className="min-h-11 text-xs font-bold text-slate-500 hover:text-red-500 transition-colors shrink-0 px-2 py-2">
                            로그아웃
                        </button>
                    </div>

                    {/* 하단: 버전 정보 (모바일에서 아래로) */}
                    <button
                        id="tut-version-btn"
                        onClick={handleChangeVersionStart}
                        className="group flex min-h-11 shrink-0 items-center gap-2 self-start rounded-full bg-slate-100/80 px-3 py-2 transition-colors hover:bg-slate-200 md:order-1 md:self-center"
                    >
                        <span className="text-[11px] font-bold text-slate-500 tracking-tight">읽는 버전 바꾸기</span>
                        <div className="flex items-center gap-1.5">
                            <span className="text-xs font-bold text-slate-700">{planTypeName}</span>
                            <span className="w-px h-2.5 bg-slate-300"></span>
                            <span className="text-xs font-bold text-blue-600">{versionName}</span>
                            <Icon name="refresh" size={10} className="text-slate-400 group-hover:rotate-180 transition-transform duration-500" />
                        </div>
                    </button>
                    {onOpenMemberships && <button type="button" onClick={onOpenMemberships} className="flex min-h-11 min-w-0 max-w-[210px] shrink items-center gap-1 self-start rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-700 md:order-1 md:self-center md:max-w-[170px]" title="내 단체 관리"><span>⛪</span><span className="truncate">{currentOrganizationName || '소속 관리'}</span><span>▾</span></button>}
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
