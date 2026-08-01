#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { createHash } from 'node:crypto';

const PROJECT_ID = 'bible114-platform';
const PLATFORM_STATS_PATH = 'settings/platformStats';
const CONFIRM_PHRASE = 'DISABLE_PUBLIC_NATIONAL_RANKING';
const DISABLED_STATUS = 'disabled_pending_verified_opt_in';
if (process.argv.includes('--help')) {
  console.log([
    'Read-only preview:',
    '  npm run disable:national-ranking',
    '',
    'Apply only after explicit operational approval:',
    `  npm run disable:national-ranking -- --apply --confirm=${CONFIRM_PHRASE}`,
  ].join('\n'));
  process.exit(0);
}
const apply = process.argv.includes('--apply');
const confirmation = process.argv
  .find(value => value.startsWith('--confirm='))
  ?.slice('--confirm='.length) || '';

if (apply && confirmation !== CONFIRM_PHRASE) {
  throw new Error(`Apply requires --confirm=${CONFIRM_PHRASE}`);
}

const firebaseToolsRoot = [
  '/opt/homebrew/lib/node_modules/firebase-tools',
  '/usr/local/lib/node_modules/firebase-tools',
].find(root => fs.existsSync(path.join(root, 'package.json')));
if (!firebaseToolsRoot) throw new Error('Firebase CLI installation not found.');

const require = createRequire(path.join(firebaseToolsRoot, 'package.json'));
const firebaseAuth = require('./lib/auth');
const account = firebaseAuth.getGlobalDefaultAccount();
if (!account?.tokens?.refresh_token) {
  throw new Error('Firebase CLI login not found.');
}
const scopes = String(
  account.tokens.scope || 'https://www.googleapis.com/auth/cloud-platform',
).split(/\s+/).filter(Boolean);
const tokenResult = await firebaseAuth.getAccessToken(
  account.tokens.refresh_token,
  scopes,
);
const accessToken = tokenResult?.access_token || tokenResult;
if (!accessToken) throw new Error('Unable to obtain Firebase admin access token.');

const databaseName = `projects/${PROJECT_ID}/databases/(default)`;
const documentName = `${databaseName}/documents/${PLATFORM_STATS_PATH}`;
const documentUrl = `https://firestore.googleapis.com/v1/${documentName}`;
const headers = {
  Authorization: `Bearer ${accessToken}`,
  'Content-Type': 'application/json',
};
const requestJson = async (url, init = {}) => {
  const response = await fetch(url, {
    ...init,
    headers: { ...headers, ...(init.headers || {}) },
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(
      `${init.method || 'GET'} ${new URL(url).pathname} failed: HTTP ${response.status}`,
    );
  }
  return body;
};
const rankingCount = document => (
  Array.isArray(document?.fields?.national_ranking?.arrayValue?.values)
    ? document.fields.national_ranking.arrayValue.values.length
    : 0
);
const publicationStatus = document => (
  document?.fields?.national_ranking_publication_status?.stringValue || null
);
const summary = document => ({
  projectId: PROJECT_ID,
  path: PLATFORM_STATS_PATH,
  publicRankingRows: rankingCount(document),
  publicationStatus: publicationStatus(document),
  updateTime: document?.updateTime || null,
});
const canonicalize = value => {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map(key => [key, canonicalize(value[key])]),
    );
  }
  return value;
};
const documentSha256 = document => createHash('sha256')
  .update(JSON.stringify(canonicalize(document)))
  .digest('hex');

const before = await requestJson(documentUrl);
const beforeAudit = {
  beforeRankingRows: rankingCount(before),
  beforeUpdateTime: before.updateTime || null,
  beforeDocumentSha256: documentSha256(before),
};
if (!apply) {
  console.log(JSON.stringify({
    ...summary(before),
    ...beforeAudit,
    applied: false,
  }, null, 2));
  process.exit(0);
}
if (!before.updateTime) {
  throw new Error('Platform stats updateTime is missing.');
}

const now = new Date();
const fields = {
  national_ranking: { arrayValue: { values: [] } },
  national_ranking_date: { nullValue: null },
  national_ranking_updated_at: { timestampValue: now.toISOString() },
  national_ranking_publication_status: { stringValue: DISABLED_STATUS },
};
await requestJson(
  `https://firestore.googleapis.com/v1/${databaseName}/documents:commit`,
  {
    method: 'POST',
    body: JSON.stringify({
      writes: [{
        update: { name: documentName, fields },
        updateMask: { fieldPaths: Object.keys(fields) },
        currentDocument: { updateTime: before.updateTime },
      }],
    }),
  },
);

const after = await requestJson(documentUrl);
if (
  rankingCount(after) !== 0
  || publicationStatus(after) !== DISABLED_STATUS
) {
  throw new Error('Public national ranking disable verification failed.');
}
console.log(JSON.stringify({
  ...beforeAudit,
  ...summary(after),
  applied: true,
  verified: true,
}, null, 2));
