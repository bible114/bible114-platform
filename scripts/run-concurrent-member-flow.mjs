#!/usr/bin/env node

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import os from 'node:os';

const FIREBASE_API_KEY = 'AIzaSyBF122lgD5fTX70HBtd_nl0ZVKhyyQnyGo';
const DEFAULT_USERS = 20;
const MIN_STAGGER_MS = 75;
const MIN_STEP_GAP_MS = 250;
const SAFE_ID_PATTERN = /^[^/\u0000-\u001f\u007f]{1,128}$/;
const PRODUCTION_API_HOST = 'ejqnwajcvkvpcxechwzl.supabase.co';
const FIREBASE_PROJECT_ID = 'bible114-platform';

const usage = () => {
  console.log(`Usage:
  node scripts/run-concurrent-member-flow.mjs --manifest=/absolute/path/manifest.json
  node scripts/run-concurrent-member-flow.mjs --manifest=/absolute/path/manifest.json --apply \\
    --confirm=RUN_BIBLE114_TEST:<churchId> --report-dir=/private/output/directory

Default mode only validates the manifest. --apply signs in exactly 20 prepared test
members and sends completeRead, submitQuiz, and optional purchaseItem actions.
Credentials are read from the exact private fixture manifest when provided, or from
environment-variable names in the run manifest. Tokens, passwords, and response
bodies are never printed or written.`);
};

const args = Object.fromEntries(process.argv.slice(2).map((arg) => {
  const match = arg.match(/^--([^=]+)(?:=(.*))?$/);
  if (!match) throw new Error(`Unknown argument shape: ${arg}`);
  return [match[1], match[2] ?? true];
}));

if (args.help) {
  usage();
  process.exit(0);
}

const fail = (message) => {
  throw new Error(message);
};
const isRecord = (value) => Boolean(value) && typeof value === 'object' && !Array.isArray(value);
const safeId = (value, label) => {
  if (typeof value !== 'string' || !SAFE_ID_PATTERN.test(value.trim())) fail(`${label} must be a safe non-empty id.`);
  return value.trim();
};
const safeInteger = (value, min, max, label) => {
  if (!Number.isSafeInteger(value) || value < min || value > max) fail(`${label} is out of range.`);
  return value;
};
const sleep = (ms) => new Promise((done) => setTimeout(done, ms));
const percentile = (values, fraction) => {
  if (values.length === 0) return null;
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * fraction) - 1)];
};
const shaSafeError = (error) => ({
  name: typeof error?.name === 'string' ? error.name : 'Error',
  code: typeof error?.code === 'string' ? error.code : 'UNEXPECTED_ERROR',
  status: Number.isSafeInteger(error?.status) ? error.status : 0,
  retryable: error?.retryable === true,
});

class HarnessError extends Error {
  constructor(message, { code = 'HARNESS_ERROR', status = 0, retryable = false } = {}) {
    super(message);
    this.name = 'HarnessError';
    this.code = code;
    this.status = status;
    this.retryable = retryable;
  }
}

const parseBody = async (response) => {
  const text = await response.text();
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch {
    throw new HarnessError('The server returned a non-JSON response.', {
      code: 'INVALID_RESPONSE', status: response.status, retryable: response.status >= 500,
    });
  }
};

const signIn = async ({ email, password, expectedUid, timeoutMs }) => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${FIREBASE_API_KEY}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password, returnSecureToken: true }),
      signal: controller.signal,
    });
    const body = await parseBody(response);
    if (!response.ok || typeof body.idToken !== 'string' || typeof body.localId !== 'string') {
      throw new HarnessError('Test member sign-in failed.', {
        code: 'AUTH_FAILED', status: response.status, retryable: response.status >= 500,
      });
    }
    if (expectedUid && body.localId !== expectedUid) {
      throw new HarnessError('Signed-in uid differs from expectedUid.', { code: 'UID_MISMATCH' });
    }
    return { uid: body.localId, token: body.idToken };
  } catch (error) {
    if (error?.name === 'AbortError') throw new HarnessError('Sign-in timed out.', { code: 'TIMEOUT', retryable: true });
    throw error;
  } finally {
    clearTimeout(timer);
  }
};

