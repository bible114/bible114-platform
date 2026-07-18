#!/usr/bin/env node
// T124d disposable production smoke fixture/runner.
// Default is read-only. No command ever writes public directory/meta/platformStats.

import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const PROJECT_ID = 'bible114-platform';
const API_KEY = 'AIzaSyBF122lgD5fTX70HBtd_nl0ZVKhyyQnyGo';
const API_URL = 'https://ejqnwajcvkvpcxechwzl.supabase.co/functions/v1/platform-api';
const ORIGIN = 'https://www.bible114.net';
const PREFIX = 'e2e_t124d_20260718_';
const FIXTURE_TYPE = 't124d-smoke';
const INITIAL_TALENT = 3;
const repoRoot = fileURLToPath(new URL('..', import.meta.url));
const privateRoot = path.join(os.homedir(), 'Library', 'Application Support',
    'bible114-platform-private', 't124d-smoke');
const protectedPaths = [
    'settings/churchDirectory',
    'publicDirectoryMeta/current',
    'settings/platformStats',
];

const fail = message => { throw new Error(message); };
const argv = process.argv.slice(2);
const command = argv.shift();
const options = Object.fromEntries(argv.map(value => {
    const match = value.match(/^--([a-z-]+)(?:=(.*))?$/);
    if (!match) fail(`Unknown argument: ${value}`);
    return [match[1], match[2] ?? true];
}));
const apply = options.apply === true;
const usage = () => console.log(`Usage:
  node scripts/run-t124d-smoke.mjs create --run-id=<6-20 lowercase letters/digits>
  node scripts/run-t124d-smoke.mjs create --run-id=<id> --apply --confirm=CREATE_T124D_SMOKE:<churchId>
  node scripts/run-t124d-smoke.mjs run --manifest=<absolute-path>
  node scripts/run-t124d-smoke.mjs run --manifest=<absolute-path> --apply --confirm=RUN_T124D_SMOKE:<churchId>
  node scripts/run-t124d-smoke.mjs audit --manifest=<absolute-path>
  node scripts/run-t124d-smoke.mjs cleanup --manifest=<absolute-path>
  node scripts/run-t124d-smoke.mjs cleanup --manifest=<absolute-path> --apply --confirm=CLEANUP_T124D_SMOKE:<churchId>

Default mode is read-only. The script accepts only its generated ${PREFIX}<run> church.
Secrets remain in a canonical mode-0600 private manifest and are never printed.`);

if (!['create', 'run', 'audit', 'cleanup'].includes(command)) {
    usage();
    process.exit(command ? 1 : 0);
}
const unexpected = Object.keys(options).filter(key => ![
    'run-id', 'manifest', 'apply', 'confirm',
].includes(key));
if (unexpected.length) fail(`Unsupported option(s): ${unexpected.join(', ')}`);

const runId = typeof options['run-id'] === 'string' ? options['run-id'] : '';
const derivedChurchId = command === 'create' ? `${PREFIX}${runId}` : '';
if (command === 'create' && !/^[a-z0-9]{6,20}$/.test(runId)) {
    fail('--run-id must be 6-20 lowercase letters/digits. Arbitrary church ids are not accepted.');
}
if (command !== 'create' && options['run-id'] !== undefined) fail('--run-id is create-only.');

const isRecord = value => Boolean(value) && typeof value === 'object' && !Array.isArray(value);
const encodeValue = value => {
    if (value === null || value === undefined) return { nullValue: null };
    if (value instanceof Date) return { timestampValue: value.toISOString() };
    if (typeof value === 'string') return { stringValue: value };
    if (typeof value === 'boolean') return { booleanValue: value };
    if (typeof value === 'number') return Number.isInteger(value)
        ? { integerValue: String(value) } : { doubleValue: value };
    if (Array.isArray(value)) return { arrayValue: { values: value.map(encodeValue) } };
    if (isRecord(value)) return { mapValue: { fields: encodeFields(value) } };
    fail(`Unsupported Firestore value: ${typeof value}`);
};
const encodeFields = value => Object.fromEntries(
    Object.entries(value).map(([key, item]) => [key, encodeValue(item)]),
);
const decodeValue = value => {
    if (!isRecord(value)) return undefined;
    if ('nullValue' in value) return null;
    if ('stringValue' in value) return value.stringValue;
    if ('booleanValue' in value) return value.booleanValue;
    if ('integerValue' in value) return Number(value.integerValue);
    if ('doubleValue' in value) return Number(value.doubleValue);
    if ('timestampValue' in value) return value.timestampValue;
    if ('arrayValue' in value) return (value.arrayValue?.values || []).map(decodeValue);
    if ('mapValue' in value) return decodeFields(value.mapValue?.fields || {});
    return undefined;
};
const decodeFields = fields => Object.fromEntries(
    Object.entries(fields || {}).map(([key, value]) => [key, decodeValue(value)]),
);

