// 운영 1year_sequential 캐시의 title과 본문 장 헤더를 읽기 전용으로 대조한다.
import fs from 'node:fs';
import { createRequire } from 'node:module';
import { parseReadingRange } from '../src/utils/quizParsing.js';
import schedules from '../src/data/read_schedules.json' with { type: 'json' };

const PROJECT_ID = 'bible114-platform';
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
const base = `projects/${PROJECT_ID}/databases/(default)/documents`;
const endpoint = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents:batchGet`;
const headers = { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' };
const writeMode = process.argv.slice(2).includes('--write');
if (process.argv.slice(2).some(arg => arg !== '--write')) {
    throw new Error('사용법: node scripts/audit-sequential-verses-schedule.mjs [--write]');
}

const decodeString = value => typeof value?.stringValue === 'string' ? value.stringValue : '';
const chapterKeys = items => [...new Set(items.map(item => `${item.book}:${item.ch}`))];
const parseBodyHeadings = text => {
    const items = [];
    for (const line of String(text || '').split(/\r?\n/)) {
        const match = /^#{1,6}\s+(.+?)\s*$/.exec(line.trim());
        if (!match) continue;
        items.push(...parseReadingRange(match[1]));
    }
    return items;
};

const documents = new Map();
const names = Array.from({ length: 365 }, (_, index) => `${base}/verses/1year_sequential_${index + 1}`);
for (let offset = 0; offset < names.length; offset += 100) {
    const response = await fetch(endpoint, {
        method: 'POST',
        headers,
        body: JSON.stringify({
            documents: names.slice(offset, offset + 100),
            mask: { fieldPaths: ['title', 'text'] },
        }),
    });
    if (!response.ok) throw new Error(`verses batchGet 실패: HTTP ${response.status}`);
    const rows = await response.json();
    for (const row of rows) {
        if (row.found) documents.set(row.found.name, row.found.fields || {});
    }
}

const report = {
    generatedAt: new Date().toISOString(),
    projectId: PROJECT_ID,
    found: documents.size,
    missingDays: [],
    titleUnparsedDays: [],
    bodyHeadingUnparsedDays: [],
    titleBodyMismatch: [],
    uniqueTitleChapters: 0,
    uniqueBodyChapters: 0,
};
const titleCoverage = new Set();
const bodyCoverage = new Set();
const generatedSchedule = [];
for (let day = 1; day <= 365; day += 1) {
    const fields = documents.get(`${base}/verses/1year_sequential_${day}`);
    if (!fields) {
        report.missingDays.push(day);
        continue;
    }
    const title = decodeString(fields.title);
    const text = decodeString(fields.text);
    const titleKeys = chapterKeys(parseReadingRange(title));
    const bodyKeys = chapterKeys(parseBodyHeadings(text));
    generatedSchedule.push({
        date: schedules.whole_bible[day - 1].date,
        range: bodyKeys.map(key => {
            const separator = key.lastIndexOf(':');
            return `${key.slice(0, separator)} ${key.slice(separator + 1)}장`;
        }).join(', '),
    });
    titleKeys.forEach(key => titleCoverage.add(key));
    bodyKeys.forEach(key => bodyCoverage.add(key));
    if (titleKeys.length === 0) report.titleUnparsedDays.push({ day, title });
    if (bodyKeys.length === 0) report.bodyHeadingUnparsedDays.push(day);
    if (titleKeys.join('|') !== bodyKeys.join('|')) {
        report.titleBodyMismatch.push({ day, title, titleKeys, bodyKeys });
    }
}
report.uniqueTitleChapters = titleCoverage.size;
report.uniqueBodyChapters = bodyCoverage.size;
report.titleBodyMismatch = report.titleBodyMismatch.slice(0, 30);
console.log(JSON.stringify(report, null, 2));
if (writeMode) {
    if (
        report.found !== 365 || report.missingDays.length > 0 ||
        report.bodyHeadingUnparsedDays.length > 0 || report.uniqueBodyChapters !== 1189 ||
        generatedSchedule.length !== 365
    ) throw new Error('본문 장 헤더 감사 결과가 안전하지 않아 일정을 생성하지 않았습니다.');
    fs.writeFileSync(
        new URL('../src/data/sequential_schedule.json', import.meta.url),
        `${JSON.stringify(generatedSchedule, null, 2)}\n`,
    );
    console.log('생성 완료: src/data/sequential_schedule.json');
}