const verifyTestMembership = async ({ uid, token, testChurchId, timeoutMs }) => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const encodedUid = encodeURIComponent(uid);
    const response = await fetch(
      `https://firestore.googleapis.com/v1/projects/${FIREBASE_PROJECT_ID}/databases/(default)/documents/users/${encodedUid}`,
      { headers: { Authorization: `Bearer ${token}` }, signal: controller.signal },
    );
    const body = await parseBody(response);
    if (!response.ok) {
      throw new HarnessError('Could not verify the prepared test member.', {
        code: 'MEMBERSHIP_PREFLIGHT_FAILED', status: response.status, retryable: response.status >= 500,
      });
    }
    const fields = isRecord(body.fields) ? body.fields : {};
    const churchId = fields.churchId?.stringValue || fields.primaryOrgId?.stringValue || '';
    const role = fields.role?.stringValue || '';
    const isDeleted = fields.isDeleted?.booleanValue === true;
    if (churchId !== testChurchId || role !== 'member' || isDeleted) {
      throw new HarnessError('Account is not an active member of the isolated test church.', {
        code: 'TEST_SCOPE_MISMATCH', status: 409,
      });
    }
  } catch (error) {
    if (error?.name === 'AbortError') {
      throw new HarnessError('Membership preflight timed out.', { code: 'TIMEOUT', retryable: true });
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
};

const callAction = async ({ apiUrl, token, action, payload, requestId, timeoutMs }) => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const startedAt = performance.now();
  try {
    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        Origin: 'https://www.bible114.net',
      },
      body: JSON.stringify({ action, requestId, ...payload }),
      signal: controller.signal,
    });
    const body = await parseBody(response);
    if (!response.ok) {
      const details = isRecord(body.error) ? body.error : body;
      throw new HarnessError('Platform action failed.', {
        code: typeof details?.code === 'string' ? details.code : `HTTP_${response.status}`,
        status: response.status,
        retryable: details?.retryable === true || response.status >= 500,
      });
    }
    if (body?.ok !== true || body.action !== action || body.requestId !== requestId) {
      throw new HarnessError('Platform response identity check failed.', {
        code: 'INVALID_RESPONSE', status: response.status, retryable: true,
      });
    }
    return {
      latencyMs: Math.round(performance.now() - startedAt),
      status: typeof body.result?.status === 'string' ? body.result.status : 'ok',
      committed: typeof body.committed === 'boolean' ? body.committed : null,
      alreadyCompleted: body.alreadyCompleted === true,
    };
  } catch (error) {
    if (error?.name === 'AbortError') throw new HarnessError('Platform action timed out.', { code: 'TIMEOUT', retryable: true });
    throw error;
  } finally {
    clearTimeout(timer);
  }
};

