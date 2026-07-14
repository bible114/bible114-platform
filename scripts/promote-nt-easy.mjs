import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const VALIDATOR = path.join(ROOT, 'scripts/validate-nt-easy-candidates.mjs');
const REVIEW_DIR = path.join(ROOT, 'review');
const OUTPUT_DIR = path.join(ROOT, 'src/data/quizNtEasy');
const SHARDS = [
    ['nt_easy_quiz_candidates_001_122.json', 'nt_easy_001_122.json'],
    ['nt_easy_quiz_candidates_123_244.json', 'nt_easy_123_244.json'],
    ['nt_easy_quiz_candidates_245_365.json', 'nt_easy_245_365.json'],
];

const validation = spawnSync(process.execPath, [VALIDATOR], {
    cwd: ROOT,
    encoding: 'utf8',
    stdio: 'inherit',
});
if (validation.error) throw validation.error;
if (validation.status !== 0) {
    console.error('후보 검증이 실패해 앱 데이터를 변경하지 않았습니다.');
    process.exit(validation.status || 1);
}

const promotedShards = SHARDS.map(([sourceName, outputName]) => {
    const sourcePath = path.join(REVIEW_DIR, sourceName);
    const days = JSON.parse(fs.readFileSync(sourcePath, 'utf8'));
    const promoted = days.map(day => ({
        day: day.day,
        date: day.date,
        range: day.range,
        questions: day.questions.map(({ reviewStatus: _reviewStatus, ...question }) => question),
    }));
    return { outputName, promoted };
});

fs.mkdirSync(OUTPUT_DIR, { recursive: true });
for (const { outputName, promoted } of promotedShards) {
    const outputPath = path.join(OUTPUT_DIR, outputName);
    const temporaryPath = `${outputPath}.tmp`;
    fs.writeFileSync(temporaryPath, `${JSON.stringify(promoted, null, 2)}\n`);
}
for (const { outputName } of promotedShards) {
    const outputPath = path.join(OUTPUT_DIR, outputName);
    fs.renameSync(`${outputPath}.tmp`, outputPath);
}

const dayCount = promotedShards.reduce((sum, shard) => sum + shard.promoted.length, 0);
const questionCount = promotedShards.reduce(
    (sum, shard) => sum + shard.promoted.reduce((daySum, day) => daySum + day.questions.length, 0),
    0
);
console.log(`신약일독 쉬운 문제 앱 데이터 승격 완료: ${dayCount}일 / ${questionCount}문항`);
