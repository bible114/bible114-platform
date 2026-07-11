import { useEffect, useCallback } from 'react';
import { auth, db } from '../utils/firebase';
import { calculateSubgroupStats } from '../utils/statsUtils';
import { belongsToDepartment } from '../utils/memberships';

// Sub-hooks
import { useBibleContent } from './useBibleContent';
import { useMemos } from './useMemos';
import { useDepartment } from './useDepartment';
import { useUserBibleActions } from './useUserBibleActions';

export const useBibleLogic = (currentUser, setCurrentUser, view, communities, onReadComplete) => {
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
        readSubmitting,
        handleRead, handleRestart, changeStartDate, checkAchievements
    } = useUserBibleActions(
        currentUser, setCurrentUser,
        setAllMembersForRace, setDepartmentMembers, setSubgroupStats,
        loadAllMembers,
        setViewingDay,
        viewingDay,
        onReadComplete
    );

    // 4. Memos Hook
    const { memos, setMemos, memoLoadError, loadMemos, saveMemo } = useMemos(currentUser);

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
            setDepartmentMembers([]);
            setSubgroupStats({});
            if (allMembers && allMembers.length > 0) {
                setSubgroupStats(calculateSubgroupStats(allMembers, communities));
                if (currentUser.departmentId) {
                    const myCommMembers = allMembers.filter(m => belongsToDepartment(m, currentUser.departmentId));
                    setDepartmentMembers(myCommMembers);
                }
            }

            // 2. Load User Specific Data (Memos & History)
            try {
                await loadMemos(uid);
            } catch {
                // useMemos가 빈 상태로 복구하고 memoLoadError를 노출한다.
                // 메모 한 항목의 조회 실패가 나머지 대시보드 로딩을 막지 않게 한다.
            }

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
        newAchievement, setNewAchievement,
        readSubmitting,

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
