import React, { useEffect, useRef, useState } from 'react';
import { db, firebase } from '../../utils/firebase';
import { getVideoDateKST, extractYouTubeId, parseAndMapChapters, titleMatchesDate } from '../../utils/helpers';
import { saveGuestState } from '../../utils/guestStorage';

const CHAPTER_ORDER = [
    { key: '해설', label: '묵상 해설', emoji: '📖' },
    { key: '성경읽기', label: '성경읽기', emoji: '📕' },
    { key: '기도', label: '기도제목', emoji: '🙏' },
];

// 재생목록에서 지금 시점 기준 가장 최신 영상을 하나 골라 { url, chapters }를 만든다.
// UU(채널 업로드) 재생목록은 이미 최신순이라 페이지 1개만으로도 충분하고 쿼터 비용도 가장
// 저렴하지만, 큐레이션된(수동으로 순서를 구성한) 일반 재생목록은 "추가된 순서"가 "영상이
// 실제로 게시된 순서"와 다를 수 있어 최신 영상이 뒤쪽 페이지에 있을 수 있다. 그래서
// (1) 정렬 기준은 재생목록에 추가된 시각(snippet.publishedAt)이 아니라 영상이 실제로
//     게시된 시각(contentDetails.videoPublishedAt)을 우선 사용하고 (contentDetails가
//     없는 경우에만 snippet.publishedAt으로 폴백),
// (2) 최대 5페이지(최대 250개)까지 페이지네이션해 후보를 모은 뒤 그중 이미 게시된
//     (<= now) 영상 중 가장 최신을 택한다.
// 실패(쿼터 초과, 잘못된 키/ID, 후보 없음)하면 예외를 던지고 호출부에서 console.warn만 남긴다.
const MAX_PLAYLIST_PAGES = 5;

const fetchPlaylistCandidates = async (playlistId, apiKey) => {
    const candidates = [];
    let pageToken = '';
    for (let page = 0; page < MAX_PLAYLIST_PAGES; page++) {
        const itemsUrl = `https://www.googleapis.com/youtube/v3/playlistItems?part=snippet,contentDetails&playlistId=${encodeURIComponent(playlistId)}&maxResults=50&key=${encodeURIComponent(apiKey)}${pageToken ? `&pageToken=${encodeURIComponent(pageToken)}` : ''}`;
        const itemsRes = await fetch(itemsUrl);
        if (!itemsRes.ok) throw new Error(`playlistItems HTTP ${itemsRes.status}`);
        const itemsJson = await itemsRes.json();
        candidates.push(...(itemsJson.items || []));
        pageToken = itemsJson.nextPageToken;
        if (!pageToken) break;
    }
    return candidates;
};

export const fetchLatestFromPlaylist = async (playlistId, apiKey, targetDateKey) => {
    const items = await fetchPlaylistCandidates(playlistId, apiKey);
    const now = Date.now();
    const candidates = items
        .map(it => ({
            it,
            publishedAt: it?.contentDetails?.videoPublishedAt || it?.snippet?.publishedAt || null,
            title: it?.snippet?.title || '',
        }))
        .filter(({ publishedAt }) => publishedAt && new Date(publishedAt).getTime() <= now)
        .sort((a, b) => new Date(b.publishedAt) - new Date(a.publishedAt));
    const dateMatched = targetDateKey
        ? candidates.filter(candidate => titleMatchesDate(candidate.title, targetDateKey))
        : [];
    const chosenCandidate = dateMatched[0] || candidates[0];
    const chosen = chosenCandidate?.it;
    const videoId = chosen?.contentDetails?.videoId || chosen?.snippet?.resourceId?.videoId;
    if (!videoId) throw new Error('재생목록에 사용 가능한 영상이 없음');

    const videoUrl = `https://www.googleapis.com/youtube/v3/videos?part=snippet&id=${encodeURIComponent(videoId)}&key=${encodeURIComponent(apiKey)}`;
    const videoRes = await fetch(videoUrl);
    if (!videoRes.ok) throw new Error(`videos HTTP ${videoRes.status}`);
    const videoJson = await videoRes.json();
    const snippet = videoJson.items?.[0]?.snippet || {};
    const description = snippet.description || '';
    const chapters = parseAndMapChapters(description);

    return {
        url: `https://youtu.be/${videoId}`,
        chapters,
        title: snippet.title || chosenCandidate?.title || '',
        publishedAt: chosenCandidate?.publishedAt || snippet.publishedAt || null,
        matchedDate: Boolean(dateMatched[0]),
    };
};

