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
