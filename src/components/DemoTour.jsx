import React, { useState } from 'react';
import {
    DashboardHeader,
    RaceMap,
    BibleReader,
    MemoSection,
    SubgroupRankingCard,
} from './dashboard';
import TutorialOverlay from './TutorialOverlay';
import { getSubgroupDisplay } from '../utils/dashboardUtils';

const DEMO_LEVEL = { emoji: '🔥', name: '광야 통과자', minScore: 700, maxScore: 1500 };

const DEMO_RACERS = [
    { uid: 'd1', name: '김믿음', currentDay: 312, day: 312, readCount: 1, score: 1820, subgroupId: '1구역', departmentId: 'senior', departmentName: '장년부', isMe: false, lastReadDate: new Date().toDateString() },
    { uid: 'd2', name: '이은혜', currentDay: 298, day: 298, readCount: 1, score: 1740, subgroupId: '2구역', departmentId: 'senior', departmentName: '장년부', isMe: false, lastReadDate: new Date().toDateString() },
    { uid: 'd3', name: '박소망', currentDay: 265, day: 265, readCount: 1, score: 1520, subgroupId: '3구역', departmentId: 'senior', departmentName: '장년부', isMe: false, lastReadDate: new Date().toDateString() },
    { uid: 'd4', name: '최기쁨', currentDay: 220, day: 220, readCount: 1, score: 1280, subgroupId: '1구역', departmentId: 'senior', departmentName: '장년부', isMe: false, lastReadDate: new Date().toDateString() },
    { uid: 'd5', name: '정평안', currentDay: 195, day: 195, readCount: 1, score: 1110, subgroupId: '2구역', departmentId: 'senior', departmentName: '장년부', isMe: false, lastReadDate: new Date().toDateString() },
    { uid: 'd6', name: '강사랑', currentDay: 175, day: 175, readCount: 1, score: 980, subgroupId: '1구역', departmentId: 'senior', departmentName: '장년부', isMe: false, lastReadDate: new Date().toDateString() },
    { uid: 'demo-me', name: '나 (체험)', currentDay: 150, day: 150, readCount: 1, score: 850, subgroupId: '1구역', departmentId: 'senior', departmentName: '장년부', isMe: true, lastReadDate: new Date().toDateString() },
    { uid: 'd8', name: '윤겸손', currentDay: 130, day: 130, readCount: 1, score: 720, subgroupId: '3구역', departmentId: 'senior', departmentName: '장년부', isMe: false, lastReadDate: new Date().toDateString() },
    { uid: 'd9', name: '조온유', currentDay: 105, day: 105, readCount: 1, score: 580, subgroupId: '2구역', departmentId: 'senior', departmentName: '장년부', isMe: false, lastReadDate: new Date().toDateString() },
    { uid: 'd10', name: '한충성', currentDay: 88, day: 88, readCount: 1, score: 470, subgroupId: '1구역', departmentId: 'senior', departmentName: '장년부', isMe: false, lastReadDate: new Date().toDateString() },
    { uid: 'd11', name: '오자비', currentDay: 65, day: 65, readCount: 1, score: 360, subgroupId: '2구역', departmentId: 'senior', departmentName: '장년부', isMe: false, lastReadDate: new Date().toDateString() },
    { uid: 'd12', name: '서절제', currentDay: 42, day: 42, readCount: 1, score: 230, subgroupId: '3구역', departmentId: 'senior', departmentName: '장년부', isMe: false, lastReadDate: new Date().toDateString() },
];

const DEMO_VERSE_TEXT = `# 시편 23편

[[VERSE:1]]여호와는 나의 목자시니 내게 부족함이 없으리로다

[[VERSE:2]]그가 나를 푸른 풀밭에 누이시며 쉴 만한 물 가로 인도하시는도다

[[VERSE:3]]내 영혼을 소생시키시고 자기 이름을 위하여 의의 길로 인도하시는도다

[[VERSE:4]]내가 사망의 음침한 골짜기로 다닐지라도 해를 두려워하지 않을 것은 주께서 나와 함께 하심이라 주의 지팡이와 막대기가 나를 안위하시나이다

[[VERSE:5]]주께서 내 원수의 목전에서 내게 상을 차려 주시고 기름을 내 머리에 부으셨으니 내 잔이 넘치나이다

[[VERSE:6]]내 평생에 선하심과 인자하심이 반드시 나를 따르리니 내가 여호와의 집에 영원히 살리로다`;

const DEMO_VERSE_DATA = {
    title: '성경통독 114 DAY 150일',
    subtitle: '시편 22-24편 / 사도행전 7장',
    text: DEMO_VERSE_TEXT,
    audioUrl: null,
    loading: false,
};

