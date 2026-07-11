import React from 'react';
import Icon from '../Icon';

const membershipMatches = (left, right) => {
    if (!left || !right || left.departmentId !== right.departmentId) return false;
    if (left.subgroupId && left.subgroupId === right.subgroupId) return true;
    return Boolean(
        (left.subgroupId && right.subgroupName && left.subgroupId === right.subgroupName)
        || (right.subgroupId && left.subgroupName && right.subgroupId === left.subgroupName)
    );
};

const SubgroupRankingCard = ({
    departmentName,
    getSubgroupRanking,
    subgroupId,
    departmentId, // 부서 ID 추가
    extraMemberships = [],
}) => {
    const ranking = getSubgroupRanking();
    const departmentIds = [...new Set(ranking.map(g => g.departmentId))];
    const hasMultipleDepartments = departmentIds.length > 1;

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
                        // 부서+소그룹 ID pair를 기준으로 하되 레거시 이름 저장 사용자도 호환한다.
                        const groupSubgroupId = group.subgroupId || group.name;
                        const groupMembership = {
                            departmentId: group.departmentId,
                            subgroupId: groupSubgroupId,
                            subgroupName: group.name,
                        };
                        const isMyGroup = membershipMatches(groupMembership, {
                            departmentId,
                            subgroupId,
                            subgroupName: subgroupId,
                        });
                        const isExtraGroup = !isMyGroup
                            && (Array.isArray(extraMemberships) ? extraMemberships : [])
                                .some(membership => membershipMatches(groupMembership, membership));

                        const displayName = hasMultipleDepartments
                            ? `${group.departmentName} ${group.name}`
                            : group.name;

                        return (
                            <div key={`${group.departmentId || 'unknown'}_${groupSubgroupId}`} className={`relative transition-all ${isMyGroup ? 'bg-blue-50/50 p-3 rounded-2xl ring-1 ring-blue-100' : ''}`}>
                                <div className="flex items-center justify-between gap-2 text-xs mb-1.5">
                                    <span className={`min-w-0 font-bold flex items-center gap-1.5 ${isMyGroup ? 'text-blue-600' : 'text-slate-600'}`}>
                                        <span className={`w-5 h-5 flex items-center justify-center rounded-full text-[10px] ${idx === 0 ? 'bg-yellow-100 text-yellow-700' : idx === 1 ? 'bg-slate-100 text-slate-600' : idx === 2 ? 'bg-orange-50 text-orange-700' : 'bg-slate-100 text-slate-400'}`}>{idx + 1}</span>
                                        <span className="truncate">{displayName} {isMyGroup && <span className="text-[10px] opacity-70">(우리팀)</span>}</span>
                                        {isExtraGroup && (
                                            <span className="shrink-0 rounded-full bg-slate-100 px-1.5 py-0.5 text-[9px] font-bold text-slate-500">
                                                추가 소속
                                            </span>
                                        )}
                                    </span>
                                    <span className={`shrink-0 font-bold ${isMyGroup ? 'text-blue-600' : 'text-slate-400'}`}>진행률 {group.progressRate}%</span>
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
