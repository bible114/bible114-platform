// T131 운영 테스트 잔재 정리 (2026-07-18 사용자 승인).
// 대상은 아래 고정 허용목록뿐이며 패턴 매칭으로 확장하지 않는다.
// 사용:
//   node scripts/cleanup-t131-residue.mjs backup
//   node scripts/cleanup-t131-residue.mjs execute --confirm "T131 잔재 14계정 2교회 삭제"
//   node scripts/cleanup-t131-residue.mjs verify
// execute는 백업 파일이 있어야 하고, 모든 삭제는 updateTime CAS로 진행한다.

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';

const PROJECT_ID = 'bible114-platform';
const BACKUP_DIR = path.join(os.homedir(), 'Developer', '클로드');
const RESIDUE_BACKUP = path.join(BACKUP_DIR, 'bible114-t131-residue-backup-20260718.json');
const VERSES_BACKUP = path.join(BACKUP_DIR, 'bible114-t131-orphan-verses-backup-20260718.json');

// 2026-07-18 read-only 명단 실측치. name이 다르면 fail-closed.
const TARGET_USERS = [
    { uid: '7iAerXvYG1hNSfXJrNEBd6x5xLB2', name: 'QA새번역0713' },
    { uid: '8DMIlvkl5egUtMcM4Iiyy0KkScn2', name: '테스트성도' },
    { uid: '9JXNN0KOvtV7KaVhLfRU8fa4v6m1', name: 'QA순차0713' },
    { uid: 'Ejw9X3durwPtXo1Tx8j3WvTsN562', name: '테스트관리자' },
    { uid: 'SIqLQ5WKfKOEjdcoMrs0txhg52m1', name: 'QA신약0713' },
    { uid: 'SVxgrnAF5Ads7jpi06oTJYcF4w23', name: '클로드관리자' },
    { uid: 'YjhHILQa2KZ0G3z8SEZBEbYypEz1', name: 'QA개역0713' },
    { uid: 'y0Iny9k06lbTk3vjBqSAs2lQ5zk2', name: '클로드테스트' },
    { uid: '2izTdQQlsiRLVHFsrN9UxlXJkjg1', name: 'Codex Count' },
    { uid: 'LrZ4TW8psQVEap5hPybTNRTsWq73', name: 'Codex Inspect' },
    { uid: 'MzHInlpGL4PBmR1hCmBSN2206kS2', name: 'Codex DB Verifier' },
    { uid: 'PmqcdK4lt4RsQF1ddlsHxIhLDL33', name: 'Codex Final Cleanup' },
    { uid: 'awibMFV4dVUURqJIoJ4HuUXuxzN2', name: 'Codex Saehangul Importer' },
    { uid: 'ks7IYUo6lNbIojUZ0gv5un22gYw1', name: 'Codex All Versions Importer' },
];
const TARGET_CHURCHES = [
    { id: 'jGzP4LNjziZHgD6wAH69', name: '클로드테스트교회' },
    { id: 'test_church_kakao', name: '천로역정테스트교회' },
];
// 미운영 번역(쉬운성경·새한글·메시지) 고아 본문 캐시 — 코드는 6b2e695에서 제거됨.
const ORPHAN_VERSE_ID = /^(1year_easy|1year_saehangul|nt_easy|nt_saehangul|nt_message)_\d{1,3}$/;
const CONFIRM_PHRASE = 'T131 잔재 14계정 2교회 삭제';

const fail = message => { console.error(`중단: ${message}`); process.exit(1); };

const mode = process.argv[2];
if (!['backup', 'execute', 'verify'].includes(mode)) fail('mode는 backup | execute | verify 중 하나여야 합니다.');
if (mode === 'execute') {
    const flag = process.argv.indexOf('--confirm');
    if (flag === -1 || process.argv[flag + 1] !== CONFIRM_PHRASE) {
        fail(`execute에는 --confirm "${CONFIRM_PHRASE}" 가 정확히 필요합니다.`);
    }
    if (!fs.existsSync(RESIDUE_BACKUP) || !fs.existsSync(VERSES_BACKUP)) {
        fail('백업 파일이 없습니다. 먼저 backup을 실행하세요.');
    }
}

const firebaseToolsRoots = [
    '/opt/homebrew/lib/node_modules/firebase-tools',
    '/usr/local/lib/node_modules/firebase-tools',
].filter(root => fs.existsSync(`${root}/package.json`));
if (firebaseToolsRoots.length === 0) fail('Firebase CLI를 찾지 못했습니다.');
const require = createRequire(`${firebaseToolsRoots[0]}/package.json`);
const firebaseAuth = require('./lib/auth');
const account = firebaseAuth.getGlobalDefaultAccount();
if (!account?.tokens?.refresh_token) fail('Firebase CLI 로그인 정보가 없습니다. firebase login --reauth');
const scopes = String(account.tokens.scope || 'https://www.googleapis.com/auth/cloud-platform').split(/\s+/).filter(Boolean);
const access = await firebaseAuth.getAccessToken(account.tokens.refresh_token, scopes);
const accessToken = access?.access_token || access;
if (!accessToken) fail('관리자 토큰을 얻지 못했습니다.');