const projectConfig = JSON.parse(fs.readFileSync(path.join(repoRoot, '.firebaserc'), 'utf8'));
if (projectConfig?.projects?.default !== PROJECT_ID) fail('Production project mismatch.');
const firebaseSource = fs.readFileSync(path.join(repoRoot, 'src/utils/firebase.js'), 'utf8');
if (!new RegExp(`projectId:\\s*["']${PROJECT_ID}["']`).test(firebaseSource)) fail('Client project mismatch.');

const toolRoots = ['/opt/homebrew/lib/node_modules/firebase-tools', '/usr/local/lib/node_modules/firebase-tools']
    .filter(root => fs.existsSync(path.join(root, 'package.json')));
if (!toolRoots.length) fail('Firebase CLI installation not found.');
const require = createRequire(path.join(toolRoots[0], 'package.json'));
const firebaseAuth = require('./lib/auth');
const account = firebaseAuth.getGlobalDefaultAccount();
if (!account?.tokens?.refresh_token) fail('Firebase CLI login not found.');
const scopes = String(account.tokens.scope || 'https://www.googleapis.com/auth/cloud-platform')
    .split(/\s+/).filter(Boolean);
const tokenResult = await firebaseAuth.getAccessToken(account.tokens.refresh_token, scopes);
const adminToken = tokenResult?.access_token || tokenResult;
if (!adminToken) fail('Unable to obtain Firebase admin access token.');

const firestoreRoot = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents`;
const databaseName = `projects/${PROJECT_ID}/databases/(default)`;
const adminHeaders = { Authorization: `Bearer ${adminToken}`, 'Content-Type': 'application/json' };
const encodePath = value => value.split('/').map(encodeURIComponent).join('/');
const fullName = value => `${databaseName}/documents/${value}`;
const requestJson = async (url, init = {}, allowed = []) => {
    const response = await fetch(url, { ...init, headers: { ...adminHeaders, ...(init.headers || {}) } });
    const body = await response.json().catch(() => ({}));
    if (!response.ok && !allowed.includes(response.status)) {
        fail(`${init.method || 'GET'} ${new URL(url).pathname}: HTTP ${response.status}`);
    }
    return { response, body };
};
const getDocument = async documentPath => {
    const { response, body } = await requestJson(`${firestoreRoot}/${encodePath(documentPath)}`, {}, [404]);
    return response.status === 404 ? null : {
        path: documentPath, updateTime: body.updateTime, data: decodeFields(body.fields || {}),
    };
};
const listDocuments = async (parentPath, collectionId) => {
    const documents = [];
    let pageToken = '';
    do {
        const base = parentPath ? `${firestoreRoot}/${encodePath(parentPath)}/${encodeURIComponent(collectionId)}`
            : `${firestoreRoot}/${encodeURIComponent(collectionId)}`;
        const url = new URL(base);
        url.searchParams.set('pageSize', '300');
        if (pageToken) url.searchParams.set('pageToken', pageToken);
        const { body } = await requestJson(url);
        documents.push(...(body.documents || []));
        pageToken = body.nextPageToken || '';
    } while (pageToken);
    return documents;
};
const listCollectionIds = async documentPath => {
    const ids = [];
    let pageToken = '';
    do {
        const { body } = await requestJson(`${firestoreRoot}/${encodePath(documentPath)}:listCollectionIds`, {
            method: 'POST', body: JSON.stringify({ pageSize: 100, ...(pageToken ? { pageToken } : {}) }),
        });
        ids.push(...(body.collectionIds || []));
        pageToken = body.nextPageToken || '';
    } while (pageToken);
    return ids;
};
const documentPathFromName = name => String(name || '').split('/documents/')[1] || '';
const queryCollectionGroup = async (collectionId, fieldPath, value) => {
    const { body } = await requestJson(`${firestoreRoot}:runQuery`, {
        method: 'POST', body: JSON.stringify({ structuredQuery: {
            from: [{ collectionId, allDescendants: true }],
            where: { fieldFilter: { field: { fieldPath }, op: 'EQUAL', value: encodeValue(value) } },
            limit: 10,
        } }),
    });
    return (body || []).flatMap(row => row.document ? [row.document] : []);
};
const createWrite = (documentPath, data) => ({
    update: { name: fullName(documentPath), fields: encodeFields(data) }, currentDocument: { exists: false },
});
const deleteWrite = (documentPath, updateTime) => {
    if (typeof updateTime !== 'string' || !updateTime) fail(`Delete precondition missing: ${documentPath}`);
    return { delete: fullName(documentPath), currentDocument: { updateTime } };
};
const commit = async writes => {
    if (!writes.length) return;
    if (writes.length > 500) fail('Commit exceeds 500 writes.');
    await requestJson(`${firestoreRoot}:commit`, { method: 'POST', body: JSON.stringify({ writes }) });
};

const lookupAuth = async lookup => {
    const { body } = await requestJson(`https://identitytoolkit.googleapis.com/v1/projects/${PROJECT_ID}/accounts:lookup`, {
        method: 'POST', body: JSON.stringify(lookup),
    });
    return body.users || [];
};
const createAuth = async user => {
    const { body } = await requestJson(`https://identitytoolkit.googleapis.com/v1/projects/${PROJECT_ID}/accounts`, {
        method: 'POST', body: JSON.stringify({ localId: user.uid, email: user.email,
            password: user.password, emailVerified: true, displayName: user.name }),
    });
    if (body.localId !== user.uid) fail('Auth UID mismatch.');
};
const deleteAuth = async user => {
    const found = await lookupAuth({ localId: [user.uid] });
    if (!found.length) return false;
    if (found.length !== 1 || found[0].localId !== user.uid
        || String(found[0].email || '').toLowerCase() !== user.email.toLowerCase()) {
        fail(`Auth cleanup ownership mismatch: ${user.uid}`);
    }
    await requestJson(`https://identitytoolkit.googleapis.com/v1/projects/${PROJECT_ID}/accounts:delete`, {
        method: 'POST', body: JSON.stringify({ localId: user.uid }),
    });
    return true;
};
const deleteTree = async documentPath => {
    let deleted = 0;
    for (const collectionId of await listCollectionIds(documentPath)) {
        for (const raw of await listDocuments(documentPath, collectionId)) {
            const childPath = documentPathFromName(raw.name);
            if (!childPath.startsWith(`${documentPath}/${collectionId}/`)) fail('Unexpected descendant path.');
            deleted += await deleteTree(childPath);
            const currentChild = await getDocument(childPath);
            if (currentChild) {
                await commit([deleteWrite(childPath, currentChild.updateTime)]);
                deleted += 1;
            }
        }
    }
    const current = await getDocument(documentPath);
    if (current) {
        await commit([deleteWrite(documentPath, current.updateTime)]);
        deleted += 1;
    }
    return deleted;
};
const listTreeDocuments = async documentPath => {
    const documents = [];
    const root = await getDocument(documentPath);
    if (root) documents.push(root);
    for (const collectionId of await listCollectionIds(documentPath)) {
        for (const raw of await listDocuments(documentPath, collectionId)) {
            const childPath = documentPathFromName(raw.name);
            if (!childPath.startsWith(`${documentPath}/${collectionId}/`)) fail('Unexpected descendant path.');
            documents.push(...await listTreeDocuments(childPath));
        }
    }
    return documents;
};

