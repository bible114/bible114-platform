import { MOCK_COMMUNITIES } from '../data/communities';
import { TOTAL_DAYS } from '../data/constants';

export const calculateSubgroupStats = (members) => {
    const todayStr = new Date().toDateString();
    const stats = {};
    // 모든 공동체(부서)의 소그룹을 순회하며 통계 계산
    MOCK_COMMUNITIES.forEach(comm => {
        comm.subgroups.forEach(sub => {
            // 해당 부서(communityId) + 해당 소그룹(subgroupId)인 멤버만 필터링
            const subMembers = members.filter(m => m.communityId === comm.id && m.subgroupId === sub);
            const totalCount = subMembers.length;
            const readTodayCount = subMembers.filter(m => m.lastReadDate === todayStr).length;
            const rate = totalCount > 0 ? Math.round((readTodayCount / totalCount) * 100) : 0;

            // 누적 진행률 계산 (2독 이상 반영)
            const avgDay = totalCount > 0
                ? subMembers.reduce((sum, m) => {
                    const readCount = m.readCount || 1;
                    const actualProgress = (readCount - 1) * 365 + (m.currentDay || 1);
                    return sum + actualProgress;
                }, 0) / totalCount
                : 0;
            const progressRate = TOTAL_DAYS > 0 ? Math.round((avgDay / TOTAL_DAYS) * 100) : 0;
            const totalScore = subMembers.reduce((sum, m) => sum + (m.score || 0), 0);

            stats[`${comm.id}_${sub}`] = {
                rate,
                readCount: readTodayCount,
                totalCount,
                progressRate,
                avgDay: Math.round(avgDay),
                totalScore,
                communityId: comm.id,
                communityName: comm.name,
                subgroupName: sub
            };
        });
    });
    return stats;
};

export const getWeeklyMVP = (communityMembers) => {
    if (!communityMembers || communityMembers.length === 0) return null;

    const now = new Date();
    const weekStart = new Date(now);
    weekStart.setDate(now.getDate() - now.getDay()); // 이번 주 일요일
    weekStart.setHours(0, 0, 0, 0);

    // 이번 주에 읽은 DAY 분량 계산 함수
    const getWeeklyReadCount = (member) => {
        if (!member.readHistory || !Array.isArray(member.readHistory)) return 0;

        return member.readHistory.reduce((total, item) => {
            try {
                const date = typeof item === 'string' ? item : item.date;
                const daysRead = typeof item === 'string' ? 1 : (item.daysRead || 1);

                const readDate = new Date(date);
                if (readDate >= weekStart) {
                    return total + daysRead;
                }
                return total;
            } catch (e) {
                return total;
            }
        }, 0);
    };

    const weeklyWithCounts = communityMembers
        .map(m => ({
            ...m,
            weeklyCount: getWeeklyReadCount(m),
            totalCount: (m.readHistory ? m.readHistory.length : 0)
        }))
        .filter(m => m.weeklyCount > 0)
        .sort((a, b) => {
            if (b.weeklyCount !== a.weeklyCount) return b.weeklyCount - a.weeklyCount;
            return b.totalCount - a.totalCount;
        });

    const mvpByWeekly = weeklyWithCounts.length > 0 ? weeklyWithCounts[0] : null;
    const weeklyTop10 = weeklyWithCounts.slice(0, 10);

    const totalWithCounts = communityMembers
        .map(m => ({
            ...m,
            totalCount: ((m.readCount || 1) - 1) * 365 + (m.currentDay || 0)
        }))
        .filter(m => m.totalCount > 0);

    const sortedByTotal = totalWithCounts.sort((a, b) => b.totalCount - a.totalCount);
    const mvpByTotal = sortedByTotal.length > 0 ? sortedByTotal[0] : null;
    const totalTop10 = sortedByTotal.slice(0, 10);

    return {
        streakMVP: mvpByWeekly,
        progressMVP: mvpByTotal,
        weeklyTop10,
        totalTop10
    };
};

