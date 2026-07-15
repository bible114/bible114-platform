import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = path => fs.readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const findBlock = (source, startNeedle, endNeedle, label) => {
    const start = source.indexOf(startNeedle);
    assert.ok(start >= 0, `${label} 시작점을 찾을 수 없다: ${startNeedle}`);
    const end = source.indexOf(endNeedle, start + startNeedle.length);
    assert.ok(end > start, `${label} 끝점을 찾을 수 없다: ${endNeedle}`);
    return source.slice(start, end);
};

const fixturePath = 'scripts/fixtures/daily-video-contract.json';
const fixture = JSON.parse(read(fixturePath));
assert.equal(fixture.schemaVersion, 1, '매일 영상 공유 fixture schemaVersion이 달라졌다.');

const {
    getDailyVideoFillState,
    selectDailyVideoCandidate,
    titleMatchesDate,
} = await import('../src/utils/dailyVideoPolicy.js');
const {
    mapToStandardLabel,
    parseAndMapChapters,
    parseChapters,
} = await import('../src/utils/dailyVideoChapters.js');

for (const testCase of fixture.titleCases) {
    assert.equal(
        titleMatchesDate(testCase.title, testCase.dateKey),
        testCase.expected,
        `브라우저 제목 날짜 계약: ${testCase.name}`,
    );
}

for (const testCase of fixture.fillCases) {
    assert.deepEqual(
        getDailyVideoFillState(testCase.configuredModeKeys, testCase.payload),
        testCase.expected,
        `브라우저 설정 모드 fill 계약: ${testCase.name}`,
    );
}

for (const testCase of fixture.candidateCases) {
    const result = selectDailyVideoCandidate(testCase.items, {
        targetDateKey: testCase.targetDateKey,
        now: testCase.now,
        matchesDate: titleMatchesDate,
    });
    assert.deepEqual(
        {
            candidateId: result.candidate?.it?.id ?? null,
            publishedAt: result.candidate?.publishedAt ?? null,
            title: result.candidate?.title ?? null,
            matchedDate: result.matchedDate,
            pending: result.pending,
            stale: result.stale,
        },
        testCase.expected,
        `브라우저 게시 후보 계약: ${testCase.name}`,
    );
}

for (const testCase of fixture.labelCases) {
    assert.equal(
        mapToStandardLabel(testCase.label),
        testCase.expected,
        `브라우저 챕터 라벨 계약: ${testCase.name}`,
    );
}

for (const testCase of fixture.chapterCases) {
    assert.deepEqual(
        parseChapters(testCase.description),
        testCase.expectedParsed,
        `브라우저 원본 챕터 계약: ${testCase.name}`,
    );
    assert.deepEqual(
        parseAndMapChapters(testCase.description),
        testCase.expectedMapped,
        `브라우저 표준 챕터 계약: ${testCase.name}`,
    );
}

const serverCore = read('supabase/functions/platform-api/core.ts');
const serverCoreTest = read('supabase/functions/platform-api/core_test.ts');
const dailyVideoCoreTest = read('supabase/functions/platform-api/dailyVideoCore_test.ts');

