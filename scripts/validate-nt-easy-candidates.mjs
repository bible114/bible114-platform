import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseReadingRange } from '../src/utils/quizParsing.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const REVIEW_DIR = path.join(ROOT, 'review');
const SHARDS = [
    'nt_easy_quiz_candidates_001_122.json',
    'nt_easy_quiz_candidates_123_244.json',
    'nt_easy_quiz_candidates_245_365.json',
];
const schedules = JSON.parse(fs.readFileSync(path.join(ROOT, 'src/data/read_schedules.json'), 'utf8'));
const ntSchedule = schedules.new_testament;

const errors = [];
const warnings = [];
const days = [];
const normalizedQuestions = new Map();
const normalize = value => String(value || '').replace(/[\s?!.,'"“”‘’·]/g, '').toLowerCase();
const semanticSignature = question => {
    const choices = Array.isArray(question?.choices) ? question.choices : [];
    const answer = choices[question?.answerIndex] || '';
    return `${normalize(question?.q)}|${normalize(answer)}|${choices.map(normalize).sort().join('|')}`;
};
const existingSignatures = new Set();
const existingQuestionBodies = new Set();
const stripChapterLead = value => String(value || '').replace(/^[가-힣]+\s*\d+장에서?\s*/, '');
const stripCosmeticLead = value => String(value || '').replace(/^(?:이 이야기에서|이 장면에서|본문을 보면|그때|말씀 속에서)\s*/, '');
const canonicalQuestionBody = value => normalize(stripChapterLead(stripCosmeticLead(stripChapterLead(value))));
const quizDir = path.join(ROOT, 'src/data/quiz');
for (const filename of fs.readdirSync(quizDir).filter(name => name.endsWith('.json'))) {
    const questions = JSON.parse(fs.readFileSync(path.join(quizDir, filename), 'utf8'));
    questions.forEach(question => {
        existingSignatures.add(semanticSignature(question));
        existingQuestionBodies.add(normalize(question.q));
        existingQuestionBodies.add(normalize(stripChapterLead(question.q)));
        existingQuestionBodies.add(canonicalQuestionBody(question.q));
    });
}
const addError = (day, message) => errors.push(`Day ${day}: ${message}`);
const addWarning = (day, message) => warnings.push(`Day ${day}: ${message}`);

const refFallsInside = (refText, rangeText) => {
    const refs = parseReadingRange(refText);
    const ranges = parseReadingRange(rangeText);
    if (refs.length !== 1) return false;
    const ref = refs[0];
    return ranges.some(range => {
        if (range.book !== ref.book || Number(range.ch) !== Number(ref.ch)) return false;
        if (!range.vStart || !range.vEnd) return true;
        return Number(ref.vStart) >= Number(range.vStart) && Number(ref.vStart) <= Number(range.vEnd);
    });
};

for (const filename of SHARDS) {
    const filepath = path.join(REVIEW_DIR, filename);
    if (!fs.existsSync(filepath)) {
        errors.push(`파일 없음: review/${filename}`);
        continue;
    }
    const parsed = JSON.parse(fs.readFileSync(filepath, 'utf8'));
    if (!Array.isArray(parsed)) {
        errors.push(`${filename}: 최상위 값은 배열이어야 합니다.`);
        continue;
    }
    days.push(...parsed);
}

days.sort((a, b) => Number(a.day) - Number(b.day));

for (let expectedDay = 1; expectedDay <= 365; expectedDay += 1) {
    const matches = days.filter(item => Number(item.day) === expectedDay);
    if (matches.length !== 1) {
        addError(expectedDay, `후보 날짜가 ${matches.length}개입니다(정확히 1개 필요).`);
        continue;
    }
    const candidate = matches[0];
    const schedule = ntSchedule[expectedDay - 1];
    if (candidate.date !== schedule.date) addError(expectedDay, `date 불일치: ${candidate.date} / ${schedule.date}`);
    if (candidate.range !== schedule.range) addError(expectedDay, `range 불일치: ${candidate.range} / ${schedule.range}`);
    if (!Array.isArray(candidate.questions) || candidate.questions.length !== 5) {
        addError(expectedDay, `문항 수가 ${candidate.questions?.length ?? 0}개입니다(5개 필요).`);
        continue;
    }

    const dayQuestions = new Set();
    const dayAnswerIndexes = new Set();
    const dayCorrectAnswers = new Set();
    candidate.questions.forEach((question, index) => {
        const label = `${index + 1}번`;
        if (!question || typeof question !== 'object') {
            addError(expectedDay, `${label} 문항 객체가 없습니다.`);
            return;
        }
        if (typeof question.q !== 'string' || !question.q.trim()) addError(expectedDay, `${label} 질문이 비었습니다.`);
        if (question.q?.length > 55) addError(expectedDay, `${label} 질문이 너무 깁니다(${question.q.length}자).`);
        if (!Array.isArray(question.choices) || question.choices.length !== 4) {
            addError(expectedDay, `${label} 선택지는 4개여야 합니다.`);
        } else {
            if (new Set(question.choices.map(normalize)).size !== 4) addError(expectedDay, `${label} 선택지가 중복됩니다.`);
            question.choices.forEach((choice, choiceIndex) => {
                if (typeof choice !== 'string' || !choice.trim()) addError(expectedDay, `${label} ${choiceIndex + 1}번 선택지가 비었습니다.`);
                if (choice?.length > 35) addError(expectedDay, `${label} ${choiceIndex + 1}번 선택지가 너무 깁니다(${choice.length}자).`);
            });
        }
        if (!Number.isInteger(question.answerIndex) || question.answerIndex < 0 || question.answerIndex > 3) {
            addError(expectedDay, `${label} answerIndex가 0~3 정수가 아닙니다.`);
        } else {
            dayAnswerIndexes.add(question.answerIndex);
            dayCorrectAnswers.add(normalize(question.choices?.[question.answerIndex]));
        }
        if (!refFallsInside(question.ref, schedule.range)) {
            addError(expectedDay, `${label} 근거 ${question.ref}가 본문 범위 ${schedule.range} 밖입니다.`);
        }
        if (question.reviewStatus !== 'pending') addError(expectedDay, `${label} reviewStatus는 pending이어야 합니다.`);

        const qKey = normalize(question.q);
        if (dayQuestions.has(qKey)) addError(expectedDay, `${label} 질문이 같은 날 중복됩니다.`);
        dayQuestions.add(qKey);
        if (normalizedQuestions.has(qKey)) {
            addWarning(expectedDay, `${label} 질문이 Day ${normalizedQuestions.get(qKey)}와 중복됩니다.`);
        } else {
            normalizedQuestions.set(qKey, expectedDay);
        }
        if (existingSignatures.has(semanticSignature(question))) {
            addError(expectedDay, `${label} 기존 서비스 문항과 완전히 같습니다(재출제 필요).`);
        }
        if (existingQuestionBodies.has(qKey) || existingQuestionBodies.has(canonicalQuestionBody(question.q))) {
            addError(expectedDay, `${label} 기존 질문과 같거나 머리말만 바꾼 형태입니다(완전 재출제 필요).`);
        }

        if (/(아닌|않은|틀린|옳지 않은|잘못된)/.test(question.q || '')) addError(expectedDay, `${label} 부정형 질문입니다.`);
        if (/(몇 명|몇 번|몇 규빗|몇 달란트|정확한 수|족보)/.test(question.q || '')) addError(expectedDay, `${label} 숫자·족보 암기형입니다.`);
        if (/(중심 내용|가장 잘 요약|흐름|중요하게 다루는|내용과 일치|기억할 핵심|보여 주시거나 가르치신)/.test(question.q || '')) {
            addError(expectedDay, `${label} 쉬운 직접 회상형이 아닌 장 요약 템플릿입니다.`);
        }
        if (/^(이 이야기에서|이 장면에서|본문을 보면|그때|말씀 속에서)/.test(question.q || '')) {
            addError(expectedDay, `${label} 의미 없는 장식용 머리말로 시작합니다.`);
        }
        if (/(칭의|성화|예정론|속죄론|종말론|기독론|구속사)/.test(`${question.q} ${(question.choices || []).join(' ')}`)) {
            addWarning(expectedDay, `${label} 초신자에게 어려운 교리 용어가 있습니다.`);
        }
    });
    if (dayAnswerIndexes.size < 3) addError(expectedDay, `정답 위치가 ${dayAnswerIndexes.size}곳에만 몰려 있습니다(최소 3곳 필요).`);
    if (dayCorrectAnswers.size < 3) addError(expectedDay, `서로 다른 정답이 ${dayCorrectAnswers.size}개뿐입니다(반복 출제 확인).`);
}

const allCorrectAnswers = new Set(days.flatMap(day => (day.questions || []).map(question => normalize(question.choices?.[question.answerIndex]))));
for (const filename of SHARDS) {
    const shardDays = days.filter(day => {
        const shardNumber = Number(filename.match(/_(\d{3})_(\d{3})\.json$/)?.[1]);
        const shardEnd = Number(filename.match(/_(\d{3})_(\d{3})\.json$/)?.[2]);
        return Number(day.day) >= shardNumber && Number(day.day) <= shardEnd;
    });
    let distractorCount = 0;
    let reusedAnswerCount = 0;
    shardDays.forEach(day => (day.questions || []).forEach(question => (question.choices || []).forEach((choice, index) => {
        if (index === question.answerIndex) return;
        distractorCount += 1;
        if (allCorrectAnswers.has(normalize(choice))) reusedAnswerCount += 1;
    })));
    if (distractorCount > 0 && reusedAnswerCount / distractorCount >= 0.75) {
        errors.push(`${filename}: 오답 ${reusedAnswerCount}/${distractorCount}개가 다른 문항의 정답을 재사용합니다(전역 셔플 대신 본문별 오답 필요).`);
    }
}

assert.equal(days.length, 365, `후보 날짜 수가 ${days.length}개입니다(365개 필요).`);

console.log(`신약일독 쉬운 문제 후보: ${days.length}일 / ${days.reduce((sum, day) => sum + (day.questions?.length || 0), 0)}문항`);
console.log(`오류 ${errors.length}건 / 검토 경고 ${warnings.length}건`);
if (warnings.length > 0) console.log(`\n[검토 경고]\n${warnings.join('\n')}`);
if (errors.length > 0) {
    console.error(`\n[오류]\n${errors.join('\n')}`);
    process.exitCode = 1;
}
