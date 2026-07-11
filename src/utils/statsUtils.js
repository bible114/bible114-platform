import { DEFAULT_DEPARTMENTS } from '../data/departments';
import { TOTAL_DAYS } from '../data/constants';
import { getMembershipList, belongsToDepartment, belongsToSubgroup } from './memberships';

// Firestore 문서는 uid별 1개지만, 잘못 합쳐진 입력이 와도 교회/그룹 지표에서
// 같은 사용자를 두 번 세지 않는다. uid가 없는 레거시 객체는 서로 다른 사람일 수 있어 유지한다.
const uniqueMembersByUid = (members) => {
    const seenUids = new Set();
    return (Array.isArray(members) ? members : []).filter(member => {
        if (!member || typeof member !== 'object' || Array.isArray(member)) return false;
        const uid = typeof member?.uid === 'string' ? member.uid.trim() : '';
        if (!uid) return true;
        if (seenUids.has(uid)) return false;
        seenUids.add(uid);
        return true;
    });
};

export const calculateSubgroupStats = (members, communities) => {
    const todayStr = new Date().toDateString();
    const stats = {};
    // 멤버를 membership별로 펼치지 않는다. 각 그룹 포함 여부만 boolean으로 판정해 uid 1회를 보장한다.
    const uniqueMembers = uniqueMembersByUid(members);

    // 소그룹 entry에서 id/name 추출 (문자열 레거시 + {id,name} 신 포맷 모두 지원)
    const getSubId = (sub) => (typeof sub === 'string' ? sub : (sub?.id || sub?.name || ''));
    const getSubName = (sub) => (typeof sub === 'string' ? sub : (sub?.name || sub?.id || ''));

    const groupMap = new Map();
    const addGroup = ({ departmentId, departmentName, subgroupId, subgroupName }) => {
        if (!departmentId || !subgroupId) return;
        const key = JSON.stringify([departmentId, subgroupId]);
        if (!groupMap.has(key)) {
            groupMap.set(key, { departmentId, departmentName, subgroupId, subgroupName });
        }
    };

    if (Array.isArray(communities) && communities.length > 0) {
        communities.forEach(comm => {
            (Array.isArray(comm?.subgroups) ? comm.subgroups : []).forEach(sub => {
                addGroup({
                    departmentId: comm?.id,
                    departmentName: comm?.name,
                    subgroupId: getSubId(sub),
                    subgroupName: getSubName(sub),
                });
            });
        });
    } else {
        uniqueMembers.forEach(member => {
            getMembershipList(member).forEach(membership => {
                addGroup({
                    departmentId: membership.departmentId,
                    departmentName: membership.departmentName || membership.departmentId,
                    subgroupId: membership.subgroupId,
                    subgroupName: membership.subgroupName || membership.subgroupId,
                });
            });
        });
    }
    const groups = Array.from(groupMap.values());

    groups.forEach(({ departmentId, departmentName, subgroupId, subgroupName }) => {
        // id 또는 name 둘 다로 멤버 매칭 (레거시/신 포맷 호환)
        const subMembers = uniqueMembers.filter(member => (
            belongsToSubgroup(member, departmentId, subgroupId)
            || (subgroupName !== subgroupId && belongsToSubgroup(member, departmentId, subgroupName))
        ));
        const totalCount = subMembers.length;
        const readTodayCount = subMembers.filter(m => m.lastReadDate === todayStr).length;
        const rate = totalCount > 0 ? Math.round((readTodayCount / totalCount) * 100) : 0;

        const avgDay = totalCount > 0
            ? subMembers.reduce((sum, m) => {
                const readCount = m.readCount || 1;
                const actualProgress = (readCount - 1) * 365 + (m.currentDay || 1);
                return sum + actualProgress;
            }, 0) / totalCount
            : 0;
        const progressRate = TOTAL_DAYS > 0 ? Math.round((avgDay / TOTAL_DAYS) * 100) : 0;
        const totalScore = subMembers.reduce((sum, m) => sum + (m.score || 0), 0);

        stats[JSON.stringify([departmentId, subgroupId || subgroupName])] = {
            rate,
            readCount: readTodayCount,
            totalCount,
            progressRate,
            avgDay: Math.round(avgDay),
            totalScore,
            departmentId,
            departmentName,
            subgroupId: subgroupId || subgroupName,
            subgroupName  // 항상 문자열 (표시용)
        };
    });

    return stats;
};

