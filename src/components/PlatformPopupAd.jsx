import React, { useEffect, useState } from 'react';
import { db } from '../utils/firebase';
import MarkdownRenderer from './MarkdownRenderer';

// 플랫폼 전체 팝업 광고 — settings/platformPopup 문서를 읽어 모든 사용자(게스트 포함)에게 표시.
// 슈퍼관리자가 내용을 수정하면 updatedAt이 바뀌어 새 팝업으로 취급되므로,
// "오늘 하루 보지 않기"를 눌렀던 사용자에게도 다시 표시된다.
const HIDE_TODAY_KEY = 'b114_popup_hide_v1';
const SESSION_CLOSED_KEY = 'b114_popup_closed_v1';

const getPopupId = (data) => String(data?.updatedAt?.seconds ?? 'initial');

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
                const hidden = JSON.parse(localStorage.getItem(HIDE_TODAY_KEY) || 'null');
                if (hidden?.id === id && hidden?.date === new Date().toDateString()) return;
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
    const hideToday = () => {
        try {
            localStorage.setItem(HIDE_TODAY_KEY, JSON.stringify({ id: popup.id, date: new Date().toDateString() }));
        } catch { /* 무시 */ }
        setPopup(null);
    };

    const links = (Array.isArray(popup.links) ? popup.links : []).filter(link => link?.url && link?.text);

    return (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/60 p-5" role="dialog" aria-modal="true" aria-label="안내 팝업">
            <div className="w-full max-w-md overflow-hidden rounded-3xl bg-white shadow-2xl">
                {popup.imageUrl ? (
                    <img src={popup.imageUrl} alt="" className="max-h-72 w-full object-cover" />
                ) : null}
                <div className="max-h-[55vh] overflow-y-auto p-6">
                    {popup.title ? <h2 className="text-xl font-black leading-snug text-slate-900">{popup.title}</h2> : null}
                    {popup.text ? (
                        <div className={`leading-relaxed text-slate-700 ${popup.title ? 'mt-3' : ''}`}>
                            <MarkdownRenderer content={popup.text} fontSize={17} />
                        </div>
                    ) : null}
                    {links.length > 0 && (
                        <div className="mt-5 space-y-2">
                            {links.map((link, idx) => (
                                <a key={idx} href={link.url} target="_blank" rel="noopener noreferrer"
                                    className="block w-full rounded-2xl bg-blue-600 px-5 py-3.5 text-center text-base font-black text-white active:scale-[0.99]">
                                    {link.text}
                                </a>
                            ))}
                        </div>
                    )}
                </div>
                <div className="flex border-t border-slate-100">
                    <button type="button" onClick={hideToday}
                        className="flex-1 px-4 py-4 text-sm font-bold text-slate-400 active:bg-slate-50">
                        오늘 하루 보지 않기
                    </button>
                    <button type="button" onClick={close}
                        className="flex-1 border-l border-slate-100 px-4 py-4 text-sm font-black text-slate-700 active:bg-slate-50">
                        닫기
                    </button>
                </div>
            </div>
        </div>
    );
};

export default PlatformPopupAd;
