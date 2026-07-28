#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

const PROJECT_ID = 'bible114-platform';
const CONFIRM_PHRASE = 'EXCLUDE_T131_TEST_ACCOUNTS';
const UNAFFILIATED_CHURCH_ID = 'unaffiliated_v1';
const apply = process.argv.includes('--apply');
const confirmation = process.argv.find(value => value.startsWith('--confirm='))?.slice(10) || '';
if (apply && confirmation !== CONFIRM_PHRASE) {
  throw new Error(`Apply requires --confirm=${CONFIRM_PHRASE}`);
}

// 2026-07-28 운영 재감사에서 이름까지 다시 일치한 테스트/검증 전용 users 14개.
const TARGET_USERS = [
  { uid: '7iAerXvYG1hNSfXJrNEBd6x5xLB2', name: 'QA새번역0713' },
  { uid: '8DMIlvkl5egUtMcM4Iiyy0KkScn2', name: '테스트성도' },
  { uid: '9JXNN0KOvtV7KaVhLfRU8fa4v6m1', name: 'QA순차0713' },
  { uid: 'Ejw9X3durwPtXo1Tx8j3WvTsN562', name: '테스트관리자' },
  { uid: 'SIqLQ5WKfKOEjdcoMrs0txhg52m1', name: 'QA신약0713' },
  { uid: 'SVxgrnAF5Ads7jpi06oTJYcF4w23', name: '클로드관리자' },
  { uid: 'YjhHILQa2KZ0G3z8SEZBEbYypEz1', name: 'QA개역0713' },
  { uid: 'y0Iny9k06lbTk3vjBqSAs2lQ5zk2', name: '클로드테스트' },
  { uid: '2izTdQQlsiRLVHFsrN9UxlXJkjg1', name: 'Codex Count' },
  { uid: 'LrZ4TW8psQVEap5hPybTNRTsWq73', name: 'Codex Inspect' },
  { uid: 'MzHInlpGL4PBmR1hCmBSN2206kS2', name: 'Codex DB Verifier' },
  { uid: 'PmqcdK4lt4RsQF1ddlsHxIhLDL33', name: 'Codex Final Cleanup' },
  { uid: 'awibMFV4dVUURqJIoJ4HuUXuxzN2', name: 'Codex Saehangul Importer' },
  { uid: 'ks7IYUo6lNbIojUZ0gv5un22gYw1', name: 'Codex All Versions Importer' },
];

const firebaseToolsRoot = [
  '/opt/homebrew/lib/node_modules/firebase-tools',
  '/usr/local/lib/node_modules/firebase-tools',
].find(root => fs.existsSync(path.join(root, 'package.json')));
if (!firebaseToolsRoot) throw new Error('Firebase CLI installation not found.');
const require = createRequire(path.join(firebaseToolsRoot, 'package.json'));
const firebaseAuth = require('./lib/auth');
const account = firebaseAuth.getGlobalDefaultAccount();
if (!account?.tokens?.refresh_token) throw new Error('Firebase CLI login not found.');
const scopes = String(account.tokens.scope || 'https://www.googleapis.com/auth/cloud-platform')
  .split(/\s+/)
  .filter(Boolean);
const tokenResult = await firebaseAuth.getAccessToken(account.tokens.refresh_token, scopes);
const accessToken = tokenResult?.access_token || tokenResult;
if (!accessToken) throw new Error('Unable to obtain Firebase admin access token.');

