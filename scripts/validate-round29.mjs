import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = path => fs.readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

const churchAdmin = read('src/components/ChurchAdminView.jsx');
const settingsTab = read('src/components/churchAdmin/SettingsTab.jsx');
const loginView = read('src/components/LoginView.jsx');
const readingGuide = read('src/components/modals/ReadingGuideModal.jsx');
const homeScreenHelp = read('src/components/dashboard/HomeScreenHelpBanner.jsx');
const indexHtml = read('index.html');
const quizProgress = read('src/utils/quizProgress.js');
const readCore = read('supabase/functions/platform-api/readCore.ts');
const packageJson = JSON.parse(read('package.json'));

const guideStart = churchAdmin.indexOf('const printMemberGuide = async');
const guideEnd = churchAdmin.indexOf('// ── 관리자 매뉴얼', guideStart);
assert.ok(guideStart >= 0 && guideEnd > guideStart, '성도용 가입 안내문 인쇄 함수를 찾을 수 있어야 한다.');
const guide = churchAdmin.slice(guideStart, guideEnd);

for (const pattern of [
    /@page \{ size: A4 portrait;/,
    /page-break-before: always/,
    /<main class="page-two">/,
    /홈 화면에 추가 — 다음부터 한 번에 열려요/,
    /아이폰 \(사파리\)/,
    /갤럭시 \(크롬·삼성인터넷\)/,
    /114 아이콘/,
    /로그인도 유지됩니다/,
    /매일 이렇게 해요 \(5분이면 충분해요\)/,
    /매일성경 영상[\s\S]*\(선택\)/,
    /오늘 본문[\s\S]*듣기 ▶️[\s\S]*글씨는 <b>\+<\/b>/,
    /오늘 읽기 완료/,
    /성경퀴즈[\s\S]*선택이에요[\s\S]*건너뛰어도 돼요/,
    /오늘 읽기 완료[\s\S]*다음 날로 넘어가요/,
    /매일 첫 읽기 완료: <b>10 달란트<\/b>/,
    /연속으로 읽으면 보너스가 커져요/,
    /퀴즈 정답 \(하루 1번\)/,
    /상품은 교회에서 받아요/,
    /물음표\(\?\) 버튼/,
    /교회 관리자\(담당 선생님\)/,
    /기존 성도님:[\s\S]*새로 가입하거나 교회를 다시 찾지 마세요/,
    /신규 성도만[\s\S]*처음 시작하기/,
    /신규 성도의 교회 입장코드/,
]) assert.match(guide, pattern);

assert.equal((guide.match(/<main/g) || []).length, 2, '가입 안내문은 정확히 A4 2면이어야 한다.');
assert.match(guide, /const codeBlock = code[\s\S]*class="code"[\s\S]*class="code blank"[\s\S]*관리자가 적어주세요/);
assert.match(guide, /window\.onload = function\(\)\{ window\.print\(\); \}/);
assert.doesNotMatch(churchAdmin, /매일 사용법 인쇄/, '매일 사용법을 별도 인쇄 버튼으로 분리하면 안 된다.');

for (const adminFaqText of [
    '기존 성도가 어떻게 들어가나요?',
    '교인이 로그인이 안 된대요',
    '가입 안내문의 입장코드 칸이 비어 있어요',
    '교인이 날짜가 밀렸대요',
    '수령 완료를 잘못 눌렀어요',
    '상점이 안 보인대요',
    '어르신이 직접 구매하기 어려워요',
    '홈 화면 추가를 도와달래요',
    '랭킹이 안 보인대요',
]) assert.ok(churchAdmin.includes(adminFaqText), `관리자 매뉴얼 FAQ 누락: ${adminFaqText}`);
assert.ok(settingsTab.includes('입장코드를 입력하거나 변경한 직후 인쇄하면 코드가 자동으로 들어갑니다.'));

// 인쇄물의 보상 설명은 실제 서버/퀴즈 계약과 함께 바뀌어야 한다.
assert.match(quizProgress, /if \(attempts === 1\) return 10;/);
assert.match(quizProgress, /if \(attempts === 2\) return 5;/);
assert.match(quizProgress, /rewardDate === todayKey/);
assert.match(readCore, /const baseTalentEarned = isFirstReadToday \? 10 \+ Math\.min\(newStreak, 7\) : 0;/);

for (const faqText of [
    '로그인이 안 돼요',
    '비밀번호를 잊었어요',
    '듣기 소리가 안 나와요',
    '달란트가 안 늘어요',
    '상점에서 샀는데 물건은 어디서?',
    '휴대폰을 바꿨어요',
    '기존 진도·달란트 이어보기',
    '다음부터는 소셜 버튼만으로 로그인',
    '하루 첫 읽기 완료',
    '하루 첫 퀴즈 정답',
    '추가 읽기는 0점·0달란트',
    '외부 브라우저로 열기',
    '홈 화면에 추가',
    '상점이 안 보이면',
    '7일 연속 읽으면 열리고, 한 번 열리면 계속 유지',
    '공동체마다 따로',
    '게스트 기록은 이전 휴대폰에만',
    '여기 없는 문제는 우리 교회 관리자(선생님)에게 말씀해주세요',
]) assert.ok(readingGuide.includes(faqText), `성도용 FAQ 문구 누락: ${faqText}`);
assert.doesNotMatch(readingGuide, /며칠 밀렸어요|날짜가 안 맞아요|밀린 날 것부터/);
assert.equal((readingGuide.match(/question: '/g) || []).length, 6, '성도용 FAQ는 정확히 6문항이어야 한다.');
assert.match(readingGuide, /<details key=\{question\}/);
assert.match(readingGuide, /<summary className="min-h-11[^"]*text-slate-700/);
assert.match(readingGuide, /<section aria-label="자주 묻는 질문 목록" className="text-sm">/);
assert.match(readingGuide, /mode = 'guide'/);
assert.match(readingGuide, /const isFaq = mode === 'faq'/);
assert.match(readingGuide, /\{isFaq \? '❓ 자주 묻는 질문' : '📖 성경통독 114 가이드'\}/);
assert.match(readingGuide, /\{isFaq \? \([\s\S]*자주 묻는 질문 목록[\s\S]*\) : \([\s\S]*💡 성경통독 114란\?/);
assert.equal((readingGuide.match(/❓ 자주 묻는 질문/g) || []).length, 1, 'FAQ 제목은 모달 상단에 한 번만 표시되어야 한다.');
assert.doesNotMatch(readingGuide, /onStartTutorial|앱 화면 사용법 투어 시작하기/);
assert.match(readingGuide, /role="dialog" aria-modal="true" aria-labelledby="reading-guide-title"/);
assert.match(readingGuide, /max-h-\[92vh\] flex flex-col/);
assert.match(readingGuide, /min-h-0 flex-1[^"]*overflow-y-auto/);
assert.match(readingGuide, /event\.key === 'Escape'/);
assert.match(readingGuide, /aria-label="도움말 닫기"/);
assert.match(readingGuide, /document\.body\.style\.overflow = 'hidden'/);
assert.match(readingGuide, /event\.key !== 'Tab'/);
assert.match(readingGuide, /dialogRef\.current\?\.querySelectorAll/);

for (const loginHelpText of [
    '기존 진도와 달란트를 그대로 연결',
    '로그인·기록 문의',
    '교회 주보',
    '교회 단체방',
    '담당 선생님',
    '교회 목록을 불러오지 못했습니다.',
    '현재 공개된 교회 목록이 없습니다.',
    '이름·생년월일·비밀번호를 다시 확인해주세요.',
]) assert.ok(loginView.includes(loginHelpText), `로그인 도움 문구 누락: ${loginHelpText}`);
assert.match(loginView, /aria-label="로그인 도움"[\s\S]*setShowReadingGuide\(true\)[\s\S]*min-h-11[\s\S]*도움말[\s\S]*setShowAdminContact\(true\)[\s\S]*min-h-11[\s\S]*로그인·기록 문의/);
assert.match(loginView, /onClick=\{\(\) => setShowReadingGuide\(true\)\}[^>]*>읽는 방법<\/button>/);
assert.match(loginView, /setShowReadingGuide\(true\)[\s\S]{0,180}md:hidden[\s\S]{0,100}도움말/);
assert.match(loginView, /hidden md:grid grid-cols-4/);
assert.match(loginView, /hidden md:block bg-cream-card/);
assert.doesNotMatch(loginView, /5초만에 빠른 시작|기존 성도 안내 다시 보기/);
assert.match(loginView, /type=\{showMemberEntryCode \? 'text' : 'password'\}/);
assert.match(loginView, /aria-label=\{showMemberEntryCode \? '교회 입장코드 숨기기' : '교회 입장코드 보기'\}/);
assert.match(loginView, /loadFailed \? \(/);
assert.match(loginView, /statsLoading \? '…' : stats\.chapters_read_today\.toLocaleString\(\)/);
assert.doesNotMatch(loginView, /stats\.chapters_read_today > 0 \? stats\.chapters_read_today\.toLocaleString\(\) : '—'/);

for (const homeHelpText of [
    '다음부터 114 아이콘으로 바로 들어오세요',
    '아이폰 Safari',
    '갤럭시 Chrome·삼성인터넷',
    '홈 화면에 추가',
]) assert.ok(homeScreenHelp.includes(homeHelpText), `홈 화면 안내 누락: ${homeHelpText}`);
assert.match(homeScreenHelp, /min-h-11 min-w-11/);
assert.match(indexHtml, /@media \(max-width: 767px\)[\s\S]*#kakao-static-ad-layer[\s\S]*position: static/);

assert.equal(packageJson.scripts['validate:round29'], 'node scripts/validate-round29.mjs');
assert.match(packageJson.scripts.validate, /npm run validate:round29/);

console.log('Round 29 validation passed.');
