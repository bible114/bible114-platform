const QUIZ_TERMINAL_OUTCOMES = new Set(['solved', 'attemptsExhausted', 'skipped']);

export const getQuizTerminalSignalToken = (signal) => {
    if (!signal
        || typeof signal.uid !== 'string' || signal.uid.length === 0
        || typeof signal.progressKey !== 'string' || signal.progressKey.length === 0
        || typeof signal.requestId !== 'string' || signal.requestId.length === 0
        || !QUIZ_TERMINAL_OUTCOMES.has(signal.outcome)) return null;
    return JSON.stringify([
        signal.uid,
        signal.progressKey,
        signal.requestId,
        signal.outcome,
    ]);
};

export const shouldScrollToReadAction = (pendingTerminal, currentGate) => Boolean(
    pendingTerminal
    && currentGate
    && typeof pendingTerminal.contextKey === 'string'
    && pendingTerminal.contextKey.length > 0
    && pendingTerminal.contextKey === currentGate.contextKey
    && pendingTerminal.uid === currentGate.uid
    && pendingTerminal.token === getQuizTerminalSignalToken(pendingTerminal)
    && currentGate.hasQuestion === true
    && currentGate.gateOpen === true
);

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