const writeManifest = (manifestPath, manifest) => {
    fs.mkdirSync(path.dirname(manifestPath), { recursive: true, mode: 0o700 });
    fs.chmodSync(path.dirname(manifestPath), 0o700);
    const temp = `${manifestPath}.${process.pid}.tmp`;
    fs.writeFileSync(temp, `${JSON.stringify(manifest, null, 2)}\n`, { mode: 0o600, flag: 'wx' });
    fs.renameSync(temp, manifestPath);
    fs.chmodSync(manifestPath, 0o600);
};
const manifestPathFor = churchId => path.join(privateRoot, `${churchId}.json`);
const canonicalManifest = input => {
    if (typeof input !== 'string' || !path.isAbsolute(input)) fail('--manifest must be an absolute path.');
    const resolved = path.resolve(input);
    const raw = JSON.parse(fs.readFileSync(resolved, 'utf8'));
    if (raw?.schemaVersion !== 1 || raw.projectId !== PROJECT_ID || raw.fixtureType !== FIXTURE_TYPE
        || !new RegExp(`^${PREFIX}[a-z0-9]{6,20}$`).test(raw.churchId)
        || typeof raw.fixtureOwnershipToken !== 'string'
        || !/^[0-9a-f]{64}$/.test(raw.fixtureOwnershipToken)
        || resolved !== manifestPathFor(raw.churchId) || !Array.isArray(raw.accounts)
        || raw.accounts.length !== 4 || raw.accounts[0]?.role !== 'churchAdmin'
        || raw.accounts.slice(1).some(user => user.role !== 'member')) {
        fail('Manifest is not the canonical T124d disposable fixture.');
    }
    if ((fs.statSync(resolved).mode & 0o777) !== 0o600) fail('Manifest permissions must be 0600.');
    const expectedUids = ['admin', 'm1', 'm2', 'm3'].map(suffix => `${raw.churchId}_${suffix}`);
    if (raw.accounts.some((user, index) => user.uid !== expectedUids[index]
        || !user.email.endsWith('@bible114-ops-test.invalid') || typeof user.password !== 'string')) {
        fail('Manifest account ownership mismatch.');
    }
    return { path: resolved, value: raw };
};
const accountsFor = churchId => [
    ['admin', 'T124d 관리자', 'churchAdmin'],
    ['m1', 'T124d 수령회원', 'member'],
    ['m2', 'T124d 환불회원', 'member'],
    ['m3', 'T124d 판매회원', 'member'],
].map(([suffix, name, role]) => ({
    uid: `${churchId}_${suffix}`, name, role,
    email: `${churchId}_${suffix}@bible114-ops-test.invalid`,
    password: crypto.randomBytes(18).toString('base64url'),
}));
const protectedSnapshot = async churchId => {
    const entries = {};
    for (const documentPath of protectedPaths) {
        const doc = await getDocument(documentPath);
        entries[documentPath] = doc ? doc.updateTime : null;
    }
    const publicDoc = await getDocument(`publicChurches/${churchId}`);
    entries[`publicChurches/${churchId}`] = publicDoc ? publicDoc.updateTime : null;
    return entries;
};
const assertProtectedUnchanged = async manifest => {
    const current = await protectedSnapshot(manifest.churchId);
    if (JSON.stringify(current) !== JSON.stringify(manifest.protectedSnapshot)) {
        fail('Protected public directory/meta/platformStats snapshot changed; stop for independent review.');
    }
};
const preflight = async (churchId, accounts) => {
    const conflicts = [];
    for (const documentPath of [`churches/${churchId}`, `publicChurches/${churchId}`,
        ...accounts.map(user => `users/${user.uid}`)]) {
        if (await getDocument(documentPath)) conflicts.push(documentPath);
    }
    const directory = await getDocument('settings/churchDirectory');
    if (!directory || !Array.isArray(directory.data.churches)) fail('Legacy directory is missing or malformed.');
    if (directory.data.churches.some(row => row?.id === churchId)) conflicts.push('settings/churchDirectory entry');
    for (const user of accounts) {
        if ((await lookupAuth({ localId: [user.uid] })).length) conflicts.push(`Auth uid ${user.uid}`);
        if ((await lookupAuth({ email: [user.email] })).length) conflicts.push(`Auth email ${user.email}`);
        if ((await queryCollectionGroup('roster', 'uid', user.uid)).length) conflicts.push(`roster uid ${user.uid}`);
    }
    if (conflicts.length) fail(`Creation collision (${conflicts.length}); no writes performed.`);
};
const assertOwnedDocuments = async (manifest, { allowMissing = false } = {}) => {
    const church = await getDocument(`churches/${manifest.churchId}`);
    if (!church && !allowMissing) fail('Owned fixture church is missing.');
    if (church && (church.data.fixtureType !== FIXTURE_TYPE
        || church.data.fixtureRunId !== manifest.churchId
        || church.data.fixtureOwnershipToken !== manifest.fixtureOwnershipToken)) {
        fail('Fixture church ownership marker mismatch.');
    }
    for (const user of manifest.accounts) {
        const document = await getDocument(`users/${user.uid}`);
        if (!document && !allowMissing) fail(`Owned fixture user is missing: ${user.uid}`);
        if (document && (document.data.fixtureType !== FIXTURE_TYPE
            || document.data.fixtureRunId !== manifest.churchId
            || document.data.fixtureOwnershipToken !== manifest.fixtureOwnershipToken
            || document.data.uid !== user.uid)) {
            fail(`Fixture user ownership marker mismatch: ${user.uid}`);
        }
    }
};
const rollbackOwnershipAudit = async manifest => {
    const expectedPaths = new Set([
        `churches/${manifest.churchId}`,
        `churches/${manifest.churchId}/private/admin`,
        `churches/${manifest.churchId}/settings/talentShop`,
        ...manifest.accounts.flatMap(user => [
            `users/${user.uid}`,
            `users/${user.uid}/private/auth`,
        ]),
    ]);
    const roots = [
        `churches/${manifest.churchId}`,
        ...manifest.accounts.map(user => `users/${user.uid}`),
    ];
    const documents = (await Promise.all(roots.map(listTreeDocuments))).flat();
    const exactMarker = document => document.data.fixtureType === FIXTURE_TYPE
        && document.data.fixtureRunId === manifest.churchId
        && document.data.fixtureOwnershipToken === manifest.fixtureOwnershipToken;
    const actualPaths = new Set(documents.map(document => document.path));
    const owned = documents.length === expectedPaths.size
        && documents.every(exactMarker)
        && [...expectedPaths].every(documentPath => actualPaths.has(documentPath));
    return { owned, expectedCount: expectedPaths.size, actualCount: documents.length, documents };
};

