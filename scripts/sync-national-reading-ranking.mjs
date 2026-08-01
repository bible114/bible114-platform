#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { createHash } from 'node:crypto';
import {
  PUBLIC_NATIONAL_RANKING_LIMIT,
  PUBLIC_NATIONAL_RANKING_SCHEMA_VERSION,
  PUBLIC_NATIONAL_RANKING_STATUS,
} from '../src/utils/publicNationalRanking.js';

const PROJECT_ID = 'bible114-platform';
const PLATFORM_STATS_PATH = 'settings/platformStats';
const PRIVATE_RANKING_SOURCES_PATH = 'platformInternal/nationalRankingSources';
const EXTERNAL_STATS_PATH = 'platformExternalStats/sungseo';
const UNAFFILIATED_CHURCH_ID = 'unaffiliated_v1';
const SUNGSEO_SOURCE_ID = 'sungseo';
const SUNGSEO_CHURCH_ID = 'sungseo_promo_v1';
const SUNGSEO_CHURCH_NAME = '성서교회';
const EXTERNAL_SOURCE_LIMIT = 1_000;
const CONFIRM_PHRASE = 'SYNC_NATIONAL_READING_RANKING';
if (process.argv.includes('--help')) {
  console.log([
    'Read-only preview:',
    '  npm run sync:national-ranking',
    '',
    'Apply only after explicit operational approval:',
    `  npm run sync:national-ranking -- --apply --confirm=${CONFIRM_PHRASE}`,
  ].join('\n'));
  process.exit(0);
}
const apply = process.argv.includes('--apply');
const force = process.argv.includes('--force');
const confirmation = process.argv.find(value => value.startsWith('--confirm='))?.slice(10) || '';
const sungseoRankingFileArgument = process.argv
  .find(value => value.startsWith('--sungseo-ranking-file='))
  ?.slice('--sungseo-ranking-file='.length) || '';
const sungseoRankingFromStdin = process.argv.includes('--sungseo-ranking-stdin');

