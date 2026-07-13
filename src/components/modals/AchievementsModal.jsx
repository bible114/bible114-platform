import React from 'react';
import Icon from '../Icon';
import { ACHIEVEMENTS } from '../../data/achievements';
import { getDaysRead } from '../../utils/helpers';

const AchievementsModal = ({ show, onClose, currentUser }) => {
    if (!show) return null;

    return (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
            <div className="bg-white rounded-2xl p-5 w-full max-w-md shadow-2xl max-h-[92vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
                <div className="flex justify-between items-center mb-4 border-b pb-2">
                    <h3 className="text-xl font-bold text-slate-800">🏅 나의 업적</h3>
                    <button onClick={onClose} className="text-slate-400"><Icon name="close" /></button>
                </div>
                <section className="mb-4 rounded-2xl bg-slate-800 p-4 text-white">
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
                            </div>
                        );
                    })}
                </div>
                <div className="mt-4 bg-blue-50 p-3 rounded-xl border border-blue-100">
                    <p className="text-xs text-blue-700 text-center">
                        획득한 업적: <strong>{new Set(currentUser?.achievements || []).size}</strong> / {ACHIEVEMENTS.length}
                    </p>
                </div>
                <button onClick={onClose} className="w-full bg-slate-100 font-bold py-3 rounded-xl mt-4 text-slate-600">닫기</button>
            </div>
        </div>
    );
};

export default AchievementsModal;
