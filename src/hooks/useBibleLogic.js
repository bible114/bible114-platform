import { useEffect, useCallback, useRef, useState } from 'react';
import { db } from '../utils/firebase';
import { calculateSubgroupStats } from '../utils/statsUtils';
import { belongsToDepartment } from '../utils/memberships';

// Sub-hooks
import { useBibleContent } from './useBibleContent';
import { useMemos } from './useMemos';
import { useDepartment } from './useDepartment';
import { useUserBibleActions } from './useUserBibleActions';

export const useBibleLogic = (currentUser, setCurrentUser, view, communities, onReadComplete) => {
    const communityRequestRef = useRef(0);
    const userDataRequestRef = useRef(0);
    const [communityRefreshNonce, setCommunityRefreshNonce] = useState(0);
    const requestCommunityRefresh = useCallback(() => {
        setCommunityRefreshNonce(value => value + 1);
    }, []);
    // 1. Content Hook
    const {
        verseData, setVerseData, viewingDay, setViewingDay, loadContent
    } = useBibleContent(currentUser);

    // 2. Community & Stats Hook
    const {
        subgroupStats, setSubgroupStats, departmentMembers, setDepartmentMembers,
        allMembersForRace, setAllMembersForRace, announcement, loadAnnouncement,
        kakaoLink, loadKakaoLink, setKakaoLink,
        loadAllMembers, changeSubgroup
    } = useDepartment(currentUser, setCurrentUser);

    // 3. User Actions Hook
    const {
        readHistory, setReadHistory, hasReadToday, setHasReadToday,
        showConfetti, setShowConfetti, levelUpToast, setLevelUpToast,
        bonusToast, setBonusToast, completionSummary, setCompletionSummary,
        newAchievement, setNewAchievement,
        readSubmitting, restartSubmitting,
        handleRead, handleRestart, changeStartDate, checkAchievements
    } = useUserBibleActions(
        currentUser, setCurrentUser,
        setViewingDay,
        viewingDay,
        onReadComplete,
        requestCommunityRefresh,
    );

    // 4. Memos Hook
    const { memos, setMemos, memoLoadError, loadMemos, saveMemo } = useMemos(currentUser);

    // [Effect 1] Load Bible Content when viewingDay changes
    useEffect(() => {
        if (view !== 'dashboard' || !currentUser || viewingDay === null) return;
        loadContent(viewingDay);
    }, [view, currentUser?.uid, viewingDay, currentUser?.planId, currentUser?.dayOffset, loadContent]);

    // [Effect 2] 활동 공동체 전용 데이터. 공동체를 빠르게 바꿔도 이전
    // 요청 결과가 새 화면을 덮지 않도록 요청 세대를 확인한다.
    useEffect(() => {
        if (view !== 'dashboard' || !currentUser) return;

        if (viewingDay === null) {
            setViewingDay(currentUser.currentDay || 1);
        }

        const requestId = ++communityRequestRef.current;
        const isCurrentRequest = () => requestId === communityRequestRef.current;
        setAllMembersForRace([]);
        setDepartmentMembers([]);
        setSubgroupStats({});

        const loadCommunityData = async () => {
            const allMembers = await loadAllMembers();
            if (!isCurrentRequest()) return;
            setAllMembersForRace(allMembers);
            if (allMembers && allMembers.length > 0) {
                setSubgroupStats(calculateSubgroupStats(allMembers, communities));
                if (currentUser.departmentId) {
                    const myCommMembers = allMembers.filter(m => belongsToDepartment(m, currentUser.departmentId));
                    setDepartmentMembers(myCommMembers);
                } else setDepartmentMembers(allMembers);
            }
        };

        void loadCommunityData();
        void loadAnnouncement();
        void loadKakaoLink();
        return () => {
            if (communityRequestRef.current === requestId) communityRequestRef.current += 1;
        };
    }, [
        view,
        currentUser?.uid,
        currentUser?.churchId,
        currentUser?.departmentId,
        communityRefreshNonce,
        loadAllMembers, loadAnnouncement, loadKakaoLink,
        setAllMembersForRace, setSubgroupStats, setDepartmentMembers,
    ]);

    // [Effect 3] 사용자 공통 데이터. 공동체 전환과 무관하므로 uid가 같으면
    // 메모와 읽기 기록을 비우거나 다시 불러오지 않는다.
    useEffect(() => {
        if (view !== 'dashboard' || !currentUser?.uid) return;
        const uid = currentUser.uid;
        const requestId = ++userDataRequestRef.current;
        const isCurrentRequest = () => requestId === userDataRequestRef.current;

        const loadUserData = async () => {
            try {
                await loadMemos(uid);
            } catch {
                // useMemos가 빈 상태로 복구하고 memoLoadError를 노출한다.
            }
            try {
                const historySnap = await db.collection('users').doc(uid).collection('history')
                    .orderBy('date', 'desc').limit(365).get();
                if (isCurrentRequest()) setReadHistory(historySnap.docs.map(doc => doc.data()));
            } catch (error) {
                if (isCurrentRequest()) console.error('읽기 기록 불러오기 실패:', error);
            }
        };

        void loadUserData();
        return () => {
            if (userDataRequestRef.current === requestId) userDataRequestRef.current += 1;
        };
    }, [view, currentUser?.uid, loadMemos, setReadHistory]);

    // [Effect 4] Recompute subgroup stats when members OR communities change
    // communities arrives async after allMembersForRace, so this handles the timing gap
    useEffect(() => {
        if (!allMembersForRace || allMembersForRace.length === 0) return;
        setSubgroupStats(calculateSubgroupStats(allMembersForRace, communities));
    }, [allMembersForRace, communities, setSubgroupStats]);

    // Check if user has read today
    useEffect(() => {
        if (currentUser && currentUser.lastReadDate === new Date().toDateString()) {
            setHasReadToday(true);
        } else {
            setHasReadToday(false);
        }
    }, [currentUser, setHasReadToday]);

    return {
        // States
        verseData, setVerseData,
        subgroupStats, setSubgroupStats,
        departmentMembers, setDepartmentMembers,
        allMembersForRace, setAllMembersForRace,
        memos, setMemos,
        memoLoadError,
        readHistory, setReadHistory,
        announcement,
        kakaoLink,
        viewingDay, setViewingDay,
        hasReadToday, setHasReadToday,

        // UI States
        showConfetti, setShowConfetti,
        levelUpToast, setLevelUpToast,
        bonusToast, setBonusToast,
        completionSummary, setCompletionSummary,
        newAchievement, setNewAchievement,
        readSubmitting,
        restartSubmitting,

        // Actions
        handleRead,
        saveMemo: (readCount, day, memoText, onComplete) =>
            saveMemo(readCount, day, memoText, verseData?.subtitle, checkAchievements, onComplete),
        changeSubgroup,
        handleRestart,
        changeStartDate,

        // Data Loaders
        loadAllMembers,
        loadMemos,
        loadAnnouncement,
        loadKakaoLink,
        setKakaoLink // 셋터도 추가 (관리자용)
    };
};
