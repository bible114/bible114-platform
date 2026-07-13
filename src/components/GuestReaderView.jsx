import React, { useEffect, useMemo, useRef, useState } from 'react';
import { TOTAL_DAYS } from '../data/constants';
import { PLAN_TYPES, BIBLE_VERSIONS, isBibleVersionVisibleForUser } from '../data/bible_options';
import { useBibleContent } from '../hooks/useBibleContent';
import { useTTS } from '../hooks/useTTS';
import { recordGuestRead, saveGuestState } from '../utils/guestStorage';
import { DailyVideoCard, BibleReader } from './dashboard';

const GuestReaderView = ({ currentUser, setCurrentUser, handleLogout, onSignupClick }) => {
    const { verseData, viewingDay, setViewingDay, loadContent } = useBibleContent(currentUser);

    // 게스트가 고를 수 있는 버전 목록 — 특정 교회 전용(쉬운성경·새한글·메시지)은
    // isBibleVersionVisibleForUser가 걸러내므로 공개 버전만 남는다.
    const versionOptions = useMemo(() => {
        const options = [];
        PLAN_TYPES.forEach(plan => {
            (BIBLE_VERSIONS[plan.id] || [])
                .filter(version => isBibleVersionVisibleForUser(version, currentUser))
                .forEach(version => {
                    options.push({
                        planId: `${plan.id}_${version.id}`,
                        planTitle: plan.title,
                        versionName: version.name,
                    });
                });
        });
        return options;
    }, [currentUser]);

    const currentPlanId = currentUser?.planId || '1year_revised';

    const handleGuestVersionChange = (newPlanId) => {
        if (!newPlanId || newPlanId === currentPlanId) return;
        saveGuestState({ planId: newPlanId });
        setCurrentUser(prev => (prev ? { ...prev, planId: newPlanId } : prev));
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
    const daysRemaining = Math.max(0, TOTAL_DAYS - (viewingDay || currentUser?.currentDay || 1) + 1);

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
            {showConfetti && <div className="fixed inset-0 z-50 flex justify-center pt-40 pointer-events-none"><div className="text-6xl animate-bounce">🎊</div></div>}

            <header className="sticky top-0 z-30 bg-white/95 backdrop-blur border-b border-slate-200">
                <div className="max-w-5xl mx-auto px-4 py-3 flex items-center justify-between gap-3">
                    <div className="flex items-center gap-3 min-w-0">
                        <div className="w-9 h-9 rounded-lg bg-slate-900 text-white flex items-center justify-center font-serif font-bold text-sm shrink-0">114</div>
                        <div className="min-w-0">
                            <p className="text-sm font-extrabold text-slate-900 truncate">천로역정 성경읽기</p>
                            <p className="text-xs font-bold text-emerald-700">게스트 모드</p>
                        </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                        <button
                            type="button"
                            onClick={onSignupClick}
                            className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold px-3 py-2 rounded-lg transition-colors"
                        >
                            가입하고 기록 지키기
                        </button>
                        <button
                            type="button"
                            onClick={handleLogout}
                            className="text-xs font-bold text-slate-400 hover:text-red-500 px-1"
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

                {versionOptions.length > 1 && (
                    <div className="bg-white border border-slate-200 rounded-2xl px-4 py-3 shadow-sm flex items-center gap-3">
                        <div className="min-w-0">
                            <p className="text-xs font-bold text-slate-500">읽는 버전</p>
                            <p className="text-[11px] text-slate-400">순서·번역을 자유롭게 골라보세요.</p>
                        </div>
                        <select
                            value={currentPlanId}
                            onChange={(e) => handleGuestVersionChange(e.target.value)}
                            className="ml-auto shrink-0 bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-sm font-bold text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-400"
                        >
                            {versionOptions.map(opt => (
                                <option key={opt.planId} value={opt.planId}>
                                    {opt.planTitle} · {opt.versionName}
                                </option>
                            ))}
                        </select>
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
                    jumpToChunk={jumpToChunk}
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
