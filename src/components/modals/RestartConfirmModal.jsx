import React from 'react';

const RestartConfirmModal = ({ show, onClose, onRestart }) => {
    if (!show) return null;

    return (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
            <div className="bg-white rounded-2xl p-6 w-full max-w-sm shadow-2xl" onClick={e => e.stopPropagation()}>
                <div className="text-center mb-6">
                    <div className="text-5xl mb-4">🔄</div>
                    <h3 className="text-xl font-bold text-slate-800 mb-2">처음부터 다시 시작할까요?</h3>
                    <p className="text-sm text-slate-500 leading-relaxed">
                        지금까지의 기록(점수, 묵상, 업적)이<br />
                        <strong className="text-red-500">모두 초기화</strong>됩니다.<br />
                        오늘부터 Day 1로 새롭게 시작해요!
                    </p>
                </div>
                <div className="bg-amber-50 p-3 rounded-xl border border-amber-200 mb-4">
                    <p className="text-xs text-amber-700 text-center">
                        ⚠️ 이 작업은 되돌릴 수 없습니다!
                    </p>
                </div>
                <div className="space-y-2">
                    <button onClick={onRestart} className="w-full bg-red-500 text-white font-bold py-3 rounded-xl hover:bg-red-600 transition-colors">네, 처음부터 다시 시작합니다</button>
                    <button onClick={onClose} className="w-full bg-slate-100 text-slate-600 font-bold py-3 rounded-xl hover:bg-slate-200">취소</button>
                </div>
            </div>
        </div>
    );
};

export default RestartConfirmModal;
