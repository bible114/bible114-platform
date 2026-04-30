import React, { useState, useEffect } from 'react';
import { db } from '../utils/firebase';
import OrgEditor from './OrgEditor';

const DAILY_VERSES = [
    { text: "내 발에 등이요 내 길에 빛이니이다", ref: "시편 119:105" },
    { text: "여호와는 나의 목자시니 내게 부족함이 없으리로다", ref: "시편 23:1" },
    { text: "오직 여호와를 앙망하는 자는 새 힘을 얻으리니", ref: "이사야 40:31" },
    { text: "이 율법책을 네 입에서 떠나지 말게 하며 주야로 그것을 묵상하라", ref: "여호수아 1:8" },
    { text: "사람이 떡으로만 살 것이 아니요 하나님의 입으로 나오는 모든 말씀으로 살 것이라", ref: "마태복음 4:4" },
    { text: "모든 성경은 하나님의 감동으로 된 것으로 교훈과 책망과 바르게 함과 의로 교육하기에 유익하니", ref: "디모데후서 3:16" },
    { text: "태초에 말씀이 계시니라 이 말씀이 하나님과 함께 계셨으니", ref: "요한복음 1:1" },
    { text: "여호와의 말씀은 순결함이여 흙 도가니에 일곱 번 단련한 은 같도다", ref: "시편 12:6" },
    { text: "주의 말씀의 맛이 내게 어찌 그리 단지요 내 입에 꿀보다 더 다니이다", ref: "시편 119:103" },
    { text: "나는 포도나무요 너희는 가지라 그가 내 안에 내가 그 안에 거하면 사람이 열매를 많이 맺나니", ref: "요한복음 15:5" },
    { text: "내가 주의 법을 어찌 그리 사랑하는지요 내가 그것을 종일 작은 소리로 읊조리나이다", ref: "시편 119:97" },
    { text: "하나님의 말씀은 살아 있고 활력이 있어 좌우에 날선 어떤 검보다도 예리하여", ref: "히브리서 4:12" },
];

const todayVerse = () => {
    const start = new Date(new Date().getFullYear(), 0, 0);
    const dayOfYear = Math.floor((Date.now() - start) / 86400000);
    return DAILY_VERSES[dayOfYear % DAILY_VERSES.length];
};

const AdminContactModal = ({ onClose }) => {
    const [admins, setAdmins] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        db.collection('users').where('role', '==', 'churchAdmin').get()
            .then(snap => {
                setAdmins(snap.docs.map(d => ({ name: d.data().name, churchName: d.data().churchName }))
                    .sort((a, b) => (a.churchName || '').localeCompare(b.churchName || '', 'ko-KR')));
            })
            .catch(() => {})
            .finally(() => setLoading(false));
    }, []);

    return (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-end justify-center" onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
            <div className="bg-white rounded-t-3xl w-full max-w-md p-6 pb-8 shadow-2xl" onClick={e => e.stopPropagation()}>
                <div className="flex justify-between items-center mb-4">
                    <h3 className="font-bold text-slate-800 text-base">교회별 관리자</h3>
                    <button onClick={onClose} className="text-slate-400 text-xl leading-none">✕</button>
                </div>
                {loading ? (
                    <p className="text-center text-slate-400 text-sm py-4">불러오는 중...</p>
                ) : admins.length === 0 ? (
                    <p className="text-center text-slate-400 text-sm py-4">등록된 관리자가 없습니다.</p>
                ) : (
                    <ul className="space-y-2 max-h-64 overflow-y-auto">
                        {admins.map((a, i) => (
                            <li key={i} className="flex items-center justify-between bg-slate-50 rounded-xl px-4 py-3">
                                <span className="text-sm font-bold text-slate-700">{a.churchName || '(교회명 없음)'}</span>
                                <span className="text-sm text-slate-500">{a.name}</span>
                            </li>
                        ))}
                    </ul>
                )}
            </div>
        </div>
    );
};

