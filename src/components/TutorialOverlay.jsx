import React, { useCallback, useEffect, useMemo, useState } from 'react';

const STEPS = [
    {
        id: 'tut-version-btn',
        emoji: '📚',
        title: '내 통독 계획 확인',
        text: '지금 읽는 통독 계획과 성경 번역이 표시됩니다. 이 버튼을 누르면 개역개정·새번역과 통독 계획을 바꿀 수 있어요.',
    },
    {
        id: 'tut-menu-btn',
        emoji: '☰',
        title: '기록과 설정은 메뉴에서',
        text: '나의 업적·총 통독 기록, 읽기 달력, 날짜 설정, 도움말을 모두 이 메뉴에서 찾을 수 있어요. 화면 투어도 언제든 다시 열 수 있습니다.',
    },
    {
        id: 'tut-daily-video',
        emoji: '🎬',
        title: '오늘 말씀을 영상으로 먼저 만나기',
        text: '성인용·어린이용 영상을 골라 오늘 본문 해설과 기도를 볼 수 있어요. 영상은 선택 사항이며 바로 본문부터 읽어도 됩니다.',
    },
    {
        id: 'tut-bible-header',
        emoji: '↔️',
        title: '오늘 읽을 범위 확인',
        text: 'DAY와 오늘 읽을 성경 범위가 여기에 나옵니다. 화살표로 앞뒤 분량을 살펴볼 수 있지만, 읽기 완료는 현재 내 진도에서만 기록돼요.',
    },
    {
        id: 'tut-tts-area',
        emoji: '🔊',
        title: '눈으로 읽거나 귀로 듣기',
        text: '듣기 버튼을 누르면 본문을 읽어줍니다. 글자 크기와 낭독 속도도 편한 상태로 조절할 수 있어요.',
    },
    {
        id: 'tut-bible-text',
        emoji: '📖',
        title: '오늘의 성경 본문',
        text: '본문을 천천히 읽어보세요. 낭독 중에는 원하는 절을 누르면 그 부분부터 들을 수 있습니다.',
    },
    {
        id: 'tut-quiz-area',
        emoji: '🧩',
        title: '오늘의 퀴즈 (선택)',
        text: '오늘 말씀을 확인하는 선택 퀴즈입니다. 퀴즈를 풀거나 건너뛰지 않아도 읽기 완료와 다음 DAY 진행은 언제든 가능합니다.',
    },
    {
        id: 'tut-read-btn',
        emoji: '✅',
        title: '마쳤다면 읽기 완료',
        text: '오늘 분량을 다 읽거나 들은 뒤 이 버튼을 눌러야 기록이 저장되고 다음 DAY로 넘어갑니다. 하루 첫 완료에 점수와 설정된 달란트가 적립돼요.',
    },
    {
        id: 'tut-memo-section',
        emoji: '✍️',
        title: '받은 은혜를 남기기',
        text: '마지막으로 오늘 받은 말씀을 짧게 기록해보세요. 이전 묵상은 내 기록에서 다시 볼 수 있습니다.',
    },
];

const Progress = ({ current }) => (
    <div className="h-1.5 overflow-hidden rounded-full bg-slate-100">
        <div
            className="h-full rounded-full bg-gradient-to-r from-amber-400 to-orange-400 transition-all duration-300"
            style={{ width: `${((current + 1) / STEPS.length) * 100}%` }}
        />
    </div>
);