const validateManifest = (manifest) => {
  if (!isRecord(manifest) || manifest.schemaVersion !== 1) fail('manifest.schemaVersion must be 1.');
  const churchId = safeId(manifest.testChurchId, 'testChurchId');
  if (manifest.expectedUserCount !== DEFAULT_USERS) fail(`expectedUserCount must be ${DEFAULT_USERS}.`);
  if (!Array.isArray(manifest.users) || manifest.users.length !== DEFAULT_USERS) {
    fail(`users must contain exactly ${DEFAULT_USERS} entries.`);
  }
  const labels = new Set();
  const envNames = new Set();
  const normalizedUsers = manifest.users.map((user, index) => {
    if (!isRecord(user)) fail(`users[${index}] must be an object.`);
    const label = safeId(user.label, `users[${index}].label`);
    if (labels.has(label)) fail(`Duplicate user label: ${label}`);
    labels.add(label);
    const emailEnv = safeId(user.emailEnv, `${label}.emailEnv`);
    const passwordEnv = safeId(user.passwordEnv, `${label}.passwordEnv`);
    if (!/^[A-Z][A-Z0-9_]*$/.test(emailEnv) || !/^[A-Z][A-Z0-9_]*$/.test(passwordEnv)) {
      fail(`${label} credential environment-variable names must use uppercase shell identifiers.`);
    }
    if (envNames.has(emailEnv) || envNames.has(passwordEnv)) fail(`${label} reuses a credential environment variable.`);
    envNames.add(emailEnv); envNames.add(passwordEnv);
    if (typeof user.expectedUid !== 'string' || !SAFE_ID_PATTERN.test(user.expectedUid.trim())) {
      fail(`${label}.expectedUid is invalid.`);
    }
    if (!isRecord(user.reading)) fail(`${label}.reading is required.`);
    const reading = {
      cycle: safeInteger(user.reading.cycle, 1, Number.MAX_SAFE_INTEGER, `${label}.reading.cycle`),
      day: safeInteger(user.reading.day, 1, 365, `${label}.reading.day`),
      readingEpoch: safeInteger(user.reading.readingEpoch ?? 0, 0, Number.MAX_SAFE_INTEGER, `${label}.reading.readingEpoch`),
    };
    if (!isRecord(user.quiz) || user.quiz.inputProvenance !== 'ui-rendered-choice') {
      fail(`${label}.quiz must declare inputProvenance="ui-rendered-choice".`);
    }
    const quiz = {
      progressKey: safeId(user.quiz.progressKey, `${label}.quiz.progressKey`),
      quizKey: safeId(user.quiz.quizKey, `${label}.quiz.quizKey`),
      selectedIndex: safeInteger(user.quiz.selectedIndex, 0, 3, `${label}.quiz.selectedIndex`),
      attemptSlot: safeInteger(user.quiz.attemptSlot, 1, 2, `${label}.quiz.attemptSlot`),
    };
    if (!/^(?:e[1-9]\d*_)?r[1-9]\d*_d[1-9]\d*$/.test(quiz.progressKey)) fail(`${label}.quiz.progressKey is invalid.`);
    if (!/^[A-Za-z0-9_-]{1,128}$/.test(quiz.quizKey)) fail(`${label}.quiz.quizKey is invalid.`);
    let purchase = null;
    if (user.purchase !== undefined && user.purchase !== null) {
      if (!isRecord(user.purchase)) fail(`${label}.purchase must be an object.`);
      purchase = Object.fromEntries(['churchId', 'itemId', 'departmentId', 'marketId'].map((key) => [
        key, safeId(user.purchase[key], `${label}.purchase.${key}`),
      ]));
      if (purchase.churchId !== churchId) fail(`${label}.purchase.churchId must equal testChurchId.`);
    }
    return {
      label, emailEnv, passwordEnv,
      expectedUid: typeof user.expectedUid === 'string' ? user.expectedUid.trim() : null,
      reading, quiz, purchase,
    };
  });
  const apiUrl = new URL(manifest.apiUrl);
  if (apiUrl.protocol !== 'https:' || apiUrl.hostname !== PRODUCTION_API_HOST) {
    fail(`apiUrl must use the approved production host ${PRODUCTION_API_HOST}.`);
  }
  return {
    churchId, apiUrl: apiUrl.toString(), users: normalizedUsers,
    timeoutMs: safeInteger(manifest.timeoutMs ?? 15_000, 1_000, 60_000, 'timeoutMs'),
    staggerMs: safeInteger(manifest.staggerMs ?? 100, MIN_STAGGER_MS, 5_000, 'staggerMs'),
    stepGapMs: safeInteger(manifest.stepGapMs ?? 300, MIN_STEP_GAP_MS, 10_000, 'stepGapMs'),
  };
};