const signIn = async user => {
    const response = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${API_KEY}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: user.email, password: user.password, returnSecureToken: true }),
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok || body.localId !== user.uid || typeof body.idToken !== 'string') fail(`Fixture sign-in failed: ${user.uid}`);
    return body.idToken;
};
const callAction = async (token, action, requestId, payload) => {
    const response = await fetch(API_URL, { method: 'POST', headers: {
        Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', Origin: ORIGIN,
    }, body: JSON.stringify({ action, requestId, ...payload }) });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) fail(`${action} failed: HTTP ${response.status}, code ${body?.error?.code || body?.code || 'unknown'}`);
    if (body.ok !== true || body.action !== action || body.requestId !== requestId
        || typeof body.alreadyCompleted !== 'boolean') fail(`${action} response identity mismatch.`);
    return body;
};
const requestIdsFor = churchId => ({
    purchaseDeliver: crypto.randomUUID(), purchaseRefund: crypto.randomUUID(),
    counterSale: crypto.randomUUID(), deliver: crypto.randomUUID(), refund: crypto.randomUUID(),
    scope: churchId,
});
const expectedConfirmation = (verb, churchId) => `${verb}_T124D_SMOKE:${churchId}`;
const requireApply = (verb, churchId) => {
    if (!apply) return false;
    const expected = expectedConfirmation(verb, churchId);
    if (options.confirm !== expected) fail(`Exact confirmation required: --confirm=${expected}`);
    return true;
};

