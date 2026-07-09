import React from 'react';

const ProgressBar = ({
    value = 0,
    max = 100,
    label,
    showValue = true,
    tone = 'indigo',
    className = '',
}) => {
    const percent = max > 0 ? Math.min(100, Math.max(0, Math.round((value / max) * 100))) : 0;
    const toneClasses = {
        indigo: 'bg-indigo-600',
        emerald: 'bg-emerald-600',
        amber: 'bg-amber-500',
        rose: 'bg-rose-500',
        slate: 'bg-slate-700',
    };

    return (
        <div className={className}>
            {(label || showValue) && (
                <div className="mb-1.5 flex items-center justify-between gap-3">
                    {label && <span className="text-xs font-bold text-slate-600">{label}</span>}
                    {showValue && <span className="text-xs font-black text-slate-800">{percent}%</span>}
                </div>
            )}
            <div className="h-2.5 overflow-hidden rounded-full bg-slate-100">
                <div
                    className={`h-full rounded-full transition-all ${toneClasses[tone] || toneClasses.indigo}`}
                    style={{ width: `${percent}%` }}
                />
            </div>
        </div>
    );
};

export default ProgressBar;
