import { useEffect, useCallback } from 'react';
import { auth, db } from '../utils/firebase';
import { calculateSubgroupStats } from '../utils/statsUtils';

// Sub-hooks
import { useBibleContent } from './useBibleContent';
import { useMemos } from './useMemos';
import { useDepartment } from './useDepartment';
import { useUserBibleActions } from './useUserBibleActions';

export const useBibleLogic = (currentUser, setCurrentUser, view, communities) => {
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
        bonusToast, setBonusToast, newAchievement, setNewAchievement,
        handleRead, handleRestart, changeStartDate, checkAchievements
    } = useUserBibleActions(
        currentUser, setCurrentUser,
        setAllMembersForRace, setDepartmentMembers, setSubgroupStats,
        loadAllMembers,
        setViewingDay,
        viewingDay
    );

    // 4. Memos Hook
    const { memos, setMemos, loadMemos, saveMemo } = useMemos(currentUser);

    // [Effect 1] Load Bible Content when viewingDay changes
    useEffect(() => {
        if (view !== 'dashboard' || !currentUser || viewingDay === null) return;
        loadContent(viewingDay);
    }, [view, currentUser?.uid, viewingDay, currentUser?.planId, currentUser?.dayOffset, loadContent]);

    // [Effect 2] Initial full load when entering dashboard or user changes
    useEffect(() => {
        if (view !== 'dashboard' || !currentUser) return;

        // initial viewingDay setting
        if (viewingDay === null) {
            setViewingDay(currentUser.currentDay || 1);
        }

        const loadDashboardData = async () => {
            const uid = currentUser.uid;

            // 1. Load Community Data
            const allMembers = await loadAllMembers();
            setAllMembersForRace(allMembers);
            if (allMembers && allMembers.length > 0) {
                setSubgroupStats(calculateSubgroupStats(allMembers, communities));
                if (currentUser.departmentId) {
                    const myCommMembers = allMembers.filter(m => m.departmentId === currentUser.departmentId);
                    setDepartmentMembers(myCommMembers);
                }
            }

            // 2. Load User Specific Data (Memos & History)
            await loadMemos(uid);

            // readHistory: 서브컬렉션만 사용 (배열 필드는 문서 크기 무한 증가 문제로 폐기)
            const historySnap = await db.collection('users').doc(uid).collection('history')
                .orderBy('date', 'desc').limit(365).get();
            setReadHistory(historySnap.docs.map(doc => doc.data()));

            // 3. Load Announcements & Links
            await loadAnnouncement();
            await loadKakaoLink();
        };

        loadDashboardData();
    }, [
        view,
        currentUser?.uid,
        // We removed viewingDay from here to prevent re-fetching on every day change
        loadAllMembers, loadMemos, loadAnnouncement, loadKakaoLink,
        setAllMembersForRace, setSubgroupStats, setDepartmentMembers, setReadHistory
    ]);

    // [Effect 3] Recompute subgroup stats when members OR communities change
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
        readHistory, setReadHistory,
        announcement,
        kakaoLink,
        viewingDay, setViewingDay,
        hasReadToday, setHasReadToday,

        // UI States
        showConfetti, setShowConfetti,
        levelUpToast, setLevelUpToast,
        bonusToast, setBonusToast,
        newAchievement, setNewAchievement,

        // Actions
        handleRead,
        saveMemo: (readCount, day, memoText, onComplete) =>
            saveMemo(readCount, day, memoText, verseData?.subtitle, checkAchievements, onComplete),
        changeSubgroup,
        handleRestart: () => handleRestart(setReadHistory),
        changeStartDate,

        // Data Loaders
        loadAllMembers,
        loadMemos,
        loadAnnouncement,
        loadKakaoLink,
        setKakaoLink // 셋터도 추가 (관리자용)
    };
};
