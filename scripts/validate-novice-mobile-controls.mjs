import assert from 'node:assert/strict';
import fs from 'node:fs';
import { rankWeeklyMembers } from '../src/utils/weeklyRanking.js';
import { getCompletedReadingRounds, getReadingRoundBadgeLabel } from '../src/utils/readingRounds.js';

const guest = fs.readFileSync(new URL('../src/components/GuestReaderView.jsx', import.meta.url), 'utf8');
const reader = fs.readFileSync(new URL('../src/components/dashboard/BibleReader.jsx', import.meta.url), 'utf8');
const raceMap = fs.readFileSync(new URL('../src/components/dashboard/RaceMap.jsx', import.meta.url), 'utf8');
const header = fs.readFileSync(new URL('../src/components/dashboard/DashboardHeader.jsx', import.meta.url), 'utf8');
const video = fs.readFileSync(new URL('../src/components/dashboard/DailyVideoCard.jsx', import.meta.url), 'utf8');
const quiz = fs.readFileSync(new URL('../src/components/dashboard/BibleQuizCard.jsx', import.meta.url), 'utf8');
const announcement = fs.readFileSync(new URL('../src/components/dashboard/AnnouncementBanner.jsx', import.meta.url), 'utf8');
const readingGuide = fs.readFileSync(new URL('../src/components/modals/ReadingGuideModal.jsx', import.meta.url), 'utf8');
const dateSettings = fs.readFileSync(new URL('../src/components/modals/DateSettingsModal.jsx', import.meta.url), 'utf8');
const calendar = fs.readFileSync(new URL('../src/components/modals/CalendarModal.jsx', import.meta.url), 'utf8');
const achievements = fs.readFileSync(new URL('../src/components/modals/AchievementsModal.jsx', import.meta.url), 'utf8');
const memo = fs.readFileSync(new URL('../src/components/dashboard/MemoSection.jsx', import.meta.url), 'utf8');
const dashboard = fs.readFileSync(new URL('../src/components/DashboardView.jsx', import.meta.url), 'utf8');
const rankingSummary = fs.readFileSync(new URL('../src/components/dashboard/CommunityRankingSummary.jsx', import.meta.url), 'utf8');
const readingChampion = fs.readFileSync(new URL('../src/components/dashboard/ReadingChampionSection.jsx', import.meta.url), 'utf8');
const statsUtils = fs.readFileSync(new URL('../src/utils/statsUtils.js', import.meta.url), 'utf8');
const helpers = fs.readFileSync(new URL('../src/utils/helpers.js', import.meta.url), 'utf8');
const app = fs.readFileSync(new URL('../src/App.jsx', import.meta.url), 'utf8');
const login = fs.readFileSync(new URL('../src/components/LoginView.jsx', import.meta.url), 'utf8');
const platformPopup = fs.readFileSync(new URL('../src/components/PlatformPopupAd.jsx', import.meta.url), 'utf8');

