import React from 'react';
import Icon from '../Icon';
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
    departmentName,
    setShowFullRanking,
    topProgressGroups = [],
    departmentId,
    subgroupId,
    extraMemberships = [],
}) => {
    const primaryMembership = { departmentId, departmentName, subgroupId, subgroupName: null };
    const normalizedExtraMemberships = getMembershipList({ extraMemberships })
        .filter(membership => !sameMembership(membership, primaryMembership));

    return (
        <section aria-label="공동체 랭킹 요약" className="pt-2">
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
        </section>
    );
};

export default CommunityRankingSummary;
