import React, { useCallback, useState } from 'react';

const toneClasses = {
    success: 'border-emerald-200 bg-emerald-50 text-emerald-900',
    error: 'border-red-200 bg-red-50 text-red-900',
    warning: 'border-amber-200 bg-amber-50 text-amber-900',
    info: 'border-indigo-200 bg-indigo-50 text-indigo-900',
};

const toneIcon = {
    success: '✓',
    error: '!',
    warning: '!',
    info: 'i',
};

export const useToast = () => {
    const [toasts, setToasts] = useState([]);

    const removeToast = useCallback((id) => {
        setToasts(prev => prev.filter(t => t.id !== id));
    }, []);

    const pushToast = useCallback((toast) => {
        const id = toast.id || `${Date.now()}_${Math.random().toString(36).slice(2)}`;
        const next = { type: 'info', duration: 3200, ...toast, id };
        setToasts(prev => [...prev, next]);
        if (next.duration > 0) {
            window.setTimeout(() => removeToast(id), next.duration);
        }
        return id;
    }, [removeToast]);

    return {
        toasts,
        removeToast,
        toast: pushToast,
        success: (message, options = {}) => pushToast({ ...options, type: 'success', message }),
        error: (message, options = {}) => pushToast({ ...options, type: 'error', message }),
        warning: (message, options = {}) => pushToast({ ...options, type: 'warning', message }),
        info: (message, options = {}) => pushToast({ ...options, type: 'info', message }),
    };
};

export const ToastItem = ({ toast, onClose }) => {
    const type = toast.type || 'info';
    return (
        <div className={`pointer-events-auto flex w-full max-w-sm items-start gap-3 rounded-2xl border px-4 py-3 shadow-lg ${toneClasses[type] || toneClasses.info}`}>
            <div className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-white/70 text-xs font-black">
                {toneIcon[type] || toneIcon.info}
            </div>
            <div className="min-w-0 flex-1">
                {toast.title && <p className="text-sm font-black">{toast.title}</p>}
                <p className="text-sm font-semibold leading-5">{toast.message}</p>
            </div>
            <button
                type="button"
                onClick={() => onClose(toast.id)}
                className="shrink-0 text-sm font-black opacity-50 hover:opacity-80"
                aria-label="알림 닫기"
            >
                ×
            </button>
        </div>
    );
};

const ToastContainer = ({ toasts, onClose }) => (
    <div className="pointer-events-none fixed right-4 top-4 z-[140] flex w-[calc(100%-2rem)] max-w-sm flex-col gap-2 sm:right-6 sm:top-6">
        {toasts.map(toast => (
            <ToastItem key={toast.id} toast={toast} onClose={onClose} />
        ))}
    </div>
);

export default ToastContainer;
