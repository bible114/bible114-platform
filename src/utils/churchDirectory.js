import { db, firebase } from './firebase';
import { UNAFFILIATED_CHURCH_ID } from '../data/constants';
import { sha256 } from './crypto';
import { normalizeChurchEntryCode } from './entryCode';

// ── 최근 교회 기억 (localStorage) ──────────────────────────────────────────
// 멤버 로그인 성공 시 저장, 다음 방문 시 URL 파라미터가 없으면 preselect에 사용.
const LAST_CHURCH_KEY = 'b114_last_church';
export const getLastChurch = () => {
    try {
        const raw = localStorage.getItem(LAST_CHURCH_KEY);
        return raw ? JSON.parse(raw) : null;
    } catch {
        return null;
    }
};
export const saveLastChurch = (church) => {
    try {
        if (church?.id && church?.name) {
            localStorage.setItem(LAST_CHURCH_KEY, JSON.stringify({ id: church.id, name: church.name }));
        }
    } catch { /* localStorage 사용 불가 환경 무시 */ }
};

// settings/churchDirectory: { churches: [{ id, name, hidden? }], updatedAt }
// - 비로그인 로그인 화면에서 교회 목록에 필요한 최소 정보만 공개한다.
// - 입장코드 검증은 platform-api의 issueJoinTicket이 담당한다.
const DIRECTORY_DOC = () => db.collection('settings').doc('churchDirectory');

// 모듈 레벨 캐시: 세션(탭)당 1회만 read
let cachePromise = null;

export const getChurchDirectory = () => {
    if (!cachePromise) {
        cachePromise = DIRECTORY_DOC().get()
            .then(doc => (doc.exists ? (doc.data().churches || []) : []))
            .catch(() => {
                cachePromise = null; // 실패 시 재시도 허용
                return [];
            });
    }
    return cachePromise;
};

// 디렉토리 캐시 무효화 (가입 직후 등 최신 데이터가 필요할 때)
export const invalidateChurchDirectoryCache = () => {
    cachePromise = null;
};

// 신규 교회 1건을 디렉토리에 추가 (교회 관리자 가입 시 호출)
export const addChurchToDirectory = async ({ id, name }) => {
    await DIRECTORY_DOC().set({
        churches: firebase.firestore.FieldValue.arrayUnion({ id, name }),
        updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
    }, { merge: true });
    invalidateChurchDirectoryCache();
};

// 기존 교회 1건의 디렉토리 항목을 갱신 (이름/입장코드/숨김 상태 변경 시 호출).
// arrayUnion은 객체 전체가 일치해야 중복 제거가 되므로, 값이 바뀌는 갱신에는
// 전체 배열을 읽어 해당 id 항목만 교체하는 방식을 쓴다.
// hidden 인자를 넘기지 않으면 기존 항목의 hidden 상태를 그대로 보존한다
// (예: 입장코드만 바꾸는 ChurchAdminView 호출은 숨김 여부에 영향을 주지 않아야 함).
export const syncChurchDirectoryEntry = async ({ id, name, hidden }) => {
    const ref = DIRECTORY_DOC();
    const doc = await ref.get();
    // 다른 항목에 구버전 codeHash가 남아 있어도 현재 앱의 부분 갱신이 되살리지 않게 한다.
    const churches = sanitizeDirectoryChurches(doc.exists ? (doc.data().churches || []) : []);
    const idx = churches.findIndex(c => c.id === id);
    const resolvedHidden = hidden !== undefined ? !!hidden : !!churches[idx]?.hidden;
    const entry = { id, name };
    if (resolvedHidden) entry.hidden = true;
    if (idx === -1) churches.push(entry);
    else churches[idx] = entry;
    await ref.set({
        churches,
        updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
    }, { merge: true });
    invalidateChurchDirectoryCache();
};

// 교회 삭제(soft delete) 시 디렉토리에서 제거
export const removeChurchFromDirectory = async (id) => {
    const ref = DIRECTORY_DOC();
    const doc = await ref.get();
    if (!doc.exists) return;
    const churches = sanitizeDirectoryChurches(doc.data().churches || []).filter(c => c.id !== id);
    await ref.set({
        churches,
        updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
    }, { merge: true });
    invalidateChurchDirectoryCache();
};

