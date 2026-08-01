#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

const SOURCE_PROJECT_ID = 'bible-sungseo';
const SOURCE_API_KEY = 'AIzaSyAOMubppe1JZbBh0VBv7UIbZyY2S1RI9fw';
const TARGET_PROJECT_ID = 'bible114-platform';
const TARGET_CHURCH_ID = 'sungseo_promo_v1';
const TARGET_CHURCH_NAME = '성서교회';
const EXTERNAL_SOURCE_ID = 'sungseo';
const EXTERNAL_STATS_PATH = `platformExternalStats/${EXTERNAL_SOURCE_ID}`;
const PLATFORM_STATS_PATH = 'settings/platformStats';
const PUBLIC_CHURCH_PATH = `publicChurches/${TARGET_CHURCH_ID}`;
const LEGACY_DIRECTORY_PATH = 'settings/churchDirectory';
const PUBLIC_DIRECTORY_META_PATH = 'publicDirectoryMeta/current';
const UNAFFILIATED_CHURCH_ID = 'unaffiliated_v1';
const CONFIRM_PHRASE = 'SYNC_SUNGSEO_PROMO_STATS';
const mode = process.argv[2] || 'preview';
const apply = process.argv.includes('--apply');
const confirmation = process.argv.find(value => value.startsWith('--confirm='))?.slice(10) || '';
const sourceStatsArgument = process.argv.find(value => value.startsWith('--source-stats='))?.slice(15) || '';

const fail = message => {
  throw new Error(message);
};
if (!['preview', 'sync'].includes(mode)) {
  fail('Usage: node scripts/sync-sungseo-promo-stats.mjs preview|sync [--apply --confirm=SYNC_SUNGSEO_PROMO_STATS]');
}
if (mode === 'sync' && (!apply || confirmation !== CONFIRM_PHRASE)) {
  fail(`sync requires --apply --confirm=${CONFIRM_PHRASE}`);
}
const sourceStatsOverride = (() => {
  if (!sourceStatsArgument) return null;
  const values = sourceStatsArgument.split(',').map(Number);
  if (values.length !== 4 || values.some(value => !Number.isSafeInteger(value) || value < 0)) {
    fail('--source-stats requires total_readers,readers_today,finished_total,total_progress_days.');
  }
  const [total_readers, readers_today, finished_total, total_progress_days] = values;
  if (total_readers < 1 || total_readers > 1_000 || readers_today > total_readers) {
    fail('--source-stats values are outside the safety range.');
  }
  return { total_readers, readers_today, finished_total, total_progress_days };
})();

const firebaseToolsRoot = [
  '/opt/homebrew/lib/node_modules/firebase-tools',
  '/usr/local/lib/node_modules/firebase-tools',
].find(root => fs.existsSync(path.join(root, 'package.json')));
if (!firebaseToolsRoot) fail('Firebase CLI installation not found.');
const require = createRequire(path.join(firebaseToolsRoot, 'package.json'));
const firebaseAuth = require('./lib/auth');
const account = firebaseAuth.getGlobalDefaultAccount();
if (!account?.tokens?.refresh_token) fail('Firebase CLI login not found. Run firebase login --reauth.');
const scopes = String(account.tokens.scope || 'https://www.googleapis.com/auth/cloud-platform')
  .split(/\s+/)
  .filter(Boolean);
const tokenResult = await firebaseAuth.getAccessToken(account.tokens.refresh_token, scopes);
const targetAccessToken = tokenResult?.access_token || tokenResult;
if (!targetAccessToken) fail('Unable to obtain Firebase admin access token.');

const encodePath = documentPath => documentPath.split('/').map(encodeURIComponent).join('/');
const databaseName = projectId => `projects/${projectId}/databases/(default)`;
const firestoreRoot = projectId =>
  `https://firestore.googleapis.com/v1/${databaseName(projectId)}/documents`;
