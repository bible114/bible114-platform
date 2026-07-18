// T131 삭제 대상 특정용 읽기 전용 명단 출력 (터미널 전용, 저장 금지)
import fs from 'node:fs';
import { createRequire } from 'node:module';

const PROJECT_ID = 'bible114-platform';
const UNAFFILIATED_CHURCH_ID = 'unaffiliated_v1';

const roots = ['/opt/homebrew/lib/node_modules/firebase-tools', '/usr/local/lib/node_modules/firebase-tools']
    .filter(r => fs.existsSync(`${r}/package.json`));
const require = createRequire(`${roots[0]}/package.json`);
const firebaseAuth = require('./lib/auth');
const account = firebaseAuth.getGlobalDefaultAccount();
const scopes = String(account.tokens.scope || 'https://www.googleapis.com/auth/cloud-platform').split(/\s+/).filter(Boolean);
const access = await firebaseAuth.getAccessToken(account.tokens.refresh_token, scopes);
const accessToken = access?.access_token || access;

const firestoreRoot = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents`;
const headers = { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' };

const decodeValue = v => {
    if (!v || typeof v !== 'object') return undefined;
    if ('nullValue' in v) return null;
    if ('stringValue' in v) return v.stringValue;
    if ('integerValue' in v) return Number(v.integerValue);
    if ('doubleValue' in v) return Number(v.doubleValue);
    if ('booleanValue' in v) return v.booleanValue;
    if ('timestampValue' in v) return v.timestampValue;
    if ('arrayValue' in v) return (v.arrayValue?.values || []).map(decodeValue);
    if ('mapValue' in v) return decodeFields(v.mapValue?.fields || {});
    return undefined;
};
const decodeFields = fields => Object.fromEntries(Object.entries(fields || {}).map(([k, v]) => [k, decodeValue(v)]));
const docPath = name => String(name || '').split('/documents/')[1] || '';
const docId = name => docPath(name).split('/').at(-1) || '';

const listCollection = async collectionId => {
    const documents = [];
    let pageToken = '';
    do {
        const url = new URL(`${firestoreRoot}/${encodeURIComponent(collectionId)}`);
        url.searchParams.set('pageSize', '300');
        if (pageToken) url.searchParams.set('pageToken', pageToken);
        const res = await fetch(url, { headers });
        if (!res.ok) throw new Error(`${collectionId} HTTP ${res.status}`);
        const body = await res.json();
        documents.push(...(body.documents || []));
        pageToken = body.nextPageToken || '';
    } while (pageToken);
    return documents;
};
const runGroup = async collectionId => {
    const res = await fetch(`${firestoreRoot}:runQuery`, {
        method: 'POST', headers,
        body: JSON.stringify({ structuredQuery: { from: [{ collectionId, allDescendants: true }] } }),
    });
    if (!res.ok) throw new Error(`${collectionId} group HTTP ${res.status}`);
    return (await res.json()).flatMap(r => r.document ? [r.document] : []);
};
const listAuth = async () => {
    const accounts = [];
    let next = '';
    do {
        const url = new URL(`https://identitytoolkit.googleapis.com/v1/projects/${PROJECT_ID}/accounts:batchGet`);
        url.searchParams.set('maxResults', '1000');
        if (next) url.searchParams.set('nextPageToken', next);
        const res = await fetch(url, { headers });
        if (!res.ok) throw new Error(`Auth HTTP ${res.status}`);
        const body = await res.json();
        accounts.push(...(body.users || []));
        next = body.nextPageToken || '';
    } while (next);
    return accounts;
};

const KOREAN = /(클로드\s*테스트|코덱스\s*테스트|운영\s*테스트|테스트\s*(교회|공동체|계정|사용자|유저|회원|관리자)|임시\s*(교회|공동체|계정|사용자|유저|회원|관리자)|더미\s*(교회|공동체|계정|사용자|유저|회원))/i;
const ENGLISH = /(^|[^a-z0-9])(test|testing|tester|qa|dummy|fixture|probe|sandbox|staging|e2e)([^a-z0-9]|$)/i;
const marker = v => typeof v === 'string' && v.trim() && (KOREAN.test(v.normalize('NFKC')) || ENGLISH.test(v.normalize('NFKC')));

const [userDocs, churchDocs, rosterDocs, authAccounts] = await Promise.all([
    listCollection('users'), listCollection('churches'), runGroup('roster'), listAuth(),
]);
const authByUid = new Map(authAccounts.filter(a => a.localId).map(a => [a.localId, a]));
const churchesById = new Map(churchDocs.map(d => [docId(d.name), decodeFields(d.fields || {})]));

console.log('=== A. 명백한 테스트 표지 users ===');
const patternUids = new Set();
for (const d of userDocs) {
    const id = docId(d.name);
    const u = decodeFields(d.fields || {});
    if (marker(u.name) || marker(u.email) || marker(id)) {
        patternUids.add(id);
        console.log(`uid=${id} | name=${u.name} | church=${u.churchName}(${u.churchId}) | role=${u.role || 'member'} | talent=${u.talent ?? 0} | isDeleted=${u.isDeleted === true} | auth=${authByUid.has(id)} | day=${u.currentDay}`);
    }
}

console.log('\n=== B. Auth 미연결인데 active인 users (테스트 여부 불확실) ===');
for (const d of userDocs) {
    const id = docId(d.name);
    const u = decodeFields(d.fields || {});
    if (!authByUid.has(id) && u.isDeleted !== true && !patternUids.has(id)) {
        console.log(`uid=${id} | name=${u.name} | church=${u.churchName}(${u.churchId}) | role=${u.role || 'member'} | talent=${u.talent ?? 0} | day=${u.currentDay} | lastRead=${u.lastReadDate || '-'} | birth=${u.birthdate || '-'}`);
    }
}

console.log('\n=== C. 테스트 표지 churches ===');
for (const [id, c] of churchesById) {
    if (c.isVirtual === true || c.isUnaffiliated === true || id === UNAFFILIATED_CHURCH_ID) continue;
    const adminIsCandidate = typeof c.adminUid === 'string' && patternUids.has(c.adminUid);
    if (marker(c.name) || marker(c.adminEmail) || marker(id) || adminIsCandidate) {
        console.log(`churchId=${id} | name=${c.name} | adminUid=${c.adminUid || '-'} | isDeleted=${c.isDeleted === true} | hidden=${c.hiddenFromDirectory === true}`);
    }
}

console.log('\n=== D. 후보 관련 roster ===');
for (const d of rosterDocs) {
    const path = docPath(d.name);
    const m = /^churches\/([^/]+)\/roster\/([^/]+)$/.exec(path);
    if (!m) continue;
    const r = decodeFields(d.fields || {});
    const uid = r.uid || m[2];
    if (patternUids.has(uid)) {
        console.log(`path=${path} | uid=${uid} | talent=${r.talent ?? 0}`);
    }
}

console.log('\n=== E. Auth만 있고 users 없음 (18건 예상) ===');
for (const a of authAccounts) {
    const uid = a.localId;
    if (!uid) continue;
    const hasUser = userDocs.some(d => docId(d.name) === uid);
    if (!hasUser) {
        console.log(`uid=${uid} | email=${a.email || '-'} | provider=${(a.providerUserInfo || []).map(p => p.providerId).join(',') || '-'} | created=${a.createdAt ? new Date(Number(a.createdAt)).toISOString().slice(0, 10) : '-'} | lastLogin=${a.lastLoginAt ? new Date(Number(a.lastLoginAt)).toISOString().slice(0, 10) : '-'}`);
    }
}
