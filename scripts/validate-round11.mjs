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

assert.equal(normalizeChurchEntryCode('1234'), '1234');
assert.equal(normalizeChurchEntryCode(' alpha-5 '), 'alpha-5');
assert.equal(normalizeChurchEntryCode('123'), '');
assert.equal(normalizeChurchEntryCode('x'.repeat(129)), '');
assert.equal(normalizeChurchEntryCode('ab\ncd'), '');

for (const text of ['5초만에 빠른 시작', '카카오로 시작', 'Google', '기존 회원 로그인(이름으로)', '로그인 없이 둘러보기', '공동체 등록하기']) assert.match(login, new RegExp(text.replace(/[()·]/g, '\\$&')));
assert.doesNotMatch(login, /카카오톡으로 로그인|Google로 로그인|기존 회원 로그인 \(이름·생년월일로\)/);
assert.match(login, /공동체 관리자/);
assert.match(login, /소셜 계정이 없어요/);
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
assert.match(header, /flex flex-wrap items-center gap-1\.5 w-full py-1 md:order-2[^"]*md:flex-nowrap md:justify-end/);
assert.doesNotMatch(header, /overflow-x-auto|scrollbar-hide|justify-between md:justify-end/);
assert.match(header, /hidden h-4 w-px shrink-0 bg-slate-200 md:block/);

// 기존 공동체의 입장코드 변경도 private/access 저장과 공개 비밀 삭제를
// 한 batch로 커밋해야 한다.
const saveChurchCodeStart = churchAdmin.indexOf('const saveChurchCode = async () =>');
const saveChurchCodeEnd = churchAdmin.indexOf('const saveOrg = async () =>', saveChurchCodeStart);
assert.ok(saveChurchCodeStart >= 0 && saveChurchCodeEnd > saveChurchCodeStart, '공동체 입장코드 변경 함수가 필요하다.');
const saveChurchCode = churchAdmin.slice(saveChurchCodeStart, saveChurchCodeEnd);
for (const pattern of [
    /const batch = db\.batch\(\)/,
    /batch\.set\(churchRef\.collection\('private'\)\.doc\('access'\),\s*\{[\s\S]*codeHash:\s*churchCodeHash/,
    /churchCode:\s*firebase\.firestore\.FieldValue\.delete\(\)/,
    /churchCodeHash:\s*firebase\.firestore\.FieldValue\.delete\(\)/,
    /await batch\.commit\(\)/,
]) assert.match(saveChurchCode, pattern);
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
const migrationHandlerStart = platformAdmin.indexOf('const handleMigrateChurchAccessSecrets = async () =>');
const migrationHandlerEnd = platformAdmin.indexOf('const handleEnsureUnaffiliatedChurch', migrationHandlerStart);
assert.ok(migrationHandlerStart >= 0 && migrationHandlerEnd > migrationHandlerStart, '입장코드 이전 UI 핸들러가 필요하다.');
const migrationHandler = platformAdmin.slice(migrationHandlerStart, migrationHandlerEnd);
const previewCall = migrationHandler.indexOf('dryRun: true');
const executeCall = migrationHandler.indexOf('dryRun: false');
assert.ok(previewCall >= 0, 'UI는 실제 이전 전에 dry-run 보고서를 먼저 생성해야 한다.');
assert.ok(
    executeCall > previewCall,
    'UI는 dry-run 결과를 확인한 뒤에만 dryRun:false로 실제 이전해야 한다.',
);
console.log('라운드 11 계약 검증 통과: 첫 화면, 소셜, 3단계 온보딩, 소속 관리, roster-only, 입장코드 dry-run');
