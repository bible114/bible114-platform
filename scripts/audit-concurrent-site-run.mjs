#!/usr/bin/env node

// Exact, read-only reconciliation for a disposable concurrent site-audit fixture.
// Never prints or stores credentials, tokens, emails, names, or response bodies.

import fs from 'node:fs';
import { createRequire } from 'node:module';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';

const PROJECT_ID = 'bible114-platform';
const args = Object.fromEntries(process.argv.slice(2).map((arg) => {
  const match = arg.match(/^--([^=]+)=(.+)$/);
  if (!match) throw new Error(`잘못된 인자 형식: ${arg}`);
  return [match[1], match[2]];
}));
for (const key of ['fixture', 'success-report', 'failed-report', 'output']) {
  if (typeof args[key] !== 'string') throw new Error(`--${key}=... 가 필요합니다.`);
}

const fixture = JSON.parse(await readFile(resolve(args.fixture), 'utf8'));
const successReport = JSON.parse(await readFile(resolve(args['success-report']), 'utf8'));
const failedReport = JSON.parse(await readFile(resolve(args['failed-report']), 'utf8'));
const outputPath = resolve(args.output);
const churchId = fixture.testChurchId;
if (typeof churchId !== 'string' || !churchId || churchId.includes('/')) throw new Error('fixture churchId가 올바르지 않습니다.');
if (successReport.testChurchId !== churchId || failedReport.testChurchId !== churchId) throw new Error('보고서 churchId가 fixture와 다릅니다.');
if (!Array.isArray(fixture.users) || fixture.users.length !== 20) throw new Error('fixture 사용자는 정확히 20명이어야 합니다.');

const firebaseToolsRoots = [
  '/opt/homebrew/lib/node_modules/firebase-tools',
  '/usr/local/lib/node_modules/firebase-tools',
].filter((root) => fs.existsSync(`${root}/package.json`));
if (firebaseToolsRoots.length === 0) throw new Error('Firebase CLI 로그인을 찾지 못했습니다.');
const require = createRequire(`${firebaseToolsRoots[0]}/package.json`);
const firebaseAuth = require('./lib/auth');
const account = firebaseAuth.getGlobalDefaultAccount();
if (!account?.tokens?.refresh_token) throw new Error('Firebase CLI 로그인 정보가 없습니다.');
const scopes = String(account.tokens.scope || 'https://www.googleapis.com/auth/cloud-platform').split(/\s+/).filter(Boolean);
const access = await firebaseAuth.getAccessToken(account.tokens.refresh_token, scopes);
const accessToken = access?.access_token || access;
if (!accessToken) throw new Error('Firebase 관리자 읽기 토큰을 얻지 못했습니다.');

