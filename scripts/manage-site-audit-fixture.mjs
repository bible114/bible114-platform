#!/usr/bin/env node
// Disposable production fixture manager for the full-site concurrency audit.
// Default is read-only. Production writes require --apply and an exact phrase.

import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const PROJECT_ID = 'bible114-platform';
const PREFIX = 'e2e_full_20260718_';
const MEMBER_COUNT = 20;
const repoRoot = fileURLToPath(new URL('..', import.meta.url));
const privateRoot = path.join(
    os.homedir(), 'Library', 'Application Support',
    'bible114-platform-private', 'site-audit-fixtures',
);

const fail = message => { throw new Error(message); };
const args = process.argv.slice(2);
const command = args[0];
const option = name => {
    const prefix = `--${name}=`;
    return args.find(value => value.startsWith(prefix))?.slice(prefix.length) || '';
};
const apply = args.includes('--apply');
const churchId = option('church-id');
const confirmation = option('confirm');
const manifestOption = option('manifest');

const usage = () => {
    console.log(`Usage:
  node scripts/manage-site-audit-fixture.mjs create --church-id=${PREFIX}<run>
  node scripts/manage-site-audit-fixture.mjs create --church-id=${PREFIX}<run> --apply --confirm="CREATE <churchId>"
  node scripts/manage-site-audit-fixture.mjs cleanup --church-id=${PREFIX}<run> --manifest=<absolute-path>
  node scripts/manage-site-audit-fixture.mjs cleanup --church-id=${PREFIX}<run> --manifest=<absolute-path> --apply --confirm="CLEANUP <churchId>"

Default mode is read-only. Secrets and credentials are never printed.`);
};

if (!['create', 'cleanup'].includes(command)) {
    usage();
    process.exit(command ? 1 : 0);
}
if (!/^e2e_full_20260718_[a-z0-9]{4,24}$/.test(churchId)) {
    fail(`--church-id must match ${PREFIX}<4-24 lowercase letters/digits>.`);
}
if (apply) {
    const expected = `${command === 'create' ? 'CREATE' : 'CLEANUP'} ${churchId}`;
    if (confirmation !== expected) fail(`Exact confirmation required: --confirm="${expected}"`);
}
if (command === 'cleanup' && !path.isAbsolute(manifestOption)) {
    fail('cleanup requires an absolute --manifest path.');
}

const projectConfig = JSON.parse(fs.readFileSync(path.join(repoRoot, '.firebaserc'), 'utf8'));
if (projectConfig?.projects?.default !== PROJECT_ID) fail('.firebaserc production project mismatch.');
const firebaseSource = fs.readFileSync(path.join(repoRoot, 'src/utils/firebase.js'), 'utf8');
if (!new RegExp(`projectId:\\s*["']${PROJECT_ID}["']`).test(firebaseSource)) {
    fail('src/utils/firebase.js production project mismatch.');
}

const firebaseToolsRoots = [
    '/opt/homebrew/lib/node_modules/firebase-tools',
    '/usr/local/lib/node_modules/firebase-tools',
].filter(root => fs.existsSync(path.join(root, 'package.json')));
if (firebaseToolsRoots.length === 0) fail('Firebase CLI installation not found.');
const require = createRequire(path.join(firebaseToolsRoots[0], 'package.json'));
const firebaseAuth = require('./lib/auth');
const account = firebaseAuth.getGlobalDefaultAccount();
if (!account?.tokens?.refresh_token) fail('Firebase CLI login not found.');
const scopes = String(account.tokens.scope || 'https://www.googleapis.com/auth/cloud-platform')
    .split(/\s+/).filter(Boolean);
const access = await firebaseAuth.getAccessToken(account.tokens.refresh_token, scopes);
const accessToken = access?.access_token || access;
if (!accessToken) fail('Unable to obtain Firebase admin access token.');