const databaseName = `projects/${PROJECT_ID}/databases/(default)`;
const firestoreRoot = `https://firestore.googleapis.com/v1/${databaseName}/documents`;
const headers = { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' };
const encodePath = value => value.split('/').map(encodeURIComponent).join('/');
const fullName = value => `${databaseName}/documents/${value}`;
const encodeValue = value => {
  if (value === null || value === undefined) return { nullValue: null };
  if (value instanceof Date) return { timestampValue: value.toISOString() };
  if (typeof value === 'boolean') return { booleanValue: value };
  if (typeof value === 'string') return { stringValue: value };
  if (typeof value === 'number') return Number.isSafeInteger(value)
    ? { integerValue: String(value) }
    : { doubleValue: value };
  if (Array.isArray(value)) return { arrayValue: { values: value.map(encodeValue) } };
  if (typeof value === 'object') return { mapValue: { fields: encodeFields(value) } };
  throw new Error(`Unsupported value: ${typeof value}`);
};
const encodeFields = data => Object.fromEntries(
  Object.entries(data).map(([key, value]) => [key, encodeValue(value)]),
);
const decodeValue = value => {
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
const decodeFields = fields => Object.fromEntries(
  Object.entries(fields || {}).map(([key, value]) => [key, decodeValue(value)]),
);
const decodeDocument = document => ({
  id: String(document.name || '').split('/').at(-1),
  name: document.name,
  updateTime: document.updateTime,
  data: decodeFields(document.fields || {}),
});
const requestJson = async (url, init = {}, allowed = []) => {
  const response = await fetch(url, { ...init, headers: { ...headers, ...(init.headers || {}) } });
  const body = await response.json().catch(() => ({}));
  if (!response.ok && !allowed.includes(response.status)) {
    throw new Error(`${init.method || 'GET'} ${new URL(url).pathname} failed: HTTP ${response.status}`);
  }
  return { response, body };
};
const getDocument = async documentPath => {
  const result = await requestJson(`${firestoreRoot}/${encodePath(documentPath)}`, {}, [404]);
  return result.response.status === 404 ? null : decodeDocument(result.body);
};
const listDocuments = async collectionPath => {
  const documents = [];
  let pageToken = '';
  do {
    const url = new URL(`${firestoreRoot}/${encodePath(collectionPath)}`);
    url.searchParams.set('pageSize', '300');
    if (pageToken) url.searchParams.set('pageToken', pageToken);
    const { body } = await requestJson(url);
    documents.push(...(body.documents || []).map(decodeDocument));
    pageToken = body.nextPageToken || '';
  } while (pageToken);
  return documents;
};
const safeCount = (value, fallback = 0) =>
  Number.isSafeInteger(value) && value >= 0 ? value : fallback;
const safeAdd = (left, right, label) => {
  const value = left + right;
  if (!Number.isSafeInteger(value) || value < 0) throw new Error(`${label} overflow.`);
  return value;
};
const legacyDateKst = date => {
  const shifted = new Date(date.getTime() + 9 * 60 * 60 * 1_000);
  const weekdays = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${weekdays[shifted.getUTCDay()]} ${months[shifted.getUTCMonth()]} ${String(shifted.getUTCDate()).padStart(2, '0')} ${shifted.getUTCFullYear()}`;
};
const updateWrite = (documentPath, data, current, updateMask = Object.keys(data)) => ({
  update: { name: fullName(documentPath), fields: encodeFields(data) },
  updateMask: { fieldPaths: updateMask },
  currentDocument: { updateTime: current.updateTime },
});
const verifyWrite = document => ({
  verify: document.name,
  currentDocument: { updateTime: document.updateTime },
});

const [users, churches, externalSources, currentStats] = await Promise.all([
  listDocuments('users'),
  listDocuments('churches'),
  listDocuments('platformExternalStats'),
  getDocument('settings/platformStats'),
]);
if (!currentStats) throw new Error('settings/platformStats is missing.');
const usersById = new Map(users.map(document => [document.id, document]));
const targets = TARGET_USERS.map(target => {
  const document = usersById.get(target.uid);
  if (!document) throw new Error(`Target user missing: ${target.uid}`);
  if (document.data.name !== target.name) throw new Error(`Target name mismatch: ${target.uid}`);
  return document;
});
const toMark = targets.filter(({ data }) => data.excludeFromPublicStats !== true);
const contribution = {
  total_readers: targets.filter(({ data }) =>
    data.isDeleted !== true && data.excludeFromPublicStats !== true
  ).length,
  readers_today: 0,
  finished_total: 0,
};
const now = new Date();
const today = legacyDateKst(now);
for (const { data } of targets) {
  if (data.isDeleted === true || data.excludeFromPublicStats === true) continue;
  if (data.lastReadDate === today) contribution.readers_today += 1;
  contribution.finished_total = safeAdd(
    contribution.finished_total,
    Math.max(safeCount(data.readCount, 1) - 1, 0),
    'test finished_total',
  );
}

// 문서 uid 필드가 없는 검증 역할도 있으므로 문서 ID 기준으로 다시 확정한다.
const targetIds = new Set(TARGET_USERS.map(target => target.uid));
const publicUsers = users.filter(({ id, data }) =>
  data.isDeleted !== true && data.excludeFromPublicStats !== true && !targetIds.has(id)
);
const activeChurchIds = new Set(
  churches
    .filter(({ id, data }) =>
      data.isDeleted !== true && data.isVirtual !== true && id !== UNAFFILIATED_CHURCH_ID
    )
    .map(({ id }) => id),
);
const enabledExternal = externalSources.filter(({ data }) =>
  data.enabled === true
  && typeof data.churchId === 'string'
  && activeChurchIds.has(data.churchId)
);
const externalTotal = key => enabledExternal.reduce(
  (sum, { data }) => safeAdd(sum, safeCount(data[key]), `external ${key}`),
  0,
);
const expected = {
  total_readers: safeAdd(publicUsers.length, externalTotal('total_readers'), 'total_readers'),
  total_churches: activeChurchIds.size,
  readers_today: safeAdd(
    publicUsers.filter(({ data }) => data.lastReadDate === today).length,
    enabledExternal
      .filter(({ data }) => data.today_date === today)
      .reduce((sum, { data }) => safeAdd(sum, safeCount(data.readers_today), 'readers_today'), 0),
    'readers_today',
  ),
  finished_total: safeAdd(
    publicUsers.reduce(
      (sum, { data }) => safeAdd(sum, Math.max(safeCount(data.readCount, 1) - 1, 0), 'finished_total'),
      0,
    ),
    externalTotal('finished_total'),
    'finished_total',
  ),
  today_date: today,
};
const report = {
  mode: apply ? 'apply' : 'preview',
  targetAccounts: targets.length,
  newlyExcluded: toMark.length,
  removedContribution: contribution,
  currentStats: Object.fromEntries(
    Object.keys(expected).map(key => [key, currentStats.data[key] ?? null]),
  ),
  expectedStats: expected,
};
if (!apply) {
  console.log(JSON.stringify(report, null, 2));
  process.exit(0);
}

const writes = [
  ...toMark.map(document => updateWrite(`users/${document.id}`, {
    excludeFromPublicStats: true,
    publicStatsExclusionReason: 'operational-test',
    publicStatsExcludedAt: now,
    publicStatsExcludedBy: 't131-public-stats-cleanup',
  }, document)),
  ...users.filter(({ id }) => !targetIds.has(id)).map(verifyWrite),
  ...churches.map(verifyWrite),
  ...externalSources.map(verifyWrite),
  updateWrite('settings/platformStats', {
    ...expected,
    updatedAt: now,
    rebuiltAt: now,
    rebuiltBy: 't131-public-stats-cleanup',
  }, currentStats),
];
if (writes.length > 500) throw new Error(`Too many writes: ${writes.length}`);
await requestJson(`${firestoreRoot}:commit`, {
  method: 'POST',
  body: JSON.stringify({ writes }),
});

const [verifiedStats, ...verifiedTargets] = await Promise.all([
  getDocument('settings/platformStats'),
  ...TARGET_USERS.map(target => getDocument(`users/${target.uid}`)),
]);
const clean = verifiedTargets.every(document => document?.data?.excludeFromPublicStats === true)
  && Object.entries(expected).every(([key, value]) => verifiedStats?.data?.[key] === value);
if (!clean) throw new Error('Post-update verification failed.');
console.log(JSON.stringify({ ...report, status: 'updated', verified: true }, null, 2));
