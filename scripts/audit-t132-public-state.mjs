import fs from 'node:fs';
import { createRequire } from 'node:module';

const firebaseToolsRoot = [
    '/opt/homebrew/lib/node_modules/firebase-tools',
    '/usr/local/lib/node_modules/firebase-tools',
].find(root => fs.existsSync(`${root}/package.json`));
if (!firebaseToolsRoot) throw new Error('Firebase CLI를 찾지 못했습니다.');

const require = createRequire(`${firebaseToolsRoot}/package.json`);
const auth = require('./lib/auth');
const account = auth.getGlobalDefaultAccount();
const scopes = String(account.tokens.scope || 'https://www.googleapis.com/auth/cloud-platform')
    .split(/\s+/)
    .filter(Boolean);
const access = await auth.getAccessToken(account.tokens.refresh_token, scopes);
const token = access?.access_token || access;
const headers = { Authorization: `Bearer ${token}` };
const base =
    'https://firestore.googleapis.com/v1/projects/bible114-platform/databases/(default)/documents';

const getDocument = async documentPath => {
    const response = await fetch(`${base}/${documentPath}`, { headers });
    if (response.status === 404) return null;
    if (!response.ok) throw new Error(`${documentPath}: HTTP ${response.status}`);
    return response.json();
};
const value = field => {
    if (!field) return null;
    if ('stringValue' in field) return field.stringValue;
    if ('booleanValue' in field) return field.booleanValue;
    if ('integerValue' in field) return Number(field.integerValue);
    if ('timestampValue' in field) return field.timestampValue;
    return null;
};

const [meta, stats, videoConfig] = await Promise.all([
    getDocument('publicDirectoryMeta/current'),
    getDocument('settings/platformStats'),
    getDocument('settings/videoAutoConfig'),
]);

console.log(JSON.stringify({
    publicDirectory: meta ? {
        ready: value(meta.fields?.ready),
        mode: value(meta.fields?.mode),
        schemaVersion: value(meta.fields?.schemaVersion),
        count: value(meta.fields?.count),
        updatedAt: value(meta.fields?.updatedAt),
    } : null,
    platformStats: stats ? {
        totalChurches: value(stats.fields?.total_churches),
        totalReaders: value(stats.fields?.total_readers),
        finishedTotal: value(stats.fields?.finished_total),
        readersToday: value(stats.fields?.readers_today),
        todayDate: value(stats.fields?.today_date),
        updatedAt: value(stats.fields?.updatedAt),
    } : null,
    videoConfig: videoConfig ? {
        legacyApiKeyPresent: Boolean(videoConfig.fields?.apiKey),
        enabled: value(videoConfig.fields?.enabled),
        updatedAt: value(videoConfig.fields?.updatedAt),
    } : null,
}, null, 2));
