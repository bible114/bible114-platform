const activeInteractiveAuthFlows = new Map();

const normalizeFlowName = (name) => {
    const normalized = String(name || '').trim();
    return normalized || 'interactive-auth';
};

export const beginInteractiveAuthFlow = (name) => {
    const flowName = normalizeFlowName(name);
    activeInteractiveAuthFlows.set(
        flowName,
        (activeInteractiveAuthFlows.get(flowName) || 0) + 1
    );
    return flowName;
};

export const endInteractiveAuthFlow = (name) => {
    const flowName = normalizeFlowName(name);
    const activeCount = activeInteractiveAuthFlows.get(flowName) || 0;
    if (activeCount <= 1) {
        activeInteractiveAuthFlows.delete(flowName);
        return;
    }
    activeInteractiveAuthFlows.set(flowName, activeCount - 1);
};

export const isInteractiveAuthFlowActive = () => activeInteractiveAuthFlows.size > 0;
