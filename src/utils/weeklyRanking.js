export const rankWeeklyMembers = members => {
    const sorted = [...(Array.isArray(members) ? members : [])].sort((a, b) => {
        if (b.weeklyCount !== a.weeklyCount) return b.weeklyCount - a.weeklyCount;
        if (b.totalCount !== a.totalCount) return b.totalCount - a.totalCount;
        return String(a.name || a.uid || '').localeCompare(String(b.name || b.uid || ''), 'ko');
    });
    const winner = sorted.find(member => member.weeklyCount > 0) || null;
    return {
        winner,
        // 이번 주 참여자가 한 명이라도 있으면 읽지 않은 성도도 0일로 이어서 보여준다.
        // 양수만 먼저 잘라내면 1명만 읽은 주에는 2~10위가 영구히 빈칸으로 보인다.
        top10: winner ? sorted.slice(0, 10) : [],
    };
};
