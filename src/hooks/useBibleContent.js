import { useState, useCallback, useEffect, useRef } from 'react';
import { db } from '../utils/firebase';
import { GENESIS_1, AUDIO_BASE_URL } from '../data/constants';
import { BIBLE_VERSIONS, PLAN_TYPES } from '../data/bible_options';
import { getActualDay } from '../utils/helpers';
import { getYearCompletedRounds } from '../utils/annualReading.js';
import { getPlanTotalDays } from '../data/schedules';

const CACHE_LOOKUP_TIMEOUT_MS = 8000;
const NEXT_DAY_PREFETCH_DELAY_MS = 700;
// 대한성서공회 RNKSV 장·절 원문으로 새번역 캐시를 교체할 때 기존
// localStorage 본문이 계속 보이지 않도록 읽기 캐시 세대를 분리한다.
const VERSE_CACHE_REVISION = 'rnksv-2001-v1';

const getVerseCacheKeys = (planId, day) => {
    const [planType, version] = (planId || '1year_revised').split('_');
    const cacheKey = `${planType}_${version}_${day}`;
    return {
        cacheKey,
        localCacheKey: `v_${VERSE_CACHE_REVISION}_${cacheKey}`,
    };
};

const readLocalVerse = (localCacheKey) => {
    try {
        const local = localStorage.getItem(localCacheKey);
        return local ? JSON.parse(local) : null;
    } catch {
        return null;
    }
};

const cacheVerseLocally = (localCacheKey, data) => {
    try {
        localStorage.setItem(localCacheKey, JSON.stringify({
            title: data.title,
            text: data.text,
            audioUrl: data.audioUrl || null,
        }));
    } catch {
        // 저장 공간이 부족해도 현재 본문 표시와 다음 서버 조회는 계속 동작한다.
    }
};

const fetchVerseFromCache = async (planId, day) => {
    const { cacheKey, localCacheKey } = getVerseCacheKeys(planId, day);
    const local = readLocalVerse(localCacheKey);
    if (local) return local;

    if (!db) return null;
    try {
        const doc = await db.collection('verses').doc(cacheKey).get();
        if (!doc.exists) return null;
        const data = doc.data();
        cacheVerseLocally(localCacheKey, data);
        return data;
    } catch (e) {
        console.error("캐시 읽기 실패:", e);
        return null;
    }
};

const getVersionName = (planType, version) => {
    const planGroup = BIBLE_VERSIONS[planType];
    const versionInfo = planGroup ? planGroup.find(v => v.id === version) : null;
    return (versionInfo && versionInfo.name) || '선택한 성경';
};

const createMissingContentMessage = (versionName, day) => {
    return [
        '본문을 아직 불러오지 못했습니다.',
        '',
        `${versionName} ${day}일차 본문을 준비하는 중이거나 잠시 연결이 원활하지 않습니다.`,
        '잠시 후 다시 열어보세요.'
    ].join('\n');
};

const withTimeout = (promise, ms, fallback = null) => {
    return Promise.race([
        promise,
        new Promise(resolve => setTimeout(() => resolve(fallback), ms))
    ]);
};

