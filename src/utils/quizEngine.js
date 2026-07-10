import { SCHEDULE_DATA } from '../data/schedules';
import { getActualDay } from './helpers';

export const BOOKS = [
    { full: '창세기', slug: 'genesis', aliases: ['창', '창세기'] },
    { full: '출애굽기', slug: 'exodus', aliases: ['출', '출애굽기'] },
    { full: '레위기', slug: 'leviticus', aliases: ['레', '레위기'] },
    { full: '민수기', slug: 'numbers', aliases: ['민', '민수기'] },
    { full: '신명기', slug: 'deuteronomy', aliases: ['신', '신명기'] },
    { full: '여호수아', slug: 'joshua', aliases: ['수', '여호수아'] },
    { full: '사사기', slug: 'judges', aliases: ['삿', '사사기'] },
    { full: '룻기', slug: 'ruth', aliases: ['룻', '룻기'] },
    { full: '사무엘상', slug: '1samuel', aliases: ['삼상', '사무엘상'] },
    { full: '사무엘하', slug: '2samuel', aliases: ['삼하', '사무엘하'] },
    { full: '열왕기상', slug: '1kings', aliases: ['왕상', '열왕기상'] },
    { full: '열왕기하', slug: '2kings', aliases: ['왕하', '열왕기하'] },
    { full: '역대상', slug: '1chronicles', aliases: ['대상', '역대상'] },
    { full: '역대하', slug: '2chronicles', aliases: ['대하', '역대하'] },
    { full: '에스라', slug: 'ezra', aliases: ['스', '에스라'] },
    { full: '느헤미야', slug: 'nehemiah', aliases: ['느', '느헤미야'] },
    { full: '에스더', slug: 'esther', aliases: ['에', '에스더'] },
    { full: '욥기', slug: 'job', aliases: ['욥', '욥기'] },
    { full: '시편', slug: 'psalms', aliases: ['시', '시편'] },
    { full: '잠언', slug: 'proverbs', aliases: ['잠', '잠언'] },
    { full: '전도서', slug: 'ecclesiastes', aliases: ['전', '전도서'] },
    { full: '아가', slug: 'songofsongs', aliases: ['아', '아가'] },
    { full: '이사야', slug: 'isaiah', aliases: ['사', '이사야'] },
    { full: '예레미야', slug: 'jeremiah', aliases: ['렘', '예레미야'] },
    { full: '예레미야애가', slug: 'lamentations', aliases: ['애', '예레미야애가', '애가'] },
    { full: '에스겔', slug: 'ezekiel', aliases: ['겔', '에스겔'] },
    { full: '다니엘', slug: 'daniel', aliases: ['단', '다니엘'] },
    { full: '호세아', slug: 'hosea', aliases: ['호', '호세아'] },
    { full: '요엘', slug: 'joel', aliases: ['욜', '요엘'] },
    { full: '아모스', slug: 'amos', aliases: ['암', '아모스'] },
    { full: '오바댜', slug: 'obadiah', aliases: ['옵', '오바댜'] },
    { full: '요나', slug: 'jonah', aliases: ['욘', '요나'] },
    { full: '미가', slug: 'micah', aliases: ['미', '미가'] },
    { full: '나훔', slug: 'nahum', aliases: ['나', '나훔'] },
    { full: '하박국', slug: 'habakkuk', aliases: ['합', '하박국'] },
    { full: '스바냐', slug: 'zephaniah', aliases: ['습', '스바냐'] },
    { full: '학개', slug: 'haggai', aliases: ['학', '학개'] },
    { full: '스가랴', slug: 'zechariah', aliases: ['슥', '스가랴'] },
    { full: '말라기', slug: 'malachi', aliases: ['말', '말라기'] },
    { full: '마태복음', slug: 'matthew', aliases: ['마', '마태복음'] },
    { full: '마가복음', slug: 'mark', aliases: ['막', '마가복음'] },
    { full: '누가복음', slug: 'luke', aliases: ['눅', '누가복음'] },
    { full: '요한복음', slug: 'john', aliases: ['요', '요한복음'] },
    { full: '사도행전', slug: 'acts', aliases: ['행', '사도행전'] },
    { full: '로마서', slug: 'romans', aliases: ['롬', '로마서'] },
    { full: '고린도전서', slug: '1corinthians', aliases: ['고전', '고린도전서'] },
    { full: '고린도후서', slug: '2corinthians', aliases: ['고후', '고린도후서'] },
    { full: '갈라디아서', slug: 'galatians', aliases: ['갈', '갈라디아서'] },
    { full: '에베소서', slug: 'ephesians', aliases: ['엡', '에베소서'] },
    { full: '빌립보서', slug: 'philippians', aliases: ['빌', '빌립보서'] },
    { full: '골로새서', slug: 'colossians', aliases: ['골', '골로새서'] },
    { full: '데살로니가전서', slug: '1thessalonians', aliases: ['살전', '데살로니가전서'] },
    { full: '데살로니가후서', slug: '2thessalonians', aliases: ['살후', '데살로니가후서'] },
    { full: '디모데전서', slug: '1timothy', aliases: ['딤전', '디모데전서'] },
    { full: '디모데후서', slug: '2timothy', aliases: ['딤후', '디모데후서'] },
    { full: '디도서', slug: 'titus', aliases: ['딛', '디도서'] },
    { full: '빌레몬서', slug: 'philemon', aliases: ['몬', '빌레몬서'] },
    { full: '히브리서', slug: 'hebrews', aliases: ['히', '히브리서'] },
    { full: '야고보서', slug: 'james', aliases: ['약', '야고보서'] },
    { full: '베드로전서', slug: '1peter', aliases: ['벧전', '베드로전서'] },
    { full: '베드로후서', slug: '2peter', aliases: ['벧후', '베드로후서'] },
    { full: '요한일서', slug: '1john', aliases: ['요일', '요한일서'] },
    { full: '요한이서', slug: '2john', aliases: ['요이', '요한이서'] },
    { full: '요한삼서', slug: '3john', aliases: ['요삼', '요한삼서'] },
    { full: '유다서', slug: 'jude', aliases: ['유', '유다서'] },
    { full: '요한계시록', slug: 'revelation', aliases: ['계', '요한계시록'] },
];

