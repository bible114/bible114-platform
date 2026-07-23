import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
    getCalendarYearKst,
    getLifetimeCompletedRounds,
    getYearCompletedRounds,
    needsAnnualReadingSync,
} from '../src/utils/annualReading.js';

assert.equal(getCalendarYearKst(Date.parse('2026-12-31T14:59:59Z')), 2026);
assert.equal(getCalendarYearKst(Date.parse('2026-12-31T15:00:00Z')), 2027);

const current = {
    readingYear: 2027,
    yearCompletedRounds: 2,
    lifetimeCompletedRounds: 12,
    readCount: 13,
};
assert.equal(getYearCompletedRounds(current, 2027), 2);
assert.equal(getLifetimeCompletedRounds(current), 12);
assert.equal(needsAnnualReadingSync(current, 2027), false);

assert.equal(getYearCompletedRounds(current, 2028), 0);
assert.equal(needsAnnualReadingSync(current, 2028), true);

const legacy = { readCount: 11 };
assert.equal(getYearCompletedRounds(legacy, 2026), 10);
assert.equal(getLifetimeCompletedRounds(legacy), 10);
assert.equal(needsAnnualReadingSync(legacy, 2026), true);

const reader = fs.readFileSync(new URL('../src/components/dashboard/BibleReader.jsx', import.meta.url), 'utf8');
const auth = fs.readFileSync(new URL('../src/hooks/useUserAuth.js', import.meta.url), 'utf8');
const normalization = fs.readFileSync(new URL('../supabase/functions/platform-api/normalizeLegacyReadingPositionService.ts', import.meta.url), 'utf8');
assert.match(reader, /올해 \{yearCompletedRounds\}독/);
assert.match(reader, /전체 \{lifetimeCompletedRounds\}독/);
assert.match(auth, /needsAnnualReadingSync\(user\)/);
assert.match(normalization, /currentDay: isNewYear \? 1/);
assert.match(normalization, /yearCompletedRounds: isNewYear[\s\S]*\? 0/);
assert.match(normalization, /score: isNewYear \? 0/);
assert.match(normalization, /startDate: `\$\{currentYear\}-01-01`/);

console.log('annual reading validation passed');
