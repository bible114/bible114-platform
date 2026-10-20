#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

const PROJECT_ID = 'bible114-platform';
const CONFIRM_PHRASE = 'PURGE_PLAINTEXT';
const apply = process.argv.includes('--apply');
const confirmation = process.argv.find(value => value.startsWith('--confirm='))?.slice(10) || '';
const fail = message => { throw new Error(message); };
if (process.argv.slice(2).some(arg => arg !== '--apply' && !arg.startsWith('--confirm='))) {
  fail('Usage: node scripts/purge-plaintext-passwords.mjs [--apply --confirm=PURGE_PLAINTEXT]');
}
if (apply && confirmation !== CONFIRM_PHRASE) fail(`--apply requires --confirm=${CONFIRM_PHRASE}`);

const firebaseToolsRoot = [
  '/opt/homebrew/lib/node_modules/firebase-tools',
  '/usr/local/lib/node_modules/firebase-tools',
].find(root => fs.existsSync(path.join(root, 'package.json')));
if (!firebaseToolsRoot) fail('Firebase CLI installation not found.');
const require = createRequire(path.join(firebaseToolsRoot, 'package.json'));
const firebaseAuth = require('./lib/auth');
const account = firebaseAuth.getGlobalDefaultAccount();
if (!account?.tokens?.refresh_token) fail('Firebase CLI login not found. Run firebase login --reauth.');
const scopes = String(account.tokens.scope || 'https://www.googleapis.com/auth/cloud-platform').split(/\s+/).filter(Boolean);
const tokenResult = await firebaseAuth.getAccessToken(account.tokens.refresh_token, scopes);
const accessToken = tokenResult?.access_token || tokenResult;
if (!accessToken) fail('Unable to obtain Firebase admin access token.');

const database = `projects/${PROJECT_ID}/databases/(default)`;
const root = `https://firestore.googleapis.com/v1/${database}/documents`;
const encodePath = value => value.split('/').map(encodeURIComponent).join('/');
const request = async (url, init = {}, allow404 = false) => {
  const response = await fetch(url, init);
  const body = await response.json().catch(() => ({}));
  if (!response.ok && !(allow404 && response.status === 404)) {
    fail(`${init.method || 'GET'} ${new URL(url).pathname} failed: HTTP ${response.status}`);
  }
  return { response, body };
};
const list = async collection => {
  const items = [];
  let pageToken = '';
  do {
    const url = new URL(`${root}/${encodePath(collection)}`);
    url.searchParams.set('pageSize', '300');
    if (pageToken) url.searchParams.set('pageToken', pageToken);
    const { body } = await request(url, { headers: { Authorization: `Bearer ${accessToken}` } });
    items.push(...(body.documents || []));
    pageToken = body.nextPageToken || '';
  } while (pageToken);
  return items;
};
const patchDeleteFields = async (documentPath, fields) => {
  const url = new URL(`${root}/${encodePath(documentPath)}`);
  fields.forEach(field => url.searchParams.append('updateMask.fieldPaths', field));
  await request(url, {
    method: 'PATCH',
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({}),
  });
};

const users = await list('users');
const targets = [];
let parentFieldCount = 0;
for (const user of users) {
  const uid = user.name.split('/').at(-1);
  const data = user.fields || {};
  const parentFields = ['password', 'phone4'].filter(field => Object.hasOwn(data, field));
  if (parentFields.length) {
    targets.push({ path: `users/${uid}`, fields: parentFields });
    parentFieldCount += parentFields.length;
  }
  const authPath = `users/${uid}/private/auth`;
  const { response, body } = await request(`${root}/${encodePath(authPath)}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  }, true);
  if (response.status !== 404) {
    const fields = ['password', 'phone4'].filter(field => Object.hasOwn(body.fields || {}, field));
    if (fields.length) targets.push({ path: authPath, fields });
  }
}

if (!apply) {
  console.log(JSON.stringify({ mode: 'dry-run', usersScanned: users.length, documentsToClean: targets.length, fieldsToDelete: targets.reduce((sum, item) => sum + item.fields.length, 0), parentDocumentFields: parentFieldCount }, null, 2));
  process.exit(0);
}
for (const target of targets) await patchDeleteFields(target.path, target.fields);
console.log(JSON.stringify({ mode: 'apply', documentsUpdated: targets.length, fieldsDeleted: targets.reduce((sum, item) => sum + item.fields.length, 0) }, null, 2));
