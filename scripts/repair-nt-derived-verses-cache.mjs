// 신약 파생 캐시 3종을 신뢰된 절 단위 frozen snapshot에서 재조립하는 안전 도구 초안.
// 기본은 dry-run이다. --apply 없이는 backup/commit/rollback을 절대 실행하지 않는다.
// 본문과 title은 stdout/stderr에 출력하지 않고 해시와 집계만 보고한다.
//
// source/manifest.json schemaVersion 1:
// {
//   "schemaVersion": 1,
//   "kind": "bible114-nt-exact-verse-source",
//   "frozenAt": "ISO timestamp",
//   "scheduleSha256": "...",
//   "plans": {
//     "nt_saehangul": {
//       "translationId": "...",
//       "versesFile": "nt_saehangul-verses.json",
//       "versesSha256": "...",
//       "daysFile": "nt_saehangul-days.json",
//       "daysSha256": "...",
//       "expectedVerseCount": 7957,
//       "expectedOmittedSlotCount": 0
//     }
//   }
// }
// versesFile: [{bookSlug,bookLabel,chapter,verse,segments:[
//   {kind:"heading",text:"..."} 또는
//   {kind:"text",text:"...",paragraphStart:true|false,joinBefore:""|" "}
// ], omitted?:true}]
// 원판의 절 번호 자리만 있고 본문이 비어 있는 경우에만 omitted:true와
// segments:[]를 함께 쓴다. 빈 절을 앞뒤 절에 합치거나 임의 보충하지 않는다.
// daysFile: [{day,title,audioUrl:null|"https://...",exactRangeSignature:"..."}]
//
// 절 레코드는 더 작은 단위로 자르지 않는다. canonical 일정이 절 레코드 전체를
// 정확히 한 번씩 소비해야 하므로 분할절 경계의 누락/중복/말단 소실은 gate에서 중단된다.
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

import schedules from '../src/data/read_schedules.json' with { type: 'json' };
import { parseReadingRange } from '../src/utils/quizParsing.js';

const PROJECT_ID = 'bible114-platform';
const PLAN_IDS = ['nt_saehangul', 'nt_easy', 'nt_message'];
const DAY_COUNT = 365;
const EXPECTED_BOOKS = 27;
const EXPECTED_CHAPTERS = 260;
const MAX_ATOMIC_WRITES = 450;
// 운영 수리 계약: title/text만 수정한다. audioUrl은 source와 운영이 같은지
// 사전 검증하고 non-target 필드로 그대로 보존한다.
const TARGET_FIELDS = ['title', 'text'];
// 신뢰 번역 원천과 frozen manifest가 아직 사용자/Claude 승인을 받지 않았다.
// 승인 뒤 검토된 manifest SHA-256을 코드 리뷰로 고정하기 전에는 --apply를 막는다.
const APPROVED_SOURCE_MANIFEST_SHA256 = null;
// rollback도 별도 검토된 receipt 해시를 코드에 고정하기 전에는 운영 인증/쓰기를 막는다.
const APPROVED_REPAIR_RECEIPT_SHA256 = null;
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const args = process.argv.slice(2);
const optionValue = name => {
    const index = args.indexOf(name);
    if (index < 0) return null;
    const value = args[index + 1];
    if (!value || value.startsWith('--')) throw new Error(`${name} 값이 필요합니다.`);
    return value;
};
const applyMode = args.includes('--apply');
const sourceArg = optionValue('--source');
const backupDirArg = optionValue('--backup-dir');
const rollbackArg = optionValue('--rollback');
const receiptArg = optionValue('--receipt');
const recognized = new Set(['--apply', '--source', '--backup-dir', '--rollback', '--receipt']);
for (let index = 0; index < args.length; index += 1) {
    if (!args[index].startsWith('--')) continue;
    if (!recognized.has(args[index])) throw new Error(`알 수 없는 옵션: ${args[index]}`);
    if (args[index] !== '--apply') index += 1;
}
if (rollbackArg) {
    if (!applyMode || !receiptArg || sourceArg || backupDirArg) {
        throw new Error('rollback 사용법: --rollback <backup.json> --receipt <receipt.json> --apply');
    }
} else if (!sourceArg) {
    throw new Error('사용법: --source <frozen snapshot 절대경로> [--backup-dir <절대경로>] [--apply]');
}

