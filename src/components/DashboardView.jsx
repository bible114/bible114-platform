import React, { useRef, useState } from 'react';
import { TOTAL_DAYS, UNAFFILIATED_CHURCH_ID } from '../data/constants';
import { BIBLE_VERSIONS, PLAN_TYPES } from '../data/bible_options';
import { getLevelInfo } from '../data/levels';
import { DEFAULT_DEPARTMENTS } from '../data/departments';
import { belongsToDepartment, getMembershipList } from '../utils/memberships';
import { getDaysRead } from '../utils/helpers';

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
    DailyVideoCard,
    BibleReader,
    MemoSection,
    SubgroupRankingCard,
    ReadingChampionSection,
    KakaoChannelButton,
    BibleQuizCard,
    TalentShop,
    CompletionCelebration,
    CommunityMembershipCard,
    PersonalAccountMigrationCard
} from './dashboard';
import TutorialOverlay from './TutorialOverlay';

const sameMembershipPair = (left, right) => {
    if (!left || !right || left.departmentId !== right.departmentId) return false;
    if (left.subgroupId === right.subgroupId) return true;
    return Boolean(
        (left.subgroupId && right.subgroupName && left.subgroupId === right.subgroupName)
        || (right.subgroupId && left.subgroupName && right.subgroupId === left.subgroupName)
    );
};

