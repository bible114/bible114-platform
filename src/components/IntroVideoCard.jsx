import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

const VIDEO_ID = 'yrLSL6qIfAU';
const VIDEO_TITLE = '성경통독 114 소개 영상';
const THUMBNAIL_URL = `https://i.ytimg.com/vi/${VIDEO_ID}/maxresdefault.jpg`;
const EMBED_URL = `https://www.youtube-nocookie.com/embed/${VIDEO_ID}?autoplay=1&rel=0&playsinline=1`;

const IntroVideoCard = () => {
    const [isOpen, setIsOpen] = useState(false);
    const triggerRef = useRef(null);
    const closeButtonRef = useRef(null);

    useEffect(() => {
        if (!isOpen) return undefined;

        const previousOverflow = document.body.style.overflow;
        const handleKeyDown = (event) => {
            if (event.key === 'Escape') setIsOpen(false);
        };

        document.body.style.overflow = 'hidden';
        window.addEventListener('keydown', handleKeyDown);
        closeButtonRef.current?.focus();

        return () => {
            document.body.style.overflow = previousOverflow;
            window.removeEventListener('keydown', handleKeyDown);
        };
    }, [isOpen]);

    const closeVideo = () => {
        setIsOpen(false);
        window.requestAnimationFrame(() => triggerRef.current?.focus());
    };

    return (
        <>
            <button
                ref={triggerRef}
                type="button"
                onClick={() => setIsOpen(true)}
                aria-label={`${VIDEO_TITLE} 재생`}
                className="group mb-4 flex w-full max-w-lg items-center overflow-hidden rounded-2xl border border-hairline bg-cream-card text-left shadow-[0_12px_30px_-22px_rgba(43,58,42,0.55)] transition hover:-translate-y-0.5 hover:border-accent/45 hover:shadow-[0_16px_34px_-22px_rgba(43,58,42,0.65)] focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/60 focus-visible:ring-offset-2 focus-visible:ring-offset-cream md:mb-5"
            >
                <span className="relative aspect-video w-[132px] shrink-0 overflow-hidden bg-ink sm:w-[172px]">
                    <img
                        src={THUMBNAIL_URL}
                        alt=""
                        width="1280"
                        height="720"
                        loading="eager"
                        className="h-full w-full object-cover transition duration-300 group-hover:scale-[1.03]"
                    />
                    <span className="absolute inset-0 bg-ink/15 transition group-hover:bg-ink/5" />
                    <span className="absolute inset-0 flex items-center justify-center">
                        <span className="flex h-11 w-11 items-center justify-center rounded-full bg-white/95 text-accent shadow-lg transition group-hover:scale-105">
                            <svg aria-hidden="true" viewBox="0 0 24 24" className="ml-0.5 h-5 w-5 fill-current">
                                <path d="M8 5.4v13.2L18.5 12 8 5.4Z" />
                            </svg>
                        </span>
                    </span>
                    <span className="absolute bottom-1.5 right-1.5 rounded bg-black/75 px-1.5 py-0.5 text-[10px] font-semibold text-white">
                        0:42
                    </span>
                </span>

                <span className="min-w-0 flex-1 px-3 py-2.5 sm:px-4">
                    <span className="block text-[10px] font-bold uppercase tracking-[0.13em] text-accent">소개 영상</span>
                    <span className="mt-0.5 block font-serif text-[14px] font-semibold leading-snug text-ink sm:text-[16px]">
                        함께 달리는 성경통독
                    </span>
                    <span className="mt-1 block text-[11px] leading-snug text-ink/58 sm:text-[12px]">
                        42초로 성경통독114를 만나보세요
                    </span>
                </span>

                <span aria-hidden="true" className="mr-3 hidden text-lg text-accent/70 transition group-hover:translate-x-0.5 sm:block">
                    →
                </span>
            </button>

            {isOpen && createPortal((
                <div
                    className="fixed inset-0 z-[10040] flex items-center justify-center bg-slate-950/75 p-3 backdrop-blur-sm sm:p-6"
                    onMouseDown={closeVideo}
                >
                    <section
                        role="dialog"
                        aria-modal="true"
                        aria-labelledby="intro-video-title"
                        className="w-full max-w-4xl overflow-hidden rounded-2xl bg-[#111] shadow-2xl"
                        onMouseDown={(event) => event.stopPropagation()}
                    >
                        <div className="flex items-center justify-between gap-4 bg-ink px-4 py-3 text-cream sm:px-5">
                            <h2 id="intro-video-title" className="font-serif text-sm font-semibold sm:text-base">
                                {VIDEO_TITLE}
                            </h2>
                            <button
                                ref={closeButtonRef}
                                type="button"
                                onClick={closeVideo}
                                aria-label="소개 영상 닫기"
                                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-white/25 text-2xl leading-none text-white transition hover:bg-white/10 focus:outline-none focus-visible:ring-2 focus-visible:ring-white"
                            >
                                ×
                            </button>
                        </div>
                        <div className="aspect-video w-full bg-black">
                            <iframe
                                className="h-full w-full"
                                src={EMBED_URL}
                                title={VIDEO_TITLE}
                                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                                referrerPolicy="strict-origin-when-cross-origin"
                                allowFullScreen
                            />
                        </div>
                    </section>
                </div>
            ), document.body)}
        </>
    );
};

export default IntroVideoCard;
