import React from 'react';
import { getMembershipList } from '../../utils/memberships';

const sameMembership = (left, right) => {
    if (!left || !right || left.departmentId !== right.departmentId) return false;
    if (left.subgroupId === right.subgroupId) return true;
    return Boolean(
        (left.subgroupId && right.subgroupName && left.subgroupId === right.subgroupName)
        || (right.subgroupId && left.subgroupName && right.subgroupId === left.subgroupName)
    );
};

const CommunityRankingSummary = ({
    getEncouragementMessage,
    setShowFullRanking,
    setSelectedSubgroupDetail,
    progressRanking = [],
    departmentId,
    subgroupId,
    extraMemberships = [],
}) => {
    const primaryMembership = { departmentId, subgroupId, subgroupName: null };
    const normalizedExtraMemberships = getMembershipList({ extraMemberships })
        .filter(membership => !sameMembership(membership, primaryMembership));

    const openSubgroupDetail = (group) => {
        const groupSubgroupId = group.subgroupId || group.name;
        setSelectedSubgroupDetail({
            departmentId: group.departmentId,
            departmentName: group.departmentName,
            subgroupId: groupSubgroupId,
            subgroupName: group.name,
        });
        setShowFullRanking(true);
    };

    return (
        <section aria-label="소그룹 누적 랭킹" className="rounded-3xl border border-slate-100 bg-white p-5 shadow-sm">
            <div className="flex items-start justify-between gap-3">
                <div>
                    <h2 className="text-base font-black text-slate-900">🏆 소그룹 누적 랭킹</h2>
                    <p className="mt-1 text-xs font-bold text-blue-600">{getEncouragementMessage()}</p>
                </div>
                {normalizedExtraMemberships.length > 0 && <span className="shrink-0 rounded-full bg-slate-100 px-2 py-1 text-[10px] font-bold text-slate-500">+{normalizedExtraMemberships.length}개 소속</span>}
            </div>
            {progressRanking.length > 0 ? (
                <div className="mt-4 space-y-2">
                    {progressRanking.map((group, index) => {
                        const groupMembership = {
                            departmentId: group.departmentId,
                            subgroupId: group.subgroupId || group.name,
                            subgroupName: group.name,
                        };
                        const isMyGroup = sameMembership(groupMembership, primaryMembership);
                        return (
                            <button
                                key={`${group.departmentId || 'unknown'}_${group.subgroupId || group.name}`}
                                type="button"
                                onClick={() => openSubgroupDetail(group)}
                                className={`flex min-h-12 w-full items-center gap-3 rounded-2xl border px-3 py-2.5 text-left transition ${isMyGroup ? 'border-blue-200 bg-blue-50' : 'border-slate-100 bg-slate-50 hover:border-slate-200'}`}
                            >
                                <span className={`grid h-8 w-8 shrink-0 place-items-center rounded-full text-xs font-black ${index === 0 ? 'bg-amber-100 text-amber-700' : index === 1 ? 'bg-slate-200 text-slate-700' : index === 2 ? 'bg-orange-100 text-orange-700' : 'bg-white text-slate-500'}`}>{index + 1}</span>
                                <span className="min-w-0 flex-1">
                                    <span className={`block truncate text-sm font-black ${isMyGroup ? 'text-blue-700' : 'text-slate-700'}`}>{group.name}{isMyGroup ? ' (우리팀)' : ''}</span>
                                    <span className="mt-1 block h-1.5 overflow-hidden rounded-full bg-slate-200"><span className="block h-full rounded-full bg-blue-500" style={{ width: `${Math.min(100, Math.max(0, Number(group.progressRate) || 0))}%` }} /></span>
                                </span>
                                <span className="shrink-0 text-sm font-black text-slate-600">{group.progressRate}%</span>
                            </button>
                        );
                    })}
                </div>
            ) : (
                <p className="mt-4 rounded-2xl bg-slate-50 px-4 py-5 text-center text-sm font-bold text-slate-400">표시할 소그룹 순위가 없습니다.</p>
            )}
        </section>
    );
};

export default CommunityRankingSummary;
