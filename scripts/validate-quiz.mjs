import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

const ROOT = process.cwd();
const QUIZ_DIR = path.join(ROOT, 'src/data/quiz');

const BOOKS = [
    ['genesis', '창세기', 'old'], ['exodus', '출애굽기', 'old'], ['leviticus', '레위기', 'old'], ['numbers', '민수기', 'old'],
    ['deuteronomy', '신명기', 'old'], ['joshua', '여호수아', 'old'], ['judges', '사사기', 'old'], ['ruth', '룻기', 'old'],
    ['1samuel', '사무엘상', 'old'], ['2samuel', '사무엘하', 'old'], ['1kings', '열왕기상', 'old'], ['2kings', '열왕기하', 'old'],
    ['1chronicles', '역대상', 'old'], ['2chronicles', '역대하', 'old'], ['ezra', '에스라', 'old'], ['nehemiah', '느헤미야', 'old'],
    ['esther', '에스더', 'old'], ['job', '욥기', 'old'], ['psalms', '시편', 'old'], ['proverbs', '잠언', 'old'],
    ['ecclesiastes', '전도서', 'old'], ['songofsongs', '아가', 'old'], ['isaiah', '이사야', 'old'], ['jeremiah', '예레미야', 'old'],
    ['lamentations', '예레미야애가', 'old'], ['ezekiel', '에스겔', 'old'], ['daniel', '다니엘', 'old'], ['hosea', '호세아', 'old'],
    ['joel', '요엘', 'old'], ['amos', '아모스', 'old'], ['obadiah', '오바댜', 'old'], ['jonah', '요나', 'old'],
    ['micah', '미가', 'old'], ['nahum', '나훔', 'old'], ['habakkuk', '하박국', 'old'], ['zephaniah', '스바냐', 'old'],
    ['haggai', '학개', 'old'], ['zechariah', '스가랴', 'old'], ['malachi', '말라기', 'old'],
    ['matthew', '마태복음', 'new'], ['mark', '마가복음', 'new'], ['luke', '누가복음', 'new'], ['john', '요한복음', 'new'],
    ['acts', '사도행전', 'new'], ['romans', '로마서', 'new'], ['1corinthians', '고린도전서', 'new'], ['2corinthians', '고린도후서', 'new'],
    ['galatians', '갈라디아서', 'new'], ['ephesians', '에베소서', 'new'], ['philippians', '빌립보서', 'new'], ['colossians', '골로새서', 'new'],
    ['1thessalonians', '데살로니가전서', 'new'], ['2thessalonians', '데살로니가후서', 'new'], ['1timothy', '디모데전서', 'new'],
    ['2timothy', '디모데후서', 'new'], ['titus', '디도서', 'new'], ['philemon', '빌레몬서', 'new'], ['hebrews', '히브리서', 'new'],
    ['james', '야고보서', 'new'], ['1peter', '베드로전서', 'new'], ['2peter', '베드로후서', 'new'], ['1john', '요한일서', 'new'],
    ['2john', '요한이서', 'new'], ['3john', '요한삼서', 'new'], ['jude', '유다서', 'new'], ['revelation', '요한계시록', 'new'],
];

const BOOK_BY_SLUG = new Map(BOOKS.map(([slug, full, testament]) => [slug, { full, testament }]));
const REF_BOOK_PATTERN = new RegExp(`^(${BOOKS.map(([, full]) => full).sort((a, b) => b.length - a.length).join('|')})\\s+\\d+:\\d+`);

const add = (list, file, index, message) => {
    const loc = Number.isInteger(index) ? `${file}[${index}]` : file;
    list.push(`${loc}: ${message}`);
};

const readJsonFile = async (filePath) => {
    const raw = await fs.readFile(filePath, 'utf8');
    return JSON.parse(raw);
};

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

const main = async () => {
    let dirEntries = [];
    try {
        dirEntries = await fs.readdir(QUIZ_DIR);
    } catch {
        console.log('src/data/quiz 디렉터리가 없습니다.');
        return;
    }

    const jsonFiles = dirEntries.filter(name => name.endsWith('.json')).sort();
    if (jsonFiles.length === 0) {
        console.log('검증할 퀴즈 JSON 파일이 없습니다. T28 문항 추가 후 다시 실행하세요.');
        return;
    }

    const errors = [];
    const warnings = [];
    const report = [];

    for (const fileName of jsonFiles) {
        const slug = fileName.replace(/\.json$/, '');
        const book = BOOK_BY_SLUG.get(slug);
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
        data.forEach((question, index) => {
            const ch = validateQuestion(question, index, fileName, book, errors);
            if (!ch) return;

            const key = String(question.q || '').trim();
            if (!seenByChapter.has(ch)) seenByChapter.set(ch, new Set());
            const seen = seenByChapter.get(ch);
            if (seen.has(key)) add(errors, fileName, index, `${ch}장 안에서 q가 중복됩니다.`);
            seen.add(key);
            countByChapter.set(ch, (countByChapter.get(ch) || 0) + 1);
        });

        const minimum = book.testament === 'new' ? 5 : 3;
        const lowChapters = [...countByChapter.entries()]
            .filter(([, count]) => count < minimum)
            .map(([ch, count]) => `${ch}장(${count})`);
        if (lowChapters.length > 0) {
            warnings.push(`${fileName}: ${book.testament === 'new' ? '신약' : '구약'} 기준 장당 ${minimum}문항 미만 - ${lowChapters.join(', ')}`);
        }
        report.push(`${fileName}: ${data.length}문항, ${countByChapter.size}개 장`);
    }

    console.log('퀴즈 문항 수 리포트');
    report.forEach(line => console.log(`- ${line}`));
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
