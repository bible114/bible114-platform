import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { BOOKS, getBookBySlug, parseReadingRange } from '../src/utils/quizParsing.js';

const ROOT = process.cwd();
const QUIZ_DIR = path.join(ROOT, 'src/data/quiz');
const SCHEDULE_PATH = path.join(ROOT, 'src/data/read_schedules.json');
const BOOK_BY_SLUG = new Map(BOOKS.map(book => [book.slug, book]));
const BOOK_BY_FULL = new Map(BOOKS.map(book => [book.full, book]));
const REF_BOOK_PATTERN = new RegExp(`^(${BOOKS.map(book => book.full).sort((a, b) => b.length - a.length).join('|')})\\s+\\d+:\\d+`);

const add = (list, file, index, message) => {
    const loc = Number.isInteger(index) ? `${file}[${index}]` : file;
    list.push(`${loc}: ${message}`);
};

const readJsonFile = async (filePath) => JSON.parse(await fs.readFile(filePath, 'utf8'));

const validateQuestion = (question, index, file, book, errors) => {
    if (!question || typeof question !== 'object' || Array.isArray(question)) {
        add(errors, file, index, '문항은 객체여야 합니다.');
        return null;
    }

    if (!Number.isInteger(question.ch) || question.ch < 1) add(errors, file, index, 'ch는 1 이상의 정수여야 합니다.');
    if (typeof question.q !== 'string' || question.q.trim() === '') add(errors, file, index, 'q는 빈 문자열이 아니어야 합니다.');
    if (!Array.isArray(question.choices) || question.choices.length !== 4) {
        add(errors, file, index, 'choices는 정확히 4개여야 합니다.');
    } else {
        const normalizedChoices = question.choices.map(choice => String(choice || '').trim());
        if (normalizedChoices.some(choice => choice === '')) add(errors, file, index, 'choices에 빈 값이 있습니다.');
        if (new Set(normalizedChoices).size !== normalizedChoices.length) add(errors, file, index, 'choices 안에 중복 값이 있습니다.');
    }
    if (!Number.isInteger(question.answerIndex) || question.answerIndex < 0 || question.answerIndex > 3) {
        add(errors, file, index, 'answerIndex는 0-3 정수여야 합니다.');
    }
    if (typeof question.ref !== 'string' || question.ref.trim() === '') {
        add(errors, file, index, 'ref는 빈 문자열이 아니어야 합니다.');
    } else {
        const match = question.ref.trim().match(REF_BOOK_PATTERN);
        if (!match) {
            add(errors, file, index, 'ref는 "책 장:절" 형식이어야 합니다.');
        } else if (match[1] !== book.full) {
            add(errors, file, index, `ref 책(${match[1]})이 파일 책(${book.full})과 다릅니다.`);
        }
    }

    return Number.isInteger(question.ch) ? question.ch : null;
};

const parseRef = (ref) => parseReadingRange(ref)[0] || null;

const isInReadingItem = (question, item) => {
    if (!question || question.book !== item.book || Number(question.ch) !== Number(item.ch)) return false;
    if (!item.vStart || !item.vEnd) return true;
    const ref = parseRef(question.ref);
    if (!ref || !ref.vStart) return false;
    return ref.vStart >= item.vStart && ref.vStart <= item.vEnd;
};

const formatItem = (item) => {
    if (item.vStart && item.vEnd) return `${item.book} ${item.ch}:${item.vStart}-${item.vEnd}`;
    return `${item.book} ${item.ch}장`;
};

const loadQuizFiles = async () => {
    let dirEntries = [];
    try {
        dirEntries = await fs.readdir(QUIZ_DIR);
    } catch {
        return { jsonFiles: [], quizBySlug: new Map(), errors: ['src/data/quiz 디렉터리가 없습니다.'], warnings: [], report: [] };
    }

    const jsonFiles = dirEntries.filter(name => name.endsWith('.json')).sort();
    const errors = [];
    const warnings = [];
    const report = [];
    const quizBySlug = new Map();

    for (const fileName of jsonFiles) {
        const slug = fileName.replace(/\.json$/, '');
        const book = getBookBySlug(slug);
        if (!book) {
            add(errors, fileName, null, '알 수 없는 책 파일명입니다. 66권 영문 소문자 slug를 사용하세요.');
            continue;
        }

        let data;
        try {
            data = await readJsonFile(path.join(QUIZ_DIR, fileName));
        } catch (e) {
            add(errors, fileName, null, `JSON 파싱 실패: ${e.message}`);
            continue;
        }
        if (!Array.isArray(data)) {
            add(errors, fileName, null, '최상위 값은 배열이어야 합니다.');
            continue;
        }

        const seenByChapter = new Map();
        const countByChapter = new Map();
        const enriched = data.map((question, index) => {
            const ch = validateQuestion(question, index, fileName, book, errors);
            if (!ch) return null;

            const key = String(question.q || '').trim();
            if (!seenByChapter.has(ch)) seenByChapter.set(ch, new Set());
            const seen = seenByChapter.get(ch);
            if (seen.has(key)) add(errors, fileName, index, `${ch}장 안에서 q가 중복됩니다.`);
            seen.add(key);
            countByChapter.set(ch, (countByChapter.get(ch) || 0) + 1);

            return { ...question, book: book.full, slug, order: index };
        }).filter(Boolean);

        const minimum = book.testament === 'new' ? 5 : 3;
        const lowChapters = [...countByChapter.entries()]
            .filter(([, count]) => count < minimum)
            .map(([ch, count]) => `${ch}장(${count})`);
        if (lowChapters.length > 0) {
            warnings.push(`${fileName}: ${book.testament === 'new' ? '신약' : '구약'} 기준 장당 ${minimum}문항 미만 - ${lowChapters.join(', ')}`);
        }
        report.push(`${fileName}: ${data.length}문항, ${countByChapter.size}개 장`);
        quizBySlug.set(slug, enriched);
    }

    return { jsonFiles, quizBySlug, errors, warnings, report };
};