const manifestPath = typeof args.manifest === 'string' ? resolve(args.manifest) : fail('--manifest is required.');
const manifest = validateManifest(JSON.parse(await readFile(manifestPath, 'utf8')));
const apply = args.apply === true;

if (!apply) {
  console.log(JSON.stringify({
    mode: 'dry-run', valid: true, testChurchId: manifest.churchId,
    userCount: manifest.users.length, actions: {
      completeRead: manifest.users.length,
      submitQuiz: manifest.users.length,
      purchaseItem: manifest.users.filter((user) => user.purchase).length,
    },
    constraints: { staggerMs: manifest.staggerMs, stepGapMs: manifest.stepGapMs },
  }, null, 2));
  process.exit(0);
}

if (args.confirm !== `RUN_BIBLE114_TEST:${manifest.churchId}`) fail('Exact --confirm phrase is required for --apply.');
if (typeof args['report-dir'] !== 'string') fail('--report-dir is required for --apply.');

let fixtureCredentials = null;
if (typeof args['fixture-manifest'] === 'string') {
  const fixturePath = resolve(args['fixture-manifest']);
  const expectedFixturePath = resolve(
    os.homedir(), 'Library', 'Application Support', 'bible114-platform-private',
    'site-audit-fixtures', `${manifest.churchId}.json`,
  );
  if (fixturePath !== expectedFixturePath) fail('--fixture-manifest must be the canonical private fixture path.');
  const fixture = JSON.parse(await readFile(fixturePath, 'utf8'));
  if (fixture?.schemaVersion !== 1 || fixture.projectId !== FIREBASE_PROJECT_ID
    || fixture.churchId !== manifest.churchId || fixture.status !== 'ready'
    || !Array.isArray(fixture.accounts) || fixture.accounts.length !== DEFAULT_USERS + 1
    || fixture.accounts[0]?.role !== 'churchAdmin') {
    fail('Private fixture manifest does not match the ready test church contract.');
  }
  const members = fixture.accounts.slice(1);
  if (members.some((account) => account?.role !== 'member'
    || typeof account.uid !== 'string' || typeof account.email !== 'string'
    || typeof account.password !== 'string')) {
    fail('Private fixture member credentials are malformed.');
  }
  const byUid = new Map(members.map((account) => [account.uid, account]));
  if (byUid.size !== DEFAULT_USERS
    || manifest.users.some((user) => !byUid.has(user.expectedUid))) {
    fail('Run manifest users do not exactly cover the private fixture members.');
  }
  fixtureCredentials = byUid;
} else {
  for (const user of manifest.users) {
    if (!process.env[user.emailEnv] || !process.env[user.passwordEnv]) {
      fail(`Missing credential environment variable for ${user.label}.`);
    }
  }
}

const credentialsFor = (user) => fixtureCredentials?.get(user.expectedUid) || {
  email: process.env[user.emailEnv], password: process.env[user.passwordEnv],
};

const runId = randomUUID();
const startedAt = new Date().toISOString();
const results = [];
const cleanup = {
  schemaVersion: 1, runId, createdAt: startedAt, testChurchId: manifest.churchId,
  warning: 'Never delete pre-existing operational ledgers. This harness is only for disposable, directly seeded fixture church/users; after exact churchId, uid, and runId review, the fixture manager may delete only the manifest-scoped test subtrees.',
  users: [], immutableArtifacts: [], purchases: [],
};

