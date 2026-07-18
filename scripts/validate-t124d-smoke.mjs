import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = relativePath => fs.readFileSync(new URL(`../${relativePath}`, import.meta.url), 'utf8');
const runner = read('scripts/run-t124d-smoke.mjs');
const packageJson = JSON.parse(read('package.json'));

assert.match(runner, /const PREFIX = 'e2e_t124d_20260718_';/);
assert.match(runner, /const FIXTURE_TYPE = 't124d-smoke';/);
assert.match(runner, /const INITIAL_TALENT = 3;/);
assert.match(runner, /accounts\.length !== 4/);
assert.match(runner, /raw\.accounts\[0\]\?\.role !== 'churchAdmin'/);
assert.match(runner, /raw\.accounts\.slice\(1\)\.some\(user => user\.role !== 'member'\)/);
assert.match(runner, /const derivedChurchId = command === 'create' \? `\$\{PREFIX\}\$\{runId\}` : '';/);
assert.doesNotMatch(runner, /options\[['"]church-id['"]\]|options\.churchId/,
    '기존 운영 교회 ID를 직접 인자로 받을 수 없어야 한다.');

for (const verb of ['CREATE', 'RUN', 'CLEANUP']) {
    assert.match(runner, new RegExp(`requireApply\\('${verb}', churchId\\)`));
}
assert.match(runner, /const expectedConfirmation = \(verb, churchId\) => `\$\{verb\}_T124D_SMOKE:\$\{churchId\}`/);
assert.match(runner, /mode: 0o600/);
assert.match(runner, /fs\.chmodSync\(manifestPath, 0o600\)/);
assert.match(runner, /\(fs\.statSync\(resolved\)\.mode & 0o777\) !== 0o600/);
assert.match(runner, /fixtureOwnershipToken: crypto\.randomBytes\(32\)\.toString\('hex'\)/);
assert.match(runner, /\^\[0-9a-f\]\{64\}\$/);

const createTargets = [...runner.matchAll(/createWrite\((`[^`]+`|'[^']+')/g)].map(match => match[1]);
assert.ok(createTargets.length >= 3, 'fixture 생성 write 계약이 필요하다.');
for (const target of createTargets) {
    assert.match(target, /^(?:`churches\/\$\{churchId\}|`users\/\$\{user\.uid\})/,
        `fixture 생성 write가 churches/users 범위를 벗어났습니다: ${target}`);
}
for (const protectedPath of [
    'settings/churchDirectory', 'publicDirectoryMeta/current', 'settings/platformStats',
]) assert.match(runner, new RegExp(`['"]${protectedPath.replace('/', '\\/')}['"]`));
assert.doesNotMatch(runner,
    /createWrite\((?:`|['"])(?:settings\/churchDirectory|publicDirectoryMeta\/current|settings\/platformStats|publicChurches\/)/,
    'public directory/meta/platformStats에 fixture 생성 write가 있으면 안 된다.');
assert.match(runner,
    /const createWrite = \(documentPath, data\) => \(\{[\s\S]*currentDocument: \{ exists: false \}/,
    'create preflight 뒤 경합도 atomic exists:false commit으로 막아야 한다.');

const rollbackStart = runner.indexOf("manifest.status = 'create-failed'");
const rollbackEnd = runner.indexOf('\n    process.exit(0);', rollbackStart);
assert.ok(rollbackStart >= 0 && rollbackEnd > rollbackStart, 'create rollback 분기가 필요하다.');
const rollback = runner.slice(rollbackStart, rollbackEnd);
const ownershipAudit = rollback.indexOf('rollbackOwnershipAudit(manifest)');
const ownershipGate = rollback.indexOf('if (ownership.owned)');
const firestoreRollback = rollback.indexOf('commit(ownership.documents.map', ownershipGate);
const authRollback = rollback.indexOf('for (const uid of createdAuth.reverse())', firestoreRollback);
assert.ok(ownershipAudit >= 0 && ownershipAudit < ownershipGate && ownershipGate < firestoreRollback
    && firestoreRollback < authRollback,
    'create rollback은 전체 소유권 감사 → owned gate → 조건부 Firestore 삭제 → exact Auth 삭제 순서여야 한다.');
assert.doesNotMatch(rollback, /deleteTree\(/,
    'create rollback이 소유권 확인 없이 tree를 순차 삭제하면 안 된다.');
assert.match(rollback, /deleteWrite\(document\.path, document\.updateTime\)/);
assert.match(rollback, /fixtureCommitConfirmed[\s\S]*fixtureCommitAttempted && ownership\.owned[\s\S]*not-applied-or-collision/,
    'commit 성공·응답유실·미적용 충돌 결과를 구분해야 한다.');
assert.match(runner,
    /const rollbackOwnershipAudit[\s\S]*documents\.every\(exactMarker\)[\s\S]*expectedPaths[\s\S]*actualPaths\.has/,
    '예상 문서 전체의 비밀 fixture marker가 정확해야 rollback 소유권을 인정해야 한다.');

assert.equal((runner.match(/callAction\(deliverJwt, 'purchaseItem'/g) || []).length, 1);
assert.equal((runner.match(/callAction\(refundJwt, 'purchaseItem'/g) || []).length, 1);
for (const action of ['adminCounterSale', 'adminDeliverPurchase', 'adminRefundPurchase']) {
    assert.equal((runner.match(new RegExp(`callAction\\([^\\n]+, '${action}'`, 'g')) || []).length, 2,
        `${action} 최초 요청과 동일 requestId replay가 모두 필요하다.`);
}
assert.match(runner, /saleReplay\.alreadyCompleted/);
assert.match(runner, /deliveredReplay\.alreadyCompleted/);
assert.match(runner, /refundedReplay\.alreadyCompleted/);

assert.match(runner,
    /const deleteWrite = \(documentPath, updateTime\)[\s\S]*currentDocument: \{ updateTime \}/,
    '삭제 write는 읽은 updateTime 전제조건을 가져야 한다.');
assert.doesNotMatch(runner, /deleteWrite\([^,()]+\)/,
    'updateTime 없이 삭제 write를 만들면 안 된다.');
assert.match(runner, /deleteWrite\(childPath, currentChild\.updateTime\)/);
assert.match(runner, /deleteWrite\(documentPath, current\.updateTime\)/);

const cleanupStart = runner.indexOf("if (command === 'cleanup')");
assert.ok(cleanupStart >= 0, 'cleanup 명령이 필요하다.');
const cleanup = runner.slice(cleanupStart);
const snapshotBefore = cleanup.indexOf('const cleanupProtectedSnapshot = await protectedSnapshot(churchId)');
const userDelete = cleanup.indexOf('deletedUsers += await deleteTree(`users/${user.uid}`)');
const churchDelete = cleanup.indexOf('const deletedChurch = await deleteTree(`churches/${churchId}`)');
const authDelete = cleanup.indexOf('if (await deleteAuth(user))');
const snapshotAfter = cleanup.indexOf('const cleanupProtectedAfter = await protectedSnapshot(churchId)');
assert.ok(snapshotBefore >= 0 && snapshotBefore < userDelete && userDelete < churchDelete
    && churchDelete < authDelete && authDelete < snapshotAfter,
    'cleanup은 직전 보호 snapshot → users → church subtree → Auth → 직후 snapshot 순서여야 한다.');
assert.doesNotMatch(cleanup, /assertProtectedUnchanged\(manifest\)/,
    'cleanup은 생성 시점 global snapshot 차이로 영구 차단되면 안 된다.');
assert.match(cleanup, /JSON\.stringify\(cleanupProtectedAfter\) !== JSON\.stringify\(cleanupProtectedSnapshot\)/);
for (const residueContract of [
    /lookupAuth\(\{ localId:/, /lookupAuth\(\{ email:/, /queryCollectionGroup\('roster'/,
    /listDocuments\(`users\/\$\{user\.uid\}`, 'private'\)/,
    /'talentPurchases', 'talentAdminActions'/, /residue\.length/, /residue: 0/,
]) assert.match(cleanup, residueContract);

assert.equal(packageJson.scripts['validate:t124d-smoke'], 'node scripts/validate-t124d-smoke.mjs');
assert.match(packageJson.scripts.validate, /npm run validate:t124d-smoke/);

console.log('T124d smoke fixture safety contract passed');