assert.match(
    serverCore,
    /export const RESOLVE_DAILY_VIDEO_ACTION = ["']resolveDailyVideo["'] as const;/,
    'resolveDailyVideo action 상수가 필요하다.',
);
assert.match(
    serverCore,
    /action:\s*typeof RESOLVE_DAILY_VIDEO_ACTION;\s*requestId:\s*string;/,
    'resolveDailyVideo 요청 타입은 requestId만 가져야 한다.',
);
const parserBranch = findBlock(
    serverCore,
    'if (action === RESOLVE_DAILY_VIDEO_ACTION)',
    '\n  if (action ===',
    'resolveDailyVideo parser 분기',
);
assert.match(
    parserBranch,
    /new Set\(\[["']action["'], ["']requestId["']\]\)/,
    'resolveDailyVideo 허용 입력은 action과 requestId뿐이어야 한다.',
);
assert.match(
    parserBranch,
    /Object\.keys\(body\)\.some\(\(key\) => !allowedKeys\.has\(key\)\)/,
    'resolveDailyVideo는 추가 클라이언트 입력을 거부해야 한다.',
);
assert.match(
    parserBranch,
    /return \{ action, requestId \};/,
    'resolveDailyVideo parser는 정규화한 두 필드만 반환해야 한다.',
);
assert.match(
    serverCoreTest,
    /매일 영상 resolve는 requestId 외 클라이언트 입력을 거부한다/,
    'core_test에 requestId-only 회귀 테스트가 필요하다.',
);

assert.match(
    dailyVideoCoreTest,
    /scripts\/fixtures\/daily-video-contract\.json/,
    '서버 순수 테스트도 브라우저와 같은 fixture를 읽어야 한다.',
);
for (const fixtureGroup of ['titleCases', 'fillCases', 'candidateCases', 'labelCases', 'chapterCases']) {
    assert.match(
        dailyVideoCoreTest,
        new RegExp(`fixture\\.${fixtureGroup}`),
        `서버 순수 테스트가 ${fixtureGroup} 공유 fixture를 실행해야 한다.`,
    );
}

// 아래 서버 연결 계약은 구현 세부 전체가 아니라 보안 경계의 순서와
// 해당 분기 안에서의 사용 여부를 고정한다.
const serverIndex = read('supabase/functions/platform-api/index.ts');
const dailyVideoResolve = read('supabase/functions/platform-api/dailyVideoResolve.ts');
const dailyVideoResolveTest = read('supabase/functions/platform-api/dailyVideoResolve_test.ts');
const firestoreRules = read('firestore.rules');

const resolveBranchStart = serverIndex.indexOf('if (parsed.action === "resolveDailyVideo")');
assert.ok(resolveBranchStart >= 0, 'index.ts에 resolveDailyVideo 전용 분기가 필요하다.');
const regularAuthStart = serverIndex.indexOf('verifyFirebaseIdToken(idToken, { allowAnonymous: false })');
assert.ok(
    regularAuthStart > resolveBranchStart,
    'resolveDailyVideo 익명 허용 분기는 일반 실사용자 인증보다 먼저 실행돼야 한다.',
);
const resolveIndexBranch = serverIndex.slice(resolveBranchStart, regularAuthStart);
assert.match(resolveIndexBranch, /getBearerToken\(request\)/, 'resolveDailyVideo도 Firebase 토큰을 요구해야 한다.');
assert.match(
    resolveIndexBranch,
    /verifyFirebaseIdToken\([^;]*\{ allowAnonymous: true \}\)/,
    'resolveDailyVideo 전용 분기만 익명 Firebase 사용자를 허용해야 한다.',
);
assert.match(resolveIndexBranch, /getServiceAccessToken\(\)/, 'resolveDailyVideo는 서비스 계정으로 Firestore를 처리해야 한다.');
assert.match(resolveIndexBranch, /resolveDailyVideo\(/, '전용 분기가 서버 resolver를 호출해야 한다.');
assert.equal(
    (serverIndex.match(/allowAnonymous: true/g) || []).length,
    1,
    '익명 허용 인증 분기는 resolveDailyVideo 한 곳뿐이어야 한다.',
);

assert.match(
    dailyVideoResolve,
    /getServiceDateKst\(/,
    'resolve 기준일은 공용 KST 03시 서비스 날짜를 사용해야 한다.',
);

const resolveResultType = findBlock(
    dailyVideoResolve,
    'export type DailyVideoResolveResult = {',
    '\n};',
    '공개 resolve 응답 타입',
);
const publicResultFields = Array.from(
    resolveResultType.matchAll(/^\s{2}([A-Za-z][A-Za-z0-9]*)(?:\?)?:/gm),
    match => match[1],
);
assert.deepEqual(
    publicResultFields,
    ['serviceDate', 'video', 'transient', 'pending', 'retryAfterMs'],
    'resolve 공개 결과는 허용된 최소 필드만 선언해야 한다.',
);
assert.doesNotMatch(
    resolveResultType,
    /apiKey|playlistId|config(?:uration)?|(?:daily|config|job)Path|lease(?:Owner|ExpiresAt)?/i,
    'resolve 공개 결과 타입에 키·설정·내부 경로·lease 상태를 노출하면 안 된다.',
);
assert.match(
    dailyVideoResolve,
    /export const resolveDailyVideo\s*=\s*async[\s\S]*Promise<DailyVideoResolveResult>/,
    '공개 resolver 반환형은 최소 응답 타입으로 고정해야 한다.',
);
assert.doesNotMatch(
    resolveIndexBranch,
    /apiKey|playlistId|config(?:uration)?|(?:daily|config|job)Path|lease(?:Owner|ExpiresAt)?/i,
    'index 응답 분기에서 키·설정·내부 경로·lease 상태를 직접 섞으면 안 된다.',
);

const acquireLeaseBlock = findBlock(
    dailyVideoResolve,
    'const acquireLease = async (',
    '\nconst mergeVideoPayloads',
    'lease 획득 함수',
);
for (const pathContract of [
    /const dailyPath = `dailyVideos\/\$\{serviceDate\}`;/,
    /const configPath = ["']settings\/videoAutoConfig["'];/,
    /const jobPath = `dailyVideoJobs\/\$\{serviceDate\}`;/,
]) {
    assert.match(acquireLeaseBlock, pathContract, 'resolve가 기준일의 영상·설정·job 경로만 사용해야 한다.');
}
assert.match(acquireLeaseBlock, /dependencies\.beginTransaction\(/, 'lease 획득은 transaction에서 시작해야 한다.');
assert.match(
    acquireLeaseBlock,
    /const \[dailyDocument, configDocument, jobDocument\] = await Promise\.all\(\[[\s\S]*dailyPath,[\s\S]*\{ transaction \}[\s\S]*configPath,[\s\S]*\{ transaction \}[\s\S]*jobPath,[\s\S]*\{ transaction \}/,
    '영상·설정·job은 같은 transaction snapshot에서 읽어야 한다.',
);
const leaseDecisionStart = acquireLeaseBlock.indexOf('const leaseDecision = buildDailyVideoLease(');
const leaseOwnerWriteStart = acquireLeaseBlock.indexOf('leaseOwner: requestId', leaseDecisionStart);
const leaseCommitStart = acquireLeaseBlock.indexOf('await dependencies.commitWrites(', leaseDecisionStart);
assert.ok(
    leaseDecisionStart >= 0 && leaseCommitStart > leaseDecisionStart && leaseOwnerWriteStart > leaseCommitStart,
    'lease 판정 뒤 requestId 소유자와 설정 fence를 같은 transaction으로 기록해야 한다.',
);
assert.match(
    acquireLeaseBlock.slice(leaseDecisionStart, leaseOwnerWriteStart + 500),
    /configUpdateTime,[\s\S]*\{ transaction \}/,
    'lease에는 설정 updateTime fence가 포함되고 transaction으로 commit되어야 한다.',
);
assert.match(
    acquireLeaseBlock,
    /dependencies\.updateWrite\(service\.projectId, jobPath,[\s\S]*\{ exists: Boolean\(jobDocument\) \}\)/,
    'dailyVideoJobs lease는 서비스 project 쓰기로만 갱신해야 한다.',
);

const finalizeLeaseBlock = findBlock(
    dailyVideoResolve,
    'const finalizeLease = async (',
    '\nexport const resolveDailyVideo',
    'lease 완료 함수',
);
assert.match(finalizeLeaseBlock, /dependencies\.beginTransaction\(/, 'lease 완료도 새 transaction에서 재검증해야 한다.');
assert.match(
    finalizeLeaseBlock,
    /const ownsLease = jobDocument\?\.data\.leaseOwner === requestId &&[\s\S]*jobDocument\.data\.configUpdateTime === acquired\.configUpdateTime/,
    '저장 직전에 requestId lease 소유권과 획득 당시 설정 버전을 모두 확인해야 한다.',
);
assert.match(
    finalizeLeaseBlock,
    /jobDocument\.data\.attemptCount === acquired\.attemptCount/,
    '같은 requestId가 lease를 재획득해도 이전 worker가 새 세대를 소유한 것으로 오인하면 안 된다.',
);
assert.match(
    finalizeLeaseBlock,
    /const configUnchanged = \(configDocument\?\.updateTime \|\| null\) ===[\s\S]*configSignature\(config\) === configSignature\(acquired\.config\)/,
    '설정 문서 updateTime과 정규화 설정 내용이 모두 같아야 한다.',
);
const ownershipFenceStart = finalizeLeaseBlock.indexOf('if (!ownsLease || !configUnchanged)');
const fullReadyStart = finalizeLeaseBlock.indexOf(
    'if (getDailyVideoFillState(configuredModes, combined).allReady)',
    ownershipFenceStart,
);
const dailyWriteStart = finalizeLeaseBlock.indexOf(
    'dependencies.updateWrite(service.projectId, dailyPath',
    fullReadyStart,
);
const partialFailureStart = finalizeLeaseBlock.indexOf(
    'const failure = buildDailyVideoFailureState(',
    fullReadyStart,
);
assert.ok(
    ownershipFenceStart >= 0 && fullReadyStart > ownershipFenceStart &&
        dailyWriteStart > fullReadyStart && partialFailureStart > dailyWriteStart,
    'lease/config fence와 모든 설정 모드 준비 검사를 통과한 뒤에만 dailyVideos를 저장해야 한다.',
);
assert.equal(
    (finalizeLeaseBlock.match(/dependencies\.updateWrite\(service\.projectId, dailyPath/g) || []).length,
    1,
    'dailyVideos 자동 저장은 full-ready 분기 한 곳에만 있어야 한다.',
);
assert.doesNotMatch(
    finalizeLeaseBlock.slice(partialFailureStart),
    /updateWrite\(service\.projectId, dailyPath/,
    '부분 성공·실패 분기에서 dailyVideos를 저장하면 안 된다.',
);
assert.match(
    finalizeLeaseBlock.slice(fullReadyStart, partialFailureStart),
    /dependencies\.deleteWrite\(service\.projectId, jobPath, true\)[\s\S]*dependencies\.commitWrites\([\s\S]*\{ transaction \}/,
    '완성 영상 저장과 job 제거는 같은 transaction으로 commit되어야 한다.',
);

const publicResolveBlock = dailyVideoResolve.slice(
    dailyVideoResolve.indexOf('export const resolveDailyVideo = async ('),
);
assert.match(
    publicResolveBlock,
    /const apiKey = dependencies\.getEnv\(["']YOUTUBE_API_KEY["']\)\?\.trim\(\) \|\|\s*acquired\.config\.apiKey;/,
    'YouTube 키는 서버 secret을 우선하고 저장 설정 키는 한시적 fallback으로만 사용해야 한다.',
);
assert.match(
    publicResolveBlock,
    /return finalizeLease\([\s\S]*service,[\s\S]*requestId,[\s\S]*serviceDate,[\s\S]*acquired,[\s\S]*fetched,[\s\S]*dependencies/,
    'YouTube 결과는 lease 소유권과 설정 fence를 다시 확인하는 완료 경로로만 넘겨야 한다.',
);

assert.match(
    dailyVideoResolve,
    /MAX_YOUTUBE_DEADLINE_MS = Math\.max\(1, DAILY_VIDEO_LEASE_MS - \d[\d_]*\)/,
    'YouTube 전체 deadline은 lease보다 짧게 파생해야 한다.',
);
assert.match(
    dailyVideoResolve,
    /const controller = new AbortController\(\);[\s\S]*Promise\.race\(\[work, timeout\]\)/,
    'YouTube playlist와 details 전체 호출에 AbortController deadline을 적용해야 한다.',
);
assert.ok(
    (dailyVideoResolve.match(/fetcher\(url, \{ signal \}\)/g) || []).length >= 2,
    'playlistItems와 videos 호출 모두 같은 abort signal을 전달해야 한다.',
);
assert.match(
    dailyVideoResolve,
    /!isRecord\(first\) \|\| first\.id !== videoId \|\| !isRecord\(first\.snippet\)/,
    'videos API가 exact id와 snippet을 확인한 경우에만 완료 영상을 만들어야 한다.',
);
assert.match(
    dailyVideoResolve,
    /const configuredModes = getConfiguredDailyVideoModes\(data\)/,
    '값이 있는 playlist 모드는 형식이 잘못돼도 완료 조건에서 조용히 제외하면 안 된다.',
);
for (const regressionName of [
    'YOUTUBE_API_KEY secret이 없을 때만 Firestore apiKey를 한시적으로 사용한다',
    '값이 있으나 형식이 잘못된 playlist 모드도 완료 조건에서 제외하지 않는다',
    'videos API가 빈 items 또는 snippet 없는 항목을 반환하면 완료 저장하지 않는다',
    '멈춘 YouTube fetch는 lease보다 짧은 deadline에 중단하고 backoff한다',
    '같은 requestId의 새 lease 세대가 생기면 이전 worker 결과를 폐기한다',
]) {
    assert.ok(
        dailyVideoResolveTest.includes(regressionName),
        `dailyVideo resolver P1 회귀 테스트가 필요하다: ${regressionName}`,
    );
}

const jobsRuleStart = firestoreRules.indexOf('match /dailyVideoJobs/');
if (jobsRuleStart >= 0) {
    const nextRuleStart = firestoreRules.indexOf('\n    match /', jobsRuleStart + 1);
    const jobsRule = firestoreRules.slice(
        jobsRuleStart,
        nextRuleStart > jobsRuleStart ? nextRuleStart : firestoreRules.length,
    );
    assert.match(
        jobsRule,
        /allow read, write:\s*if false;/,
        'dailyVideoJobs 명시 규칙이 있다면 클라이언트 접근을 모두 막아야 한다.',
    );
    assert.doesNotMatch(
        jobsRule,
        /allow\s+(?:read|write|create|update|delete)(?:,\s*(?:read|write|create|update|delete))*:\s*if\s+(?!false\b)/,
        'dailyVideoJobs에 허용 규칙을 추가하면 안 된다.',
    );
}

const fixtureCaseCount = ['titleCases', 'fillCases', 'candidateCases', 'labelCases', 'chapterCases']
    .reduce((total, key) => total + fixture[key].length, 0);
console.log(`✅ T126 daily video shared fixture ${fixtureCaseCount} cases + server boundary validation passed`);