assert.match(guest, /가입하고 저장/);
assert.match(guest, /읽는 순서와 성경 번역 선택/);
assert.match(guest, /flex-col items-stretch[\s\S]*sm:flex-row/);
assert.match(guest, /min-h-11 w-full min-w-0[\s\S]*sm:max-w-\[65%\]/);
assert.doesNotMatch(guest, /className="bg-emerald-600[^\n]*text-xs/);
assert.doesNotMatch(guest, /className="text-xs font-bold text-slate-400 hover:text-red-500 px-1"/);
assert.match(login, /서비스 정책[\s\S]*inline-flex min-h-11 items-center/);
assert.match(login, /inline-flex min-h-11 items-center justify-center px-2[\s\S]{0,160}공동체 등록하기 →/);
assert.match(platformPopup, /광고 닫기[\s\S]*h-11 w-11/);
assert.equal((platformPopup.match(/inline-flex min-h-11 items-center/g) || []).length >= 2, true);

assert.match(reader, /말씀을 불러오는 중/);
assert.match(reader, /인터넷이 느리면 잠시 걸릴 수 있어요/);
assert.equal((reader.match(/min-h-11 min-w-11/g) || []).length >= 6, true);
assert.match(reader, /text-center text-sm font-medium leading-relaxed text-slate-500/);
assert.doesNotMatch(reader, /내가 읽을 차례|읽을 차례 \$\{currentUser\.currentDay\}/);
assert.match(reader, /!isCurrentProgressDay[\s\S]*다른 DAY 보는 중/);
assert.match(raceMap, /getReadingRoundBadgeLabel\(racer\)/);
assert.match(raceMap, /h-5 w-5[\s\S]*rounded-full[\s\S]*\{readingRoundBadge\}/,
    '완독 숫자 배지는 이름표를 가리지 않는 고정 크기 원형이어야 한다.');
assert.doesNotMatch(raceMap, /min-w-6[\s\S]*readingRoundBadge|readingRoundBadge[\s\S]*px-1 py-0\.5/,
    '완독 숫자 배지가 내용 길이에 따라 캡슐형으로 늘어나면 안 된다.');
assert.match(raceMap, /8 \+ \(idx % 10\) \* 8/);
assert.doesNotMatch(raceMap, />\{racerReadCount\}<\/span>/);

assert.match(header, /grid-cols-\[minmax\(0,1fr\)_auto\][\s\S]*group flex min-h-11 min-w-0[\s\S]*읽는 버전/);
assert.match(header, /☰ <span>메뉴<\/span>[\s\S]*로그인·바로가기[\s\S]*로그아웃/);
assert.match(header, /성경통독 114 가이드[\s\S]*자주 묻는 질문[\s\S]*앱 화면 투어/);
assert.doesNotMatch(header, /읽는 방법·FAQ/);
assert.match(header, /<header className="mb-4 space-y-3">[\s\S]*<div className="relative z-\[90\][\s\S]*공동체 선택/);
assert.doesNotMatch(header, /<header className="[^"]*z-\[90\]/);
assert.doesNotMatch(header, />\{currentOrganizationName \|\| '내 단체 관리'\}<\/span>/);
assert.doesNotMatch(header, /md:flex-nowrap md:justify-end/);

assert.equal((video.match(/min-h-11/g) || []).length >= 3, true);
assert.match(video, /dailyVideoCollapsed/);
assert.match(video, /aria-expanded="false"[\s\S]*열기/);
assert.match(video, /collection\('users'\)\.doc\(currentUser\.uid\)\.set\(\{[\s\S]*dailyVideoCollapsed: nextCollapsed/);
assert.match(quiz, /min-h-11 rounded-xl px-3 py-2 text-sm font-bold[\s\S]*이 DAY는 건너뛰기/);
assert.match(quiz, /DAY \{progressDay\} 성경퀴즈[\s\S]*QuizLevelToggle/);
assert.match(quiz, /text-xl font-black[\s\S]*sm:text-2xl[^>]*>DAY \{progressDay\} 성경퀴즈/);
assert.match(memo, /min-h-11 rounded-xl px-3 py-2 text-sm font-bold[\s\S]*내 기록 보기/);
assert.match(dashboard, /lazy\(\(\) => import\('\.\/dashboard\/TalentShop'\)\)/);
assert.match(dashboard, /show=\{showFaq\}[\s\S]*mode="faq"/);
assert.match(dashboard, /setShowFaq=\{setShowFaq\}[\s\S]*setShowTutorial=\{setShowTutorial\}/);
assert.equal((dashboard.match(/<Suspense fallback=/g) || []).length >= 1, true);
assert.match(dashboard, /함께 읽는 통독 현황[\s\S]*<RaceMap[\s\S]*<DailyVideoCard[\s\S]*<AnnouncementBanner[\s\S]*<BibleReader[\s\S]*belowQuizContent[\s\S]*<TalentShop[\s\S]*<CommunityRankingSummary[\s\S]*aria-label="읽기왕"[\s\S]*<ReadingChampionSection/);
assert.match(app, /getWeeklyMVP=\{\(\) => getWeeklyMVP\(allMembersForRace\)\}/,
    '읽기왕은 현재 부서만이 아니라 활동 중인 교회 전체 명단으로 계산해야 한다.');
assert.doesNotMatch(app, /getWeeklyMVP=\{\(\) => getWeeklyMVP\(departmentMembers\)\}/,
    '부서 인원이 적다는 이유로 주간 2~10위가 비어서는 안 된다.');
assert.match(helpers, /fixtureType: d\.fixtureType \?\? null/,
    '운영 화면에서 테스트 계정을 구분할 수 있어야 한다.');
assert.match(statsUtils, /filter\(member => member\.fixtureType !== 'reading-badge-test'\)/,
    '읽기왕 순위에 배지 테스트 계정이 섞이면 안 된다.');
assert.match(announcement, /aria-label="교회 소식"/);
assert.match(announcement, /rounded-full px-4 py-2 text-sm font-black/);
assert.doesNotMatch(announcement, /bg-\[#03C75A\]|min-w-\[140px\]|p-7|mb-10/);
assert.match(announcement, /h-2 w-2 rounded-full bg-indigo-500/);
assert.doesNotMatch(announcement, /M4 13\.5|bg-gradient-to-r from-indigo-500 via-blue-500 to-cyan-400|grid h-10 w-10/);
for (const [name, source] of [
    ['성경통독 가이드와 FAQ', readingGuide],
    ['읽기 날짜 설정', dateSettings],
    ['읽기 달력', calendar],
    ['나의 업적과 기록', achievements],
]) {
    assert.match(source, /fixed inset-0 z-\[180\]/, `${name} 창은 상단 메뉴보다 높은 공통 레이어여야 합니다.`);
}
assert.equal((dashboard.match(/fixed inset-0 z-\[180\]/g) || []).length, 2, '공동체 선택과 로그인 바로가기 창도 공통 레이어여야 합니다.');
const rankingModal = fs.readFileSync(new URL('../src/components/modals/RankingModal.jsx', import.meta.url), 'utf8');
assert.doesNotMatch(rankingModal, /평균 진행률.*소그룹 평균 Day/s);
assert.match(rankingSummary, /aria-label="소그룹 누적 랭킹"[\s\S]*progressRanking\.map/,
    '소그룹 누적 랭킹은 접힌 요약이 아니라 전체 목록으로 항상 보여야 한다.');
assert.doesNotMatch(rankingSummary, /전체 랭킹/);
assert.doesNotMatch(dashboard, /로그인·홈 화면 이용 안내|공동체 현황·랭킹 모아보기/);
assert.match(dashboard, /aria-label="로그인과 바로가기"[\s\S]*로그인·바로가기[\s\S]*<HomeScreenHelpBanner \/>/);
assert.doesNotMatch(dashboard, /<HomeScreenHelpBanner \/>[\s\S]*성경통독 114 가이드/);

const weeklyRanking = rankWeeklyMembers([
    { uid: 'weekly-1', name: '이번주 독자', weeklyCount: 1, totalCount: 4 },
    { uid: 'weekly-2', name: '둘째 성도', weeklyCount: 0, totalCount: 3 },
    { uid: 'weekly-3', name: '셋째 성도', weeklyCount: 0, totalCount: 2 },
]);
assert.equal(weeklyRanking.winner?.uid, 'weekly-1');
assert.deepEqual(
    weeklyRanking.top10.map(member => [member.uid, member.weeklyCount]),
    [['weekly-1', 1], ['weekly-2', 0], ['weekly-3', 0]],
    '이번 주 독자가 한 명뿐이어도 공동체의 주간 2~10위는 0일을 포함해 보여야 합니다.',
);
const emptyWeeklyRanking = rankWeeklyMembers([
    { uid: 'weekly-0-a', weeklyCount: 0, totalCount: 10 },
    { uid: 'weekly-0-b', weeklyCount: 0, totalCount: 9 },
]);
assert.equal(emptyWeeklyRanking.winner, null);
assert.deepEqual(emptyWeeklyRanking.top10, [], '이번 주 독자가 전혀 없으면 억지로 주간 순위를 만들면 안 됩니다.');
assert.equal(getCompletedReadingRounds({ readCount: 1 }), 0);
assert.equal(getCompletedReadingRounds({ readCount: 2 }), 1);
assert.equal(getCompletedReadingRounds({ readCount: 11 }), 10);
assert.equal(getReadingRoundBadgeLabel({ readCount: 2 }), '1');
assert.equal(getReadingRoundBadgeLabel({ readCount: 11 }), '10');
assert.match(readingChampion, /<ReadingRoundBadge member=\{streakMVP\}/);
assert.match(readingChampion, /<ReadingRoundBadge member=\{progressMVP\}/);
assert.equal((readingChampion.match(/<ReadingRoundBadge member=\{member\}/g) || []).length, 2);
assert.match(readingChampion, /flex h-5 w-5[\s\S]*rounded-full[\s\S]*\{label\}/,
    '읽기왕의 완독 숫자 배지도 고정 크기 원형이어야 한다.');
assert.doesNotMatch(readingChampion, /bg-purple-100 px-1\.5 py-0\.5/,
    '읽기왕에 기존 캡슐형 완독 배지가 남으면 안 된다.');

console.log('novice mobile controls validation passed');