const TutorialOverlay = ({ onClose, onComplete }) => {
    const [step, setStep] = useState(0);
    const [rect, setRect] = useState(null);
    const [ready, setReady] = useState(false);
    const [isMobile, setIsMobile] = useState(() => window.innerWidth < 640);
    const current = STEPS[step];
    const isLast = step === STEPS.length - 1;

    const measureTarget = useCallback(() => {
        const target = document.getElementById(STEPS[step].id);
        if (!target) {
            setRect(null);
            setReady(true);
            return;
        }

        const raw = target.getBoundingClientRect();
        if (raw.width < 2 || raw.height < 2) {
            setRect(null);
            setReady(true);
            return;
        }

        const maxHeight = isMobile
            ? Math.min(220, window.innerHeight * 0.32)
            : window.innerHeight - 80;
        setRect({
            top: Math.max(8, raw.top),
            left: Math.max(8, raw.left),
            width: Math.min(raw.width, window.innerWidth - 16),
            height: Math.max(44, Math.min(raw.height, maxHeight)),
            bottom: Math.max(8, raw.top) + Math.max(44, Math.min(raw.height, maxHeight)),
        });
        setReady(true);
    }, [isMobile, step]);

    useEffect(() => {
        setReady(false);
        setRect(null);
        const target = document.getElementById(current.id);

        if (!target) {
            setReady(true);
            return undefined;
        }

        target.scrollIntoView({
            behavior: 'smooth',
            block: isMobile ? 'start' : 'center',
            inline: 'nearest',
        });
        const timer = window.setTimeout(measureTarget, 420);
        return () => window.clearTimeout(timer);
    }, [current.id, isMobile, measureTarget]);

    useEffect(() => {
        const handleResize = () => {
            setIsMobile(window.innerWidth < 640);
            measureTarget();
        };
        window.addEventListener('resize', handleResize);
        return () => window.removeEventListener('resize', handleResize);
    }, [measureTarget]);

    useEffect(() => {
        const handleKeyDown = event => {
            if (event.key === 'Escape') onClose();
            if (event.key === 'ArrowRight' && step < STEPS.length - 1) setStep(value => value + 1);
            if (event.key === 'ArrowLeft' && step > 0) setStep(value => value - 1);
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [onClose, step]);

    const cardStyle = useMemo(() => {
        if (isMobile || !rect) {
            return {
                position: 'fixed',
                left: 12,
                right: 12,
                bottom: 12,
                zIndex: 9993,
            };
        }

        const width = 360;
        const estimatedHeight = 400;
        const hasRoomBelow = window.innerHeight - rect.bottom > estimatedHeight + 24;
        const hasRoomAbove = rect.top > estimatedHeight + 24;
        return {
            position: 'fixed',
            width,
            left: Math.max(16, Math.min(rect.left, window.innerWidth - width - 16)),
            top: hasRoomBelow ? rect.bottom + 16 : undefined,
            bottom: hasRoomBelow ? undefined : (hasRoomAbove ? window.innerHeight - rect.top + 16 : 16),
            maxHeight: 'calc(100vh - 32px)',
            overflowY: 'auto',
            zIndex: 9993,
        };
    }, [isMobile, rect]);

    const finish = () => (onComplete ? onComplete() : onClose());
    const spotlightStyle = rect && ready ? {
        position: 'fixed',
        left: rect.left - 6,
        top: rect.top - 6,
        width: rect.width + 12,
        height: rect.height + 12,
        borderRadius: 18,
        border: '3px solid #fbbf24',
        boxShadow: '0 0 0 9999px rgba(15, 23, 42, 0.72)',
        pointerEvents: 'none',
        zIndex: 9991,
        transition: 'all 0.25s ease',
    } : null;

    return (
        <div className="fixed inset-0 z-[9990]" aria-label="앱 화면 투어">
            {spotlightStyle ? <div style={spotlightStyle} /> : <div className="absolute inset-0 bg-slate-950/75" />}
            <div className="absolute inset-0" aria-hidden="true" />

            {ready && (
                <section
                    role="dialog"
                    aria-modal="true"
                    aria-labelledby="tour-title"
                    style={cardStyle}
                    className="overflow-hidden rounded-3xl border border-amber-200 bg-white shadow-2xl"
                >
                    <div className="bg-gradient-to-r from-amber-400 to-orange-400 px-5 py-3 text-white">
                        <div className="flex items-center justify-between text-xs font-black">
                            <span>성경통독 114 사용 안내</span>
                            <span>{step + 1} / {STEPS.length}</span>
                        </div>
                    </div>
                    <div className="p-5">
                        <Progress current={step} />
                        <div className="mt-4 flex items-start gap-3">
                            <span className="text-3xl leading-none" aria-hidden="true">{current.emoji}</span>
                            <div>
                                <h2 id="tour-title" className="text-base font-black text-slate-900">{current.title}</h2>
                                <p className="mt-2 text-sm font-medium leading-6 text-slate-600">{current.text}</p>
                            </div>
                        </div>
                        {!rect && (
                            <p className="mt-3 rounded-xl bg-slate-50 px-3 py-2 text-xs text-slate-500">
                                이 기능은 현재 화면에서는 보이지 않을 수 있어요. 다음 단계로 계속 둘러볼 수 있습니다.
                            </p>
                        )}
                        <div className="mt-5 flex items-center gap-2">
                            <button type="button" onClick={onClose} className="min-h-11 px-2 text-xs font-bold text-slate-400">
                                투어 종료
                            </button>
                            <div className="flex-1" />
                            {step > 0 && (
                                <button type="button" onClick={() => setStep(value => value - 1)} className="min-h-11 rounded-xl bg-slate-100 px-4 text-sm font-bold text-slate-600">
                                    이전
                                </button>
                            )}
                            <button
                                type="button"
                                onClick={isLast ? finish : () => setStep(value => value + 1)}
                                className="min-h-11 rounded-xl bg-slate-900 px-5 text-sm font-black text-white"
                            >
                                {isLast ? '투어 마치기' : '다음'}
                            </button>
                        </div>
                    </div>
                </section>
            )}

            {!ready && (
                <div className="fixed inset-0 z-[9994] flex items-center justify-center">
                    <div className="rounded-2xl bg-white px-5 py-3 text-sm font-bold text-slate-600 shadow-xl">다음 화면으로 이동 중…</div>
                </div>
            )}
        </div>
    );
};

export default TutorialOverlay;
