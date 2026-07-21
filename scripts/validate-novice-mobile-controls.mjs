import assert from 'node:assert/strict';
import fs from 'node:fs';

const guest = fs.readFileSync(new URL('../src/components/GuestReaderView.jsx', import.meta.url), 'utf8');
const reader = fs.readFileSync(new URL('../src/components/dashboard/BibleReader.jsx', import.meta.url), 'utf8');
const header = fs.readFileSync(new URL('../src/components/dashboard/DashboardHeader.jsx', import.meta.url), 'utf8');
const video = fs.readFileSync(new URL('../src/components/dashboard/DailyVideoCard.jsx', import.meta.url), 'utf8');
const quiz = fs.readFileSync(new URL('../src/components/dashboard/BibleQuizCard.jsx', import.meta.url), 'utf8');
const announcement = fs.readFileSync(new URL('../src/components/dashboard/AnnouncementBanner.jsx', import.meta.url), 'utf8');
const memo = fs.readFileSync(new URL('../src/components/dashboard/MemoSection.jsx', import.meta.url), 'utf8');
const dashboard = fs.readFileSync(new URL('../src/components/DashboardView.jsx', import.meta.url), 'utf8');
const rankingSummary = fs.readFileSync(new URL('../src/components/dashboard/CommunityRankingSummary.jsx', import.meta.url), 'utf8');

assert.match(guest, /가입하고 저장/);
assert.match(guest, /읽는 순서와 성경 번역 선택/);
assert.match(guest, /flex-col items-stretch[\s\S]*sm:flex-row/);
assert.match(guest, /min-h-11 w-full min-w-0[\s\S]*sm:max-w-\[65%\]/);
assert.doesNotMatch(guest, /className="bg-emerald-600[^\n]*text-xs/);
assert.doesNotMatch(guest, /className="text-xs font-bold text-slate-400 hover:text-red-500 px-1"/);

assert.match(reader, /말씀을 불러오는 중/);
assert.match(reader, /인터넷이 느리면 잠시 걸릴 수 있어요/);
assert.equal((reader.match(/min-h-11 min-w-11/g) || []).length >= 6, true);
assert.match(reader, /text-center text-sm font-medium leading-relaxed text-slate-500/);
assert.doesNotMatch(reader, /내가 읽을 차례|읽을 차례 \$\{currentUser\.currentDay\}/);
assert.match(reader, /!isCurrentProgressDay[\s\S]*다른 DAY 보는 중/);

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
assert.match(announcement, /aria-label="교회 소식"/);
assert.match(announcement, /rounded-full px-4 py-2 text-sm font-black/);
assert.doesNotMatch(announcement, /bg-\[#03C75A\]|min-w-\[140px\]|p-7|mb-10/);
const rankingModal = fs.readFileSync(new URL('../src/components/modals/RankingModal.jsx', import.meta.url), 'utf8');
assert.doesNotMatch(rankingModal, /평균 진행률.*소그룹 평균 Day/s);
assert.match(rankingSummary, /aria-label="소그룹 누적 랭킹"[\s\S]*progressRanking\.map/,
    '소그룹 누적 랭킹은 접힌 요약이 아니라 전체 목록으로 항상 보여야 한다.');
assert.doesNotMatch(rankingSummary, /전체 랭킹/);
assert.doesNotMatch(dashboard, /로그인·홈 화면 이용 안내|공동체 현황·랭킹 모아보기/);
assert.match(dashboard, /aria-label="로그인과 바로가기"[\s\S]*로그인·바로가기[\s\S]*<HomeScreenHelpBanner \/>/);
assert.doesNotMatch(dashboard, /<HomeScreenHelpBanner \/>[\s\S]*성경통독 114 가이드/);

console.log('novice mobile controls validation passed');
