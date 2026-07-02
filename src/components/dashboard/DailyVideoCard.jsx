import React, { useEffect, useRef, useState } from 'react';
import { db, firebase } from '../../utils/firebase';
import { getVideoDateKST, extractYouTubeId, parseAndMapChapters } from '../../utils/helpers';

const CHAPTER_ORDER = [
    { key: '해설', emoji: '📖' },
    { key: '성경읽기', emoji: '📕' },
    { key: '기도', emoji: '🙏' },
];

// 재생목록에서 지금 시점 기준 가장 최신 영상을 하나 골라 { url, chapters }를 만든다.
// UU(채널 업로드) 재생목록은 이미 최신순이지만, 일반 재생목록도 안전하게 처리하려고
// snippet.publishedAt 기준 내림차순 정렬 후 publishedAt <= now인 것 중 첫 항목을 택한다.
// 실패(쿼터 초과, 잘못된 키/ID, 후보 없음)하면 null을 반환하고 호출부에서 console.warn만 남긴다.
const fetchLatestFromPlaylist = async (playlistId, apiKey) => {
    const itemsUrl = `https://www.googleapis.com/youtube/v3/playlistItems?part=snippet,contentDetails&playlistId=${encodeURIComponent(playlistId)}&maxResults=10&key=${encodeURIComponent(apiKey)}`;
    const itemsRes = await fetch(itemsUrl);
    if (!itemsRes.ok) throw new Error(`playlistItems HTTP ${itemsRes.status}`);
    const itemsJson = await itemsRes.json();
    const now = Date.now();
    const candidates = (itemsJson.items || [])
        .filter(it => it?.snippet?.publishedAt && new Date(it.snippet.publishedAt).getTime() <= now)
        .sort((a, b) => new Date(b.snippet.publishedAt) - new Date(a.snippet.publishedAt));
    const chosen = candidates[0];
    const videoId = chosen?.contentDetails?.videoId || chosen?.snippet?.resourceId?.videoId;
    if (!videoId) throw new Error('재생목록에 사용 가능한 영상이 없음');

    const videoUrl = `https://www.googleapis.com/youtube/v3/videos?part=snippet&id=${encodeURIComponent(videoId)}&key=${encodeURIComponent(apiKey)}`;
    const videoRes = await fetch(videoUrl);
    if (!videoRes.ok) throw new Error(`videos HTTP ${videoRes.status}`);
    const videoJson = await videoRes.json();
    const description = videoJson.items?.[0]?.snippet?.description || '';
    const chapters = parseAndMapChapters(description);

    return { url: `https://youtu.be/${videoId}`, chapters };
};

// 매일 유튜브 영상 카드 — 읽기 탭 최상단에 표시.
// dailyVideos/{getVideoDateKST()} 문서가 없거나 두 모드 모두 url이 없으면 렌더링하지 않는다.
const DailyVideoCard = ({ currentUser, setCurrentUser }) => {
    const [video, setVideo] = useState(undefined); // undefined: 로딩중, null: 문서 없음(또는 자동 채움 실패)
    const [mode, setMode] = useState(currentUser?.videoMode === 'kids' ? 'kids' : 'adult');
    const [playing, setPlaying] = useState(false);
    const iframeRef = useRef(null);

    useEffect(() => {
        let cancelled = false;
        if (!db) { setVideo(null); return; }

        const videoDate = getVideoDateKST();
        const docRef = db.collection('dailyVideos').doc(videoDate);

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
                        const entry = await fetchLatestFromPlaylist(playlistId, config.apiKey);
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
                    setVideo(recheck.data());
                    return;
                }
                await docRef.set(payload);
                if (cancelled) return;
                setVideo(payload);
            } catch (e) {
                console.warn('매일 영상 자동 채움 실패:', e);
                if (!cancelled) setVideo(null);
            }
        };

        docRef.get()
            .then(doc => {
                if (cancelled) return;
                if (doc.exists) {
                    setVideo(doc.data());
                    return;
                }
                return tryAutoFill();
            })
            .catch(() => {
                if (!cancelled) setVideo(null);
            });
        return () => { cancelled = true; };
    }, []);

    useEffect(() => {
        setMode(currentUser?.videoMode === 'kids' ? 'kids' : 'adult');
    }, [currentUser?.videoMode]);

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

    const embedSrc = (startSec) => {
        const base = `https://www.youtube.com/embed/${videoId}?enablejsapi=1&autoplay=1&playsinline=1`;
        return startSec ? `${base}&start=${startSec}` : base;
    };

    const handlePlayClick = () => {
        setPlaying(true);
    };

    const handleChapterClick = (sec) => {
        if (!playing) {
            setPlaying(true);
            // iframe이 아직 없으므로 start 파라미터로 바로 해당 시각부터 재생
            requestAnimationFrame(() => {
                if (iframeRef.current) {
                    iframeRef.current.src = embedSrc(sec);
                }
            });
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
                            src={embedSrc()}
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
                    <div className="flex flex-wrap gap-2 mt-4">
                        {availableChapters.map(({ key, emoji, chapter }) => (
                            <button
                                key={key}
                                onClick={() => handleChapterClick(chapter.sec)}
                                className="flex items-center gap-1.5 px-4 py-2.5 rounded-2xl bg-indigo-50 text-indigo-700 font-bold text-sm hover:bg-indigo-100 active:scale-95 transition-all"
                            >
                                <span>{emoji}</span> {key}
                            </button>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
};

export default DailyVideoCard;