if (apply && confirmation !== CONFIRM_PHRASE) {
  throw new Error(`Apply requires --confirm=${CONFIRM_PHRASE}`);
}
if (sungseoRankingFileArgument && sungseoRankingFromStdin) {
  throw new Error('Use only one Sungseo ranking input channel.');
}
// 공개 행에는 교회명, 가린 이름, 현재 회차와 일수만 포함한다.

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
  if (typeof value === 'number') {
    if (!Number.isSafeInteger(value)) throw new Error('Ranking values must be safe integers.');
    return { integerValue: String(value) };
  }
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
const requestJson = async (url, init = {}, allowedStatuses = []) => {
  const response = await fetch(url, { ...init, headers: { ...headers, ...(init.headers || {}) } });
  const body = await response.json().catch(() => ({}));
  if (!response.ok && !allowedStatuses.includes(response.status)) {
    throw new Error(`${init.method || 'GET'} ${new URL(url).pathname} failed: HTTP ${response.status}`);
  }
  return { response, body };
};
const getDocument = async (documentPath, { allowMissing = false } = {}) => {
  const { response, body } = await requestJson(
    `${firestoreRoot}/${encodePath(documentPath)}`,
    {},
    allowMissing ? [404] : [],
  );
  return response.status === 404 ? null : decodeDocument(body);
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
const safePositiveInteger = (value, fallback = null) => (
  Number.isSafeInteger(value) && value >= 1 ? value : fallback
);
const safeNonNegativeInteger = (value, fallback = null) => (
  Number.isSafeInteger(value) && value >= 0 ? value : fallback
);
const compareText = (left, right) => String(left).localeCompare(String(right), 'ko');
const kstDate = date => new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Asia/Seoul',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
}).format(date);
const isoDateToUtcDay = value => {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return (
    Number.isFinite(parsed.getTime())
    && parsed.toISOString().slice(0, 10) === value
  ) ? Math.floor(parsed.getTime() / 86_400_000) : null;
};
const exactKeys = (value, keys) => (
  value
  && typeof value === 'object'
  && !Array.isArray(value)
  && Object.keys(value).sort().join('\0') === [...keys].sort().join('\0')
);
const maskName = value => {
  const characters = Array.from(String(value || '').trim().replace(/\s+/g, ''));
  if (characters.length === 0) return '';
  if (characters.length === 1) return '＊';
  if (characters.length === 2) return `${characters[0]}＊`;
  return `${characters[0]}＊${characters.at(-1)}`;
};
const isMaskedName = value => {
  const characters = Array.from(String(value || ''));
  return (
    (characters.length === 1 && characters[0] === '＊')
    || (characters.length === 2 && characters[1] === '＊')
    || (characters.length === 3 && characters[1] === '＊')
  );
};
const normalizeSungseoEntries = entries => {
  if (!Array.isArray(entries) || entries.length > EXTERNAL_SOURCE_LIMIT) {
    throw new Error('Sungseo ranking entries must be an array of at most 1,000 rows.');
  }
  return entries.map((entry, index) => {
    if (!exactKeys(entry, ['sourceRow', 'maskedName', 'readCount', 'currentDay'])) {
      throw new Error(`Sungseo ranking row ${index + 1} has unexpected fields.`);
    }
    const sourceRow = safePositiveInteger(entry.sourceRow);
    const maskedName = String(entry.maskedName || '');
    const readCount = safePositiveInteger(entry.readCount);
    const currentDay = safePositiveInteger(entry.currentDay);
    if (
      sourceRow !== index + 1
      || !isMaskedName(maskedName)
      || !readCount
      || !currentDay
      || currentDay > 365
    ) {
      throw new Error(`Sungseo ranking row ${index + 1} is invalid.`);
    }
    return { sourceRow, maskedName, readCount, currentDay };
  });
};
const normalizeSungseoSource = input => {
  const expectedKeys = [
    'schemaVersion',
    'sourceId',
    'churchId',
    'churchName',
    'capturedDate',
    'capturedAt',
    'readerCount',
    'readersToday',
    'finishedTotal',
    'totalProgressDays',
    'entries',
  ];
  const capturedAt = new Date(input?.capturedAt);
  const readerCount = safePositiveInteger(input?.readerCount);
  const readersToday = safeNonNegativeInteger(input?.readersToday);
  const finishedTotal = safeNonNegativeInteger(input?.finishedTotal);
  const totalProgressDays = safeNonNegativeInteger(input?.totalProgressDays);
  const entries = normalizeSungseoEntries(input?.entries);
  const calculatedFinishedTotal = entries.reduce(
    (sum, entry) => sum + entry.readCount - 1,
    0,
  );
  const calculatedTotalProgressDays = entries.reduce(
    (sum, entry) => sum + ((entry.readCount - 1) * 365) + entry.currentDay - 1,
    0,
  );
  if (
    !exactKeys(input, expectedKeys)
    || input.schemaVersion !== 3
    || input.sourceId !== SUNGSEO_SOURCE_ID
    || input.churchId !== SUNGSEO_CHURCH_ID
    || input.churchName !== SUNGSEO_CHURCH_NAME
    || isoDateToUtcDay(input.capturedDate) === null
    || !Number.isFinite(capturedAt.getTime())
    || capturedAt.toISOString() !== input.capturedAt
    || kstDate(capturedAt) !== input.capturedDate
    || !readerCount
    || readersToday === null
    || readersToday > readerCount
    || finishedTotal === null
    || totalProgressDays === null
    || entries.length !== readerCount
    || calculatedFinishedTotal !== finishedTotal
    || calculatedTotalProgressDays !== totalProgressDays
  ) {
    throw new Error('Sungseo masked-ranking input envelope is invalid.');
  }
  return {
    sourceId: SUNGSEO_SOURCE_ID,
    churchId: SUNGSEO_CHURCH_ID,
    churchName: SUNGSEO_CHURCH_NAME,
    capturedDate: input.capturedDate,
    capturedAt: input.capturedAt,
    readerCount,
    readersToday,
    finishedTotal,
    totalProgressDays,
    entries,
  };
};
const parseSungseoRankingInput = rawInput => {
  const input = JSON.parse(rawInput);
  return normalizeSungseoSource(input);
};
const readSungseoRankingInput = (fileArgument, fromStdin) => {
  if (!fileArgument && !fromStdin) return null;
  if (fromStdin) {
    const rawInput = fs.readFileSync(0, 'utf8');
    if (Buffer.byteLength(rawInput, 'utf8') > 256 * 1_024) {
      throw new Error('Sungseo ranking stdin exceeds 256 KiB.');
    }
    return parseSungseoRankingInput(rawInput);
  }
  const filePath = path.resolve(fileArgument);
  const stat = fs.statSync(filePath);
  if (!stat.isFile() || stat.size > 256 * 1_024 || (stat.mode & 0o077) !== 0) {
    throw new Error('Sungseo ranking input must be a private regular file under 256 KiB with mode 0600.');
  }
  return parseSungseoRankingInput(fs.readFileSync(filePath, 'utf8'));
};
const normalizeStoredSungseoSource = document => {
  if (!document) return {
    sourceId: SUNGSEO_SOURCE_ID,
    churchId: SUNGSEO_CHURCH_ID,
    churchName: SUNGSEO_CHURCH_NAME,
    capturedDate: null,
    capturedAt: null,
    readerCount: 0,
    readersToday: 0,
    finishedTotal: 0,
    totalProgressDays: 0,
    entries: [],
  };
  const source = document.data?.sungseo;
  if (
    document.data?.schemaVersion === 3
    && exactKeys(source, [
      'sourceId',
      'churchId',
      'churchName',
      'capturedDate',
      'capturedAt',
      'readerCount',
      'readersToday',
      'finishedTotal',
      'totalProgressDays',
      'entries',
    ])
  ) {
    return normalizeSungseoSource({ schemaVersion: 3, ...source });
  }
  throw new Error(
    'Stored Sungseo source has no masked individual entries; provide a fresh schema 3 input.',
  );
};
const rankingsEqual = (left, right) => (
  Array.isArray(left)
  && Array.isArray(right)
  && left.length === right.length
  && left.every((entry, index) => {
    const expected = right[index];
    return entry?.rank === expected?.rank
      && entry?.churchName === expected?.churchName
      && entry?.maskedName === expected?.maskedName
      && entry?.readCount === expected?.readCount
      && entry?.currentDay === expected?.currentDay;
  })
);

