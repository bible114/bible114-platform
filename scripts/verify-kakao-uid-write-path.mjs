// 일회용 검증 스크립트: 배포된 platform-api(v10)가 콜론이 든 uid(`kakao:123`)로
// 실제 Firestore 쓰기에 성공하는지 운영 환경에서 확인한다.
//
// 배경(supabase/functions/_shared/firestore.ts):
//   - `updateWrite`가 만드는 commit 본문의 `update.name`은 `documentName()` →
//     `rawDocumentPath()`를 거치며, 이 경로는 URL 인코딩을 하지 않는다(세그먼트를
//     그대로 join). Firestore commit API는 이 이름을 문자 그대로 비교하므로
//     `kakao:123` uid도 정상적으로 `users/kakao:123` 문서를 가리킨다.
//   - 반대로 `getDocument`/`listCollectionDocuments` 등 REST GET 경로는
//     `encodeDocumentPath()`(세그먼트별 encodeURIComponent)를 쓴다 — 서버가 URL을
//     디코딩해 주므로 원문 uid에 도달한다.
//   - v10 이전 버그: commit 쪽에서도 encodeURIComponent를 적용해 `update.name`이
//     `.../users/kakao%3A123`이 되었고, Firestore는 이를 리터럴 `%` 문자를 포함한
//     별개 문서 ID로 취급했다. 그 결과 `currentDocument.exists` 전제조건이 항상
//     어긋나 콜론 uid의 모든 서버 쓰기가 실패했다.
//
// 이 스크립트는:
//   1) 관리자(Firebase CLI 로그인) 자격으로 Firestore/Identity Toolkit REST를
//      직접 호출해 임시 프로브 계정을 만들고,
//   2) 배포된 platform-api의 `normalizeLegacyReadingPosition` 액션을 실제
//      idToken으로 호출해 커밋이 성공하는지 관찰하고,
//   3) 잘못된 인코딩(`users/kakao%253A...`, 리터럴 `%` 포함) 문서가 생기지
//      않았는지 확인한 뒤,
//   4) 만든 것을 전부 정리한다.
//
// 실행 전 확인: 이 uid(`kakao:19999999999999999998`)와 이메일은 테스트 전용이며,
// 스크립트 시작 시 실계정이 아님을 이중으로 확인한 뒤에만 진행한다.

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const PROJECT_ID = 'bible114-platform';
const TEST_UID = 'kakao:19999999999999999998';
const PROBE_EMAIL = 'kakao-uid-probe@bible114-ops-test.invalid';
const PLATFORM_API_ORIGIN = 'https://www.bible114.net';
// v10 이전 버그가 재발하면 생겼을 리터럴 `%` 포함 문서 ID (콜론을 %3A 문자열로
// 치환한 것이지, URL 인코딩이 아니다).
const MALFORMED_LITERAL_TEST_ID = TEST_UID.replace(':', '%3A');

const repoRoot = fileURLToPath(new URL('..', import.meta.url));

let overallPass = true;
const record = (label, ok, detail = '') => {
    console.log(`${ok ? 'PASS' : 'FAIL'} - ${label}${detail ? ` (${detail})` : ''}`);
    if (!ok) overallPass = false;
    return ok;
};

// ---------------------------------------------------------------------------
// 1. 관리자 인증 (scripts/audit-t127-legacy-state.mjs 첫 ~40줄과 동일한 방식)
// ---------------------------------------------------------------------------
const firebaseToolsRoots = [
    '/opt/homebrew/lib/node_modules/firebase-tools',
    '/usr/local/lib/node_modules/firebase-tools',
].filter(root => fs.existsSync(`${root}/package.json`));
if (firebaseToolsRoots.length === 0) {
    throw new Error('Firebase CLI 로그인을 찾지 못했습니다.');
}
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
const encodeDocPath = (docPath) => docPath.split('/').map(encodeURIComponent).join('/');

