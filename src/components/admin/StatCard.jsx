import React from 'react';

const StatCard = ({
    label,
    value,
    subvalue,
    icon,
    accent = false,
    tone = 'indigo',
    className = '',
}) => {
    const toneClasses = {
        indigo: 'from-indigo-600 to-blue-700 text-white',
        emerald: 'from-emerald-600 to-teal-700 text-white',
        amber: 'from-amber-500 to-orange-600 text-white',
        rose: 'from-rose-500 to-red-600 text-white',
    };

    return (
        <div className={[
            'rounded-2xl border shadow-sm p-5',
            accent
                ? `bg-gradient-to-br ${toneClasses[tone] || toneClasses.indigo} border-transparent`
                : 'bg-white border-slate-100 text-slate-900',
            className,
        ].join(' ')}>
            <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                    <p className={`text-xs font-bold ${accent ? 'text-white/75' : 'text-slate-500'}`}>{label}</p>
                    <p className="mt-2 text-3xl font-black tracking-tight">{value}</p>
                </div>
                {icon && (
                    <div className={`shrink-0 w-11 h-11 rounded-2xl flex items-center justify-center text-xl ${accent ? 'bg-white/18' : 'bg-slate-50 text-slate-600'}`}>
                        {icon}
                    </div>
                )}
            </div>
            {subvalue && (
                <p className={`mt-4 text-xs font-semibold ${accent ? 'text-white/80' : 'text-slate-500'}`}>
                    {subvalue}
                </p>
            )}
        </div>
    );
};

export default StatCard;
