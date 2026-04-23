import React from 'react';
import Icon from '../Icon';
import { LEVEL_SYSTEM } from '../../data/levels';

const ScoreInfoModal = ({ show, onClose, myLevel, score }) => {
    if (!show) return null;

    return (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
            <div className="bg-white rounded-2xl p-6 w-full max-w-sm shadow-2xl" onClick={e => e.stopPropagation()}>
                <div className="flex justify-between items-center mb-4 border-b pb-2">
                    <h3 className="text-xl font-bold">💡 점수 & 계급 안내</h3>
                    <button onClick={onClose} className="text-slate-400"><Icon name="close" /></button>
                </div>
                <div className="space-y-4 overflow-y-auto max-h-[60vh]">
                    <div><h4 className="font-bold text-blue-600 mb-1">나의 등급</h4>
                        <div className="flex items-center gap-3 bg-blue-50 p-3 rounded-xl border border-blue-100">
                            <div className="text-3xl">{myLevel.emoji}</div>
                            <div><div className="font-bold text-lg">{myLevel.title}</div><div className="text-xs text-slate-500">현재 {score}점</div></div>
                        </div>
                    </div>
                    <div><h4 className="font-bold text-slate-700 mb-1">점수 모으는 법</h4>
                        <ul className="text-sm text-slate-600 space-y-1 list-disc pl-4">
                            <li>매일 읽기 완료: <strong>+10점</strong></li>
                            <li>연속 읽기 보너스: <strong>매일 +1점씩 증가 (최대 +5점)</strong></li>
                        </ul>
                    </div>
                    <div><h4 className="font-bold text-slate-700 mb-1">천로역정 계급표</h4>
                        <div className="grid gap-2 text-sm">
                            {LEVEL_SYSTEM.map((lvl, idx) => (
                                <div key={idx} className={`flex items-center gap-2 p-2 rounded ${lvl.title === myLevel.title ? 'bg-yellow-50 border border-yellow-200' : ''}`}>
                                    <span className="text-xl">{lvl.emoji}</span><span className="flex-1">{lvl.title}</span><span className="text-slate-400 text-xs">{lvl.min}pt~</span>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
                <button onClick={onClose} className="w-full bg-slate-100 font-bold py-3 rounded-xl mt-4 text-slate-600">닫기</button>
            </div>
        </div>
    );
};

export default ScoreInfoModal;
