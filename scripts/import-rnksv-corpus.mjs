#!/usr/bin/env node
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

import schedules from '../src/data/read_schedules.json' with { type: 'json' };
import readableSchedule from '../src/data/readable_schedule.json' with { type: 'json' };
import { BOOKS, parseReadingRange } from '../src/utils/quizParsing.js';

const PROJECT_ID = 'bible114-platform';
const TRANSLATION_ID = 'RNKSV';
const BIBLE_ID = 'da35b7e52f5c7865-01';
const SOURCE_ORIGIN = 'https://bible.bskorea.or.kr';
const COPYRIGHT = '성경전서 새번역 © 대한성서공회 2001.';
const APPLY_CONFIRMATION = 'REPLACE_ALL_RNKSV_VERSES';
const USER_AGENT = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/138.0 Safari/537.36';
const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(SCRIPT_DIR, '..');
const OUTPUT_ROOT = path.join(REPO_ROOT, '새번역_RNKSV_2001_자료');
const BOOKS_DIR = path.join(OUTPUT_ROOT, 'books');
const PLANS_DIR = path.join(OUTPUT_ROOT, 'plan-documents');
const COMMAND = process.argv[2] || 'fetch';
const confirmation = process.argv.find(arg => arg.startsWith('--confirm='))?.slice('--confirm='.length) || '';

if (!['fetch', 'verify', 'apply'].includes(COMMAND)) {
    throw new Error(`사용법: node scripts/import-rnksv-corpus.mjs fetch|verify|apply [--confirm=${APPLY_CONFIRMATION}]`);
}
if (COMMAND === 'apply' && confirmation !== APPLY_CONFIRMATION) {
    throw new Error(`운영 본문 교체 확인값이 필요합니다: --confirm=${APPLY_CONFIRMATION}`);
}

