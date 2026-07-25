import React, { useEffect, useMemo, useRef, useState } from 'react';
import { PLAN_TYPES, BIBLE_VERSIONS } from '../data/bible_options';
import { getPlanTotalDays } from '../data/schedules';
import { useBibleContent } from '../hooks/useBibleContent';
import { useTTS } from '../hooks/useTTS';
import { recordGuestRead, saveGuestState } from '../utils/guestStorage';
import { DailyVideoCard, BibleReader, QuizLevelToggle, HomeScreenHelpBanner } from './dashboard';

const GuestReaderView = ({ currentUser, setCurrentUser, handleLogout, onSignupClick }) => {
    const { verseData, viewingDay, setViewingDay, loadContent } = useBibleContent(currentUser);

    // 게스트가 고를 수 있는 버전 목록 (운영 번역: 개역개정·새번역)
    const versionOptions = useMemo(() => {
        const options = [];
        PLAN_TYPES.forEach(plan => {
            (BIBLE_VERSIONS[plan.id] || []).forEach(version => {
                options.push({
                    planId: `${plan.id}_${version.id}`,
                    planTitle: plan.title,
                    versionName: version.name,
                });
            });
        });
        return options;
    }, []);

    const currentPlanId = currentUser?.planId || '1year_revised';
    const [showNextPlanPrompt, setShowNextPlanPrompt] = useState(false);

    const handleGuestVersionChange = (newPlanId) => {
        if (!newPlanId || newPlanId === currentPlanId) return;
        const nextDay = showNextPlanPrompt ? 1 : (currentUser?.currentDay || 1);
        saveGuestState({ planId: newPlanId, currentDay: nextDay });
        setCurrentUser(prev => (prev ? { ...prev, planId: newPlanId, currentDay: nextDay } : prev));
        setViewingDay(nextDay);
        setShowNextPlanPrompt(false);
    };

    const [fontSize, setFontSize] = useState(() => {
        const saved = localStorage.getItem('bible_fontSize');
        return saved ? parseInt(saved, 10) : 16;
    });
    const [showConfetti, setShowConfetti] = useState(false);
    const [readSubmitting, setReadSubmitting] = useState(false);
    const readSubmittingRef = useRef(false);

    const {
        isSpeaking, isPaused, ttsSpeed, availableVoices, selectedVoiceURI, activeChunkIndex,
        ttsError, clearTtsError,
        ttsUnavailableApp,
        handleSpeedChange, handleTogglePause, handleStop, handleSpeak, jumpToChunk,
        setSelectedVoiceURI,
    } = useTTS(verseData.text);

    useEffect(() => {
        if (!currentUser) return;
        setViewingDay(prev => prev ?? (currentUser.currentDay || 1));
    }, [currentUser, setViewingDay]);

    useEffect(() => {
        if (!currentUser || viewingDay === null) return;
        loadContent(viewingDay);
    }, [currentUser?.uid, currentUser?.planId, viewingDay, loadContent]);

    const hasReadToday = currentUser?.lastReadDate === new Date().toDateString();
    const totalPlanDays = getPlanTotalDays(currentPlanId);
    const daysRemaining = Math.max(0, totalPlanDays - (viewingDay || currentUser?.currentDay || 1) + 1);

    const handleRead = async () => {
        if (readSubmittingRef.current || readSubmitting) return;
        readSubmittingRef.current = true;
        setReadSubmitting(true);

        try {
            const guest = recordGuestRead(viewingDay);
            if (!guest.didRecord) return;
            setCurrentUser(prev => prev ? {
                ...prev,
                planId: guest.planId,
                currentDay: guest.currentDay,
                streak: guest.streak,
                lastReadDate: guest.lastReadDate,
                videoType: guest.videoType,
            } : prev);
            setViewingDay(guest.currentDay);
            if (guest.requiresNextPlan) setShowNextPlanPrompt(true);
            setShowConfetti(true);
            setTimeout(() => setShowConfetti(false), 3000);
            window.refreshKakaoAdBanner?.();
            window.scrollTo({ top: 0, behavior: 'smooth' });
            // 동기 localStorage 기록도 최소 한 렌더 동안 버튼을 잠가 상태를 분명히 보인다.
            await new Promise(resolve => setTimeout(resolve, 0));
        } finally {
            readSubmittingRef.current = false;
            setReadSubmitting(false);
        }
    };

    const getEncouragementMessage = () => {
        if (hasReadToday) return '오늘의 기록은 이 기기에 저장되어 있어요.';
        return '오늘 분량을 다 읽고 기록을 남겨보세요.';
    };

    return (
        <div className="min-h-screen bg-slate-50 overflow-hidden relative font-sans">
            {showNextPlanPrompt && (
                <div className="fixed inset-0 z-[200] flex items-center justify-center bg-slate-950/75 p-4 backdrop-blur-sm" role="dialog" aria-modal="true" aria-labelledby="guest-next-plan-title">
                    <div className="w-full max-w-sm rounded-3xl border-2 border-amber-200 bg-white p-7 text-center shadow-2xl">
                        <div className="text-6xl" aria-hidden="true">🎉</div>
                        <h2 id="guest-next-plan-title" className="mt-4 text-3xl font-black text-slate-800">60일 성경 통독 완주!</h2>
                        <p className="mt-3 font-bold text-purple-600">다음 읽기 계획을 선택해 주세요.</p>
                        <select
                            value=""
                            onChange={(event) => handleGuestVersionChange(event.target.value)}
                            className="mt-6 min-h-12 w-full rounded-xl border-2 border-slate-200 bg-white px-3 font-bold text-slate-800"
                            aria-label="다음 읽기 계획 선택"
                        >
                            <option value="" disabled>다음 계획 선택</option>
                            {versionOptions.map(option => (
                                <option key={option.planId} value={option.planId}>
                                    {option.planTitle} · {option.versionName}
                                </option>
                            ))}
                        </select>
                    </div>
                </div>
            )}
            {showConfetti && <div className="fixed inset-0 z-50 flex justify-center pt-40 pointer-events-none"><div className="text-6xl animate-bounce">🎊</div></div>}

            <header className="sticky top-0 z-30 bg-white/95 backdrop-blur border-b border-slate-200">
                <div className="max-w-5xl mx-auto px-4 py-3 flex items-center justify-between gap-3">
                    <div className="flex items-center gap-3 min-w-0">
                        <div className="w-9 h-9 rounded-lg bg-slate-900 text-white flex items-center justify-center font-serif font-bold text-sm shrink-0">114</div>
                        <div className="min-w-0">
                            <p className="text-sm font-extrabold text-slate-900 truncate">성경통독 114</p>
                            <p className="text-xs font-bold text-emerald-700">게스트 모드</p>
                        </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                        <button
                            type="button"
                            onClick={onSignupClick}
                            className="min-h-11 rounded-xl bg-emerald-600 px-3 py-2 text-sm font-bold text-white transition-colors hover:bg-emerald-700"
                        >
                            <span className="sm:hidden">가입하고 저장</span>
                            <span className="hidden sm:inline">가입하고 기록 지키기</span>
                        </button>
                        <button
                            type="button"
                            onClick={handleLogout}
                            className="min-h-11 rounded-xl px-2 py-2 text-sm font-bold text-slate-500 hover:bg-red-50 hover:text-red-600"
                        >
                            나가기
                        </button>
                    </div>
                </div>
            </header>

            <div className="max-w-5xl mx-auto w-full mt-6 px-4 space-y-5" style={{ paddingBottom: 'var(--app-fixed-bottom-clearance)' }}>
                <div className="bg-amber-50 border border-amber-200 rounded-2xl px-4 py-3 text-sm text-amber-900 font-medium">
                    기록은 이 기기에만 저장되며, 브라우저 데이터 삭제 시 사라질 수 있어요. 가입하면 안전하게 보관됩니다.
                </div>
                <HomeScreenHelpBanner />

                {versionOptions.length > 1 && (
                    <div className="flex flex-col items-stretch gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-3 shadow-sm sm:flex-row sm:items-center">
                        <div className="min-w-0">
                            <p className="text-sm font-bold text-slate-600">읽는 버전</p>
                            <p className="text-sm text-slate-500">읽을 순서와 번역을 골라보세요.</p>
                        </div>
                        <select
                            aria-label="읽는 순서와 성경 번역 선택"
                            value={currentPlanId}
                            onChange={(e) => handleGuestVersionChange(e.target.value)}
                            className="min-h-11 w-full min-w-0 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-bold text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-400 sm:ml-auto sm:w-auto sm:max-w-[65%]"
                        >
                            {versionOptions.map(opt => (
                                <option key={opt.planId} value={opt.planId}>
                                    {opt.planTitle} · {opt.versionName}
                                </option>
                            ))}
                        </select>
                    </div>
                )}

                {currentPlanId.startsWith('nt_') && (
                    <div className="flex flex-col items-stretch gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-3 shadow-sm sm:flex-row sm:items-center sm:justify-between">
                        <div className="min-w-0">
                            <p className="text-sm font-bold text-slate-600">퀴즈 난이도</p>
                            <p className="text-sm text-slate-500">선택한 난이도는 이 기기에 저장돼요.</p>
                        </div>
                        <QuizLevelToggle currentUser={currentUser} setCurrentUser={setCurrentUser} />
                    </div>
                )}

                <DailyVideoCard currentUser={currentUser} setCurrentUser={setCurrentUser} />

                <BibleReader
                    verseData={verseData}
                    viewingDay={viewingDay || currentUser?.currentDay || 1}
                    setViewingDay={setViewingDay}
                    currentUser={currentUser}
                    daysRemaining={daysRemaining}
                    handleChangeVersionStart={onSignupClick}
                    getEncouragementMessage={getEncouragementMessage}
                    fontSize={fontSize}
                    setFontSize={setFontSize}
                    isSpeaking={isSpeaking}
                    isPaused={isPaused}
                    ttsSpeed={ttsSpeed}
                    handleSpeedChange={handleSpeedChange}
                    handleSpeak={handleSpeak}
                    handleStop={handleStop}
                    availableVoices={availableVoices}
                    selectedVoiceURI={selectedVoiceURI}
                    setSelectedVoiceURI={setSelectedVoiceURI}
                    activeChunkIndex={activeChunkIndex}
                    ttsError={ttsError}
                    clearTtsError={clearTtsError}
                    jumpToChunk={jumpToChunk}
                    ttsUnavailableApp={ttsUnavailableApp}
                    hasReadToday={hasReadToday}
                    handleRead={handleRead}
                    readSubmitting={readSubmitting}
                />
            </div>

            {isSpeaking && (
                <div className="fixed left-6 z-[100] flex items-center gap-2" style={{ bottom: 'calc(env(safe-area-inset-bottom, 0px) + 32px)' }}>
                    <button
                        onClick={handleTogglePause}
                        className={`flex items-center justify-center gap-2 px-5 py-3 rounded-full shadow-2xl transition-all active:scale-95 ${isPaused ? 'bg-indigo-600 shadow-indigo-200' : 'bg-orange-500 shadow-orange-200'} text-white`}
                    >
                        <span className="text-sm font-bold">{isPaused ? '다시 읽기' : '잠시 멈춤'}</span>
                        <span className="text-xl">{isPaused ? '▶️' : '⏸️'}</span>
                    </button>
                </div>
            )}
        </div>
    );
};

export default GuestReaderView;
