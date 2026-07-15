export const DAILY_VIDEO_CLIENT_TTL_MS = 45 * 60 * 1000;
export const DAILY_VIDEO_RETRY_DELAYS_MS = [2, 5, 15, 30].map(minutes => minutes * 60 * 1000);
export const DAILY_VIDEO_RETRY_IDLE_MS = 60 * 60 * 1000;

const DAILY_VIDEO_RETRY_STORAGE_PREFIX = 'b114_daily_video_retry_v1:';
const retryNotBeforeByDate = new Map();

const isRecord = value => Boolean(value) && typeof value === 'object' && !Array.isArray(value);

const timestampMs = value => {
    if (value instanceof Date) return Number.isFinite(value.getTime()) ? value.getTime() : null;
    if (typeof value === 'number') return Number.isFinite(value) ? value : null;
    if (typeof value === 'string') {
        const parsed = Date.parse(value);
        return Number.isFinite(parsed) ? parsed : null;
    }
    if (!isRecord(value)) return null;
    try {
        if (typeof value.toMillis === 'function') {
            const parsed = value.toMillis();
            return Number.isFinite(parsed) ? parsed : null;
        }
        if (typeof value.toDate === 'function') {
            const parsed = value.toDate()?.getTime?.();
            return Number.isFinite(parsed) ? parsed : null;
        }
    } catch {
        return null;
    }
    const seconds = Number(value.seconds ?? value._seconds);
    const nanoseconds = Number(value.nanoseconds ?? value._nanoseconds ?? 0);
    return Number.isFinite(seconds) && Number.isFinite(nanoseconds)
        ? seconds * 1000 + Math.floor(nanoseconds / 1_000_000)
        : null;
};

const hasUrl = entry => isRecord(entry) && typeof entry.url === 'string' && entry.url.trim().length > 0;

// 오래된 클라이언트가 남긴 자동 문서의 과거 영상은 다시 노출하지 않는다.
// 수동 문서는 관리자의 명시적 선택이므로 matchedDate 표식 없이 그대로 사용한다.
export const getSafeCachedDailyVideo = value => {
    if (!isRecord(value)) return null;
    const isAuto = value.autoFilled === true;
    const adult = hasUrl(value.adult) && (!isAuto || value.adult.matchedDate === true)
        ? value.adult
        : null;
    const kids = hasUrl(value.kids) && (!isAuto || value.kids.matchedDate === true)
        ? value.kids
        : null;
    if (!adult && !kids) return null;
    return { ...value, adult, kids, autoFilled: isAuto };
};

export const getDailyVideoDisplaySignature = value => {
    const safe = getSafeCachedDailyVideo(value);
    const entry = item => item ? {
        url: item.url,
        chapters: item.chapters,
        title: item.title,
        publishedAt: item.publishedAt,
        matchedDate: item.matchedDate,
    } : null;
    return JSON.stringify(safe ? {
        adult: entry(safe.adult),
        kids: entry(safe.kids),
        autoFilled: safe.autoFilled,
    } : null);
};

export const shouldDiscardDailyVideoResolveResult = ({
    requestSnapshotSignature,
    currentSnapshotSignature,
    pending,
    resultVideo,
    latestVideo,
    latestRefreshDue,
}) => {
    if (requestSnapshotSignature === currentSnapshotSignature) return false;
    // 자체 fill/refresh write는 HTTP보다 snapshot을 먼저 바꿀 수 있다. 현재 저장
    // payload가 응답과 동일하고 아직 pending인 경우 backoff를 살린다. 완료 응답은
    // 최신 snapshot의 TTL도 준비된 경우만 살려 metadata-only 관리자 변경을 놓치지 않는다.
    if (getDailyVideoDisplaySignature(resultVideo) !== getDailyVideoDisplaySignature(latestVideo)) {
        return true;
    }
    return pending !== true && latestRefreshDue === true;
};

export const getDailyVideoClientRefreshDelay = (value, nowMs = Date.now()) => {
    if (!Number.isFinite(nowMs)) throw new TypeError('INVALID_NOW');
    if (!isRecord(value)) return 0;
    const refreshedAt = timestampMs(value.chaptersRefreshedAt);
    if (refreshedAt === null) return 0;
    const updatedAt = timestampMs(value.updatedAt);
    if (updatedAt !== null && updatedAt <= nowMs && updatedAt > refreshedAt) return 0;
    let dueAt = refreshedAt + DAILY_VIDEO_CLIENT_TTL_MS;
    if (updatedAt !== null && updatedAt > nowMs && updatedAt > refreshedAt) {
        dueAt = Math.min(dueAt, updatedAt);
    }
    return Math.max(0, dueAt - nowMs);
};

export const isDailyVideoClientRefreshDue = (value, nowMs = Date.now()) =>
    getDailyVideoClientRefreshDelay(value, nowMs) === 0;

export const shouldReopenDailyVideoAfterSnapshot = ({
    settledByResponse,
    settledResponseSnapshotSignature,
    currentSnapshotSignature,
    settledResponseDisplaySignature,
    latestStoredVideo,
    nowMs = Date.now(),
}) => {
    if (!settledByResponse) return true;
    if (settledResponseSnapshotSignature === currentSnapshotSignature) return false;
    const cached = getSafeCachedDailyVideo(latestStoredVideo);
    const sameDisplay = getDailyVideoDisplaySignature(cached)
        === settledResponseDisplaySignature;
    const isFreshOneModeAuto = cached?.autoFilled === true
        && (!cached.adult || !cached.kids)
        && !isDailyVideoClientRefreshDue(latestStoredVideo, nowMs);
    return !(sameDisplay && isFreshOneModeAuto);
};

