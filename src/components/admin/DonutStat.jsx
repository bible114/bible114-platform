import React from 'react';

const DonutStat = ({
    value = 0,
    max = 100,
    size = 96,
    stroke = 10,
    label,
    center,
    tone = '#4f46e5',
    track = '#e2e8f0',
}) => {
    const percent = max > 0 ? Math.min(100, Math.max(0, (value / max) * 100)) : 0;
    const radius = (size - stroke) / 2;
    const circumference = 2 * Math.PI * radius;
    const offset = circumference - (percent / 100) * circumference;

    return (
        <div className="inline-flex flex-col items-center gap-2">
            <div className="relative" style={{ width: size, height: size }}>
                <svg width={size} height={size} className="-rotate-90">
                    <circle
                        cx={size / 2}
                        cy={size / 2}
                        r={radius}
                        fill="none"
                        stroke={track}
                        strokeWidth={stroke}
                    />
                    <circle
                        cx={size / 2}
                        cy={size / 2}
                        r={radius}
                        fill="none"
                        stroke={tone}
                        strokeWidth={stroke}
                        strokeLinecap="round"
                        strokeDasharray={circumference}
                        strokeDashoffset={offset}
                    />
                </svg>
                <div className="absolute inset-0 flex items-center justify-center text-sm font-black text-slate-900">
                    {center || `${Math.round(percent)}%`}
                </div>
            </div>
            {label && <p className="text-xs font-bold text-slate-500">{label}</p>}
        </div>
    );
};

export default DonutStat;