const root = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents`;
const headers = { Authorization: `Bearer ${accessToken}` };
const decodeValue = (value) => {
  if (!value || typeof value !== 'object') return undefined;
  if ('nullValue' in value) return null;
  if ('stringValue' in value) return value.stringValue;
  if ('integerValue' in value) return Number(value.integerValue);
  if ('doubleValue' in value) return Number(value.doubleValue);
  if ('booleanValue' in value) return value.booleanValue;
  if ('timestampValue' in value) return value.timestampValue;
  if ('arrayValue' in value) return (value.arrayValue?.values || []).map(decodeValue);
  if ('mapValue' in value) return decodeFields(value.mapValue?.fields || {});
  return undefined;
};
const decodeFields = (fields) => Object.fromEntries(Object.entries(fields || {}).map(([key, value]) => [key, decodeValue(value)]));
const encodePath = (path) => path.split('/').map(encodeURIComponent).join('/');
const documentId = (name) => String(name || '').split('/').at(-1) || '';

const getDocument = async (path) => {
  const response = await fetch(`${root}/${encodePath(path)}`, { headers });
  if (response.status === 404) return null;
  if (!response.ok) throw new Error(`문서 읽기 실패 (${response.status}): ${path}`);
  const body = await response.json();
  return { id: documentId(body.name), data: decodeFields(body.fields || {}) };
};
const listCollection = async (path) => {
  const documents = [];
  let pageToken = '';
  do {
    const url = new URL(`${root}/${encodePath(path)}`);
    url.searchParams.set('pageSize', '300');
    if (pageToken) url.searchParams.set('pageToken', pageToken);
    const response = await fetch(url, { headers });
    if (!response.ok) throw new Error(`컬렉션 읽기 실패 (${response.status}): ${path}`);
    const body = await response.json();
    documents.push(...(body.documents || []).map((doc) => ({ id: documentId(doc.name), data: decodeFields(doc.fields || {}) })));
    pageToken = typeof body.nextPageToken === 'string' ? body.nextPageToken : '';
  } while (pageToken);
  return documents;
};

const successByUid = new Map(successReport.users.map((user) => [user.uid, user]));
const failedByUid = new Map(failedReport.users.map((user) => [user.uid, user]));
const purchaseDocs = await listCollection(`churches/${churchId}/talentPurchases`);
const purchasesByUid = new Map();
for (const purchase of purchaseDocs) {
  const uid = purchase.data.uid;
  if (!purchasesByUid.has(uid)) purchasesByUid.set(uid, []);
  purchasesByUid.get(uid).push(purchase);
}

const users = [];
const missing = [];
const duplicates = [];
let failedRunResidualCount = 0;
for (const fixtureUser of fixture.users) {
  const label = fixtureUser.label;
  const uid = fixtureUser.expectedUid;
  if (typeof label !== 'string' || typeof uid !== 'string') throw new Error('fixture label/expectedUid가 없습니다.');
  const success = successByUid.get(uid);
  const failed = failedByUid.get(uid);
  if (!success) missing.push(`${label}:success-report`);
  if (!failed) missing.push(`${label}:failed-report`);
  const userDoc = await getDocument(`users/${uid}`);
  const [history, activityActions, quizSlots, roster] = await Promise.all([
    listCollection(`users/${uid}/history`),
    listCollection(`users/${uid}/activityActions`),
    listCollection(`users/${uid}/quizAttemptSlots`),
    getDocument(`churches/${churchId}/roster/${uid}`),
  ]);
  if (!userDoc) {
    missing.push(`${label}:user-document`);
    continue;
  }
  const successActions = new Map((success?.actions || []).map((action) => [action.action, action]));
  const expectedReadId = successActions.get('completeRead')?.requestId;
  const expectedQuizId = successActions.get('submitQuiz')?.requestId;
  const expectedPurchaseId = successActions.get('purchaseItem')?.requestId;
  const failedIds = new Set((failed?.actions || []).map((action) => action.requestId).filter(Boolean));
  const failedResiduals = [
    ...history.filter((doc) => failedIds.has(doc.id)).map((doc) => `history:${doc.id}`),
    ...activityActions.filter((doc) => failedIds.has(doc.id)).map((doc) => `activity:${doc.id}`),
    ...quizSlots.filter((doc) => failedIds.has(doc.data.requestId)).map((doc) => `quizSlot:${doc.id}`),
    ...purchaseDocs.filter((doc) => failedIds.has(doc.id)).map((doc) => `purchase:${doc.id}`),
  ];
  failedRunResidualCount += failedResiduals.length;
  const purchases = purchasesByUid.get(uid) || [];
  if (purchases.length !== 1) (purchases.length === 0 ? missing : duplicates).push(`${label}:purchase:${purchases.length}`);
  if (history.filter((doc) => doc.id === expectedReadId).length !== 1) missing.push(`${label}:expected-history`);
  if (activityActions.filter((doc) => doc.id === expectedReadId).length !== 1) missing.push(`${label}:expected-read-action`);
  if (activityActions.filter((doc) => doc.id === expectedQuizId).length !== 1) missing.push(`${label}:expected-quiz-action`);
  if (quizSlots.filter((doc) => doc.id === `${fixtureUser.quiz.progressKey}_a${fixtureUser.quiz.attemptSlot}`).length !== 1) missing.push(`${label}:expected-quiz-slot`);
  if (purchases.filter((doc) => doc.id === expectedPurchaseId).length !== 1) missing.push(`${label}:expected-purchase`);
  const progress = userDoc.data.quizProgress?.[fixtureUser.quiz.progressKey] || null;
  const purchase = purchases[0]?.data || null;
  const walletKind = purchase?.walletKind || null;
  const actualWallet = walletKind === 'roster' ? roster?.data?.talent : userDoc.data.talent;
  users.push({
    label,
    state: {
      currentDay: userDoc.data.currentDay ?? null,
      readCount: userDoc.data.readCount ?? null,
      streak: userDoc.data.streak ?? null,
      score: userDoc.data.score ?? null,
      talent: userDoc.data.talent ?? null,
      lastReadDate: userDoc.data.lastReadDate ?? null,
    },
    quizProgress: progress ? {
      attempts: progress.attempts ?? null,
      solved: progress.solved ?? null,
      skipped: progress.skipped ?? null,
      reward: progress.reward ?? null,
      quizKeyMatchesFixture: progress.quizKey === fixtureUser.quiz.quizKey,
      progressKey: fixtureUser.quiz.progressKey,
    } : null,
    counts: { history: history.length, activityActions: activityActions.length, quizAttemptSlots: quizSlots.length, purchases: purchases.length },
    purchase: purchase ? {
      requestIdMatchesSuccess: purchases[0].id === expectedPurchaseId,
      status: purchase.status ?? null,
      itemIdMatchesFixture: purchase.itemId === fixtureUser.purchase?.itemId,
      price: purchase.price ?? null,
      walletKind,
      walletBalanceAfter: purchase.walletBalanceAfter ?? null,
      actualWallet: actualWallet ?? null,
      walletMatches: Number.isSafeInteger(actualWallet) && actualWallet === purchase.walletBalanceAfter,
    } : null,
    failedRunResidualCount: failedResiduals.length,
  });
}

const requestIds = successReport.users.flatMap((user) => user.actions || []).map((action) => action.requestId);
const duplicateSuccessRequestIds = requestIds.filter((id, index) => requestIds.indexOf(id) !== index);
if (duplicateSuccessRequestIds.length) duplicates.push(`success-requestIds:${new Set(duplicateSuccessRequestIds).size}`);
const distributions = (selector) => Object.fromEntries([...new Set(users.map(selector))].map((value) => [String(value), users.filter((user) => selector(user) === value).length]));
const report = {
  schemaVersion: 1,
  auditedAt: new Date().toISOString(),
  mode: 'read-only',
  testChurchId: churchId,
  successRunId: successReport.runId,
  failedRunId: failedReport.runId,
  summary: {
    expectedUsers: fixture.users.length,
    auditedUsers: users.length,
    churchPurchaseCount: purchaseDocs.length,
    missingCount: missing.length,
    duplicateCount: duplicates.length,
    failedRunResidualCount,
    allWalletsMatch: users.every((user) => user.purchase?.walletMatches === true),
    distributions: {
      currentDay: distributions((user) => user.state.currentDay),
      readCount: distributions((user) => user.state.readCount),
      streak: distributions((user) => user.state.streak),
      score: distributions((user) => user.state.score),
      talent: distributions((user) => user.state.talent),
      quizAttempts: distributions((user) => user.quizProgress?.attempts ?? null),
      quizSolved: distributions((user) => user.quizProgress?.solved ?? null),
      purchaseStatus: distributions((user) => user.purchase?.status ?? null),
      purchasePrice: distributions((user) => user.purchase?.price ?? null),
      walletKind: distributions((user) => user.purchase?.walletKind ?? null),
    },
  },
  users,
  discrepancies: { missing, duplicates },
};
await mkdir(dirname(outputPath), { recursive: true, mode: 0o700 });
await writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`, { mode: 0o600 });
console.log(JSON.stringify({ outputPath, ...report.summary }, null, 2));
if (missing.length || duplicates.length || failedRunResidualCount) process.exitCode = 1;
