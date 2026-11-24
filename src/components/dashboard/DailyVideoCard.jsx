import React, { useEffect, useRef, useState } from 'react';
import { db } from '../../utils/firebase';
import { getVideoDateKST, extractYouTubeId } from '../../utils/helpers';
import { resolveDailyVideo } from '../../utils/platformApi';
import {
    clearDailyVideoRetryNotBefore,
    getDailyVideoClientRefreshDelay,
    getDailyVideoDisplaySignature,
    getDailyVideoRetryDelay,
    getDailyVideoRetryNotBefore,
    getSafeCachedDailyVideo,
    isDailyVideoClientRefreshDue,
    recordDailyVideoRetryNotBefore,
    selectDailyVideoDisplay,
    shouldDiscardDailyVideoResolveResult,
    shouldReopenDailyVideoAfterSnapshot,
    shouldResolveDailyVideo,
} from '../../utils/dailyVideoClient';

const LISTEN_OPTIONS = [
    { mode: 'adult', label: '묵상해설 듣기', emoji: '📖' },
    { mode: 'kids', label: '어린이 묵상해설 듣기', emoji: '🧒' },
];

const AUTO_RETRY_FOCUS_COOLDOWN_MS = 5 * 60 * 1000;
const DAILY_VIDEO_REFRESH_TIMER_MAX_MS = 60 * 60 * 1000;

const dailyVideoTimestampSignature = value => {
    try {
        if (value instanceof Date) return value.getTime();
        if (typeof value?.toMillis === 'function') return value.toMillis();
        if (typeof value?.toDate === 'function') return value.toDate()?.getTime?.() ?? null;
    } catch {
        return null;
    }
    if (typeof value === 'string' || typeof value === 'number') return value;
    const seconds = value?.seconds ?? value?._seconds;
    const nanoseconds = value?.nanoseconds ?? value?._nanoseconds;
    return Number.isFinite(Number(seconds))
        ? `${seconds}:${Number.isFinite(Number(nanoseconds)) ? nanoseconds : 0}`
        : null;
};

const dailyVideoSnapshotSignature = (exists, value) => JSON.stringify({
    exists,
    display: getDailyVideoDisplaySignature(value),
    updatedAt: dailyVideoTimestampSignature(value?.updatedAt),
    chaptersRefreshedAt: dailyVideoTimestampSignature(value?.chaptersRefreshedAt),
});

