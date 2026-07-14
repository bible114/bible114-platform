// djb2a 해시: 문항 key 문자열을 결정적 정수 시드로 변환한다.
export const hashStringToSeed = (str) => {
    let hash = 5381;
    for (let i = 0; i < str.length; i += 1) {
        hash = ((hash * 33) ^ str.charCodeAt(i)) >>> 0;
    }
    return hash >>> 0;
};

// mulberry32: 정수 시드로부터 결정적 의사난수를 생성한다(같은 시드 -> 항상 같은 수열).
export const createSeededRandom = (seed) => {
    let state = seed >>> 0;
    return () => {
        state = (state + 0x6D2B79F5) | 0;
        let t = Math.imul(state ^ (state >>> 15), 1 | state);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
};

// 문항의 정답이 항상 같은 위치(주로 0번)에 오는 문제를 막기 위해
// question.key를 시드로 선택지 순서를 결정적으로 섞는다.
// 같은 key는 언제(오늘/내일/새로고침) 호출해도 항상 동일한 순서를 반환한다.
// 순수 함수: 원본 question을 변형하지 않고 새 객체를 반환한다.
export const shuffleQuizChoices = (question) => {
    if (!question || typeof question !== 'object') return question;
    const { choices, answerIndex, key } = question;

    if (!Array.isArray(choices) || choices.length < 2) return question;
    if (!Number.isInteger(answerIndex) || answerIndex < 0 || answerIndex >= choices.length) return question;
    if (!key) return question;

    const random = createSeededRandom(hashStringToSeed(String(key)));
    const order = choices.map((_, index) => index);
    // Fisher-Yates shuffle (결정적 PRNG 사용)
    for (let i = order.length - 1; i > 0; i -= 1) {
        const j = Math.floor(random() * (i + 1));
        [order[i], order[j]] = [order[j], order[i]];
    }

    const shuffledChoices = order.map(originalIndex => choices[originalIndex]);
    const newAnswerIndex = order.indexOf(answerIndex);

    return {
        ...question,
        choices: shuffledChoices,
        answerIndex: newAnswerIndex,
    };
};