const sha256Buffer = value => crypto.createHash('sha256').update(value).digest('hex');
const sha256File = file => sha256Buffer(fs.readFileSync(file));
const sha256Json = value => sha256Buffer(`${JSON.stringify(value)}\n`);
const stable = value => {
    if (Array.isArray(value)) return value.map(stable);
    if (!value || typeof value !== 'object') return value;
    return Object.fromEntries(Object.keys(value).sort().map(key => [key, stable(value[key])]));
};
const same = (left, right) => JSON.stringify(stable(left)) === JSON.stringify(stable(right));
const requireAbsoluteFile = (root, relative, label) => {
    if (typeof relative !== 'string' || !relative || path.isAbsolute(relative) || relative.includes('..')) {
        throw new Error(`${label}: snapshot 내부 상대경로가 안전하지 않습니다.`);
    }
    const resolved = path.resolve(root, relative);
    if (!resolved.startsWith(`${root}${path.sep}`) || !fs.statSync(resolved).isFile() || fs.lstatSync(resolved).isSymbolicLink()) {
        throw new Error(`${label}: frozen source 파일이 아니거나 symlink입니다.`);
    }
    return resolved;
};
const readJson = file => JSON.parse(fs.readFileSync(file, 'utf8'));
const exactSignature = items => items.map(item => (
    `${item.slug}:${item.ch}:${item.vStart ?? '*'}-${item.vEnd ?? '*'}`
)).join('|');
const chapterSignature = items => [...new Set(items.map(item => `${item.slug}:${item.ch}`))].join('|');
const refKey = (slug, chapter, verse) => `${slug}:${chapter}:${verse}`;
const firestoreString = value => ({ stringValue: value });
const sameAudioValue = (current, expected) => expected === null
    ? current === undefined || current?.nullValue === null
    : current?.stringValue === expected;
const snapshotSha256 = (documents, ids) => sha256Json(stable(ids.map(id => {
    const document = documents.get(`${documentBase}/verses/${id}`);
    return { name: document?.name, updateTime: document?.updateTime, fields: document?.fields };
})));

const canonical = schedules.new_testament.map((entry, index) => {
    const items = parseReadingRange(entry?.range);
    if (items.length === 0) throw new Error(`canonical Day ${index + 1} 범위를 파싱할 수 없습니다.`);
    return {
        day: index + 1,
        items,
        exactRangeSignature: exactSignature(items),
        chapterSignature: chapterSignature(items),
    };
});
if (canonical.length !== DAY_COUNT) throw new Error(`canonical 일정이 ${DAY_COUNT}일이 아닙니다.`);
const scheduleSha256 = sha256Json(schedules.new_testament);

const renderDay = (records, dayRow) => {
    if (!records.some(record => record.omitted !== true
        && record.segments.some(segment => segment.kind === 'text'))) {
        throw new Error(`Day ${dayRow.day}: 실제 본문 segment가 없습니다.`);
    }
    const sections = [];
    let currentChapter = '';
    let paragraphs = [];
    const flushParagraphs = () => {
        if (paragraphs.length > 0) sections.push(paragraphs.join(''));
        paragraphs = [];
    };
    for (const record of records) {
        const chapter = `${record.bookSlug}:${record.chapter}`;
        if (chapter !== currentChapter) {
            flushParagraphs();
            sections.push(`### ${record.bookLabel} ${record.chapter}장`);
            currentChapter = chapter;
        }
        for (const segment of record.segments) {
            if (segment.kind === 'heading') {
                flushParagraphs();
                sections.push(`#### ${segment.text}`);
                continue;
            }
            if (segment.paragraphStart === true || paragraphs.length === 0) {
                flushParagraphs();
                paragraphs.push(segment.text);
            } else {
                paragraphs.push(`${segment.joinBefore}${segment.text}`);
            }
        }
    }
    flushParagraphs();
    const text = sections.join('\n\n').trim();
    if (!text) throw new Error(`Day ${dayRow.day}: 조립 본문이 비었습니다.`);
    return text;
};

