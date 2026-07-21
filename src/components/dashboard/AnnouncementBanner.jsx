import React from 'react';
import MarkdownRenderer from '../MarkdownRenderer';

const AnnouncementBanner = ({ announcement }) => {
    if (!announcement || !announcement.enabled || !announcement.text) return null;

    const links = (Array.isArray(announcement.links) ? announcement.links : [])
        .filter(link => link?.url && link?.text);
    if (links.length === 0 && announcement.linkUrl && announcement.linkText) {
        links.push({ url: announcement.linkUrl, text: announcement.linkText });
    }

    return (
        <aside aria-label="교회 소식" className="mb-6 overflow-hidden rounded-2xl border border-indigo-100 bg-white shadow-[0_10px_30px_-22px_rgba(30,41,59,0.55)]">
            <div className="h-1 bg-gradient-to-r from-indigo-500 via-blue-500 to-cyan-400" />
            <div className="flex items-start gap-3.5 px-4 py-4 sm:px-5 sm:py-5">
                <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-indigo-50 text-indigo-600 ring-1 ring-indigo-100">
                    <svg viewBox="0 0 24 24" fill="none" className="h-5 w-5" aria-hidden="true">
                        <path d="M4 13.5V10a2 2 0 0 1 2-2h2l8-4v15l-8-4H6a2 2 0 0 1-2-1.5Z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
                        <path d="m8 15 1.3 4H6.5L5 15m14-7.5c.7.6 1 1.5 1 2.5s-.3 1.9-1 2.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                </div>

                <div className="min-w-0 flex-1">
                    <p className="mb-1.5 text-[11px] font-black tracking-[0.12em] text-indigo-500">교회 소식</p>
                    <div className="font-bold leading-snug text-slate-800 [&_p]:mb-0">
                        <MarkdownRenderer content={announcement.text} fontSize={17} />
                    </div>

                    {links.length > 0 && (
                        <div className="mt-3 flex flex-wrap items-center gap-2">
                            {links.map((link, idx) => (
                                <a
                                    key={`${link.url}-${idx}`}
                                    href={link.url}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className={`inline-flex min-h-10 items-center justify-center rounded-full px-4 py-2 text-sm font-black transition active:scale-[0.98] ${idx === 0
                                        ? 'bg-indigo-600 text-white shadow-[0_8px_20px_-12px_rgba(79,70,229,0.9)] hover:bg-indigo-700'
                                        : 'border border-slate-200 bg-white text-slate-700 hover:border-indigo-200 hover:text-indigo-700'
                                    }`}
                                >
                                    {link.text}
                                    <svg viewBox="0 0 20 20" fill="none" className="ml-1.5 h-3.5 w-3.5" aria-hidden="true">
                                        <path d="M7 5h8v8M15 5l-9 9" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                                    </svg>
                                </a>
                            ))}
                        </div>
                    )}
                </div>
            </div>
        </aside>
    );
};

export default AnnouncementBanner;
