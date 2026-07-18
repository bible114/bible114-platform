import React from 'react';
import MarkdownRenderer from '../MarkdownRenderer';

const BibleReader = ({
    verseData,
    viewingDay,
    setViewingDay,
    currentUser,
    daysRemaining,
    handleChangeVersionStart,
    getEncouragementMessage,
    fontSize,
    setFontSize,
    isSpeaking,
    isPaused,
    ttsSpeed,
    handleSpeedChange,
    handleSpeak,
    handleStop,
    availableVoices,
    selectedVoiceURI,
    setSelectedVoiceURI,
    activeChunkIndex,
    jumpToChunk,
    ttsUnavailableApp,
    ttsError,
    clearTtsError,
    hasReadToday,
    readSubmitting,
    handleRead,
    quizContent,
    completionSummary,
    bibleHeaderRef,
    readActionRef,
}) => {
    const hasContentError = !!verseData.error;
    const isCurrentProgressDay = viewingDay === currentUser.currentDay;
    const isAdvanceRead = hasReadToday && isCurrentProgressDay;
    const completionForViewingDay = completionSummary?.completedDay === viewingDay
        ? completionSummary
        : null;
    const readButtonLabel = isAdvanceRead
        ? '한 장 더 읽기'
        : (!isCurrentProgressDay ? `내 진도 DAY ${currentUser.currentDay}에서 완료할 수 있어요` : '오늘 읽기 완료');
    const readButtonHelp = isAdvanceRead
        ? '오늘 분량은 완료했습니다. 원하면 다음 본문을 미리 읽을 수 있습니다.'
        : (!isCurrentProgressDay
            ? '다른 DAY는 살펴보기만 할 수 있습니다. 내 진도로 돌아간 뒤 완료해주세요.'
            : '오늘 본문을 다 읽은 뒤 눌러주세요. 퀴즈는 선택입니다.');

    return (
        <div className="bg-white rounded-3xl shadow-xl overflow-hidden border border-slate-100">
            <div ref={bibleHeaderRef} id="tut-bible-header" className="scroll-mt-28 p-6 text-white relative bg-gradient-to-br from-indigo-600 to-blue-700 md:scroll-mt-20">
                <div className="flex items-center justify-between mb-2 px-2">
                    <button
                        onClick={() => setViewingDay(prev => Math.max(1, prev - 1))}
                        aria-label={`이전 본문 DAY ${Math.max(1, viewingDay - 1)} 보기`}
                        className="flex min-h-11 min-w-11 items-center justify-center rounded-full bg-white/20 p-2 text-white transition-colors hover:bg-white/30 disabled:opacity-30"
                        disabled={viewingDay <= 1}
                    >
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 19l-7-7 7-7" /></svg>
                    </button>

                    <div className="text-center">
                        <h2 className="mb-1 text-xl font-bold leading-tight sm:text-2xl">{verseData.loading ? '말씀을 불러오는 중' : verseData.title}</h2>
                        <div className="flex items-center justify-center gap-2">
                            {(currentUser.readCount || 1) > 1 && (
                                <span className="text-xs bg-purple-500/90 px-2 py-0.5 rounded-full">🏆 {currentUser.readCount - 1}독 완료</span>
                            )}
                            <span className={`text-xs px-2 py-0.5 rounded-full ${isCurrentProgressDay ? 'bg-emerald-400/90' : 'bg-amber-400/90'}`}>
                                {isCurrentProgressDay ? '오늘 내 진도' : `살펴보는 DAY · 내 진도 ${currentUser.currentDay}`}
                            </span>
                            <span className="text-xs bg-white/20 px-2 py-0.5 rounded-full">🏁 D-{daysRemaining}</span>
                        </div>
                    </div>

                    <button
                        onClick={() => setViewingDay(prev => Math.min(365, prev + 1))}
                        aria-label={`다음 본문 DAY ${Math.min(365, viewingDay + 1)} 보기`}
                        className="flex min-h-11 min-w-11 items-center justify-center rounded-full bg-white/20 p-2 text-white transition-colors hover:bg-white/30 disabled:opacity-30"
                        disabled={viewingDay >= 365}
                    >
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5l7 7-7 7" /></svg>
                    </button>
                </div>
                {!isCurrentProgressDay && (
                    <button
                        type="button"
                        onClick={() => setViewingDay(currentUser.currentDay)}
                        className="mb-3 min-h-11 w-full rounded-xl border border-white/30 bg-white/15 px-4 py-2 text-sm font-bold text-white hover:bg-white/25"
                    >
                        ↩ 내 진도 DAY {currentUser.currentDay}로 돌아가기
                    </button>
                )}
                <div className="flex justify-between items-end mb-2">
                    <div className="flex-1 min-w-0">
                        <p className="opacity-90 text-sm font-bold text-white/90 mb-1 flex items-center gap-2">
                            {verseData.subtitle}
                        </p>
                        <p className="opacity-80 text-xs">{getEncouragementMessage()}</p>
                    </div>
                    <div id="tut-font-size" className="flex items-center gap-1 bg-white/20 backdrop-blur-md rounded-full px-2 py-1 shadow-sm shrink-0 ml-4">
                        <button
                            onClick={() => {
                                const newSize = Math.max(12, fontSize - 2);
                                setFontSize(newSize);
                                localStorage.setItem('bible_fontSize', newSize);
                            }}
                            className="flex min-h-11 min-w-11 items-center justify-center rounded-full bg-white/30 font-bold text-white hover:bg-white/50"
                            aria-label="본문 글자 작게"
                        >
                            −
                        </button>
                        <div className="flex flex-col items-center px-1">
                            <span className="text-white/70 text-[9px] font-bold leading-none">글씨</span>
                            <span className="text-white text-xs font-bold leading-none">{fontSize}</span>
                        </div>
                        <button
                            onClick={() => {
                                const newSize = Math.min(28, fontSize + 2);
                                setFontSize(newSize);
                                localStorage.setItem('bible_fontSize', newSize);
                            }}
                            className="flex min-h-11 min-w-11 items-center justify-center rounded-full bg-white/30 font-bold text-white hover:bg-white/50"
                            aria-label="본문 글자 크게"
                        >
                            +
                        </button>
                    </div>
                </div>

                {/* TTS UI */}
                {verseData.text && verseData.text.length > 20 && !verseData.loading && !hasContentError && (
                    <div id="tut-tts-area" className="mt-3 bg-white/10 backdrop-blur-md p-3 rounded-2xl border border-white/20">
                        {ttsUnavailableApp ? (
                            <p className="text-center text-sm leading-relaxed text-white/85">
                                네이버, 구글앱은 TTS를 지원하지 않습니다. 영상을 활용해 주세요.
                            </p>
                        ) : (
                        <div className="flex flex-col gap-2">
                            <div className="flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                    <span className="text-xl">{isSpeaking ? '🔊' : '🔈'}</span>
                                    <div className="flex flex-col">
                                        <span className="text-xs font-bold text-white/85 leading-tight">성경 읽어주기</span>
                                        <span className="text-[11px] text-white/65 leading-tight">{isSpeaking ? (isPaused ? "잠시 멈춤" : "낭독 중...") : "듣기를 누르면 시작해요"}</span>
                                    </div>
                                </div>

                                <div className="flex items-center gap-2">
                                    <div className="flex items-center bg-black/20 rounded-lg px-1 py-0.5">
                                        <button
                                            onClick={() => handleSpeedChange(-0.1)}
                                            disabled={ttsSpeed <= 0.6}
                                            className="flex min-h-11 min-w-11 items-center justify-center text-white/80 hover:text-white disabled:opacity-30"
                                            aria-label="낭독 속도 느리게"
                                        >
                                            -
                                        </button>
                                        <span className="text-xs font-bold text-white min-w-[32px] text-center">
                                            {ttsSpeed.toFixed(1)}x
                                        </span>
                                        <button
                                            onClick={() => handleSpeedChange(0.1)}
                                            disabled={ttsSpeed >= 2.0}
                                            className="flex min-h-11 min-w-11 items-center justify-center text-white/80 hover:text-white disabled:opacity-30"
                                            aria-label="낭독 속도 빠르게"
                                        >
                                            +
                                        </button>
                                    </div>

                                    <button
                                        onClick={() => isSpeaking ? handleStop() : handleSpeak(verseData.text)}
                                        className={`min-h-11 px-4 py-2 rounded-xl text-sm font-bold transition-all shadow-sm ${isSpeaking
                                            ? "bg-red-500 text-white hover:bg-red-600 ring-2 ring-red-400/50"
                                            : "bg-white text-indigo-600 hover:bg-indigo-50"
                                            }`}
                                    >
                                        {isSpeaking ? "중지 ⏹️" : "듣기 ▶️"}
                                    </button>
                                </div>
                            </div>

                            {availableVoices.length > 0 && (
                                <div className="flex items-center gap-2 pt-1 border-t border-white/10">
                                    <span className="text-xs text-white/70 shrink-0">목소리:</span>
                                    <select
                                        value={selectedVoiceURI}
                                        onChange={(e) => {
                                            const newVoiceURI = e.target.value;
                                            handleStop();
                                            setSelectedVoiceURI(newVoiceURI);
                                            localStorage.setItem('bible_selectedVoiceURI', newVoiceURI);
                                        }}
                                        className="min-h-10 flex-1 bg-black/30 text-white text-xs py-2 px-2 rounded border border-white/10 focus:outline-none focus:ring-1 focus:ring-white/30 truncate"
                                    >
                                        {availableVoices.map(voice => (
                                            <option key={voice.voiceURI} value={voice.voiceURI}>
                                                {voice.name}
                                            </option>
                                        ))}
                                    </select>
                                </div>
                            )}
                        </div>
                        )}
                    </div>
                )}
                {ttsError && (
                    <div role="alert" className="mt-3 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-rose-900">
                        <p className="text-sm font-bold">낭독이 중단되었습니다.</p>
                        <p className="mt-1 text-xs leading-relaxed">{String(ttsError)}</p>
                        <div className="mt-3 flex gap-2">
                            <button
                                type="button"
                                onClick={() => {
                                    clearTtsError?.();
                                    handleSpeak(verseData.text);
                                }}
                                className="min-h-11 flex-1 rounded-xl bg-rose-700 px-3 py-2 text-sm font-bold text-white"
                            >
                                처음부터 다시 듣기
                            </button>
                            <button
                                type="button"
                                onClick={() => clearTtsError?.()}
                                className="min-h-11 rounded-xl border border-rose-200 bg-white px-4 py-2 text-sm font-bold text-rose-700"
                            >
                                닫기
                            </button>
                        </div>
                    </div>
                )}
            </div>

            <div className="p-6 bg-white">
                <div id="tut-bible-text" className="prose prose-slate max-w-none mb-10 min-h-[300px]">
                    {verseData.loading ? (
                        <div className="flex flex-col items-center justify-center py-20 space-y-4">
                            <div className="w-12 h-12 border-4 border-blue-100 border-t-blue-500 rounded-full animate-spin"></div>
                            <p className="font-bold text-slate-600">말씀을 불러오고 있습니다</p>
                            <p className="text-center text-sm leading-relaxed text-slate-500">인터넷이 느리면 잠시 걸릴 수 있어요.<br />화면을 닫지 말고 조금만 기다려 주세요.</p>
                        </div>
                    ) : hasContentError ? (
                        <div className="rounded-2xl border border-amber-200 bg-amber-50 px-5 py-6 text-center">
                            <p className="text-base font-bold text-amber-900 mb-2">본문을 아직 불러오지 못했습니다</p>
                            <p className="text-sm leading-6 text-amber-800 whitespace-pre-line">{verseData.text}</p>
                            <button
                                type="button"
                                onClick={() => window.location.reload()}
                                className="mt-4 min-h-11 rounded-xl bg-amber-700 px-5 py-2.5 text-sm font-bold text-white"
                            >
                                본문 다시 불러오기
                            </button>
                        </div>
                    ) : (
                        <MarkdownRenderer
                            content={verseData.text}
                            fontSize={fontSize}
                            activeChunkIndex={activeChunkIndex}
                            onSegmentClick={ttsUnavailableApp ? null : jumpToChunk}
                        />
                    )}
                </div>

                {!verseData.loading && !hasContentError && quizContent && (
                    <div id="tut-quiz-area">
                        <div className="mb-3 rounded-2xl border border-indigo-100 bg-indigo-50 px-4 py-3 text-sm font-bold text-indigo-800">
                            🧩 선택 활동 · 퀴즈를 풀지 않아도 읽기 완료와 다음 DAY 진행이 가능합니다.
                        </div>
                        {quizContent}
                    </div>
                )}

                {!verseData.loading && !hasContentError && completionForViewingDay ? (
                    <div ref={readActionRef} id="tut-read-btn" className="scroll-mt-4 mt-8 rounded-3xl border border-emerald-200 bg-emerald-50 p-5 text-center">
                        <p className="text-xl font-black text-emerald-900">DAY {completionForViewingDay.completedDay} {completionForViewingDay.isFirstReadToday ? '읽기 완료! 🎉' : '추가 읽기 완료! 🎉'}</p>
                        <p className="mt-2 text-lg font-bold text-emerald-700">
                            +{completionForViewingDay.scoreEarned}점
                        </p>
                        {completionForViewingDay.talentProgramEnabled && (
                            <p className="mt-1 text-sm font-bold text-emerald-700">
                                읽기 달란트 +{completionForViewingDay.readingTalentEarned || 0}
                                {completionForViewingDay.quizTalentEarned > 0 ? ` · 퀴즈 +${completionForViewingDay.quizTalentEarned}` : ''}
                            </p>
                        )}
                        {completionForViewingDay.talentProgramEnabled && !completionForViewingDay.isFirstReadToday && <p className="mt-1 text-sm font-bold text-emerald-700">추가 읽기는 점수와 달란트가 더 적립되지 않아요.</p>}
                        <button type="button" onClick={handleRead} disabled={readSubmitting || !isCurrentProgressDay} className="mt-4 min-h-11 rounded-full border border-emerald-300 bg-white px-5 py-2.5 text-sm font-bold text-emerald-800 disabled:opacity-50">
                            {readSubmitting ? '기록 중...' : '한 장 더 읽기'}
                        </button>
                    </div>
                ) : !verseData.loading && !hasContentError && (
                    <div ref={readActionRef} id="tut-read-btn" className="scroll-mt-4 mt-8 pt-6 border-t border-slate-100">
                        <div className="relative">
                            <button
                                onClick={handleRead}
                                disabled={readSubmitting || !isCurrentProgressDay}
                                className={`w-full py-5 rounded-3xl font-bold text-xl transition-all shadow-xl hover:shadow-2xl active:scale-95 disabled:cursor-not-allowed disabled:opacity-60 disabled:active:scale-100 flex items-center justify-center gap-3
                                    ${isAdvanceRead
                                        ? "bg-slate-800 text-white"
                                        : "bg-gradient-to-r from-blue-600 to-indigo-600 text-white hover:from-blue-700 hover:to-indigo-700"
                                    }`}
                            >
                                <span className="text-2xl">📖</span>
                                {readSubmitting ? '기록 중...' : readButtonLabel}
                            </button>
                        </div>
                        <p className="mt-4 text-center text-sm font-medium leading-relaxed text-slate-500">
                            {readButtonHelp}
                        </p>
                    </div>
                )}
            </div>
        </div>
    );
};

export default BibleReader;
