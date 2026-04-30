import React, { useState, useEffect, useRef } from 'react';
import { db } from '../utils/firebase';
import OrgEditor from './OrgEditor';

// ─── Daily verse data ─────────────────────────────────────────────────────────
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

// ─── Mock live feed data ───────────────────────────────────────────────────────
const LIVE_READERS = [
    { name: '김은혜', church: '소망교회', book: '창세기 1장', at: '방금' },
    { name: '이성민', church: '사랑의교회', book: '시편 23편', at: '1분 전' },
    { name: '박지현', church: '온누리교회', book: '요한복음 3장', at: '2분 전' },
    { name: '최순철', church: '광림교회', book: '로마서 8장', at: '3분 전' },
    { name: '정미라', church: '영락교회', book: '이사야 40장', at: '4분 전' },
    { name: '한재원', church: '지구촌교회', book: '마태복음 5장', at: '5분 전' },
    { name: '윤서연', church: '새문안교회', book: '잠언 3장', at: '6분 전' },
    { name: '강민준', church: '명성교회', book: '히브리서 11장', at: '7분 전' },
];

// ─── (PLATFORM mock 제거 — Firestore에서 실시간 로드) ─────────────────────────

// ─── Sub-components ────────────────────────────────────────────────────────────

const PulseIndicator = ({ color = '#b8702a', size = 7 }) => (
    <span className="relative inline-flex" style={{ width: size * 3, height: size * 3 }}>
        <span
            className="absolute inset-0 rounded-full"
            style={{
                background: color,
                animation: 'pulseRing 1.6s ease-out infinite',
                opacity: 0.55,
            }}
        />
        <span
            className="relative rounded-full block m-auto"
            style={{ width: size, height: size, background: color, marginTop: size }}
        />
    </span>
);

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
            <div className="bg-cream-card rounded-t-3xl w-full max-w-md p-6 pb-8 shadow-2xl border border-hairline" onClick={e => e.stopPropagation()}>
                <div className="flex justify-between items-center mb-4">
                    <h3 className="font-serif font-semibold text-ink text-base">교회별 관리자</h3>
                    <button onClick={onClose} className="text-ink/40 text-xl leading-none hover:text-ink/70 transition-colors">✕</button>
                </div>
                {loading ? (
                    <p className="text-center text-ink/40 text-sm py-4">불러오는 중...</p>
                ) : admins.length === 0 ? (
                    <p className="text-center text-ink/40 text-sm py-4">등록된 관리자가 없습니다.</p>
                ) : (
                    <ul className="space-y-2 max-h-64 overflow-y-auto">
                        {admins.map((a, i) => (
                            <li key={i} className="flex items-center justify-between bg-cream border border-hairline rounded-xl px-4 py-3">
                                <span className="text-sm font-semibold text-ink">{a.churchName || '(교회명 없음)'}</span>
                                <span className="text-sm text-ink/55">{a.name}</span>
                            </li>
                        ))}
                    </ul>
                )}
            </div>
        </div>
    );
};

// ─── Input style helper ────────────────────────────────────────────────────────
const inputCls = "w-full bg-cream border border-hairline rounded-lg px-3.5 py-3 text-sm text-ink placeholder-ink/40 focus:outline-none focus:ring-2 focus:ring-accent/40 focus:border-accent/60 transition-all font-sans";

