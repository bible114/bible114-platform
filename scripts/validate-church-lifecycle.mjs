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

assert.match(index, /completeChurchAdminSignup[\s\S]*verifiedUser\.claims\.email[\s\S]*sign_in_provider/);
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

assert.doesNotMatch(platformAdmin, /const doDeleteChurch|removeChurchFromDirectory/);
assert.match(platformAdmin, /기존 부분 삭제 기능은 잠시 중단했습니다/);
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