export const getWeeklyMVP = (departmentMembers) => {
    const uniqueDepartmentMembers = uniqueMembersByUid(departmentMembers);
    if (uniqueDepartmentMembers.length === 0) return null;

    const now = new Date();
    const weekStart = new Date(now);
    weekStart.setDate(now.getDate() - now.getDay()); // 이번 주 일요일
    weekStart.setHours(0, 0, 0, 0);
    const todayEnd = new Date(now);
    todayEnd.setHours(23, 59, 59, 999);

    // 신형 롤링 필드를 기준으로 하되, 남아 있는 레거시 배열의 날짜도 병합한다.
    const getReadDates = (member) => {
        const recentDates = Array.isArray(member.recentReadDates) ? member.recentReadDates : [];
        const legacyDates = Array.isArray(member.readHistory)
            ? member.readHistory.map(item => (typeof item === 'string' ? item : item?.date))
            : [];

        return Array.from(new Map([...recentDates, ...legacyDates].flatMap(value => {
            if (!value) return [];
            const readDate = value?.toDate ? value.toDate() : new Date(value);
            if (Number.isNaN(readDate.getTime())) return [];
            readDate.setHours(0, 0, 0, 0);
            if (readDate > todayEnd) return [];
            return [[readDate.getTime(), readDate]];
        })).values());
    };

    const weeklyWithCounts = uniqueDepartmentMembers
        .map(m => {
            const readDates = getReadDates(m);
            return {
                ...m,
                weeklyCount: readDates.filter(date => date >= weekStart && date <= todayEnd).length,
                totalCount: ((m.readCount || 1) - 1) * 365 + (m.currentDay || 0)
            };
        })
        .filter(m => m.weeklyCount > 0)
        .sort((a, b) => {
            if (b.weeklyCount !== a.weeklyCount) return b.weeklyCount - a.weeklyCount;
            if (b.totalCount !== a.totalCount) return b.totalCount - a.totalCount;
            return String(a.name || a.uid || '').localeCompare(String(b.name || b.uid || ''), 'ko');
        });

    const mvpByWeekly = weeklyWithCounts.length > 0 ? weeklyWithCounts[0] : null;
    const weeklyTop10 = weeklyWithCounts.slice(0, 10);

    const totalWithCounts = uniqueDepartmentMembers
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
                departmentId: data.departmentId,
                departmentName: data.departmentName,
                subgroupId: data.subgroupId,
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
                departmentId: data.departmentId,
                departmentName: data.departmentName,
                subgroupId: data.subgroupId,
            };
        })
        .filter(function (g) { return g.totalCount > 0; })
        .sort(function (a, b) { return b.progressRate - a.progressRate; });
};

const totalProgressDay = (member) => ((member.readCount || 1) - 1) * TOTAL_DAYS + (member.currentDay || 1);

const toDate = (value) => {
    if (!value) return null;
    if (typeof value.toDate === 'function') return value.toDate();
    const d = new Date(value);
    return isNaN(d.getTime()) ? null : d;
};

const diffDays = (fromDate, toDateValue) => {
    const from = toDate(fromDate);
    const to = toDate(toDateValue);
    if (!from || !to) return null;
    from.setHours(0, 0, 0, 0);
    to.setHours(0, 0, 0, 0);
    return Math.floor((to - from) / 86400000);
};

export const computeAtRisk = (members, todayStr) => {
    const activeMembers = uniqueMembersByUid(members).filter(m => !m.isDeleted && m.role !== 'churchAdmin');
    const noRead7Days = activeMembers
        .filter(m => {
            if (!m.lastReadDate) return true;
            const days = diffDays(m.lastReadDate, todayStr);
            return days === null || days >= 7;
        })
        .sort((a, b) => {
            const aDays = a.lastReadDate ? diffDays(a.lastReadDate, todayStr) : 9999;
            const bDays = b.lastReadDate ? diffDays(b.lastReadDate, todayStr) : 9999;
            return bDays - aDays;
        });

    const progressCount = Math.max(1, Math.ceil(activeMembers.length * 0.1));
    const bottomProgress = [...activeMembers]
        .sort((a, b) => totalProgressDay(a) - totalProgressDay(b))
        .slice(0, progressCount);

    const recentNewMembers = activeMembers
        .filter(m => {
            const created = toDate(m.createdAt);
            if (!created) return false;
            const days = diffDays(created, todayStr);
            return days !== null && days >= 0 && days <= 7;
        })
        .sort((a, b) => {
            const ad = toDate(a.createdAt)?.getTime() || 0;
            const bd = toDate(b.createdAt)?.getTime() || 0;
            return bd - ad;
        });

    return { noRead7Days, bottomProgress, recentNewMembers };
};

export const getAdminStats = (allUsers) => {
    const todayStr = new Date().toDateString();
    const uniqueUsers = uniqueMembersByUid(allUsers);
    const totalUsers = uniqueUsers.length;
    const readToday = uniqueUsers.filter(u => u.lastReadDate === todayStr).length;
    const readRate = totalUsers > 0 ? Math.round((readToday / totalUsers) * 100) : 0;
    const departmentStats = {};
    DEFAULT_DEPARTMENTS.forEach(comm => {
        const commUsers = uniqueUsers.filter(u => belongsToDepartment(u, comm.id));
        const commTotal = commUsers.length;
        const commRead = commUsers.filter(u => u.lastReadDate === todayStr).length;
        departmentStats[comm.id] = { name: comm.name, total: commTotal, readToday: commRead, rate: commTotal > 0 ? Math.round((commRead / commTotal) * 100) : 0 };
    });
    return { totalUsers, readToday, readRate, departmentStats };
};
