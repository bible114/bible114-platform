import React, { useEffect, useRef, useState } from 'react';
import { UNAFFILIATED_CHURCH_ID } from '../../data/constants';

const DISMISS_KEY = 'b114_personal_migration_dismissed_until';
const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

const PersonalAccountMigrationCard = ({ currentUser, onMigrate }) => {
    const [visible, setVisible] = useState(false);
    const [open, setOpen] = useState(false);
    const [phone4, setPhone4] = useState('');
    const [error, setError] = useState('');
    const dialogRef = useRef(null);

    const eligible = currentUser?.role === 'member'
        && currentUser.accountType !== 'personal'
        && currentUser.churchId
        && currentUser.churchId !== UNAFFILIATED_CHURCH_ID;

    useEffect(() => {
        if (!eligible) { setVisible(false); return; }
        const dismissedUntil = Number(localStorage.getItem(DISMISS_KEY) || 0);
        setVisible(!Number.isFinite(dismissedUntil) || dismissedUntil <= Date.now());
    }, [eligible, currentUser?.uid]);

    useEffect(() => {
        if (!open) return undefined;
        const previousOverflow = document.body.style.overflow;
        document.body.style.overflow = 'hidden';
        dialogRef.current?.querySelector('input')?.focus();
        const onKeyDown = event => { if (event.key === 'Escape') setOpen(false); };
        document.addEventListener('keydown', onKeyDown);
        return () => {
            document.removeEventListener('keydown', onKeyDown);
            document.body.style.overflow = previousOverflow;
        };
    }, [open]);

    if (!visible || !eligible) return null;

    const dismiss = () => {
        localStorage.setItem(DISMISS_KEY, String(Date.now() + SEVEN_DAYS_MS));
        setVisible(false);
        setOpen(false);
    };

    const submit = async event => {
        event.preventDefault();
        if (!/^\d{4}$/.test(phone4)) {
            setError('전화번호 뒤 4자리를 정확히 입력해주세요.');
            return;
        }
        setError('');
        await onMigrate?.(phone4);
    };

    return (
        <>
            <section className="rounded-2xl border border-blue-100 bg-blue-50 p-5 shadow-sm">
                <div className="flex items-start justify-between gap-3">
                    <div>
                        <h2 className="font-bold text-blue-950">🔑 개인 계정으로 전환</h2>
                        <p className="mt-1 text-xs leading-5 text-blue-700">교회를 옮겨도 계정과 기록이 그대로 유지되고, 여러 공동체에 함께 소속될 수 있어요.</p>
                    </div>
                    <button type="button" onClick={dismiss} aria-label="7일 동안 개인 계정 전환 안내 숨기기" className="shrink-0 p-1 text-blue-400">✕</button>
                </div>
                <button type="button" onClick={() => setOpen(true)} className="mt-4 rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-bold text-white">전환 안내 보기</button>
            </section>

            {open && <div className="fixed inset-0 z-[130] flex items-end justify-center bg-black/45 sm:items-center sm:p-4" onMouseDown={event => { if (event.target === event.currentTarget) setOpen(false); }}>
                <form ref={dialogRef} onSubmit={submit} role="dialog" aria-modal="true" aria-label="개인 계정으로 전환" className="w-full max-w-md rounded-t-3xl bg-white p-6 shadow-2xl sm:rounded-3xl">
                    <div className="flex items-center justify-between gap-3">
                        <h3 className="text-lg font-bold text-slate-900">개인 계정으로 전환</h3>
                        <button type="button" onClick={() => setOpen(false)} aria-label="닫기" className="p-2 text-slate-400">✕</button>
                    </div>
                    <div className="mt-4 space-y-2 rounded-xl bg-slate-50 p-4 text-sm text-slate-600">
                        <p>• 교회를 옮겨도 계정과 읽기 기록이 유지됩니다.</p>
                        <p>• 교회와 동아리 등 여러 공동체에 함께 참여할 수 있습니다.</p>
                    </div>
                    <label className="mt-5 block text-xs font-bold text-slate-600" htmlFor="migration-phone4">전화번호 뒤 4자리</label>
                    <input id="migration-phone4" inputMode="numeric" maxLength={4} value={phone4} onChange={event => setPhone4(event.target.value.replace(/\D/g, ''))} placeholder="예: 1234" className="mt-2 w-full rounded-xl border border-slate-200 px-4 py-3 text-base" />
                    <p className="mt-3 text-xs leading-5 text-amber-700">전환 후 첫 로그인은 카카오·구글 → <b>기존 진도·달란트 이어보기</b> → <b>소속 교회 없이 혼자 읽었어요</b>를 선택하고 이름·생년월일·전화 뒤 4자리·기존 비밀번호를 한 번 확인해주세요.</p>
                    {error && <p role="alert" className="mt-3 text-xs font-bold text-red-600">{error}</p>}
                    <button type="submit" className="mt-5 w-full rounded-xl bg-blue-600 py-3 text-sm font-bold text-white">개인 계정으로 전환하기</button>
                </form>
            </div>}
        </>
    );
};

export default PersonalAccountMigrationCard;