const fullName = (projectId, documentPath) => `${databaseName(projectId)}/documents/${documentPath}`;
const encodeValue = value => {
  if (value === null || value === undefined) return { nullValue: null };
  if (value instanceof Date) return { timestampValue: value.toISOString() };
  if (typeof value === 'boolean') return { booleanValue: value };
  if (typeof value === 'string') return { stringValue: value };
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) fail('Cannot encode a non-finite number.');
    return Number.isSafeInteger(value) ? { integerValue: String(value) } : { doubleValue: value };
  }
  if (Array.isArray(value)) return { arrayValue: { values: value.map(encodeValue) } };
  if (typeof value === 'object') return { mapValue: { fields: encodeFields(value) } };
  fail(`Unsupported Firestore value: ${typeof value}`);
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
  name: document.name,
  id: String(document.name || '').split('/').at(-1),
  updateTime: document.updateTime,
  data: decodeFields(document.fields || {}),
});
const safeCount = (value, fallback = 0) =>
  Number.isSafeInteger(Number(value)) && Number(value) >= 0 ? Number(value) : fallback;
const safeAdd = (left, right, label) => {
  const result = left + right;
  if (!Number.isSafeInteger(result) || result < 0) fail(`${label} exceeds the safe integer range.`);
  return result;
};
const compareText = (left, right) => {
  const leftPoints = Array.from(left, character => character.codePointAt(0));
  const rightPoints = Array.from(right, character => character.codePointAt(0));
  const length = Math.min(leftPoints.length, rightPoints.length);
  for (let index = 0; index < length; index += 1) {
    if (leftPoints[index] !== rightPoints[index]) return leftPoints[index] - rightPoints[index];
  }
  return leftPoints.length - rightPoints.length;
};
const legacyDateKst = date => {
  const shifted = new Date(date.getTime() + 9 * 60 * 60 * 1_000);
  const weekdays = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${weekdays[shifted.getUTCDay()]} ${months[shifted.getUTCMonth()]} ${String(shifted.getUTCDate()).padStart(2, '0')} ${shifted.getUTCFullYear()}`;
};

const requestJson = async (url, init = {}, allowedStatuses = []) => {
  const response = await fetch(url, init);
  const body = await response.json().catch(() => ({}));
  if (!response.ok && !allowedStatuses.includes(response.status)) {
    fail(`${init.method || 'GET'} ${new URL(url).pathname} failed: HTTP ${response.status} ${JSON.stringify(body).slice(0, 300)}`);
  }
  return { response, body };
};
const signInSourceAnonymously = async () => {
  const { body } = await requestJson(
    `https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=${encodeURIComponent(SOURCE_API_KEY)}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ returnSecureToken: true }),
    },
  );
  if (!body.idToken) fail('Source anonymous Firebase authentication failed.');
  return body.idToken;
};
const listDocuments = async (projectId, collectionPath, token, pageSize = 300) => {
  const documents = [];
  let pageToken = '';
  do {
    const url = new URL(`${firestoreRoot(projectId)}/${encodePath(collectionPath)}`);
    url.searchParams.set('pageSize', String(pageSize));
    if (pageToken) url.searchParams.set('pageToken', pageToken);
    const { body } = await requestJson(url, {
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    });
    documents.push(...(body.documents || []).map(decodeDocument));
    pageToken = body.nextPageToken || '';
  } while (pageToken);
  return documents;
};
const getSourceDocument = async (documentPath, token) => {
  const result = await requestJson(
    `${firestoreRoot(SOURCE_PROJECT_ID)}/${encodePath(documentPath)}`,
    {
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    },
    [404],
  );
  return result.response.status === 404 ? null : decodeDocument(result.body);
};
const getTargetDocument = async documentPath => {
  const result = await requestJson(
    `${firestoreRoot(TARGET_PROJECT_ID)}/${encodePath(documentPath)}`,
    {
      headers: { Authorization: `Bearer ${targetAccessToken}`, 'Content-Type': 'application/json' },
    },
    [404],
  );
  return result.response.status === 404 ? null : decodeDocument(result.body);
};
const commitTarget = async writes => {
  if (writes.length === 0) return;
  await requestJson(`${firestoreRoot(TARGET_PROJECT_ID)}:commit`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${targetAccessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ writes }),
  });
};
const upsertWrite = (documentPath, data, current) => ({
  update: {
    name: fullName(TARGET_PROJECT_ID, documentPath),
    fields: encodeFields(data),
  },
  currentDocument: current?.updateTime
    ? { updateTime: current.updateTime }
    : { exists: false },
});
const maskedUpsertWrite = (documentPath, data, current) => ({
  ...upsertWrite(documentPath, data, current),
  // 집계 필드만 갱신하고 같은 문서의 개인정보 공개 차단 표식·순위 필드는 보존한다.
  updateMask: { fieldPaths: Object.keys(data) },
});

