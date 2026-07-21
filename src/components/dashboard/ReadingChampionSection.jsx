import React from 'react';
import { getDaysRead } from '../../utils/helpers';
import { getReadingRoundBadgeLabel } from '../../utils/readingRounds';

const ReadingRoundBadge = ({ member }) => {
    const label = getReadingRoundBadgeLabel(member);
    if (!label) return null;

    return (
        <span className="shrink-0 rounded-full bg-purple-100 px-1.5 py-0.5 text-[9px] font-black text-purple-700">
            {label}
        </span>
    );
};

const ReadingChampionSection = ({ getWeeklyMVP }) => {
    if (typeof getWeeklyMVP !== 'function') return null;
    const mvp = getWeeklyMVP();
    if (!mvp) return null;

    const { streakMVP, progressMVP, weeklyTop10 = [], totalTop10 = [] } = mvp;
    if (!streakMVP && !progressMVP) return null;

    return (
        <div className="bg-gradient-to-br from-blue-50 to-indigo-50 rounded-2xl border border-blue-200 p-5 shadow-sm">
            <div className="flex justify-between items-center mb-4">
                <h3 className="font-bold text-blue-700 flex items-center gap-2">🏆 읽기왕</h3>
            </div>

            {/* MVP Winners Grid */}
            <div className="grid grid-cols-2 gap-3 mb-4">
                {/* Weekly MVP */}
                <div className="bg-white p-3 rounded-xl border border-blue-100 text-center">
                    <div className="text-2xl mb-1">🔥</div>
                    <p className="text-[10px] text-slate-500 mb-1">주간 읽기왕</p>
                    <div className="flex min-w-0 items-center justify-center gap-1">
                        <p className="truncate font-bold text-slate-800">{streakMVP ? streakMVP.name : '-'}</p>
                        <ReadingRoundBadge member={streakMVP} />
                    </div>
                    <p className="text-xs text-orange-500 mb-2 font-bold">
                        {streakMVP ? `이번 주 ${streakMVP.weeklyCount || 0}일` : '-'}
                    </p>
                    <p className="text-[9px] text-slate-400 mt-2 pt-2 border-t border-slate-100">이번 주 가장 많이 읽은 사람</p>
                </div>

                {/* Cumulative MVP */}
                <div className="bg-white p-3 rounded-xl border border-blue-100 text-center">
                    <div className="text-2xl mb-1">🏆</div>
                    <p className="text-[10px] text-slate-500 mb-1">누적 읽기왕</p>
                    <div className="flex min-w-0 items-center justify-center gap-1">
                        <p className="truncate font-bold text-slate-800">{progressMVP ? progressMVP.name : '-'}</p>
                        <ReadingRoundBadge member={progressMVP} />
                    </div>
                    <p className="text-xs text-blue-500 mb-2 font-bold">
                        {(() => {
                            if (!progressMVP) return '-';
                            const readCount = progressMVP.readCount || 1;
                            const currentDay = progressMVP.currentDay || 0;
                            const totalDays = getDaysRead(progressMVP);
                            if (readCount > 1) {
                                return `총 ${totalDays}일 (${readCount - 1}독 완료, ${currentDay}일)`;
                            }
                            return `총 ${totalDays}일`;
                        })()}
                    </p>
                    <p className="text-[9px] text-slate-400 mt-2 pt-2 border-t border-slate-100">전체 누적 읽기 1위</p>
                </div>
            </div>

            {/* Runner-ups Grid (2-10) */}
            <div className="grid grid-cols-2 gap-3">
                {/* Weekly 2nd-10th */}
                <div className="bg-white p-3 rounded-xl border border-blue-100">
                    <p className="text-[10px] text-slate-500 font-bold mb-2 text-center">주간 2-10위</p>
                    <div className="space-y-1">
                        {weeklyTop10.length > 1 ? weeklyTop10.slice(1, 10).map((member, idx) => {
                            return (
                                <div key={member.uid} className="flex justify-between items-center gap-1 text-[10px]">
                                    <span className="flex min-w-0 items-center gap-1 text-slate-600">
                                        <span className="truncate">{idx + 2}위. {member.name}</span>
                                        <ReadingRoundBadge member={member} />
                                    </span>
                                    <span className="text-orange-500 font-bold shrink-0">{member.weeklyCount || 0}일</span>
                                </div>
                            );
                        }) : <p className="text-[10px] text-slate-400 text-center py-2">-</p>}
                    </div>
                </div>

                {/* Cumulative 2nd-10th */}
                <div className="bg-white p-3 rounded-xl border border-blue-100">
                    <p className="text-[10px] text-slate-500 font-bold mb-2 text-center">누적 2-10위</p>
                    <div className="space-y-1">
                        {totalTop10.length > 1 ? totalTop10.slice(1, 10).map((member, idx) => {
                            const totalDays = getDaysRead(member);
                            return (
                                <div key={member.uid} className="flex justify-between items-center gap-1 text-[10px]">
                                    <span className="flex min-w-0 items-center gap-1 text-slate-600">
                                        <span className="truncate">{idx + 2}위. {member.name}</span>
                                        <ReadingRoundBadge member={member} />
                                    </span>
                                    <span className="text-blue-600 font-bold shrink-0">{totalDays}일</span>
                                </div>
                            );
                        }) : <p className="text-[10px] text-slate-400 text-center py-2">-</p>}
                    </div>
                </div>
            </div>
        </div>
    );
};

export default ReadingChampionSection;