export const shouldResolveDailyVideo = (value, nowMs = Date.now()) => {
    const cached = getSafeCachedDailyVideo(value);
    if (!cached) return true;
    // 설정 문서를 더는 읽지 않으므로 자동 문서에 한 모드라도 비어 있으면 서버가
    // 실제 설정 모드를 확인하게 한다. 한 모드만 설정된 경우 서버는 즉시 완료 응답한다.
    if (cached.autoFilled && (!cached.adult || !cached.kids)) return true;
    return isDailyVideoClientRefreshDue(value, nowMs);
};

export const selectDailyVideoDisplay = (cached, result) => {
    let selected = null;
    for (const candidate of [result?.transient, result?.video, cached]) {
        const safe = getSafeCachedDailyVideo(candidate);
        if (!safe) continue;
        if (!selected) {
            selected = { ...safe };
            continue;
        }
        // 수동 문서의 null 모드는 관리자 의도다. 이전 자동 transient와 섞어
        // 비워 둔 모드를 되살리지 않고, 같은 authority끼리만 부분 병합한다.
        if (selected.autoFilled !== safe.autoFilled) continue;
        // pending 응답은 서버가 현재까지 확인한 모드만 담을 수 있다. 새 응답을
        // 우선하되 아직 포함되지 않은 모드는 직전 안전 표시값으로 보존한다.
        if (!selected.adult && safe.adult) selected.adult = safe.adult;
        if (!selected.kids && safe.kids) selected.kids = safe.kids;
    }
    return selected;
};

export const getDailyVideoRetryDelay = (retryIndex, serverRetryAfterMs = 0) => {
    const safeIndex = Number.isSafeInteger(retryIndex) && retryIndex >= 0 ? retryIndex : 0;
    const localDelay = DAILY_VIDEO_RETRY_DELAYS_MS[safeIndex] ?? DAILY_VIDEO_RETRY_IDLE_MS;
    const serverDelay = Number.isSafeInteger(serverRetryAfterMs) && serverRetryAfterMs > 0
        ? serverRetryAfterMs
        : 0;
    return Math.max(localDelay, serverDelay);
};

const isServiceDate = value => /^\d{4}-\d{2}-\d{2}$/.test(value || '');

const resolveRetryStorage = storage => {
    if (storage !== undefined) return storage;
    try {
        return globalThis.sessionStorage;
    } catch {
        return null;
    }
};

const retryStorageKey = serviceDate => `${DAILY_VIDEO_RETRY_STORAGE_PREFIX}${serviceDate}`;

const removeStoredRetry = (serviceDate, storage) => {
    try {
        storage?.removeItem?.(retryStorageKey(serviceDate));
    } catch {
        // Safari 사생활 보호 모드처럼 sessionStorage 접근이 막혀도 메모리 보존은 유지한다.
    }
};

// 서버가 준 retryAfterMs는 날짜별 최소 재호출 시각이다. effect·uid·카드 재마운트를
// 넘어 유지해 화면 전환만으로 lease/backoff를 앞당길 수 없게 한다.
export const getDailyVideoRetryNotBefore = (
    serviceDate,
    nowMs = Date.now(),
    storage,
) => {
    if (!isServiceDate(serviceDate) || !Number.isFinite(nowMs)) return 0;
    const resolvedStorage = resolveRetryStorage(storage);
    let stored = 0;
    try {
        const parsed = Number(resolvedStorage?.getItem?.(retryStorageKey(serviceDate)));
        if (Number.isSafeInteger(parsed) && parsed > 0) stored = parsed;
    } catch {
        stored = 0;
    }
    const notBefore = Math.max(retryNotBeforeByDate.get(serviceDate) || 0, stored);
    if (!Number.isSafeInteger(notBefore) || notBefore <= nowMs) {
        retryNotBeforeByDate.delete(serviceDate);
        removeStoredRetry(serviceDate, resolvedStorage);
        return 0;
    }
    retryNotBeforeByDate.set(serviceDate, notBefore);
    return notBefore;
};

export const recordDailyVideoRetryNotBefore = (
    serviceDate,
    retryAfterMs,
    nowMs = Date.now(),
    storage,
) => {
    if (!isServiceDate(serviceDate)
        || !Number.isSafeInteger(retryAfterMs)
        || retryAfterMs <= 0
        || !Number.isFinite(nowMs)) return 0;
    const resolvedStorage = resolveRetryStorage(storage);
    const candidate = nowMs + retryAfterMs;
    if (!Number.isSafeInteger(candidate)) return 0;
    const notBefore = Math.max(
        getDailyVideoRetryNotBefore(serviceDate, nowMs, resolvedStorage),
        candidate,
    );
    retryNotBeforeByDate.set(serviceDate, notBefore);
    try {
        resolvedStorage?.setItem?.(retryStorageKey(serviceDate), String(notBefore));
    } catch {
        // 메모리 맵만으로도 같은 페이지의 재마운트/uid 전환은 보호한다.
    }
    return notBefore;
};

export const clearDailyVideoRetryNotBefore = (serviceDate, storage) => {
    if (!isServiceDate(serviceDate)) return;
    retryNotBeforeByDate.delete(serviceDate);
    removeStoredRetry(serviceDate, resolveRetryStorage(storage));
};