const firestoreRoot = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents`;
const fullName = documentPath => `projects/${PROJECT_ID}/databases/(default)/documents/${documentPath}`;
const encodePath = documentPath => documentPath.split('/').map(encodeURIComponent).join('/');
const headers = { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' };

const encodeValue = value => {
    if (value === null) return { nullValue: null };
    if (typeof value === 'string') return { stringValue: value };
    if (typeof value === 'boolean') return { booleanValue: value };
    if (typeof value === 'number') {
        return Number.isSafeInteger(value) ? { integerValue: String(value) } : { doubleValue: value };
    }
    if (value instanceof Date) return { timestampValue: value.toISOString() };
    if (Array.isArray(value)) return { arrayValue: { values: value.map(encodeValue) } };
    if (typeof value === 'object') return { mapValue: { fields: encodeFields(value) } };
    throw new Error(`encode 불가: ${typeof value}`);
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
        fail(`${init.method || 'GET'} ${new URL(url).pathname} 실패: HTTP ${response.status} ${JSON.stringify(body).slice(0, 200)}`);
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
        const base = parentPath
            ? `${firestoreRoot}/${encodePath(parentPath)}/${encodeURIComponent(collectionId)}`
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
const runRosterGroup = async () => {
    const { body } = await requestJson(`${firestoreRoot}:runQuery`, {
        method: 'POST',
        body: JSON.stringify({ structuredQuery: { from: [{ collectionId: 'roster', allDescendants: true }] } }),
    });
    return (Array.isArray(body) ? body : []).flatMap(row => row.document ? [row.document] : []);
};
const deleteWrite = (documentPath, updateTime) => ({
    delete: fullName(documentPath), currentDocument: { updateTime },
});
const updateWrite = (documentPath, data, updateTime) => ({
    update: { name: fullName(documentPath), fields: encodeFields(data) },
    updateMask: { fieldPaths: Object.keys(data) },
    currentDocument: { updateTime },
});
const commit = async writes => {
    if (writes.length === 0) return;
    if (writes.length > 500) fail('commit 500건 제한 초과.');
    await requestJson(`${firestoreRoot}:commit`, { method: 'POST', body: JSON.stringify({ writes }) });
};

// 하위 컬렉션까지 백업용으로 읽는다.
const dumpDocumentTree = async documentPath => {
    const root = await getDocument(documentPath);
    if (!root) return null;
    const children = {};
    for (const collectionId of await listCollectionIds(documentPath)) {
        children[collectionId] = [];
        for (const child of await listDocuments(documentPath, collectionId)) {
            const childPath = documentPathFromName(child.name);
            children[collectionId].push(await dumpDocumentTree(childPath));
        }
    }
    return { path: documentPath, updateTime: root.updateTime, data: root.data, children };
};

// 하위부터 CAS 삭제.
const deleteDocumentTree = async documentPath => {
    let deleted = 0;
    for (const collectionId of await listCollectionIds(documentPath)) {
        for (const child of await listDocuments(documentPath, collectionId)) {
            deleted += await deleteDocumentTree(documentPathFromName(child.name));
        }
    }
    const current = await getDocument(documentPath);
    if (current) {
        await commit([deleteWrite(documentPath, current.updateTime)]);
        deleted += 1;
    }
    return deleted;
};

const targetUserUids = new Set(TARGET_USERS.map(user => user.uid));
const targetChurchIds = new Set(TARGET_CHURCHES.map(church => church.id));

// preflight: 모든 대상이 기록된 이름과 정확히 일치해야 한다 (사라진 대상은 허용).
const preflight = async () => {
    const found = { users: [], churches: [], rosters: [], verses: [] };
    for (const target of TARGET_USERS) {
        const doc = await getDocument(`users/${target.uid}`);
        if (!doc) continue;
        if (doc.data.name !== target.name) fail(`users/${target.uid} 이름 불일치: ${doc.data.name}`);
        found.users.push({ ...target, updateTime: doc.updateTime });
    }
    for (const target of TARGET_CHURCHES) {
        const doc = await getDocument(`churches/${target.id}`);
        if (!doc) continue;
        if (doc.data.name !== target.name) fail(`churches/${target.id} 이름 불일치: ${doc.data.name}`);
        found.churches.push({ ...target, updateTime: doc.updateTime });
    }
    for (const document of await runRosterGroup()) {
        const rosterPath = documentPathFromName(document.name);
        const match = /^churches\/([^/]+)\/roster\/([^/]+)$/.exec(rosterPath);
        if (!match) continue;
        const [, churchId, pathUid] = match;
        const data = decodeFields(document.fields || {});
        const uid = typeof data.uid === 'string' && data.uid ? data.uid : pathUid;
        if (targetChurchIds.has(churchId) || targetUserUids.has(uid)) {
            found.rosters.push({ path: rosterPath, updateTime: document.updateTime, data });
        }
    }
    for (const document of await listDocuments('', 'verses')) {
        const id = documentPathFromName(document.name).split('/').at(-1);
        if (ORPHAN_VERSE_ID.test(id)) {
            found.verses.push({ path: `verses/${id}`, updateTime: document.updateTime, data: decodeFields(document.fields || {}) });
        }
    }
    return found;
};

const writePrivateJson = (filePath, value) => {
    const tempPath = `${filePath}.${process.pid}.tmp`;
    fs.writeFileSync(tempPath, `${JSON.stringify(value)}\n`, { mode: 0o600, flag: 'wx' });
    fs.renameSync(tempPath, filePath);
    fs.chmodSync(filePath, 0o600);
};

const lookupAuth = async uid => {
    const { body } = await requestJson(
        `https://identitytoolkit.googleapis.com/v1/projects/${PROJECT_ID}/accounts:lookup`,
        { method: 'POST', body: JSON.stringify({ localId: [uid] }) },
    );
    return (Array.isArray(body.users) ? body.users : []).find(user => user.localId === uid) || null;
};
const deleteAuthAccount = async uid => {
    if (!targetUserUids.has(uid)) fail(`허용목록 밖 Auth 삭제 시도: ${uid}`);
    const found = await lookupAuth(uid);
    if (!found) return false;
    await requestJson(
        `https://identitytoolkit.googleapis.com/v1/projects/${PROJECT_ID}/accounts:delete`,
        { method: 'POST', body: JSON.stringify({ localId: uid }) },
    );
    return true;
};

