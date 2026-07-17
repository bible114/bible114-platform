// 일회용 운영 검증 스크립트: 배포된 platform-api가 1year_sequential 사용자의
// 표준 퀴즈를 서버 정답 인덱스 기준으로 실제 저장하는지 확인한다.
//
// 안전 원칙:
// - 아래 UID와 이메일은 이 프로브 전용 고정 식별자다.
// - 시작 전에 Firestore users 문서와 Auth의 UID/이메일이 모두 비어 있는지 확인한다.
// - 임시 Auth/users만 만들고 기존 운영 문서는 읽기 외에는 건드리지 않는다.
// - 성공/실패와 관계없이 finally에서 users 아래 모든 하위 문서를 재귀 삭제한 뒤
//   users 문서와 Auth 계정을 삭제한다.
//
// 실행 전제: platform-api v11과 그에 대응하는 웹/quiz-answer-index 배포 완료.

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const PROJECT_ID = 'bible114-platform';
const TEST_UID = 'sequential-quiz-probe-20260717';
const PROBE_EMAIL = 'sequential-quiz-probe-20260717@bible114-ops-test.invalid';
const PLATFORM_API_ORIGIN = 'https://www.bible114.net';
const PLAN_ID = '1year_sequential';
const CURRENT_DAY = 105;
const READ_COUNT = 1;
const DAY_OFFSET = 0;
const READING_EPOCH = 0;
const PROGRESS_KEY = `r${READ_COUNT}_d${CURRENT_DAY}`;

const repoRoot = fileURLToPath(new URL('..', import.meta.url));
let overallPass = true;
const record = (label, ok, detail = '') => {
    console.log(`${ok ? 'PASS' : 'FAIL'} - ${label}${detail ? ` (${detail})` : ''}`);
    if (!ok) overallPass = false;
    return ok;
};

const firebaseToolsRoots = [
    '/opt/homebrew/lib/node_modules/firebase-tools',
    '/usr/local/lib/node_modules/firebase-tools',
].filter(root => fs.existsSync(`${root}/package.json`));
if (firebaseToolsRoots.length === 0) throw new Error('Firebase CLI 로그인을 찾지 못했습니다.');
const require = createRequire(`${firebaseToolsRoots[0]}/package.json`);
const fbAuth = require('./lib/auth');
const fbAccount = fbAuth.getGlobalDefaultAccount();
if (!fbAccount?.tokens?.refresh_token) throw new Error('Firebase CLI 로그인 정보가 없습니다.');
const fbScopes = String(fbAccount.tokens.scope || 'https://www.googleapis.com/auth/cloud-platform')
    .split(/\s+/).filter(Boolean);
const fbAccess = await fbAuth.getAccessToken(fbAccount.tokens.refresh_token, fbScopes);
const adminAccessToken = fbAccess?.access_token || fbAccess;
record('관리자 인증 토큰 획득', Boolean(adminAccessToken));
if (!adminAccessToken) {
    console.log('VERIFY RESULT: FAIL');
    process.exit(1);
}

