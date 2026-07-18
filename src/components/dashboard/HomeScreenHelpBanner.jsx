import React, { useState } from 'react';

const DISMISS_KEY = 'b114_home_screen_help_dismissed_v1';

const isRunningStandalone = () => (
    (typeof window !== 'undefined' && window.matchMedia?.('(display-mode: standalone)').matches)
    || (typeof navigator !== 'undefined' && navigator.standalone === true)
);

const HomeScreenHelpBanner = () => {
    const [dismissed, setDismissed] = useState(() => {
        if (isRunningStandalone()) return true;
        try {
            return localStorage.getItem(DISMISS_KEY) === '1';
        } catch {
            return false;
        }
    });

    if (dismissed) return null;

    const dismiss = () => {
        try {
            localStorage.setItem(DISMISS_KEY, '1');
        } catch {
            // 저장을 막은 브라우저에서도 현재 화면에서는 닫힌다.
        }
        setDismissed(true);
    };

    return (
        <aside className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-emerald-950 shadow-sm" aria-label="홈 화면 추가 안내">
            <div className="flex items-start gap-3">
                <div className="min-w-0 flex-1">
                    <p className="text-base font-black">📱 다음부터 114 아이콘으로 바로 들어오세요</p>
                    <p className="mt-1 text-sm font-bold leading-relaxed text-emerald-800">홈 화면에 한 번만 추가하면 카카오톡에서 주소를 다시 찾지 않아도 돼요.</p>
                </div>
                <button type="button" onClick={dismiss} aria-label="홈 화면 추가 안내 닫기" className="flex min-h-11 min-w-11 items-center justify-center rounded-full text-xl text-emerald-700 hover:bg-white">×</button>
            </div>
            <details className="mt-3 rounded-xl border border-emerald-200 bg-white/80">
                <summary className="flex min-h-11 cursor-pointer items-center px-3 text-sm font-black text-emerald-900">기종별 추가 방법 보기</summary>
                <div className="space-y-3 border-t border-emerald-100 px-3 py-3 text-sm font-bold leading-relaxed text-emerald-900">
                    <p>🍎 아이폰 Safari: 아래 공유 ⬆︎ → 홈 화면에 추가 → 추가</p>
                    <p>🤖 갤럭시 Chrome·삼성인터넷: ⋮ 또는 ☰ → 홈 화면에 추가 → 추가</p>
                </div>
            </details>
        </aside>
    );
};

export default HomeScreenHelpBanner;
