import React, { useEffect, useMemo, useRef, useState } from 'react';
import ChurchPicker from '../ChurchPicker';
import { UNAFFILIATED_CHURCH_ID } from '../../data/constants';
import { sha256 } from '../../utils/crypto';
import { db, firebase } from '../../utils/firebase';
import { getChurchDirectory } from '../../utils/churchDirectory';
import { loadUserExtraOrgsStrict } from '../../utils/roster';

const emptySelection = { departmentId: '', departmentName: '', subgroupId: '', subgroupName: '' };

const CommunityMembershipCard = ({ currentUser, setCurrentUser, onboarding = false, onJoinComplete, onSkip }) => {
    const [directory, setDirectory] = useState([]);
    const [showJoin, setShowJoin] = useState(false);
    const [orgId, setOrgId] = useState('');
    const [entryCode, setEntryCode] = useState('');
    const [departments, setDepartments] = useState([]);
    const [selection, setSelection] = useState(emptySelection);
    const [step, setStep] = useState('church');
    const [busy, setBusy] = useState(false);
    const [notice, setNotice] = useState(null);
    const joinTriggerRef = useRef(null);
    const dialogRef = useRef(null);
    const busyRef = useRef(false);
    busyRef.current = busy;

    const extraOrgs = useMemo(
        () => (Array.isArray(currentUser?.extraOrgs) ? currentUser.extraOrgs : []),
        [currentUser?.extraOrgs]
    );

    useEffect(() => {
        let alive = true;
        getChurchDirectory()
            .then(list => { if (alive) setDirectory(Array.isArray(list) ? list : []); })
            .catch(() => { if (alive) setDirectory([]); });
        return () => { alive = false; };
    }, []);

    useEffect(() => {
        if (onboarding) setShowJoin(true);
    }, [onboarding]);

    useEffect(() => {
        if (!showJoin) return undefined;
        const previousOverflow = document.body.style.overflow;
        document.body.style.overflow = 'hidden';
        const dialog = dialogRef.current;
        dialog?.querySelector('button')?.focus();
        const handleKeyDown = (event) => {
            if (event.key === 'Escape' && !busyRef.current) closeJoin();
            if (event.key !== 'Tab' || !dialog) return;
            const focusable = [...dialog.querySelectorAll('button:not([disabled]), input:not([disabled])')];
            if (focusable.length === 0) return;
            const first = focusable[0];
            const last = focusable[focusable.length - 1];
            if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
            else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
        };
        document.addEventListener('keydown', handleKeyDown);
        return () => {
            document.removeEventListener('keydown', handleKeyDown);
            document.body.style.overflow = previousOverflow;
            joinTriggerRef.current?.focus();
        };
    }, [showJoin]);

    const orgName = (id) => directory.find(org => org.id === id)?.name || '공동체';
    const closeJoin = () => {
        if (busy) return;
        setShowJoin(false);
        setOrgId('');
        setEntryCode('');
        setDepartments([]);
        setSelection(emptySelection);
        setStep('church');
        setNotice(null);
    };

    const verifyChurch = async () => {
        setNotice(null);
        if (!orgId) return setNotice({ type: 'error', text: '공동체를 선택해주세요.' });
        if (orgId === currentUser.churchId || orgId === UNAFFILIATED_CHURCH_ID) {
            return setNotice({ type: 'error', text: '현재 주 소속은 추가할 수 없습니다.' });
        }
        if (extraOrgs.some(org => org.orgId === orgId)) {
            return setNotice({ type: 'error', text: '이미 참여 중인 공동체입니다.' });
        }
        if (extraOrgs.length >= 3) return setNotice({ type: 'error', text: '공동체는 최대 3개까지 추가할 수 있습니다.' });

        const entry = directory.find(org => org.id === orgId);
        if (!entry?.codeHash) return setNotice({ type: 'error', text: '입장코드 정보를 확인할 수 없습니다.' });
        setBusy(true);
        try {
            if (await sha256(entryCode) !== entry.codeHash) {
                setNotice({ type: 'error', text: '공동체 입장코드가 틀렸습니다.' });
                return;
            }
            const churchSnap = await db.collection('churches').doc(orgId).get();
            if (!churchSnap.exists) throw new Error('missing church');
            const churchData = churchSnap.data() || {};
            const nextDepartments = Array.isArray(churchData.departments)
                ? churchData.departments
                : (Array.isArray(churchData.communities) ? churchData.communities : []);
            setDepartments(nextDepartments);
            setSelection(emptySelection);
            setStep('organization');
        } catch (error) {
            console.error('공동체 정보 확인 실패:', error);
            setNotice({ type: 'error', text: '공동체 정보를 불러오지 못했습니다. 잠시 후 다시 시도해주세요.' });
        } finally {
            setBusy(false);
        }
    };

    const selectDepartment = (department) => {
        setSelection({
            departmentId: department.id || department.name || '',
            departmentName: department.name || '',
            subgroupId: '',
            subgroupName: '',
        });
    };

    const selectSubgroup = (subgroup) => {
        const subgroupName = typeof subgroup === 'string' ? subgroup : subgroup?.name || '';
        const subgroupId = typeof subgroup === 'string' ? subgroup : subgroup?.id || subgroupName;
        setSelection(prev => ({ ...prev, subgroupId, subgroupName }));
    };

    const joinCommunity = async () => {
        if (busy || !orgId || !selection.departmentId) return;
        if (!currentUser.uid || orgId === currentUser.churchId || orgId === UNAFFILIATED_CHURCH_ID) {
            setNotice({ type: 'error', text: '이 공동체는 추가할 수 없습니다.' });
            return;
        }
        const selectedDepartment = departments.find(dept => (dept.id || dept.name) === selection.departmentId);
        if ((selectedDepartment?.subgroups || []).length > 0 && !selection.subgroupId) {
            setNotice({ type: 'error', text: '소그룹을 선택해주세요.' });
            return;
        }
        setBusy(true);
        setNotice(null);
        const rosterRef = db.collection('churches').doc(orgId).collection('roster').doc(currentUser.uid);
        const now = firebase.firestore.FieldValue.serverTimestamp();
        try {
            const latestExtraOrgs = await loadUserExtraOrgsStrict(currentUser.uid);
            if (latestExtraOrgs.some(org => org.orgId === orgId)) {
                setCurrentUser(user => user?.uid === currentUser.uid ? { ...user, extraOrgs: latestExtraOrgs } : user);
                setNotice({ type: 'error', text: '이미 참여 중인 공동체입니다.' });
                return;
            }
            if (latestExtraOrgs.length >= 3) {
                setCurrentUser(user => user?.uid === currentUser.uid ? { ...user, extraOrgs: latestExtraOrgs } : user);
                setNotice({ type: 'error', text: '공동체는 최대 3개까지 추가할 수 있습니다.' });
                return;
            }
            const rosterData = {
                uid: currentUser.uid,
                name: currentUser.name || '',
                score: currentUser.score || 0,
                currentDay: currentUser.currentDay || 1,
                streak: currentUser.streak || 0,
                readCount: currentUser.readCount || 1,
                lastReadDate: currentUser.lastReadDate || null,
                ...selection,
                joinedAt: now,
                updatedAt: now,
            };
            if (onboarding) {
                const userRef = db.collection('users').doc(currentUser.uid);
                await db.runTransaction(async transaction => {
                    const userSnap = await transaction.get(userRef);
                    if (!userSnap.exists || userSnap.data()?.accountType !== 'personal') throw new Error('personal user unavailable');
                    transaction.set(rosterRef, rosterData);
                    transaction.update(userRef, { primaryOrgId: orgId, planId: currentUser.planId, updatedAt: now });
                });
            } else {
                await rosterRef.set(rosterData);
            }
            const runtimeOrg = { uid: currentUser.uid, orgId, rosterPath: rosterRef.path, ...selection, joinedAt: null, updatedAt: null };
            if (onboarding && onJoinComplete) {
                onJoinComplete(runtimeOrg);
                return;
            }
            setCurrentUser(user => user?.uid === currentUser.uid
                ? { ...user, extraOrgs: [...latestExtraOrgs, runtimeOrg].sort((a, b) => a.orgId.localeCompare(b.orgId)) }
                : user);
            setShowJoin(false);
            setOrgId('');
            setEntryCode('');
            setDepartments([]);
            setSelection(emptySelection);
            setStep('church');
            setNotice(null);
        } catch (error) {
            console.error('공동체 참여 실패:', error);
            setNotice({ type: 'error', text: error?.code === 'permission-denied' ? '공동체 참여 권한을 확인해주세요.' : '현재 소속을 확인하지 못했습니다. 잠시 후 다시 시도해주세요.' });
        } finally {
            setBusy(false);
        }
    };

    const leaveCommunity = async (org) => {
        if (busy || !window.confirm(`${orgName(org.orgId)}에서 탈퇴하시겠습니까?`)) return;
        setBusy(true);
        setNotice(null);
        try {
            await db.collection('churches').doc(org.orgId).collection('roster').doc(currentUser.uid).delete();
            setCurrentUser(user => user?.uid === currentUser.uid
                ? { ...user, extraOrgs: (user.extraOrgs || []).filter(item => item.orgId !== org.orgId) }
                : user);
        } catch (error) {
            console.error('공동체 탈퇴 실패:', error);
            setNotice({ type: 'error', text: '공동체 탈퇴에 실패했습니다. 잠시 후 다시 시도해주세요.' });
        } finally {
            setBusy(false);
        }
    };

    if (onboarding) return (
        <section className="w-full max-w-lg rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="text-center">
                <h2 className="text-xl font-bold text-slate-800">공동체에 참여하시겠어요?</h2>
                <p className="mt-2 text-sm text-slate-500">교회나 공동체와 함께 읽으면 랭킹과 응원을 나눌 수 있어요.</p>
                <button type="button" onClick={() => setShowJoin(true)} className="mt-5 w-full rounded-xl bg-blue-600 py-3 text-sm font-bold text-white">공동체 찾아보기</button>
                <button type="button" onClick={onSkip} disabled={busy} className="mt-2 w-full rounded-xl py-3 text-sm font-bold text-slate-500 disabled:opacity-40">나중에 할게요</button>
            </div>
            {showJoin && <div className="fixed inset-0 z-[120] flex items-end justify-center bg-black/40 p-0 sm:items-center sm:p-4" onMouseDown={e => { if (e.target === e.currentTarget) closeJoin(); }}>
                <div ref={dialogRef} role="dialog" aria-modal="true" aria-label="공동체 참여" className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-t-3xl bg-white p-5 shadow-2xl sm:rounded-3xl">
                    <div className="mb-5 flex items-center justify-between"><h3 className="text-lg font-bold text-slate-800">공동체 참여</h3><button type="button" aria-label="공동체 참여 창 닫기" onClick={closeJoin} className="p-2 text-slate-400">✕</button></div>
                    {step === 'church' ? <div className="space-y-4"><ChurchPicker value={orgId} onChange={setOrgId} label="참여할 공동체" /><div><label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wide text-ink/55">입장코드</label><input value={entryCode} onChange={e => setEntryCode(e.target.value)} type="password" className="w-full rounded-lg border border-hairline bg-cream px-3.5 py-3 text-sm" placeholder="공동체 입장코드" /></div><button type="button" disabled={busy || !orgId || !entryCode} onClick={verifyChurch} className="w-full rounded-xl bg-blue-600 py-3 text-sm font-bold text-white disabled:bg-slate-300">{busy ? '확인 중...' : '다음'}</button></div>
                        : <div className="space-y-4"><div><p className="mb-2 text-xs font-bold text-slate-500">부서 선택</p><div className="grid grid-cols-2 gap-2">{departments.map(dept => <button type="button" key={dept.id || dept.name} onClick={() => selectDepartment(dept)} className={`rounded-xl border p-3 text-sm font-bold ${selection.departmentId === (dept.id || dept.name) ? 'border-blue-500 bg-blue-50 text-blue-700' : 'border-slate-200 text-slate-600'}`}>{dept.name}</button>)}</div>{departments.length === 0 && <p className="text-sm text-slate-500">선택할 부서가 없습니다. 공동체 관리자에게 문의해주세요.</p>}</div>{selection.departmentId && <div><p className="mb-2 text-xs font-bold text-slate-500">소그룹 선택</p><div className="grid grid-cols-2 gap-2">{(departments.find(dept => (dept.id || dept.name) === selection.departmentId)?.subgroups || []).map((sub, index) => { const id = typeof sub === 'string' ? sub : sub.id || sub.name; return <button type="button" key={id || index} onClick={() => selectSubgroup(sub)} className={`rounded-xl border p-3 text-sm font-bold ${selection.subgroupId === id ? 'border-blue-500 bg-blue-50 text-blue-700' : 'border-slate-200 text-slate-600'}`}>{typeof sub === 'string' ? sub : sub.name}</button>; })}</div></div>}<div className="flex gap-2"><button type="button" disabled={busy} onClick={() => setStep('church')} className="flex-1 rounded-xl border border-slate-200 py-3 text-sm font-bold text-slate-600">뒤로</button><button type="button" disabled={busy || !selection.departmentId} onClick={joinCommunity} className="flex-[2] rounded-xl bg-blue-600 py-3 text-sm font-bold text-white disabled:bg-slate-300">{busy ? '참여 중...' : '참여하기'}</button></div></div>}
                    {notice && <p role="alert" aria-live="polite" className={`mt-3 text-xs ${notice.type === 'error' ? 'text-red-600' : 'text-blue-600'}`}>{notice.text}</p>}
                </div>
            </div>}
        </section>
    );

    return (
        <section className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm">
            <div className="flex items-center justify-between gap-3 mb-4">
                <div><h2 className="font-bold text-slate-800">내 공동체</h2><p className="text-xs text-slate-500 mt-1">다른 공동체에서도 함께 성경을 읽을 수 있어요.</p></div>
                <button ref={joinTriggerRef} type="button" disabled={extraOrgs.length >= 3 || busy} onClick={() => { setNotice(null); setShowJoin(true); }} className="shrink-0 rounded-xl bg-blue-600 px-3 py-2 text-xs font-bold text-white disabled:bg-slate-300">공동체 추가</button>
            </div>
            <div className="space-y-2">
                <div className="rounded-xl bg-slate-50 px-3 py-3 text-sm"><span className="font-bold text-slate-700">{currentUser.churchName || '주 소속 공동체'}</span><span className="ml-2 text-[11px] text-blue-600">주 소속</span></div>
                {extraOrgs.map(org => <div key={org.orgId} className="flex items-center gap-3 rounded-xl border border-slate-100 px-3 py-3"><div className="min-w-0 flex-1"><p className="truncate text-sm font-bold text-slate-700">{orgName(org.orgId)}</p><p className="truncate text-xs text-slate-400">{[org.departmentName, org.subgroupName].filter(Boolean).join(' · ') || '소속 미배정'}</p></div><button type="button" disabled={busy} onClick={() => leaveCommunity(org)} className="text-xs font-bold text-red-500 disabled:opacity-40">탈퇴</button></div>)}
                {extraOrgs.length === 0 && <p className="py-2 text-center text-xs text-slate-400">추가로 참여 중인 공동체가 없습니다.</p>}
            </div>
            {notice && !showJoin && <p className="mt-3 text-xs text-red-600">{notice.text}</p>}

            {showJoin && <div className="fixed inset-0 z-[120] flex items-end justify-center bg-black/40 p-0 sm:items-center sm:p-4" onMouseDown={e => { if (e.target === e.currentTarget) closeJoin(); }}>
                <div ref={dialogRef} role="dialog" aria-modal="true" aria-label="공동체 추가" className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-t-3xl bg-white p-5 shadow-2xl sm:rounded-3xl">
                    <div className="mb-5 flex items-center justify-between"><h3 className="text-lg font-bold text-slate-800">공동체 추가</h3><button type="button" aria-label="공동체 추가 창 닫기" onClick={closeJoin} className="p-2 text-slate-400">✕</button></div>
                    {step === 'church' ? <div className="space-y-4"><ChurchPicker value={orgId} onChange={setOrgId} label="참여할 공동체" /><div><label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wide text-ink/55">입장코드</label><input value={entryCode} onChange={e => setEntryCode(e.target.value)} type="password" className="w-full rounded-lg border border-hairline bg-cream px-3.5 py-3 text-sm" placeholder="공동체 입장코드" /></div><button type="button" disabled={busy || !orgId || !entryCode} onClick={verifyChurch} className="w-full rounded-xl bg-blue-600 py-3 text-sm font-bold text-white disabled:bg-slate-300">{busy ? '확인 중...' : '다음'}</button></div>
                        : <div className="space-y-4"><div><p className="mb-2 text-xs font-bold text-slate-500">부서 선택</p><div className="grid grid-cols-2 gap-2">{departments.map(dept => <button type="button" key={dept.id || dept.name} onClick={() => selectDepartment(dept)} className={`rounded-xl border p-3 text-sm font-bold ${selection.departmentId === (dept.id || dept.name) ? 'border-blue-500 bg-blue-50 text-blue-700' : 'border-slate-200 text-slate-600'}`}>{dept.name}</button>)}</div>{departments.length === 0 && <p className="text-sm text-slate-500">선택할 부서가 없습니다. 공동체 관리자에게 문의해주세요.</p>}</div>{selection.departmentId && <div><p className="mb-2 text-xs font-bold text-slate-500">소그룹 선택</p><div className="grid grid-cols-2 gap-2">{(departments.find(dept => (dept.id || dept.name) === selection.departmentId)?.subgroups || []).map((sub, index) => { const id = typeof sub === 'string' ? sub : sub.id || sub.name; return <button type="button" key={id || index} onClick={() => selectSubgroup(sub)} className={`rounded-xl border p-3 text-sm font-bold ${selection.subgroupId === id ? 'border-blue-500 bg-blue-50 text-blue-700' : 'border-slate-200 text-slate-600'}`}>{typeof sub === 'string' ? sub : sub.name}</button>; })}</div></div>}<div className="flex gap-2"><button type="button" disabled={busy} onClick={() => setStep('church')} className="flex-1 rounded-xl border border-slate-200 py-3 text-sm font-bold text-slate-600">뒤로</button><button type="button" disabled={busy || !selection.departmentId} onClick={joinCommunity} className="flex-[2] rounded-xl bg-blue-600 py-3 text-sm font-bold text-white disabled:bg-slate-300">{busy ? '참여 중...' : '참여하기'}</button></div></div>}
                    {notice && <p role="alert" aria-live="polite" className={`mt-3 text-xs ${notice.type === 'error' ? 'text-red-600' : 'text-blue-600'}`}>{notice.text}</p>}
                </div>
            </div>}
        </section>
    );
};

export default CommunityMembershipCard;
