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

export const PlatformPopupCard = ({ popup, onClose, onHideForWeek, preview = false }) => {
    const links = (Array.isArray(popup?.links) ? popup.links : []).filter(link => link?.url && link?.text);

    return (
        <section className="relative w-full max-w-[27rem] overflow-hidden rounded-[1.75rem] border border-slate-200/80 bg-white shadow-[0_28px_80px_-28px_rgba(15,23,42,0.65)]">
            <div className="h-1.5 bg-gradient-to-r from-indigo-500 via-blue-500 to-amber-400" />
            <button type="button" onClick={onClose} disabled={preview} aria-label="광고 닫기"
                className="absolute right-4 top-4 z-10 grid h-8 w-8 place-items-center rounded-full border border-slate-200/80 bg-white/90 text-lg font-medium leading-none text-slate-400 shadow-sm backdrop-blur transition hover:border-slate-300 hover:text-slate-700 active:scale-95 disabled:pointer-events-none">
                <span aria-hidden="true">×</span>
            </button>

            <div className="relative px-6 pb-5 pt-5">
                <div aria-hidden="true" className="pointer-events-none absolute -right-16 -top-20 h-40 w-40 rounded-full bg-indigo-50/80 blur-2xl" />
                <div className="relative flex items-center gap-2.5 pr-10">
                    <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-indigo-50 text-indigo-600 ring-1 ring-indigo-100">
                        <svg viewBox="0 0 24 24" fill="none" className="h-[18px] w-[18px]" aria-hidden="true">
                            <path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9Z" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                            <path d="M10 21h4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
                        </svg>
                    </span>
                    <p className="text-[11px] font-black tracking-[0.14em] text-indigo-600">성경통독114 소식</p>
                </div>

                {popup?.title ? (
                    <h2 className="relative mt-4 break-keep text-[1.35rem] font-black leading-[1.35] tracking-[-0.025em] text-slate-900 sm:text-2xl">
                        {popup.title}
                    </h2>
                ) : null}

                {popup?.imageUrl ? (
                    <div className="relative mt-4 overflow-hidden rounded-2xl bg-slate-100 ring-1 ring-slate-200/70">
                        <img src={popup.imageUrl} alt="" className="max-h-56 w-full object-cover" />
                    </div>
                ) : null}

                {popup?.text ? (
                    <div className={`relative max-h-[36vh] overflow-y-auto pr-1 leading-relaxed text-slate-600 ${popup.title || popup.imageUrl ? 'mt-3' : 'mt-4'}`}>
                        <MarkdownRenderer content={popup.text} fontSize={15} />
                    </div>
                ) : null}

                {links.length > 0 && (
                    <div className="relative mt-4 flex flex-wrap gap-2">
                        {links.map((link, idx) => (
                            <a key={idx} href={preview ? undefined : link.url} target={preview ? undefined : '_blank'} rel={preview ? undefined : 'noopener noreferrer'}
                                className={`inline-flex min-h-10 items-center justify-center rounded-full px-4 py-2 text-center text-sm font-black transition active:scale-[0.98] ${idx === 0 ? 'bg-indigo-600 text-white shadow-[0_8px_22px_-10px_rgba(79,70,229,0.9)] hover:bg-indigo-700' : 'border border-slate-200 bg-white text-slate-700 hover:border-indigo-200 hover:text-indigo-700'} ${preview ? 'pointer-events-none' : ''}`}>
                                {link.text}
                                <svg viewBox="0 0 20 20" fill="none" className="ml-1.5 h-3.5 w-3.5" aria-hidden="true">
                                    <path d="M7 5h8v8M15 5l-9 9" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                                </svg>
                            </a>
                        ))}
                    </div>
                )}
            </div>

            <div className="flex items-center justify-between gap-2 border-t border-slate-100 px-4 py-3">
                <button type="button" onClick={onHideForWeek} disabled={preview}
                    className="rounded-lg px-2 py-1.5 text-xs font-bold text-slate-400 transition hover:bg-slate-50 hover:text-slate-600 active:bg-slate-100 disabled:pointer-events-none">
                    일주일 동안 보지 않기
                </button>
                <button type="button" onClick={onClose} disabled={preview}
                    className="rounded-full border border-slate-200 bg-white px-4 py-2 text-xs font-black text-slate-700 shadow-sm transition hover:border-slate-300 hover:bg-slate-50 active:scale-[0.98] disabled:pointer-events-none">
                    닫기
                </button>
            </div>
        </section>
    );
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

    return (
        <div className="fixed inset-0 z-[10020] flex items-end justify-center bg-slate-950/50 px-4 py-5 backdrop-blur-[3px] sm:items-center" role="dialog" aria-modal="true" aria-label="성경통독114 소식">
            <PlatformPopupCard popup={popup} onClose={close} onHideForWeek={hideForWeek} />
        </div>
    );
};

export default PlatformPopupAd;
