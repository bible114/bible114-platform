export const withAsyncTimeout = (
    promise,
    timeoutMs,
    createTimeoutError = () => new Error('operation timed out'),
) => {
    const effectiveTimeoutMs = Number.isFinite(timeoutMs) && timeoutMs > 0 ? timeoutMs : 0;

    return new Promise((resolve, reject) => {
        const timeoutId = setTimeout(() => reject(createTimeoutError()), effectiveTimeoutMs);
        Promise.resolve(promise).then(
            value => {
                clearTimeout(timeoutId);
                resolve(value);
            },
            error => {
                clearTimeout(timeoutId);
                reject(error);
            },
        );
    });
};
