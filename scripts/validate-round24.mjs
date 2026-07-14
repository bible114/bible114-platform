import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = path => fs.readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const exists = path => fs.existsSync(new URL(`../${path}`, import.meta.url));

const constants = read('src/data/constants.js');
const envExample = read('.env.example');
const client = read('src/utils/platformApi.js');
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