// 전체 churches 컬렉션을 스캔해 공개 디렉토리를 재작성 (백필/복구용).
// 입장코드 해시는 더 이상 공개 디렉토리에 쓰지 않는다.
export const rebuildChurchDirectory = async () => {
    const snap = await db.collection('churches').get();
    const churches = (await Promise.all(
        snap.docs
            .map(d => ({ id: d.id, ...d.data() }))
            // hiddenFromDirectory인 교회(테스트 교회 등)도 디렉토리 항목 자체는 유지한다.
            // 그래야 초대 링크(?church=id)·가입 코드 검증이 계속 동작한다.
            // 검색 노출만 막고 싶다면 hidden 플래그로 표시하고, 소비자 쪽(검색 결과 등)에서 걸러낸다.
            .filter(c => !c.isDeleted && c.id !== UNAFFILIATED_CHURCH_ID)
            .map(c => ({
                id: c.id,
                name: c.name || '',
                ...(c.hiddenFromDirectory ? { hidden: true } : {}),
            }))
    )).sort((a, b) => (a.name || '').localeCompare(b.name || '', 'ko-KR'));

    await DIRECTORY_DOC().set({
        churches,
        updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
    });
    invalidateChurchDirectoryCache();
    return churches.length;
};

const validCodeHash = value => (
    typeof value === 'string' && /^[0-9a-f]{64}$/i.test(value.trim())
        ? value.trim().toLowerCase()
        : ''
);

const sanitizeDirectoryChurches = churches => {
    const seen = new Set();
    return (Array.isArray(churches) ? churches : [])
        .filter(entry => {
            const id = typeof entry?.id === 'string' ? entry.id : '';
            if (!id || id === UNAFFILIATED_CHURCH_ID || seen.has(id)) return false;
            seen.add(id);
            return true;
        })
        .map(entry => ({
            id: entry.id,
            name: typeof entry.name === 'string' ? entry.name : '',
            ...(entry.hidden === true ? { hidden: true } : {}),
        }));
};

