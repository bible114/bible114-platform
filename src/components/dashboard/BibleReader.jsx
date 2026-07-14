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
    hasReadToday,
    readSubmitting,
    handleRead,
    quizGateOpen,
    onQuizGateLocked,
    quizContent,
    completionSummary,
}) => {
    const hasContentError = !!verseData.error;
    const isCurrentProgressDay = viewingDay === currentUser.currentDay;
    const isAdvanceRead = hasReadToday && isCurrentProgressDay;
    const isQuizGateLocked = currentUser.role !== 'guest'
        && isCurrentProgressDay
        // 오늘 첫 읽기를 마친 뒤의 "한 장 더 읽기"는 퀴즈와 무관하게 허용한다.
        && !isAdvanceRead
        && !quizGateOpen;
    const readButtonLabel = isAdvanceRead
        ? '한 장 더 읽기'
        : (isQuizGateLocked ? '☝️ 먼저 오늘 퀴즈 풀기' : (!hasReadToday && isCurrentProgressDay ? '오늘 읽기 완료' : '읽기 완료'));
    const readButtonHelp = isAdvanceRead
        ? '오늘 분량은 완료했습니다. 원하면 다음 본문을 미리 읽을 수 있습니다.'
        : (isQuizGateLocked
            ? '퀴즈를 풀면 읽기 완료 버튼이 열려요'
            : !hasReadToday && isCurrentProgressDay
            ? '오늘 본문을 다 읽은 뒤 눌러주세요.'
            : '이 본문을 다 읽은 뒤 눌러주세요.');

    return (
        <div className="bg-white rounded-3xl shadow-xl overflow-hidden border border-slate-100">
            <div id="tut-bible-header" className="p-6 text-white relative bg-gradient-to-br from-indigo-600 to-blue-700">
                <div className="flex items-center justify-between mb-2 px-2">
                    <button
                        onClick={() => setViewingDay(prev => Math.max(1, prev - 1))}
                        className="p-2 rounded-full bg-white/20 hover:bg-white/30 text-white transition-colors disabled:opacity-30"
                        disabled={viewingDay <= 1}
                    >
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 19l-7-7 7-7" /></svg>
                    </button>

                    <div className="text-center">
                        <h2 className="text-2xl font-bold mb-1">{verseData.loading ? '로딩중...' : verseData.title}</h2>
                        <div className="flex items-center justify-center gap-2">
                            {(currentUser.readCount || 1) > 1 && (
                                <span className="text-xs bg-purple-500/90 px-2 py-0.5 rounded-full">🏆 {currentUser.readCount - 1}독 완료</span>
                            )}
                            <span className="text-xs bg-white/20 px-2 py-0.5 rounded-full">🏁 D-{daysRemaining}</span>
                        </div>
                    </div>

                    <button
                        onClick={() => setViewingDay(prev => Math.min(365, prev + 1))}
                        className="p-2 rounded-full bg-white/20 hover:bg-white/30 text-white transition-colors disabled:opacity-30"
                        disabled={viewingDay >= 365}
                    >
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5l7 7-7 7" /></svg>
                    </button>
                </div>
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
                            className="w-7 h-7 rounded-full bg-white/30 hover:bg-white/50 flex items-center justify-center text-white font-bold"
                        >
                            −
                        </button>
                        <div className="flex flex-col items-center px-1">
                            <span className="text-white/60 text-[7px] font-bold leading-none">SIZE</span>
                            <span className="text-white text-xs font-bold leading-none">{fontSize}</span>
                        </div>
                        <button
                            onClick={() => {
                                const newSize = Math.min(28, fontSize + 2);
                                setFontSize(newSize);
                                localStorage.setItem('bible_fontSize', newSize);
                            }}
                            className="w-7 h-7 rounded-full bg-white/30 hover:bg-white/50 flex items-center justify-center text-white font-bold"
                        >
                            +
                        </button>
                    </div>
                </div>

                {/* TTS UI */}
                {verseData.text && verseData.text.length > 20 && !verseData.loading && !hasContentError && (
                    <div id="tut-tts-area" className="mt-3 bg-white/10 backdrop-blur-md p-3 rounded-2xl border border-white/20">
                        {ttsUnavailableApp ? (
                            <p className="text-center text-[11px] leading-relaxed text-white/75">
                                네이버, 구글앱은 TTS를 지원하지 않습니다. 영상을 활용해 주세요.
                            </p>
                        ) : (
                        <div className="flex flex-col gap-2">
                            <div className="flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                    <span className="text-base">{isSpeaking ? '🔊' : '🔈'}</span>
                                    <div className="flex flex-col">
                                        <span className="text-[10px] font-bold text-white/70 leading-tight">성경 읽어주기</span>
                                        <span className="text-[9px] text-white/50 leading-tight">{isSpeaking ? (isPaused ? "잠시 멈춤" : "낭독 중...") : "대기 중"}</span>
                                    </div>
                                </div>

                                <div className="flex items-center gap-2">
                                    <div className="flex items-center bg-black/20 rounded-lg px-1 py-0.5">
                                        <button
                                            onClick={() => handleSpeedChange(-0.1)}
                                            disabled={ttsSpeed <= 0.6}
                                            className="w-5 h-5 flex items-center justify-center text-white/80 hover:text-white disabled:opacity-30"
                                        >
                                            -
                                        </button>
                                        <span className="text-[10px] font-bold text-white min-w-[24px] text-center">
                                            {ttsSpeed.toFixed(1)}x
                                        </span>
                                        <button
                                            onClick={() => handleSpeedChange(0.1)}
                                            disabled={ttsSpeed >= 2.0}
                                            className="w-5 h-5 flex items-center justify-center text-white/80 hover:text-white disabled:opacity-30"
                                        >
                                            +
                                        </button>
                                    </div>

                                    <button
                                        onClick={() => isSpeaking ? handleStop() : handleSpeak(verseData.text)}
                                        className={`px-4 py-1.5 rounded-xl text-xs font-bold transition-all shadow-sm ${isSpeaking
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
                                    <span className="text-[9px] text-white/50 shrink-0">목소리:</span>
                                    <select
                                        value={selectedVoiceURI}
                                        onChange={(e) => {
                                            const newVoiceURI = e.target.value;
                                            handleStop();
                                            setSelectedVoiceURI(newVoiceURI);
                                            localStorage.setItem('bible_selectedVoiceURI', newVoiceURI);
                                        }}
                                        className="flex-1 bg-black/30 text-white text-[9px] py-1 px-2 rounded border border-white/10 focus:outline-none focus:ring-1 focus:ring-white/30 truncate"
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
            </div>

            <div className="p-6 bg-white">
                <div id="tut-bible-text" className="prose prose-slate max-w-none mb-10 min-h-[300px]">
                    {verseData.loading ? (
                        <div className="flex flex-col items-center justify-center py-20 space-y-4">
                            <div className="w-12 h-12 border-4 border-blue-100 border-t-blue-500 rounded-full animate-spin"></div>
                            <p className="text-slate-400 font-bold animate-pulse">말씀을 가져오고 있습니다...</p>
                        </div>
                    ) : hasContentError ? (
                        <div className="rounded-2xl border border-amber-200 bg-amber-50 px-5 py-6 text-center">
                            <p className="text-base font-bold text-amber-900 mb-2">본문을 아직 불러오지 못했습니다</p>
                            <p className="text-sm leading-6 text-amber-800 whitespace-pre-line">{verseData.text}</p>
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

                {!verseData.loading && !hasContentError && quizContent}

                {!verseData.loading && !hasContentError && completionSummary ? (
                    <div id="tut-read-btn" className="mt-8 rounded-3xl border border-emerald-200 bg-emerald-50 p-5 text-center">
                        <p className="text-xl font-black text-emerald-900">{completionSummary.isFirstReadToday ? '오늘 읽기 완료! 🎉' : '추가 읽기 완료! 🎉'}</p>
                        <p className="mt-2 text-lg font-bold text-emerald-700">
                            +{completionSummary.scoreEarned}점{completionSummary.talentProgramEnabled ? ` · 달란트 +${completionSummary.talentEarned}` : ''}
                        </p>
                        {completionSummary.talentProgramEnabled && !completionSummary.isFirstReadToday && <p className="mt-1 text-sm font-bold text-emerald-700">퀴즈 달란트는 하루 1번만 적립돼요.</p>}
                        <button type="button" onClick={isQuizGateLocked ? onQuizGateLocked : handleRead} disabled={readSubmitting} className="mt-4 rounded-full border border-emerald-300 bg-white px-5 py-2.5 text-sm font-bold text-emerald-800 disabled:opacity-50">
                            {readSubmitting ? '기록 중...' : (isQuizGateLocked ? '☝️ 먼저 이 본문 퀴즈 풀기' : '한 장 더 읽기')}
                        </button>
                    </div>
                ) : !verseData.loading && !hasContentError && (
                    <div id="tut-read-btn" className="mt-8 pt-6 border-t border-slate-100">
                        <div className="relative">
                            <button
                                onClick={isQuizGateLocked ? onQuizGateLocked : handleRead}
                                disabled={readSubmitting}
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
                        <p className="text-center text-xs text-slate-400 mt-4 font-medium">
                            {readButtonHelp}
                        </p>
                    </div>
                )}
            </div>
        </div>
    );
};

export default BibleReader;
