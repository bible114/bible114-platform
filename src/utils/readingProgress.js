import { getYearCompletedRounds } from './annualReading.js';

const READABLE_PLAN_IDS = new Set(['readable_revised', 'readable_new']);

export const getPlanCycleDays = planId => (
    READABLE_PLAN_IDS.has(planId) ? 60 : 365
);

export const normalizePlanProgressDay = (value, planId) => {
    const totalDays = getPlanCycleDays(planId);
    const day = Number.isSafeInteger(value) && value >= 1 && value <= 365
        ? value
        : 1;
    return ((day - 1) % totalDays) + 1;
};

// currentDay는 다음에 읽을 날이므로 현재 회차의 실제 완료 일수는 currentDay - 1이다.
export const getDaysRead = member => (
    getYearCompletedRounds(member) * getPlanCycleDays(member?.planId)
    + normalizePlanProgressDay(member?.currentDay, member?.planId) - 1
);

export const getPlanProgressRate = member => Math.min(
    100,
    Math.max(0, (getDaysRead(member) / getPlanCycleDays(member?.planId)) * 100),
);