export const useBibleContent = (currentUser) => {
    const contentRequestRef = useRef(0);
    const prefetchCancelRef = useRef(null);
    const [verseData, setVerseData] = useState({
        title: '',
        subtitle: '',
        text: '',
        audioUrl: null,
        error: false,
        loading: false
    });
    const [viewingDay, setViewingDay] = useState(null);

    const cancelScheduledPrefetch = useCallback(() => {
        prefetchCancelRef.current?.();
        prefetchCancelRef.current = null;
    }, []);

    const scheduleNextDayPrefetch = useCallback((planId, nextActualDay) => {
        cancelScheduledPrefetch();
        if (!planId || !Number.isSafeInteger(nextActualDay) || nextActualDay < 1) return;

        let cancelled = false;
        const run = () => {
            if (cancelled) return;
            void withTimeout(
                fetchVerseFromCache(planId, nextActualDay),
                CACHE_LOOKUP_TIMEOUT_MS,
                null,
            );
        };

        if (typeof window.requestIdleCallback === 'function') {
            const idleId = window.requestIdleCallback(run, { timeout: 2500 });
            prefetchCancelRef.current = () => {
                cancelled = true;
                window.cancelIdleCallback?.(idleId);
            };
            return;
        }

        const timerId = window.setTimeout(run, NEXT_DAY_PREFETCH_DELAY_MS);
        prefetchCancelRef.current = () => {
            cancelled = true;
            window.clearTimeout(timerId);
        };
    }, [cancelScheduledPrefetch]);

    useEffect(() => cancelScheduledPrefetch, [cancelScheduledPrefetch]);

    // 관리자 도구로 사전 캐싱된 본문을 조회한다 (Notion 실시간 연동 없음, 캐시 미스 시 에러 반환)
    const fetchCachedVerseData = async (planId, currentDay) => {
        const [planType, version] = (planId || '1year_revised').split('_');

        let cached = await withTimeout(fetchVerseFromCache(planId, currentDay), CACHE_LOOKUP_TIMEOUT_MS, null);
        if (cached && cached.text) {
            return cached;
        }

        return {
            title: null,
            text: null,
            error: 'missing_cache'
        };
    };

    const loadContent = useCallback(async (dayToShow) => {
        if (!currentUser) return;
        const requestId = ++contentRequestRef.current;
        setVerseData(prev => ({ ...prev, loading: true }));

        const { planId, dayOffset = 0 } = currentUser;
        const [planType, version] = (planId || '1year_revised').split('_');
        const planTypeData = PLAN_TYPES.find(p => p.id === planType);
        const planTypeName = planTypeData ? planTypeData.title : '성경 통독';

        const actualDay = getActualDay(dayToShow, dayOffset, getPlanTotalDays(planId));
        const cachedContent = await fetchCachedVerseData(planId, actualDay);
        if (contentRequestRef.current !== requestId) return;
        const totalPlanDays = getPlanTotalDays(planId);
        if (dayToShow < totalPlanDays) {
            const nextActualDay = getActualDay(dayToShow + 1, dayOffset, totalPlanDays);
            scheduleNextDayPrefetch(planId, nextActualDay);
        } else {
            cancelScheduledPrefetch();
        }

        const completedThisYear = getYearCompletedRounds(currentUser);
        const readCountBadge = completedThisYear > 0 ? ` (올해 ${completedThisYear}독 완료)` : '';

        if (cachedContent && cachedContent.text && !cachedContent.text.startsWith('[오류]')) {
            const processedText = cachedContent.text;

            let finalAudioUrl = cachedContent.audioUrl || null;
            if (!finalAudioUrl && AUDIO_BASE_URL && AUDIO_BASE_URL.startsWith('http')) {
                const baseUrl = AUDIO_BASE_URL.replace(/\/$/, '');
                finalAudioUrl = `${baseUrl}/${planId}/${actualDay}.mp3`;
            }

            setVerseData({
                title: `${planTypeName} DAY ${dayToShow}일${readCountBadge}`,
                subtitle: cachedContent.title || `(제목 없음)`,
                text: processedText,
                audioUrl: finalAudioUrl,
                error: false,
                loading: false
            });
        } else {
            const versionName = getVersionName(planType, version);
            const isMissingCache = cachedContent && cachedContent.error === 'missing_cache';
            const displayText = actualDay === 1 && !isMissingCache
                ? GENESIS_1
                : ((cachedContent && cachedContent.text) || createMissingContentMessage(versionName, dayToShow));

            setVerseData({
                title: `${planTypeName} DAY ${dayToShow}일${readCountBadge}`,
                subtitle: `${versionName} 읽기`,
                text: displayText,
                audioUrl: null,
                error: true,
                loading: false
            });
        }
    }, [currentUser, scheduleNextDayPrefetch, cancelScheduledPrefetch]);

    return {
        verseData,
        setVerseData,
        viewingDay,
        setViewingDay,
        loadContent
    };
};
