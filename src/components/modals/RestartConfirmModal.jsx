import React, { useEffect, useState } from 'react';

const RestartConfirmModal = ({ show, onClose, onRestart }) => {
    const [submitting, setSubmitting] = useState(false);

    useEffect(() => {
        if (!show) setSubmitting(false);
    }, [show]);

    if (!show) return null;

    const confirmRestart = async () => {
        if (submitting) return;
        setSubmitting(true);
        try {
            const succeeded = await onRestart?.();
            if (succeeded === true) onClose();
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <div
            className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4"
            onClick={(e) => {
                if (!submitting && e.target === e.currentTarget) onClose();
            }}
        >
            <div className="bg-white rounded-2xl p-6 w-full max-w-sm shadow-2xl" onClick={e => e.stopPropagation()} aria-busy={submitting}>
                <div className="text-center mb-6">
                    <div className="text-5xl mb-4">🔄</div>
                    <h3 className="text-xl font-bold text-slate-800 mb-2">Day 1로 다시 시작할까요?</h3>
                    <p className="text-sm text-slate-500 leading-relaxed">
                        현재 점수·연속 읽기·업적을 초기화하고<br />
                        오늘부터 Day 1로 다시 시작합니다.
                    </p>
                </div>
                <div className="mb-4 rounded-xl border border-emerald-200 bg-emerald-50 p-3">
                    <p className="text-xs font-bold leading-relaxed text-emerald-800">
                        ✓ 달란트, 묵상, 과거 읽기 기록, 최고 연속 기록, 완독 횟수는 그대로 보존됩니다.<br />
                        ✓ 같은 날 읽기·퀴즈 보상은 중복 지급되지 않습니다.
                    </p>
                </div>
                <div className="bg-amber-50 p-3 rounded-xl border border-amber-200 mb-4">
                    <p className="text-xs text-amber-700 text-center">⚠️ 초기화한 현재 진도는 되돌릴 수 없습니다.</p>
                </div>
                <div className="space-y-2">
                    <button
                        type="button"
                        onClick={confirmRestart}
                        disabled={submitting}
                        className="w-full bg-red-500 text-white font-bold py-3 rounded-xl hover:bg-red-600 transition-colors disabled:cursor-wait disabled:bg-red-300"
                    >
                        {submitting ? '처리 중…' : '네, Day 1로 다시 시작합니다'}
                    </button>
                    <button
                        type="button"
                        onClick={onClose}
                        disabled={submitting}
                        className="w-full bg-slate-100 text-slate-600 font-bold py-3 rounded-xl hover:bg-slate-200 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                        취소
                    </button>
                </div>
            </div>
        </div>
    );
};

export default RestartConfirmModal;