// 매일 유튜브 영상 카드 — 읽기 탭 최상단에 표시.
// dailyVideos/{getVideoDateKST()} 문서가 없거나 두 모드 모두 url이 없으면 렌더링하지 않는다.
const DailyVideoCard = ({ currentUser, setCurrentUser }) => {
    const [video, setVideo] = useState(undefined); // undefined: 로딩중, null: 문서 없음(또는 자동 채움 실패)
    const [mode, setMode] = useState((currentUser?.videoMode || currentUser?.videoType) === 'kids' ? 'kids' : 'adult');
    const [playing, setPlaying] = useState(false);
    const [startSec, setStartSec] = useState(0);
    // Fix F: 날짜 키를 state로 들고 있다가, 화면이 다시 보이거나 주기적으로 재계산해
    // 3시(KST) 경계를 넘겨도 새로고침 없이 다음날 영상으로 갱신되게 한다.
    const [dateKey, setDateKey] = useState(getVideoDateKST());
    const iframeRef = useRef(null);

    // 문서에서 읽어온 데이터든 자동 채움으로 만든 payload든 동일한 형태({adult, kids, ...})이므로
    // 같은 경로로 렌더링되도록 하나의 setter를 통해서만 반영한다.
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
        // 탭을 계속 열어둔 채로 자정/3시를 넘기는 경우를 위한 저빈도 폴백(5분 간격)
        const interval = setInterval(recomputeDateKey, 5 * 60 * 1000);
        return () => {
            document.removeEventListener('visibilitychange', onVisibility);
            clearInterval(interval);
        };
    }, []);

    useEffect(() => {
        let cancelled = false;
        if (!db) { setVideo(null); return; }

        setVideo(undefined);
        setPlaying(false);
        setStartSec(0);

        const docRef = db.collection('dailyVideos').doc(dateKey);

        const tryAutoFill = async () => {
            try {
                const configDoc = await db.collection('settings').doc('videoAutoConfig').get();
                if (cancelled) return;
                if (!configDoc.exists) { setVideo(null); return; }
                const config = configDoc.data();
                if (!config.enabled || !config.apiKey) { setVideo(null); return; }

                const modes = [
                    ['adult', config.adultPlaylistId],
                    ['kids', config.kidsPlaylistId],
                ].filter(([, playlistId]) => !!playlistId);

                if (modes.length === 0) { setVideo(null); return; }

                const results = await Promise.all(modes.map(async ([key, playlistId]) => {
                    try {
                        const entry = await fetchLatestFromPlaylist(playlistId, config.apiKey, dateKey);
                        return [key, entry];
                    } catch (e) {
                        console.warn(`매일 영상 자동 채움 실패 (${key}):`, e);
                        return [key, null];
                    }
                }));
                if (cancelled) return;

                const payload = { adult: null, kids: null };
                results.forEach(([key, entry]) => { payload[key] = entry; });

                if (!payload.adult?.url && !payload.kids?.url) { setVideo(null); return; }

                payload.updatedAt = firebase.firestore.FieldValue.serverTimestamp();
                payload.autoFilled = true;

                // 이중 채움 방지: 쓰기 직전에 다시 한번 문서 존재 여부를 확인한다.
                // (동시 접속 시 완벽한 레이스 방지는 아니지만, Firestore create 규칙이
                // 필드 화이트리스트로 제한돼 있어 set({merge:false}) 대신 여기서는
                // "생성"만 하고 이미 있으면 건드리지 않는 것으로 충분 — 최악의 경우 같은
                // 문서가 몇 초 안에 한 번 더 자동 채움으로 덮여써도 내용은 동등하다.)
                const recheck = await docRef.get();
                if (cancelled) return;
                if (recheck.exists) {
                    applyVideoDoc(recheck.data());
                    return;
                }
                try {
                    await docRef.set(payload);
                    if (cancelled) return;
                    applyVideoDoc(payload);
                } catch (writeErr) {
                    // Fix E: 동시 접속한 다른 사용자가 먼저 create에 성공하면 이 문서는 이미
                    // 존재하는 상태가 되어, 화이트리스트 create 규칙상 이 클라이언트의 set()은
                    // "생성"이 아니라 "수정"으로 취급되어 permission-denied로 거부된다(수정은
                    // 플랫폼 관리자만 허용). 그 경쟁에서 진 쪽은 카드를 숨기지 말고 방금 생성된
                    // 문서를 다시 읽어와 그대로 보여준다.
                    if (cancelled) return;
                    const after = await docRef.get().catch(() => null);
                    if (cancelled) return;
                    if (after?.exists) {
                        applyVideoDoc(after.data());
                    } else {
                        console.warn('매일 영상 자동 채움 실패(쓰기 거부, 재조회 실패):', writeErr);
                        setVideo(null);
                    }
                }
            } catch (e) {
                console.warn('매일 영상 자동 채움 실패:', e);
                if (!cancelled) setVideo(null);
            }
        };

        docRef.get()
            .then(doc => {
                if (cancelled) return;
                if (doc.exists) {
                    applyVideoDoc(doc.data());
                    return;
                }
                return tryAutoFill();
            })
            .catch(() => {
                if (!cancelled) setVideo(null);
            });
        return () => { cancelled = true; };
    }, [dateKey, currentUser?.uid]);

    useEffect(() => {
        setMode((currentUser?.videoMode || currentUser?.videoType) === 'kids' ? 'kids' : 'adult');
    }, [currentUser?.videoMode, currentUser?.videoType]);

    if (!video) return null;

    const selectedEntry = video[mode];
    const otherMode = mode === 'adult' ? 'kids' : 'adult';
    const otherEntry = video[otherMode];

    // 선택된 모드에 url이 없으면 반대 모드로 폴백
    const usingFallback = !selectedEntry?.url && !!otherEntry?.url;
    const activeEntry = selectedEntry?.url ? selectedEntry : (usingFallback ? otherEntry : null);
    const activeModeLabel = (selectedEntry?.url ? mode : otherMode) === 'adult' ? '성인용' : '어린이용';

    if (!activeEntry?.url) return null;

    const videoId = extractYouTubeId(activeEntry.url);
    if (!videoId) return null;

    const handleModeChange = async (newMode) => {
        setMode(newMode);
        setPlaying(false);
        if (currentUser?.role === 'guest') {
            saveGuestState({ videoType: newMode });
            if (typeof setCurrentUser === 'function') {
                setCurrentUser(prev => prev ? { ...prev, videoType: newMode } : prev);
            }
            return;
        }
        if (currentUser?.uid && db) {
            if (typeof setCurrentUser === 'function') {
                setCurrentUser(prev => prev ? { ...prev, videoMode: newMode } : prev);
            }
            try {
                await db.collection('users').doc(currentUser.uid).set({ videoMode: newMode }, { merge: true });
            } catch (e) {
                // 저장 실패해도 화면 표시는 그대로 유지 (다음 로그인 시 다시 시도됨)
                console.error('videoMode 저장 실패:', e);
            }
        }
    };

    // Fix J: 콜드스타트(아직 iframe이 없는 상태)에서는 embedSrc에 start 파라미터를 심어
    // 처음부터 해당 시각으로 재생을 시작한다. rAF로 iframeRef.current.src를 나중에 직접
    // 대입하던 방식은 렌더와 실제 DOM 상태가 어긋날 수 있어 state 기반으로 통일한다.
    const embedSrc = (sec) => {
        const base = `https://www.youtube.com/embed/${videoId}?enablejsapi=1&autoplay=1&playsinline=1`;
        return sec ? `${base}&start=${sec}` : base;
    };

    const handlePlayClick = () => {
        const commentary = (activeEntry.chapters || []).find(ch => ch.label === '해설');
        setStartSec(commentary?.sec > 0 ? commentary.sec : 0);
        setPlaying(true);
    };

    const handleChapterClick = (sec) => {
        if (!playing) {
            setStartSec(sec);
            setPlaying(true);
            return;
        }
        if (iframeRef.current && iframeRef.current.contentWindow) {
            iframeRef.current.contentWindow.postMessage(
                JSON.stringify({ event: 'command', func: 'seekTo', args: [sec, true] }),
                '*'
            );
        }
    };

    const availableChapters = CHAPTER_ORDER
        .map(c => ({ ...c, chapter: (activeEntry.chapters || []).find(ch => ch.label === c.key) }))
        .filter(c => c.chapter);

    return (
        <div className="bg-white rounded-3xl shadow-xl overflow-hidden border border-slate-100">
            <div className="p-5 bg-gradient-to-br from-indigo-600 to-blue-700 text-white">
                <div className="flex items-center justify-between">
                    <h2 className="text-lg font-bold flex items-center gap-2">
                        <span className="text-xl">🎬</span> 오늘의 영상
                    </h2>
                    <div className="flex items-center bg-white/20 backdrop-blur-md rounded-full p-1 shrink-0">
                        <button
                            onClick={() => handleModeChange('adult')}
                            className={`px-3 py-1.5 rounded-full text-xs font-bold transition-all ${mode === 'adult' ? 'bg-white text-indigo-700 shadow-sm' : 'text-white/80'}`}
                        >
                            성인용
                        </button>
                        <button
                            onClick={() => handleModeChange('kids')}
                            className={`px-3 py-1.5 rounded-full text-xs font-bold transition-all ${mode === 'kids' ? 'bg-white text-indigo-700 shadow-sm' : 'text-white/80'}`}
                        >
                            어린이용
                        </button>
                    </div>
                </div>
                {usingFallback && (
                    <p className="text-xs text-white/80 mt-2">
                        {mode === 'adult' ? '성인용' : '어린이용'} 영상이 없어 {activeModeLabel} 영상을 보여드려요.
                    </p>
                )}
            </div>

            <div className="p-5 bg-white">
                <div className="relative w-full aspect-video rounded-2xl overflow-hidden bg-slate-900">
                    {playing ? (
                        <iframe
                            ref={iframeRef}
                            className="absolute inset-0 w-full h-full"
                            src={embedSrc(startSec)}
                            title="오늘의 영상"
                            frameBorder="0"
                            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                            allowFullScreen
                        />
                    ) : (
                        <button
                            onClick={handlePlayClick}
                            className="absolute inset-0 w-full h-full group"
                            aria-label="영상 재생"
                        >
                            <img
                                src={`https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`}
                                alt="영상 미리보기"
                                className="w-full h-full object-cover"
                                loading="lazy"
                            />
                            <div className="absolute inset-0 bg-black/20 flex items-center justify-center group-hover:bg-black/30 transition-colors">
                                <div className="w-16 h-16 rounded-full bg-white/90 flex items-center justify-center shadow-xl group-active:scale-95 transition-transform">
                                    <span className="text-3xl text-indigo-600 ml-1">▶</span>
                                </div>
                            </div>
                        </button>
                    )}
                </div>

                {availableChapters.length > 0 && (
                    <div className="mt-4">
                        <p className="mb-2 text-xs font-bold text-slate-400">영상 속 구간으로 바로 이동해요</p>
                        <div className="flex flex-wrap gap-2">
                            {availableChapters.map(({ key, label, emoji, chapter }) => (
                                <button
                                    key={key}
                                    onClick={() => handleChapterClick(chapter.sec)}
                                    className={`flex items-center gap-1.5 px-4 py-2.5 rounded-2xl font-bold text-sm active:scale-95 transition-all ${
                                        key === '기도'
                                            ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-100 hover:bg-indigo-700'
                                            : 'bg-indigo-50 text-indigo-700 hover:bg-indigo-100'
                                    }`}
                                >
                                    <span>{emoji}</span> {label}
                                </button>
                            ))}
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};

export default DailyVideoCard;
