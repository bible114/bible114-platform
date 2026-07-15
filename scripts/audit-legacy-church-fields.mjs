import { createHash } from 'node:crypto';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { normalizeChurchEntryCode } from '../src/utils/entryCode.js';

const PROJECT_ID = 'bible114-platform';
const cliArgs = process.argv.slice(2);
let backupPath = '';
for (let index = 0; index < cliArgs.length; index += 1) {
    if (cliArgs[index] !== '--backup' || backupPath || !cliArgs[index + 1]) {
        throw new Error('사용법: node scripts/audit-legacy-church-fields.mjs [--backup <절대 경로>]');
    }
    backupPath = cliArgs[index + 1];
    index += 1;
}
if (backupPath && !path.isAbsolute(backupPath)) {
    throw new Error('--backup 경로는 절대 경로여야 합니다.');
}

const firebaseToolsRoots = [
    '/opt/homebrew/lib/node_modules/firebase-tools',
    '/usr/local/lib/node_modules/firebase-tools',
].filter(root => fs.existsSync(`${root}/package.json`));

if (firebaseToolsRoots.length === 0) {
    throw new Error('Firebase CLI 로그인을 찾지 못했습니다. firebase login 후 다시 실행해주세요.');
}

const require = createRequire(`${firebaseToolsRoots[0]}/package.json`);
const auth = require('./lib/auth');
const account = auth.getGlobalDefaultAccount();
if (!account?.tokens?.refresh_token) {
    throw new Error('Firebase CLI 로그인 정보가 없습니다. firebase login 후 다시 실행해주세요.');
}

const scopes = String(account.tokens.scope || 'https://www.googleapis.com/auth/cloud-platform')
    .split(/\s+/).filter(Boolean);
