import React, { useState, useEffect, useCallback } from 'react';

const STEPS = [
    {
        id: 'admin-tut-tabs',
        tab: 'members',
        emoji: '📑',
        title: '관리 메뉴 탭',
        text: '공동체 관리 페이지는 4개의 탭으로 구성되어 있어요.\n교인 관리 / 조직 관리 / 공지사항 / 설정을 탭으로 이동하며 사용하세요.',
        position: 'below',
    },
    {
        id: 'admin-tut-member-list',
        tab: 'members',
        emoji: '👥',
        title: '교인 목록',
        text: '교회에 가입한 모든 교인을 한눈에 볼 수 있어요.\n각 교인의 부서/소그룹, 진도(DAY), 점수, 마지막 읽은 날짜가 표시됩니다.\n오늘 읽은 교인 이름에는 초록색 ✓ 가 표시돼요.',
        position: 'below',
    },
    {
        id: 'admin-tut-sort-options',
        tab: 'members',
        emoji: '🔀',
        title: '정렬 옵션',
        text: '이름순 / 진행순 / 점수순 / 소그룹순으로 교인 목록을 정렬할 수 있어요.\n소그룹순으로 보면 소그룹별로 묶어서 한눈에 볼 수 있어요.',
        position: 'below',
    },
    {
        id: 'admin-tut-manage-btns',
        tab: 'members',
        emoji: '⚙️',
        title: '교인 관리 버튼',
        text: '각 교인 행 오른쪽에 3가지 관리 버튼이 있어요:\n↻ 소그룹 배정/변경\n✎ 비밀번호 변경 (비밀번호를 잊어버린 교인 지원)\n✕ 교인 삭제',
        warning: '⚠️ 삭제 처리된 교인은 목록에서 숨겨지며, 필요하면 다시 복원할 수 있습니다.',
        position: 'below',
    },
    {
        id: 'admin-tut-org-section',
        tab: 'org',
        emoji: '📋',
        title: '조직 관리',
        text: '교회의 부서와 소그룹을 자유롭게 구성할 수 있어요.\n부서를 추가하고 그 안에 소그룹을 만드세요.\n조직을 저장한 뒤, 교인 관리 탭의 ↻ 버튼으로 각 교인에게 소그룹을 배정하세요.',
        position: 'below',
    },
    {
        id: 'admin-tut-announcement-section',
        tab: 'announcement',
        emoji: '📢',
        title: '공지사항',
        text: '교인들의 성경읽기 화면에 공지를 띄울 수 있어요.\n공지 내용과 링크 버튼을 설정하고 "공지 표시 활성화"를 체크하면 교인들에게 즉시 공지가 노출됩니다.',
        position: 'below',
    },
    {
        id: 'admin-tut-settings-section',
        tab: 'settings',
        emoji: '🔑',
        title: '교회 입장코드',
        text: '교인들이 앱에 가입할 때 사용하는 입장코드를 여기서 변경할 수 있어요.\n입장코드는 4자리 이상이어야 하며, 변경 후에는 새로 가입하는 교인에게 새 코드를 알려주세요.',
        position: 'below',
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
                    ? 'w-4 h-1.5 bg-blue-400'
                    : i < current
                    ? 'w-1.5 h-1.5 bg-blue-200'
                    : 'w-1.5 h-1.5 bg-slate-200'
            }`} />
        ))}
    </div>
);

const ChurchAdminTutorial = ({ onClose, onComplete, onTabChange }) => {
    const [step, setStep] = useState(0);
    const [rect, setRect] = useState(null);
    const [ready, setReady] = useState(false);
    const [animating, setAnimating] = useState(false);

    const current = STEPS[step];
    const isLast = step === STEPS.length - 1;

    const focusStep = useCallback((stepIdx, prevTab) => {
        const s = STEPS[stepIdx];
        setReady(false);
        setAnimating(true);

        const tabChanged = s.tab && s.tab !== prevTab;
        if (tabChanged && onTabChange) {
            onTabChange(s.tab);
        }

        const delay = tabChanged ? 550 : 0;

        setTimeout(() => {
            const target = document.getElementById(s.id);
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
        }, delay);
    }, [onTabChange]);

    useEffect(() => {
        focusStep(0, null);
    }, []);  // eslint-disable-line react-hooks/exhaustive-deps

    const goNext = () => {
        if (animating || isLast) return;
        const prevTab = STEPS[step].tab;
        setStep(s => {
            const next = s + 1;
            focusStep(next, prevTab);
            return next;
        });
    };

    const goPrev = () => {
        if (animating || step === 0) return;
        const prevTab = STEPS[step].tab;
        setStep(s => {
            const prev = s - 1;
            focusStep(prev, prevTab);
            return prev;
        });
    };

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
        border: '2.5px solid #60a5fa',
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
                    <div className="relative bg-white rounded-2xl shadow-2xl border border-blue-200 overflow-hidden">
                        <div className="h-1 bg-gradient-to-r from-blue-400 via-indigo-400 to-blue-400" />
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
                                    닫기
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
                                    className="text-xs font-bold text-white bg-blue-500 hover:bg-blue-600 px-4 py-2 rounded-xl transition-colors shadow-sm disabled:opacity-40 flex items-center gap-1">
                                    {isLast ? '✅ 완료' : '다음 →'}
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {(!ready || animating) && (
                <div className="fixed inset-0 z-[9994] flex items-center justify-center pointer-events-none">
                    <div className="bg-white/95 rounded-2xl px-6 py-4 shadow-xl border border-blue-100 flex items-center gap-3">
                        <div className="w-5 h-5 border-2 border-blue-300 border-t-blue-500 rounded-full animate-spin" />
                        <span className="text-sm text-slate-500 font-medium">이동 중...</span>
                    </div>
                </div>
            )}
        </>
    );
};

export default ChurchAdminTutorial;