const firestoreRoot = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents`;
const databaseName = `projects/${PROJECT_ID}/databases/(default)`;
const headers = { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' };
const fullName = documentPath => `${databaseName}/documents/${documentPath}`;
const encodePath = documentPath => documentPath.split('/').map(encodeURIComponent).join('/');

const encodeValue = value => {
    if (value === null || value === undefined) return { nullValue: null };
    if (value instanceof Date) return { timestampValue: value.toISOString() };
    if (typeof value === 'boolean') return { booleanValue: value };
    if (typeof value === 'string') return { stringValue: value };
    if (typeof value === 'number') {
        if (!Number.isFinite(value)) fail('Non-finite number cannot be written.');
        return Number.isInteger(value) ? { integerValue: String(value) } : { doubleValue: value };
    }
    if (Array.isArray(value)) return { arrayValue: { values: value.map(encodeValue) } };
    if (typeof value === 'object') return { mapValue: { fields: encodeFields(value) } };
    fail(`Unsupported value type: ${typeof value}`);
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
const documentPathFromName = name => String(name || '').split('/documents/')[1] || '';

const requestJson = async (url, init = {}, allowed = []) => {
    const response = await fetch(url, { ...init, headers: { ...headers, ...(init.headers || {}) } });
    const body = await response.json().catch(() => ({}));
    if (!response.ok && !allowed.includes(response.status)) {
        fail(`${init.method || 'GET'} ${new URL(url).pathname} failed: HTTP ${response.status}`);
    }
    return { response, body };
};
const getDocument = async documentPath => {
    const result = await requestJson(`${firestoreRoot}/${encodePath(documentPath)}`, {}, [404]);
    return result.response.status === 404 ? null : {
        name: result.body.name,
        updateTime: result.body.updateTime,
        data: decodeFields(result.body.fields || {}),
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
        documents.push(...(Array.isArray(body.documents) ? body.documents : []));
        pageToken = typeof body.nextPageToken === 'string' ? body.nextPageToken : '';
    } while (pageToken);
    return documents;
};
const listCollectionIds = async documentPath => {
    const ids = [];
    let pageToken = '';
    do {
        const { body } = await requestJson(
            `${firestoreRoot}/${encodePath(documentPath)}:listCollectionIds`,
            { method: 'POST', body: JSON.stringify({ pageSize: 100, ...(pageToken ? { pageToken } : {}) }) },
        );
        ids.push(...(Array.isArray(body.collectionIds) ? body.collectionIds : []));
        pageToken = typeof body.nextPageToken === 'string' ? body.nextPageToken : '';
    } while (pageToken);
    return ids;
};
const queryCollectionGroupByField = async (collectionId, fieldPath, value) => {
    const { body } = await requestJson(`${firestoreRoot}:runQuery`, {
        method: 'POST',
        body: JSON.stringify({
            structuredQuery: {
                from: [{ collectionId, allDescendants: true }],
                where: { fieldFilter: { field: { fieldPath }, op: 'EQUAL', value: encodeValue(value) } },
                limit: 4,
            },
        }),
    });
    return (Array.isArray(body) ? body : []).flatMap(row => row.document ? [row.document] : []);
};
const createWrite = (documentPath, data) => ({
    update: { name: fullName(documentPath), fields: encodeFields(data) },
    currentDocument: { exists: false },
});
const updateWrite = (documentPath, data, updateTime) => ({
    update: { name: fullName(documentPath), fields: encodeFields(data) },
    updateMask: { fieldPaths: Object.keys(data) },
    currentDocument: { updateTime },
});
const deleteWrite = (documentPath, updateTime) => ({
    delete: fullName(documentPath), currentDocument: { updateTime },
});
const commit = async writes => {
    if (writes.length > 500) fail('Firestore commit exceeds 500-write safety limit.');
    await requestJson(`${firestoreRoot}:commit`, { method: 'POST', body: JSON.stringify({ writes }) });
};

const lookupAuth = async lookup => {
    const { body } = await requestJson(
        `https://identitytoolkit.googleapis.com/v1/projects/${PROJECT_ID}/accounts:lookup`,
        { method: 'POST', body: JSON.stringify(lookup) },
    );
    return Array.isArray(body.users) ? body.users : [];
};
const createAuthAccount = async user => {
    const { body } = await requestJson(
        `https://identitytoolkit.googleapis.com/v1/projects/${PROJECT_ID}/accounts`,
        {
            method: 'POST',
            body: JSON.stringify({
                localId: user.uid, email: user.email, password: user.password,
                emailVerified: true, displayName: user.displayName,
            }),
        },
    );
    if (body.localId !== user.uid) fail('Identity Toolkit returned a different UID.');
};
const deleteAuthAccount = async (uid, expectedEmail) => {
    const found = await lookupAuth({ localId: [uid] });
    if (found.length === 0) return false;
    if (found.length !== 1 || found[0].localId !== uid
        || String(found[0].email || '').toLowerCase() !== expectedEmail.toLowerCase()) {
        fail(`Auth cleanup target mismatch for ${uid}.`);
    }
    await requestJson(
        `https://identitytoolkit.googleapis.com/v1/projects/${PROJECT_ID}/accounts:delete`,
        { method: 'POST', body: JSON.stringify({ localId: uid }) },
    );
    return true;
};

