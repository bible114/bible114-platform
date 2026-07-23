import React, { useCallback, useEffect, useMemo, useState } from 'react';

const STEPS = [
    {
        id: 'admin-tut-header',
        tab: 'dashboard',
        emoji: '⛪',
        title: '공동체 관리 화면',
        text: '교인과 공동체 운영에 필요한 기능을 모아둔 화면입니다. 성경 읽기로 돌아가거나 이 투어를 다시 열고 싶을 때는 위쪽 버튼을 이용하세요.',
    },
    {
        id: 'admin-tut-tabs',
        tab: 'dashboard',
        emoji: '🗂️',
        title: '여섯 가지 관리 메뉴',
        text: '목양 대시보드, 교인 관리, 달란트 상점, 조직, 공지, 설정으로 나뉩니다. 메뉴를 누르면 해당 관리 화면으로 바로 이동해요.',
    },
    {
        id: 'admin-tut-dashboard',
        tab: 'dashboard',
        emoji: '📊',
        title: '목양 현황 먼저 살펴보기',
        text: '오늘 읽은 인원과 최근 7일 읽기율, 평균 진도, 완독자, 장기 미독 교인을 한눈에 확인할 수 있습니다. 완독자 카드는 누르면 명단이 열려요.',
    },
    {
        id: 'admin-tut-member-list',
        tab: 'members',
        emoji: '👥',
        title: '교인 찾기와 관리',
        text: '부서·읽기 상태로 걸러보거나 이름을 검색할 수 있습니다. 교인 행을 누르면 진도, 읽기 상태, 소속, 비밀번호 지원과 삭제·복원 작업이 한곳에 열려요.',
    },
    {
        id: 'admin-tut-talent-shop',
        tab: 'talentShop',
        emoji: '⭐',
        title: '달란트 상점 운영',
        text: '부서별 상점 사용 여부와 상품을 정하고, 교인 화면을 미리 볼 수 있습니다. 구매 요청 처리, 창구 판매, 환불과 필요한 교인의 달란트 초기화도 여기서 합니다.',
    },
    {
        id: 'admin-tut-org-section',
        tab: 'org',
        emoji: '📋',
        title: '부서와 소그룹 구성',
        text: '공동체의 부서와 소그룹을 만들고 저장합니다. 조직을 바꾼 뒤에는 교인 관리에서 각 교인의 소속을 확인해주세요.',
    },
    {
        id: 'admin-tut-announcement-section',
        tab: 'announcement',
        emoji: '📢',
        title: '교인 화면에 공지하기',
        text: '공지 내용과 링크 버튼을 작성하고 공지 표시를 켜면 교인들의 성경 읽기 화면에 나타납니다. 운영자 카카오톡 문의 링크도 함께 관리할 수 있어요.',
    },
    {
        id: 'admin-tut-settings-section',
        tab: 'settings',
        emoji: '⚙️',
        title: '가입 안내와 입장코드',
        text: '성도용 안내문과 관리자 매뉴얼을 인쇄하고, 신규 성도가 공동체에 가입할 때 쓸 입장코드를 변경합니다. 기존 성도는 새 가입 대신 카카오·구글로 기존 기록을 연결하도록 안내해주세요.',
    },
];

const Progress = ({ current }) => (
    <div className="h-1.5 overflow-hidden rounded-full bg-slate-100">
        <div
            className="h-full rounded-full bg-gradient-to-r from-blue-500 to-indigo-500 transition-all duration-300"
            style={{ width: `${((current + 1) / STEPS.length) * 100}%` }}
        />
    </div>
);

const ChurchAdminTutorial = ({ onClose, onComplete, onTabChange }) => {
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
            ? Math.min(220, window.innerHeight * 0.3)
            : window.innerHeight - 80;
        const top = Math.max(8, raw.top);
        const height = Math.max(44, Math.min(raw.height, maxHeight));
        setRect({
            top,
            left: Math.max(8, raw.left),
            width: Math.min(raw.width, window.innerWidth - 16),
            height,
            bottom: top + height,
        });
        setReady(true);
    }, [isMobile, step]);

    useEffect(() => {
        setReady(false);
        setRect(null);
        onTabChange?.(current.tab);

        let settleTimer;
        const renderTimer = window.setTimeout(() => {
            const target = document.getElementById(current.id);
            if (!target) {
                setReady(true);
                return;
            }
            target.scrollIntoView({
                behavior: 'smooth',
                block: isMobile ? 'start' : 'center',
                inline: 'nearest',
            });
            settleTimer = window.setTimeout(measureTarget, 420);
        }, 220);

        return () => {
            window.clearTimeout(renderTimer);
            window.clearTimeout(settleTimer);
        };
    }, [current.id, current.tab, isMobile, measureTarget, onTabChange]);

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
                maxHeight: 'calc(100vh - 24px)',
                overflowY: 'auto',
                zIndex: 9993,
            };
        }

        const width = 380;
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
        border: '3px solid #60a5fa',
        boxShadow: '0 0 0 9999px rgba(15, 23, 42, 0.74)',
        pointerEvents: 'none',
        zIndex: 9991,
        transition: 'all 0.25s ease',
    } : null;

    return (
        <div className="fixed inset-0 z-[9990]" aria-label="관리자 화면 투어">
            {spotlightStyle ? <div style={spotlightStyle} /> : <div className="absolute inset-0 bg-slate-950/75" />}
            <div className="absolute inset-0" aria-hidden="true" />

            {ready && (
                <section
                    role="dialog"
                    aria-modal="true"
                    aria-labelledby="admin-tour-title"
                    style={cardStyle}
                    className="overflow-hidden rounded-3xl border border-blue-200 bg-white shadow-2xl"
                >
                    <div className="bg-gradient-to-r from-blue-500 to-indigo-500 px-5 py-3 text-white">
                        <div className="flex items-center justify-between text-xs font-black">
                            <span>공동체 관리자 사용 안내</span>
                            <span>{step + 1} / {STEPS.length}</span>
                        </div>
                    </div>
                    <div className="p-5">
                        <Progress current={step} />
                        <div className="mt-4 flex items-start gap-3">
                            <span className="text-3xl leading-none" aria-hidden="true">{current.emoji}</span>
                            <div>
                                <h2 id="admin-tour-title" className="text-base font-black text-slate-900">{current.title}</h2>
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
                                className="min-h-11 rounded-xl bg-blue-600 px-5 text-sm font-black text-white"
                            >
                                {isLast ? '투어 마치기' : '다음'}
                            </button>
                        </div>
                    </div>
                </section>
            )}

            {!ready && (
                <div className="fixed inset-0 z-[9994] flex items-center justify-center">
                    <div className="rounded-2xl bg-white px-5 py-3 text-sm font-bold text-slate-600 shadow-xl">관리 화면으로 이동 중…</div>
                </div>
            )}
        </div>
    );
};

export default ChurchAdminTutorial;
