import React, { useState, useEffect, useRef } from 'react';
import { auth, authReady, db } from '../utils/firebase';
import OrgEditor from './OrgEditor';
import DemoTour from './DemoTour';
import ReadingGuideModal from './modals/ReadingGuideModal';
import ChurchPicker from './ChurchPicker';
import { getChurchDirectory, getLastChurch, saveLastChurch } from '../utils/churchDirectory';
import { UNAFFILIATED_CHURCH_ID, UNAFFILIATED_CHURCH_NAME } from '../data/constants';
import { getGuestState } from '../utils/guestStorage';
import { GuardianConsent, PolicyConsent, PolicyDialog } from './policies';
import { SERVICE_POLICIES, createEmptyPolicyConsents, isPolicyConsentComplete } from '../data/servicePolicies';
import { validateSignupConsent } from '../utils/signupConsent';
import { normalizeChurchEntryCode } from '../utils/entryCode';

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

// 비밀번호 문의 안내 모달.
// 주의: 비로그인 화면이라 users 컬렉션 쿼리는 규칙상 항상 거부된다 (관리자 이름 표시 불가).
// 공개 문서인 settings/churchDirectory에서 교회 목록만 보여주고 관리자 문의를 안내한다.
const AdminContactModal = ({ onClose }) => {
    const [churches, setChurches] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        getChurchDirectory()
            .then(list => {
                setChurches(list
                    .filter(c => !c.hidden && c.name)
                    .map(c => c.name)
                    .sort((a, b) => a.localeCompare(b, 'ko-KR')));
            })
            .catch(() => {})
            .finally(() => setLoading(false));
    }, []);

    return (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-end justify-center" onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
            <div className="bg-cream-card rounded-t-3xl w-full max-w-md p-6 pb-8 shadow-2xl border border-hairline" onClick={e => e.stopPropagation()}>
                <div className="flex justify-between items-center mb-3">
                    <h3 className="font-serif font-semibold text-ink text-base">비밀번호 문의</h3>
                    <button onClick={onClose} className="text-ink/40 text-xl leading-none hover:text-ink/70 transition-colors">✕</button>
                </div>
                <p className="text-[13px] text-ink/60 leading-relaxed mb-4">
                    비밀번호를 잊으셨다면 <span className="font-semibold text-ink/80">소속 교회의 관리자(담당 선생님)</span>에게
                    문의해주세요. 관리자가 비밀번호를 확인해 드릴 수 있어요.
                </p>
                {loading ? (
                    <p className="text-center text-ink/40 text-sm py-4">불러오는 중...</p>
                ) : churches.length === 0 ? (
                    <p className="text-center text-ink/40 text-sm py-4">등록된 교회가 없습니다.</p>
                ) : (
                    <>
                        <p className="text-[11px] text-ink/40 mb-2">함께하고 있는 교회</p>
                        <ul className="space-y-2 max-h-56 overflow-y-auto">
                            {churches.map((name, i) => (
                                <li key={i} className="bg-cream border border-hairline rounded-xl px-4 py-3">
                                    <span className="text-sm font-semibold text-ink">{name}</span>
                                </li>
                            ))}
                        </ul>
                    </>
                )}
            </div>
        </div>
    );
};

// ─── Input style helper ────────────────────────────────────────────────────────
const inputCls = "w-full bg-cream border border-hairline rounded-lg px-3.5 py-3 text-sm text-ink placeholder-ink/40 focus:outline-none focus:ring-2 focus:ring-accent/40 focus:border-accent/60 transition-all font-sans";

