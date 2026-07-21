// 추가 읽기는 보상을 중복 지급하지 않으므로 사람의 정상적인 통독 진행을
// 가로막지 않는다. 한 번의 전체 통독 분량만 안전 상한으로 둔다.
export const DAILY_READ_ADVANCE_LIMIT = 365;

export const getDailyAdvanceState = (user, todayKey, legacyTodayString) => {
    if (user?.dailyAdvanceDate === todayKey) {
        const count = Number(user.dailyAdvanceCount);
        return {
            count: Number.isInteger(count) && count >= 0 ? count : 0,
            isFirstReadToday: false,
        };
    }

    // 신규 필드 배포 전에 이미 오늘 읽은 사용자는 첫 읽기를 다시 보상하지 않는다.
    if (user?.lastReadDate === legacyTodayString) {
        return { count: 1, isFirstReadToday: false };
    }

    return { count: 0, isFirstReadToday: true };
};