if (command === 'create') {
    const churchId = derivedChurchId;
    const accounts = accountsFor(churchId);
    const manifestPath = manifestPathFor(churchId);
    if (fs.existsSync(manifestPath)) fail('Canonical manifest path already exists.');
    await preflight(churchId, accounts);
    if (!requireApply('CREATE', churchId)) {
        console.log(JSON.stringify({ mode: 'dry-run', valid: true, command, churchId,
            fixtureType: FIXTURE_TYPE, accounts: { admins: 1, members: 3 }, initialTalent: INITIAL_TALENT,
            protectedWrites: 0, manifestPath }, null, 2));
        process.exit(0);
    }
    const manifest = { schemaVersion: 1, projectId: PROJECT_ID, fixtureType: FIXTURE_TYPE,
        churchId, status: 'creating', createdAt: new Date().toISOString(), accounts,
        fixtureOwnershipToken: crypto.randomBytes(32).toString('hex'),
        protectedSnapshot: await protectedSnapshot(churchId), requestIds: requestIdsFor(churchId) };
    writeManifest(manifestPath, manifest);
    const createdAuth = [];
    let fixtureCommitAttempted = false;
    let fixtureCommitConfirmed = false;
    try {
        for (const user of accounts) { await createAuth(user); createdAuth.push(user.uid); }
        const now = new Date();
        const department = { id: 't124d_dept', name: 'T124d 부서', subgroups: [] };
        const item = { id: 't124d_item', emoji: '🧪', name: 'T124d 1달란트 상품', price: 1,
            description: '일회용 T124d 스모크', active: true };
        const common = { churchId, churchName: 'T124d 일회용 숨김 교회', accountType: 'church',
            fixtureType: FIXTURE_TYPE, fixtureRunId: churchId,
            fixtureOwnershipToken: manifest.fixtureOwnershipToken,
            departmentId: department.id, departmentName: department.name, subgroupId: '', subgroupName: '',
            extraMemberships: [], talent: INITIAL_TALENT, score: 0, streak: 0, currentDay: 1,
            readCount: 1, lastReadDate: null, planId: '1year_revised', isDeleted: false,
            onboardingPending: false, talentMigrated: true, createdAt: now, updatedAt: now };
        fixtureCommitAttempted = true;
        await commit([
            createWrite(`churches/${churchId}`, { name: 'T124d 일회용 숨김 교회', fixtureType: FIXTURE_TYPE,
                fixtureRunId: churchId, fixtureOwnershipToken: manifest.fixtureOwnershipToken,
                hiddenFromDirectory: true, isDeleted: false,
                departments: [department], createdAt: now, updatedAt: now }),
            createWrite(`churches/${churchId}/private/admin`, { adminUid: accounts[0].uid,
                adminEmail: accounts[0].email, fixtureType: FIXTURE_TYPE, fixtureRunId: churchId,
                fixtureOwnershipToken: manifest.fixtureOwnershipToken, updatedAt: now }),
            createWrite(`churches/${churchId}/settings/talentShop`, { schemaVersion: 2, enabled: true,
                departmentSettings: { [department.id]: { enabled: true, marketId: 'shared' } },
                markets: { shared: { id: 'shared', name: 'T124d 시장', enabled: true, items: [item] } },
                items: [item], fixtureType: FIXTURE_TYPE, fixtureRunId: churchId,
                fixtureOwnershipToken: manifest.fixtureOwnershipToken, updatedAt: now }),
            ...accounts.map(user => createWrite(`users/${user.uid}`, { ...common, uid: user.uid,
                name: user.name, email: user.email, password: null, role: user.role })),
            ...accounts.map(user => createWrite(`users/${user.uid}/private/auth`, {
                password: user.password, fixtureType: FIXTURE_TYPE, fixtureRunId: churchId,
                fixtureOwnershipToken: manifest.fixtureOwnershipToken, updatedAt: now })),
        ]);
        fixtureCommitConfirmed = true;
        await assertProtectedUnchanged(manifest);
        manifest.status = 'ready'; manifest.readyAt = new Date().toISOString();
        writeManifest(manifestPath, manifest);
        console.log(JSON.stringify({ mode: 'apply', command, churchId, status: 'ready', manifestPath }, null, 2));
    } catch (error) {
        manifest.status = 'create-failed'; manifest.errorAt = new Date().toISOString();
        const ownership = await rollbackOwnershipAudit(manifest).catch(() => ({
            owned: false, expectedCount: 11, actualCount: null, documents: [],
        }));
        manifest.fixtureCommitOutcome = fixtureCommitConfirmed
            ? 'confirmed'
            : fixtureCommitAttempted && ownership.owned
            ? 'applied-response-unknown'
            : fixtureCommitAttempted
            ? 'not-applied-or-collision'
            : 'not-attempted';
        manifest.rollbackOwnership = {
            owned: ownership.owned,
            expectedCount: ownership.expectedCount,
            actualCount: ownership.actualCount,
        };
        writeManifest(manifestPath, manifest);
        // commit 응답 유실은 가능하지만 부분 commit은 없다. 모든 예상 문서가 비밀
        // 소유 토큰까지 정확히 일치할 때만 Firestore rollback을 허용한다.
        if (ownership.owned) {
            await commit(ownership.documents.map(document => (
                deleteWrite(document.path, document.updateTime)
            )));
        }
        for (const uid of createdAuth.reverse()) {
            const user = accounts.find(row => row.uid === uid);
            await deleteAuth(user).catch(() => {});
        }
        throw error;
    }
    process.exit(0);
}