// ---- Firestore 값 인코딩/디코딩 (supabase/functions/_shared/firestore.ts 미러) ----
const encodeFirestoreValue = (value) => {
    if (value === null || value === undefined) return { nullValue: null };
    if (typeof value === 'boolean') return { booleanValue: value };
    if (typeof value === 'string') return { stringValue: value };
    if (typeof value === 'number') {
        return Number.isInteger(value) ? { integerValue: String(value) } : { doubleValue: value };
    }
    throw new Error(`지원하지 않는 값 타입: ${typeof value}`);
};
const encodeFirestoreFields = (data) => Object.fromEntries(
    Object.entries(data).map(([key, value]) => [key, encodeFirestoreValue(value)]),
);
const decodeFirestoreValue = (value) => {
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
const decodeFirestoreFields = (fields) => Object.fromEntries(
    Object.entries(fields || {}).map(([key, value]) => [key, decodeFirestoreValue(value)]),
);

// ---------------------------------------------------------------------------
// 2. 실계정 보호 가드: users 문서와 Auth 계정이 이미 존재하면 즉시 중단
// ---------------------------------------------------------------------------
const existingUserDocResponse = await fetch(
    `${firestoreRoot}/${encodeDocPath(`users/${TEST_UID}`)}`,
    { headers: adminHeaders },
);
if (existingUserDocResponse.status === 200) {
    record('실계정 보호 가드 (users 문서)', false, '이미 존재함 - 실계정 보호를 위해 중단');
    console.log('VERIFY RESULT: FAIL');
    process.exit(1);
}
if (existingUserDocResponse.status !== 404) {
    record('실계정 보호 가드 (users 문서)', false, `조회 실패 HTTP ${existingUserDocResponse.status}`);
    console.log('VERIFY RESULT: FAIL');
    process.exit(1);
}
const lookupResponse = await fetch(
    `https://identitytoolkit.googleapis.com/v1/projects/${PROJECT_ID}/accounts:lookup`,
    { method: 'POST', headers: adminHeaders, body: JSON.stringify({ localId: [TEST_UID] }) },
);
const lookupBody = await lookupResponse.json().catch(() => ({}));
if (!lookupResponse.ok) {
    record('실계정 보호 가드 (Auth 계정)', false, `조회 실패 HTTP ${lookupResponse.status}`);
    console.log('VERIFY RESULT: FAIL');
    process.exit(1);
}
if (Array.isArray(lookupBody.users) && lookupBody.users.length > 0) {
    record('실계정 보호 가드 (Auth 계정)', false, '이미 존재함 - 실계정 보호를 위해 중단');
    console.log('VERIFY RESULT: FAIL');
    process.exit(1);
}
record('실계정 보호 가드', true, 'users 문서·Auth 계정 모두 없음 확인');

// ---------------------------------------------------------------------------
// 3~7. 임시 계정 생성 → platform-api 호출 → 검증 (finally에서 반드시 정리)
// ---------------------------------------------------------------------------
let authAccountCreated = false;
let usersDocCreated = false;
const probePassword = crypto.randomUUID();

// try/finally 안에서 실패 시 조기 종료(return)해야 하므로 함수로 감싼다
// (모듈 최상위에서는 return을 쓸 수 없다).
const runProbe = async () => {
try {
    // ---- 3. 임시 Auth 계정 생성 ----
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

    // ---- 4. users 문서 생성 ----
    // normalizeLegacyReadingPositionService.ts의 normalizeUser()가 실제로 보는
    // 필드는 uid(생략 또는 일치)·isDeleted·currentDay·readCount뿐이다
    // (177~193행). role/accountType/name/password는 이 액션 로직에서 검사하지
    // 않지만(index.ts 1270~1282행에서 일반 사용자 문서 로드보다 먼저 분기),
    // 실제 users 문서와 최대한 비슷한 형태로 두어 검증의 대표성을 높인다.
    // currentDay를 365 초과(레거시 값)로 두면 executeNormalization()의
    // `userNeedsNormalization = user.currentDay > 365` 분기(371행)가 참이 되어
    // users 문서 업데이트 + activityActions 원장 문서까지 한 트랜잭션에
    // 커밋된다(406~442행). roster는 만들지 않으며, collectionGroup 쿼리가
    // 빈 배열을 반환해도 parseRosterTalentWallets는 `{ ok: true, wallets: [] }`
    // 를 돌려주므로(talentProgramCore.ts 108~112행) 커밋을 막지 않는다.
    const legacyCurrentDay = 400;
    const legacyReadCount = 2;
    // normalizedResult()의 계산(294~296행)을 미리 손으로 재현한 기대값:
    //   extraRounds = floor((400-1)/365) = 1
    //   nextDay     = ((400-1) % 365) + 1 = 35
    //   nextReadCount = 2 + 1 = 3
    const expectedNormalizedDay = 35;
    const expectedNormalizedReadCount = 3;

    const userDocFields = {
        uid: TEST_UID,
        name: '검증프로브',
        password: null,
        role: 'member',
        accountType: 'personal',
        isDeleted: false,
        currentDay: legacyCurrentDay,
        readCount: legacyReadCount,
    };
    const createUserDocUrl = new URL(`${firestoreRoot}/${encodeDocPath(`users/${TEST_UID}`)}`);
    createUserDocUrl.searchParams.set('currentDocument.exists', 'false');
    const createUserDocResponse = await fetch(createUserDocUrl, {
        method: 'PATCH',
        headers: adminHeaders,
        body: JSON.stringify({ fields: encodeFirestoreFields(userDocFields) }),
    });
    if (!createUserDocResponse.ok) {
        record('users 문서 생성', false, `HTTP ${createUserDocResponse.status}`);
        return;
    }
    usersDocCreated = true;
    record('users 문서 생성', true, `currentDay=${legacyCurrentDay} readCount=${legacyReadCount} (레거시 상태)`);

    // ---- 5. ID 토큰 획득 (src/utils/firebase.js에서 웹 apiKey를 읽어 사용) ----
    const firebaseJsSource = fs.readFileSync(path.join(repoRoot, 'src/utils/firebase.js'), 'utf8');
    const apiKeyMatch = /apiKey:\s*"([^"]+)"/.exec(firebaseJsSource);
    if (!apiKeyMatch) {
        record('ID 토큰 획득', false, 'firebase.js에서 apiKey를 찾지 못함');
        return;
    }
    const webApiKey = apiKeyMatch[1];
    const signInResponse = await fetch(
        `https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${webApiKey}`,
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
    record('ID 토큰 획득', true, 'localId가 임시 uid와 일치');

    // ---- 6. 배포된 platform-api 호출 ----
    // 요청 형식은 src/utils/platformApi.js의 postOnce/callPlatformApi를 그대로
    // 따른다: POST body = { action, requestId, ...payload } (235~285행,
    // 306~349행). normalizeLegacyReadingPosition의 payload는 항상 빈 객체다
    // (1494~1503행) — uid/진도 값은 서버가 인증 사용자 문서에서만 읽는다.
    const envLocalSource = fs.readFileSync(path.join(repoRoot, '.env.local'), 'utf8');
    const platformApiUrlMatch = /^VITE_PLATFORM_API_URL=(.+)$/m.exec(envLocalSource);
    if (!platformApiUrlMatch) {
        record('platform-api 호출', false, '.env.local에서 VITE_PLATFORM_API_URL을 찾지 못함');
        return;
    }
    const platformApiUrl = platformApiUrlMatch[1].trim();
    const requestId = crypto.randomUUID();

    const platformApiResponse = await fetch(platformApiUrl, {
        method: 'POST',
        headers: {
            Authorization: `Bearer ${signInBody.idToken}`,
            'Content-Type': 'application/json',
            Origin: PLATFORM_API_ORIGIN,
        },
        body: JSON.stringify({ action: 'normalizeLegacyReadingPosition', requestId }),
    });
    const platformApiBody = await platformApiResponse.json().catch(() => ({}));
    const platformApiOk = platformApiResponse.status === 200
        && platformApiBody.ok === true
        && platformApiBody.committed === true
        && platformApiBody.alreadyCompleted === false
        && platformApiBody.result?.status === 'normalized'
        && platformApiBody.result?.currentDay === expectedNormalizedDay
        && platformApiBody.result?.readCount === expectedNormalizedReadCount;
    record(
        'platform-api normalizeLegacyReadingPosition 호출',
        platformApiOk,
        platformApiOk
            ? 'committed=true, 보정값 일치'
            : `HTTP ${platformApiResponse.status} committed=${platformApiBody.committed}`,
    );

    // ---- 7. 사후 검증 ----
    const verifyUserDocResponse = await fetch(
        `${firestoreRoot}/${encodeDocPath(`users/${TEST_UID}`)}`,
        { headers: adminHeaders },
    );
    const verifyUserDocBody = await verifyUserDocResponse.json().catch(() => ({}));
    const verifyUserDocFields = decodeFirestoreFields(verifyUserDocBody.fields || {});
    const userDocNormalized = verifyUserDocResponse.ok
        && verifyUserDocFields.currentDay === expectedNormalizedDay
        && verifyUserDocFields.readCount === expectedNormalizedReadCount;
    record(
        'users 문서 보정 결과 확인',
        userDocNormalized,
        userDocNormalized
            ? `currentDay=${expectedNormalizedDay} readCount=${expectedNormalizedReadCount}`
            : 'HTTP 실패 또는 값 불일치',
    );

    const ledgerDocResponse = await fetch(
        `${firestoreRoot}/${encodeDocPath(`users/${TEST_UID}/activityActions/${requestId}`)}`,
        { headers: adminHeaders },
    );
    record('activityActions 원장 문서 존재 확인', ledgerDocResponse.status === 200, `HTTP ${ledgerDocResponse.status}`);

    // v10 이전 버그가 재발했다면 리터럴 `%`가 포함된 별개 문서가 생겼을 것이다.
    const malformedDocResponse = await fetch(
        `${firestoreRoot}/${encodeDocPath(`users/${MALFORMED_LITERAL_TEST_ID}`)}`,
        { headers: adminHeaders },
    );
    record(
        '잘못된 인코딩 문서(리터럴 % 포함) 없음 확인',
        malformedDocResponse.status === 404,
        `HTTP ${malformedDocResponse.status}`,
    );
} finally {
    // -------------------------------------------------------------------
    // 8. 정리: 만든 것을 전부 되돌린다. 각 단계 성공 여부를 개별 출력한다.
    // -------------------------------------------------------------------
    if (usersDocCreated) {
        const activityActionsPrefix =
            `projects/${PROJECT_ID}/databases/(default)/documents/users/${TEST_UID}/activityActions/`;
        const listResponse = await fetch(
            `${firestoreRoot}/${encodeDocPath(`users/${TEST_UID}/activityActions`)}`,
            { headers: adminHeaders },
        ).catch(() => null);
        const listBody = listResponse ? await listResponse.json().catch(() => ({})) : {};
        const activityActionDocs = Array.isArray(listBody.documents) ? listBody.documents : [];
        let ledgerCleanupOk = listResponse ? listResponse.ok : false;
        for (const document of activityActionDocs) {
            const docId = typeof document.name === 'string' && document.name.startsWith(activityActionsPrefix)
                ? document.name.slice(activityActionsPrefix.length)
                : null;
            if (!docId) { ledgerCleanupOk = false; continue; }
            const deleteResponse = await fetch(
                `${firestoreRoot}/${encodeDocPath(`users/${TEST_UID}/activityActions/${docId}`)}`,
                { method: 'DELETE', headers: adminHeaders },
            ).catch(() => null);
            if (!deleteResponse || !deleteResponse.ok) ledgerCleanupOk = false;
        }
        record('정리: activityActions 문서 삭제', ledgerCleanupOk, `${activityActionDocs.length}건 대상`);

        const deleteUserDocResponse = await fetch(
            `${firestoreRoot}/${encodeDocPath(`users/${TEST_UID}`)}`,
            { method: 'DELETE', headers: adminHeaders },
        ).catch(() => null);
        record('정리: users 문서 삭제', Boolean(deleteUserDocResponse?.ok), `HTTP ${deleteUserDocResponse?.status ?? 'N/A'}`);
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
