import React from 'react';
import Icon from '../Icon';

const DashboardHeader = ({
    handleLogout,
    streak,
    talent,
    setShowAchievements,
    setShowDateSettings,
    setShowCalendar,
    setShowReadingGuide,
    setShowFaq = () => {},
    setShowTutorial = () => {},
    setShowAccountHelp = () => {},
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
    return (
        <header className="mb-4 space-y-3">
            {/* 자주 확인하는 정보만 남기고, 조작 메뉴는 한곳에 모은다. */}
            <div className="relative z-[90] border-b border-slate-200/60 bg-white/95 shadow-sm backdrop-blur-md">
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
                        <summary id="tut-menu-btn" className="flex min-h-11 cursor-pointer list-none items-center gap-1.5 rounded-xl border border-slate-200 bg-slate-800 px-3 py-2 text-sm font-black text-white hover:bg-slate-700 [&::-webkit-details-marker]:hidden">
                            ☰ <span>메뉴</span> <span aria-hidden="true" className="text-[10px]">▾</span>
                        </summary>
                        <div className="absolute right-0 top-full z-50 mt-2 w-64 rounded-2xl border border-slate-200 bg-white p-2 shadow-2xl">
                            {onOpenMemberships && <button type="button" title={currentOrganizationName || undefined} onClick={(e) => { e.currentTarget.closest('details')?.removeAttribute('open'); onOpenMemberships(); }} className="flex min-h-11 w-full items-center gap-2 rounded-xl px-3 text-left text-sm font-bold text-slate-700 hover:bg-slate-50"><span>⛪</span><span className="min-w-0 flex-1 truncate">공동체 선택</span></button>}
                            <button id="tut-achievements" type="button" onClick={(e) => { e.currentTarget.closest('details')?.removeAttribute('open'); setShowAchievements(true); }} className="flex min-h-11 w-full items-center gap-2 rounded-xl px-3 text-left text-sm font-bold text-slate-700 hover:bg-yellow-50">🏅 나의 업적·기록</button>
                            <button type="button" onClick={(e) => { e.currentTarget.closest('details')?.removeAttribute('open'); setShowCalendar(true); }} className="flex min-h-11 w-full items-center gap-2 rounded-xl px-3 text-left text-sm font-bold text-slate-700 hover:bg-green-50">📆 읽기 달력</button>
                            <button id="tut-date-settings" type="button" onClick={(e) => { e.currentTarget.closest('details')?.removeAttribute('open'); setShowDateSettings(true); }} className="flex min-h-11 w-full items-center gap-2 rounded-xl px-3 text-left text-sm font-bold text-slate-700 hover:bg-purple-50">⚙️ 읽기 날짜 설정</button>
                            <button type="button" onClick={(e) => { e.currentTarget.closest('details')?.removeAttribute('open'); setShowReadingGuide(true); }} className="flex min-h-11 w-full items-center gap-2 rounded-xl px-3 text-left text-sm font-bold text-slate-700 hover:bg-blue-50"><Icon name="helpbook" size={15} /> 성경통독 114 가이드</button>
                            <button type="button" onClick={(e) => { e.currentTarget.closest('details')?.removeAttribute('open'); setShowFaq(true); }} className="flex min-h-11 w-full items-center gap-2 rounded-xl px-3 text-left text-sm font-bold text-slate-700 hover:bg-violet-50"><span>❓</span> 자주 묻는 질문</button>
                            <button type="button" onClick={(e) => { e.currentTarget.closest('details')?.removeAttribute('open'); setShowTutorial(true); }} className="flex min-h-11 w-full items-center gap-2 rounded-xl px-3 text-left text-sm font-bold text-slate-700 hover:bg-amber-50"><span>🧭</span> 앱 화면 투어</button>
                            <button type="button" onClick={(e) => { e.currentTarget.closest('details')?.removeAttribute('open'); setShowAccountHelp(true); }} className="flex min-h-11 w-full items-center gap-2 rounded-xl px-3 text-left text-sm font-bold text-slate-700 hover:bg-emerald-50">📱 로그인·바로가기</button>
                            {isChurchAdmin && <button type="button" onClick={(e) => { e.currentTarget.closest('details')?.removeAttribute('open'); setView('church_admin'); }} className="flex min-h-11 w-full items-center gap-2 rounded-xl px-3 text-left text-sm font-bold text-indigo-700 hover:bg-indigo-50">⚙️ 공동체 관리</button>}
                            <div className="my-1 h-px bg-slate-100"></div>
                            <button type="button" onClick={handleLogout} className="flex min-h-11 w-full items-center gap-2 rounded-xl px-3 text-left text-sm font-bold text-red-600 hover:bg-red-50">↪ 로그아웃</button>
                        </div>
                    </details>
                </div>
            </div>
        </header>
    );
};

export default DashboardHeader;
