import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
    SERVICE_POLICIES,
    SERVICE_POLICY_VERSION,
    getPolicyIdsForAudience,
    isPolicyConsentComplete,
} from '../../data/servicePolicies';

const PolicyDocument = ({ policy }) => (
    <div className="space-y-5 text-sm leading-6 text-slate-700">
        <p className="rounded-xl bg-slate-50 px-3 py-2 text-xs text-slate-500">
            시행일 및 버전: {SERVICE_POLICY_VERSION}
        </p>
        {policy.sections.map(section => (
            <section key={section.title} className="space-y-2">
                <h4 className="font-black text-slate-900">{section.title}</h4>
                {section.paragraphs?.map(paragraph => <p key={paragraph}>{paragraph}</p>)}
                {section.bullets && (
                    <ul className="list-disc space-y-1 pl-5">
                        {section.bullets.map(item => <li key={item}>{item}</li>)}
                    </ul>
                )}
            </section>
        ))}
    </div>
);

const PolicyDialog = ({ policy, onClose }) => {
    const closeButtonRef = useRef(null);

    useEffect(() => {
        const previousOverflow = document.body.style.overflow;
        document.body.style.overflow = 'hidden';
        closeButtonRef.current?.focus();
        const onKeyDown = event => {
            if (event.key === 'Escape') onClose();
        };
        window.addEventListener('keydown', onKeyDown);
        return () => {
            document.body.style.overflow = previousOverflow;
            window.removeEventListener('keydown', onKeyDown);
        };
    }, [onClose]);

    return (
        <div
            className="fixed inset-0 z-[200] flex items-end justify-center bg-black/50 sm:items-center sm:p-4"
            onMouseDown={event => { if (event.target === event.currentTarget) onClose(); }}
        >
            <div
                role="dialog"
                aria-modal="true"
                aria-labelledby={`policy-title-${policy.id}`}
                className="flex max-h-[92vh] w-full max-w-2xl flex-col rounded-t-3xl bg-white shadow-2xl sm:rounded-3xl"
            >
                <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
                    <h3 id={`policy-title-${policy.id}`} className="text-lg font-black text-slate-900">{policy.title}</h3>
                    <button ref={closeButtonRef} type="button" onClick={onClose} aria-label="정책 전문 닫기" className="rounded-lg p-2 text-slate-400 hover:bg-slate-100">✕</button>
                </div>
                <div className="overflow-y-auto px-5 py-4">
                    <PolicyDocument policy={policy} />
                </div>
                <div className="border-t border-slate-100 p-4">
                    <button type="button" onClick={onClose} className="w-full rounded-xl bg-slate-900 py-3 text-sm font-bold text-white">확인</button>
                </div>
            </div>
        </div>
    );
};

const PolicyConsent = ({
    audience = 'member',
    value = {},
    onChange,
    disabled = false,
    showCompletion = false,
    className = '',
}) => {
    const [openPolicyId, setOpenPolicyId] = useState(null);
    const policyIds = useMemo(() => getPolicyIdsForAudience(audience), [audience]);
    const allChecked = isPolicyConsentComplete(value, audience);

    const setConsent = (id, checked) => {
        if (disabled || typeof onChange !== 'function') return;
        onChange({ ...value, [id]: checked });
    };

    const setAll = checked => {
        if (disabled || typeof onChange !== 'function') return;
        onChange(policyIds.reduce((next, id) => ({ ...next, [id]: checked }), { ...value }));
    };

    const activePolicy = openPolicyId ? SERVICE_POLICIES[openPolicyId] : null;

    return (
        <div className={`rounded-2xl border border-slate-200 bg-white p-4 ${className}`.trim()}>
            <label className="flex cursor-pointer items-start gap-3 border-b border-slate-100 pb-3">
                <input
                    type="checkbox"
                    checked={allChecked}
                    onChange={event => setAll(event.target.checked)}
                    disabled={disabled}
                    className="mt-0.5 h-4 w-4 rounded border-slate-300 text-blue-600"
                />
                <span>
                    <span className="block text-sm font-black text-slate-900">필수 정책에 모두 동의합니다</span>
                    <span className="mt-0.5 block text-[11px] text-slate-500">각 항목의 전문을 열어 확인할 수 있습니다.</span>
                </span>
            </label>

            <div className="mt-3 space-y-2">
                {policyIds.map(id => {
                    const policy = SERVICE_POLICIES[id];
                    return (
                        <div key={id} className="flex items-center gap-3">
                            <label className="flex min-w-0 flex-1 cursor-pointer items-center gap-2 text-xs text-slate-700">
                                <input
                                    type="checkbox"
                                    checked={value[id] === true}
                                    onChange={event => setConsent(id, event.target.checked)}
                                    disabled={disabled}
                                    className="h-4 w-4 shrink-0 rounded border-slate-300 text-blue-600"
                                />
                                <span className="truncate"><b className="text-blue-600">[필수]</b> {policy.shortLabel}</span>
                            </label>
                            <button
                                type="button"
                                onClick={() => setOpenPolicyId(id)}
                                className="shrink-0 text-xs font-bold text-slate-500 underline underline-offset-2"
                                aria-label={`${policy.title} 전문 보기`}
                            >
                                전문 보기
                            </button>
                        </div>
                    );
                })}
            </div>

            {showCompletion && (
                <p role="status" className={`mt-3 text-xs font-semibold ${allChecked ? 'text-emerald-600' : 'text-amber-700'}`}>
                    {allChecked ? '필수 정책 확인이 완료되었습니다.' : '계속하려면 필수 항목에 동의해주세요.'}
                </p>
            )}

            {activePolicy && <PolicyDialog policy={activePolicy} onClose={() => setOpenPolicyId(null)} />}
        </div>
    );
};

export { PolicyDialog, PolicyDocument };
export default PolicyConsent;
