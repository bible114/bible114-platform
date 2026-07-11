import { useState, useCallback } from 'react';
import { db } from '../utils/firebase';
import { GENESIS_1, AUDIO_BASE_URL } from '../data/constants';
import { BIBLE_VERSIONS, PLAN_TYPES } from '../data/bible_options';
import { getActualDay } from '../utils/helpers';
import { formatSaehangulText } from '../utils/saehangulParser';

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
                console.log(`⚡ localStorage 히트: ${cacheKey}`);
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

    const fetchNotionData = async (planId, currentDay) => {
        const [planType, version] = (planId || '1year_revised').split('_');

        console.log(`📖 본문 로딩: planId=${planId}, day=${currentDay}, cacheKey=${planType}_${version}_${currentDay}`);
        const t0 = Date.now();

        let cached = await withTimeout(fetchVerseFromCache(planId, currentDay), CACHE_LOOKUP_TIMEOUT_MS, null);
        console.log(`⏱️ 캐시 조회: ${Date.now() - t0}ms, 결과: ${cached ? '히트' : '미스'}`);
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
        const notionData = await fetchNotionData(planId, actualDay);

        const readCountBadge = readCount > 1 ? ` (${readCount - 1}독 완료)` : '';

        if (notionData && notionData.text && !notionData.text.startsWith('[오류]')) {
            let processedText = notionData.text;

            // 새한글 버전일 경우 절 표시 처리
            if (version && version.startsWith('saehangul')) {
                processedText = formatSaehangulText(processedText);
            }

            let finalAudioUrl = notionData.audioUrl || null;
            if (!finalAudioUrl && AUDIO_BASE_URL && AUDIO_BASE_URL.startsWith('http')) {
                const baseUrl = AUDIO_BASE_URL.replace(/\/$/, '');
                finalAudioUrl = `${baseUrl}/${planId}/${actualDay}.mp3`;
            }

            setVerseData({
                title: `${planTypeName} DAY ${dayToShow}일${readCountBadge}`,
                subtitle: notionData.title || `(제목 없음)`,
                text: processedText,
                audioUrl: finalAudioUrl,
                error: false,
                loading: false
            });
        } else {
            const versionName = getVersionName(planType, version);
            const isMissingCache = notionData && notionData.error === 'missing_cache';
            let displayText = actualDay === 1 && !isMissingCache
                ? GENESIS_1
                : ((notionData && notionData.text) || createMissingContentMessage(versionName, dayToShow));

            // 새한글 버전일 경우 절 표시 처리
            if (version && version.startsWith('saehangul') && !isMissingCache) {
                displayText = formatSaehangulText(displayText);
            }

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
