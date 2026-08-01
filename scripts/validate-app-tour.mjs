import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = path => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const overlay = read('src/components/TutorialOverlay.jsx');
const demo = read('src/components/DemoTour.jsx');
const header = read('src/components/dashboard/DashboardHeader.jsx');
const video = read('src/components/dashboard/DailyVideoCard.jsx');
const bible = read('src/components/dashboard/BibleReader.jsx');
const memo = read('src/components/dashboard/MemoSection.jsx');
const login = read('src/components/LoginView.jsx');
const index = read('index.html');

const stepIds = [...overlay.matchAll(/^\s*id: '(tut-[^']+)'/gm)].map(match => match[1]);
assert.deepEqual(stepIds, [
    'tut-version-btn',
    'tut-menu-btn',
    'tut-daily-video',
    'tut-bible-header',
    'tut-tts-area',
    'tut-bible-text',
    'tut-quiz-area',
    'tut-read-btn',
    'tut-memo-section',
]);

assert.doesNotMatch(overlay, /tut-score|점수\s*&\s*레벨|최대 \+5점/);
assert.match(login, /setShowDemoTour\(true\)[\s\S]{0,200}앱 화면 먼저 둘러보기/);

const demoRenderedSources = [demo, header, bible, memo].join('\n');
for (const id of stepIds) {
    assert.match(demoRenderedSources, new RegExp(id), `체험 화면에 ${id}가 있어야 합니다.`);
}
assert.match(demo, /quizContent=\{<DemoQuiz \/>}/);

for (const [id, source] of [
    ['tut-version-btn', header],
    ['tut-menu-btn', header],
    ['tut-daily-video', video],
    ['tut-bible-header', bible],
    ['tut-tts-area', bible],
    ['tut-bible-text', bible],
    ['tut-quiz-area', bible],
    ['tut-read-btn', bible],
    ['tut-memo-section', memo],
]) {
    assert.match(source, new RegExp(id), `실제 대시보드에 ${id}가 있어야 합니다.`);
}

assert.match(overlay, /role="dialog"/);
assert.match(overlay, /aria-modal="true"/);
assert.match(overlay, /투어 종료/);

const demoLayer = Number(demo.match(/demo-tour-root[^"]*z-\[(\d+)\]/)?.[1]);
const adLayer = Number(index.match(/#kakao-static-ad-layer\s*\{[\s\S]*?z-index:\s*(\d+)/)?.[1]);
assert.ok(Number.isFinite(demoLayer), '체험 화면의 z-index를 확인할 수 있어야 합니다.');
assert.ok(Number.isFinite(adLayer), '하단 광고의 z-index를 확인할 수 있어야 합니다.');
assert.ok(demoLayer > adLayer, '체험 화면과 안내창은 하단 광고보다 위에 표시되어야 합니다.');

console.log('앱 화면 투어 검증 통과');
