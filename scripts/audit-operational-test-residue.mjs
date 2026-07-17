// 운영 테스트 잔재 후보를 집계하는 읽기 전용 감사.
// 출력에는 이름, UID, 이메일, 문서 ID 원문을 절대 포함하지 않는다.
// Firestore의 GET/list/runQuery와 Identity Toolkit batchGet만 사용하며 쓰기 API는 호출하지 않는다.

import fs from 'node:fs';
import { createRequire } from 'node:module';

const PROJECT_ID = 'bible114-platform';
const UNAFFILIATED_CHURCH_ID = 'unaffiliated_v1';
if (process.argv.length !== 2) {
    throw new Error('사용법: node scripts/audit-operational-test-residue.mjs');
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
const docPath = name => String(name || '').split('/documents/')[1] || '';
const docId = name => docPath(name).split('/').at(-1) || '';

const listTopLevelCollection = async collectionId => {
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

const runCollectionGroup = async collectionId => {
    const response = await fetch(`${firestoreRoot}:runQuery`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
            structuredQuery: { from: [{ collectionId, allDescendants: true }] },
        }),
    });
    if (!response.ok) throw new Error(`${collectionId} collectionGroup 읽기 실패: HTTP ${response.status}`);
    return (await response.json()).flatMap(row => row.document ? [row.document] : []);
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

// 일반 단어 속 우연한 부분 일치를 줄이기 위해 한글은 명백한 표지어만,
// 영문은 비영숫자/문자열 경계가 있는 토큰만 인정한다.
const KOREAN_TEST_PATTERN = /(클로드\s*테스트|코덱스\s*테스트|운영\s*테스트|테스트\s*(교회|공동체|계정|사용자|유저|회원|관리자)|임시\s*(교회|공동체|계정|사용자|유저|회원|관리자)|더미\s*(교회|공동체|계정|사용자|유저|회원))/i;
const ENGLISH_TEST_PATTERN = /(^|[^a-z0-9])(test|testing|tester|qa|dummy|fixture|probe|sandbox|staging|e2e)([^a-z0-9]|$)/i;
const containsTestMarker = value => {
    if (typeof value !== 'string' || !value.trim()) return false;
    const normalized = value.normalize('NFKC').trim();
    return KOREAN_TEST_PATTERN.test(normalized) || ENGLISH_TEST_PATTERN.test(normalized);
};
const anyTestMarker = values => values.some(containsTestMarker);
const positiveTalent = value => Number.isSafeInteger(value) && value > 0;

const [userDocs, churchDocs, rosterDocs, purchaseDocs, authAccounts] = await Promise.all([
    listTopLevelCollection('users'),
    listTopLevelCollection('churches'),
    runCollectionGroup('roster'),
    runCollectionGroup('talentPurchases'),
    listAuthAccounts(),
]);

const users = new Map(userDocs.map(document => {
    const id = docId(document.name);
    return [id, { id, data: decodeFields(document.fields || {}) }];
}));
const churches = new Map(churchDocs.map(document => {
    const id = docId(document.name);
    return [id, { id, data: decodeFields(document.fields || {}) }];
}));
const authByUid = new Map(authAccounts
    .filter(authUser => typeof authUser.localId === 'string' && authUser.localId)
    .map(authUser => [authUser.localId, authUser]));

const userPatternCandidates = new Set();
const userCandidateReasons = { name: 0, email: 0, documentId: 0 };
for (const { id, data } of users.values()) {
    const matchedReasons = [];
    if (containsTestMarker(data.name)) matchedReasons.push('name');
    if (containsTestMarker(data.email)) matchedReasons.push('email');
    if (containsTestMarker(id)) matchedReasons.push('documentId');
    if (matchedReasons.length > 0) {
        userPatternCandidates.add(id);
        matchedReasons.forEach(reason => { userCandidateReasons[reason] += 1; });
    }
}

const churchPatternCandidates = new Set();
const churchCandidateReasons = { name: 0, adminEmail: 0, documentId: 0 };
for (const { id, data } of churches.values()) {
    // 무소속 같은 시스템 가상 공동체는 테스트 이름 판정에서 제외한다.
    if (
        data.isVirtual === true || data.isUnaffiliated === true
        || id === UNAFFILIATED_CHURCH_ID
    ) continue;
    const matchedReasons = [];
    if (containsTestMarker(data.name)) matchedReasons.push('name');
    if (containsTestMarker(data.adminEmail)) matchedReasons.push('adminEmail');
    if (containsTestMarker(id)) matchedReasons.push('documentId');
    if (matchedReasons.length > 0) {
        churchPatternCandidates.add(id);
        matchedReasons.forEach(reason => { churchCandidateReasons[reason] += 1; });
    }
}

const activeUsersWithoutAuth = new Set();
const deletedUsersWithoutAuth = new Set();
for (const { id, data } of users.values()) {
    if (authByUid.has(id)) continue;
    if (data.isDeleted === true) deletedUsersWithoutAuth.add(id);
    else activeUsersWithoutAuth.add(id);
}

const authPatternWithoutUser = new Set();
let authWithoutUser = 0;
for (const authUser of authAccounts) {
    const uid = typeof authUser.localId === 'string' ? authUser.localId : '';
    if (!uid || users.has(uid)) continue;
    authWithoutUser += 1;
    if (anyTestMarker([uid, authUser.email, authUser.displayName])) authPatternWithoutUser.add(uid);
}

