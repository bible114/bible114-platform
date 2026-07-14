import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = path => fs.readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const exists = path => fs.existsSync(new URL(`../${path}`, import.meta.url));

const constants = read('src/data/constants.js');
const envExample = read('.env.example');
const client = read('src/utils/platformApi.js');
const userBibleActions = read('src/hooks/useUserBibleActions.js');
const packageJson = JSON.parse(read('package.json'));

assert.match(constants, /export const PLATFORM_API_URL = import\.meta\.env\?\.VITE_PLATFORM_API_URL \|\| '';/);
assert.match(envExample, /^VITE_PLATFORM_API_URL=$/m);
assert.equal(packageJson.scripts['validate:round24'], 'node scripts/validate-round24.mjs');
assert.match(packageJson.scripts.validate, /npm run validate:round24$/);

// 브라우저 클라이언트 계약: 인증 토큰, 멱등 requestId, 12초 제한, 표준 오류.
for (const pattern of [
    /export class PlatformApiError extends Error/,
    /export const callPlatformApi = async \(action, payload = \{\}, options = \{\}\)/,
    /export const preflightPlatformApi =/,
    /export const previewReadCompletion = \(cycle, day, options = \{\}\)/,
    /Number\.isInteger\(cycle\)/,
    /Number\.isInteger\(day\)/,
    /callPlatformApi\('previewReadCompletion', \{ cycle, day \}, options\)/,
    /auth\.currentUser\.getIdToken\(forceRefresh\)/,
    /cryptoImpl\?\.randomUUID/,
    /cryptoImpl\?\.getRandomValues/,
    /export const createRequestId = \(cryptoImpl = globalThis\.crypto, random = Math\.random\)/,
    /return formatUuidV4\(bytes\)/,
    /const DEFAULT_TIMEOUT_MS = 12_000/,
    /new AbortController\(\)/,
    /setTimeout\(\(\) => controller\.abort\(\), timeoutMs\)/,
    /Authorization: `Bearer \$\{token\}`/,
    /JSON\.stringify\(\{ action, requestId, \.\.\.payload \}\)/,
    /code: 'FEATURE_DISABLED'/,
    /first\.response\.status !== 401/,
    /forceRefresh: true/,
]) assert.match(client, pattern);

