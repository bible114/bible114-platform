import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { QUIZ_BANK } from '../src/data/bibleQuiz.js';
import { BOOKS, parseReadingRange } from '../src/utils/quizParsing.js';
import { shuffleQuizChoices } from '../src/utils/quizShuffle.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const QUIZ_DIR = path.join(ROOT, 'src/data/quiz');
const NT_EASY_DIR = path.join(ROOT, 'src/data/quizNtEasy');
const SCHEDULE_PATH = path.join(ROOT, 'src/data/read_schedules.json');
const OUTPUT_PATH = path.join(ROOT, 'supabase/functions/platform-api/quiz-answer-index.json');
const args = process.argv.slice(2);
const checkMode = args.includes('--check');

if (args.some(arg => arg !== '--check')) {
    throw new Error(`알 수 없는 인자: ${args.filter(arg => arg !== '--check').join(', ')}`);
}

const readJson = (filePath) => JSON.parse(fs.readFileSync(filePath, 'utf8'));

const jsonFiles = (directory) => fs.readdirSync(directory)
    .filter(fileName => fileName.endsWith('.json'))
    .sort();

const parseRef = (ref) => parseReadingRange(ref)[0] || null;

const isInReadingItem = (question, item) => {
    if (!question || question.book !== item.book || Number(question.ch) !== Number(item.ch)) return false;
    if (!item.vStart || !item.vEnd) return true;
    const ref = parseRef(question.ref);
    if (!ref?.vStart) return false;
    return ref.vStart >= item.vStart && ref.vStart <= item.vEnd;
};

const buildScheduleItems = (entries, label) => {
    if (!Array.isArray(entries) || entries.length !== 365) {
        throw new Error(`${label} 일정은 정확히 365일이어야 합니다.`);
    }
    return entries.map((entry, index) => ({
        day: index + 1,
        items: parseReadingRange(entry?.range),
    }));
};

const assertSourceQuestion = (question, key) => {
    if (!question || typeof question !== 'object') throw new Error(`${key}: 문항 객체가 아닙니다.`);
    if (!Array.isArray(question.choices) || question.choices.length < 2) {
        throw new Error(`${key}: choices가 유효하지 않습니다.`);
    }
    if (!Number.isInteger(question.answerIndex)
        || question.answerIndex < 0
        || question.answerIndex >= question.choices.length) {
        throw new Error(`${key}: answerIndex가 유효하지 않습니다.`);
    }
};

const questions = {};
const counts = { standard: 0, ntEasy: 0, bank: 0 };

const addRecord = (key, question, allowed, extra = {}) => {
    if (Object.hasOwn(questions, key)) throw new Error(`중복 key: ${key}`);
    assertSourceQuestion(question, key);

    const shuffled = shuffleQuizChoices({ ...question, key });
    if (!Number.isInteger(shuffled.answerIndex)
        || shuffled.answerIndex < 0
        || shuffled.answerIndex >= shuffled.choices.length) {
        throw new Error(`${key}: 섞은 뒤 answerIndex가 유효하지 않습니다.`);
    }

    for (const plan of ['whole', 'nt']) {
        if (!Array.isArray(allowed[plan])) throw new Error(`${key}: allowed.${plan}이 배열이 아닙니다.`);
        if (allowed[plan].some(day => !Number.isInteger(day) || day < 1 || day > 365)) {
            throw new Error(`${key}: allowed.${plan}에 1~365 밖의 day가 있습니다.`);
        }
        if (new Set(allowed[plan]).size !== allowed[plan].length) {
            throw new Error(`${key}: allowed.${plan}에 중복 day가 있습니다.`);
        }
    }

    questions[key] = {
        answerIndex: shuffled.answerIndex,
        allowed,
        ...extra,
    };
};

const schedules = readJson(SCHEDULE_PATH);
const scheduleItems = {
    whole: buildScheduleItems(schedules.whole_bible, 'whole_bible'),
    nt: buildScheduleItems(schedules.new_testament, 'new_testament'),
};

for (const fileName of jsonFiles(QUIZ_DIR)) {
    const slug = path.basename(fileName, '.json');
    const book = BOOKS.find(candidate => candidate.slug === slug);
    if (!book) throw new Error(`${fileName}: BOOKS에 없는 slug입니다.`);

    const sourceQuestions = readJson(path.join(QUIZ_DIR, fileName));
    if (!Array.isArray(sourceQuestions)) throw new Error(`${fileName}: 최상위 값이 배열이 아닙니다.`);

    sourceQuestions.forEach((question, index) => {
        const key = `${slug}-${question.ch}-${index + 1}`;
        const normalized = { ...question, book: book.full, slug };
        const allowed = Object.fromEntries(Object.entries(scheduleItems).map(([plan, days]) => [
            plan,
            days
                .filter(day => day.items.some(item => isInReadingItem(normalized, item)))
                .map(day => day.day),
        ]));
        addRecord(key, normalized, allowed);
        counts.standard += 1;
    });
}

for (const fileName of jsonFiles(NT_EASY_DIR)) {
    const entries = readJson(path.join(NT_EASY_DIR, fileName));
    if (!Array.isArray(entries)) throw new Error(`${fileName}: 최상위 값이 배열이 아닙니다.`);

    for (const entry of entries) {
        const day = Number(entry?.day);
        if (!Number.isInteger(day) || day < 1 || day > 365) {
            throw new Error(`${fileName}: 유효하지 않은 day ${entry?.day}`);
        }
        if (!Array.isArray(entry.questions)) throw new Error(`${fileName} day ${day}: questions가 배열이 아닙니다.`);

        entry.questions.forEach((question, index) => {
            const key = `ntEasy-${day}-${index + 1}`;
            addRecord(key, question, { whole: [], nt: [day] });
            counts.ntEasy += 1;
        });
    }
}

QUIZ_BANK.forEach((question, index) => {
    const key = `bank-${index}`;
    addRecord(key, question, { whole: [], nt: [] }, { legacyBank: true });
    counts.bank += 1;
});

const output = {
    schemaVersion: 1,
    questions,
};
const serialized = `${JSON.stringify(output, null, 2)}\n`;

if (checkMode) {
    if (!fs.existsSync(OUTPUT_PATH)) {
        throw new Error(`퀴즈 정답 인덱스가 없습니다. npm run generate:quiz-answer-index를 실행하세요: ${path.relative(ROOT, OUTPUT_PATH)}`);
    }
    const existing = fs.readFileSync(OUTPUT_PATH, 'utf8');
    if (existing !== serialized) {
        throw new Error('퀴즈 정답 인덱스가 원본 데이터와 일치하지 않습니다. npm run generate:quiz-answer-index를 실행하세요.');
    }
} else {
    fs.mkdirSync(path.dirname(OUTPUT_PATH), { recursive: true });
    fs.writeFileSync(OUTPUT_PATH, serialized);
}

console.log(`퀴즈 정답 인덱스 ${checkMode ? '검증' : '생성'} 완료: ${Object.keys(questions).length}개`);
console.log(`- 표준 ${counts.standard}개 / 신약 쉬운 퀴즈 ${counts.ntEasy}개 / 레거시 은행 ${counts.bank}개`);
console.log(`- ${path.relative(ROOT, OUTPUT_PATH)}`);
