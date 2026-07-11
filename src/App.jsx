import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { db, auth, firebase } from './utils/firebase';
import { DEFAULT_DEPARTMENTS } from './data/departments';
import { BIBLE_VERSIONS, isBibleVersionVisibleForUser } from './data/bible_options';
import { userDocToState, dateToOffset } from './utils/helpers';
import { writeMemberCredentials } from './utils/memberCredentials';
import ChurchAdminView from './components/ChurchAdminView';
import { calculateSubgroupStats, getWeeklyMVP, formatSubgroupRanking, formatProgressRanking, getAdminStats } from './utils/statsUtils';
import { getSubgroupDisplay } from './utils/dashboardUtils';
import { generateMemosHTML, downloadCSV, downloadPeriodStatsCSV } from './utils/exportUtils';
import { useUserAuth } from './hooks/useUserAuth';
import { useBibleLogic } from './hooks/useBibleLogic';
import { useAuth } from './hooks/useAuth';
import Icon from './components/Icon';
import MarkdownRenderer from './components/MarkdownRenderer';
import LoginView from './components/LoginView';
import PlatformAdminView from './components/PlatformAdminView';
import PlanSelectionView from './components/PlanSelectionView';
import DashboardView from './components/DashboardView';
import GuestReaderView from './components/GuestReaderView';
import { CommunityMembershipCard } from './components/dashboard';
import { getPendingPersonalMigration, migrateChurchMemberToPersonal } from './utils/personalAccountMigration';
import { ToastContainer, useToast } from './components/admin';
import { useTTS } from './hooks/useTTS';


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
    const [showSecretShopUnlocked, setShowSecretShopUnlocked] = useState(false);
    const [completionCelebration, setCompletionCelebration] = useState(null);
    // [Phase 3] 교회 전용 링크(?church=ID) — 로그인 화면 교회 preselect용. 최초 마운트 시 1회만 읽는다.
    const [presetChurchId] = useState(() => new URLSearchParams(window.location.search).get('church') || null);
    const { currentUser, setCurrentUser, authLoading, authError, retryAuthCheck } = useUserAuth();
    const [personalOrgNames, setPersonalOrgNames] = useState({});
    const personalOrgs = Array.isArray(currentUser?.extraOrgs) ? currentUser.extraOrgs : [];
    const activePersonalOrg = currentUser?.accountType === 'personal'
        ? personalOrgs.find(org => org.orgId === currentUser.primaryOrgId) || null
        : null;
    const dashboardUser = useMemo(() => {
        if (currentUser?.accountType !== 'personal' || !activePersonalOrg) return currentUser;
        return {
            ...currentUser,
            churchId: activePersonalOrg.orgId,
            churchName: personalOrgNames[activePersonalOrg.orgId] || '참여 공동체',
            departmentId: activePersonalOrg.departmentId || null,
            departmentName: activePersonalOrg.departmentName || null,
            subgroupId: activePersonalOrg.subgroupId || null,
            subgroupName: activePersonalOrg.subgroupName || null,
        };
    }, [currentUser, activePersonalOrg, personalOrgNames]);

    useEffect(() => {
        if (currentUser?.accountType !== 'personal' || personalOrgs.length === 0) {
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
    }, [currentUser?.uid, currentUser?.accountType, personalOrgs.map(org => org.orgId).join('|')]);
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
        newAchievement, setNewAchievement,
        readSubmitting,

        handleRead,
        saveMemo,
        changeSubgroup,
        handleRestart,
        changeStartDate,

        loadMemos,
        loadAnnouncement,
        kakaoLink, loadKakaoLink, setKakaoLink
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
    const [showSubgroupChange, setShowSubgroupChange] = useState(false);
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
        handleSpeedChange, handleTogglePause, handleStop, handleSpeak, jumpToChunk,
        setSelectedVoiceURI
    } = useTTS(verseData.text);

    const [allUsers, setAllUsers] = useState([]);             // 전체 사용자 목록 (관리자용)
    const [allChurches, setAllChurches] = useState([]);       // 전체 교회 목록 (슈퍼관리자용)

    const [editingUser, setEditingUser] = useState(null);     // 편집 중인 사용자
    const [changingPassword, setChangingPassword] = useState(null); // 비밀번호 변경 대상
    const [newPassword, setNewPassword] = useState('');       // 새 비밀번호
    const [adminSortBy, setAdminSortBy] = useState('name'); // 'name', 'day', 'score', 'subgroup'
    const [announcementInput, setAnnouncementInput] = useState({
        text: '',
        links: [{ url: '', text: '' }], // 여러 링크를 담을 수 있는 배열
        enabled: false
    }); // 공지 입력
    const [kakaoLinkInput, setKakaoLinkInput] = useState(''); // 카카오 링크 입력
    const [fontSize, setFontSize] = useState(() => {
        const saved = localStorage.getItem('bible_fontSize');
        return saved ? parseInt(saved, 10) : 16; // 기본값 16px
    });

    // Auth Hook
    // const { currentUser, setCurrentUser, authLoading } = useUserAuth(); // Already defined above


    // 인앱 브라우저 감지 (네이버 등)
    const [isInAppBrowser, setIsInAppBrowser] = useState(false);
    useEffect(() => {
        const ua = navigator.userAgent;
        if (ua.indexOf('NAVER') > -1 || ua.indexOf('KAKAOTALK') > -1) {
            setIsInAppBrowser(true);
        }
    }, []);

    // 숫자를 한자어 수사(일, 이, 삼...)로 변환 (안드로이드 '세 장' 방지용)
    // (이미 utils/helpers.js에서 import됨)

    /*
     ============================================================================
     5.5 [Logic] TTS & Accessibility
     ============================================================================
     텍스트 읽어주기(TTS) 및 사용자 편의를 위한 음성 지원 로직입니다.
    */



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
                    loadSuperAdminData();
                } else if (currentUser.role === 'churchAdmin') {
                    // 교회 관리자는 부서/소그룹 없이 바로 대시보드로
                    if (dashboardUser?.churchId) loadChurchCommunities(dashboardUser.churchId);
                    setView('dashboard');
                } else {
                    if (dashboardUser?.churchId) loadChurchCommunities(dashboardUser.churchId);
                    if (currentUser.departmentId && currentUser.subgroupId) {
                        setView('dashboard');
                    } else {
                        setTempUser(currentUser);
                        setView('plan_type_select');
                    }
                }
            }
        } else {
            resetReaderSessionState();
            if (view !== 'login') setView('login');
        }
    }, [currentUser, authLoading, resetReaderSessionState]);

    // getLevelInfo는 data/levels에서 import됨










    // 공지 저장 (슈퍼관리자용 - 특정 교회 선택 시 해당 교회 경로에 저장)
    const saveAnnouncement = async (churchId) => {
        if (!db || !churchId) return;
        try {
            await db.collection('churches').doc(churchId).collection('settings').doc('announcement').set({
                ...announcementInput,
                updatedAt: firebase.firestore.FieldValue.serverTimestamp()
            });
            alert('공지가 저장되었습니다!');
        } catch (e) {
            console.error("공지 저장 실패:", e);
            alert('저장 실패');
        }
    };

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







    // loadCommunityMembers removed
    // loadAllMembers removed





    /*
     ============================================================================
     5.4 [Logic] Data Processing & Stats
     ============================================================================
     공동체 통계 계산, 멤버 로딩, 데이터 변환 등 데이터 중심의 로직입니다.
    */





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
            // Firebase Authentication에서 암호 변경은 직접 불가능
            // 평문 암호는 private 하위문서에 먼저 기록하고, 본문서에는 null 마커만 남긴다
            // (같은 교회 교인 랭킹 조회를 열어주는 firestore.rules 조건 유지 — memberCredentials.js 참고)
            try {
                await writeMemberCredentials(uid, { password: newPassword });
                await db.collection('users').doc(uid).set({
                    password: null,
                    passwordResetRequired: true,
                    updatedAt: firebase.firestore.FieldValue.serverTimestamp()
                }, { merge: true });
            } catch (privateWriteError) {
                console.error('private 자격증명 기록 실패, 기존 방식으로 대체:', privateWriteError);
                // Firestore에 새 암호 저장 (사용자가 다음 로그인 시 자동 업데이트됨)
                await db.collection('users').doc(uid).set({
                    password: newPassword,
                    passwordResetRequired: true,
                    updatedAt: firebase.firestore.FieldValue.serverTimestamp()
                }, { merge: true });
            }

            alert(`✅ ${userName}님의 암호가 변경되었습니다!\n\n새 암호: ${newPassword}\n\n※ 사용자에게 새 암호를 전달해주세요.`);

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
            await db.collection('users').doc(editingUser.uid).set({
                churchId: editingUser.churchId,
                churchName: editingUser.churchName,
                departmentId: editingUser.departmentId, departmentName: editingUser.departmentName,
                subgroupId: editingUser.subgroupId, subgroupName: editingUser.subgroupName || null,
                planId: editingUser.planId,
                currentDay: editingUser.currentDay, readCount: editingUser.readCount || 1,
                score: editingUser.score, streak: editingUser.streak,
                lastReadDate: editingUser.lastReadDate || null,
                updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
            }, { merge: true });
            setAllUsers(prev => prev.map(u => u.uid === editingUser.uid ? editingUser : u));
            setEditingUser(null); alert("수정되었습니다.");
        } catch (e) { console.error(e); alert("수정 실패"); }
    };

    /*
     ============================================================================
     5.3 [Logic] Auth & User Management
     ============================================================================
     회원가입, 로그인, 로그아웃 등 사용자 인증 관련 비즈니스 로직입니다.
    */

    const loadChurchCommunities = async (churchId) => {
        if (!churchId) return;
        try {
            const doc = await db.collection('churches').doc(churchId).get();
            if (doc.exists) setChurchCommunities(doc.data().departments || doc.data().communities || []);
        } catch (e) { console.error(e); }
    };

    useEffect(() => {
        if (view !== 'dashboard') return;
        if (dashboardUser?.churchId) loadChurchCommunities(dashboardUser.churchId);
        else setChurchCommunities([]);
    }, [view, dashboardUser?.churchId]);

    const loadSuperAdminData = async () => {
        const [usersSnap, churchesSnap] = await Promise.all([
            db.collection('users').get(),
            db.collection('churches').get(),
        ]);
        setAllUsers(usersSnap.docs.map(doc => userDocToState(doc)).filter(u => !u.isDeleted));
        setAllChurches(churchesSnap.docs.map(doc => ({ id: doc.id, ...doc.data() })).filter(c => !c.isDeleted));
    };

    const {
        errorMsg,
        setErrorMsg,
        handleMemberLogin,
        handleMemberSignup,
        handlePersonalSignup,
        handleGooglePersonalSignup,
        handleChurchAdminLogin,
        handleChurchAdminSignup,
        handleGoogleAdminLogin,
        handleGoogleAdminSignupStart,
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
    });

    const handlePlanTypeSelect = (typeId) => { setSelectedPlanType(typeId); setView('bible_version_select'); };

    const handleVersionSelect = async (versionId) => {
        const versionInfo = (BIBLE_VERSIONS[selectedPlanType] || []).find(v => v.id === versionId);
        const versionUser = tempUser || currentUser;
        if (!versionInfo || !isBibleVersionVisibleForUser(versionInfo, versionUser)) {
            alert('이 성경 버전은 현재 교회에서 사용할 수 없습니다.');
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
        const subgroupId = typeof subgroup === 'string' ? subgroup : subgroup.id;
        const subgroupName = typeof subgroup === 'string' ? subgroup : subgroup.name;
        const finalUser = { ...tempUser, subgroupId, subgroupName };
        const runtimeExtraOrgs = Array.isArray(finalUser.extraOrgs) ? finalUser.extraOrgs : [];
        const { extraOrgs: _transientExtraOrgs, ...persistedUser } = finalUser;
        setCurrentUser({ ...persistedUser, extraOrgs: runtimeExtraOrgs }); setTempUser(null); setView('dashboard');
        try {
            const uid = (auth.currentUser ? auth.currentUser.uid : null) || finalUser.uid;
            if (uid) await db.collection('users').doc(uid).set({ ...persistedUser, updatedAt: firebase.firestore.FieldValue.serverTimestamp() }, { merge: true });
        } catch (e) { console.error(e); alert("서버 저장 실패"); }
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
        try {
            await db.collection('users').doc(currentUser.uid).set({
                primaryOrgId: orgId,
                updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
            }, { merge: true });
            setCurrentUser(user => user?.uid === currentUser.uid ? { ...user, primaryOrgId: orgId } : user);
        } catch (error) {
            console.error('기준 공동체 변경 실패:', error);
            alert('공동체를 바꾸지 못했습니다. 잠시 후 다시 시도해주세요.');
        }
    };

    const handlePersonalAccountMigrate = async (phone4) => {
        if (!currentUser) return;
        try {
            const migratedUser = await migrateChurchMemberToPersonal({ currentUser, phone4 });
            setCurrentUser(migratedUser);
            alert("전환 완료! 다음 로그인부터는 '시작하기'에서 이름+생년월일+전화 뒤 4자리로 로그인해주세요.");
        } catch (error) {
            console.error('개인 계정 전환 실패:', error);
            alert(error?.message || '전환을 완료하지 못했습니다. 잠시 후 다시 시도해주세요.');
        }
    };

    useEffect(() => {
        if (!currentUser?.uid || currentUser.accountType === 'personal') return;
        const pending = getPendingPersonalMigration(currentUser.uid);
        if (!pending?.phone4) return;
        handlePersonalAccountMigrate(pending.phone4);
    }, [currentUser?.uid]);

    // ----------------------------------------------------------------------
    // [섹션 H] 데이터 페칭 - 대시보드 진입 시 말씀 로딩
    // ----------------------------------------------------------------------

    // Effect for data loading moved to useBibleLogic

    // ----------------------------------------------------------------------
    // [섹션 I] 읽기 완료 처리 - handleRead
    // "읽었습니다" 버튼 클릭 시 실행
    // ★ 변경: 기본 점수(10), 보너스 최대값(5), 자동 순환 로직
    // ----------------------------------------------------------------------
    // handleRead logic moved to useBibleLogic

    const handleLogout = () => {
        if (auth) auth.signOut();
        resetReaderSessionState();
        setCurrentUser(null); setTempUser(null); setChurchCommunities([]);
        setLoginInitialTab('member');
        setErrorMsg(''); setView('login'); setHasReadToday(false); setEditingUser(null); setDepartmentMembers([]);
    };

    const handleGuestSignupStart = () => {
        setLoginInitialTab('memberSignup');
        if (auth) auth.signOut();
        resetReaderSessionState();
        setCurrentUser(null); setTempUser(null); setChurchCommunities([]);
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
            <>
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
                    announcementInput={announcementInput}
                    setAnnouncementInput={setAnnouncementInput}
                    saveAnnouncement={saveAnnouncement}
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
            </>
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
                onGoogleAdminSignupCancel={cancelGoogleAdminSignup}
                onMemberSignup={handleMemberSignup}
                onPersonalSignup={handlePersonalSignup}
                onGooglePersonalSignup={handleGooglePersonalSignup}
                onChurchAdminSignup={handleChurchAdminSignup}
                errorMsg={errorMsg}
                setErrorMsg={setErrorMsg}
                presetChurchId={presetChurchId}
                initialTab={loginInitialTab}
            />
        );
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
    } else if (view === 'dashboard' && currentUser) {
        pageContent = (
            <DashboardView
                currentUser={currentUser}
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
                jumpToChunk={jumpToChunk}
                readSubmitting={readSubmitting}
                handleRead={handleRead}
                saveMemo={saveMemo}
                handleLogout={handleLogout}
                handleChangeVersionStart={handleChangeVersionStart}
                handleRestart={handleRestart}
                changeSubgroup={changeSubgroup}
                changeStartDate={changeStartDate}
                dateToOffset={dateToOffset}
                showConfetti={showConfetti}
                levelUpToast={levelUpToast}
                bonusToast={bonusToast}
                newAchievement={newAchievement}
                showScoreInfo={showScoreInfo} setShowScoreInfo={setShowScoreInfo}
                showReadingGuide={showReadingGuide} setShowReadingGuide={setShowReadingGuide}
                showMemoList={showMemoList} setShowMemoList={setShowMemoList}
                showAchievements={showAchievements} setShowAchievements={setShowAchievements}
                showCalendar={showCalendar} setShowCalendar={setShowCalendar}
                showFullRanking={showFullRanking} setShowFullRanking={setShowFullRanking}
                showDateSettings={showDateSettings} setShowDateSettings={setShowDateSettings}
                showSubgroupChange={showSubgroupChange} setShowSubgroupChange={setShowSubgroupChange}
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
                personalOrganizations={personalOrgs.map(org => ({ ...org, name: personalOrgNames[org.orgId] || org.orgId }))}
                onPrimaryOrgChange={handlePrimaryOrgChange}
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
            <ChurchAdminView
                currentUser={currentUser}
                handleLogout={handleLogout}
                onBack={() => setView('dashboard')}
            />
        );
    }

    return (
        <>
            {pageContent}
            <ToastContainer toasts={adminAuthToasts.toasts} onClose={adminAuthToasts.removeToast} />
        </>
    );
};



export default App;