const now = new Date();
const today = legacyDateKst(now);
let sourceMethod = 'summary/global';
let sourceStats;
if (sourceStatsOverride) {
  // 운영 관리자 화면의 전체 회원 표와 오늘 통계에서 같은 시각에 읽은
  // 집계값만 받는다. 개인정보나 계정 토큰은 대상 프로젝트에 저장하지 않는다.
  sourceMethod = 'authenticated-admin-ui';
  sourceStats = { ...sourceStatsOverride, today_date: today };
} else {
  const sourceToken = await signInSourceAnonymously();
  // 구형 앱이 매 읽기 완료 때 갱신하는 summary/global 한 문서만 읽는다.
  // users 풀스캔은 무료 Firestore 읽기 할당량을 크게 소모하므로 자동화에서 사용하지 않는다.
  const sourceSummary = await getSourceDocument('summary/global', sourceToken);
  const sourceMembers = sourceSummary?.data?.members;
  if (!sourceMembers || typeof sourceMembers !== 'object' || Array.isArray(sourceMembers)) {
    fail('Source summary/global.members is missing or invalid; refusing a users full scan.');
  }
  const sourceUsers = Object.entries(sourceMembers).map(([uid, data]) => ({
    id: uid,
    data: data && typeof data === 'object' ? data : {},
  }));
  const activeSourceUsers = sourceUsers.filter(({ data }) => data.isDeleted !== true);
  if (activeSourceUsers.length < 1 || activeSourceUsers.length > 1_000) {
    fail(`Source user count is outside the safety range: ${activeSourceUsers.length}.`);
  }
  sourceStats = activeSourceUsers.reduce((stats, { data }) => {
    const readCount = Math.max(1, safeCount(data.readCount, 1));
    const currentDay = Math.min(365, Math.max(1, safeCount(data.currentDay, 1)));
    stats.finished_total = safeAdd(stats.finished_total, readCount - 1, 'source finished_total');
    stats.total_progress_days = safeAdd(
      stats.total_progress_days,
      ((readCount - 1) * 365) + (currentDay - 1),
      'source total_progress_days',
    );
    if (data.lastReadDate === today) stats.readers_today += 1;
    return stats;
  }, {
    total_readers: activeSourceUsers.length,
    readers_today: 0,
    finished_total: 0,
    total_progress_days: 0,
    today_date: today,
  });
}

const [
  targetUsers,
  targetChurches,
  externalSources,
  currentChurch,
  currentExternal,
  currentStats,
  currentPublicChurch,
  currentLegacyDirectory,
  currentPublicDirectoryMeta,
] =
  await Promise.all([
    listDocuments(TARGET_PROJECT_ID, 'users', targetAccessToken),
    listDocuments(TARGET_PROJECT_ID, 'churches', targetAccessToken),
    listDocuments(TARGET_PROJECT_ID, 'platformExternalStats', targetAccessToken),
    getTargetDocument(`churches/${TARGET_CHURCH_ID}`),
    getTargetDocument(EXTERNAL_STATS_PATH),
    getTargetDocument(PLATFORM_STATS_PATH),
    getTargetDocument(PUBLIC_CHURCH_PATH),
    getTargetDocument(LEGACY_DIRECTORY_PATH),
    getTargetDocument(PUBLIC_DIRECTORY_META_PATH),
  ]);