const access = await auth.getAccessToken(account.tokens.refresh_token, scopes);
const accessToken = access?.access_token || access;
const firestoreRoot = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents`;
const headers = { Authorization: `Bearer ${accessToken}` };

const encodePath = path => path.split('/').map(encodeURIComponent).join('/');
const hasField = (fields, field) => Object.prototype.hasOwnProperty.call(fields, field);
const stringValue = value => (typeof value?.stringValue === 'string' ? value.stringValue : '');
const validCodeHash = value => /^[0-9a-f]{64}$/i.test(stringValue(value).trim());
const validPlainCode = value => !!normalizeChurchEntryCode(stringValue(value));
const mapFields = value => value?.mapValue?.fields || {};
const pickRawFields = (fields, names) => Object.fromEntries(
    names.filter(name => hasField(fields, name)).map(name => [name, fields[name]])
);

const getDocument = async path => {
    const response = await fetch(`${firestoreRoot}/${encodePath(path)}`, { headers });
    if (response.status === 404) return null;
    if (!response.ok) throw new Error(`Firestore 조회 실패 (${path}): HTTP ${response.status}`);
    return response.json();
};

let pageToken = '';
const churchDocuments = [];
const findings = [];
const legacyFieldCounts = {
    churchCode: 0,
    code: 0,
    churchCodeHash: 0,
    adminEmail: 0,
    adminUid: 0,
};

do {
    const url = new URL(`${firestoreRoot}/churches`);
    url.searchParams.set('pageSize', '300');
    if (pageToken) url.searchParams.set('pageToken', pageToken);
    const response = await fetch(url, { headers });
    if (!response.ok) throw new Error(`Firestore 조회 실패: HTTP ${response.status}`);
    const body = await response.json();
    for (const document of body.documents || []) {
        churchDocuments.push(document);
        const fields = document.fields || {};
        const exposed = Object.keys(legacyFieldCounts).filter(field => hasField(fields, field));
        exposed.forEach(field => { legacyFieldCounts[field] += 1; });
        if (exposed.length > 0) {
            findings.push({ id: document.name.split('/').pop(), fields: exposed });
        }
    }
    pageToken = body.nextPageToken || '';
} while (pageToken);

const directoryDocument = await getDocument('settings/churchDirectory');
const directoryValues = directoryDocument?.fields?.churches?.arrayValue?.values || [];
const directoryEntries = directoryValues.map(mapFields);
const churchIds = new Set(churchDocuments.map(document => document.name.split('/').pop()));
const directoryIdCounts = new Map();
const directoryHashesByChurchId = new Map();
let invalidDirectoryIds = 0;
let directoryCodeHashFields = 0;
let directoryValidCodeHashes = 0;
let directoryChurchCodeFields = 0;
let directoryCodeFields = 0;

for (const fields of directoryEntries) {
    const id = stringValue(fields.id).trim();
    if (!id) invalidDirectoryIds += 1;
    else directoryIdCounts.set(id, (directoryIdCounts.get(id) || 0) + 1);
    if (hasField(fields, 'codeHash')) {
        directoryCodeHashFields += 1;
        if (validCodeHash(fields.codeHash)) {
            directoryValidCodeHashes += 1;
            if (id && !directoryHashesByChurchId.has(id)) directoryHashesByChurchId.set(id, true);
        }
    }
    if (hasField(fields, 'churchCode')) directoryChurchCodeFields += 1;
    if (hasField(fields, 'code')) directoryCodeFields += 1;
}

const duplicateIdCounts = [...directoryIdCounts.values()].filter(count => count > 1);
const orphanIds = [...directoryIdCounts.keys()].filter(id => !churchIds.has(id));

// migrateChurchAccessSecrets와 동일하게 가상 무소속 공동체는 입장코드 이전 집계에서 제외한다.
const migrationChurchDocuments = churchDocuments.filter(document => (
    document.name.split('/').pop() !== 'unaffiliated_v1'
));
const accessDocuments = new Map();
for (let offset = 0; offset < migrationChurchDocuments.length; offset += 25) {
    const chunk = migrationChurchDocuments.slice(offset, offset + 25);
    const documents = await Promise.all(chunk.map(document => {
        const id = document.name.split('/').pop();
        return getDocument(`churches/${id}/private/access`).then(accessDocument => [id, accessDocument]);
    }));
    documents.forEach(([id, document]) => accessDocuments.set(id, document));
}

const privateAccess = {
    present: 0,
    missing: 0,
    codeHashFields: 0,
    validCodeHashes: 0,
    invalidCodeHashes: 0,
};
const sourceProvenance = {
    privateAccess: 0,
    publicChurchHash: 0,
    directoryHash: 0,
    publicChurchCode: 0,
    legacyPublicCode: 0,
    missing: 0,
};

for (const document of migrationChurchDocuments) {
    const id = document.name.split('/').pop();
    const fields = document.fields || {};
    const accessDocument = accessDocuments.get(id);
    const accessFields = accessDocument?.fields || {};
    const accessHashIsValid = validCodeHash(accessFields.codeHash);
    if (accessDocument) privateAccess.present += 1;
    else privateAccess.missing += 1;
    if (hasField(accessFields, 'codeHash')) {
        privateAccess.codeHashFields += 1;
        if (accessHashIsValid) privateAccess.validCodeHashes += 1;
        else privateAccess.invalidCodeHashes += 1;
    }

    if (accessHashIsValid) sourceProvenance.privateAccess += 1;
    else if (validCodeHash(fields.churchCodeHash)) sourceProvenance.publicChurchHash += 1;
    else if (directoryHashesByChurchId.has(id)) sourceProvenance.directoryHash += 1;
    else if (validPlainCode(fields.churchCode)) sourceProvenance.publicChurchCode += 1;
    else if (validPlainCode(fields.code)) sourceProvenance.legacyPublicCode += 1;
    else sourceProvenance.missing += 1;
}

let backup = null;
if (backupPath) {
    const backupPayload = {
        schemaVersion: 1,
        projectId: PROJECT_ID,
        createdAt: new Date().toISOString(),
        // 실제 cleanup은 가상 공동체의 공개 레거시 필드도 지우므로 모든 교회를 보관한다.
        churches: churchDocuments.map(document => {
            const id = document.name.split('/').pop();
            const accessDocument = accessDocuments.get(id);
            return {
                id,
                publicFields: pickRawFields(document.fields || {}, [
                    'churchCode',
                    'churchCodeHash',
                    'code',
                ]),
                privateAccess: {
                    exists: !!accessDocument,
                    fields: pickRawFields(accessDocument?.fields || {}, ['codeHash']),
                },
            };
        }),
        churchDirectory: directoryDocument,
    };
    const backupBytes = Buffer.from(`${JSON.stringify(backupPayload, null, 2)}\n`, 'utf8');
    fs.writeFileSync(backupPath, backupBytes, { flag: 'wx', mode: 0o600 });
    fs.chmodSync(backupPath, 0o600);
    const writtenBytes = fs.readFileSync(backupPath);
    backup = {
        path: backupPath,
        sha256: createHash('sha256').update(writtenBytes).digest('hex'),
    };
}

console.log(JSON.stringify({
    totalChurches: churchDocuments.length,
    migrationChurches: migrationChurchDocuments.length,
    legacyFieldCounts,
    findings,
    directory: {
        exists: !!directoryDocument,
        entries: directoryEntries.length,
        invalidIdEntries: invalidDirectoryIds,
        codeHashFields: directoryCodeHashFields,
        validCodeHashes: directoryValidCodeHashes,
        churchCodeFields: directoryChurchCodeFields,
        codeFields: directoryCodeFields,
        duplicateIds: duplicateIdCounts.length,
        duplicateEntries: duplicateIdCounts.reduce((sum, count) => sum + count - 1, 0),
        orphanIds: orphanIds.length,
        orphanEntries: orphanIds.reduce((sum, id) => sum + directoryIdCounts.get(id), 0),
    },
    privateAccess,
    sourceProvenance,
    ...(backup ? { backup } : {}),
}, null, 2));