const deleteDocumentTree = async documentPath => {
    let deleted = 0;
    for (const collectionId of await listCollectionIds(documentPath)) {
        for (const document of await listDocuments(documentPath, collectionId)) {
            const childPath = documentPathFromName(document.name);
            if (!childPath.startsWith(`${documentPath}/${collectionId}/`)) fail('Unexpected descendant path.');
            deleted += await deleteDocumentTree(childPath);
            const current = await getDocument(childPath);
            if (current) {
                await commit([deleteWrite(childPath, current.updateTime)]);
                deleted += 1;
            }
        }
    }
    return deleted;
};

const legacyDate = date => {
    const shifted = new Date(date.getTime() + 9 * 60 * 60 * 1_000);
    const weekdays = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    return `${weekdays[shifted.getUTCDay()]} ${months[shifted.getUTCMonth()]} ${String(shifted.getUTCDate()).padStart(2, '0')} ${shifted.getUTCFullYear()}`;
};
const fixtureUsers = (id, secrets = true) => {
    const make = (suffix, displayName, role, planId = null, birthdate = null) => ({
        uid: `${id}_${suffix}`,
        email: role === 'member'
            ? `${encodeURIComponent(displayName)}_${birthdate}_${id}@bible.local`
            : `${id}_${suffix}@bible114-ops-test.invalid`,
        displayName,
        ...(secrets ? { password: crypto.randomBytes(18).toString('base64url') } : {}),
        role,
        planId,
        birthdate,
    });
    return [
        make('admin', '전체기능감사 관리자', 'churchAdmin'),
        ...Array.from({ length: MEMBER_COUNT }, (_, index) => {
            const number = String(index + 1).padStart(2, '0');
            return make(
                `m${number}`,
                `전체기능감사${number}`,
                'member',
                index < 10 ? '1year_revised' : '1year_new',
                `199001${number}`,
            );
        }),
    ];
};

const validateManifest = manifest => {
    const expectedUids = [
        `${churchId}_admin`,
        ...Array.from({ length: MEMBER_COUNT }, (_, index) =>
            `${churchId}_m${String(index + 1).padStart(2, '0')}`),
    ];
    const legacyCleanupManifest = command === 'cleanup'
        && manifest?.accounts?.slice(1).every((user, index) => {
            const number = String(index + 1).padStart(2, '0');
            return user.email === `${churchId}_m${number}@bible114-ops-test.invalid`
                && (user.birthdate === null || user.birthdate === undefined);
        });
    if (
        manifest?.schemaVersion !== 1 || manifest.projectId !== PROJECT_ID || manifest.churchId !== churchId ||
        !manifest.churchId.startsWith(PREFIX) || !Array.isArray(manifest.accounts) ||
        manifest.accounts.length !== MEMBER_COUNT + 1 || manifest.accounts[0]?.role !== 'churchAdmin' ||
        manifest.accounts.slice(1).some(user => user.role !== 'member') ||
        manifest.accounts.some(user => !user.uid.startsWith(`${churchId}_`) ||
            (user.role === 'churchAdmin' && !user.email.endsWith('@bible114-ops-test.invalid')) ||
            (user.role === 'member' && (
                !user.email.endsWith(`_${churchId}@bible.local`) ||
                !/^199001\d{2}$/.test(user.birthdate || '')
            ) && !legacyCleanupManifest))
    ) fail('Manifest does not match the exact disposable fixture contract.');
    const uids = new Set(manifest.accounts.map(user => user.uid));
    const emails = new Set(manifest.accounts.map(user => user.email));
    if (
        uids.size !== MEMBER_COUNT + 1 || emails.size !== MEMBER_COUNT + 1 ||
        expectedUids.some((uid, index) => manifest.accounts[index]?.uid !== uid)
    ) fail('Manifest accounts are not the exact ordered fixture set.');
    return manifest;
};

