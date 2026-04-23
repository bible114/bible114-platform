import { useState, useCallback } from 'react';
import { db } from '../utils/firebase';
import { SUPABASE_FUNCTION_URL, GENESIS_1, AUDIO_BASE_URL } from '../data/constants';
import { BIBLE_VERSIONS, PLAN_TYPES } from '../data/bible_options';
import { getActualDay } from '../utils/helpers';

/**
 * 새한글 버전 본문 전처리: 절 번호 앞에 줄바꿈 삽입 및 마크업 추가
 * Notion에서 bold(**숫자**)로 표시된 숫자만 절 번호로 인식.
 * 순차 검증(1→2→3...)을 통해 잘못된 숫자가 절로 인식되는 것을 방지.
 * bold 마크업이 없는 기존 캐시 데이터도 fallback 처리.
 */
const formatSaehangulText = (text) => {
    if (!text) return text;

    const hasBoldMarkers = /\*\*\d+\s*\*\*/.test(text);

    if (hasBoldMarkers) {
        // 장(chapter) 단위로 분리하여 처리 (# 제목 기준)
        // 각 장마다 expectedVerse를 1로 리셋
        const lines = text.split('\n');
        const result = [];
        let expectedVerse = 1;
        let isFirst = true;

        for (const line of lines) {
            // 장 제목(# 창세기 7, ## 로마서 13 등)이 나오면 절 카운터 리셋
            // ### 소제목에서는 리셋 안 함 (장 내 소제목은 절 번호가 이어짐)
            if (/^#{1,2}\s/.test(line)) {
                expectedVerse = 1;
                isFirst = true;
            }
            if (/^#{1,3}\s/.test(line)) {
                result.push(line);
                continue;
            }

            const processed = line.replace(/\*\*(\d+)\s*\*\*/g, (match, verseNum) => {
                const num = parseInt(verseNum, 10);
                if (num !== expectedVerse) {
                    // 복구: 소폭 앞선 경우(1~5절 차이) 카운터를 점프하여 복구
                    if (num > expectedVerse && num <= expectedVerse + 5) {
                        expectedVerse = num;
                    } else {
                        return verseNum; // bold 마크업 제거, 일반 숫자로 표시
                    }
                }
                expectedVerse++;
                const marker = `[[VERSE:${verseNum}]]`;
                if (isFirst) {
                    isFirst = false;
                    return marker;
                }
                return `\n${marker}`;
            });
            result.push(processed);
        }

        // 남은 ** 마크업 제거 (소제목 이외의 bold 텍스트)
        return result.join('\n').replace(/\*\*([^*]+)\*\*/g, '$1');
    }

    // fallback: bold 마크업 없는 기존 캐시 데이터용 (기존 로직 + 순차 검증)
    const lines = text.split('\n');
    const result = [];
    let expectedVerse = 1;
    let isFirst = true;
    const versePattern = /(^|[.!?""""''\(\)\[\]]\s*)(\d+)(?!\s*(개월|개|년|일|번|차|회|명|층|시|분|초|세|살|권|편|절|장|막)(?![가-힣]))(?=\s*[^0-9])/gm;

    for (const line of lines) {
        if (/^#{1,3}\s/.test(line)) {
            // 장 제목(#, ##)만 리셋, 소제목(###)은 리셋 안 함
            if (/^#{1,2}\s/.test(line)) {
                expectedVerse = 1;
                isFirst = true;
            }
            result.push(line);
            continue;
        }

        versePattern.lastIndex = 0;
        const processed = line.replace(versePattern, (match, prefix, verseNum) => {
            const num = parseInt(verseNum, 10);
            if (num !== expectedVerse) return match;
            expectedVerse++;
            const marker = `[[VERSE:${verseNum}]]`;
            if (isFirst && prefix.trim() === '') {
                isFirst = false;
                return marker;
            }
            isFirst = false;
            return `${prefix}\n${marker}`;
        });
        result.push(processed);
    }
    return result.join('\n');
};

export const useBibleContent = (currentUser) => {
    const [verseData, setVerseData] = useState({
        title: '',
        subtitle: '',
        text: '',
        audioUrl: null,
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

    // 노션 API 호출 (캐시 없을 때 fallback)
    const fetchFromNotion = async (planId, currentDay) => {
        if (!SUPABASE_FUNCTION_URL) return { title: null, text: "서버 연결 설정이 필요합니다." };
        const [planType, version] = (planId || '1year_revised').split('_');
        const planGroup = BIBLE_VERSIONS[planType];
        const versionInfo = planGroup ? planGroup.find(v => v.id === version) : null;
        const targetTag = versionInfo ? versionInfo.tagName : '개역개정 일년일독';

        const targetDate = new Date(2025, 0, currentDay);
        const mm = String(targetDate.getMonth() + 1).padStart(2, '0');
        const dd = String(targetDate.getDate()).padStart(2, '0');

        try {
            const response = await fetch(SUPABASE_FUNCTION_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ tag: targetTag, date: `${mm}-${dd}` })
            });
            if (!response.ok) throw new Error(`Server Error: ${response.status}`);
            const data = await response.json();
            if (data.error) return { title: null, text: `[오류] ${data.error}` };
            return { title: data.title, text: data.text, audioUrl: data.audioUrl };
        } catch (e) {
            console.error(e);
            return { title: null, text: "서버와 통신 중 오류가 발생했습니다." };
        }
    };

    const fetchNotionData = async (planId, currentDay) => {
        const [planType, version] = (planId || '1year_revised').split('_');

        console.log(`📖 본문 로딩: planId=${planId}, day=${currentDay}, cacheKey=${planType}_${version}_${currentDay}`);
        const t0 = Date.now();

        let cached = await fetchVerseFromCache(planId, currentDay);
        console.log(`⏱️ 캐시 조회: ${Date.now() - t0}ms, 결과: ${cached ? '히트' : '미스'}`);
        // 새한글 구 캐시 무효화: bold 마커(**숫자**)가 없으면 구 데이터 → 무시
        if (cached && cached.text && version && version.startsWith('saehangul')) {
            if (!/\*\*\d+\s*\*\*/.test(cached.text)) {
                console.log('🔄 새한글 구 캐시 무효화 (bold 마커 없음)');
                const cacheKey = `${planType}_${version}_${currentDay}`;
                try { localStorage.removeItem(`v_${cacheKey}`); } catch (e) {}
                cached = null;
            }
        }
        if (cached && cached.text) {
            return cached;
        }

        console.log(`🌐 Notion API 호출 시작...`);
        const t1 = Date.now();
        const notionResult = await fetchFromNotion(planId, currentDay);
        console.log(`⏱️ Notion API: ${Date.now() - t1}ms`);

        // Notion에서 정상 데이터를 받으면 캐시에 저장 (다음 로드 시 빠르게)
        if (notionResult && notionResult.text && !notionResult.text.startsWith('[오류]')) {
            try {
                const cacheKey = `${planType}_${version}_${currentDay}`;
                await db.collection('verses').doc(cacheKey).set({
                    title: notionResult.title,
                    text: notionResult.text,
                    audioUrl: notionResult.audioUrl || null,
                    day: currentDay,
                    planId: planId,
                    syncedAt: new Date()
                });
            } catch (e) {
                console.error("캐시 저장 실패:", e);
            }
            // localStorage에도 저장
            try {
                localStorage.setItem(`v_${cacheKey}`, JSON.stringify({
                    title: notionResult.title, text: notionResult.text, audioUrl: notionResult.audioUrl || null
                }));
            } catch (e) { /* 용량 초과 무시 */ }
        }

        return notionResult;
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

        const readCountBadge = readCount > 1 ? ` (${readCount}독)` : '';

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
                loading: false
            });
        } else {
            const planGroup = BIBLE_VERSIONS[planType];
            const versionInfo = planGroup ? planGroup.find(v => v.id === version) : null;
            const versionName = (versionInfo && versionInfo.name) || '기본';
            let displayText = actualDay === 1 ? GENESIS_1 : ((notionData && notionData.text) || `데이터를 불러올 수 없습니다.`);

            // 새한글 버전일 경우 절 표시 처리
            if (version && version.startsWith('saehangul')) {
                displayText = formatSaehangulText(displayText);
            }

            setVerseData({
                title: `${planTypeName} DAY ${dayToShow}일${readCountBadge}`,
                subtitle: `${versionName} 읽기`,
                text: displayText,
                audioUrl: null,
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
