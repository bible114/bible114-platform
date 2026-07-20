export const shouldScrollToReadingHeader = (previousCompletion, nextCompletion) => Boolean(
    previousCompletion
    && nextCompletion
    && typeof previousCompletion.uid === 'string'
    && previousCompletion.uid.length > 0
    && previousCompletion.uid === nextCompletion.uid
    && nextCompletion.summary?.uid === nextCompletion.uid
    && typeof nextCompletion.summary?.requestId === 'string'
    && nextCompletion.summary.requestId.length > 0
    && (previousCompletion.summary?.uid !== nextCompletion.summary.uid
        || previousCompletion.summary?.requestId !== nextCompletion.summary.requestId)
);

const prefersReducedMotion = (windowObject) => {
    try {
        return windowObject?.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches === true;
    } catch {
        return false;
    }
};

export const scrollElementIntoView = (element, {
    block = 'start',
    windowObject = typeof window === 'undefined' ? null : window,
} = {}) => {
    if (!element || typeof element.scrollIntoView !== 'function') return false;
    element.scrollIntoView({
        behavior: prefersReducedMotion(windowObject) ? 'auto' : 'smooth',
        block,
    });
    return true;
};

export const scheduleScrollIntoView = (getElement, {
    block = 'start',
    frameCount = 1,
    isStillCurrent = () => true,
    windowObject = typeof window === 'undefined' ? null : window,
} = {}) => {
    if (typeof getElement !== 'function') return () => {};

    let cancelled = false;
    const run = () => {
        if (cancelled || !isStillCurrent()) return;
        scrollElementIntoView(getElement(), { block, windowObject });
    };

    if (typeof windowObject?.requestAnimationFrame === 'function') {
        const framesToWait = Number.isSafeInteger(frameCount) && frameCount > 0 ? frameCount : 1;
        let frameId = null;
        const waitForFrame = (remaining) => {
            frameId = windowObject.requestAnimationFrame(() => {
                if (cancelled) return;
                if (remaining > 1) waitForFrame(remaining - 1);
                else run();
            });
        };
        waitForFrame(framesToWait);
        return () => {
            cancelled = true;
            if (frameId !== null) windowObject.cancelAnimationFrame?.(frameId);
        };
    }

    const timeoutId = setTimeout(run, 0);
    return () => {
        cancelled = true;
        clearTimeout(timeoutId);
    };
};
