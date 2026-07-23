import { getYearCompletedRounds } from './annualReading.js';

export const getCompletedReadingRounds = member => getYearCompletedRounds(member);

export const getReadingRoundBadgeLabel = member => {
    const completedRounds = getCompletedReadingRounds(member);
    return completedRounds > 0 ? String(completedRounds) : '';
};
