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
    hasReadToday,
    handleRead
}) => {
    return (
        <div className="bg-white rounded-3xl shadow-xl overflow-hidden border border-slate-100">
            <div className="p-6 text-white relative bg-gradient-to-br from-indigo-600 to-blue-700">
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
                                <span className="text-xs bg-purple-500/90 px-2 py-0.5 rounded-full">🏆 {currentUser.readCount}독</span>
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
                    <div className="flex items-center gap-1 bg-white/20 backdrop-blur-md rounded-full px-2 py-1 shadow-sm shrink-0 ml-4">
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
                {verseData.text && verseData.text.length > 20 && !verseData.loading && (
                    <div className="mt-3 bg-white/10 backdrop-blur-md p-3 rounded-2xl border border-white/20">
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
                                            setSelectedVoiceURI(newVoiceURI);
                                            localStorage.setItem('bible_selectedVoiceURI', newVoiceURI);
                                            if (isSpeaking) {
                                                const currentIndex = activeChunkIndex;
                                                handleStop();
                                                setTimeout(() => {
                                                    handleSpeak(verseData.text, currentIndex);
                                                }, 100);
                                            }
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
                    </div>
                )}
            </div>

            <div className="p-6 bg-white">
                <div className="prose prose-slate max-w-none mb-10 min-h-[300px]">
                    {verseData.loading ? (
                        <div className="flex flex-col items-center justify-center py-20 space-y-4">
                            <div className="w-12 h-12 border-4 border-blue-100 border-t-blue-500 rounded-full animate-spin"></div>
                            <p className="text-slate-400 font-bold animate-pulse">말씀을 가져오고 있습니다...</p>
                        </div>
                    ) : (
                        <MarkdownRenderer
                            content={verseData.text}
                            fontSize={fontSize}
                            activeChunkIndex={activeChunkIndex}
                            onSegmentClick={jumpToChunk}
                        />
                    )}
                </div>

                {!verseData.loading && (
                    <div className="mt-8 pt-6 border-t border-slate-100">
                        <button
                            onClick={handleRead}
                            className={`w-full py-5 rounded-3xl font-bold text-xl transition-all shadow-xl hover:shadow-2xl active:scale-95 flex items-center justify-center gap-3
                                ${hasReadToday && viewingDay === currentUser.currentDay
                                    ? "bg-slate-800 text-white"
                                    : "bg-gradient-to-r from-blue-600 to-indigo-600 text-white hover:from-blue-700 hover:to-indigo-700"
                                }`}
                        >
                            <span className="text-2xl">📖</span>
                            한 장 더 읽기 (미리 읽기)
                        </button>
                        <p className="text-center text-xs text-slate-400 mt-4 font-medium">
                            {hasReadToday && viewingDay === currentUser.currentDay
                                ? "훌륭합니다! 내일 분량을 미리 읽을 수 있습니다 🏃‍♂️"
                                : "읽기를 완료하면 점수와 불꽃이 올라갑니다!"
                            }
                        </p>
                    </div>
                )}
            </div>
        </div>
    );
};

export default BibleReader;