const LoginView = ({ onMemberLogin, onChurchAdminLogin, onMemberSignup, onChurchAdminSignup, errorMsg, setErrorMsg }) => {
    const [tab, setTab] = useState('login');
    const [loginType, setLoginType] = useState('member');
    const [signupType, setSignupType] = useState(null);
    const [signupStep, setSignupStep] = useState(1);
    const [showAdminContact, setShowAdminContact] = useState(false);
    const [userCount, setUserCount] = useState(null);

    const [loginName, setLoginName] = useState('');
    const [loginBirthdate, setLoginBirthdate] = useState('');
    const [loginChurchId, setLoginChurchId] = useState('');
    const [loginEmail, setLoginEmail] = useState('');
    const [loginPw, setLoginPw] = useState('');

    const [mName, setMName] = useState('');
    const [mBirthdate, setMBirthdate] = useState('');
    const [mPw, setMPw] = useState('');
    const [mPwConfirm, setMPwConfirm] = useState('');
    const [mChurchId, setMChurchId] = useState('');
    const [mChurchCode, setMChurchCode] = useState('');

    const [aName, setAName] = useState('');
    const [aEmail, setAEmail] = useState('');
    const [aPw, setAPw] = useState('');
    const [aPwConfirm, setAPwConfirm] = useState('');
    const [aChurchName, setAChurchName] = useState('');
    const [aChurchCode, setAChurchCode] = useState('');

    const [orgComms, setOrgComms] = useState([{ id: 'comm_0', name: '', subgroups: [{ id: 'sub_0', name: '' }] }]);
    const [churches, setChurches] = useState([]);
    const [loading, setLoading] = useState(false);

    const verse = todayVerse();

    useEffect(() => {
        db.collection('users').where('role', '==', 'member').get()
            .then(snap => setUserCount(snap.size))
            .catch(() => {});
    }, []);

    useEffect(() => {
        if (signupType === 'member' || loginType === 'member') {
            db.collection('churches').get().then(snap => {
                setChurches(snap.docs.map(d => ({ id: d.id, ...d.data() })).sort((a, b) => (a.name || '').localeCompare(b.name || '', 'ko-KR')));
            }).catch(() => {});
        }
    }, [signupType, loginType]);

    const clearError = () => setErrorMsg('');

    const handleMemberLogin = async (e) => {
        e.preventDefault();
        if (!loginName.trim() || !loginBirthdate.trim() || !loginChurchId || !loginPw.trim()) { setErrorMsg('모든 항목을 입력해주세요.'); return; }
        setLoading(true);
        await onMemberLogin(loginName.trim(), loginBirthdate.trim(), loginPw, loginChurchId);
        setLoading(false);
    };

    const handleAdminLogin = async (e) => {
        e.preventDefault();
        if (!loginEmail.trim() || !loginPw.trim()) { setErrorMsg('이메일과 비밀번호를 입력해주세요.'); return; }
        setLoading(true);
        await onChurchAdminLogin(loginEmail.trim(), loginPw);
        setLoading(false);
    };

    const handleMemberSignup = async (e) => {
        e.preventDefault();
        if (!mName.trim() || !mBirthdate.trim() || !mPw || !mChurchId || !mChurchCode.trim()) { setErrorMsg('모든 항목을 입력해주세요.'); return; }
        if (mPw !== mPwConfirm) { setErrorMsg('비밀번호가 일치하지 않습니다.'); return; }
        if (mPw.length < 6) { setErrorMsg('비밀번호는 6자리 이상이어야 합니다.'); return; }
        setLoading(true);
        await onMemberSignup({ name: mName.trim(), birthdate: mBirthdate.trim(), password: mPw, churchId: mChurchId, churchCode: mChurchCode.trim() });
        setLoading(false);
    };

    const handleAdminStep1 = (e) => {
        e.preventDefault();
        if (!aName.trim() || !aEmail.trim() || !aPw || !aChurchName.trim() || !aChurchCode.trim()) { setErrorMsg('모든 항목을 입력해주세요.'); return; }
        if (aPw !== aPwConfirm) { setErrorMsg('비밀번호가 일치하지 않습니다.'); return; }
        if (aPw.length < 6) { setErrorMsg('비밀번호는 6자리 이상이어야 합니다.'); return; }
        if (aChurchCode.length < 4) { setErrorMsg('교회 입장코드는 4자리 이상이어야 합니다.'); return; }
        clearError(); setSignupStep(2);
    };

    const handleAdminSignupFinal = async () => {
        const getSubName = (s) => (typeof s === 'string' ? s : s.name);
        const getSubId = (s) => (typeof s === 'string' ? null : s.id);
        const validComms = orgComms.filter(c => c.name.trim()).map(c => ({
            id: c.id, name: c.name.trim(),
            subgroups: c.subgroups
                .filter(s => getSubName(s).trim())
                .map(s => ({ id: getSubId(s) || ('sub_' + Date.now().toString(36)), name: getSubName(s).trim() })),
        }));
        if (validComms.length === 0) { setErrorMsg('최소 하나의 부서를 추가해주세요.'); return; }
        setLoading(true);
        await onChurchAdminSignup({ name: aName.trim(), email: aEmail.trim(), password: aPw, churchName: aChurchName.trim(), churchCode: aChurchCode.trim(), departments: validComms });
        setLoading(false);
    };

    const resetAdminSignup = () => { setSignupType(null); setSignupStep(1); setOrgComms([{ id: 'comm_0', name: '', subgroups: [{ id: 'sub_0', name: '' }] }]); clearError(); };

    const inputCls = "w-full bg-white border border-slate-200 rounded-xl px-4 py-3 text-sm text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-400 focus:border-transparent transition-all";

    return (
        <div className="min-h-screen bg-gradient-to-b from-blue-600 via-blue-700 to-indigo-800 flex flex-col">

            {/* 히어로 */}
            <div className="flex-shrink-0 pt-12 pb-8 px-6 text-center">
                <div className="w-20 h-20 bg-white/20 backdrop-blur-sm rounded-3xl flex items-center justify-center text-5xl mx-auto mb-4 shadow-lg border border-white/30">
                    📖
                </div>
                <h1 className="text-3xl font-extrabold text-white tracking-tight">천로역정 성경 레이스</h1>
                <p className="text-blue-200 text-sm mt-1.5">여러 교회가 함께하는 성경읽기</p>

                {/* 참여자 수 */}
                {userCount !== null && (
                    <div className="mt-4 inline-flex items-center gap-2 bg-white/15 backdrop-blur-sm border border-white/25 rounded-full px-4 py-1.5">
                        <span className="w-2 h-2 rounded-full bg-green-400 animate-pulse"></span>
                        <span className="text-white text-xs font-semibold">현재 {userCount.toLocaleString()}명이 함께 읽고 있습니다</span>
                    </div>
                )}

                {/* 오늘의 말씀 */}
                <div className="mt-4 bg-white/10 backdrop-blur-sm border border-white/20 rounded-2xl px-5 py-3 text-left mx-auto max-w-xs">
                    <p className="text-white/60 text-[10px] font-bold uppercase tracking-widest mb-1">오늘의 말씀</p>
                    <p className="text-white text-xs leading-relaxed italic">"{verse.text}"</p>
                    <p className="text-blue-200 text-[10px] mt-1 text-right">— {verse.ref}</p>
                </div>
            </div>

            {/* 폼 카드 */}
            <div className="flex-1 bg-white rounded-t-3xl shadow-2xl">
                {/* 탭 */}
                <div className="flex border-b border-slate-100 mx-6 pt-5">
                    {[['login', '로그인'], ['signup', '회원가입']].map(([t, label]) => (
                        <button key={t} type="button"
                            onClick={() => { setTab(t); setSignupType(null); setSignupStep(1); clearError(); }}
                            className={`flex-1 pb-3 text-sm font-bold transition-all border-b-2 ${tab === t ? 'border-blue-600 text-blue-600' : 'border-transparent text-slate-400 hover:text-slate-600'}`}>
                            {label}
                        </button>
                    ))}
                </div>

                <div className="px-6 py-6">

                    {/* ── 로그인 ── */}
                    {tab === 'login' && (
                        <>
                            {/* 교인 / 관리자 토글 */}
                            <div className="flex gap-1.5 mb-5 bg-slate-100 p-1 rounded-xl">
                                {[['member', '교인'], ['admin', '교회 관리자']].map(([t, label]) => (
                                    <button key={t} type="button"
                                        onClick={() => { setLoginType(t); clearError(); }}
                                        className={`flex-1 py-2 rounded-lg text-xs font-bold transition-all ${loginType === t ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-400'}`}>
                                        {label}
                                    </button>
                                ))}
                            </div>

                            {loginType === 'member' ? (
                                <form onSubmit={handleMemberLogin} className="space-y-3">
                                    <select value={loginChurchId} onChange={e => setLoginChurchId(e.target.value)} className={inputCls}>
                                        <option value="">교회를 선택하세요</option>
                                        {churches.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                                    </select>
                                    <input type="text" value={loginName} onChange={e => setLoginName(e.target.value)}
                                        placeholder="이름" className={inputCls} />
                                    <input type="text" inputMode="numeric" value={loginBirthdate} onChange={e => setLoginBirthdate(e.target.value.replace(/\D/g, ''))}
                                        placeholder="생년월일 8자리 (예: 19900101)" maxLength={8} className={inputCls} />
                                    <input type="password" value={loginPw} onChange={e => setLoginPw(e.target.value)}
                                        placeholder="비밀번호" className={inputCls} />
                                    {errorMsg && <p className="text-red-500 text-xs text-center py-1">{errorMsg}</p>}
                                    <button type="submit" disabled={loading}
                                        className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-3.5 rounded-xl shadow-md transition-all active:scale-95 disabled:opacity-50 mt-1">
                                        {loading ? '로그인 중...' : '입장하기'}
                                    </button>
                                    <button type="button" onClick={() => setShowAdminContact(true)}
                                        className="w-full text-[11px] text-blue-500 text-center mt-0.5 hover:text-blue-700 transition-colors underline underline-offset-2">
                                        비밀번호를 잊으셨으면 각 교회 관리자에게 문의해 주세요.
                                    </button>
                                </form>
                            ) : (
                                <form onSubmit={handleAdminLogin} className="space-y-3">
                                    <input type="email" value={loginEmail} onChange={e => setLoginEmail(e.target.value)}
                                        placeholder="이메일" className={inputCls} />
                                    <input type="password" value={loginPw} onChange={e => setLoginPw(e.target.value)}
                                        placeholder="비밀번호" className={inputCls} />
                                    {errorMsg && <p className="text-red-500 text-xs text-center py-1">{errorMsg}</p>}
                                    <button type="submit" disabled={loading}
                                        className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-3.5 rounded-xl shadow-md transition-all active:scale-95 disabled:opacity-50 mt-1">
                                        {loading ? '로그인 중...' : '관리자 로그인'}
                                    </button>
                                </form>
                            )}
                        </>
                    )}

                    {/* ── 회원가입 - 유형 선택 ── */}
                    {tab === 'signup' && !signupType && (
                        <div className="space-y-3">
                            <p className="text-sm text-slate-500 text-center mb-2">가입 유형을 선택해주세요</p>
                            <button type="button" onClick={() => { setSignupType('member'); clearError(); }}
                                className="w-full p-4 rounded-2xl border-2 border-blue-100 bg-blue-50 text-left hover:border-blue-400 transition-all">
                                <div className="font-bold text-blue-700 text-sm">👤 일반 교인으로 가입</div>
                                <div className="text-xs text-slate-500 mt-0.5">교회 관리자가 만든 교회 페이지에 참여합니다</div>
                            </button>
                            <button type="button" onClick={() => { setSignupType('churchAdmin'); setSignupStep(1); clearError(); }}
                                className="w-full p-4 rounded-2xl border-2 border-indigo-100 bg-indigo-50 text-left hover:border-indigo-400 transition-all">
                                <div className="font-bold text-indigo-700 text-sm">⛪ 교회 관리자로 가입</div>
                                <div className="text-xs text-slate-500 mt-0.5">우리 교회 전용 페이지를 새로 만듭니다</div>
                            </button>
                        </div>
                    )}

                    {/* ── 교인 가입 ── */}
                    {tab === 'signup' && signupType === 'member' && (
                        <form onSubmit={handleMemberSignup} className="space-y-3">
                            <button type="button" onClick={() => { setSignupType(null); clearError(); }}
                                className="text-xs text-slate-400 hover:text-slate-600 flex items-center gap-1 mb-1">← 뒤로</button>
                            <input type="text" value={mName} onChange={e => setMName(e.target.value)} placeholder="이름" className={inputCls} />
                            <input type="text" inputMode="numeric" value={mBirthdate} onChange={e => setMBirthdate(e.target.value.replace(/\D/g, ''))}
                                placeholder="생년월일 8자리 (예: 19900101)" maxLength={8} className={inputCls} />
                            <input type="password" value={mPw} onChange={e => setMPw(e.target.value)} placeholder="비밀번호 (6자리 이상)" className={inputCls} />
                            <input type="password" value={mPwConfirm} onChange={e => setMPwConfirm(e.target.value)} placeholder="비밀번호 확인"
                                className={`w-full bg-white border rounded-xl px-4 py-3 text-sm placeholder-slate-400 focus:outline-none focus:ring-2 transition-all ${mPwConfirm && mPw !== mPwConfirm ? 'border-red-300 focus:ring-red-400' : 'border-slate-200 focus:ring-blue-400 focus:border-transparent'}`} />
                            <select value={mChurchId} onChange={e => setMChurchId(e.target.value)} className={inputCls}>
                                <option value="">교회를 선택하세요</option>
                                {churches.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                            </select>
                            <input type="password" value={mChurchCode} onChange={e => setMChurchCode(e.target.value)}
                                placeholder="교회 입장코드 (관리자에게 문의)" className={inputCls} />
                            {errorMsg && <p className="text-red-500 text-xs text-center py-1">{errorMsg}</p>}
                            <button type="submit" disabled={loading}
                                className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-3.5 rounded-xl shadow-md transition-all active:scale-95 disabled:opacity-50">
                                {loading ? '가입 중...' : '교인으로 가입하기'}
                            </button>
                        </form>
                    )}

                    {/* ── 교회 관리자 가입 Step 1 ── */}
                    {tab === 'signup' && signupType === 'churchAdmin' && signupStep === 1 && (
                        <form onSubmit={handleAdminStep1} className="space-y-3">
                            <button type="button" onClick={resetAdminSignup}
                                className="text-xs text-slate-400 hover:text-slate-600 flex items-center gap-1 mb-1">← 뒤로</button>
                            <div className="flex items-center justify-between mb-1">
                                <span className="text-xs font-bold text-indigo-600 bg-indigo-50 px-2 py-1 rounded-full">1단계 / 2단계</span>
                                <span className="text-xs text-slate-400">기본 정보 입력</span>
                            </div>
                            <input type="text" value={aName} onChange={e => setAName(e.target.value)} placeholder="이름" className={inputCls} />
                            <input type="email" value={aEmail} onChange={e => setAEmail(e.target.value)} placeholder="이메일" className={inputCls} />
                            <input type="password" value={aPw} onChange={e => setAPw(e.target.value)} placeholder="비밀번호 (6자리 이상)" className={inputCls} />
                            <input type="password" value={aPwConfirm} onChange={e => setAPwConfirm(e.target.value)} placeholder="비밀번호 확인"
                                className={`w-full bg-white border rounded-xl px-4 py-3 text-sm placeholder-slate-400 focus:outline-none focus:ring-2 transition-all ${aPwConfirm && aPw !== aPwConfirm ? 'border-red-300 focus:ring-red-400' : 'border-slate-200 focus:ring-indigo-400 focus:border-transparent'}`} />
                            <div className="border-t border-slate-100 pt-3 space-y-2">
                                <p className="text-xs text-slate-400 font-bold">교회 정보</p>
                                <input type="text" value={aChurchName} onChange={e => setAChurchName(e.target.value)} placeholder="교회 이름 (예: ○○교회)" className={inputCls} />
                                <input type="text" value={aChurchCode} onChange={e => setAChurchCode(e.target.value)} placeholder="교회 입장코드 설정 (4자리 이상)" className={inputCls} />
                                <p className="text-[10px] text-slate-400 ml-1">입장코드는 교인들이 가입할 때 사용합니다. 나중에 변경 가능합니다.</p>
                            </div>
                            {errorMsg && <p className="text-red-500 text-xs text-center py-1">{errorMsg}</p>}
                            <button type="submit"
                                className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-3.5 rounded-xl shadow-md transition-all active:scale-95">
                                다음: 조직 구성 →
                            </button>
                        </form>
                    )}

                    {/* ── 교회 관리자 가입 Step 2 ── */}
                    {tab === 'signup' && signupType === 'churchAdmin' && signupStep === 2 && (
                        <div className="space-y-4">
                            <button type="button" onClick={() => { setSignupStep(1); clearError(); }}
                                className="text-xs text-slate-400 hover:text-slate-600 flex items-center gap-1">← 뒤로</button>
                            <div className="flex items-center justify-between">
                                <span className="text-xs font-bold text-indigo-600 bg-indigo-50 px-2 py-1 rounded-full">2단계 / 2단계</span>
                                <span className="text-xs text-slate-400">조직 구성</span>
                            </div>
                            <div className="bg-indigo-50 rounded-xl p-3 border border-indigo-100">
                                <p className="text-sm font-bold text-indigo-700 mb-1">📋 교회 조직을 구성해주세요</p>
                                <p className="text-xs text-slate-500">부서(장년부, 청년부 등)와 소그룹(1구역, 2팀 등)을 설정합니다.</p>
                                <p className="text-xs text-indigo-500 mt-1 font-bold">💡 조직은 관리자 메뉴에서도 언제든지 변경이 가능합니다.</p>
                            </div>
                            <OrgEditor departments={orgComms} onChange={setOrgComms} />
                            {errorMsg && <p className="text-red-500 text-xs text-center py-1">{errorMsg}</p>}
                            <button type="button" onClick={handleAdminSignupFinal} disabled={loading}
                                className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-3.5 rounded-xl shadow-md transition-all active:scale-95 disabled:opacity-50">
                                {loading ? '교회 만드는 중...' : '✅ 교회 만들기 완료'}
                            </button>
                        </div>
                    )}
                </div>
            </div>

            {showAdminContact && <AdminContactModal onClose={() => setShowAdminContact(false)} />}
        </div>
    );
};

export default LoginView;