const getPoolForItems = (items, quizBySlug) => items.flatMap(item => {
    const questions = quizBySlug.get(item.slug) || [];
    return questions.filter(question => isInReadingItem(question, item));
});

const getMissingItems = (items, quizBySlug) => items.filter(item => {
    const questions = quizBySlug.get(item.slug) || [];
    return questions.filter(question => isInReadingItem(question, item)).length === 0;
});

const validateScheduleCoverage = async (quizBySlug) => {
    const schedules = await readJsonFile(SCHEDULE_PATH);
    const errors = [];
    const missingSummary = new Map();
    const ntSegments = [];

    for (const [planName, minPool] of [['whole_bible', 3], ['new_testament', 5]]) {
        const days = schedules[planName] || [];
        days.forEach((day, index) => {
            const dayNo = index + 1;
            const items = parseReadingRange(day.range);
            if (items.length === 0) {
                errors.push(`${planName} Day ${dayNo} (${day.date}, ${day.range}): 범위 파싱 결과가 비었습니다.`);
                return;
            }

            const missingItems = getMissingItems(items, quizBySlug);
            missingItems.forEach(item => {
                const key = `${item.slug}:${formatItem(item)}`;
                missingSummary.set(key, (missingSummary.get(key) || 0) + 1);
            });

            const pool = getPoolForItems(items, quizBySlug);
            if (planName === 'new_testament') {
                ntSegments.push({
                    day: dayNo,
                    date: day.date,
                    range: day.range,
                    items: items.map(formatItem).join(', '),
                    pool: pool.length,
                    missing: missingItems.map(formatItem).join(', '),
                    need: minPool,
                });
            }

            if (missingItems.length === 0 && pool.length < minPool) {
                errors.push(`${planName} Day ${dayNo} (${day.date}, ${day.range}): 문항 pool ${pool.length}개, 최소 ${minPool}개 필요.`);
            }
        });
    }

    return { errors, missingSummary, ntSegments };
};

const main = async () => {
    const { jsonFiles, quizBySlug, errors, warnings, report } = await loadQuizFiles();
    if (jsonFiles.length === 0) {
        console.log('검증할 퀴즈 JSON 파일이 없습니다. T28 문항 추가 후 다시 실행하세요.');
        return;
    }

    const coverage = await validateScheduleCoverage(quizBySlug);
    errors.push(...coverage.errors);

    console.log('퀴즈 문항 수 리포트');
    report.forEach(line => console.log(`- ${line}`));

    console.log('\n신약 세그먼트 목록');
    coverage.ntSegments.forEach(segment => {
        const suffix = segment.missing ? ` | 미저작: ${segment.missing}` : ` | pool ${segment.pool}/${segment.need}`;
        console.log(`- Day ${segment.day} (${segment.date}) ${segment.range} => ${segment.items}${suffix}`);
    });

    if (coverage.missingSummary.size > 0) {
        console.log('\n미저작 세그먼트 집계');
        [...coverage.missingSummary.entries()]
            .sort(([a], [b]) => a.localeCompare(b))
            .forEach(([key, count]) => console.log(`- ${key} (${count}일)`));
    }

    if (warnings.length > 0) {
        console.log('\n경고');
        warnings.forEach(line => console.log(`- ${line}`));
    }
    if (errors.length > 0) {
        console.error('\n오류');
        errors.forEach(line => console.error(`- ${line}`));
        process.exit(1);
    }

    console.log('\n검증 통과');
};

main().catch((e) => {
    console.error(e);
    process.exit(1);
});
