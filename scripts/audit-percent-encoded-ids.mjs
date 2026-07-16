// 읽기 전용 감사 스크립트: Firestore 문서 ID에 잘못된 percent 인코딩(예: `kakao%3A123`)이
// 남아있는지 확인한다.
//
// 배경: supabase/functions/_shared/firestore.ts의 documentName()이 한때 commit 본문
// (update.name/delete)에도 encodeDocumentPath()(모든 세그먼트 encodeURIComponent)를 사용했다.
// commit 본문의 리소스 이름은 URL 디코딩 없이 리터럴 비교되므로, `kakao:<숫자>` 형식의
// 카카오 uid가 `kakao%3A<숫자>`라는 별개 문서로 저장됐을 가능성이 있다(2026-07-14 17:38 ~
// 2026-07-17 07:47, 커밋 dda1643에서 rawDocumentPath()로 수정됨).
//
// 이 스크립트는 어떤 쓰기도 하지 않는다. GET/list/query 요청만 사용한다.

import fs from 'node:fs';
import { createRequire } from 'node:module';

const PROJECT_ID = 'bible114-platform';

// ── 인증 (scripts/audit-t127-legacy-state.mjs와 동일한 방식: Firebase CLI 로그인 재사용) ──
const firebaseToolsRoots = [
    '/opt/homebrew/lib/node_modules/firebase-tools',
    '/usr/local/lib/node_modules/firebase-tools',
].filter(root => fs.existsSync(`${root}/package.json`));
if (firebaseToolsRoots.length === 0) {
    throw new Error('Firebase CLI 로그인을 찾지 못했습니다. `firebase login`을 먼저 실행하세요.');
}
const require = createRequire(`${firebaseToolsRoots[0]}/package.json`);
const auth = require('./lib/auth');
const account = auth.getGlobalDefaultAccount();
if (!account?.tokens?.refresh_token) {
    throw new Error('Firebase CLI 로그인 정보가 없습니다. `firebase login`을 먼저 실행하세요.');
}
const scopes = String(account.tokens.scope || 'https://www.googleapis.com/auth/cloud-platform')
    .split(/\s+/).filter(Boolean);
