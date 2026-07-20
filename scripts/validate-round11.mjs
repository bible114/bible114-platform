import assert from 'node:assert/strict';
import fs from 'node:fs';
import { normalizeChurchEntryCode } from '../src/utils/entryCode.js';

const read = path => fs.readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const login = read('src/components/LoginView.jsx');
const auth = read('src/hooks/useAuth.js');
const onboarding = read('src/components/SocialOnboardingView.jsx');
const dashboard = read('src/components/DashboardView.jsx');
const membership = read('src/components/dashboard/CommunityMembershipCard.jsx');
const department = read('src/hooks/useDepartment.js');
const app = read('src/App.jsx');
const actions = read('src/hooks/useUserBibleActions.js');
const header = read('src/components/dashboard/DashboardHeader.jsx');
const churchAdmin = read('src/components/ChurchAdminView.jsx');
const platformAdmin = read('src/components/PlatformAdminView.jsx');
const churchDirectory = read('src/utils/churchDirectory.js');
const platformApi = read('src/utils/platformApi.js');
const platformApiCore = read('supabase/functions/platform-api/core.ts');
const platformApiIndex = read('supabase/functions/platform-api/index.ts');
const rotateChurchAccessCodeCore = read('supabase/functions/platform-api/rotateChurchAccessCodeCore.ts');
const rotateChurchAccessCodeService = read('supabase/functions/platform-api/rotateChurchAccessCodeService.ts');

assert.equal(normalizeChurchEntryCode('1234'), '1234');
assert.equal(normalizeChurchEntryCode(' alpha-5 '), 'alpha-5');
assert.equal(normalizeChurchEntryCode('123'), '');
assert.equal(normalizeChurchEntryCode('x'.repeat(129)), '');
assert.equal(normalizeChurchEntryCode('ab\ncd'), '');

