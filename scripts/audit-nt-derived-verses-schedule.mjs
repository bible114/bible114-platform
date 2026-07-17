// 운영 신약 파생 캐시 3종의 Day별 장 배치를 canonical 신약 일정과 읽기 전용으로 대조한다.
import fs from 'node:fs';
import { createRequire } from 'node:module';

import schedules from '../src/data/read_schedules.json' with { type: 'json' };
import { parseReadingRange } from '../src/utils/quizParsing.js';

const PROJECT_ID = 'bible114-platform';
const PLAN_IDS = ['nt_saehangul', 'nt_easy', 'nt_message'];
const DAY_COUNT = 365;
const EXPECTED_NT_CHAPTERS = 260;

if (process.argv.length !== 2) {
    throw new Error('사용법: node scripts/audit-nt-derived-verses-schedule.mjs');
}

const firebaseToolsRoots = [
    '/opt/homebrew/lib/node_modules/firebase-tools',
    '/usr/local/lib/node_modules/firebase-tools',
].filter(root => fs.existsSync(`${root}/package.json`));
if (firebaseToolsRoots.length === 0) throw new Error('Firebase CLI 로그인을 찾지 못했습니다.');

const require = createRequire(`${firebaseToolsRoots[0]}/package.json`);
const auth = require('./lib/auth');
const account = auth.getGlobalDefaultAccount();
if (!account?.tokens?.refresh_token) throw new Error('Firebase CLI 로그인 정보가 없습니다.');
const scopes = String(account.tokens.scope || 'https://www.googleapis.com/auth/cloud-platform')
    .split(/\s+/).filter(Boolean);