const preflightAbsence = async accounts => {
    const conflicts = [];
    for (const target of [
        `churches/${churchId}`, `publicChurches/${churchId}`,
        ...accounts.map(user => `users/${user.uid}`),
    ]) if (await getDocument(target)) conflicts.push(target);
    for (const user of accounts) {
        if ((await lookupAuth({ localId: [user.uid] })).length > 0) conflicts.push(`Auth UID ${user.uid}`);
        if ((await lookupAuth({ email: [user.email] })).length > 0) conflicts.push(`Auth email ${user.email}`);
        if ((await queryCollectionGroupByField('roster', 'uid', user.uid)).length > 0) {
            conflicts.push(`roster UID ${user.uid}`);
        }
    }
    const directory = await getDocument('settings/churchDirectory');
    if (!directory || !Array.isArray(directory.data.churches)) fail('settings/churchDirectory is unavailable or malformed.');
    if (directory.data.churches.some(entry => entry?.id === churchId)) conflicts.push('settings/churchDirectory projection');
    if (conflicts.length > 0) fail(`Preflight collision (${conflicts.length}); no writes performed.`);
    return directory;
};

const reconcileStats = async ({ dryRun }) => {
    const [usersRaw, churchesRaw, current] = await Promise.all([
        listDocuments('', 'users'), listDocuments('', 'churches'), getDocument('settings/platformStats'),
    ]);
    const users = usersRaw.map(document => ({
        name: document.name, updateTime: document.updateTime, data: decodeFields(document.fields || {}),
    }));
    const churches = churchesRaw.map(document => ({
        name: document.name, updateTime: document.updateTime, data: decodeFields(document.fields || {}),
    }));
    const activeUsers = users.filter(({ data }) => data.isDeleted !== true);
    const today = legacyDate(new Date());
    const expected = {
        total_readers: activeUsers.length,
        total_churches: churches.filter(({ data, name }) =>
            data.isDeleted !== true && data.isVirtual !== true && !name.endsWith('/churches/unaffiliated_v1')).length,
        readers_today: activeUsers.filter(({ data }) => data.lastReadDate === today).length,
        finished_total: activeUsers.reduce((sum, { data }) => {
            const readCount = Number.isSafeInteger(data.readCount) && data.readCount > 0 ? data.readCount : 1;
            return sum + Math.max(readCount - 1, 0);
        }, 0),
        today_date: today,
    };
    const changed = Object.keys(expected).filter(key => current?.data?.[key] !== expected[key]);
    if (!dryRun && changed.length > 0) {
        if (!current) fail('settings/platformStats is missing.');
        if (users.length + churches.length > 480) {
            fail('Platform stats snapshot exceeds the official 480-document safety bound.');
        }
        const verifies = [...users, ...churches].map(document => ({
            verify: document.name, currentDocument: { updateTime: document.updateTime },
        }));
        await commit([
            ...verifies,
            updateWrite('settings/platformStats', {
                ...expected, updatedAt: new Date(), rebuiltAt: new Date(), rebuiltBy: 'site-audit-fixture-manager',
            }, current.updateTime),
        ]);
    }
    return { expected, changed };
};

const writePrivateJson = (filePath, value) => {
    fs.mkdirSync(path.dirname(filePath), { recursive: true, mode: 0o700 });
    fs.chmodSync(path.dirname(filePath), 0o700);
    const tempPath = `${filePath}.${process.pid}.tmp`;
    fs.writeFileSync(tempPath, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600, flag: 'wx' });
    fs.renameSync(tempPath, filePath);
    fs.chmodSync(filePath, 0o600);
};

