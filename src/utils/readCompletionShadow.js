const SERVER_STATUSES = new Set(['ready', 'dailyLimit', 'positionMismatch']);

const getServerStatus = (serverResult) => (
    SERVER_STATUSES.has(serverResult?.status) ? serverResult.status : 'unknown'
);

const getClientStatus = (clientResult) => {
    if (clientResult == null) return 'repeated';
    if (clientResult?.blockedReason === 'DAILY_ADVANCE_LIMIT') return 'dailyLimit';
    if (clientResult?.updateData && typeof clientResult.updateData === 'object') return 'ready';
    return 'unknown';
};

const valuesEqual = (left, right) => {
    if (Array.isArray(left) || Array.isArray(right)) {
        if (!Array.isArray(left) || !Array.isArray(right) || left.length !== right.length) {
            return false;
        }
        return left.every((value, index) => valuesEqual(value, right[index]));
    }
    return Object.is(left, right);
};

const UPDATE_KEYS = [
    'currentDay',
    'readCount',
    'score',
    'streak',
    'maxStreak',
    'lastReadDate',
    'dailyAdvanceDate',
    'dailyAdvanceCount',
    'recentReadDates',
    'talent',
    'secretShopUnlocked',
];

const SUMMARY_KEYS = [
    'oldLevel',
    'newLevel',
    'scoreEarned',
    'streakBonus',
    'talentEarned',
    'newStreak',
    'newReadCount',
    'newProgressDay',
    'nextViewingDay',
    'completedRound',
    'secretShopJustUnlocked',
    'talentProgramEnabled',
];

/**
 * 서버 shadow 계산과 현재 클라이언트 트랜잭션 결과의 차이만 요약한다.
 * 실제 점수, 달란트, 진행 값은 반환하지 않아 로그에 민감값이 남지 않는다.
 */
export const compareReadCompletionShadow = (serverResult, clientResult) => {
    const serverStatus = getServerStatus(serverResult);
    const clientStatus = getClientStatus(clientResult);
    const mismatchKeys = [];

    if (serverStatus !== clientStatus) mismatchKeys.push('status');

    if (serverStatus === 'ready' && clientStatus === 'ready') {
        UPDATE_KEYS.forEach(key => {
            if (!valuesEqual(serverResult?.updateData?.[key], clientResult?.updateData?.[key])) {
                mismatchKeys.push(`updateData.${key}`);
            }
        });
        SUMMARY_KEYS.forEach(key => {
            if (!valuesEqual(serverResult?.summary?.[key], clientResult?.[key])) {
                mismatchKeys.push(`summary.${key}`);
            }
        });
    }

    return {
        match: mismatchKeys.length === 0,
        serverStatus,
        clientStatus,
        mismatchKeys,
    };
};