const loaded = canonicalManifest(options.manifest);
const manifest = loaded.value;
const churchId = manifest.churchId;
if (command === 'run') {
    if (manifest.status !== 'ready') fail('Smoke run requires a ready fixture.');
    if (!requireApply('RUN', churchId)) {
        console.log(JSON.stringify({ mode: 'dry-run', valid: true, command, churchId,
            actions: { purchaseItem: 2, adminCounterSale: 2, adminDeliverPurchase: 2,
                adminRefundPurchase: 2 }, replayIncluded: true }, null, 2));
        process.exit(0);
    }
    await assertProtectedUnchanged(manifest);
    await assertOwnedDocuments(manifest);
    const [admin, deliverMember, refundMember, saleMember] = manifest.accounts;
    const [adminJwt, deliverJwt, refundJwt] = await Promise.all([
        signIn(admin), signIn(deliverMember), signIn(refundMember),
    ]);
    const itemPayload = { churchId, itemId: 't124d_item', departmentId: 't124d_dept', marketId: 'shared' };
    const firstPurchase = await callAction(deliverJwt, 'purchaseItem', manifest.requestIds.purchaseDeliver, itemPayload);
    const secondPurchase = await callAction(refundJwt, 'purchaseItem', manifest.requestIds.purchaseRefund, itemPayload);
    if (!['pending', 'delivered'].includes(firstPurchase.purchase?.status)
        || !['pending', 'cancelled'].includes(secondPurchase.purchase?.status)
        || firstPurchase.nextTalent !== 2
        || secondPurchase.nextTalent !== (secondPurchase.purchase?.status === 'cancelled' ? 3 : 2)) {
        fail('Server purchase precondition/replay mismatch.');
    }
    const salePayload = { churchId, memberUid: saleMember.uid, departmentId: 't124d_dept',
        marketId: 'shared', itemName: 'T124d 창구판매', price: 1 };
    const sale = await callAction(adminJwt, 'adminCounterSale', manifest.requestIds.counterSale, salePayload);
    const saleReplay = await callAction(adminJwt, 'adminCounterSale', manifest.requestIds.counterSale, salePayload);
    const deliverPayload = { churchId, purchaseId: manifest.requestIds.purchaseDeliver };
    const delivered = await callAction(adminJwt, 'adminDeliverPurchase', manifest.requestIds.deliver, deliverPayload);
    const deliveredReplay = await callAction(adminJwt, 'adminDeliverPurchase', manifest.requestIds.deliver, deliverPayload);
    const refundPayload = { churchId, purchaseId: manifest.requestIds.purchaseRefund,
        legacyWalletKind: '', migratedWalletConfirmed: false };
    const refunded = await callAction(adminJwt, 'adminRefundPurchase', manifest.requestIds.refund, refundPayload);
    const refundedReplay = await callAction(adminJwt, 'adminRefundPurchase', manifest.requestIds.refund, refundPayload);
    if (!saleReplay.alreadyCompleted || sale.nextTalent !== 2 || saleReplay.nextTalent !== 2
        || delivered.purchase?.status !== 'delivered' || !deliveredReplay.alreadyCompleted
        || refunded.purchase?.status !== 'cancelled' || !refundedReplay.alreadyCompleted
        || refunded.nextTalent !== 3 || refundedReplay.nextTalent !== 3) {
        fail('Admin action/replay contract mismatch.');
    }
    manifest.status = 'smoke-complete'; manifest.smokeCompletedAt = new Date().toISOString();
    manifest.smokeSummary = { purchaseItem: 2, adminActions: 3, replays: 3,
        resumedActions: [sale, delivered, refunded].filter(result => result.alreadyCompleted).length };
    writeManifest(loaded.path, manifest);
    await assertProtectedUnchanged(manifest);
    console.log(JSON.stringify({ mode: 'apply', command, churchId, status: manifest.status,
        actions: manifest.smokeSummary, secretsWritten: false }, null, 2));
    process.exit(0);
}

