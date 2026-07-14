const SERVER_STATUSES = new Set(['ready', 'alreadyDone', 'invalidPosition', 'invalidQuiz']);

const getServerStatus = result => (
    SERVER_STATUSES.has(result?.status) ? result.status : 'unknown'
);

const getClientStatus = result => {
    if (!result || typeof result !== 'object') return 'unknown';
    if (result.alreadyDone === true) return 'alreadyDone';
    if (result.alreadyDone === false) return 'ready';
    return 'unknown';
};

const valuesEqual = (left, right) => Object.is(left, right);

const getClientEntry = result => {
    if (result?.entry && typeof result.entry === 'object' && !Array.isArray(result.entry)) {
        return result.entry;
    }
    return {
        attempts: result?.attempts,
        solved: result?.solved,
        skipped: result?.skipped,
        quizKey: result?.quizKey,
        reward: result?.reward,
        updatedDate: result?.updatedDate,
    };
};

const compareField = (mismatchKeys, key, serverValue, clientValue) => {
    if (!valuesEqual(serverValue, clientValue)) mismatchKeys.push(key);
};

/**
 * 서버 shadow 결과와 현재 클라이언트 transaction 결과의 차이만 반환한다.
 * 실제 정답, 보상 및 진행 값은 로그에 노출하지 않는다.
 */
export const compareQuizSubmissionShadow = (serverResult, clientResult) => {
    const serverStatus = getServerStatus(serverResult);
    const clientStatus = getClientStatus(clientResult);
    const mismatchKeys = [];

    if (serverStatus !== clientStatus) mismatchKeys.push('status');

    if (serverStatus === 'ready' && clientStatus === 'ready') {
        compareField(mismatchKeys, 'attempts', serverResult?.nextAttempts, clientResult?.attempts);
        compareField(mismatchKeys, 'solved', serverResult?.isCorrect, clientResult?.solved);
        compareField(mismatchKeys, 'reward', serverResult?.reward, clientResult?.reward);

        const clientEntry = getClientEntry(clientResult);
        ['attempts', 'solved', 'skipped', 'quizKey', 'reward', 'updatedDate'].forEach(key => {
            compareField(mismatchKeys, `entry.${key}`, serverResult?.entry?.[key], clientEntry?.[key]);
        });
    }

    if (serverStatus === 'alreadyDone' && clientStatus === 'alreadyDone') {
        ['attempts', 'solved', 'skipped', 'reward', 'quizKey'].forEach(key => {
            compareField(mismatchKeys, key, serverResult?.[key], clientResult?.[key]);
        });
    }

    return {
        match: mismatchKeys.length === 0,
        serverStatus,
        clientStatus,
        mismatchKeys,
    };
};
