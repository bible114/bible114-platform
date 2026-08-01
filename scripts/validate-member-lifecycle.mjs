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
const lifecycle = read('supabase/functions/platform-api/memberLifecycleService.ts');
const lifecycleTest = read('supabase/functions/platform-api/memberLifecycleService_test.ts');
const stats = read('supabase/functions/platform-api/platformStatsService.ts');
const statsTest = read('supabase/functions/platform-api/platformStatsService_test.ts');
const signupCore = read('supabase/functions/platform-api/memberSignupCore.ts');
const signupService = read('supabase/functions/platform-api/completeChurchAdminSignupService.ts');
const churchLifecycle = read('supabase/functions/platform-api/adminChurchLifecycleService.ts');
const client = read('src/utils/platformApi.js');
const app = read('src/App.jsx');
const churchAdmin = read('src/components/ChurchAdminView.jsx');
const platformAdmin = read('src/components/PlatformAdminView.jsx');
const rules = read('firestore.rules');
const rulesSafety = read('scripts/test-firestore-rules-safety.mjs');

assert.match(core, /SET_MEMBER_ACTIVE_STATE_ACTION\s*=\s*"setMemberActiveState"/);
assert.match(core, /action === SET_MEMBER_ACTIVE_STATE_ACTION[\s\S]*allowedKeys[\s\S]*"memberUid"[\s\S]*typeof active !== "boolean"/);
assert.match(index, /parsed\.action === "setMemberActiveState"[\s\S]*setMemberActiveState\(service, verifiedUser/);
assert.match(lifecycle, /beginTransaction\([\s\S]*const actorPath = `users\/\$\{actorUid\}`[\s\S]*const memberPath = `users\/\$\{memberUid\}`[\s\S]*const ledgerPath = `\$\{LEDGER_COLLECTION\}\/\$\{input\.requestId\}`[\s\S]*STATS_PATH/);
assert.match(lifecycle, /countedBefore !== expectedBefore[\s\S]*회원 통계 원장을 먼저 전수 재계산/);
assert.match(lifecycle, /updateMask: \[[\s\S]*PLATFORM_STATS_READER_COUNTED_FIELD[\s\S]*"updatedAt"/);
assert.match(lifecycle, /dependencies\.updateWrite\(service\.projectId, STATS_PATH[\s\S]*total_readers: nextReaders/);
assert.match(lifecycle, /dependencies\.updateWrite\(service\.projectId, ledgerPath[\s\S]*SET_MEMBER_ACTIVE_STATE_ACTION/);
assert.match(lifecycle, /commitWrites\([\s\S]*\{ transaction \}/);
assert.match(lifecycleTest, /복원은 false marker에서만 독자 수를 한 번 증가시키고 replay한다/);
assert.match(lifecycleTest, /marker 누락 또는 타 교회 관리자는 쓰기 전에 거부한다/);

assert.match(client, /export const setMemberActiveState[\s\S]*callPlatformApi\('setMemberActiveState'/);
assert.match(client, /MEMBER_ACTIVE_STATE_RESULT_KEYS[\s\S]*'totalReaders'[\s\S]*'deletedAt'/);
const appDelete = sliceBetween(app, 'const deleteUser = async', '\n    const changePassword');
assert.match(appDelete, /setMemberActiveState\([\s\S]*memberUid: uid[\s\S]*active: false/);
assert.doesNotMatch(appDelete, /collection\('users'\)|\.set\(/);
const appEdit = sliceBetween(app, 'const saveEditUser = async', '\n    /*\n     ============================================================================');
const appEditUpdateData = sliceBetween(appEdit, 'const updateData = {', '\n                transaction.set');
assert.match(appEditUpdateData, /churchId[\s\S]*churchName[\s\S]*departmentId[\s\S]*departmentName[\s\S]*subgroupId[\s\S]*subgroupName[\s\S]*updatedAt/);
assert.doesNotMatch(appEditUpdateData, /\b(?:planId|currentDay|readCount|score|streak|lastReadDate)\b/,
    '관리자 조직 편집 writer는 읽기 원장 필드를 저장하면 안 됩니다.');
const churchDelete = sliceBetween(churchAdmin, 'const executeDeleteMember = async', '\n    const restoreMember');
const churchRestore = sliceBetween(churchAdmin, 'const executeRestoreMember = async', '\n    const generatePassword');
assert.match(churchDelete, /setMemberActiveState\([\s\S]*active: false/);
assert.match(churchRestore, /setMemberActiveState\([\s\S]*active: true/);
assert.doesNotMatch(`${churchDelete}\n${churchRestore}`, /collection\('users'\)|\.set\(/);

const usersRules = sliceBetween(rules, 'match /users/{uid} {', '\n      match /private/consent');
const usersRead = sliceBetween(usersRules, 'allow read:', '\n      // 모든 최초 users');
assert.match(usersRead, /request\.auth\.uid == uid/);
assert.match(usersRead, /sameChurch\(resource\.data\.churchId\)/);
assert.match(usersRead, /exists\(\/databases\/\$\(database\)\/documents\/churches\/\$\(resource\.data\.churchId\)\/roster\/\$\(request\.auth\.uid\)\)/);
assert.doesNotMatch(usersRules, /deletedAt == request\.time[\s\S]*deletedBy == request\.auth\.uid/);
const platformAdminOrgRule = sliceBetween(rules,
    'function isPlatformAdminMemberOrganizationUpdate',
    '\n    function isPlatformAdminCredentialParentCleanup');
assert.match(platformAdminOrgRule, /before\.get\('role', null\) == 'member'/);
assert.match(platformAdminOrgRule, /after\.get\('role', null\) == before\.get\('role', null\)/);
assert.match(platformAdminOrgRule, /before\.get\('accountType', null\) != 'personal'/);
assert.match(platformAdminOrgRule, /after\.get\('accountType', null\) == before\.get\('accountType', null\)/);
assert.match(platformAdminOrgRule, /before\.get\('isDeleted', false\) == false[\s\S]*after\.get\('isDeleted', false\) == false/);
assert.match(platformAdminOrgRule, /changed\.hasAny\(\[[\s\S]*'churchId'[\s\S]*'subgroupName'/);
assert.match(platformAdminOrgRule, /changed\.hasOnly\(\[[\s\S]*'churchId'[\s\S]*'subgroupName', 'updatedAt'/);
assert.match(platformAdminOrgRule, /changed\.hasAny\(\['updatedAt'\]\)[\s\S]*after\.updatedAt == request\.time/);

const platformAdminCredentialRule = sliceBetween(rules,
    'function isPlatformAdminCredentialParentCleanup',
    '\n    function isPlatformAdminTalentReset');
assert.match(platformAdminCredentialRule, /changed\.hasAny\(\['password', 'phone4'\]\)/);
assert.match(platformAdminCredentialRule, /changed\.hasOnly\(\['password', 'phone4'\]\)/);
assert.match(platformAdminCredentialRule, /after\.keys\(\)\.hasAll\(\['password'\]\)/);
assert.match(platformAdminCredentialRule, /after\.password == null/);
assert.match(platformAdminCredentialRule, /!after\.keys\(\)\.hasAny\(\['phone4'\]\)/);
assert.match(platformAdminCredentialRule, /hasProtectedCredentialCopy\(uid, before\)/);
assert.match(rules, /function hasProtectedCredentialCopy\(uid, before\)[\s\S]*existsAfter\(path\)[\s\S]*getAfter\(path\)\.data\.password == before\.password[\s\S]*getAfter\(path\)\.data\.phone4 == before\.phone4/);

const platformAdminTalentRule = sliceBetween(rules,
    'function isPlatformAdminTalentReset',
    '\n    function isPlatformAdminTimestampTouch');
assert.match(platformAdminTalentRule, /changed\.hasAny\(\['talent', 'talentMigrated', 'talentWalletMigrated'\]\)/);
assert.match(platformAdminTalentRule, /changed\.hasOnly\(\[[\s\S]*'talent', 'talentMigrated', 'talentWalletMigrated', 'updatedAt'/);
assert.match(platformAdminTalentRule, /after\.talent == 0[\s\S]*after\.talentMigrated == true[\s\S]*after\.talentWalletMigrated == true[\s\S]*after\.updatedAt == request\.time/);

const platformAdminTouchRule = sliceBetween(rules,
    'function isPlatformAdminTimestampTouch',
    '\n    // 사용자가 브라우저에서 직접 바꿀 수 있는 값');
assert.match(platformAdminTouchRule, /changed\.hasAny\(\['updatedAt'\]\)[\s\S]*changed\.hasOnly\(\['updatedAt'\]\)[\s\S]*after\.updatedAt == request\.time/);

const platformAdminUsersWrite = sliceBetween(usersRules,
    '(isPlatformAdmin() && (',
    '\n      // 구형 users.memos');
assert.match(platformAdminUsersWrite, /isPlatformAdminMemberOrganizationUpdate\(/);
assert.match(platformAdminUsersWrite, /isPlatformAdminCredentialParentCleanup\(/);
assert.match(platformAdminUsersWrite, /isPlatformAdminTalentReset\(/);
assert.match(platformAdminUsersWrite, /isPlatformAdminTimestampTouch\(/);
assert.doesNotMatch(platformAdminUsersWrite, /!request\.resource\.data\.diff/);
assert.match(usersRules, /isSafeSelfPreferenceUpdate\(resource\.data, request\.resource\.data\)[\s\S]*isSafeSelfPlanChange\(resource\.data, request\.resource\.data\)/);

assert.match(signupCore, /STATS_REBUILD_REQUIRED/);
assert.match(signupCore, /PLATFORM_STATS_READER_COUNTED_FIELD[\s\S]*readerDelta: countedAfter/);
const memberSignup = sliceBetween(index, 'if (parsed.action === "completeMemberSignup")', '\n    // 개인 계정의 최초');
assert.match(memberSignup, /try \{[\s\S]*validateMemberSignup\([\s\S]*buildMemberReactivation\([\s\S]*catch \(error\)[\s\S]*memberSignupValidationError\(error\)/);
assert.match(index, /case "STATS_REBUILD_REQUIRED":[\s\S]*new PlatformError\("CONFLICT"/);
assert.match(memberSignup, /platformStatsReaderCounted: true/);
const personalSignup = sliceBetween(index, 'if (parsed.action === "completePersonalSignup")', '\n    if (parsed.action === "syncAchievements")');
assert.match(personalSignup, /platformStatsReaderCounted: true/);
assert.match(signupService, /role: "churchAdmin"[\s\S]*platformStatsReaderCounted: true/);

assert.match(stats, /markerBackfillDocuments[\s\S]*toCounted[\s\S]*toUncounted/);
assert.match(stats, /const needsApply = changed\.length > 0 \|\| markerBackfill\.total > 0/);
assert.match(stats, /const writes = \[\.\.\.userSnapshotWrites, \.\.\.sourceVerifies, statsWrite\][\s\S]*writes\.length > 500/);
assert.match(stats, /updateMask: \[[\s\S]*\.\.\.expectedKeys,[\s\S]*"rebuiltBy"/);
assert.match(statsTest, /통계 값이 같아도 marker 누락은 dry-run과 apply 대상이다/);
assert.match(statsTest, /실제 verify\+marker\+stats 쓰기 500건까지만 허용한다/);
assert.match(client, /REBUILD_PLATFORM_STATS_RESULT_KEYS[\s\S]*'markerBackfill'[\s\S]*'externalSources'/);
assert.match(platformAdmin, /preview\.changed\.length === 0 && preview\.markerBackfill\.total === 0/);
assert.match(stats, /data\.lifecycleStatus === "deactivating"[\s\S]*data\.lifecycleStatus === "restoring"[\s\S]*throw new PlatformError\("CONFLICT"/);

const markerGuard = churchLifecycle.indexOf('managedUsers.some');
const firstChurchMutation = churchLifecycle.indexOf('if (!input.active && !resumingDeactivation)');
assert.ok(markerGuard >= 0 && firstChurchMutation > markerGuard,
    '공동체 lifecycle은 어떤 부분 쓰기보다 먼저 전체 회원 marker를 검증해야 합니다.');
assert.match(churchLifecycle, /\[PLATFORM_STATS_READER_COUNTED_FIELD\]: false/);
assert.match(churchLifecycle, /ADMIN_CHURCH_LIFECYCLE_RELEASE_BLOCKED = true[\s\S]*if \(ADMIN_CHURCH_LIFECYCLE_RELEASE_BLOCKED\)[\s\S]*일시 중단되었습니다/);
assert.match(platformAdmin, /통계 정산 보완 중 — 공동체 비활성화·복원 일시중단[\s\S]*<button[\s\S]*disabled[\s\S]*공동체 (?:복원|비활성화) 일시중단/);
const seedDelete = sliceBetween(platformAdmin, 'const deleteSeedUsers = async', '\n    const deleteChurch');
assert.doesNotMatch(seedDelete, /batch\.delete|\.delete\(/);
assert.match(seedDelete, /통계 원장과 결속된 서버 작업이 마련될 때까지 지원하지 않습니다/);
const seedCreate = sliceBetween(platformAdmin, 'const seedFakeUsers =', '\n    const deleteSeedUsers');
assert.match(seedCreate, /alert\('테스트 계정 생성은 통계 원장과 결속된 서버 작업이 마련될 때까지 지원하지 않습니다\.'\)/);
assert.doesNotMatch(seedCreate, /batch\.set|collection\s*\(\s*['"]users['"]\s*\)/,
    'seedFakeUsers에는 users 생성 writer가 남아 있으면 안 됩니다.');
assert.match(platformAdmin, /onClick=\{seedFakeUsers\}[\s\S]*disabled[\s\S]*가짜 교인 추가 일시중단/);
assert.match(usersRules, /allow delete: if false;/);
const progressReference = sliceBetween(platformAdmin,
    '{/* 서버 읽기 원장 참고값 — 이 모달에서는 수정하지 않는다. */}',
    '\n                        <div className="flex gap-2 pt-4">');
assert.match(progressReference, /DAY \{editingUser\.currentDay \|\| 1\}/);
assert.match(progressReference, /\{editingUser\.readCount \|\| 1\}독/);
assert.match(progressReference, /읽기 진도와 회독은 서버 읽기 원장에서만 변경됩니다/);
assert.doesNotMatch(progressReference, /<input|onChange=|setEditingUser\(/,
    '관리자 모달의 읽기 원장 참고값은 편집 컨트롤이면 안 됩니다.');

const platformAdminAllowlistCases = [
    '플랫폼 관리자의 active 일반 member 조직 변경 허용',
    '플랫폼 관리자의 active credential parent 정리 허용',
    '플랫폼 관리자의 deleted credential parent 정리 허용',
    '플랫폼 관리자의 private 보호 사본 없는 credential parent 정리 거부',
    '플랫폼 관리자의 password 불일치 credential parent 정리 거부',
    '플랫폼 관리자의 phone4 불일치 credential parent 정리 거부',
    '플랫폼 관리자의 active talent reset 허용',
    '플랫폼 관리자의 deleted talent reset 허용',
    '플랫폼 관리자의 updatedAt-only timestamp touch 허용',
    '본인의 정규화된 plan 변경 허용',
    '본인의 GoogleLink provider 메타데이터 변경 허용',
    '플랫폼 관리자의 planId 단독 변경 거부',
    '플랫폼 관리자의 currentDay 단독 변경 거부',
    '플랫폼 관리자의 readCount 단독 변경 거부',
    '플랫폼 관리자의 score 단독 변경 거부',
    '플랫폼 관리자의 streak 단독 변경 거부',
    '플랫폼 관리자의 lastReadDate 단독 변경 거부',
    '플랫폼 관리자의 읽기 ledger 묶음 변경 거부',
    '플랫폼 관리자의 arbitrary talent 변경 거부',
    '플랫폼 관리자의 role escalation 거부',
];
platformAdminAllowlistCases.forEach(label => {
    assert.ok(rulesSafety.includes(`'${label}'`), `Rules API 독립 계약 누락: ${label}`);
});

console.log('✅ Member lifecycle/stat ledger server authority validation passed');
