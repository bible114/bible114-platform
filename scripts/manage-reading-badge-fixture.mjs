#!/usr/bin/env node
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';

const PROJECT_ID = 'bible114-platform';
const CHURCH_ID = 'test_church_kakao';
const CHURCH_NAME = '천로역정테스트교회';
const PREFERRED_ANCHOR_NAME = '이재암';
const PREFIX = 'reading_badge_test_';
const MEMBER_COUNT = 20;
const command = process.argv[2] || 'preview';
const apply = process.argv.includes('--apply');
const confirmation = process.argv.find(value => value.startsWith('--confirm='))?.slice(10) || '';
const fail = message => { throw new Error(message); };

if (!['preview', 'create', 'audit'].includes(command)) {
    fail('Usage: node scripts/manage-reading-badge-fixture.mjs preview|audit|create [--apply --confirm=CREATE_READING_BADGE_FIXTURE]');
}
if (command === 'create' && apply && confirmation !== 'CREATE_READING_BADGE_FIXTURE') {
    fail('create requires --apply --confirm=CREATE_READING_BADGE_FIXTURE');
}

const firebaseToolsRoot = [
    '/opt/homebrew/lib/node_modules/firebase-tools',
    '/usr/local/lib/node_modules/firebase-tools',
].find(root => fs.existsSync(path.join(root, 'package.json')));
if (!firebaseToolsRoot) fail('Firebase CLI installation not found.');
const require = createRequire(path.join(firebaseToolsRoot, 'package.json'));
const firebaseAuth = require('./lib/auth');
const account = firebaseAuth.getGlobalDefaultAccount();
if (!account?.tokens?.refresh_token) fail('Firebase CLI login not found.');
const scopes = String(account.tokens.scope || 'https://www.googleapis.com/auth/cloud-platform').split(/\s+/).filter(Boolean);
const tokenResult = await firebaseAuth.getAccessToken(account.tokens.refresh_token, scopes);
const accessToken = tokenResult?.access_token || tokenResult;
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
    if (typeof value === 'number') return Number.isInteger(value)
        ? { integerValue: String(value) }
        : { doubleValue: value };
    if (Array.isArray(value)) return { arrayValue: { values: value.map(encodeValue) } };
    if (typeof value === 'object') return { mapValue: { fields: encodeFields(value) } };
    fail(`Unsupported Firestore value: ${typeof value}`);
};
const encodeFields = value => Object.fromEntries(Object.entries(value).map(([key, item]) => [key, encodeValue(item)]));
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
const decodeFields = fields => Object.fromEntries(Object.entries(fields || {}).map(([key, value]) => [key, decodeValue(value)]));
const requestJson = async (url, init = {}, allowedStatuses = []) => {
    const response = await fetch(url, { ...init, headers: { ...headers, ...(init.headers || {}) } });
    const body = await response.json().catch(() => ({}));
    if (!response.ok && !allowedStatuses.includes(response.status)) {
        fail(`${init.method || 'GET'} ${new URL(url).pathname} failed: HTTP ${response.status}`);
    }
    return { response, body };
};
const getDocument = async documentPath => {
    const result = await requestJson(`${firestoreRoot}/${encodePath(documentPath)}`, {}, [404]);
    return result.response.status === 404 ? null : { data: decodeFields(result.body.fields || {}) };
};
const queryUsers = async () => {
    const body = {
        structuredQuery: {
            from: [{ collectionId: 'users' }],
            where: { fieldFilter: { field: { fieldPath: 'churchId' }, op: 'EQUAL', value: { stringValue: CHURCH_ID } } },
            limit: 500,
        },
    };
    const rows = (await requestJson(`${firestoreRoot}:runQuery`, { method: 'POST', body: JSON.stringify(body) })).body;
    return rows.filter(row => row.document).map(row => ({
        uid: row.document.name.split('/').pop(),
        ...decodeFields(row.document.fields || {}),
    }));
};
const lookupAuth = async lookup => (
    await requestJson(`https://identitytoolkit.googleapis.com/v1/projects/${PROJECT_ID}/accounts:lookup`, {
        method: 'POST', body: JSON.stringify(lookup),
    })
).body.users || [];
const createAuth = async user => {
    const result = await requestJson(`https://identitytoolkit.googleapis.com/v1/projects/${PROJECT_ID}/accounts`, {
        method: 'POST',
        body: JSON.stringify({
            localId: user.uid,
            email: user.email,
            password: user.password,
            emailVerified: true,
            displayName: user.name,
        }),
    });
    if (result.body.localId !== user.uid) fail(`Unexpected Auth UID for ${user.uid}.`);
};
const deleteAuth = async uid => requestJson(
    `https://identitytoolkit.googleapis.com/v1/projects/${PROJECT_ID}/accounts:delete`,
    { method: 'POST', body: JSON.stringify({ localId: uid }) },
);
const commit = writes => requestJson(`${firestoreRoot}:commit`, {
    method: 'POST', body: JSON.stringify({ writes }),
});
const createWrite = (documentPath, data) => ({
    update: { name: fullName(documentPath), fields: encodeFields(data) },
    currentDocument: { exists: false },
});

