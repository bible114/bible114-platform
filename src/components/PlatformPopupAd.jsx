import React, { useEffect, useState } from 'react';
import { db } from '../utils/firebase';
import MarkdownRenderer from './MarkdownRenderer';

// 플랫폼 전체 팝업 광고 — settings/platformPopup 문서를 읽어 모든 사용자(게스트 포함)에게 표시.
// 슈퍼관리자가 내용을 수정하면 updatedAt이 바뀌어 새 팝업으로 취급되므로,
// "7일 동안 보지 않기"를 눌렀더라도 내용이 갱신되면 새 팝업으로 다시 표시된다.
const HIDE_WEEK_KEY = 'b114_popup_hide_week_v1';
const SESSION_CLOSED_KEY = 'b114_popup_closed_v1';
const WEEK_IN_MS = 7 * 24 * 60 * 60 * 1000;

const getPopupId = (data) => {
    const seconds = data?.updatedAt?.seconds ?? 'initial';
    const nanoseconds = data?.updatedAt?.nanoseconds ?? 0;
    return `${seconds}:${nanoseconds}`;
};

const PlatformPopupAd = () => {
    const [popup, setPopup] = useState(null);

    useEffect(() => {
        if (!db) return undefined;
        let alive = true;
        db.collection('settings').doc('platformPopup').get().then(snap => {
            if (!alive || !snap.exists) return;
            const data = snap.data();
            const hasContent = Boolean(
                (data?.title || '').trim() || (data?.text || '').trim() || (data?.imageUrl || '').trim()
            );
            if (!data?.enabled || !hasContent) return;
            const id = getPopupId(data);
            try {
                if (sessionStorage.getItem(SESSION_CLOSED_KEY) === id) return;
                const hidden = JSON.parse(localStorage.getItem(HIDE_WEEK_KEY) || 'null');
                if (hidden?.id === id && Number(hidden?.expiresAt) > Date.now()) return;
            } catch { /* 저장소 접근 실패 시 그냥 표시 */ }
            setPopup({ ...data, id });
        }).catch(() => { /* 팝업은 부가 기능 — 조회 실패는 조용히 무시 */ });
        return () => { alive = false; };
    }, []);

    if (!popup) return null;

    const close = () => {
        try { sessionStorage.setItem(SESSION_CLOSED_KEY, popup.id); } catch { /* 무시 */ }
        setPopup(null);
    };
    const hideForWeek = () => {
        try {
            localStorage.setItem(HIDE_WEEK_KEY, JSON.stringify({
                id: popup.id,
                expiresAt: Date.now() + WEEK_IN_MS,
            }));
        } catch { /* 무시 */ }
        setPopup(null);
    };

    const links = (Array.isArray(popup.links) ? popup.links : []).filter(link => link?.url && link?.text);

    return (
        <div className="fixed inset-0 z-[10020] flex items-end justify-center bg-slate-950/55 px-4 py-5 backdrop-blur-[2px] sm:items-center" role="dialog" aria-modal="true" aria-label="교회 소식">
            <section className="relative w-full max-w-sm overflow-hidden rounded-[1.75rem] border border-white/70 bg-white shadow-[0_24px_70px_-20px_rgba(15,23,42,0.55)]">
                <button type="button" onClick={close} aria-label="광고 닫기"
                    className="absolute right-3 top-3 z-10 grid h-8 w-8 place-items-center rounded-full bg-slate-950/55 text-sm font-bold text-white backdrop-blur transition hover:bg-slate-950/70 active:scale-95">
                    ✕
                </button>
                {popup.imageUrl ? (
                    <img src={popup.imageUrl} alt="" className="max-h-56 w-full object-cover" />
                ) : null}
                <div className="max-h-[58vh] overflow-y-auto px-5 pb-5 pt-5">
                    <p className="mb-2 text-[11px] font-black tracking-[0.12em] text-indigo-500">교회 소식</p>
                    {popup.title ? <h2 className="pr-7 text-xl font-black leading-snug tracking-tight text-slate-900">{popup.title}</h2> : null}
                    {popup.text ? (
                        <div className={`leading-relaxed text-slate-600 ${popup.title ? 'mt-2.5' : ''}`}>
                            <MarkdownRenderer content={popup.text} fontSize={15} />
                        </div>
                    ) : null}
                    {links.length > 0 && (
                        <div className="mt-4 flex flex-wrap gap-2">
                            {links.map((link, idx) => (
                                <a key={idx} href={link.url} target="_blank" rel="noopener noreferrer"
                                    className="inline-flex min-h-10 flex-1 items-center justify-center rounded-xl bg-slate-900 px-4 py-2.5 text-center text-sm font-black text-white shadow-sm transition hover:bg-indigo-600 active:scale-[0.98]">
                                    {link.text} <span aria-hidden="true" className="ml-1.5 text-xs opacity-70">↗</span>
                                </a>
                            ))}
                        </div>
                    )}
                </div>
                <div className="flex items-center justify-end gap-1 border-t border-slate-100 bg-slate-50/80 px-3 py-2">
                    <button type="button" onClick={hideForWeek}
                        className="rounded-lg px-3 py-2 text-xs font-bold text-slate-500 transition hover:bg-white hover:text-slate-700 active:bg-slate-100">
                        일주일 동안 보지 않기
                    </button>
                    <button type="button" onClick={close}
                        className="rounded-lg px-3 py-2 text-xs font-black text-slate-800 transition hover:bg-white active:bg-slate-100">
                        닫기
                    </button>
                </div>
            </section>
        </div>
    );
};

export default PlatformPopupAd;