const firestoreRoot = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents`;
const adminHeaders = { Authorization: `Bearer ${adminAccessToken}`, 'Content-Type': 'application/json' };
const encodeDocPath = docPath => docPath.split('/').map(encodeURIComponent).join('/');

const encodeFirestoreValue = value => {
    if (value === null || value === undefined) return { nullValue: null };
    if (typeof value === 'boolean') return { booleanValue: value };
    if (typeof value === 'string') return { stringValue: value };
    if (typeof value === 'number') {
        return Number.isInteger(value) ? { integerValue: String(value) } : { doubleValue: value };
    }
    if (Array.isArray(value)) return { arrayValue: { values: value.map(encodeFirestoreValue) } };
    if (typeof value === 'object') return { mapValue: { fields: encodeFirestoreFields(value) } };
    throw new Error(`지원하지 않는 값 타입: ${typeof value}`);
};
const encodeFirestoreFields = data => Object.fromEntries(
    Object.entries(data).map(([key, value]) => [key, encodeFirestoreValue(value)]),
);
const decodeFirestoreValue = value => {
    if (!value || typeof value !== 'object') return undefined;
    if ('nullValue' in value) return null;
    if ('stringValue' in value) return value.stringValue;
    if ('integerValue' in value) return Number(value.integerValue);
    if ('doubleValue' in value) return Number(value.doubleValue);
    if ('booleanValue' in value) return value.booleanValue;
    if ('timestampValue' in value) return value.timestampValue;
    if ('arrayValue' in value) return (value.arrayValue?.values || []).map(decodeFirestoreValue);
    if ('mapValue' in value) return decodeFirestoreFields(value.mapValue?.fields || {});
    return undefined;
};
const decodeFirestoreFields = fields => Object.fromEntries(
    Object.entries(fields || {}).map(([key, value]) => [key, decodeFirestoreValue(value)]),
);

const getDocument = async docPath => {
    const response = await fetch(`${firestoreRoot}/${encodeDocPath(docPath)}`, { headers: adminHeaders });
    const body = await response.json().catch(() => ({}));
    return { response, body, data: decodeFirestoreFields(body.fields || {}) };
};

const listDocuments = async (parentPath, collectionId) => {
    const documents = [];
    let pageToken = '';
    do {
        const url = new URL(`${firestoreRoot}/${encodeDocPath(`${parentPath}/${collectionId}`)}`);
        url.searchParams.set('pageSize', '100');
        if (pageToken) url.searchParams.set('pageToken', pageToken);
        const response = await fetch(url, { headers: adminHeaders });
        const body = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(`${parentPath}/${collectionId} 목록 HTTP ${response.status}`);
        documents.push(...(Array.isArray(body.documents) ? body.documents : []));
        pageToken = typeof body.nextPageToken === 'string' ? body.nextPageToken : '';
    } while (pageToken);
    return documents;
};

const listCollectionIds = async docPath => {
    const ids = [];
    let pageToken = '';
    do {
        const response = await fetch(`${firestoreRoot}/${encodeDocPath(docPath)}:listCollectionIds`, {
            method: 'POST',
            headers: adminHeaders,
            body: JSON.stringify({ pageSize: 100, ...(pageToken ? { pageToken } : {}) }),
        });
        const body = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(`${docPath} 하위 컬렉션 조회 HTTP ${response.status}`);
        ids.push(...(Array.isArray(body.collectionIds) ? body.collectionIds : []));
        pageToken = typeof body.nextPageToken === 'string' ? body.nextPageToken : '';
    } while (pageToken);
    return ids;
};

const documentPathFromName = name => {
    const marker = '/documents/';
    const index = typeof name === 'string' ? name.indexOf(marker) : -1;
    return index >= 0 ? name.slice(index + marker.length) : null;
};

const deleteDocumentTree = async docPath => {
    let deletedChildren = 0;
    for (const collectionId of await listCollectionIds(docPath)) {
        for (const document of await listDocuments(docPath, collectionId)) {
            const childPath = documentPathFromName(document.name);
            if (!childPath || !childPath.startsWith(`${docPath}/${collectionId}/`)) {
                throw new Error(`예상하지 못한 하위 문서 경로: ${document.name}`);
            }
            deletedChildren += await deleteDocumentTree(childPath);
            const response = await fetch(`${firestoreRoot}/${encodeDocPath(childPath)}`, {
                method: 'DELETE', headers: adminHeaders,
            });
            if (!response.ok) throw new Error(`${childPath} 삭제 HTTP ${response.status}`);
            deletedChildren += 1;
        }
    }
    return deletedChildren;
};

// 실계정 보호 가드: users 문서, Auth UID, Auth 이메일 중 하나라도 존재하면 중단한다.
const existingUser = await getDocument(`users/${TEST_UID}`);
if (existingUser.response.status !== 404) {
    record('실계정 보호 가드 (users 문서)', false, `HTTP ${existingUser.response.status} - 중단`);
    console.log('VERIFY RESULT: FAIL');
    process.exit(1);
}
for (const [label, lookup] of [
    ['UID', { localId: [TEST_UID] }],
    ['이메일', { email: [PROBE_EMAIL] }],
]) {
    const lookupResponse = await fetch(
        `https://identitytoolkit.googleapis.com/v1/projects/${PROJECT_ID}/accounts:lookup`,
        { method: 'POST', headers: adminHeaders, body: JSON.stringify(lookup) },
    );
    const lookupBody = await lookupResponse.json().catch(() => ({}));
    if (!lookupResponse.ok || (Array.isArray(lookupBody.users) && lookupBody.users.length > 0)) {
        record(
            `실계정 보호 가드 (Auth ${label})`,
            false,
            lookupResponse.ok ? '이미 존재함 - 중단' : `HTTP ${lookupResponse.status} - 중단`,
        );
        console.log('VERIFY RESULT: FAIL');
        process.exit(1);
    }
}
record('실계정 보호 가드', true, 'users 문서·Auth UID·Auth 이메일 모두 없음');