const legacyDate = date => {
    const shifted = new Date(date.getTime() + 9 * 60 * 60 * 1_000);
    const weekdays = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    return `${weekdays[shifted.getUTCDay()]} ${months[shifted.getUTCMonth()]} ${String(shifted.getUTCDate()).padStart(2, '0')} ${shifted.getUTCFullYear()}`;
};

// manage-site-audit-fixture.mjs의 공식 그대로 재계산한다.
const reconcileStats = async ({ dryRun }) => {
    const [usersRaw, churchesRaw, current] = await Promise.all([
        listDocuments('', 'users'), listDocuments('', 'churches'), getDocument('settings/platformStats'),
    ]);
    const users = usersRaw.map(document => ({ name: document.name, updateTime: document.updateTime, data: decodeFields(document.fields || {}) }));
    const churches = churchesRaw.map(document => ({ name: document.name, updateTime: document.updateTime, data: decodeFields(document.fields || {}) }));
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
        if (!current) fail('settings/platformStats 누락.');
        if (users.length + churches.length > 480) fail('통계 스냅샷 480건 안전 상한 초과.');
        const verifies = [...users, ...churches].map(document => ({
            verify: document.name, currentDocument: { updateTime: document.updateTime },
        }));
        await commit([
            ...verifies,
            updateWrite('settings/platformStats', {
                ...expected, updatedAt: new Date(), rebuiltAt: new Date(), rebuiltBy: 't131-residue-cleanup',
            }, current.updateTime),
        ]);
    }
    return { expected, changed };
};

