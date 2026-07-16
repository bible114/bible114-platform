export const PERSONAL_MIGRATION_STEPS = ['start', 'email', 'credentials', 'roster', 'user'];

const REQUEST_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const hasControlCharacters = value => /[\u0000-\u001f\u007f]/.test(value);

const canonicalDocumentId = value => {
    if (typeof value !== 'string') return null;
    const normalized = value.trim();
    return normalized && normalized === value && normalized.length <= 128
        && normalized !== '.' && normalized !== '..'
        && !normalized.includes('/') && !hasControlCharacters(normalized)
        ? normalized
        : null;
};

const validBirthdate = value => {
    const match = typeof value === 'string' ? /^(\d{4})(\d{2})(\d{2})$/.exec(value) : null;
    if (!match) return false;
    const parsed = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
    return parsed.getUTCFullYear() === Number(match[1])
        && parsed.getUTCMonth() + 1 === Number(match[2])
        && parsed.getUTCDate() === Number(match[3]);
};

export const buildRecoveredPersonalMigrationState = (
    { firebaseUser, userData },
    { makePseudoEmail, makeUnaffiliatedIdentity, createRequestId },
) => {
    const uid = canonicalDocumentId(firebaseUser?.uid);
    if (!uid || uid !== firebaseUser.uid || !userData || typeof userData !== 'object'
        || Array.isArray(userData) || typeof makePseudoEmail !== 'function'
        || typeof makeUnaffiliatedIdentity !== 'function' || typeof createRequestId !== 'function') {
        return null;
    }
    const validAccountType = userData.accountType === undefined || userData.accountType === null
        || userData.accountType === 'church' || userData.accountType === 'member';
    const churchId = canonicalDocumentId(userData.churchId);
    const name = typeof userData.name === 'string' ? userData.name : '';
    const birthdate = userData.birthdate;
    const authEmail = typeof firebaseUser.email === 'string' ? firebaseUser.email.trim() : '';
    if (!validAccountType || userData.role !== 'member'
        || (userData.uid !== undefined && userData.uid !== null && userData.uid !== uid)
        || (userData.isDeleted !== undefined && userData.isDeleted !== false)
        || (userData.primaryOrgId !== undefined && userData.primaryOrgId !== null)
        || !churchId || churchId === 'unaffiliated_v1'
        || !name || name !== name.trim() || name.length > 200 || hasControlCharacters(name)
        || !validBirthdate(birthdate) || !authEmail || authEmail.length > 254
        || hasControlCharacters(authEmail)) {
        return null;
    }
    const expectedSuffix = '@bible.local';
    if (!authEmail.toLowerCase().endsWith(expectedSuffix)) return null;
    const phoneStart = authEmail.length - expectedSuffix.length - 4;
    const phone4 = phoneStart > 0 ? authEmail.slice(phoneStart, phoneStart + 4) : '';
    if (!/^\d{4}$/.test(phone4)) return null;
    const expectedEmail = makePseudoEmail(name, makeUnaffiliatedIdentity(birthdate, phone4));
    if (authEmail.toLowerCase() !== expectedEmail.toLowerCase()) return null;
    const conversionRequestId = createRequestId();
    if (!REQUEST_ID_PATTERN.test(conversionRequestId)) return null;
    return {
        uid,
        step: 'email',
        phone4,
        newEmail: authEmail,
        source: {
            churchId,
            churchName: userData.churchName ?? null,
            departmentId: userData.departmentId ?? null,
            departmentName: userData.departmentName ?? null,
            subgroupId: userData.subgroupId ?? null,
            subgroupName: userData.subgroupName ?? null,
        },
        conversionRequestId,
        recoveredFromAuth: true,
    };
};

export const nextPersonalMigrationStep = currentStep => {
    const index = PERSONAL_MIGRATION_STEPS.indexOf(currentStep);
    return index >= 0 && index < PERSONAL_MIGRATION_STEPS.length - 1
        ? PERSONAL_MIGRATION_STEPS[index + 1]
        : 'complete';
};