const church = await getDocument(`churches/${CHURCH_ID}`);
if (!church || church.data.name !== CHURCH_NAME || church.data.isDeleted === true) {
    fail(`Target church mismatch: expected active ${CHURCH_NAME} (${CHURCH_ID}).`);
}
const existingUsers = await queryUsers();
const preferredAnchors = existingUsers.filter(user => (
    user.name === PREFERRED_ANCHOR_NAME
    && user.role === 'member'
    && user.isDeleted !== true
    && user.departmentId
));
const activeMembers = existingUsers.filter(user => (
    user.role === 'member'
    && user.isDeleted !== true
    && user.departmentId
    && !user.uid.startsWith(PREFIX)
));
const anchor = preferredAnchors.length === 1
    ? preferredAnchors[0]
    : (activeMembers.length === 1 ? activeMembers[0] : null);
if (!anchor) fail(`Unable to select one safe department anchor (preferred=${preferredAnchors.length}, members=${activeMembers.length}).`);

const departments = Array.isArray(church.data.departments)
    ? church.data.departments
    : (Array.isArray(church.data.communities) ? church.data.communities : []);
const normalizeSubgroup = subgroup => typeof subgroup === 'string'
    ? { id: subgroup, name: subgroup }
    : { id: subgroup?.id || subgroup?.name || '', name: subgroup?.name || subgroup?.id || '' };
const anchorDepartment = departments.find(department => department?.id === anchor.departmentId) || {
    id: anchor.departmentId,
    name: anchor.departmentName || anchor.departmentId,
    subgroups: [],
};
const secondDepartment = departments.find(department => department?.id && department.id !== anchor.departmentId) || anchorDepartment;
const defaultSubgroup = department => {
    const normalized = (department?.subgroups || []).map(normalizeSubgroup).find(item => item.id);
    return normalized || { id: '', name: '' };
};
const anchorSubgroup = {
    id: anchor.subgroupId || defaultSubgroup(anchorDepartment).id,
    name: anchor.subgroupName || anchor.subgroupId || defaultSubgroup(anchorDepartment).name,
};

const manifestDir = path.join(os.homedir(), 'Library', 'Application Support', 'bible114-platform-private', 'reading-badge-fixture');
const manifestPath = path.join(manifestDir, `${CHURCH_ID}.json`);
const existingManifest = fs.existsSync(manifestPath) ? JSON.parse(fs.readFileSync(manifestPath, 'utf8')) : null;
const sharedPassword = existingManifest?.sharedPassword || `B114!${crypto.randomBytes(9).toString('base64url')}`;
const now = new Date();
const today = now.toDateString();
const recentReadDates = [0, 1, 2, 3, 4, 5, 6].map(daysAgo => {
    const date = new Date(now);
    date.setDate(date.getDate() - daysAgo);
    return date.toISOString();
});
const users = Array.from({ length: MEMBER_COUNT }, (_, index) => {
    const isCompletedFixture = index < 10;
    const completedRounds = isCompletedFixture ? 10 - index : 0;
    const number = String(index + 1).padStart(2, '0');
    const department = isCompletedFixture ? anchorDepartment : secondDepartment;
    const subgroup = isCompletedFixture ? anchorSubgroup : defaultSubgroup(secondDepartment);
    const name = isCompletedFixture
        ? `배지테스트${completedRounds}독`
        : `배지대조미완독${String(index - 9).padStart(2, '0')}`;
    const birthdate = `199202${number}`;
    return {
        uid: `${PREFIX}${number}`,
        name,
        birthdate,
        password: sharedPassword,
        email: `${encodeURIComponent(name)}_${birthdate}_${CHURCH_ID}@bible.local`,
        completedRounds,
        departmentId: department.id,
        departmentName: department.name || department.id,
        subgroupId: subgroup.id,
        subgroupName: subgroup.name,
    };
});

