import React, { useEffect, useMemo, useState } from 'react';
import { auth, firebase } from '../../utils/firebase';

const DISMISS_KEY = 'b114_social_link_banner_dismissed_v1';
const HIDE_MS = 7 * 24 * 60 * 60 * 1000;

const SocialLinkBanner = ({ currentUser, notice, onNoticeClear, onGoogleLink, onKakaoLink }) => {
    const [dismissedUntil, setDismissedUntil] = useState(() => Number(localStorage.getItem(DISMISS_KEY) || 0));
    const providers = useMemo(() => new Set([
        ...(currentUser?.authProviders || []),
        currentUser?.authProvider,
        ...(auth.currentUser?.providerData || []).map(item => item?.providerId),
    ].filter(Boolean)), [currentUser?.authProvider, currentUser?.authProviders]);
    const hasGoogle = providers.has(firebase.auth.GoogleAuthProvider.PROVIDER_ID);
    const hasKakao = providers.has('kakao.com') || providers.has('oidc.kakao');
    const eligible = currentUser?.role === 'member' && !hasGoogle && !hasKakao;
    const visible = Boolean(notice) || (eligible && Date.now() >= dismissedUntil);

    useEffect(() => {
        if (!notice) return undefined;
        const timer = window.setTimeout(() => onNoticeClear?.(), 8000);
        return () => window.clearTimeout(timer);
    }, [notice, onNoticeClear]);

    if (!visible) return null;
    const dismiss = () => {
        const until = Date.now() + HIDE_MS;
        localStorage.setItem(DISMISS_KEY, String(until));
        setDismissedUntil(until);
        onNoticeClear?.();
    };

    return (
        <section className="mx-4 mb-5 rounded-2xl border border-amber-200 bg-gradient-to-r from-amber-50 to-yellow-50 p-4 shadow-sm">
            <div className="flex items-start justify-between gap-3">
                <div>
                    <p className="text-base font-black text-slate-800">다음부터 카카오/구글로 3초 로그인</p>
                    <p className="mt-1 text-xs leading-relaxed text-slate-600">지금 쓰는 기록은 그대로 두고, 빠른 로그인만 연결해요.</p>
                </div>
                <button type="button" onClick={dismiss} aria-label="7일 동안 숨기기" className="shrink-0 rounded-full px-2 py-1 text-slate-400 hover:bg-white">✕</button>
            </div>
            {notice && <p role="status" className={`mt-3 rounded-xl px-3 py-2 text-sm font-bold ${notice.type === 'success' ? 'bg-emerald-100 text-emerald-800' : 'bg-red-100 text-red-700'}`}>{notice.message}</p>}
            <div className="mt-3 grid grid-cols-2 gap-2">
                <button type="button" onClick={onKakaoLink} disabled={hasKakao} className="rounded-xl bg-[#FEE500] px-3 py-3 text-sm font-black text-[#191919] disabled:opacity-45">{hasKakao ? '✓ 카카오 연결됨' : '💬 카카오 연결'}</button>
                <button type="button" onClick={onGoogleLink} disabled={hasGoogle} className="rounded-xl border border-slate-200 bg-white px-3 py-3 text-sm font-black text-slate-700 disabled:opacity-45">{hasGoogle ? '✓ Google 연결됨' : 'G Google 연결'}</button>
            </div>
            <button type="button" onClick={dismiss} className="mt-2 w-full py-1 text-[11px] font-semibold text-slate-500 underline underline-offset-2">7일 동안 보지 않기</button>
        </section>
    );
};

export default SocialLinkBanner;
