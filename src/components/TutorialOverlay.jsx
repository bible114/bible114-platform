import React, { useState, useEffect, useCallback } from 'react';

const STEPS = [
    {
        id: 'tut-version-btn',
        emoji: '📚',
        title: '읽는 버전 바꾸기',
        text: '현재 통독 계획과 성경 버전이 표시돼요.\n탭하면 개역개정, 새번역 등 다른 버전이나 일년일독, 신약일독으로 바꿀 수 있어요. 중간에 바꿔도 진도는 그대로 유지됩니다!',
        position: 'below',
    },
    {
        id: 'tut-streak',
        emoji: '🔥',
        title: '연속 읽기 기록',
        text: '오늘까지 며칠 연속으로 읽었는지 보여줘요.\n하루라도 건너뛰면 0으로 초기화되니 주의하세요. 7일 이상이면 보너스 점수가 더 쌓여요!',
        position: 'below',
    },
    {
        id: 'tut-score',
        emoji: '⭐',
        title: '점수 & 레벨',
        text: '읽기 완료·연속 읽기·메모 작성으로 점수가 쌓여요.\n탭하면 레벨 정보와 점수 획득 방법을 자세히 볼 수 있어요. 점수가 쌓이면 칭호가 바뀝니다!',
        position: 'below',
    },
    {
        id: 'tut-achievements',
        emoji: '🏅',
        title: '업적 배지',
        text: '꾸준히 읽다 보면 다양한 업적이 쌓여요.\n탭하면 내가 달성한 배지와 아직 받지 못한 배지를 한눈에 볼 수 있어요.',
        position: 'below',
    },
    {
        id: 'tut-date-settings',
        emoji: '📅',
        title: '시작 날짜 조정',
        text: '통독 시작 날짜를 조정할 수 있어요.\n실제 독서 진도와 날짜가 맞지 않을 때 이 설정으로 맞춰주세요.',
        position: 'below',
    },
    {
        id: 'tut-calendar',
        emoji: '📆',
        title: '읽기 달력',
        text: '내가 언제 읽었는지 달력으로 확인해요.\n읽은 날은 색깔로 표시되어 한눈에 볼 수 있어요.',
        position: 'below',
    },
    {
        id: 'tut-bible-header',
        emoji: '◀️▶️',
        title: '날짜 이동 & 본문 제목',
        text: '좌우 화살표로 다른 날의 본문을 볼 수 있어요.\n오늘 분량 외에 어제 내용 복습이나 내일 분량 미리 보기도 가능해요. D-숫자는 완독까지 남은 일수예요.',
        warning: '⚠️ 화살표로 다른 날 본문을 보더라도, 읽음 처리는 되지 않아요. 아래 "오늘 읽기 완료" 또는 "한 장 더 읽기" 버튼을 눌러야 기록됩니다!',
        position: 'below',
    },
    {
        id: 'tut-font-size',
        emoji: '🔤',
        title: '글자 크기 조절',
        text: '− 는 작게, + 는 크게 조절해요.\n설정한 크기는 다음 접속에도 그대로 유지돼요.',
        position: 'below',
    },
    {
        id: 'tut-tts-area',
        emoji: '🔊',
        title: '성경 읽어주기 (TTS)',
        text: '"듣기 ▶️" 버튼을 누르면 기기가 본문을 읽어줘요.\n− / + 로 속도도 조절할 수 있어요. 운전 중·이동 중에 특히 유용합니다!',
        position: 'below',
    },
    {
        id: 'tut-bible-text',
        emoji: '📖',
        title: '성경 본문',
        text: '오늘의 성경 본문이 여기에 표시돼요.\n절 번호를 탭하면 그 절부터 낭독을 시작할 수 있어요. 천천히 읽으며 말씀을 묵상해보세요!',
        position: 'above',
    },
    {
        id: 'tut-read-btn',
        emoji: '✅',
        title: '읽기 완료 버튼',
        text: '본문을 다 읽었으면 꼭 이 버튼을 눌러주세요!\n기본 10점 + 연속 읽기 보너스(최대 +5점)가 쌓입니다. 불꽃(🔥)도 올라가요!',
        position: 'above',
    },
    {
        id: 'tut-memo-section',
        emoji: '✍️',
        title: '오늘의 묵상 기록',
        text: '말씀을 읽고 느낀 점을 자유롭게 적어보세요.\n"내 기록 보기"로 이전 묵상을 언제든 다시 읽을 수 있어요.',
        position: 'above',
    },
];