const ensureDirectories = () => {
    fs.mkdirSync(BOOKS_DIR, { recursive: true });
    fs.mkdirSync(PLANS_DIR, { recursive: true });
};
const writeJson = (filename, value) => {
    fs.writeFileSync(filename, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
};
const readJson = filename => JSON.parse(fs.readFileSync(filename, 'utf8'));
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const sha256 = value => crypto.createHash('sha256').update(value).digest('hex');
const normalizeText = value => String(value || '').replace(/\s+/g, ' ').trim();
const sourceUrl = chapterId => `${SOURCE_ORIGIN}/bible/${TRANSLATION_ID}/${chapterId}`;

const extractTransferState = html => {
    const marker = '<script id="IBEP-main-state" type="application/json">';
    const start = html.indexOf(marker);
    if (start < 0) throw new Error('대한성서공회 페이지에서 구조화된 본문 상태를 찾지 못했습니다.');
    const jsonStart = start + marker.length;
    const jsonEnd = html.indexOf('</script>', jsonStart);
    if (jsonEnd < 0) throw new Error('대한성서공회 페이지의 구조화된 본문 상태가 닫히지 않았습니다.');
    return JSON.parse(html.slice(jsonStart, jsonEnd));
};

const fetchHtml = async url => {
    let lastError = null;
    for (let attempt = 1; attempt <= 5; attempt += 1) {
        try {
            const response = await fetch(url, {
                headers: {
                    'User-Agent': USER_AGENT,
                    'Accept-Language': 'ko-KR,ko;q=0.9',
                    Accept: 'text/html,application/xhtml+xml',
                },
            });
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            const html = await response.text();
            if (!html.includes('IBEP-main-state')) throw new Error('본문 상태가 없는 응답');
            return html;
        } catch (error) {
            lastError = error;
            if (attempt < 5) await sleep(400 * attempt);
        }
    }
    throw new Error(`${url} 수집 실패: ${lastError?.message || '알 수 없는 오류'}`);
};

const findStateValue = (state, needle) => {
    const entry = Object.entries(state).find(([key]) => key.includes(needle));
    if (!entry) throw new Error(`구조화된 상태에서 ${needle} 항목을 찾지 못했습니다.`);
    return entry[1]?.data;
};

const flattenSourceBooks = metadata => {
    const sourceBooks = (metadata?.testaments || []).flatMap(testament => testament?.books || []);
    if (sourceBooks.length !== BOOKS.length) {
        throw new Error(`성경 권수 불일치: 대한성서공회 ${sourceBooks.length}, 사이트 ${BOOKS.length}`);
    }
    return sourceBooks.map((sourceBook, index) => {
        const localBook = BOOKS[index];
        if (!sourceBook?.id || !Array.isArray(sourceBook.chapters) || sourceBook.chapters.length < 1) {
            throw new Error(`${index + 1}번째 성경 권 메타데이터가 올바르지 않습니다.`);
        }
        return {
            sourceId: sourceBook.id,
            abbreviation: sourceBook.abbreviation,
            sourceName: sourceBook.name,
            fullName: localBook.full,
            slug: localBook.slug,
            testament: localBook.testament,
            chapters: sourceBook.chapters.map(chapter => ({
                id: chapter.id,
                number: Number(chapter.number),
            })),
        };
    });
};

const inlineText = value => {
    if (typeof value === 'string') return value;
    if (Array.isArray(value)) return value.map(inlineText).join('');
    if (!value || typeof value !== 'object') return '';
    if (value.type === 'study') return '';
    return inlineText(value.content);
};

const extractVerses = chapter => {
    const fragments = new Map();
    const visit = value => {
        if (Array.isArray(value)) {
            value.forEach(visit);
            return;
        }
        if (!value || typeof value !== 'object') return;
        if (value.type === 'verse-text' && typeof value.verseId === 'string') {
            const numberText = value.verseId.split('.').at(-1);
            if (!/^\d+$/.test(numberText)) {
                throw new Error(`${chapter.id}: 숫자가 아닌 절 ID ${value.verseId}`);
            }
            const number = Number(numberText);
            const fragment = inlineText(value.content);
            fragments.set(number, `${fragments.get(number) || ''}${fragment}`);
            return;
        }
        visit(value.content);
    };
    visit(chapter.content);
    const verses = [...fragments.entries()]
        .sort((left, right) => left[0] - right[0])
        .map(([number, text]) => ({ number, text: normalizeText(text) }));
    if (verses.some(verse => !verse.text)) {
        throw new Error(`${chapter.id}: 빈 절 본문이 있습니다.`);
    }
    if (Number(chapter.verseCount) !== verses.length) {
        throw new Error(`${chapter.id}: 절 수 불일치 (표시 ${chapter.verseCount}, 추출 ${verses.length})`);
    }
    if (new Set(verses.map(verse => verse.number)).size !== verses.length) {
        throw new Error(`${chapter.id}: 중복 절 번호가 있습니다.`);
    }
    return verses;
};

const fetchChapter = async chapterMeta => {
    const url = sourceUrl(chapterMeta.id);
    const state = extractTransferState(await fetchHtml(url));
    const data = findStateValue(state, `/chapters/${chapterMeta.id}/with-study-content`);
    const chapter = data?.chapter;
    if (!chapter || chapter.id !== chapterMeta.id) {
        throw new Error(`${chapterMeta.id}: 요청한 장과 응답한 장이 다릅니다.`);
    }
    return {
        id: chapter.id,
        number: Number(chapter.number),
        title: chapter.title,
        verseCount: Number(chapter.verseCount),
        sourceUrl: url,
        copyright: chapter.copyright || COPYRIGHT,
        verses: extractVerses(chapter),
    };
};

const mapWithConcurrency = async (items, limit, mapper) => {
    const output = new Array(items.length);
    let cursor = 0;
    const worker = async () => {
        while (cursor < items.length) {
            const index = cursor;
            cursor += 1;
            output[index] = await mapper(items[index], index);
            await sleep(120);
        }
    };
    await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
    return output;
};

const fetchCorpus = async () => {
    ensureDirectories();
    const bootstrapHtml = await fetchHtml(sourceUrl('GEN.1'));
    const bootstrapState = extractTransferState(bootstrapHtml);
    const metadata = findStateValue(bootstrapState, '/metadata?');
    const sourceBooks = flattenSourceBooks(metadata);
    writeJson(path.join(OUTPUT_ROOT, 'source-metadata.json'), {
        source: SOURCE_ORIGIN,
        translationId: TRANSLATION_ID,
        bibleId: BIBLE_ID,
        copyright: COPYRIGHT,
        fetchedAt: new Date().toISOString(),
        books: sourceBooks,
    });

    let completedChapters = 0;
    const allBooks = [];
    for (const [bookIndex, book] of sourceBooks.entries()) {
        const filename = path.join(BOOKS_DIR, `${String(bookIndex + 1).padStart(2, '0')}-${book.slug}.json`);
        let bookData = null;
        if (fs.existsSync(filename)) {
            const existing = readJson(filename);
            const complete = existing?.chapters?.length === book.chapters.length
                && existing.chapters.every(chapter => (
                    Array.isArray(chapter.verses)
                    && chapter.verses.length === chapter.verseCount
                    && chapter.verses.length > 0
                ));
            if (complete) bookData = existing;
        }
        if (!bookData) {
            const chapters = await mapWithConcurrency(book.chapters, 4, fetchChapter);
            bookData = {
                source: SOURCE_ORIGIN,
                translationId: TRANSLATION_ID,
                copyright: COPYRIGHT,
                book: {
                    sourceId: book.sourceId,
                    abbreviation: book.abbreviation,
                    sourceName: book.sourceName,
                    fullName: book.fullName,
                    slug: book.slug,
                    testament: book.testament,
                },
                chapters,
            };
            writeJson(filename, bookData);
        }
        completedChapters += bookData.chapters.length;
        allBooks.push(bookData);
        console.log(`[${bookIndex + 1}/${sourceBooks.length}] ${book.fullName} ${bookData.chapters.length}장 완료 (누계 ${completedChapters}장)`);
    }
    return allBooks;
};

const loadCorpus = () => {
    ensureDirectories();
    const filenames = fs.readdirSync(BOOKS_DIR).filter(name => name.endsWith('.json')).sort();
    if (filenames.length !== BOOKS.length) {
        throw new Error(`권별 자료가 ${filenames.length}/${BOOKS.length}개입니다. 먼저 fetch를 실행하세요.`);
    }
    return filenames.map(name => readJson(path.join(BOOKS_DIR, name)));
};

const buildChapterIndex = books => {
    const index = new Map();
    for (const book of books) {
        for (const chapter of book.chapters) {
            const key = `${book.book.slug}:${chapter.number}`;
            if (index.has(key)) throw new Error(`중복 장: ${key}`);
            index.set(key, {
                ...chapter,
                fullName: book.book.fullName,
                slug: book.book.slug,
                testament: book.book.testament,
            });
        }
    }
    return index;
};

const formatChapter = (chapter, item) => {
    const minimum = item.vStart || 1;
    const maximum = item.vEnd || Number.MAX_SAFE_INTEGER;
    const verses = chapter.verses.filter(verse => verse.number >= minimum && verse.number <= maximum);
    if (verses.length === 0) {
        throw new Error(`${chapter.fullName} ${chapter.number}:${minimum}-${maximum} 절 본문이 없습니다.`);
    }
    return [
        `# ${chapter.fullName} ${chapter.number}장`,
        '',
        ...verses.flatMap(verse => [`${verse.number} ${verse.text}`, '']),
    ].join('\n').trim();
};

const PLAN_DEFINITIONS = [
    {
        planId: '1year_new',
        label: '새번역 일년일독',
        schedule: schedules.whole_bible,
    },
    {
        planId: 'nt_new',
        label: '새번역 신약일독',
        schedule: schedules.new_testament,
    },
    {
        planId: 'readable_new',
        label: '새번역 60일 연대순 성경읽기',
        schedule: readableSchedule,
    },
];

const buildPlanDocuments = books => {
    const chapterIndex = buildChapterIndex(books);
    return PLAN_DEFINITIONS.map(plan => {
        const documents = plan.schedule.map((entry, index) => {
            const items = parseReadingRange(entry.range);
            if (items.length === 0) throw new Error(`${plan.planId} ${index + 1}일 진도 해석 실패: ${entry.range}`);
            const pieces = items.map(item => {
                const chapter = chapterIndex.get(`${item.slug}:${item.ch}`);
                if (!chapter) throw new Error(`${plan.planId} ${index + 1}일: ${item.book} ${item.ch}장 누락`);
                return formatChapter(chapter, item);
            });
            return {
                id: `${plan.planId}_${index + 1}`,
                title: `${plan.label} ${index + 1}일 / ${entry.range}`,
                text: pieces.join('\n\n'),
                sourceTranslation: TRANSLATION_ID,
                sourceCopyright: COPYRIGHT,
                sourceImportedAt: new Date().toISOString(),
            };
        });
        return { planId: plan.planId, documents };
    });
};

const validateAndWriteArtifacts = books => {
    const plans = buildPlanDocuments(books);
    plans.forEach(plan => writeJson(path.join(PLANS_DIR, `${plan.planId}.json`), plan.documents));
    const chapterCount = books.reduce((sum, book) => sum + book.chapters.length, 0);
    const verseCount = books.reduce((sum, book) => (
        sum + book.chapters.reduce((chapterSum, chapter) => chapterSum + chapter.verses.length, 0)
    ), 0);
    const report = {
        generatedAt: new Date().toISOString(),
        source: SOURCE_ORIGIN,
        translationId: TRANSLATION_ID,
        copyright: COPYRIGHT,
        corpus: {
            books: books.length,
            oldTestamentBooks: books.filter(book => book.book.testament === 'old').length,
            newTestamentBooks: books.filter(book => book.book.testament === 'new').length,
            chapters: chapterCount,
            verses: verseCount,
            emptyVerses: 0,
            duplicateChapterKeys: 0,
        },
        plans: plans.map(plan => ({
            planId: plan.planId,
            documents: plan.documents.length,
            emptyDocuments: plan.documents.filter(document => !document.text.trim()).length,
            documentsWithoutVerseNumbers: plan.documents.filter(document => (
                !document.text.split(/\r?\n/).some(line => /^\d{1,3}\s+\S/.test(line))
            )).length,
            contentSha256: sha256(plan.documents.map(document => `${document.id}\n${document.title}\n${document.text}`).join('\n')),
        })),
        expected: {
            books: 66,
            chapters: 1189,
            planDocuments: {
                '1year_new': 365,
                nt_new: 365,
                readable_new: 60,
            },
        },
    };
    if (report.corpus.books !== report.expected.books || report.corpus.chapters !== report.expected.chapters) {
        throw new Error(`전체 성경 구조 불일치: ${report.corpus.books}권 ${report.corpus.chapters}장`);
    }
    for (const plan of report.plans) {
        if (plan.documents !== report.expected.planDocuments[plan.planId]
            || plan.emptyDocuments !== 0 || plan.documentsWithoutVerseNumbers !== 0) {
            throw new Error(`${plan.planId} 생성 검증 실패`);
        }
    }
    writeJson(path.join(OUTPUT_ROOT, 'validation-report.json'), report);
    return { plans, report };
};

const firebaseAccess = async () => {
    const roots = [
        '/opt/homebrew/lib/node_modules/firebase-tools',
        '/usr/local/lib/node_modules/firebase-tools',
    ].filter(root => fs.existsSync(path.join(root, 'package.json')));
    if (roots.length === 0) throw new Error('Firebase CLI 로그인을 찾지 못했습니다.');
    const require = createRequire(path.join(roots[0], 'package.json'));
    const auth = require('./lib/auth');
    const account = auth.getGlobalDefaultAccount();
    if (!account?.tokens?.refresh_token) throw new Error('Firebase CLI 로그인 정보가 없습니다.');
    const scopes = String(account.tokens.scope || 'https://www.googleapis.com/auth/cloud-platform')
        .split(/\s+/).filter(Boolean);
    const access = await auth.getAccessToken(account.tokens.refresh_token, scopes);
    const accessToken = access?.access_token || access;
    if (!accessToken) throw new Error('Firebase 관리자 토큰을 얻지 못했습니다.');
    return accessToken;
};

const decodeFirestoreValue = value => {
    if (!value || typeof value !== 'object') return null;
    if ('stringValue' in value) return value.stringValue;
    if ('integerValue' in value) return Number(value.integerValue);
    if ('doubleValue' in value) return Number(value.doubleValue);
    if ('booleanValue' in value) return value.booleanValue;
    if ('timestampValue' in value) return value.timestampValue;
    if ('nullValue' in value) return null;
    if ('arrayValue' in value) return (value.arrayValue?.values || []).map(decodeFirestoreValue);
    if ('mapValue' in value) {
        return Object.fromEntries(Object.entries(value.mapValue?.fields || {})
            .map(([key, item]) => [key, decodeFirestoreValue(item)]));
    }
    return null;
};
const decodeFirestoreFields = fields => Object.fromEntries(
    Object.entries(fields || {}).map(([key, value]) => [key, decodeFirestoreValue(value)]),
);

const applyToFirestore = async plans => {
    const accessToken = await firebaseAccess();
    const apiRoot = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents`;
    const databaseRoot = `projects/${PROJECT_ID}/databases/(default)/documents`;
    const headers = { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' };
    const documents = plans.flatMap(plan => plan.documents);
    const names = documents.map(document => `${databaseRoot}/verses/${document.id}`);
    const existing = new Map();
    for (let offset = 0; offset < names.length; offset += 100) {
        const response = await fetch(`${apiRoot}:batchGet`, {
            method: 'POST',
            headers,
            body: JSON.stringify({ documents: names.slice(offset, offset + 100) }),
        });
        if (!response.ok) throw new Error(`기존 본문 백업 실패: HTTP ${response.status}`);
        for (const row of await response.json()) {
            if (row.found) {
                existing.set(row.found.name, {
                    name: row.found.name,
                    createTime: row.found.createTime,
                    updateTime: row.found.updateTime,
                    fields: decodeFirestoreFields(row.found.fields),
                });
            }
        }
    }
    if (existing.size !== documents.length) {
        throw new Error(`교체 대상 기존 문서가 ${existing.size}/${documents.length}개입니다.`);
    }
    writeJson(path.join(OUTPUT_ROOT, 'firestore-before-replacement.json'), {
        backedUpAt: new Date().toISOString(),
        projectId: PROJECT_ID,
        documents: names.map(name => existing.get(name)),
    });

    const writes = documents.map(document => ({
        update: {
            name: `${databaseRoot}/verses/${document.id}`,
            fields: {
                title: { stringValue: document.title },
                text: { stringValue: document.text },
                sourceTranslation: { stringValue: document.sourceTranslation },
                sourceCopyright: { stringValue: document.sourceCopyright },
                sourceImportedAt: { stringValue: document.sourceImportedAt },
            },
        },
        updateMask: {
            fieldPaths: ['title', 'text', 'sourceTranslation', 'sourceCopyright', 'sourceImportedAt'],
        },
        currentDocument: { exists: true },
    }));
    for (let offset = 0; offset < writes.length; offset += 400) {
        const chunk = writes.slice(offset, offset + 400);
        const response = await fetch(`${apiRoot}:batchWrite`, {
            method: 'POST',
            headers,
            body: JSON.stringify({ writes: chunk }),
        });
        if (!response.ok) throw new Error(`본문 교체 실패: HTTP ${response.status} ${await response.text()}`);
        const result = await response.json();
        if (!Array.isArray(result.status) || result.status.length !== chunk.length
            || result.status.some(status => Number(status?.code || 0) !== 0)) {
            throw new Error(`본문 교체 일부 실패: ${offset + 1}-${offset + chunk.length}`);
        }
        console.log(`Firestore 교체 ${offset + chunk.length}/${writes.length}`);
    }

    const expected = new Map(documents.map(document => [document.id, sha256(`${document.title}\n${document.text}`)]));
    let verified = 0;
    for (let offset = 0; offset < names.length; offset += 100) {
        const response = await fetch(`${apiRoot}:batchGet`, {
            method: 'POST',
            headers,
            body: JSON.stringify({
                documents: names.slice(offset, offset + 100),
                mask: { fieldPaths: ['title', 'text', 'sourceTranslation'] },
            }),
        });
        if (!response.ok) throw new Error(`교체 후 검증 실패: HTTP ${response.status}`);
        for (const row of await response.json()) {
            if (!row.found) continue;
            const id = row.found.name.split('/').at(-1);
            const fields = decodeFirestoreFields(row.found.fields);
            if (fields.sourceTranslation !== TRANSLATION_ID
                || sha256(`${fields.title}\n${fields.text}`) !== expected.get(id)) {
                throw new Error(`교체 후 내용 불일치: ${id}`);
            }
            verified += 1;
        }
    }
    if (verified !== documents.length) throw new Error(`교체 후 검증 ${verified}/${documents.length}`);
    writeJson(path.join(OUTPUT_ROOT, 'firestore-replacement-report.json'), {
        completedAt: new Date().toISOString(),
        projectId: PROJECT_ID,
        translationId: TRANSLATION_ID,
        updatedDocuments: documents.length,
        verifiedDocuments: verified,
        planCounts: Object.fromEntries(plans.map(plan => [plan.planId, plan.documents.length])),
    });
    console.log(`Firestore 새번역 본문 교체 및 재검증 완료: ${verified}개`);
};

ensureDirectories();
const books = COMMAND === 'fetch' ? await fetchCorpus() : loadCorpus();
const { plans, report } = validateAndWriteArtifacts(books);
console.log(JSON.stringify(report, null, 2));
if (COMMAND === 'apply') await applyToFirestore(plans);
