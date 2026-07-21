export const getCompletedReadingRounds = member => (
    Math.max(0, Math.floor(Number(member?.readCount) || 1) - 1)
);

export const getReadingRoundBadgeLabel = member => {
    const completedRounds = getCompletedReadingRounds(member);
    return completedRounds > 0 ? `${completedRounds}독` : '';
};
