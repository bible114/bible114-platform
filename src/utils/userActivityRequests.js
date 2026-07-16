import { createRequestId } from './platformApi.js';

const STORAGE_PREFIX = 'b114_activity_request_v1:';
const requestFallback = new Map();
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SAFE_ID_PATTERN = /^[A-Za-z0-9_-]{1,128}$/;

const storageOrNull = storage => {
    if (storage !== undefined) return storage;
    try {
        return globalThis.sessionStorage || null;
    } catch {
        return null;
    }
};

const safeUid = value => {
    const normalized = typeof value === 'string' ? value.trim() : '';
    return normalized && normalized.length <= 128 && !/[\u0000-\u001f\u007f]/.test(normalized)
        ? normalized
        : null;
};

const activityKey = parts => `${STORAGE_PREFIX}${parts.map(value => encodeURIComponent(String(value))).join(':')}`;

const hasExactKeys = (value, keys) => Boolean(value)
    && typeof value === 'object'
    && !Array.isArray(value)
    && Object.keys(value).length === keys.length
    && Object.keys(value).every(key => keys.includes(key));

const readStored = (key, storage) => {
    const fallback = requestFallback.get(key);
    if (fallback) return fallback;
    const target = storageOrNull(storage);
    if (!target) return null;
    try {
        const raw = target.getItem(key);
        if (!raw) return null;
        const parsed = JSON.parse(raw);
        requestFallback.set(key, parsed);
        return parsed;
    } catch {
        return null;
    }
};

const writeStored = (key, value, storage) => {
    requestFallback.set(key, value);
    const target = storageOrNull(storage);
    if (!target) return;
    try {
        target.setItem(key, JSON.stringify(value));
    } catch {
        // Safari 사생활 보호 모드처럼 sessionStorage가 막혀도 현재 탭 메모리는 유지한다.
    }
};

const removeStored = (key, expectedRequestId, storage) => {
    const fallback = requestFallback.get(key);
    if (!expectedRequestId || fallback?.requestId === expectedRequestId) requestFallback.delete(key);
    const target = storageOrNull(storage);
    if (!target) return;
    try {
        const stored = JSON.parse(target.getItem(key) || 'null');
        if (!expectedRequestId || stored?.requestId === expectedRequestId) target.removeItem(key);
    } catch {
        // 저장소 오류가 나도 메모리 요청 정리는 이미 끝났다.
    }
};

const validReadPayload = payload => hasExactKeys(payload, ['cycle', 'day', 'readingEpoch'])
    && Number.isSafeInteger(payload.cycle) && payload.cycle >= 1
    && Number.isSafeInteger(payload.day) && payload.day >= 1 && payload.day <= 365
    && Number.isSafeInteger(payload.readingEpoch) && payload.readingEpoch >= 0;

const validRestartPayload = payload => validReadPayload(payload);

const validQuizProgressKey = value => {
    const match = typeof value === 'string'
        ? /^(?:e([1-9]\d*)_)?r([1-9]\d*)_d(?:([1-9]\d?|[12]\d{2}|3[0-5]\d|36[0-5]))$/.exec(value)
        : null;
    return Boolean(match)
        && (!match[1] || Number.isSafeInteger(Number(match[1])))
        && Number.isSafeInteger(Number(match[2]));
};

const validQuizPayload = payload => Boolean(payload)
    && validQuizProgressKey(payload.progressKey)
    && typeof payload.quizKey === 'string' && SAFE_ID_PATTERN.test(payload.quizKey)
    && Number.isInteger(payload.selectedIndex) && payload.selectedIndex >= 0 && payload.selectedIndex <= 3
    && [1, 2].includes(payload.attemptSlot);

const validQuizSkipPayload = payload => Boolean(payload)
    && validQuizProgressKey(payload.progressKey)
    && typeof payload.quizKey === 'string' && SAFE_ID_PATTERN.test(payload.quizKey);

const validStoredRequest = (stored, type) => Boolean(stored)
    && stored.type === type
    && typeof stored.requestId === 'string'
    && UUID_PATTERN.test(stored.requestId)
    && (type === 'read'
        ? validReadPayload(stored.payload)
        : type === 'restart'
            ? validRestartPayload(stored.payload)
            : type === 'quizSkip'
                ? validQuizSkipPayload(stored.payload)
                : validQuizPayload(stored.payload));

