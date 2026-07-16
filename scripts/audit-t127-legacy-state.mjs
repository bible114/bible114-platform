import fs from 'node:fs';
import { createRequire } from 'node:module';

const PROJECT_ID = 'bible114-platform';
const args = process.argv.slice(2);
let targetName = '';
let expectedDay = null;
let expectedReadCount = null;
for (let index = 0; index < args.length; index += 1) {
    const value = args[index + 1];
    if (args[index] === '--target-name' && value && !targetName) targetName = value;
    else if (args[index] === '--expected-day' && value && expectedDay === null) expectedDay = Number(value);
    else if (args[index] === '--expected-read-count' && value && expectedReadCount === null) expectedReadCount = Number(value);
    else throw new Error('사용법: node scripts/audit-t127-legacy-state.mjs [--target-name <이름> --expected-day <1~365> --expected-read-count <1 이상>]');
    index += 1;
}
if (targetName && (!Number.isSafeInteger(expectedDay) || expectedDay < 1 || expectedDay > 365
    || !Number.isSafeInteger(expectedReadCount) || expectedReadCount < 1)) {
    throw new Error('target-name을 쓰면 expected-day와 expected-read-count도 안전한 정수로 지정해야 합니다.');
}
if (!targetName && (expectedDay !== null || expectedReadCount !== null)) {
    throw new Error('expected 값은 target-name과 함께 지정해야 합니다.');
}

const firebaseToolsRoots = [
    '/opt/homebrew/lib/node_modules/firebase-tools',
    '/usr/local/lib/node_modules/firebase-tools',
].filter(root => fs.existsSync(`${root}/package.json`));
if (firebaseToolsRoots.length === 0) {
    throw new Error('Firebase CLI 로그인을 찾지 못했습니다.');
}
const require = createRequire(`${firebaseToolsRoots[0]}/package.json`);
const auth = require('./lib/auth');
const account = auth.getGlobalDefaultAccount();
if (!account?.tokens?.refresh_token) throw new Error('Firebase CLI 로그인 정보가 없습니다.');
const scopes = String(account.tokens.scope || 'https://www.googleapis.com/auth/cloud-platform')
    .split(/\s+/).filter(Boolean);
