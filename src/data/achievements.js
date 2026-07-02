export const ACHIEVEMENTS = [
    // 읽기 시작 관련
    {
        id: 'first_read', title: '첫 발걸음', desc: '처음으로 말씀을 읽었습니다', emoji: '👣',
        condition: (u) => u.currentDay > 1
    },

    // 연속 읽기 (streak) 관련
    {
        id: 'streak_7', title: '일주일 연속', desc: '7일 연속으로 읽었습니다', emoji: '🔥',
        condition: (u) => u.streak >= 7
    },
    {
        id: 'streak_30', title: '한 달 연속', desc: '30일 연속으로 읽었습니다', emoji: '💪',
        condition: (u) => u.streak >= 30
    },
    {
        id: 'streak_100', title: '백일의 기적', desc: '100일 연속으로 읽었습니다', emoji: '🌟',
        condition: (u) => u.streak >= 100
    },

    // 진행 Day 관련
    {
        id: 'day_30', title: '30일 완주', desc: '30일차를 달성했습니다', emoji: '🏃',
        condition: (u) => u.currentDay >= 30
    },
    {
        id: 'day_100', title: '100일 완주', desc: '100일차를 달성했습니다', emoji: '🎯',
        condition: (u) => u.currentDay >= 100
    },
    {
        id: 'day_200', title: '200일 완주', desc: '200일차를 달성했습니다', emoji: '🚀',
        condition: (u) => u.currentDay >= 200
    },
    {
        id: 'day_365', title: '완독 성공', desc: '365일 완독을 달성했습니다!', emoji: '👑',
        condition: (u) => u.currentDay >= 365
    },

    // 묵상 메모 관련
    {
        id: 'first_memo', title: '첫 묵상', desc: '처음으로 묵상을 기록했습니다', emoji: '📝',
        condition: (u, m) => Object.keys(m || {}).length >= 1
    },
    {
        id: 'memo_10', title: '묵상 10개', desc: '묵상을 10개 작성했습니다', emoji: '📚',
        condition: (u, m) => Object.keys(m || {}).length >= 10
    },
    {
        id: 'memo_50', title: '묵상 50개', desc: '묵상을 50개 작성했습니다', emoji: '🎓',
        condition: (u, m) => Object.keys(m || {}).length >= 50
    },

    // 점수 관련
    {
        id: 'score_100', title: '100점 달성', desc: '총 100점을 달성했습니다', emoji: '💯',
        condition: (u) => u.score >= 100
    },
    {
        id: 'score_500', title: '500점 달성', desc: '총 500점을 달성했습니다', emoji: '⭐',
        condition: (u) => u.score >= 500
    },
    {
        id: 'score_1000', title: '1000점 달성', desc: '총 1000점을 달성했습니다', emoji: '🏆',
        condition: (u) => u.score >= 1000
    },
];
