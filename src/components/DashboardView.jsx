import React from 'react';
import { TOTAL_DAYS } from '../data/constants';
import { BIBLE_VERSIONS, PLAN_TYPES } from '../data/bible_options';
import { getLevelInfo } from '../data/levels';
import { DEFAULT_DEPARTMENTS } from '../data/departments';

// Modals
import {
    ScoreInfoModal,
    ReadingGuideModal,
    AchievementsModal,
    CalendarModal,
    MonthlyContestInfoModal,
    RestartConfirmModal,
    DateSettingsModal,
    RankingModal,
    MemoListModal,
    SubgroupChangeModal
} from './modals';

// Dashboard Components
import {
    DashboardHeader,
    RaceMap,
    AnnouncementBanner,
    BibleReader,
    MemoSection,
    SubgroupRankingCard,
    ReadingChampionSection,
    KakaoChannelButton
} from './dashboard';

const DashboardView = ({
    currentUser,
    departmentMembers,
    allMembersForRace,
    memos,
    currentMemo,
    setCurrentMemo,
    readHistory,
    announcement,
    kakaoLink,
    verseData,
    hasReadToday,
    viewingDay,
    setViewingDay,
    fontSize,
    setFontSize,
    isSpeaking,
    isPaused,
    handleTogglePause,
    ttsSpeed,
    handleSpeedChange,
    handleStop,
    handleSpeak,
    availableVoices,
    selectedVoiceURI,
    setSelectedVoiceURI,
    activeChunkIndex,
    jumpToChunk,
    handleRead,
    saveMemo,
    handleLogout,
    handleChangeVersionStart,
    handleRestart,
    changeSubgroup,
    changeStartDate,
    dateToOffset,
    // UI State
    showConfetti,
    levelUpToast,
    bonusToast,
    newAchievement,
    showScoreInfo, setShowScoreInfo,
    showReadingGuide, setShowReadingGuide,
    showMemoList, setShowMemoList,
    showAchievements, setShowAchievements,
    showCalendar, setShowCalendar,
    showFullRanking, setShowFullRanking,
    showDateSettings, setShowDateSettings,
    showSubgroupChange, setShowSubgroupChange,
    showRestartConfirm, setShowRestartConfirm,
    showMonthlyContestInfo, setShowMonthlyContestInfo,
    calendarDate, setCalendarDate,
    dateSettingsDate, setDateSettingsDate,
    rankingCommunityFilter, setRankingCommunityFilter,
    selectedSubgroupDetail, setSelectedSubgroupDetail,
    // Stats calculation helpers
    getSubgroupRanking,
    getProgressRanking,
    getSubgroupDisplay,
    generateMemosHTML,
    getWeeklyMVP,
    setView,
    isChurchAdmin,
}) => {
    if (!currentUser) return null;

    const { currentDay, score, subgroupId, departmentName, planId, streak } = currentUser;
    const [planType, version] = (planId || '1year_revised').split('_');
    const planTypeDataDashboard = PLAN_TYPES.find(p => p.id === planType);
    const planTypeName = planTypeDataDashboard ? planTypeDataDashboard.title : '성경 통독';
    const versionData = BIBLE_VERSIONS[planType] ? BIBLE_VERSIONS[planType].find(v => v.id === version) : null;
    const versionName = versionData ? versionData.name : '';
    const myLevel = getLevelInfo(score || 0);

    // 격려 메시지 생성 로직
    const getEncouragementMessage = () => {
        const runnersNearby = departmentMembers.filter(r =>
            r.uid !== currentUser.uid &&
            Math.abs(r.currentDay - currentDay) <= 1
        ).length;

        const runnersAhead = departmentMembers.filter(r =>
            r.uid !== currentUser.uid &&
            r.currentDay > currentDay
        ).length;

        const avgDayValue = departmentMembers.length > 0
            ? departmentMembers.reduce((sum, m) => sum + m.currentDay, 0) / departmentMembers.length
            : currentDay;

        const isBehind = currentDay < avgDayValue - 3;
        const isWeeklyEncouragement = new Date().getDay() === 0;

        if (isBehind && isWeeklyEncouragement && runnersAhead > 0) {
            return `💪 앞에 ${runnersAhead}명이 먼저 뛰고 있어요! 이번 주도 화이팅!`;
        }
        if (streak >= 7) return `🔥 ${streak}일 연속 읽기 중! 놀라워요!`;
        if (streak >= 3) return `✨ ${streak}일 연속! 좋은 습관이 되어가고 있어요!`;
        if (runnersNearby > 0) return `🏃 ${runnersNearby}명과 함께 달리고 있어요!`;

        const defaultMessages = [
            '📖 오늘도 말씀과 동행하세요!',
            '🌱 매일 한 걸음씩, 꾸준히!',
            '💝 말씀 안에서 평안을 누리세요!',
            '🙏 오늘 하루도 은혜 가운데!',
        ];
        return defaultMessages[currentDay % defaultMessages.length];
    };

    const daysRemaining = Math.max(0, TOTAL_DAYS - currentDay);

    // 레이터 데이터 정제
    const allRacersSorted = allMembersForRace.map(m => {
        const readCount = m.readCount || 1;
        const actualProgress = (readCount - 1) * 365 + (m.currentDay || 1);
        return { ...m, day: actualProgress, isMe: m.uid === currentUser.uid };
    }).sort((a, b) => b.day - a.day);

    const top20Overall = allRacersSorted.slice(0, 20);
    const departmentChampions = {};
    const deptChampionsList = [];
    const departmentIds = ['senior', 'youth', 'middlehigh', 'elementary', 'kinder'];

    departmentIds.forEach(commId => {
        const departmentEntry = DEFAULT_DEPARTMENTS.find(c => c.id === commId);
        const commName = departmentEntry ? departmentEntry.name : null;
        const deptTop = allRacersSorted.find(r =>
            r.departmentId === commId || (commName && r.departmentName === commName)
        );
        if (deptTop) {
            departmentChampions[deptTop.uid] = commName || (commId === 'senior' ? '장년부' : commId);
            deptChampionsList.push(deptTop);
        }
    });

    const me = allRacersSorted.find(r => r.isMe);
    let nearbyRacers = [];
    if (me) {
        const myCommId = me.departmentId;
        const myCommName = me.departmentName;
        nearbyRacers = allRacersSorted
            .filter(r => {
                const isSameComm = (myCommId && r.departmentId === myCommId) ||
                    (myCommName && r.departmentName === myCommName);
                const isCandidate = !myCommId && !myCommName ? true : isSameComm;
                return isCandidate &&
                    !r.isMe &&
                    !top20Overall.find(t => t.uid === r.uid) &&
                    !deptChampionsList.find(d => d.uid === r.uid);
            })
            .sort((a, b) => Math.abs(a.day - me.day) - Math.abs(b.day - me.day))
            .slice(0, 10);
    }

    const combinedRacers = [...top20Overall];
    deptChampionsList.forEach(champion => {
        if (!combinedRacers.find(r => r.uid === champion.uid)) {
            combinedRacers.push(champion);
        }
    });
    if (me && !combinedRacers.find(r => r.uid === me.uid)) {
        combinedRacers.push(me);
    }
    nearbyRacers.forEach(nearby => {
        if (!combinedRacers.find(r => r.uid === nearby.uid)) {
            combinedRacers.push(nearby);
        }
    });

    const racers = combinedRacers.sort((a, b) => a.day - b.day);
    const progressRanking = getProgressRanking();
    const topProgressGroups = progressRanking.slice(0, 3);

    return (
        <div className="min-h-screen bg-slate-50 overflow-hidden relative font-sans">
            {showConfetti && <div className="fixed inset-0 z-50 flex justify-center pt-40 pointer-events-none"><div className="text-6xl animate-bounce">🎊</div></div>}

            {newAchievement && (
                <div className="fixed top-20 left-4 right-4 z-50 animate-bounce">
                    <div className="bg-gradient-to-r from-yellow-400 to-orange-500 text-white p-4 rounded-2xl shadow-2xl flex items-center gap-3">
                        <div className="text-4xl">{newAchievement.emoji}</div>
                        <div>
                            <p className="text-xs font-bold opacity-90">🎉 새 업적 달성!</p>
                            <p className="font-bold text-lg">{newAchievement.title}</p>
                            <p className="text-xs opacity-80">{newAchievement.desc}</p>
                        </div>
                    </div>
                </div>
            )}

            {levelUpToast && (
                <div className="fixed top-20 left-4 right-4 z-50 animate-bounce">
                    <div className="bg-gradient-to-r from-blue-500 to-indigo-600 text-white p-4 rounded-2xl shadow-2xl flex items-center gap-3">
                        <div className="text-4xl">🔱</div>
                        <div>
                            <p className="text-xs font-bold opacity-90">LEVEL UP!</p>
                            <p className="font-bold text-lg">{myLevel.name} 로 승급했습니다!</p>
                        </div>
                    </div>
                </div>
            )}

            {bonusToast && (
                <div className="fixed top-32 left-1/2 -translate-x-1/2 z-50 animate-pulse">
                    <div className="bg-blue-600 text-white px-6 py-3 rounded-full shadow-2xl font-bold flex items-center gap-2">
                        <span>✨</span>
                        {bonusToast}
                    </div>
                </div>
            )}

            {/* Modals */}
            <ScoreInfoModal show={showScoreInfo} onClose={() => setShowScoreInfo(false)} myLevel={myLevel} score={score} />
            <ReadingGuideModal show={showReadingGuide} onClose={() => setShowReadingGuide(false)} />
            <AchievementsModal show={showAchievements} onClose={() => setShowAchievements(false)} />
            <CalendarModal show={showCalendar} onClose={() => setShowCalendar(false)} calendarDate={calendarDate} setCalendarDate={setCalendarDate} readHistory={readHistory} />
            <MonthlyContestInfoModal show={showMonthlyContestInfo} onClose={() => setShowMonthlyContestInfo(false)} />
            <RestartConfirmModal show={showRestartConfirm} onClose={() => setShowRestartConfirm(false)} onRestart={handleRestart} />
            <DateSettingsModal
                show={showDateSettings}
                onClose={() => setShowDateSettings(false)}
                currentUser={currentUser}
                currentDay={currentDay}
                dateSettingsDate={dateSettingsDate}
                setDateSettingsDate={setDateSettingsDate}
                dateToOffset={dateToOffset}
                changeStartDate={changeStartDate}
            />
            <RankingModal
                show={showFullRanking}
                onClose={() => setShowFullRanking(false)}
                progressRanking={progressRanking}
                allMembersForRace={allMembersForRace}
                subgroupId={subgroupId}
                currentUser={currentUser}
                selectedSubgroupDetail={selectedSubgroupDetail}
                setSelectedSubgroupDetail={setSelectedSubgroupDetail}
                rankingCommunityFilter={rankingCommunityFilter}
                setRankingCommunityFilter={setRankingCommunityFilter}
            />
            <MemoListModal
                show={showMemoList}
                onClose={() => setShowMemoList(false)}
                memos={memos}
                currentDay={currentDay}
                score={score}
                streak={streak}
                currentUser={currentUser}
                generateMemosHTML={generateMemosHTML}
            />
            <SubgroupChangeModal show={showSubgroupChange} onClose={() => setShowSubgroupChange(false)} currentUser={currentUser} changeSubgroup={changeSubgroup} />

            <DashboardHeader
                handleLogout={handleLogout}
                streak={streak}
                score={score}
                myLevel={myLevel}
                setShowScoreInfo={setShowScoreInfo}
                setShowAchievements={setShowAchievements}
                setShowDateSettings={setShowDateSettings}
                setShowCalendar={setShowCalendar}
                setShowReadingGuide={setShowReadingGuide}
                getEncouragementMessage={getEncouragementMessage}
                departmentName={departmentName}
                setShowFullRanking={setShowFullRanking}
                topProgressGroups={topProgressGroups}
                subgroupId={subgroupId}
                // 버전 정보 추가
                planTypeName={planTypeName}
                versionName={versionName}
                handleChangeVersionStart={handleChangeVersionStart}
                setView={setView}
                isChurchAdmin={isChurchAdmin}
            />

            <div className="max-w-5xl mx-auto w-full pb-10 mt-8">
                <RaceMap racers={racers} departmentChampions={departmentChampions} getSubgroupDisplay={getSubgroupDisplay} />

                <main className="px-4 space-y-6">
                    <AnnouncementBanner announcement={announcement} />

                    <BibleReader
                        verseData={verseData}
                        viewingDay={viewingDay}
                        setViewingDay={setViewingDay}
                        currentUser={currentUser}
                        daysRemaining={daysRemaining}
                        handleChangeVersionStart={handleChangeVersionStart}
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
                    />

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <MemoSection
                            currentMemo={currentMemo}
                            setCurrentMemo={setCurrentMemo}
                            setShowMemoList={setShowMemoList}
                            saveMemo={saveMemo}
                            viewingDay={viewingDay}
                            currentDay={currentDay}
                            memos={memos}
                        />

                        <SubgroupRankingCard
                            departmentName={departmentName}
                            getSubgroupRanking={getSubgroupRanking}
                            subgroupId={subgroupId}
                            departmentId={currentUser ? currentUser.departmentId : null}
                        />
                    </div>

                    <ReadingChampionSection getWeeklyMVP={getWeeklyMVP} />
                </main>
            </div>


            {isSpeaking && (
                <div className="fixed bottom-10 left-6 z-[100] flex items-center gap-2">
                    <button
                        onClick={handleTogglePause}
                        className={`flex items-center justify-center gap-2 px-5 py-3 rounded-full shadow-2xl transition-all active:scale-95 ${isPaused ? 'bg-indigo-600 shadow-indigo-200' : 'bg-orange-500 shadow-orange-200'} text-white`}
                    >
                        <span className="text-sm font-bold">{isPaused ? '다시 읽기' : '잠시 멈춤'}</span>
                        <span className="text-xl">{isPaused ? '▶️' : '⏸️'}</span>
                    </button>
                </div>
            )}
            <KakaoChannelButton kakaoLink={kakaoLink} />
        </div>
    );
};

export default DashboardView;