const updateDirectoryProjection = async ({ remove }) => {
    const directory = await getDocument('settings/churchDirectory');
    if (!directory || !Array.isArray(directory.data.churches)) fail('settings/churchDirectory malformed.');
    const matches = directory.data.churches.filter(entry => entry?.id === churchId);
    if (remove && matches.length === 0) return;
    if (matches.length > (remove ? 1 : 0)) fail('Directory target multiplicity mismatch.');
    if (!remove && matches.length > 0) fail('Directory target already exists.');
    const churches = remove
        ? directory.data.churches.filter(entry => entry?.id !== churchId)
        : [...directory.data.churches, { id: churchId, name: '전체 기능 감사 테스트 교회' }];
    await commit([updateWrite('settings/churchDirectory', { churches, updatedAt: new Date() }, directory.updateTime)]);
};

const reconcilePublicMetaCount = async ({ dryRun }) => {
    const meta = await getDocument('publicDirectoryMeta/current');
    if (!meta || meta.data.ready !== true) return { changed: false, expected: null };
    const publicChurches = await listDocuments('', 'publicChurches');
    const expected = publicChurches.length;
    const changed = meta.data.count !== expected;
    if (changed && !dryRun) {
        if (publicChurches.length > 480) fail('Public directory snapshot exceeds the 480-document safety bound.');
        const verifies = publicChurches.map(document => ({
            verify: document.name, currentDocument: { updateTime: document.updateTime },
        }));
        await commit([
            ...verifies,
            updateWrite('publicDirectoryMeta/current', { count: expected, updatedAt: new Date() }, meta.updateTime),
        ]);
    }
    return { changed, expected };
};

