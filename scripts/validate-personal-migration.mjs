import assert from 'node:assert/strict';
import fs from 'node:fs';
import { PERSONAL_MIGRATION_STEPS, nextPersonalMigrationStep } from '../src/utils/personalMigrationSteps.js';

const migrationSource = fs.readFileSync(new URL('../src/utils/personalAccountMigration.js', import.meta.url), 'utf8');
const cardSource = fs.readFileSync(new URL('../src/components/dashboard/PersonalAccountMigrationCard.jsx', import.meta.url), 'utf8');
const authSource = fs.readFileSync(new URL('../src/hooks/useAuth.js', import.meta.url), 'utf8');
const loginSource = fs.readFileSync(new URL('../src/components/LoginView.jsx', import.meta.url), 'utf8');

assert.deepEqual(PERSONAL_MIGRATION_STEPS, ['start', 'email', 'credentials', 'roster', 'user']);
assert.equal(nextPersonalMigrationStep('user'), 'complete');

for (const failedStep of PERSONAL_MIGRATION_STEPS.slice(0, -1)) {
    let persistedStep = 'start';
    let failed = false;
    while (persistedStep !== 'complete') {
        if (!failed && persistedStep === failedStep) {
            failed = true;
            break;
        }
        persistedStep = nextPersonalMigrationStep(persistedStep);
    }
    assert.equal(persistedStep, failedStep, `${failedStep} 실패 시 단계가 보존되어야 함`);
    while (persistedStep !== 'complete') persistedStep = nextPersonalMigrationStep(persistedStep);
    assert.equal(persistedStep, 'complete', `${failedStep} 재개 후 완료되어야 함`);
}

assert.match(migrationSource, /makePseudoEmail\([\s\S]*makeUnaffiliatedIdentity/);
assert.match(migrationSource, /auth\/email-already-in-use/);
assert.match(migrationSource, /같은 이름·생년월일·전화번호 조합의 계정이 이미 있어요/);
assert.match(migrationSource, /auth\/requires-recent-login/);
assert.match(migrationSource, /rosterSnap\.exists/);
assert.match(migrationSource, /accountType: 'personal'/);
assert.match(migrationSource, /churchId: null/);
assert.match(migrationSource, /primaryOrgId: source\.churchId/);

assert.match(cardSource, /currentUser\?\.role === 'member'/);
assert.match(cardSource, /currentUser\.accountType !== 'personal'/);
assert.match(cardSource, /currentUser\.churchId !== UNAFFILIATED_CHURCH_ID/);
assert.match(cardSource, /\^\\d\{4\}\$/);
assert.match(authSource, /error\?\.code !== 'auth\/email-already-in-use'/);
assert.match(authSource, /getPendingPersonalMigration\(firebaseUser\.uid\)/);
assert.match(loginSource, /시작하기 · 개인 계정 로그인/);

console.log('개인 계정 전환 검증 통과: 단계 실패·재개, 충돌, 비노출, 로그인 겸용 계약');