const BOOK_BY_FULL = Object.fromEntries(BOOKS.map(book => [book.full, book]));
const ALIASES = BOOKS.flatMap(book => book.aliases.map(alias => ({ alias, book })))
    .sort((a, b) => b.alias.length - a.alias.length);
const BOOK_PATTERN = ALIASES.map(({ alias }) => alias.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|');
const RANGE_MATCHER = new RegExp(`(^|[\\s/;,，·])(${BOOK_PATTERN})(?=\\s*\\d)`, 'g');
const quizModules = import.meta.glob('../data/quiz/*.json');

const normalizeRangeText = (value) => String(value || '')
    .replace(/[()（）]/g, ' ')
    .replace(/[–—~〜]/g, '-')
    .replace(/\s+/g, ' ')
    .trim();

const findBook = (alias) => ALIASES.find(item => item.alias === alias)?.book || null;

const parseChapterBody = (body, book) => {
    const text = body.replace(/\s+/g, '');
    const verseMatch = text.match(/^(\d+)[:：](\d+)(?:-(?:(\d+)[:：])?(\d+))?/);
    if (verseMatch) {
        const ch = Number(verseMatch[1]);
        const vStart = Number(verseMatch[2]);
        const vEnd = Number(verseMatch[4] || verseMatch[2]);
        if (ch > 0 && vStart > 0 && vEnd >= vStart) {
            return [{ book: book.full, slug: book.slug, ch, vStart, vEnd }];
        }
        return [];
    }

    const chapterMatch = text.match(/^(\d+)(?:-(\d+))?[장편]?/);
    if (!chapterMatch) return [];

    const start = Number(chapterMatch[1]);
    const end = Number(chapterMatch[2] || chapterMatch[1]);
    if (start < 1 || end < start) return [];

    return Array.from({ length: end - start + 1 }, (_, idx) => ({
        book: book.full,
        slug: book.slug,
        ch: start + idx,
    }));
};

export const parseReadingRange = (str) => {
    const text = normalizeRangeText(str);
    if (!text) return [];

    const matches = [];
    RANGE_MATCHER.lastIndex = 0;
    for (const match of text.matchAll(RANGE_MATCHER)) {
        const alias = match[2];
        const start = match.index + match[1].length;
        const book = findBook(alias);
        if (book) matches.push({ start, end: start + alias.length, book });
    }

    return matches.flatMap((match, index) => {
        const nextStart = matches[index + 1]?.start ?? text.length;
        const body = text.slice(match.end, nextStart).split(/[;,，]/)[0];
        return parseChapterBody(body, match.book);
    });
};

const getLastCompletedDay = (currentDay) => {
    const day = Number(currentDay || 1) - 1;
    return day <= 0 ? 365 : day;
};

const getCachedTitle = (planId, actualDay) => {
    if (typeof localStorage === 'undefined') return null;
    const [planType, version] = (planId || '1year_revised').split('_');
    try {
        const raw = localStorage.getItem(`v_${planType}_${version}_${actualDay}`);
        if (!raw) return null;
        const cached = JSON.parse(raw);
        return cached?.title || null;
    } catch {
        return null;
    }
};

export const getTodayReadingRange = (user) => {
    const planId = user?.planId || '1year_revised';
    const lastCompletedDay = getLastCompletedDay(user?.currentDay);
    const actualDay = getActualDay(lastCompletedDay, user?.dayOffset || 0);
    const cachedTitle = getCachedTitle(planId, actualDay);
    const cachedRange = parseReadingRange(cachedTitle);
    if (cachedRange.length > 0) {
        return {
            items: cachedRange,
            actualDay,
            source: 'localStorage',
            sourceText: cachedTitle,
            displayText: cachedTitle,
        };
    }

    const scheduleRange = SCHEDULE_DATA?.[planId]?.[actualDay - 1]?.range || '';
    return {
        items: parseReadingRange(scheduleRange),
        actualDay,
        source: 'schedule',
        sourceText: scheduleRange,
        displayText: scheduleRange,
    };
};

const parseRef = (ref) => {
    const range = parseReadingRange(ref);
    return range[0] || null;
};

const isInReadingItem = (question, item) => {
    if (!question || question.book !== item.book || Number(question.ch) !== Number(item.ch)) return false;
    if (!item.vStart || !item.vEnd) return true;
    const ref = parseRef(question.ref);
    if (!ref || !ref.vStart) return false;
    return ref.vStart >= item.vStart && ref.vStart <= item.vEnd;
};

const makeQuestionKey = (slug, question, index) => `${slug}-${question.ch}-${index + 1}`;

export const loadQuestionsForRange = async (range) => {
    const items = Array.isArray(range) ? range : (range?.items || []);
    const grouped = items.reduce((acc, item) => {
        if (!item?.slug) return acc;
        if (!acc[item.slug]) acc[item.slug] = [];
        acc[item.slug].push(item);
        return acc;
    }, {});

    const pools = await Promise.all(Object.entries(grouped).map(async ([slug, readingItems]) => {
        const loader = quizModules[`../data/quiz/${slug}.json`];
        if (!loader) return [];
        const mod = await loader();
        const questions = Array.isArray(mod.default) ? mod.default : [];
        const book = BOOKS.find(item => item.slug === slug);
        return questions
            .map((question, index) => ({
                ...question,
                book: book?.full || question.book,
                slug,
                key: question.key || makeQuestionKey(slug, question, index),
                order: index,
            }))
            .filter(question => readingItems.some(item => isInReadingItem(question, item)));
    }));

    return pools.flat();
};

export const selectQuiz = (pool, readCount = 1) => {
    if (!Array.isArray(pool) || pool.length === 0) return null;
    const sorted = pool.slice().sort((a, b) => {
        const aBookOrder = BOOKS.findIndex(book => book.full === a.book);
        const bBookOrder = BOOKS.findIndex(book => book.full === b.book);
        const bookOrder = (aBookOrder === -1 ? Number.MAX_SAFE_INTEGER : aBookOrder)
            - (bBookOrder === -1 ? Number.MAX_SAFE_INTEGER : bBookOrder);
        if (bookOrder !== 0) return bookOrder;
        if (Number(a.ch) !== Number(b.ch)) return Number(a.ch) - Number(b.ch);
        return Number(a.order || 0) - Number(b.order || 0);
    });
    const index = (Math.max(1, Number(readCount) || 1) - 1) % sorted.length;
    return sorted[index];
};

export const getBookByFullName = (fullName) => BOOK_BY_FULL[fullName] || null;
