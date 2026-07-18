// 현지 SWORD 모듈에서 신약 절 source를 읽어 운영 수리 검토용 staging snapshot을 만든다.
// 메시지 번역 원천은 포함하지 않으며, 결과 manifest는 repair 승인 manifest와 다른 kind를 쓴다.
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import schedules from '../src/data/read_schedules.json' with { type: 'json' };
import { parseReadingRange } from '../src/utils/quizParsing.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const BRIDGE = path.join(ROOT, 'scripts', 'read-nt-sword-source.py');
const DEFAULT_SWORD_PATH = path.join(os.homedir(), 'Library', 'Application Support', 'Sword');
const PLAN_SPECS = [
    { planId: 'nt_saehangul', moduleId: 'SaeHangul', titlePrefix: '새한글 신약일독' },
    { planId: 'nt_easy', moduleId: '쉬운성경', titlePrefix: '쉬운성경 신약일독' },
];
const EXPECTED_PLAN_IDS = PLAN_SPECS.map(spec => spec.planId);
const REQUIRED_MISSING_PLAN = 'nt_message';

const fail = message => {
    console.error(message);
    process.exit(1);
};
const args = process.argv.slice(2);
const option = name => {
    const index = args.indexOf(name);
    if (index < 0) return null;
    const value = args[index + 1];
    if (!value || value.startsWith('--')) fail(`${name} 값이 필요합니다.`);
    return value;
};
const recognized = new Set(['--output', '--sword-path', '--python', '--pythonpath']);
for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (!recognized.has(arg)) fail(`알 수 없는 옵션: ${arg}`);
    index += 1;
}

const outputArg = option('--output');
if (!outputArg) {
    fail('사용법: node scripts/export-nt-sword-staging.mjs --output <새 외부 절대경로> [--sword-path <절대경로>] [--python <절대경로>] [--pythonpath <절대경로>]');
}

const resolveAbsolute = (value, label) => {
    if (!path.isAbsolute(value)) fail(`${label}는 절대경로여야 합니다.`);
    return path.resolve(value);
};
const outputRoot = resolveAbsolute(outputArg, '--output');
const swordRoot = resolveAbsolute(option('--sword-path') || DEFAULT_SWORD_PATH, '--sword-path');
const python = resolveAbsolute(option('--python') || '/opt/homebrew/bin/python3.14', '--python');
const pythonPathArg = option('--pythonpath');
if (outputRoot === ROOT || outputRoot.startsWith(`${ROOT}${path.sep}`)) {
    fail('--output은 저장소 밖의 새 디렉터리여야 합니다. 본문 snapshot을 repo에 쓰지 않습니다.');
}
if (!fs.existsSync(python) || !fs.statSync(python).isFile()) fail(`Python 실행 파일이 없습니다: ${python}`);
if (!fs.existsSync(swordRoot) || !fs.statSync(swordRoot).isDirectory()) fail(`SWORD 경로가 없습니다: ${swordRoot}`);
if (fs.existsSync(outputRoot)) fail('--output은 아직 존재하지 않는 새 디렉터리여야 합니다.');

const sha256Buffer = value => crypto.createHash('sha256').update(value).digest('hex');
const sha256File = filename => sha256Buffer(fs.readFileSync(filename));
const sha256Json = value => sha256Buffer(`${JSON.stringify(value)}\n`);
const exactSignature = items => items.map(item => (
    `${item.slug}:${item.ch}:${item.vStart ?? '*'}-${item.vEnd ?? '*'}`
)).join('|');
const refKey = (slug, chapter, verse) => `${slug}:${chapter}:${verse}`;
const writePrivateJson = (filename, value) => {
    const descriptor = fs.openSync(filename, fs.constants.O_CREAT | fs.constants.O_EXCL | fs.constants.O_WRONLY, 0o600);
    try {
        fs.writeFileSync(descriptor, `${JSON.stringify(value)}\n`, 'utf8');
        fs.fsyncSync(descriptor);
    } finally {
        fs.closeSync(descriptor);
    }
    fs.chmodSync(filename, 0o600);
};

