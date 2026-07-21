import { useState, useCallback, useEffect, useRef } from 'react';
import { auth, db, firebase } from '../utils/firebase';
import { ACHIEVEMENTS } from '../data/achievements';
import { completeRead, restartReading, syncAchievements } from '../utils/platformApi';
import {
    isLatestCanonicalUserState,
    loadCanonicalUserStateFromServer,
} from '../utils/userStateSync';
import {
    clearActivityRequest,
    getOrCreateReadActivityRequest,
    getOrCreateRestartActivityRequest,
} from '../utils/userActivityRequests';

const readingPosition = (user) => ({
    cycle: Number.isSafeInteger(user?.readCount) && user.readCount >= 1 ? user.readCount : 1,
    day: Number.isSafeInteger(user?.currentDay) && user.currentDay >= 1 ? user.currentDay : 1,
    readingEpoch: Number.isSafeInteger(user?.readingEpoch) && user.readingEpoch >= 0
        ? user.readingEpoch
        : 0,
});

const sameReadingPosition = (left, right) => left?.cycle === right?.cycle
    && left?.day === right?.day
    && left?.readingEpoch === right?.readingEpoch;

export const useUserBibleActions = (
    currentUser,
    setCurrentUser,
    setViewingDay,
    viewingDay,
    onReadComplete,
    requestCommunityRefresh,
) => {
    const currentUserRef = useRef(currentUser);
    currentUserRef.current = currentUser;
    const [readHistory, setReadHistory] = useState([]);
    const [hasReadToday, setHasReadToday] = useState(false);
    const [showConfetti, setShowConfetti] = useState(false);
    const [levelUpToast, setLevelUpToast] = useState(null);
    const [bonusToast, setBonusToast] = useState(null);
    const [completionSummary, setCompletionSummary] = useState(null);
    const [newAchievement, setNewAchievement] = useState(null);
    const [readSubmitting, setReadSubmitting] = useState(false);
    const readSubmittingRef = useRef(false);
    const [restartSubmitting, setRestartSubmitting] = useState(false);
    const restartSubmittingRef = useRef(false);
    const achievementToastRef = useRef(null);
    const achievementToastScheduleRef = useRef(0);
    const completionSummaryTimerRef = useRef(null);

    useEffect(() => {
        achievementToastScheduleRef.current += 1;
        achievementToastRef.current = null;
        setNewAchievement(null);
        if (completionSummaryTimerRef.current) clearTimeout(completionSummaryTimerRef.current);
        completionSummaryTimerRef.current = null;
        setCompletionSummary(null);
    }, [currentUser?.uid]);

    useEffect(() => () => {
        if (completionSummaryTimerRef.current) clearTimeout(completionSummaryTimerRef.current);
    }, []);

    const syncLatestUser = useCallback(async (uid) => {
        if (auth.currentUser?.uid !== uid) return null;
        const freshUser = await loadCanonicalUserStateFromServer(uid);
        if (auth.currentUser?.uid !== uid || freshUser?.uid !== uid
            || !isLatestCanonicalUserState(uid, freshUser)) return null;
        // 이어서 끝나는 다른 비동기 작업도 렌더 전의 오래된 ref를 보지 않게 한다.
        currentUserRef.current = freshUser;
        // response 일부를 merge하지 않고 source:'server'에서 읽은 base user를 적용한다.
        setCurrentUser(freshUser);
        return freshUser;
    }, [setCurrentUser]);

    const showAchievementToast = useCallback((uid, achievementId, deferToast = false) => {
        const achievement = ACHIEVEMENTS.find(item => item.id === achievementId);
        if (!uid || !achievement) return;
        const scheduleGeneration = ++achievementToastScheduleRef.current;
        const show = () => {
            if (achievementToastScheduleRef.current !== scheduleGeneration
                || auth.currentUser?.uid !== uid
                || currentUserRef.current?.uid !== uid
                || !Array.isArray(currentUserRef.current?.achievements)
                || !currentUserRef.current.achievements.includes(achievementId)) return;
            const toastToken = { uid, achievementId, scheduleGeneration };
            achievementToastRef.current = toastToken;
            setNewAchievement(achievement);
            setTimeout(() => {
                if (auth.currentUser?.uid !== uid
                    || achievementToastRef.current?.uid !== uid
                    || achievementToastRef.current?.achievementId !== achievementId
                    || achievementToastRef.current?.scheduleGeneration !== scheduleGeneration) return;
                achievementToastRef.current = null;
                setNewAchievement(null);
            }, 5000);
        };
        if (deferToast) setTimeout(show, 5200);
        else show();
    }, []);

    const checkAchievements = useCallback(async (
        user,
        trigger = 'memo',
        deferToast = false,
        options = {},
    ) => {
        const uid = user?.uid;
        if (!uid || auth.currentUser?.uid !== uid) return [];
        const response = await syncAchievements(trigger, { expectedUid: uid });
        if (auth.currentUser?.uid !== uid) return [];
        const returnedIds = response.result.newIds;

        // read 경로는 caller가 completion 위치를 재검증한 뒤 final source sync를
        // 수행한다. 서버 응답 snapshot이나 현재 렌더 상태는 여기서 합치지 않는다.
        if (options.applyLocal === false) return returnedIds;

        const freshUser = await syncLatestUser(uid);
        if (!freshUser || auth.currentUser?.uid !== uid) return [];
        const freshAchievementIds = new Set(
            Array.isArray(freshUser.achievements) ? freshUser.achievements : [],
        );
        const confirmedIds = returnedIds.filter(achievementId => freshAchievementIds.has(achievementId));
        if (options.showToast !== false && confirmedIds.length > 0) {
            showAchievementToast(uid, confirmedIds[confirmedIds.length - 1], deferToast);
        }
        return confirmedIds;
    }, [showAchievementToast, syncLatestUser]);

    const handleRead = useCallback(async () => {
        const requestStartUser = currentUserRef.current;
        if (readSubmittingRef.current || !requestStartUser?.uid) return;
        const requestedDay = viewingDay || requestStartUser.currentDay || 1;
        const currentProgressDay = requestStartUser.currentDay || 1;
        if (Number(requestedDay) !== Number(currentProgressDay)) {
            setViewingDay(currentProgressDay);
            setBonusToast(`DAY ${currentProgressDay}(으)로 돌아간 뒤 읽기 완료를 눌러주세요.`);
            setTimeout(() => setBonusToast(null), 4000);
            return;
        }
        readSubmittingRef.current = true;
        setReadSubmitting(true);
        const uid = requestStartUser.uid;
        const vDay = requestedDay;
        const submittedReadCount = requestStartUser.readCount || 1;
        const preferredRosterOrgId = requestStartUser.talentWalletOrgId
            || requestStartUser.churchId
            || requestStartUser.primaryOrgId;
        let activityRequest = null;
        let response = null;

        try {
            try {
                activityRequest = getOrCreateReadActivityRequest({
                    uid,
                    cycle: submittedReadCount,
                    day: vDay,
                    readingEpoch: requestStartUser.readingEpoch ?? 0,
                });
                response = await completeRead(
                    activityRequest.payload.cycle,
                    activityRequest.payload.day,
                    {
                        requestId: activityRequest.requestId,
                        expectedUid: uid,
                        readingEpoch: activityRequest.payload.readingEpoch,
                    },
                );
            } catch (error) {
                const shouldPreserveRequest = error?.retryable === true
                    || error?.status >= 500
                    || error?.code === 'TIMEOUT'
                    || error?.code === 'NETWORK_ERROR'
                    || (error?.code === 'INVALID_RESPONSE'
                        && error?.status >= 200 && error?.status < 300);
                if (activityRequest && !shouldPreserveRequest) clearActivityRequest(activityRequest);
                console.error('읽기 처리 실패:', error);
                if (auth.currentUser?.uid === uid) {
                    setBonusToast('읽기 저장에 실패했습니다. 잠시 후 다시 눌러주세요.');
                    setTimeout(() => setBonusToast(null), 4000);
                }
                return;
            }

            // strict 2xx는 결정적이므로 requestId를 먼저 정리한다. 그 뒤 응답 snapshot을
            // 적용하지 않고 서버 원본을 다시 읽어 다른 탭의 후속 쓰기까지 흡수한다.
            clearActivityRequest(activityRequest);
            if (auth.currentUser?.uid !== uid) return;
            let freshUser;
            try {
                freshUser = await syncLatestUser(uid);
            } catch (syncError) {
                console.error('읽기 완료 후 최신 사용자 동기화 실패:', syncError);
                if (auth.currentUser?.uid === uid) {
                    setBonusToast('읽기는 처리됐지만 최신 상태를 불러오지 못했습니다. 잠시 후 다시 확인해주세요.');
                    setTimeout(() => setBonusToast(null), 5000);
                }
                return;
            }
            if (!freshUser || auth.currentUser?.uid !== uid) return;
            requestCommunityRefresh?.();
            setViewingDay(freshUser.currentDay);
            setHasReadToday(freshUser.lastReadDate === response.calendarDate);

            const responsePosition = response.result.status === 'ready'
                ? {
                    cycle: response.result.summary.newReadCount,
                    day: response.result.summary.newProgressDay,
                    readingEpoch: activityRequest.payload.readingEpoch,
                }
                : {
                    cycle: response.state.user.readCount,
                    day: response.state.user.currentDay,
                    readingEpoch: activityRequest.payload.readingEpoch,
                };
            if (!sameReadingPosition(readingPosition(freshUser), responsePosition)) {
                // 더 최신 read/restart가 이미 반영됐다. fresh user만 유지하고 오래된
                // completion/toast/history 화면 효과는 적용하지 않는다.
                return;
            }
            if (response.result.status === 'positionMismatch') {
                setBonusToast('읽기 진행 상태가 바뀌어 최신 위치로 이동했어요. 다시 눌러주세요.');
                setTimeout(() => setBonusToast(null), 4000);
                return;
            }

            const summary = response.result.summary;
            let achievementIds = [];
            try {
                achievementIds = await checkAchievements(
                    freshUser,
                    'read',
                    false,
                    { applyLocal: false, showToast: false },
                );
            } catch (achievementError) {
                console.warn('읽기 완료 후 업적 확인 실패:', achievementError);
            }

            // 업적 transaction을 기다리는 동안 다른 탭에서 이어진 action도 포함해
            // 마지막으로 한 번 더 source-server 상태를 확정한다.
            try {
                freshUser = await syncLatestUser(uid);
            } catch (syncError) {
                console.error('읽기 완료 후 최종 사용자 동기화 실패:', syncError);
                if (auth.currentUser?.uid === uid) {
                    setBonusToast('읽기는 처리됐지만 최신 상태 확인을 마치지 못했습니다. 잠시 후 다시 확인해주세요.');
                    setTimeout(() => setBonusToast(null), 5000);
                }
                return;
            }
            if (!freshUser || auth.currentUser?.uid !== uid) return;
            requestCommunityRefresh?.();
            setViewingDay(freshUser.currentDay);
            setHasReadToday(freshUser.lastReadDate === response.calendarDate);
            if (!sameReadingPosition(readingPosition(freshUser), responsePosition)) return;
            const freshAchievementIds = new Set(
                Array.isArray(freshUser.achievements) ? freshUser.achievements : [],
            );
            achievementIds = achievementIds.filter(achievementId => freshAchievementIds.has(achievementId));

            const isFirstReadToday = summary.scoreEarned > 0;
            const quizTalentEarned = freshUser.quizRewardDate === response.calendarDate
                ? (Number(freshUser.quizRewardAmount) || 0)
                : (freshUser.quizDate === response.calendarDate && freshUser.quizSolved === true
                    ? (freshUser.quizAttempts === 1 ? 10 : (freshUser.quizAttempts === 2 ? 5 : 0))
                    : 0);
            const rosterTalentByOrgId = Object.fromEntries(
                (freshUser.extraOrgs || []).map(org => [org.orgId, Number(org.talent) || 0]),
            );
            const totalTalent = summary.rewardsUserWallet
                ? (Number(freshUser.talent) || 0)
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
                updateData: freshUser,
                isFirstReadToday,
                quizTalentEarned,
                totalTalent,
                rosterTalentByOrgId,
                historyItem,
                alreadyCompleted: response.alreadyCompleted,
            };

            setReadHistory(previous => previous.some(item => item?.requestId === response.requestId)
                ? previous
                : [historyItem, ...previous]);
            if (summary.newLevel > summary.oldLevel) {
                setLevelUpToast(true);
                setTimeout(() => setLevelUpToast(false), 5000);
            }
            setBonusToast(null);
            const nextCompletionSummary = {
                uid,
                requestId: response.requestId,
                completedDay: activityRequest.payload.day,
                scoreEarned: summary.scoreEarned,
                talentEarned: summary.talentEarned > 0
                    ? summary.talentEarned + quizTalentEarned
                    : 0,
                readingTalentEarned: summary.talentEarned,
                quizTalentEarned,
                isFirstReadToday,
                quizRewardLimited: summary.talentEarned === 0 && quizTalentEarned > 0,
                talentProgramEnabled: summary.talentProgramEnabled,
            };
            setCompletionSummary(nextCompletionSummary);
            if (completionSummaryTimerRef.current) clearTimeout(completionSummaryTimerRef.current);
            completionSummaryTimerRef.current = setTimeout(() => {
                setCompletionSummary(previous => previous?.requestId === nextCompletionSummary.requestId
                    ? null
                    : previous);
                completionSummaryTimerRef.current = null;
            }, 10_000);

            if (achievementIds.length > 0) {
                showAchievementToast(
                    uid,
                    achievementIds[achievementIds.length - 1],
                    summary.newLevel > summary.oldLevel,
                );
            }
            if (auth.currentUser?.uid === uid) {
                try {
                    onReadComplete?.(completionResult);
                } catch (callbackError) {
                    console.warn('읽기 완료 후 화면 효과 처리 실패:', callbackError);
                }
            }
        } finally {
            readSubmittingRef.current = false;
            setReadSubmitting(false);
        }
    }, [
        viewingDay,
        syncLatestUser,
        setViewingDay,
        checkAchievements,
        showAchievementToast,
        onReadComplete,
        requestCommunityRefresh,
    ]);

    const handleRestart = useCallback(async () => {
        const requestStartUser = currentUserRef.current;
        if (restartSubmittingRef.current || !requestStartUser?.uid) return false;
        const uid = requestStartUser.uid;
        // 서버 commit 뒤 응답이 유실돼도 이미 초기화된 업적의 지연 toast가
        // 오래된 currentUserRef를 보고 나타나지 않도록 요청 시작부터 폐기한다.
        achievementToastScheduleRef.current += 1;
        achievementToastRef.current = null;
        setNewAchievement(null);
        restartSubmittingRef.current = true;
        setRestartSubmitting(true);
        let activityRequest = null;

        try {
            try {
                activityRequest = getOrCreateRestartActivityRequest({
                    uid,
                    cycle: requestStartUser.readCount || 1,
                    day: requestStartUser.currentDay || 1,
                    readingEpoch: requestStartUser.readingEpoch ?? 0,
                });
                const response = await restartReading(
                    activityRequest.payload.cycle,
                    activityRequest.payload.day,
                    {
                        requestId: activityRequest.requestId,
                        expectedUid: uid,
                        readingEpoch: activityRequest.payload.readingEpoch,
                    },
                );

                // strict 2xx는 결정적이다. requestId를 정리한 뒤 response snapshot이
                // 아니라 source:'server'의 최신 user+canonical roster를 적용한다.
                clearActivityRequest(activityRequest);
                if (auth.currentUser?.uid !== uid) return false;
                let freshUser;
                try {
                    freshUser = await syncLatestUser(uid);
                } catch (syncError) {
                    console.error('Day 1 재시작 후 최신 사용자 동기화 실패:', syncError);
                    if (auth.currentUser?.uid === uid) {
                        alert('재시작 요청은 처리됐지만 최신 상태를 불러오지 못했습니다. 창을 닫지 않았으니 잠시 후 다시 확인해주세요.');
                    }
                    return false;
                }
                if (!freshUser || auth.currentUser?.uid !== uid) return false;
                requestCommunityRefresh?.();
                setViewingDay(freshUser.currentDay);
                setHasReadToday(freshUser.lastReadDate === response.calendarDate);

                if (response.result.status === 'positionMismatch') {
                    alert('진행 상태가 다른 화면에서 바뀌어 최신 위치로 맞췄습니다. 내용을 확인한 뒤 다시 눌러주세요.');
                    return false;
                }

                const restartWasObserved = freshUser.readingEpoch >= response.result.next.readingEpoch
                    && freshUser.readCount >= response.result.next.cycle;
                if (!restartWasObserved) {
                    alert('재시작 결과를 서버 최신 상태에서 확인하지 못했습니다. 창을 닫지 않았으니 잠시 후 다시 확인해주세요.');
                    return false;
                }

                // 신규 restart commit이 관찰되면 그 뒤 다른 탭이 더 진행했더라도
                // 이전 epoch의 완료/업적/보너스 UI는 더 이상 유효하지 않다.
                setCompletionSummary(null);
                if (completionSummaryTimerRef.current) clearTimeout(completionSummaryTimerRef.current);
                completionSummaryTimerRef.current = null;
                achievementToastScheduleRef.current += 1;
                achievementToastRef.current = null;
                setNewAchievement(null);
                setBonusToast(null);
                if (response.alreadyCompleted) {
                    // 첫 commit의 응답이 유실된 뒤 exact replay로 확인한 경우에도
                    // 이전 epoch의 완료/보너스 화면은 서버 reset과 함께 폐기한다.
                    alert('이전 재시작 요청의 결과를 확인했습니다. 최신 상태를 유지했습니다. 현재 내용을 확인하고 다시 누르면 새 요청으로 처리됩니다.');
                    return false;
                }
                const restartIsLatest = sameReadingPosition(
                    readingPosition(freshUser),
                    response.result.next,
                );
                if (restartIsLatest) {
                    alert('Day 1로 다시 시작했습니다. 달란트와 묵상, 과거 읽기 기록, 최고 연속 기록은 그대로 보존됩니다. 🔥');
                } else {
                    alert('Day 1 재시작을 완료했고, 다른 화면에서 이어진 최신 진행 상태까지 반영했습니다.');
                }
                return true;
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
                console.error('Day 1 재시작 실패:', error);
                if (auth.currentUser?.uid === uid) {
                    alert(shouldPreserveRequest
                        ? '재시작 결과를 아직 확인하지 못했습니다. 잠시 후 같은 버튼을 다시 눌러주세요.'
                        : 'Day 1 재시작에 실패했습니다. 최신 진행 상태를 확인한 뒤 다시 시도해주세요.');
                }
                return false;
            }
        } finally {
            restartSubmittingRef.current = false;
            setRestartSubmitting(false);
        }
    }, [
        syncLatestUser,
        setViewingDay,
        requestCommunityRefresh,
    ]);

    const changeStartDate = useCallback(async (dayOffset) => {
        const requestStartUser = currentUserRef.current;
        if (!requestStartUser?.uid || !Number.isSafeInteger(dayOffset)) return false;
        const uid = requestStartUser.uid;
        const submittedPosition = readingPosition(requestStartUser);
        const userRef = db.collection('users').doc(uid);

        try {
            await db.runTransaction(async (transaction) => {
                const snapshot = await transaction.get(userRef);
                if (!snapshot.exists) return false;
                if (!sameReadingPosition(readingPosition(snapshot.data()), submittedPosition)) {
                    return false;
                }
                transaction.update(userRef, {
                    dayOffset,
                    updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
                });
                return true;
            });
            if (auth.currentUser?.uid !== uid) return false;
            let freshUser;
            try {
                freshUser = await syncLatestUser(uid);
            } catch (syncError) {
                console.error('날짜 설정 후 최신 사용자 동기화 실패:', syncError);
                return false;
            }
            if (!freshUser || auth.currentUser?.uid !== uid) return false;
            // 이 탭의 transaction이 위치 불일치로 쓰지 않았더라도 다른 탭이 이미
            // 같은 값을 저장했다면 source-server 실제 값이 성공 여부의 기준이다.
            return freshUser.dayOffset === dayOffset;
        } catch (e) {
            console.error('날짜 설정 실패:', e);
            return false;
        }
    }, [syncLatestUser]);

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
        restartSubmitting,
        handleRead,
        handleRestart,
        changeStartDate,
        checkAchievements
    };
};
