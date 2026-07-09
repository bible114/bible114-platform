import React, { useEffect } from 'react';

const SlideOverPanel = ({
    open,
    title,
    subtitle,
    children,
    footer,
    onClose,
    widthClass = 'max-w-xl',
}) => {
    useEffect(() => {
        if (!open) return undefined;
        const onKeyDown = (event) => {
            if (event.key === 'Escape') onClose?.();
        };
        window.addEventListener('keydown', onKeyDown);
        return () => window.removeEventListener('keydown', onKeyDown);
    }, [open, onClose]);

    if (!open) return null;

    return (
        <div className="fixed inset-0 z-[110] overflow-hidden">
            <div className="absolute inset-0 bg-slate-950/45" onClick={onClose} />
            <section className={`absolute inset-y-0 right-0 flex w-full ${widthClass} bg-white shadow-2xl`}>
                <div className="flex min-h-0 w-full flex-col">
                    <header className="border-b border-slate-100 px-5 py-4 flex items-start justify-between gap-4">
                        <div className="min-w-0">
                            <h2 className="text-lg font-black text-slate-900">{title}</h2>
                            {subtitle && <p className="mt-1 text-sm font-semibold text-slate-500">{subtitle}</p>}
                        </div>
                        <button
                            type="button"
                            onClick={onClose}
                            className="shrink-0 rounded-xl border border-slate-200 px-3 py-2 text-sm font-black text-slate-500 hover:bg-slate-50"
                            aria-label="패널 닫기"
                        >
                            ×
                        </button>
                    </header>
                    <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5">
                        {children}
                    </div>
                    {footer && (
                        <footer className="border-t border-slate-100 bg-slate-50 px-5 py-4">
                            {footer}
                        </footer>
                    )}
                </div>
            </section>
        </div>
    );
};

export default SlideOverPanel;