const discoverPythonPath = () => {
    if (pythonPathArg) return resolveAbsolute(pythonPathArg, '--pythonpath');
    const libRoot = path.resolve(ROOT, '..', '성경 읽어주는 AI', 'venv', 'lib');
    if (!fs.existsSync(libRoot)) return null;
    const candidates = fs.readdirSync(libRoot)
        .filter(name => name.startsWith('python'))
        .map(name => path.join(libRoot, name, 'site-packages'))
        .filter(candidate => fs.existsSync(path.join(candidate, 'pysword')));
    return candidates[0] || null;
};

const confMetadata = moduleId => {
    const confDir = path.join(swordRoot, 'mods.d');
    const conf = fs.readdirSync(confDir)
        .filter(name => name.endsWith('.conf'))
        .map(name => path.join(confDir, name))
        .find(filename => fs.readFileSync(filename, 'utf8').includes(`[${moduleId}]`));
    if (!conf) fail(`SWORD module conf를 찾지 못했습니다: ${moduleId}`);
    const raw = fs.readFileSync(conf, 'utf8');
    const values = {};
    for (const line of raw.split(/\r?\n/)) {
        const match = /^([^#;=]+)=(.*)$/.exec(line);
        if (match) values[match[1].trim().toLowerCase()] = match[2].trim();
    }
    const dataPath = values.datapath?.replace(/^\.\//, '');
    if (!dataPath) fail(`${moduleId}: DataPath가 없습니다.`);
    const moduleDir = path.join(swordRoot, dataPath);
    const sourceFiles = [conf, path.join(moduleDir, 'nt'), path.join(moduleDir, 'nt.vss')]
        .filter(filename => fs.existsSync(filename) && fs.statSync(filename).isFile())
        .map(filename => ({
            path: path.relative(swordRoot, filename),
            bytes: fs.statSync(filename).size,
            sha256: sha256File(filename),
        }));
    if (sourceFiles.length < 2) fail(`${moduleId}: NT source 파일이 불완전합니다.`);
    return {
        moduleId,
        description: values.description || null,
        version: values.version || null,
        sourceType: values.sourcetype || null,
        versification: values.versification || null,
        distributionLicense: values.distributionlicense || null,
        about: values.about || null,
        sourceFiles,
    };
};

const pythonPath = discoverPythonPath();
const bridge = spawnSync(python, [
    BRIDGE,
    '--sword-path', swordRoot,
    ...PLAN_SPECS.flatMap(spec => ['--module', `${spec.planId}=${spec.moduleId}`]),
], {
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
    env: { ...process.env, ...(pythonPath ? { PYTHONPATH: pythonPath } : {}) },
});
if (bridge.status !== 0) fail(`SWORD 읽기 실패: ${(bridge.stderr || bridge.stdout).trim()}`);
let extracted;
try {
    extracted = JSON.parse(bridge.stdout);
} catch {
    fail('SWORD reader가 유효한 JSON을 반환하지 않았습니다.');
}

const canonical = schedules.new_testament.map((entry, index) => {
    const items = parseReadingRange(entry.range);
    if (items.length === 0) fail(`canonical Day ${index + 1} 범위 파싱 실패`);
    return { day: index + 1, date: entry.date, range: entry.range, items, exactRangeSignature: exactSignature(items) };
});
if (canonical.length !== 365) fail(`canonical 일정이 365일이 아닙니다: ${canonical.length}`);

const prepared = {};
for (const spec of PLAN_SPECS) {
    const verses = extracted[spec.planId];
    if (!Array.isArray(verses)) fail(`${spec.planId}: 추출 결과가 없습니다.`);
    const verseMap = new Map();
    const chapters = new Map();
    for (const record of verses) {
        const key = refKey(record.bookSlug, record.chapter, record.verse);
        if (verseMap.has(key)) fail(`${spec.planId}: 중복 절 ${key}`);
        verseMap.set(key, record);
        const chapterKey = `${record.bookSlug}:${record.chapter}`;
        if (!chapters.has(chapterKey)) chapters.set(chapterKey, []);
        chapters.get(chapterKey).push(record);
    }
    if (new Set(verses.map(record => record.bookSlug)).size !== 27 || chapters.size !== 260) {
        fail(`${spec.planId}: 27권/260장 gate 실패`);
    }
    const consumed = [];
    for (const day of canonical) {
        for (const item of day.items) {
            const rows = chapters.get(`${item.slug}:${item.ch}`);
            if (!rows) fail(`${spec.planId}: canonical 장 누락 ${item.slug}:${item.ch}`);
            const start = item.vStart ?? 1;
            const end = item.vEnd === 999 || item.vEnd == null ? rows.at(-1).verse : item.vEnd;
            for (let verse = start; verse <= end; verse += 1) {
                const key = refKey(item.slug, item.ch, verse);
                if (!verseMap.has(key)) fail(`${spec.planId}: structural slot 누락 ${key}`);
                consumed.push(key);
            }
        }
    }
    // new_testament 일정은 권별 정경 순서가 아니라 마태-행전-서신-계시록을
    // 여러 구간으로 교차 배치한다. 따라서 순서 동일성이 아니라 slot 집합의
    // 정확한 1회 소비를 검증해야 한다.
    const consumedSet = new Set(consumed);
    if (consumed.length !== verses.length || consumedSet.size !== verses.length
        || [...verseMap.keys()].some(key => !consumedSet.has(key))) {
        fail(`${spec.planId}: canonical exact-range bijection 실패 (${consumed.length}/${verses.length})`);
    }
    const days = canonical.map(day => {
        const title = `${spec.titlePrefix} ${day.date.replace('-', '월 ')}일 / ${day.range}`;
        if (exactSignature(parseReadingRange(title)) !== day.exactRangeSignature) {
            fail(`${spec.planId}: Day ${day.day} canonical title round-trip 실패`);
        }
        return {
            day: day.day,
            title,
            audioUrl: null,
            exactRangeSignature: day.exactRangeSignature,
        };
    });
    prepared[spec.planId] = { verses, days, source: confMetadata(spec.moduleId) };
}

fs.mkdirSync(outputRoot, { mode: 0o700 });
fs.chmodSync(outputRoot, 0o700);
const plans = {};
for (const spec of PLAN_SPECS) {
    const data = prepared[spec.planId];
    const versesFile = `${spec.planId}-verses.json`;
    const daysFile = `${spec.planId}-days.json`;
    writePrivateJson(path.join(outputRoot, versesFile), data.verses);
    writePrivateJson(path.join(outputRoot, daysFile), data.days);
    plans[spec.planId] = {
        translationId: data.source.moduleId,
        versesFile,
        versesSha256: sha256File(path.join(outputRoot, versesFile)),
        daysFile,
        daysSha256: sha256File(path.join(outputRoot, daysFile)),
        expectedVerseCount: data.verses.length,
        expectedOmittedSlotCount: data.verses.filter(record => record.omitted === true).length,
        source: data.source,
    };
}
const manifest = {
    schemaVersion: 1,
    kind: 'bible114-nt-exact-verse-source-staging',
    stagingOnly: true,
    approvedForRepair: false,
    frozenAt: new Date().toISOString(),
    scheduleSha256: sha256Json(schedules.new_testament),
    includedPlans: EXPECTED_PLAN_IDS,
    missingPlans: [REQUIRED_MISSING_PLAN],
    plans,
};
writePrivateJson(path.join(outputRoot, 'manifest.json'), manifest);
console.log(JSON.stringify({
    output: outputRoot,
    manifestSha256: sha256File(path.join(outputRoot, 'manifest.json')),
    plans: Object.fromEntries(Object.entries(plans).map(([planId, plan]) => [planId, {
        verses: plan.expectedVerseCount,
        omitted: plan.expectedOmittedSlotCount,
    }])),
    stagingOnly: true,
    missingPlans: manifest.missingPlans,
}));