const reconcilePublicMetaCount = async ({ dryRun }) => {
    const meta = await getDocument('publicDirectoryMeta/current');
    if (!meta || meta.data.ready !== true) return { changed: false };
    const publicChurches = await listDocuments('', 'publicChurches');
    const expected = publicChurches.length;
    const changed = meta.data.count !== expected;
    if (changed && !dryRun) {
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

if (mode === 'backup') {
    const found = await preflight();
    const users = [];
    for (const target of found.users) users.push(await dumpDocumentTree(`users/${target.uid}`));
    const churches = [];
    for (const target of found.churches) churches.push(await dumpDocumentTree(`churches/${target.id}`));
    const publicProjections = [];
    for (const target of found.churches) {
        const projection = await getDocument(`publicChurches/${target.id}`);
        if (projection) publicProjections.push({ path: `publicChurches/${target.id}`, ...projection });
    }
    const auth = [];
    for (const target of found.users) {
        const authUser = await lookupAuth(target.uid);
        if (authUser) auth.push(authUser);
    }
    const directory = await getDocument('settings/churchDirectory');
    const stats = await getDocument('settings/platformStats');
    writePrivateJson(RESIDUE_BACKUP, {
        backedUpAt: new Date().toISOString(),
        targets: { users: TARGET_USERS, churches: TARGET_CHURCHES },
        users, churches, publicProjections, rosters: found.rosters, auth,
        churchDirectory: directory, platformStats: stats,
    });
    writePrivateJson(VERSES_BACKUP, {
        backedUpAt: new Date().toISOString(),
        count: found.verses.length,
        verses: found.verses,
    });
    console.log(JSON.stringify({
        mode,
        residueBackup: RESIDUE_BACKUP,
        versesBackup: VERSES_BACKUP,
        counts: {
            users: found.users.length,
            churches: found.churches.length,
            rosters: found.rosters.length,
            publicProjections: publicProjections.length,
            authAccounts: auth.length,
            orphanVerses: found.verses.length,
        },
    }, null, 2));
    process.exit(0);
}

if (mode === 'execute') {
    const found = await preflight();
    const result = { usersDeleted: 0, userDocsDeleted: 0, rostersDeleted: 0, churchesDeleted: 0, churchDocsDeleted: 0, publicDeleted: 0, directoryRemoved: 0, authDeleted: 0, versesDeleted: 0 };

    // 1. 후보 roster부터 (교회 subtree 삭제와 중복돼도 CAS가 안전하게 넘어가도록 먼저 처리)
    for (const roster of found.rosters) {
        const current = await getDocument(roster.path);
        if (!current) continue;
        await commit([deleteWrite(roster.path, current.updateTime)]);
        result.rostersDeleted += 1;
    }

    // 2. users 문서 + 하위 트리
    for (const target of found.users) {
        result.userDocsDeleted += await deleteDocumentTree(`users/${target.uid}`);
        result.usersDeleted += 1;
    }

    // 3. 교회 subtree + 본문서 + 공개 투영
    for (const target of found.churches) {
        result.churchDocsDeleted += await deleteDocumentTree(`churches/${target.id}`);
        result.churchesDeleted += 1;
        const projection = await getDocument(`publicChurches/${target.id}`);
        if (projection) {
            await commit([deleteWrite(`publicChurches/${target.id}`, projection.updateTime)]);
            result.publicDeleted += 1;
        }
    }

    // 4. legacy 디렉토리에서 두 교회 제거
    const directory = await getDocument('settings/churchDirectory');
    if (directory && Array.isArray(directory.data.churches)) {
        const remaining = directory.data.churches.filter(entry => !targetChurchIds.has(entry?.id));
        result.directoryRemoved = directory.data.churches.length - remaining.length;
        if (result.directoryRemoved > 0) {
            await commit([updateWrite('settings/churchDirectory', { churches: remaining, updatedAt: new Date() }, directory.updateTime)]);
        }
    }

    // 5. Auth 계정
    for (const target of TARGET_USERS) {
        if (await deleteAuthAccount(target.uid)) result.authDeleted += 1;
    }

    // 6. 고아 verses 캐시
    for (const verse of found.verses) {
        const current = await getDocument(verse.path);
        if (!current) continue;
        await commit([deleteWrite(verse.path, current.updateTime)]);
        result.versesDeleted += 1;
    }

    // 7. 통계·공개 meta 재정합
    const stats = await reconcileStats({ dryRun: false });
    const meta = await reconcilePublicMetaCount({ dryRun: false });

    console.log(JSON.stringify({ mode, result, stats: stats.expected, statsChangedKeys: stats.changed, publicMeta: meta }, null, 2));
    process.exit(0);
}

if (mode === 'verify') {
    const found = await preflight();
    const directory = await getDocument('settings/churchDirectory');
    const directoryHasTargets = Array.isArray(directory?.data?.churches)
        && directory.data.churches.some(entry => targetChurchIds.has(entry?.id));
    let authRemaining = 0;
    for (const target of TARGET_USERS) {
        if (await lookupAuth(target.uid)) authRemaining += 1;
    }
    const publicRemaining = [];
    for (const target of TARGET_CHURCHES) {
        if (await getDocument(`publicChurches/${target.id}`)) publicRemaining.push(target.id);
    }
    const stats = await reconcileStats({ dryRun: true });
    const clean = found.users.length === 0 && found.churches.length === 0 && found.rosters.length === 0
        && found.verses.length === 0 && !directoryHasTargets && authRemaining === 0
        && publicRemaining.length === 0 && stats.changed.length === 0;
    console.log(JSON.stringify({
        mode,
        clean,
        remaining: {
            users: found.users.length,
            churches: found.churches.length,
            rosters: found.rosters.length,
            orphanVerses: found.verses.length,
            directoryHasTargets,
            authRemaining,
            publicRemaining,
            statsChangedKeys: stats.changed,
        },
    }, null, 2));
    process.exit(clean ? 0 : 1);
}
