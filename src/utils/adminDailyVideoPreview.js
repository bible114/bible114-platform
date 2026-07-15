// T126d 전환 전까지 플랫폼 관리자 연결 시험만 사용하는 임시 브라우저 미리보기다.
// 일반 사용자 DailyVideoCard에서는 이 모듈과 YouTube API 키를 절대 사용하지 않는다.
import { parseAndMapChapters, titleMatchesDate } from './helpers';
import { selectDailyVideoCandidate } from './dailyVideoPolicy';

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
    const selection = selectDailyVideoCandidate(items, {
        targetDateKey,
        matchesDate: titleMatchesDate,
    });
    const chosenCandidate = selection.candidate;
    if (targetDateKey && !chosenCandidate) {
        const pendingError = new Error(`${targetDateKey} 날짜와 일치하는 게시 영상이 아직 없음`);
        pendingError.code = 'VIDEO_DATE_PENDING';
        pendingError.pending = selection.pending;
        pendingError.stale = selection.stale;
        throw pendingError;
    }
    const chosen = chosenCandidate?.it;
    const videoId = chosen?.contentDetails?.videoId || chosen?.snippet?.resourceId?.videoId;
    if (!videoId) throw new Error('재생목록에 사용 가능한 영상이 없음');

    const videoApiUrl = `https://www.googleapis.com/youtube/v3/videos?part=snippet&id=${encodeURIComponent(videoId)}&key=${encodeURIComponent(apiKey)}`;
    const videoRes = await fetch(videoApiUrl);
    if (!videoRes.ok) throw new Error(`videos HTTP ${videoRes.status}`);
    const videoJson = await videoRes.json();
    const snippet = videoJson.items?.[0]?.snippet || {};
    const chapters = parseAndMapChapters(snippet.description || '');

    return {
        url: `https://youtu.be/${videoId}`,
        chapters,
        title: snippet.title || chosenCandidate?.title || '',
        publishedAt: chosenCandidate?.publishedAt || snippet.publishedAt || null,
        matchedDate: selection.matchedDate,
    };
};
