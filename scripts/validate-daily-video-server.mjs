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
const dailyVideoCore = read('supabase/functions/platform-api/dailyVideoCore.ts');
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
    /kind: ["']acquired["'][\s\S]*dailyUpdateTime: dailyDocument\?\.updateTime \|\| null/,
    'fill lease는 획득 당시 daily 문서 updateTime도 저장해야 한다.',
);
assert.match(
    acquireLeaseBlock,
    /dependencies\.updateWrite\(service\.projectId, jobPath,[\s\S]*exists: Boolean\(jobDocument\),[\s\S]*updateMask:/,
    'dailyVideoJobs lease는 서비스 project의 masked write로만 갱신해야 한다.',
);

const finalizeLeaseBlock = findBlock(
    dailyVideoResolve,
    'const finalizeLease = async (',
    '\nconst mergeRefreshedChapters',
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
assert.match(
    finalizeLeaseBlock,
    /const dailyUnchanged = \(dailyDocument\?\.updateTime \|\| null\) ===[\s\S]*acquired\.dailyUpdateTime/,
    'fill 완료도 획득 당시 daily 문서 세대를 다시 확인해야 한다.',
);
const ownershipFenceStart = finalizeLeaseBlock.indexOf('if (!ownsLease || !configUnchanged || !dailyUnchanged)');
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
assert.match(
    finalizeLeaseBlock,
    /jobDocument\.data\.leasePurpose === ["']fill["']/,
    'fill 완료는 같은 목적의 lease만 소유한 것으로 인정해야 한다.',
);
assert.match(
    finalizeLeaseBlock.slice(fullReadyStart, partialFailureStart),
    /const allCurrentEntriesFetched = acquired\.base === null;[\s\S]*if \(allCurrentEntriesFetched\) \{[\s\S]*dailyUpdate\.chaptersRefreshedAt = now;/,
    '모든 항목을 이번에 가져온 신규 full fill은 chapters TTL도 함께 시작해야 한다.',
);

const ttlMinutesMatch = dailyVideoCore.match(
    /export const DAILY_VIDEO_CHAPTERS_TTL_MS = (\d+) \* 60 \* 1000;/,
);
assert.ok(ttlMinutesMatch, 'chapters TTL 상수가 분 단위로 명시돼야 한다.');
const ttlMinutes = Number(ttlMinutesMatch[1]);
assert.ok(
    ttlMinutes >= 30 && ttlMinutes <= 60,
    'chapters TTL은 설계 범위인 30~60분이어야 한다.',
);
assert.match(
    dailyVideoCore,
    /export const isDailyVideoChaptersRefreshDue = \([\s\S]*refreshedAt > now[\s\S]*updatedAt !== null && updatedAt <= now && updatedAt > refreshedAt[\s\S]*now - refreshedAt >= DAILY_VIDEO_CHAPTERS_TTL_MS/,
    'TTL 경과와 과거 수동 updatedAt 변경은 갱신하되 미래 시각은 반복 due로 만들면 안 된다.',
);
assert.match(
    dailyVideoCore,
    /export const extractYouTubeVideoId = \([\s\S]*parseStrictYouTubeUrl\([\s\S]*YOUTUBE_VIDEO_ID_PATTERN/,
    '저장 URL에서 엄격하게 검증한 YouTube video id만 추출해야 한다.',
);
assert.match(
    dailyVideoCore,
    /export const sanitizeYouTubeHttpsUrl = \([\s\S]*parseStrictYouTubeUrl\(value\)/,
    '공개 URL sanitizer도 raw authority 검사를 우회하지 말아야 한다.',
);
assert.doesNotMatch(
    dailyVideoResolve,
    /dailyVideo(?:Chapter|Refresh)Jobs/,
    'chapters 갱신은 별도 collection이 아니라 기존 dailyVideoJobs lease를 공유해야 한다.',
);
const fillNeededStart = acquireLeaseBlock.indexOf('const fillNeeded =');
const refreshDueStart = acquireLeaseBlock.indexOf('const refreshDue =');
assert.ok(
    fillNeededStart >= 0 && refreshDueStart > fillNeededStart,
    '누락 영상 fill을 stale chapters refresh보다 먼저 판정해야 한다.',
);
assert.match(
    acquireLeaseBlock,
    /leasePurpose: ["']fill["'][\s\S]*leasePurpose: ["']refresh["']/,
    '공유 lease에서 fill과 refresh 목적을 명시적으로 구분해야 한다.',
);
assert.match(
    acquireLeaseBlock,
    /refreshAttemptCount[\s\S]*refreshNextRetryAt[\s\S]*updateMask:/,
    'refresh 세대와 backoff는 fill 세대와 분리해 masked write로 보존해야 한다.',
);
assert.match(
    dailyVideoResolve,
    /targets\.push\(\{ mode, videoId: extractYouTubeVideoId\([\s\S]*const hasRefreshableTarget = targets\.some\(\(\{ videoId \}\) => videoId\)/,
    '추출 불가 저장 모드도 전체 성공 분모에 남기고 유효 ID가 하나는 있을 때만 lease를 잡아야 한다.',
);

const chapterFetchBlock = findBlock(
    dailyVideoResolve,
    'const fetchDailyVideoChapters = async (',
    '\nconst fetchRefreshedChapters',
    'chapters videos 호출',
);
assert.match(chapterFetchBlock, /youtube\/v3\/videos/, '저장 chapters 갱신은 videos API만 사용해야 한다.');
assert.doesNotMatch(chapterFetchBlock, /playlistItems/, '저장 chapters 갱신에서 playlist를 다시 조회하면 안 된다.');
assert.match(
    chapterFetchBlock,
    /first\.id !== videoId[\s\S]*parseAndMapChapters\(first\.snippet\.description\)[\s\S]*chapters\.length > 0/,
    'videos 응답 id와 비어 있지 않은 표준 chapters를 확인해야 한다.',
);
const refreshFetchBlock = findBlock(
    dailyVideoResolve,
    'const fetchRefreshedChapters = async (',
    '\ntype AcquireResult',
    'chapters 병렬 deadline',
);
assert.match(
    refreshFetchBlock,
    /const controller = new AbortController\(\);[\s\S]*controller\.signal[\s\S]*Promise\.race\(\[work, timeout\]\)/,
    'chapters 병렬 videos 호출도 lease보다 짧은 공용 deadline을 사용해야 한다.',
);

const finalizeRefreshBlock = findBlock(
    dailyVideoResolve,
    'const finalizeRefreshLease = async (',
    '\nexport const resolveDailyVideo',
    'chapters refresh 완료 함수',
);
for (const fence of [
    /jobDocument\?\.data\.leaseOwner === requestId/,
    /jobDocument\.data\.leasePurpose === ["']refresh["']/,
    /jobDocument\.data\.refreshAttemptCount === acquired\.refreshAttemptCount/,
    /jobDocument\.data\.configUpdateTime === acquired\.configUpdateTime/,
    /dailyDocument\?\.updateTime \|\| null\) ===[\s\S]*acquired\.dailyUpdateTime/,
]) {
    assert.match(finalizeRefreshBlock, fence, 'refresh 저장 직전 owner·목적·세대·설정·daily 버전을 모두 재검증해야 한다.');
}
const refreshWriteBlock = findBlock(
    finalizeRefreshBlock,
    'if (successfulResults.length > 0)',
    '\n      if (allSucceeded)',
    '허용된 chapters patch',
);
assert.match(
    refreshWriteBlock,
    /dailyUpdate\[mode\] = \{ chapters \};[\s\S]*dailyUpdateMask\.push\(`\$\{mode\}\.chapters`\)/,
    '성공한 모드는 nested chapters 경로만 patch해야 한다.',
);
assert.match(
    refreshWriteBlock,
    /if \(allSucceeded\)[\s\S]*dailyUpdate\.chaptersRefreshedAt = now;[\s\S]*dailyUpdateMask\.push\(["']chaptersRefreshedAt["']\)/,
    '모든 대상 모드가 성공했을 때만 문서 TTL을 전진시켜야 한다.',
);
assert.doesNotMatch(
    refreshWriteBlock,
    /url|title|publishedAt|matchedDate|autoFilled|updatedAt/,
    'chapters refresh patch가 영상·수동 상태·updatedAt을 건드리면 안 된다.',
);
assert.match(
    finalizeRefreshBlock,
    /if \(allSucceeded\)[\s\S]*deleteWrite\(service\.projectId, jobPath, true\)[\s\S]*pending: false/,
    '전체 refresh 성공은 chapters patch와 job 삭제를 원자 처리해야 한다.',
);
assert.match(
    finalizeRefreshBlock,
    /refreshNextRetryAt: new Date\(nowMs \+ retryAfterMs\)[\s\S]*pending: true,[\s\S]*retryAfterMs/,
    'partial·실패 refresh는 기존 video와 refresh 전용 backoff를 반환해야 한다.',
);
assert.match(
    finalizeRefreshBlock,
    /const allSucceeded = successfulResults\.length === acquired\.targets\.length/,
    '추출 불가 모드를 제외한 채 전체 refresh 성공으로 오인하면 안 된다.',
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
    'fresh 수동 문서는 그대로 반환하고 write와 YouTube 호출을 하지 않는다',
    'fresh 문서의 미래 updatedAt은 반복 refresh lease를 만들지 않는다',
    'fresh 완성 자동 문서는 lease 없이 반환한다',
    'stale 수동 문서는 videos API로만 갱신하고 chapters 외 필드를 보존한다',
    'stale 완성 자동 문서도 nested chapters와 timestamp만 갱신한다',
    '두 모드 refresh 일부 성공은 성공 chapters만 저장하고 독립 2분 backoff한다',
    '추출 불가 모드가 섞이면 성공 모드만 갱신하고 전체 TTL을 전진시키지 않는다',
    '모든 저장 URL이 추출 불가면 lease와 YouTube 호출 없이 기존 영상을 반환한다',
    'refresh 전부 실패 또는 timeout이면 daily를 쓰지 않고 기존 chapters를 반환한다',
    'active refresh lease와 refresh backoff는 기존 video를 즉시 반환하고 YouTube를 호출하지 않는다',
    'fill은 refresh backoff와 세대를 덮지 않고 독립적으로 획득한다',
    'partial 자동 문서가 fill 중 삭제되면 이전 worker가 문서를 되살리지 않는다',
    'refresh fetch 중 수동 URL 또는 chapters 수정은 updateTime fence로 보존한다',
    'refresh lease purpose와 generation 변경은 이전 worker 결과를 폐기한다',
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
