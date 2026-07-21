import React, { lazy, Suspense, useEffect, useRef, useState } from 'react';
import { TOTAL_DAYS, UNAFFILIATED_CHURCH_ID } from '../data/constants';
import { BIBLE_VERSIONS, PLAN_TYPES } from '../data/bible_options';
import { getLevelInfo } from '../data/levels';
import { DEFAULT_DEPARTMENTS } from '../data/departments';
import { belongsToDepartment, getMembershipList } from '../utils/memberships';
import { getDaysRead } from '../utils/helpers';
import { db } from '../utils/firebase';
import { resolveTalentProgram } from '../utils/talentProgram';
import {
    scheduleScrollIntoView,
    shouldScrollToReadingHeader,
} from '../utils/readingFlowScroll';

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
} from './modals';

// Dashboard Components
import {
    DashboardHeader,
    CommunityRankingSummary,
    RaceMap,
    AnnouncementBanner,
    DailyVideoCard,
    BibleReader,
    MemoSection,
    KakaoChannelButton,
    CompletionCelebration,
    CommunityMembershipCard,
    PersonalAccountMigrationCard,
    SocialLinkBanner,
    ChurchAdminReaderGuide,
    HomeScreenHelpBanner,
    BibleQuizCard,
} from './dashboard';
import TutorialOverlay from './TutorialOverlay';

const TalentShop = lazy(() => import('./dashboard/TalentShop'));
const ReadingChampionSection = lazy(() => import('./dashboard/ReadingChampionSection'));

const DeferredSectionFallback = ({ label }) => (
    <div className="rounded-2xl border border-slate-200 bg-white px-5 py-6 text-center text-sm font-bold text-slate-500" role="status">
        {label}을 준비하고 있어요...
    </div>
);

