import { SCHEDULE_DATA } from '../data/schedules';
import { getActualDay } from './helpers';
import { BOOKS, getBookByFullName, parseReadingRange } from './quizParsing';

const quizModules = import.meta.glob('../data/quiz/*.json');

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

const getReadingRangeForDay = (user, readingDay) => {
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
    return {
        ...question,
        book: book?.full || question.book,
        slug,
        key: quizKey,
        order: index,
    };
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
