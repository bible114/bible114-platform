import React, { useEffect, useRef } from 'react';
import {
    SOCIAL_LOGIN_TRANSITION_DEADLINE_LABEL,
    SOCIAL_LOGIN_TRANSITION_START_LABEL,
} from '../../utils/socialLoginTransition';

const SocialLoginTransitionModal = ({
    show,
    onClose,
    onKakao,
    onGoogle,
    googleDisabled = false,
    accountLinkMode = false,
}) => {
    const dialogRef = useRef(null);

    useEffect(() => {
        if (!show) return undefined;
        const previouslyFocused = document.activeElement;
        const previousBodyOverflow = document.body.style.overflow;
        document.body.style.overflow = 'hidden';
        const handleKeyDown = event => {
            if (event.key === 'Escape') {
                event.preventDefault();
                onClose();
                return;
            }
            if (event.key !== 'Tab') return;
            const focusable = dialogRef.current?.querySelectorAll(
                'button:not([disabled]), a[href], summary, input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
            );
            if (!focusable?.length) {
                event.preventDefault();
                dialogRef.current?.focus();
                return;
            }
            const first = focusable[0];
            const last = focusable[focusable.length - 1];
            if (!dialogRef.current?.contains(document.activeElement)) {
                event.preventDefault();
                (event.shiftKey ? last : first).focus();
            } else if (event.shiftKey && (document.activeElement === first || document.activeElement === dialogRef.current)) {
                event.preventDefault();
                last.focus();
            } else if (!event.shiftKey && document.activeElement === last) {
                event.preventDefault();
                first.focus();
            }
        };
        document.addEventListener('keydown', handleKeyDown);
        dialogRef.current?.querySelector('button:not([disabled])')?.focus();
        return () => {
            document.removeEventListener('keydown', handleKeyDown);
            document.body.style.overflow = previousBodyOverflow;
            previouslyFocused?.focus?.();
        };
    }, [onClose, show]);

    if (!show) return null;

    return (
        <div className="fixed inset-0 z-[10030] flex items-end justify-center overflow-y-auto bg-black/60 p-0 sm:items-center sm:p-5">
            <section
                ref={dialogRef}
                role="dialog"
                aria-modal="true"
                aria-labelledby="social-login-transition-title"
                tabIndex={-1}
                className="max-h-[calc(100dvh-16px)] w-full max-w-md overflow-y-auto rounded-t-3xl bg-white p-5 pb-[calc(env(safe-area-inset-bottom,0px)+24px)] shadow-2xl sm:max-h-[calc(100dvh-40px)] sm:rounded-3xl sm:p-6"
            >
                <div className="rounded-2xl bg-red-50 px-4 py-3 text-center">
                    <p className="text-sm font-black text-red-700">중요 · 로그인 방식 변경 안내</p>
                    <p className="mt-1 text-lg font-black text-slate-900">{SOCIAL_LOGIN_TRANSITION_DEADLINE_LABEL}까지 연결해주세요</p>
                </div>

                <h2 id="social-login-transition-title" className="mt-4 text-xl font-black leading-snug text-slate-900">
                    {SOCIAL_LOGIN_TRANSITION_START_LABEL}부터<br />카카오·구글 로그인만 이용합니다
                </h2>
                <p className="mt-2 text-sm leading-relaxed text-slate-600">
                    기존 이름·생년월일·비밀번호만으로 로그인하는 방식은 종료될 예정입니다.
                </p>

                <div className="mt-4 rounded-2xl border border-blue-200 bg-blue-50 p-4">
                    <p className="text-sm font-black text-blue-950">기존 가입자는 새로 가입하지 마세요</p>
                    <p className="mt-1 text-xs font-bold leading-relaxed text-blue-800">
                        지금 계정에 SNS를 연결하면 기존 진도와 달란트를 그대로 연결하고, 소속 교회도 유지합니다.
                    </p>
                    {!accountLinkMode && (
                        <ol className="mt-3 space-y-1.5 text-xs font-bold leading-relaxed text-blue-950">
                            <li>1. 카카오 또는 구글로 시작</li>
                            <li>2. <strong>기존 진도·달란트 이어보기</strong> 선택</li>
                            <li>3. 예전 가입 정보를 한 번만 확인</li>
                        </ol>
                    )}
                </div>

                <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-2">
                    <button
                        type="button"
                        onClick={onKakao}
                        className="min-h-12 rounded-xl bg-[#FEE500] px-4 py-3 text-sm font-black text-[#191919]"
                    >
                        카카오 {accountLinkMode ? '연결하기' : '연결 시작'}
                    </button>
                    <button
                        type="button"
                        onClick={onGoogle}
                        disabled={googleDisabled}
                        className="min-h-12 rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-black text-slate-700 disabled:bg-slate-100 disabled:text-slate-400"
                    >
                        Google {accountLinkMode ? '연결하기' : '연결 시작'}
                    </button>
                </div>
                {googleDisabled && (
                    <p className="mt-2 text-center text-xs font-bold text-amber-700">
                        카카오톡 안에서는 Google 연결이 제한됩니다. 카카오를 이용하거나 다른 브라우저로 열어주세요.
                    </p>
                )}

                <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-3.5 py-3 text-xs font-bold leading-relaxed text-amber-900">
                    기존 가입자가 ‘처음 시작하기’로 새 계정을 만들면 이전 기록과 달란트가 나뉠 수 있습니다.
                </div>

                <button
                    type="button"
                    onClick={onClose}
                    className="mt-4 min-h-12 w-full rounded-xl bg-slate-800 px-4 py-3 text-sm font-black text-white"
                >
                    내용을 확인했습니다
                </button>
            </section>
        </div>
    );
};

export default SocialLoginTransitionModal;
