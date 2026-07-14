const isValidMonthDay = (year, month, day) => {
    if (!Number.isInteger(month) || !Number.isInteger(day)) return false;
    if (month < 1 || month > 12 || day < 1) return false;
    return day <= new Date(year, month, 0).getDate();
};

// 점/슬래시/숫자만으로 쓴 날짜는 성경 장절(예: "요한복음 7.15")과 모양이 같다.
// 따라서 이런 축약형은 제목의 맨 앞(괄호·기호로 감싼 머리말 포함)에 있을 때만 날짜로
// 인정한다. "7월 15일"과 연도까지 있는 YYYYMMDD는 본문 어디에 있어도 충분히 명확하다.
const hasDateLikePrefix = (text, matchIndex) => {
    const prefix = text.slice(0, matchIndex).trim();
    return /^[\[({<【〔#|·\-–—]*$/.test(prefix);
};

export const titleMatchesDate = (title, dateKey) => {
    if (!title || !dateKey) return false;
    const target = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateKey);
    if (!target) return false;
    const targetYear = Number(target[1]);
    const targetMonth = Number(target[2]);
    const targetDay = Number(target[3]);
    const text = String(title);

    const matchesTarget = (month, day) => (
        isValidMonthDay(targetYear, month, day)
        && month === targetMonth
        && day === targetDay
    );

    for (const match of text.matchAll(/(\d{1,2})\s*월\s*(\d{1,2})\s*일/g)) {
        if (matchesTarget(Number(match[1]), Number(match[2]))) return true;
    }
    for (const match of text.matchAll(/(?<!\d)(20\d{2})(\d{2})(\d{2})(?!\d)/g)) {
        if (
            Number(match[1]) === targetYear
            && matchesTarget(Number(match[2]), Number(match[3]))
        ) return true;
    }

    const abbreviatedPatterns = [
        /(?<!\d)(\d{1,2})\s*\/\s*(\d{1,2})(?!\d)/g,
        /(?<!\d)(\d{1,2})\s*\.\s*(\d{1,2})(?!\d)/g,
        /(?<!\d)(\d{2})(\d{2})(?!\d)/g,
    ];
    for (const pattern of abbreviatedPatterns) {
        for (const match of text.matchAll(pattern)) {
            if (
                hasDateLikePrefix(text, match.index)
                && matchesTarget(Number(match[1]), Number(match[2]))
            ) return true;
        }
    }
    return false;
};

export const getDailyVideoFillState = (configuredModeKeys, payload) => {
    const modeKeys = Array.isArray(configuredModeKeys) ? configuredModeKeys : [];
    const missingModes = modeKeys.filter(key => !payload?.[key]?.url);
    return {
        hasAny: modeKeys.some(key => Boolean(payload?.[key]?.url)),
        allReady: modeKeys.length > 0 && missingModes.length === 0,
        missingModes,
    };
};

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
