export const LEVEL_SYSTEM = [
    { min: 0, title: '멸망의 도시', emoji: '🏚️' },      // 시작 레벨
    { min: 50, title: '좁은 문', emoji: '🚪' },
    { min: 150, title: '어려움의 산', emoji: '⛰️' },
    { min: 350, title: '평안의 궁전', emoji: '🏰' },
    { min: 600, title: '사망의 골짜기', emoji: '🌑' },
    { min: 1000, title: '허영의 시장', emoji: '🎪' },
    { min: 1500, title: '의심의 성', emoji: '🏔️' },
    { min: 2200, title: '기쁨의 산', emoji: '🌄' },
    { min: 3200, title: '천성 문 앞', emoji: '✨' },
    { min: 4300, title: '천성', emoji: '🌈' }           // 최고 레벨
];

export const getLevelInfo = (score) => [...LEVEL_SYSTEM].reverse().find(l => score >= l.min) || LEVEL_SYSTEM[0];