const access = await auth.getAccessToken(account.tokens.refresh_token, scopes);
const accessToken = access?.access_token || access;
if (!accessToken) {
    throw new Error('Firestore 접근 토큰 발급에 실패했습니다.');
}
const root = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents`;
const headers = { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' };

// ── 유틸 ──

// 문서 ID를 마스킹해 출력한다: 앞 10자 + '…' + 원문 길이. 이름/이메일 등 필드 값은 절대 출력하지 않는다.
const maskId = id => {
    const text = String(id ?? '');
    return `${text.slice(0, 10)}…(길이 ${text.length})`;
};
const docIdFromName = name => String(name || '').split('/').pop() || '';

// 컬렉션 문서 목록을 페이지네이션으로 전부 읽는다 (list documents, 읽기 전용).
// showMissing과 무관하게 name/createTime/updateTime 메타데이터가 포함된다.
// mask에 임의 필드명을 넣으면 400이 나므로 항상 존재하는 __name__만 지정해 응답을 최소화한다.
async function listDocuments(pathSuffix) {
    const documents = [];
    let pageToken = '';
    const seenTokens = new Set();
    do {
        const url = new URL(`${root}/${pathSuffix}`);
        url.searchParams.set('pageSize', '300');
        url.searchParams.append('mask.fieldPaths', '__name__');
        if (pageToken) url.searchParams.set('pageToken', pageToken);
        const response = await fetch(url, { headers });
        if (!response.ok) {
            throw new Error(`${pathSuffix} 목록 조회 실패: HTTP ${response.status}`);
        }
        const body = await response.json();
        documents.push(...(body.documents || []));
        const nextToken = body.nextPageToken || '';
        if (nextToken) {
            if (seenTokens.has(nextToken)) {
                throw new Error(`${pathSuffix} 목록 조회 중 pageToken이 반복되어 무한루프 방지를 위해 중단합니다.`);
            }
            seenTokens.add(nextToken);
        }
        pageToken = nextToken;
    } while (pageToken);
    return documents;
}

// roster는 churches/{orgId}/roster/{uid} 형태의 서브컬렉션이므로, 모든 교회를 순회하지 않고
// collectionGroup 쿼리(allDescendants)로 한 번에 훑는다. select를 문서 이름(__name__)만으로
// 제한해 실제 필드 값은 응답에 담기지 않도록 한다 (읽기 전용, keys-only 조회).
async function listCollectionGroupDocumentNames(collectionId) {
    const response = await fetch(`${root}:runQuery`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
            structuredQuery: {
                from: [{ collectionId, allDescendants: true }],
                select: { fields: [{ fieldPath: '__name__' }] },
            },
        }),
    });
    if (!response.ok) {
        throw new Error(`${collectionId} collectionGroup 조회 실패: HTTP ${response.status}`);
    }
    const rows = await response.json();
    return rows.flatMap(row => (row.document ? [row.document] : []));
}

function summarize(label, documents, idExtractor) {
    let percentCount = 0;
    let colonCount = 0;
    const maskedPercentIds = [];
    for (const document of documents) {
        const id = idExtractor(document);
        if (id.includes('%')) {
            percentCount += 1;
            maskedPercentIds.push({ maskedId: maskId(id), createTime: document.createTime || null, __rawIdForFollowup: id });
        } else if (id.includes(':')) {
            colonCount += 1;
        }
    }
    return {
        label,
        total: documents.length,
        percentEncodedIdCount: percentCount,
        colonIdCountForReference: colonCount,
        maskedPercentIds: maskedPercentIds.map(({ maskedId, createTime }) => ({ maskedId, createTime })),
        __followupIds: maskedPercentIds.map(entry => entry.__rawIdForFollowup),
    };
}

// ── 스캔 ──

console.log(`[감사 시작] 프로젝트: ${PROJECT_ID}, 시각: ${new Date().toISOString()}`);

const userDocuments = await listDocuments('users');
const churchDocuments = await listDocuments('churches');
const kakaoLinkDocuments = await listDocuments('kakaoLinks');
const rosterDocuments = await listCollectionGroupDocumentNames('roster');

const usersSummary = summarize('users', userDocuments, doc => docIdFromName(doc.name));
const churchesSummary = summarize('churches', churchDocuments, doc => docIdFromName(doc.name));
const kakaoLinksSummary = summarize('kakaoLinks', kakaoLinkDocuments, doc => docIdFromName(doc.name));
const rosterSummary = summarize('churches/*/roster', rosterDocuments, doc => docIdFromName(doc.name));

// users 문서 ID에 %가 포함된 경우, 해당 문서의 createTime(이미 조회됨)과
// 하위 activityActions 서브컬렉션 문서 수를 추가로 확인한다 (읽기 전용).
const percentEncodedUserDetails = [];
for (const userId of usersSummary.__followupIds) {
    const subPath = `users/${encodeURIComponent(userId)}/activityActions`;
    const activityActionDocuments = await listDocuments(subPath);
    percentEncodedUserDetails.push({
        maskedId: maskId(userId),
        createTime: (userDocuments.find(doc => docIdFromName(doc.name) === userId) || {}).createTime || null,
        activityActionsCount: activityActionDocuments.length,
    });
}

const report = {
    generatedAt: new Date().toISOString(),
    projectId: PROJECT_ID,
    collections: {
        users: {
            total: usersSummary.total,
            percentEncodedIdCount: usersSummary.percentEncodedIdCount,
            colonIdCountForReference: usersSummary.colonIdCountForReference,
            maskedPercentIds: usersSummary.maskedPercentIds,
            percentEncodedUserDetails,
        },
        churches: {
            total: churchesSummary.total,
            percentEncodedIdCount: churchesSummary.percentEncodedIdCount,
            colonIdCountForReference: churchesSummary.colonIdCountForReference,
            maskedPercentIds: churchesSummary.maskedPercentIds,
        },
        'churches/*/roster': {
            total: rosterSummary.total,
            percentEncodedIdCount: rosterSummary.percentEncodedIdCount,
            colonIdCountForReference: rosterSummary.colonIdCountForReference,
            maskedPercentIds: rosterSummary.maskedPercentIds,
        },
        kakaoLinks: {
            total: kakaoLinksSummary.total,
            percentEncodedIdCount: kakaoLinksSummary.percentEncodedIdCount,
            colonIdCountForReference: kakaoLinksSummary.colonIdCountForReference,
            maskedPercentIds: kakaoLinksSummary.maskedPercentIds,
        },
    },
};

console.log(JSON.stringify(report, null, 2));

const totalFound = usersSummary.percentEncodedIdCount
    + churchesSummary.percentEncodedIdCount
    + rosterSummary.percentEncodedIdCount
    + kakaoLinksSummary.percentEncodedIdCount;

console.log(totalFound === 0 ? 'AUDIT RESULT: CLEAN' : `AUDIT RESULT: FOUND ${totalFound}`);
