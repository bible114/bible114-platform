export const reconcileStoredRequestIds = ({
    completedRequestIds = [], fallback = null, storage = null, prefix = '',
} = {}) => {
    const completed = completedRequestIds instanceof Set
        ? completedRequestIds
        : new Set(completedRequestIds || []);
    if (completed.size === 0) return 0;

    let removed = 0;
    if (fallback instanceof Map) {
        [...fallback.entries()].forEach(([key, requestId]) => {
            if (completed.has(requestId) && fallback.delete(key)) removed += 1;
        });
    }
    if (!storage || typeof prefix !== 'string' || !prefix) return removed;

    try {
        const storedKeys = [];
        for (let index = 0; index < storage.length; index += 1) {
            const key = storage.key(index);
            if (key?.startsWith(prefix)) storedKeys.push(key);
        }
        storedKeys.forEach(key => {
            if (completed.has(storage.getItem(key))) {
                storage.removeItem(key);
                removed += 1;
            }
        });
    } catch {
        // 브라우저가 storage 접근을 막아도 in-memory key 정리는 유지한다.
    }
    return removed;
};