if (
  currentChurch
  && (
    currentChurch.data.name !== TARGET_CHURCH_NAME
    || currentChurch.data.externalStatsSourceId !== EXTERNAL_SOURCE_ID
    || currentChurch.data.isExternalStatsOnly !== true
  )
) {
  fail(`Target church collision: churches/${TARGET_CHURCH_ID}.`);
}
if (
  currentExternal
  && (
    currentExternal.data.churchId !== TARGET_CHURCH_ID
    || currentExternal.data.sourceProjectId !== SOURCE_PROJECT_ID
  )
) {
  fail(`External stats source collision: ${EXTERNAL_STATS_PATH}.`);
}
if (
  currentPublicChurch
  && (
    currentPublicChurch.data.id !== TARGET_CHURCH_ID
    || currentPublicChurch.data.name !== TARGET_CHURCH_NAME
  )
) {
  fail(`Public church collision: ${PUBLIC_CHURCH_PATH}.`);
}
if (
  !currentLegacyDirectory
  || !Array.isArray(currentLegacyDirectory.data.churches)
  || !currentPublicDirectoryMeta
  || currentPublicDirectoryMeta.data.ready !== true
  || currentPublicDirectoryMeta.data.mode !== 'public'
  || currentPublicDirectoryMeta.data.schemaVersion !== 1
) {
  fail('Public church directory is not in a safe publishable state.');
}
if (currentExternal) {
  const previousReaders = safeCount(currentExternal.data.total_readers);
  const drift = Math.abs(previousReaders - sourceStats.total_readers);
  if (previousReaders > 0 && drift > 20 && drift / previousReaders > 0.25) {
    fail(`Source reader count drift is too large: ${previousReaders} -> ${sourceStats.total_readers}.`);
  }
}

const activeTargetUsers = targetUsers.filter(({ data }) =>
  data.isDeleted !== true && data.excludeFromPublicStats !== true
);
const churchExistsInSnapshot = targetChurches.some(({ id }) => id === TARGET_CHURCH_ID);
const targetChurchSnapshot = churchExistsInSnapshot
  ? targetChurches
  : [...targetChurches, {
    id: TARGET_CHURCH_ID,
    data: { name: TARGET_CHURCH_NAME, isDeleted: false, isExternalStatsOnly: true },
  }];
const activeTargetChurchIds = new Set(
  targetChurchSnapshot
    .filter(({ id, data }) =>
      data.isDeleted !== true
      && data.isVirtual !== true
      && id !== UNAFFILIATED_CHURCH_ID
    )
    .map(({ id }) => id),
);
const externalSnapshot = [
  ...externalSources.filter(({ id }) => id !== EXTERNAL_SOURCE_ID),
  {
    id: EXTERNAL_SOURCE_ID,
    data: {
      enabled: true,
      churchId: TARGET_CHURCH_ID,
      sourceProjectId: SOURCE_PROJECT_ID,
      ...sourceStats,
    },
  },
];
const enabledExternalSources = externalSnapshot.filter(({ data }) =>
  data.enabled === true
  && typeof data.churchId === 'string'
  && activeTargetChurchIds.has(data.churchId)
);
const addExternal = key => enabledExternalSources.reduce(
  (sum, { data }) => safeAdd(sum, safeCount(data[key]), `external ${key}`),
  0,
);
const expectedStats = {
  total_readers: safeAdd(activeTargetUsers.length, addExternal('total_readers'), 'total_readers'),
  total_churches: activeTargetChurchIds.size,
  readers_today: safeAdd(
    activeTargetUsers.filter(({ data }) => data.lastReadDate === today).length,
    enabledExternalSources
      .filter(({ data }) => data.today_date === today)
      .reduce((sum, { data }) => safeAdd(sum, safeCount(data.readers_today), 'readers_today'), 0),
    'readers_today',
  ),
  finished_total: safeAdd(
    activeTargetUsers.reduce(
      (sum, { data }) => safeAdd(sum, Math.max(safeCount(data.readCount, 1) - 1, 0), 'target finished_total'),
      0,
    ),
    addExternal('finished_total'),
    'finished_total',
  ),
  today_date: today,
};
const currentStatsValues = Object.fromEntries(
  Object.keys(expectedStats).map(key => [key, currentStats?.data?.[key] ?? null]),
);
const expectedDirectoryChurches = [
  ...currentLegacyDirectory.data.churches.filter(entry =>
    entry?.id !== TARGET_CHURCH_ID
  ),
  { id: TARGET_CHURCH_ID, name: TARGET_CHURCH_NAME },
].sort((left, right) =>
  compareText(String(left.name || ''), String(right.name || ''))
  || compareText(String(left.id || ''), String(right.id || ''))
);
const expectedDirectoryCount = expectedDirectoryChurches.length;

