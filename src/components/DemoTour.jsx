import React, { useState } from 'react';
import { BibleReader, DashboardHeader, MemoSection } from './dashboard';
import TutorialOverlay from './TutorialOverlay';

const DEMO_VERSE_DATA = {
    title: '성경통독 114 DAY 150',
    subtitle: '시편 22-24편 / 사도행전 7장',
    text: `# 시편 23편

[[VERSE:1]]여호와는 나의 목자시니 내게 부족함이 없으리로다

[[VERSE:2]]그가 나를 푸른 풀밭에 누이시며 쉴 만한 물 가로 인도하시는도다

[[VERSE:3]]내 영혼을 소생시키시고 자기 이름을 위하여 의의 길로 인도하시는도다

[[VERSE:4]]내가 사망의 음침한 골짜기로 다닐지라도 해를 두려워하지 않을 것은 주께서 나와 함께 하심이라`,
    audioUrl: null,
    loading: false,
};

const DEMO_USER = {
    uid: 'demo-user',
    name: '체험 사용자',
    currentDay: 150,
    streak: 12,
    readCount: 1,
    departmentId: 'senior',
    departmentName: '장년부',
    subgroupId: '1구역',
    planId: '1year_revised',
};

const DemoVideoCard = () => (
    <section id="tut-daily-video" className="overflow-hidden rounded-3xl border border-slate-100 bg-white shadow-xl">
        <div className="flex items-center justify-between bg-gradient-to-br from-indigo-600 to-blue-700 p-5 text-white">
            <h2 className="flex items-center gap-2 text-lg font-bold"><span>🎬</span> 매일성경</h2>
            <span className="rounded-full bg-white/20 px-3 py-2 text-sm font-bold">성인용</span>
        </div>
        <div className="p-5">
            <div className="flex aspect-video items-center justify-center rounded-2xl bg-gradient-to-br from-slate-800 to-indigo-950 text-center text-white">
                <div>
                    <div className="mx-auto mb-3 flex h-16 w-16 items-center justify-center rounded-full bg-white/95 text-3xl text-indigo-600 shadow-xl">▶</div>
                    <p className="text-sm font-bold">오늘의 본문 해설과 기도</p>
                </div>
            </div>
        </div>
    </section>
);

const DemoQuiz = () => (
    <section className="rounded-3xl border border-violet-100 bg-violet-50 p-5">
        <p className="text-xs font-black text-violet-600">오늘의 선택 퀴즈</p>
        <p className="mt-2 font-bold text-slate-800">시편 23편에서 여호와는 무엇에 비유되나요?</p>
        <div className="mt-3 grid grid-cols-2 gap-2 text-sm font-bold text-slate-600">
            <div className="rounded-xl bg-white px-3 py-3">① 목자</div>
            <div className="rounded-xl bg-white px-3 py-3">② 농부</div>
        </div>
    </section>
);

// 로그인 전에 실제 대시보드 사용 순서를 안전한 예시 데이터로 보여준다.
const DemoTour = ({ onClose, onComplete }) => {
    const [fontSize, setFontSize] = useState(16);
    const [viewingDay, setViewingDay] = useState(150);
    const [currentMemo, setCurrentMemo] = useState('오늘 말씀에서 받은 은혜를 짧게 적어보세요.');
    const noop = () => {};

    const handleTourComplete = () => {
        onClose();
        setTimeout(() => onComplete?.(), 80);
    };

    return (
        <div className="demo-tour-root fixed inset-0 z-[1100] overflow-y-auto bg-slate-50">
            <button
                type="button"
                onClick={onClose}
                className="fixed right-3 top-3 z-[105] flex min-h-11 items-center gap-1.5 rounded-full bg-slate-800 px-4 py-2 text-xs font-bold text-white shadow-lg"
            >
                ✕ 체험 종료
            </button>

            <div className="bg-gradient-to-r from-amber-400 to-yellow-500 py-2 text-center text-xs font-bold text-white">
                체험 화면 · 저장되지 않는 예시 데이터입니다
            </div>

            <div className="font-sans">
                <DashboardHeader
                    handleLogout={noop}
                    streak={DEMO_USER.streak}
                    talent={42}
                    setShowAchievements={noop}
                    setShowDateSettings={noop}
                    setShowCalendar={noop}
                    setShowReadingGuide={noop}
                    setShowFaq={noop}
                    setShowTutorial={noop}
                    setShowAccountHelp={noop}
                    planTypeName="성경통독 114"
                    versionName="개역개정"
                    handleChangeVersionStart={noop}
                    setView={noop}
                    isChurchAdmin={false}
                />

                <main className="mx-auto w-full max-w-3xl space-y-6 px-4 pb-12 pt-3">
                    <DemoVideoCard />

                    <BibleReader
                        verseData={DEMO_VERSE_DATA}
                        viewingDay={viewingDay}
                        setViewingDay={setViewingDay}
                        currentUser={DEMO_USER}
                        daysRemaining={215}
                        handleChangeVersionStart={noop}
                        getEncouragementMessage={() => '🔥 12일 연속 읽기 중이에요'}
                        fontSize={fontSize}
                        setFontSize={setFontSize}
                        isSpeaking={false}
                        isPaused={false}
                        ttsSpeed={1}
                        handleSpeedChange={noop}
                        handleSpeak={noop}
                        handleStop={noop}
                        availableVoices={[]}
                        selectedVoiceURI=""
                        setSelectedVoiceURI={noop}
                        activeChunkIndex={-1}
                        jumpToChunk={noop}
                        hasReadToday={false}
                        handleRead={noop}
                        quizContent={<DemoQuiz />}
                    />

                    <MemoSection
                        currentMemo={currentMemo}
                        setCurrentMemo={setCurrentMemo}
                        setShowMemoList={noop}
                        saveMemo={noop}
                        viewingDay={150}
                        currentDay={150}
                        readCount={1}
                        memos={{}}
                    />
                </main>
            </div>

            <TutorialOverlay onClose={onClose} onComplete={handleTourComplete} />
        </div>
    );
};

export default DemoTour;
