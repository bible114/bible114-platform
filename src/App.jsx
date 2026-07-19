import React, { Suspense, lazy, useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { db, auth, firebase } from './utils/firebase';
import { DEFAULT_DEPARTMENTS } from './data/departments';
import { BIBLE_VERSIONS } from './data/bible_options';
import { userDocToState, dateToOffset } from './utils/helpers';
import { completeMemberOnboarding } from './utils/platformApi';
import { setMemberPasswordByAdmin } from './utils/adminPassword';
import { calculateSubgroupStats, getWeeklyMVP, formatSubgroupRanking, formatProgressRanking, getAdminStats } from './utils/statsUtils';
import { getSubgroupDisplay } from './utils/dashboardUtils';
import { generateMemosHTML, downloadCSV, downloadPeriodStatsCSV } from './utils/exportUtils';
import { useUserAuth } from './hooks/useUserAuth';
import { useBibleLogic } from './hooks/useBibleLogic';
import { useAuth } from './hooks/useAuth';
import Icon from './components/Icon';
import MarkdownRenderer from './components/MarkdownRenderer';
import LoginView from './components/LoginView';
import PlanSelectionView from './components/PlanSelectionView';
import DashboardView from './components/DashboardView';
import GuestReaderView from './components/GuestReaderView';
import PlatformPopupAd from './components/PlatformPopupAd';
import SocialOnboardingView from './components/SocialOnboardingView';
import { CommunityMembershipCard } from './components/dashboard';
import { getPendingPersonalMigration, migrateChurchMemberToPersonal } from './utils/personalAccountMigration';
import { normalizeOnboardingOrganizations } from './utils/onboardingOrganizations';
import { ToastContainer, useToast } from './components/admin';
import { useTTS } from './hooks/useTTS';
import { ADMIN_ENTRY_SESSION_KEY, UNAFFILIATED_CHURCH_ID } from './data/constants';

const ChurchAdminView = lazy(() => import('./components/ChurchAdminView'));
const PlatformAdminView = lazy(() => import('./components/PlatformAdminView'));

const UNAFFILIATED_FALLBACK_DEPARTMENTS = [{
    id: 'personal',
    name: '개인 성도',
    subgroups: ['성경읽기 동행'],
}];

const needsInitialOnboarding = user => (
    user?.role === 'churchAdmin'
        ? user.onboardingPending === true
        : (!user?.departmentId || typeof user?.subgroupId !== 'string')
);

const AdminLoadingFallback = () => (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center pb-20">
        <p className="text-slate-500 font-bold">관리자 화면 불러오는 중...</p>
    </div>
);

const App = () => {
    /*
     ============================================================================
     5.1 [Hooks] State, Refs & Effects
     ============================================================================
     컴포넌트의 상태와 생명주기를 관리하는 섹션입니다.
    */

    // --- [A] 화면 및 인증 상태 ---
    const [view, setView] = useState('login');
    const [tempUser, setTempUser] = useState(null);
    const [loginInitialTab, setLoginInitialTab] = useState('member');
    const [pendingKakaoAdminSignup, setPendingKakaoAdminSignup] = useState(null);
    const [showSecretShopUnlocked, setShowSecretShopUnlocked] = useState(false);
    const [completionCelebration, setCompletionCelebration] = useState(null);
    // [Phase 3] 교회 전용 링크(?church=ID) — 로그인 화면 교회 preselect용. 최초 마운트 시 1회만 읽는다.
    const [presetChurchId] = useState(() => new URLSearchParams(window.location.search).get('church') || null);
    const { currentUser, setCurrentUser, authLoading, authError, retryAuthCheck } = useUserAuth();
    const [personalOrgNames, setPersonalOrgNames] = useState({});
    // 활동 공동체는 현재 화면에서만 전환한다. primaryOrgId는 다음 로그인의
    // 기본 진입 및 탈퇴 보호 기준이므로 이 상태를 Firestore에 저장하지 않는다.
    const [activeRosterOrgId, setActiveRosterOrgId] = useState(null);
    const personalOrgs = Array.isArray(currentUser?.extraOrgs) ? currentUser.extraOrgs : [];
    const activePersonalOrg = currentUser?.accountType === 'personal'
        ? personalOrgs.find(org => org.orgId === (activeRosterOrgId || currentUser.primaryOrgId))
            || personalOrgs.find(org => org.orgId === currentUser.primaryOrgId)
            || null
        : null;
    const activeAdditionalOrg = currentUser?.accountType !== 'personal' && activeRosterOrgId
        ? personalOrgs.find(org => org.orgId === activeRosterOrgId) || null
        : null;
    const activeRosterOrg = activePersonalOrg || activeAdditionalOrg;
    const dashboardUser = useMemo(() => {
        if (!currentUser) return currentUser;
        if (!activeRosterOrg) {
            return {
                ...currentUser,
                baseChurchId: currentUser.churchId || null,
                baseChurchName: currentUser.churchName || null,
                talentWalletType: 'user',
                talentWalletOrgId: currentUser.churchId || null,
            };
        }
        return {
            ...currentUser,
            baseChurchId: currentUser.churchId || null,
            baseChurchName: currentUser.churchName || null,
            churchId: activeRosterOrg.orgId,
            churchName: personalOrgNames[activeRosterOrg.orgId] || '참여 공동체',
            talent: Number(activeRosterOrg.talent) || 0,
            talentWalletType: 'roster',
            talentWalletOrgId: activeRosterOrg.orgId,
            departmentId: activeRosterOrg.departmentId || null,
            departmentName: activeRosterOrg.departmentName || null,
            subgroupId: activeRosterOrg.subgroupId || null,
            subgroupName: activeRosterOrg.subgroupName || null,
            extraMemberships: Array.isArray(activeRosterOrg.extraMemberships)
                ? activeRosterOrg.extraMemberships
                : [],
        };
    }, [currentUser, activeRosterOrg, personalOrgNames]);

    useEffect(() => {
        setActiveRosterOrgId(null);
    }, [currentUser?.uid]);

    useEffect(() => {
        if (!activeRosterOrgId || !currentUser) return;
        const canViewActiveOrg = activeRosterOrgId === currentUser.churchId
            || personalOrgs.some(org => org.orgId === activeRosterOrgId);
        if (!canViewActiveOrg) setActiveRosterOrgId(null);
    }, [activeRosterOrgId, currentUser?.churchId, personalOrgs.map(org => org.orgId).join('|')]);

    useEffect(() => {
        if (personalOrgs.length === 0) {
            setPersonalOrgNames({});
            return;
        }
        let alive = true;
        Promise.all(personalOrgs.map(async org => {
            try {
                const doc = await db.collection('churches').doc(org.orgId).get();
                return [org.orgId, doc.exists ? (doc.data()?.name || org.orgId) : org.orgId];
            } catch {
                return [org.orgId, org.orgId];
            }
        })).then(entries => { if (alive) setPersonalOrgNames(Object.fromEntries(entries)); });
        return () => { alive = false; };
    }, [currentUser?.uid, personalOrgs.map(org => org.orgId).join('|')]);

    const talentOrganizations = useMemo(() => {
        const rosterWallets = personalOrgs
            .filter(org => currentUser?.accountType === 'personal' || org.orgId !== currentUser?.churchId)
            .map(org => ({
            ...org,
            name: personalOrgNames[org.orgId] || org.orgId,
            walletType: 'roster',
            talent: Number(org.talent) || 0,
            }));
        if (currentUser?.accountType === 'personal' || !currentUser?.churchId) return rosterWallets;
        return [{
            orgId: currentUser.churchId,
            name: currentUser.churchName || currentUser.churchId,
            walletType: 'user',
            talent: Number(currentUser.talent) || 0,
        }, ...rosterWallets];
    }, [currentUser, personalOrgs, personalOrgNames]);
    const adminAuthToasts = useToast();
    const handleReadComplete = useCallback((resultData) => {
        if (typeof window !== 'undefined' && window.refreshKakaoAdBanner) {
            window.refreshKakaoAdBanner();
        }
        if (resultData?.secretShopJustUnlocked) {
            setShowSecretShopUnlocked(true);
        }
        if (resultData?.completedRound) {
            setCompletionCelebration({
                completedRound: Math.max(1, (resultData.newReadCount || 2) - 1),
                newReadCount: resultData.newReadCount || 2,
                talentEarned: resultData.talentEarned,
                quizTalentEarned: resultData.quizTalentEarned,
                totalTalent: resultData.totalTalent,
            });
        }
    }, []);

    const [churchCommunities, setChurchCommunities] = useState([]); // 현재 교회 조직 구성
    const churchCommunitiesRequestRef = useRef(0);

    // Bible Logic Hook (Must be called before useTTS)
    const {
        verseData, setVerseData,
        subgroupStats, setSubgroupStats,
        departmentMembers, setDepartmentMembers,
        allMembersForRace, setAllMembersForRace,
        memos, setMemos, memoLoadError,
        readHistory, setReadHistory,
        announcement, setAnnouncement,
        viewingDay, setViewingDay,
        hasReadToday, setHasReadToday,

        showConfetti, setShowConfetti,
        levelUpToast, setLevelUpToast,
        bonusToast, setBonusToast,
        completionSummary,
        newAchievement, setNewAchievement,
        readSubmitting,

        handleRead,
        saveMemo,
        handleRestart,
        changeStartDate,

        loadMemos,
        loadAnnouncement,
        kakaoLink, loadKakaoLink, setKakaoLink,
        loadAllMembers
    } = useBibleLogic(
        dashboardUser,
        setCurrentUser,
        view,
        churchCommunities,
        handleReadComplete
    );
    const [showMonthlyContestInfo, setShowMonthlyContestInfo] = useState(false); // 월간 대항전 설명 모달
    const [rankingCommunityFilter, setRankingCommunityFilter] = useState('all'); // 누적 랭킹 대그룹 필터
    const [rankingSubgroupFilter, setRankingSubgroupFilter] = useState('all'); // 누적 랭킹 소그룹 필터

    // --- UI Toggle States ---
    const [showScoreInfo, setShowScoreInfo] = useState(false);
    const [showReadingGuide, setShowReadingGuide] = useState(false);
    const [showMemoList, setShowMemoList] = useState(false);
    const [showAchievements, setShowAchievements] = useState(false);
    const [showCalendar, setShowCalendar] = useState(false);
    const [showFullRanking, setShowFullRanking] = useState(false);
    const [showDateSettings, setShowDateSettings] = useState(false);
    const [showRestartConfirm, setShowRestartConfirm] = useState(false);
    const [selectedSubgroupDetail, setSelectedSubgroupDetail] = useState(null);
    const [calendarDate, setCalendarDate] = useState(new Date());
    const [dateSettingsDate, setDateSettingsDate] = useState(new Date());
    const [currentMemo, setCurrentMemo] = useState('');

    const resetReaderSessionState = useCallback(() => {
        setCurrentMemo('');
        setMemos({});
        setViewingDay(null);
        setReadHistory([]);
    }, [setMemos, setViewingDay, setReadHistory]);

    // --- 관리자 관련 상태 ---
    const [selectedPlanType, setSelectedPlanType] = useState(null); // 선택된 플랜 타입

    // --- [Hooks] Extract Logic ---
    const {
        isSpeaking, isPaused, ttsSpeed, availableVoices, selectedVoiceURI, activeChunkIndex,
        ttsError, clearTtsError,
        ttsUnavailableApp,
        handleSpeedChange, handleTogglePause, handleStop, handleSpeak, jumpToChunk,
        setSelectedVoiceURI
    } = useTTS(verseData.text);

    const [allUsers, setAllUsers] = useState([]);             // 전체 사용자 목록 (관리자용)
    const [allChurches, setAllChurches] = useState([]);       // 전체 교회 목록 (슈퍼관리자용)

    const [editingUser, setEditingUser] = useState(null);     // 편집 중인 사용자
    const [changingPassword, setChangingPassword] = useState(null); // 비밀번호 변경 대상
    const memberOnboardingRequestRef = useRef(null);
    const [newPassword, setNewPassword] = useState('');       // 새 비밀번호
    const [adminSortBy, setAdminSortBy] = useState('name'); // 'name', 'day', 'score', 'subgroup'
    const [kakaoLinkInput, setKakaoLinkInput] = useState(''); // 카카오 링크 입력
    const [fontSize, setFontSize] = useState(() => {
        const saved = localStorage.getItem('bible_fontSize');
        return saved ? parseInt(saved, 10) : 16; // 기본값 16px
    });

    // 인앱 브라우저 감지 (네이버 등)
    const [isInAppBrowser, setIsInAppBrowser] = useState(false);
    useEffect(() => {
        const ua = navigator.userAgent;
        if (ua.indexOf('NAVER') > -1 || ua.indexOf('KAKAOTALK') > -1) {
            setIsInAppBrowser(true);
        }
    }, []);

    // ★ Auth Side Effects (Navigation & Data Sync)
    useEffect(() => {
        if (authLoading) return;

        if (currentUser) {
            if (currentUser.role === 'guest') {
                if (view !== 'guest') setView('guest');
                return;
            }
            if (view === 'login') {
                if (currentUser.role === 'superAdmin' || currentUser.role === 'platformAdmin') {
                    loadSuperAdminData({ expectedUid: currentUser.uid }).catch(error => {
                        if (auth.currentUser?.uid === currentUser.uid) {
                            console.error('슈퍼 관리자 데이터 로드 실패:', error);
                        }
                    });
                } else if (currentUser.role === 'churchAdmin') {
                    if (needsInitialOnboarding(currentUser)) {
                        if (currentUser.churchId) {
                            loadChurchCommunities(currentUser.churchId, { requireServer: true });
                        }
                        setTempUser(currentUser);
                        setView('plan_type_select');
                    } else {
                        // 공동체 관리자는 로그인하면 성도와 같은 읽기 화면이 기본이다.
                        // 단, 관리 화면에서 새로고침한 경우에만 같은 화면을 복원한다.
                        if (dashboardUser?.churchId) loadChurchCommunities(dashboardUser.churchId);
                        const savedAdminEntry = sessionStorage.getItem(ADMIN_ENTRY_SESSION_KEY);
                        setView(savedAdminEntry === 'church_admin' ? 'church_admin' : 'dashboard');
                    }
                } else {
                    if (currentUser.accountType === 'personal' && currentUser.planId) {
                        if (dashboardUser?.churchId) loadChurchCommunities(dashboardUser.churchId);
                        setView('dashboard');
                    } else if (!needsInitialOnboarding(currentUser)) {
                        if (dashboardUser?.churchId) loadChurchCommunities(dashboardUser.churchId);
                        setView('dashboard');
                    } else {
                        if (currentUser.churchId) {
                            loadChurchCommunities(currentUser.churchId, { requireServer: true });
                        }
                        setTempUser(currentUser);
                        setView('plan_type_select');
                    }
                }
            }
        } else {
            if (view === 'social_onboarding' && tempUser?.uid) return;
            resetReaderSessionState();
            if (view !== 'login') setView('login');
        }
    }, [currentUser, authLoading, resetReaderSessionState, view, tempUser?.uid]);

    // 관리자가 읽기/관리 화면을 오가면 현재 화면을 세션 기준으로 갱신한다.
    // 그래야 관리 화면에서 새로고침해도 읽기 화면으로 튕기지 않는다.
    useEffect(() => {
        if (currentUser?.role !== 'churchAdmin') return;
        if (!['dashboard', 'church_admin'].includes(view)) return;
        sessionStorage.setItem(ADMIN_ENTRY_SESSION_KEY, view);
    }, [currentUser?.role, view]);

    // getLevelInfo는 data/levels에서 import됨










    const saveKakaoLink = async (churchId) => {
        if (!db || !churchId) return;
        try {
            await db.collection('churches').doc(churchId).collection('settings').doc('kakao').set({
                url: kakaoLinkInput,
                updatedAt: firebase.firestore.FieldValue.serverTimestamp()
            });
            setKakaoLink(kakaoLinkInput);
            alert('카카오 링크가 저장되었습니다!');
        } catch (e) {
            console.error("카카오 링크 저장 실패:", e);
            alert('저장 실패');
        }
    };

















    const deleteUser = async (uid, userName) => {
        try {
            await db.collection('users').doc(uid).set({
                isDeleted: true,
                deletedAt: firebase.firestore.FieldValue.serverTimestamp(),
                deletedBy: currentUser?.uid || null,
                updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
            }, { merge: true });
            setAllUsers(prev => prev.map(u => u.uid === uid ? { ...u, isDeleted: true } : u));
            alert(`✅ ${userName}님이 삭제 처리되었습니다.`);
        } catch (e) { console.error(e); alert('삭제 실패: ' + e.message); }
    };

    const changePassword = async (uid, userName, currentPassword) => {
        if (!newPassword || newPassword.length < 6) {
            alert('새 암호는 6자리 이상이어야 합니다.');
            return;
        }

        if (!confirm(`${userName}님의 암호를 변경하시겠습니까?\n\n새 암호: ${newPassword}`)) {
            return;
        }

        try {
            await setMemberPasswordByAdmin(uid, newPassword);
            alert(`✅ ${userName}님의 실제 로그인 비밀번호가 변경되었습니다.\n\n새 암호: ${newPassword}\n\n※ 사용자에게 새 암호를 전달해주세요.`);

            // 사용자 목록 업데이트
            setAllUsers(prev => prev.map(u =>
                u.uid === uid ? { ...u, password: newPassword } : u
            ));

            setChangingPassword(null);
            setNewPassword('');
        } catch (e) {
            console.error(e);
            alert('암호 변경 실패');
        }
    };

    const startEditUser = (user) => setEditingUser({ ...user });

    const saveEditUser = async () => {
        if (!editingUser) return;
        try {
            const userRef = db.collection('users').doc(editingUser.uid);
            const committed = await db.runTransaction(async transaction => {
                // allUsers는 화면 캐시일 뿐이다. 모달이 열린 뒤 member가 관리자로 승격되거나
                // 개인 계정으로 전환될 수 있으므로 쓰기와 같은 transaction에서 최신 정체성을 읽는다.
                const latestDoc = await transaction.get(userRef);
                if (!latestDoc.exists) {
                    const error = new Error('최신 회원 정보를 확인할 수 없습니다.');
                    error.code = 'EDIT_USER_NOT_FOUND';
                    throw error;
                }
                const latestUser = latestDoc.data();
                const churchIdentityChanged = String(latestUser.churchId || '') !== String(editingUser.churchId || '')
                    || String(latestUser.churchName || '') !== String(editingUser.churchName || '');
                if (latestUser.role !== 'member' && churchIdentityChanged) {
                    const error = new Error('관리자 계정의 소속 교회는 이 화면에서 변경할 수 없습니다.');
                    error.code = 'EDIT_ADMIN_IDENTITY_CONFLICT';
                    throw error;
                }

                // 최신 문서가 여전히 일반 공동체 member일 때만 조직 payload를 허용한다.
                // 동시 member→admin 승격이나 personal 전환 뒤에는 stale 모달의 조직값을 쓰지 않는다.
                const canEditMemberOrganization = latestUser.role === 'member'
                    && latestUser.accountType !== 'personal';
                const updateData = {
                    ...(canEditMemberOrganization ? {
                        churchId: editingUser.churchId,
                        churchName: editingUser.churchName,
                        departmentId: editingUser.departmentId,
                        departmentName: editingUser.departmentName,
                        subgroupId: editingUser.subgroupId,
                        subgroupName: editingUser.subgroupName || null,
                    } : {}),
                    planId: editingUser.planId,
                    currentDay: editingUser.currentDay,
                    readCount: editingUser.readCount || 1,
                    score: editingUser.score,
                    streak: editingUser.streak,
                    lastReadDate: editingUser.lastReadDate || null,
                    updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
                };
                transaction.set(userRef, updateData, { merge: true });
                const { updatedAt: _serverTimestamp, ...localUpdateData } = updateData;
                return { latestUser, localUpdateData };
            });
            setAllUsers(prev => prev.map(u => u.uid === editingUser.uid
                ? { ...u, ...committed.latestUser, ...committed.localUpdateData }
                : u));
            setEditingUser(null); alert("수정되었습니다.");
        } catch (e) {
            console.error(e);
            if (e?.code === 'EDIT_ADMIN_IDENTITY_CONFLICT') {
                alert('관리자 계정의 소속 교회는 이 화면에서 변경할 수 없습니다. 정식 관리자 위임 절차를 이용해주세요.');
            } else if (e?.code === 'EDIT_USER_NOT_FOUND') {
                alert('최신 회원 정보를 확인할 수 없습니다. 목록을 새로고침한 뒤 다시 시도해주세요.');
            } else {
                alert("수정 실패");
            }
        }
    };

    /*
     ============================================================================
     5.3 [Logic] Auth & User Management
     ============================================================================
     회원가입, 로그인, 로그아웃 등 사용자 인증 관련 비즈니스 로직입니다.
    */

    const loadChurchCommunities = async (churchId, { requireServer = false } = {}) => {
        const requestId = ++churchCommunitiesRequestRef.current;
        setChurchCommunities([]);
        if (!churchId) return;
        try {
            const churchRef = db.collection('churches').doc(churchId);
            const doc = requireServer
                ? await churchRef.get({ source: 'server' })
                : await churchRef.get();
            if (churchCommunitiesRequestRef.current !== requestId) return;
            const data = doc.exists ? (doc.data() || {}) : {};
            const storedDepartments = Array.isArray(data.departments)
                ? data.departments
                : (Array.isArray(data.communities) ? data.communities : []);
            const sourceDepartments = doc.exists
                ? storedDepartments
                : (churchId === UNAFFILIATED_CHURCH_ID
                    ? UNAFFILIATED_FALLBACK_DEPARTMENTS
                    : []);
            setChurchCommunities(normalizeOnboardingOrganizations(sourceDepartments));
        } catch (e) {
            if (churchCommunitiesRequestRef.current !== requestId) return;
            setChurchCommunities(churchId === UNAFFILIATED_CHURCH_ID
                ? normalizeOnboardingOrganizations(UNAFFILIATED_FALLBACK_DEPARTMENTS)
                : []);
            console.error(e);
        }
    };

    useEffect(() => {
        if (view !== 'dashboard') return;
        if (dashboardUser?.churchId) loadChurchCommunities(dashboardUser.churchId);
        else loadChurchCommunities(null);
    }, [view, dashboardUser?.churchId]);

    const loadSuperAdminData = async ({ expectedUid = null } = {}) => {
        if (expectedUid && auth.currentUser?.uid !== expectedUid) return false;
        const [usersSnap, churchesSnap] = await Promise.all([
            db.collection('users').get(),
            db.collection('churches').get(),
        ]);
        if (expectedUid && auth.currentUser?.uid !== expectedUid) return false;
        const churches = await Promise.all(churchesSnap.docs.map(async doc => {
            const church = { id: doc.id, ...doc.data() };
            try {
                const adminDoc = await doc.ref.collection('private').doc('admin').get();
                return adminDoc.exists ? { ...church, ...adminDoc.data() } : church;
            } catch (error) {
                console.error('교회 관리자 비공개 정보 로드 실패:', doc.id, error);
                return church;
            }
        }));
        if (expectedUid && auth.currentUser?.uid !== expectedUid) return false;
        setAllUsers(usersSnap.docs.map(doc => userDocToState(doc)).filter(u => !u.isDeleted));
        // 기존 본문서 adminEmail/adminUid 값은 church에 남아 있어 자동 폴백된다.
        setAllChurches(churches.filter(c => !c.isDeleted));
        return true;
    };

    const {
        errorMsg,
        setErrorMsg,
        handleMemberLogin,
        handleMemberSignup,
        handlePersonalSignup,
        handleGooglePersonalSignup,
        handleKakaoStart,
        handleGoogleLink,
        handleKakaoLinkStart,
        handleLegacySocialRecovery,
        socialLinkNotice,
        setSocialLinkNotice,
        handleSocialOnboardingComplete,
        handleChurchAdminLogin,
        handleChurchAdminSignup,
        handleGoogleAdminLogin,
        handleGoogleAdminSignupStart,
        handleKakaoAdminSignupStart,
        cancelGoogleAdminSignup,
    } = useAuth({
        setCurrentUser,
        setTempUser,
        setView,
        setHasReadToday,
        setChurchCommunities,
        loadChurchCommunities,
        loadSuperAdminData,
        onAdminProviderNotice: adminAuthToasts.info,
        onKakaoAdminSignupReady: profile => {
            setPendingKakaoAdminSignup(profile || null);
            if (profile) {
                setLoginInitialTab('adminSignup');
                setView('login');
            }
        },
    });

    const handlePlanTypeSelect = (typeId) => { setSelectedPlanType(typeId); setView('bible_version_select'); };

    const handleVersionSelect = async (versionId) => {
        const versionInfo = (BIBLE_VERSIONS[selectedPlanType] || []).find(v => v.id === versionId);
        if (!versionInfo) {
            alert('이 성경 버전은 현재 사용할 수 없습니다.');
            return;
        }
        const fullPlanId = `${selectedPlanType}_${versionId}`;
        if (tempUser) {
            setTempUser(prev => ({ ...prev, planId: fullPlanId }));
            setView(tempUser.accountType === 'personal' ? 'personal_community_onboarding' : 'community_select');
        }
        else if (currentUser) {
            const updatedUser = { ...currentUser, planId: fullPlanId };
            setCurrentUser(updatedUser);
            try {
                const uid = auth.currentUser ? auth.currentUser.uid : null;
                if (uid) await db.collection('users').doc(uid).set({ planId: fullPlanId, updatedAt: firebase.firestore.FieldValue.serverTimestamp() }, { merge: true });
            } catch (e) { console.error(e); }
            setView('dashboard');
            setShowConfetti(true); setTimeout(() => setShowConfetti(false), 2000);
        }
    };

    const handleCommunitySelect = (commId, commName) => { setTempUser(prev => ({ ...prev, departmentId: commId, departmentName: commName })); setView('subgroup_select'); };

    const handleSubgroupSelect = async (subgroup) => {
        // Support both legacy string and new { id, name } object
        const subgroupId = typeof subgroup === 'string'
            ? subgroup
            : (subgroup?.id || subgroup?.name || '');
        const requestUser = tempUser;
        const requestUid = requestUser?.uid;
        const orgId = requestUser?.churchId;
        const planId = requestUser?.planId;
        const departmentId = requestUser?.departmentId;
        if (!requestUid || auth.currentUser?.uid !== requestUid
            || memberOnboardingRequestRef.current) return;
        memberOnboardingRequestRef.current = requestUid;
        try {
            const response = await completeMemberOnboarding({
                orgId,
                planId,
                departmentId,
                subgroupId,
            }, { expectedUid: requestUid });
            if (auth.currentUser?.uid !== requestUid) return;
            const userSnap = await db.collection('users').doc(requestUid).get({ source: 'server' });
            if (auth.currentUser?.uid !== requestUid || !userSnap.exists) {
                throw new Error('MEMBER_ONBOARDING_AUTH_CHANGED');
            }
            const stored = userSnap.data() || {};
            const membership = response.result;
            if (stored.isDeleted === true
                || stored.planId !== membership.planId
                || stored.churchId !== membership.orgId
                || stored.departmentId !== membership.departmentId
                || stored.departmentName !== membership.departmentName
                || stored.subgroupId !== membership.subgroupId
                || stored.subgroupName !== membership.subgroupName
                || (requestUser.role === 'churchAdmin' && stored.onboardingPending !== false)) {
                throw new Error('MEMBER_ONBOARDING_STATE_INVALID');
            }
            const runtimeExtraOrgs = Array.isArray(requestUser.extraOrgs)
                ? requestUser.extraOrgs
                : [];
            const canonicalUser = userDocToState(userSnap);
            setCurrentUser({ ...canonicalUser, extraOrgs: runtimeExtraOrgs });
            setTempUser(null);
            setView(canonicalUser.role === 'churchAdmin' ? 'admin_signup_complete' : 'dashboard');
        } catch (e) {
            console.error('최초 플랜·소속 설정 실패:', e);
            alert('플랜과 소속을 저장하지 못했습니다. 잠시 후 다시 시도해주세요.');
        } finally {
            if (memberOnboardingRequestRef.current === requestUid) {
                memberOnboardingRequestRef.current = null;
            }
        }
    };

    const finishPersonalOnboarding = async (runtimeOrg = null) => {
        if (!tempUser?.uid || auth.currentUser?.uid !== tempUser.uid) return;
        const nextUser = {
            ...tempUser,
            primaryOrgId: runtimeOrg?.orgId || null,
            extraOrgs: runtimeOrg ? [runtimeOrg] : [],
        };
        try {
            if (!runtimeOrg) {
                await db.collection('users').doc(tempUser.uid).set({
                    planId: tempUser.planId,
                    primaryOrgId: null,
                    updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
                }, { merge: true });
            }
        } catch (error) {
            console.error('개인 계정 온보딩 저장 실패:', error);
            alert('설정을 저장하지 못했습니다. 잠시 후 다시 시도해주세요.');
            return;
        }
        setCurrentUser(nextUser);
        setTempUser(null);
        setView('dashboard');
    };

    const handlePrimaryOrgChange = async (orgId) => {
        if (currentUser?.accountType !== 'personal' || auth.currentUser?.uid !== currentUser.uid) return;
        const target = personalOrgs.find(org => org.orgId === orgId);
        if (!target || orgId === currentUser.primaryOrgId) return;
        const activeOrgBeforeChange = dashboardUser?.churchId || null;
        try {
            await db.collection('users').doc(currentUser.uid).set({
                primaryOrgId: orgId,
                updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
            }, { merge: true });
            setCurrentUser(user => user?.uid === currentUser.uid ? { ...user, primaryOrgId: orgId } : user);
            // 기본 공동체 변경은 현재 활동 공간 이동과 별개다. 보고 있던 공동체가
            // 새 기본이면 null로 정규화하고, 아니면 명시 선택으로 유지한다.
            setActiveRosterOrgId(activeOrgBeforeChange === orgId ? null : activeOrgBeforeChange);
        } catch (error) {
            console.error('기준 공동체 변경 실패:', error);
            alert('공동체를 바꾸지 못했습니다. 잠시 후 다시 시도해주세요.');
        }
    };

    const handleActiveOrgChange = orgId => {
        if (!currentUser || !orgId || orgId === dashboardUser?.churchId) return;
        if (currentUser.accountType === 'personal') {
            if (!personalOrgs.some(org => org.orgId === orgId)) return;
            setActiveRosterOrgId(orgId === currentUser.primaryOrgId ? null : orgId);
            return;
        }
        if (orgId === currentUser.churchId) {
            setActiveRosterOrgId(null);
            return;
        }
        if (personalOrgs.some(org => org.orgId === orgId)) setActiveRosterOrgId(orgId);
    };

    const handlePersonalAccountMigrate = async (phone4) => {
        if (!currentUser) return;
        try {
            const migratedUser = await migrateChurchMemberToPersonal({ currentUser, phone4 });
            setCurrentUser(migratedUser);
            alert("전환 완료! 다음 로그인은 카카오·구글 → '기존 진도·달란트 이어보기' → '소속 교회 없이 혼자 읽었어요' 순서로 연결해주세요.");
        } catch (error) {
            console.error('개인 계정 전환 실패:', error);
            alert(error?.message || '전환을 완료하지 못했습니다. 잠시 후 다시 시도해주세요.');
        }
    };

    useEffect(() => {
        if (!currentUser?.uid) return;
        const pending = getPendingPersonalMigration(currentUser.uid);
        if (!pending?.phone4) return;
        handlePersonalAccountMigrate(pending.phone4);
    }, [currentUser?.uid, currentUser?.accountType]);

    const handleLogout = () => {
        if (auth) auth.signOut();
        sessionStorage.removeItem(ADMIN_ENTRY_SESSION_KEY);
        resetReaderSessionState();
        setCurrentUser(null); setTempUser(null); setChurchCommunities([]);
        setAllUsers([]); setAllChurches([]);
        setPendingKakaoAdminSignup(null);
        setLoginInitialTab('member');
        setErrorMsg(''); setView('login'); setHasReadToday(false); setEditingUser(null); setDepartmentMembers([]);
    };

    const handleGuestSignupStart = () => {
        setLoginInitialTab('member');
        if (auth) auth.signOut();
        resetReaderSessionState();
        setCurrentUser(null); setTempUser(null); setChurchCommunities([]);
        setPendingKakaoAdminSignup(null);
        setErrorMsg(''); setView('login'); setHasReadToday(false); setEditingUser(null); setDepartmentMembers([]);
    };

    const handleChangeVersionStart = () => { setSelectedPlanType(null); setTempUser(null); setView('plan_type_select'); };

    /*
     ============================================================================
     5.6 [View] Rendering Screens
     ============================================================================
     현재 상태에 따라 서로 다른 화면(로그인, 대시보드, 관리자 등)을 렌더링합니다.
    */

    // 인증 상태 확인 중일 때 로딩 화면
    if (authLoading) {
        return (
            <>
                <div className="min-h-screen bg-slate-50 flex items-center justify-center pb-20">
                    <div className="text-center">
                        <div className="text-5xl mb-4 animate-bounce">🏃‍♂️</div>
                        <p className="text-slate-500 font-bold">로그인 확인 중...</p>
                    </div>
                </div>
            </>
        );
    }

    if (authError) {
        return (
            <div className="min-h-screen bg-slate-50 flex items-center justify-center px-5 pb-20">
                <div className="w-full max-w-sm rounded-2xl bg-white p-6 text-center shadow-sm border border-slate-100">
                    <div className="text-4xl mb-4">⚠️</div>
                    <h1 className="text-lg font-bold text-slate-900 mb-2">로그인 확인이 잠시 멈췄습니다</h1>
                    <p className="text-sm leading-6 text-slate-600 mb-5">{authError}</p>
                    <button
                        type="button"
                        onClick={retryAuthCheck}
                        className="w-full rounded-xl bg-slate-900 px-4 py-3 text-sm font-bold text-white active:scale-[0.99]"
                    >
                        다시 확인하기
                    </button>
                    <button
                        type="button"
                        onClick={() => window.location.reload()}
                        className="mt-3 w-full rounded-xl border border-slate-200 px-4 py-3 text-sm font-bold text-slate-600 active:scale-[0.99]"
                    >
                        새로고침
                    </button>
                </div>
            </div>
        );
    }

    if (currentUser?.role === 'superAdmin' || currentUser?.role === 'platformAdmin') {
        return (
            <Suspense fallback={<AdminLoadingFallback />}>
                <PlatformAdminView
                    currentUser={currentUser}
                    handleLogout={handleLogout}
                    downloadCSV={downloadCSV}
                    adminSortBy={adminSortBy}
                    setAdminSortBy={setAdminSortBy}
                    allUsers={allUsers}
                    allChurches={allChurches}
                    DEFAULT_DEPARTMENTS={DEFAULT_DEPARTMENTS}
                    BIBLE_VERSIONS={BIBLE_VERSIONS}
                    editingUser={editingUser}
                    setEditingUser={setEditingUser}
                    startEditUser={startEditUser}
                    saveEditUser={saveEditUser}
                    changingPassword={changingPassword}
                    setChangingPassword={setChangingPassword}
                    newPassword={newPassword}
                    setNewPassword={setNewPassword}
                    changePassword={changePassword}
                    deleteUser={deleteUser}
                    adminStats={getAdminStats(allUsers)}
                    kakaoLinkInput={kakaoLinkInput}
                    setKakaoLinkInput={setKakaoLinkInput}
                    saveKakaoLink={saveKakaoLink}
                    downloadPeriodStatsCSV={downloadPeriodStatsCSV}
                    db={db}
                />
                <ToastContainer toasts={adminAuthToasts.toasts} onClose={adminAuthToasts.removeToast} />
            </Suspense>
        );
    }

    let pageContent = null;

    if (view === 'login') {
        pageContent = (
            <LoginView
                onMemberLogin={handleMemberLogin}
                onChurchAdminLogin={handleChurchAdminLogin}
                onGoogleAdminLogin={handleGoogleAdminLogin}
                onGoogleAdminSignupStart={handleGoogleAdminSignupStart}
                onKakaoAdminSignupStart={handleKakaoAdminSignupStart}
                onGoogleAdminSignupCancel={cancelGoogleAdminSignup}
                initialKakaoAdminSignup={pendingKakaoAdminSignup}
                onMemberSignup={handleMemberSignup}
                onPersonalSignup={handlePersonalSignup}
                onGooglePersonalSignup={handleGooglePersonalSignup}
                onKakaoStart={handleKakaoStart}
                onChurchAdminSignup={handleChurchAdminSignup}
                errorMsg={errorMsg}
                setErrorMsg={setErrorMsg}
                presetChurchId={presetChurchId}
                initialTab={loginInitialTab}
            />
        );
    } else if (view === 'social_onboarding' && tempUser?.uid) {
        pageContent = <SocialOnboardingView tempUser={tempUser} onComplete={handleSocialOnboardingComplete} onLegacyLink={handleLegacySocialRecovery} />;
    } else if (view === 'personal_community_onboarding' && tempUser?.accountType === 'personal') {
        pageContent = (
            <div className="min-h-screen bg-slate-50 p-6 flex items-center justify-center" style={{ paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 72px)' }}>
                <CommunityMembershipCard currentUser={tempUser} setCurrentUser={setTempUser} onboarding onJoinComplete={finishPersonalOnboarding} onSkip={() => finishPersonalOnboarding()} />
            </div>
        );
    } else if (['plan_type_select', 'bible_version_select', 'community_select', 'subgroup_select'].includes(view)) {
        pageContent = (
            <PlanSelectionView
                view={view}
                currentUser={dashboardUser}
                tempUser={tempUser}
                setView={setView}
                selectedPlanType={selectedPlanType}
                handlePlanTypeSelect={handlePlanTypeSelect}
                handleVersionSelect={handleVersionSelect}
                handleCommunitySelect={handleCommunitySelect}
                handleSubgroupSelect={handleSubgroupSelect}
                churchCommunities={churchCommunities}
            />
        );
    } else if (view === 'admin_signup_complete' && currentUser?.role === 'churchAdmin') {
        pageContent = (
            <div className="min-h-screen bg-slate-50 px-5 py-12 flex items-center justify-center">
                <section className="w-full max-w-md rounded-3xl bg-white p-7 text-center shadow-xl border border-emerald-100">
                    <div className="text-5xl">🎉</div>
                    <h1 className="mt-4 text-2xl font-black text-slate-900">공동체 등록 완료!</h1>
                    <p className="mt-3 text-base font-bold leading-relaxed text-slate-700">이제 성도들에게 알려주세요.</p>
                    <div className="mt-4 rounded-2xl bg-emerald-50 px-4 py-4 text-left text-sm font-bold leading-7 text-emerald-900">
                        관리 화면 → 설정 탭 → 성도용 로그인·가입 안내문 인쇄(QR)
                    </div>
                    <button type="button" onClick={() => setView('church_admin')} className="mt-6 w-full rounded-2xl bg-indigo-600 px-5 py-4 text-base font-black text-white">관리 화면 열기 →</button>
                </section>
            </div>
        );
    } else if (view === 'dashboard' && currentUser) {
        pageContent = (
            <DashboardView
                currentUser={dashboardUser}
                setCurrentUser={setCurrentUser}
                departmentMembers={departmentMembers}
                allMembersForRace={allMembersForRace}
                memos={memos}
                memoLoadError={memoLoadError}
                currentMemo={currentMemo}
                setCurrentMemo={setCurrentMemo}
                readHistory={readHistory}
                announcement={announcement}
                kakaoLink={kakaoLink}
                verseData={verseData}
                hasReadToday={hasReadToday}
                viewingDay={viewingDay}
                setViewingDay={setViewingDay}
                fontSize={fontSize}
                setFontSize={setFontSize}
                isSpeaking={isSpeaking}
                isPaused={isPaused}
                handleTogglePause={handleTogglePause}
                ttsSpeed={ttsSpeed}
                handleSpeedChange={handleSpeedChange}
                handleStop={handleStop}
                handleSpeak={handleSpeak}
                availableVoices={availableVoices}
                selectedVoiceURI={selectedVoiceURI}
                setSelectedVoiceURI={setSelectedVoiceURI}
                activeChunkIndex={activeChunkIndex}
                ttsError={ttsError}
                clearTtsError={clearTtsError}
                jumpToChunk={jumpToChunk}
                ttsUnavailableApp={ttsUnavailableApp}
                readSubmitting={readSubmitting}
                handleRead={handleRead}
                saveMemo={saveMemo}
                handleLogout={handleLogout}
                handleChangeVersionStart={handleChangeVersionStart}
                handleRestart={handleRestart}
                changeStartDate={changeStartDate}
                dateToOffset={dateToOffset}
                showConfetti={showConfetti}
                levelUpToast={levelUpToast}
                bonusToast={bonusToast}
                completionSummary={completionSummary}
                newAchievement={newAchievement}
                showScoreInfo={showScoreInfo} setShowScoreInfo={setShowScoreInfo}
                showReadingGuide={showReadingGuide} setShowReadingGuide={setShowReadingGuide}
                showMemoList={showMemoList} setShowMemoList={setShowMemoList}
                showAchievements={showAchievements} setShowAchievements={setShowAchievements}
                showCalendar={showCalendar} setShowCalendar={setShowCalendar}
                showFullRanking={showFullRanking} setShowFullRanking={setShowFullRanking}
                showDateSettings={showDateSettings} setShowDateSettings={setShowDateSettings}
                showRestartConfirm={showRestartConfirm} setShowRestartConfirm={setShowRestartConfirm}
                showMonthlyContestInfo={showMonthlyContestInfo} setShowMonthlyContestInfo={setShowMonthlyContestInfo}
                calendarDate={calendarDate} setCalendarDate={setCalendarDate}
                dateSettingsDate={dateSettingsDate} setDateSettingsDate={setDateSettingsDate}
                rankingCommunityFilter={rankingCommunityFilter} setRankingCommunityFilter={setRankingCommunityFilter}
                selectedSubgroupDetail={selectedSubgroupDetail} setSelectedSubgroupDetail={setSelectedSubgroupDetail}
                getSubgroupRanking={() => formatSubgroupRanking(subgroupStats)}
                getProgressRanking={() => formatProgressRanking(subgroupStats)}
                getSubgroupDisplay={getSubgroupDisplay}
                generateMemosHTML={generateMemosHTML}
                getWeeklyMVP={() => getWeeklyMVP(departmentMembers)}
                setView={setView}
                isChurchAdmin={currentUser?.role === 'churchAdmin'}
                churchCommunities={churchCommunities}
                showSecretShopUnlocked={showSecretShopUnlocked}
                setShowSecretShopUnlocked={setShowSecretShopUnlocked}
                completionCelebration={completionCelebration}
                setCompletionCelebration={setCompletionCelebration}
                socialLinkNotice={socialLinkNotice}
                onSocialLinkNoticeClear={() => setSocialLinkNotice(null)}
                onGoogleLink={handleGoogleLink}
                onKakaoLink={handleKakaoLinkStart}
                personalOrganizations={personalOrgs.map(org => ({ ...org, name: personalOrgNames[org.orgId] || org.orgId }))}
                talentOrganizations={talentOrganizations}
                onPrimaryOrgChange={handlePrimaryOrgChange}
                onActiveOrgChange={handleActiveOrgChange}
                onPersonalAccountMigrate={handlePersonalAccountMigrate}
            />
        );
    } else if (view === 'guest' && currentUser?.role === 'guest') {
        pageContent = (
            <GuestReaderView
                currentUser={currentUser}
                setCurrentUser={setCurrentUser}
                handleLogout={handleLogout}
                onSignupClick={handleGuestSignupStart}
            />
        );
    } else if (view === 'church_admin' && currentUser?.role === 'churchAdmin') {
        pageContent = (
            <Suspense fallback={<AdminLoadingFallback />}>
                <ChurchAdminView
                    currentUser={currentUser}
                    handleLogout={handleLogout}
                    onBack={() => setView('dashboard')}
                />
            </Suspense>
        );
    }

    return (
        <>
            {pageContent}
            {/* 플랫폼 팝업 광고 — 성경 읽기 화면(회원·게스트)에서 모두에게 표시 */}
            {((view === 'dashboard' && currentUser) || (view === 'guest' && currentUser?.role === 'guest')) && <PlatformPopupAd />}
            <ToastContainer toasts={adminAuthToasts.toasts} onClose={adminAuthToasts.removeToast} />
        </>
    );
};



export default App;
