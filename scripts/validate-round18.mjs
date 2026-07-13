import assert from 'node:assert/strict';
import fs from 'node:fs';
import { getQuizProgressKey, getQuizRewardForAnswer } from '../src/utils/quizProgress.js';

const read = path => fs.readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

assert.equal(getQuizProgressKey(1, 1), 'r1_d1');
assert.equal(getQuizProgressKey(1, 2), 'r1_d2');
assert.notEqual(getQuizProgressKey(1, 1), getQuizProgressKey(1, 2));
assert.equal(getQuizRewardForAnswer({ attempts: 1, isCorrect: true, rewardDate: null, todayKey: 'today' }), 10);
assert.equal(getQuizRewardForAnswer({ attempts: 2, isCorrect: true, rewardDate: null, todayKey: 'today' }), 5);
assert.equal(getQuizRewardForAnswer({ attempts: 1, isCorrect: true, rewardDate: 'today', todayKey: 'today' }), 0);
assert.equal(getQuizRewardForAnswer({ attempts: 1, isCorrect: true, rewardDate: 'yesterday', todayKey: 'today' }), 10);
assert.equal(getQuizRewardForAnswer({ attempts: 1, isCorrect: true, rewardDate: null, todayKey: 'today', legacyRewardedToday: true }), 0);

const login = read('src/components/LoginView.jsx');
const reader = read('src/components/dashboard/BibleReader.jsx');
const dashboard = read('src/components/DashboardView.jsx');
const quiz = read('src/components/dashboard/BibleQuizCard.jsx');
const header = read('src/components/dashboard/DashboardHeader.jsx');
const achievements = read('src/components/modals/AchievementsModal.jsx');
const actions = read('src/hooks/useUserBibleActions.js');
const settings = read('src/components/churchAdmin/SettingsTab.jsx');

for (const text of ['5초만에 빠른 시작', '카카오로 시작', '기존 회원 로그인(이름으로)', '공동체 등록하기']) assert.match(login, new RegExp(text.replace(/[()]/g, '\\$&')));
for (const text of ['공동체 등록이란?', '성도이신가요?', '무료 · 약 5분 소요']) assert.match(login, new RegExp(text.replace(/[()?]/g, '\\$&')));
assert.match(read('src/App.jsx'), /공동체 등록 완료![\s\S]*성도용 가입 안내문 인쇄\(QR\)/);
assert.doesNotMatch(settings, /우리 교회 로그인 링크|\?church=/);
assert.match(dashboard, /quizContent=\{\(/);
assert.match(reader, /quizContent[\s\S]*tut-read-btn/);
assert.match(reader, /오늘 읽기 완료! 🎉/);
assert.doesNotMatch(header, /tut-score|\{score \|\| 0\}pt/);
assert.match(achievements, /총 읽은 날/);
assert.match(achievements, /최장 연속/);
assert.match(actions, /maxStreak/);
assert.match(quiz, /quizProgress\.\$\{progressKey\}/);
assert.match(quiz, /퀴즈 달란트는 하루 1번만 적립돼요/);

console.log('라운드 18 계약 검증 통과: 첫 화면, 소셜 연결, 읽기 흐름, 기록 허브, DAY별 퀴즈');
