// 운영 1year_new 365일 본문을 읽기만 하고 절 표식/숫자 잔재를 익명 집계한다.
// 원문, title, day ID는 출력하지 않고 73일 단위 구간 집계만 남긴다.
import fs from 'node:fs';
import { createRequire } from 'node:module';

const PROJECT_ID = 'bible114-platform';
const EXPECTED_DAYS = 365;
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
if (process.argv.length !== 2) {
    throw new Error('사용법: node scripts/audit-new-translation-text-quality.mjs');
}

const decodeString = value => typeof value?.stringValue === 'string' ? value.stringValue : '';
const dayBand = day => {
    if (day <= 73) return '001-073';
    if (day <= 146) return '074-146';
    if (day <= 219) return '147-219';
    if (day <= 292) return '220-292';
    return '293-365';
};
const increment = (record, key, amount = 1) => { record[key] = (record[key] || 0) + amount; };

// 장 헤더의 장 번호는 품질 숫자가 아니므로 모든 Markdown heading을 분석에서 제외한다.
const isHeading = line => /^#{1,6}\s+\S/.test(line.trim());
// 숫자만 2개 이상 연속된 줄은 절 번호 한 개와 구분해 강한 잔재 후보로 본다.
const numericOnlyRun = line => /^\d{1,3}(?:\s+\d{1,3})+$/.test(line.trim());
// 문장 뒤에 공백으로 분리된 숫자 2개 이상이 붙은 경우만 잡는다. 본문 속 단일 숫자는 제외한다.
const trailingNumericRun = line => /[가-힣][^\n]*\s\d{1,3}(?:\s+\d{1,3})+\s*$/.test(line.trim());
// 단독 숫자 줄은 실제 절 표식일 수도 있어 잔재로 단정하지 않고 별도 관찰 유형으로만 센다.
const singleNumericOnly = line => /^\d{1,3}$/.test(line.trim());
// 명시적 절 표식 후보: 줄 첫 숫자 뒤에 구두점 또는 공백이 있고 실제 문장이 이어지는 형태.
// `3년`, `12명`처럼 숫자가 단어에 붙은 정상 본문 숫자는 포함하지 않는다.
const versePrefix = line => {
    const match = /^\s*(\d{1,3})(?:[.):]|\s+)\s*([가-힣A-Za-z“‘'"(\[])/.exec(line);
    return match ? Number(match[1]) : null;
};
const hasStructuredVerseSequence = segments => segments.some(numbers => {
    if (numbers.length < 3) return false;
    let consecutiveSteps = 0;
    for (let index = 1; index < numbers.length; index += 1) {
        if (numbers[index] === numbers[index - 1] + 1) consecutiveSteps += 1;
    }
    return numbers.includes(1) && consecutiveSteps >= 2;
});

const documents = new Map();
const names = Array.from({ length: EXPECTED_DAYS }, (_, index) => (
    `${base}/verses/1year_new_${index + 1}`
));
for (let offset = 0; offset < names.length; offset += 100) {
    const response = await fetch(endpoint, {
        method: 'POST',
        headers,
        body: JSON.stringify({
            documents: names.slice(offset, offset + 100),
            mask: { fieldPaths: ['text'] },
        }),
    });
    if (!response.ok) throw new Error(`verses batchGet 실패: HTTP ${response.status}`);
    for (const row of await response.json()) {
        if (row.found) documents.set(row.found.name, row.found.fields || {});
    }
}

const categories = {
    noStructuredVerseSequence: [],
    numericOnlyRun: [],
    trailingNumericRun: [],
    singleNumericOnlyLine: [],
};
const lineCounts = {
    numericOnlyRun: 0,
    trailingNumericRun: 0,
    singleNumericOnlyLine: 0,
    versePrefixCandidates: 0,
};
const missing = [];
let emptyTextDocuments = 0;
let bodyLineCount = 0;
let documentsWithStructuredVerseSequence = 0;

for (let day = 1; day <= EXPECTED_DAYS; day += 1) {
    const fields = documents.get(`${base}/verses/1year_new_${day}`);
    if (!fields) {
        missing.push(day);
        continue;
    }
    const text = decodeString(fields.text);
    if (!text.trim()) emptyTextDocuments += 1;
    const segments = [[]];
    const matched = new Set();
    for (const rawLine of text.split(/\r?\n/)) {
        const line = rawLine.trim();
        if (!line) continue;
        if (isHeading(line)) {
            segments.push([]);
            continue;
        }
        bodyLineCount += 1;
        const standaloneNumber = singleNumericOnly(line) ? Number(line) : null;
        const marker = versePrefix(line) ?? standaloneNumber;
        if (marker !== null) {
            segments.at(-1).push(marker);
            lineCounts.versePrefixCandidates += 1;
        }
        if (numericOnlyRun(line)) {
            matched.add('numericOnlyRun');
            lineCounts.numericOnlyRun += 1;
        }
        if (trailingNumericRun(line)) {
            matched.add('trailingNumericRun');
            lineCounts.trailingNumericRun += 1;
        }
        if (singleNumericOnly(line)) {
            matched.add('singleNumericOnlyLine');
            lineCounts.singleNumericOnlyLine += 1;
        }
    }
    if (hasStructuredVerseSequence(segments)) {
        documentsWithStructuredVerseSequence += 1;
    } else {
        categories.noStructuredVerseSequence.push(day);
    }
    for (const category of matched) categories[category].push(day);
}

const summarize = days => {
    const bands = {};
    for (const day of days) increment(bands, dayBand(day));
    return {
        documentCount: days.length,
        dayBands: bands,
    };
};

const report = {
    generatedAt: new Date().toISOString(),
    projectId: PROJECT_ID,
    mode: 'read-only',
    privacy: {
        rawTextPrinted: false,
        titleFetched: false,
        dayIdsPrinted: false,
        dayGranularity: '73-day bands only',
    },
    corpus: {
        expectedDocuments: EXPECTED_DAYS,
        foundDocuments: documents.size,
        missingDocumentCount: missing.length,
        missingDayBands: summarize(missing).dayBands,
        emptyTextDocuments,
        analyzedBodyLines: bodyLineCount,
    },
    definitions: {
        noStructuredVerseSequence: '장별로 1을 포함한 줄 앞/독립 절 숫자 후보 3개 이상과 연속 증가 2회 이상이 없는 문서',
        numericOnlyRun: 'Markdown 장 헤더가 아닌 줄 전체가 공백 구분 숫자 2개 이상인 강한 잔재 후보',
        trailingNumericRun: '한글 문장 말미에 공백 구분 숫자 2개 이상이 붙은 강한 잔재 후보',
        singleNumericOnlyLine: '줄 전체가 숫자 1개인 관찰 후보; 절 표식 가능성이 있어 잔재로 단정하지 않음',
    },
    counts: {
        documentsWithStructuredVerseSequence,
        versePrefixCandidateLines: lineCounts.versePrefixCandidates,
        numericOnlyRunLines: lineCounts.numericOnlyRun,
        trailingNumericRunLines: lineCounts.trailingNumericRun,
        singleNumericOnlyLines: lineCounts.singleNumericOnlyLine,
    },
    categories: Object.fromEntries(
        Object.entries(categories).map(([key, days]) => [key, summarize(days)]),
    ),
    interpretationGuard: [
        'Markdown heading은 장 번호 오탐을 막기 위해 전부 제외했다.',
        '본문 속 단일 숫자와 숫자가 단어에 붙은 표현은 잔재 판정에서 제외했다.',
        'singleNumericOnlyLine과 versePrefixCandidate는 구조 증거이며 잔재 확정 건수에 합산하지 않는다.',
        '강한 잔재 후보도 자동 수리 근거가 아니라 원문 비출력 수동 표본 검토 대상으로만 사용한다.',
    ],
};

console.log(JSON.stringify(report, null, 2));