const runUser = async (user, index) => {
  await sleep(index * manifest.staggerMs);
  const record = { label: user.label, uid: null, actions: [] };
  try {
    const credentials = credentialsFor(user);
    const identity = await signIn({
      email: credentials.email, password: credentials.password,
      expectedUid: user.expectedUid, timeoutMs: manifest.timeoutMs,
    });
    await verifyTestMembership({
      uid: identity.uid, token: identity.token, testChurchId: manifest.churchId,
      timeoutMs: manifest.timeoutMs,
    });
    record.uid = identity.uid;
    cleanup.users.push({ uid: identity.uid, label: user.label });
    const actions = [
      { action: 'completeRead', payload: user.reading },
      { action: 'submitQuiz', payload: user.quiz },
      ...(user.purchase ? [{ action: 'purchaseItem', payload: user.purchase }] : []),
    ];
    for (const [actionIndex, action] of actions.entries()) {
      if (actionIndex > 0) await sleep(manifest.stepGapMs);
      const requestId = randomUUID();
      const actionRecord = { action: action.action, requestId };
      try {
        const outcome = await callAction({
          apiUrl: manifest.apiUrl, token: identity.token, action: action.action,
          payload: action.payload, requestId, timeoutMs: manifest.timeoutMs,
        });
        Object.assign(actionRecord, { ok: true, ...outcome });
      } catch (error) {
        Object.assign(actionRecord, { ok: false, error: shaSafeError(error) });
      }
      record.actions.push(actionRecord);
      const immutablePaths = action.action === 'purchaseItem'
        ? [`churches/${manifest.churchId}/talentPurchases/${requestId}`]
        : [
          `users/${identity.uid}/activityActions/${requestId}`,
          ...(action.action === 'completeRead'
            ? [`users/${identity.uid}/history/${requestId}`]
            : [`users/${identity.uid}/quizAttemptSlots/${user.quiz.progressKey}_a${user.quiz.attemptSlot}`]),
        ];
      const residualState = actionRecord.ok
        ? 'response-confirmed'
        : actionRecord.error?.retryable
          ? 'unknown-review-required'
          : 'not-confirmed-review-required';
      cleanup.immutableArtifacts.push({
        uid: identity.uid,
        action: action.action,
        requestId,
        expectedPaths: immutablePaths,
        confirmedByResponsePaths: actionRecord.ok ? immutablePaths : [],
        residualState,
      });
      if (action.action === 'purchaseItem') cleanup.purchases.push({
        uid: identity.uid,
        purchaseId: requestId,
        expectedPath: `churches/${manifest.churchId}/talentPurchases/${requestId}`,
        responseConfirmed: actionRecord.ok,
        residualState,
      });
      if (!actionRecord.ok) break;
    }
  } catch (error) {
    record.signIn = { ok: false, error: shaSafeError(error) };
  }
  results.push(record);
};

await Promise.all(manifest.users.map(runUser));
const finishedAt = new Date().toISOString();
const actionResults = results.flatMap((result) => result.actions);
const latencyValues = actionResults.filter((action) => action.ok).map((action) => action.latencyMs);
const report = {
  schemaVersion: 1, mode: 'apply', runId, testChurchId: manifest.churchId,
  startedAt, finishedAt, userCount: manifest.users.length,
  summary: {
    signInFailures: results.filter((result) => result.signIn?.ok === false).length,
    actionSuccesses: actionResults.filter((action) => action.ok).length,
    actionFailures: actionResults.filter((action) => !action.ok).length,
    latencyMs: { p50: percentile(latencyValues, 0.5), p95: percentile(latencyValues, 0.95), max: latencyValues.length ? Math.max(...latencyValues) : null },
  },
  users: results.sort((left, right) => left.label.localeCompare(right.label, 'en')),
};

const reportDir = resolve(args['report-dir']);
await mkdir(reportDir, { recursive: true, mode: 0o700 });
const reportPath = resolve(reportDir, `${runId}-report.json`);
const cleanupPath = resolve(reportDir, `${runId}-cleanup-manifest.json`);
await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, { mode: 0o600 });
await writeFile(cleanupPath, `${JSON.stringify(cleanup, null, 2)}\n`, { mode: 0o600 });
console.log(JSON.stringify({ ...report.summary, runId, reportPath, cleanupPath }, null, 2));
if (report.summary.signInFailures > 0 || report.summary.actionFailures > 0) process.exitCode = 1;