const Tail = ({ direction }) => {
    if (direction === 'up') return (
        <div className="absolute -top-2.5 left-8 w-0 h-0"
            style={{ borderLeft: '10px solid transparent', borderRight: '10px solid transparent', borderBottom: '12px solid white' }} />
    );
    return (
        <div className="absolute -bottom-2.5 left-8 w-0 h-0"
            style={{ borderLeft: '10px solid transparent', borderRight: '10px solid transparent', borderTop: '12px solid white' }} />
    );
};

const ProgressDots = ({ total, current }) => (
    <div className="flex gap-1 flex-wrap justify-center max-w-[200px]">
        {Array.from({ length: total }).map((_, i) => (
            <div key={i} className={`rounded-full transition-all duration-300 ${
                i === current
                    ? 'w-4 h-1.5 bg-amber-400'
                    : i < current
                    ? 'w-1.5 h-1.5 bg-amber-200'
                    : 'w-1.5 h-1.5 bg-slate-200'
            }`} />
        ))}
    </div>
);

// onClose: 건너뛰기/배경 클릭 시 호출
// onComplete: 마지막 단계 "시작하기" 클릭 시 호출 (없으면 onClose 사용)
const TutorialOverlay = ({ onClose, onComplete }) => {
    const [step, setStep] = useState(0);
    const [rect, setRect] = useState(null);
    const [ready, setReady] = useState(false);
    const [animating, setAnimating] = useState(false);

    const current = STEPS[step];
    const isLast = step === STEPS.length - 1;

    const focusStep = useCallback((stepIdx) => {
        setReady(false);
        setAnimating(true);
        const target = document.getElementById(STEPS[stepIdx].id);
        if (!target) {
            setReady(true);
            setAnimating(false);
            return;
        }
        const targetH = target.getBoundingClientRect().height;
        const tallElement = targetH > window.innerHeight * 0.5;
        target.scrollIntoView({ behavior: 'smooth', block: tallElement ? 'start' : 'center' });
        setTimeout(() => {
            const raw = target.getBoundingClientRect();
            let r;
            if (raw.height > window.innerHeight - 220) {
                const top = Math.max(raw.top, 70);
                const maxH = window.innerHeight - top - 240;
                r = {
                    top,
                    left: raw.left,
                    right: raw.right,
                    width: raw.width,
                    height: Math.max(120, Math.min(raw.height, maxH)),
                    bottom: top + Math.max(120, Math.min(raw.height, maxH)),
                };
            } else {
                r = raw;
            }
            setRect(r);
            setReady(true);
            setAnimating(false);
        }, 450);
    }, []);

    useEffect(() => {
        focusStep(step);
    }, [step, focusStep]);

    const goNext = () => { if (!animating && !isLast) setStep(s => s + 1); };
    const goPrev = () => { if (!animating && step > 0) setStep(s => s - 1); };

    const handleFinish = () => {
        if (onComplete) onComplete();
        else onClose();
    };

    const spotlightStyle = rect && ready ? {
        position: 'fixed',
        left: rect.left - 8,
        top: rect.top - 8,
        width: rect.width + 16,
        height: rect.height + 16,
        borderRadius: 16,
        boxShadow: '0 0 0 9999px rgba(0,0,0,0.68)',
        border: '2.5px solid #fbbf24',
        zIndex: 9991,
        pointerEvents: 'none',
        transition: 'all 0.35s cubic-bezier(0.4,0,0.2,1)',
    } : null;

    const getBubbleStyle = () => {
        if (!rect) return {};
        const vw = window.innerWidth;
        const bubbleW = Math.min(320, vw - 32);
        const preferBelow = current.position === 'below';
        const spaceBelow = window.innerHeight - rect.bottom;
        const spaceAbove = rect.top;
        const showBelow = preferBelow ? spaceBelow > 160 : spaceAbove < 160;
        let left = rect.left;
        left = Math.max(16, Math.min(left, vw - bubbleW - 16));
        return {
            position: 'fixed',
            left,
            width: bubbleW,
            top: showBelow ? rect.bottom + 14 : undefined,
            bottom: showBelow ? undefined : window.innerHeight - rect.top + 14,
            zIndex: 9993,
            tailUp: showBelow,
        };
    };

    const bubbleStyle = getBubbleStyle();
    const { tailUp, ...cssStyle } = bubbleStyle;

    return (
        <>
            {spotlightStyle && <div style={spotlightStyle} />}
            <div className="fixed inset-0 z-[9990]" onClick={onClose} />

            {ready && rect && (
                <div style={cssStyle} className="z-[9993]">
                    <div className="relative bg-white rounded-2xl shadow-2xl border border-amber-200 overflow-hidden">
                        <div className="h-1 bg-gradient-to-r from-amber-300 via-yellow-400 to-amber-300" />
                        <Tail direction={tailUp ? 'up' : 'down'} />
                        <div className="px-5 pt-4 pb-5">
                            <div className="flex items-center justify-between mb-3">
                                <ProgressDots total={STEPS.length} current={step} />
                                <span className="text-[11px] text-slate-400 font-bold shrink-0 ml-2">
                                    {step + 1} / {STEPS.length}
                                </span>
                            </div>
                            <div className="flex items-center gap-2 mb-2">
                                <span className="text-2xl leading-none">{current.emoji}</span>
                                <h4 className="font-black text-slate-800 text-sm leading-snug">{current.title}</h4>
                            </div>
                            <p className="text-[13px] text-slate-600 leading-relaxed whitespace-pre-line mb-3">{current.text}</p>
                            {current.warning && (
                                <div className="mb-4 px-3 py-2.5 bg-red-50 border border-red-200 rounded-xl">
                                    <p className="text-[12px] text-red-700 font-bold leading-relaxed whitespace-pre-line">{current.warning}</p>
                                </div>
                            )}
                            <div className="flex items-center gap-2">
                                <button
                                    onClick={onClose}
                                    className="text-xs text-slate-400 hover:text-slate-600 transition-colors px-2 py-1.5 shrink-0">
                                    건너뛰기
                                </button>
                                <div className="flex-1" />
                                {step > 0 && (
                                    <button
                                        onClick={goPrev}
                                        disabled={animating}
                                        className="text-xs font-semibold text-slate-500 bg-slate-100 hover:bg-slate-200 px-3 py-2 rounded-xl transition-colors disabled:opacity-40">
                                        ← 이전
                                    </button>
                                )}
                                <button
                                    onClick={isLast ? handleFinish : goNext}
                                    disabled={animating}
                                    className="text-xs font-bold text-white bg-amber-400 hover:bg-amber-500 px-4 py-2 rounded-xl transition-colors shadow-sm disabled:opacity-40 flex items-center gap-1">
                                    {isLast ? '🙏 시작하기' : '다음 →'}
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {(!ready || animating) && (
                <div className="fixed inset-0 z-[9994] flex items-center justify-center pointer-events-none">
                    <div className="bg-white/95 rounded-2xl px-6 py-4 shadow-xl border border-amber-100 flex items-center gap-3">
                        <div className="w-5 h-5 border-2 border-amber-300 border-t-amber-500 rounded-full animate-spin" />
                        <span className="text-sm text-slate-500 font-medium">이동 중...</span>
                    </div>
                </div>
            )}
        </>
    );
};

export default TutorialOverlay;
