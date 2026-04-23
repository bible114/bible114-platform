import React from 'react';
import Icon from '../Icon';

const SubgroupRankingCard = ({
    communityName,
    getSubgroupRanking,
    subgroupId,
    communityId // 부서 ID 추가
}) => {
    const ranking = getSubgroupRanking();

    return (
        <div className="bg-white rounded-3xl border border-slate-100 p-6 shadow-xl scroll-mt-20">
            <div className="flex justify-between items-center mb-5">
                <h3 className="font-bold text-slate-700 flex items-center gap-2">
                    <Icon name="users" size={20} className="text-indigo-500" />
                    소그룹 순위
                </h3>
            </div>
            <div className="space-y-4 max-h-[400px] overflow-y-auto pr-2 custom-scrollbar">
                {!ranking || ranking.length === 0 ? (
                    <div className="text-center text-slate-400 py-8 text-sm">데이터를 불러오는 중입니다...</div>
                ) : (
                    ranking.map((group, idx) => {
                        // 우리 그룹 여부 판별 (부서와 소그룹명이 모두 일치해야 함)
                        const isMyGroup = group.communityId === communityId && group.name === subgroupId;

                        // 장년부가 아니면 앞에 부서명을 붙임
                        const displayName = group.communityId === 'senior'
                            ? group.name
                            : `${group.communityName} ${group.name}`;

                        return (
                            <div key={idx} className={`relative transition-all ${isMyGroup ? 'bg-blue-50/50 p-3 rounded-2xl ring-1 ring-blue-100' : ''}`}>
                                <div className="flex justify-between text-xs mb-1.5">
                                    <span className={`font-bold flex items-center gap-1.5 ${isMyGroup ? 'text-blue-600' : 'text-slate-600'}`}>
                                        <span className={`w-5 h-5 flex items-center justify-center rounded-full text-[10px] ${idx === 0 ? 'bg-yellow-100 text-yellow-700' : idx === 1 ? 'bg-slate-100 text-slate-600' : idx === 2 ? 'bg-orange-50 text-orange-700' : 'bg-slate-100 text-slate-400'}`}>{idx + 1}</span>
                                        {displayName} {isMyGroup && <span className="text-[10px] opacity-70">(우리팀)</span>}
                                    </span>
                                    <span className={`font-bold ${isMyGroup ? 'text-blue-600' : 'text-slate-400'}`}>진행률 {group.progressRate}%</span>
                                </div>
                                <div className="h-2 w-full bg-slate-100 rounded-full overflow-hidden">
                                    <div
                                        className={`h-full rounded-full transition-all duration-1000 ${isMyGroup ? 'bg-blue-500' : 'bg-slate-300'}`}
                                        style={{ width: `${group.progressRate}%` }}
                                    ></div>
                                </div>
                            </div>
                        );
                    })
                )}
            </div>
        </div>
    );
};

export default SubgroupRankingCard;
