import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

import { parseReadingRange } from '../src/utils/quizParsing.js';

const PROJECT_ID = 'bible114-platform';
const PLAN_PATH = '/Users/jaeam/Developer/클로드/bible114-verses-title-phase2-20260717.json';
const applyMode = process.argv.slice(2).includes('--apply');
if (process.argv.slice(2).some(arg => arg !== '--apply')) {
    throw new Error('사용법: node scripts/apply-verses-title-phase2.mjs [--apply]');
}

const EXPECTED_PARSE = {
    '1year_new_337': 'jeremiah:29|jeremiah:30|jeremiah:31|jeremiah:32',
    'nt_new_136': 'acts:11|acts:12',
    '1year_new_363': '1john:3|1john:4|1john:5|2john:1|3john:1',
    '1year_revised_363': '1john:3|1john:4|1john:5|2john:1|3john:1',
    '1year_revised_337': 'jeremiah:29|jeremiah:30|jeremiah:31|jeremiah:32',
    '1year_easy_337': 'jeremiah:29|jeremiah:30|jeremiah:31|jeremiah:32',
    '1year_saehangul_337': 'jeremiah:29|jeremiah:30|jeremiah:31|jeremiah:32',
    '1year_easy_363': '1john:3|1john:4|1john:5|2john:1|3john:1',
    '1year_saehangul_363': '1john:3|1john:4|1john:5|2john:1|3john:1',
    '1year_sequential_357': '2john:1|3john:1|jude:1',
};

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const plan = JSON.parse(fs.readFileSync(PLAN_PATH, 'utf8'));
const entries = Object.entries(plan.docs || {});
if (entries.length !== 10 || new Set(entries.map(([id]) => id)).size !== 10) {
    throw new Error('title 계획은 중복 없는 정확히 10개 문서여야 합니다.');
}
if (Object.keys(EXPECTED_PARSE).sort().join('|') !== entries.map(([id]) => id).sort().join('|')) {
    throw new Error('title 계획 문서와 parser 기대 목록이 다릅니다.');
}
for (const [id, item] of entries) {
    if (
        typeof item?.expectedCurrentTitle !== 'string' ||
        typeof item?.newTitle !== 'string' || item.newTitle === item.expectedCurrentTitle
    ) throw new Error(`${id}: title 계획 값이 올바르지 않습니다.`);
    const parsed = parseReadingRange(item.newTitle).map(value => `${value.slug}:${value.ch}`).join('|');
    if (parsed !== EXPECTED_PARSE[id]) throw new Error(`${id}: 새 title parser 결과가 기대와 다릅니다.`);
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
const databaseRoot = `projects/${PROJECT_ID}/databases/(default)/documents`;
const apiRoot = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents`;
const headers = { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' };
const names = entries.map(([id]) => `${databaseRoot}/verses/${id}`);

const batchGet = async () => {
    const response = await fetch(`${apiRoot}:batchGet`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ documents: names }),
    });
    if (!response.ok) throw new Error(`title 문서 조회 실패: HTTP ${response.status}`);
    const rows = await response.json();
    const found = new Map(rows.flatMap(row => row.found ? [[row.found.name, row.found]] : []));
    if (found.size !== entries.length) throw new Error(`title 문서 누락: ${found.size}/${entries.length}`);
    return found;
};

const before = await batchGet();
let expectedCount = 0;
let alreadyCount = 0;
const mismatches = [];
for (const [id, item] of entries) {
    const document = before.get(`${databaseRoot}/verses/${id}`);
    const liveTitle = document?.fields?.title?.stringValue;
    if (liveTitle === item.expectedCurrentTitle) expectedCount += 1;
    else if (liveTitle === item.newTitle) alreadyCount += 1;
    else mismatches.push(id);
}
console.log(JSON.stringify({ mode: applyMode ? 'apply' : 'dry-run', documents: entries.length, expectedCount, alreadyCount, mismatchCount: mismatches.length, mismatches }, null, 2));
if (!applyMode) process.exit(mismatches.length === 0 ? 0 : 1);
if (expectedCount !== entries.length || alreadyCount !== 0 || mismatches.length !== 0) {
    throw new Error('운영 title이 expectedCurrentTitle과 10/10 일치하지 않아 전체 적용을 중단했습니다.');
}

const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
const backupPath = path.join(path.dirname(PLAN_PATH), `bible114-verses-title-phase2-backup-${timestamp}.json`);
const backup = {
    generatedAt: new Date().toISOString(),
    projectId: PROJECT_ID,
    planPath: PLAN_PATH,
    documents: entries.map(([id]) => before.get(`${databaseRoot}/verses/${id}`)),
};
fs.writeFileSync(backupPath, `${JSON.stringify(backup, null, 2)}\n`, { mode: 0o600, flag: 'wx' });
fs.chmodSync(backupPath, 0o600);

const commitResponse = await fetch(`${apiRoot}:commit`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
        writes: entries.map(([id, item]) => {
            const document = before.get(`${databaseRoot}/verses/${id}`);
            return {
                update: {
                    name: `${databaseRoot}/verses/${id}`,
                    fields: { title: { stringValue: item.newTitle } },
                },
                updateMask: { fieldPaths: ['title'] },
                currentDocument: { updateTime: document.updateTime },
            };
        }),
    }),
});
if (!commitResponse.ok) {
    throw new Error(`title 원자 적용 실패: HTTP ${commitResponse.status}`);
}

const stable = value => {
    if (Array.isArray(value)) return value.map(stable);
    if (!value || typeof value !== 'object') return value;
    return Object.fromEntries(Object.keys(value).sort().map(key => [key, stable(value[key])]));
};
const after = await batchGet();
const verificationErrors = [];
for (const [id, item] of entries) {
    const name = `${databaseRoot}/verses/${id}`;
    const oldDocument = structuredClone(before.get(name));
    const newDocument = structuredClone(after.get(name));
    if (newDocument?.fields?.title?.stringValue !== item.newTitle) verificationErrors.push(`${id}: title`);
    const parsed = parseReadingRange(newDocument?.fields?.title?.stringValue || '')
        .map(value => `${value.slug}:${value.ch}`).join('|');
    if (parsed !== EXPECTED_PARSE[id]) verificationErrors.push(`${id}: parser`);
    delete oldDocument.fields.title;
    delete newDocument.fields.title;
    delete oldDocument.updateTime;
    delete newDocument.updateTime;
    if (JSON.stringify(stable(oldDocument)) !== JSON.stringify(stable(newDocument))) {
        verificationErrors.push(`${id}: non-title drift`);
    }
}
if (verificationErrors.length > 0) {
    throw new Error(`title 사후검증 실패: ${verificationErrors.join(', ')}`);
}

const backupSha256 = crypto.createHash('sha256').update(fs.readFileSync(backupPath)).digest('hex');
console.log(JSON.stringify({
    result: 'PASS',
    updated: entries.length,
    backupPath: path.relative(ROOT, backupPath).startsWith('..') ? backupPath : path.relative(ROOT, backupPath),
    backupMode: (fs.statSync(backupPath).mode & 0o777).toString(8).padStart(4, '0'),
    backupSha256,
}, null, 2));
