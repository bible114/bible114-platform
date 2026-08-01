import React from 'react';
import { formatNationalReadingProgress } from '../utils/publicNationalRanking';

const rankStyle = rank => {
    if (rank === 1) return 'bg-[#ac7b29] text-[#191919]';
    if (rank === 2) return 'bg-[#6d7b73] text-white';
    if (rank === 3) return 'bg-[#9e6241] text-white';
    return 'bg-[#ecece6] text-[#5f675f]';
};

const NationalReadingRanking = ({ entries = [] }) => {
    if (!Array.isArray(entries) || entries.length === 0) return null;

    return (
        <section
            aria-labelledby="national-reading-ranking-title"
            className="mx-auto mb-5 w-full max-w-lg overflow-hidden rounded-2xl border border-forest/10 bg-[#fbf8f1] shadow-[0_16px_40px_-34px_rgba(43,58,42,0.6)] lg:mx-0"
        >
            <div className="flex h-[48px] items-center justify-between px-4">
                <h2 id="national-reading-ranking-title" className="font-serif text-[16px] font-bold tracking-[-0.02em] text-ink">
                    전국 통독 순위
                </h2>
                {entries.length > 5 && (
                    <span className="text-[10px] font-bold tabular-nums text-ink/70" aria-hidden="true">
                        1–{entries.length}위 ↕
                    </span>
                )}
            </div>
            <ol
                className="h-[270px] snap-y snap-mandatory overflow-y-auto overscroll-contain border-t border-forest/[0.07] [scrollbar-color:rgba(43,58,42,0.18)_transparent] [scrollbar-width:thin]"
                aria-label={`전국 통독 순위 1위부터 ${entries.length}위까지`}
                tabIndex={0}
            >
                {entries.map(entry => {
                    const progressText = formatNationalReadingProgress(entry);
                    const completedReadCount = entry.readCount - 1;
                    return (
                        <li
                            key={entry.rank}
                            className="flex h-[54px] snap-start items-center gap-2 border-b border-forest/[0.07] px-3 last:border-b-0 hover:bg-white/65"
                            aria-label={`${entry.rank}위 ${entry.churchName} ${entry.maskedName}, ${progressText}`}
                        >
                            <span
                                className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[11px] font-extrabold tabular-nums ${rankStyle(entry.rank)}`}
                                aria-hidden="true"
                            >
                                {entry.rank}
                            </span>
                            <p className="min-w-0 flex-1 truncate tracking-[-0.02em]">
                                <span className="text-[11px] font-semibold text-ink/75">{entry.churchName}</span>
                                <span className="mx-1.5 text-[11px] text-ink/24">·</span>
                                <span className="text-[14px] font-extrabold text-ink">{entry.maskedName}</span>
                            </p>
                            <div className="w-[100px] shrink-0 text-right tabular-nums" aria-hidden="true">
                                {completedReadCount > 0 && (
                                    <p className="text-[15px] font-black leading-none text-forest">{completedReadCount}독</p>
                                )}
                                <p className={`${completedReadCount > 0 ? 'mt-1 text-[10px]' : 'text-[12px]'} whitespace-nowrap font-bold tracking-[-0.01em] text-ink/58`}>
                                    {entry.currentDay}일째 읽는 중
                                </p>
                            </div>
                        </li>
                    );
                })}
            </ol>
        </section>
    );
};

export default NationalReadingRanking;