const access = await auth.getAccessToken(account.tokens.refresh_token, scopes);
const accessToken = access?.access_token || access;
const documentBase = `projects/${PROJECT_ID}/databases/(default)/documents`;
const batchGetEndpoint = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents:batchGet`;
const headers = { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' };

const decodeString = value => typeof value?.stringValue === 'string' ? value.stringValue : '';
const uniqueChapterKeys = items => [...new Set(items.map(item => `${item.slug}:${item.ch}`))];
const signature = keys => keys.join('|');
const parseBodyHeadings = text => {
    const items = [];
    for (const line of String(text || '').split(/\r?\n/)) {
        const heading = /^#{1,6}\s+(.+?)\s*$/.exec(line.trim());
        if (heading) items.push(...parseReadingRange(heading[1]));
    }
    return items;
};
const contiguousRanges = days => {
    if (days.length === 0) return [];
    const ranges = [];
    let start = days[0];
    let previous = days[0];
    for (const day of days.slice(1)) {
        if (day === previous + 1) {
            previous = day;
            continue;
        }
        ranges.push(start === previous ? `${start}` : `${start}-${previous}`);
        start = day;
        previous = day;
    }
    ranges.push(start === previous ? `${start}` : `${start}-${previous}`);
    return ranges;
};
const histogram = values => Object.fromEntries([...values.reduce((counts, value) => {
    const key = String(value);
    counts.set(key, (counts.get(key) || 0) + 1);
    return counts;
}, new Map())].sort((left, right) => Number(left[0]) - Number(right[0])));

const canonical = schedules.new_testament.map((entry, index) => {
    const keys = uniqueChapterKeys(parseReadingRange(entry?.range));
    return { day: index + 1, keys, signature: signature(keys) };
});
if (canonical.length !== DAY_COUNT) {
    throw new Error(`canonical new_testament 일정이 ${DAY_COUNT}일이 아닙니다: ${canonical.length}`);
}
const canonicalUnparsedDays = canonical.filter(row => row.keys.length === 0).map(row => row.day);
const canonicalCoverage = new Set(canonical.flatMap(row => row.keys));
if (canonicalUnparsedDays.length > 0 || canonicalCoverage.size !== EXPECTED_NT_CHAPTERS) {
    throw new Error(`canonical 일정 불변식 실패: unparsed=${canonicalUnparsedDays.length}, chapters=${canonicalCoverage.size}`);
}

const requestedNames = PLAN_IDS.flatMap(planId => Array.from(
    { length: DAY_COUNT },
    (_, index) => `${documentBase}/verses/${planId}_${index + 1}`,
));
const documents = new Map();
for (let offset = 0; offset < requestedNames.length; offset += 100) {
    const response = await fetch(batchGetEndpoint, {
        method: 'POST',
        headers,
        body: JSON.stringify({
            documents: requestedNames.slice(offset, offset + 100),
            mask: { fieldPaths: ['title', 'text'] },
        }),
    });
    if (!response.ok) throw new Error(`verses batchGet 실패: HTTP ${response.status}`);
    for (const row of await response.json()) {
        if (row.found) documents.set(row.found.name, row.found.fields || {});
    }
}

const rowsByPlan = new Map();
const planReports = {};
for (const planId of PLAN_IDS) {
    const rows = [];
    const foundDays = [];
    const missingDays = [];
    const titleUnparsedDays = [];
    const bodyHeadingUnparsedDays = [];
    const titleBodyMismatchDays = [];
    const titleCanonicalMismatchDays = [];
    const bodyCanonicalMismatchDays = [];
    const titleCoverage = new Set();
    const bodyCoverage = new Set();
    const nearestOffsets = [];
    const ambiguousSignatureDays = [];
    const unmatchedSignatureDays = [];

    for (let day = 1; day <= DAY_COUNT; day += 1) {
        const fields = documents.get(`${documentBase}/verses/${planId}_${day}`);
        if (!fields) {
            missingDays.push(day);
            rows.push({ day, found: false, titleSignature: '', bodySignature: '' });
            continue;
        }
        foundDays.push(day);
        const titleKeys = uniqueChapterKeys(parseReadingRange(decodeString(fields.title)));
        const bodyKeys = uniqueChapterKeys(parseBodyHeadings(decodeString(fields.text)));
        const titleSignature = signature(titleKeys);
        const bodySignature = signature(bodyKeys);
        rows.push({ day, found: true, titleSignature, bodySignature });
        titleKeys.forEach(key => titleCoverage.add(key));
        bodyKeys.forEach(key => bodyCoverage.add(key));
        if (titleKeys.length === 0) titleUnparsedDays.push(day);
        if (bodyKeys.length === 0) bodyHeadingUnparsedDays.push(day);
        if (titleSignature !== bodySignature) titleBodyMismatchDays.push(day);
        if (titleSignature !== canonical[day - 1].signature) titleCanonicalMismatchDays.push(day);
        if (bodySignature !== canonical[day - 1].signature) bodyCanonicalMismatchDays.push(day);

        if (bodySignature) {
            const candidateDays = canonical
                .filter(row => row.signature === bodySignature)
                .map(row => row.day);
            if (candidateDays.length === 0) unmatchedSignatureDays.push(day);
            else {
                if (candidateDays.length > 1) ambiguousSignatureDays.push(day);
                candidateDays.sort((left, right) => (
                    Math.abs(left - day) - Math.abs(right - day) || left - right
                ));
                nearestOffsets.push(candidateDays[0] - day);
            }
        }
    }

    const coverageReport = coverage => ({
        uniqueChapters: coverage.size,
        expectedChapters: EXPECTED_NT_CHAPTERS,
        missingChapters: [...canonicalCoverage].filter(key => !coverage.has(key)).sort(),
        unexpectedChapters: [...coverage].filter(key => !canonicalCoverage.has(key)).sort(),
    });
    const offsetMatchCounts = [];
    for (let offset = -(DAY_COUNT - 1); offset <= DAY_COUNT - 1; offset += 1) {
        let compared = 0;
        let matches = 0;
        for (const row of rows) {
            const canonicalDay = row.day + offset;
            if (!row.found || !row.bodySignature || canonicalDay < 1 || canonicalDay > DAY_COUNT) continue;
            compared += 1;
            if (row.bodySignature === canonical[canonicalDay - 1].signature) matches += 1;
        }
        if (matches > 0) offsetMatchCounts.push({ offset, matches, compared });
    }
    offsetMatchCounts.sort((left, right) => (
        right.matches - left.matches || Math.abs(left.offset) - Math.abs(right.offset) || left.offset - right.offset
    ));

    rowsByPlan.set(planId, rows);
    planReports[planId] = {
        found: foundDays.length,
        foundRanges: contiguousRanges(foundDays),
        missingCount: missingDays.length,
        missingRanges: contiguousRanges(missingDays),
        titleUnparsedCount: titleUnparsedDays.length,
        titleUnparsedDays,
        bodyHeadingUnparsedCount: bodyHeadingUnparsedDays.length,
        bodyHeadingUnparsedDays,
        titleBodyMismatchCount: titleBodyMismatchDays.length,
        titleBodyMismatchDays,
        titleCanonicalMismatchCount: titleCanonicalMismatchDays.length,
        titleCanonicalMismatchDays,
        bodyCanonicalMismatchCount: bodyCanonicalMismatchDays.length,
        bodyCanonicalMismatchDays,
        coverage: {
            title: coverageReport(titleCoverage),
            body: coverageReport(bodyCoverage),
        },
        offsetAnalysis: {
            nearestCanonicalOffsetHistogram: histogram(nearestOffsets),
            ambiguousSignatureCount: ambiguousSignatureDays.length,
            ambiguousSignatureDays,
            unmatchedSignatureCount: unmatchedSignatureDays.length,
            unmatchedSignatureDays,
            strongestGlobalOffsets: offsetMatchCounts.slice(0, 10),
        },
    };
}

const pairwise = [];
for (let leftIndex = 0; leftIndex < PLAN_IDS.length; leftIndex += 1) {
    for (let rightIndex = leftIndex + 1; rightIndex < PLAN_IDS.length; rightIndex += 1) {
        const leftPlan = PLAN_IDS[leftIndex];
        const rightPlan = PLAN_IDS[rightIndex];
        const leftRows = rowsByPlan.get(leftPlan);
        const rightRows = rowsByPlan.get(rightPlan);
        const comparableDays = [];
        const sameBodyDays = [];
        const differentBodyDays = [];
        for (let index = 0; index < DAY_COUNT; index += 1) {
            if (!leftRows[index].found || !rightRows[index].found) continue;
            const day = index + 1;
            comparableDays.push(day);
            if (leftRows[index].bodySignature === rightRows[index].bodySignature) sameBodyDays.push(day);
            else differentBodyDays.push(day);
        }
        pairwise.push({
            plans: [leftPlan, rightPlan],
            comparableDays: comparableDays.length,
            sameBodyDayCount: sameBodyDays.length,
            differentBodyDayCount: differentBodyDays.length,
            differentBodyDays,
        });
    }
}

console.log(JSON.stringify({
    schemaVersion: 1,
    projectId: PROJECT_ID,
    mode: 'read-only',
    canonical: {
        days: canonical.length,
        uniqueChapters: canonicalCoverage.size,
        unparsedDays: canonicalUnparsedDays,
    },
    plans: planReports,
    pairwise,
    allThreeHaveIdenticalBodyBatch: pairwise.every(row => (
        row.comparableDays === DAY_COUNT && row.differentBodyDayCount === 0
    )),
}, null, 2));