const CHURCH_ADMIN_READER_GUIDE_KEY_PREFIX = 'b114_church_admin_reader_guide_v1';

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
    ttsUnavailableApp,
    ttsError,
    clearTtsError,
    readSubmitting,
    handleRead,
    saveMemo,
    handleLogout,
    handleChangeVersionStart,
    handleRestart,
    changeStartDate,
    dateToOffset,
    // UI State
    showConfetti,
    levelUpToast,
    bonusToast,
    completionSummary,
    newAchievement,
    showScoreInfo, setShowScoreInfo,
    showReadingGuide, setShowReadingGuide,
    showMemoList, setShowMemoList,
    showAchievements, setShowAchievements,
    showCalendar, setShowCalendar,
    showFullRanking, setShowFullRanking,
    showDateSettings, setShowDateSettings,
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
    talentOrganizations = [],
    onPrimaryOrgChange,
    onActiveOrgChange,
    onPersonalAccountMigrate,
    socialLinkNotice,
    onSocialLinkNoticeClear,
    onGoogleLink,
    onKakaoLink,
}) => {
    const [showTutorial, setShowTutorial] = useState(false);
    const [showFaq, setShowFaq] = useState(false);
    const [showChurchAdminReaderGuide, setShowChurchAdminReaderGuide] = useState(false);
    const [showMemberships, setShowMemberships] = useState(false);
    const [showAccountHelp, setShowAccountHelp] = useState(false);
    const [talentProgramEnabled, setTalentProgramEnabled] = useState(true);
    const [talentMarketVisible, setTalentMarketVisible] = useState(false);
    const bibleHeaderRef = useRef(null);
    const observedCompletionRef = useRef({
        uid: currentUser?.uid || null,
        summary: completionSummary,
    });
    const currentUserUidRef = useRef(currentUser?.uid || null);
    currentUserUidRef.current = currentUser?.uid || null;

    useEffect(() => {
        if (!isChurchAdmin || !currentUser?.uid) {
            setShowChurchAdminReaderGuide(false);
            return;
        }

        const storageKey = `${CHURCH_ADMIN_READER_GUIDE_KEY_PREFIX}:${currentUser.uid}`;
        try {
            setShowChurchAdminReaderGuide(localStorage.getItem(storageKey) !== 'seen');
        } catch {
            // 저장소가 차단된 브라우저에서도 이번 로그인 중에는 안내를 보여준다.
            setShowChurchAdminReaderGuide(true);
        }
    }, [currentUser?.uid, isChurchAdmin]);

    const dismissChurchAdminReaderGuide = () => {
        const uid = currentUser?.uid;
        if (uid) {
            try {
                localStorage.setItem(`${CHURCH_ADMIN_READER_GUIDE_KEY_PREFIX}:${uid}`, 'seen');
            } catch {
                // 저장 실패는 현재 화면에서 안내를 닫는 동작을 막지 않는다.
            }
        }
        setShowChurchAdminReaderGuide(false);
    };

    const openAdminFromReaderGuide = () => {
        dismissChurchAdminReaderGuide();
        setView('church_admin');
    };

    useEffect(() => {
        const uid = currentUser?.uid || null;
        const previous = observedCompletionRef.current;
        const next = { uid, summary: completionSummary };
        observedCompletionRef.current = next;

        if (!shouldScrollToReadingHeader(previous, next)) return undefined;

        const expectedUid = uid;
        const expectedRequestId = completionSummary.requestId;
        return scheduleScrollIntoView(() => bibleHeaderRef.current, {
            block: 'start',
            behavior: 'auto',
            frameCount: 2,
            isStillCurrent: () => currentUserUidRef.current === expectedUid
                && observedCompletionRef.current.uid === expectedUid
                && observedCompletionRef.current.summary?.requestId === expectedRequestId,
        });
    }, [completionSummary, currentUser?.uid]);

    useEffect(() => {
        if (!currentUser?.churchId || currentUser.role === 'guest') {
            setTalentProgramEnabled(false);
            setTalentMarketVisible(false);
            return undefined;
        }
        let alive = true;
        setTalentMarketVisible(false);
        db.collection('churches').doc(currentUser.churchId).collection('settings').doc('talentShop').get()
            .then(doc => {
                if (!alive) return;
                const resolution = resolveTalentProgram({
                    user: currentUser,
                    talentShop: doc.exists ? doc.data() : null,
                });
                setTalentProgramEnabled(resolution.canEarnTalent);
                setTalentMarketVisible(resolution.canUseMarket);
            })
            .catch(error => {
                console.error('달란트 부서 설정 로드 실패:', error);
                if (alive) {
                    setTalentProgramEnabled(true);
                    setTalentMarketVisible(false);
                }
            });
        return () => { alive = false; };
    }, [
        currentUser?.uid,
        currentUser?.churchId,
        currentUser?.departmentId,
        currentUser?.subgroupId,
        JSON.stringify(currentUser?.extraMemberships || []),
    ]);

    const closeRankingModal = () => {
        setShowFullRanking(false);
        setRankingCommunityFilter('all');
        setSelectedSubgroupDetail(null);
    };

    const selectActiveOrganization = (orgId) => {
        if (!orgId) return;
        handleStop?.();
        setShowFullRanking(false);
        setRankingCommunityFilter('all');
        setSelectedSubgroupDetail(null);
        setShowMemberships(false);
        if (orgId !== currentUser?.churchId) {
            onActiveOrgChange?.(orgId);
            window.scrollTo({ top: 0, behavior: 'smooth' });
        }
    };

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
            <ReadingGuideModal show={showReadingGuide} onClose={() => setShowReadingGuide(false)} mode="guide" />
            <ReadingGuideModal show={showFaq} onClose={() => setShowFaq(false)} mode="faq" />
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
                onOpenRestart={() => {
                    setShowDateSettings(false);
                    setShowRestartConfirm(true);
                }}
            />
            <RankingModal
                show={showFullRanking}
                onClose={closeRankingModal}
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
            {showTutorial && (
                <TutorialOverlay
                    onClose={() => setShowTutorial(false)}
                    onComplete={() => setShowTutorial(false)}
                />
            )}
            <ChurchAdminReaderGuide
                show={showChurchAdminReaderGuide}
                onClose={dismissChurchAdminReaderGuide}
                onOpenAdmin={openAdminFromReaderGuide}
            />
            {showAccountHelp && (
                <div className="fixed inset-0 z-[180] flex items-end justify-center bg-black/45 sm:items-center sm:p-4" onMouseDown={event => { if (event.target === event.currentTarget) setShowAccountHelp(false); }}>
                    <section role="dialog" aria-modal="true" aria-label="로그인과 바로가기" className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-t-3xl bg-slate-50 p-5 shadow-2xl sm:rounded-3xl">
                        <div className="mb-4 flex items-center justify-between gap-3">
                            <div>
                                <h2 className="text-lg font-black text-slate-900">로그인·바로가기</h2>
                                <p className="mt-1 text-xs font-bold text-slate-500">빠른 로그인 연결과 휴대폰 바로가기를 확인하세요.</p>
                            </div>
                            <button type="button" onClick={() => setShowAccountHelp(false)} className="flex min-h-11 min-w-11 items-center justify-center rounded-full text-xl text-slate-500 hover:bg-white" aria-label="로그인과 바로가기 닫기">✕</button>
                        </div>
                        <div className="space-y-4">
                            <SocialLinkBanner
                                currentUser={currentUser}
                                notice={null}
                                onNoticeClear={onSocialLinkNoticeClear}
                                onGoogleLink={onGoogleLink}
                                onKakaoLink={onKakaoLink}
                            />
                            <HomeScreenHelpBanner />
                        </div>
                    </section>
                </div>
            )}

            <DashboardHeader
                handleLogout={handleLogout}
                streak={streak}
                talent={talentProgramEnabled ? talent : undefined}
                setShowAchievements={setShowAchievements}
                setShowDateSettings={setShowDateSettings}
                setShowCalendar={setShowCalendar}
                setShowReadingGuide={setShowReadingGuide}
                setShowFaq={setShowFaq}
                setShowTutorial={setShowTutorial}
                setShowAccountHelp={setShowAccountHelp}
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
                className="max-w-5xl mx-auto w-full mt-4"
                style={{ paddingBottom: 'var(--app-fixed-bottom-clearance)' }}
            >
                {hasCommunity && !isReadingPeople && (
                    <section aria-label="함께 읽는 통독 현황" className="mb-6">
                        <div className="mb-3 px-4">
                            <h2 className="text-base font-black text-slate-800">🏃 함께 읽는 통독 현황</h2>
                        </div>
                        <RaceMap racers={racers} departmentChampions={departmentChampions} getSubgroupDisplay={getSubgroupDisplay} />
                    </section>
                )}
                <main className="px-4 space-y-6">
                    <DailyVideoCard currentUser={currentUser} setCurrentUser={setCurrentUser} />

                    {hasCommunity && <AnnouncementBanner announcement={announcement} />}

                    {completionSummary?.completedDay && completionSummary.completedDay !== viewingDay && (
                        <div role="status" className="rounded-2xl border border-emerald-200 bg-emerald-50 px-5 py-4 text-center text-emerald-900 shadow-sm">
                            <p className="text-lg font-black">DAY {completionSummary.completedDay} 읽기 완료! 🎉</p>
                        </div>
                    )}

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
                        ttsUnavailableApp={ttsUnavailableApp}
                        ttsError={ttsError}
                        clearTtsError={clearTtsError}
                        hasReadToday={hasReadToday}
                        readSubmitting={readSubmitting}
                        handleRead={handleRead}
                        completionSummary={completionSummary}
                        bibleHeaderRef={bibleHeaderRef}
                        quizContent={(
                            <BibleQuizCard
                                currentUser={currentUser}
                                setCurrentUser={setCurrentUser}
                                viewingDay={viewingDay}
                                talentProgramEnabled={talentProgramEnabled}
                            />
                        )}
                        belowQuizContent={hasCommunity && talentMarketVisible ? (
                            <Suspense fallback={<DeferredSectionFallback label="달란트 상점" />}>
                                <TalentShop
                                    currentUser={currentUser}
                                    setCurrentUser={setCurrentUser}
                                    organizations={talentOrganizations}
                                    onOrganizationChange={selectActiveOrganization}
                                    showUnlockModal={showSecretShopUnlocked}
                                    onCloseUnlockModal={() => setShowSecretShopUnlocked(false)}
                                />
                            </Suspense>
                        ) : null}
                    />

                    {socialLinkNotice && (
                        <SocialLinkBanner
                            currentUser={currentUser}
                            notice={socialLinkNotice}
                            onNoticeClear={onSocialLinkNoticeClear}
                            onGoogleLink={onGoogleLink}
                            onKakaoLink={onKakaoLink}
                        />
                    )}

                    {isReadingPeople && <section className="rounded-2xl border border-emerald-100 bg-white p-5 shadow-sm"><div className="mb-3 flex items-center justify-between"><div><h2 className="font-black text-slate-800">성경 읽는 사람들</h2><p className="mt-1 text-xs text-slate-500">전국에서 혼자 읽는 분들의 통합 랭킹이에요.</p></div><span className="text-xs font-bold text-emerald-600">{allRacersSorted.length}명</span></div><div className="space-y-2">{allRacersSorted.slice(0, 10).map((member, index) => <div key={member.uid} className={`flex items-center gap-3 rounded-xl px-3 py-2 text-sm ${member.isMe ? 'bg-emerald-50' : 'bg-slate-50'}`}><span className="w-6 font-black text-slate-400">{index + 1}</span><span className="min-w-0 flex-1 truncate font-bold text-slate-700">{member.name}</span><span className="font-black text-emerald-700">DAY {member.day}</span></div>)}</div></section>}

                    <div>
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
                    </div>

                    {currentUser.role === 'member' && currentUser.accountType !== 'personal' && (
                        <CommunityMembershipCard
                            currentUser={currentUser}
                            setCurrentUser={setCurrentUser}
                            activeOrgId={currentUser.churchId}
                            onSelectOrg={selectActiveOrganization}
                        />
                    )}
                    <PersonalAccountMigrationCard currentUser={currentUser} onMigrate={onPersonalAccountMigrate} />

                    {hasCommunity && !isReadingPeople && (
                        <CommunityRankingSummary
                            getEncouragementMessage={getEncouragementMessage}
                            setShowFullRanking={setShowFullRanking}
                            setSelectedSubgroupDetail={setSelectedSubgroupDetail}
                            progressRanking={progressRanking}
                            departmentId={currentUser.departmentId}
                            subgroupId={subgroupId}
                            extraMemberships={additionalMemberships}
                        />
                    )}

                    {hasCommunity && !isReadingPeople && (
                        <section aria-label="읽기왕" className="pt-2">
                            <Suspense fallback={null}>
                                <ReadingChampionSection getWeeklyMVP={getWeeklyMVP} />
                            </Suspense>
                        </section>
                    )}
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

            {showMemberships && currentUser.accountType === 'personal' && <div className="fixed inset-0 z-[180] flex items-end justify-center bg-black/45 sm:items-center sm:p-4" onMouseDown={event => { if (event.target === event.currentTarget) setShowMemberships(false); }}><div role="dialog" aria-modal="true" aria-label="내 단체 관리" className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-t-3xl bg-slate-50 p-5 sm:rounded-3xl"><div className="mb-4 flex items-center justify-between"><h2 className="text-lg font-black text-slate-900">내 단체 관리</h2><button type="button" onClick={() => setShowMemberships(false)} className="p-2 text-slate-400" aria-label="닫기">✕</button></div><CommunityMembershipCard currentUser={currentUser} setCurrentUser={setCurrentUser} activeOrgId={currentUser.churchId} onSelectOrg={selectActiveOrganization} onPrimaryOrgChange={onPrimaryOrgChange} /></div></div>}

        </div>
    );
};

export default DashboardView;
