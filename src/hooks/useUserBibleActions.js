import { useState, useCallback, useRef } from 'react';
import { auth, db, firebase } from '../utils/firebase';
import { ACHIEVEMENTS } from '../data/achievements';
import { getKstDateString } from '../data/bibleQuiz';
import { calculateSubgroupStats } from '../utils/statsUtils';
import { belongsToDepartment } from '../utils/memberships';
import { loadUserExtraOrgsStrict } from '../utils/roster';

export const useUserBibleActions = (
    currentUser,
    setCurrentUser,
    setAllMembersForRace,
    setDepartmentMembers,
    setSubgroupStats,
    loadAllMembers,
    setViewingDay,
    viewingDay,
    onReadComplete
) => {
    const [readHistory, setReadHistory] = useState([]);
    const [hasReadToday, setHasReadToday] = useState(false);
    const [showConfetti, setShowConfetti] = useState(false);
    const [levelUpToast, setLevelUpToast] = useState(null);
    const [bonusToast, setBonusToast] = useState(null);
    const [newAchievement, setNewAchievement] = useState(null);
    const [readSubmitting, setReadSubmitting] = useState(false);
    const readSubmittingRef = useRef(false);

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
        if (readSubmittingRef.current) return;
        if (!currentUser) return;
        readSubmittingRef.current = true;
        setReadSubmitting(true);
        const uid = currentUser.uid;
        const todayStr = new Date().toDateString();
        const vDay = viewingDay || currentUser.currentDay || 1;
        const submittedReadCount = currentUser.readCount || 1;

        try {
            // Firestore Transaction: 동시 다중 클릭/멀티 디바이스 race condition 방지
            // 문서에서 최신 값을 읽어 계산하므로 점수/진도 손실 없음
            let refreshedExtraOrgs = (Array.isArray(currentUser.extraOrgs) ? currentUser.extraOrgs : [])
                .filter(org => org?.uid === uid && typeof org.orgId === 'string' && org.orgId)
                .slice(0, 3);
            let shouldRefreshExtraOrgs = true;

            const commitRead = (rosterOrgs) => db.runTransaction(async (transaction) => {
                const userRef = db.collection('users').doc(uid);
                const userSnap = await transaction.get(userRef);
                if (!userSnap.exists) throw new Error('USER_NOT_FOUND');

                const data = userSnap.data();
                let currentProgressDay = data.currentDay || 1;
                if (currentProgressDay > 365) {
                    currentProgressDay = ((currentProgressDay - 1) % 365) + 1;
                }
                const storedReadCount = data.readCount || 1;

                // 같은 화면에서 이미 반영된 오늘의 완료 요청이면 아무것도 갱신하지 않는다.
                // (회차, Day) 진행 위치를 함께 비교해 365→1 순환 중복도 차단한다.
                // 상태가 갱신된 뒤 다음 진행일을 누르는 "한 장 더 읽기"는 정상 허용한다.
                const isRepeatedCompletion = data.lastReadDate === todayStr && (
                    submittedReadCount < storedReadCount ||
                    (submittedReadCount === storedReadCount && vDay < currentProgressDay)
                );
                if (isRepeatedCompletion) return null;

                const oldScore = data.score || 0;
                const oldLevel = Math.floor(oldScore / 100);
                const streakBonus = Math.min(5, data.streak || 0);
                const addedScore = 10 + streakBonus;
                const newScore = oldScore + addedScore;
                const newLevel = Math.floor(newScore / 100);

                const nextViewingDay = vDay >= 365 ? 1 : vDay + 1;
                const completedRound = currentProgressDay >= 365;
                const newProgressDay = completedRound ? 1 : currentProgressDay + 1;
                const newReadCount = completedRound ? (data.readCount || 1) + 1 : (data.readCount || 1);

                const isFirstReadToday = data.lastReadDate !== todayStr;
                let newStreak = 1;
                if (data.lastReadDate) {
                    const diffDays = Math.floor(
                        (new Date(todayStr) - new Date(data.lastReadDate)) / 86400000
                    );
                    if (diffDays === 1) newStreak = (data.streak || 0) + 1;
                    else if (diffDays === 0) newStreak = data.streak || 0;
                }
                const talentEarned = isFirstReadToday ? 10 + Math.min(newStreak, 7) : 0;
                const newTalent = (data.talent || 0) + talentEarned;
                const quizTodayKey = getKstDateString();
                const quizTalentEarned = data.quizDate === quizTodayKey && data.quizSolved === true
                    ? (data.quizAttempts === 1 ? 10 : 5)
                    : 0;
                const secretShopJustUnlocked = !data.secretShopUnlocked && newStreak >= 7;
                const today = new Date(todayStr);
                today.setHours(0, 0, 0, 0);
                const recentCutoff = new Date(today);
                recentCutoff.setDate(recentCutoff.getDate() - 13);
                const normalizedRecentDates = (Array.isArray(data.recentReadDates) ? data.recentReadDates : [])
                    .flatMap(value => {
                        if (!value) return [];
                        const date = value?.toDate ? value.toDate() : new Date(value);
                        if (Number.isNaN(date.getTime())) return [];
                        date.setHours(0, 0, 0, 0);
                        return date >= recentCutoff && date <= today ? [date.toDateString()] : [];
                    });
                const recentReadDates = Array.from(new Set([
                    ...normalizedRecentDates,
                    todayStr
                ]))
                    .sort((a, b) => new Date(a) - new Date(b))
                    .slice(-14);

                const historyItem = {
                    date: todayStr,
                    day: vDay,
                    score: addedScore,
                    talent: talentEarned,
                    ts: firebase.firestore.FieldValue.serverTimestamp()
                };
                const updateData = {
                    currentDay: newProgressDay,
                    readCount: newReadCount,
                    score: newScore,
                    talent: newTalent,
                    streak: newStreak,
                    lastReadDate: todayStr,
                    recentReadDates,
                    updatedAt: firebase.firestore.FieldValue.serverTimestamp()
                };
                if (secretShopJustUnlocked) {
                    updateData.secretShopUnlocked = true;
                }

                transaction.update(userRef, updateData);

                const rosterProgress = {
                    currentDay: newProgressDay,
                    readCount: newReadCount,
                    score: newScore,
                    streak: newStreak,
                    lastReadDate: todayStr,
                    updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
                };
                rosterOrgs.forEach(org => {
                    if (!org?.orgId) return;
                    const rosterRef = db.collection('churches').doc(org.orgId).collection('roster').doc(uid);
                    transaction.update(rosterRef, rosterProgress);
                });

                // history 서브컬렉션 쓰기 (배열 필드 대신 서브컬렉션만 사용 — 문서 크기 무한 증가 방지)
                const histRef = db.collection('users').doc(uid).collection('history').doc();
                transaction.set(histRef, historyItem);

                return {
                    updateData,
                    newLevel,
                    oldLevel,
                    streakBonus,
                    newStreak,
                    newReadCount,
                    nextViewingDay,
                    historyItem,
                    newProgressDay,
                    talentEarned,
                    quizTalentEarned,
                    totalTalent: newTalent,
                    secretShopJustUnlocked,
                    completedRound
                };
            });

            let resultData;
            try {
                resultData = await commitRead(refreshedExtraOrgs);
            } catch (firstError) {
                if (refreshedExtraOrgs.length === 0) throw firstError;
                try {
                    refreshedExtraOrgs = (await loadUserExtraOrgsStrict(uid)).slice(0, 3);
                } catch {
                    // 제명 행 때문에 첫 transaction이 원자 취소됐지만 명부 재조회도
                    // 일시 실패하면 개인 읽기는 보존한다. 다음 읽기의 절대 진도값이 roster를 복구한다.
                    refreshedExtraOrgs = [];
                    shouldRefreshExtraOrgs = false;
                }
                resultData = await commitRead(refreshedExtraOrgs);
            }

            if (!resultData) return;
            // 느린 roster 조회/transaction 사이 로그아웃·계정 전환이 일어나면
            // 이미 커밋된 원래 계정의 결과를 새 화면 상태에 적용하지 않는다.
            if (auth.currentUser?.uid !== uid) return;
            const {
                updateData,
                newLevel,
                oldLevel,
                streakBonus,
                newStreak,
                nextViewingDay,
                historyItem,
                talentEarned,
                quizTalentEarned,
                totalTalent,
                completedRound
            } = resultData;

            // 플랫폼 통계 업데이트 (fire & forget) — 날짜가 바뀌면 readers_today 리셋
            db.collection('settings').doc('platformStats').get().then(snap => {
                const prev = snap.exists ? snap.data() : {};
                const statsUpdate = {
                    readers_today: prev.today_date === todayStr
                        ? firebase.firestore.FieldValue.increment(1)
                        : 1,
                    today_date: todayStr,
                    updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
                };
                if (completedRound) statsUpdate.finished_total = firebase.firestore.FieldValue.increment(1);
                return db.collection('settings').doc('platformStats').set(statsUpdate, { merge: true });
            }).catch(() => {});

            const updatedUser = { ...currentUser, ...updateData };
            setCurrentUser(previous => previous?.uid === uid
                ? {
                    ...previous,
                    ...updateData,
                    ...(shouldRefreshExtraOrgs ? { extraOrgs: refreshedExtraOrgs } : {}),
                }
                : previous);
            setViewingDay(nextViewingDay);
            setHasReadToday(true);
            setReadHistory(prev => [historyItem, ...prev]);

            if (newLevel > oldLevel) {
                setLevelUpToast(true);
                setTimeout(() => setLevelUpToast(false), 5000);
            }
            if (completedRound) {
                setBonusToast(null);
            } else if (talentEarned > 0) {
                const todayTalentEarned = talentEarned + quizTalentEarned;
                setBonusToast(`오늘 +${todayTalentEarned}달란트! (읽기 ⭐${talentEarned} · 퀴즈 ⭐${quizTalentEarned}) · 보유 ⭐${totalTalent}`);
                setTimeout(() => setBonusToast(null), 3000);
            } else if (streakBonus > 0) {
                const scoreText = streakBonus > 0 ? `${newStreak}일 연속 보너스 +${streakBonus}pt` : `${newStreak}일 연속`;
                setBonusToast(`${scoreText}!`);
                setTimeout(() => setBonusToast(null), 3000);
            }

            const allMembers = await loadAllMembers();
            setAllMembersForRace(allMembers);
            setSubgroupStats(calculateSubgroupStats(allMembers));

            if (currentUser.departmentId) {
                const myCommMembers = allMembers.filter(m => belongsToDepartment(m, currentUser.departmentId));
                setDepartmentMembers(myCommMembers);
            }

            setShowConfetti(true);
            setTimeout(() => setShowConfetti(false), 3000);
            checkAchievements(updatedUser, {});
            if (onReadComplete) onReadComplete(resultData);
            window.scrollTo({ top: 0, behavior: 'smooth' });
        } catch (e) {
            if (e.message !== 'USER_NOT_FOUND') {
                console.error("읽기 처리 실패:", e);
                if (auth.currentUser?.uid === uid) {
                    setBonusToast('읽기 저장에 실패했습니다. 잠시 후 다시 눌러주세요.');
                    setTimeout(() => setBonusToast(null), 4000);
                }
            }
        } finally {
            readSubmittingRef.current = false;
            setReadSubmitting(false);
        }
    }, [currentUser, viewingDay, setCurrentUser, setViewingDay, loadAllMembers, setAllMembersForRace, setDepartmentMembers, setSubgroupStats, checkAchievements, onReadComplete]);

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
        readSubmitting,
        handleRead,
        handleRestart,
        changeStartDate,
        checkAchievements
    };
};