// ─── Main LoginView ────────────────────────────────────────────────────────────
const LoginView = ({ onMemberLogin, onChurchAdminLogin, onMemberSignup, onChurchAdminSignup, errorMsg, setErrorMsg }) => {
    // Tab: 'member' | 'admin' | 'memberSignup' | 'adminSignup'
    const [activeTab, setActiveTab] = useState('member');
    const [signupStep, setSignupStep] = useState(1);
    const [showAdminContact, setShowAdminContact] = useState(false);

    // Platform stats (Firestore)
    const [stats, setStats] = useState({
        total_churches: 0,
        total_readers: 0,
        finished_total: 0,
        chapters_read_today: 0,
    });

    useEffect(() => {
        if (!db) return;
        const today = new Date().toDateString();
        Promise.all([
            db.collection('churches').get(),
            db.collection('users').where('role', '==', 'member').get(),
        ]).then(([churchSnap, userSnap]) => {
            const users = userSnap.docs.map(d => d.data());
            setStats({
                total_churches: churchSnap.size,
                total_readers: users.length,
                finished_total: users.filter(u => (u.readCount || 1) >= 2).length,
                chapters_read_today: users.filter(u => u.lastReadDate === today).length,
            });
        }).catch(() => {}); // 실패 시 0으로 유지
    }, []);

    // Live feed (Firestore, fallback: mock)
    const [liveFeed, setLiveFeed] = useState(LIVE_READERS);

    useEffect(() => {
        if (!db) return;
        const today = new Date().toDateString();
        db.collection('users').where('role', '==', 'member').limit(50).get()
            .then(snap => {
                const items = snap.docs
                    .map(d => d.data())
                    .filter(d => d.lastReadDate)
                    .sort((a, b) => (b.lastReadDate > a.lastReadDate ? 1 : -1))
                    .slice(0, 10)
                    .map(d => ({
                        name: d.name || '성도',
                        church: d.churchName || '',
                        book: `${d.currentDay || 1}일차`,
                        at: d.lastReadDate === today ? '오늘' : '최근',
                    }));
                if (items.length >= 3) setLiveFeed(items);
            }).catch(() => {}); // 실패 시 mock 유지
    }, []);

    // Live counter
    const [readingNow, setReadingNow] = useState(1284);

    useEffect(() => {
        if (stats.total_readers > 0) {
            setReadingNow(Math.max(1100, Math.round(stats.total_readers * 0.08)));
        }
    }, [stats.total_readers]);

    useEffect(() => {
        const id = setInterval(() => {
            setReadingNow(n => Math.max(1100, n + (Math.floor(Math.random() * 7) - 3)));
        }, 2200);
        return () => clearInterval(id);
    }, []);

    // Login form state
    const [loginName, setLoginName] = useState('');
    const [loginBirthdate, setLoginBirthdate] = useState('');
    const [loginChurchId, setLoginChurchId] = useState('');
    const [loginEmail, setLoginEmail] = useState('');
    const [loginPw, setLoginPw] = useState('');

    // Member signup state
    const [mName, setMName] = useState('');
    const [mBirthdate, setMBirthdate] = useState('');
    const [mPw, setMPw] = useState('');
    const [mPwConfirm, setMPwConfirm] = useState('');
    const [mChurchId, setMChurchId] = useState('');
    const [mChurchCode, setMChurchCode] = useState('');

    // Admin signup state
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
        if (activeTab === 'member' || activeTab === 'memberSignup') {
            db.collection('churches').get().then(snap => {
                setChurches(snap.docs.map(d => ({ id: d.id, ...d.data() })).sort((a, b) => (a.name || '').localeCompare(b.name || '', 'ko-KR')));
            }).catch(() => {});
        }
    }, [activeTab]);

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

    const resetAdminSignup = () => { setSignupStep(1); setOrgComms([{ id: 'comm_0', name: '', subgroups: [{ id: 'sub_0', name: '' }] }]); clearError(); };

    // Selected church display name
    const selectedChurchName = churches.find(c => c.id === loginChurchId)?.name || null;

    // ── Render login card content ────────────────────────────────────────────
    const renderCard = () => {
        // ── Member Login ──
        if (activeTab === 'member') return (
            <form onSubmit={handleMemberLogin} className="space-y-3.5">
                {/* Church selector */}
                <div>
                    <label className="block text-[11px] font-semibold text-ink/55 mb-1.5 uppercase tracking-wide">출석 교회</label>
                    {selectedChurchName ? (
                        <div className="flex items-center gap-2.5 bg-cream border border-hairline rounded-lg px-3.5 py-2.5">
                            <div className="w-7 h-7 rounded-md bg-ink text-cream flex items-center justify-center font-serif text-[11px] font-bold shrink-0">
                                {selectedChurchName[0]}
                            </div>
                            <span className="flex-1 text-sm font-semibold text-ink">{selectedChurchName}</span>
                            <button type="button" onClick={() => setLoginChurchId('')} className="text-[11px] text-ink/40 hover:text-ink/70 transition-colors">변경 ↓</button>
                        </div>
                    ) : (
                        <select value={loginChurchId} onChange={e => setLoginChurchId(e.target.value)} className={inputCls}>
                            <option value="">교회를 선택하세요</option>
                            {churches.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                        </select>
                    )}
                </div>
                <div>
                    <label className="block text-[11px] font-semibold text-ink/55 mb-1.5 uppercase tracking-wide">이름</label>
                    <input type="text" value={loginName} onChange={e => setLoginName(e.target.value)} placeholder="홍길동" className={inputCls} />
                </div>
                <div>
                    <label className="block text-[11px] font-semibold text-ink/55 mb-1.5 uppercase tracking-wide">생년월일</label>
                    <input type="text" inputMode="numeric" value={loginBirthdate} onChange={e => setLoginBirthdate(e.target.value.replace(/\D/g, ''))}
                        placeholder="19900101" maxLength={8} className={inputCls} />
                </div>
                <div>
                    <label className="block text-[11px] font-semibold text-ink/55 mb-1.5 uppercase tracking-wide">비밀번호</label>
                    <input type="password" value={loginPw} onChange={e => setLoginPw(e.target.value)} placeholder="••••••••" className={inputCls} />
                </div>
                {errorMsg && <p className="text-red-500 text-xs text-center py-1 bg-red-50 rounded-lg px-3">{errorMsg}</p>}
                <button type="submit" disabled={loading}
                    className="w-full bg-ink text-cream font-semibold py-3.5 rounded-full text-sm flex items-center justify-center gap-2 hover:bg-ink/90 transition-colors disabled:opacity-50 mt-1">
                    {loading ? '로그인 중...' : <>오늘의 본문 펼치기 <span className="opacity-60">→</span></>}
                </button>
                <div className="flex items-center justify-between pt-1">
                    <button type="button" onClick={() => { setActiveTab('memberSignup'); clearError(); }}
                        className="text-[12px] text-ink/50 hover:text-ink transition-colors">
                        처음 오셨나요? <span className="underline underline-offset-2 font-semibold">회원가입</span>
                    </button>
                    <button type="button" onClick={() => setShowAdminContact(true)}
                        className="text-[11px] text-ink/40 hover:text-ink/60 transition-colors underline underline-offset-2">
                        비밀번호 문의
                    </button>
                </div>
            </form>
        );

        // ── Admin Login ──
        if (activeTab === 'admin') return (
            <form onSubmit={handleAdminLogin} className="space-y-3.5">
                <div className="bg-accent/10 border border-accent/25 rounded-lg px-3.5 py-2.5 flex gap-2.5 items-start">
                    <div className="w-5 h-5 rounded-full bg-accent text-cream flex items-center justify-center text-[10px] font-bold shrink-0 mt-0.5">!</div>
                    <p className="text-[12px] text-ink leading-relaxed"><b>교회 관리자 전용</b>입니다. 구역 편성, 성도 관리, 통독 진행률 대시보드를 사용할 수 있어요.</p>
                </div>
                <div>
                    <label className="block text-[11px] font-semibold text-ink/55 mb-1.5 uppercase tracking-wide">관리자 이메일</label>
                    <input type="email" value={loginEmail} onChange={e => setLoginEmail(e.target.value)} placeholder="admin@church.kr" className={inputCls} />
                </div>
                <div>
                    <label className="block text-[11px] font-semibold text-ink/55 mb-1.5 uppercase tracking-wide">비밀번호</label>
                    <input type="password" value={loginPw} onChange={e => setLoginPw(e.target.value)} placeholder="••••••••" className={inputCls} />
                </div>
                {errorMsg && <p className="text-red-500 text-xs text-center py-1 bg-red-50 rounded-lg px-3">{errorMsg}</p>}
                <button type="submit" disabled={loading}
                    className="w-full bg-accent text-cream font-semibold py-3.5 rounded-full text-sm flex items-center justify-center gap-2 hover:bg-accent/90 transition-colors disabled:opacity-50 mt-1">
                    {loading ? '로그인 중...' : <>관리자 대시보드 열기 <span className="opacity-70">→</span></>}
                </button>
                <div className="pt-1 text-center">
                    <span className="text-[12px] text-ink/50">교회 코드가 없으신가요?{' '}</span>
                    <button type="button" onClick={() => { setActiveTab('adminSignup'); clearError(); }}
                        className="text-[12px] text-ink font-semibold underline underline-offset-2 hover:text-accent transition-colors">
                        교회 등록 신청
                    </button>
                </div>
            </form>
        );

        // ── Member Signup ──
        if (activeTab === 'memberSignup') return (
            <form onSubmit={handleMemberSignup} className="space-y-3">
                <button type="button" onClick={() => { setActiveTab('member'); clearError(); }}
                    className="text-[12px] text-ink/50 hover:text-ink flex items-center gap-1 mb-1 transition-colors">← 로그인으로</button>
                <input type="text" value={mName} onChange={e => setMName(e.target.value)} placeholder="이름" className={inputCls} />
                <input type="text" inputMode="numeric" value={mBirthdate} onChange={e => setMBirthdate(e.target.value.replace(/\D/g, ''))}
                    placeholder="생년월일 8자리 (예: 19900101)" maxLength={8} className={inputCls} />
                <input type="password" value={mPw} onChange={e => setMPw(e.target.value)} placeholder="비밀번호 (6자리 이상)" className={inputCls} />
                <input type="password" value={mPwConfirm} onChange={e => setMPwConfirm(e.target.value)} placeholder="비밀번호 확인"
                    className={`w-full bg-cream border rounded-lg px-3.5 py-3 text-sm placeholder-ink/40 focus:outline-none focus:ring-2 transition-all font-sans ${mPwConfirm && mPw !== mPwConfirm ? 'border-red-400 focus:ring-red-400/40' : 'border-hairline focus:ring-accent/40 focus:border-accent/60'}`} />
                <select value={mChurchId} onChange={e => setMChurchId(e.target.value)} className={inputCls}>
                    <option value="">교회를 선택하세요</option>
                    {churches.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
                <input type="password" value={mChurchCode} onChange={e => setMChurchCode(e.target.value)}
                    placeholder="교회 입장코드 (관리자에게 문의)" className={inputCls} />
                {errorMsg && <p className="text-red-500 text-xs text-center py-1 bg-red-50 rounded-lg px-3">{errorMsg}</p>}
                <button type="submit" disabled={loading}
                    className="w-full bg-ink text-cream font-semibold py-3.5 rounded-full text-sm flex items-center justify-center gap-2 hover:bg-ink/90 transition-colors disabled:opacity-50">
                    {loading ? '가입 중...' : '교인으로 가입하기'}
                </button>
            </form>
        );

        // ── Admin Signup Step 1 ──
        if (activeTab === 'adminSignup' && signupStep === 1) return (
            <form onSubmit={handleAdminStep1} className="space-y-3">
                <button type="button" onClick={() => { setActiveTab('admin'); resetAdminSignup(); clearError(); }}
                    className="text-[12px] text-ink/50 hover:text-ink flex items-center gap-1 mb-1 transition-colors">← 뒤로</button>
                <div className="flex items-center justify-between mb-1">
                    <span className="text-[11px] font-bold text-accent bg-accent/10 px-2 py-1 rounded-full">1단계 / 2단계</span>
                    <span className="text-[11px] text-ink/40">기본 정보 입력</span>
                </div>
                <input type="text" value={aName} onChange={e => setAName(e.target.value)} placeholder="이름" className={inputCls} />
                <input type="email" value={aEmail} onChange={e => setAEmail(e.target.value)} placeholder="이메일" className={inputCls} />
                <input type="password" value={aPw} onChange={e => setAPw(e.target.value)} placeholder="비밀번호 (6자리 이상)" className={inputCls} />
                <input type="password" value={aPwConfirm} onChange={e => setAPwConfirm(e.target.value)} placeholder="비밀번호 확인"
                    className={`w-full bg-cream border rounded-lg px-3.5 py-3 text-sm placeholder-ink/40 focus:outline-none focus:ring-2 transition-all font-sans ${aPwConfirm && aPw !== aPwConfirm ? 'border-red-400 focus:ring-red-400/40' : 'border-hairline focus:ring-accent/40 focus:border-accent/60'}`} />
                <div className="border-t border-hairline pt-3 space-y-2">
                    <p className="text-[11px] text-ink/55 font-semibold uppercase tracking-wide">교회 정보</p>
                    <input type="text" value={aChurchName} onChange={e => setAChurchName(e.target.value)} placeholder="교회 이름 (예: ○○교회)" className={inputCls} />
                    <input type="text" value={aChurchCode} onChange={e => setAChurchCode(e.target.value)} placeholder="교회 입장코드 설정 (4자리 이상)" className={inputCls} />
                    <p className="text-[10px] text-ink/40 ml-1">입장코드는 교인들이 가입할 때 사용합니다. 나중에 변경 가능합니다.</p>
                </div>
                {errorMsg && <p className="text-red-500 text-xs text-center py-1 bg-red-50 rounded-lg px-3">{errorMsg}</p>}
                <button type="submit"
                    className="w-full bg-accent text-cream font-semibold py-3.5 rounded-full text-sm flex items-center justify-center gap-2 hover:bg-accent/90 transition-colors">
                    다음: 조직 구성 →
                </button>
            </form>
        );

        // ── Admin Signup Step 2 ──
        if (activeTab === 'adminSignup' && signupStep === 2) return (
            <div className="space-y-4">
                <button type="button" onClick={() => { setSignupStep(1); clearError(); }}
                    className="text-[12px] text-ink/50 hover:text-ink flex items-center gap-1 transition-colors">← 뒤로</button>
                <div className="flex items-center justify-between">
                    <span className="text-[11px] font-bold text-accent bg-accent/10 px-2 py-1 rounded-full">2단계 / 2단계</span>
                    <span className="text-[11px] text-ink/40">조직 구성</span>
                </div>
                <div className="bg-accent/10 rounded-xl p-3 border border-accent/20">
                    <p className="text-sm font-semibold text-ink mb-1">교회 조직을 구성해주세요</p>
                    <p className="text-[11px] text-ink/60">부서(장년부, 청년부 등)와 소그룹(1구역, 2팀 등)을 설정합니다.</p>
                    <p className="text-[11px] text-accent mt-1 font-semibold">조직은 관리자 메뉴에서도 언제든지 변경이 가능합니다.</p>
                </div>
                <OrgEditor departments={orgComms} onChange={setOrgComms} />
                {errorMsg && <p className="text-red-500 text-xs text-center py-1 bg-red-50 rounded-lg px-3">{errorMsg}</p>}
                <button type="button" onClick={handleAdminSignupFinal} disabled={loading}
                    className="w-full bg-accent text-cream font-semibold py-3.5 rounded-full text-sm flex items-center justify-center gap-2 hover:bg-accent/90 transition-colors disabled:opacity-50">
                    {loading ? '교회 만드는 중...' : '교회 만들기 완료'}
                </button>
            </div>
        );

        return null;
    };

    const isSignupTab = activeTab === 'memberSignup' || activeTab === 'adminSignup';
    const cardTitle = {
        member: '로그인',
        admin: '관리자 로그인',
        memberSignup: '성도 회원가입',
        adminSignup: '교회 등록',
    }[activeTab] || '로그인';

    // ── DESKTOP Layout (md+) / MOBILE Layout ──────────────────────────────────
    return (
        <div className="min-h-screen bg-cream relative md:grid md:grid-cols-[1.15fr_1fr]">

            {/* paper warmth gradient overlay */}
            <div className="absolute inset-0 pointer-events-none opacity-55"
                style={{
                    backgroundImage:
                        'radial-gradient(circle at 18% 12%, rgba(184,112,42,0.06), transparent 42%),' +
                        'radial-gradient(circle at 82% 88%, rgba(43,58,42,0.05), transparent 40%)',
                }}
            />

            {/* ═══ TOP NAV (desktop only) ══════════════════════════════════════ */}
            <div className="hidden md:flex absolute top-0 left-0 right-0 h-16 items-center justify-between px-14 z-10">
                {/* Logo */}
                <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-[7px] bg-ink text-cream flex items-center justify-center font-serif font-bold text-[14px] tracking-wide">
                        114
                    </div>
                    <span className="font-serif text-[17px] font-semibold text-ink tracking-tight">성경통독 114</span>
                </div>
                {/* Nav links */}
                <nav className="flex gap-7 text-[13px] text-ink/55">
                    <span className="text-ink border-b border-b-accent pb-0.5 cursor-default">소개</span>
                    <span className="cursor-default hover:text-ink transition-colors">참여 교회</span>
                    <span className="cursor-default hover:text-ink transition-colors">읽는 방법</span>
                    <span className="cursor-default hover:text-ink transition-colors">도움말</span>
                </nav>
                {/* CTA */}
                <button
                    onClick={() => { setActiveTab('adminSignup'); clearError(); }}
                    className="text-[12px] text-ink/55 hover:text-ink transition-colors cursor-pointer">
                    교회 등록 신청 →
                </button>
            </div>

            {/* ═══ LEFT — Editorial Hero (desktop) / Hero strip (mobile) ═══════ */}
            <div className="relative z-[1] flex flex-col pt-16 pb-8 px-6 md:pt-[100px] md:pb-10 md:px-14">

                {/* Mobile logo bar */}
                <div className="flex items-center gap-2 mb-6 md:hidden">
                    <div className="w-7 h-7 rounded-[6px] bg-ink text-cream flex items-center justify-center font-serif font-bold text-[13px]">114</div>
                    <span className="font-serif text-base font-semibold text-ink">성경통독 114</span>
                </div>

                {/* Eyebrow — live counter */}
                <div className="flex items-center gap-2.5 mb-5">
                    <PulseIndicator color="#b8702a" size={7} />
                    <span className="text-[12px] tracking-[0.14em] uppercase text-ink/55 font-semibold">
                        지금{' '}
                        <span className="text-ink tabular-nums">{readingNow.toLocaleString()}</span>
                        명이 함께 펼치는 중
                    </span>
                </div>

                {/* H1 Headline */}
                <h1 className="font-serif font-semibold text-4xl md:text-5xl lg:text-[56px] leading-[1.16] tracking-tight mb-4 whitespace-pre-line">
                    {"혼자가 아니라,\n"}
                    <span>
                        <span className="text-accent">같이</span> 펼칩니다.
                    </span>
                </h1>

                {/* Subhead */}
                <p className="text-[14px] md:text-[15px] leading-[1.65] text-ink/78 max-w-md mb-5">
                    전국 <b className="text-ink">{stats.total_churches > 0 ? `${stats.total_churches}개 교회` : '여러 교회'}</b>,{' '}
                    <b className="text-ink">{stats.total_readers > 0 ? `${stats.total_readers.toLocaleString()}명` : '많은 성도들'}</b>이
                    오늘도 같은 페이지를 넘기고 있습니다. 천로역정 같은 통독의 길, 함께 걸어요.
                </p>

                {/* Stat strip */}
                <div className="grid grid-cols-4 border-t border-b border-hairline py-4 mb-5">
                    {[
                        { num: stats.total_churches > 0 ? stats.total_churches.toString() : '—', label: '함께하는 교회' },
                        { num: stats.total_readers > 0 ? stats.total_readers.toLocaleString() : '—', label: '참여 성도' },
                        { num: stats.finished_total > 0 ? stats.finished_total.toLocaleString() : '—', label: '올해 완독자' },
                        { num: stats.chapters_read_today > 0 ? stats.chapters_read_today.toLocaleString() : '—', label: '오늘 읽은 성도' },
                    ].map((s, i) => (
                        <div key={i} className={`${i > 0 ? 'border-l border-hairline pl-3 md:pl-4' : ''} pr-3 md:pr-4`}>
                            <div className="font-serif text-[20px] md:text-[26px] font-semibold tracking-tight tabular-nums leading-tight">{s.num}</div>
                            <div className="text-[10px] md:text-[11px] text-ink/55 mt-1 leading-tight">{s.label}</div>
                        </div>
                    ))}
                </div>

                {/* Today's passage card */}
                <div className="bg-cream-card border border-hairline rounded-sm px-5 py-4 max-w-lg relative mb-5">
                    <div className="absolute top-[-1px] left-[22px] w-9 h-3 bg-accent rounded-b-sm" />
                    <p className="font-serif text-[14px] md:text-[16px] leading-[1.65] text-ink/85 italic font-medium mb-2">
                        "{verse.text}"
                    </p>
                    <div className="font-serif text-[12px] md:text-[13px] text-ink/55 text-right">— {verse.ref}</div>
                </div>

                {/* Live feed — hidden on mobile to keep it clean */}
                <div className="hidden md:flex flex-col flex-1 min-h-0 overflow-hidden">
                    <div className="flex items-center justify-between mb-2.5">
                        <span className="text-[11px] text-ink/55 tracking-[0.08em] uppercase font-semibold">방금 펼친 성도들</span>
                        <span className="flex items-center gap-1.5 text-[11px] text-ink/55">
                            <PulseIndicator color="#3b6b4a" size={5} /> 실시간
                        </span>
                    </div>
                    <div
                        className="flex-1 overflow-hidden relative min-h-0"
                        style={{ maskImage: 'linear-gradient(180deg, #000 70%, transparent)' }}
                    >
                        <div style={{ animation: 'scrollFeed 32s linear infinite' }}>
                            {[...liveFeed, ...liveFeed].map((r, i) => (
                                <div key={i} className="flex items-center gap-3 mb-2.5">
                                    <div className="w-7 h-7 rounded-full bg-ink text-cream flex items-center justify-center font-serif text-[11px] font-bold shrink-0">
                                        {r.name[0]}
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-baseline gap-2 flex-wrap">
                                            <span className="font-serif text-[14px] font-semibold text-ink">{r.name}</span>
                                            <span className="text-[11px] text-accent">{r.church}</span>
                                            <span className="text-[11px] text-ink/55 ml-auto">{r.at}</span>
                                        </div>
                                        <div className="text-[12px] text-ink/65 mt-0.5">{r.book} 펼침</div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            </div>

            {/* ═══ RIGHT — Login Card ══════════════════════════════════════════ */}
            <div className="relative z-[1] flex flex-col px-5 pb-10 md:pt-[100px] md:pb-10 md:px-7 md:pl-7 md:items-center md:justify-center">
                <div
                    className="w-full max-w-sm md:max-w-none bg-[#fbf7ee] border border-hairline rounded-lg p-7 md:p-9"
                    style={{ boxShadow: '0 1px 0 rgba(255,255,255,0.6) inset, 0 30px 60px -30px rgba(43,58,42,0.28)' }}
                >
                    {/* Card header */}
                    <div className="mb-5">
                        <h2 className="font-serif text-[26px] font-semibold text-ink tracking-tight">{cardTitle}</h2>
                    </div>

                    {/* Role tabs (only for login tabs) */}
                    {!isSignupTab && (
                        <div className="grid grid-cols-2 gap-2 bg-ink/[0.06] p-1 rounded-[10px] mb-6">
                            {[
                                { key: 'member', title: '성도', sub: '오늘의 본문 읽기' },
                                { key: 'admin', title: '교회 관리자', sub: '구역·진행률 관리' },
                            ].map(tab => {
                                const active = activeTab === tab.key;
                                return (
                                    <button
                                        key={tab.key}
                                        type="button"
                                        onClick={() => { setActiveTab(tab.key); clearError(); }}
                                        className={`text-left px-3.5 py-2.5 rounded-[7px] transition-all ${active ? 'bg-cream shadow-sm' : 'hover:bg-ink/5'}`}
                                    >
                                        <div className="flex items-center gap-1.5 text-[13px] font-semibold text-ink">
                                            {tab.title}
                                            {active && tab.key === 'admin' && (
                                                <span className="text-[9px] font-bold text-cream bg-accent px-1.5 py-0.5 rounded tracking-wide">ADMIN</span>
                                            )}
                                        </div>
                                        <div className="text-[11px] text-ink/55 mt-0.5">{tab.sub}</div>
                                    </button>
                                );
                            })}
                        </div>
                    )}

                    {/* Form content */}
                    {renderCard()}
                </div>
            </div>

            {showAdminContact && <AdminContactModal onClose={() => setShowAdminContact(false)} />}
        </div>
    );
};

export default LoginView;