// 기존 공개 교회 문서와 공개 디렉토리에 남은 입장코드 정보를 private/access로 옮긴다.
// 기본값은 쓰기 없는 사전점검이다. 실제 실행에서도 교회별 private 백필과 공개 필드 삭제를
// 같은 batch에 넣고, 모든 교회 batch가 성공한 뒤에만 공개 디렉토리를 마지막으로 정리한다.
// Firestore batch 상한을 지키기 위해 200개 교회씩 처리하며, 재실행해도 같은 결과가 난다.
export const migrateChurchAccessSecrets = async ({ dryRun = true, onProgress } = {}) => {
    const [churchSnap, directorySnap] = await Promise.all([
        db.collection('churches').get(),
        DIRECTORY_DOC().get(),
    ]);
    const churchDocs = churchSnap.docs.filter(doc => doc.id !== UNAFFILIATED_CHURCH_ID);
    const cleanupOnlyChurchDocs = churchSnap.docs.filter(doc => doc.id === UNAFFILIATED_CHURCH_ID);
    const originalDirectory = directorySnap.exists ? directorySnap.data().churches : [];
    const directoryEntries = Array.isArray(originalDirectory) ? originalDirectory : [];
    // 일부 초기 데이터는 공개 디렉토리에만 codeHash가 남아 있다. 공개 배열을
    // 정리하기 전에 원본 해시를 따로 보존해 private/access 백필에 사용한다.
    const directoryHashesByChurchId = new Map();
    directoryEntries.forEach(entry => {
        const id = typeof entry?.id === 'string' ? entry.id : '';
        const codeHash = validCodeHash(entry?.codeHash);
        if (id && codeHash && !directoryHashesByChurchId.has(id)) {
            directoryHashesByChurchId.set(id, codeHash);
        }
    });
    const sanitizedDirectory = sanitizeDirectoryChurches(originalDirectory);
    const knownChurchIds = new Set(churchSnap.docs.map(doc => doc.id));
    const directoryCounts = new Map();
    const directoryNames = new Map();
    directoryEntries.forEach(entry => {
        const id = typeof entry?.id === 'string' ? entry.id : '';
        if (!id) return;
        directoryCounts.set(id, (directoryCounts.get(id) || 0) + 1);
        if (!directoryNames.has(id)) {
            directoryNames.set(id, typeof entry.name === 'string' ? entry.name : '');
        }
    });
    const duplicates = Array.from(directoryCounts.entries())
        .filter(([, count]) => count > 1)
        .map(([id, count]) => ({ id, name: directoryNames.get(id) || id, count }));
    const orphans = Array.from(directoryCounts.keys())
        .filter(id => !knownChurchIds.has(id))
        .map(id => ({ id, name: directoryNames.get(id) || id }));
    const records = [];
    const missing = [];
    const sourceCounts = {
        privateAccess: 0,
        publicChurchHash: 0,
        directoryHash: 0,
        publicChurchCode: 0,
        legacyPublicCode: 0,
        missing: 0,
    };

    for (let offset = 0; offset < churchDocs.length; offset += 25) {
        const chunk = churchDocs.slice(offset, offset + 25);
        const accessDocs = await Promise.all(chunk.map(doc => (
            doc.ref.collection('private').doc('access').get()
        )));
        for (let index = 0; index < chunk.length; index += 1) {
            const churchDoc = chunk[index];
            const church = churchDoc.data() || {};
            const accessHash = validCodeHash(accessDocs[index].exists
                ? accessDocs[index].data().codeHash
                : '');
            const publicHash = validCodeHash(church.churchCodeHash);
            const directoryHash = directoryHashesByChurchId.get(churchDoc.id) || '';
            const publicCode = normalizeChurchEntryCode(church.churchCode);
            const legacyCode = normalizeChurchEntryCode(church.code);
            let source = 'missing';
            let codeHash = '';
            if (accessHash) {
                source = 'privateAccess';
                codeHash = accessHash;
            } else if (publicHash) {
                source = 'publicChurchHash';
                codeHash = publicHash;
            } else if (directoryHash) {
                source = 'directoryHash';
                codeHash = directoryHash;
            } else if (publicCode) {
                source = 'publicChurchCode';
                codeHash = await sha256(publicCode);
            } else if (legacyCode) {
                source = 'legacyPublicCode';
                codeHash = await sha256(legacyCode);
            }
            sourceCounts[source] += 1;
            if (!codeHash) {
                missing.push({ id: churchDoc.id, name: church.name || churchDoc.id });
            }
            records.push({ churchDoc, codeHash, source });
        }
        onProgress?.({
            done: Math.min(offset + chunk.length, churchDocs.length),
            total: churchDocs.length,
            phase: 'scan',
        });
    }

    const alreadyPrivate = sourceCounts.privateAccess;
    const migrated = churchDocs.length - alreadyPrivate - sourceCounts.missing;
    const report = {
        dryRun,
        scanned: churchDocs.length,
        migrated,
        alreadyPrivate,
        sourceCounts,
        missing,
        orphans,
        duplicates,
        directoryCount: sanitizedDirectory.length,
        cleanupOnly: cleanupOnlyChurchDocs.length,
    };
    if (dryRun) return report;

    cleanupOnlyChurchDocs.forEach(churchDoc => {
        records.push({ churchDoc, codeHash: '', source: 'cleanupOnly' });
    });

    const batchSize = 200;
    for (let offset = 0; offset < records.length; offset += batchSize) {
        const chunk = records.slice(offset, offset + batchSize);
        await db.runTransaction(async transaction => {
            // 코드 변경과 경합하면 private/access 읽기 버전이 바뀌어 transaction이
            // 재시도된다. 이미 유효한 private 해시는 절대 과거 스캔 값으로 덮지 않는다.
            const accessReads = chunk
                .filter(record => record.codeHash)
                .map(record => ({
                    record,
                    ref: record.churchDoc.ref.collection('private').doc('access'),
                }));
            const latestAccessDocs = await Promise.all(
                accessReads.map(({ ref }) => transaction.get(ref))
            );
            const latestAccessByChurchId = new Map(
                accessReads.map(({ record }, index) => [record.churchDoc.id, latestAccessDocs[index]])
            );
            const now = firebase.firestore.FieldValue.serverTimestamp();
            chunk.forEach(({ churchDoc, codeHash }) => {
                const latestAccess = latestAccessByChurchId.get(churchDoc.id);
                const latestHash = validCodeHash(latestAccess?.exists ? latestAccess.data().codeHash : '');
                if (codeHash && !latestHash) {
                    transaction.set(churchDoc.ref.collection('private').doc('access'), {
                        codeHash,
                        updatedAt: now,
                    }, { merge: true });
                }
                transaction.update(churchDoc.ref, {
                    churchCode: firebase.firestore.FieldValue.delete(),
                    churchCodeHash: firebase.firestore.FieldValue.delete(),
                    code: firebase.firestore.FieldValue.delete(),
                    updatedAt: now,
                });
            });
        });
        onProgress?.({
            done: Math.min(offset + batchSize, records.length),
            total: records.length,
            phase: 'commit',
        });
    }
    // 디렉토리 정리는 모든 교회의 private 백필/공개 필드 삭제가 성공한 뒤에만 한다.
    // 최초 스캔 뒤 추가·변경된 항목을 덮지 않도록 마지막 순간의 문서를 다시 읽는다.
    await db.runTransaction(async transaction => {
        const latestDirectorySnap = await transaction.get(DIRECTORY_DOC());
        const latestDirectory = latestDirectorySnap.exists ? latestDirectorySnap.data().churches : [];
        transaction.set(DIRECTORY_DOC(), {
            churches: sanitizeDirectoryChurches(latestDirectory),
            updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
        }, { merge: true });
    });
    onProgress?.({ done: records.length, total: records.length, phase: 'directory' });
    invalidateChurchDirectoryCache();
    return report;
};
