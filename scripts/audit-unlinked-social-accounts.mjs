// 운영 users와 Firebase Auth·kakaoLinks를 읽기 전용으로 대조한다.
// 이름과 공동체는 관리자 후속 안내를 위해 출력하지만 UID·이메일·생년월일·비밀번호는 출력하지 않는다.

import fs from 'node:fs';
import { createRequire } from 'node:module';

const PROJECT_ID = 'bible114-platform';
if (process.argv.length !== 2) {
    throw new Error('사용법: node scripts/audit-unlinked-social-accounts.mjs');
}

const firebaseToolsRoots = [
    '/opt/homebrew/lib/node_modules/firebase-tools',
    '/usr/local/lib/node_modules/firebase-tools',
].filter(root => fs.existsSync(`${root}/package.json`));
if (firebaseToolsRoots.length === 0) throw new Error('Firebase CLI 로그인을 찾지 못했습니다.');
const require = createRequire(`${firebaseToolsRoots[0]}/package.json`);
const firebaseAuth = require('./lib/auth');
const account = firebaseAuth.getGlobalDefaultAccount();
if (!account?.tokens?.refresh_token) throw new Error('Firebase CLI 로그인 정보가 없습니다.');
const scopes = String(account.tokens.scope || 'https://www.googleapis.com/auth/cloud-platform')
    .split(/\s+/).filter(Boolean);
const access = await firebaseAuth.getAccessToken(account.tokens.refresh_token, scopes);
const accessToken = access?.access_token || access;
if (!accessToken) throw new Error('Firebase 관리자 읽기 토큰을 얻지 못했습니다.');

const firestoreRoot = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents`;
const headers = { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' };

const decodeValue = value => {
    if (!value || typeof value !== 'object') return undefined;
    if ('nullValue' in value) return null;
    if ('stringValue' in value) return value.stringValue;
    if ('integerValue' in value) return Number(value.integerValue);
    if ('doubleValue' in value) return value.doubleValue;
    if ('booleanValue' in value) return value.booleanValue;
    if ('timestampValue' in value) return value.timestampValue;
    if ('arrayValue' in value) return (value.arrayValue?.values || []).map(decodeValue);
    if ('mapValue' in value) return decodeFields(value.mapValue?.fields || {});
    return undefined;
};
const decodeFields = fields => Object.fromEntries(
    Object.entries(fields || {}).map(([key, value]) => [key, decodeValue(value)]),
);
const docId = name => String(name || '').split('/documents/')[1]?.split('/').at(-1) || '';
const safeLabel = (value, fallback) => {
    const normalized = typeof value === 'string' ? value.trim() : '';
    return normalized && normalized.length <= 120 && !/[\u0000-\u001f\u007f]/.test(normalized)
        ? normalized
        : fallback;
};

const listCollection = async collectionId => {
    const documents = [];
    let pageToken = '';
    do {
        const url = new URL(`${firestoreRoot}/${encodeURIComponent(collectionId)}`);
        url.searchParams.set('pageSize', '300');
        if (pageToken) url.searchParams.set('pageToken', pageToken);
        const response = await fetch(url, { headers });
        if (!response.ok) throw new Error(`${collectionId} 읽기 실패: HTTP ${response.status}`);
        const body = await response.json();
        documents.push(...(Array.isArray(body.documents) ? body.documents : []));
        pageToken = typeof body.nextPageToken === 'string' ? body.nextPageToken : '';
    } while (pageToken);
    return documents;
};

const listAuthAccounts = async () => {
    const accounts = [];
    let nextPageToken = '';
    do {
        const url = new URL(`https://identitytoolkit.googleapis.com/v1/projects/${PROJECT_ID}/accounts:batchGet`);
        url.searchParams.set('maxResults', '1000');
        if (nextPageToken) url.searchParams.set('nextPageToken', nextPageToken);
        const response = await fetch(url, { headers });
        if (!response.ok) throw new Error(`Auth 계정 읽기 실패: HTTP ${response.status}`);
        const body = await response.json();
        accounts.push(...(Array.isArray(body.users) ? body.users : []));
        nextPageToken = typeof body.nextPageToken === 'string' ? body.nextPageToken : '';
    } while (nextPageToken);
    return accounts;
};

const [userDocs, churchDocs, kakaoLinkDocs, authAccounts] = await Promise.all([
    listCollection('users'),
    listCollection('churches'),
    listCollection('kakaoLinks'),
    listAuthAccounts(),
]);