const DashboardView = ({
    currentUser,
    setCurrentUser,
    departmentMembers,
    allMembersForRace,
    memos,
    memoLoadError,
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
    readSubmitting,
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
    churchCommunities,
    showSecretShopUnlocked,
    setShowSecretShopUnlocked,
    completionCelebration,
    setCompletionCelebration,
    personalOrganizations = [],
    onPrimaryOrgChange,
    onPersonalAccountMigrate,
}) => {
    const [showTutorial, setShowTutorial] = useState(false);
    const [showMemberships, setShowMemberships] = useState(false);
    const [quizGate, setQuizGate] = useState({
        loading: true,
        hasQuestion: false,
        gateOpen: false,
    });
    const [highlightQuiz, setHighlightQuiz] = useState(false);
    const quizSectionRef = useRef(null);

    if (!currentUser) return null;
    const hasCommunity = Boolean(currentUser.churchId);

    const { currentDay, score, talent, subgroupId, departmentName, planId, streak } = currentUser;
    const primaryMembership = getMembershipList({ ...currentUser, extraMemberships: [] })[0] || null;
    const additionalMemberships = getMembershipList(currentUser)
            .filter(membership => !sameMembershipPair(membership, primaryMembership))
            .slice(0, 3)
            .map(membership => {
                const department = (churchCommunities || [])
                    .find(item => item?.id === membership.departmentId);
                const subgroup = (department?.subgroups || []).find(item => {
                    if (typeof item === 'string') return item === membership.subgroupId;
                    return item?.id === membership.subgroupId || item?.name === membership.subgroupId;
                });
                const subgroupName = typeof subgroup === 'string'
                    ? subgroup
                    : (subgroup?.name || subgroup?.id);
                return {
                    ...membership,
                    departmentName: department?.name || membership.departmentName || membership.departmentId,
                    subgroupName: subgroupName || membership.subgroupName || membership.subgroupId,
                };
            });
    const isReadingPeople = currentUser.accountType === 'personal' && currentUser.churchId === UNAFFILIATED_CHURCH_ID;
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
        // day는 누적 읽은 날 수(랭킹/표시)이고, mapDay만 기존 달리기 위치를 보존한다.
        const mapDay = (readCount - 1) * 365 + (m.currentDay || 1);
        return { ...m, day: getDaysRead(m), mapDay, isMe: m.uid === currentUser.uid };
    }).sort((a, b) => b.day - a.day);

    const top20Overall = allRacersSorted.slice(0, 20);
    const departmentChampions = {};
    const deptChampionsList = [];
    const departmentIds = ['senior', 'youth', 'middlehigh', 'elementary', 'kinder'];

    departmentIds.forEach(commId => {
        const departmentEntry = DEFAULT_DEPARTMENTS.find(c => c.id === commId);
        const commName = departmentEntry ? departmentEntry.name : null;
        const deptTop = allRacersSorted.find(r => belongsToDepartment(r, commId));
        if (deptTop) {
            departmentChampions[deptTop.uid] = commName || (commId === 'senior' ? '장년부' : commId);
            deptChampionsList.push(deptTop);
        }
    });

    const me = allRacersSorted.find(r => r.isMe);
    let nearbyRacers = [];
    if (me) {
        const myCommId = me.departmentId;
        nearbyRacers = allRacersSorted
            .filter(r => {
                // 내 대시보드의 기준은 주 소속을 유지하되, 그 부서가 추가 소속인 회원도 포함한다.
                const isSameComm = myCommId && belongsToDepartment(r, myCommId);
                const isCandidate = myCommId ? isSameComm : true;
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
    const handleQuizGateLocked = () => {
        quizSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        setHighlightQuiz(true);
        window.setTimeout(() => setHighlightQuiz(false), 2000);
    };

    return (
        <div className="min-h-screen bg-slate-50 overflow-hidden relative font-sans">
            {completionCelebration && (
                <CompletionCelebration
                    completedRound={completionCelebration.completedRound}
                    newReadCount={completionCelebration.newReadCount}
                    talentEarned={completionCelebration.talentEarned}
                    quizTalentEarned={completionCelebration.quizTalentEarned}
                    totalTalent={completionCelebration.totalTalent}
                    onClose={() => setCompletionCelebration(null)}
                />
            )}
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
            <ReadingGuideModal show={showReadingGuide} onClose={() => setShowReadingGuide(false)} onStartTutorial={() => setShowTutorial(true)} />
            <AchievementsModal show={showAchievements} onClose={() => setShowAchievements(false)} currentUser={currentUser} />
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
                churchCommunities={churchCommunities}
                extraMemberships={additionalMemberships}
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
            <SubgroupChangeModal show={showSubgroupChange} onClose={() => setShowSubgroupChange(false)} currentUser={currentUser} changeSubgroup={changeSubgroup} churchCommunities={churchCommunities} />
            {showTutorial && (
                <TutorialOverlay
                    onClose={() => setShowTutorial(false)}
                    onComplete={() => { setShowTutorial(false); setShowReadingGuide(true); }}
                />
            )}

            <DashboardHeader
                handleLogout={handleLogout}
                streak={streak}
                score={score}
                talent={talent}
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
                departmentId={currentUser.departmentId}
                subgroupId={subgroupId}
                extraMemberships={additionalMemberships}
                // 버전 정보 추가
                planTypeName={planTypeName}
                versionName={versionName}
                handleChangeVersionStart={handleChangeVersionStart}
                setView={setView}
                isChurchAdmin={isChurchAdmin}
                hasCommunity={hasCommunity && !isReadingPeople}
                personalOrganizations={personalOrganizations}
                primaryOrgId={currentUser.primaryOrgId}
                onPrimaryOrgChange={onPrimaryOrgChange}
                onOpenMemberships={currentUser.accountType === 'personal' ? () => setShowMemberships(true) : null}
                currentOrganizationName={currentUser.churchName}
            />

            <div
                className="max-w-5xl mx-auto w-full mt-8"
                style={{ paddingBottom: 'var(--app-fixed-bottom-clearance)' }}
            >
                {hasCommunity && <RaceMap racers={racers} departmentChampions={departmentChampions} getSubgroupDisplay={getSubgroupDisplay} />}

                <main className="px-4 space-y-6">
                    {hasCommunity && <AnnouncementBanner announcement={announcement} />}

                    <DailyVideoCard currentUser={currentUser} setCurrentUser={setCurrentUser} />

                    {isReadingPeople && <section className="rounded-2xl border border-emerald-100 bg-white p-5 shadow-sm"><div className="mb-3 flex items-center justify-between"><div><h2 className="font-black text-slate-800">성경 읽는 사람들</h2><p className="mt-1 text-xs text-slate-500">전국에서 혼자 읽는 분들의 평면 랭킹이에요.</p></div><span className="text-xs font-bold text-emerald-600">{allRacersSorted.length}명</span></div><div className="space-y-2">{allRacersSorted.slice(0, 10).map((member, index) => <div key={member.uid} className={`flex items-center gap-3 rounded-xl px-3 py-2 text-sm ${member.isMe ? 'bg-emerald-50' : 'bg-slate-50'}`}><span className="w-6 font-black text-slate-400">{index + 1}</span><span className="min-w-0 flex-1 truncate font-bold text-slate-700">{member.name}</span><span className="font-black text-emerald-700">DAY {member.day}</span></div>)}</div></section>}

                    <BibleQuizCard
                        currentUser={currentUser}
                        setCurrentUser={setCurrentUser}
                        onGateStateChange={setQuizGate}
                        sectionRef={quizSectionRef}
                        highlight={highlightQuiz}
                    />

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
                        readSubmitting={readSubmitting}
                        handleRead={handleRead}
                        quizGateOpen={quizGate.gateOpen}
                        onQuizGateLocked={handleQuizGateLocked}
                    />

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <MemoSection
                            currentMemo={currentMemo}
                            setCurrentMemo={setCurrentMemo}
                            setShowMemoList={setShowMemoList}
                            saveMemo={saveMemo}
                            viewingDay={viewingDay}
                            currentDay={currentDay}
                            readCount={currentUser?.readCount || 1}
                            memos={memos}
                            memoLoadError={memoLoadError}
                        />

                        {hasCommunity && !isReadingPeople && <SubgroupRankingCard
                            departmentName={departmentName}
                            getSubgroupRanking={getSubgroupRanking}
                            subgroupId={subgroupId}
                            departmentId={currentUser ? currentUser.departmentId : null}
                            extraMemberships={additionalMemberships}
                        />}
                    </div>

                    {hasCommunity && <ReadingChampionSection getWeeklyMVP={getWeeklyMVP} />}

                    {hasCommunity && <TalentShop
                        currentUser={currentUser}
                        setCurrentUser={setCurrentUser}
                        showUnlockModal={showSecretShopUnlocked}
                        onCloseUnlockModal={() => setShowSecretShopUnlocked(false)}
                    />}

                    {currentUser.role === 'member' && currentUser.accountType !== 'personal' && (
                        <CommunityMembershipCard currentUser={currentUser} setCurrentUser={setCurrentUser} />
                    )}
                    <PersonalAccountMigrationCard currentUser={currentUser} onMigrate={onPersonalAccountMigrate} />
                </main>
            </div>


            {isSpeaking && (
                <div
                    className="fixed left-6 z-[100] flex items-center gap-2"
                    style={{ bottom: 'calc(env(safe-area-inset-bottom, 0px) + 84px)' }}
                >
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

            {showMemberships && currentUser.accountType === 'personal' && <div className="fixed inset-0 z-[125] flex items-end justify-center bg-black/45 sm:items-center sm:p-4" onMouseDown={event => { if (event.target === event.currentTarget) setShowMemberships(false); }}><div role="dialog" aria-modal="true" aria-label="내 단체 관리" className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-t-3xl bg-slate-50 p-5 sm:rounded-3xl"><div className="mb-4 flex items-center justify-between"><h2 className="text-lg font-black text-slate-900">내 단체 관리</h2><button type="button" onClick={() => setShowMemberships(false)} className="p-2 text-slate-400" aria-label="닫기">✕</button></div><CommunityMembershipCard currentUser={currentUser} setCurrentUser={setCurrentUser} onPrimaryOrgChange={onPrimaryOrgChange} /></div></div>}

        </div>
    );
};

export default DashboardView;
