const CONTROL_CHARACTER_PATTERN = /[\u0000-\u001f\u007f]/;

export const normalizeChurchEntryCode = value => {
    if (typeof value !== 'string') return '';
    const normalized = value.trim();
    return normalized.length >= 4
        && normalized.length <= 128
        && !CONTROL_CHARACTER_PATTERN.test(normalized)
        ? normalized
        : '';
};

