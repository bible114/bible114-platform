import React from 'react';
import Icon from '../Icon';
import { MOCK_COMMUNITIES } from '../../data/communities';

const RankingModal = ({
    show,
    onClose,
    progressRanking,
    allMembersForRace,
    subgroupId,
    currentUser,
    selectedSubgroupDetail,
    setSelectedSubgroupDetail,
    rankingCommunityFilter,
    setRankingCommunityFilter
}) => {
    if (!show) return null;

    if (!selectedSubgroupDetail) {
        return (
            <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
                <div className="bg-white rounded-2xl p-6 w-full max-w-md shadow-2xl max-h-[80vh] flex flex-col" onClick={e => e.stopPropagation()}>
                    <div className="flex justify-between items-center mb-4 border-b pb-2">
                        <h3 className="text-xl font-bold text-slate-800">🏆 소그룹 누적 랭킹</h3>
                        <button onClick={onClose} className="text-slate-400"><Icon name="close" /></button>
                    </div>
                    <div className="mb-3 flex flex-wrap gap-2">
                        <button onClick={() => setRankingCommunityFilter('all')} className={`px-2.5 py-1.5 rounded-full text-[11px] font-bold whitespace-nowrap transition-colors ${rankingCommunityFilter === 'all' ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}>전체</button>
                        {MOCK_COMMUNITIES.map(comm => (
                            <button key={comm.id} onClick={() => setRankingCommunityFilter(comm.id)} className={`px-2.5 py-1.5 rounded-full text-[11px] font-bold whitespace-nowrap transition-colors ${rankingCommunityFilter === comm.id ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}>{comm.name}</button>
                        ))}
                    </div>
                    <div className="mb-3 bg-blue-50 p-3 rounded-xl border border-blue-100"><p className="text-xs text-blue-700"><strong>평균 진행률</strong> = 소그룹 평균 Day ÷ 365 × 100</p><p className="text-[10px] text-blue-600 mt-1">💡 소그룹을 클릭하면 멤버별 진행 상황을 볼 수 있어요</p></div>
                    <div className="flex-1 overflow-y-auto space-y-3 pr-2">
                        {(() => {
                            let filteredRanking = progressRanking;
                            if (rankingCommunityFilter !== 'all') {
                                const selectedComm = MOCK_COMMUNITIES.find(c => c.id === rankingCommunityFilter);
                                if (selectedComm) filteredRanking = progressRanking.filter(g => selectedComm.subgroups.indexOf(g.name) !== -1);
                            }
                            if (filteredRanking.length === 0) return <div className="text-center py-8 text-slate-500"><p className="text-sm">해당 부서의 소그룹 데이터가 없습니다.</p></div>;
                            return filteredRanking.map((group, idx) => {
                                const isMyGroup = group.name === subgroupId;
                                const rankColor = idx === 0 ? 'bg-yellow-100 text-yellow-700 border-yellow-200' : idx === 1 ? 'bg-slate-200 text-slate-700 border-slate-300' : idx === 2 ? 'bg-orange-100 text-orange-700 border-orange-200' : 'bg-slate-100 text-slate-600 border-slate-200';
                                return (
                                    <button key={idx} onClick={() => setSelectedSubgroupDetail(group.name)} className={`w-full p-3 rounded-xl border-2 transition-all hover:shadow-md ${isMyGroup ? 'bg-blue-50 border-blue-300 hover:bg-blue-100' : 'bg-white border-slate-100 hover:border-slate-300'}`}>
                                        <div className="flex items-center gap-3 mb-2">
                                            <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold border-2 shrink-0 ${rankColor}`}>{idx + 1}</div>
                                            <div className="flex-1 min-w-0 text-left"><div className="flex justify-between items-center"><span className={`font-bold text-sm truncate pr-2 ${isMyGroup ? 'text-blue-600' : 'text-slate-700'}`}>{group.name} {isMyGroup && '(우리팀)'}</span><span className="text-xs font-bold text-slate-500 shrink-0">{group.progressRate}%</span></div></div>
                                            <Icon name="arrowRight" size={16} className="text-slate-400" />
                                        </div>
                                        <div className="h-2 w-full bg-slate-100 rounded-full overflow-hidden"><div className={`h-full rounded-full ${idx === 0 ? 'bg-yellow-400' : idx === 1 ? 'bg-slate-400' : idx === 2 ? 'bg-orange-400' : 'bg-slate-300'}`} style={{ width: `${group.progressRate}%` }}></div></div>
                                    </button>
                                );
                            });
                        })()}
                    </div>
                </div>
            </div>
        );
    } else {
        const members = allMembersForRace.filter(m => m.subgroupId === selectedSubgroupDetail).sort((a, b) => {
            const aTotalDays = ((a.readCount || 1) - 1) * 365 + (a.currentDay || 1);
            const bTotalDays = ((b.readCount || 1) - 1) * 365 + (b.currentDay || 1);
            return bTotalDays - aTotalDays;
        });
        const todayStr = new Date().toDateString();
        const avgDay = members.length > 0 ? Math.round(members.reduce((sum, m) => sum + (m.currentDay || 0), 0) / members.length) : 0;
        const readToday = members.filter(m => m.lastReadDate === todayStr).length;

        return (
            <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4" onClick={(e) => { if (e.target === e.currentTarget) setSelectedSubgroupDetail(null); }}>
                <div className="bg-white rounded-2xl p-6 w-full max-w-md shadow-2xl max-h-[80vh] flex flex-col" onClick={e => e.stopPropagation()}>
                    <div className="flex items-center gap-3 mb-4 border-b pb-3">
                        <button onClick={() => setSelectedSubgroupDetail(null)} className="text-slate-400 hover:text-slate-600"><Icon name="back" size={20} /></button>
                        <div className="flex-1"><h3 className="text-xl font-bold text-slate-800">{selectedSubgroupDetail}</h3><p className="text-xs text-slate-500">멤버별 진행 상황</p></div>
                        <button onClick={() => { setSelectedSubgroupDetail(null); onClose(); }} className="text-slate-400"><Icon name="close" /></button>
                    </div>
                    <div className="grid grid-cols-3 gap-2 mb-4">
                        <div className="bg-blue-50 p-3 rounded-xl text-center border border-blue-100"><p className="text-xl font-bold text-blue-600">{members.length}</p><p className="text-[10px] text-slate-500">전체 인원</p></div>
                        <div className="bg-green-50 p-3 rounded-xl text-center border border-green-100"><p className="text-xl font-bold text-green-600">{avgDay}</p><p className="text-[10px] text-slate-500">평균 Day</p></div>
                        <div className="bg-orange-50 p-3 rounded-xl text-center border border-orange-100"><p className="text-xl font-bold text-orange-600">{readToday}</p><p className="text-[10px] text-slate-500">오늘 읽음</p></div>
                    </div>
                    <div className="flex-1 overflow-y-auto space-y-2 pr-2">
                        {members.length > 0 ? members.map((member, idx) => {
                            const isMe = member.uid === currentUser.uid;
                            const readTodayFlag = member.lastReadDate === todayStr;
                            const progressRate = Math.round((member.currentDay / 365) * 100);
                            return (
                                <div key={member.uid} className={`p-3 rounded-xl border ${isMe ? 'bg-blue-50 border-blue-200' : 'bg-slate-50 border-slate-100'}`}>
                                    <div className="flex items-center justify-between mb-2">
                                        <div className="flex items-center gap-2">
                                            <span className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${idx === 0 ? 'bg-yellow-100 text-yellow-600' : idx === 1 ? 'bg-slate-200 text-slate-600' : idx === 2 ? 'bg-orange-100 text-orange-600' : 'bg-slate-100 text-slate-400'}`}>{idx + 1}</span>
                                            <span className={`font-bold text-sm ${isMe ? 'text-blue-600' : 'text-slate-700'}`}>{member.name} {isMe && '(나)'}</span>
                                            {(member.readCount || 1) > 1 && <span className="text-[10px] bg-purple-500 text-white px-1.5 py-0.5 rounded-full font-bold">{member.readCount}독</span>}
                                            {readTodayFlag && <span className="text-green-500 text-xs">✓</span>}
                                        </div>
                                        <div className="text-right"><p className="text-sm font-bold text-slate-700">Day {((member.readCount || 1) - 1) * 365 + member.currentDay}</p><p className="text-[10px] text-slate-400">{member.score || 0}점</p></div>
                                    </div>
                                    <div className="h-2 w-full bg-slate-200 rounded-full overflow-hidden"><div className={`h-full rounded-full ${isMe ? 'bg-blue-500' : 'bg-slate-400'}`} style={{ width: `${progressRate}%` }}></div></div>
                                    <div className="flex justify-between mt-1"><span className="text-[10px] text-slate-400">{progressRate}% 진행</span>{member.streak > 0 && <span className="text-[10px] text-orange-500 font-bold">🔥 {member.streak}일 연속</span>}</div>
                                </div>
                            );
                        }) : <div className="text-center py-8 text-slate-400"><p className="text-sm">소속 멤버가 없습니다</p></div>}
                    </div>
                    <button onClick={() => setSelectedSubgroupDetail(null)} className="w-full bg-slate-100 font-bold py-3 rounded-xl mt-4 text-slate-600">뒤로가기</button>
                </div>
            </div>
        );
    }
};

export default RankingModal;