const createFixture = async () => {
    const accounts = fixtureUsers(churchId, apply);
    const directory = await preflightAbsence(accounts);
    const preview = {
        mode: apply ? 'apply' : 'dry-run', projectId: PROJECT_ID, churchId,
        accounts: accounts.length, translations: { revised: 10, new: 10 },
        directoryUpdateTime: directory.updateTime,
    };
    if (!apply) {
        console.log(JSON.stringify(preview, null, 2));
        return;
    }

    const manifestPath = path.join(privateRoot, `${churchId}.json`);
    if (fs.existsSync(manifestPath)) fail('Private manifest path already exists.');
    const now = new Date();
    const entryCode = String(crypto.randomInt(1000, 10000));
    const manifest = validateManifest({
        schemaVersion: 1, projectId: PROJECT_ID, churchId, status: 'creating',
        createdAt: now.toISOString(), entryCode,
        accounts: accounts.map(user => ({ ...user })),
        ownedRoots: [
            `churches/${churchId}`, `publicChurches/${churchId}`,
            ...accounts.map(user => `users/${user.uid}`),
        ],
    });
    writePrivateJson(manifestPath, manifest);
    const createdAuth = [];
    try {
        for (const user of accounts) {
            await createAuthAccount(user);
            createdAuth.push(user.uid);
        }
        const department = { id: 'audit_adult', name: '감사부서', subgroups: [{ id: 'audit_group', name: '동시접속반' }] };
        const item = { id: 'audit_item_1', emoji: '🧪', name: '감사상품', price: 1, description: '일회용 기능 감사 상품', active: true };
        const admin = accounts[0];
        const common = {
            churchId, churchName: '전체 기능 감사 테스트 교회', extraMemberships: [],
            startDate: legacyDate(now), currentDay: 1, streak: 0, score: 0, talent: 0,
            talentMigrated: true, readCount: 1, lastReadDate: null,
            dailyAdvanceDate: null, dailyAdvanceCount: 0, gender: 'male',
            departmentId: 'audit_adult', departmentName: '감사부서',
            subgroupId: 'audit_group', subgroupName: '동시접속반',
            isDeleted: false, deletedAt: null, deletedBy: null, createdAt: now, updatedAt: now,
        };
        const writes = [
            createWrite(`churches/${churchId}`, {
                name: '전체 기능 감사 테스트 교회', pastorName: '기능감사', denomination: '테스트',
                departments: [department], isDeleted: false, hiddenFromDirectory: false,
                fixtureType: 'full-site-audit', fixtureRunId: churchId, createdAt: now, updatedAt: now,
            }),
            createWrite(`churches/${churchId}/private/admin`, {
                adminUid: admin.uid, adminEmail: admin.email, updatedAt: now,
            }),
            createWrite(`churches/${churchId}/private/access`, {
                codeHash: crypto.createHash('sha256').update(entryCode).digest('hex'), updatedAt: now,
            }),
            createWrite(`churches/${churchId}/settings/talentShop`, {
                schemaVersion: 2, enabled: true,
                departmentSettings: { audit_adult: { enabled: true, marketId: 'shared' } },
                markets: { shared: { id: 'shared', name: '감사 시장', enabled: true, items: [item] } },
                items: [item], updatedAt: now,
            }),
            createWrite(`publicChurches/${churchId}`, { id: churchId, name: '전체 기능 감사 테스트 교회' }),
            createWrite(`users/${admin.uid}`, {
                ...common, uid: admin.uid, name: admin.displayName, email: admin.email, password: null,
                role: 'churchAdmin', authProvider: 'password', authProviders: ['password'],
                planId: null, onboardingPending: false,
            }),
            createWrite(`users/${admin.uid}/private/auth`, { password: admin.password, updatedAt: now }),
            ...accounts.slice(1).map(user => createWrite(`users/${user.uid}`, {
                ...common, uid: user.uid, name: user.displayName, email: user.email, password: null,
                role: 'member', planId: user.planId, birthdate: user.birthdate,
                accountType: 'church', onboardingPending: false,
                quizProgress: {}, quizAttempts: 0, quizSolved: false, quizSkipped: false,
            })),
            ...accounts.slice(1).map(user => createWrite(
                `users/${user.uid}/private/auth`, { password: user.password, updatedAt: now },
            )),
        ];
        await commit(writes);
        manifest.firestoreCreated = true;
        writePrivateJson(manifestPath, manifest);
        await updateDirectoryProjection({ remove: false });
        manifest.directoryAdded = true;
        writePrivateJson(manifestPath, manifest);
        await reconcilePublicMetaCount({ dryRun: false });
        const stats = await reconcileStats({ dryRun: false });
        manifest.status = 'ready';
        manifest.readyAt = new Date().toISOString();
        manifest.statsChanged = stats.changed;
        writePrivateJson(manifestPath, manifest);
        console.log(JSON.stringify({ ...preview, status: 'ready', manifestPath }, null, 2));
    } catch (error) {
        manifest.status = 'create-failed-rollback-pending';
        manifest.errorAt = new Date().toISOString();
        manifest.createdAuthUids = createdAuth;
        writePrivateJson(manifestPath, manifest);
        try {
            const rollback = await removeOwnedFixture(manifest, {
                deleteFirestore: manifest.firestoreCreated === true,
                authAccounts: manifest.accounts.filter(user => createdAuth.includes(user.uid)),
                removeDirectory: manifest.firestoreCreated === true,
            });
            manifest.status = 'create-failed-rolled-back';
            manifest.rollbackReport = rollback;
            manifest.rollbackFinishedAt = new Date().toISOString();
            writePrivateJson(manifestPath, manifest);
        } catch (rollbackError) {
            manifest.status = 'create-failed-rollback-incomplete';
            manifest.rollbackErrorAt = new Date().toISOString();
            writePrivateJson(manifestPath, manifest);
            throw new AggregateError([error, rollbackError], 'Fixture create and exact rollback both failed.');
        }
        throw error;
    }
};

