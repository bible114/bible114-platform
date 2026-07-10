import React, { useEffect, useMemo, useState } from 'react';
import { db, firebase } from '../../utils/firebase';
import { QUIZ_BANK, getKstDateString, getKstDayOfYear } from '../../data/bibleQuiz';
import {
    getTodayReadingRange,
    loadQuestionByKey,
    loadQuestionsForRange,
    selectQuiz,
} from '../../utils/quizEngine';

const getRewardForAttempts = (attempts) => {
    if (attempts === 1) return 10;
    if (attempts === 2) return 5;
    return 0;
};

const getFallbackQuizWithKey = () => {
    const index = getKstDayOfYear() % QUIZ_BANK.length;
    return {
        quiz: QUIZ_BANK[index],
        quizKey: `bank-${index}`,
        badge: '성경 상식 문제',
    };
};

const resolveQuizKey = async (quizKey) => {
    if (!quizKey) return null;
    if (quizKey.startsWith('bank-')) {
        const index = Number(quizKey.replace('bank-', ''));
        if (!Number.isInteger(index) || !QUIZ_BANK[index]) return null;
        return {
            quiz: QUIZ_BANK[index],
            quizKey,
            badge: '성경 상식 문제',
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

const buildTodayQuiz = async (currentUser) => {
    const range = getTodayReadingRange(currentUser);
    const pool = await loadQuestionsForRange(range);
    const selected = selectQuiz(pool, currentUser?.readCount || 1);
    if (selected) {
        return {
            quiz: selected,
            quizKey: selected.key,
            badge: `오늘 읽은 본문에서 나왔어요 · ${range.displayText || range.sourceText || '오늘 본문'}`,
        };
    }
    return getFallbackQuizWithKey();
};

const LockedQuizCard = () => (
    <section className="bg-white rounded-3xl border border-slate-100 shadow-sm p-5 overflow-hidden opacity-75">
        <div className="rounded-3xl bg-slate-50 border border-slate-100 p-5">
            <p className="text-xs font-black text-slate-400 mb-1">오늘의 성경퀴즈</p>
            <h2 className="text-lg font-black text-slate-700">📖 오늘 본문을 읽으면 퀴즈가 열려요</h2>
            <p className="mt-2 text-sm font-bold text-slate-400">읽기 완료 후 오늘 읽은 부분에서 문제가 나옵니다.</p>
        </div>
    </section>
);

const BibleQuizCard = ({ currentUser, setCurrentUser }) => {
    const todayKey = useMemo(() => getKstDateString(), []);
    const hasReadToday = currentUser?.lastReadDate === new Date().toDateString();
    const attempts = currentUser?.quizDate === todayKey ? (currentUser.quizAttempts || 0) : 0;
    const solved = currentUser?.quizDate === todayKey && currentUser.quizSolved === true;
    const finished = solved || attempts >= 2;
    const earnedReward = solved ? getRewardForAttempts(attempts) : 0;

    const [quizState, setQuizState] = useState({ loading: true, quiz: null, quizKey: null, badge: '' });
    const [selectedIndex, setSelectedIndex] = useState(null);
    const [feedback, setFeedback] = useState(() => {
        if (!finished) return null;
        if (solved) return { type: 'success', message: `오늘 퀴즈 완료! ⭐ +${earnedReward}달란트` };
        return { type: 'done', message: '오늘의 두 번 시도가 끝났습니다.' };
    });
    const [submitting, setSubmitting] = useState(false);

    useEffect(() => {
        let cancelled = false;

        const loadQuiz = async () => {
            if (!currentUser || currentUser.role === 'guest' || !hasReadToday) return;
            setQuizState(prev => ({ ...prev, loading: true }));
            try {
                const savedKey = currentUser.quizDate === todayKey ? currentUser.quizKey : null;
                const resolved = savedKey ? await resolveQuizKey(savedKey) : null;
                const nextQuiz = resolved || await buildTodayQuiz(currentUser);
                if (!cancelled) setQuizState({ loading: false, ...nextQuiz });
            } catch (e) {
                console.error('본문 기반 퀴즈 로딩 실패:', e);
                if (!cancelled) setQuizState({ loading: false, ...getFallbackQuizWithKey() });
            }
        };

        loadQuiz();
        return () => { cancelled = true; };
    }, [
        currentUser?.uid,
        currentUser?.currentDay,
        currentUser?.dayOffset,
        currentUser?.planId,
        currentUser?.quizDate,
        currentUser?.quizKey,
        currentUser?.readCount,
        hasReadToday,
        todayKey,
    ]);

    if (!currentUser || currentUser.role === 'guest') return null;
    if (!hasReadToday) return <LockedQuizCard />;

    const quiz = quizState.quiz;
    const quizKey = quizState.quizKey;

    const submitAnswer = async () => {
        if (!quiz || !quizKey || selectedIndex === null || submitting || finished) return;
        setSubmitting(true);
        try {
            const result = await db.runTransaction(async (transaction) => {
                const userRef = db.collection('users').doc(currentUser.uid);
                const snap = await transaction.get(userRef);
                if (!snap.exists) throw new Error('USER_NOT_FOUND');

                const data = snap.data();
                const freshAttempts = data.quizDate === todayKey ? (data.quizAttempts || 0) : 0;
                const alreadyDone = data.quizDate === todayKey && (data.quizSolved === true || freshAttempts >= 2);
                const storedQuizKey = data.quizDate === todayKey ? data.quizKey : null;
                if (alreadyDone) {
                    return {
                        alreadyDone: true,
                        attempts: freshAttempts,
                        solved: data.quizSolved === true,
                        reward: data.quizSolved === true ? getRewardForAttempts(freshAttempts) : 0,
                        talent: data.talent || 0,
                        quizKey: storedQuizKey || quizKey,
                    };
                }

                const nextAttempts = freshAttempts + 1;
                const isCorrect = selectedIndex === quiz.answerIndex;
                const reward = isCorrect ? getRewardForAttempts(nextAttempts) : 0;
                const nextTalent = (data.talent || 0) + reward;
                const updateData = {
                    quizDate: todayKey,
                    quizAttempts: nextAttempts,
                    quizSolved: isCorrect,
                    quizKey: storedQuizKey || quizKey,
                    updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
                };
                if (reward > 0) updateData.talent = nextTalent;

                transaction.update(userRef, updateData);
                return {
                    alreadyDone: false,
                    attempts: nextAttempts,
                    solved: isCorrect,
                    reward,
                    talent: nextTalent,
                    quizKey: updateData.quizKey,
                };
            });

            setCurrentUser(prev => ({
                ...prev,
                quizDate: todayKey,
                quizAttempts: result.attempts,
                quizSolved: result.solved,
                quizKey: result.quizKey,
                talent: result.talent,
            }));

            if (result.alreadyDone) {
                setFeedback(result.solved
                    ? { type: 'success', message: `오늘 퀴즈 완료! ⭐ +${result.reward}달란트` }
                    : { type: 'done', message: '오늘의 두 번 시도가 끝났습니다.' });
            } else if (result.solved) {
                setFeedback({ type: 'success', message: `정답입니다! ⭐ +${result.reward}달란트를 받았어요.` });
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

    const currentAttempts = currentUser.quizDate === todayKey ? (currentUser.quizAttempts || 0) : 0;
    const showAnswer = currentUser.quizDate === todayKey && (currentUser.quizSolved === true || currentAttempts >= 2);

    return (
        <section className="bg-white rounded-3xl border border-slate-100 shadow-sm p-5 overflow-hidden">
            <div className="flex items-start justify-between gap-4 mb-4">
                <div>
                    <p className="text-xs font-black text-indigo-500 mb-1">오늘의 성경퀴즈</p>
                    <div className="mb-2 inline-flex rounded-full bg-indigo-50 px-2.5 py-1 text-[11px] font-black text-indigo-600">
                        {quizState.badge || '성경 상식 문제'}
                    </div>
                    <h2 className="text-lg font-black text-slate-800 leading-snug">
                        {quizState.loading ? '문제를 준비하고 있어요...' : quiz?.q}
                    </h2>
                </div>
                <div className="shrink-0 rounded-2xl bg-amber-50 px-3 py-2 text-right">
                    <p className="text-[11px] font-black text-amber-600">보상</p>
                    <p className="text-sm font-black text-amber-700">⭐ 10 / 5</p>
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
                            disabled={quizState.loading || submitting || showAnswer}
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
                    {feedback ? (
                        <span className={
                            feedback.type === 'success' ? 'text-emerald-600' :
                                feedback.type === 'error' ? 'text-red-500' :
                                    feedback.type === 'retry' ? 'text-amber-600' : 'text-slate-500'
                        }>
                            {feedback.message}
                        </span>
                    ) : (
                        <span className="text-slate-400">오늘 최대 2번 도전할 수 있어요. 첫 정답은 10달란트, 두 번째 정답은 5달란트입니다.</span>
                    )}
                </div>
                <button
                    type="button"
                    onClick={submitAnswer}
                    disabled={quizState.loading || selectedIndex === null || submitting || showAnswer}
                    className="shrink-0 rounded-2xl bg-indigo-600 px-5 py-3 text-sm font-black text-white disabled:bg-slate-200 disabled:text-slate-400"
                >
                    {submitting ? '확인 중...' : showAnswer ? '오늘 완료' : '정답 확인'}
                </button>
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
