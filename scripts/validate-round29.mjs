import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = path => fs.readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

const churchAdmin = read('src/components/ChurchAdminView.jsx');
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
    /한 문제, 2번까지 도전/,
    /매일 첫 읽기 완료: <b>10 달란트<\/b>/,
    /연속으로 읽으면 보너스가 커져요/,
    /퀴즈 정답 \(하루 1번\)/,
    /상품은 교회에서 받아요/,
    /물음표\(\?\) 버튼/,
    /교회 관리자\(담당 선생님\)/,
]) assert.match(guide, pattern);

assert.equal((guide.match(/<main/g) || []).length, 2, '가입 안내문은 정확히 A4 2면이어야 한다.');
assert.match(guide, /const codeBlock = code[\s\S]*class="code"[\s\S]*class="code blank"[\s\S]*관리자가 적어주세요/);
assert.match(guide, /window\.onload = function\(\)\{ window\.print\(\); \}/);
assert.doesNotMatch(churchAdmin, /매일 사용법 인쇄/, '매일 사용법을 별도 인쇄 버튼으로 분리하면 안 된다.');

// 인쇄물의 보상 설명은 실제 서버/퀴즈 계약과 함께 바뀌어야 한다.
assert.match(quizProgress, /if \(attempts === 1\) return 10;/);
assert.match(quizProgress, /if \(attempts === 2\) return 5;/);
assert.match(quizProgress, /rewardDate === todayKey/);
assert.match(readCore, /const baseTalentEarned = isFirstReadToday \? 10 \+ Math\.min\(newStreak, 7\) : 0;/);

assert.equal(packageJson.scripts['validate:round29'], 'node scripts/validate-round29.mjs');
assert.match(packageJson.scripts.validate, /npm run validate:round29/);

console.log('Round 29 validation passed.');