const churches = new Map(churchDocs.map(document => {
    const data = decodeFields(document.fields || {});
    return [docId(document.name), safeLabel(data.name, '이름 없는 공동체')];
}));
const authByUid = new Map(authAccounts
    .filter(authUser => typeof authUser.localId === 'string' && authUser.localId)
    .map(authUser => [authUser.localId, authUser]));
const kakaoLinkedUids = new Set(kakaoLinkDocs.flatMap(document => {
    const data = decodeFields(document.fields || {});
    return typeof data.uid === 'string' && data.uid ? [data.uid] : [];
}));

const activeUsers = userDocs.flatMap(document => {
    const uid = docId(document.name);
    const data = decodeFields(document.fields || {});
    return uid && data.isDeleted !== true ? [{ uid, data }] : [];
});

const rows = activeUsers.map(({ uid, data }) => {
    const authUser = authByUid.get(uid);
    const providerIds = new Set(
        (Array.isArray(authUser?.providerUserInfo) ? authUser.providerUserInfo : [])
            .flatMap(provider => typeof provider?.providerId === 'string' ? [provider.providerId] : []),
    );
    const google = providerIds.has('google.com');
    const kakao = /^kakao:[1-9]\d*$/.test(uid) || kakaoLinkedUids.has(uid);
    const churchId = typeof data.churchId === 'string' ? data.churchId : '';
    return {
        uid,
        name: safeLabel(data.name, '이름 없음'),
        church: churches.get(churchId) || safeLabel(data.churchName, churchId ? '알 수 없는 공동체' : '소속 없음'),
        department: safeLabel(data.departmentName, '미지정'),
        role: safeLabel(data.role, 'member'),
        authExists: Boolean(authUser),
        google,
        kakao,
    };
});

const transitionRoles = new Set(['member', 'churchAdmin', 'platformAdmin', 'superAdmin']);
const transitionRows = rows.filter(row => transitionRoles.has(row.role));
const unlinked = rows
    .filter(row => !row.google && !row.kakao)
    .sort((left, right) => (
        left.church.localeCompare(right.church, 'ko')
        || left.name.localeCompare(right.name, 'ko')
        || left.uid.localeCompare(right.uid)
    ));

const grouped = new Map();
for (const row of unlinked) {
    if (!grouped.has(row.church)) grouped.set(row.church, []);
    grouped.get(row.church).push({
        name: row.name,
        department: row.department,
        role: row.role,
        loginState: row.authExists ? '기존 Auth 있음·소셜 미연결' : 'Auth 없음',
    });
}

const report = {
    audit: {
        projectId: PROJECT_ID,
        generatedAt: new Date().toISOString(),
        readOnly: true,
        fieldsExcluded: ['uid', 'email', 'birthdate', 'password'],
        kakaoRule: 'kakao:<id> Auth UID 또는 kakaoLinks의 uid 일치',
        googleRule: 'Firebase Auth providerUserInfo에 google.com 존재',
    },
    summary: {
        activeUsers: rows.length,
        googleConnected: rows.filter(row => row.google).length,
        kakaoConnected: rows.filter(row => row.kakao).length,
        connectedToEither: rows.filter(row => row.google || row.kakao).length,
        connectedToBoth: rows.filter(row => row.google && row.kakao).length,
        unlinked: unlinked.length,
        unlinkedWithAuth: unlinked.filter(row => row.authExists).length,
        unlinkedWithoutAuth: unlinked.filter(row => !row.authExists).length,
        transitionEligibleUsers: transitionRows.length,
        transitionConnected: transitionRows.filter(row => row.google || row.kakao).length,
        transitionUnlinked: transitionRows.filter(row => !row.google && !row.kakao).length,
        transitionUnlinkedWithAuth: transitionRows.filter(
            row => !row.google && !row.kakao && row.authExists,
        ).length,
        transitionUnlinkedWithoutAuth: transitionRows.filter(
            row => !row.google && !row.kakao && !row.authExists,
        ).length,
        nonUserRoleDocuments: rows.filter(row => !transitionRoles.has(row.role)).length,
    },
    unlinkedByChurch: [...grouped.entries()].map(([church, members]) => ({
        church,
        count: members.length,
        members,
    })),
};

console.log(JSON.stringify(report, null, 2));
