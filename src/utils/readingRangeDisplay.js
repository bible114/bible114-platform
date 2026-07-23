export const formatReadingRangeForDisplay = value => {
    if (typeof value !== 'string') return '';

    return value.split(/([,;]\s*)/).map(segment => {
        const match = segment.match(/^(\s*)시(?:편)?\s+(.+?)(\s*)$/);
        if (!match) return segment;
        return `${match[1]}시편 ${match[2].replaceAll('장', '편')}${match[3]}`;
    }).join('');
};