const validateVerseRecord = (record, planId) => {
    if (!record || typeof record !== 'object' || Array.isArray(record)
        || typeof record.bookSlug !== 'string' || !record.bookSlug
        || typeof record.bookLabel !== 'string' || !record.bookLabel.trim()
        || !Number.isSafeInteger(record.chapter) || record.chapter < 1
        || !Number.isSafeInteger(record.verse) || record.verse < 1
        || !Array.isArray(record.segments)) {
        throw new Error(`${planId}: 절 source record schema가 올바르지 않습니다.`);
    }
    if (record.segments.length === 0) {
        if (record.omitted !== true) {
            throw new Error(`${planId}: 빈 절 slot은 omitted:true로 명시해야 합니다.`);
        }
        if (Object.keys(record).sort().join('|') !== 'bookLabel|bookSlug|chapter|omitted|segments|verse') {
            throw new Error(`${planId}: omitted 절 record key가 엄격 schema와 다릅니다.`);
        }
        return;
    }
    if (Object.keys(record).sort().join('|') !== 'bookLabel|bookSlug|chapter|segments|verse') {
        throw new Error(`${planId}: 본문 절 record key가 엄격 schema와 다릅니다.`);
    }
    for (const segment of record.segments) {
        if (!segment || typeof segment !== 'object' || typeof segment.text !== 'string' || !segment.text.trim()
            || /\r/.test(segment.text) || /^#{1,3}\s/m.test(segment.text)) {
            throw new Error(`${planId}: source segment가 비었거나 chapter heading을 포함합니다.`);
        }
        if (segment.kind === 'heading') {
            if (Object.keys(segment).sort().join('|') !== 'kind|text') {
                throw new Error(`${planId}: heading segment key가 엄격 schema와 다릅니다.`);
            }
        } else if (segment.kind === 'text') {
            if (Object.keys(segment).sort().join('|') !== 'joinBefore|kind|paragraphStart|text'
                || typeof segment.paragraphStart !== 'boolean' || !['', ' '].includes(segment.joinBefore)) {
                throw new Error(`${planId}: text segment 경계 정보가 올바르지 않습니다.`);
            }
        } else throw new Error(`${planId}: 알 수 없는 segment 종류입니다.`);
    }
};