const existingFixtureUsers = existingUsers.filter(user => user.uid.startsWith(PREFIX));
const preview = {
    projectId: PROJECT_ID,
    church: { id: CHURCH_ID, name: church.data.name },
    anchor: { uid: anchor.uid, name: anchor.name, departmentId: anchor.departmentId, subgroupId: anchor.subgroupId || '' },
    cohorts: [...new Set(users.map(user => `${user.departmentName}/${user.subgroupName || '-'}`))],
    planned: users.map(user => ({ uid: user.uid, name: user.name, birthdate: user.birthdate, completedRounds: user.completedRounds })),
    existingFixtureCount: existingFixtureUsers.length,
};

if (command === 'preview' || (command === 'create' && !apply)) {
    console.log(JSON.stringify(preview, null, 2));
    process.exit(0);
}

if (command === 'audit') {
    const actual = existingFixtureUsers.map(user => ({
        uid: user.uid,
        name: user.name,
        completedRounds: Math.max(0, (user.readCount || 1) - 1),
        currentDay: user.currentDay,
        departmentId: user.departmentId,
        subgroupId: user.subgroupId || '',
    })).sort((a, b) => a.uid.localeCompare(b.uid));
    const expected = users.map(user => ({
        uid: user.uid,
        name: user.name,
        completedRounds: user.completedRounds,
        currentDay: 1,
        departmentId: user.departmentId,
        subgroupId: user.subgroupId || '',
    }));
    const authMatches = [];
    for (const user of users) {
        const matches = await lookupAuth({ localId: [user.uid] });
        authMatches.push(
            matches.length === 1
            && String(matches[0].email || '').toLowerCase() === user.email.toLowerCase()
        );
    }
    const ok = JSON.stringify(actual) === JSON.stringify(expected) && authMatches.every(Boolean);
    console.log(JSON.stringify({ ok, firestoreCount: actual.length, authCount: authMatches.filter(Boolean).length, rounds: actual.map(user => user.completedRounds) }, null, 2));
    if (!ok) process.exitCode = 1;
    process.exit();
}

if (existingFixtureUsers.length > 0) fail(`Fixture already exists (${existingFixtureUsers.length}); run audit instead.`);
for (const user of users) {
    if ((await getDocument(`users/${user.uid}`)) || (await lookupAuth({ localId: [user.uid] })).length > 0 || (await lookupAuth({ email: [user.email] })).length > 0) {
        fail(`Fixture collision: ${user.uid}`);
    }
}

const createdAuthUids = [];
try {
    for (const user of users) {
        await createAuth(user);
        createdAuthUids.push(user.uid);
    }
    const common = {
        churchId: CHURCH_ID,
        churchName: CHURCH_NAME,
        extraMemberships: [],
        startDate: today,
        currentDay: 1,
        streak: 7,
        maxStreak: 7,
        talent: 0,
        talentMigrated: true,
        talentWalletMigrated: true,
        lastReadDate: today,
        dailyAdvanceDate: today,
        dailyAdvanceCount: 1,
        recentReadDates,
        gender: 'male',
        role: 'member',
        accountType: 'church',
        planId: '1year_revised',
        onboardingPending: false,
        isDeleted: false,
        achievements: [],
        memos: {},
        readHistory: [],
        quizProgress: {},
        quizAttempts: 0,
        quizSolved: false,
        quizSkipped: false,
        fixtureType: 'reading-badge-test',
        fixtureVersion: 1,
        createdAt: now,
        updatedAt: now,
    };
    const writes = users.flatMap(user => [
        createWrite(`users/${user.uid}`, {
            ...common,
            uid: user.uid,
            name: user.name,
            birthdate: user.birthdate,
            email: user.email,
            password: null,
            authProvider: 'password',
            authProviders: ['password'],
            departmentId: user.departmentId,
            departmentName: user.departmentName,
            subgroupId: user.subgroupId,
            subgroupName: user.subgroupName,
            readCount: user.completedRounds + 1,
            score: user.completedRounds * 3650,
        }),
        createWrite(`users/${user.uid}/private/auth`, { password: sharedPassword, updatedAt: now }),
    ]);
    await commit(writes);
    fs.mkdirSync(manifestDir, { recursive: true, mode: 0o700 });
    fs.writeFileSync(manifestPath, JSON.stringify({
        schemaVersion: 1,
        projectId: PROJECT_ID,
        churchId: CHURCH_ID,
        createdAt: now.toISOString(),
        sharedPassword,
        users,
    }, null, 2), { mode: 0o600 });
    console.log(JSON.stringify({ status: 'created', count: users.length, manifestPath }, null, 2));
} catch (error) {
    for (const uid of createdAuthUids.reverse()) await deleteAuth(uid).catch(() => {});
    throw error;
}
