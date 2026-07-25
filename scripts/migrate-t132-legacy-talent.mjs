import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

const PROJECT_ID = 'bible114-platform';
const EXECUTE_FLAG = '--execute';
const args = process.argv.slice(2);
if (args.some(arg => arg !== EXECUTE_FLAG) || args.filter(arg => arg === EXECUTE_FLAG).length > 1) {
    throw new Error('사용법: node scripts/migrate-t132-legacy-talent.mjs [--execute]');
}
const execute = args.includes(EXECUTE_FLAG);

const firebaseToolsRoot = [
    '/opt/homebrew/lib/node_modules/firebase-tools',
    '/usr/local/lib/node_modules/firebase-tools',
].find(root => fs.existsSync(`${root}/package.json`));
if (!firebaseToolsRoot) throw new Error('Firebase CLI를 찾지 못했습니다.');
const require = createRequire(`${firebaseToolsRoot}/package.json`);
const auth = require('./lib/auth');
const account = auth.getGlobalDefaultAccount();
if (!account?.tokens?.refresh_token) throw new Error('Firebase CLI 로그인이 필요합니다.');
const scopes = String(account.tokens.scope || 'https://www.googleapis.com/auth/cloud-platform')
    .split(/\s+/)
    .filter(Boolean);
const access = await auth.getAccessToken(account.tokens.refresh_token, scopes);
const accessToken = access?.access_token || access;
const headers = { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' };
const root = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents`;

const decodeValue = value => {
    if (!value || typeof value !== 'object') return undefined;
    if ('nullValue' in value) return null;
    if ('stringValue' in value) return value.stringValue;
    if ('integerValue' in value) return Number(value.integerValue);
    if ('doubleValue' in value) return Number(value.doubleValue);
    if ('booleanValue' in value) return value.booleanValue;
    if ('timestampValue' in value) return value.timestampValue;
    if ('arrayValue' in value) return (value.arrayValue.values || []).map(decodeValue);
    if ('mapValue' in value) {
        return Object.fromEntries(
            Object.entries(value.mapValue.fields || {}).map(([key, entry]) => [key, decodeValue(entry)]),
        );
    }
    return undefined;
};
const decodeFields = fields => Object.fromEntries(
    Object.entries(fields || {}).map(([key, value]) => [key, decodeValue(value)]),
);
const encodeValue = value => {
    if (value === null) return { nullValue: null };
    if (typeof value === 'boolean') return { booleanValue: value };
    if (Number.isSafeInteger(value)) return { integerValue: String(value) };
    if (value instanceof Date) return { timestampValue: value.toISOString() };
    throw new Error('지원하지 않는 Firestore 값입니다.');
};

const documents = [];
let pageToken = '';
do {
    const url = new URL(`${root}/users`);
    url.searchParams.set('pageSize', '300');
    if (pageToken) url.searchParams.set('pageToken', pageToken);
    const response = await fetch(url, { headers });
    if (!response.ok) throw new Error(`users 조회 실패: HTTP ${response.status}`);
    const body = await response.json();
    documents.push(...(body.documents || []));
    pageToken = body.nextPageToken || '';
} while (pageToken);

const candidates = documents.flatMap(document => {
    const data = decodeFields(document.fields || {});
    if (data.talentMigrated === true) return [];
    const inventory = Array.isArray(data.inventory) ? data.inventory : [];
    const unlockedRooms = Number.isSafeInteger(data.miniroom?.unlockedRooms)
        ? data.miniroom.unlockedRooms
        : 1;
    if (inventory.length > 0 || unlockedRooms > 1) {
        throw new Error('구매 이력이 있는 미이관 계정이 발견되어 자동 이관을 중단합니다.');
    }
    const score = Number.isSafeInteger(data.score) && data.score >= 0 && data.score <= 1_000_000_000
        ? data.score
        : 0;
    return [{
        name: document.name,
        updateTime: document.updateTime,
        before: {
            score: data.score ?? null,
            talent: data.talent ?? null,
            talentMigrated: data.talentMigrated ?? null,
            role: data.role ?? null,
            isDeleted: data.isDeleted ?? null,
        },
        after: { score, talent: score, talentMigrated: true },
    }];
});

const roleCounts = Object.fromEntries(
    [...new Set(candidates.map(candidate => String(candidate.before.role || 'unknown')))]
        .sort()
        .map(role => [role, candidates.filter(candidate => String(candidate.before.role || 'unknown') === role).length]),
);
console.log(JSON.stringify({
    mode: execute ? 'execute' : 'dry-run',
    totalUsers: documents.length,
    candidates: candidates.length,
    roleCounts,
    purchaseHistoryCandidates: 0,
}, null, 2));
if (!execute || candidates.length === 0) process.exit(0);

const backupDir = path.resolve('operations/private');
fs.mkdirSync(backupDir, { recursive: true, mode: 0o700 });
const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const backupPath = path.join(backupDir, `t132-legacy-talent-backup-${stamp}.json`);
fs.writeFileSync(backupPath, JSON.stringify({
    projectId: PROJECT_ID,
    createdAt: new Date().toISOString(),
    candidates,
}, null, 2), { mode: 0o600, flag: 'wx' });

const writes = candidates.map(candidate => ({
    update: {
        name: candidate.name,
        fields: Object.fromEntries(
            Object.entries({
                ...candidate.after,
                updatedAt: new Date(),
            }).map(([key, value]) => [key, encodeValue(value)]),
        ),
    },
    updateMask: { fieldPaths: ['score', 'talent', 'talentMigrated', 'updatedAt'] },
    currentDocument: { updateTime: candidate.updateTime },
}));
const response = await fetch(
    `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents:commit`,
    { method: 'POST', headers, body: JSON.stringify({ writes }) },
);
if (!response.ok) {
    const body = await response.text();
    throw new Error(`legacy 달란트 이관 실패: HTTP ${response.status} ${body.slice(0, 500)}`);
}
console.log(JSON.stringify({
    applied: candidates.length,
    backupPath,
}, null, 2));
