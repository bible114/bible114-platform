import { db, firebase } from './firebase';
import { sha256 } from './crypto';
import { UNAFFILIATED_CHURCH_ID } from '../data/constants';

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

// settings/churchDirectory: { churches: [{ id, name, codeHash }], updatedAt }
// - 비로그인 로그인 화면에서 교회 목록/코드 검증에 필요한 최소 정보만 공개한다.
// - codeHash를 포함시켜 회원가입 시 Firebase Auth 계정 생성 "전"에
//   클라이언트에서 입장코드를 검증할 수 있게 한다 (churches/{id} 문서 직접 읽기 방지).
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
export const addChurchToDirectory = async ({ id, name, codeHash }) => {
    await DIRECTORY_DOC().set({
        churches: firebase.firestore.FieldValue.arrayUnion({ id, name, codeHash }),
        updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
    }, { merge: true });
    invalidateChurchDirectoryCache();
};

// 기존 교회 1건의 디렉토리 항목을 갱신 (이름/입장코드 변경 시 호출).
// arrayUnion은 객체 전체가 일치해야 중복 제거가 되므로, 값이 바뀌는 갱신에는
// 전체 배열을 읽어 해당 id 항목만 교체하는 방식을 쓴다.
export const syncChurchDirectoryEntry = async ({ id, name, codeHash }) => {
    const ref = DIRECTORY_DOC();
    const doc = await ref.get();
    const churches = doc.exists ? (doc.data().churches || []) : [];
    const idx = churches.findIndex(c => c.id === id);
    const entry = { id, name, codeHash: codeHash ?? churches[idx]?.codeHash ?? null };
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

// 전체 churches 컬렉션을 스캔해 디렉토리를 재작성 (백필/복구용).
// 해싱 도입 이전에 생성된 교회는 churchCodeHash가 없고 평문 churchCode만 있을 수 있어,
// 그런 경우 여기서 즉시 해시를 계산해 채워준다 (레거시 교회 가입 불가 방지).
export const rebuildChurchDirectory = async () => {
    const snap = await db.collection('churches').get();
    const churches = (await Promise.all(
        snap.docs
            .map(d => ({ id: d.id, ...d.data() }))
            .filter(c => !c.isDeleted && c.id !== UNAFFILIATED_CHURCH_ID)
            .map(async c => ({
                id: c.id,
                name: c.name || '',
                codeHash: c.churchCodeHash || (c.churchCode ? await sha256(c.churchCode) : null),
            }))
    )).sort((a, b) => (a.name || '').localeCompare(b.name || '', 'ko-KR'));

    await DIRECTORY_DOC().set({
        churches,
        updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
    });
    invalidateChurchDirectoryCache();
    return churches.length;
};
