#!/usr/bin/env node

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const PROJECT_ID = 'bible114-platform';
const MEMBER_COUNT = 20;
const args = Object.fromEntries(process.argv.slice(2).map((arg) => {
  const match = arg.match(/^--([^=]+)=(.*)$/);
  if (!match) throw new Error(`Unknown argument: ${arg}`);
  return [match[1], match[2]];
}));
const fail = (message) => { throw new Error(message); };
const fixturePath = path.resolve(args.fixture || fail('--fixture is required.'));
const outputPath = path.resolve(args.output || fail('--output is required.'));
const quizKey = args['quiz-key'] || fail('--quiz-key is required.');
const selectedIndex = Number(args['selected-index']);
if (!/^[A-Za-z0-9_-]{1,128}$/.test(quizKey)) fail('Invalid quiz key.');
if (!Number.isSafeInteger(selectedIndex) || selectedIndex < 0 || selectedIndex > 3) {
  fail('--selected-index must be 0..3.');
}

const fixture = JSON.parse(fs.readFileSync(fixturePath, 'utf8'));
const expectedFixturePath = path.resolve(
  os.homedir(), 'Library', 'Application Support', 'bible114-platform-private',
  'site-audit-fixtures', `${fixture.churchId}.json`,
);
if (fixturePath !== expectedFixturePath || fixture.schemaVersion !== 1
  || fixture.projectId !== PROJECT_ID || fixture.status !== 'ready'
  || !Array.isArray(fixture.accounts) || fixture.accounts.length !== MEMBER_COUNT + 1) {
  fail('Fixture does not match the canonical ready-site-audit contract.');
}
const members = fixture.accounts.slice(1);
if (members.some((account) => account.role !== 'member'
  || !account.uid.startsWith(`${fixture.churchId}_m`))) {
  fail('Fixture member set is malformed.');
}
if (fs.existsSync(outputPath)) fail('Refusing to overwrite an existing run manifest.');

const runManifest = {
  schemaVersion: 1,
  testChurchId: fixture.churchId,
  expectedUserCount: MEMBER_COUNT,
  apiUrl: 'https://ejqnwajcvkvpcxechwzl.supabase.co/functions/v1/platform-api',
  timeoutMs: 15000,
  staggerMs: 100,
  stepGapMs: 300,
  users: members.map((account, index) => ({
    label: `member-${String(index + 1).padStart(2, '0')}`,
    emailEnv: `B114_LOAD_MEMBER_${String(index + 1).padStart(2, '0')}_EMAIL`,
    passwordEnv: `B114_LOAD_MEMBER_${String(index + 1).padStart(2, '0')}_PASSWORD`,
    expectedUid: account.uid,
    reading: { cycle: 1, day: 1, readingEpoch: 0 },
    quiz: {
      inputProvenance: 'ui-rendered-choice',
      progressKey: 'r1_d1',
      quizKey,
      selectedIndex,
      attemptSlot: 1,
    },
    purchase: {
      churchId: fixture.churchId,
      itemId: 'audit_item_1',
      departmentId: 'audit_adult',
      marketId: 'shared',
    },
  })),
};

fs.mkdirSync(path.dirname(outputPath), { recursive: true, mode: 0o700 });
fs.writeFileSync(outputPath, `${JSON.stringify(runManifest, null, 2)}\n`, {
  flag: 'wx', mode: 0o600,
});
console.log(JSON.stringify({ outputPath, churchId: fixture.churchId, users: members.length }, null, 2));