for (const text of ['카카오로 시작', '구글로 시작', '기존 성도이신가요? 안내 보기', '로그인 없이 둘러보기', '공동체 등록하기']) assert.match(login, new RegExp(text.replace(/[()?·]/g, '\\$&')));
assert.doesNotMatch(login, /카카오톡으로 로그인|Google로 로그인|기존 회원 로그인 \(이름·생년월일로\)/);
assert.match(login, /공동체 관리자/);
assert.match(auth, /buildKakaoAuthorizeUrl/);
assert.match(auth, /signInWithCustomToken/);
assert.match(auth, /isValidKakaoState/);
assert.doesNotMatch(auth, /OAuthProvider\('oidc\.kakao'\)/);
assert.match(auth, /openSocialOnboarding\(cred\.user, 'google\.com', \{\}, signupDraft\)/);
assert.match(onboarding, /1단계 \/ 3단계/);
assert.match(onboarding, /2단계 \/ 3단계/);
assert.match(onboarding, /3단계 \/ 3단계/);
assert.match(onboarding, /UNAFFILIATED_CHURCH_ID/);
assert.match(auth, /completePersonalSignupViaApi\(\{[\s\S]*churchId: organization\.orgId[\s\S]*joinTicket: organization\.joinTicket/);
assert.doesNotMatch(auth, /transaction\.set\(rosterRef/);
assert.match(membership, /joinTicket,[\s\S]*\.\.\.selection/);
assert.match(dashboard, /내 단체 관리/);
assert.match(membership, /기본으로 설정/);
assert.match(membership, /현재 보고 있음/);
assert.doesNotMatch(membership, /🏆 순위/);
assert.match(membership, /혼자 읽기 모임으로 돌아가기/);
assert.match(department, /const orgId = orgIdOverride \|\| currentUser\?\.churchId[\s\S]*orgId === UNAFFILIATED_CHURCH_ID[\s\S]*Promise\.resolve\(\{ docs: \[\] \}\)/);
assert.match(app, /<DashboardView[\s\S]*?currentUser=\{dashboardUser\}/);
assert.match(app, /currentUser\.accountType === 'personal' && currentUser\.planId[\s\S]*?setView\('dashboard'\)/);
assert.doesNotMatch(app, /currentUser\.accountType === 'personal'[\s\S]{0,160}setView\('personal_community_onboarding'\)/);
assert.doesNotMatch(dashboard, /users[^\n]*\.set\([^\n]*\.\.\.currentUser/);
assert.doesNotMatch(actions, /users[^\n]*\.set\([^\n]*\.\.\.currentUser/);
assert.match(header, /grid-cols-\[minmax\(0,1fr\)_auto\]/);
assert.doesNotMatch(header, /overflow-x-auto|scrollbar-hide|justify-between md:justify-end/);
assert.match(header, /☰ <span>메뉴<\/span>[\s\S]*읽기 달력[\s\S]*읽기 날짜 설정[\s\S]*읽는 방법·FAQ/);

// 기존 공동체의 입장코드 변경은 클라이언트 Firestore 쓰기가 아니라 서버
// authority를 통해서만 수행해야 한다. 클라이언트는 서버 원본 version을 읽고,
// 네트워크 재시도에는 동일 requestId와 expectedVersion을 재사용한다.
const saveChurchCodeStart = churchAdmin.indexOf('const saveChurchCode = async () =>');
const saveChurchCodeEnd = churchAdmin.indexOf('const saveOrg = async () =>', saveChurchCodeStart);
assert.ok(saveChurchCodeStart >= 0 && saveChurchCodeEnd > saveChurchCodeStart, '공동체 입장코드 변경 함수가 필요하다.');
const saveChurchCode = churchAdmin.slice(saveChurchCodeStart, saveChurchCodeEnd);
assert.match(churchAdmin, /const pendingChurchCodeRequestRef = useRef\(null\)/);
for (const pattern of [
    /collection\('private'\)\.doc\('access'\)\.get\(\{\s*source:\s*'server'\s*\}\)/,
    /const expectedVersion = storedVersion === undefined \? 0 : storedVersion/,
    /Number\.isSafeInteger\(expectedVersion\)[\s\S]*expectedVersion < 0/,
    /requestId:\s*createRequestId\(\)/,
    /uid:\s*requestUid[\s\S]*churchId:\s*requestChurchId/,
    /pendingChurchCodeRequestRef\.current = pending/,
    /await rotateChurchAccessCode\(\{[\s\S]*churchId:\s*pending\.churchId[\s\S]*entryCode:\s*pending\.entryCode[\s\S]*expectedVersion:\s*pending\.expectedVersion/,
    /requestId:\s*pending\.requestId[\s\S]*expectedUid:\s*requestUid/,
    /if \(!requestContextIsCurrent\(\)\)[\s\S]*clearPendingIfCurrent\(pending\)[\s\S]*return/,
    /result\.result\.version !== pending\.expectedVersion \+ 1/,
    /pendingChurchCodeRequestRef\.current = null/,
    /if \(pending && e\?\.retryable !== true\) clearPendingIfCurrent\(pending\)/,
]) assert.match(saveChurchCode, pattern);
assert.doesNotMatch(
    saveChurchCode,
    /\bdb\.(?:batch|runTransaction)\s*\(|\bbatch\.|firebase\.firestore\.FieldValue|\.(?:set|update|delete|add)\s*\(/,
    '공동체 관리자 화면은 입장코드나 공개 비밀 필드를 Firestore에 직접 쓰면 안 된다.',
);

const rotateClientStart = platformApi.indexOf('export const rotateChurchAccessCode = (input, options = {}) =>');
const rotateClientEnd = platformApi.indexOf('export const ensureUnaffiliatedChurch', rotateClientStart);
assert.ok(rotateClientStart >= 0 && rotateClientEnd > rotateClientStart, '입장코드 변경 platform-api 래퍼가 필요하다.');
const rotateClient = platformApi.slice(rotateClientStart, rotateClientEnd);
for (const pattern of [
    /hasExactKeys\(input, ROTATE_CHURCH_ACCESS_CODE_REQUEST_KEYS\)/,
    /Number\.isSafeInteger\(input\.expectedVersion\)/,
    /const requestId = options\.requestId \|\| createRequestId\(\)/,
    /callPlatformApi\('rotateChurchAccessCode', payload, \{ \.\.\.options, requestId \}\)/,
    /result\.requestId !== requestId/,
    /result\.result\.version !== payload\.expectedVersion \+ 1/,
    /result\.alreadyCompleted === result\.committed/,
]) assert.match(rotateClient, pattern);
assert.match(
    platformApi,
    /const ROTATE_CHURCH_ACCESS_CODE_REQUEST_KEYS = new Set\(\[\s*'churchId', 'entryCode', 'expectedVersion',\s*\]\)/,
    '클라이언트 입장코드 변경 payload는 정확한 세 필드만 허용해야 한다.',
);

const rotateParserStart = platformApiCore.indexOf('if (action === ROTATE_CHURCH_ACCESS_CODE_ACTION)');
const rotateParserEnd = platformApiCore.indexOf('if (action === COMPLETE_CHURCH_ADMIN_SIGNUP_ACTION)', rotateParserStart);
assert.ok(rotateParserStart >= 0 && rotateParserEnd > rotateParserStart, '서버 입장코드 변경 payload 파서가 필요하다.');
const rotateParser = platformApiCore.slice(rotateParserStart, rotateParserEnd);
for (const pattern of [
    /const allowedKeys = new Set\(\[\s*"action",\s*"requestId",\s*"churchId",\s*"entryCode",\s*"expectedVersion",\s*\]\)/,
    /Object\.keys\(body\)\.some\(\(key\) => !allowedKeys\.has\(key\)\)/,
    /normalizedChurchId === "unaffiliated_v1"/,
    /normalizedEntryCode !== entryCode/,
    /Number\.isSafeInteger\(expectedVersion\)/,
]) assert.match(rotateParser, pattern);

const rotateRouteStart = platformApiIndex.indexOf('if (parsed.action === "rotateChurchAccessCode")');
const rotateRouteEnd = platformApiIndex.indexOf('if (parsed.action === "ensureUnaffiliatedChurch")', rotateRouteStart);
assert.ok(rotateRouteStart >= 0 && rotateRouteEnd > rotateRouteStart, '서버 입장코드 변경 라우트가 필요하다.');
const rotateRoute = platformApiIndex.slice(rotateRouteStart, rotateRouteEnd);
assert.match(
    rotateRoute,
    /await rotateChurchAccessCode\(service, verifiedUser, \{[\s\S]*requestId:\s*parsed\.requestId[\s\S]*churchId:\s*parsed\.churchId[\s\S]*entryCode:\s*parsed\.entryCode[\s\S]*expectedVersion:\s*parsed\.expectedVersion/,
);

for (const pattern of [
    /const currentVersion = access\.version === undefined \? 0 : access\.version/,
    /inspection\.currentVersion !== input\.expectedVersion/,
    /nextVersion:\s*inspection\.currentVersion \+ 1/,
]) assert.match(rotateChurchAccessCodeCore, pattern);
for (const pattern of [
    /const MAX_TRANSACTION_ATTEMPTS = 3/,
    /const accessPath = `\$\{churchPath\}\/private\/access`/,
    /dependencies\.getDocument<RotateChurchAccessCodeAccess>\([\s\S]*accessPath,[\s\S]*\{ transaction \}/,
    /const nextCodeHash = await dependencies\.hashText\(input\.entryCode\)/,
    /decideRotateChurchAccessCode\(\{[\s\S]*expectedVersion:\s*input\.expectedVersion[\s\S]*nextCodeHash/,
    /dependencies\.updateWrite\(service\.projectId, accessPath, \{[\s\S]*codeHash:\s*decision\.nextCodeHash[\s\S]*version:\s*decision\.nextVersion/,
    /updateMask:\s*\["churchCode", "churchCodeHash", "code", "updatedAt"\]/,
]) assert.match(rotateChurchAccessCodeService, pattern);
const rotateLedgerStart = rotateChurchAccessCodeService.indexOf('dependencies.updateWrite(service.projectId, ledgerPath');
const rotateLedgerEnd = rotateChurchAccessCodeService.indexOf('}, { exists: false })', rotateLedgerStart);
assert.ok(rotateLedgerStart >= 0 && rotateLedgerEnd > rotateLedgerStart, '입장코드 변경 멱등 원장 쓰기가 필요하다.');
const rotateLedgerWrite = rotateChurchAccessCodeService.slice(rotateLedgerStart, rotateLedgerEnd);
assert.match(rotateLedgerWrite, /input:\s*\{[\s\S]*churchId:\s*input\.churchId[\s\S]*expectedVersion:\s*input\.expectedVersion[\s\S]*fingerprint:\s*inputFingerprint/);
assert.doesNotMatch(
    rotateLedgerWrite,
    /\bentryCode\s*:|\bcodeHash\s*:/,
    '멱등 원장에 입장코드 원문이나 해시를 저장하면 안 된다.',
);
assert.doesNotMatch(
    platformAdmin,
    /churchCodeHash:\s*null|churchCode:\s*null/,
    '가상 공동체를 포함한 새 공개 공동체 문서에 비밀 필드 자리표시자를 쓰면 안 된다.',
);

// 운영 보안 이전 도구는 기본이 읽기 전용 dry-run이어야 하며, 공개 디렉토리는
// 모든 교회의 private/access 백필·레거시 삭제 batch가 성공한 뒤 마지막에 정리한다.
assert.match(
    churchDirectory,
    /export const migrateChurchAccessSecrets = async \(\{\s*dryRun\s*=\s*true,\s*onProgress\s*\}\s*=\s*\{\}\)\s*=>/,
    '입장코드 이전은 dryRun=true가 기본이어야 한다.',
);
const sanitizeDirectoryStart = churchDirectory.indexOf('const sanitizeDirectoryChurches');
const migrationStart = churchDirectory.indexOf('export const migrateChurchAccessSecrets');
assert.ok(sanitizeDirectoryStart >= 0 && migrationStart > sanitizeDirectoryStart, '공개 디렉토리 정리기가 필요하다.');
const sanitizeDirectory = churchDirectory.slice(sanitizeDirectoryStart, migrationStart);
assert.match(sanitizeDirectory, /id:\s*entry\.id[\s\S]*name:[\s\S]*hidden/);
assert.doesNotMatch(
    sanitizeDirectory,
    /\b(?:churchCode|churchCodeHash|codeHash|code)\s*:/,
    '공개 디렉토리에는 어떤 레거시 코드·해시 필드도 남겨서는 안 된다.',
);
assert.match(churchDirectory, /syncChurchDirectoryEntry[\s\S]*sanitizeDirectoryChurches\(doc\.exists/);
assert.match(churchDirectory, /removeChurchFromDirectory[\s\S]*sanitizeDirectoryChurches\(doc\.data\(\)\.churches/);
const securityMigration = churchDirectory.slice(migrationStart);
for (const pattern of [
    /DIRECTORY_DOC\(\)\.get\(\)/,
    /const sourceCounts\s*=\s*\{/,
    /collection\('private'\)\.doc\('access'\)\.get\(\)/,
    /transaction\.set\(churchDoc\.ref\.collection\('private'\)\.doc\('access'\),\s*\{[\s\S]*codeHash/,
    /churchCode:\s*firebase\.firestore\.FieldValue\.delete\(\)/,
    /churchCodeHash:\s*firebase\.firestore\.FieldValue\.delete\(\)/,
    /\bcode:\s*firebase\.firestore\.FieldValue\.delete\(\)/,
    /await db\.runTransaction\(async transaction =>/,
    /transaction\.set\(DIRECTORY_DOC\(\),\s*\{[\s\S]*churches:\s*sanitizeDirectoryChurches\(latestDirectory\)/,
    /sourceCounts,/,
    /orphans,/,
    /duplicates,/,
]) assert.match(securityMigration, pattern);
const dryRunExit = securityMigration.search(
    /if\s*\(\s*dryRun\s*\)\s*(?:\{\s*)?return\s+report\s*;/,
);
const churchTransactionStart = securityMigration.indexOf('for (let offset = 0; offset < records.length; offset += batchSize)');
const directoryTransactionStart = securityMigration.lastIndexOf('await db.runTransaction(async transaction =>');
assert.ok(dryRunExit >= 0, 'dry-run은 보고서를 반환하고 쓰기 전에 종료해야 한다.');
assert.ok(
    dryRunExit < churchTransactionStart,
    'dry-run 종료 분기가 첫 Firestore 커밋보다 앞에 있어야 한다.',
);
assert.ok(
    churchTransactionStart >= 0 && directoryTransactionStart > churchTransactionStart,
    '공개 디렉토리 정리는 모든 교회 batch 커밋 후 별도로 실행해야 한다.',
);
assert.doesNotMatch(
    securityMigration,
    /batch\.set\(DIRECTORY_DOC\(\)/,
    '공개 디렉토리를 교회 batch에 섞으면 중간 실패 시 비밀 원천을 먼저 지울 수 있다.',
);
assert.match(securityMigration, /cleanupOnlyChurchDocs[\s\S]*UNAFFILIATED_CHURCH_ID/);
assert.match(sanitizeDirectory, /id === UNAFFILIATED_CHURCH_ID/);
assert.match(securityMigration, /latestAccessByChurchId[\s\S]*if \(codeHash && !latestHash\)/);
const migrationHandlerStart = platformAdmin.indexOf('const handleCheckChurchAccessSecrets = async () =>');
const migrationHandlerEnd = platformAdmin.indexOf('const handleEnsureUnaffiliatedChurch', migrationHandlerStart);
assert.ok(migrationHandlerStart >= 0 && migrationHandlerEnd > migrationHandlerStart, '입장코드 보안 점검 UI 핸들러가 필요하다.');
const migrationHandler = platformAdmin.slice(migrationHandlerStart, migrationHandlerEnd);
const previewCall = migrationHandler.indexOf('dryRun: true');
const executeCall = migrationHandler.indexOf('dryRun: false');
assert.ok(previewCall >= 0, 'UI는 쓰기 없는 dry-run 보고서만 생성해야 한다.');
assert.equal(executeCall, -1, '운영 이전 완료 후 UI에서 dryRun:false를 실행하면 안 된다.');
assert.doesNotMatch(
    platformAdmin,
    /handleMigrateChurchAccessSecrets|migrateChurchAccessSecrets\(\{[\s\S]{0,240}dryRun:\s*false/,
    '플랫폼 관리자 UI에는 입장코드 실제 이전 실행 경로가 남으면 안 된다.',
);
assert.match(platformAdmin, /운영 이전은 완료되었습니다[\s\S]*쓰기 없이 점검합니다/);
const accessSecurityUiStart = platformAdmin.indexOf('{/* 공개 입장코드 보안 이전 */}');
const accessSecurityUiEnd = platformAdmin.indexOf('{/* 무소속 가상 교회 생성/점검 */}', accessSecurityUiStart);
assert.ok(accessSecurityUiStart >= 0 && accessSecurityUiEnd > accessSecurityUiStart, '입장코드 보안 점검 UI가 필요하다.');
const accessSecurityUi = platformAdmin.slice(accessSecurityUiStart, accessSecurityUiEnd);
assert.match(accessSecurityUi, /onClick=\{handleCheckChurchAccessSecrets\}/);
assert.match(accessSecurityUi, /'1\. 쓰기 없는 사전점검'/);
assert.equal((accessSecurityUi.match(/<button\b/g) || []).length, 1, '입장코드 보안 UI에는 dry-run 점검 버튼 하나만 있어야 한다.');
console.log('라운드 11 계약 검증 통과: 첫 화면, 소셜, 3단계 온보딩, 소속 관리, roster-only, 입장코드 서버 authority·dry-run');