const auditState = async value => {
    await assertProtectedUnchanged(value);
    await assertOwnedDocuments(value);
    const [admin, deliverMember, refundMember, saleMember] = value.accounts;
    const users = Object.fromEntries(await Promise.all(value.accounts.map(async user => {
        const doc = await getDocument(`users/${user.uid}`); return [user.uid, doc?.data || null];
    })));
    const purchasesRaw = await listDocuments(`churches/${churchId}`, 'talentPurchases');
    const ledgersRaw = await listDocuments(`churches/${churchId}`, 'talentAdminActions');
    const purchases = Object.fromEntries(purchasesRaw.map(raw => [documentPathFromName(raw.name).split('/').at(-1),
        decodeFields(raw.fields || {})]));
    const ledgers = Object.fromEntries(ledgersRaw.map(raw => [documentPathFromName(raw.name).split('/').at(-1),
        decodeFields(raw.fields || {})]));
    const ids = value.requestIds;
    const checks = [
        users[admin.uid]?.talent === 3,
        users[deliverMember.uid]?.talent === 2,
        users[refundMember.uid]?.talent === 3,
        users[saleMember.uid]?.talent === 2,
        purchases[ids.purchaseDeliver]?.status === 'delivered',
        purchases[ids.purchaseDeliver]?.uid === deliverMember.uid,
        purchases[ids.purchaseDeliver]?.schemaVersion === 2,
        purchases[ids.purchaseDeliver]?.price === 1,
        purchases[ids.purchaseDeliver]?.walletKind === 'user',
        purchases[ids.purchaseDeliver]?.walletOrgId === churchId,
        purchases[ids.purchaseDeliver]?.adminActionRequestId === ids.deliver,
        purchases[ids.purchaseRefund]?.status === 'cancelled',
        purchases[ids.purchaseRefund]?.uid === refundMember.uid,
        purchases[ids.purchaseRefund]?.schemaVersion === 2,
        purchases[ids.purchaseRefund]?.price === 1,
        purchases[ids.purchaseRefund]?.walletKind === 'user',
        purchases[ids.purchaseRefund]?.walletOrgId === churchId,
        purchases[ids.purchaseRefund]?.adminActionRequestId === ids.refund,
        purchases[ids.counterSale]?.status === 'delivered',
        purchases[ids.counterSale]?.uid === saleMember.uid,
        purchases[ids.counterSale]?.schemaVersion === 2,
        purchases[ids.counterSale]?.price === 1,
        purchases[ids.counterSale]?.walletKind === 'user',
        purchases[ids.counterSale]?.walletOrgId === churchId,
        purchases[ids.counterSale]?.sourceAction === 'adminCounterSale',
        purchases[ids.counterSale]?.requestId === ids.counterSale,
        Object.keys(purchases).length === 3,
        Object.keys(ledgers).length === 3,
        ledgers[ids.counterSale]?.action === 'adminCounterSale',
        ledgers[ids.counterSale]?.actorUid === admin.uid,
        ledgers[ids.counterSale]?.targetUid === saleMember.uid,
        ledgers[ids.counterSale]?.balanceBefore === 3 && ledgers[ids.counterSale]?.balanceAfter === 2,
        ledgers[ids.deliver]?.action === 'adminDeliverPurchase',
        ledgers[ids.deliver]?.actorUid === admin.uid,
        ledgers[ids.deliver]?.purchaseId === ids.purchaseDeliver,
        ledgers[ids.refund]?.action === 'adminRefundPurchase',
        ledgers[ids.refund]?.actorUid === admin.uid,
        ledgers[ids.refund]?.targetUid === refundMember.uid,
        ledgers[ids.refund]?.walletKind === 'user',
        ledgers[ids.refund]?.refundAmount === 1,
        ledgers[ids.refund]?.balanceBefore === 2 && ledgers[ids.refund]?.balanceAfter === 3,
    ];
    if (checks.some(result => !result)) fail('Independent wallet/purchase/ledger audit failed.');
    return { users: 4, purchases: 3, ledgers: 3, walletBalances: { admin: 3, delivered: 2, refunded: 3, sold: 2 } };
};

