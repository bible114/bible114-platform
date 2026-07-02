const getMissingVerseNumbers = (text) => {
    const chapters = String(text || '').split(/(?=^#{1,2}\s)/m);
    const missing = [];

    chapters.forEach((chapter) => {
        const title = (chapter.match(/^#{1,2}\s+(.+)$/m) || [null, '본문'])[1];
        const verseNums = Array.from(chapter.matchAll(/\[\[VERSE:(\d+)\]\]/g))
            .map(match => parseInt(match[1], 10))
            .filter(Number.isFinite);
        if (verseNums.length === 0) return;

        const max = Math.max(...verseNums);
        const found = new Set(verseNums);
        for (let num = 1; num <= max; num += 1) {
            if (!found.has(num)) {
                missing.push(`${title} ${num}절`);
            }
        }
    });

    return missing;
};

const findNextVerseToken = (text, expectedVerse) => {
    const verseText = String(expectedVerse);

    for (let index = 0; index < text.length; index += 1) {
        const prev = index > 0 ? text[index - 1] : '';
        if (/[0-9]/.test(prev)) continue;

        if (!text.startsWith(verseText, index)) continue;

        let end = index + verseText.length;
        const next = text[end] || '';

        // 10,000 / 3,000처럼 숫자 자체의 일부인 경우는 절 번호가 아니다.
        if (next === ',') continue;

        if (next === '.' || next === ')') {
            end += 1;
        } else if (/[0-9]/.test(next)) {
            // 새한글에는 "9"+"6일"처럼 절 번호와 본문 숫자가 붙는 경우가 있다.
            const strongBoundary = index === 0 || /[\u00A0\n\r.!?…"'“”‘’「」『』()[\]{}-]/.test(prev);
            if (!/[1-9]/.test(next) || !strongBoundary) continue;
        } else if (next && !/[\s\u00A0가-힣"“‘'「『]/.test(next)) {
            continue;
        }

        while (/[\s\u00A0]/.test(text[end] || '')) {
            end += 1;
        }

        return { index, end, verse: expectedVerse };
    }

    return null;
};

const markSequentialVerses = (line, expectedVerseRef, isFirstRef) => {
    let output = '';
    let cursor = 0;

    while (cursor < line.length) {
        const remaining = line.slice(cursor);
        const token = findNextVerseToken(remaining, expectedVerseRef.current);
        if (!token) {
            output += remaining;
            break;
        }

        const absoluteIndex = cursor + token.index;
        const absoluteEnd = cursor + token.end;
        output += line.slice(cursor, absoluteIndex);

        expectedVerseRef.current = token.verse + 1;
        const marker = `[[VERSE:${token.verse}]]`;
        if (isFirstRef.current && output.trim() === '') {
            output += marker;
        } else {
            output += `\n${marker}`;
        }
        isFirstRef.current = false;
        cursor = absoluteEnd;
    }

    return output;
};

/**
 * 새한글 버전 본문 전처리: 절 번호 앞에 줄바꿈 삽입 및 마크업 추가.
 * 순차 검증(1→2→3...)을 통해 본문 안 숫자가 절로 인식되는 것을 방지한다.
 */
export const formatSaehangulText = (text) => {
    if (!text) return text;

    const hasBoldMarkers = /\*\*\d+\s*\*\*/.test(text);

    if (hasBoldMarkers) {
        const lines = text.split('\n');
        const result = [];
        let expectedVerse = 1;
        let isFirst = true;

        for (const line of lines) {
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
                    return verseNum;
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

        return result.join('\n').replace(/\*\*([^*]+)\*\*/g, '$1');
    }

    const lines = text.split('\n');
    const result = [];
    const expectedVerseRef = { current: 1 };
    const isFirstRef = { current: true };

    for (const line of lines) {
        if (/^#{1,3}\s/.test(line)) {
            if (/^#{1,2}\s/.test(line)) {
                expectedVerseRef.current = 1;
                isFirstRef.current = true;
            }
            result.push(line);
            continue;
        }

        result.push(markSequentialVerses(line, expectedVerseRef, isFirstRef));
    }

    const formatted = result.join('\n');
    const missing = getMissingVerseNumbers(formatted);
    if (missing.length > 0) {
        console.warn('새한글 절 번호 누락 확인 필요:', missing.slice(0, 20).join(', '));
    }
    return formatted;
};

export const extractVerseMarkers = (text) => {
    return Array.from(String(text || '').matchAll(/\[\[VERSE:(\d+)\]\]/g))
        .map(match => Number(match[1]));
};
