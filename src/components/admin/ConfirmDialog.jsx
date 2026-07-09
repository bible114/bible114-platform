import React from 'react';

const ConfirmDialog = ({
    open,
    title,
    message,
    children,
    confirmLabel = '확인',
    cancelLabel = '취소',
    danger = false,
    loading = false,
    onConfirm,
    onCancel,
}) => {
    if (!open) return null;

    return (
        <div className="fixed inset-0 z-[120] flex items-center justify-center bg-slate-950/50 px-4" onClick={onCancel}>
            <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl border border-slate-100" onClick={e => e.stopPropagation()}>
                <div className={`w-11 h-11 rounded-2xl flex items-center justify-center text-xl mb-4 ${danger ? 'bg-red-50 text-red-600' : 'bg-indigo-50 text-indigo-600'}`}>
                    {danger ? '!' : '?'}
                </div>
                <h2 className="text-lg font-black text-slate-900">{title}</h2>
                {message && <p className="mt-2 text-sm leading-6 text-slate-600 whitespace-pre-line">{message}</p>}
                {children && <div className="mt-4">{children}</div>}
                <div className="mt-6 flex justify-end gap-2">
                    <button
                        type="button"
                        onClick={onCancel}
                        disabled={loading}
                        className="px-4 py-2.5 rounded-xl border border-slate-200 text-sm font-bold text-slate-600 hover:bg-slate-50 disabled:opacity-50"
                    >
                        {cancelLabel}
                    </button>
                    <button
                        type="button"
                        onClick={onConfirm}
                        disabled={loading}
                        className={`px-4 py-2.5 rounded-xl text-sm font-bold text-white disabled:opacity-50 ${danger ? 'bg-red-600 hover:bg-red-700' : 'bg-indigo-600 hover:bg-indigo-700'}`}
                    >
                        {loading ? '처리 중...' : confirmLabel}
                    </button>
                </div>
            </div>
        </div>
    );
};

export default ConfirmDialog;
