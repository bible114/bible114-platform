import assert from 'node:assert/strict';
import fs from 'node:fs';

const guest = fs.readFileSync(new URL('../src/components/GuestReaderView.jsx', import.meta.url), 'utf8');
const reader = fs.readFileSync(new URL('../src/components/dashboard/BibleReader.jsx', import.meta.url), 'utf8');
const header = fs.readFileSync(new URL('../src/components/dashboard/DashboardHeader.jsx', import.meta.url), 'utf8');
const video = fs.readFileSync(new URL('../src/components/dashboard/DailyVideoCard.jsx', import.meta.url), 'utf8');
const quiz = fs.readFileSync(new URL('../src/components/dashboard/BibleQuizCard.jsx', import.meta.url), 'utf8');
const memo = fs.readFileSync(new URL('../src/components/dashboard/MemoSection.jsx', import.meta.url), 'utf8');
const dashboard = fs.readFileSync(new URL('../src/components/DashboardView.jsx', import.meta.url), 'utf8');

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
assert.match(header, /☰ <span>메뉴<\/span>[\s\S]*로그인·홈 화면 안내[\s\S]*로그아웃/);
assert.match(header, /<header className="relative z-\[90\][\s\S]*공동체 선택/);
assert.doesNotMatch(header, />\{currentOrganizationName \|\| '내 단체 관리'\}<\/span>/);
assert.doesNotMatch(header, /md:flex-nowrap md:justify-end/);

assert.equal((video.match(/min-h-11/g) || []).length >= 3, true);
assert.match(quiz, /min-h-11 rounded-xl px-3 py-2 text-sm font-bold[\s\S]*이 DAY는 건너뛰기/);
assert.match(memo, /min-h-11 rounded-xl px-3 py-2 text-sm font-bold[\s\S]*내 기록 보기/);
assert.match(dashboard, /lazy\(\(\) => import\('\.\/dashboard\/TalentShop'\)\)/);
assert.equal((dashboard.match(/<Suspense fallback=/g) || []).length >= 1, true);
assert.match(dashboard, /함께 읽는 통독 현황[\s\S]*<RaceMap[\s\S]*<BibleReader[\s\S]*aria-label="읽기왕"[\s\S]*<ReadingChampionSection/);
assert.doesNotMatch(dashboard, /로그인·홈 화면 이용 안내|공동체 현황·랭킹 모아보기/);

console.log('novice mobile controls validation passed');
