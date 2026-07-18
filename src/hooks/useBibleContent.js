import { useState, useCallback } from 'react';
import { db } from '../utils/firebase';
import { GENESIS_1, AUDIO_BASE_URL } from '../data/constants';
import { BIBLE_VERSIONS, PLAN_TYPES } from '../data/bible_options';
import { getActualDay } from '../utils/helpers';

const CACHE_LOOKUP_TIMEOUT_MS = 8000;

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
    const [verseData, setVerseData] = useState({
        title: '',
        subtitle: '',
        text: '',
        audioUrl: null,
        error: false,
        loading: false
    });
    const [viewingDay, setViewingDay] = useState(null);

    // 로컬(localStorage) 캐시 → Firestore 캐시 2단계
    const fetchVerseFromCache = async (planId, day) => {
        const [planType, version] = (planId || '1year_revised').split('_');
        const cacheKey = `${planType}_${version}_${day}`;

        // 1단계: localStorage (즉시)
        try {
            const local = localStorage.getItem(`v_${cacheKey}`);
            if (local) {
                return JSON.parse(local);
            }
        } catch (e) { /* localStorage 실패 무시 */ }

        // 2단계: Firestore
        if (!db) return null;
        try {
            const doc = await db.collection('verses').doc(cacheKey).get();
            if (doc.exists) {
                const data = doc.data();
                // localStorage에 저장 (다음번 즉시 로드)
                try {
                    localStorage.setItem(`v_${cacheKey}`, JSON.stringify({
                        title: data.title, text: data.text, audioUrl: data.audioUrl || null
                    }));
                } catch (e) { /* 용량 초과 무시 */ }
                return data;
            }
        } catch (e) {
            console.error("캐시 읽기 실패:", e);
        }
        return null;
    };

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
        setVerseData(prev => ({ ...prev, loading: true }));

        const { planId, dayOffset = 0, readCount = 1 } = currentUser;
        const [planType, version] = (planId || '1year_revised').split('_');
        const planTypeData = PLAN_TYPES.find(p => p.id === planType);
        const planTypeName = planTypeData ? planTypeData.title : '성경 통독';

        const actualDay = getActualDay(dayToShow, dayOffset);
        const cachedContent = await fetchCachedVerseData(planId, actualDay);

        const readCountBadge = readCount > 1 ? ` (${readCount - 1}독 완료)` : '';

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
    }, [currentUser]);

    return {
        verseData,
        setVerseData,
        viewingDay,
        setViewingDay,
        loadContent
    };
};
