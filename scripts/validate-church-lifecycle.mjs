import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = path => fs.readFileSync(path, 'utf8');
const sliceBetween = (source, start, end) => {
    const startIndex = source.indexOf(start);
    const endIndex = source.indexOf(end, startIndex + start.length);
    assert.ok(startIndex >= 0 && endIndex > startIndex, `${start} 계약 범위를 찾을 수 없습니다.`);
    return source.slice(startIndex, endIndex);
};

const core = read('supabase/functions/platform-api/core.ts');
const index = read('supabase/functions/platform-api/index.ts');
const client = read('src/utils/platformApi.js');
const app = read('src/App.jsx');
const auth = read('src/hooks/useAuth.js');
const churchAdmin = read('src/components/ChurchAdminView.jsx');
const platformAdmin = read('src/components/PlatformAdminView.jsx');
const rules = read('firestore.rules');
const signupService = read('supabase/functions/platform-api/completeChurchAdminSignupService.ts');
const rotateService = read('supabase/functions/platform-api/rotateChurchAccessCodeService.ts');
const ensureService = read('supabase/functions/platform-api/ensureUnaffiliatedChurchService.ts');
const ensureCore = read('supabase/functions/platform-api/ensureUnaffiliatedChurchCore.ts');
const renameService = read('supabase/functions/platform-api/adminChurchRenameService.ts');
const renameServiceTest = read('supabase/functions/platform-api/adminChurchRenameService_test.ts');
const normalizeService = read('supabase/functions/platform-api/normalizeLegacyReadingPositionService.ts');
const userAuth = read('src/hooks/useUserAuth.js');
const constants = read('src/data/constants.js');

for (const action of [
    'completeChurchAdminSignup',
    'rotateChurchAccessCode',
    'ensureUnaffiliatedChurch',
]) {
    assert.match(core, new RegExp(`"${action}"`), `${action} parser가 필요합니다.`);
    assert.match(index, new RegExp(`parsed\\.action === "${action}"`), `${action} router가 필요합니다.`);
    assert.match(client, new RegExp(`callPlatformApi\\('${action}'`), `${action} client가 필요합니다.`);
}