const buildTargets = sourceRoot => {
    if (!path.isAbsolute(sourceRoot)) throw new Error('--source는 절대경로여야 합니다.');
    const root = path.resolve(sourceRoot);
    if (!fs.statSync(root).isDirectory() || fs.lstatSync(root).isSymbolicLink()) {
        throw new Error('frozen source는 symlink가 아닌 디렉터리여야 합니다.');
    }
    const manifestPath = path.join(root, 'manifest.json');
    if (!fs.statSync(manifestPath).isFile() || fs.lstatSync(manifestPath).isSymbolicLink()) {
        throw new Error('frozen manifest는 symlink가 아닌 파일이어야 합니다.');
    }
    const manifest = readJson(manifestPath);
    if (manifest.schemaVersion !== 1 || manifest.kind !== 'bible114-nt-exact-verse-source'
        || !Number.isFinite(Date.parse(manifest.frozenAt))
        || manifest.scheduleSha256 !== scheduleSha256
        || Object.keys(manifest.plans || {}).sort().join('|') !== [...PLAN_IDS].sort().join('|')) {
        throw new Error('frozen manifest/schedule/plan gate가 실패했습니다.');
    }
    const targets = new Map();
    const sourceSummary = {};
    for (const planId of PLAN_IDS) {
        const spec = manifest.plans[planId];
        if (!spec || typeof spec.translationId !== 'string' || !spec.translationId
            || !Number.isSafeInteger(spec.expectedVerseCount)
            || spec.expectedVerseCount < 7000 || spec.expectedVerseCount > 9000
            || !Number.isSafeInteger(spec.expectedOmittedSlotCount)
            || spec.expectedOmittedSlotCount < 0
            || spec.expectedOmittedSlotCount >= spec.expectedVerseCount) {
            throw new Error(`${planId}: source manifest plan gate 실패`);
        }
        const versesPath = requireAbsoluteFile(root, spec.versesFile, `${planId} verses`);
        const daysPath = requireAbsoluteFile(root, spec.daysFile, `${planId} days`);
        if (sha256File(versesPath) !== spec.versesSha256 || sha256File(daysPath) !== spec.daysSha256) {
            throw new Error(`${planId}: frozen source SHA-256 불일치`);
        }
        const verses = readJson(versesPath);
        const days = readJson(daysPath);
        if (!Array.isArray(verses) || verses.length !== spec.expectedVerseCount
            || !Array.isArray(days) || days.length !== DAY_COUNT) {
            throw new Error(`${planId}: source verse/day 개수 불일치`);
        }
        const verseMap = new Map();
        const chapters = new Map();
        let omittedVerses = 0;
        for (const record of verses) {
            validateVerseRecord(record, planId);
            if (record.omitted === true) omittedVerses += 1;
            const key = refKey(record.bookSlug, record.chapter, record.verse);
            if (verseMap.has(key)) throw new Error(`${planId}: source 절 중복`);
            verseMap.set(key, record);
            const chapterKey = `${record.bookSlug}:${record.chapter}`;
            if (!chapters.has(chapterKey)) chapters.set(chapterKey, []);
            chapters.get(chapterKey).push(record);
        }
        if (omittedVerses !== spec.expectedOmittedSlotCount) {
            throw new Error(`${planId}: omitted slot 개수 불일치`);
        }
        const books = new Set(verses.map(record => record.bookSlug));
        if (books.size !== EXPECTED_BOOKS || chapters.size !== EXPECTED_CHAPTERS) {
            throw new Error(`${planId}: 27권/260장 gate 실패`);
        }
        for (const records of chapters.values()) {
            records.sort((left, right) => left.verse - right.verse);
            records.forEach((record, index) => {
                if (record.verse !== index + 1) throw new Error(`${planId}: 장 안의 절 번호가 연속적이지 않습니다.`);
            });
        }
        const dayByNumber = new Map();
        for (const row of days) {
            if (!row || typeof row !== 'object' || !Number.isSafeInteger(row.day)
                || row.day < 1 || row.day > DAY_COUNT || dayByNumber.has(row.day)
                || typeof row.title !== 'string' || !row.title.trim()
                || ![null, 'string'].includes(row.audioUrl === null ? null : typeof row.audioUrl)
                || (typeof row.audioUrl === 'string' && !/^https:\/\//.test(row.audioUrl))
                || row.exactRangeSignature !== canonical[row.day - 1].exactRangeSignature
                || exactSignature(parseReadingRange(row.title)) !== row.exactRangeSignature) {
                throw new Error(`${planId}: canonical day title/audio/range gate 실패`);
            }
            dayByNumber.set(row.day, row);
        }
        const consumed = [];
        for (const canonicalDay of canonical) {
            const records = [];
            for (const item of canonicalDay.items) {
                const chapterRecords = chapters.get(`${item.slug}:${item.ch}`);
                if (!chapterRecords) throw new Error(`${planId}: canonical chapter source 누락`);
                const start = item.vStart ?? 1;
                // parseReadingRange의 cross-chapter 시작 장은 vEnd=999 sentinel로
                // "그 장의 끝"을 나타낸다. 실제 source 말단 절로만 해석한다.
                const end = item.vEnd === 999 || item.vEnd == null
                    ? chapterRecords.at(-1).verse
                    : item.vEnd;
                if (start < 1 || end < start || end > chapterRecords.at(-1).verse) {
                    throw new Error(`${planId}: canonical 절 경계가 source 밖입니다.`);
                }
                for (let verse = start; verse <= end; verse += 1) {
                    const record = verseMap.get(refKey(item.slug, item.ch, verse));
                    if (!record) throw new Error(`${planId}: exact range 절 source 누락`);
                    records.push(record);
                    consumed.push(refKey(item.slug, item.ch, verse));
                }
            }
            const dayRow = dayByNumber.get(canonicalDay.day);
            const text = renderDay(records, dayRow);
            const parsedBody = [];
            for (const line of text.split(/\n/)) {
                const match = /^###\s+(.+)$/.exec(line.trim());
                if (match) parsedBody.push(...parseReadingRange(match[1]));
            }
            if (chapterSignature(parsedBody) !== canonicalDay.chapterSignature) {
                throw new Error(`${planId}: 조립 본문 chapter heading gate 실패`);
            }
            targets.set(`${planId}_${canonicalDay.day}`, {
                title: dayRow.title,
                text,
                audioUrl: dayRow.audioUrl,
            });
        }
        // 일정은 정경 권 순서가 아니라 여러 권 구간을 교차 배치한다. 따라서
        // 입력 파일 순서와 비교하지 않고 모든 structural slot의 정확한 1회
        // 소비를 집합으로 검증한다.
        const consumedSet = new Set(consumed);
        if (consumed.length !== spec.expectedVerseCount
            || consumedSet.size !== spec.expectedVerseCount
            || [...verseMap.keys()].some(key => !consumedSet.has(key))) {
            throw new Error(`${planId}: canonical exact range bijection gate 실패`);
        }
        sourceSummary[planId] = {
            verseSlots: verses.length,
            renderedVerses: verses.length - omittedVerses,
            omittedSlots: omittedVerses,
            chapters: chapters.size,
            books: books.size,
            targetDocuments: DAY_COUNT,
            targetContentSha256: sha256Json([...targets.entries()].filter(([id]) => id.startsWith(`${planId}_`))),
        };
    }
    for (const day of [136, 137, 239, 315]) {
        for (const planId of PLAN_IDS) {
            if (!targets.has(`${planId}_${day}`)) throw new Error(`${planId} Day ${day}: 필수 경계 gate 누락`);
        }
    }
    return { manifest, manifestSha256: sha256File(manifestPath), targets, sourceSummary };
};

const firebaseAccess = async () => {
    const roots = [
        '/opt/homebrew/lib/node_modules/firebase-tools',
        '/usr/local/lib/node_modules/firebase-tools',
    ].filter(root => fs.existsSync(`${root}/package.json`));
    if (roots.length === 0) throw new Error('Firebase CLI 로그인을 찾지 못했습니다.');
    const require = createRequire(`${roots[0]}/package.json`);
    const auth = require('./lib/auth');
    const account = auth.getGlobalDefaultAccount();
    if (!account?.tokens?.refresh_token) throw new Error('Firebase CLI 로그인 정보가 없습니다.');
    const scopes = String(account.tokens.scope || 'https://www.googleapis.com/auth/cloud-platform')
        .split(/\s+/).filter(Boolean);
    const access = await auth.getAccessToken(account.tokens.refresh_token, scopes);
    return access?.access_token || access;
};
const documentBase = `projects/${PROJECT_ID}/databases/(default)/documents`;
const apiRoot = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents`;
const fetchDocuments = async (token, ids, fieldPaths = null) => {
    const found = new Map();
    for (let offset = 0; offset < ids.length; offset += 100) {
        const body = { documents: ids.slice(offset, offset + 100).map(id => `${documentBase}/verses/${id}`) };
        if (fieldPaths) body.mask = { fieldPaths };
        const response = await fetch(`${apiRoot}:batchGet`, {
            method: 'POST',
            headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
        });
        if (!response.ok) throw new Error(`verses batchGet 실패: HTTP ${response.status}`);
        for (const row of await response.json()) if (row.found) found.set(row.found.name, row.found);
    }
    if (found.size !== ids.length) throw new Error(`운영 verses 누락: ${found.size}/${ids.length}`);
    return found;
};
const commit = async (token, writes, label) => {
    const response = await fetch(`${apiRoot}:commit`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ writes }),
    });
    if (!response.ok) throw new Error(`${label} commit 실패: HTTP ${response.status}`);
};
const encodedTarget = target => ({
    title: firestoreString(target.title),
    text: firestoreString(target.text),
});
const writePrivateJson = (file, value) => {
    fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600, flag: 'wx' });
    fs.chmodSync(file, 0o600);
};

const runRollback = async () => {
    if (!path.isAbsolute(rollbackArg) || !path.isAbsolute(receiptArg)) {
        throw new Error('--rollback과 --receipt는 절대경로여야 합니다.');
    }
    const backupPath = path.resolve(rollbackArg);
    const receiptPath = path.resolve(receiptArg);
    const receiptSha256 = sha256File(receiptPath);
    if (APPROVED_REPAIR_RECEIPT_SHA256 === null
        || receiptSha256 !== APPROVED_REPAIR_RECEIPT_SHA256) {
        throw new Error('승인된 repair receipt SHA-256이 코드에 고정되지 않아 rollback을 중단했습니다.');
    }
    const backup = readJson(backupPath);
    const receipt = readJson(receiptPath);
    if (receipt.schemaVersion !== 1 || receipt.kind !== 'bible114-nt-cache-repair-receipt'
        || receipt.backupSha256 !== sha256File(backupPath)
        || backup.schemaVersion !== 1 || backup.kind !== 'bible114-nt-cache-raw-backup') {
        throw new Error('rollback backup/receipt 무결성 gate 실패');
    }
    const ids = receipt.changedIds;
    if (!Array.isArray(ids) || ids.length < 1 || ids.length > MAX_ATOMIC_WRITES) {
        throw new Error('rollback changed ID gate 실패');
    }
    const token = await firebaseAccess();
    const live = await fetchDocuments(token, ids);
    const backupById = new Map(backup.documents.map(document => [document.name.split('/').pop(), document]));
    const writes = ids.map(id => {
        const current = live.get(`${documentBase}/verses/${id}`);
        if (current.updateTime !== receipt.postApplyUpdateTimes[id]) {
            throw new Error('rollback CAS gate 실패: 적용 뒤 운영 문서가 변경됐습니다.');
        }
        const original = backupById.get(id);
        if (!original) throw new Error('rollback 원본 문서 누락');
        const fieldPaths = [...new Set([...Object.keys(original.fields || {}), ...TARGET_FIELDS])].sort();
        return {
            update: { name: original.name, fields: original.fields || {} },
            updateMask: { fieldPaths },
            currentDocument: { updateTime: current.updateTime },
        };
    });
    await commit(token, writes, 'rollback');
    const after = await fetchDocuments(token, ids);
    for (const id of ids) {
        const original = backupById.get(id);
        const restored = after.get(`${documentBase}/verses/${id}`);
        if (!same(original.fields || {}, restored.fields || {})) throw new Error('rollback 사후 원본 불일치');
    }
    console.log(JSON.stringify({ mode: 'rollback', result: 'PASS', restoredDocuments: ids.length }, null, 2));
};

const runRepair = async () => {
    const sourceRoot = path.resolve(sourceArg);
    const source = buildTargets(sourceRoot);
    if (applyMode && (
        APPROVED_SOURCE_MANIFEST_SHA256 === null
        || source.manifestSha256 !== APPROVED_SOURCE_MANIFEST_SHA256
    )) {
        throw new Error('승인된 frozen source manifest SHA-256이 코드에 고정되지 않아 --apply를 중단했습니다.');
    }
    const ids = [...source.targets.keys()].sort();
    if (ids.length !== PLAN_IDS.length * DAY_COUNT) throw new Error('target 문서 수 gate 실패');
    const token = await firebaseAccess();
    let before = await fetchDocuments(token, ids);
    const plannedLiveSnapshotSha256 = snapshotSha256(before, ids);
    const changedIds = [];
    for (const id of ids) {
        const current = before.get(`${documentBase}/verses/${id}`);
        const target = source.targets.get(id);
        const expected = encodedTarget(target);
        if (!sameAudioValue(current.fields?.audioUrl, target.audioUrl)) {
            throw new Error('운영 audioUrl과 승인 source가 달라 title/text 수리를 중단했습니다.');
        }
        if (!same(Object.fromEntries(TARGET_FIELDS.map(field => [field, current.fields?.[field]])), expected)) {
            changedIds.push(id);
        }
    }
    if (changedIds.length > MAX_ATOMIC_WRITES) {
        throw new Error(`변경 ${changedIds.length}건은 단일 원자 commit 상한 ${MAX_ATOMIC_WRITES}을 넘습니다. 포인터 전환 설계 없이는 적용하지 않습니다.`);
    }
    console.log(JSON.stringify({
        mode: applyMode ? 'apply-preflight' : 'dry-run',
        sourceManifestSha256: source.manifestSha256,
        scheduleSha256,
        plans: source.sourceSummary,
        liveDocuments: before.size,
        changedDocuments: changedIds.length,
        unchangedDocuments: ids.length - changedIds.length,
        atomicCommitEligible: changedIds.length <= MAX_ATOMIC_WRITES,
        plannedLiveSnapshotSha256,
        audioUrlPreservedByGate: true,
        rawContentPrinted: false,
    }, null, 2));
    if (!applyMode || changedIds.length === 0) return;

    const backupDir = backupDirArg ? path.resolve(backupDirArg) : path.dirname(sourceRoot);
    if (!path.isAbsolute(backupDir) || !fs.statSync(backupDir).isDirectory()) {
        throw new Error('--backup-dir은 기존 절대 디렉터리여야 합니다.');
    }
    // dry-run 계획 뒤 운영 문서가 하나라도 바뀌었으면 새 snapshot으로 계획부터
    // 다시 세우게 한다. 이 재조회가 통과한 원본만 backup과 CAS write에 사용한다.
    const writeTimeSnapshot = await fetchDocuments(token, ids);
    const writeTimeSnapshotSha256 = snapshotSha256(writeTimeSnapshot, ids);
    if (writeTimeSnapshotSha256 !== plannedLiveSnapshotSha256) {
        throw new Error('backup 직전 운영 1,095문서 hash/updateTime이 계획 snapshot과 달라 적용을 중단했습니다.');
    }
    before = writeTimeSnapshot;
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupPath = path.join(backupDir, `bible114-nt-cache-before-${timestamp}.json`);
    writePrivateJson(backupPath, {
        schemaVersion: 1,
        kind: 'bible114-nt-cache-raw-backup',
        generatedAt: new Date().toISOString(),
        projectId: PROJECT_ID,
        sourceManifestSha256: source.manifestSha256,
        scheduleSha256,
        liveSnapshotSha256: writeTimeSnapshotSha256,
        documents: ids.map(id => before.get(`${documentBase}/verses/${id}`)),
    });
    const backupSha256 = sha256File(backupPath);
    const writes = changedIds.map(id => {
        const current = before.get(`${documentBase}/verses/${id}`);
        return {
            update: { name: current.name, fields: encodedTarget(source.targets.get(id)) },
            updateMask: { fieldPaths: TARGET_FIELDS },
            currentDocument: { updateTime: current.updateTime },
        };
    });
    await commit(token, writes, 'repair');
    const after = await fetchDocuments(token, ids);
    const postApplyUpdateTimes = Object.fromEntries(changedIds.map(id => [
        id,
        after.get(`${documentBase}/verses/${id}`)?.updateTime,
    ]));
    if (Object.values(postApplyUpdateTimes).some(value => typeof value !== 'string' || !value)) {
        throw new Error(`repair commit 뒤 updateTime 회수 실패; 수동 복구용 backup: ${backupPath}`);
    }
    // 사후 내용 검증이 실패해도 CAS rollback에 필요한 적용 직후 updateTime을 잃지 않도록
    // recovery receipt를 먼저 0600으로 고정한다.
    const receiptPath = path.join(backupDir, `bible114-nt-cache-receipt-${timestamp}.json`);
    writePrivateJson(receiptPath, {
        schemaVersion: 1,
        kind: 'bible114-nt-cache-repair-receipt',
        generatedAt: new Date().toISOString(),
        projectId: PROJECT_ID,
        verificationStatus: 'pending',
        backupPath,
        backupSha256,
        sourceManifestSha256: source.manifestSha256,
        scheduleSha256,
        changedIds,
        postApplyUpdateTimes,
    });
    console.log(JSON.stringify({
        mode: 'post-commit-recovery-ready',
        backupPath,
        backupSha256,
        receiptPath,
        rawContentPrinted: false,
    }, null, 2));
    for (const id of ids) {
        const original = before.get(`${documentBase}/verses/${id}`);
        const updated = after.get(`${documentBase}/verses/${id}`);
        const expected = encodedTarget(source.targets.get(id));
        if (!same(Object.fromEntries(TARGET_FIELDS.map(field => [field, updated.fields?.[field]])), expected)) {
            throw new Error('repair 사후 target 필드 불일치');
        }
        const oldNonTarget = Object.fromEntries(Object.entries(original.fields || {}).filter(([key]) => !TARGET_FIELDS.includes(key)));
        const newNonTarget = Object.fromEntries(Object.entries(updated.fields || {}).filter(([key]) => !TARGET_FIELDS.includes(key)));
        if (!same(oldNonTarget, newNonTarget)) throw new Error('repair 사후 non-target drift');
    }
    console.log(JSON.stringify({
        result: 'PASS',
        updatedDocuments: changedIds.length,
        backupPath,
        backupMode: (fs.statSync(backupPath).mode & 0o777).toString(8).padStart(4, '0'),
        backupSha256,
        receiptPath,
        receiptMode: (fs.statSync(receiptPath).mode & 0o777).toString(8).padStart(4, '0'),
        rawContentPrinted: false,
    }, null, 2));
};

if (rollbackArg) await runRollback();
else await runRepair();