export const getMonthlyContest = (currentUser, communityMembers, mockCommunities) => {
    if (!currentUser || !currentUser.communityId) return [];

    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth();
    const daysPassed = now.getDate();
    const monthStart = new Date(year, month, 1);

    const comm = mockCommunities.find(c => c.id === currentUser.communityId);
    if (!comm) return [];

    const groupedBySubgroup = {};
    comm.subgroups.forEach(sub => {
        groupedBySubgroup[sub] = communityMembers.filter(m => m.subgroupId === sub);
    });

    return Object.keys(groupedBySubgroup)
        .map(function (subgroupName) {
            var members = groupedBySubgroup[subgroupName];
            const totalCount = members.length;
            if (totalCount === 0) return null;

            const totalReads = members.reduce(function (sum, member) {
                if (!member.readHistory || !Array.isArray(member.readHistory)) return sum;

                const monthlyReads = member.readHistory.filter(function (item) {
                    var dateStr = typeof item === 'string' ? item : item.date;
                    const readDate = new Date(dateStr);
                    return readDate >= monthStart && readDate <= now;
                }).length;

                return sum + monthlyReads;
            }, 0);

            const maxPossible = totalCount * daysPassed;
            const monthlyRate = maxPossible > 0 ? Math.round((totalReads / maxPossible) * 100) : 0;

            return {
                name: subgroupName,
                rate: monthlyRate,
                totalCount,
                totalReads,
                maxPossible,
                daysPassed
            };
        })
        .filter(g => g !== null && g.totalCount > 0)
        .sort((a, b) => b.rate - a.rate);
};
export const formatSubgroupRanking = (subgroupStats) => {
    if (!subgroupStats || Object.keys(subgroupStats).length === 0) return [];
    return Object.keys(subgroupStats)
        .map(function (key) {
            var data = subgroupStats[key];
            return {
                name: data.subgroupName,
                rate: data.rate || 0,
                readCount: data.readCount || 0,
                totalCount: data.totalCount || 0,
                progressRate: data.progressRate || 0,
                avgDay: data.avgDay || 0,
                totalScore: data.totalScore || 0,
                communityId: data.communityId,
                communityName: data.communityName
            };
        })
        .sort(function (a, b) {
            if (b.progressRate !== a.progressRate) return b.progressRate - a.progressRate;
            return b.totalScore - a.totalScore;
        });
};

export const formatProgressRanking = (subgroupStats) => {
    if (!subgroupStats || Object.keys(subgroupStats).length === 0) return [];
    return Object.keys(subgroupStats)
        .map(function (key) {
            var data = subgroupStats[key];
            return {
                name: data.subgroupName,
                progressRate: data.progressRate || 0,
                avgDay: data.avgDay || 0,
                totalScore: data.totalScore || 0,
                totalCount: data.totalCount || 0,
                communityId: data.communityId,
                communityName: data.communityName
            };
        })
        .filter(function (g) { return g.totalCount > 0; })
        .sort(function (a, b) { return b.progressRate - a.progressRate; });
};

export const getAdminStats = (allUsers) => {
    const todayStr = new Date().toDateString();
    const totalUsers = allUsers.length;
    const readToday = allUsers.filter(u => u.lastReadDate === todayStr).length;
    const readRate = totalUsers > 0 ? Math.round((readToday / totalUsers) * 100) : 0;
    const communityStats = {};
    MOCK_COMMUNITIES.forEach(comm => {
        const commUsers = allUsers.filter(u => u.communityId === comm.id);
        const commTotal = commUsers.length;
        const commRead = commUsers.filter(u => u.lastReadDate === todayStr).length;
        communityStats[comm.id] = { name: comm.name, total: commTotal, readToday: commRead, rate: commTotal > 0 ? Math.round((commRead / commTotal) * 100) : 0 };
    });
    return { totalUsers, readToday, readRate, communityStats };
};