assert.equal((client.match(/forceRefresh: true/g) || []).length, 1, '401 토큰 강제 갱신은 정확히 한 번이어야 한다.');
assert.doesNotMatch(client, /for\s*\(|while\s*\(|setInterval\s*\(/, '플랫폼 API 클라이언트에 일반 자동 재시도 루프가 없어야 한다.');
assert.doesNotMatch(
    client,
    /(?:db\.collection|firebase\.firestore|\bgetDocument\s*\(|\bsetDoc\s*\(|\bupdateDoc\s*\(|\brunTransaction\s*\(|\bcommitWrites\s*\()/,
    '플랫폼 API 클라이언트가 데이터베이스를 직접 읽거나 쓰면 안 된다.',
);

// Node에서 오류 타입과 URL 미설정 안전장치를 import/실행할 수 있어야 한다.
const platformApi = await import('../src/utils/platformApi.js');
const sampleError = new platformApi.PlatformApiError('fixture', { code: 'FIXTURE', status: 418, retryable: false });
assert.equal(sampleError.code, 'FIXTURE');
assert.equal(sampleError.status, 418);
assert.equal(sampleError.retryable, false);
const uuidV4Pattern = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
assert.match(platformApi.createRequestId(null, () => 0), uuidV4Pattern, 'crypto 완전 부재 fallback도 UUIDv4여야 한다.');
assert.match(platformApi.createRequestId({
    getRandomValues: bytes => bytes.fill(255),
}, () => 0), uuidV4Pattern, 'getRandomValues fallback도 UUIDv4여야 한다.');
assert.doesNotMatch(client, /`b114-/, '서버가 거부하는 비 UUID requestId fallback이 없어야 한다.');
await assert.rejects(
    () => platformApi.callPlatformApi('preflight'),
    error => error instanceof platformApi.PlatformApiError && error.code === 'FEATURE_DISABLED' && error.status === 0 && error.retryable === false,
);
for (const [cycle, day] of [[0, 1], [1.5, 1], [1, 0], [1, 366], [1, 2.5]]) {
    assert.throws(
        () => platformApi.previewReadCompletion(cycle, day),
        error => error instanceof platformApi.PlatformApiError
            && error.code === 'INVALID_PAYLOAD'
            && error.status === 0
            && error.retryable === false,
        `잘못된 읽기 범위(${cycle}, ${day})는 네트워크 요청 전에 거부해야 한다.`,
    );
}

// 읽기 완료 shadow 비교 계약: DEV에서만 서버 preview를 먼저 기다리고,
// preview 실패는 기존 클라이언트 transaction을 막지 않으며 실제 값은 로그에 남기지 않는다.
const readShadowPath = 'src/utils/readCompletionShadow.js';
assert.equal(exists(readShadowPath), true, `${readShadowPath}가 필요하다.`);
const readShadowSource = read(readShadowPath);
assert.match(readShadowSource, /export const compareReadCompletionShadow\s*=/);
assert.match(userBibleActions, /import\s*\{\s*previewReadCompletion\s*\}\s*from\s*['"]\.\.\/utils\/platformApi['"]/);
assert.match(userBibleActions, /import\s*\{\s*compareReadCompletionShadow\s*\}\s*from\s*['"]\.\.\/utils\/readCompletionShadow['"]/);

const devGuardIndex = userBibleActions.indexOf('if (import.meta.env.DEV)');
const previewAwaitIndex = userBibleActions.indexOf('await previewReadCompletion(');
const transactionAwaitIndex = userBibleActions.indexOf('await commitRead(');
assert.ok(devGuardIndex >= 0, '읽기 shadow preview는 import.meta.env.DEV 가드 안에서만 실행해야 한다.');
assert.ok(previewAwaitIndex > devGuardIndex, 'DEV 가드 안에서 previewReadCompletion을 await해야 한다.');
assert.ok(transactionAwaitIndex > previewAwaitIndex, '서버 preview를 기다린 뒤 기존 transaction을 실행해야 한다.');
assert.match(
    userBibleActions.slice(previewAwaitIndex, transactionAwaitIndex),
    /previewReadCompletion\([^)]*\{\s*timeoutMs:\s*4000\s*\}\)/,
    'shadow preview는 기존 읽기를 오래 지연시키지 않도록 4초 제한을 사용해야 한다.',
);

const transactionDeclarationIndex = userBibleActions.indexOf('\n            const commitRead', devGuardIndex);
assert.ok(transactionDeclarationIndex > previewAwaitIndex, 'shadow 준비 구간 뒤에 기존 transaction 선언이 이어져야 한다.');
const shadowPreparationBlock = userBibleActions.slice(devGuardIndex, transactionDeclarationIndex);
assert.match(
    shadowPreparationBlock,
    /try\s*\{[\s\S]*await previewReadCompletion\([\s\S]*\}\s*catch(?:\s*\([^)]*\))?\s*\{[\s\S]*\}/,
    'preview 실패는 catch되어 기존 읽기 transaction 흐름을 막지 않아야 한다.',
);
assert.doesNotMatch(
    shadowPreparationBlock,
    /catch(?:\s*\([^)]*\))?\s*\{[\s\S]*?\b(?:throw|return)\b/,
    'shadow preview catch에서 throw/return으로 기존 흐름을 중단하면 안 된다.',
);
assert.doesNotMatch(
    shadowPreparationBlock,
    /(?:compareReadCompletionShadow|console\.(?:info|debug|warn|error))\s*\(/,
    'preview 실패 catch에서는 비교하거나 허위 mismatch 로그를 남기면 안 된다.',
);

assert.match(
    userBibleActions,
    /if\s*\(\s*import\.meta\.env\.DEV\s*&&\s*readShadowPreview\?\.result\s*\)\s*\{[\s\S]*compareReadCompletionShadow\(/,
    'preview 결과가 실제로 있을 때만 transaction 결과와 비교해야 한다.',
);
const comparisonLog = userBibleActions.match(/console\.(?:info|debug|warn)\(\s*['"]\[read(?:-completion)?-shadow\]['"]\s*,\s*\{([\s\S]*?)\}\s*\)/);
assert.ok(comparisonLog, '읽기 shadow 비교 결과는 고정 표식과 제한된 요약 객체로 기록해야 한다.');
const loggedKeys = Array.from(comparisonLog[1].matchAll(/\b(match|serverStatus|clientStatus|mismatchKeys|cycle|day)\b\s*(?=[:,])/g), match => match[1]);
assert.deepEqual(
    [...new Set(loggedKeys)].sort(),
    ['clientStatus', 'cycle', 'day', 'match', 'mismatchKeys', 'serverStatus'].sort(),
    'shadow 비교 로그에는 상태, 불일치 키, 요청 위치만 기록해야 한다.',
);
assert.doesNotMatch(
    comparisonLog[1],
    /\b(?:serverResult|clientResult|updateData|summary|score|talent|streak|recentReadDates|currentUser)\b/,
    'shadow 비교 로그에 서버/클라이언트 실제 값이나 사용자 상태를 포함하면 안 된다.',
);

const { compareReadCompletionShadow } = await import('../src/utils/readCompletionShadow.js');
const readyServer = {
    status: 'ready',
    updateData: { currentDay: 2, score: 15 },
    summary: { oldLevel: 0, newLevel: 0, nextViewingDay: 2 },
};
const readyClient = {
    updateData: { currentDay: 2, score: 15 },
    oldLevel: 0,
    newLevel: 0,
    nextViewingDay: 2,
};
assert.deepEqual(compareReadCompletionShadow(readyServer, readyClient), {
    match: true,
    serverStatus: 'ready',
    clientStatus: 'ready',
    mismatchKeys: [],
});
const scoreMismatch = compareReadCompletionShadow(
    readyServer,
    { ...readyClient, updateData: { ...readyClient.updateData, score: 14 } },
);
assert.equal(scoreMismatch.match, false);
assert.deepEqual(scoreMismatch.mismatchKeys, ['updateData.score']);
assert.deepEqual(compareReadCompletionShadow(
    { status: 'dailyLimit', limit: 3, count: 3 },
    { blockedReason: 'DAILY_ADVANCE_LIMIT' },
), {
    match: true,
    serverStatus: 'dailyLimit',
    clientStatus: 'dailyLimit',
    mismatchKeys: [],
});
assert.deepEqual(compareReadCompletionShadow(
    { status: 'positionMismatch', expected: { cycle: 2, day: 1 }, received: { cycle: 1, day: 365 } },
    readyClient,
), {
    match: false,
    serverStatus: 'positionMismatch',
    clientStatus: 'ready',
    mismatchKeys: ['status'],
});
const repeatedClient = compareReadCompletionShadow({ status: 'ready' }, null);
assert.equal(repeatedClient.clientStatus, 'repeated');
assert.deepEqual(
    Object.keys(repeatedClient).sort(),
    ['match', 'serverStatus', 'clientStatus', 'mismatchKeys'].sort(),
    'comparator는 실제 값을 반환하지 않고 상태와 mismatchKeys만 반환해야 한다.',
);

// 퀴즈 정답 서버 권위 기반: 클라이언트와 생성기가 같은 결정적 섞기 함수를
// 공유하고, 서버에 배치되는 인덱스가 전체 원본과 정확히 대응해야 한다.
const quizShufflePath = 'src/utils/quizShuffle.js';
const quizEnginePath = 'src/utils/quizEngine.js';
const quizAnswerGeneratorPath = 'scripts/generate-quiz-answer-index.mjs';
const quizAnswerIndexPath = 'supabase/functions/platform-api/quiz-answer-index.json';
const quizCorePath = 'supabase/functions/platform-api/quizCore.ts';
const quizCoreTestPath = 'supabase/functions/platform-api/quizCore_test.ts';
for (const path of [
    quizShufflePath,
    quizEnginePath,
    quizAnswerGeneratorPath,
    quizAnswerIndexPath,
    quizCorePath,
    quizCoreTestPath,
]) assert.equal(exists(path), true, `${path}가 필요하다.`);

const quizShuffle = read(quizShufflePath);
const quizEngine = read(quizEnginePath);
for (const exportName of ['hashStringToSeed', 'createSeededRandom', 'shuffleQuizChoices']) {
    assert.match(quizShuffle, new RegExp(`export const ${exportName}\\s*=`));
}
assert.match(
    quizEngine,
    /import\s*\{[^}]*createSeededRandom[^}]*shuffleQuizChoices[^}]*\}\s*from\s*['"]\.\/quizShuffle['"]/,
    'quizEngine은 공용 quizShuffle 구현을 import해야 한다.',
);
assert.match(quizEngine, /export\s*\{\s*shuffleQuizChoices\s*\}/, '기존 호출부를 위해 shuffleQuizChoices를 re-export해야 한다.');
assert.doesNotMatch(
    quizEngine,
    /(?:const|let|var|function)\s+(?:hashStringToSeed|createSeededRandom)\b/,
    'quizEngine에 hash/seeded random 중복 구현을 두면 안 된다.',
);

assert.equal(packageJson.scripts['generate:quiz-answer-index'], 'node scripts/generate-quiz-answer-index.mjs');
assert.equal(packageJson.scripts['validate:quiz-answer-index'], 'node scripts/generate-quiz-answer-index.mjs --check');
const validateScript = packageJson.scripts.validate;
const answerIndexValidation = 'npm run validate:quiz-answer-index';
const round24Validation = 'npm run validate:round24';
assert.ok(validateScript.includes(answerIndexValidation), '최상위 validate에 정답 인덱스 검사가 필요하다.');
assert.ok(
    validateScript.indexOf(answerIndexValidation) < validateScript.indexOf(round24Validation),
    '정답 인덱스 검사는 Round 24 계약 검사보다 먼저 실행해야 한다.',
);

const quizAnswerIndex = JSON.parse(read(quizAnswerIndexPath));
assert.equal(quizAnswerIndex.schemaVersion, 1, '퀴즈 정답 인덱스 schemaVersion은 1이어야 한다.');
assert.equal(
    quizAnswerIndex.questions && typeof quizAnswerIndex.questions === 'object' && !Array.isArray(quizAnswerIndex.questions),
    true,
    '퀴즈 정답 인덱스 questions는 객체여야 한다.',
);
const indexedQuestions = Object.entries(quizAnswerIndex.questions);
assert.equal(indexedQuestions.length, 6657, '퀴즈 정답 인덱스는 정확히 6,657문항이어야 한다.');
const quizKindCounts = { standard: 0, ntEasy: 0, bank: 0 };
for (const [key, record] of indexedQuestions) {
    let kind;
    if (/^ntEasy-(?:[1-9]\d{0,2})-(?:[1-9]\d*)$/.test(key)) kind = 'ntEasy';
    else if (/^bank-(?:0|[1-9]\d*)$/.test(key)) kind = 'bank';
    else if (/^[a-z0-9]+-(?:[1-9]\d*)-(?:[1-9]\d*)$/.test(key)) kind = 'standard';
    else assert.fail(`허용되지 않은 퀴즈 key 형식: ${key}`);
    quizKindCounts[kind] += 1;

    assert.ok(Number.isInteger(record?.answerIndex) && record.answerIndex >= 0 && record.answerIndex <= 3, `${key}: answerIndex는 0~3 정수여야 한다.`);
    assert.equal(record?.allowed && typeof record.allowed === 'object', true, `${key}: allowed가 필요하다.`);
    for (const plan of ['whole', 'nt']) {
        const days = record.allowed?.[plan];
        assert.ok(Array.isArray(days), `${key}: allowed.${plan}은 배열이어야 한다.`);
        assert.ok(days.every(day => Number.isInteger(day) && day >= 1 && day <= 365), `${key}: allowed.${plan}은 Day 1~365만 포함해야 한다.`);
        assert.equal(new Set(days).size, days.length, `${key}: allowed.${plan}에 중복 Day가 있다.`);
    }
    if (kind === 'bank') {
        assert.equal(record.legacyBank, true, `${key}: 레거시 은행 문항 표시가 필요하다.`);
        assert.deepEqual(record.allowed, { whole: [], nt: [] }, `${key}: 은행 문항은 새 위치에 허용하면 안 된다.`);
    } else {
        assert.notEqual(record.legacyBank, true, `${key}: 일반 문항을 legacyBank로 표시하면 안 된다.`);
    }
}
assert.deepEqual(
    quizKindCounts,
    { standard: 4719, ntEasy: 1825, bank: 113 },
    '퀴즈 종류별 인덱스 문항 수가 원본과 달라졌다.',
);

const quizCore = read(quizCorePath);
assert.match(quizCore, /export const validateQuizSubmission\s*=/);
assert.match(
    quizCore,
    /validQuizKey\(stored\.quizKey\)\s*&&\s*stored\.quizKey\s*!==\s*input\.quizKey[\s\S]{0,160}return\s*\{\s*status:\s*['"]invalidQuiz['"]\s*\}/,
    '저장된 quizKey와 제출 quizKey가 다르면 invalidQuiz로 거부해야 한다.',
);

const sharedContracts = {
    'supabase/functions/_shared/cors.ts': ['ALLOWED_ORIGINS', 'isAllowedOrigin', 'handleCors', 'jsonResponse'],
    'supabase/functions/_shared/errors.ts': ['PlatformError', 'ERROR_DEFINITIONS', 'errorPayload'],
    'supabase/functions/_shared/time.ts': ['getServiceDateKst', 'getCalendarDateKst', 'getLegacyCalendarDateStringKst'],
    'supabase/functions/_shared/firebase.ts': ['verifyFirebaseIdToken', 'getServiceAccessToken'],
    'supabase/functions/_shared/firestore.ts': ['encodeFirestoreValue', 'decodeFirestoreValue', 'getDocument', 'runCollectionGroupQuery', 'beginTransaction', 'commitWrites', 'rollbackTransaction'],
};

for (const [path, exports] of Object.entries(sharedContracts)) {
    assert.equal(exists(path), true, `${path}가 필요하다.`);
    const source = read(path);
    for (const name of exports) assert.match(source, new RegExp(`export (?:const|class|function|type|interface|async function) ${name}\\b`));
}

const corePath = 'supabase/functions/platform-api/core.ts';
const indexPath = 'supabase/functions/platform-api/index.ts';
const readCorePath = 'supabase/functions/platform-api/readCore.ts';
assert.equal(exists(corePath), true, `${corePath}가 필요하다.`);
assert.equal(exists(indexPath), true, `${indexPath}가 필요하다.`);
assert.equal(exists(readCorePath), true, `${readCorePath}가 필요하다.`);
const serverCore = read(corePath);
const serverIndex = read(indexPath);
const readCore = read(readCorePath);

assert.doesNotMatch(
    readCore,
    /(?:\bfetch\s*\(|\bDeno\.|db\.collection|firebase\.firestore|\bgetDocument\s*\(|\bbeginTransaction\s*\(|\bcommitWrites\s*\(|\brollbackTransaction\s*\(|\bupdateWrite\s*\(|\bdeleteWrite\s*\()/,
    'T123 readCore는 외부 I/O나 Firestore 쓰기가 없는 순수 계산 모듈이어야 한다.',
);

assert.match(serverCore, /PREFLIGHT_ACTION\s*=\s*['"]preflight['"]/);
assert.match(serverCore, /PREVIEW_READ_COMPLETION_ACTION\s*=\s*['"]previewReadCompletion['"]/);
assert.match(serverCore, /parsePlatformApiRequest/);
assert.match(serverIndex, /verifyFirebaseIdToken/);
assert.match(serverIndex, /parsePlatformApiRequest/);
assert.match(serverIndex, /getDocument/);
assert.match(serverIndex, /runCollectionGroupQuery/);
assert.match(serverIndex, /\{\s*limit:\s*4\s*\}/);
assert.match(serverIndex, /calculateReadCompletion/);
assert.match(serverIndex, /rosterCount:\s*rosterDocuments\.length/);
assert.match(serverIndex, /\bresult\b/);

// T122-T123 shadow 단계에서는 서버 공통 쓰기 도구가 존재만 하며 platform-api 경로가 호출하면 안 된다.
const platformServer = `${serverCore}\n${serverIndex}`;
assert.doesNotMatch(
    platformServer,
    /\b(?:beginTransaction|commitWrites|rollbackTransaction|createDocument|patchDocument|deleteDocument)\s*\(/,
    'T122-T123 platform-api는 Firestore를 쓰지 않는 shadow-only여야 한다.',
);

console.log('✅ Round 24 T122-T123 client/server shadow contract validation passed');