const now = new Date();
const today = kstDate(now);
const sungseoRankingInput = readSungseoRankingInput(
  sungseoRankingFileArgument,
  sungseoRankingFromStdin,
);
const [
  users,
  churches,
  platformStats,
  privateRankingSources,
  externalStats,
] = await Promise.all([
  listDocuments('users'),
  listDocuments('churches'),
  getDocument(PLATFORM_STATS_PATH),
  getDocument(PRIVATE_RANKING_SOURCES_PATH, { allowMissing: true }),
  getDocument(EXTERNAL_STATS_PATH, { allowMissing: true }),
]);
const activeChurchNames = new Map(
  churches
    .filter(({ data }) =>
      data.isDeleted !== true
      && data.isVirtual !== true
      && data.hiddenFromDirectory !== true
    )
    .map(({ id, data }) => [id, String(data.name || data.churchName || '').trim()])
    .filter(([, name]) => name),
);
const platformEligible = users.flatMap(({ id, data }) => {
  if (
    data.isDeleted === true
    || data.excludeFromPublicStats === true
    || data.hideFromPublicRanking === true
    || data.fixtureType === 'reading-badge-test'
    || ['platformAdmin', 'superAdmin'].includes(String(data.role || ''))
  ) {
    return [];
  }
  const readCount = safePositiveInteger(data.readCount);
  const currentDay = safePositiveInteger(data.currentDay);
  const maskedName = maskName(data.name);
  if (!readCount || !currentDay || currentDay > 365 || !maskedName) return [];

  const churchId = String(data.primaryOrgId || data.churchId || '').trim();
  if (
    !churchId
    || churchId === UNAFFILIATED_CHURCH_ID
    || churchId === SUNGSEO_CHURCH_ID
  ) return [];
  const churchName = activeChurchNames.get(churchId);
  if (!churchName) return [];
  return [{
    id: `platform:${id}`,
    churchName,
    maskedName,
    readCount,
    currentDay,
  }];
});
const sungseoSource = sungseoRankingInput
  ?? normalizeStoredSungseoSource(privateRankingSources);
