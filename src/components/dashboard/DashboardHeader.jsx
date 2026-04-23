import React from 'react';
import Icon from '../Icon';

const DashboardHeader = ({
    handleLogout,
    streak,
    score,
    myLevel,
    setShowScoreInfo,
    setShowAchievements,
    setShowDateSettings,
    setShowCalendar,
    setShowReadingGuide,
    getEncouragementMessage,
    communityName,
    setShowFullRanking,
    topProgressGroups,
    subgroupId,
    // 새로운 props
    planTypeName,
    versionName,
    handleChangeVersionStart,
    setView // 추가
}) => {
    return (
        <header className="sticky top-0 z-30 space-y-4 mb-4">
            {/* 상단 내비게이션 바 - 통합 및 정돈 */}
            <div className="bg-white/95 backdrop-blur-md border-b border-slate-200/60 shadow-sm">
                <div className="px-4 py-2 flex flex-col md:flex-row justify-between items-center max-w-5xl mx-auto w-full gap-2.5 md:gap-4">
                    {/* 상단: 사용자 상태 및 로그아웃 (모바일에서 먼저보이고 좌우 꽉차게) */}
                    <div className="flex items-center gap-1.5 overflow-x-auto scrollbar-hide w-full md:w-auto md:order-2 justify-between md:justify-end py-1">
                        <div className="flex items-center gap-1.5">
                            <div className={`text-xs font-bold px-2.5 py-1.5 rounded-xl flex items-center gap-1 shrink-0 ${streak > 0 ? 'bg-orange-50 text-orange-600 border border-orange-100' : 'bg-slate-100 text-slate-400'}`}>
                                <Icon name="flame" size={12} />{streak}일
                            </div>
                            <button type="button" onClick={(e) => { e.stopPropagation(); setShowScoreInfo(true); }} className="text-xs font-bold text-blue-600 bg-blue-50 border border-blue-100 px-2.5 py-1.5 rounded-xl hover:bg-blue-100 transition-colors shrink-0">
                                {myLevel.emoji} {score || 0}pt
                            </button>
                            <button type="button" onClick={(e) => { e.stopPropagation(); setView('mini_room'); }} className="p-1.5 text-xs font-bold text-indigo-600 bg-indigo-50 border border-indigo-100 rounded-xl hover:bg-indigo-100 shrink-0 flex items-center gap-1" title="미니룸 입장">🏠 <span className="hidden sm:inline">미니룸</span></button>
                            <button type="button" onClick={(e) => { e.stopPropagation(); setShowAchievements(true); }} className="p-1.5 text-xs font-bold text-yellow-600 bg-yellow-50 border border-yellow-100 rounded-xl hover:bg-yellow-100 shrink-0">🏅</button>
                            <button type="button" onClick={(e) => { e.stopPropagation(); setShowDateSettings(true); }} className="p-1.5 text-xs font-bold text-purple-600 bg-purple-50 border border-purple-100 rounded-xl hover:bg-purple-100 shrink-0">📅</button>
                            <button type="button" onClick={(e) => { e.stopPropagation(); setShowCalendar(true); }} className="p-1.5 text-xs font-bold text-green-600 bg-green-50 border border-green-100 rounded-xl hover:bg-green-100 shrink-0">📆</button>
                            <button type="button" onClick={(e) => { e.stopPropagation(); setShowReadingGuide(true); }} className="p-1.5 text-xs font-bold text-slate-600 bg-slate-100 border border-slate-200 rounded-xl hover:bg-slate-200 shrink-0">
                                <Icon name="helpbook" size={14} />
                            </button>
                        </div>
                        <div className="flex items-center shrink-0">
                            <div className="w-px h-4 bg-slate-200 mx-1"></div>
                            <button onClick={handleLogout} className="text-xs font-bold text-slate-400 hover:text-red-500 transition-colors shrink-0 px-1">
                                로그아웃
                            </button>
                        </div>
                    </div>

                    {/* 하단: 버전 정보 (모바일에서 아래로) */}
                    <button
                        onClick={handleChangeVersionStart}
                        className="flex items-center gap-2 px-3 py-1.5 bg-slate-100/80 hover:bg-slate-200 rounded-full transition-colors group shrink-0 md:order-1 self-start md:self-center"
                    >
                        <span className="text-[11px] font-bold text-slate-500 tracking-tight">읽는 버전 바꾸기</span>
                        <div className="flex items-center gap-1.5">
                            <span className="text-xs font-bold text-slate-700">{planTypeName}</span>
                            <span className="w-px h-2.5 bg-slate-300"></span>
                            <span className="text-xs font-bold text-blue-600">{versionName}</span>
                            <Icon name="refresh" size={10} className="text-slate-400 group-hover:rotate-180 transition-transform duration-500" />
                        </div>
                    </button>
                </div>
            </div>

            {/* 랭킹 영역 - 카드 디자인 완성도 제고 */}
            <div className="px-4 w-full max-w-5xl mx-auto">
                <div className="bg-white rounded-3xl shadow-md border border-slate-100/80 p-6 md:p-8">
                    <div className="flex justify-between items-center mb-6">
                        <div className="flex flex-col gap-1">
                            <span className="text-xs font-bold text-blue-600 tracking-tight">{getEncouragementMessage()}</span>
                            <div className="flex items-center gap-2">
                                <span className="text-xl font-black text-slate-900">🏆 {communityName}</span>
                                <span className="text-sm font-bold text-slate-400">누적 랭킹</span>
                            </div>
                        </div>
                        <button onClick={() => setShowFullRanking(true)} className="flex items-center gap-1 px-4 py-2 bg-slate-50 hover:bg-blue-50 text-blue-600 text-xs font-bold rounded-2xl transition-all border border-transparent hover:border-blue-100">
                            전체보기 <Icon name="right" size={10} />
                        </button>
                    </div>
                    <div className="space-y-4">
                        {topProgressGroups.map((group, idx) => (
                            <div key={idx} className="flex items-center gap-4">
                                <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold border-2 shrink-0 ${idx === 0 ? 'bg-yellow-100 border-yellow-200 text-yellow-700' : idx === 1 ? 'bg-slate-100 border-slate-200 text-slate-700' : 'bg-orange-50 border-orange-100 text-orange-700'}`}>
                                    {idx + 1}
                                </div>
                                <div className="flex-1 min-w-0">
                                    <div className="flex justify-between text-xs mb-1.5">
                                        <span className={`font-bold truncate ${group.name === subgroupId ? 'text-blue-600' : 'text-slate-700'}`}>
                                            {group.name}
                                        </span>
                                        <span className="font-bold text-slate-500 shrink-0">
                                            평균 {group.avgDay}일 ({group.progressRate}%)
                                        </span>
                                    </div>
                                    <div className="h-4 w-full bg-slate-50 rounded-full border border-slate-100 overflow-hidden shadow-inner">
                                        <div className={`h-full rounded-full transition-all duration-1000 ${idx === 0 ? 'bg-gradient-to-r from-yellow-300 to-yellow-500' : idx === 1 ? 'bg-gradient-to-r from-slate-300 to-slate-500' : 'bg-gradient-to-r from-orange-300 to-orange-500'}`} style={{ width: `${group.progressRate}%` }}></div>
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            </div>
        </header>
    );
};

export default DashboardHeader;
