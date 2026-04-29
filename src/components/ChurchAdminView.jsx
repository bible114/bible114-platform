import React, { useState, useEffect } from 'react';
import { db, firebase } from '../utils/firebase';
import OrgEditor from './OrgEditor';

const SORT_OPTIONS = [
    { key: 'name',     label: '이름순' },
    { key: 'day',      label: '진행순' },
    { key: 'score',    label: '점수순' },
    { key: 'subgroup', label: '소그룹순' },
];

const formatReadDate = (dateStr) => {
    if (!dateStr) return '-';
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return '-';
    return `${d.getFullYear()}. ${d.getMonth() + 1}. ${d.getDate()}.`;
};

const ChurchAdminView = ({ currentUser, handleLogout, onBack }) => {
    const [members, setMembers] = useState([]);
    const [loading, setLoading] = useState(true);
    const [tab, setTab] = useState('members');

    // 교인 관리
    const [sortBy, setSortBy] = useState('name');
    const [editing, setEditing] = useState(null); // { uid, mode: 'pw' | 'subgroup' }
    const [newPw, setNewPw] = useState('');
    const [sgCommId, setSgCommId] = useState('');
    const [sgSubId, setSgSubId] = useState('');

    // 공지사항
    const [announcement, setAnnouncement] = useState({ text: '', links: [{ url: '', text: '' }], enabled: false });
    const [saving, setSaving] = useState(false);

    // 설정
    const [churchInfo, setChurchInfo] = useState(null);
    const [newChurchCode, setNewChurchCode] = useState('');
    const [savingCode, setSavingCode] = useState(false);

    // 조직 관리
    const [orgComms, setOrgComms] = useState([]);
    const [savingOrg, setSavingOrg] = useState(false);

    useEffect(() => {
        if (!currentUser?.churchId) return;
        loadData();
    }, [currentUser?.churchId]);

    const loadData = async () => {
        setLoading(true);
        try {
            const [membersSnap, announcementDoc, churchDoc] = await Promise.all([
                db.collection('users').where('churchId', '==', currentUser.churchId).get(),
                db.collection('churches').doc(currentUser.churchId).collection('settings').doc('announcement').get(),
                db.collection('churches').doc(currentUser.churchId).get(),
            ]);
            setMembers(membersSnap.docs.map(d => ({ uid: d.id, ...d.data() })).filter(m => m.role !== 'churchAdmin'));
            if (announcementDoc.exists) setAnnouncement(announcementDoc.data());
            if (churchDoc.exists) {
                const data = churchDoc.data();
                setChurchInfo(data);
                setNewChurchCode(data.churchCode || '');
                setOrgComms(data.departments || data.communities || []);
            }
        } catch (e) {
            console.error(e);
        }
        setLoading(false);
    };

    const openEdit = (member, mode) => {
        if (editing?.uid === member.uid && editing?.mode === mode) {
            setEditing(null);
            return;
        }
        setEditing({ uid: member.uid, mode });
        setNewPw('');
        if (mode === 'subgroup') {
            setSgCommId(member.departmentId || orgComms[0]?.id || '');
            setSgSubId(member.subgroupId || '');
        }
    };

    const changePassword = async (member) => {
        if (!newPw || newPw.length < 6) { alert('비밀번호는 6자리 이상이어야 합니다.'); return; }
        if (!confirm(`${member.name}님의 비밀번호를 변경하시겠습니까?\n\n새 비밀번호: ${newPw}`)) return;
        try {
            await db.collection('users').doc(member.uid).set({
                password: newPw,
                passwordResetRequired: true,
                updatedAt: firebase.firestore.FieldValue.serverTimestamp()
            }, { merge: true });
            setMembers(prev => prev.map(m => m.uid === member.uid ? { ...m, password: newPw } : m));
            alert(`✅ ${member.name}님의 비밀번호가 변경되었습니다!\n새 비밀번호: ${newPw}\n\n교인에게 직접 알려주세요.`);
            setEditing(null);
        } catch (e) {
            alert('변경 실패');
        }
    };

    const changeSubgroup = async (member) => {
        if (!sgCommId || !sgSubId) { alert('부서와 소그룹을 모두 선택해주세요.'); return; }
        const comm = orgComms.find(c => c.id === sgCommId);
        if (!comm) return;
        try {
            await db.collection('users').doc(member.uid).set({
                departmentId: sgCommId,
                departmentName: comm.name,
                subgroupId: sgSubId,
                updatedAt: firebase.firestore.FieldValue.serverTimestamp()
            }, { merge: true });
            setMembers(prev => prev.map(m =>
                m.uid === member.uid
                    ? { ...m, departmentId: sgCommId, departmentName: comm.name, subgroupId: sgSubId }
                    : m
            ));
            setEditing(null);
        } catch (e) {
            alert('변경 실패');
        }
    };

    const deleteMember = async (member) => {
        if (!confirm(`${member.name}님을 교인 목록에서 삭제하시겠습니까?\n\n삭제 후에는 되돌릴 수 없습니다.`)) return;
        try {
            await db.collection('users').doc(member.uid).delete();
            setMembers(prev => prev.filter(m => m.uid !== member.uid));
            if (editing?.uid === member.uid) setEditing(null);
        } catch (e) {
            alert('삭제 실패');
        }
    };

    const saveAnnouncement = async () => {
        setSaving(true);
        try {
            await db.collection('churches').doc(currentUser.churchId)
                .collection('settings').doc('announcement').set({
                    ...announcement,
                    updatedAt: firebase.firestore.FieldValue.serverTimestamp()
                });
            alert('공지가 저장되었습니다!');
        } catch (e) {
            alert('저장 실패');
        }
        setSaving(false);
    };

    const saveChurchCode = async () => {
        if (!newChurchCode || newChurchCode.length < 4) { alert('입장코드는 4자리 이상이어야 합니다.'); return; }
        setSavingCode(true);
        try {
            await db.collection('churches').doc(currentUser.churchId).set(
                { churchCode: newChurchCode, updatedAt: firebase.firestore.FieldValue.serverTimestamp() },
                { merge: true }
            );
            alert('입장코드가 변경되었습니다!');
        } catch (e) {
            alert('변경 실패');
        }
        setSavingCode(false);
    };

    const saveOrg = async () => {
        const valid = orgComms
            .filter(c => c.name.trim())
            .map(c => ({
                id: c.id,
                name: c.name.trim(),
                subgroups: c.subgroups.filter(s => s.trim()).map(s => s.trim()),
            }));
        if (valid.length === 0) { alert('최소 하나의 부서를 추가해주세요.'); return; }
        setSavingOrg(true);
        try {
            await db.collection('churches').doc(currentUser.churchId).set(
                { departments: valid, updatedAt: firebase.firestore.FieldValue.serverTimestamp() },
                { merge: true }
            );
            setOrgComms(valid);
            alert('조직이 저장되었습니다!\n\n⚠️ 부서명이나 소그룹명을 변경한 경우, 기존 교인의 소그룹 배정 표기가 달라질 수 있습니다.');
        } catch (e) {
            alert('저장 실패');
        }
        setSavingOrg(false);
    };

    const todayStr = new Date().toDateString();

    // 소그룹순: orgComms 순서 기준 그룹핑, 내부 가나다순
    const subgroupGroups = (() => {
        const groups = orgComms.flatMap(comm =>
            (comm.subgroups || []).map(sub => ({
                key: `${comm.id}__${sub}`,
                label: orgComms.length > 1 ? `${comm.name} · ${sub}` : sub,
                members: members
                    .filter(m => m.departmentId === comm.id && m.subgroupId === sub)
                    .sort((a, b) => (a.name || '').localeCompare(b.name || '', 'ko-KR')),
            }))
        ).filter(g => g.members.length > 0);

        const assignedUids = new Set(groups.flatMap(g => g.members.map(m => m.uid)));
        const unassigned = members
            .filter(m => !assignedUids.has(m.uid))
            .sort((a, b) => (a.name || '').localeCompare(b.name || '', 'ko-KR'));
        if (unassigned.length > 0) {
            groups.push({ key: '__unassigned', label: '미배정', members: unassigned });
        }
        return groups;
    })();

    const sortedMembers = [...members].sort((a, b) => {
        if (sortBy === 'name') return (a.name || '').localeCompare(b.name || '', 'ko-KR');
        if (sortBy === 'day') {
            const aDay = ((a.readCount || 1) - 1) * 365 + (a.currentDay || 1);
            const bDay = ((b.readCount || 1) - 1) * 365 + (b.currentDay || 1);
            return bDay - aDay;
        }
        if (sortBy === 'score') return (b.score || 0) - (a.score || 0);
        return 0;
    });

    const TABS = [
        ['members', '👥 교인 관리'],
        ['org', '📋 조직 관리'],
        ['announcement', '📢 공지사항'],
        ['settings', '⚙️ 설정'],
    ];

    const sgComm = orgComms.find(c => c.id === sgCommId);

    const renderEditRow = (m) => {
        const isEditingPw = editing?.uid === m.uid && editing?.mode === 'pw';
        const isEditingSg = editing?.uid === m.uid && editing?.mode === 'subgroup';
        if (!isEditingPw && !isEditingSg) return null;

        return (
            <tr key={`edit-${m.uid}`} className="bg-slate-50">
                <td colSpan="7" className="px-5 py-3 border-b border-slate-100">
                    {isEditingSg && (
                        <div className="space-y-2">
                            <p className="text-xs font-bold text-indigo-600">소그룹 변경 — {m.name}</p>
                            {orgComms.length === 0 ? (
                                <p className="text-xs text-slate-400">먼저 조직 관리에서 부서/소그룹을 설정해주세요.</p>
                            ) : (
                                <div className="flex flex-wrap gap-2">
                                    <select value={sgCommId}
                                        onChange={e => { setSgCommId(e.target.value); setSgSubId(''); }}
                                        className="bg-white border border-slate-200 rounded-lg px-3 py-1.5 text-sm min-w-[120px]">
                                        <option value="">부서 선택</option>
                                        {orgComms.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                                    </select>
                                    <select value={sgSubId}
                                        onChange={e => setSgSubId(e.target.value)}
                                        className="bg-white border border-slate-200 rounded-lg px-3 py-1.5 text-sm min-w-[120px]"
                                        disabled={!sgCommId}>
                                        <option value="">소그룹 선택</option>
                                        {(sgComm?.subgroups || []).map(s => <option key={s} value={s}>{s}</option>)}
                                    </select>
                                    <button onClick={() => changeSubgroup(m)}
                                        className="bg-indigo-600 text-white text-xs px-4 py-1.5 rounded-lg font-bold">저장</button>
                                    <button onClick={() => setEditing(null)}
                                        className="bg-slate-200 text-slate-600 text-xs px-3 py-1.5 rounded-lg">취소</button>
                                </div>
                            )}
                        </div>
                    )}
                    {isEditingPw && (
                        <div className="space-y-2">
                            <p className="text-xs font-bold text-blue-600">비밀번호 변경 — {m.name}
                                <span className="ml-2 font-normal text-slate-400">
                                    현재: <span className="font-mono">{m.password || '알 수 없음'}</span>
                                </span>
                            </p>
                            <div className="flex flex-wrap gap-2">
                                <input type="text" value={newPw} onChange={e => setNewPw(e.target.value)}
                                    placeholder="새 비밀번호 (6자리 이상)"
                                    className="bg-white border border-slate-200 rounded-lg px-3 py-1.5 text-sm flex-1 min-w-[180px]" />
                                <button onClick={() => changePassword(m)}
                                    className="bg-blue-600 text-white text-xs px-4 py-1.5 rounded-lg font-bold">변경</button>
                                <button onClick={() => setEditing(null)}
                                    className="bg-slate-200 text-slate-600 text-xs px-3 py-1.5 rounded-lg">취소</button>
                            </div>
                        </div>
                    )}
                </td>
            </tr>
        );
    };

    const renderMemberRow = (m, idx) => {
        const rc = m.readCount || 1;
        const totalDays = (rc - 1) * 365 + (m.currentDay || 1);
        const readToday = m.lastReadDate === todayStr;
        const isExpanded = editing?.uid === m.uid;

        return (
            <React.Fragment key={m.uid}>
                <tr className={`border-b border-slate-50 hover:bg-slate-50/60 transition-colors ${isExpanded ? 'bg-blue-50/30' : ''}`}>
                    {/* # */}
                    <td className="px-4 py-3.5 text-xs text-slate-400 font-mono italic w-8">{idx + 1}</td>

                    {/* 이름 */}
                    <td className="px-4 py-3.5">
                        <div className="flex items-center gap-1.5">
                            <span className="font-bold text-slate-800 text-sm">{m.name}</span>
                            {readToday && <span className="text-green-500 text-[10px] font-bold">✓</span>}
                        </div>
                    </td>

                    {/* 부서/소그룹 */}
                    <td className="px-4 py-3.5">
                        <div className="font-bold text-slate-700 text-sm">{m.departmentName || '-'}</div>
                        <div className="text-xs text-slate-400">{m.subgroupId || '미배정'}</div>
                    </td>

                    {/* DAY */}
                    <td className="px-4 py-3.5 text-center">
                        <div className="flex items-center justify-center gap-1.5">
                            <span className={`font-bold text-sm ${readToday ? 'text-blue-600' : 'text-slate-700'}`}>
                                DAY {totalDays}
                            </span>
                            {rc > 1 && (
                                <span className="text-[10px] bg-purple-500 text-white px-1.5 py-0.5 rounded-full font-bold leading-none">
                                    {rc - 1}독
                                </span>
                            )}
                        </div>
                    </td>

                    {/* 점수 */}
                    <td className="px-4 py-3.5 text-center text-sm text-slate-600">{m.score || 0}</td>

                    {/* 마지막읽은날 */}
                    <td className="px-4 py-3.5 text-center text-xs text-slate-400">
                        {readToday
                            ? <span className="text-green-600 font-bold">오늘</span>
                            : formatReadDate(m.lastReadDate)
                        }
                    </td>

                    {/* 관리 */}
                    <td className="px-4 py-3.5">
                        <div className="flex items-center justify-center gap-2">
                            <button onClick={() => openEdit(m, 'subgroup')} title="소그룹 변경"
                                className={`w-7 h-7 rounded-full flex items-center justify-center text-sm transition-all ${editing?.uid === m.uid && editing?.mode === 'subgroup' ? 'bg-indigo-500 text-white' : 'bg-indigo-50 text-indigo-500 hover:bg-indigo-100'}`}>
                                ↻
                            </button>
                            <button onClick={() => openEdit(m, 'pw')} title="비밀번호 변경"
                                className={`w-7 h-7 rounded-full flex items-center justify-center text-sm transition-all ${editing?.uid === m.uid && editing?.mode === 'pw' ? 'bg-blue-500 text-white' : 'bg-blue-50 text-blue-500 hover:bg-blue-100'}`}>
                                ✎
                            </button>
                            <button onClick={() => deleteMember(m)} title="삭제"
                                className="w-7 h-7 rounded-full flex items-center justify-center text-sm bg-red-50 text-red-400 hover:bg-red-100 transition-all">
                                ✕
                            </button>
                        </div>
                    </td>
                </tr>
                {renderEditRow(m)}
            </React.Fragment>
        );
    };

    return (
        <div className="min-h-screen bg-slate-50">
            {/* 상단 헤더 */}
            <div className="bg-white border-b border-slate-200 px-4 py-4 flex items-center justify-between sticky top-0 z-10">
                <div>
                    <h1 className="font-extrabold text-slate-800">⛪ 교회 관리</h1>
                    <p className="text-xs text-slate-400">{currentUser.churchName}</p>
                </div>
                <div className="flex gap-2">
                    <button onClick={onBack}
                        className="text-xs bg-slate-100 text-slate-600 px-3 py-2 rounded-lg font-bold">
                        대시보드
                    </button>
                    <button onClick={handleLogout}
                        className="text-xs bg-red-50 text-red-500 px-3 py-2 rounded-lg font-bold">
                        로그아웃
                    </button>
                </div>
            </div>

            {/* 탭 */}
            <div className="flex gap-0 border-b border-slate-200 bg-white overflow-x-auto">
                {TABS.map(([t, label]) => (
                    <button key={t} onClick={() => setTab(t)}
                        className={`flex-shrink-0 py-3 px-4 text-xs font-bold border-b-2 transition-all whitespace-nowrap ${tab === t ? 'border-blue-500 text-blue-600' : 'border-transparent text-slate-400'}`}>
                        {label}
                    </button>
                ))}
            </div>

            <div className="max-w-5xl mx-auto p-4">
                {loading ? (
                    <div className="text-center py-20 text-slate-400">불러오는 중...</div>
                ) : (
                    <>
                        {/* ── 교인 관리 ── */}
                        {tab === 'members' && (
                            <div>
                                {/* 헤더 */}
                                <div className="flex items-center justify-between mb-4">
                                    <h2 className="font-bold text-slate-700 flex items-center gap-2 text-base">
                                        👥 전체 회원 목록
                                        <span className="text-sm font-normal text-slate-400">({members.length}명)</span>
                                    </h2>
                                    <div className="flex gap-1">
                                        {SORT_OPTIONS.map(({ key, label }) => (
                                            <button key={key} onClick={() => setSortBy(key)}
                                                className={`text-xs px-3 py-1.5 rounded-lg font-bold transition-all ${sortBy === key ? 'bg-blue-600 text-white' : 'bg-white text-slate-500 border border-slate-200 hover:border-blue-200'}`}>
                                                {label}
                                            </button>
                                        ))}
                                    </div>
                                </div>

                                {members.length === 0 ? (
                                    <div className="text-center py-20 text-slate-300">
                                        <div className="text-4xl mb-2">👥</div>
                                        <p>아직 가입한 교인이 없습니다</p>
                                    </div>
                                ) : (
                                    <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
                                        <div className="overflow-x-auto">
                                            <table className="w-full">
                                                <thead>
                                                    <tr className="border-b border-slate-100 bg-slate-50/50">
                                                        <th className="px-4 py-3 text-left text-xs text-slate-400 font-bold w-8">#</th>
                                                        <th className="px-4 py-3 text-left text-xs text-slate-400 font-bold">이름</th>
                                                        <th className="px-4 py-3 text-left text-xs text-slate-400 font-bold">부서/소그룹</th>
                                                        <th className="px-4 py-3 text-center text-xs text-slate-400 font-bold">DAY</th>
                                                        <th className="px-4 py-3 text-center text-xs text-slate-400 font-bold">점수</th>
                                                        <th className="px-4 py-3 text-center text-xs text-slate-400 font-bold">마지막읽은날</th>
                                                        <th className="px-4 py-3 text-center text-xs text-slate-400 font-bold">관리</th>
                                                    </tr>
                                                </thead>
                                                <tbody>
                                                    {sortBy === 'subgroup'
                                                        ? subgroupGroups.map(group => (
                                                            <React.Fragment key={group.key}>
                                                                {/* 소그룹 구분 행 */}
                                                                <tr className="bg-indigo-50 border-b border-indigo-100">
                                                                    <td colSpan="7" className="px-4 py-2">
                                                                        <div className="flex items-center gap-2">
                                                                            <span className="text-xs font-bold text-indigo-700">{group.label}</span>
                                                                            <span className="text-[10px] bg-indigo-100 text-indigo-500 px-2 py-0.5 rounded-full font-bold">{group.members.length}명</span>
                                                                        </div>
                                                                    </td>
                                                                </tr>
                                                                {group.members.map((m, idx) => renderMemberRow(m, idx))}
                                                            </React.Fragment>
                                                        ))
                                                        : sortedMembers.map((m, idx) => renderMemberRow(m, idx))
                                                    }
                                                </tbody>
                                            </table>
                                        </div>
                                    </div>
                                )}
                            </div>
                        )}

                        {/* ── 조직 관리 ── */}
                        {tab === 'org' && (
                            <div className="space-y-4 max-w-2xl">
                                <div className="bg-indigo-50 rounded-2xl p-4 border border-indigo-100">
                                    <p className="text-sm font-bold text-indigo-700 mb-1">📋 교회 조직 관리</p>
                                    <p className="text-xs text-slate-500">부서와 소그룹을 자유롭게 구성할 수 있습니다.</p>
                                    <p className="text-xs text-indigo-500 mt-1">💡 조직은 관리자 메뉴에서도 변경이 가능합니다.</p>
                                </div>
                                <div className="bg-white rounded-2xl p-4 border border-slate-100 shadow-sm">
                                    <OrgEditor departments={orgComms} onChange={setOrgComms} />
                                    <div className="mt-4 pt-4 border-t border-slate-100">
                                        <button onClick={saveOrg} disabled={savingOrg}
                                            className="w-full bg-indigo-600 text-white font-bold py-3 rounded-xl text-sm disabled:opacity-50 hover:bg-indigo-700 transition-colors">
                                            {savingOrg ? '저장 중...' : '✅ 조직 저장하기'}
                                        </button>
                                        {orgComms.length > 0 && (
                                            <p className="text-[10px] text-slate-400 text-center mt-2">
                                                ⚠️ 부서/소그룹명 변경 시 기존 교인의 배정 표기에 영향이 있을 수 있습니다.
                                            </p>
                                        )}
                                    </div>
                                </div>
                                {orgComms.filter(c => c.name.trim()).length > 0 && (
                                    <div className="bg-white rounded-2xl p-4 border border-slate-100 shadow-sm">
                                        <p className="text-xs font-bold text-slate-500 mb-3">현재 조직 미리보기</p>
                                        <div className="space-y-2">
                                            {orgComms.filter(c => c.name.trim()).map(comm => (
                                                <div key={comm.id} className="flex items-start gap-2">
                                                    <span className="text-sm shrink-0">🏛️</span>
                                                    <div>
                                                        <span className="font-bold text-slate-700 text-sm">{comm.name}</span>
                                                        <div className="flex flex-wrap gap-1 mt-1">
                                                            {comm.subgroups.filter(s => s.trim()).map((sub, i) => (
                                                                <span key={i} className="text-xs bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full">{sub}</span>
                                                            ))}
                                                        </div>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                )}
                            </div>
                        )}

                        {/* ── 공지사항 ── */}
                        {tab === 'announcement' && (
                            <div className="space-y-4 max-w-2xl">
                                <div className="bg-white rounded-2xl p-4 border border-slate-100">
                                    <label className="flex items-center gap-2 mb-4 cursor-pointer">
                                        <input type="checkbox" checked={announcement.enabled}
                                            onChange={e => setAnnouncement(prev => ({ ...prev, enabled: e.target.checked }))}
                                            className="w-4 h-4 rounded" />
                                        <span className="font-bold text-slate-700">공지 표시 활성화</span>
                                    </label>
                                    <textarea value={announcement.text}
                                        onChange={e => setAnnouncement(prev => ({ ...prev, text: e.target.value }))}
                                        placeholder="공지사항 내용을 입력하세요..."
                                        rows={4}
                                        className="w-full bg-slate-50 border border-slate-200 rounded-xl p-3 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-blue-400" />
                                    <div className="mt-3">
                                        <div className="flex justify-between items-center mb-2">
                                            <p className="text-xs text-slate-400 font-bold">링크 (선택)</p>
                                            <button type="button"
                                                onClick={() => setAnnouncement(prev => ({ ...prev, links: [...(prev.links || []), { url: '', text: '' }] }))}
                                                className="text-xs bg-blue-50 text-blue-600 px-2.5 py-1 rounded-lg font-bold hover:bg-blue-100">
                                                + 링크 추가
                                            </button>
                                        </div>
                                        {(announcement.links || []).map((link, i) => (
                                            <div key={i} className="flex gap-2 mb-2 items-center">
                                                <input type="text" value={link.text}
                                                    onChange={e => {
                                                        const links = [...(announcement.links || [])];
                                                        links[i] = { ...links[i], text: e.target.value };
                                                        setAnnouncement(prev => ({ ...prev, links }));
                                                    }}
                                                    placeholder="버튼 글자"
                                                    className="flex-1 bg-slate-50 border border-slate-200 rounded-lg p-2 text-sm" />
                                                <input type="url" value={link.url}
                                                    onChange={e => {
                                                        const links = [...(announcement.links || [])];
                                                        links[i] = { ...links[i], url: e.target.value };
                                                        setAnnouncement(prev => ({ ...prev, links }));
                                                    }}
                                                    placeholder="https://..."
                                                    className="flex-1 bg-slate-50 border border-slate-200 rounded-lg p-2 text-sm" />
                                                <button type="button"
                                                    onClick={() => setAnnouncement(prev => ({ ...prev, links: prev.links.filter((_, j) => j !== i) }))}
                                                    className="text-slate-300 hover:text-red-400 font-bold text-lg shrink-0">✕</button>
                                            </div>
                                        ))}
                                        {(announcement.links || []).length === 0 && (
                                            <p className="text-xs text-slate-300 text-center py-2">링크 버튼이 없습니다.</p>
                                        )}
                                    </div>
                                    <button onClick={saveAnnouncement} disabled={saving}
                                        className="w-full mt-3 bg-blue-600 text-white font-bold py-2.5 rounded-xl text-sm disabled:opacity-50 hover:bg-blue-700">
                                        {saving ? '저장 중...' : '공지 저장'}
                                    </button>
                                </div>
                            </div>
                        )}

                        {/* ── 설정 ── */}
                        {tab === 'settings' && (
                            <div className="space-y-4 max-w-2xl">
                                <div className="bg-white rounded-2xl p-4 border border-slate-100">
                                    <p className="font-bold text-slate-700 mb-1">교회 입장코드 변경</p>
                                    <p className="text-xs text-slate-400 mb-3">교인들이 가입할 때 사용하는 코드입니다.</p>
                                    <div className="flex gap-2">
                                        <input type="text" value={newChurchCode} onChange={e => setNewChurchCode(e.target.value)}
                                            placeholder="새 입장코드 (4자리 이상)"
                                            className="flex-1 bg-slate-50 border border-slate-200 rounded-xl p-3 text-sm" />
                                        <button onClick={saveChurchCode} disabled={savingCode}
                                            className="bg-indigo-600 text-white font-bold px-4 rounded-xl text-sm disabled:opacity-50 hover:bg-indigo-700">
                                            {savingCode ? '...' : '변경'}
                                        </button>
                                    </div>
                                </div>
                                <div className="bg-slate-50 rounded-2xl p-4 border border-slate-100 text-xs text-slate-400">
                                    <p className="font-bold text-slate-600 mb-1">교회 정보</p>
                                    <p>교회명: {churchInfo?.name}</p>
                                    <p>관리자: {currentUser.name}</p>
                                </div>
                            </div>
                        )}
                    </>
                )}
            </div>
        </div>
    );
};

export default ChurchAdminView;
