export const selectDailyVideoCandidate = (
    items,
    { targetDateKey = '', now = Date.now(), matchesDate = () => false } = {}
) => {
    const candidates = (Array.isArray(items) ? items : [])
        .map(it => ({
            it,
            publishedAt: it?.contentDetails?.videoPublishedAt || it?.snippet?.publishedAt || null,
            title: it?.snippet?.title || '',
        }))
        .filter(({ publishedAt }) => publishedAt && new Date(publishedAt).getTime() <= now)
        .sort((a, b) => new Date(b.publishedAt) - new Date(a.publishedAt));

    const chosenCandidate = targetDateKey
        ? candidates.find(candidate => matchesDate(candidate.title, targetDateKey))
        : candidates[0];

    return {
        candidate: chosenCandidate || null,
        matchedDate: Boolean(targetDateKey && chosenCandidate),
        pending: Boolean(targetDateKey && !chosenCandidate),
        stale: Boolean(targetDateKey && !chosenCandidate && candidates.length > 0),
    };
};
