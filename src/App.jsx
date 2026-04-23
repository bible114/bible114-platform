import React, { useState, useEffect, useRef } from 'react';
import { db, auth, firebase } from './utils/firebase';
import { MOCK_COMMUNITIES } from './data/communities';
import { SCHEDULE_DATA } from './data/schedules';
import { LEVEL_SYSTEM, getLevelInfo } from './data/levels';
import { ACHIEVEMENTS } from './data/achievements';
import { PLAN_TYPES, BIBLE_VERSIONS } from './data/bible_options';
import { makePseudoEmail, userDocToState, toSinoKorean, dateToOffset, offsetToDateStr, getActualDay } from './utils/helpers';
import { calculateSubgroupStats, getWeeklyMVP, getMonthlyContest, formatSubgroupRanking, formatProgressRanking, getAdminStats } from './utils/statsUtils';
import { getSubgroupDisplay } from './utils/dashboardUtils';
import { generateMemosHTML, generateMemosCSV, downloadCSV, downloadPeriodStatsCSV } from './utils/exportUtils';
import { useUserAuth } from './hooks/useUserAuth';
import { useBibleLogic } from './hooks/useBibleLogic';
import Icon from './components/Icon';
import MarkdownRenderer from './components/MarkdownRenderer';
import LoginView from './components/LoginView';
import AdminView from './components/AdminView';
import PlanSelectionView from './components/PlanSelectionView';
import DashboardView from './components/DashboardView';
import MiniRoomPage from './components/miniroom/MiniRoomPage';
import { TOTAL_DAYS, PANIC_DISTANCE, AUDIO_BASE_URL, GENESIS_1, SUPABASE_FUNCTION_URL } from './data/constants';
import { useTTS } from './hooks/useTTS';


