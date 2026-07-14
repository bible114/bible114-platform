import React, { useEffect, useState } from 'react';
import { db, firebase } from '../../utils/firebase';
import { QUIZ_BANK, getKstDateString } from '../../data/bibleQuiz';
import { getQuizLevel, getQuizProgressKey, getQuizRewardForAnswer } from '../../utils/quizProgress';
import { saveGuestState } from '../../utils/guestStorage';
import { loadUserExtraOrgsStrict } from '../../utils/roster';
import { getRosterOrgIds, updateRosterTalents } from '../../utils/talentWallet';
import { previewQuizSubmission } from '../../utils/platformApi';
import { compareQuizSubmissionShadow } from '../../utils/quizSubmissionShadow';
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

const getRewardForAttempts = (attempts) => {
    if (attempts === 1) return 10;
    if (attempts === 2) return 5;
    return 0;
};

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

const BibleQuizCard = ({ currentUser, setCurrentUser, viewingDay, onGateStateChange, sectionRef, highlight = false }) => {
    const todayKey = getKstDateString();
    const hasReadToday = currentUser?.lastReadDate === new Date().toDateString();
    const progressDay = Number(viewingDay || currentUser?.currentDay || 1);
    const progressCycle = hasReadToday && currentUser?.currentDay === 1 && progressDay === 365
        ? Math.max(1, (currentUser?.readCount || 1) - 1)
        : (currentUser?.readCount || 1);
    const progressKey = getQuizProgressKey(progressCycle, progressDay);
    const legacyDay = hasReadToday ? (currentUser?.currentDay === 1 ? 365 : (currentUser?.currentDay || 1) - 1) : (currentUser?.currentDay || 1);
    const legacyCycle = hasReadToday && currentUser?.currentDay === 1 ? Math.max(1, (currentUser?.readCount || 1) - 1) : (currentUser?.readCount || 1);
    const canUseLegacy = progressDay === legacyDay && progressKey === getQuizProgressKey(legacyCycle, legacyDay) && currentUser?.quizDate === todayKey;
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

    const [quizState, setQuizState] = useState({ loading: true, quiz: null, quizKey: null, badge: '', replaceStoredQuizKey: false });
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
        todayKey,
    ]);

    useEffect(() => {
        let cancelled = false;

        const loadQuiz = async () => {
            if (!currentUser || currentUser.role === 'guest') {
                if (!cancelled) setQuizState({ loading: false, quiz: null, quizKey: null, badge: '', replaceStoredQuizKey: false });
                return;
            }
            setQuizState({ loading: true, quiz: null, quizKey: null, badge: '', replaceStoredQuizKey: false });
            try {
                const savedKey = progress?.quizKey || null;
                const resolved = savedKey ? await resolveQuizKey(savedKey, currentUser, progressDay) : null;
                const nextQuiz = resolved || await buildDayQuiz(currentUser, progressDay);
                if (!cancelled) {
                    setQuizState(nextQuiz
                        ? { loading: false, ...nextQuiz, replaceStoredQuizKey: Boolean(savedKey && !resolved) }
                        : { loading: false, quiz: null, quizKey: null, badge: '', replaceStoredQuizKey: false });
                }
            } catch (e) {
                console.error('본문 기반 퀴즈 로딩 실패:', e);
                if (!cancelled) setQuizState({ loading: false, quiz: null, quizKey: null, badge: '', replaceStoredQuizKey: false });
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
        setSubmitting(true);
        try {
            const entry = { attempts, solved: false, skipped: true, quizKey, updatedDate: todayKey, reward: 0 };
            await db.collection('users').doc(currentUser.uid).update({
                [`quizProgress.${progressKey}`]: entry,
                updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
            });
            setCurrentUser(previous => previous?.uid === currentUser.uid
                ? { ...previous, quizProgress: { ...(previous.quizProgress || {}), [progressKey]: entry } }
                : previous);
            if (typeof localStorage !== 'undefined') {
                try {
                    localStorage.setItem(skipStorageKey, '1');
                } catch (error) {
                    console.warn('퀴즈 건너뛰기 로컬 상태 저장 실패:', error);
                }
            }
            setSkipped(true);
        } catch (error) {
            console.error('퀴즈 건너뛰기 저장 실패:', error);
            setFeedback({ type: 'error', message: '건너뛰기 상태를 저장하지 못했습니다. 잠시 후 다시 시도해주세요.' });
        } finally {
            setSubmitting(false);
        }
    };

    const submitAnswer = async () => {
        if (!quiz || !quizKey || selectedIndex === null || submitting || finished || skipped) return;
        setSubmitting(true);
        try {
            let quizShadowPreview = null;
            if (import.meta.env.DEV) {
                try {
                    quizShadowPreview = await previewQuizSubmission(progressKey, quizKey, selectedIndex, { timeoutMs: 4000 });
                } catch {
                    // shadow 확인 실패는 기존 퀴즈 저장을 막지 않는다.
                }
            }

            // 정답일 때만 보상 지갑이 필요하다. 로그인 시 명부 조회 실패로 캐시가
            // 비어 있을 수 있으므로 보상 날짜를 기록하기 전에 실제 명부를 확인한다.
            // 조회가 실패하면 transaction 자체를 시작하지 않아 당일 보상이 소진되지 않는다.
            const rewardRosterOrgs = selectedIndex === quiz.answerIndex
                ? (await loadUserExtraOrgsStrict(currentUser.uid)).slice(0, 3)
                : null;
            const result = await db.runTransaction(async (transaction) => {
                const userRef = db.collection('users').doc(currentUser.uid);
                const snap = await transaction.get(userRef);
                if (!snap.exists) throw new Error('USER_NOT_FOUND');

                const data = snap.data();
                const storedProgress = data.quizProgress?.[progressKey] || (canUseLegacy ? {
                    attempts: data.quizAttempts || 0,
                    solved: data.quizSolved === true,
                    skipped: data.quizSkipped === true,
                    quizKey: data.quizKey || null,
                    reward: data.quizSolved === true ? getRewardForAttempts(data.quizAttempts || 0) : 0,
                } : {});
                const freshAttempts = storedProgress.attempts || 0;
                const alreadyDone = storedProgress.solved === true || storedProgress.skipped === true || freshAttempts >= 2;
                const storedQuizKey = storedProgress.quizKey || null;
                if (alreadyDone) {
                    return {
                        alreadyDone: true,
                        attempts: freshAttempts,
                        solved: storedProgress.solved === true,
                        skipped: storedProgress.skipped === true,
                        reward: storedProgress.reward || 0,
                        talent: data.talent || 0,
                        quizKey: storedQuizKey || quizKey,
                    };
                }

                const nextAttempts = freshAttempts + 1;
                const isCorrect = selectedIndex === quiz.answerIndex;
                const rewardAlready = data.quizRewardDate === todayKey || (data.quizDate === todayKey && data.quizSolved === true);
                const reward = getQuizRewardForAnswer({
                    attempts: nextAttempts,
                    isCorrect,
                    rewardDate: data.quizRewardDate,
                    todayKey,
                    legacyRewardedToday: data.quizDate === todayKey && data.quizSolved === true,
                });
                const rewardsUserWallet = data.accountType !== 'personal';
                const nextTalent = (data.talent || 0) + (rewardsUserWallet ? reward : 0);
                const rosterWallets = [];
                if (reward > 0) {
                    const refs = getRosterOrgIds({
                        ...currentUser,
                        extraOrgs: rewardRosterOrgs || [],
                    }).map(orgId => ({
                        orgId,
                        ref: db.collection('churches').doc(orgId).collection('roster').doc(currentUser.uid),
                    }));
                    const snaps = await Promise.all(refs.map(item => transaction.get(item.ref)));
                    refs.forEach((item, index) => {
                        if (snaps[index].exists) rosterWallets.push({ ...item, data: snaps[index].data() });
                    });
                }
                const persistedQuizKey = quizState.replaceStoredQuizKey ? quizKey : (storedQuizKey || quizKey);
                const entry = {
                    attempts: nextAttempts,
                    solved: isCorrect,
                    skipped: false,
                    quizKey: persistedQuizKey,
                    reward,
                    updatedDate: todayKey,
                };
                const updateData = {
                    [`quizProgress.${progressKey}`]: entry,
                    updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
                };
                if (reward > 0) {
                    if (rewardsUserWallet) updateData.talent = nextTalent;
                    updateData.quizRewardDate = todayKey;
                    updateData.quizRewardAmount = reward;
                }

                transaction.update(userRef, updateData);
                const rosterTalentByOrgId = {};
                rosterWallets.forEach(wallet => {
                    const nextRosterTalent = (Number(wallet.data?.talent) || 0) + reward;
                    rosterTalentByOrgId[wallet.orgId] = nextRosterTalent;
                    transaction.update(wallet.ref, {
                        talent: nextRosterTalent,
                        updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
                    });
                });
                return {
                    alreadyDone: false,
                    attempts: nextAttempts,
                    solved: isCorrect,
                    skipped: false,
                    reward,
                    userTalent: rewardsUserWallet ? nextTalent : null,
                    rosterTalentByOrgId,
                    quizKey: entry.quizKey,
                    entry,
                    rewardAlready,
                };
            });

            if (import.meta.env.DEV && quizShadowPreview?.result) {
                try {
                    const comparison = compareQuizSubmissionShadow(quizShadowPreview.result, result);
                    console.info('[quiz-shadow]', {
                        match: comparison.match,
                        serverStatus: comparison.serverStatus,
                        clientStatus: comparison.clientStatus,
                        mismatchKeys: comparison.mismatchKeys,
                        progressKey,
                        quizKey,
                    });
                } catch {
                    // shadow 비교 자체가 기존 퀴즈 결과 처리에 영향을 주지 않게 한다.
                }
            }

            setCurrentUser(prev => updateRosterTalents({
                ...prev,
                quizProgress: {
                    ...(prev.quizProgress || {}),
                    [progressKey]: result.entry || {
                        attempts: result.attempts, solved: result.solved,
                        skipped: result.skipped === true, quizKey: result.quizKey,
                        reward: result.reward || 0, updatedDate: todayKey,
                    },
                },
                ...(result.reward > 0 ? { quizRewardDate: todayKey, quizRewardAmount: result.reward } : {}),
                ...(result.userTalent !== null && result.userTalent !== undefined ? { talent: result.userTalent } : {}),
                ...(rewardRosterOrgs ? { extraOrgs: rewardRosterOrgs } : {}),
            }, result.rosterTalentByOrgId));

            if (result.alreadyDone) {
                setFeedback(result.solved
                    ? { type: 'success', message: result.reward > 0 ? `DAY ${progressDay} 퀴즈 완료! ⭐ +${result.reward}달란트` : '정답이에요! 퀴즈 달란트는 하루 1번만 적립돼요.' }
                    : { type: 'done', message: `DAY ${progressDay}의 두 번 시도가 끝났습니다.` });
            } else if (result.solved) {
                setFeedback({ type: 'success', message: result.reward > 0 ? `정답입니다! ⭐ +${result.reward}달란트를 받았어요.` : '정답이에요! 퀴즈 달란트는 하루 1번만 적립돼요.' });
            } else if (result.attempts >= 2) {
                setFeedback({ type: 'done', message: '아쉽지만 오늘의 시도는 끝났습니다. 정답을 확인해보세요.' });
            } else {
                setFeedback({ type: 'retry', message: '아쉬워요. 한 번 더 도전할 수 있습니다.' });
                setSelectedIndex(null);
            }
        } catch (e) {
            console.error('성경퀴즈 제출 실패:', e);
            setFeedback({ type: 'error', message: '퀴즈 처리에 실패했습니다. 잠시 후 다시 시도해주세요.' });
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
                <div className="shrink-0 rounded-2xl bg-amber-50 px-3 py-2 text-right">
                    <p className="text-[11px] font-black text-amber-600">{dailyRewardAlready ? '오늘 적립 완료' : '보상'}</p>
                    <p className="text-sm font-black text-amber-700">{dailyRewardAlready ? '⭐ +0' : '⭐ 10 / 5'}</p>
                </div>
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
                        <span className="text-slate-400">이 DAY는 최대 2번 도전할 수 있어요. 퀴즈 달란트는 하루 첫 정답에만 적립됩니다.</span>
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
