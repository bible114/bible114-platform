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
        <aside aria-label="교회 소식" className="relative mb-6 overflow-hidden rounded-[1.4rem] border border-slate-200/80 bg-gradient-to-br from-white via-white to-indigo-50/55 shadow-[0_16px_45px_-34px_rgba(15,23,42,0.75)]">
            <div aria-hidden="true" className="pointer-events-none absolute -right-14 -top-20 h-36 w-36 rounded-full bg-indigo-100/50 blur-3xl" />
            <div className="relative px-5 py-4 sm:px-6 sm:py-5">
                <div className="mb-2 flex items-center gap-2">
                    <span className="h-2 w-2 rounded-full bg-indigo-500 ring-4 ring-indigo-50" aria-hidden="true" />
                    <p className="text-[11px] font-black tracking-[0.14em] text-slate-500">교회 소식</p>
                </div>

                <div className="min-w-0">
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
                                        ? 'bg-slate-900 text-white shadow-[0_8px_20px_-12px_rgba(15,23,42,0.9)] hover:bg-indigo-700'
                                        : 'border border-slate-200/90 bg-white/80 text-slate-700 hover:border-indigo-200 hover:text-indigo-700'
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
