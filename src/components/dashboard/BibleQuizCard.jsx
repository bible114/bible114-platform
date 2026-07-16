import React, { useEffect, useRef, useState } from 'react';
import { auth, db, firebase } from '../../utils/firebase';
import { QUIZ_BANK, getKstDateString } from '../../data/bibleQuiz';
import {
    getQuizConfigurationKey,
    getQuizLevel,
    getQuizProgressKey,
    userAllowsQuizProgressKey,
} from '../../utils/quizProgress';
import { saveGuestState } from '../../utils/guestStorage';
import { PlatformApiError, skipQuiz, submitQuiz } from '../../utils/platformApi';
import {
    isLatestCanonicalUserState,
    loadCanonicalUserStateFromServer,
} from '../../utils/userStateSync';
import {
    clearActivityRequest,
    getOrCreateQuizActivityRequest,
    getOrCreateQuizSkipActivityRequest,
} from '../../utils/userActivityRequests';
import {
    getReadingRangeForDay,
    loadNtEasyPoolForDay,
    loadNtEasyQuestionByKey,
    loadQuestionByKey,
    loadQuestionsForRange,
    selectQuiz,
    selectNtEasyQuiz,
    shuffleQuizChoices,
} from '../../utils/quizEngine';

export const QuizLevelToggle = ({ currentUser, setCurrentUser, finished = false }) => {
    const planType = String(currentUser?.planId || '').split('_')[0];
    const level = getQuizLevel(currentUser);
    const [saving, setSaving] = useState(false);
    const [saveError, setSaveError] = useState('');
    if (planType !== 'nt') return null;

    const changeLevel = async (nextLevel) => {
        if (saving || nextLevel === level || !['standard', 'easy'].includes(nextLevel)) return;
        setSaving(true);
        setSaveError('');
        try {
            if (currentUser?.role === 'guest') {
                saveGuestState({ quizLevel: nextLevel });
            } else {
                if (!currentUser?.uid) throw new Error('QUIZ_LEVEL_USER_REQUIRED');
                await db.collection('users').doc(currentUser.uid).set({
                    quizLevel: nextLevel,
                    updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
                }, { merge: true });
            }
            setCurrentUser(previous => previous?.uid === currentUser?.uid
                ? { ...previous, quizLevel: nextLevel }
                : previous);
        } catch (error) {
            console.error('퀴즈 난이도 저장 실패:', error);
            setSaveError('난이도를 저장하지 못했어요. 다시 눌러주세요.');
        } finally {
            setSaving(false);
        }
    };

    return (
        <div className="flex min-w-0 flex-col items-end gap-1">
            <div className="inline-flex shrink-0 rounded-xl bg-slate-100 p-1" aria-label="퀴즈 난이도">
                {[
                    ['standard', '표준'],
                    ['easy', '쉬움'],
                ].map(([value, label]) => (
                    <button
                        key={value}
                        type="button"
                        disabled={saving}
                        onClick={() => changeLevel(value)}
                        className={`whitespace-nowrap rounded-lg px-3 py-1.5 text-xs font-black transition-colors ${level === value ? 'bg-indigo-600 text-white shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                        aria-pressed={level === value}
                    >
                        {label}
                    </button>
                ))}
            </div>
            <p className="max-w-[15rem] text-right text-[10px] font-bold leading-snug text-indigo-500">어린이 영상을 선택하면 쉬운 퀴즈로 자동 변경돼요.</p>
            {finished && <p className="whitespace-nowrap text-[10px] font-bold text-slate-400">변경한 난이도는 내일부터 적용돼요.</p>}
            {saveError && <p className="max-w-[15rem] text-right text-[10px] font-bold text-red-500">{saveError}</p>}
        </div>
    );
};

const resolveQuizKey = async (quizKey, currentUser, viewingDay) => {
    if (typeof quizKey !== 'string' || !quizKey) return null;
    if (quizKey.startsWith('bank-')) {
        const index = Number(quizKey.replace('bank-', ''));
        if (!Number.isInteger(index) || !QUIZ_BANK[index]) return null;
        // QUIZ_BANK도 같은 정답 위치 편향 문제가 있어(대부분 answerIndex 0),
        // quizKey를 시드로 동일하게 결정적 셔플을 적용한다.
        return {
            quiz: shuffleQuizChoices({ ...QUIZ_BANK[index], key: quizKey }),
            quizKey,
            badge: '성경 상식 문제',
        };
    }

    if (quizKey.startsWith('ntEasy-')) {
        const quiz = await loadNtEasyQuestionByKey(quizKey);
        if (!quiz) return null;
        const range = getReadingRangeForDay(currentUser, viewingDay);
        return {
            quiz,
            quizKey,
            badge: `오늘 본문에서 쉬운 문제로 나왔어요 · ${range.displayText || range.sourceText || '오늘 본문'}`,
        };
    }

    const quiz = await loadQuestionByKey(quizKey);
    if (!quiz) return null;
    return {
        quiz,
        quizKey,
        badge: '오늘 읽은 본문에서 나왔어요',
    };
};

const buildDayQuiz = async (currentUser, viewingDay) => {
    const range = getReadingRangeForDay(currentUser, viewingDay);
    const planType = String(currentUser?.planId || '').split('_')[0];
    if (planType === 'nt' && getQuizLevel(currentUser) === 'easy') {
        try {
            const easyPool = await loadNtEasyPoolForDay(range.actualDay);
            const readCount = Math.max(1, Number(currentUser?.readCount) || 1);
            const easySeed = (readCount - 1) * 365 + range.actualDay;
            const easyQuiz = selectNtEasyQuiz(easyPool, easySeed, readCount);
            if (easyQuiz) {
                return {
                    quiz: easyQuiz,
                    quizKey: easyQuiz.key,
                    badge: `오늘 본문에서 쉬운 문제로 나왔어요 · ${range.displayText || range.sourceText || '오늘 본문'}`,
                };
            }
            console.warn('신약일독 쉬운 문제 풀이 비어 있어 표준 문제로 전환합니다.', { actualDay: range.actualDay });
        } catch (error) {
            console.warn('신약일독 쉬운 문제를 불러오지 못해 표준 문제로 전환합니다.', error);
        }
    }
    const pool = await loadQuestionsForRange(range);
    const cycleSeed = ((currentUser?.readCount || 1) - 1) * 365 + viewingDay;
    const selected = selectQuiz(pool, cycleSeed);
    if (selected) {
        return {
            quiz: selected,
            quizKey: selected.key,
            badge: `오늘 읽은 본문에서 나왔어요 · ${range.displayText || range.sourceText || '오늘 본문'}`,
        };
    }
    return null;
};

const projectFreshUserForQuizConfiguration = (freshUser, rosterOrgId) => {
    if (!rosterOrgId) return freshUser;
    const roster = (Array.isArray(freshUser?.extraOrgs) ? freshUser.extraOrgs : [])
        .find(org => org?.orgId === rosterOrgId);
    return roster ? {
        ...freshUser,
        departmentId: roster.departmentId || null,
        departmentName: roster.departmentName || null,
    } : null;
};

const BibleQuizCard = ({ currentUser, setCurrentUser, viewingDay, onGateStateChange, sectionRef, highlight = false, talentProgramEnabled = true }) => {
    const todayKey = getKstDateString();
    const hasReadToday = currentUser?.lastReadDate === new Date().toDateString();
    const progressDay = Number(viewingDay || currentUser?.currentDay || 1);
    const progressCycle = hasReadToday && currentUser?.currentDay === 1 && progressDay === 365
        ? Math.max(1, (currentUser?.readCount || 1) - 1)
        : (currentUser?.readCount || 1);
    const readingEpoch = currentUser?.readingEpoch ?? 0;
    const progressKey = getQuizProgressKey(progressCycle, progressDay, readingEpoch);
    const currentUserRef = useRef(currentUser);
    const progressKeyRef = useRef(progressKey);
    currentUserRef.current = currentUser;
    progressKeyRef.current = progressKey;
    const submissionStillCurrent = (
        uid,
        epoch,
        submittedProgressKey,
        submittedQuizConfigurationKey,
        submittedRosterOrgId,
    ) => (
        auth?.currentUser?.uid === uid
        && currentUserRef.current?.uid === uid
        && (currentUserRef.current?.readingEpoch ?? 0) === epoch
        && progressKeyRef.current === submittedProgressKey
        && getQuizConfigurationKey(currentUserRef.current) === submittedQuizConfigurationKey
        && (currentUserRef.current?.talentWalletType === 'roster'
            ? currentUserRef.current.talentWalletOrgId
            : null) === submittedRosterOrgId
    );
    const legacyDay = hasReadToday ? (currentUser?.currentDay === 1 ? 365 : (currentUser?.currentDay || 1) - 1) : (currentUser?.currentDay || 1);
    const legacyCycle = hasReadToday && currentUser?.currentDay === 1 ? Math.max(1, (currentUser?.readCount || 1) - 1) : (currentUser?.readCount || 1);
    const canUseLegacy = readingEpoch === 0
        && progressDay === legacyDay
        && progressKey === getQuizProgressKey(legacyCycle, legacyDay, readingEpoch)
        && currentUser?.quizDate === todayKey;
    const progress = currentUser?.quizProgress?.[progressKey] || (canUseLegacy ? {
        attempts: currentUser?.quizAttempts || 0,
        solved: currentUser?.quizSolved === true,
        skipped: currentUser?.quizSkipped === true,
        quizKey: currentUser?.quizKey || null,
    } : null);
    const attempts = progress?.attempts || 0;
    const solved = progress?.solved === true;
    const persistedSkipped = progress?.skipped === true;
    const finished = solved || attempts >= 2;
    const dailyRewardAlready = currentUser?.quizRewardDate === todayKey || (currentUser?.quizDate === todayKey && currentUser?.quizSolved === true);
    const earnedReward = solved ? (progress?.reward || 0) : 0;
    const skipStorageKey = `b114_quiz_skip_${currentUser?.uid || 'anon'}_${progressKey}`;
    const [skipped, setSkipped] = useState(false);

    useEffect(() => {
        let nextSkipped = false;
        if (typeof localStorage === 'undefined') {
            setSkipped(false);
            return;
        }
        try {
            nextSkipped = persistedSkipped || localStorage.getItem(skipStorageKey) === '1';
        } catch {
            nextSkipped = false;
        }
        setSkipped(nextSkipped);
    }, [currentUser?.uid, persistedSkipped, skipStorageKey]);

    const [quizState, setQuizState] = useState({ loading: true, quiz: null, quizKey: null, badge: '' });
    const [selectedIndex, setSelectedIndex] = useState(null);
    const [feedback, setFeedback] = useState(() => {
        if (!finished) return null;
        if (solved) return { type: 'success', message: earnedReward > 0 ? `DAY ${progressDay} 퀴즈 완료! ⭐ +${earnedReward}달란트` : '정답이에요! 퀴즈 달란트는 하루 1번만 적립돼요.' };
        return { type: 'done', message: `DAY ${progressDay}의 두 번 시도가 끝났습니다.` };
    });
    const [submitting, setSubmitting] = useState(false);
    const [reviewExpanded, setReviewExpanded] = useState(false);

    // 사용자/날짜/진행 본문이 바뀌면 이전 문항에서 고른 답과 피드백이 새 문항에 남지 않게 한다.
    // quizState.quizKey는 제출 후 재조회 중 잠시 null이 되므로 의존성에서 제외한다.
    useEffect(() => {
        setSelectedIndex(null);
        if (!finished) {
            setFeedback(null);
        } else if (solved) {
            setFeedback({ type: 'success', message: earnedReward > 0 ? `DAY ${progressDay} 퀴즈 완료! ⭐ +${earnedReward}달란트` : '정답이에요! 퀴즈 달란트는 하루 1번만 적립돼요.' });
        } else {
            setFeedback({ type: 'done', message: `DAY ${progressDay}의 두 번 시도가 끝났습니다.` });
        }
    }, [
        currentUser?.uid,
        progressKey,
        currentUser?.dayOffset,
        currentUser?.planId,
        currentUser?.quizLevel,
        currentUser?.readCount,
        currentUser?.readingEpoch,
        todayKey,
    ]);

    useEffect(() => {
        let cancelled = false;

        const loadQuiz = async () => {
            if (!currentUser || currentUser.role === 'guest') {
                if (!cancelled) setQuizState({ loading: false, quiz: null, quizKey: null, badge: '' });
                return;
            }
            setQuizState({ loading: true, quiz: null, quizKey: null, badge: '' });
            try {
                const savedKey = progress?.quizKey || null;
                const resolved = savedKey ? await resolveQuizKey(savedKey, currentUser, progressDay) : null;
                const nextQuiz = resolved || await buildDayQuiz(currentUser, progressDay);
                if (!cancelled) {
                    setQuizState(nextQuiz
                        ? { loading: false, ...nextQuiz }
                        : { loading: false, quiz: null, quizKey: null, badge: '' });
                }
            } catch (e) {
                console.error('본문 기반 퀴즈 로딩 실패:', e);
                if (!cancelled) setQuizState({ loading: false, quiz: null, quizKey: null, badge: '' });
            }
        };

        loadQuiz();
        return () => { cancelled = true; };
    }, [
        currentUser?.uid,
        progressKey,
        currentUser?.dayOffset,
        currentUser?.planId,
        currentUser?.quizLevel,
        progress?.quizKey,
        currentUser?.readCount,
        currentUser?.readingEpoch,
        todayKey,
    ]);

    const quiz = quizState.quiz;
    const quizKey = quizState.quizKey;
    const hasQuestion = Boolean(quiz && quizKey);
    const gateOpen = finished || skipped || (!quizState.loading && !hasQuestion);

    useEffect(() => {
        onGateStateChange?.({
            loading: quizState.loading,
            hasQuestion,
            gateOpen,
        });
    }, [gateOpen, hasQuestion, onGateStateChange, quizState.loading]);

    if (!currentUser || currentUser.role === 'guest') return null;
    if (!quizState.loading && !hasQuestion) return null;

    const skipToday = async () => {
        if (submitting || !quizKey) return;
        const submittedUid = currentUser.uid;
        const submittedEpoch = readingEpoch;
        const submittedProgressKey = progressKey;
        const submittedQuizConfigurationKey = getQuizConfigurationKey(currentUser);
        const submittedRosterOrgId = currentUser.talentWalletType === 'roster'
            ? currentUser.talentWalletOrgId
            : null;
        let activityRequest = null;
        setSubmitting(true);
        try {
            activityRequest = getOrCreateQuizSkipActivityRequest({
                uid: submittedUid,
                progressKey,
                quizKey,
            });
            const response = await skipQuiz(
                activityRequest.payload.progressKey,
                activityRequest.payload.quizKey,
                { requestId: activityRequest.requestId, expectedUid: submittedUid },
            );
            clearActivityRequest(activityRequest);
            if (auth?.currentUser?.uid !== submittedUid) return;
            let freshUser;
            try {
                freshUser = await loadCanonicalUserStateFromServer(submittedUid);
            } catch (syncError) {
                console.error('퀴즈 건너뛰기 후 최신 사용자 동기화 실패:', syncError);
                if (submissionStillCurrent(
                    submittedUid,
                    submittedEpoch,
                    submittedProgressKey,
                    submittedQuizConfigurationKey,
                    submittedRosterOrgId,
                )) {
                    setFeedback({
                        type: 'error',
                        message: '건너뛰기는 처리됐지만 최신 상태를 불러오지 못했어요. 잠시 후 다시 확인해주세요.',
                    });
                }
                return;
            }
            if (auth?.currentUser?.uid !== submittedUid || freshUser?.uid !== submittedUid
                || !isLatestCanonicalUserState(submittedUid, freshUser)) return;
            const visibleContextMatches = submissionStillCurrent(
                submittedUid,
                submittedEpoch,
                submittedProgressKey,
                submittedQuizConfigurationKey,
                submittedRosterOrgId,
            );
            const freshConfigurationUser = projectFreshUserForQuizConfiguration(
                freshUser,
                submittedRosterOrgId,
            );
            currentUserRef.current = freshUser;
            setCurrentUser(freshUser);
            if (!visibleContextMatches
                || !freshConfigurationUser
                || getQuizConfigurationKey(freshConfigurationUser) !== submittedQuizConfigurationKey
                || !userAllowsQuizProgressKey(
                    freshUser,
                    submittedProgressKey,
                    response.calendarDate,
                )) return;
            const entry = freshUser.quizProgress?.[submittedProgressKey];
            if (!entry || entry.quizKey !== response.state.progress.quizKey) return;
            if (entry.skipped && typeof localStorage !== 'undefined') {
                try {
                    localStorage.setItem(skipStorageKey, '1');
                } catch (error) {
                    console.warn('퀴즈 건너뛰기 로컬 상태 저장 실패:', error);
                }
            }
            setSkipped(entry.skipped === true);
        } catch (error) {
            const outcomeUncertain = error instanceof PlatformApiError
                && (error.retryable === true || (error.status >= 200 && error.status < 300));
            if (activityRequest && error instanceof PlatformApiError && !outcomeUncertain) {
                clearActivityRequest(activityRequest);
            }
            console.error('퀴즈 건너뛰기 저장 실패:', error);
            if (submissionStillCurrent(
                submittedUid,
                submittedEpoch,
                submittedProgressKey,
                submittedQuizConfigurationKey,
                submittedRosterOrgId,
            )) {
                setFeedback({
                    type: 'error',
                    message: outcomeUncertain
                        ? '건너뛰기 결과를 확인하지 못했어요. 같은 버튼을 다시 눌러 확인해주세요.'
                        : '건너뛰기 상태를 저장하지 못했습니다. 잠시 후 다시 시도해주세요.',
                });
            }
        } finally {
            setSubmitting(false);
        }
    };

    const submitAnswer = async () => {
        if (!quiz || !quizKey || selectedIndex === null || submitting || finished || skipped) return;
        const submittedUid = currentUser.uid;
        const submittedEpoch = readingEpoch;
        const submittedProgressKey = progressKey;
        const submittedQuizConfigurationKey = getQuizConfigurationKey(currentUser);
        const submittedRosterOrgId = currentUser.talentWalletType === 'roster'
            ? currentUser.talentWalletOrgId
            : null;
        let activityRequest = null;
        setSubmitting(true);
        try {
            activityRequest = getOrCreateQuizActivityRequest({
                uid: submittedUid,
                progressKey,
                quizKey,
                attemptSlot: Number(attempts) + 1,
                selectedIndex,
            });
            const { payload, requestId } = activityRequest;
            const response = await submitQuiz(
                payload.progressKey,
                payload.quizKey,
                payload.selectedIndex,
                payload.attemptSlot,
                { requestId, expectedUid: submittedUid },
            );
            clearActivityRequest(activityRequest);
            if (auth?.currentUser?.uid !== submittedUid) return;
            let freshUser;
            try {
                freshUser = await loadCanonicalUserStateFromServer(submittedUid);
            } catch (syncError) {
                console.error('성경퀴즈 제출 후 최신 사용자 동기화 실패:', syncError);
                if (submissionStillCurrent(
                    submittedUid,
                    submittedEpoch,
                    submittedProgressKey,
                    submittedQuizConfigurationKey,
                    submittedRosterOrgId,
                )) {
                    setFeedback({
                        type: 'error',
                        message: '답은 처리됐지만 최신 상태를 불러오지 못했어요. 잠시 후 다시 확인해주세요.',
                    });
                }
                return;
            }
            if (auth?.currentUser?.uid !== submittedUid || freshUser?.uid !== submittedUid
                || !isLatestCanonicalUserState(submittedUid, freshUser)) return;
            const visibleContextMatches = submissionStillCurrent(
                submittedUid,
                submittedEpoch,
                submittedProgressKey,
                submittedQuizConfigurationKey,
                submittedRosterOrgId,
            );
            const freshConfigurationUser = projectFreshUserForQuizConfiguration(
                freshUser,
                submittedRosterOrgId,
            );
            currentUserRef.current = freshUser;
            setCurrentUser(freshUser);
            if (!visibleContextMatches
                || !freshConfigurationUser
                || getQuizConfigurationKey(freshConfigurationUser) !== submittedQuizConfigurationKey
                || !userAllowsQuizProgressKey(
                    freshUser,
                    submittedProgressKey,
                    response.calendarDate,
                )) return;

            const freshProgress = freshUser.quizProgress?.[submittedProgressKey];
            if (!freshProgress || freshProgress.quizKey !== response.state.progress.quizKey) return;
            setSkipped(freshProgress.skipped === true);

            if (freshProgress.solved) {
                setFeedback({
                    type: 'success',
                    message: freshProgress.reward > 0
                        ? `정답입니다! ⭐ +${freshProgress.reward}달란트를 받았어요.`
                        : '정답이에요! 퀴즈 달란트는 하루 1번만 적립돼요.',
                });
            } else if (freshProgress.skipped || freshProgress.attempts >= 2) {
                setFeedback({ type: 'done', message: '아쉽지만 오늘의 시도는 끝났습니다. 정답을 확인해보세요.' });
            } else {
                setFeedback({ type: 'retry', message: '아쉬워요. 한 번 더 도전할 수 있습니다.' });
                setSelectedIndex(null);
            }
        } catch (e) {
            console.error('성경퀴즈 제출 실패:', e);
            const outcomeUncertain = e instanceof PlatformApiError
                && (e.retryable === true || (e.status >= 200 && e.status < 300));
            if (activityRequest && e instanceof PlatformApiError && !outcomeUncertain) {
                clearActivityRequest(activityRequest);
            }
            if (!submissionStillCurrent(
                submittedUid,
                submittedEpoch,
                submittedProgressKey,
                submittedQuizConfigurationKey,
                submittedRosterOrgId,
            )) return;
            if (outcomeUncertain && activityRequest) {
                setSelectedIndex(activityRequest.payload.selectedIndex);
            }
            setFeedback({
                type: 'error',
                message: outcomeUncertain
                    ? '처리 결과를 확인하지 못했습니다. 같은 답으로 다시 시도해주세요.'
                    : '퀴즈 처리에 실패했습니다. 잠시 후 다시 시도해주세요.',
            });
        } finally {
            setSubmitting(false);
        }
    };

    const currentProgress = currentUser?.quizProgress?.[progressKey] || progress || {};
    const currentAttempts = currentProgress.attempts || 0;
    const showAnswer = currentProgress.solved === true || currentAttempts >= 2;
    const sectionClassName = `bg-white rounded-3xl border shadow-sm p-5 overflow-hidden transition-[border-color,box-shadow] duration-300 ${highlight ? 'border-indigo-500 ring-4 ring-indigo-200 shadow-indigo-100' : 'border-slate-100'}`;

    if (solved) {
        return (
            <section ref={sectionRef} className={sectionClassName}>
                <div className="flex items-start justify-between gap-3">
                    <p className="pt-2 text-base font-black text-emerald-700">정답!</p>
                    <QuizLevelToggle currentUser={currentUser} setCurrentUser={setCurrentUser} finished />
                </div>
            </section>
        );
    }

    if (finished && !reviewExpanded) {
        return (
            <section ref={sectionRef} className={sectionClassName}>
                <div className="mb-3 flex justify-end">
                    <QuizLevelToggle currentUser={currentUser} setCurrentUser={setCurrentUser} finished />
                </div>
                <button
                    type="button"
                    onClick={() => setReviewExpanded(true)}
                    className="w-full text-left"
                    aria-expanded="false"
                >
                    <p className="text-base font-black text-slate-700">오늘의 퀴즈가 끝났습니다.</p>
                    <p className="mt-2 text-xs font-bold text-slate-400">탭해서 정답과 해설 다시 보기</p>
                </button>
            </section>
        );
    }

    return (
        <section ref={sectionRef} className={sectionClassName}>
            <div className="mb-3 flex justify-end">
                <QuizLevelToggle currentUser={currentUser} setCurrentUser={setCurrentUser} finished={finished} />
            </div>
            <div className="flex items-start justify-between gap-4 mb-4">
                <div>
                    <p className="text-xs font-black text-indigo-500 mb-1">DAY {progressDay} 성경퀴즈</p>
                    <div className="mb-2 inline-flex rounded-full bg-indigo-50 px-2.5 py-1 text-[11px] font-black text-indigo-600">
                        {quizState.badge || '성경 상식 문제'}
                    </div>
                    <h2 className="text-lg font-black text-slate-800 leading-snug">
                        {quizState.loading ? '문제를 준비하고 있어요...' : quiz?.q}
                    </h2>
                </div>
                {talentProgramEnabled && <div className="shrink-0 rounded-2xl bg-amber-50 px-3 py-2 text-right">
                    <p className="text-[11px] font-black text-amber-600">{dailyRewardAlready ? '오늘 적립 완료' : '보상'}</p>
                    <p className="text-sm font-black text-amber-700">{dailyRewardAlready ? '⭐ +0' : '⭐ 10 / 5'}</p>
                </div>}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {(quiz?.choices || Array.from({ length: 4 }, () => '준비 중')).map((choice, index) => {
                    const isSelected = selectedIndex === index;
                    const isAnswer = showAnswer && index === quiz?.answerIndex;
                    return (
                        <button
                            key={`${choice}_${index}`}
                            type="button"
                            disabled={quizState.loading || submitting || showAnswer || skipped}
                            onClick={() => setSelectedIndex(index)}
                            className={`text-left rounded-2xl border px-4 py-3 text-sm font-bold transition-all disabled:cursor-default ${
                                isAnswer
                                    ? 'border-emerald-300 bg-emerald-50 text-emerald-800'
                                    : isSelected
                                        ? 'border-indigo-300 bg-indigo-50 text-indigo-800'
                                        : 'border-slate-100 bg-slate-50 text-slate-700 hover:border-indigo-200 hover:bg-indigo-50'
                            }`}
                        >
                            <span className="mr-2 text-xs text-slate-400">{index + 1}.</span>
                            {choice}
                        </button>
                    );
                })}
            </div>

            <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-h-[1.5rem] text-sm font-bold">
                    {skipped ? (
                        <span className="text-slate-500">DAY {progressDay} 퀴즈를 건너뛰었습니다.</span>
                    ) : feedback ? (
                        <span className={
                            feedback.type === 'success' ? 'text-emerald-600' :
                                feedback.type === 'error' ? 'text-red-500' :
                                    feedback.type === 'retry' ? 'text-amber-600' : 'text-slate-500'
                        }>
                            {feedback.message}
                        </span>
                    ) : (
                        <span className="text-slate-400">이 DAY는 최대 2번 도전할 수 있어요.{talentProgramEnabled ? ' 퀴즈 달란트는 하루 첫 정답에만 적립됩니다.' : ''}</span>
                    )}
                </div>
                <div className="flex shrink-0 flex-col items-center gap-2">
                    <button
                        type="button"
                        onClick={submitAnswer}
                        disabled={quizState.loading || selectedIndex === null || submitting || showAnswer || skipped}
                        className="w-full rounded-2xl bg-indigo-600 px-5 py-3 text-sm font-black text-white disabled:bg-slate-200 disabled:text-slate-400"
                    >
                        {submitting ? '확인 중...' : showAnswer ? `DAY ${progressDay} 완료` : skipped ? '건너뛰기 완료' : '정답 확인'}
                    </button>
                    {!finished && !skipped && (
                        <button
                            type="button"
                            onClick={skipToday}
                            className="text-xs font-bold text-slate-400 underline underline-offset-2 hover:text-slate-600"
                        >
                            이 DAY는 건너뛰기
                        </button>
                    )}
                </div>
            </div>

            {showAnswer && quiz && (
                <div className="mt-4 rounded-2xl bg-slate-50 px-4 py-3">
                    <p className="text-sm font-black text-slate-700">정답: {quiz.choices[quiz.answerIndex]}</p>
                    <p className="mt-1 text-xs font-bold text-slate-400">근거: {quiz.ref}</p>
                </div>
            )}
        </section>
    );
};

export default BibleQuizCard;