const sungseoSourceDate = sungseoSource.capturedDate;
const todayUtcDay = isoDateToUtcDay(today);
const sungseoSourceUtcDay = isoDateToUtcDay(sungseoSourceDate);
const sungseoSourceAgeDays = sungseoSource.readerCount > 0
  ? todayUtcDay - sungseoSourceUtcDay
  : 0;
if (
  sungseoSource.readerCount > 0
  && (
    sungseoSourceUtcDay === null
    || sungseoSourceAgeDays < 0
  )
) {
  throw new Error('Sungseo ranking source date is missing or in the future.');
}
const sungseoSourceFresh = sungseoSource.readerCount === 0 || sungseoSourceAgeDays === 0;
if (sungseoRankingInput !== null) {
  const external = externalStats?.data;
  if (
    !external
    || external.enabled !== true
    || external.schemaVersion !== 1
    || external.churchId !== SUNGSEO_CHURCH_ID
    || external.churchName !== SUNGSEO_CHURCH_NAME
    || external.total_readers !== sungseoSource.readerCount
    || external.readers_today !== sungseoSource.readersToday
    || external.finished_total !== sungseoSource.finishedTotal
    || external.total_progress_days !== sungseoSource.totalProgressDays
  ) {
    throw new Error(
      'Same-day Sungseo aggregate must match platformExternalStats/sungseo before ranking preview or apply.',
    );
  }
}
const sungseoEligible = sungseoSource.entries.map(entry => ({
  id: `sungseo:${String(entry.sourceRow).padStart(4, '0')}`,
  churchName: SUNGSEO_CHURCH_NAME,
  maskedName: entry.maskedName,
  readCount: entry.readCount,
  currentDay: entry.currentDay,
}));
const eligible = [...platformEligible, ...sungseoEligible];
eligible.sort((left, right) =>
  right.readCount - left.readCount
  || right.currentDay - left.currentDay
  || compareText(left.churchName, right.churchName)
  || compareText(left.maskedName, right.maskedName)
  || compareText(left.id, right.id)
);
const ranking = eligible
  .slice(0, PUBLIC_NATIONAL_RANKING_LIMIT)
  .map(({ id: _id, ...entry }, index) => ({ rank: index + 1, ...entry }));
const rankingSha256 = createHash('sha256')
  .update(JSON.stringify(ranking))
  .digest('hex');
const alreadyUpdatedToday = platformStats.data.national_ranking_date === today;
const result = {
  projectId: PROJECT_ID,
  date: today,
  eligibleReaders: eligible.length,
  platformReaders: platformEligible.length,
  sungseoReaders: sungseoSource.readerCount,
  sungseoInputProvided: sungseoRankingInput !== null,
  sungseoSourceFresh,
  sungseoSourceAgeDays,
  publishedReaders: ranking.length,
  alreadyUpdatedToday,
  changed: !rankingsEqual(platformStats.data.national_ranking, ranking),
  publicationMode: 'masked_individual',
  rankingSha256,
};

