import React from 'react';
import Icon from '../Icon';
import { ACHIEVEMENTS } from '../../data/achievements';

const AchievementsModal = ({ show, onClose, currentUser }) => {
    if (!show) return null;

    return (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
            <div className="bg-white rounded-2xl p-6 w-full max-w-sm shadow-2xl" onClick={e => e.stopPropagation()}>
                <div className="flex justify-between items-center mb-4 border-b pb-2">
                    <h3 className="text-xl font-bold text-slate-800">🏅 나의 업적</h3>
                    <button onClick={onClose} className="text-slate-400"><Icon name="close" /></button>
                </div>
                <div className="grid grid-cols-3 gap-3 overflow-y-auto max-h-[60vh]">
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
                        획득한 업적: <strong>{(currentUser && currentUser.achievements ? currentUser.achievements.length : 0)}</strong> / {ACHIEVEMENTS.length}
                    </p>
                </div>
                <button onClick={onClose} className="w-full bg-slate-100 font-bold py-3 rounded-xl mt-4 text-slate-600">닫기</button>
            </div>
        </div>
    );
};

export default AchievementsModal;