// ─── Main LoginView ────────────────────────────────────────────────────────────
const LoginView = ({
    onMemberLogin,
    onChurchAdminLogin,
    onGoogleAdminLogin,
    onMemberSignup,
    onPersonalSignup,
    onGooglePersonalSignup,
    onKakaoStart,
    onChurchAdminSignup,
    onGoogleAdminSignupStart,
    onKakaoAdminSignupStart,
    onGoogleAdminSignupCancel,
    initialKakaoAdminSignup = null,
    errorMsg,
    setErrorMsg,
    presetChurchId,
    initialTab = 'member',
}) => {
    // Tab: 'member' | 'admin' | 'memberSignup' | 'adminSignup'
    const [activeTab, setActiveTab] = useState(initialTab);
    const [signupStep, setSignupStep] = useState(1);
    const [showAdminContact, setShowAdminContact] = useState(false);
    const [showDemoTour, setShowDemoTour] = useState(false);
    const [showReadingGuide, setShowReadingGuide] = useState(false);
    const [openPublicPolicyId, setOpenPublicPolicyId] = useState(null);

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
        // settings/platformStats는 미인증 공개 읽기 허용 (Firestore 룰)
        db.collection('settings').doc('platformStats').get()
            .then(doc => {
                if (doc.exists) {
                    const d = doc.data();
                    setStats({
                        total_churches: d.total_churches || 0,
                        total_readers: d.total_readers || 0,
                        finished_total: d.finished_total || 0,
                        chapters_read_today: d.today_date === today ? (d.readers_today || 0) : 0,
                    });
                } else {
                    // platformStats 없으면 공개 디렉토리로 교회 수만 추정
                    // (churches 컬렉션은 Phase 3부터 미인증 read 불가)
                    getChurchDirectory()
                        .then(list => setStats(prev => ({ ...prev, total_churches: list.filter(c => !c.hidden).length })))
                        .catch(() => {});
                }
            })
            .catch(() => {
                // 실패 시 디렉토리로 교회 수만 추정
                getChurchDirectory()
                    .then(list => setStats(prev => ({ ...prev, total_churches: list.filter(c => !c.hidden).length })))
                    .catch(() => {});
            });
    }, []);

    // Login form state
    const [loginName, setLoginName] = useState('');
    const [loginBirthdate, setLoginBirthdate] = useState('');
    const [loginChurchId, setLoginChurchId] = useState('');
    const [loginPhone4, setLoginPhone4] = useState('');
    const [loginEmail, setLoginEmail] = useState('');
    const [loginPw, setLoginPw] = useState('');

    // Member signup state
    const [mName, setMName] = useState('');
    const [mBirthdate, setMBirthdate] = useState('');
    const [mPw, setMPw] = useState('');
    const [mPwConfirm, setMPwConfirm] = useState('');
    const [mChurchId, setMChurchId] = useState('');
    const [mChurchCode, setMChurchCode] = useState('');
    const [mPhone4, setMPhone4] = useState('');
    const [mPolicyConsents, setMPolicyConsents] = useState(() => createEmptyPolicyConsents('member'));
    const [mGuardianConsent, setMGuardianConsent] = useState(null);

    const [personalMethod, setPersonalMethod] = useState('choice');
    const [pName, setPName] = useState('');
    const [pBirthdate, setPBirthdate] = useState('');
    const [pPhone4, setPPhone4] = useState('');
    const [pPw, setPPw] = useState('');
    const [pPwConfirm, setPPwConfirm] = useState('');
    const [pPolicyConsents, setPPolicyConsents] = useState(() => createEmptyPolicyConsents('personal'));
    const [pGuardianConsent, setPGuardianConsent] = useState(null);
    const [googlePersonalLoading, setGooglePersonalLoading] = useState(false);
    const [kakaoLoading, setKakaoLoading] = useState(false);

    // Admin signup state
    const [aName, setAName] = useState('');
    const [aEmail, setAEmail] = useState('');
    const [aPw, setAPw] = useState('');
    const [aPwConfirm, setAPwConfirm] = useState('');
    const [aChurchName, setAChurchName] = useState('');
    const [aPastorName, setAPastorName] = useState('');
    const [aDenomination, setADenomination] = useState('');
    const [aChurchCode, setAChurchCode] = useState('');
    const [aPolicyConsents, setAPolicyConsents] = useState(() => createEmptyPolicyConsents('communityAdmin'));
    const [aAgeConfirmed14Plus, setAAgeConfirmed14Plus] = useState(false);
    const [orgComms, setOrgComms] = useState([{ id: 'comm_0', name: '', subgroups: [{ id: 'sub_0', name: '' }] }]);

    const [loading, setLoading] = useState(false);
    const [googleAdminLoading, setGoogleAdminLoading] = useState(false);
    const [googleAdminSignupLoading, setGoogleAdminSignupLoading] = useState(false);
    const [kakaoAdminSignupLoading, setKakaoAdminSignupLoading] = useState(false);
    const [googleAdminSignupProfile, setGoogleAdminSignupProfile] = useState(null);
    const [guestMigrationPreview, setGuestMigrationPreview] = useState(null);

    // 첫 화면 입구 선택: 'entry'(교회와 함께 / 혼자 읽기 카드) → 'form'(로그인 폼).
    // 재방문자는 preselect(URL 파라미터·최근 교회)가 있으면 바로 'form'으로 건너뛴다.
    const [memberStep, setMemberStep] = useState('entry');
    const [directory, setDirectory] = useState([]);
    const [rememberedChurch, setRememberedChurch] = useState(null);

    const verse = todayVerse();
    const isKakaoTalkBrowser = typeof navigator !== 'undefined' && navigator.userAgent.includes('KAKAOTALK');
    const activeTabRef = useRef(activeTab);
    const googleAdminSignupCancelRef = useRef(null);
    activeTabRef.current = activeTab;
    const loginCardRef = useRef(null);
    const loginCardMountedRef = useRef(false);

    // 모바일은 히어로 아래에 카드가 있어 "공동체 등록" 등을 눌러도 화면이 안 움직인 것처럼 보인다.
    // 첫 렌더를 제외한 탭 전환에서 카드로 스크롤한다 (데스크톱 2단 레이아웃은 카드가 항상 보임).
    useEffect(() => {
        if (!loginCardMountedRef.current) { loginCardMountedRef.current = true; return; }
        if (window.matchMedia('(min-width: 768px)').matches) return;
        // smooth 스크롤은 탭 전환 직후 레이아웃 재계산에 끊길 수 있어 위치 계산 후 즉시 이동한다.
        const timerId = window.setTimeout(() => {
            const card = loginCardRef.current;
            if (!card) return;
            const top = Math.max(0, card.getBoundingClientRect().top + window.scrollY - 12);
            window.scrollTo({ top, behavior: 'auto' });
        }, 80);
        return () => window.clearTimeout(timerId);
    }, [activeTab]);

    useEffect(() => {
        const nextTab = initialTab || 'member';
        activeTabRef.current = nextTab;
        setActiveTab(nextTab);
    }, [initialTab]);

    useEffect(() => {
        if (!initialKakaoAdminSignup || typeof initialKakaoAdminSignup !== 'object') return;
        const draft = initialKakaoAdminSignup.draft && typeof initialKakaoAdminSignup.draft === 'object'
            ? initialKakaoAdminSignup.draft
            : {};
        if (initialKakaoAdminSignup.uid && initialKakaoAdminSignup.provider === 'kakao.com') {
            setGoogleAdminSignupProfile({
                provider: 'kakao.com',
                uid: String(initialKakaoAdminSignup.uid),
                email: String(initialKakaoAdminSignup.email || ''),
                name: String(initialKakaoAdminSignup.name || ''),
            });
        } else {
            setGoogleAdminSignupProfile(null);
        }
        setActiveTab('adminSignup');
        setSignupStep(1);
        setAName(String(draft.name || initialKakaoAdminSignup.name || ''));
        setAEmail(String(draft.contactEmail || initialKakaoAdminSignup.email || ''));
        setAChurchName(String(draft.churchName || ''));
        setAPastorName(String(draft.pastorName || ''));
        setADenomination(String(draft.denomination || ''));
        setAChurchCode(String(draft.churchCode || ''));
        if (draft.policyConsents && typeof draft.policyConsents === 'object') {
            setAPolicyConsents(draft.policyConsents);
        }
        setAAgeConfirmed14Plus(draft.ageConfirmed14Plus === true);
        if (Array.isArray(draft.orgComms) && draft.orgComms.length > 0) setOrgComms(draft.orgComms);
    }, [initialKakaoAdminSignup]);

    useEffect(() => {
        if (activeTab !== 'memberSignup' && activeTab !== 'personalSignup') return;
        const guest = getGuestState();
        setGuestMigrationPreview(!guest.migratedAt && guest.readDates.length > 0 ? guest : null);
    }, [activeTab]);

    // URL 파라미터와 최근 교회는 첫 화면을 건너뛰지 않고 안내 뱃지로만 기억한다.
    useEffect(() => {
        let alive = true;
        getChurchDirectory()
            .then(dir => {
                if (!alive) return;
                setDirectory(dir);
                let preset = null;
                if (presetChurchId) {
                    preset = dir.find(c => c.id === presetChurchId) || null;
                }
                if (!preset) {
                    const last = getLastChurch();
                    if (last?.id === UNAFFILIATED_CHURCH_ID) {
                        preset = { id: UNAFFILIATED_CHURCH_ID, name: UNAFFILIATED_CHURCH_NAME };
                    } else if (last?.id) {
                        preset = dir.find(c => c.id === last.id) || null;
                    }
                }
                if (preset) {
                    setLoginChurchId(preset.id);
                    setMChurchId(preset.id);
                    setRememberedChurch(preset);
                }
            })
            .catch(() => {});
        return () => { alive = false; };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [presetChurchId]);

    const clearError = () => setErrorMsg('');

    const resetGoogleAdminSignupLocalState = () => {
        setGoogleAdminSignupProfile(null);
        setAName('');
        setAEmail('');
        setAPw('');
        setAPwConfirm('');
    };

    const cancelGoogleAdminSignupAndClear = async ({ allowWithoutProfile = false } = {}) => {
        if (googleAdminSignupCancelRef.current) {
            return googleAdminSignupCancelRef.current;
        }
        if (!allowWithoutProfile && !googleAdminSignupProfile && !initialKakaoAdminSignup) return;

        const cancellation = (async () => {
            setLoading(true);
            setGoogleAdminSignupLoading(true);
            try {
                if (typeof onGoogleAdminSignupCancel === 'function') {
                    await onGoogleAdminSignupCancel();
                }
            } catch (err) {
                console.error('구글 공동체 등록 취소 처리 실패:', err);
            } finally {
                resetGoogleAdminSignupLocalState();
                setGoogleAdminSignupLoading(false);
                setLoading(false);
            }
        })();
        googleAdminSignupCancelRef.current = cancellation;
        try {
            return await cancellation;
        } finally {
            if (googleAdminSignupCancelRef.current === cancellation) {
                googleAdminSignupCancelRef.current = null;
            }
        }
    };

    // 탭을 먼저 벗어난 뒤 늦게 Google profile이 도착해도 즉시 가입 흐름을 취소한다.
    // 최종 가입 성공으로 LoginView가 언마운트되는 경우에는 cleanup을 두지 않고 백엔드가 종료한다.
    useEffect(() => {
        if (activeTab !== 'adminSignup' && googleAdminSignupProfile) {
            void cancelGoogleAdminSignupAndClear();
        }
        // cancel ref가 activeTab/profile의 연속 변경에서 중복 취소를 막는다.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [activeTab, googleAdminSignupProfile]);

    const selectUnaffiliatedChurch = () => {
        const church = { id: UNAFFILIATED_CHURCH_ID, name: UNAFFILIATED_CHURCH_NAME };
        setLoginChurchId(church.id);
        setMChurchId(church.id);
        saveLastChurch(church);
        setMemberStep('form');
        clearError();
    };

    // 입구 화면의 교회 검색에서 교회를 고르면 로그인/가입 양쪽 컨텍스트에 반영하고 폼으로 진입.
    const selectChurchById = (id) => {
        if (!id) return;
        setLoginChurchId(id);
        setMChurchId(id);
        const c = directory.find(x => x.id === id);
        if (c) saveLastChurch({ id: c.id, name: c.name });
        setMemberStep('form');
        clearError();
    };

    // "변경" — 입구 선택으로 되돌리기 (선택 컨텍스트 초기화)
    const resetEntryChoice = () => {
        setLoginChurchId('');
        setMChurchId('');
        setMemberStep('entry');
        setActiveTab('member');
        clearError();
    };

    const churchNameOf = (id) => {
        if (id === UNAFFILIATED_CHURCH_ID) return UNAFFILIATED_CHURCH_NAME;
        return directory.find(c => c.id === id)?.name || getLastChurch()?.name || '선택한 교회';
    };

    const isLoginUnaffiliated = loginChurchId === UNAFFILIATED_CHURCH_ID;
    const isSignupUnaffiliated = mChurchId === UNAFFILIATED_CHURCH_ID;

    const attachGuardianConsent = (policyConsents, guardian) => ({
        ...policyConsents,
        ...(guardian ? { childGuardian: guardian } : {}),
    });

    const memberConsentPayload = () => attachGuardianConsent(mPolicyConsents, mGuardianConsent);
    const personalConsentPayload = () => attachGuardianConsent(pPolicyConsents, pGuardianConsent);
    const memberConsentReady = validateSignupConsent({ birthdate: mBirthdate, consents: memberConsentPayload(), audience: 'member' }).ok;
    const personalConsentReady = validateSignupConsent({ birthdate: pBirthdate, consents: personalConsentPayload(), audience: 'personal' }).ok;
    const adminConsentReady = isPolicyConsentComplete(aPolicyConsents, 'communityAdmin') && aAgeConfirmed14Plus;

    const handleMemberLogin = async (e) => {
        e.preventDefault();
        if (!loginName.trim() || !loginBirthdate.trim() || !loginChurchId || !loginPw.trim()) { setErrorMsg('모든 항목을 입력해주세요.'); return; }
        // 1956-03-15 / 1956.03.15 같은 구분자는 걷어내고, 자릿수가 다르면 미등록 오류 대신 형식 안내를 먼저 준다.
        const loginBirthdateDigits = loginBirthdate.replace(/\D/g, '');
        if (!/^\d{8}$/.test(loginBirthdateDigits)) {
            setErrorMsg('생년월일은 연도부터 8자리 숫자로 입력해주세요. (예: 1956년 3월 15일 → 19560315)');
            return;
        }
        if (isLoginUnaffiliated && !/^\d{4}$/.test(loginPhone4.trim())) { setErrorMsg('전화번호 뒤 4자리를 입력해주세요.'); return; }
        setLoading(true);
        await onMemberLogin(loginName.trim(), loginBirthdateDigits, loginPw, loginChurchId, loginPhone4.trim());
        setLoading(false);
    };

    const handleAdminLogin = async (e) => {
        e.preventDefault();
        if (!loginEmail.trim() || !loginPw.trim()) { setErrorMsg('이메일과 비밀번호를 입력해주세요.'); return; }
        setLoading(true);
        await onChurchAdminLogin(loginEmail.trim(), loginPw);
        setLoading(false);
    };

    const handleGoogleAdminLogin = async () => {
        clearError();
        setLoading(true);
        setGoogleAdminLoading(true);
        try {
            await onGoogleAdminLogin();
        } finally {
            setGoogleAdminLoading(false);
            setLoading(false);
        }
    };

    const handleGoogleAdminSignupStart = async () => {
        clearError();
        setLoading(true);
        setGoogleAdminSignupLoading(true);
        try {
            const profile = await onGoogleAdminSignupStart();
            if (!profile) return;
            if (activeTabRef.current !== 'adminSignup') {
                await cancelGoogleAdminSignupAndClear({ allowWithoutProfile: true });
                return;
            }
            if (!profile.uid || !profile.email) {
                await cancelGoogleAdminSignupAndClear({ allowWithoutProfile: true });
                setErrorMsg('구글 계정 정보를 확인하지 못했습니다. 다시 시도해주세요.');
                return;
            }
            const normalizedProfile = {
                provider: 'google.com',
                uid: String(profile.uid),
                email: String(profile.email),
                name: String(profile.name || ''),
            };
            setGoogleAdminSignupProfile(normalizedProfile);
            setAName(normalizedProfile.name);
            setAEmail(normalizedProfile.email);
            setAPw('');
            setAPwConfirm('');
        } finally {
            setGoogleAdminSignupLoading(false);
            setLoading(false);
        }
    };

    const handleKakaoAdminSignupStart = async () => {
        clearError();
        setLoading(true);
        setKakaoAdminSignupLoading(true);
        try {
            await onKakaoAdminSignupStart?.({
                name: aName,
                contactEmail: aEmail,
                churchName: aChurchName,
                pastorName: aPastorName,
                denomination: aDenomination,
                churchCode: aChurchCode,
                policyConsents: aPolicyConsents,
                ageConfirmed14Plus: aAgeConfirmed14Plus,
                orgComms,
            });
        } finally {
            setKakaoAdminSignupLoading(false);
            setLoading(false);
        }
    };

    const handleMemberSignup = async (e) => {
        e.preventDefault();
        if (!mName.trim() || !mBirthdate.trim() || !mPw || !mChurchId || (!isSignupUnaffiliated && !mChurchCode.trim())) { setErrorMsg('모든 항목을 입력해주세요.'); return; }
        const mBirthdateDigits = mBirthdate.replace(/\D/g, '');
        if (!isValidBirthdate(mBirthdateDigits)) {
            setErrorMsg('생년월일은 연도부터 8자리 숫자로 입력해주세요. (예: 1956년 3월 15일 → 19560315)');
            return;
        }
        const consentResult = validateSignupConsent({ birthdate: mBirthdateDigits, consents: memberConsentPayload(), audience: 'member' });
        if (!consentResult.ok) { setErrorMsg('생년월일과 필수 동의 항목을 확인해주세요. 만 14세 미만은 보호자 동의가 필요합니다.'); return; }
        if (isSignupUnaffiliated && !/^\d{4}$/.test(mPhone4.trim())) { setErrorMsg('전화번호 뒤 4자리를 입력해주세요.'); return; }
        if (mPw !== mPwConfirm) { setErrorMsg('비밀번호가 일치하지 않습니다.'); return; }
        if (mPw.length < 6) { setErrorMsg('비밀번호는 6자리 이상이어야 합니다.'); return; }
        setLoading(true);
        await onMemberSignup({
            name: mName.trim(),
            birthdate: mBirthdateDigits,
            password: mPw,
            churchId: mChurchId,
            churchCode: mChurchCode.trim(),
            phone4: mPhone4.trim(),
            consents: memberConsentPayload(),
        });
        setLoading(false);
    };

    const isValidBirthdate = value => {
        if (!/^\d{8}$/.test(value)) return false;
        const year = Number(value.slice(0, 4));
        const month = Number(value.slice(4, 6));
        const day = Number(value.slice(6, 8));
        const date = new Date(year, month - 1, day);
        return date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day;
    };

    const handlePersonalSignup = async (e) => {
        e.preventDefault();
        if (!pName.trim() || !isValidBirthdate(pBirthdate) || !/^\d{4}$/.test(pPhone4) || !pPw) {
            setErrorMsg('이름, 생년월일 8자리, 전화번호 뒤 4자리를 정확히 입력해주세요.'); return;
        }
        if (pPw.length < 6) { setErrorMsg('비밀번호는 6자리 이상이어야 합니다.'); return; }
        if (pPw !== pPwConfirm) { setErrorMsg('비밀번호가 일치하지 않습니다.'); return; }
        const consentResult = validateSignupConsent({ birthdate: pBirthdate, consents: personalConsentPayload(), audience: 'personal' });
        if (!consentResult.ok) { setErrorMsg('필수 동의 항목을 확인해주세요. 만 14세 미만은 보호자 동의가 필요합니다.'); return; }
        setLoading(true);
        try { await onPersonalSignup({ name: pName.trim(), birthdate: pBirthdate, phone4: pPhone4, password: pPw, consents: personalConsentPayload() }); }
        finally { setLoading(false); }
    };

    const handleGoogleAccountStart = async () => {
        clearError(); setLoading(true); setGooglePersonalLoading(true);
        try { await onGooglePersonalSignup(); }
        finally { setGooglePersonalLoading(false); setLoading(false); }
    };

    const handleGooglePersonalSignup = async () => {
        const consentResult = validateSignupConsent({ birthdate: pBirthdate, consents: personalConsentPayload(), audience: 'personal' });
        if (!consentResult.ok) { setErrorMsg('생년월일과 필수 동의 항목을 확인해주세요. 만 14세 미만은 보호자 동의가 필요합니다.'); return; }
        clearError(); setLoading(true); setGooglePersonalLoading(true);
        try { await onGooglePersonalSignup({ birthdate: pBirthdate, consents: personalConsentPayload() }); }
        finally { setGooglePersonalLoading(false); setLoading(false); }
    };

    const handleKakaoAccountStart = async () => {
        clearError(); setLoading(true); setKakaoLoading(true);
        try { await onKakaoStart(); }
        finally { setKakaoLoading(false); setLoading(false); }
    };

    const handleKakaoStart = async () => {
        const consentResult = validateSignupConsent({ birthdate: pBirthdate, consents: personalConsentPayload(), audience: 'personal' });
        if (!consentResult.ok) { setErrorMsg('생년월일과 필수 동의 항목을 확인해주세요. 만 14세 미만은 보호자 동의가 필요합니다.'); return; }
        clearError(); setLoading(true); setKakaoLoading(true);
        try { await onKakaoStart({ birthdate: pBirthdate, consents: personalConsentPayload() }); }
        finally { setKakaoLoading(false); setLoading(false); }
    };

    const handleGuestLogin = async () => {
        setLoading(true);
        clearError();
        try {
            await authReady;
            await auth.signInAnonymously();
        } catch (err) {
            console.error('게스트 로그인 실패:', err);
            if (err?.code === 'auth/operation-not-allowed') {
                setErrorMsg('잠시 후 다시 시도해주세요. 문제가 계속되면 관리자에게 알려주세요.');
            } else {
                setErrorMsg('게스트 모드로 들어가지 못했습니다. 잠시 후 다시 시도해주세요.');
            }
        } finally {
            setLoading(false);
        }
    };

    const handleAdminStep1 = (e) => {
        e.preventDefault();
        const isSocialSignup = !!googleAdminSignupProfile;
        if (!aName.trim() || !aEmail.trim() || !aChurchName.trim() || !aPastorName.trim() || !aChurchCode.trim()
            || (isSocialSignup ? !googleAdminSignupProfile.uid : !aPw)) {
            setErrorMsg('모든 항목을 입력해주세요.');
            return;
        }
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(aEmail.trim())) { setErrorMsg('연락받을 수 있는 이메일을 정확히 입력해주세요.'); return; }
        if (!isSocialSignup && aPw !== aPwConfirm) { setErrorMsg('비밀번호가 일치하지 않습니다.'); return; }
        if (!isSocialSignup && aPw.length < 6) { setErrorMsg('비밀번호는 6자리 이상이어야 합니다.'); return; }
        if (!normalizeChurchEntryCode(aChurchCode)) {
            setErrorMsg('교회 입장코드는 4~128자로 입력해주세요.');
            return;
        }
        const consentResult = validateSignupConsent({
            birthdate: null,
            consents: aPolicyConsents,
            audience: 'communityAdmin',
            ageConfirmed14Plus: aAgeConfirmed14Plus,
        });
        if (!consentResult.ok) { setErrorMsg('만 14세 이상 확인과 필수 정책 동의가 필요합니다.'); return; }
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
        try {
            const result = await onChurchAdminSignup({
                name: aName.trim(),
                email: googleAdminSignupProfile?.email || aEmail.trim(),
                contactEmail: aEmail.trim().toLowerCase(),
                password: googleAdminSignupProfile ? null : aPw,
                churchName: aChurchName.trim(),
                pastorName: aPastorName.trim(),
                denomination: aDenomination.trim(),
                churchCode: normalizeChurchEntryCode(aChurchCode),
                departments: validComms,
                googleProfile: googleAdminSignupProfile,
                ageConfirmed14Plus: aAgeConfirmed14Plus,
                consents: aPolicyConsents,
            });
            if (result?.resetGoogleProfile) {
                // 백엔드가 이미 해당 Google 흐름을 종료했다. cancel callback은 오류문구까지 지우므로 호출하지 않는다.
                resetGoogleAdminSignupLocalState();
                setSignupStep(1);
            }
        } finally {
            setLoading(false);
        }
    };

    const resetAdminSignup = async () => {
        await cancelGoogleAdminSignupAndClear();
        setSignupStep(1);
        setOrgComms([{ id: 'comm_0', name: '', subgroups: [{ id: 'sub_0', name: '' }] }]);
        clearError();
    };

    // ── 선택 컨텍스트 뱃지: 폼 상단에 "어디로 들어와 있는지"를 항상 보여준다 ───
    const renderContextBadge = (id, onReset = resetEntryChoice) => {
        if (!id) return null;
        const solo = id === UNAFFILIATED_CHURCH_ID;
        return (
            <div className={`flex items-center justify-between rounded-lg border px-3.5 py-2.5 ${solo ? 'bg-emerald-50 border-emerald-200' : 'bg-cream border-hairline'}`}>
                <span className={`text-[13px] font-semibold ${solo ? 'text-emerald-800' : 'text-ink'}`}>
                    {solo ? <>🙋 「{UNAFFILIATED_CHURCH_NAME}」 <span className="font-normal text-emerald-700">· 혼자 읽어요</span></> : <>⛪ {churchNameOf(id)}</>}
                </span>
                <button type="button" onClick={onReset}
                    className="text-[11px] underline underline-offset-2 text-ink/45 hover:text-ink transition-colors shrink-0 ml-2">
                    변경
                </button>
            </div>
        );
    };

    // ── 첫 화면 입구: "우리 교회와 함께 / 혼자 읽어요" 두 카드 + 게스트 ───────
    const renderLegacyEntryChoice = () => (
        <div className="space-y-3.5">
            <button type="button" onClick={() => { setActiveTab('personalSignup'); setPersonalMethod('choice'); clearError(); }} className="w-full rounded-xl border border-blue-200 bg-blue-50 p-4 text-left transition-colors hover:border-blue-400">
                <p className="text-[16px] font-bold text-blue-950">시작하기 · 개인 계정 로그인 →</p>
                <p className="mt-1 text-[11px] text-blue-700">처음 시작하거나 개인 계정으로 전환하셨다면 여기로 들어오세요.</p>
            </button>
            <div className="flex items-center gap-3 py-1"><span className="h-px flex-1 bg-hairline" /><span className="text-[11px] font-semibold text-ink/45">이미 교회에서 가입하셨나요? 교인 로그인</span><span className="h-px flex-1 bg-hairline" /></div>
            <div className="border border-hairline rounded-xl p-4 bg-cream-card">
                <p className="text-[15px] font-bold text-ink mb-0.5">⛪ 우리 교회와 함께 읽어요</p>
                <p className="text-[11px] text-ink/55 mb-2.5">교회 이름을 한 글자만 입력해도 바로 찾아드려요.</p>
                <ChurchPicker value={''} onChange={selectChurchById} label="" />
            </div>
            <button
                type="button"
                onClick={selectUnaffiliatedChurch}
                className="w-full text-left border border-emerald-200 bg-emerald-50 hover:border-emerald-400 rounded-xl p-4 transition-colors"
            >
                <p className="text-[15px] font-bold text-emerald-900 mb-0.5">🙋 혼자 읽어요</p>
                <p className="text-[11px] text-emerald-700 leading-relaxed">
                    「{UNAFFILIATED_CHURCH_NAME}」 모임으로 들어가요. 전국에서 혼자 읽는 분들과 함께 걷는 길이에요.
                </p>
            </button>
            {errorMsg && <p className="text-red-500 text-xs text-center py-1 bg-red-50 rounded-lg px-3">{errorMsg}</p>}
            <div className="pt-3 border-t border-hairline text-center">
                <p className="text-[11px] text-ink/45 mb-2">아직 고민되시나요?</p>
                <button
                    type="button"
                    onClick={handleGuestLogin}
                    disabled={loading}
                    className="w-full bg-cream-card border border-hairline text-ink font-semibold py-3 rounded-full text-sm hover:border-ink/25 hover:bg-cream transition-colors disabled:opacity-50"
                >
                    {loading ? '들어가는 중...' : '로그인 없이 오늘 말씀 먼저 읽어보기 →'}
                </button>
            </div>
        </div>
    );

    const renderEntryChoice = () => (
        <div className="space-y-4">
            <div className="relative mx-auto w-fit rounded-full border-2 border-orange-400 bg-orange-50 px-4 py-1.5 text-xs font-black text-orange-700">
                5초만에 빠른 시작
                <span className="absolute -bottom-1.5 left-1/2 h-3 w-3 -translate-x-1/2 rotate-45 border-b-2 border-r-2 border-orange-400 bg-orange-50" />
            </div>
            <button type="button" onClick={handleKakaoAccountStart} disabled={loading || kakaoLoading}
                className="w-full rounded-2xl bg-[#FEE500] px-5 py-4 text-base font-black text-[#191919] shadow-sm transition-transform active:scale-[0.99] disabled:opacity-50">
                {kakaoLoading ? '카카오 계정 확인 중...' : (
                    <span className="flex items-center justify-center gap-2.5">
                        <svg viewBox="0 0 24 24" className="h-5 w-5 fill-[#191919]" aria-hidden="true">
                            <path d="M12 3C6.48 3 2 6.54 2 10.9c0 2.8 1.86 5.25 4.64 6.65-.2.75-.74 2.72-.85 3.14-.13.52.19.51.4.37.17-.11 2.62-1.78 3.68-2.5.68.1 1.39.15 2.13.15 5.52 0 10-3.55 10-7.9S17.52 3 12 3z" />
                        </svg>
                        카카오로 시작
                    </span>
                )}
            </button>
            <button type="button" onClick={handleGoogleAccountStart} disabled={loading || googlePersonalLoading || isKakaoTalkBrowser}
                className="w-full rounded-2xl bg-slate-100 px-5 py-4 text-base font-black text-[#191919] shadow-sm transition-transform active:scale-[0.99] disabled:opacity-40"
                title={isKakaoTalkBrowser ? 'Google 로그인은 다른 브라우저에서 이용해주세요' : '구글로 시작'}>
                {googlePersonalLoading ? '구글 계정 확인 중...' : (
                    <span className="flex items-center justify-center gap-2.5">
                        <svg viewBox="0 0 48 48" className="h-5 w-5" aria-hidden="true">
                            <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
                            <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
                            <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
                            <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
                        </svg>
                        구글로 시작
                    </span>
                )}
            </button>
            <div className="text-center text-[12px] font-semibold text-ink/55">
                <button type="button" onClick={() => { setMemberStep('legacy'); clearError(); }} className="underline underline-offset-3">기존 회원 로그인(이름으로)</button>
                {rememberedChurch && <span className="ml-1.5 rounded-full bg-slate-100 px-2 py-1 text-[10px] text-slate-500">지난번: {rememberedChurch.name}</span>}
                <span className="mx-2">·</span>
                <button type="button" onClick={handleGuestLogin} disabled={loading} className="underline underline-offset-3">로그인 없이 둘러보기</button>
            </div>
            <div className="rounded-xl border border-amber-100 bg-amber-50/70 px-3.5 py-3 text-center text-[12px] leading-relaxed text-ink/65">
                <p>⛪ 교회·모임과 함께 읽고 싶으신가요?</p>
                <p><b>공동체 대표(관리자)가</b> 먼저 공동체를 등록해야 성도들이 찾아서 함께 읽을 수 있어요.</p>
                <button type="button" onClick={() => { setActiveTab('adminSignup'); clearError(); }} className="mt-1.5 font-black text-accent underline underline-offset-3">공동체 등록하기 →</button>
            </div>
            <div className="text-center text-[10px] text-ink/40">
                <button type="button" onClick={() => { setActiveTab('admin'); clearError(); }} className="underline underline-offset-3">공동체 관리자</button>
                <span className="mx-2">·</span>
                <button type="button" onClick={() => setShowAdminContact(true)} className="underline underline-offset-3">비밀번호 문의</button>
            </div>
            {errorMsg && <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-center text-xs text-red-500">{errorMsg}</p>}
        </div>
    );

    // ── Render login card content ────────────────────────────────────────────
    const renderCard = () => {
        // ── Member Entry Choice (첫 화면) ──
        if (activeTab === 'member' && memberStep === 'entry') {
            return renderEntryChoice();
        }
        if (activeTab === 'member' && memberStep === 'legacy' && !loginChurchId) return (
            <div className="space-y-3.5">
                <button type="button" onClick={() => { setMemberStep('entry'); clearError(); }} className="text-[12px] text-ink/50">← 다른 방법으로 로그인</button>
                {renderLegacyEntryChoice()}
                <button type="button" onClick={() => { setActiveTab('personalSignup'); setPersonalMethod('manual'); clearError(); }} className="w-full py-2 text-xs font-semibold text-blue-600 underline underline-offset-4">소셜 계정이 없어요 → 이름으로 가입</button>
            </div>
        );

        if (activeTab === 'personalSignup') return (
            <div className="space-y-3.5">
                <button type="button" onClick={() => { setActiveTab('member'); setMemberStep('entry'); setPersonalMethod('choice'); clearError(); }} className="text-[12px] text-ink/50 hover:text-ink">← 처음 화면으로</button>
                {personalMethod === 'choice' ? (
                    <>
                        <p className="text-sm font-bold text-ink">시작하기 · 개인 계정 로그인</p>
                        <input inputMode="numeric" value={pBirthdate} onChange={e => setPBirthdate(e.target.value.replace(/\D/g, ''))} placeholder="생년월일 8자리 (예: 19900101)" maxLength={8} className={inputCls} />
                        <PolicyConsent audience="personal" value={pPolicyConsents} onChange={setPPolicyConsents} disabled={loading} />
                        <GuardianConsent birthdate={pBirthdate} value={pGuardianConsent} onChange={setPGuardianConsent} disabled={loading} />
                        {isKakaoTalkBrowser ? <p className="rounded-lg border border-amber-200 bg-amber-50 px-3.5 py-3 text-[12px] text-amber-800">카카오톡 브라우저에서는 구글 로그인이 제한됩니다. 다른 브라우저로 열어주세요.</p> : <button type="button" onClick={handleGooglePersonalSignup} disabled={loading || !personalConsentReady} className="w-full rounded-full border border-hairline bg-white py-3.5 text-sm font-semibold text-ink disabled:opacity-50">{googlePersonalLoading ? '구글 계정 확인 중...' : 'G 구글로 시작'}</button>}
                        <button type="button" onClick={() => { setPersonalMethod('manual'); clearError(); }} className="w-full rounded-full bg-ink py-3.5 text-sm font-semibold text-cream">이름·생일·전화번호로 시작</button>
                        {guestMigrationPreview && <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3.5 py-2.5 text-[12px] font-semibold text-emerald-800">지금까지 읽은 {guestMigrationPreview.currentDay}일차 진도를 가져옵니다.</div>}
                        {errorMsg && <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-center text-xs text-red-500">{errorMsg}</p>}
                    </>
                ) : (
                    <form onSubmit={handlePersonalSignup} className="space-y-3">
                        <button type="button" onClick={() => { setPersonalMethod('choice'); clearError(); }} className="text-[12px] text-ink/50">← 방법 다시 선택</button>
                        <input value={pName} onChange={e => setPName(e.target.value)} placeholder="이름" className={inputCls} />
                        <input inputMode="numeric" value={pBirthdate} onChange={e => setPBirthdate(e.target.value.replace(/\D/g, ''))} placeholder="생년월일 8자리 (예: 19900101)" maxLength={8} className={inputCls} />
                        <input inputMode="numeric" value={pPhone4} onChange={e => setPPhone4(e.target.value.replace(/\D/g, ''))} placeholder="전화번호 뒤 4자리" maxLength={4} className={inputCls} />
                        <input type="password" value={pPw} onChange={e => setPPw(e.target.value)} placeholder="비밀번호 (6자리 이상)" className={inputCls} />
                        <input type="password" value={pPwConfirm} onChange={e => setPPwConfirm(e.target.value)} placeholder="비밀번호 확인" className={inputCls} />
                        <PolicyConsent audience="personal" value={pPolicyConsents} onChange={setPPolicyConsents} disabled={loading} />
                        <GuardianConsent birthdate={pBirthdate} value={pGuardianConsent} onChange={setPGuardianConsent} disabled={loading} />
                        {guestMigrationPreview && <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3.5 py-2.5 text-[12px] font-semibold text-emerald-800">지금까지 읽은 {guestMigrationPreview.currentDay}일차 진도를 가져옵니다.</div>}
                        <p className="text-[11px] text-ink/50">개인 계정 비밀번호 지원은 플랫폼 관리자에게 문의해주세요.</p>
                        {errorMsg && <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-center text-xs text-red-500">{errorMsg}</p>}
                        <button type="submit" disabled={loading || !personalConsentReady} className="w-full rounded-full bg-ink py-3.5 text-sm font-semibold text-cream disabled:opacity-50">{loading ? '확인 중...' : '시작하기 · 로그인'}</button>
                    </form>
                )}
            </div>
        );

        // ── Member Login ──
        if (activeTab === 'member') return (
            <form onSubmit={handleMemberLogin} className="space-y-3.5">
                {/* 선택한 입구(교회/혼자 읽기) 표시 */}
                {renderContextBadge(loginChurchId)}
                <div>
                    <label className="block text-[11px] font-semibold text-ink/55 mb-1.5 uppercase tracking-wide">이름</label>
                    <input type="text" value={loginName} onChange={e => setLoginName(e.target.value)} placeholder="홍길동" className={inputCls} />
                </div>
                <div>
                    <label className="block text-[11px] font-semibold text-ink/55 mb-1.5 uppercase tracking-wide">생년월일</label>
                    <input type="text" inputMode="numeric" value={loginBirthdate} onChange={e => setLoginBirthdate(e.target.value.replace(/\D/g, ''))}
                        placeholder="19900101" maxLength={8} className={inputCls} />
                </div>
                {isLoginUnaffiliated && (
                    <div>
                        <label className="block text-[11px] font-semibold text-ink/55 mb-1.5 uppercase tracking-wide">전화번호 뒤 4자리</label>
                        <input type="text" inputMode="numeric" value={loginPhone4} onChange={e => setLoginPhone4(e.target.value.replace(/\D/g, ''))}
                            placeholder="1234" maxLength={4} className={inputCls} />
                    </div>
                )}
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
                    <p className="text-[12px] text-ink leading-relaxed"><b>공동체 관리자 전용</b>입니다. 구역 편성, 성도 관리, 통독 진행률 대시보드를 사용할 수 있어요.</p>
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
                <div className="flex items-center gap-3 py-1" aria-hidden="true">
                    <span className="h-px flex-1 bg-hairline" />
                    <span className="text-[11px] font-semibold text-ink/35">또는</span>
                    <span className="h-px flex-1 bg-hairline" />
                </div>
                {isKakaoTalkBrowser ? (
                    <p role="note" className="rounded-lg border border-amber-200 bg-amber-50 px-3.5 py-3 text-[12px] leading-relaxed text-amber-800">
                        카카오톡 브라우저에서는 구글 로그인이 제한됩니다. 우측 하단 ⋯ 메뉴에서 '다른 브라우저로 열기'를 눌러주세요.
                    </p>
                ) : (
                    <button
                        type="button"
                        onClick={handleGoogleAdminLogin}
                        disabled={loading}
                        aria-label="구글 계정으로 공동체 관리자 로그인"
                        className="w-full rounded-full border border-hairline bg-white py-3.5 text-sm font-semibold text-ink transition-colors hover:bg-cream disabled:cursor-not-allowed disabled:opacity-50"
                    >
                        {googleAdminLoading ? '구글 로그인 중...' : 'G 구글로 로그인'}
                    </button>
                )}
                <div className="pt-1 text-center">
                    <span className="text-[12px] text-ink/50">공동체가 아직 없으신가요?{' '}</span>
                    <button type="button" onClick={() => { setActiveTab('adminSignup'); clearError(); }}
                        className="text-[12px] text-ink font-semibold underline underline-offset-2 hover:text-accent transition-colors">
                        공동체 등록 신청
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
                {guestMigrationPreview && (
                    <div className="bg-emerald-50 border border-emerald-200 rounded-lg px-3.5 py-2.5">
                        <p className="text-[12px] text-emerald-800 font-semibold">
                            지금까지 읽은 {guestMigrationPreview.currentDay}일차 진도를 가져옵니다.
                        </p>
                        <p className="text-[11px] text-emerald-700 mt-0.5">점수는 가입 후부터 적립돼요.</p>
                    </div>
                )}
                {mChurchId ? renderContextBadge(mChurchId, () => { setMChurchId(''); clearError(); }) : (
                    <div className="space-y-2">
                        <ChurchPicker value={mChurchId} onChange={(id) => { setMChurchId(id); setLoginChurchId(id); clearError(); }} label="교회 선택" />
                        <button
                            type="button"
                            onClick={selectUnaffiliatedChurch}
                            className="w-full rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2.5 text-[12px] font-semibold text-emerald-800 hover:border-emerald-400 transition-colors text-left"
                        >
                            🙋 소속 교회가 없어요 — 「{UNAFFILIATED_CHURCH_NAME}」로 가입
                        </button>
                    </div>
                )}
                {isSignupUnaffiliated ? (
                    <input type="text" inputMode="numeric" value={mPhone4} onChange={e => setMPhone4(e.target.value.replace(/\D/g, ''))}
                        placeholder="전화번호 뒤 4자리" maxLength={4} className={inputCls} />
                ) : (
                    <input type="password" value={mChurchCode} onChange={e => setMChurchCode(e.target.value)}
                        placeholder="교회 입장코드 (관리자에게 문의)" className={inputCls} />
                )}
                <PolicyConsent audience="member" value={mPolicyConsents} onChange={setMPolicyConsents} disabled={loading} />
                <GuardianConsent birthdate={mBirthdate} value={mGuardianConsent} onChange={setMGuardianConsent} disabled={loading} />
                {errorMsg && <p className="text-red-500 text-xs text-center py-1 bg-red-50 rounded-lg px-3">{errorMsg}</p>}
                <button type="submit" disabled={loading || !memberConsentReady}
                    className="w-full bg-ink text-cream font-semibold py-3.5 rounded-full text-sm flex items-center justify-center gap-2 hover:bg-ink/90 transition-colors disabled:opacity-50">
                    {loading ? '가입 중...' : '교인으로 가입하기'}
                </button>
            </form>
        );

        // ── Admin Signup Step 1 ──
        if (activeTab === 'adminSignup' && signupStep === 1) return (
            <form onSubmit={handleAdminStep1} className="space-y-3">
                <button type="button" disabled={loading} onClick={async () => { await resetAdminSignup(); setActiveTab('admin'); }}
                    className="text-[12px] text-ink/50 hover:text-ink flex items-center gap-1 mb-1 transition-colors disabled:cursor-not-allowed disabled:opacity-50">← 뒤로</button>
                <div className="flex items-center justify-between mb-1">
                    <span className="text-[11px] font-bold text-accent bg-accent/10 px-2 py-1 rounded-full">1단계 / 2단계</span>
                    <span className="text-[11px] text-ink/40">기본 정보 입력</span>
                </div>
                <div className="rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-[12px] leading-relaxed text-blue-900">
                    <p className="text-sm font-black">공동체 등록이란?</p>
                    <p>우리 교회(모임)의 관리 계정을 만드는 일이에요.</p>
                    <p className="mt-1 font-semibold">① 성도 검색 가입 가능 · ② 입장코드 보호 · ③ 관리 화면·달란트 상점 운영</p>
                    <p className="mt-1 font-black">무료 · 약 5분 소요</p>
                </div>
                <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-[12px] leading-relaxed text-red-900">
                    <p className="font-black">복음주의 신앙 공동체만 등록할 수 있습니다.</p>
                    <p className="mt-1">한국교회 주요 교단의 공식 결의에서 이단·사이비 또는 참여·교류 금지 대상으로 규정된 단체는 등록과 이용이 제한됩니다.</p>
                </div>
                <div className="rounded-xl border border-amber-200 bg-amber-50 px-3.5 py-2.5 text-center text-[12px] text-amber-900">
                    성도이신가요? 가입은 첫 화면의 카카오로 시작을 눌러주세요.
                    <button type="button" onClick={async () => { await cancelGoogleAdminSignupAndClear(); setActiveTab('member'); setMemberStep('entry'); clearError(); }} className="ml-1 font-black underline underline-offset-2">← 돌아가기</button>
                </div>
                {!googleAdminSignupProfile && (
                    <>
                        <button
                            type="button"
                            onClick={handleKakaoAdminSignupStart}
                            disabled={loading}
                            aria-label="카카오 계정으로 공동체 등록 시작"
                            className="w-full rounded-full bg-[#FEE500] py-3.5 text-sm font-black text-[#191919] transition-colors hover:bg-[#f5dc00] disabled:cursor-not-allowed disabled:opacity-50"
                        >
                            {kakaoAdminSignupLoading ? '카카오 계정 확인 중...' : '카카오로 공동체 등록 시작'}
                        </button>
                        {isKakaoTalkBrowser ? (
                            <p role="note" className="rounded-lg border border-amber-200 bg-amber-50 px-3.5 py-3 text-[12px] leading-relaxed text-amber-800">
                                카카오톡 브라우저에서는 구글 로그인이 제한됩니다. 우측 하단 ⋯ 메뉴에서 '다른 브라우저로 열기'를 눌러주세요.
                            </p>
                        ) : (
                            <button
                                type="button"
                                onClick={handleGoogleAdminSignupStart}
                                disabled={loading}
                                aria-label="구글 계정으로 공동체 등록 시작"
                                className="w-full rounded-full border border-hairline bg-white py-3.5 text-sm font-semibold text-ink transition-colors hover:bg-cream disabled:cursor-not-allowed disabled:opacity-50"
                            >
                                {googleAdminSignupLoading ? '구글 계정 확인 중...' : 'G 구글 계정으로 시작'}
                            </button>
                        )}
                        <div className="flex items-center gap-3 py-1" aria-hidden="true">
                            <span className="h-px flex-1 bg-hairline" />
                            <span className="text-[11px] font-semibold text-ink/35">또는 이메일과 비밀번호로 등록</span>
                            <span className="h-px flex-1 bg-hairline" />
                        </div>
                    </>
                )}
                {googleAdminSignupProfile && (
                    <div className={`rounded-xl border px-4 py-3 ${googleAdminSignupProfile.provider === 'kakao.com'
                        ? 'border-yellow-300 bg-yellow-50'
                        : 'border-blue-200 bg-blue-50'}`}>
                        <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                                <p className="text-[11px] font-bold text-slate-700">
                                    {googleAdminSignupProfile.provider === 'kakao.com' ? '카카오 계정으로 시작' : 'G 구글 계정으로 시작'}
                                </p>
                                <p className="mt-1 truncate text-[13px] font-semibold text-ink">
                                    {googleAdminSignupProfile.email || googleAdminSignupProfile.name || '카카오 계정 확인 완료'}
                                </p>
                            </div>
                            <button
                                type="button"
                                onClick={() => { void cancelGoogleAdminSignupAndClear(); }}
                                disabled={loading}
                                className="shrink-0 text-[11px] font-semibold text-slate-700 underline underline-offset-2 disabled:opacity-50"
                            >
                                {googleAdminSignupLoading ? '전환 중...' : '이메일 방식으로 변경'}
                            </button>
                        </div>
                    </div>
                )}
                <input type="text" value={aName} onChange={e => setAName(e.target.value)} placeholder="이름" className={inputCls} />
                <input
                    type="email"
                    value={aEmail}
                    onChange={e => setAEmail(e.target.value)}
                    placeholder="관리자 연락 이메일 (슈퍼관리자 연락용)"
                    className={inputCls}
                />
                <p className="-mt-1 ml-1 text-[10px] text-ink/45">로그인 방식과 관계없이 운영 안내가 필요할 때 이 주소로 연락드립니다.</p>
                {!googleAdminSignupProfile && (
                    <>
                        <input type="password" value={aPw} onChange={e => setAPw(e.target.value)} placeholder="비밀번호 (6자리 이상)" className={inputCls} />
                        <input type="password" value={aPwConfirm} onChange={e => setAPwConfirm(e.target.value)} placeholder="비밀번호 확인"
                            className={`w-full bg-cream border rounded-lg px-3.5 py-3 text-sm placeholder-ink/40 focus:outline-none focus:ring-2 transition-all font-sans ${aPwConfirm && aPw !== aPwConfirm ? 'border-red-400 focus:ring-red-400/40' : 'border-hairline focus:ring-accent/40 focus:border-accent/60'}`} />
                    </>
                )}
                <div className="border-t border-hairline pt-3 space-y-2">
                    <p className="text-[11px] text-ink/55 font-semibold uppercase tracking-wide">공동체 정보</p>
                    <input type="text" value={aChurchName} onChange={e => setAChurchName(e.target.value)} placeholder="교회 이름 (예: ○○교회)" className={inputCls} />
                    <input type="text" value={aPastorName} onChange={e => setAPastorName(e.target.value)} placeholder="담임목사 성함 (필수, 예: 홍길동 목사)" className={inputCls} />
                    <input type="text" value={aDenomination} onChange={e => setADenomination(e.target.value)} placeholder="교단 (예: 예장합동, 감리교 등)" className={inputCls} />
                    <input type="text" value={aChurchCode} onChange={e => setAChurchCode(e.target.value)} maxLength={128} placeholder="교회 입장코드 설정 (4~128자)" className={inputCls} />
                    <p className="text-[10px] text-ink/40 ml-1">입장코드는 교인들이 가입할 때 사용합니다. 나중에 변경 가능합니다.</p>
                </div>
                <label className="flex items-start gap-2.5 rounded-xl border border-slate-200 bg-white px-3.5 py-3 text-[12px] text-slate-700">
                    <input type="checkbox" checked={aAgeConfirmed14Plus} onChange={e => setAAgeConfirmed14Plus(e.target.checked)} disabled={loading} className="mt-0.5 h-4 w-4" />
                    <span><b>[필수]</b> 공동체 등록자는 만 14세 이상이며, 입력한 공동체를 대표하거나 등록할 권한이 있습니다.</span>
                </label>
                <PolicyConsent audience="communityAdmin" value={aPolicyConsents} onChange={setAPolicyConsents} disabled={loading} showCompletion />
                {errorMsg && <p className="text-red-500 text-xs text-center py-1 bg-red-50 rounded-lg px-3">{errorMsg}</p>}
                <button type="submit" disabled={loading || !adminConsentReady}
                    className="w-full bg-accent text-cream font-semibold py-3.5 rounded-full text-sm flex items-center justify-center gap-2 hover:bg-accent/90 transition-colors disabled:opacity-50">
                    {loading ? '확인 중...' : '다음: 조직 구성 →'}
                </button>
            </form>
        );

        // ── Admin Signup Step 2 ──
        if (activeTab === 'adminSignup' && signupStep === 2) return (
            <div className="space-y-4">
                <button type="button" disabled={loading} onClick={() => { setSignupStep(1); clearError(); }}
                    className="text-[12px] text-ink/50 hover:text-ink flex items-center gap-1 transition-colors disabled:cursor-not-allowed disabled:opacity-50">← 뒤로</button>
                <div className="flex items-center justify-between">
                    <span className="text-[11px] font-bold text-accent bg-accent/10 px-2 py-1 rounded-full">2단계 / 2단계</span>
                    <span className="text-[11px] text-ink/40">조직 구성</span>
                </div>
                <div className="bg-accent/10 rounded-xl p-3 border border-accent/20">
                    <p className="text-sm font-semibold text-ink mb-1">공동체 조직을 구성해주세요</p>
                    <p className="text-[11px] text-ink/60">부서(장년부, 청년부 등)와 소그룹(1구역, 2팀 등)을 설정합니다.</p>
                    <p className="text-[11px] text-accent mt-1 font-semibold">조직은 관리자 메뉴에서도 언제든지 변경이 가능합니다.</p>
                </div>
                <OrgEditor departments={orgComms} onChange={setOrgComms} />
                {errorMsg && <p className="text-red-500 text-xs text-center py-1 bg-red-50 rounded-lg px-3">{errorMsg}</p>}
                <button type="button" onClick={handleAdminSignupFinal} disabled={loading}
                    className="w-full bg-accent text-cream font-semibold py-3.5 rounded-full text-sm flex items-center justify-center gap-2 hover:bg-accent/90 transition-colors disabled:opacity-50">
                    {loading ? '공동체 등록 중...' : '공동체 등록 완료'}
                </button>
            </div>
        );

        return null;
    };

    const isSignupTab = activeTab === 'memberSignup' || activeTab === 'adminSignup' || activeTab === 'personalSignup';
    const isEntryStep = activeTab === 'member' && memberStep === 'entry';
    const cardTitle = {
        member: isEntryStep ? '성경통독을 시작해요' : '기존 회원 로그인',
        admin: '공동체 관리자 로그인',
        memberSignup: '성도 회원가입',
        adminSignup: '공동체 등록',
        personalSignup: '개인 계정 시작',
    }[activeTab] || '로그인';

    // ── DESKTOP Layout (md+) / MOBILE Layout ──────────────────────────────────
    return (
        <div
            className="min-h-screen bg-cream relative md:grid md:grid-cols-[1.15fr_1fr]"
            style={{ paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 72px)' }}
        >

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
                    <button type="button" onClick={() => setShowDemoTour(true)} className="hover:text-ink transition-colors cursor-pointer">읽는 방법</button>
                </nav>
                {/* CTA */}
                <button
                    onClick={() => { setActiveTab('adminSignup'); clearError(); }}
                    className="text-[13px] font-semibold text-accent border border-accent/40 bg-accent/8 hover:bg-accent/15 transition-colors px-4 py-2 rounded-full cursor-pointer">
                    공동체 등록
                </button>
            </div>

            {/* ═══ LEFT — Editorial Hero (desktop) / Hero strip (mobile) ═══════ */}
            <div className="relative z-[1] flex flex-col pt-16 pb-8 px-6 md:pt-[100px] md:pb-10 md:px-14">

                {/* Mobile logo bar */}
                <div className="flex items-center justify-between mb-6 md:hidden">
                    <div className="flex items-center gap-2">
                        <div className="w-7 h-7 rounded-[6px] bg-ink text-cream flex items-center justify-center font-serif font-bold text-[13px]">114</div>
                        <span className="font-serif text-base font-semibold text-ink">성경통독 114</span>
                    </div>
                    <button
                        type="button"
                        onClick={() => { setActiveTab('adminSignup'); clearError(); }}
                        className="text-[13px] font-semibold text-accent border border-accent/40 bg-accent/8 hover:bg-accent/15 transition-colors px-3 py-1.5 rounded-full">
                        공동체 등록
                    </button>
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
                    오늘도 같은 페이지를 넘기고 있습니다. 함께 걷는 통독의 길, 같이 걸어요.
                </p>

                {/* Stat strip */}
                <div className="grid grid-cols-4 border-t border-b border-hairline py-4 mb-5">
                    {[
                        { num: stats.total_churches > 0 ? stats.total_churches.toString() : '—', label: '함께하는 교회' },
                        { num: stats.total_readers > 0 ? stats.total_readers.toLocaleString() : '—', label: '참여 성도' },
                        { num: stats.finished_total > 0 ? stats.finished_total.toLocaleString() : '—', label: '누적 완독' },
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

                <nav aria-label="서비스 정책" className="mt-4 flex flex-wrap justify-center gap-x-3 gap-y-1 text-[11px] text-ink/50">
                    {['terms', 'privacy', 'community'].map(policyId => (
                        <button
                            key={policyId}
                            type="button"
                            onClick={() => setOpenPublicPolicyId(policyId)}
                            className="underline underline-offset-3 hover:text-ink/80"
                        >
                            {SERVICE_POLICIES[policyId].shortLabel}
                        </button>
                    ))}
                </nav>

            </div>

            {/* ═══ RIGHT — Login Card ══════════════════════════════════════════ */}
            <div className="relative z-[1] flex flex-col px-5 pb-10 md:pt-[100px] md:pb-10 md:px-7 md:pl-7 md:items-center md:justify-center">
                <div
                    ref={loginCardRef}
                    className="w-full max-w-sm md:max-w-none bg-[#fbf7ee] border border-hairline rounded-lg p-7 md:p-9"
                    style={{ boxShadow: '0 1px 0 rgba(255,255,255,0.6) inset, 0 30px 60px -30px rgba(43,58,42,0.28)', scrollMarginTop: '12px' }}
                >
                    {/* Card header */}
                    <div className="mb-5">
                        <h2 className="font-serif text-[26px] font-semibold text-ink tracking-tight">{cardTitle}</h2>
                    </div>

                    {/* Form content */}
                    {renderCard()}
                    {!isSignupTab && activeTab === 'member' && !isEntryStep && (
                        <div className="mt-5 border-t border-hairline pt-4 text-center text-[11px] text-ink/45">
                            <button type="button" onClick={() => { setActiveTab('admin'); clearError(); }} className="underline underline-offset-3">공동체 관리자 로그인</button>
                            <span className="mx-2">·</span>
                            <button type="button" onClick={() => setShowAdminContact(true)} className="underline underline-offset-3">비밀번호 문의</button>
                        </div>
                    )}
                    {!isSignupTab && activeTab === 'admin' && (
                        <button type="button" onClick={() => { setActiveTab('member'); setMemberStep('entry'); clearError(); }} className="mt-5 w-full border-t border-hairline pt-4 text-center text-[11px] text-ink/45 underline underline-offset-3">다른 방법으로 로그인</button>
                    )}
                </div>

            </div>

            {showAdminContact && <AdminContactModal onClose={() => setShowAdminContact(false)} />}

            {showDemoTour && (
                <DemoTour
                    onClose={() => setShowDemoTour(false)}
                    onComplete={() => { setShowDemoTour(false); setShowReadingGuide(true); }}
                />
            )}

            <ReadingGuideModal
                show={showReadingGuide}
                onClose={() => setShowReadingGuide(false)}
            />

            {openPublicPolicyId && (
                <PolicyDialog
                    policy={SERVICE_POLICIES[openPublicPolicyId]}
                    onClose={() => setOpenPublicPolicyId(null)}
                />
            )}

        </div>
    );
};

export default LoginView;