const removeOwnedFixture = async (
    manifest,
    {
        deleteFirestore = true,
        authAccounts = manifest.accounts,
        removeDirectory = true,
    } = {},
) => {
    let descendantsDeleted = 0;
    let userDocumentsDeleted = 0;
    if (deleteFirestore) {
        for (const user of manifest.accounts) {
            const ownership = await getDocument(`users/${user.uid}`);
            if (ownership && (
                ownership.data.uid !== user.uid || ownership.data.email !== user.email ||
                ownership.data.churchId !== churchId
            )) fail(`Refusing to delete non-fixture users/${user.uid}.`);
            descendantsDeleted += await deleteDocumentTree(`users/${user.uid}`);
            const current = await getDocument(`users/${user.uid}`);
            if (current) {
                await commit([deleteWrite(`users/${user.uid}`, current.updateTime)]);
                userDocumentsDeleted += 1;
            }
        }
        const churchOwnership = await getDocument(`churches/${churchId}`);
        if (churchOwnership && (
            churchOwnership.data.fixtureType !== 'full-site-audit' ||
            churchOwnership.data.fixtureRunId !== churchId
        )) fail(`Refusing to delete non-fixture churches/${churchId}.`);
        descendantsDeleted += await deleteDocumentTree(`churches/${churchId}`);
        const church = await getDocument(`churches/${churchId}`);
        if (church) await commit([deleteWrite(`churches/${churchId}`, church.updateTime)]);
        const publicChurch = await getDocument(`publicChurches/${churchId}`);
        if (publicChurch) await commit([deleteWrite(`publicChurches/${churchId}`, publicChurch.updateTime)]);
    }
    if (removeDirectory) await updateDirectoryProjection({ remove: true });
    const reconcileGlobals = deleteFirestore || removeDirectory;
    if (reconcileGlobals) await reconcilePublicMetaCount({ dryRun: false });
    let authDeleted = 0;
    for (const user of authAccounts) {
        if (await deleteAuthAccount(user.uid, user.email)) authDeleted += 1;
    }
    if (reconcileGlobals) await reconcileStats({ dryRun: false });
    return { descendantsDeleted, userDocumentsDeleted, authDeleted };
};

const cleanupFixture = async () => {
    const manifest = validateManifest(JSON.parse(fs.readFileSync(manifestOption, 'utf8')));
    const expectedManifestPath = path.join(privateRoot, `${churchId}.json`);
    if (path.resolve(manifestOption) !== path.resolve(expectedManifestPath)) {
        fail('Manifest must be the canonical private path for this churchId.');
    }
    const inventory = {
        church: Boolean(await getDocument(`churches/${churchId}`)),
        publicChurch: Boolean(await getDocument(`publicChurches/${churchId}`)),
        users: 0, auth: 0,
    };
    for (const user of manifest.accounts) {
        if (await getDocument(`users/${user.uid}`)) inventory.users += 1;
        if ((await lookupAuth({ localId: [user.uid] })).length > 0) inventory.auth += 1;
    }
    if (!apply) {
        const stats = await reconcileStats({ dryRun: true });
        console.log(JSON.stringify({ mode: 'dry-run', projectId: PROJECT_ID, churchId, inventory, statsChanged: stats.changed }, null, 2));
        return;
    }
    manifest.status = 'cleaning';
    manifest.cleanupStartedAt = new Date().toISOString();
    writePrivateJson(manifestOption, manifest);
    const removal = await removeOwnedFixture(manifest);

    const residue = [];
    for (const target of [
        `churches/${churchId}`, `publicChurches/${churchId}`,
        ...manifest.accounts.map(user => `users/${user.uid}`),
    ]) if (await getDocument(target)) residue.push(target);
    for (const user of manifest.accounts) {
        if ((await lookupAuth({ localId: [user.uid] })).length > 0) residue.push(`Auth ${user.uid}`);
    }
    const directory = await getDocument('settings/churchDirectory');
    if (directory?.data?.churches?.some(entry => entry?.id === churchId)) residue.push('settings/churchDirectory');
    const publicMetaAudit = await reconcilePublicMetaCount({ dryRun: true });
    if (publicMetaAudit.changed) residue.push('publicDirectoryMeta/current');
    const statsAudit = await reconcileStats({ dryRun: true });
    if (statsAudit.changed.length > 0) residue.push('settings/platformStats');
    manifest.status = residue.length === 0 ? 'cleaned' : 'cleanup-incomplete';
    manifest.cleanupFinishedAt = new Date().toISOString();
    manifest.cleanupReport = { ...removal, residueCount: residue.length };
    writePrivateJson(manifestOption, manifest);
    if (residue.length > 0) fail(`Cleanup residue detected (${residue.length}); inspect private manifest report.`);
    console.log(JSON.stringify({ mode: 'apply', projectId: PROJECT_ID, churchId, status: 'cleaned', ...removal }, null, 2));
};

await (command === 'create' ? createFixture() : cleanupFixture());
