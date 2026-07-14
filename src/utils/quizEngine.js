import { SCHEDULE_DATA } from '../data/schedules';
import { getActualDay } from './helpers';
import { BOOKS, getBookByFullName, parseReadingRange } from './quizParsing';
import { createSeededRandom, shuffleQuizChoices } from './quizShuffle';

const quizModules = import.meta.glob('../data/quiz/*.json');
const ntEasyQuizModules = import.meta.glob('../data/quizNtEasy/*.json');

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

export const getReadingRangeForDay = (user, readingDay) => {
    const planId = user?.planId || '1year_revised';
    const actualDay = getActualDay(readingDay, user?.dayOffset || 0);
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

// 기존 호출부는 마지막으로 완료한 본문을 조회한다.
export const getTodayReadingRange = (user) => {
    const lastCompletedDay = getLastCompletedDay(user?.currentDay);
    return getReadingRangeForDay(user, lastCompletedDay);
};

// 첫 읽기 완료 전에 풀 퀴즈는 현재 읽을 차례인 본문을 사용한다.
export const getCurrentReadingRange = (user) => {
    const currentDay = Number(user?.currentDay || 1);
    return getReadingRangeForDay(user, currentDay);
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

const getNtEasyShardPath = (actualDay) => {
    const day = Number(actualDay);
    if (day >= 1 && day <= 122) return '../data/quizNtEasy/nt_easy_001_122.json';
    if (day >= 123 && day <= 244) return '../data/quizNtEasy/nt_easy_123_244.json';
    if (day >= 245 && day <= 365) return '../data/quizNtEasy/nt_easy_245_365.json';
    return null;
};

export const loadNtEasyPoolForDay = async (actualDay) => {
    const day = Number(actualDay);
    const shardPath = getNtEasyShardPath(day);
    const loader = shardPath ? ntEasyQuizModules[shardPath] : null;
    if (!loader) return [];
    const mod = await loader();
    const days = Array.isArray(mod.default) ? mod.default : [];
    const entry = days.find(item => Number(item.day) === day);
    if (!entry || !Array.isArray(entry.questions)) return [];
    return entry.questions.map((question, index) => shuffleQuizChoices({
        ...question,
        day,
        order: index,
        key: `ntEasy-${day}-${index + 1}`,
    }));
};

export const loadNtEasyQuestionByKey = async (quizKey) => {
    const match = /^ntEasy-(\d{1,3})-(\d+)$/.exec(String(quizKey || ''));
    if (!match) return null;
    const day = Number(match[1]);
    const index = Number(match[2]) - 1;
    const pool = await loadNtEasyPoolForDay(day);
    return pool[index] || null;
};

export const selectNtEasyQuiz = (pool, seed, readCount = 1) => {
    if (!Array.isArray(pool) || pool.length === 0) return null;
    const cycle = Math.max(1, Number(readCount) || 1);
    const currentSeed = Math.max(1, Number(seed) || 1);
    let selectedIndex = -1;
    for (let cycleIndex = 1; cycleIndex <= cycle; cycleIndex += 1) {
        const cycleSeed = currentSeed - ((cycle - cycleIndex) * 365);
        const random = createSeededRandom(cycleSeed);
        let nextIndex = Math.floor(random() * pool.length);
        // 서로 이웃한 회독의 난수 결과가 우연히 같으면 다음 문항으로 보정한다.
        if (nextIndex === selectedIndex && pool.length > 1) nextIndex = (nextIndex + 1) % pool.length;
        selectedIndex = nextIndex;
    }
    return pool[selectedIndex] || null;
};

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
            .map((question, index) => shuffleQuizChoices({
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

export const loadQuestionByKey = async (quizKey) => {
    if (!quizKey || quizKey.startsWith('bank-')) return null;
    const [slug, ch, order] = quizKey.split('-');
    const loader = quizModules[`../data/quiz/${slug}.json`];
    if (!loader || !ch || !order) return null;
    const mod = await loader();
    const questions = Array.isArray(mod.default) ? mod.default : [];
    const index = Number(order) - 1;
    const question = questions[index];
    const book = BOOKS.find(item => item.slug === slug);
    if (!question || Number(question.ch) !== Number(ch)) return null;
    return shuffleQuizChoices({
        ...question,
        book: book?.full || question.book,
        slug,
        key: quizKey,
        order: index,
    });
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

export { BOOKS, getBookByFullName, parseReadingRange };
export { shuffleQuizChoices };
