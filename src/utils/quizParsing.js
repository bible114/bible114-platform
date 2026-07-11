export const BOOKS = [
    { full: '창세기', slug: 'genesis', aliases: ['창', '창세기'], testament: 'old' },
    { full: '출애굽기', slug: 'exodus', aliases: ['출', '출애굽기'], testament: 'old' },
    { full: '레위기', slug: 'leviticus', aliases: ['레', '레위기'], testament: 'old' },
    { full: '민수기', slug: 'numbers', aliases: ['민', '민수기'], testament: 'old' },
    { full: '신명기', slug: 'deuteronomy', aliases: ['신', '신명기'], testament: 'old' },
    { full: '여호수아', slug: 'joshua', aliases: ['수', '여호수아'], testament: 'old' },
    { full: '사사기', slug: 'judges', aliases: ['삿', '사사기'], testament: 'old' },
    { full: '룻기', slug: 'ruth', aliases: ['룻', '룻기'], testament: 'old' },
    { full: '사무엘상', slug: '1samuel', aliases: ['삼상', '사무엘상'], testament: 'old' },
    { full: '사무엘하', slug: '2samuel', aliases: ['삼하', '사무엘하'], testament: 'old' },
    { full: '열왕기상', slug: '1kings', aliases: ['왕상', '열왕기상'], testament: 'old' },
    { full: '열왕기하', slug: '2kings', aliases: ['왕하', '열왕기하'], testament: 'old' },
    { full: '역대상', slug: '1chronicles', aliases: ['대상', '역대상'], testament: 'old' },
    { full: '역대하', slug: '2chronicles', aliases: ['대하', '역대하'], testament: 'old' },
    { full: '에스라', slug: 'ezra', aliases: ['스', '에스라'], testament: 'old' },
    { full: '느헤미야', slug: 'nehemiah', aliases: ['느', '느헤미야'], testament: 'old' },
    { full: '에스더', slug: 'esther', aliases: ['에', '에스더'], testament: 'old' },
    { full: '욥기', slug: 'job', aliases: ['욥', '욥기'], testament: 'old' },
    { full: '시편', slug: 'psalms', aliases: ['시', '시편'], testament: 'old' },
    { full: '잠언', slug: 'proverbs', aliases: ['잠', '잠언'], testament: 'old' },
    { full: '전도서', slug: 'ecclesiastes', aliases: ['전', '전도서'], testament: 'old' },
    { full: '아가', slug: 'songofsongs', aliases: ['아', '아가'], testament: 'old' },
    { full: '이사야', slug: 'isaiah', aliases: ['사', '이사야'], testament: 'old' },
    { full: '예레미야', slug: 'jeremiah', aliases: ['렘', '예레미야'], testament: 'old' },
    { full: '예레미야애가', slug: 'lamentations', aliases: ['애', '예레미야애가', '애가'], testament: 'old' },
    { full: '에스겔', slug: 'ezekiel', aliases: ['겔', '에스겔'], testament: 'old' },
    { full: '다니엘', slug: 'daniel', aliases: ['단', '다니엘'], testament: 'old' },
    { full: '호세아', slug: 'hosea', aliases: ['호', '호세아'], testament: 'old' },
    { full: '요엘', slug: 'joel', aliases: ['욜', '요엘'], testament: 'old' },
    { full: '아모스', slug: 'amos', aliases: ['암', '아모스'], testament: 'old' },
    { full: '오바댜', slug: 'obadiah', aliases: ['옵', '오바댜'], testament: 'old' },
    { full: '요나', slug: 'jonah', aliases: ['욘', '요나'], testament: 'old' },
    { full: '미가', slug: 'micah', aliases: ['미', '미가'], testament: 'old' },
    { full: '나훔', slug: 'nahum', aliases: ['나', '나훔'], testament: 'old' },
    { full: '하박국', slug: 'habakkuk', aliases: ['합', '하박국'], testament: 'old' },
    { full: '스바냐', slug: 'zephaniah', aliases: ['습', '스바냐'], testament: 'old' },
    { full: '학개', slug: 'haggai', aliases: ['학', '학개'], testament: 'old' },
    { full: '스가랴', slug: 'zechariah', aliases: ['슥', '스가랴'], testament: 'old' },
    { full: '말라기', slug: 'malachi', aliases: ['말', '말라기'], testament: 'old' },
    { full: '마태복음', slug: 'matthew', aliases: ['마', '마태복음'], testament: 'new' },
    { full: '마가복음', slug: 'mark', aliases: ['막', '마가복음'], testament: 'new' },
    { full: '누가복음', slug: 'luke', aliases: ['눅', '누가복음'], testament: 'new' },
    { full: '요한복음', slug: 'john', aliases: ['요', '요한복음'], testament: 'new' },
    { full: '사도행전', slug: 'acts', aliases: ['행', '사도행전'], testament: 'new' },
    { full: '로마서', slug: 'romans', aliases: ['롬', '로마서'], testament: 'new' },
    { full: '고린도전서', slug: '1corinthians', aliases: ['고전', '고린도전서'], testament: 'new' },
    { full: '고린도후서', slug: '2corinthians', aliases: ['고후', '고린도후서'], testament: 'new' },
    { full: '갈라디아서', slug: 'galatians', aliases: ['갈', '갈라디아서'], testament: 'new' },
    { full: '에베소서', slug: 'ephesians', aliases: ['엡', '에베소서'], testament: 'new' },
    { full: '빌립보서', slug: 'philippians', aliases: ['빌', '빌립보서'], testament: 'new' },
    { full: '골로새서', slug: 'colossians', aliases: ['골', '골로새서'], testament: 'new' },
    { full: '데살로니가전서', slug: '1thessalonians', aliases: ['살전', '데살로니가전서'], testament: 'new' },
    { full: '데살로니가후서', slug: '2thessalonians', aliases: ['살후', '데살로니가후서'], testament: 'new' },
    { full: '디모데전서', slug: '1timothy', aliases: ['딤전', '디모데전서'], testament: 'new' },
    { full: '디모데후서', slug: '2timothy', aliases: ['딤후', '디모데후서'], testament: 'new' },
    { full: '디도서', slug: 'titus', aliases: ['딛', '디도서'], testament: 'new' },
    { full: '빌레몬서', slug: 'philemon', aliases: ['몬', '빌레몬서'], testament: 'new' },
    { full: '히브리서', slug: 'hebrews', aliases: ['히', '히브리서'], testament: 'new' },
    { full: '야고보서', slug: 'james', aliases: ['약', '야고보서'], testament: 'new' },
    { full: '베드로전서', slug: '1peter', aliases: ['벧전', '베드로전서'], testament: 'new' },
    { full: '베드로후서', slug: '2peter', aliases: ['벧후', '베드로후서'], testament: 'new' },
    { full: '요한일서', slug: '1john', aliases: ['요일', '요한일서'], testament: 'new' },
    { full: '요한이서', slug: '2john', aliases: ['요이', '요한이서'], testament: 'new' },
    { full: '요한삼서', slug: '3john', aliases: ['요삼', '요한삼서'], testament: 'new' },
    { full: '유다서', slug: 'jude', aliases: ['유', '유다서'], testament: 'new' },
    { full: '요한계시록', slug: 'revelation', aliases: ['계', '요한계시록'], testament: 'new' },
];