const result = {
  mode,
  source: {
    projectId: SOURCE_PROJECT_ID,
    churchName: TARGET_CHURCH_NAME,
    method: sourceMethod,
    ...sourceStats,
  },
  target: {
    projectId: TARGET_PROJECT_ID,
    churchId: TARGET_CHURCH_ID,
    churchExists: Boolean(currentChurch),
    churchListed: Boolean(currentPublicChurch),
    expectedDirectoryCount,
    expectedStats,
    currentStats: currentStatsValues,
  },
};
if (mode === 'preview') {
  console.log(JSON.stringify(result, null, 2));
  process.exit(0);
}

const churchData = {
  ...(currentChurch?.data || {
    name: TARGET_CHURCH_NAME,
    pastorName: '',
    denomination: '',
    adminUid: null,
    adminEmail: null,
    departments: [],
    isDeleted: false,
    isVirtual: false,
    isExternalStatsOnly: true,
    externalStatsSourceId: EXTERNAL_SOURCE_ID,
    createdAt: now,
  }),
  hiddenFromDirectory: false,
};
const externalData = {
  schemaVersion: 1,
  enabled: true,
  sourceProjectId: SOURCE_PROJECT_ID,
  churchId: TARGET_CHURCH_ID,
  churchName: TARGET_CHURCH_NAME,
  ...sourceStats,
  syncedAt: now,
};
const platformStatsData = {
  ...expectedStats,
  updatedAt: now,
  rebuiltAt: now,
  rebuiltBy: 'sungseo-promo-stats-sync',
};
await commitTarget([
  upsertWrite(`churches/${TARGET_CHURCH_ID}`, churchData, currentChurch),
  upsertWrite(EXTERNAL_STATS_PATH, externalData, currentExternal),
  maskedUpsertWrite(PLATFORM_STATS_PATH, platformStatsData, currentStats),
  upsertWrite(PUBLIC_CHURCH_PATH, {
    id: TARGET_CHURCH_ID,
    name: TARGET_CHURCH_NAME,
  }, currentPublicChurch),
  upsertWrite(LEGACY_DIRECTORY_PATH, {
    churches: expectedDirectoryChurches,
    updatedAt: now,
  }, currentLegacyDirectory),
  upsertWrite(PUBLIC_DIRECTORY_META_PATH, {
    ready: true,
    mode: 'public',
    schemaVersion: 1,
    count: expectedDirectoryCount,
    updatedAt: now,
  }, currentPublicDirectoryMeta),
]);

const [
  verifiedChurch,
  verifiedExternal,
  verifiedStats,
  verifiedPublicChurch,
  verifiedLegacyDirectory,
  verifiedPublicDirectoryMeta,
] = await Promise.all([
  getTargetDocument(`churches/${TARGET_CHURCH_ID}`),
  getTargetDocument(EXTERNAL_STATS_PATH),
  getTargetDocument(PLATFORM_STATS_PATH),
  getTargetDocument(PUBLIC_CHURCH_PATH),
  getTargetDocument(LEGACY_DIRECTORY_PATH),
  getTargetDocument(PUBLIC_DIRECTORY_META_PATH),
]);
const verified = Boolean(
  verifiedChurch?.data?.name === TARGET_CHURCH_NAME
  && verifiedChurch?.data?.hiddenFromDirectory === false
  && verifiedChurch?.data?.isExternalStatsOnly === true
  && verifiedExternal?.data?.total_readers === sourceStats.total_readers
  && Object.entries(expectedStats).every(([key, value]) => verifiedStats?.data?.[key] === value)
  && verifiedPublicChurch?.data?.id === TARGET_CHURCH_ID
  && verifiedPublicChurch?.data?.name === TARGET_CHURCH_NAME
  && Array.isArray(verifiedLegacyDirectory?.data?.churches)
  && verifiedLegacyDirectory.data.churches.some(entry =>
    entry?.id === TARGET_CHURCH_ID && entry?.name === TARGET_CHURCH_NAME
  )
  && verifiedPublicDirectoryMeta?.data?.count === expectedDirectoryCount
);
if (!verified) fail('Post-sync verification failed.');
console.log(JSON.stringify({ ...result, status: 'synced', verified: true }, null, 2));
