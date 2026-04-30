import React from 'react';
import Icon from './Icon';
import { firebase } from '../utils/firebase';

const PlatformAdminView = ({
    handleLogout,
    downloadCSV,
    adminViewMode, setAdminViewMode,
    adminFilter, setAdminFilter,
    adminSortBy, setAdminSortBy,
    allUsers,
    allChurches,
    DEFAULT_DEPARTMENTS,
    BIBLE_VERSIONS,
    announcementInput, setAnnouncementInput,
    saveAnnouncement,
    generateMemosCSV, generateMemosHTML,
    editingUser, setEditingUser,
    startEditUser, saveEditUser,
    changingPassword, setChangingPassword,
    newPassword, setNewPassword,
    changePassword,
    deleteUser,
    lastSyncInfo, setLastSyncInfo,
    syncProgress, setSyncProgress,
    selectedSyncVersions, setSelectedSyncVersions,
    syncNotionToFirestore,
    adminStats,
    kakaoLinkInput, setKakaoLinkInput,
    saveKakaoLink,
    downloadPeriodStatsCSV,
    db
}) => {
    const [tab, setTab] = React.useState('overview');
    const [startDate, setStartDate] = React.useState('');
    const [endDate, setEndDate] = React.useState('');
    const [selectedChurchId, setSelectedChurchId] = React.useState(null);
    const [announcementChurchId, setAnnouncementChurchId] = React.useState('');
    const [seedingData, setSeedingData] = React.useState(false);

    const LASTNAMES = ['김', '이', '박', '최', '정', '강', '조', '윤', '장', '임', '한', '오', '서', '신', '권', '황', '안', '송', '류', '전'];
    const FIRSTNAMES_M = ['민준', '서준', '도윤', '예준', '시우', '하준', '주원', '지호', '준서', '준혁', '도현', '건우', '현우', '우진', '성민', '재원', '태양', '승현', '찬호', '정우'];
    const FIRSTNAMES_F = ['서연', '서윤', '지우', '서현', '민서', '하은', '하윤', '윤서', '지유', '채원', '수아', '지아', '지민', '예원', '수빈', '나연', '예진', '혜원', '다인', '지현'];

    const seedFakeUsers = async (church) => {
        if (!confirm(`"${church.name}"에 가짜 교인 50명을 추가합니다. 계속하시겠습니까?`)) return;
        const comms = church.departments || church.communities || [];
        if (comms.length === 0) {
            alert('먼저 이 교회의 조직(부서/소그룹)을 설정해주세요.'); return;
        }
        setSeedingData(true);
        const today = new Date();
        const todayStr = today.toDateString();
        const ts = Date.now();
        try {
            const batch = db.batch();
            for (let i = 0; i < 50; i++) {
                const isMale = Math.random() > 0.45;
                const lastName = LASTNAMES[Math.floor(Math.random() * LASTNAMES.length)];
                const firstName = (isMale ? FIRSTNAMES_M : FIRSTNAMES_F)[Math.floor(Math.random() * 20)];
                const name = lastName + firstName;
                const birthYear = 1945 + Math.floor(Math.random() * 62);
                const birthMonth = String(Math.floor(Math.random() * 12) + 1).padStart(2, '0');
                const birthDay = String(Math.floor(Math.random() * 28) + 1).padStart(2, '0');
                const birthdate = `${birthYear}${birthMonth}${birthDay}`;
                const comm = comms[Math.floor(Math.random() * comms.length)];
                const subs = (comm.subgroups || []).filter(s => s);
                const subgroup = subs.length > 0 ? subs[Math.floor(Math.random() * subs.length)] : '';
                const currentDay = Math.floor(Math.random() * 365) + 1;
                const readCount = Math.random() > 0.93 ? 2 : 1;
                const rand = Math.random();
                let lastReadDate = null;
                if (rand > 0.65) {
                    lastReadDate = todayStr;
                } else if (rand > 0.45) {
                    const d = new Date(today); d.setDate(d.getDate() - (Math.floor(Math.random() * 3) + 1)); lastReadDate = d.toDateString();
                } else if (rand > 0.25) {
                    const d = new Date(today); d.setDate(d.getDate() - (Math.floor(Math.random() * 11) + 4)); lastReadDate = d.toDateString();
                } else if (rand > 0.10) {
                    const d = new Date(today); d.setDate(d.getDate() - (Math.floor(Math.random() * 16) + 15)); lastReadDate = d.toDateString();
                }
                const score = currentDay * 8 + Math.floor(Math.random() * 400);
                const streak = lastReadDate === todayStr ? Math.floor(Math.random() * 20) + 1 : 0;
                batch.set(db.collection('users').doc(`seed_${ts}_${i}`), {
                    name, birthdate, password: '123456',
                    email: `${encodeURIComponent(name)}_${birthdate}@bible.local`,
                    role: 'member', churchId: church.id, churchName: church.name,
                    departmentId: comm.id, departmentName: comm.name, subgroupId: subgroup,
                    planId: '1year_revised', currentDay, readCount, score, streak,
                    lastReadDate, gender: isMale ? 'male' : 'female',
                    achievements: [], memos: {}, readHistory: [], dayOffset: 0,
                    startDate: todayStr,
                    createdAt: firebase.firestore.FieldValue.serverTimestamp(),
                    updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
                });
            }
            await batch.commit();
            alert('✅ 가짜 교인 50명이 추가되었습니다!\n페이지를 새로고침합니다.');
            window.location.reload();
        } catch (e) {
            alert('삽입 실패: ' + e.message);
            setSeedingData(false);
        }
    };

    const deleteSeedUsers = async (churchId) => {
        if (!confirm('이 교회의 테스트 데이터(seed_ 계정)를 모두 삭제하시겠습니까?')) return;
        setSeedingData(true);
        try {
            const snap = await db.collection('users').where('churchId', '==', churchId).get();
            const seedDocs = snap.docs.filter(d => d.id.startsWith('seed_'));
            if (seedDocs.length === 0) { alert('삭제할 테스트 데이터가 없습니다.'); setSeedingData(false); return; }
            const batch = db.batch();
            seedDocs.forEach(d => batch.delete(d.ref));
            await batch.commit();
            alert(`✅ ${seedDocs.length}명의 테스트 데이터가 삭제되었습니다.\n페이지를 새로고침합니다.`);
            window.location.reload();
        } catch (e) {
            alert('삭제 실패: ' + e.message);
            setSeedingData(false);
        }
    };

    const churches = allChurches || [];
    const todayStr = new Date().toDateString();

    const churchStats = churches.map(church => {
        const members = allUsers.filter(u => u.churchId === church.id && u.role !== 'churchAdmin');
        const readToday = members.filter(u => u.lastReadDate === todayStr).length;
        const avgDay = members.length > 0
            ? Math.round(members.reduce((sum, u) => sum + (u.currentDay || 1), 0) / members.length)
            : 0;
        return {
            ...church,
            memberCount: members.length,
            readToday,
            readRate: members.length > 0 ? Math.round((readToday / members.length) * 100) : 0,
            avgDay,
        };
    }).sort((a, b) => b.memberCount - a.memberCount);

    const selectedChurch = selectedChurchId ? churchStats.find(c => c.id === selectedChurchId) : null;
    const selectedChurchMembers = selectedChurchId
        ? allUsers.filter(u => u.churchId === selectedChurchId && u.role !== 'churchAdmin')
        : [];

    const TABS = [
        ['overview', '📊 전체 현황'],
        ['churches', '🏛️ 교회 목록'],
        ['members', '👥 회원 목록'],
        ['announcement', '📢 공지 관리'],
        ['sync', '🔄 동기화'],
    ];

    return (
        <div className="min-h-screen bg-slate-100">
            {/* Header */}
            <div className="bg-white border-b border-slate-200 px-4 py-3 flex items-center justify-between sticky top-0 z-30 shadow-sm">
                <div>
                    <h1 className="font-extrabold text-slate-800">🛠️ 슈퍼 관리자</h1>
                    <p className="text-xs text-slate-400">{churches.length}개 교회 · {allUsers.length}명</p>
                </div>
                <div className="flex gap-2">
                    <button onClick={() => downloadCSV(allUsers)}
                        className="text-xs bg-green-50 text-green-600 px-3 py-2 rounded-lg font-bold flex items-center gap-1 border border-green-100">
                        <Icon name="download" size={13} /> CSV
                    </button>
                    <button onClick={handleLogout}
                        className="text-xs bg-red-50 text-red-500 px-3 py-2 rounded-lg font-bold border border-red-100">
                        로그아웃
                    </button>
                </div>
            </div>

            {/* Tabs */}
            <div className="flex border-b border-slate-200 bg-white overflow-x-auto">
                {TABS.map(([t, label]) => (
                    <button key={t}
                        onClick={() => { setTab(t); if (t !== 'churches') setSelectedChurchId(null); }}
                        className={`flex-shrink-0 px-4 py-3 text-xs font-bold border-b-2 transition-all whitespace-nowrap ${tab === t ? 'border-blue-500 text-blue-600' : 'border-transparent text-slate-400 hover:text-slate-600'}`}>
                        {label}
                    </button>
                ))}
            </div>

            <div className="max-w-5xl mx-auto p-4 space-y-5">

                {/* ── 전체 현황 ── */}
                {tab === 'overview' && (
                    <>
                        <div className="bg-white rounded-xl shadow-sm p-6">
                            <h2 className="text-base font-bold text-slate-800 mb-4">📊 플랫폼 전체 ({new Date().toLocaleDateString('ko-KR')})</h2>
                            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
                                <div className="bg-indigo-50 p-4 rounded-xl text-center">
                                    <div className="text-3xl font-bold text-indigo-600">{churches.length}</div>
                                    <div className="text-xs text-slate-500">등록 교회</div>
                                </div>
                                <div className="bg-blue-50 p-4 rounded-xl text-center">
                                    <div className="text-3xl font-bold text-blue-600">{adminStats.totalUsers}</div>
                                    <div className="text-xs text-slate-500">전체 회원</div>
                                </div>
                                <div className="bg-green-50 p-4 rounded-xl text-center">
                                    <div className="text-3xl font-bold text-green-600">{adminStats.readToday}</div>
                                    <div className="text-xs text-slate-500">오늘 읽은 사람</div>
                                </div>
                                <div className="bg-orange-50 p-4 rounded-xl text-center">
                                    <div className="text-3xl font-bold text-orange-600">{adminStats.readRate}%</div>
                                    <div className="text-xs text-slate-500">오늘 참여율</div>
                                </div>
                            </div>

                            <h3 className="font-bold text-slate-700 mb-3 text-sm">🏛️ 교회별 오늘 현황</h3>
                            <div className="space-y-2">
                                {churchStats.map(church => (
                                    <div key={church.id} className="flex items-center gap-3 p-3 bg-slate-50 rounded-xl">
                                        <div className="w-28 font-bold text-slate-700 text-sm truncate">{church.name}</div>
                                        <div className="w-12 text-xs text-slate-400 text-center">{church.memberCount}명</div>
                                        <div className="flex-1 h-3 bg-slate-200 rounded-full overflow-hidden">
                                            <div className="h-full bg-blue-500 rounded-full transition-all duration-500" style={{ width: `${church.readRate}%` }}></div>
                                        </div>
                                        <div className="text-xs text-slate-500 w-24 text-right">{church.readToday}/{church.memberCount}명 ({church.readRate}%)</div>
                                        <button onClick={() => { setTab('churches'); setSelectedChurchId(church.id); }}
                                            className="text-xs text-blue-600 bg-blue-50 px-2.5 py-1 rounded-lg font-bold shrink-0 hover:bg-blue-100">관리</button>
                                    </div>
                                ))}
                                {churchStats.length === 0 && (
                                    <p className="text-center py-6 text-slate-300">등록된 교회가 없습니다</p>
                                )}
                            </div>
                        </div>

                        {/* Non-participating */}
                        <div className="bg-white rounded-xl shadow-sm p-6">
                            <div className="flex justify-between items-center mb-4">
                                <h2 className="text-base font-bold text-slate-800">😴 미참여자 관리</h2>
                                <div className="flex gap-2">
                                    <button onClick={() => setAdminViewMode('today')}
                                        className={`text-xs px-3 py-1 rounded-full font-bold ${adminViewMode === 'today' ? 'bg-red-500 text-white' : 'bg-slate-100 text-slate-500'}`}>
                                        오늘 미참여
                                    </button>
                                    <button onClick={() => setAdminViewMode('inactive')}
                                        className={`text-xs px-3 py-1 rounded-full font-bold ${adminViewMode === 'inactive' ? 'bg-orange-500 text-white' : 'bg-slate-100 text-slate-500'}`}>
                                        장기 미참여
                                    </button>
                                </div>
                            </div>
                            <div className="flex gap-2 mb-4 flex-wrap">
                                <button onClick={() => setAdminFilter('all')}
                                    className={`text-xs px-3 py-1.5 rounded-lg font-bold border ${adminFilter === 'all' ? 'bg-blue-500 text-white border-blue-500' : 'bg-white text-slate-600 border-slate-200'}`}>
                                    전체
                                </button>
                                {DEFAULT_DEPARTMENTS.map(c => (
                                    <button key={c.id} onClick={() => setAdminFilter(c.id)}
                                        className={`text-xs px-3 py-1.5 rounded-lg font-bold border ${adminFilter === c.id ? 'bg-blue-500 text-white border-blue-500' : 'bg-white text-slate-600 border-slate-200'}`}>
                                        {c.name}
                                    </button>
                                ))}
                            </div>
                            <div className="max-h-[400px] overflow-y-auto">
                                {(() => {
                                    const today = new Date();
                                    let filtered = adminFilter === 'all' ? allUsers : allUsers.filter(u => u.departmentId === adminFilter);

                                    if (adminViewMode === 'today') {
                                        const notRead = filtered.filter(u => u.lastReadDate !== todayStr);
                                        const grouped = {};
                                        notRead.forEach(u => {
                                            const sub = u.subgroupId || '미배정';
                                            if (!grouped[sub]) grouped[sub] = [];
                                            grouped[sub].push(u);
                                        });
                                        const groups = Object.entries(grouped);
                                        return (
                                            <div>
                                                <div className="mb-3 text-sm text-slate-500">총 <strong className="text-red-600">{notRead.length}명</strong>이 오늘 안 읽었습니다.</div>
                                                {groups.length > 0 ? groups.map(([group, users]) => (
                                                    <div key={group} className="mb-4 bg-slate-50 p-3 rounded-lg">
                                                        <div className="text-sm font-bold text-slate-700 mb-2 flex justify-between">
                                                            <span>📁 {group}</span>
                                                            <span className="text-red-500">{users.length}명</span>
                                                        </div>
                                                        <div className="flex flex-wrap gap-1">
                                                            {users.map((u, idx) => {
                                                                const lastRead = u.lastReadDate ? new Date(u.lastReadDate) : null;
                                                                const daysSince = lastRead ? Math.floor((today - lastRead) / 86400000) : 999;
                                                                return (
                                                                    <span key={u.uid} className={`text-xs px-2 py-1 rounded-full border ${daysSince >= 7 ? 'bg-red-100 text-red-700 border-red-200' : daysSince >= 3 ? 'bg-orange-100 text-orange-700 border-orange-200' : 'bg-yellow-50 text-yellow-700 border-yellow-200'}`}>
                                                                        <span className="font-mono text-[10px] opacity-60 mr-1">{idx + 1}.</span>
                                                                        {u.name}{daysSince > 0 && <span className="opacity-70"> ({daysSince}일)</span>}
                                                                    </span>
                                                                );
                                                            })}
                                                        </div>
                                                    </div>
                                                )) : (
                                                    <div className="text-center py-8 text-green-600"><div className="text-4xl mb-2">🎉</div><p className="font-bold">모두 읽었습니다!</p></div>
                                                )}
                                            </div>
                                        );
                                    }

                                    const usersWithDays = filtered.map(u => {
                                        const lastRead = u.lastReadDate ? new Date(u.lastReadDate) : null;
                                        const daysSince = lastRead ? Math.floor((today - lastRead) / 86400000) : 999;
                                        return { ...u, daysSince };
                                    }).filter(u => u.daysSince >= 1).sort((a, b) => {
                                        if (adminSortBy === 'name') return a.name.localeCompare(b.name);
                                        if (adminSortBy === 'day') return (((b.readCount || 1) - 1) * 365 + (b.currentDay || 1)) - (((a.readCount || 1) - 1) * 365 + (a.currentDay || 1));
                                        if (adminSortBy === 'score') return (b.score || 0) - (a.score || 0);
                                        if (adminSortBy === 'subgroup') {
                                            const c = (a.departmentName || '').localeCompare(b.departmentName || '', 'ko-KR');
                                            return c !== 0 ? c : (a.subgroupId || '').localeCompare(b.subgroupId || '', 'ko-KR');
                                        }
                                        return b.daysSince - a.daysSince;
                                    });

                                    return (
                                        <div>
                                            <div className="mb-3 flex gap-2 flex-wrap">
                                                {['name', 'day', 'score', 'subgroup'].map(sort => (
                                                    <button key={sort} onClick={() => setAdminSortBy(sort)}
                                                        className={`text-xs px-3 py-1.5 rounded-lg font-bold ${adminSortBy === sort ? 'bg-blue-500 text-white' : 'bg-slate-100 text-slate-600'}`}>
                                                        {sort === 'name' ? '이름순' : sort === 'day' ? '진행순' : sort === 'score' ? '점수순' : '소그룹순'}
                                                    </button>
                                                ))}
                                            </div>
                                            {usersWithDays.length > 0 ? (
                                                <table className="w-full text-sm">
                                                    <thead className="bg-slate-100">
                                                        <tr>
                                                            <th className="px-3 py-2 text-center text-xs font-bold text-slate-600 w-10">#</th>
                                                            <th className="px-3 py-2 text-left text-xs font-bold text-slate-600">이름</th>
                                                            <th className="px-3 py-2 text-left text-xs font-bold text-slate-600">소그룹</th>
                                                            <th className="px-3 py-2 text-center text-xs font-bold text-slate-600">안 읽은 날</th>
                                                            <th className="px-3 py-2 text-center text-xs font-bold text-slate-600">진행률</th>
                                                        </tr>
                                                    </thead>
                                                    <tbody>
                                                        {usersWithDays.slice(0, 50).map((u, idx) => (
                                                            <tr key={u.uid} className={`border-b ${u.daysSince >= 14 ? 'bg-red-50' : u.daysSince >= 7 ? 'bg-orange-50' : ''}`}>
                                                                <td className="px-3 py-2 text-center text-xs text-slate-400 font-mono">{idx + 1}</td>
                                                                <td className="px-3 py-2 font-bold text-slate-800">{u.name}</td>
                                                                <td className="px-3 py-2 text-slate-500 text-xs">{u.subgroupId || '-'}</td>
                                                                <td className="px-3 py-2 text-center">
                                                                    <span className={`px-2 py-0.5 rounded-full text-xs font-bold ${u.daysSince >= 14 ? 'bg-red-500 text-white' : u.daysSince >= 7 ? 'bg-orange-500 text-white' : 'bg-yellow-400 text-yellow-900'}`}>
                                                                        {u.daysSince === 999 ? '기록없음' : `${u.daysSince}일`}
                                                                    </span>
                                                                </td>
                                                                <td className="px-3 py-2 text-center text-xs">
                                                                    {(() => {
                                                                        const rc = u.readCount || 1;
                                                                        const totalDays = (rc - 1) * 365 + (u.currentDay || 1);
                                                                        return rc > 1 ? (
                                                                            <div className="flex items-center justify-center gap-1">
                                                                                <span className="font-bold text-slate-700">DAY {totalDays}</span>
                                                                                <span className="px-1.5 py-0.5 bg-purple-500 text-white text-[10px] font-bold rounded-full">{rc - 1}독 완료</span>
                                                                            </div>
                                                                        ) : <span className="font-bold text-slate-700">DAY {u.currentDay || 1}</span>;
                                                                    })()}
                                                                </td>
                                                            </tr>
                                                        ))}
                                                    </tbody>
                                                </table>
                                            ) : (
                                                <div className="text-center py-8 text-green-600"><div className="text-4xl mb-2">🎉</div><p className="font-bold">장기 미참여자가 없습니다!</p></div>
                                            )}
                                            {usersWithDays.length > 50 && <div className="mt-2 text-center text-xs text-slate-400">상위 50명만 표시 (전체 {usersWithDays.length}명)</div>}
                                        </div>
                                    );
                                })()}
                            </div>
                            <div className="mt-4 pt-3 border-t border-slate-100 flex gap-4 text-xs text-slate-500">
                                <span className="flex items-center gap-1"><span className="w-3 h-3 bg-yellow-400 rounded"></span>1-2일</span>
                                <span className="flex items-center gap-1"><span className="w-3 h-3 bg-orange-500 rounded"></span>3-6일</span>
                                <span className="flex items-center gap-1"><span className="w-3 h-3 bg-red-500 rounded"></span>7일+</span>
                            </div>
                        </div>

                        {/* Hall of Fame */}
                        <div className="bg-white rounded-xl shadow-sm p-6">
                            <h2 className="text-base font-bold text-slate-800 mb-4">
                                👑 완주자 명예의 전당 ({allUsers.filter(u => u.currentDay >= 365 || (u.readCount || 1) >= 2).length}명)
                            </h2>
                            {(() => {
                                const finishers = allUsers.filter(u => u.currentDay >= 365 || (u.readCount || 1) >= 2).sort((a, b) => (b.score || 0) - (a.score || 0));
                                return finishers.length > 0 ? (
                                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                                        {finishers.map((u, idx) => {
                                            const rc = u.readCount || 1;
                                            const churchName = churches.find(c => c.id === u.churchId)?.name || u.churchName || '-';
                                            return (
                                                <div key={u.uid} className={`p-4 rounded-xl text-center border-2 ${idx === 0 ? 'bg-yellow-50 border-yellow-300' : idx === 1 ? 'bg-slate-50 border-slate-300' : idx === 2 ? 'bg-orange-50 border-orange-300' : 'bg-white border-slate-100'}`}>
                                                    <div className="text-2xl mb-1">{idx === 0 ? '🥇' : idx === 1 ? '🥈' : idx === 2 ? '🥉' : '🏅'}</div>
                                                    <div className="font-bold text-slate-800 flex items-center justify-center gap-1">
                                                        {u.name}
                                                        {rc >= 2 && <span className="text-[10px] bg-purple-500 text-white px-1.5 py-0.5 rounded-full font-bold">{rc - 1}독 완료</span>}
                                                    </div>
                                                    <div className="text-xs text-slate-500">{u.score || 0}점</div>
                                                    <div className="text-[10px] text-slate-400">{churchName}</div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                ) : (
                                    <div className="text-center py-8 text-slate-400">
                                        <div className="text-4xl mb-2">🏰</div>
                                        <p>아직 완주자가 없습니다.</p>
                                    </div>
                                );
                            })()}
                        </div>

                        {/* Memos */}
                        <div className="bg-white rounded-xl shadow-sm p-6">
                            <div className="flex justify-between items-center mb-4">
                                <h2 className="text-base font-bold text-slate-800">📝 묵상 관리</h2>
                                <button onClick={generateMemosCSV}
                                    className="flex items-center gap-2 bg-green-600 text-white px-4 py-2 rounded-lg font-bold text-sm hover:bg-green-700">
                                    <Icon name="download" size={16} /> CSV
                                </button>
                            </div>
                            {(() => {
                                const usersWithMemos = allUsers.filter(u => Object.keys(u.memos || {}).length > 0);
                                const totalMemos = allUsers.reduce((sum, u) => sum + Object.keys(u.memos || {}).length, 0);
                                return (
                                    <div>
                                        <div className="grid grid-cols-3 gap-4 mb-4">
                                            <div className="bg-purple-50 p-4 rounded-xl text-center">
                                                <div className="text-2xl font-bold text-purple-600">{totalMemos}</div>
                                                <div className="text-xs text-slate-500">총 묵상 수</div>
                                            </div>
                                            <div className="bg-blue-50 p-4 rounded-xl text-center">
                                                <div className="text-2xl font-bold text-blue-600">{usersWithMemos.length}</div>
                                                <div className="text-xs text-slate-500">묵상 작성자</div>
                                            </div>
                                            <div className="bg-green-50 p-4 rounded-xl text-center">
                                                <div className="text-2xl font-bold text-green-600">
                                                    {allUsers.length > 0 ? Math.round((usersWithMemos.length / allUsers.length) * 100) : 0}%
                                                </div>
                                                <div className="text-xs text-slate-500">참여율</div>
                                            </div>
                                        </div>
                                        <h3 className="font-bold text-slate-700 mb-2">✍️ 묵상왕 TOP 10</h3>
                                        <div className="space-y-2 max-h-60 overflow-y-auto">
                                            {allUsers.map(u => ({ ...u, memoCount: Object.keys(u.memos || {}).length }))
                                                .filter(u => u.memoCount > 0)
                                                .sort((a, b) => b.memoCount - a.memoCount)
                                                .slice(0, 10)
                                                .map((u, idx) => (
                                                    <div key={u.uid} className="flex items-center justify-between bg-slate-50 p-3 rounded-lg">
                                                        <div className="flex items-center gap-3">
                                                            <span className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${idx === 0 ? 'bg-yellow-400 text-white' : idx === 1 ? 'bg-slate-400 text-white' : idx === 2 ? 'bg-orange-400 text-white' : 'bg-slate-200 text-slate-600'}`}>{idx + 1}</span>
                                                            <div>
                                                                <span className="font-bold text-slate-800">{u.name}</span>
                                                                <span className="text-xs text-slate-400 ml-2">{u.subgroupId}</span>
                                                            </div>
                                                        </div>
                                                        <div className="flex items-center gap-2">
                                                            <span className="text-sm font-bold text-purple-600">{u.memoCount}개</span>
                                                            <button onClick={() => generateMemosHTML(u.name, u.memos || {}, { currentDay: u.currentDay, score: u.score, streak: u.streak })}
                                                                className="text-xs bg-indigo-100 text-indigo-600 px-2 py-1 rounded hover:bg-indigo-200">HTML</button>
                                                        </div>
                                                    </div>
                                                ))}
                                        </div>
                                    </div>
                                );
                            })()}
                        </div>

                        {/* Period stats */}
                        <div className="bg-white rounded-xl shadow-sm p-6">
                            <h2 className="text-base font-bold text-slate-800 mb-4">📅 기간별 통계</h2>
                            <div className="flex flex-col sm:flex-row items-start sm:items-center gap-2">
                                <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} className="border border-slate-300 rounded p-2 text-sm" />
                                <span className="text-slate-400 font-bold">~</span>
                                <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} className="border border-slate-300 rounded p-2 text-sm" />
                                <button onClick={() => downloadPeriodStatsCSV(db, allUsers, startDate, endDate)}
                                    className="flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-lg font-bold text-sm hover:bg-blue-700">
                                    <Icon name="download" size={16} /> 다운로드
                                </button>
                            </div>
                        </div>
                    </>
                )}

                {/* ── 교회 목록 ── */}
                {tab === 'churches' && (
                    <>
                        {selectedChurch ? (
                            <div>
                                <button onClick={() => setSelectedChurchId(null)}
                                    className="flex items-center gap-1 text-sm text-slate-500 hover:text-slate-700 mb-4 font-bold">
                                    ← 교회 목록으로
                                </button>
                                <div className="bg-white rounded-xl shadow-sm p-6">
                                    <div className="flex flex-col md:flex-row md:items-start justify-between gap-4 mb-6">
                                        <div>
                                            <h2 className="text-xl font-black text-slate-800">🏛️ {selectedChurch.name}</h2>
                                            <p className="text-xs text-slate-400 mt-1">관리자: {selectedChurch.adminEmail || '-'}</p>
                                            <p className="text-xs text-slate-400">입장코드: <span className="font-mono bg-slate-100 px-1.5 rounded">{selectedChurch.churchCode || '-'}</span></p>
                                        </div>
                                        <div className="grid grid-cols-3 gap-3 shrink-0">
                                            <div className="bg-blue-50 p-3 rounded-xl text-center">
                                                <div className="text-2xl font-bold text-blue-600">{selectedChurch.memberCount}</div>
                                                <div className="text-[10px] text-slate-500">교인수</div>
                                            </div>
                                            <div className="bg-green-50 p-3 rounded-xl text-center">
                                                <div className="text-2xl font-bold text-green-600">{selectedChurch.readToday}</div>
                                                <div className="text-[10px] text-slate-500">오늘읽음</div>
                                            </div>
                                            <div className="bg-orange-50 p-3 rounded-xl text-center">
                                                <div className="text-2xl font-bold text-orange-600">{selectedChurch.readRate}%</div>
                                                <div className="text-[10px] text-slate-500">참여율</div>
                                            </div>
                                        </div>
                                    </div>

                                    <h3 className="font-bold text-slate-700 mb-3">👥 교인 목록 ({selectedChurchMembers.length}명)</h3>
                                    <div className="overflow-x-auto">
                                        <table className="w-full text-sm">
                                            <thead className="bg-slate-50">
                                                <tr>
                                                    <th className="px-3 py-2 text-left text-xs font-bold text-slate-600">이름</th>
                                                    <th className="px-3 py-2 text-left text-xs font-bold text-slate-600">소그룹</th>
                                                    <th className="px-3 py-2 text-center text-xs font-bold text-slate-600">진행</th>
                                                    <th className="px-3 py-2 text-center text-xs font-bold text-slate-600">점수</th>
                                                    <th className="px-3 py-2 text-center text-xs font-bold text-slate-600">마지막읽기</th>
                                                    <th className="px-3 py-2 text-center text-xs font-bold text-slate-600">관리</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {selectedChurchMembers
                                                    .sort((a, b) => a.name.localeCompare(b.name, 'ko-KR'))
                                                    .map(u => {
                                                        const readToday = u.lastReadDate === todayStr;
                                                        const rc = u.readCount || 1;
                                                        const totalDays = (rc - 1) * 365 + (u.currentDay || 1);
                                                        return (
                                                            <tr key={u.uid} className={`border-b hover:bg-slate-50 ${readToday ? 'bg-green-50' : ''}`}>
                                                                <td className="px-3 py-2 font-bold text-slate-800">
                                                                    {u.name}{readToday && <span className="ml-1 text-green-500 text-xs">✓</span>}
                                                                </td>
                                                                <td className="px-3 py-2 text-xs text-slate-500">{u.subgroupId || '-'}</td>
                                                                <td className="px-3 py-2 text-center">
                                                                    {rc > 1 ? (
                                                                        <div className="flex items-center justify-center gap-1">
                                                                            <span className="font-bold text-blue-600 text-xs">DAY {totalDays}</span>
                                                                            <span className="px-1 py-0.5 bg-purple-500 text-white text-[9px] font-bold rounded-full">{rc - 1}독 완료</span>
                                                                        </div>
                                                                    ) : <span className="font-bold text-blue-600 text-xs">DAY {u.currentDay || 1}</span>}
                                                                </td>
                                                                <td className="px-3 py-2 text-center text-xs">{u.score || 0}</td>
                                                                <td className="px-3 py-2 text-center text-xs text-slate-400">{u.lastReadDate ? new Date(u.lastReadDate).toLocaleDateString('ko-KR') : '-'}</td>
                                                                <td className="px-3 py-2 text-center">
                                                                    <div className="flex justify-center gap-1">
                                                                        <button onClick={() => setChangingPassword(u)} className="text-purple-500 p-1 bg-purple-50 rounded hover:bg-purple-100" title="암호 변경"><Icon name="refresh" size={14} /></button>
                                                                        <button onClick={() => startEditUser(u)} className="text-blue-500 p-1 bg-blue-50 rounded hover:bg-blue-100" title="정보 수정"><Icon name="edit" size={14} /></button>
                                                                        <button onClick={() => deleteUser(u.uid, u.name)} className="text-red-500 p-1 bg-red-50 rounded hover:bg-red-100" title="삭제"><Icon name="trash" size={14} /></button>
                                                                    </div>
                                                                </td>
                                                            </tr>
                                                        );
                                                    })}
                                            </tbody>
                                        </table>
                                        {selectedChurchMembers.length === 0 && (
                                            <div className="text-center py-12 text-slate-300">
                                                <div className="text-4xl mb-2">👥</div>
                                                <p>아직 가입한 교인이 없습니다</p>
                                            </div>
                                        )}
                                    </div>

                                    <div className="mt-6 pt-5 border-t-2 border-dashed border-red-100">
                                        <p className="text-xs font-bold text-red-400 mb-3">🧪 테스트 데이터 관리 (개발용)</p>
                                        <div className="flex gap-2">
                                            <button
                                                onClick={() => seedFakeUsers(selectedChurch)}
                                                disabled={seedingData}
                                                className="flex-1 bg-red-50 text-red-500 py-2.5 rounded-xl text-xs font-bold hover:bg-red-100 border border-red-100 disabled:opacity-50 transition-colors">
                                                {seedingData ? '처리 중...' : '가짜 교인 50명 추가'}
                                            </button>
                                            <button
                                                onClick={() => deleteSeedUsers(selectedChurch.id)}
                                                disabled={seedingData}
                                                className="flex-1 bg-slate-50 text-slate-400 py-2.5 rounded-xl text-xs font-bold hover:bg-slate-100 border border-slate-200 disabled:opacity-50 transition-colors">
                                                테스트 데이터 삭제
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        ) : (
                            <div>
                                <div className="text-sm text-slate-500 font-bold mb-3">총 {churchStats.length}개 교회</div>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    {churchStats.map(church => (
                                        <div key={church.id}
                                            onClick={() => setSelectedChurchId(church.id)}
                                            className="bg-white rounded-xl shadow-sm p-5 border border-slate-100 hover:border-blue-300 hover:shadow-md transition-all cursor-pointer">
                                            <div className="flex items-start justify-between mb-3">
                                                <div>
                                                    <h3 className="font-black text-slate-800 text-base">🏛️ {church.name}</h3>
                                                    <p className="text-xs text-slate-400 mt-0.5">{church.adminEmail || '이메일 미설정'}</p>
                                                </div>
                                                <span className="text-[10px] bg-slate-100 text-slate-500 px-2 py-1 rounded-full font-mono shrink-0">코드: {church.churchCode || '-'}</span>
                                            </div>
                                            <div className="grid grid-cols-3 gap-2 mb-3">
                                                <div className="bg-slate-50 p-2 rounded-lg text-center">
                                                    <div className="font-bold text-slate-700 text-lg">{church.memberCount}</div>
                                                    <div className="text-[10px] text-slate-400">교인수</div>
                                                </div>
                                                <div className="bg-green-50 p-2 rounded-lg text-center">
                                                    <div className="font-bold text-green-600 text-lg">{church.readToday}</div>
                                                    <div className="text-[10px] text-slate-400">오늘읽음</div>
                                                </div>
                                                <div className={`p-2 rounded-lg text-center ${church.readRate >= 70 ? 'bg-blue-50' : church.readRate >= 40 ? 'bg-yellow-50' : 'bg-red-50'}`}>
                                                    <div className={`font-bold text-lg ${church.readRate >= 70 ? 'text-blue-600' : church.readRate >= 40 ? 'text-yellow-600' : 'text-red-500'}`}>
                                                        {church.readRate}%
                                                    </div>
                                                    <div className="text-[10px] text-slate-400">참여율</div>
                                                </div>
                                            </div>
                                            <div className="flex items-center gap-2">
                                                <div className="flex-1 h-2 bg-slate-100 rounded-full overflow-hidden">
                                                    <div className="h-full bg-blue-400 rounded-full transition-all" style={{ width: `${church.readRate}%` }}></div>
                                                </div>
                                                <span className="text-xs text-blue-600 font-bold shrink-0">관리 →</span>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                                {churchStats.length === 0 && (
                                    <div className="text-center py-16 text-slate-300 bg-white rounded-xl">
                                        <div className="text-4xl mb-2">🏛️</div>
                                        <p>등록된 교회가 없습니다</p>
                                    </div>
                                )}
                            </div>
                        )}
                    </>
                )}

                {/* ── 회원 목록 ── */}
                {tab === 'members' && (
                    <div className="bg-white rounded-xl shadow-sm p-6">
                        <div className="flex justify-between items-center mb-4">
                            <h2 className="text-base font-bold text-slate-800">👥 전체 회원 목록</h2>
                            <div className="flex gap-2 flex-wrap">
                                {['name', 'day', 'score', 'subgroup'].map(sort => (
                                    <button key={sort} onClick={() => setAdminSortBy(sort)}
                                        className={`text-xs px-3 py-1.5 rounded-lg font-bold ${adminSortBy === sort ? 'bg-blue-500 text-white' : 'bg-slate-100 text-slate-600'}`}>
                                        {sort === 'name' ? '이름순' : sort === 'day' ? '진행순' : sort === 'score' ? '점수순' : '소그룹순'}
                                    </button>
                                ))}
                            </div>
                        </div>
                        <div className="overflow-x-auto">
                            <table className="w-full text-sm text-left text-slate-600">
                                <thead className="text-xs text-slate-700 uppercase bg-slate-50">
                                    <tr>
                                        <th className="px-3 py-3 text-center w-10">#</th>
                                        <th className="px-3 py-3">이름</th>
                                        <th className="px-3 py-3">교회</th>
                                        <th className="px-3 py-3">부서/소그룹</th>
                                        <th className="px-3 py-3 text-center">Day</th>
                                        <th className="px-3 py-3 text-center">점수</th>
                                        <th className="px-3 py-3 text-center">마지막읽기</th>
                                        <th className="px-3 py-3 text-center">관리</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {(() => {
                                        const sorted = [...allUsers].sort((a, b) => {
                                            if (adminSortBy === 'name') return a.name.localeCompare(b.name);
                                            if (adminSortBy === 'day') return (((b.readCount || 1) - 1) * 365 + (b.currentDay || 1)) - (((a.readCount || 1) - 1) * 365 + (a.currentDay || 1));
                                            if (adminSortBy === 'score') return (b.score || 0) - (a.score || 0);
                                            if (adminSortBy === 'subgroup') {
                                                const c = (a.departmentName || '').localeCompare(b.departmentName || '', 'ko-KR');
                                                return c !== 0 ? c : (a.subgroupId || '').localeCompare(b.subgroupId || '', 'ko-KR');
                                            }
                                            return 0;
                                        });
                                        return sorted.map((u, idx) => {
                                            const readToday = u.lastReadDate === todayStr;
                                            const rc = u.readCount || 1;
                                            const totalDays = (rc - 1) * 365 + (u.currentDay || 1);
                                            const churchName = churches.find(c => c.id === u.churchId)?.name || u.churchName || '-';
                                            return (
                                                <tr key={idx} className={`border-b hover:bg-slate-50 ${readToday ? 'bg-green-50' : ''}`}>
                                                    <td className="px-3 py-3 text-center text-xs text-slate-400 font-mono italic">{idx + 1}</td>
                                                    <td className="px-3 py-3 font-medium text-slate-900">{u.name}{readToday && <span className="ml-1 text-green-500">✓</span>}</td>
                                                    <td className="px-3 py-3 text-xs text-slate-500">{churchName}</td>
                                                    <td className="px-3 py-3">
                                                        <span className="font-bold text-slate-700 text-xs">{u.departmentName || '-'}</span>
                                                        <span className="text-xs text-slate-400 block">{u.subgroupId || ''}</span>
                                                    </td>
                                                    <td className="px-3 py-3 text-center">
                                                        {rc > 1 ? (
                                                            <div className="flex items-center justify-center gap-1">
                                                                <span className="font-bold text-blue-600">DAY {totalDays}</span>
                                                                <span className="px-1.5 py-0.5 bg-gradient-to-br from-purple-500 to-purple-700 text-white text-[10px] font-bold rounded-full">{rc - 1}독 완료</span>
                                                            </div>
                                                        ) : <span className="font-bold text-blue-600">DAY {u.currentDay || 1}</span>}
                                                    </td>
                                                    <td className="px-3 py-3 text-center">{u.score || 0}</td>
                                                    <td className="px-3 py-3 text-center text-xs text-slate-400">{u.lastReadDate ? new Date(u.lastReadDate).toLocaleDateString('ko-KR') : '-'}</td>
                                                    <td className="px-3 py-3 text-center">
                                                        <div className="flex justify-center gap-1">
                                                            <button onClick={() => setChangingPassword(u)} className="text-purple-500 p-1 bg-purple-50 rounded" title="암호 변경"><Icon name="refresh" size={14} /></button>
                                                            <button onClick={() => startEditUser(u)} className="text-blue-500 p-1 bg-blue-50 rounded" title="정보 수정"><Icon name="edit" size={14} /></button>
                                                            <button onClick={() => deleteUser(u.uid, u.name)} className="text-red-500 p-1 bg-red-50 rounded" title="삭제"><Icon name="trash" size={14} /></button>
                                                        </div>
                                                    </td>
                                                </tr>
                                            );
                                        });
                                    })()}
                                </tbody>
                            </table>
                        </div>
                    </div>
                )}

                {/* ── 공지 관리 ── */}
                {tab === 'announcement' && (
                    <div className="space-y-5">
                        <div className="bg-white rounded-xl shadow-sm p-6">
                            <h2 className="text-base font-bold text-slate-800 mb-4">📢 공지 / 카카오 관리</h2>
                            <label className="block text-sm font-bold text-slate-600 mb-2">관리할 교회 선택</label>
                            <select value={announcementChurchId} onChange={e => setAnnouncementChurchId(e.target.value)}
                                className="w-full border border-slate-200 rounded-xl p-3 text-sm bg-slate-50 focus:outline-none focus:ring-2 focus:ring-blue-400">
                                <option value="">교회를 선택하세요</option>
                                {churches.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                            </select>
                        </div>

                        {announcementChurchId && (
                            <>
                                <div className="bg-white rounded-xl shadow-sm p-6">
                                    <h3 className="font-bold text-slate-700 mb-4 flex items-center gap-2">
                                        📢 공지사항
                                        <span className="text-xs text-blue-600 font-normal bg-blue-50 px-2 py-0.5 rounded-full">
                                            {churches.find(c => c.id === announcementChurchId)?.name}
                                        </span>
                                    </h3>
                                    <textarea value={announcementInput.text}
                                        onChange={e => setAnnouncementInput(prev => ({ ...prev, text: e.target.value }))}
                                        placeholder="공지사항 내용을 입력하세요..."
                                        rows={4}
                                        className="w-full p-3 border rounded-xl text-sm resize-none focus:ring-2 focus:ring-blue-500 outline-none" />

                                    <div className="space-y-3 mt-4">
                                        <div className="flex justify-between items-center">
                                            <label className="text-sm font-bold text-slate-600">링크 버튼</label>
                                            <button onClick={() => setAnnouncementInput(prev => ({ ...prev, links: [...(prev.links || []), { url: '', text: '' }] }))}
                                                className="text-xs bg-blue-50 text-blue-600 px-3 py-1.5 rounded-lg font-bold flex items-center gap-1 hover:bg-blue-100">
                                                <Icon name="plus" size={12} /> 버튼 추가
                                            </button>
                                        </div>
                                        {(announcementInput.links || []).map((link, idx) => (
                                            <div key={idx} className="bg-slate-50 p-3 rounded-xl relative border border-slate-100">
                                                <button onClick={() => setAnnouncementInput(prev => ({ ...prev, links: prev.links.filter((_, i) => i !== idx) }))}
                                                    className="absolute -top-2 -right-2 bg-white text-red-500 p-1 rounded-full shadow border border-red-100">
                                                    <Icon name="trash" size={12} />
                                                </button>
                                                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                                    <input type="text" value={link.text}
                                                        onChange={e => { const links = [...announcementInput.links]; links[idx] = { ...links[idx], text: e.target.value }; setAnnouncementInput(prev => ({ ...prev, links })); }}
                                                        placeholder="버튼 글자 (예: 바로가기)"
                                                        className="w-full p-2 border rounded-lg text-sm bg-white" />
                                                    <input type="url" value={link.url}
                                                        onChange={e => { const links = [...announcementInput.links]; links[idx] = { ...links[idx], url: e.target.value }; setAnnouncementInput(prev => ({ ...prev, links })); }}
                                                        placeholder="https://..."
                                                        className="w-full p-2 border rounded-lg text-sm bg-white" />
                                                </div>
                                            </div>
                                        ))}
                                    </div>

                                    <div className="flex items-center justify-between mt-4 pt-4 border-t border-slate-100">
                                        <label className="flex items-center gap-2 cursor-pointer">
                                            <input type="checkbox" checked={announcementInput.enabled}
                                                onChange={e => setAnnouncementInput(prev => ({ ...prev, enabled: e.target.checked }))}
                                                className="w-5 h-5 rounded border-slate-300 text-blue-600" />
                                            <span className="text-sm font-bold text-slate-600">공지 활성화</span>
                                        </label>
                                        <button onClick={() => saveAnnouncement(announcementChurchId)}
                                            className="bg-blue-600 text-white px-8 py-2.5 rounded-xl font-bold hover:bg-blue-700 shadow-sm">
                                            저장하기
                                        </button>
                                    </div>

                                    {announcementInput.text && (
                                        <div className="mt-4 p-4 bg-slate-50 rounded-xl border-2 border-dashed border-slate-300">
                                            <p className="text-xs text-slate-400 mb-3 font-bold uppercase">배너 미리보기</p>
                                            <div className="bg-white border-2 border-slate-100 rounded-3xl p-6 shadow-sm">
                                                <div className="flex flex-col md:flex-row items-center gap-4">
                                                    <div className="w-14 h-14 bg-slate-50 rounded-2xl flex items-center justify-center text-3xl border border-slate-100 shrink-0">📢</div>
                                                    <div className="flex-1 text-center md:text-left">
                                                        <p className="text-base text-slate-900 font-bold whitespace-pre-wrap">{announcementInput.text}</p>
                                                        <div className="flex flex-wrap justify-center md:justify-start gap-2 mt-4">
                                                            {(announcementInput.links || []).map((link, idx) => link.text && (
                                                                <div key={idx} className="bg-[#03C75A] text-white px-6 py-2.5 rounded-2xl text-sm font-black shadow">{link.text}</div>
                                                            ))}
                                                        </div>
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    )}
                                </div>

                                <div className="bg-white rounded-xl shadow-sm p-6">
                                    <h3 className="font-bold text-slate-700 mb-4 flex items-center gap-2">
                                        💬 카카오톡 채널
                                        <span className="text-xs text-yellow-600 font-normal bg-yellow-50 px-2 py-0.5 rounded-full">
                                            {churches.find(c => c.id === announcementChurchId)?.name}
                                        </span>
                                    </h3>
                                    <input type="url" value={kakaoLinkInput}
                                        onChange={e => setKakaoLinkInput(e.target.value)}
                                        placeholder="https://pf.kakao.com/_xxxx/chat"
                                        className="w-full p-3 border rounded-xl text-sm bg-slate-50 focus:ring-2 focus:ring-yellow-400 outline-none" />
                                    <p className="text-xs text-slate-400 mt-1">카카오톡 채널 관리자 센터에서 채팅 URL을 복사하여 붙여넣으세요.</p>
                                    <div className="flex justify-end mt-3">
                                        <button onClick={() => saveKakaoLink(announcementChurchId)}
                                            className="bg-[#FEE500] text-[#3c1e1e] px-8 py-2.5 rounded-xl font-bold hover:bg-[#FDD835]">
                                            링크 저장하기
                                        </button>
                                    </div>
                                </div>
                            </>
                        )}
                    </div>
                )}

                {/* ── 노션 동기화 ── */}
                {tab === 'sync' && (
                    <div className="bg-white rounded-xl shadow-sm p-6">
                        <h2 className="text-base font-bold text-slate-800 mb-4">🔄 노션 데이터 동기화</h2>
                        <div className="bg-blue-50 p-4 rounded-xl border border-blue-200 mb-4">
                            <p className="text-sm text-blue-700">
                                노션의 성경 본문을 Firestore에 캐싱하여 <strong>로딩 속도를 10배 이상</strong> 향상시킵니다.<br />
                                노션 본문을 수정했을 때만 동기화하면 됩니다.
                            </p>
                        </div>
                        {lastSyncInfo && (
                            <div className="bg-slate-50 p-3 rounded-lg mb-4 text-sm">
                                <p className="text-slate-600">마지막 동기화: {(lastSyncInfo.lastSyncAt && lastSyncInfo.lastSyncAt.toDate) ? lastSyncInfo.lastSyncAt.toDate().toLocaleString('ko-KR') : '정보 없음'}</p>
                                <p className="text-slate-500 text-xs">성공: {lastSyncInfo.successCount || 0}개 / 실패: {lastSyncInfo.errorCount || 0}개</p>
                                {lastSyncInfo.syncedVersions && <p className="text-slate-400 text-xs mt-1">동기화된 버전: {lastSyncInfo.syncedVersions.join(', ')}</p>}
                                {lastSyncInfo.failedItems && lastSyncInfo.failedItems.length > 0 && (
                                    <div className="mt-3 pt-3 border-t border-slate-200">
                                        <p className="text-red-600 text-xs font-bold mb-2">❌ 실패 목록 ({lastSyncInfo.failedItems.length}개):</p>
                                        <div className="max-h-32 overflow-y-auto bg-white rounded p-2 text-xs">
                                            {lastSyncInfo.failedItems.map((item, idx) => (
                                                <div key={idx} className="text-red-500 py-0.5">• {item.versionName} Day {item.day} ({item.date}) - {item.error}</div>
                                            ))}
                                        </div>
                                    </div>
                                )}
                            </div>
                        )}
                        {syncProgress ? (
                            <div className="space-y-3">
                                <div className="bg-amber-50 p-4 rounded-xl border border-amber-200">
                                    <p className="text-sm font-bold text-amber-700 mb-2">⏳ 동기화 진행 중... ({syncProgress.current}/{syncProgress.total})</p>
                                    {syncProgress.status && <p className="text-xs text-amber-800 mb-2 font-medium">{syncProgress.status}</p>}
                                    {syncProgress.currentVersion && <p className="text-xs text-amber-600 mb-2">버전: {syncProgress.currentVersion} {syncProgress.currentDay > 0 && `- Day ${syncProgress.currentDay}`}</p>}
                                    <div className="w-full bg-amber-200 rounded-full h-3">
                                        <div className="bg-amber-500 h-3 rounded-full transition-all" style={{ width: `${(syncProgress.current / syncProgress.total) * 100}%` }}></div>
                                    </div>
                                    <p className="text-xs text-amber-600 mt-2">✅ 성공: {syncProgress.success}개 / ❌ 실패: {syncProgress.error}개</p>
                                </div>
                                <p className="text-xs text-slate-500 text-center">⚠️ 창을 닫지 마세요. 약 2분 소요됩니다.</p>
                            </div>
                        ) : (
                            <div className="space-y-4">
                                <p className="text-sm font-bold text-slate-700">동기화할 버전 선택:</p>
                                <div className="grid grid-cols-2 gap-2">
                                    <div className="bg-slate-50 p-3 rounded-lg">
                                        <p className="text-xs font-bold text-slate-500 mb-2">📖 일년일독</p>
                                        {BIBLE_VERSIONS['1year'].map(v => {
                                            const planId = `1year_${v.id}`;
                                            const isChecked = selectedSyncVersions.indexOf(planId) !== -1;
                                            return (
                                                <label key={planId} className="flex items-center gap-2 py-1 cursor-pointer">
                                                    <input type="checkbox" checked={isChecked}
                                                        onChange={e => {
                                                            if (e.target.checked) setSelectedSyncVersions([...selectedSyncVersions, planId]);
                                                            else setSelectedSyncVersions(selectedSyncVersions.filter(id => id !== planId));
                                                        }} className="w-4 h-4 rounded" />
                                                    <span className="text-sm text-slate-700">{v.name}</span>
                                                </label>
                                            );
                                        })}
                                    </div>
                                    <div className="bg-slate-50 p-3 rounded-lg">
                                        <p className="text-xs font-bold text-slate-500 mb-2">📗 신약일독</p>
                                        {BIBLE_VERSIONS['nt'].map(v => {
                                            const planId = `nt_${v.id}`;
                                            const isChecked = selectedSyncVersions.indexOf(planId) !== -1;
                                            return (
                                                <label key={planId} className="flex items-center gap-2 py-1 cursor-pointer">
                                                    <input type="checkbox" checked={isChecked}
                                                        onChange={e => {
                                                            if (e.target.checked) setSelectedSyncVersions([...selectedSyncVersions, planId]);
                                                            else setSelectedSyncVersions(selectedSyncVersions.filter(id => id !== planId));
                                                        }} className="w-4 h-4 rounded" />
                                                    <span className="text-sm text-slate-700">{v.name}</span>
                                                </label>
                                            );
                                        })}
                                    </div>
                                </div>
                                <div className="bg-green-50 p-3 rounded-lg border border-green-200">
                                    <p className="text-sm text-green-700">선택됨: <strong>{selectedSyncVersions.length}개</strong> 버전</p>
                                </div>
                                <button
                                    onClick={async () => {
                                        if (selectedSyncVersions.length === 0) { alert('동기화할 버전을 선택해주세요.'); return; }
                                        if (!confirm(`${selectedSyncVersions.length}개 버전을 동기화합니다. 진행할까요?`)) return;
                                        setSyncProgress({ current: 0, total: selectedSyncVersions.length * 365, success: 0, error: 0, currentVersion: '', currentDay: 0 });
                                        const result = await syncNotionToFirestore(selectedSyncVersions);
                                        alert(`동기화 완료!\n성공: ${result.success}개\n실패: ${result.error}개`);
                                        const syncDoc = await db.collection('settings').doc('sync').get();
                                        if (syncDoc.exists) setLastSyncInfo(syncDoc.data());
                                    }}
                                    disabled={selectedSyncVersions.length === 0}
                                    className="w-full bg-blue-600 text-white font-bold py-4 rounded-xl hover:bg-blue-700 text-lg disabled:opacity-50">
                                    📥 선택한 버전 동기화 ({selectedSyncVersions.length * 365}개)
                                </button>
                            </div>
                        )}
                    </div>
                )}
            </div>

            {/* Edit User Modal */}
            {editingUser && (
                <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
                    <div className="bg-white rounded-xl p-6 w-full max-w-md shadow-2xl space-y-4 max-h-[90vh] overflow-y-auto">
                        <h3 className="font-bold text-lg border-b pb-2">회원 정보 수정 ({editingUser.name})</h3>
                        <div>
                            <label className="block text-xs font-bold text-slate-500 mb-1">소속 공동체</label>
                            <select value={editingUser.departmentId || ''} onChange={e => {
                                const comm = DEFAULT_DEPARTMENTS.find(c => c.id === e.target.value);
                                if (comm) setEditingUser({ ...editingUser, departmentId: comm.id, departmentName: comm.name, subgroupId: comm.subgroups[0] });
                            }} className="w-full border rounded p-2 text-sm">
                                {DEFAULT_DEPARTMENTS.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                            </select>
                        </div>
                        <div>
                            <label className="block text-xs font-bold text-slate-500 mb-1">소그룹</label>
                            <select value={editingUser.subgroupId || ''} onChange={e => setEditingUser({ ...editingUser, subgroupId: e.target.value })} className="w-full border rounded p-2 text-sm">
                                {(() => {
                                    const comm = DEFAULT_DEPARTMENTS.find(c => c.id === editingUser.departmentId);
                                    return comm ? comm.subgroups.map(s => <option key={s} value={s}>{s}</option>) : null;
                                })()}
                            </select>
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                            <div>
                                <label className="block text-xs font-bold text-slate-500 mb-1">현재 Day</label>
                                <input type="number" min="1" max="365" value={editingUser.currentDay || 1}
                                    onChange={e => setEditingUser({ ...editingUser, currentDay: parseInt(e.target.value) || 1 })}
                                    className="w-full border rounded p-2 text-sm" />
                            </div>
                            <div>
                                <label className="block text-xs font-bold text-slate-500 mb-1">독수 (readCount)</label>
                                <input type="number" min="1" value={editingUser.readCount || 1}
                                    onChange={e => setEditingUser({ ...editingUser, readCount: parseInt(e.target.value) || 1 })}
                                    className="w-full border rounded p-2 text-sm" />
                            </div>
                        </div>
                        <div className="flex gap-2 pt-4">
                            <button onClick={saveEditUser} className="flex-1 bg-blue-600 text-white py-2 rounded hover:bg-blue-700">저장</button>
                            <button onClick={() => setEditingUser(null)} className="flex-1 bg-slate-200 text-slate-600 py-2 rounded hover:bg-slate-300">취소</button>
                        </div>
                    </div>
                </div>
            )}

            {/* Change Password Modal */}
            {changingPassword && (
                <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4" onClick={() => setChangingPassword(null)}>
                    <div className="bg-white rounded-xl p-6 w-full max-w-md shadow-2xl" onClick={e => e.stopPropagation()}>
                        <h3 className="text-xl font-bold text-slate-800 mb-4 border-b pb-2">🔑 암호 변경</h3>
                        <div className="bg-blue-50 p-3 rounded-lg mb-4">
                            <p className="text-sm text-blue-700"><strong>{changingPassword.name}</strong>님의 암호를 변경합니다.</p>
                            <p className="text-xs text-blue-600 mt-1">현재 암호: {changingPassword.password}</p>
                        </div>
                        <div className="mb-4">
                            <label className="block text-sm font-bold text-slate-600 mb-2">새 암호 (6자리 이상)</label>
                            <input type="text" value={newPassword} onChange={e => setNewPassword(e.target.value)}
                                placeholder="123456"
                                className="w-full border border-slate-300 rounded-lg p-3 text-lg font-mono focus:outline-none focus:ring-2 focus:ring-blue-500"
                                autoFocus />
                            <p className="text-xs text-slate-400 mt-1">※ 사용자에게 이 암호를 전달해주세요</p>
                        </div>
                        <div className="flex gap-2">
                            <button onClick={() => changePassword(changingPassword.uid, changingPassword.name, changingPassword.password)}
                                disabled={!newPassword || newPassword.length < 6}
                                className="flex-1 bg-blue-600 text-white py-3 rounded-lg hover:bg-blue-700 disabled:opacity-50 font-bold">
                                암호 변경
                            </button>
                            <button onClick={() => { setChangingPassword(null); setNewPassword(''); }}
                                className="flex-1 bg-slate-200 text-slate-600 py-3 rounded-lg hover:bg-slate-300 font-bold">
                                취소
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default PlatformAdminView;
