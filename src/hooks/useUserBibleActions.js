import { useState, useCallback } from 'react';
import { db, firebase } from '../utils/firebase';
import { ACHIEVEMENTS } from '../data/achievements';
import { calculateSubgroupStats } from '../utils/statsUtils';

export const useUserBibleActions = (
    currentUser,
    setCurrentUser,
    setAllMembersForRace,
    setDepartmentMembers,
    setSubgroupStats,
    loadAllMembers,
    setViewingDay,
    viewingDay
) => {
    const [readHistory, setReadHistory] = useState([]);
    const [hasReadToday, setHasReadToday] = useState(false);
    const [showConfetti, setShowConfetti] = useState(false);
    const [levelUpToast, setLevelUpToast] = useState(null);
    const [bonusToast, setBonusToast] = useState(null);
    const [newAchievement, setNewAchievement] = useState(null);

    const checkAchievements = useCallback((user, userMemos) => {
        if (!user) return;
        const newEarned = [];
        const currentEarnedIds = new Set(user.achievements || []);

        ACHIEVEMENTS.forEach(ach => {
            if (currentEarnedIds.has(ach.id)) return;
            if (ach.condition(user, userMemos)) {
                newEarned.push(ach.id);
                setNewAchievement((prev) => ach); // Use callback to ensure we handle quick successions?
                setTimeout(() => setNewAchievement(null), 5000);
            }
        });

        if (newEarned.length > 0) {
            const updated = [...(user.achievements || []), ...newEarned];
            db.collection('users').doc(user.uid).update({ achievements: updated });
        }
    }, []);

    const handleRead = useCallback(async () => {
        if (!currentUser) return;
        const uid = currentUser.uid;
        const todayStr = new Date().toDateString();
        const vDay = viewingDay || currentUser.currentDay || 1;

        let resultData = null;
        let completedRound = false;

        try {
            // Firestore Transaction: 동시 다중 클릭/멀티 디바이스 race condition 방지
            // 문서에서 최신 값을 읽어 계산하므로 점수/진도 손실 없음
            await db.runTransaction(async (transaction) => {
                const userRef = db.collection('users').doc(uid);
                const userSnap = await transaction.get(userRef);
                if (!userSnap.exists) throw new Error('USER_NOT_FOUND');

                const data = userSnap.data();

                let currentProgressDay = data.currentDay || 1;
                if (currentProgressDay > 365) {
                    currentProgressDay = ((currentProgressDay - 1) % 365) + 1;
                }

                const oldScore = data.score || 0;
                const oldLevel = Math.floor(oldScore / 100);
                const streakBonus = Math.min(5, data.streak || 0);
                const addedScore = 10 + streakBonus;
                const newScore = oldScore + addedScore;
                const newLevel = Math.floor(newScore / 100);

                const nextViewingDay = vDay >= 365 ? 1 : vDay + 1;
                completedRound = currentProgressDay >= 365;
                const newProgressDay = completedRound ? 1 : currentProgressDay + 1;
                const newReadCount = completedRound ? (data.readCount || 1) + 1 : (data.readCount || 1);

                let newStreak = 1;
                if (data.lastReadDate) {
                    const diffDays = Math.floor(
                        (new Date(todayStr) - new Date(data.lastReadDate)) / 86400000
                    );
                    if (diffDays === 1) newStreak = (data.streak || 0) + 1;
                    else if (diffDays === 0) newStreak = data.streak || 0;
                }

                const historyItem = { date: todayStr, day: vDay, score: addedScore };
                const updateData = {
                    currentDay: newProgressDay,
                    readCount: newReadCount,
                    score: newScore,
                    streak: newStreak,
                    lastReadDate: todayStr,
                    updatedAt: firebase.firestore.FieldValue.serverTimestamp()
                };

                transaction.update(userRef, updateData);

                // history 서브컬렉션 쓰기 (배열 필드 대신 서브컬렉션만 사용 — 문서 크기 무한 증가 방지)
                const histRef = db.collection('users').doc(uid).collection('history').doc();
                transaction.set(histRef, historyItem);

                resultData = { updateData, newLevel, oldLevel, streakBonus, newStreak, newReadCount, nextViewingDay, historyItem, newProgressDay };
            });

            if (!resultData) return;
            const { updateData, newLevel, oldLevel, streakBonus, newStreak, newReadCount, nextViewingDay, historyItem, newProgressDay } = resultData;

            // 플랫폼 통계 업데이트 (fire & forget)
            const statsUpdate = {
                readers_today: firebase.firestore.FieldValue.increment(1),
                today_date: todayStr,
                updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
            };
            if (completedRound) statsUpdate.finished_total = firebase.firestore.FieldValue.increment(1);
            db.collection('settings').doc('platformStats').set(statsUpdate, { merge: true }).catch(() => {});

            const updatedUser = { ...currentUser, ...updateData };
            setCurrentUser(updatedUser);
            setViewingDay(nextViewingDay);
            setHasReadToday(true);
            setReadHistory(prev => [historyItem, ...prev]);

            if (newLevel > oldLevel) {
                setLevelUpToast(true);
                setTimeout(() => setLevelUpToast(false), 5000);
            }
            if (streakBonus > 0) {
                setBonusToast(`${newStreak}일 연속 보너스 +${streakBonus}pt!`);
                setTimeout(() => setBonusToast(null), 3000);
            }

            const allMembers = await loadAllMembers();
            setAllMembersForRace(allMembers);
            setSubgroupStats(calculateSubgroupStats(allMembers));

            if (currentUser.departmentId) {
                const myCommMembers = allMembers.filter(m => m.departmentId === currentUser.departmentId);
                setDepartmentMembers(myCommMembers);
            }

            if (completedRound) {
                alert(`🎉 축하합니다! ${newReadCount - 1}독을 완료하셨습니다!\n\n이제 ${newReadCount}독을 시작합니다! 🏃‍♂️`);
            }

            setShowConfetti(true);
            setTimeout(() => setShowConfetti(false), 3000);
            checkAchievements(updatedUser, {});
            window.scrollTo({ top: 0, behavior: 'smooth' });
        } catch (e) {
            if (e.message !== 'USER_NOT_FOUND') console.error("읽기 처리 실패:", e);
        }
    }, [currentUser, viewingDay, setCurrentUser, setViewingDay, loadAllMembers, setAllMembersForRace, setDepartmentMembers, setSubgroupStats, checkAchievements]);

    const handleRestart = useCallback(async (setReadHistory) => {
        if (!currentUser) return;
        const uid = currentUser.uid;

        try {
            const today = new Date().toDateString();
            // memos는 보존 — 재시작해도 묵상 기록은 유지
            await db.collection('users').doc(uid).set({
                currentDay: 1, score: 0, streak: 0, startDate: today,
                lastReadDate: null, achievements: [],
                updatedAt: firebase.firestore.FieldValue.serverTimestamp()
            }, { merge: true });

            setCurrentUser(prev => ({
                ...prev, currentDay: 1, score: 0, streak: 0, startDate: today,
                lastReadDate: null, achievements: [], readCount: 1
            }));
            if (setReadHistory) setReadHistory([]);
            alert('재시작되었습니다! 오늘부터 Day 1입니다. 화이팅! 🔥');
        } catch (e) {
            console.error("재시작 실패:", e);
            alert('재시작 실패');
        }
    }, [currentUser, setCurrentUser]);

    const changeStartDate = useCallback(async (dayOffset) => {
        if (!currentUser) return;
        const uid = currentUser.uid;

        try {
            await db.collection('users').doc(uid).set({
                dayOffset: dayOffset,
                updatedAt: firebase.firestore.FieldValue.serverTimestamp()
            }, { merge: true });

            setCurrentUser(prev => ({ ...prev, dayOffset: dayOffset }));
        } catch (e) {
            console.error("날짜 설정 실패:", e);
        }
    }, [currentUser, setCurrentUser]);

    return {
        readHistory,
        setReadHistory,
        hasReadToday,
        setHasReadToday,
        showConfetti,
        setShowConfetti,
        levelUpToast,
        setLevelUpToast,
        bonusToast,
        setBonusToast,
        newAchievement,
        setNewAchievement,
        handleRead,
        handleRestart,
        changeStartDate,
        checkAchievements
    };
};