if (!apply) {
  console.log(JSON.stringify(result, null, 2));
  process.exit(0);
}
if (!sungseoSourceFresh) {
  throw new Error(
    `Apply requires a same-day Sungseo source; current source is ${sungseoSourceAgeDays} day(s) old.`,
  );
}
if (
  alreadyUpdatedToday
  && !result.changed
  && !force
  && sungseoRankingInput === null
) {
  console.log(JSON.stringify({ ...result, applied: false, reason: 'already-updated-today' }, null, 2));
  process.exit(0);
}

const rankingFields = {
  national_ranking: ranking,
  national_ranking_date: today,
  national_ranking_source_date: sungseoSourceDate || today,
  national_ranking_updated_at: now,
  national_ranking_schema_version: PUBLIC_NATIONAL_RANKING_SCHEMA_VERSION,
  national_ranking_publication_status: PUBLIC_NATIONAL_RANKING_STATUS,
  church_ranking: [],
  church_ranking_publication_status: 'disabled_individual_ranking_restored',
};
const writes = [{
    update: { name: fullName(PLATFORM_STATS_PATH), fields: encodeFields(rankingFields) },
    updateMask: { fieldPaths: Object.keys(rankingFields) },
    currentDocument: { updateTime: platformStats.updateTime },
}];
if (sungseoRankingInput !== null) {
  const privateSourceData = {
    schemaVersion: 3,
    sungseo: {
      sourceId: SUNGSEO_SOURCE_ID,
      churchId: SUNGSEO_CHURCH_ID,
      churchName: SUNGSEO_CHURCH_NAME,
      capturedDate: sungseoSource.capturedDate,
      capturedAt: sungseoSource.capturedAt,
      readerCount: sungseoSource.readerCount,
      readersToday: sungseoSource.readersToday,
      finishedTotal: sungseoSource.finishedTotal,
      totalProgressDays: sungseoSource.totalProgressDays,
      entries: sungseoSource.entries,
    },
    updatedAt: now,
  };
  writes.push({
    update: { name: fullName(PRIVATE_RANKING_SOURCES_PATH), fields: encodeFields(privateSourceData) },
    currentDocument: privateRankingSources
      ? { updateTime: privateRankingSources.updateTime }
      : { exists: false },
  });
}
const commitBody = {
  writes,
};
await requestJson(
  `https://firestore.googleapis.com/v1/${databaseName}/documents:commit`,
  { method: 'POST', body: JSON.stringify(commitBody) },
);
const verified = await getDocument(PLATFORM_STATS_PATH);
const verifiedRanking = verified.data.national_ranking;
if (
  verified.data.national_ranking_date !== today
  || !rankingsEqual(verifiedRanking, ranking)
  || verified.data.national_ranking_schema_version
    !== PUBLIC_NATIONAL_RANKING_SCHEMA_VERSION
  || verified.data.national_ranking_publication_status
    !== PUBLIC_NATIONAL_RANKING_STATUS
  || verified.data.church_ranking_publication_status
    !== 'disabled_individual_ranking_restored'
  || !Array.isArray(verified.data.church_ranking)
  || verified.data.church_ranking.length !== 0
) {
  throw new Error('Published masked individual ranking verification failed.');
}
if (sungseoRankingInput !== null) {
  const verifiedPrivateSources = await getDocument(PRIVATE_RANKING_SOURCES_PATH);
  const verifiedSungseo = normalizeStoredSungseoSource(verifiedPrivateSources);
  const verifiedExternalStats = await getDocument(EXTERNAL_STATS_PATH);
  if (
    JSON.stringify(verifiedSungseo) !== JSON.stringify(sungseoSource)
    || verifiedExternalStats.updateTime !== externalStats.updateTime
  ) {
    throw new Error('Private Sungseo source or external aggregate verification failed.');
  }
}
console.log(JSON.stringify({ ...result, applied: true, verified: true }, null, 2));
