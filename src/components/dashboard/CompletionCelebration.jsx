import React, { useEffect, useRef } from 'react';

const CONFETTI = [
    { left: '7%', top: '12%', color: 'bg-yellow-300', rotate: 'rotate-12', delay: '0s' },
    { left: '16%', top: '26%', color: 'bg-pink-400', rotate: '-rotate-12', delay: '0.2s' },
    { left: '25%', top: '9%', color: 'bg-sky-300', rotate: 'rotate-45', delay: '0.4s' },
    { left: '35%', top: '20%', color: 'bg-emerald-300', rotate: '-rotate-6', delay: '0.1s' },
    { left: '47%', top: '8%', color: 'bg-purple-300', rotate: 'rotate-12', delay: '0.5s' },
    { left: '59%', top: '19%', color: 'bg-orange-300', rotate: '-rotate-12', delay: '0.3s' },
    { left: '70%', top: '10%', color: 'bg-rose-400', rotate: 'rotate-45', delay: '0.6s' },
    { left: '81%', top: '25%', color: 'bg-cyan-300', rotate: '-rotate-6', delay: '0.2s' },
    { left: '91%', top: '13%', color: 'bg-amber-300', rotate: 'rotate-12', delay: '0.4s' },
    { left: '11%', top: '68%', color: 'bg-purple-400', rotate: 'rotate-45', delay: '0.5s' },
    { left: '22%', top: '83%', color: 'bg-orange-300', rotate: '-rotate-12', delay: '0.1s' },
    { left: '76%', top: '80%', color: 'bg-pink-300', rotate: 'rotate-12', delay: '0.3s' },
    { left: '88%', top: '66%', color: 'bg-emerald-300', rotate: '-rotate-6', delay: '0.6s' },
];

const toPositiveInteger = (value, fallback) => {
    const number = Number(value);
    return Number.isFinite(number) && number >= 1 ? Math.floor(number) : fallback;
};

const CompletionCelebration = ({ completedRound, newReadCount, onClose }) => {
    const round = toPositiveInteger(completedRound, 1);
    const nextRound = toPositiveInteger(newReadCount, round + 1);
    const closeButtonRef = useRef(null);

    useEffect(() => {
        const previousFocus = document.activeElement;
        const handleKeyDown = (event) => {
            if (event.key === 'Escape') {
                event.preventDefault();
                onClose?.();
            }
            if (event.key === 'Tab') {
                event.preventDefault();
                closeButtonRef.current?.focus();
            }
        };

        closeButtonRef.current?.focus();
        window.addEventListener('keydown', handleKeyDown);
        return () => {
            window.removeEventListener('keydown', handleKeyDown);
            previousFocus?.focus?.();
        };
    }, [onClose]);

    return (
        <div
            className="fixed inset-0 z-[200] flex items-center justify-center overflow-hidden bg-slate-950/75 p-4 backdrop-blur-sm"
            role="dialog"
            aria-modal="true"
            aria-labelledby="completion-celebration-title"
            onClick={(event) => {
                if (event.target === event.currentTarget) onClose?.();
            }}
        >
            <div className="pointer-events-none absolute inset-0" aria-hidden="true">
                {CONFETTI.map((piece, index) => (
                    <span
                        key={`${piece.left}-${piece.top}`}
                        className={`absolute h-3 w-2 rounded-sm ${piece.color} ${piece.rotate} ${index % 2 === 0 ? 'animate-bounce' : 'animate-pulse'}`}
                        style={{ left: piece.left, top: piece.top, animationDelay: piece.delay }}
                    />
                ))}
            </div>

            <div className="relative w-full max-w-sm overflow-hidden rounded-3xl border-2 border-amber-200 bg-white text-center shadow-2xl">
                <div className="h-2 bg-gradient-to-r from-orange-400 via-yellow-300 to-pink-400" />
                <div className="absolute -left-10 -top-10 h-32 w-32 rounded-full bg-yellow-200/50 blur-2xl" />
                <div className="absolute -bottom-12 -right-10 h-36 w-36 rounded-full bg-pink-200/50 blur-2xl" />

                <div className="relative px-6 pb-7 pt-8">
                    <div className="relative mx-auto mb-4 flex h-24 w-24 items-center justify-center">
                        <div className="absolute inset-0 animate-pulse rounded-full bg-gradient-to-br from-yellow-200 to-orange-200" />
                        <span className="relative text-6xl drop-shadow-lg" aria-hidden="true">🎉</span>
                    </div>

                    <p className="mb-2 text-sm font-black tracking-widest text-orange-500">성경 통독을 축하합니다</p>
                    <h2 id="completion-celebration-title" className="text-4xl font-black text-slate-800">
                        {round}독 완주!
                    </h2>
                    <p className="mt-4 text-lg font-bold text-slate-600">
                        <span className="text-purple-600">{nextRound}독</span>을 시작합니다
                    </p>
                    <p className="mt-2 text-sm leading-relaxed text-slate-500">
                        말씀과 함께한 귀한 걸음을 응원합니다.
                    </p>

                    <button
                        ref={closeButtonRef}
                        type="button"
                        onClick={onClose}
                        className="mt-7 w-full rounded-2xl bg-gradient-to-r from-orange-500 to-amber-400 py-3.5 text-base font-black text-white shadow-lg transition hover:from-orange-600 hover:to-amber-500 focus:outline-none focus:ring-4 focus:ring-amber-200 active:scale-[0.98]"
                    >
                        닫기
                    </button>
                </div>
            </div>
        </div>
    );
};

export default CompletionCelebration;
