import { db, firebase } from './firebase';
import { UNAFFILIATED_CHURCH_ID } from '../data/constants';
import { sha256 } from './crypto';

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
    const churches = doc.exists ? (doc.data().churches || []) : [];
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
    const churches = (doc.data().churches || []).filter(c => c.id !== id);
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

const sanitizeDirectoryChurches = churches => (
    (Array.isArray(churches) ? churches : [])
        .filter(entry => entry && typeof entry.id === 'string' && entry.id)
        .map(entry => ({
            id: entry.id,
            name: typeof entry.name === 'string' ? entry.name : '',
            ...(entry.hidden === true ? { hidden: true } : {}),
        }))
);

// 기존 공개 교회 문서와 공개 디렉토리에 남은 입장코드 정보를 private/access로 옮긴다.
// 교회별 private 백필과 공개 필드 삭제는 같은 batch에 넣어 둘 중 하나만 반영되지 않게 한다.
// Firestore batch 상한을 지키기 위해 200개 교회씩 처리하며, 재실행해도 같은 결과가 난다.
export const migrateChurchAccessSecrets = async ({ onProgress } = {}) => {
    const [churchSnap, directorySnap] = await Promise.all([
        db.collection('churches').get(),
        DIRECTORY_DOC().get(),
    ]);
    const churchDocs = churchSnap.docs.filter(doc => doc.id !== UNAFFILIATED_CHURCH_ID);
    const originalDirectory = directorySnap.exists ? directorySnap.data().churches : [];
    // 일부 초기 데이터는 공개 디렉토리에만 codeHash가 남아 있다. 공개 배열을
    // 정리하기 전에 원본 해시를 따로 보존해 private/access 백필에 사용한다.
    const directoryHashesByChurchId = new Map(
        (Array.isArray(originalDirectory) ? originalDirectory : [])
            .map(entry => [entry?.id, validCodeHash(entry?.codeHash)])
            .filter(([id, codeHash]) => typeof id === 'string' && id && codeHash)
    );
    const sanitizedDirectory = sanitizeDirectoryChurches(originalDirectory);
    const records = [];
    const missing = [];
    let alreadyPrivate = 0;
    let migrated = 0;

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
            const plainCode = typeof church.churchCode === 'string' ? church.churchCode.trim() : '';
            const codeHash = accessHash || publicHash || directoryHash || (plainCode ? await sha256(plainCode) : '');
            if (accessHash) alreadyPrivate += 1;
            else if (codeHash) migrated += 1;
            else {
                missing.push({ id: churchDoc.id, name: church.name || churchDoc.id });
            }
            records.push({ churchDoc, codeHash });
        }
        onProgress?.({ done: Math.min(offset + chunk.length, churchDocs.length), total: churchDocs.length });
    }

    const batchSize = 200;
    if (records.length === 0) {
        await DIRECTORY_DOC().set({
            churches: sanitizedDirectory,
            updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
        }, { merge: true });
    }
    for (let offset = 0; offset < records.length; offset += batchSize) {
        const batch = db.batch();
        const now = firebase.firestore.FieldValue.serverTimestamp();
        // 첫 batch에서 공개 디렉토리의 모든 codeHash를 먼저 제거한다.
        if (offset === 0) {
            batch.set(DIRECTORY_DOC(), {
                churches: sanitizedDirectory,
                updatedAt: now,
            }, { merge: true });
        }
        records.slice(offset, offset + batchSize).forEach(({ churchDoc, codeHash }) => {
            if (codeHash) {
                batch.set(churchDoc.ref.collection('private').doc('access'), {
                    codeHash,
                    updatedAt: now,
                }, { merge: true });
            }
            batch.update(churchDoc.ref, {
                churchCode: firebase.firestore.FieldValue.delete(),
                churchCodeHash: firebase.firestore.FieldValue.delete(),
                updatedAt: now,
            });
        });
        await batch.commit();
        onProgress?.({
            done: Math.min(offset + batchSize, records.length),
            total: records.length,
            committing: true,
        });
    }
    invalidateChurchDirectoryCache();
    return {
        scanned: churchDocs.length,
        migrated,
        alreadyPrivate,
        missing,
        directoryCount: sanitizedDirectory.length,
    };
};
