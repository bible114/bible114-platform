const hasControlCharacters = value => /[\u0000-\u001f\u007f]/.test(value);

const normalizeUnit = value => {
    let id = '';
    let name = '';
    let rawSubgroups = [];

    if (typeof value === 'string') {
        id = value.trim();
        name = id;
    } else if (value && typeof value === 'object' && !Array.isArray(value)) {
        const rawId = typeof value.id === 'string' ? value.id.trim() : '';
        const rawName = typeof value.name === 'string' ? value.name.trim() : '';
        id = rawId || rawName;
        name = rawName || id;
        rawSubgroups = Array.isArray(value.subgroups) ? value.subgroups : [];
    } else {
        return null;
    }

    if (!id) return null;
    if (id.length > 128 || id === '.' || id === '..' || id.includes('/')
        || hasControlCharacters(id) || !name || name.length > 200
        || hasControlCharacters(name)) {
        throw new Error('INVALID_ONBOARDING_ORGANIZATION');
    }

    return { id, name, rawSubgroups };
};

const normalizeUnitList = (values, { includeSubgroups = false } = {}) => {
    if (!Array.isArray(values)) return [];
    const units = [];
    const ids = new Set();

    values.forEach(value => {
        const normalized = normalizeUnit(value);
        if (!normalized) return;
        if (ids.has(normalized.id)) {
            throw new Error('DUPLICATE_ONBOARDING_ORGANIZATION');
        }
        ids.add(normalized.id);
        units.push({
            id: normalized.id,
            name: normalized.name,
            subgroups: includeSubgroups
                ? normalizeUnitList(normalized.rawSubgroups)
                    .map(({ id, name }) => ({ id, name }))
                : [],
        });
    });

    return units;
};

// platform-api completeMemberOnboarding과 같은 legacy string/{name}/{id,name}
// 규칙으로 최초 소속 선택 UI만 canonical 형태로 만든다. 서버가 최종 권위다.
export const normalizeOnboardingOrganizations = values => (
    normalizeUnitList(values, { includeSubgroups: true })
);
