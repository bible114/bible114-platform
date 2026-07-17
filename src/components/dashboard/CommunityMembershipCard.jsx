import React, { useEffect, useMemo, useRef, useState } from 'react';
import ChurchPicker from '../ChurchPicker';
import { UNAFFILIATED_CHURCH_ID, UNAFFILIATED_CHURCH_NAME } from '../../data/constants';
import { auth, db, firebase } from '../../utils/firebase';
import { getChurchDirectory } from '../../utils/churchDirectory';
import { migratePersonalTalentWalletIfNeeded } from '../../utils/helpers';
import {
    issueJoinTicket,
    joinCommunity as joinCommunityViaApi,
    joinSoloCommunity as joinSoloCommunityViaApi,
    PlatformApiError,
} from '../../utils/platformApi';
import {
    isLatestCanonicalUserState,
    loadCanonicalUserStateFromServer,
} from '../../utils/userStateSync';
import { validateJoinedSoloCommunityState } from '../../utils/joinSoloCommunityState';

const emptySelection = { departmentId: '', departmentName: '', subgroupId: '', subgroupName: '' };

const CommunityMembershipCard = ({ currentUser, setCurrentUser, onboarding = false, onJoinComplete, onSkip, selectionOnly = false, skipLabel = '나중에 할게요', activeOrgId, onSelectOrg, onPrimaryOrgChange }) => {
    const [directory, setDirectory] = useState([]);
    const [showJoin, setShowJoin] = useState(false);
    const [orgId, setOrgId] = useState('');
    const [entryCode, setEntryCode] = useState('');
    const [joinTicket, setJoinTicket] = useState('');
    const [departments, setDepartments] = useState([]);
    const [selection, setSelection] = useState(emptySelection);
    const [step, setStep] = useState('church');
    const [busy, setBusy] = useState(false);
    const [notice, setNotice] = useState(null);
    const joinTriggerRef = useRef(null);
    const dialogRef = useRef(null);
    const busyRef = useRef(false);
    const soloJoinInFlightRef = useRef(null);
    busyRef.current = busy;

    const extraOrgs = useMemo(
        () => (Array.isArray(currentUser?.extraOrgs) ? currentUser.extraOrgs : []),
        [currentUser?.extraOrgs]
    );
    const selectedOrgId = activeOrgId || currentUser?.churchId || null;
    const baseChurchId = currentUser?.baseChurchId || currentUser?.churchId || null;
    const baseChurchName = currentUser?.baseChurchName || currentUser?.churchName || '주 소속 공동체';

    useEffect(() => {
        let alive = true;
        getChurchDirectory()
            .then(list => { if (alive) setDirectory(Array.isArray(list) ? list : []); })
            .catch(() => { if (alive) setDirectory([]); });
        return () => { alive = false; };
    }, []);

    useEffect(() => {
        if (onboarding && !selectionOnly) setShowJoin(true);
    }, [onboarding, selectionOnly]);

    useEffect(() => {
        // 계정 전환 또는 모달 unmount 중 끝난 이전 요청은 새 계정의 busy/notice를
        // 건드리지 못하게 generation 역할의 ref를 폐기한다.
        soloJoinInFlightRef.current = null;
        setBusy(false);
        setNotice(null);
        return () => {
            soloJoinInFlightRef.current = null;
        };
    }, [currentUser?.uid]);

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

    const orgName = (id) => id === UNAFFILIATED_CHURCH_ID ? UNAFFILIATED_CHURCH_NAME : (directory.find(org => org.id === id)?.name || '공동체');
    const closeJoin = () => {
        if (busy) return;
        setShowJoin(false);
        setOrgId('');
        setEntryCode('');
        setJoinTicket('');
        setDepartments([]);
        setSelection(emptySelection);
        setStep('church');
        setNotice(null);
    };

    const verifyChurch = async () => {
        setNotice(null);
        if (!orgId) return setNotice({ type: 'error', text: '공동체를 선택해주세요.' });
        if (orgId === baseChurchId || orgId === UNAFFILIATED_CHURCH_ID) {
            return setNotice({ type: 'error', text: '현재 주 소속은 추가할 수 없습니다.' });
        }
        if (extraOrgs.some(org => org.orgId === orgId)) {
            return setNotice({ type: 'error', text: '이미 참여 중인 공동체입니다.' });
        }
        if (extraOrgs.length >= 3) return setNotice({ type: 'error', text: '공동체는 최대 3개까지 추가할 수 있습니다.' });

        setBusy(true);
        try {
            const ticketResult = await issueJoinTicket({
                churchId: orgId,
                entryCode,
                purpose: selectionOnly || onboarding ? 'personalSignup' : 'joinCommunity',
            });
            const nextDepartments = Array.isArray(ticketResult?.church?.departments)
                ? ticketResult.church.departments
                : [];
            if (!ticketResult?.joinTicket) throw new Error('missing join ticket');
            setJoinTicket(ticketResult.joinTicket);
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
        if (!currentUser.uid || orgId === baseChurchId || orgId === UNAFFILIATED_CHURCH_ID) {
            setNotice({ type: 'error', text: '이 공동체는 추가할 수 없습니다.' });
            return;
        }
        const selectedDepartment = departments.find(dept => (dept.id || dept.name) === selection.departmentId);
        if ((selectedDepartment?.subgroups || []).length > 0 && !selection.subgroupId) {
            setNotice({ type: 'error', text: '소그룹을 선택해주세요.' });
            return;
        }
        if (selectionOnly) {
            onJoinComplete?.({ orgId, orgName: orgName(orgId), entryCode: '', joinTicket, ...selection });
            setShowJoin(false);
            return;
        }
        setBusy(true);
        setNotice(null);
        try {
            const joinResult = await joinCommunityViaApi({
                churchId: orgId,
                entryCode: joinTicket ? '' : entryCode,
                joinTicket,
                departmentId: selection.departmentId,
                subgroupId: selection.subgroupId || '',
            });
            const shouldAssignPrimary = currentUser.accountType === 'personal'
                && !currentUser.primaryOrgId
                && joinResult.primaryOrgId === orgId;
            const walletMigration = shouldAssignPrimary
                ? await migratePersonalTalentWalletIfNeeded(currentUser.uid, orgId)
                : null;
            const membership = joinResult.membership || {};
            const runtimeOrg = {
                uid: currentUser.uid,
                orgId,
                rosterPath: `churches/${orgId}/roster/${currentUser.uid}`,
                departmentId: membership.departmentId || selection.departmentId,
                departmentName: membership.departmentName || selection.departmentName,
                subgroupId: membership.subgroupId || '',
                subgroupName: membership.subgroupName || '',
                extraMemberships: Array.isArray(membership.extraMemberships) ? membership.extraMemberships : [],
                talent: walletMigration?.talent || 0,
                joinedAt: membership.joinedAt || null,
                updatedAt: membership.updatedAt || null,
            };
            if (onboarding && onJoinComplete) {
                // 신규 개인 계정은 성경 버전을 아직 로컬 온보딩 상태에만 들고 있다.
                // 소속 생성은 서버가 담당하되 planId 저장은 기존 온보딩 계약을 유지한다.
                if (currentUser.planId) {
                    await db.collection('users').doc(currentUser.uid).set({
                        planId: currentUser.planId,
                        updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
                    }, { merge: true });
                }
                onJoinComplete(runtimeOrg);
                return;
            }
            setCurrentUser(user => user?.uid === currentUser.uid
                ? {
                    ...user,
                    ...(walletMigration ? { talent: 0, talentWalletMigrated: true } : {}),
                    extraOrgs: [
                        ...(user.extraOrgs || []).filter(item => item.orgId !== orgId),
                        runtimeOrg,
                    ].sort((a, b) => a.orgId.localeCompare(b.orgId)),
                    primaryOrgId: joinResult.primaryOrgId || user.primaryOrgId,
                }
                : user);
            setShowJoin(false);
            setOrgId('');
            setEntryCode('');
            setJoinTicket('');
            setDepartments([]);
            setSelection(emptySelection);
            setStep('church');
            setNotice(null);
        } catch (error) {
            console.error('공동체 참여 실패:', error);
            setNotice({
                type: 'error',
                text: error instanceof PlatformApiError && [400, 403, 404, 409].includes(error.status)
                    ? error.message
                    : '현재 소속을 확인하지 못했습니다. 잠시 후 다시 시도해주세요.',
            });
        } finally {
            setBusy(false);
        }
    };

    const leaveCommunity = async (org) => {
        if (currentUser.accountType === 'personal' && currentUser.primaryOrgId === org.orgId) {
            setNotice({ type: 'error', text: '기본 공동체는 바로 탈퇴할 수 없어요. 다른 공동체를 먼저 기본으로 설정해주세요.' });
            return;
        }
        if (busy || !window.confirm(`${orgName(org.orgId)}에서 탈퇴하시겠습니까?`)) return;
        setBusy(true);
        setNotice(null);
        try {
            const rosterRef = db.collection('churches').doc(org.orgId).collection('roster').doc(currentUser.uid);
            const remaining = extraOrgs.filter(item => item.orgId !== org.orgId);
            const leavingPrimary = currentUser.accountType === 'personal' && currentUser.primaryOrgId === org.orgId;
            if (leavingPrimary) {
                const nextPrimaryOrgId = remaining[0]?.orgId || null;
                await db.runTransaction(async transaction => {
                    transaction.delete(rosterRef);
                    transaction.update(db.collection('users').doc(currentUser.uid), {
                        primaryOrgId: nextPrimaryOrgId,
                        updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
                    });
                });
            } else {
                const deleteResult = await db.runTransaction(async transaction => {
                    const rosterSnap = await transaction.get(rosterRef);
                    if (!rosterSnap.exists) return { status: 'already-left' };
                    const latestTalent = rosterSnap.data()?.talent ?? 0;
                    if (!Number.isSafeInteger(latestTalent) || latestTalent < 0) {
                        throw new Error('ROSTER_WALLET_INVALID');
                    }
                    if (latestTalent > 0) return { status: 'balance', talent: latestTalent };
                    transaction.delete(rosterRef);
                    return { status: 'deleted' };
                });
                if (deleteResult.status === 'balance') {
                    setNotice({
                        type: 'error',
                        text: `이 공동체에 달란트 ⭐${deleteResult.talent}개가 남아 있어 탈퇴할 수 없어요. 먼저 사용하거나 관리자에게 문의해주세요.`,
                    });
                    return;
                }
            }
            setCurrentUser(user => user?.uid === currentUser.uid
                ? {
                    ...user,
                    extraOrgs: (user.extraOrgs || []).filter(item => item.orgId !== org.orgId),
                    primaryOrgId: leavingPrimary ? (remaining[0]?.orgId || null) : user.primaryOrgId,
                }
                : user);
        } catch (error) {
            console.error('공동체 탈퇴 실패:', error);
            setNotice({ type: 'error', text: '공동체 탈퇴에 실패했습니다. 잠시 후 다시 시도해주세요.' });
        } finally {
            setBusy(false);
        }
    };

    const joinSoloCommunity = async () => {
        const requestUid = String(currentUser?.uid || '').trim();
        if (busy || soloJoinInFlightRef.current
            || !requestUid
            || extraOrgs.some(org => org.orgId === UNAFFILIATED_CHURCH_ID)) return;
        // UID만 generation으로 쓰면 A → B → A 계정 전환 중 이전 A 응답이
        // 새 A 요청으로 오인될 수 있다. 요청마다 고유 객체를 결속한다.
        const requestGeneration = { uid: requestUid };
        soloJoinInFlightRef.current = requestGeneration;
        setBusy(true);
        setNotice(null);
        try {
            if (auth?.currentUser?.uid !== requestUid) throw new Error('AUTH_CHANGED');
            await joinSoloCommunityViaApi({ expectedUid: requestUid });
            if (auth?.currentUser?.uid !== requestUid
                || soloJoinInFlightRef.current !== requestGeneration) throw new Error('AUTH_CHANGED');

            const joinedState = validateJoinedSoloCommunityState(
                await loadCanonicalUserStateFromServer(requestUid),
                requestUid,
            );
            if (auth?.currentUser?.uid !== requestUid
                || soloJoinInFlightRef.current !== requestGeneration) throw new Error('AUTH_CHANGED');

            // 새 solo primary뿐 아니라 기존 primary가 있던 계정도 같은 서버 action으로
            // legacy users 지갑을 정확한 primary roster에 수렴시킨다.
            await migratePersonalTalentWalletIfNeeded(
                requestUid,
                joinedState.primaryOrgId,
                joinedState,
            );
            if (auth?.currentUser?.uid !== requestUid
                || soloJoinInFlightRef.current !== requestGeneration) throw new Error('AUTH_CHANGED');

            const freshState = validateJoinedSoloCommunityState(
                await loadCanonicalUserStateFromServer(requestUid),
                requestUid,
                { requireWalletSettled: true },
            );
            if (auth?.currentUser?.uid !== requestUid
                || soloJoinInFlightRef.current !== requestGeneration
                || !isLatestCanonicalUserState(requestUid, freshState)) throw new Error('AUTH_CHANGED');
            setCurrentUser(user => (
                user?.uid === requestUid
                && auth?.currentUser?.uid === requestUid
                && soloJoinInFlightRef.current === requestGeneration
                && isLatestCanonicalUserState(requestUid, freshState)
                    ? freshState
                    : user
            ));
        } catch (error) {
            if (auth?.currentUser?.uid !== requestUid
                || soloJoinInFlightRef.current !== requestGeneration) return;
            setNotice({
                type: 'error',
                text: error instanceof PlatformApiError && error.status === 409
                    ? error.message
                    : '혼자 읽기 모임에 참여하지 못했습니다.',
            });
        } finally {
            if (soloJoinInFlightRef.current === requestGeneration) {
                soloJoinInFlightRef.current = null;
                setBusy(false);
            }
        }
    };

    if (onboarding) return (
        <section className="w-full max-w-lg rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="text-center">
                <h2 className="text-xl font-bold text-slate-800">공동체에 참여하시겠어요?</h2>
                <p className="mt-2 text-sm text-slate-500">교회나 공동체와 함께 읽으면 랭킹과 응원을 나눌 수 있어요.</p>
                <button type="button" onClick={() => setShowJoin(true)} className="mt-5 w-full rounded-xl bg-blue-600 py-3 text-sm font-bold text-white">공동체 찾아보기</button>
                <button type="button" onClick={onSkip} disabled={busy} className="mt-2 w-full rounded-xl py-3 text-sm font-bold text-slate-500 disabled:opacity-40">{skipLabel}</button>
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
            {currentUser?.accountType === 'personal' && currentUser?.primaryOrgInactive === true && (
                <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm font-bold text-amber-800">
                    기준 공동체가 비활성화되어 공동체 활동이 중단됐어요. 아래에서 다른 공동체를 기준으로 설정해주세요.
                </div>
            )}
            <div className="flex items-center justify-between gap-3 mb-4">
                <div><h2 className="font-bold text-slate-800">내 공동체</h2><p className="text-xs text-slate-500 mt-1">다른 공동체에서도 함께 성경을 읽을 수 있어요.</p></div>
                <button ref={joinTriggerRef} type="button" disabled={extraOrgs.length >= 3 || busy} onClick={() => { setNotice(null); setShowJoin(true); }} className="shrink-0 rounded-xl bg-blue-600 px-3 py-2 text-xs font-bold text-white disabled:bg-slate-300">공동체 추가</button>
            </div>
            <div className="space-y-2">
                {currentUser.accountType !== 'personal' && (() => {
                    const isActive = selectedOrgId === baseChurchId;
                    return <div className={`rounded-xl border ${isActive ? 'border-blue-300 bg-blue-50 ring-2 ring-blue-100' : 'border-slate-100 bg-slate-50'}`}><button type="button" disabled={busy || !baseChurchId} aria-current={isActive ? 'page' : undefined} aria-pressed={isActive} onClick={() => onSelectOrg?.(baseChurchId)} className="w-full rounded-xl px-3 py-3 text-left"><span className="flex items-center justify-between gap-3"><span className="min-w-0 truncate text-sm font-bold text-slate-700">{baseChurchName}<span className="ml-2 text-[11px] text-blue-600">주 소속</span></span>{isActive && <span className="shrink-0 text-[10px] font-bold text-blue-600">현재 보고 있음</span>}</span></button></div>;
                })()}
                {extraOrgs.map(org => {
                    const isPrimary = currentUser.accountType === 'personal' && currentUser.primaryOrgId === org.orgId;
                    const isActive = selectedOrgId === org.orgId;
                    const name = orgName(org.orgId);
                    return <div key={org.orgId} className={`flex flex-wrap items-center gap-x-2 gap-y-2 rounded-xl border p-1.5 ${isActive ? 'border-blue-300 bg-blue-50 ring-2 ring-blue-100' : 'border-slate-100 bg-white'}`}><button type="button" disabled={busy} aria-current={isActive ? 'page' : undefined} aria-pressed={isActive} aria-label={`${name} 공동체로 이동${isActive ? ', 현재 보고 있음' : ''}`} onClick={() => onSelectOrg?.(org.orgId)} className="min-w-[190px] flex-1 rounded-lg px-2 py-2 text-left"><span className="flex items-center justify-between gap-3"><span className="min-w-0"><span className="block truncate text-sm font-bold text-slate-700">{name}{isPrimary && <span className="ml-2 text-[11px] text-blue-600">★ 기본</span>}</span><span className="block truncate text-xs text-slate-400">{[org.departmentName, org.subgroupName].filter(Boolean).join(' · ') || '소속 미배정'}</span>{isPrimary && <span className="mt-1 block text-[10px] text-slate-400">다른 공동체를 기본으로 설정한 뒤 탈퇴할 수 있어요.</span>}</span>{isActive && <span className="shrink-0 text-[10px] font-bold text-blue-600">현재 보고 있음</span>}</span></button><div className="ml-auto flex shrink-0 items-center gap-2 px-1">{currentUser.accountType === 'personal' && !isPrimary && <button type="button" disabled={busy} onClick={() => onPrimaryOrgChange?.(org.orgId)} className="text-xs font-bold text-blue-600">기본으로 설정</button>}<button type="button" disabled={busy || isPrimary} onClick={() => leaveCommunity(org)} className="text-xs font-bold text-red-500 disabled:text-slate-300 disabled:opacity-100">탈퇴</button></div></div>;
                })}
                {extraOrgs.length === 0 && <p className="py-2 text-center text-xs text-slate-400">참여 중인 공동체가 없습니다. 혼자 읽는 기록은 계속 안전하게 저장됩니다.</p>}
                {currentUser.accountType === 'personal' && !extraOrgs.some(org => org.orgId === UNAFFILIATED_CHURCH_ID) && <button type="button" disabled={busy || extraOrgs.length >= 3} onClick={joinSoloCommunity} className="w-full rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-3 text-xs font-bold text-emerald-700 disabled:opacity-40">혼자 읽기 모임으로 돌아가기</button>}
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