assert.match(core, /ADMIN_RENAME_CHURCH_ACTION = "adminRenameChurch" as const/);
assert.match(index, /parsed\.action === "adminRenameChurch"[\s\S]*adminRenameChurch\(service, verifiedUser/);
assert.match(client, /callPlatformApi\('adminRenameChurch', payload/);
for (const pattern of [
    /const ledgerPath = `platformAdminActions\/\$\{input\.requestId\}`/,
    /const churchPath = `churches\/\$\{input\.churchId\}`/,
    /const publicPath = `publicChurches\/\$\{input\.churchId\}`/,
    /const legacyPath = "settings\/churchDirectory"/,
    /updateMask: \["name", "updatedAt"\]/,
    /churches: decision\.legacyChurches, updatedAt: now/,
    /MAX_TRANSACTION_ATTEMPTS = 3/,
]) assert.match(renameService, pattern);
assert.match(renameServiceTest, /한 transaction에서 바꾼다/);
assert.match(renameServiceTest, /apply-then-409/);
assert.match(renameServiceTest, /legacy 비밀 drift/);

const renameStart = platformAdmin.indexOf('const renameChurch = async');
const renameEnd = platformAdmin.indexOf('\n    };', renameStart) + 7;
assert.ok(renameStart >= 0 && renameEnd > renameStart, '공동체 이름 변경 UI 진입점이 필요합니다.');
const renameContract = platformAdmin.slice(renameStart, renameEnd);
assert.match(renameContract, /await adminRenameChurch\(\{[\s\S]*churchId: church\.id[\s\S]*name: nextName[\s\S]*expectedUid: currentUser\?\.uid/);
assert.match(renameContract, /invalidateChurchDirectoryCache\(\)/);
assert.doesNotMatch(renameContract, /db\.|\.update\(|\.set\(/, '이름 변경 UI가 브라우저에서 직접 쓰면 안 됩니다.');
assert.match(normalizeService, /`churches\/\$\{user\.churchId\}`[\s\S]*churchNameNeedsRepair/);
assert.match(normalizeService, /churchNameNeedsRepair \? \{ churchName: authoritativeChurchName \} : \{\}/);
assert.match(userAuth, /normalizedData\.churchName[\s\S]*user\.churchName = normalizedData\.churchName/);

assert.match(index, /completeChurchAdminSignup[\s\S]*churchAdminSignupIdentityFromVerifiedUser\(\{[\s\S]*uid: verifiedUser\.uid,[\s\S]*signInProvider: verifiedUser\.signInProvider,[\s\S]*claims: verifiedUser\.claims/);
assert.match(signupService, /churchLifecycleActions\/\$\{signup\.requestId\}/);
assert.match(signupService, /publicChurches\/\$\{churchId\}/);
assert.match(signupService, /platformInternal\/publicDirectoryRebuild/);
assert.doesNotMatch(signupService, /platformStats/);
assert.match(rotateService, /const churchPath = `churches\/\$\{input\.churchId\}`[\s\S]*const ledgerPath = `\$\{churchPath\}\/adminActions\/\$\{input\.requestId\}`/);
assert.match(rotateService, /expectedVersion[\s\S]*nextVersion/);
assert.match(ensureService, /const publicPath = `publicChurches\/\$\{UNAFFILIATED_CHURCH_ID\}`/);
assert.match(ensureService, /PUBLIC_META_PATH = "publicDirectoryMeta\/current"/);
assert.match(ensureService, /PUBLIC_REBUILD_LOCK_PATH = "platformInternal\/publicDirectoryRebuild"/);
assert.match(ensureService, /if \(rebuildLockDocument\)[\s\S]*retryableConflict/);
assert.match(ensureService, /publicDirectoryMeta:\s*publicMetaDocument\?\.data \|\| null/);
assert.match(ensureService, /if \(decision\.publicExists\)[\s\S]*deleteWrite\(service\.projectId, publicPath, true\)/);
assert.match(ensureService, /if \(decision\.publicMetaNeedsFallback\)[\s\S]*ready:\s*false[\s\S]*mode:\s*"legacy"[\s\S]*updateMask:\s*\["ready", "mode", "schemaVersion", "updatedAt"\]/);
assert.match(ensureCore, /UNAFFILIATED_CHURCH_NAME = "성경 읽는 사람들" as const/);
assert.match(constants, /UNAFFILIATED_CHURCH_NAME = '성경 읽는 사람들'/);
assert.doesNotMatch(ensureCore, /개인 성도 \(소속 교회 없음\)/);
const legacySanitizer = sliceBetween(ensureCore, 'const withoutUnaffiliated = (', '\nconst inspectPublicDirectoryMeta');
assert.match(legacySanitizer, /const rootKeys = Object\.keys\(legacyDirectory\)\.sort\(\)/);
assert.match(legacySanitizer, /const seen = new Set<string>\(\)/);
assert.match(legacySanitizer, /!id \|\| !name \|\| seen\.has\(id\)/);
assert.match(legacySanitizer, /typeof entry\.hidden !== "boolean"/);
assert.match(legacySanitizer, /const projection:[\s\S]*id,[\s\S]*name,[\s\S]*entry\.hidden === true \? \{ hidden: true \} : \{\}/);
assert.match(legacySanitizer, /actualKeys\.length !== expectedKeys\.length/);
assert.doesNotMatch(legacySanitizer, /churches\.push\(entry\)|\b(?:codeHash|churchCodeHash|churchCode|code)\s*:/);
const legacyRepair = sliceBetween(ensureService, 'if (decision.legacyNeedsWrite) {', '\n    if (decision.publicExists)');
assert.match(legacyRepair, /updateWrite\(service\.projectId, legacyPath, \{[\s\S]*churches: decision\.legacyChurches,[\s\S]*updatedAt: now,[\s\S]*\}, \{[\s\S]*exists: true/);
assert.doesNotMatch(legacyRepair, /updateMask/);

const adminSignup = sliceBetween(auth, 'const handleChurchAdminSignup = async', '\n    return {');
assert.match(adminSignup, /completeChurchAdminSignupViaApi/);
assert.match(adminSignup, /get\(\{ source: 'server' \}\)/);
assert.match(adminSignup, /signInWithEmailAndPassword\(normalizedSignupEmail, password\)/);
assert.doesNotMatch(adminSignup, /db\.runTransaction/);
assert.doesNotMatch(adminSignup, /collection\('churches'\)\.doc\(\)/);
assert.doesNotMatch(adminSignup, /platformStats/);

const codeRotation = sliceBetween(churchAdmin, 'const saveChurchCode = async', '\n    const saveOrg = async');
assert.match(churchAdmin, /import \{ auth, db, firebase \} from '\.\.\/utils\/firebase'/);
assert.match(churchAdmin, /const currentUserRef = useRef\(currentUser\);\s*currentUserRef\.current = currentUser/);
assert.match(churchAdmin, /\[currentUser\?\.uid, currentUser\?\.churchId\][\s\S]{0,160}\/\/ 조직 관리/);
assert.match(codeRotation, /rotateChurchAccessCode/);
assert.match(codeRotation, /private'\)\.doc\('access'\)\.get\(\{ source: 'server' \}\)/);
assert.match(codeRotation, /pendingChurchCodeRequestRef/);
assert.match(codeRotation, /const requestUid = requestStartUser\?\.uid;\s*const requestChurchId = requestStartUser\?\.churchId/);
assert.match(codeRotation, /auth\?\.currentUser\?\.uid === requestUid[\s\S]*currentUserRef\.current\?\.uid === requestUid[\s\S]*currentUserRef\.current\?\.churchId === requestChurchId/);
assert.match(codeRotation, /candidate\?\.uid === requestUid[\s\S]*candidate\?\.churchId === requestChurchId/);
assert.match(codeRotation, /const accessDoc = await[\s\S]*get\(\{ source: 'server' \}\);\s*if \(!requestOwnsUi\(\)\) return;/);
assert.match(codeRotation, /uid:\s*requestUid,[\s\S]*churchId:\s*requestChurchId,[\s\S]*requestId:\s*createRequestId\(\)/);
assert.match(codeRotation, /expectedUid:\s*requestUid[\s\S]*if \(!requestContextIsCurrent\(\)\) \{\s*clearPendingIfCurrent\(pending\);\s*return;/);
assert.match(codeRotation, /if \(!requestOwnsUi\(\) \|\| !pendingRequestIsCurrent\(pending\)\) return;[\s\S]*alert\('입장코드가 변경되었습니다!'\)/);
assert.match(codeRotation, /catch \(e\) \{\s*if \(!requestContextIsCurrent\(\)\) \{[\s\S]*return;[\s\S]*if \(!requestOwnsUi\(\)[\s\S]*return;[\s\S]*if \(pending && e\?\.retryable !== true\) clearPendingIfCurrent\(pending\);[\s\S]*alert\(e\?\.message \|\| '변경 실패'\)/);
assert.doesNotMatch(codeRotation, /sha256|batch\.set|\.commit\(/);

const ensureVirtual = sliceBetween(platformAdmin, 'const handleEnsureUnaffiliatedChurch = async', '\n    \/\/ 교회 검색 노출');
assert.match(ensureVirtual, /ensureUnaffiliatedChurch/);
assert.doesNotMatch(ensureVirtual, /db\.collection\('churches'\)|\.set\(/);

const churchAdminLoad = sliceBetween(churchAdmin, 'const loadData = async', '\n    // 이관 완료된 회원');
assert.match(churchAdmin, /import \{ SITE_URL, UNAFFILIATED_CHURCH_ID \} from '\.\.\/data\/constants'/);
assert.match(churchAdminLoad, /currentUser\.churchId === UNAFFILIATED_CHURCH_ID[\s\S]*Promise\.resolve\(\{ docs: \[\] \}\)[\s\S]*where\('churchId', '==', currentUser\.churchId\)\.get\(\)/);
assert.match(churchAdminLoad, /const \[membersSnap, rosterSnap[\s\S]*membersRequest/);
assert.match(churchAdminLoad, /catch \(e\)[\s\S]*setLoadError\([\s\S]*finally \{\s*setLoading\(false\)/);
assert.match(churchAdmin, /ADMIN_INITIAL_LOAD_TIMEOUT_MS = 15_000[\s\S]*withAdminLoadTimeout/);
assert.match(churchAdminLoad, /withAdminLoadTimeout\(Promise\.all\(\[[\s\S]*setLoading\(false\);[\s\S]*const externalMemberIds/);
assert.match(platformAdmin, /import \{ UNAFFILIATED_CHURCH_ID \} from '\.\.\/data\/constants'/);
assert.match(platformAdmin, /selectedChurch\.id === UNAFFILIATED_CHURCH_ID \|\| selectedChurch\.isVirtual === true[\s\S]*플랫폼 가상 공동체/);
assert.match(platformAdmin, /href=\{`mailto:\$\{selectedChurch\.adminEmail\}`\}[\s\S]*href=\{`mailto:\$\{church\.adminEmail\}`\}/);
assert.match(signupService, /adminPath,[\s\S]*adminEmail: signup\.contactEmail/);

assert.doesNotMatch(platformAdmin, /const doDeleteChurch|removeChurchFromDirectory/);
assert.match(platformAdmin, /adminSetChurchLifecycle/);
assert.match(platformAdmin, /외부 소속·달란트·미처리 구매는 삭제하거나 자동 환불하지 않습니다/);
assert.match(index, /parsed\.action === "adminSetChurchLifecycle"[\s\S]*adminSetChurchLifecycle\(service, verifiedUser/);
assert.match(client, /callPlatformApi\('adminSetChurchLifecycle'/);
assert.doesNotMatch(platformAdmin, /migrateChurchAccessSecrets\(\{[\s\S]{0,120}dryRun:\s*false/);

const platformUserEdit = sliceBetween(app, 'const saveEditUser = async', '\n    /*');
assert.doesNotMatch(platformUserEdit, /const originalUser = allUsers\.find/);
assert.match(
    platformUserEdit,
    /db\.runTransaction\(async transaction => \{[\s\S]*transaction\.get\(userRef\)[\s\S]*const latestUser = latestDoc\.data\(\)[\s\S]*latestUser\.role !== 'member' && churchIdentityChanged[\s\S]*EDIT_ADMIN_IDENTITY_CONFLICT/,
);
assert.match(
    platformUserEdit,
    /const canEditMemberOrganization = latestUser\.role === 'member'[\s\S]*latestUser\.accountType !== 'personal'[\s\S]*\.\.\.\(canEditMemberOrganization \? \{[\s\S]*churchId: editingUser\.churchId[\s\S]*\} : \{\}\)[\s\S]*transaction\.set\(userRef, updateData, \{ merge: true \}\)/,
);
assert.doesNotMatch(
    platformUserEdit,
    /db\.collection\('users'\)\.doc\(editingUser\.uid\)\.set/,
);

assert.match(rules, /match \/churches\/\{churchId\}[\s\S]*allow create: if false;/);
assert.match(rules, /allow update: if \(isChurchAdmin\(churchId\) \|\| isPlatformAdmin\(\)\)[\s\S]*hasOnly\([\s\S]*'departments'[\s\S]*'updatedAt'/);
assert.match(rules, /match \/churches\/\{churchId\}[\s\S]*match \/private\/\{privateId\}[\s\S]*allow write: if false;/);
assert.match(rules, /match \/settings\/churchDirectory[\s\S]*allow read: if true;[\s\S]*allow write: if false;/);
const genericSettingsStart = rules.lastIndexOf('match /settings/{settingId} {');
assert.ok(genericSettingsStart >= 0, 'generic settings 규칙이 필요합니다.');
const genericSettings = rules.slice(genericSettingsStart);
assert.match(
    genericSettings,
    /allow write: if settingId != 'churchDirectory' && isPlatformAdmin\(\);/,
    'generic settings 규칙이 churchDirectory 서비스 전용 쓰기를 우회하면 안 됩니다.',
);

console.log('✅ Church lifecycle server authority validation passed');