// 매일 유튜브 영상 카드 — 저장 캐시를 먼저 보여주고, 준비되지 않은 캐시만
// 인증된 platform-api에 맡긴다. 브라우저는 YouTube API 키·설정·daily 쓰기를 하지 않는다.
const DailyVideoCard = ({ currentUser }) => {
    const [video, setVideo] = useState(undefined); // undefined: 로딩중, null: 표시할 영상 없음
    const [mode, setMode] = useState('adult');
    const [playing, setPlaying] = useState(false);
    const [startSec, setStartSec] = useState(0);
    const [dateKey, setDateKey] = useState(getVideoDateKST());
    const carriedResolveRef = useRef(null);

    const applyVideoDoc = (data) => setVideo(data);

    useEffect(() => {
        const recomputeDateKey = () => {
            const next = getVideoDateKST();
            setDateKey(prev => (prev === next ? prev : next));
        };
        const onVisibility = () => {
            if (document.visibilityState === 'visible') recomputeDateKey();
        };
        document.addEventListener('visibilitychange', onVisibility);
        const interval = setInterval(recomputeDateKey, 5 * 60 * 1000);
        return () => {
            document.removeEventListener('visibilitychange', onVisibility);
            clearInterval(interval);
        };
    }, []);

    useEffect(() => {
        let cancelled = false;
        let unsubscribeCache = null;
        let retryTimer = null;
        let refreshTimer = null;
        let retryIndex = 0;
        let retryCallback = null;
        let retryInFlight = false;
        let resolveInFlight = false;
        let retryNotBeforeAt = getDailyVideoRetryNotBefore(dateKey);
        let lastRetryAt = 0;
        let latestCachedVideo = null;
        let latestStoredVideo = null;
        let pendingDisplayVideo = null;
        let serverSettled = false;
        let settledByResponse = false;
        let settledResponseSignature = null;
        let settledResponseSnapshotSignature = null;
        let sawCacheSnapshot = false;
        let latestSnapshotSignature = null;
        if (!db) { setVideo(null); return; }

        const carriedResult = carriedResolveRef.current?.serviceDate === dateKey
            ? carriedResolveRef.current
            : null;
        if (carriedResolveRef.current) carriedResolveRef.current = null;
        const carriedVideo = carriedResult
            ? selectDailyVideoDisplay(null, carriedResult)
            : null;
        pendingDisplayVideo = carriedResult?.pending ? carriedVideo : null;
        serverSettled = Boolean(carriedResult && !carriedResult.pending);
        settledByResponse = serverSettled;
        settledResponseSignature = serverSettled
            ? getDailyVideoDisplaySignature(carriedVideo)
            : null;
        settledResponseSnapshotSignature = null;

        setVideo(carriedResult ? carriedVideo : undefined);
        setPlaying(false);
        setStartSec(0);

        const docRef = db.collection('dailyVideos').doc(dateKey);

        const cancelAutoRetryTimer = () => {
            if (retryTimer) clearTimeout(retryTimer);
            retryTimer = null;
        };

        const cancelRefreshTimer = () => {
            if (refreshTimer) clearTimeout(refreshTimer);
            refreshTimer = null;
        };

        const clearAutoRetry = () => {
            cancelAutoRetryTimer();
            retryCallback = null;
            retryNotBeforeAt = 0;
            retryIndex = 0;
            lastRetryAt = 0;
        };

        const armAutoRetryTimer = (delay) => {
            cancelAutoRetryTimer();
            retryTimer = setTimeout(() => {
                retryTimer = null;
                runAutoRetry();
            }, Math.max(1, delay));
        };

        function scheduleRefreshRecheck(storedVideo) {
            cancelRefreshTimer();
            if (cancelled || !serverSettled || !getSafeCachedDailyVideo(storedVideo)) return;
            const delay = getDailyVideoClientRefreshDelay(storedVideo);
            if (delay <= 0) return;
            refreshTimer = setTimeout(() => {
                refreshTimer = null;
                if (!reopenForRefresh()) scheduleRefreshRecheck(latestStoredVideo);
            }, Math.min(delay + 250, DAILY_VIDEO_REFRESH_TIMER_MAX_MS));
        }

        function reopenForRefresh() {
            if (cancelled
                || !serverSettled
                || resolveInFlight
                || !latestCachedVideo
                || !isDailyVideoClientRefreshDue(latestStoredVideo)) return false;
            cancelRefreshTimer();
            serverSettled = false;
            settledByResponse = false;
            settledResponseSignature = null;
            settledResponseSnapshotSignature = null;
            resolveWhenAllowed(latestCachedVideo);
            return true;
        }

        const runAutoRetry = () => {
            const activeDateKey = getVideoDateKST();
            if (cancelled || retryInFlight || serverSettled || !retryCallback) return;
            if (activeDateKey !== dateKey) {
                setDateKey(activeDateKey);
                return;
            }
            const now = Date.now();
            retryNotBeforeAt = Math.max(
                retryNotBeforeAt,
                getDailyVideoRetryNotBefore(dateKey, now),
            );
            if (now < retryNotBeforeAt) {
                armAutoRetryTimer(retryNotBeforeAt - now);
                return;
            }
            const retry = retryCallback;
            retryInFlight = true;
            lastRetryAt = now;
            Promise.resolve()
                .then(retry)
                .catch(error => console.warn('매일 영상 서버 재시도 실패:', error))
                .finally(() => {
                    retryInFlight = false;
                });
        };

        const scheduleAutoRetry = (retry) => {
            if (cancelled) return;
            retryCallback = retry;
            const now = Date.now();
            retryNotBeforeAt = Math.max(
                retryNotBeforeAt,
                getDailyVideoRetryNotBefore(dateKey, now),
            );
            const serverRemainingMs = Math.max(0, retryNotBeforeAt - now);
            const delay = getDailyVideoRetryDelay(retryIndex, serverRemainingMs);
            retryIndex = Math.min(Number.MAX_SAFE_INTEGER, retryIndex + 1);
            if (!lastRetryAt) lastRetryAt = now;
            armAutoRetryTimer(Math.max(delay, retryNotBeforeAt - now));
        };

        const retryOnReturn = () => {
            const now = Date.now();
            retryNotBeforeAt = Math.max(
                retryNotBeforeAt,
                getDailyVideoRetryNotBefore(dateKey, now),
            );
            if (document.visibilityState === 'hidden') return;
            if (reopenForRefresh()) return;
            if (!retryCallback
                || serverSettled
                || now < retryNotBeforeAt
                || now - lastRetryAt < AUTO_RETRY_FOCUS_COOLDOWN_MS) return;
            // visibilitychange와 focus가 연달아 와도 retryInFlight가 한 번만 허용한다.
            cancelAutoRetryTimer();
            runAutoRetry();
        };

        const resolveFromServer = async (cachedVideo) => {
            if (cancelled || resolveInFlight || serverSettled) return;
            resolveInFlight = true;
            const requestSnapshotSignature = latestSnapshotSignature;
            let reevaluateAfterResponse = false;
            try {
                const result = await resolveDailyVideo();
                if (cancelled) {
                    // 새 effect가 이미 더 긴 최소시각을 기록했을 수 있으므로 pending만
                    // monotonic하게 합치고, 취소된 완료 응답으로 저장값을 지우지 않는다.
                    if (result.pending) {
                        recordDailyVideoRetryNotBefore(
                            result.serviceDate,
                            result.retryAfterMs,
                        );
                    }
                    return;
                }
                if (result.serviceDate !== dateKey) {
                    if (result.pending) {
                        recordDailyVideoRetryNotBefore(
                            result.serviceDate,
                            result.retryAfterMs,
                        );
                    } else {
                        clearDailyVideoRetryNotBefore(result.serviceDate);
                    }
                    carriedResolveRef.current = result;
                    clearAutoRetry();
                    setDateKey(result.serviceDate);
                    return;
                }
                if (shouldDiscardDailyVideoResolveResult({
                    requestSnapshotSignature,
                    currentSnapshotSignature: latestSnapshotSignature,
                    pending: result.pending,
                    resultVideo: result.video,
                    latestVideo: latestCachedVideo,
                    latestRefreshDue: isDailyVideoClientRefreshDue(latestStoredVideo),
                })) {
                    // 요청 중 관찰한 문서가 응답 payload와 다르거나 최신 metadata가 다시
                    // refresh 대상이면 표시·settle·server minimum에 반영하지 않는다.
                    clearAutoRetry();
                    reevaluateAfterResponse = true;
                    return;
                }
                const responseNotBefore = result.pending
                    ? recordDailyVideoRetryNotBefore(
                        result.serviceDate,
                        result.retryAfterMs,
                    )
                    : 0;
                if (!result.pending) {
                    clearDailyVideoRetryNotBefore(result.serviceDate);
                }
                if (serverSettled && result.pending) {
                    clearDailyVideoRetryNotBefore(dateKey);
                    retryNotBeforeAt = 0;
                    return;
                }
                retryNotBeforeAt = Math.max(retryNotBeforeAt, responseNotBefore);

                // partial 응답은 저장 전 최신 모드를 담을 수 있으므로 transient가 우선이다.
                // 완료 응답에 영상이 없으면 서버의 삭제/비활성 상태를 따라 기존 캐시도 비운다.
                const nextVideo = selectDailyVideoDisplay(
                    result.pending
                        ? (pendingDisplayVideo || latestCachedVideo || cachedVideo)
                        : null,
                    result,
                );
                pendingDisplayVideo = result.pending ? nextVideo : null;
                serverSettled = !result.pending;
                settledByResponse = serverSettled;
                settledResponseSignature = serverSettled
                    ? getDailyVideoDisplaySignature(nextVideo)
                    : null;
                settledResponseSnapshotSignature = serverSettled
                    ? latestSnapshotSignature
                    : null;
                if (nextVideo) applyVideoDoc(nextVideo);
                else setVideo(null);

                if (result.pending) {
                    cancelRefreshTimer();
                    scheduleAutoRetry(() => resolveFromServer(
                        pendingDisplayVideo || latestCachedVideo || cachedVideo,
                    ));
                } else {
                    clearAutoRetry();
                    scheduleRefreshRecheck(latestStoredVideo);
                }
            } catch (error) {
                if (cancelled || serverSettled) return;
                const fallbackVideo = pendingDisplayVideo || latestCachedVideo || cachedVideo;
                if (fallbackVideo) applyVideoDoc(fallbackVideo);
                else setVideo(null);
                console.warn('매일 영상 서버 확인 실패:', error);
                scheduleAutoRetry(() => resolveFromServer(
                    pendingDisplayVideo || latestCachedVideo || cachedVideo,
                ));
            } finally {
                resolveInFlight = false;
                if (reevaluateAfterResponse && !cancelled) {
                    resolveWhenAllowed(latestCachedVideo);
                }
            }
        };

        function resolveWhenAllowed(cachedVideo) {
            if (cancelled || serverSettled || resolveInFlight || retryCallback) return;
            const now = Date.now();
            retryNotBeforeAt = Math.max(
                retryNotBeforeAt,
                getDailyVideoRetryNotBefore(dateKey, now),
            );
            if (now < retryNotBeforeAt) {
                scheduleAutoRetry(() => resolveFromServer(
                    pendingDisplayVideo || latestCachedVideo || cachedVideo,
                ));
                return;
            }
            void resolveFromServer(cachedVideo);
        }

        document.addEventListener('visibilitychange', retryOnReturn);
        window.addEventListener('focus', retryOnReturn);

        unsubscribeCache = docRef.onSnapshot(
            { includeMetadataChanges: true },
            doc => {
                if (cancelled) return;
                const isFirstSnapshot = !sawCacheSnapshot;
                sawCacheSnapshot = true;
                const fromCache = doc.metadata?.fromCache === true;
                const storedVideo = doc.exists ? doc.data() : null;
                latestStoredVideo = storedVideo;
                const nextSnapshotSignature = dailyVideoSnapshotSignature(doc.exists, storedVideo);
                if (nextSnapshotSignature !== latestSnapshotSignature) {
                    latestSnapshotSignature = nextSnapshotSignature;
                }
                const cachedVideo = getSafeCachedDailyVideo(storedVideo);
                latestCachedVideo = cachedVideo;
                if (cachedVideo?.autoFilled === false) {
                    // 관리자 수동 문서가 등장하면 이전 자동 transient는 즉시 폐기한다.
                    pendingDisplayVideo = null;
                }

                if (!shouldResolveDailyVideo(storedVideo)) {
                    const displayedVideo = fromCache && pendingDisplayVideo
                        ? selectDailyVideoDisplay(cachedVideo, {
                            transient: pendingDisplayVideo,
                            video: null,
                        })
                        : cachedVideo;
                    if (displayedVideo) applyVideoDoc(displayedVideo);
                    else setVideo(null);
                    if (!fromCache) {
                        pendingDisplayVideo = null;
                        serverSettled = true;
                        settledByResponse = false;
                        settledResponseSignature = null;
                        settledResponseSnapshotSignature = null;
                        clearDailyVideoRetryNotBefore(dateKey);
                        clearAutoRetry();
                        scheduleRefreshRecheck(storedVideo);
                    }
                    return;
                }

                if (!fromCache) {
                    const responseSnapshotChanged = latestSnapshotSignature
                        !== settledResponseSnapshotSignature;
                    const shouldReopen = shouldReopenDailyVideoAfterSnapshot({
                        settledByResponse,
                        settledResponseSnapshotSignature,
                        currentSnapshotSignature: latestSnapshotSignature,
                        settledResponseDisplaySignature: settledResponseSignature,
                        latestStoredVideo: storedVideo,
                    });
                    if (shouldReopen) {
                        cancelRefreshTimer();
                        serverSettled = false;
                        settledByResponse = false;
                        settledResponseSignature = null;
                        settledResponseSnapshotSignature = null;
                    } else if (responseSnapshotChanged) {
                        // HTTP보다 늦게 온 자체 one-mode fill/refresh snapshot을 흡수한다.
                        settledResponseSnapshotSignature = latestSnapshotSignature;
                    }
                    // 자체 write snapshot이 HTTP보다 늦게 오거나 metadata 이벤트가
                    // 반복되어도 fresh one-mode 문서의 TTL 재검사 시각을 잃지 않는다.
                    if (serverSettled && !reopenForRefresh()) {
                        scheduleRefreshRecheck(storedVideo);
                    }
                }

                const displayedVideo = pendingDisplayVideo
                    ? selectDailyVideoDisplay(pendingDisplayVideo, {
                        transient: null,
                        video: cachedVideo,
                    })
                    : (isFirstSnapshot && carriedResult
                        ? selectDailyVideoDisplay(cachedVideo, carriedResult)
                        : cachedVideo);
                if (pendingDisplayVideo) pendingDisplayVideo = displayedVideo;
                if (displayedVideo) applyVideoDoc(displayedVideo);
                else setVideo(null);

                // 로컬 persistence 캐시는 즉시 표시하되 서버 확정·backoff 해제에는 쓰지 않는다.
                if (fromCache) return;
                resolveWhenAllowed(cachedVideo);
            },
            error => {
                if (cancelled) return;
                console.warn('매일 영상 캐시 읽기 실패:', error);
                if (!pendingDisplayVideo && !carriedResult) setVideo(null);
                resolveWhenAllowed(latestCachedVideo);
            },
        );

        return () => {
            cancelled = true;
            clearAutoRetry();
            cancelRefreshTimer();
            if (typeof unsubscribeCache === 'function') unsubscribeCache();
            document.removeEventListener('visibilitychange', retryOnReturn);
            window.removeEventListener('focus', retryOnReturn);
        };
    }, [dateKey, currentUser?.uid]);

    if (video === null) return null;

    if (video === undefined) {
        return (
            <section id="tut-daily-video" className="overflow-hidden rounded-3xl border border-slate-100 bg-white shadow-sm" aria-label="매일성경 묵상해설">
                <div className="bg-gradient-to-br from-indigo-600 to-blue-700 px-5 py-4 text-white">
                    <h2 className="flex items-center gap-2 text-lg font-bold"><span className="text-xl">🎬</span> 매일성경 묵상해설</h2>
                </div>
                <p className="px-5 py-4 text-center text-base font-bold text-slate-500" role="status">오늘 묵상해설을 불러오는 중이에요.</p>
            </section>
        );
    }

    const options = LISTEN_OPTIONS
        .map(option => {
            const entry = video?.[option.mode];
            const videoId = entry?.url ? extractYouTubeId(entry.url) : null;
            return videoId ? { ...option, entry, videoId } : null;
        })
        .filter(Boolean);

    if (options.length === 0) return null;

    const activeOption = playing ? options.find(option => option.mode === mode) : null;

    const handleListen = (option) => {
        const chapters = Array.isArray(option.entry.chapters) ? option.entry.chapters : [];
        const commentary = chapters.find(ch => ch?.label === '해설');
        setStartSec(commentary?.sec > 0 ? commentary.sec : 0);
        setMode(option.mode);
        setPlaying(true);
    };

    const handleStop = () => {
        setPlaying(false);
        setStartSec(0);
    };

    const embedSrc = (videoId, sec) => {
        const base = `https://www.youtube.com/embed/${videoId}?enablejsapi=1&autoplay=1&playsinline=1`;
        return sec ? `${base}&start=${sec}` : base;
    };

    return (
        <section id="tut-daily-video" className="overflow-hidden rounded-3xl border border-slate-100 bg-white shadow-sm" aria-label="매일성경 묵상해설">
            <div className="bg-gradient-to-br from-indigo-600 to-blue-700 px-5 py-4 text-white">
                <h2 className="flex items-center gap-2 text-lg font-bold"><span className="text-xl">🎬</span> 매일성경 묵상해설</h2>
            </div>
            <div className="space-y-3 p-5">
                {options.map(option => (
                    <button
                        key={option.mode}
                        type="button"
                        onClick={() => handleListen(option)}
                        aria-pressed={activeOption?.mode === option.mode}
                        className={`flex min-h-[56px] w-full items-center justify-center gap-2 rounded-2xl px-5 py-4 text-lg font-black transition-all active:scale-95 ${
                            activeOption?.mode === option.mode
                                ? 'bg-indigo-700 text-white shadow-lg'
                                : 'bg-indigo-50 text-indigo-800 hover:bg-indigo-100'
                        }`}
                    >
                        <span className="text-2xl" aria-hidden="true">{option.emoji}</span> {option.label}
                    </button>
                ))}

                {activeOption && (
                    <div className="space-y-3 pt-1">
                        <div className="relative aspect-video w-full overflow-hidden rounded-2xl bg-slate-900">
                            <iframe
                                key={`${activeOption.mode}-${startSec}`}
                                className="absolute inset-0 h-full w-full"
                                src={embedSrc(activeOption.videoId, startSec)}
                                title={activeOption.label}
                                frameBorder="0"
                                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                                allowFullScreen
                            />
                        </div>
                        <button
                            type="button"
                            onClick={handleStop}
                            className="flex min-h-[56px] w-full items-center justify-center rounded-2xl border-2 border-slate-300 bg-white px-5 py-4 text-lg font-black text-slate-700 hover:bg-slate-50"
                        >
                            ⏹ 그만 듣기
                        </button>
                    </div>
                )}
            </div>
        </section>
    );
};

export default DailyVideoCard;