const ALIASES = BOOKS.flatMap(book => book.aliases.map(alias => ({ alias, book })))
    .sort((a, b) => b.alias.length - a.alias.length);
const BOOK_PATTERN = ALIASES.map(({ alias }) => alias.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|');
const RANGE_MATCHER = new RegExp(`(^|[\\s/;,，·])(${BOOK_PATTERN})(?=\\s*\\d)`, 'g');

const normalizeRangeText = (value) => String(value || '')
    .replace(/[()（）]/g, ' ')
    .replace(/[–—~〜]/g, '-')
    .replace(/\s+/g, ' ')
    .trim();

const findBook = (alias) => ALIASES.find(item => item.alias === alias)?.book || null;

const expandCrossChapterVerseRange = (book, startCh, startVerse, endCh, endVerse) => {
    if (startCh < 1 || endCh < startCh || startVerse < 1 || endVerse < 1) return [];
    if (startCh === endCh) {
        if (endVerse < startVerse) return [];
        return [{ book: book.full, slug: book.slug, ch: startCh, vStart: startVerse, vEnd: endVerse }];
    }

    return Array.from({ length: endCh - startCh + 1 }, (_, idx) => {
        const ch = startCh + idx;
        if (ch === startCh) return { book: book.full, slug: book.slug, ch, vStart: startVerse, vEnd: 999 };
        if (ch === endCh) return { book: book.full, slug: book.slug, ch, vStart: 1, vEnd: endVerse };
        return { book: book.full, slug: book.slug, ch };
    });
};

const parseChapterBody = (body, book) => {
    const text = body.replace(/\s+/g, '');
    const crossChapterVerseMatch = text.match(/^(\d+)[:：](\d+)-(\d+)[:：](\d+)/);
    if (crossChapterVerseMatch) {
        return expandCrossChapterVerseRange(
            book,
            Number(crossChapterVerseMatch[1]),
            Number(crossChapterVerseMatch[2]),
            Number(crossChapterVerseMatch[3]),
            Number(crossChapterVerseMatch[4])
        );
    }

    const verseMatch = text.match(/^(\d+)[:：](\d+)(?:-(\d+))?/);
    if (verseMatch) {
        const ch = Number(verseMatch[1]);
        const vStart = Number(verseMatch[2]);
        const vEnd = Number(verseMatch[3] || verseMatch[2]);
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

export const getBookByFullName = (fullName) => BOOKS.find(book => book.full === fullName) || null;
export const getBookBySlug = (slug) => BOOKS.find(book => book.slug === slug) || null;