const App = () => {
    /*
     ============================================================================
     5.1 [Hooks] State, Refs & Effects
     ============================================================================
     컴포넌트의 상태와 생명주기를 관리하는 섹션입니다.
    */

    // --- [A] 화면 및 인증 상태 ---
    const [view, setView] = useState('login');  // 현재 화면: 'login', 'dashboard', 'admin' 등
    const [loginTab, setLoginTab] = useState('login'); // 로그인/회원가입 탭 ('login' or 'signup')
    const [signupName, setSignupName] = useState('');   // 회원가입: 이름
    const [signupPw, setSignupPw] = useState('');       // 회원가입: 비밀번호
    const [signupPwConfirm, setSignupPwConfirm] = useState(''); // 회원가입: 비밀번호 확인
    const [signupBirthdate, setSignupBirthdate] = useState(''); // 회원가입: 생년월일
    const [loginName, setLoginName] = useState('');     // 로그인: 이름
    const [loginPw, setLoginPw] = useState('');         // 로그인: 비밀번호
    const [tempUser, setTempUser] = useState(null);     // 임시 사용자 (가입 진행 중)
    const { currentUser, setCurrentUser, authLoading } = useUserAuth(); // Auth hook
    const [errorMsg, setErrorMsg] = useState('');       // 에러 메시지

    // Bible Logic Hook (Must be called before useTTS)
    const {
        verseData, setVerseData,
        subgroupStats, setSubgroupStats,
        communityMembers, setCommunityMembers,
        allMembersForRace, setAllMembersForRace,
        memos, setMemos,
        readHistory, setReadHistory,
        announcement, setAnnouncement,
        viewingDay, setViewingDay,
        hasReadToday, setHasReadToday,

        showConfetti, setShowConfetti,
        levelUpToast, setLevelUpToast,
        bonusToast, setBonusToast,
        newAchievement, setNewAchievement,

        handleRead,
        saveMemo,
        changeSubgroup,
        handleRestart,
        changeStartDate,

        loadMemos,
        loadAnnouncement,
        kakaoLink, loadKakaoLink, setKakaoLink
    } = useBibleLogic(currentUser, setCurrentUser, view);
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

    // --- 관리자 관련 상태 ---
    const [selectedPlanType, setSelectedPlanType] = useState(null); // 선택된 플랜 타입
    const [isAdmin, setIsAdmin] = useState(false);            // 관리자 모드 여부

    // --- [Hooks] Extract Logic ---
    const {
        isSpeaking, isPaused, ttsSpeed, availableVoices, selectedVoiceURI, activeChunkIndex,
        handleSpeedChange, handleTogglePause, handleStop, handleSpeak, jumpToChunk,
        setSelectedVoiceURI
    } = useTTS(verseData.text);

    const [allUsers, setAllUsers] = useState([]);             // 전체 사용자 목록 (관리자용)

    const [editingUser, setEditingUser] = useState(null);     // 편집 중인 사용자
    const [changingPassword, setChangingPassword] = useState(null); // 비밀번호 변경 대상
    const [newPassword, setNewPassword] = useState('');       // 새 비밀번호
    const [adminFilter, setAdminFilter] = useState('all');    // 관리자 필터: 전체/부서별
    const [adminViewMode, setAdminViewMode] = useState('today'); // 'today' or 'inactive'
    const [adminSortBy, setAdminSortBy] = useState('name'); // 'name', 'day', 'score', 'subgroup'
    const [announcementInput, setAnnouncementInput] = useState({
        text: '',
        links: [{ url: '', text: '' }], // 여러 링크를 담을 수 있는 배열
        enabled: false
    }); // 공지 입력
    const [kakaoLinkInput, setKakaoLinkInput] = useState(''); // 카카오 링크 입력
    const [syncProgress, setSyncProgress] = useState(null);   // 동기화 진행 상황
    const [fontSize, setFontSize] = useState(() => {
        const saved = localStorage.getItem('bible_fontSize');
        return saved ? parseInt(saved, 10) : 16; // 기본값 16px
    });
    const [lastSyncInfo, setLastSyncInfo] = useState(null); // 마지막 동기화 정보
    const [selectedSyncVersions, setSelectedSyncVersions] = useState(['1year_revised']); // 동기화할 버전들

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
        if (authLoading) return; // Wait for loading to finish

        if (currentUser) {
            // If we are currently in login view and just got a user (initial load or login success)
            if (view === 'login') {
                if (currentUser.communityId && currentUser.subgroupId) {
                    setView('dashboard');
                } else {
                    // 설정이 안 된 사용자는 설정 화면으로
                    setTempUser(currentUser);
                    setView('plan_type_select');
                }
            }
        } else {
            // Not logged in
            if (view !== 'login') setView('login');
        }
    }, [currentUser, authLoading]);

    // getLevelInfo는 data/levels에서 import됨










    // 광고/공지 저장 (관리자용)
    const saveAnnouncement = async () => {
        if (!db) return;
        try {
            await db.collection('settings').doc('announcement').set({
                ...announcementInput,
                updatedAt: firebase.firestore.FieldValue.serverTimestamp()
            });
            setAnnouncement(announcementInput.enabled ? announcementInput : null);
            alert('광고가 저장되었습니다!');
        } catch (e) {
            console.error("광고 저장 실패:", e);
            alert('저장 실패');
        }
    };

    // 카카오 링크 저장 (관리자용)
    const saveKakaoLink = async () => {
        if (!db) return;
        try {
            await db.collection('settings').doc('kakao').set({
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
        if (confirm(`${userName}님의 데이터를 정말 삭제하시겠습니까?`)) {
            try {
                await db.collection('users').doc(uid).delete();
                setAllUsers(prev => prev.filter(u => u.uid !== uid));
                alert("삭제되었습니다.");
            } catch (e) { console.error(e); alert("삭제 실패"); }
        }
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
            // Firestore에 새 암호 저장 (사용자가 다음 로그인 시 자동 업데이트됨)
            await db.collection('users').doc(uid).set({
                password: newPassword,
                passwordResetRequired: true,
                updatedAt: firebase.firestore.FieldValue.serverTimestamp()
            }, { merge: true });

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
                communityId: editingUser.communityId, communityName: editingUser.communityName,
                subgroupId: editingUser.subgroupId, planId: editingUser.planId,
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

    // 로그인/회원가입 폼 제출 핸들러 (관리자 비밀번호: '08283')
    const handleLogin = async (e) => {
        e.preventDefault();
        setErrorMsg('');

        // 회원가입 모드일 때 추가 검증
        if (loginTab === 'signup') {
            console.log('=== 회원가입 시작 ===');
            console.log('이름:', signupName);
            console.log('암호 길이:', signupPw.length);
            console.log('생년월일:', signupBirthdate);

            if (!signupName.trim() || !signupPw.trim() || !signupBirthdate) {
                setErrorMsg("모든 항목을 입력해주세요.");
                return;
            }
            if (signupPw !== signupPwConfirm) {
                setErrorMsg("암호가 일치하지 않습니다.");
                return;
            }
            if (signupPw.length < 6) {
                setErrorMsg("암호는 6자리 이상이어야 합니다.");
                return;
            }
        }

        // 로그인 모드 기본 검증
        const name = loginTab === 'signup' ? signupName : loginName;
        const pw = loginTab === 'signup' ? signupPw : loginPw;

        if (!name.trim() || !pw.trim()) {
            setErrorMsg("이름과 암호를 모두 입력해주세요.");
            return;
        }

        // ★ 관리자 로그인 체크 (관리자 비밀번호: '08283')
        // 회원가입 탭에서는 관리자 로그인 불가
        if (name === 'admin' && pw === '08283' && loginTab === 'login') {
            try {
                if (auth && !auth.currentUser) await auth.signInAnonymously();
                const snap = await db.collection('users').get();
                setAllUsers(snap.docs.map(doc => userDocToState(doc)));

                const announcementDoc = await db.collection('settings').doc('announcement').get();
                if (announcementDoc.exists) {
                    const data = announcementDoc.data();
                    // 이전 형식(단일 링크)에서 새로운 형식(링크 배열)으로 마이그레이션
                    if (!data.links && data.linkUrl && data.linkText) {
                        data.links = [{ url: data.linkUrl, text: data.linkText }];
                    }
                    if (!data.links) {
                        data.links = [{ url: '', text: '' }];
                    }
                    setAnnouncementInput(data);
                }

                const syncDoc = await db.collection('settings').doc('sync').get();
                if (syncDoc.exists) {
                    setLastSyncInfo(syncDoc.data());
                }

                const kakaoDoc = await db.collection('settings').doc('kakao').get();
                if (kakaoDoc.exists) {
                    setKakaoLinkInput(kakaoDoc.data().url);
                }

                setIsAdmin(true);  // 관리자 모드 활성화
                return;
            } catch (err) { console.error(err); setErrorMsg('관리자 데이터 로딩 실패'); return; }
        }

        // 일반 사용자 Firebase 인증
        try {
            const email = makePseudoEmail(name);  // 이름 → 가짜 이메일 변환
            console.log('생성된 이메일:', email);

            let cred = null;

            // 먼저 로그인 시도
            try {
                console.log('로그인 시도 중...');
                cred = await auth.signInWithEmailAndPassword(email, pw);
                console.log('로그인 성공!');
            } catch (err) {
                console.log('로그인 실패:', err.code, err.message);

                // 사용자가 없으면 회원가입 진행 (회원가입 탭에서만)
                if ((err && err.code === 'auth/user-not-found') || (err && err.code === 'auth/invalid-login-credentials') || (err && err.code === 'auth/invalid-credential')) {
                    // 로그인 탭에서는 회원가입 불가
                    if (loginTab === 'login') {
                        setErrorMsg("등록되지 않은 사용자입니다. 회원가입 탭에서 가입해주세요.");
                        return;
                    }

                    // 회원가입 탭에서만 신규 계정 생성
                    console.log('회원가입 시도 중...');
                    try {
                        cred = await auth.createUserWithEmailAndPassword(email, pw);
                        console.log('회원가입 성공!');
                    } catch (signupErr) {
                        console.error("회원가입 상세 에러:", signupErr);
                        console.error("에러 코드:", signupErr ? signupErr.code : null);
                        console.error("에러 메시지:", signupErr ? signupErr.message : null);

                        if (signupErr && signupErr.code === 'auth/email-already-in-use') {
                            setErrorMsg("이미 사용 중인 이름입니다. 로그인 탭에서 로그인하거나 다른 이름을 사용해주세요.");
                        }
                        else if (signupErr && signupErr.code === 'auth/weak-password') {
                            setErrorMsg("암호는 6자리 이상이어야 합니다.");
                        }
                        else if (signupErr && signupErr.code === 'auth/invalid-email') {
                            setErrorMsg("이름에 특수문자를 사용할 수 없습니다.");
                        }
                        else {
                            setErrorMsg(`회원가입 실패: ${(signupErr && signupErr.message) || '잠시 후 다시 시도해주세요'}`);
                        }
                        return;
                    }
                } else if (err && err.code === 'auth/wrong-password') {
                    setErrorMsg("암호가 틀렸습니다.");
                    return;
                }
                else {
                    console.error('알 수 없는 로그인 에러:', err);
                    setErrorMsg("로그인 실패(잠시 후 다시 시도)");
                    return;
                }
            }

            const uid = cred.user.uid;
            console.log('사용자 UID:', uid);

            const ref = db.collection('users').doc(uid);
            const doc = await ref.get();

            // Firestore에 사용자 데이터가 없으면 신규 생성
            if (!doc.exists) {
                console.log('신규 사용자 - Firestore에 데이터 생성 중...');
                const newUserBase = {
                    name: name.trim(),          // 이름
                    password: pw,               // 비밀번호 (평문 - 개선 필요) 
                    startDate: new Date().toDateString(),
                    currentDay: 1,
                    streak: 0,
                    score: 0,
                    lastReadDate: null,
                    gender: 'male',
                    planId: "1year_revised",
                    communityId: null,
                    communityName: null,
                    subgroupId: null,
                    createdAt: firebase.firestore.FieldValue.serverTimestamp(),
                    updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
                };
                await ref.set(newUserBase);
                console.log('Firestore 데이터 생성 완료!');

                setTempUser({ ...newUserBase, uid });
                setView('plan_type_select');
                return;
            }

            console.log('기존 사용자 - 데이터 로드 완료');
            const user = userDocToState(doc);
            setCurrentUser(user);
            setHasReadToday(user.lastReadDate === new Date().toDateString());

            if (!user.communityId || !user.subgroupId) {
                setTempUser(user);
                setView('plan_type_select');
            } else {
                setView('dashboard');
            }

        } catch (err) {
            console.error('전체 프로세스 에러:', err);
            setErrorMsg("로그인 처리 중 오류");
        }
    };

    const handlePlanTypeSelect = (typeId) => { setSelectedPlanType(typeId); setView('bible_version_select'); };

    const handleVersionSelect = async (versionId) => {
        const fullPlanId = `${selectedPlanType}_${versionId}`;
        if (tempUser) { setTempUser(prev => ({ ...prev, planId: fullPlanId })); setView('community_select'); }
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

    const handleCommunitySelect = (commId, commName) => { setTempUser(prev => ({ ...prev, communityId: commId, communityName: commName })); setView('subgroup_select'); };

    const handleSubgroupSelect = async (subgroup) => {
        const finalUser = { ...tempUser, subgroupId: subgroup };
        setCurrentUser(finalUser); setTempUser(null); setView('dashboard');
        try {
            const uid = (auth.currentUser ? auth.currentUser.uid : null) || finalUser.uid;
            if (uid) await db.collection('users').doc(uid).set({ ...finalUser, updatedAt: firebase.firestore.FieldValue.serverTimestamp() }, { merge: true });
        } catch (e) { console.error(e); alert("서버 저장 실패"); }
    };





    // Supabase URL들
    const SUPABASE_BULK_URL = SUPABASE_FUNCTION_URL.replace('notion-proxy', 'notion-proxy-bulk');
    const SUPABASE_PAGE_URL = SUPABASE_FUNCTION_URL.replace('notion-proxy', 'notion-proxy-page');

    // 관리자용: 노션 → Firestore 동기화 (Bulk 방식)
    const syncNotionToFirestore = async (planIds = ['1year_revised']) => {
        if (!db || !SUPABASE_FUNCTION_URL) {
            alert('설정 오류');
            return { success: 0, error: 0, failedItems: [] };
        }

        let totalSuccess = 0;
        let totalError = 0;
        const failedItems = [];

        for (const planId of planIds) {
            const [planType, version] = planId.split('_');
            const versionInfo = BIBLE_VERSIONS[planType] ? BIBLE_VERSIONS[planType].find(v => v.id === version) : null;
            const targetTag = (versionInfo && versionInfo.tagName) || '개역개정 일년일독';
            const versionName = (versionInfo && versionInfo.name) || planId;

            setSyncProgress({
                current: 0,
                total: 365,
                success: 0,
                error: 0,
                currentVersion: versionName,
                currentDay: 0,
                status: '📥 노션에서 목록 가져오는 중...'
            });

            try {
                // 1단계: Bulk로 모든 페이지 메타데이터 가져오기
                console.log(`📥 ${versionName} 목록 가져오는 중...`);
                const bulkResponse = await fetch(SUPABASE_BULK_URL, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ tag: targetTag, includeContent: false })
                });

                if (!bulkResponse.ok) {
                    throw new Error(`Bulk API Error: ${bulkResponse.status}`);
                }

                const bulkData = await bulkResponse.json();
                console.log(`✅ ${bulkData.count}개 페이지 목록 수신`);

                if (!bulkData.items || bulkData.items.length === 0) {
                    throw new Error('노션에서 가져온 데이터가 없습니다');
                }

                // 날짜 → Day 번호 맵
                const dateToDay = {};
                for (let day = 1; day <= 365; day++) {
                    const targetDate = new Date(2025, 0, day);
                    const mm = String(targetDate.getMonth() + 1).padStart(2, '0');
                    const dd = String(targetDate.getDate()).padStart(2, '0');
                    dateToDay[`${mm}-${dd}`] = day;
                }

                // 2단계: 각 페이지의 본문 가져와서 저장
                const items = bulkData.items;
                let processed = 0;

                for (const item of items) {
                    const day = dateToDay[item.date];
                    if (!day) {
                        console.log(`⚠️ 날짜 매핑 실패: ${item.date}`);
                        totalError++;
                        failedItems.push({
                            planId, versionName, day: 0, date: item.date,
                            error: '날짜 매핑 실패'
                        });
                        continue;
                    }

                    try {
                        // pageId로 직접 본문 가져오기 (DB 쿼리 없이!)
                        const pageResponse = await fetch(SUPABASE_PAGE_URL, {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ pageId: item.pageId })
                        });

                        if (!pageResponse.ok) throw new Error(`Page API Error: ${pageResponse.status}`);
                        const pageData = await pageResponse.json();

                        if (pageData.text) {
                            // Firestore에 저장
                            // ★ pageId 저장 (오디오 실시간 로드용)
                            const cacheKey = `${planType}_${version}_${day}`;
                            await db.collection('verses').doc(cacheKey).set({
                                title: item.title,
                                text: pageData.text,
                                pageId: item.pageId,  // ★ pageId 저장!
                                day: day,
                                planId: planId,
                                syncedAt: firebase.firestore.FieldValue.serverTimestamp()
                            });
                            totalSuccess++;
                            console.log(`✅ Day ${day} (${item.date}) 저장 완료`);
                        } else {
                            throw new Error('본문 없음');
                        }

                    } catch (e) {
                        totalError++;
                        failedItems.push({
                            planId, versionName, day, date: item.date,
                            error: e.message
                        });
                        console.error(`❌ Day ${day} 실패:`, e.message);
                    }

                    processed++;

                    // 진행 상황 업데이트 (5개마다)
                    if (processed % 5 === 0) {
                        setSyncProgress({
                            current: processed,
                            total: items.length,
                            success: totalSuccess,
                            error: totalError,
                            currentVersion: versionName,
                            currentDay: day,
                            status: `📝 본문 저장 중... (${processed}/${items.length})`
                        });
                    }

                    // API 부하 방지 (200ms)
                    await new Promise(r => setTimeout(r, 200));
                }

            } catch (e) {
                console.error(`❌ ${versionName} 동기화 실패:`, e);
                totalError += 365;
                failedItems.push({
                    planId, versionName, day: 0, date: '',
                    error: `전체 실패: ${e.message}`
                });
            }
        }

        // 마지막 동기화 시간 저장
        await db.collection('settings').doc('sync').set({
            lastSyncAt: firebase.firestore.FieldValue.serverTimestamp(),
            successCount: totalSuccess,
            errorCount: totalError,
            syncedVersions: planIds,
            failedItems: failedItems.slice(0, 50)
        });

        setSyncProgress(null);
        return { success: totalSuccess, error: totalError, failedItems };
    };

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
        setCurrentUser(null); setIsAdmin(false); setTempUser(null); setLoginName(''); setLoginPw('');
        setErrorMsg(''); setView('login'); setHasReadToday(false); setEditingUser(null); setCommunityMembers([]);
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
            <div className="min-h-screen bg-slate-50 flex items-center justify-center">
                <div className="text-center">
                    <div className="text-5xl mb-4 animate-bounce">🏃‍♂️</div>
                    <p className="text-slate-500 font-bold">로그인 확인 중...</p>
                </div>
            </div>
        );
    }

    if (isAdmin) {
        return (
            <AdminView
                handleLogout={handleLogout}
                downloadCSV={downloadCSV}
                adminViewMode={adminViewMode}
                setAdminViewMode={setAdminViewMode}
                adminFilter={adminFilter}
                setAdminFilter={setAdminFilter}
                adminSortBy={adminSortBy}
                setAdminSortBy={setAdminSortBy}
                allUsers={allUsers}
                MOCK_COMMUNITIES={MOCK_COMMUNITIES}
                BIBLE_VERSIONS={BIBLE_VERSIONS}
                announcementInput={announcementInput}
                setAnnouncementInput={setAnnouncementInput}
                saveAnnouncement={saveAnnouncement}
                generateMemosCSV={generateMemosCSV}
                generateMemosHTML={generateMemosHTML}
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
                lastSyncInfo={lastSyncInfo}
                setLastSyncInfo={setLastSyncInfo}
                syncProgress={syncProgress}
                setSyncProgress={setSyncProgress}
                selectedSyncVersions={selectedSyncVersions}
                setSelectedSyncVersions={setSelectedSyncVersions}
                syncNotionToFirestore={syncNotionToFirestore}
                adminStats={getAdminStats(allUsers)}
                kakaoLinkInput={kakaoLinkInput}
                setKakaoLinkInput={setKakaoLinkInput}
                saveKakaoLink={saveKakaoLink}
                downloadPeriodStatsCSV={downloadPeriodStatsCSV}
                db={db}
            />
        );
    }

    if (view === 'login') {
        return (
            <LoginView
                loginTab={loginTab}
                setLoginTab={setLoginTab}
                loginName={loginName}
                setLoginName={setLoginName}
                loginPw={loginPw}
                setLoginPw={setLoginPw}
                signupName={signupName}
                setSignupName={setSignupName}
                signupBirthdate={signupBirthdate}
                setSignupBirthdate={setSignupBirthdate}
                signupPw={signupPw}
                setSignupPw={setSignupPw}
                signupPwConfirm={signupPwConfirm}
                setSignupPwConfirm={setSignupPwConfirm}
                errorMsg={errorMsg}
                handleLogin={handleLogin}
            />
        );
    }

    if (['plan_type_select', 'bible_version_select', 'community_select', 'subgroup_select'].includes(view)) {
        return (
            <PlanSelectionView
                view={view}
                currentUser={currentUser}
                tempUser={tempUser}
                setView={setView}
                selectedPlanType={selectedPlanType}
                handlePlanTypeSelect={handlePlanTypeSelect}
                handleVersionSelect={handleVersionSelect}
                handleCommunitySelect={handleCommunitySelect}
                handleSubgroupSelect={handleSubgroupSelect}
            />
        );
    }

    if (view === 'dashboard' && currentUser) {
        return (
            <DashboardView
                currentUser={currentUser}
                communityMembers={communityMembers}
                allMembersForRace={allMembersForRace}
                memos={memos}
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
                getWeeklyMVP={() => getWeeklyMVP(communityMembers)}
                setView={setView}
            />
        );
    }

    if (view === 'mini_room' && currentUser) {
        return (
            <MiniRoomPage
                currentUser={currentUser}
                setCurrentUser={setCurrentUser}
                setView={setView}
            />
        );
    }

    return null;
};



export default App;
