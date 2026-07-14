import fs from 'node:fs';
import { createRequire } from 'node:module';

const PROJECT_ID = 'bible114-platform';
const firebaseToolsRoots = [
    '/opt/homebrew/lib/node_modules/firebase-tools',
    '/usr/local/lib/node_modules/firebase-tools',
].filter(root => fs.existsSync(`${root}/package.json`));

if (firebaseToolsRoots.length === 0) {
    throw new Error('Firebase CLI 로그인을 찾지 못했습니다. firebase login 후 다시 실행해주세요.');
}

const require = createRequire(`${firebaseToolsRoots[0]}/package.json`);
const auth = require('./lib/auth');
const account = auth.getGlobalDefaultAccount();
if (!account?.tokens?.refresh_token) {
    throw new Error('Firebase CLI 로그인 정보가 없습니다. firebase login 후 다시 실행해주세요.');
}

const scopes = String(account.tokens.scope || 'https://www.googleapis.com/auth/cloud-platform')
    .split(/\s+/).filter(Boolean);
const access = await auth.getAccessToken(account.tokens.refresh_token, scopes);
const accessToken = access?.access_token || access;
let pageToken = '';
const findings = [];
let total = 0;

do {
    const url = new URL(`https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents/churches`);
    url.searchParams.set('pageSize', '300');
    if (pageToken) url.searchParams.set('pageToken', pageToken);
    const response = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });
    if (!response.ok) throw new Error(`Firestore 조회 실패: HTTP ${response.status}`);
    const body = await response.json();
    for (const document of body.documents || []) {
        total += 1;
        const fields = document.fields || {};
        const exposed = ['churchCode', 'code', 'adminEmail', 'adminUid'].filter(field => field in fields);
        if (exposed.length > 0) {
            findings.push({ id: document.name.split('/').pop(), fields: exposed });
        }
    }
    pageToken = body.nextPageToken || '';
} while (pageToken);

console.log(JSON.stringify({ totalChurches: total, findings }, null, 2));