if (command === 'audit') {
    if (apply || options.confirm !== undefined) fail('audit is always read-only and accepts no --apply/--confirm.');
    if (manifest.status !== 'smoke-complete' && manifest.status !== 'audited') fail('Audit requires completed smoke actions.');
    const report = await auditState(manifest);
    console.log(JSON.stringify({ mode: 'read-only', command, churchId, valid: true, ...report }, null, 2));
    process.exit(0);
}

if (command === 'cleanup') {
    if (!requireApply('CLEANUP', churchId)) {
        console.log(JSON.stringify({ mode: 'dry-run', valid: true, command, churchId,
            order: ['users', 'church subtree', 'Auth'], accounts: 4 }, null, 2));
        process.exit(0);
    }
    // 오래 열린 fixture가 있는 동안 다른 운영 작업이 보호 문서를 정상 변경해도
    // 정리를 영구 차단하지 않는다. 정리 작업 자체가 건드리지 않았는지만 전후 비교한다.
    const cleanupProtectedSnapshot = await protectedSnapshot(churchId);
    await assertOwnedDocuments(manifest, { allowMissing: true });
    let deletedUsers = 0;
    for (const user of manifest.accounts) deletedUsers += await deleteTree(`users/${user.uid}`);
    const deletedChurch = await deleteTree(`churches/${churchId}`);
    let deletedAuth = 0;
    for (const user of manifest.accounts) if (await deleteAuth(user)) deletedAuth += 1;
    const residue = [];
    for (const documentPath of [`churches/${churchId}`, `publicChurches/${churchId}`,
        ...manifest.accounts.map(user => `users/${user.uid}`)]) {
        if (await getDocument(documentPath)) residue.push(documentPath);
    }
    for (const user of manifest.accounts) {
        if ((await lookupAuth({ localId: [user.uid] })).length) residue.push(`Auth uid ${user.uid}`);
        if ((await lookupAuth({ email: [user.email] })).length) residue.push(`Auth email ${user.email}`);
        if ((await queryCollectionGroup('roster', 'uid', user.uid)).length) residue.push(`roster uid ${user.uid}`);
        if ((await listDocuments(`users/${user.uid}`, 'private')).length) residue.push(`users/${user.uid}/private`);
    }
    for (const collectionId of ['private', 'settings', 'roster', 'talentPurchases', 'talentAdminActions']) {
        if ((await listDocuments(`churches/${churchId}`, collectionId)).length) {
            residue.push(`churches/${churchId}/${collectionId}`);
        }
    }
    const directory = await getDocument('settings/churchDirectory');
    if (directory?.data?.churches?.some(row => row?.id === churchId)) residue.push('settings/churchDirectory entry');
    const cleanupProtectedAfter = await protectedSnapshot(churchId);
    if (JSON.stringify(cleanupProtectedAfter) !== JSON.stringify(cleanupProtectedSnapshot)) {
        fail('Protected public directory/meta/platformStats changed during cleanup; stop for independent review.');
    }
    if (residue.length) fail(`Cleanup residue (${residue.length}).`);
    manifest.status = 'cleaned'; manifest.cleanedAt = new Date().toISOString();
    manifest.cleanup = { deletedUsers, deletedChurch, deletedAuth, residue: 0 };
    writeManifest(loaded.path, manifest);
    console.log(JSON.stringify({ mode: 'apply', command, churchId, status: 'cleaned', ...manifest.cleanup }, null, 2));
}
