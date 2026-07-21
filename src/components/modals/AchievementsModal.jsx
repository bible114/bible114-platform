import React, { useEffect } from 'react';
import Icon from '../Icon';
import { ACHIEVEMENTS } from '../../data/achievements';
import { getDaysRead } from '../../utils/helpers';

const AchievementsModal = ({ show, onClose, currentUser }) => {
    useEffect(() => {
        if (!show) return undefined;
        const previousOverflow = document.body.style.overflow;
        document.body.style.overflow = 'hidden';
        const handleKeyDown = event => {
            if (event.key === 'Escape') onClose();
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => {
            document.body.style.overflow = previousOverflow;
            window.removeEventListener('keydown', handleKeyDown);
        };
    }, [show, onClose]);

    if (!show) return null;

    return (
        <div className="fixed inset-0 z-[180] flex items-end justify-center bg-black/55 sm:items-center sm:p-5" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
            <section role="dialog" aria-modal="true" aria-label="나의 업적과 기록" className="flex h-[100dvh] w-full max-w-md flex-col overflow-hidden bg-slate-50 shadow-2xl sm:h-auto sm:max-h-[90vh] sm:rounded-[2rem]" onMouseDown={e => e.stopPropagation()}>
                <header className="z-10 shrink-0 border-b border-slate-200 bg-white px-5 pb-4 pt-3 shadow-sm">
                    <div className="flex min-h-11 items-center justify-between gap-3">
                        <div>
                            <p className="text-xs font-bold text-amber-600">말씀과 함께 쌓인 발걸음</p>
                            <h3 className="mt-0.5 text-xl font-black text-slate-800">🏅 나의 업적·기록</h3>
                        </div>
                        <button onClick={onClose} aria-label="업적 창 닫기" className="flex min-h-11 min-w-11 items-center justify-center rounded-full bg-slate-100 text-slate-500"><Icon name="close" /></button>
                    </div>
                </header>
                <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-5">
                <section className="mb-4 rounded-3xl bg-slate-800 p-4 text-white">
                    <h4 className="mb-3 text-lg font-black">내 기록</h4>
                    <div className="grid grid-cols-2 gap-2 text-center">
                        <div className="rounded-xl bg-white/10 p-3"><p className="text-xs text-white/70">총 읽은 날</p><p className="mt-1 text-xl font-black">{getDaysRead(currentUser)}일</p></div>
                        <div className="rounded-xl bg-white/10 p-3"><p className="text-xs text-white/70">최장 연속</p><p className="mt-1 text-xl font-black">{currentUser?.maxStreak ?? currentUser?.streak ?? 0}일</p></div>
                        <div className="rounded-xl bg-white/10 p-3"><p className="text-xs text-white/70">현재 점수</p><p className="mt-1 text-xl font-black">{currentUser?.score || 0}점</p></div>
                        <div className="rounded-xl bg-white/10 p-3"><p className="text-xs text-white/70">현재 달란트</p><p className="mt-1 text-xl font-black">⭐ {currentUser?.talent || 0}</p></div>
                    </div>
                </section>
                <section className="mb-4 rounded-2xl border border-blue-100 bg-blue-50 p-4 text-sm leading-6 text-slate-700">
                    <h4 className="mb-2 text-base font-black text-blue-900">어떻게 쌓이나요?</h4>
                    <div className="space-y-1.5">
                        <p><b>점수</b> = 하루 첫 읽기 10점 + 연속 보너스(최대 5)</p>
                        <p><b>달란트</b> = 하루 첫 읽기 10+연속(최대 7), 퀴즈 정답 +10(2번째 시도 +5)</p>
                        <p className="font-black text-blue-800">달란트는 하루 1번만 적립돼요.</p>
                    </div>
                </section>
                <h4 className="mb-3 text-lg font-black text-slate-800">업적 배지</h4>
                <div className="grid grid-cols-3 gap-3">
                    {ACHIEVEMENTS.map((achievement) => {
                        const earned = (currentUser && currentUser.achievements) ? currentUser.achievements.indexOf(achievement.id) !== -1 : false;
                        return (
                            <div key={achievement.id} className={`p-3 rounded-xl text-center border ${earned ? 'bg-yellow-50 border-yellow-200' : 'bg-slate-50 border-slate-100 opacity-40'}`}>
                                <div className={`text-2xl mb-1 ${earned ? '' : 'grayscale'}`}>{achievement.emoji}</div>
                                <p className="text-[10px] font-bold text-slate-700 leading-tight">{achievement.title}</p>
                                <span className="sr-only">{earned ? '획득' : '미획득'}</span>
                            </div>
                        );
                    })}
                </div>
                <div className="mt-4 bg-blue-50 p-3 rounded-xl border border-blue-100">
                    <p className="text-xs text-blue-700 text-center">
                        획득한 업적: <strong>{new Set(currentUser?.achievements || []).size}</strong> / {ACHIEVEMENTS.length}
                    </p>
                </div>
                </div>
                <footer className="shrink-0 border-t border-slate-200 bg-white px-5 py-3">
                    <button onClick={onClose} className="min-h-11 w-full rounded-2xl bg-slate-900 font-bold text-white">닫기</button>
                </footer>
            </section>
        </div>
    );
};

export default AchievementsModal;
