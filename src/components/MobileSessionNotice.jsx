import React, { useState } from 'react';
import {
    detectMobileSessionContext,
    getMobileSessionContextLabel,
    isInAppBrowserContext,
} from '../utils/mobileSessionContext';

const DISMISS_KEY = 'b114_mobile_session_notice_dismissed_v1';

const MobileSessionNotice = ({
    className = '',
    dismissible = false,
    showStandalone = false,
}) => {
    const [context] = useState(() => detectMobileSessionContext());
    const [dismissed, setDismissed] = useState(() => {
        if (!dismissible || typeof sessionStorage === 'undefined') return false;
        try {
            return sessionStorage.getItem(DISMISS_KEY) === context;
        } catch {
            return false;
        }
    });

    if (!context || dismissed || (context === 'ios-standalone' && !showStandalone)) return null;

    const dismiss = () => {
        try {
            sessionStorage.setItem(DISMISS_KEY, context);
        } catch {
            // 저장을 막은 브라우저에서도 현재 화면에서는 닫힌다.
        }
        setDismissed(true);
    };

    const isInApp = isInAppBrowserContext(context);
    const contextLabel = getMobileSessionContextLabel(context);

    return (
        <aside
            data-mobile-session-context={context}
            aria-label={isInApp ? `${contextLabel} 브라우저 로그인 안내` : '홈 화면 로그인 안내'}
            className={`rounded-2xl border border-amber-200 bg-amber-50 p-4 text-amber-950 shadow-sm ${className}`.trim()}
        >
            <div className="flex items-start gap-3">
                <span className="text-2xl" aria-hidden="true">{isInApp ? '💬' : '📱'}</span>
                <div className="min-w-0 flex-1">
                    <p className="text-sm font-black">
                        {isInApp ? `지금 ${contextLabel} 안에서 열렸어요` : '114 아이콘에서 처음 열었나요?'}
                    </p>
                    <p className="mt-1 text-xs font-bold leading-relaxed text-amber-900/85">
                        {isInApp
                            ? '여기서 로그인하면 Safari·Chrome·홈 화면 114 아이콘의 로그인과 따로 저장돼요.'
                            : '아이폰은 Safari·카카오톡의 로그인이 홈 화면 114 아이콘으로 옮겨지지 않아요. 이 아이콘 안에서 한 번만 로그인해주세요.'}
                    </p>
                    {isInApp && (
                        <p className="mt-2 rounded-xl bg-white/80 px-3 py-2 text-xs font-black leading-relaxed text-amber-900">
                            계속 편하게 쓰려면 {contextLabel} 화면의 메뉴 → 다른 브라우저로 열기
                        </p>
                    )}
                </div>
                {dismissible && (
                    <button
                        type="button"
                        onClick={dismiss}
                        className="flex min-h-11 min-w-11 shrink-0 items-center justify-center rounded-full text-xl text-amber-800 hover:bg-white"
                        aria-label="로그인 저장 안내 닫기"
                    >
                        ×
                    </button>
                )}
            </div>
        </aside>
    );
};

export default MobileSessionNotice;
