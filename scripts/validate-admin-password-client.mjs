#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = path => fs.readFileSync(path, 'utf8');
const client = read('src/utils/adminPassword.js');
const app = read('src/App.jsx');
const churchAdmin = read('src/components/ChurchAdminView.jsx');
const membersTab = read('src/components/churchAdmin/MembersTab.jsx');
const platformAdmin = read('src/components/PlatformAdminView.jsx');
const credentials = read('src/utils/memberCredentials.js');
const server = read('supabase/functions/admin-set-password/index.ts');
const core = read('supabase/functions/admin-set-password/core.ts');
const rules = read('firestore.rules');
const department = read('src/hooks/useDepartment.js');

for (const code of [
    'PARTIAL_UPDATE',
    'PASSWORD_UPDATE_ROLLED_BACK',
    'ROLLBACK_UNAVAILABLE',
    'PASSWORD_CHANGE_BUSY',
    'CREDENTIAL_MIGRATION_REQUIRED',
    'AUTHORIZATION_CHANGED',
]) {
    assert.match(client, new RegExp(code));
}
assert.match(client, /error\.code = typeof payload\.code === 'string' \? payload\.code/);
assert.match(client, /error\.status = response\.status/);
assert.match(app, /adminPasswordErrorMessage\(e\)/);
assert.match(churchAdmin, /Promise\.allSettled/);
assert.match(churchAdmin, /const succeeded = settled\.flatMap/);
assert.match(churchAdmin, /const failed = settled\.flatMap/);
assert.match(churchAdmin, /error\?\.code === 'PARTIAL_UPDATE'/);
assert.match(churchAdmin, /action\.afterSuccess\?\.\(result\.succeededUids\)/);
assert.match(churchAdmin, /retryUnsafe: Boolean\(partialUpdate\)/);
assert.match(churchAdmin, /passwordRecoveryRequired: true/);
assert.match(churchAdmin, /disabled=\{selectedMember\.passwordRecoveryRequired === true\}/);
assert.match(membersTab, /const passwordRecoveryMembers = members\.filter/);
assert.match(membersTab, /passwordRecoveryMembers[\s\S]*\.map\(member => member\.name \|\| '이름 없음'\)[\s\S]*\.join\(', '\)/);
assert.match(membersTab, /const hasPasswordRecoverySelected = selectedRows\.some/);
assert.match(membersTab, /disabled=\{hasExternalSelected \|\| hasPasswordRecoverySelected\}/);
assert.match(app, /u\.uid === uid \? \{ \.\.\.u, password: null \} : u/);

assert.match(credentials, /\{ returnResult = false \} = \{\}/);
assert.match(credentials, /\{ status: 'failed', error: e \}/);
assert.match(platformAdmin, /\{ returnResult: true \}/);
assert.match(platformAdmin, /result\.status === 'migrated'/);
assert.match(platformAdmin, /result\.status === 'skipped'/);
assert.match(platformAdmin, /failed\.length > 0/);
assert.match(platformAdmin, /passwordCredentialRequestRef\.current === requestId/);
assert.match(platformAdmin, /const closePasswordModal = \(\) =>/);

assert.match(core, /verifyPreviousPassword: \(password: string\) => Promise<boolean>/);
assert.match(core, /previousPasswordVerified = await dependencies\.verifyPreviousPassword/);
assert.match(
    core,
    /try \{[\s\S]*await dependencies\.updateAuthPassword\(newPassword\)[\s\S]*await dependencies\.updatePrivatePassword\(newPassword\)[\s\S]*\} catch \{/,
);
assert.match(server, /accounts:signInWithPassword/);
assert.match(server, /acquirePasswordLock/);
assert.match(server, /currentDocument\.exists/);
assert.match(server, /currentDocument\.updateTime/);
assert.match(server, /PASSWORD_CHANGE_LOCK_MS = 10 \* 60 \* 1000/);
assert.match(server, /hasNullPasswordMarker\(lockedContext\.targetDocument\.fields\)/);
assert.match(server, /revalidateAuthorization: async \(\) =>/);
assert.match(server, /identityPasswordFingerprint\(latestContext\.targetAuth\)/);
assert.match(server, /finally \{[\s\S]*releasePasswordLock/);
assert.match(core, /verifyCurrentPassword\(newPassword\)/);
assert.match(core, /!newPasswordIsCurrent && !previousPasswordIsCurrent/);

const privateRuleStart = rules.indexOf('match /private/{privateId}', rules.indexOf('match /users/{uid}'));
const privateRuleEnd = rules.indexOf('match /activityActions/{requestId}', privateRuleStart);
assert.ok(privateRuleStart >= 0 && privateRuleEnd > privateRuleStart);
const privateRules = rules.slice(privateRuleStart, privateRuleEnd);
assert.match(privateRules, /allow read: if privateId == 'auth'/);
assert.match(privateRules, /allow create:[\s\S]*createMatchesLegacyUser/);
assert.match(privateRules, /allow update:[\s\S]*updateMatchesLegacyUser/);
assert.match(privateRules, /credentialOwnerIsActiveOrSignupPending/);
assert.match(privateRules, /allow delete: if false;/);
assert.doesNotMatch(privateRules, /allow read, write|allow write:/);

assert.doesNotMatch(
    department,
    /collection\('users'\)/,
    '일반 회원 진행판은 users 개인정보 원문을 직접 조회하면 안 된다.',
);

console.log('✅ 관리자 비밀번호 오류 전달·부분 성공·잠금·자격증명 규칙 검증 통과');