// 실제 잔재 검토 대상은 명백한 패턴 사용자와 활성 Auth 미연결 users다.
// 삭제 users의 Auth 미연결은 정상 삭제 결과일 수 있어 별도 참고치로만 둔다.
const candidateUserIds = new Set([...userPatternCandidates, ...activeUsersWithoutAuth]);
const explicitChurchPatternCount = churchPatternCandidates.size;
let churchesAddedByCandidateAdminUid = 0;
for (const { id, data } of churches.values()) {
    if (
        data.isVirtual !== true && data.isUnaffiliated !== true && id !== UNAFFILIATED_CHURCH_ID
        && typeof data.adminUid === 'string' && candidateUserIds.has(data.adminUid)
        && !churchPatternCandidates.has(id)
    ) {
        churchPatternCandidates.add(id);
        churchesAddedByCandidateAdminUid += 1;
    }
}
const candidateChurchIds = new Set(churchPatternCandidates);

const rosterSummary = {
    total: rosterDocs.length,
    relatedToCandidate: 0,
    relatedByCandidateUser: 0,
    relatedByCandidateChurch: 0,
    malformedPath: 0,
    positiveTalentWallets: 0,
};
for (const document of rosterDocs) {
    const match = /^churches\/([^/]+)\/roster\/([^/]+)$/.exec(docPath(document.name));
    if (!match) {
        rosterSummary.malformedPath += 1;
        continue;
    }
    const [, churchId, pathUid] = match;
    const data = decodeFields(document.fields || {});
    const uid = typeof data.uid === 'string' && data.uid ? data.uid : pathUid;
    const byUser = candidateUserIds.has(uid);
    const byChurch = candidateChurchIds.has(churchId);
    if (!byUser && !byChurch) continue;
    rosterSummary.relatedToCandidate += 1;
    if (byUser) rosterSummary.relatedByCandidateUser += 1;
    if (byChurch) rosterSummary.relatedByCandidateChurch += 1;
    if (positiveTalent(data.talent)) rosterSummary.positiveTalentWallets += 1;
}

let candidateUsersWithPositiveDirectTalent = 0;
for (const uid of candidateUserIds) {
    if (positiveTalent(users.get(uid)?.data?.talent)) candidateUsersWithPositiveDirectTalent += 1;
}

const purchaseSummary = {
    total: purchaseDocs.length,
    pendingTotal: 0,
    pendingRelatedToCandidate: 0,
    pendingByCandidateUser: 0,
    pendingByCandidateChurch: 0,
    malformedPath: 0,
};
for (const document of purchaseDocs) {
    const path = docPath(document.name);
    const match = /^churches\/([^/]+)\/talentPurchases\/[^/]+$/.exec(path);
    if (!match) {
        purchaseSummary.malformedPath += 1;
        continue;
    }
    const data = decodeFields(document.fields || {});
    if (data.status !== 'pending') continue;
    purchaseSummary.pendingTotal += 1;
    const byUser = typeof data.uid === 'string' && candidateUserIds.has(data.uid);
    const byChurch = candidateChurchIds.has(match[1]);
    if (!byUser && !byChurch) continue;
    purchaseSummary.pendingRelatedToCandidate += 1;
    if (byUser) purchaseSummary.pendingByCandidateUser += 1;
    if (byChurch) purchaseSummary.pendingByCandidateChurch += 1;
}

const candidateUsersWithAuth = [...candidateUserIds].filter(uid => authByUid.has(uid)).length;
const report = {
    audit: {
        projectId: PROJECT_ID,
        generatedAt: new Date().toISOString(),
        readOnly: true,
        piiPrinted: false,
    },
    inventory: {
        users: users.size,
        churches: churches.size,
        rosters: rosterDocs.length,
        authAccounts: authAccounts.length,
        talentPurchases: purchaseDocs.length,
    },
    obviousPatternCandidates: {
        users: userPatternCandidates.size,
        userReasonCounts: userCandidateReasons,
        churches: explicitChurchPatternCount,
        churchReasonCounts: churchCandidateReasons,
        authOnlyAccounts: authPatternWithoutUser.size,
    },
    authLinkState: {
        activeUsersWithoutAuth: activeUsersWithoutAuth.size,
        deletedUsersWithoutAuthReferenceOnly: deletedUsersWithoutAuth.size,
        authAccountsWithoutUser: authWithoutUser,
        obviousPatternAuthAccountsWithoutUser: authPatternWithoutUser.size,
        reviewCandidateUsersWithAuth: candidateUsersWithAuth,
        reviewCandidateUsersWithoutAuth: candidateUserIds.size - candidateUsersWithAuth,
    },
    reviewCandidates: {
        users: candidateUserIds.size,
        churches: candidateChurchIds.size,
        churchesAddedByCandidateAdminUid,
        relatedRosters: rosterSummary.relatedToCandidate,
        hasAnyPositiveTalent: candidateUsersWithPositiveDirectTalent > 0
            || rosterSummary.positiveTalentWallets > 0,
        positiveDirectUserWallets: candidateUsersWithPositiveDirectTalent,
        positiveRosterWallets: rosterSummary.positiveTalentWallets,
        hasAnyPendingPurchase: purchaseSummary.pendingRelatedToCandidate > 0,
        pendingPurchases: purchaseSummary.pendingRelatedToCandidate,
    },
    rosterSummary,
    purchaseSummary,
    handling: {
        churches: '사용자 승인 후 adminSetChurchLifecycle 경로 검토',
        individualUsers: '사용자 승인 후 기존 계정 삭제 action 경로 검토',
        actionTaken: false,
    },
};

console.log(JSON.stringify(report, null, 2));