const DEMO_USER = {
    uid: 'demo-me',
    name: '체험 사용자',
    currentDay: 150,
    score: 850,
    streak: 12,
    readCount: 1,
    departmentId: 'senior',
    departmentName: '장년부',
    subgroupId: '1구역',
    planId: '1year_revised',
    lastReadDate: new Date().toDateString(),
};

// onClose: 체험 종료 / 건너뛰기
// onComplete: 투어 마지막 단계까지 완료 시 → 성경통독 114 설명 표시
const DemoTour = ({ onClose, onComplete }) => {
    const [fontSize, setFontSize] = useState(16);
    const [currentMemo, setCurrentMemo] = useState('오늘 본문 시편 23편을 읽으며, 주님이 내 목자가 되심에 큰 위로를 받았다. 어려운 시기를 지나는 중에도 함께하시는 그 사랑을 다시 한 번 새깁니다.');
    const [viewingDay, setViewingDay] = useState(150);
    const noop = () => {};

    const getEncouragementMessage = () => '🔥 12일 연속 읽기 중! 놀라워요!';

    const fakeRanking = [
        { name: '1구역', progressRate: 78, avgDay: 285, totalScore: 4530, totalCount: 12, departmentId: 'senior', departmentName: '장년부' },
        { name: '2구역', progressRate: 71, avgDay: 259, totalScore: 4080, totalCount: 11, departmentId: 'senior', departmentName: '장년부' },
        { name: '3구역', progressRate: 64, avgDay: 234, totalScore: 3620, totalCount: 10, departmentId: 'senior', departmentName: '장년부' },
    ];

    const getSubgroupRanking = () => fakeRanking;

    const allRacersSorted = [...DEMO_RACERS].sort((a, b) => b.day - a.day);
    const top20 = allRacersSorted.slice(0, 20);
    const racers = top20.sort((a, b) => a.day - b.day);

    const handleTourComplete = () => {
        onClose();
        setTimeout(() => onComplete && onComplete(), 80);
    };

    return (
        <div className="demo-tour-root fixed inset-0 z-[80] bg-slate-50 overflow-y-auto">
            <style>{`
                .demo-tour-root header.sticky {
                    position: relative !important;
                    top: auto !important;
                    z-index: auto !important;
                }
            `}</style>

            <button
                onClick={onClose}
                className="fixed top-3 right-3 z-[105] bg-slate-800 hover:bg-slate-900 text-white text-xs font-bold px-3 py-2 rounded-full shadow-lg flex items-center gap-1.5"
            >
                <span>✕</span> 체험 종료
            </button>

            <div className="bg-gradient-to-r from-amber-400 to-yellow-500 text-white text-center text-xs font-bold py-2">
                🔍 체험 모드 — 가짜 데이터로 보여드리는 미리보기 화면입니다
            </div>

            <div className="font-sans">
                <DashboardHeader
                    handleLogout={noop}
                    streak={DEMO_USER.streak}
                    score={DEMO_USER.score}
                    myLevel={DEMO_LEVEL}
                    setShowScoreInfo={noop}
                    setShowAchievements={noop}
                    setShowDateSettings={noop}
                    setShowCalendar={noop}
                    setShowReadingGuide={noop}
                    getEncouragementMessage={getEncouragementMessage}
                    departmentName={DEMO_USER.departmentName}
                    setShowFullRanking={noop}
                    topProgressGroups={fakeRanking}
                    departmentId={DEMO_USER.departmentId}
                    subgroupId={DEMO_USER.subgroupId}
                    planTypeName="성경통독 114"
                    versionName="개역개정"
                    handleChangeVersionStart={noop}
                    setView={noop}
                    isChurchAdmin={false}
                />

                <div className="max-w-5xl mx-auto w-full pb-10 mt-8">
                    <RaceMap
                        racers={racers}
                        departmentChampions={{}}
                        getSubgroupDisplay={getSubgroupDisplay}
                    />

                    <main className="px-4 space-y-6">
                        <BibleReader
                            verseData={DEMO_VERSE_DATA}
                            viewingDay={viewingDay}
                            setViewingDay={setViewingDay}
                            currentUser={DEMO_USER}
                            daysRemaining={215}
                            handleChangeVersionStart={noop}
                            getEncouragementMessage={getEncouragementMessage}
                            fontSize={fontSize}
                            setFontSize={setFontSize}
                            isSpeaking={false}
                            isPaused={false}
                            ttsSpeed={1.0}
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
                        />

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
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

                            <SubgroupRankingCard
                                departmentName={DEMO_USER.departmentName}
                                getSubgroupRanking={getSubgroupRanking}
                                subgroupId={DEMO_USER.subgroupId}
                                departmentId={DEMO_USER.departmentId}
                            />
                        </div>
                    </main>
                </div>
            </div>

            <TutorialOverlay onClose={onClose} onComplete={handleTourComplete} />
        </div>
    );
};

export default DemoTour;