const getOrCreate = ({ key, type, payload, storage, requestIdFactory }) => {
    const existing = readStored(key, storage);
    if (validStoredRequest(existing, type)) return { key, requestId: existing.requestId, payload: existing.payload };
    removeStored(key, null, storage);
    const requestId = requestIdFactory();
    if (!UUID_PATTERN.test(requestId)) throw new Error('INVALID_ACTIVITY_REQUEST_ID');
    const next = { type, requestId, payload };
    writeStored(key, next, storage);
    return { key, requestId, payload };
};

export const getOrCreateReadActivityRequest = (
    { uid, cycle, day, readingEpoch },
    { storage, requestIdFactory = createRequestId } = {},
) => {
    const normalizedUid = safeUid(uid);
    const payload = {
        cycle: Number(cycle),
        day: Number(day),
        readingEpoch: Number(readingEpoch),
    };
    if (!normalizedUid || !validReadPayload(payload)) throw new Error('INVALID_READ_ACTIVITY_REQUEST');
    return getOrCreate({
        key: activityKey(['read', normalizedUid, payload.cycle, payload.day, payload.readingEpoch]),
        type: 'read', payload, storage, requestIdFactory,
    });
};

export const getOrCreateRestartActivityRequest = (
    { uid, cycle, day, readingEpoch },
    { storage, requestIdFactory = createRequestId } = {},
) => {
    const normalizedUid = safeUid(uid);
    const payload = {
        cycle: Number(cycle),
        day: Number(day),
        readingEpoch: Number(readingEpoch),
    };
    if (!normalizedUid || !validRestartPayload(payload)) {
        throw new Error('INVALID_RESTART_ACTIVITY_REQUEST');
    }
    return getOrCreate({
        // 결과가 유실된 뒤 사용자 상태가 다른 탭/새 로드로 갱신돼도 먼저 보낸
        // 요청을 복구해야 한다. UID마다 미결 restart를 하나만 두고, 결정적인
        // 응답 전에는 저장된 payload/UUID를 새 현재 위치로 교체하지 않는다.
        key: activityKey(['restart', normalizedUid]),
        type: 'restart', payload, storage, requestIdFactory,
    });
};

export const getOrCreateQuizActivityRequest = (
    { uid, progressKey, quizKey, attemptSlot, selectedIndex },
    { storage, requestIdFactory = createRequestId } = {},
) => {
    const normalizedUid = safeUid(uid);
    const normalizedAttemptSlot = Number(attemptSlot);
    const payload = {
        progressKey: typeof progressKey === 'string' ? progressKey.trim() : '',
        quizKey: typeof quizKey === 'string' ? quizKey.trim() : '',
        selectedIndex: Number(selectedIndex),
        attemptSlot: normalizedAttemptSlot,
    };
    if (!normalizedUid || !Number.isInteger(normalizedAttemptSlot)
        || normalizedAttemptSlot < 1 || normalizedAttemptSlot > 2 || !validQuizPayload(payload)) {
        throw new Error('INVALID_QUIZ_ACTIVITY_REQUEST');
    }
    return getOrCreate({
        // selectedIndex는 의도적으로 key에서 제외한다. 응답 유실 뒤 답을 바꿔도
        // 먼저 저장된 payload와 requestId를 재전송해 같은 시도만 복구한다.
        key: activityKey(['quiz', normalizedUid, payload.progressKey, payload.quizKey, normalizedAttemptSlot]),
        type: 'quiz', payload, storage, requestIdFactory,
    });
};

export const getOrCreateQuizSkipActivityRequest = (
    { uid, progressKey, quizKey },
    { storage, requestIdFactory = createRequestId } = {},
) => {
    const normalizedUid = safeUid(uid);
    const payload = {
        progressKey: typeof progressKey === 'string' ? progressKey.trim() : '',
        quizKey: typeof quizKey === 'string' ? quizKey.trim() : '',
    };
    if (!normalizedUid || !validQuizSkipPayload(payload)) {
        throw new Error('INVALID_QUIZ_SKIP_ACTIVITY_REQUEST');
    }
    return getOrCreate({
        key: activityKey(['quizSkip', normalizedUid, payload.progressKey, payload.quizKey]),
        type: 'quizSkip', payload, storage, requestIdFactory,
    });
};

export const clearActivityRequest = ({ key, requestId }, { storage } = {}) => {
    if (typeof key !== 'string' || !key.startsWith(STORAGE_PREFIX)) return false;
    removeStored(key, requestId, storage);
    return true;
};

export const __resetActivityRequestFallbackForTests = () => requestFallback.clear();
