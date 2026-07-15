import { useState, useCallback, useRef } from 'react';
import { auth, db, firebase } from '../utils/firebase';
import { ACHIEVEMENTS, getNewAchievementIds, mergeAchievementIds } from '../data/achievements';
import { calculateSubgroupStats } from '../utils/statsUtils';
import { belongsToDepartment } from '../utils/memberships';
import { updateRosterTalents } from '../utils/talentWallet';
import { completeRead } from '../utils/platformApi';
import {
    clearActivityRequest,
    getOrCreateReadActivityRequest,
} from '../utils/userActivityRequests';

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
    const [completionSummary, setCompletionSummary] = useState(null);
    const [newAchievement, setNewAchievement] = useState(null);
    const [readSubmitting, setReadSubmitting] = useState(false);
    const readSubmittingRef = useRef(false);

    const checkAchievements = useCallback(async (user, userMemos, deferToast = false) => {
        if (!user?.uid) return [];
        const userRef = db.collection('users').doc(user.uid);
        const result = await db.runTransaction(async transaction => {
            const snap = await transaction.get(userRef);
            if (!snap.exists) return null;
            const latest = { ...user, ...snap.data(), uid: user.uid };
            const newIds = getNewAchievementIds(latest, userMemos);
            if (newIds.length === 0) {
                return { achievements: mergeAchievementIds(latest.achievements, []), newIds: [] };
            }
            const achievements = mergeAchievementIds(latest.achievements, newIds);
            transaction.update(userRef, { achievements });
            return { achievements, newIds };
        });
        if (!result) return [];

        setCurrentUser(previous => previous?.uid === user.uid
            ? { ...previous, achievements: result.achievements }
            : previous);
        if (result.newIds.length > 0) {
            const newest = ACHIEVEMENTS.find(item => item.id === result.newIds[result.newIds.length - 1]);
            if (newest) {
                const show = () => {
                    setNewAchievement(newest);
                    setTimeout(() => setNewAchievement(null), 5000);
                };
                if (deferToast) setTimeout(show, 5200);
                else show();
            }
        }
        return result.newIds;
    }, [setCurrentUser]);

    const handleRead = useCallback(async () => {
        if (readSubmittingRef.current) return;
        if (!currentUser) return;
        readSubmittingRef.current = true;
        setReadSubmitting(true);
        const uid = currentUser.uid;
        const vDay = viewingDay || currentUser.currentDay || 1;
        const submittedReadCount = currentUser.readCount || 1;
        let activityRequest = null;
        let response = null;

        try {
            try {
                activityRequest = getOrCreateReadActivityRequest({
                    uid,
                    cycle: submittedReadCount,
                    day: vDay,
                });
                response = await completeRead(
                    activityRequest.payload.cycle,
                    activityRequest.payload.day,
                    { requestId: activityRequest.requestId, expectedUid: uid },
                );
            } catch (error) {
                const shouldPreserveRequest = error?.retryable === true
                    || error?.status >= 500
                    || error?.code === 'TIMEOUT'
                    || error?.code === 'NETWORK_ERROR'
                    || (error?.code === 'INVALID_RESPONSE'
                        && error?.status >= 200 && error?.status < 300);
                if (activityRequest && !shouldPreserveRequest) {
                    clearActivityRequest(activityRequest);
                }
                console.error('읽기 처리 실패:', error);
                if (auth.currentUser?.uid === uid) {
                    setBonusToast('읽기 저장에 실패했습니다. 잠시 후 다시 눌러주세요.');
                    setTimeout(() => setBonusToast(null), 4000);
                }
                return;
            }

            // 정상 2xx 응답은 ready/replay/제한·위치 불일치까지 결정적인 결과다.
            // 응답 유실·재시도 가능 오류일 때만 위 catch에서 같은 요청 번호를 보존한다.
            clearActivityRequest(activityRequest);
            if (auth.currentUser?.uid !== uid) return;

            try {
                const rosterTalentByOrgId = Object.fromEntries(
                    response.state.rosters.map(item => [item.orgId, item.talent]),
                );
                const updatedUser = updateRosterTalents(
                    { ...currentUser, ...response.state.user },
                    rosterTalentByOrgId,
                    { authoritative: true },
                );
                setCurrentUser(previous => previous?.uid === uid
                    ? updateRosterTalents(
                        { ...previous, ...response.state.user },
                        rosterTalentByOrgId,
                        { authoritative: true },
                    )
                    : previous);
                setHasReadToday(response.state.user.lastReadDate === response.calendarDate);

                if (response.result.status === 'dailyLimit') {
                    setViewingDay(response.state.user.currentDay);
                    setBonusToast('오늘 읽을 수 있는 분량을 모두 완료했어요. 내일 다시 만나요!');
                    setTimeout(() => setBonusToast(null), 4000);
                    return;
                }
                if (response.result.status === 'positionMismatch') {
                    setViewingDay(response.state.user.currentDay);
                    setBonusToast('읽기 진행 상태가 바뀌어 최신 위치로 이동했어요. 다시 눌러주세요.');
                    setTimeout(() => setBonusToast(null), 4000);
                    return;
                }

                const summary = response.result.summary;
                const isFirstReadToday = summary.scoreEarned > 0;
                const quizTalentEarned = currentUser.quizRewardDate === response.calendarDate
                    ? (Number(currentUser.quizRewardAmount) || 0)
                    : (currentUser.quizDate === response.calendarDate && currentUser.quizSolved === true
                        ? (currentUser.quizAttempts === 1 ? 10 : (currentUser.quizAttempts === 2 ? 5 : 0))
                        : 0);
                const preferredRosterOrgId = currentUser.churchId || currentUser.primaryOrgId;
                const totalTalent = summary.rewardsUserWallet
                    ? response.state.user.talent
                    : (rosterTalentByOrgId[preferredRosterOrgId] || 0);
                const historyItem = {
                    action: 'completeRead',
                    requestId: response.requestId,
                    date: response.calendarDate,
                    day: activityRequest.payload.day,
                    score: summary.scoreEarned,
                    talent: summary.talentEarned,
                    ts: new Date(),
                };
                const completionResult = {
                    ...summary,
                    updateData: response.state.user,
                    isFirstReadToday,
                    quizTalentEarned,
                    totalTalent,
                    rosterTalentByOrgId,
                    historyItem,
                    alreadyCompleted: response.alreadyCompleted,
                };

                setViewingDay(response.state.user.currentDay);
                setReadHistory(previous => previous.some(item => item?.requestId === response.requestId)
                    ? previous
                    : [historyItem, ...previous]);

                if (summary.newLevel > summary.oldLevel) {
                    setLevelUpToast(true);
                    setTimeout(() => setLevelUpToast(false), 5000);
                }
                setBonusToast(null);
                setCompletionSummary({
                    scoreEarned: summary.scoreEarned,
                    talentEarned: summary.talentEarned > 0
                        ? summary.talentEarned + quizTalentEarned
                        : 0,
                    isFirstReadToday,
                    quizRewardLimited: summary.talentEarned === 0 && quizTalentEarned > 0,
                    talentProgramEnabled: summary.talentProgramEnabled,
                });

                // 아래 작업은 이미 성공한 읽기 저장과 분리한다.
                // 실패해도 사용자에게 저장 실패로 표시하지 않는다.
                try {
                    const allMembers = await loadAllMembers();
                    if (auth.currentUser?.uid === uid) {
                        setAllMembersForRace(allMembers);
                        setSubgroupStats(calculateSubgroupStats(allMembers));
                        if (updatedUser.departmentId) {
                            const myCommMembers = allMembers.filter(member => (
                                belongsToDepartment(member, updatedUser.departmentId)
                            ));
                            setDepartmentMembers(myCommMembers);
                        }
                    }
                } catch (refreshError) {
                    console.warn('읽기 완료 후 회원 목록 새로고침 실패:', refreshError);
                }
                if (auth.currentUser?.uid === uid) {
                    try {
                        await checkAchievements(
                            updatedUser,
                            {},
                            summary.newLevel > summary.oldLevel,
                        );
                    } catch (achievementError) {
                        console.warn('읽기 완료 후 업적 확인 실패:', achievementError);
                    }
                }
                if (auth.currentUser?.uid === uid) {
                    try {
                        if (onReadComplete) onReadComplete(completionResult);
                    } catch (callbackError) {
                        console.warn('읽기 완료 후 화면 효과 처리 실패:', callbackError);
                    }
                }
            } catch (error) {
                console.error('저장된 읽기 결과 반영 실패:', error);
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
                lastReadDate: null, achievements: [], dailyAdvanceDate: null, dailyAdvanceCount: 0,
                updatedAt: firebase.firestore.FieldValue.serverTimestamp()
            }, { merge: true });

            setCurrentUser(prev => ({
                ...prev, currentDay: 1, score: 0, streak: 0, startDate: today,
                lastReadDate: null, achievements: [], readCount: 1, dailyAdvanceDate: null, dailyAdvanceCount: 0
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
        completionSummary,
        setCompletionSummary,
        newAchievement,
        setNewAchievement,
        readSubmitting,
        handleRead,
        handleRestart,
        changeStartDate,
        checkAchievements
    };
};
