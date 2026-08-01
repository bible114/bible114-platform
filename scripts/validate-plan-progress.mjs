#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
    getDaysRead,
    getPlanCycleDays,
    getPlanProgressRate,
    normalizePlanProgressDay,
} from '../src/utils/readingProgress.js';

const scheduleLengths = [
    ['readable_revised', 'src/data/readable_schedule.json', 60],
    ['readable_new', 'src/data/readable_schedule.json', 60],
    ['1year_revised', 'src/data/read_schedules.json', 365, 'whole_bible'],
    ['1year_new', 'src/data/read_schedules.json', 365, 'whole_bible'],
    ['nt_new', 'src/data/read_schedules.json', 365, 'new_testament'],
    ['1year_sequential', 'src/data/sequential_schedule.json', 365],
];

scheduleLengths.forEach(([planId, filePath, expectedDays, key]) => {
    const parsed = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    const schedule = key ? parsed[key] : parsed;
    assert.equal(schedule.length, expectedDays, `${planId} 일정 길이`);
    assert.equal(getPlanCycleDays(planId), expectedDays, `${planId} 진행률 분모`);
});

const currentYear = new Date(Date.now() + (9 * 60 * 60 * 1000)).getUTCFullYear();
const readableHalf = {
    planId: 'readable_revised',
    currentDay: 31,
    readingYear: currentYear,
    yearCompletedRounds: 0,
    readCount: 1,
};
assert.equal(getDaysRead(readableHalf), 30);
assert.equal(getPlanProgressRate(readableHalf), 50);
assert.equal(normalizePlanProgressDay(185, readableHalf.planId), 5);

const readableCompleted = {
    ...readableHalf,
    currentDay: 1,
    yearCompletedRounds: 1,
    readCount: 2,
};
assert.equal(getDaysRead(readableCompleted), 60);
assert.equal(getPlanProgressRate(readableCompleted), 100);

const annualHalf = {
    ...readableHalf,
    planId: '1year_revised',
    currentDay: 183,
};
assert.equal(getDaysRead(annualHalf), 182);
assert.ok(getPlanProgressRate(annualHalf) > 49 && getPlanProgressRate(annualHalf) < 50);

const rankingSource = fs.readFileSync('src/components/modals/RankingModal.jsx', 'utf8');
const dashboardSource = fs.readFileSync('src/components/DashboardView.jsx', 'utf8');
assert.doesNotMatch(rankingSource, /currentDay\s*\/\s*365/);
assert.match(rankingSource, /getPlanProgressRate\(member\)/);
assert.match(rankingSource, /평균 진행률/);
assert.doesNotMatch(dashboardSource, /Math\.abs\(r\.currentDay\s*-\s*currentDay\)/);
assert.match(dashboardSource, /getPlanProgressRate\(currentUser\)/);

console.log('✅ 혼합 읽기계획 진행률 검증 통과');