const access = await auth.getAccessToken(account.tokens.refresh_token, scopes);
const accessToken = access?.access_token || access;
const root = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents`;
const headers = { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' };

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
const uidFromUserName = name => String(name || '').split('/').pop() || '';
const rosterIdentity = name => {
    const marker = '/documents/churches/';
    const markerIndex = String(name || '').indexOf(marker);
    const segments = markerIndex < 0 ? [] : name.slice(markerIndex + marker.length).split('/');
    return segments.length === 3 && segments[1] === 'roster'
        ? { orgId: segments[0], uid: segments[2] }
        : null;
};
const isSafeBalance = value => Number.isSafeInteger(value) && value >= 0 && value <= 1_000_000_000;
const isSafeProgress = value => Number.isSafeInteger(value) && value >= 1;

const userDocuments = [];
let pageToken = '';
do {
    const url = new URL(`${root}/users`);
    url.searchParams.set('pageSize', '300');
    if (pageToken) url.searchParams.set('pageToken', pageToken);
    const response = await fetch(url, { headers });
    if (!response.ok) throw new Error(`users 읽기 실패: HTTP ${response.status}`);
    const body = await response.json();
    userDocuments.push(...(body.documents || []));
    pageToken = body.nextPageToken || '';
} while (pageToken);

const rosterResponse = await fetch(`${root}:runQuery`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
        structuredQuery: { from: [{ collectionId: 'roster', allDescendants: true }] },
    }),
});
if (!rosterResponse.ok) throw new Error(`roster 읽기 실패: HTTP ${rosterResponse.status}`);
const rosterRows = (await rosterResponse.json()).flatMap(row => row.document ? [row.document] : []);

const users = new Map(userDocuments.map(document => {
    const uid = uidFromUserName(document.name);
    return [uid, { uid, data: decodeFields(document.fields || {}) }];
}));
const rostersByUid = new Map();
let malformedRosterPath = 0;
let rosterUidMismatch = 0;
let rosterMissingOrInvalidTalent = 0;
for (const document of rosterRows) {
    const identity = rosterIdentity(document.name);
    if (!identity) {
        malformedRosterPath += 1;
        continue;
    }
    const data = decodeFields(document.fields || {});
    if (data.uid !== identity.uid) rosterUidMismatch += 1;
    if (!isSafeBalance(data.talent)) rosterMissingOrInvalidTalent += 1;
    const rows = rostersByUid.get(identity.uid) || [];
    rows.push({ orgId: identity.orgId, data });
    rostersByUid.set(identity.uid, rows);
}

const allowedRoles = new Set(['member', 'churchAdmin', 'platformAdmin', 'superAdmin']);
const report = {
    users: {
        total: users.size,
        active: 0,
        deleted: 0,
        missingOrUnknownRole: 0,
        invalidCurrentDay: 0,
        legacyCurrentDayOver365: 0,
        missingOrInvalidReadCount: 0,
        talentMigratedMissingOrFalse: 0,
        nonMigratedWithInventory: 0,
        nonMigratedWithUnlockedRooms: 0,
        percentEncodedUserIds: 0,
    },
    personalWallets: {
        activePersonal: 0,
        missingOrInvalidUsersTalent: 0,
        invalidMigrationFlag: 0,
        positiveUsersTalent: 0,
        primaryOrgMissing: 0,
        primaryRosterMissing: 0,
        primaryRosterInvalidTalent: 0,
    },
    rosters: {
        total: rosterRows.length,
        malformedPath: malformedRosterPath,
        uidMismatch: rosterUidMismatch,
        missingOrInvalidTalent: rosterMissingOrInvalidTalent,
        usersWithMoreThan3: 0,
        progressMismatchOrMissing: 0,
        orphanUid: 0,
    },
    targetRepair: targetName ? { matches: 0, exactExpectedState: 0, otherState: 0 } : null,
};

for (const { uid, data } of users.values()) {
    // commit 본문 percent 인코딩 버그(kakao:123 → kakao%3A123, 2026-07-14~07-17)의 잔존 여부 참고 지표.
    if (uid.includes('%')) report.users.percentEncodedUserIds += 1;
    const deleted = data.isDeleted === true;
    if (deleted) report.users.deleted += 1;
    else report.users.active += 1;
    if (!allowedRoles.has(data.role)) report.users.missingOrUnknownRole += 1;
    if (!isSafeProgress(data.currentDay)) report.users.invalidCurrentDay += 1;
    else if (data.currentDay > 365) report.users.legacyCurrentDayOver365 += 1;
    if (data.readCount !== undefined && data.readCount !== null && !isSafeProgress(data.readCount)) {
        report.users.missingOrInvalidReadCount += 1;
    } else if (data.readCount === undefined || data.readCount === null) {
        report.users.missingOrInvalidReadCount += 1;
    }
    if (data.talentMigrated !== true) {
        report.users.talentMigratedMissingOrFalse += 1;
        if (Array.isArray(data.inventory) && data.inventory.length > 0) {
            report.users.nonMigratedWithInventory += 1;
        }
        if (Number.isSafeInteger(data.miniroom?.unlockedRooms) && data.miniroom.unlockedRooms > 1) {
            report.users.nonMigratedWithUnlockedRooms += 1;
        }
    }
    const rosterRowsForUser = rostersByUid.get(uid) || [];
    if (rosterRowsForUser.length > 3) report.rosters.usersWithMoreThan3 += 1;
    for (const roster of rosterRowsForUser) {
        if (roster.data.currentDay !== data.currentDay || roster.data.readCount !== (data.readCount ?? 1)) {
            report.rosters.progressMismatchOrMissing += 1;
        }
    }
    if (!deleted && data.accountType === 'personal') {
        report.personalWallets.activePersonal += 1;
        if (!isSafeBalance(data.talent)) report.personalWallets.missingOrInvalidUsersTalent += 1;
        else if (data.talent > 0) report.personalWallets.positiveUsersTalent += 1;
        if (data.talentWalletMigrated !== undefined && typeof data.talentWalletMigrated !== 'boolean') {
            report.personalWallets.invalidMigrationFlag += 1;
        }
        if (typeof data.primaryOrgId !== 'string' || !data.primaryOrgId) {
            report.personalWallets.primaryOrgMissing += 1;
        } else {
            const primary = rosterRowsForUser.find(roster => roster.orgId === data.primaryOrgId);
            if (!primary) report.personalWallets.primaryRosterMissing += 1;
            else if (!isSafeBalance(primary.data.talent)) report.personalWallets.primaryRosterInvalidTalent += 1;
        }
    }
    if (targetName && data.name === targetName) {
        report.targetRepair.matches += 1;
        if (data.currentDay === expectedDay && data.readCount === expectedReadCount) {
            report.targetRepair.exactExpectedState += 1;
        } else {
            report.targetRepair.otherState += 1;
        }
    }
}
for (const uid of rostersByUid.keys()) {
    if (!users.has(uid)) report.rosters.orphanUid += 1;
}

console.log(JSON.stringify(report, null, 2));
