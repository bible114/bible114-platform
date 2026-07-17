// 운영 데이터는 바꾸지 않고 1year_sequential 사용 규모와 성공한 퀴즈 원장만 집계한다.
import fs from 'node:fs';
import { createRequire } from 'node:module';

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
const root = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents`;
const headers = { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' };

const decodeValue = value => {
    if (!value || typeof value !== 'object') return undefined;
    if ('nullValue' in value) return null;
    if ('stringValue' in value) return value.stringValue;
    if ('integerValue' in value) return Number(value.integerValue);
    if ('doubleValue' in value) return Number(value.doubleValue);
    if ('booleanValue' in value) return value.booleanValue;
    if ('timestampValue' in value) return value.timestampValue;
    if ('arrayValue' in value) return (value.arrayValue?.values || []).map(decodeValue);
    if ('mapValue' in value) return decodeFields(value.mapValue?.fields || {});
    return undefined;
};
const decodeFields = fields => Object.fromEntries(
    Object.entries(fields || {}).map(([key, value]) => [key, decodeValue(value)]),
);
const increment = (record, key) => { record[key] = (record[key] || 0) + 1; };

const users = [];
let pageToken = '';
do {
    const url = new URL(`${root}/users`);
    url.searchParams.set('pageSize', '300');
    if (pageToken) url.searchParams.set('pageToken', pageToken);
    const response = await fetch(url, { headers });
    if (!response.ok) throw new Error(`users 읽기 실패: HTTP ${response.status}`);
    const body = await response.json();
    users.push(...(body.documents || []));
    pageToken = body.nextPageToken || '';
} while (pageToken);

const ledgerResponse = await fetch(`${root}:runQuery`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
        structuredQuery: {
            from: [{ collectionId: 'activityActions', allDescendants: true }],
        },
    }),
});
if (!ledgerResponse.ok) throw new Error(`activityActions 읽기 실패: HTTP ${ledgerResponse.status}`);
const ledgers = (await ledgerResponse.json()).flatMap(row => row.document ? [row.document] : []);

const usersByUid = new Map();
const activePlanCounts = {};
const activeSequentialRoles = {};
let activeSequentialWithQuizProgress = 0;
for (const document of users) {
    const uid = String(document.name || '').split('/').pop() || '';
    const data = decodeFields(document.fields || {});
    usersByUid.set(uid, data);
    if (data.isDeleted === true) continue;
    const planId = typeof data.planId === 'string' && data.planId ? data.planId : '(none)';
    increment(activePlanCounts, planId);
    if (planId === '1year_sequential') {
        increment(activeSequentialRoles, typeof data.role === 'string' ? data.role : '(none)');
        if (data.quizProgress && Object.keys(data.quizProgress).length > 0) {
            activeSequentialWithQuizProgress += 1;
        }
    }
}

const successfulQuizActionsByPlan = {};
const sequentialQuizKeys = new Set();
let successfulQuizActions = 0;
for (const document of ledgers) {
    const data = decodeFields(document.fields || {});
    if (!['submitQuiz', 'skipQuiz'].includes(data.action)) continue;
    const path = String(document.name || '').split('/documents/users/')[1] || '';
    const uid = decodeURIComponent(path.split('/activityActions/')[0] || '');
    const user = usersByUid.get(uid);
    const planId = typeof user?.planId === 'string' && user.planId ? user.planId : '(missing-user-or-plan)';
    increment(successfulQuizActionsByPlan, planId);
    successfulQuizActions += 1;
    if (planId === '1year_sequential' && typeof data.input?.quizKey === 'string') {
        sequentialQuizKeys.add(data.input.quizKey);
    }
}

console.log(JSON.stringify({
    generatedAt: new Date().toISOString(),
    projectId: PROJECT_ID,
    users: {
        total: users.length,
        activePlanCounts,
        activeSequentialRoles,
        activeSequentialWithQuizProgress,
    },
    successfulQuizLedgers: {
        total: successfulQuizActions,
        byCurrentPlan: successfulQuizActionsByPlan,
        sequentialUniqueQuizKeys: sequentialQuizKeys.size,
    },
    limitation: 'invalidQuiz로 거부된 요청은 원장이 생기지 않으므로 Edge 로그 없이는 이 집계에 나타나지 않는다.',
}, null, 2));