let answerIndex;
let quizKey;
try {
    const indexPath = path.join(repoRoot, 'supabase/functions/platform-api/quiz-answer-index.json');
    const answerIndexJson = JSON.parse(fs.readFileSync(indexPath, 'utf8'));
    const candidate = Object.entries(answerIndexJson.questions || {}).find(([, question]) =>
        Array.isArray(question?.allowed?.sequential)
        && question.allowed.sequential.includes(CURRENT_DAY)
        && Number.isInteger(question.answerIndex)
        && question.answerIndex >= 0
        && question.answerIndex <= 3
    );
    if (!candidate) throw new Error(`sequential Day ${CURRENT_DAY}의 표준 퀴즈가 없습니다.`);
    [quizKey, { answerIndex }] = candidate;
    record('순차 일정 표준 퀴즈 선택', true, `${PROGRESS_KEY} quizKey=${quizKey}`);
} catch (error) {
    record('순차 일정 표준 퀴즈 선택', false, error instanceof Error ? error.message : String(error));
    console.log('VERIFY RESULT: FAIL');
    process.exit(1);
}

let authAccountCreated = false;
let usersDocCreated = false;
const probePassword = crypto.randomUUID();

const runProbe = async () => {
try {
    const createAccountResponse = await fetch(
        `https://identitytoolkit.googleapis.com/v1/projects/${PROJECT_ID}/accounts`,
        {
            method: 'POST',
            headers: adminHeaders,
            body: JSON.stringify({
                localId: TEST_UID,
                email: PROBE_EMAIL,
                password: probePassword,
                emailVerified: true,
            }),
        },
    );
    const createAccountBody = await createAccountResponse.json().catch(() => ({}));
    if (!createAccountResponse.ok || createAccountBody.localId !== TEST_UID) {
        record('임시 Auth 계정 생성', false, `HTTP ${createAccountResponse.status}`);
        return;
    }
    authAccountCreated = true;
    record('임시 Auth 계정 생성', true);

    const userDocFields = {
        uid: TEST_UID,
        email: PROBE_EMAIL,
        name: '순차퀴즈검증프로브',
        password: null,
        role: 'member',
        accountType: 'personal',
        planId: PLAN_ID,
        isDeleted: false,
        currentDay: CURRENT_DAY,
        readCount: READ_COUNT,
        dayOffset: DAY_OFFSET,
        readingEpoch: READING_EPOCH,
        quizProgress: {},
        quizAttempts: 0,
        quizSolved: false,
        quizSkipped: false,
        quizRewardAmount: 0,
        talent: 0,
    };
    const createUserUrl = new URL(`${firestoreRoot}/${encodeDocPath(`users/${TEST_UID}`)}`);
    createUserUrl.searchParams.set('currentDocument.exists', 'false');
    const createUserResponse = await fetch(createUserUrl, {
        method: 'PATCH',
        headers: adminHeaders,
        body: JSON.stringify({ fields: encodeFirestoreFields(userDocFields) }),
    });
    if (!createUserResponse.ok) {
        record('users 문서 생성', false, `HTTP ${createUserResponse.status}`);
        return;
    }
    usersDocCreated = true;
    record('users 문서 생성', true, `planId=${PLAN_ID} ${PROGRESS_KEY} dayOffset=${DAY_OFFSET}`);

    const firebaseSource = fs.readFileSync(path.join(repoRoot, 'src/utils/firebase.js'), 'utf8');
    const apiKeyMatch = /apiKey:\s*"([^"]+)"/.exec(firebaseSource);
    if (!apiKeyMatch) {
        record('ID 토큰 획득', false, 'firebase.js에서 apiKey를 찾지 못함');
        return;
    }
    const signInResponse = await fetch(
        `https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${apiKeyMatch[1]}`,
        {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email: PROBE_EMAIL, password: probePassword, returnSecureToken: true }),
        },
    );
    const signInBody = await signInResponse.json().catch(() => ({}));
    if (!signInResponse.ok || typeof signInBody.idToken !== 'string' || signInBody.localId !== TEST_UID) {
        record('ID 토큰 획득', false, `HTTP ${signInResponse.status}`);
        return;
    }
    record('ID 토큰 획득', true, 'localId 일치');

    const envSource = fs.readFileSync(path.join(repoRoot, '.env.local'), 'utf8');
    const apiUrlMatch = /^VITE_PLATFORM_API_URL=(.+)$/m.exec(envSource);
    if (!apiUrlMatch) {
        record('platform-api 호출', false, '.env.local에서 VITE_PLATFORM_API_URL을 찾지 못함');
        return;
    }
    const requestId = crypto.randomUUID();
    const platformResponse = await fetch(apiUrlMatch[1].trim(), {
        method: 'POST',
        headers: {
            Authorization: `Bearer ${signInBody.idToken}`,
            'Content-Type': 'application/json',
            Origin: PLATFORM_API_ORIGIN,
        },
        body: JSON.stringify({
            action: 'submitQuiz',
            requestId,
            progressKey: PROGRESS_KEY,
            quizKey,
            selectedIndex: answerIndex,
            attemptSlot: 1,
        }),
    });
    const platformBody = await platformResponse.json().catch(() => ({}));
    const resultStatus = platformBody.result?.status;
    // 방금 만든 빈 fixture이므로 첫 호출은 반드시 ready/1회/정답이어야 한다.
    // alreadyDone을 허용하면 잔존 원장이나 중복 호출 결함을 정상으로 오인할 수 있다.
    const safeResult = resultStatus === 'ready'
        && platformBody.result.attempts === 1
        && platformBody.result.quizKey === quizKey
        && platformBody.result.isCorrect === true
        && platformBody.result.entry?.quizKey === quizKey
        && platformBody.result.entry?.attempts === 1;
    const apiOk = platformResponse.status === 200
        && platformBody.ok === true
        && platformBody.action === 'submitQuiz'
        && platformBody.requestId === requestId
        && safeResult;
    record(
        'platform-api submitQuiz 호출',
        apiOk,
        `HTTP ${platformResponse.status} status=${resultStatus || '없음'}`,
    );

    const storedUser = await getDocument(`users/${TEST_UID}`);
    const storedProgress = storedUser.data.quizProgress?.[PROGRESS_KEY];
    const progressOk = storedUser.response.ok
        && storedProgress
        && storedProgress.quizKey === quizKey
        && storedProgress.attempts === 1
        && storedProgress.solved === true
        && storedProgress.skipped === false;
    record(
        'users quizProgress 저장 확인',
        Boolean(progressOk),
        progressOk ? `${PROGRESS_KEY} attempts=1 solved=true` : `HTTP ${storedUser.response.status} 또는 값 불일치`,
    );

    const activityDocuments = await listDocuments(`users/${TEST_UID}`, 'activityActions');
    const activityData = activityDocuments.map(document => decodeFirestoreFields(document.fields || {}));
    const ledgerOk = activityDocuments.length === 1
        && activityData[0].action === 'submitQuiz'
        && activityData[0].requestId === requestId;
    record('activityActions 원장 1건 확인', ledgerOk, `${activityDocuments.length}건`);

    const slotDocuments = await listDocuments(`users/${TEST_UID}`, 'quizAttemptSlots');
    const slotData = slotDocuments.map(document => decodeFirestoreFields(document.fields || {}));
    const slotOk = slotDocuments.length === 1
        && slotData[0].action === 'submitQuiz'
        && slotData[0].requestId === requestId;
    record('quizAttemptSlots slot 1건 확인', slotOk, `${slotDocuments.length}건`);
} finally {
    if (usersDocCreated) {
        try {
            const deletedChildren = await deleteDocumentTree(`users/${TEST_UID}`);
            record('정리: users 하위 문서 재귀 삭제', true, `${deletedChildren}건`);
        } catch (error) {
            record('정리: users 하위 문서 재귀 삭제', false, error instanceof Error ? error.message : String(error));
        }
        const deleteUserResponse = await fetch(`${firestoreRoot}/${encodeDocPath(`users/${TEST_UID}`)}`, {
            method: 'DELETE', headers: adminHeaders,
        }).catch(() => null);
        record('정리: users 문서 삭제', Boolean(deleteUserResponse?.ok), `HTTP ${deleteUserResponse?.status ?? 'N/A'}`);
    } else {
        record('정리: users 문서', true, '생성되지 않아 정리할 것 없음');
    }

    if (authAccountCreated) {
        const deleteAuthResponse = await fetch(
            `https://identitytoolkit.googleapis.com/v1/projects/${PROJECT_ID}/accounts:delete`,
            { method: 'POST', headers: adminHeaders, body: JSON.stringify({ localId: TEST_UID }) },
        ).catch(() => null);
        record('정리: 임시 Auth 계정 삭제', Boolean(deleteAuthResponse?.ok), `HTTP ${deleteAuthResponse?.status ?? 'N/A'}`);
    } else {
        record('정리: 임시 Auth 계정', true, '생성되지 않아 정리할 것 없음');
    }
}
};

await runProbe();
console.log(`VERIFY RESULT: ${overallPass ? 'PASS' : 'FAIL'}`);
process.exitCode = overallPass ? 0 : 1;
