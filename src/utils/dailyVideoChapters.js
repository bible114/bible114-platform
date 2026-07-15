// "매일성경 해설 0:00" / "0:00 매일성경 해설" 양쪽 지원.
// 줄 시작 timestamp가 하나라도 있으면 성경 장절 오인을 막기 위해
// 라벨-먼저 형식의 줄 중간 timestamp 폴백은 사용하지 않는다.
const LEADING_TIMESTAMP_RE = /^\s*(?:(\d{1,2}):)?(\d{1,2}):(\d{2})\b/;
const ANY_TIMESTAMP_RE = /(\d{1,2}:)?(\d{1,2}):(\d{2})/;

const toSec = (match) => (
    (match[1] ? parseInt(match[1], 10) * 3600 : 0)
    + parseInt(match[2], 10) * 60
    + parseInt(match[3], 10)
);

const cleanLabel = (line, matchText) => (
    line.replace(matchText, '').trim().replace(/^[-–|·:]+|[-–|·:]+$/g, '').trim()
);

export const parseChapters = (description) => {
    const lines = (description || '').split('\n');
    const leading = [];
    for (const line of lines) {
        const match = line.match(LEADING_TIMESTAMP_RE);
        if (!match) continue;
        const label = cleanLabel(line, match[0]);
        if (label) leading.push({ label, sec: toSec(match) });
    }
    if (leading.length > 0) return leading;

    const fallback = [];
    for (const line of lines) {
        const match = line.match(ANY_TIMESTAMP_RE);
        if (!match) continue;
        const label = cleanLabel(line, match[0]);
        if (label) fallback.push({ label, sec: toSec(match) });
    }
    return fallback;
};

export const mapToStandardLabel = (label) => {
    // "매일성경 묵상"에는 성경도 들어가므로 성경읽기보다 먼저 판정한다.
    if (label.includes('해설') || label.includes('묵상')) return '해설';
    if (label.includes('성경') || label.includes('읽기')) return '성경읽기';
    if (label.includes('기도')) return '기도';
    return null;
};

export const parseAndMapChapters = (description) => {
    const mapped = [];
    parseChapters(description).forEach(({ label, sec }) => {
        const standardLabel = mapToStandardLabel(label);
        if (standardLabel && !mapped.find(item => item.label === standardLabel)) {
            mapped.push({ label: standardLabel, sec });
        }
    });
    return mapped;
};
