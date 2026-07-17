import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { BOOKS, parseReadingRange } from '../src/utils/quizParsing.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SCHEDULE_PATH = path.join(ROOT, 'src/data/read_schedules.json');

// Protestant canon chapter counts. Keep this explicit so a new omission cannot
// be hidden by deriving expectations from the schedule under test.
const CHAPTER_COUNTS = [
    50, 40, 27, 36, 34, 24, 21, 4, 31, 24, 22, 25, 29, 36, 10, 13, 10, 42, 150,
    31, 12, 8, 66, 52, 5, 48, 12, 14, 3, 9, 1, 4, 7, 3, 3, 3, 2, 14, 4,
    28, 16, 24, 21, 28, 16, 16, 13, 6, 6, 4, 4, 5, 3, 6, 4, 3, 1, 13, 5, 5, 3,
    5, 1, 1, 1, 22,
];

if (BOOKS.length !== 66 || CHAPTER_COUNTS.length !== BOOKS.length) {
    throw new Error(`정경 메타데이터 불일치: books=${BOOKS.length}, chapterCounts=${CHAPTER_COUNTS.length}`);
}

const schedules = JSON.parse(fs.readFileSync(SCHEDULE_PATH, 'utf8'));

const validatePlan = ({ key, testament }) => {
    const entries = schedules[key];
    if (!Array.isArray(entries) || entries.length !== 365) {
        throw new Error(`${key}: 일정은 정확히 365일이어야 합니다.`);
    }

    const covered = new Set();
    const unparsable = [];
    entries.forEach((entry, index) => {
        const items = parseReadingRange(entry?.range);
        if (items.length === 0) unparsable.push(`Day ${index + 1} ${JSON.stringify(entry?.range || '')}`);
        items.forEach(item => covered.add(`${item.slug}:${item.ch}`));
    });

    const expectedBooks = BOOKS
        .map((book, index) => ({ ...book, chapterCount: CHAPTER_COUNTS[index] }))
        .filter(book => testament === 'all' || book.testament === testament);
    const missing = expectedBooks.flatMap(book => Array.from(
        { length: book.chapterCount },
        (_, index) => `${book.full} ${index + 1}장`,
    ).filter((_, index) => !covered.has(`${book.slug}:${index + 1}`)));

    if (unparsable.length > 0 || missing.length > 0) {
        const details = [
            ...(unparsable.length > 0 ? [`파싱 불가 ${unparsable.length}건: ${unparsable.join(', ')}`] : []),
            ...(missing.length > 0 ? [`누락 ${missing.length}장: ${missing.join(', ')}`] : []),
        ];
        throw new Error(`${key} 커버리지 실패\n- ${details.join('\n- ')}`);
    }

    const expectedChapterCount = expectedBooks.reduce((sum, book) => sum + book.chapterCount, 0);
    console.log(`✓ ${key}: ${expectedBooks.length}권 ${expectedChapterCount}장 전체 포함`);
};

validatePlan({ key: 'whole_bible', testament: 'all' });
validatePlan({ key: 'new_testament', testament: 'new' });
console.log('읽기 일정 66권 전장 커버리지 검사 통과');
