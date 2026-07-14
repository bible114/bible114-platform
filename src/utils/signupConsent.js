import { SERVICE_POLICY_VERSION, getPolicyIdsForAudience } from '../data/servicePolicies.js';

// 가입 동의 문서가 바뀌면 버전을 올린다. 사용자가 실제로 본 문서 버전을
// 가입 시점 snapshot에 남기기 위한 값이며, 앱 버전과는 별개다.
export const SIGNUP_POLICY_VERSIONS = Object.freeze({
    terms: SERVICE_POLICY_VERSION,
    privacy: SERVICE_POLICY_VERSION,
    sensitive: SERVICE_POLICY_VERSION,
    community: SERVICE_POLICY_VERSION,
    childGuardian: SERVICE_POLICY_VERSION,
});

export const GUARDIAN_CONSENT_METHODS = Object.freeze({
    // 일반 Google 로그인만으로는 이 값을 사용하면 안 된다. Family Link 등 상위
    // 제공자가 별도로 준 보호자 동의 증빙의 불투명 참조값(evidenceRef)이 필요하다.
    GOOGLE_PROVIDER_SIGNAL: 'google_provider_signal',
    // 보호자가 화면에서 직접 이름·관계와 동의 사실을 진술한 방식이다.
    // 플랫폼이 신원이나 법정대리인 자격을 본인인증했다는 뜻은 아니다.
    GUARDIAN_ASSERTION: 'guardian_assertion',
});

const DATE_ONLY_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;
const BIRTHDATE_PATTERN = /^(\d{4})(\d{2})(\d{2})$/;

const validDateParts = (year, month, day) => {
    if (![year, month, day].every(Number.isInteger)) return false;
    const date = new Date(Date.UTC(year, month - 1, day));
    return date.getUTCFullYear() === year
        && date.getUTCMonth() === month - 1
        && date.getUTCDate() === day;
};

export const parseBirthdate = value => {
    const match = String(value || '').trim().match(BIRTHDATE_PATTERN);
    if (!match) return null;
    const year = Number(match[1]);
    const month = Number(match[2]);
    const day = Number(match[3]);
    if (!validDateParts(year, month, day)) return null;
    return { year, month, day, value: `${match[1]}${match[2]}${match[3]}` };
};

const kstDateParts = value => {
    if (typeof value === 'string') {
        const match = value.match(DATE_ONLY_PATTERN);
        if (!match) return null;
        const year = Number(match[1]);
        const month = Number(match[2]);
        const day = Number(match[3]);
        return validDateParts(year, month, day)
            ? { year, month, day, value }
            : null;
    }

    const date = value instanceof Date ? value : new Date(value ?? Date.now());
    if (Number.isNaN(date.getTime())) return null;
    const parts = new Intl.DateTimeFormat('en-US', {
        timeZone: 'Asia/Seoul',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
    }).formatToParts(date);
    const get = type => Number(parts.find(part => part.type === type)?.value);
    const year = get('year');
    const month = get('month');
    const day = get('day');
    return {
        year,
        month,
        day,
        value: `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`,
    };
};

export const getAgeAssessment = (birthdate, asOf = new Date()) => {
    const birth = parseBirthdate(birthdate);
    const reference = kstDateParts(asOf);
    if (!birth || !reference) return null;

    let age = reference.year - birth.year;
    if (reference.month < birth.month
        || (reference.month === birth.month && reference.day < birth.day)) age -= 1;

    if (age < 0) return null;
    return {
        birthdate: birth.value,
        asOfDate: reference.value,
        age,
        under14: age < 14,
    };
};

const requiredAgreement = (value, field, errors) => {
    if (value !== true) errors.push({ field, code: 'REQUIRED_AGREEMENT' });
};

const normalizedText = (value, maxLength = 100) => {
    const text = String(value || '').trim();
    return text && text.length <= maxLength ? text : null;
};

const validateGuardianConsent = (guardian, errors) => {
    if (!guardian || guardian.agreed !== true) {
        errors.push({ field: 'childGuardian.agreed', code: 'GUARDIAN_AGREEMENT_REQUIRED' });
        return;
    }

    if (guardian.method === GUARDIAN_CONSENT_METHODS.GOOGLE_PROVIDER_SIGNAL) {
        if (guardian.provider !== 'google') {
            errors.push({ field: 'childGuardian.provider', code: 'GOOGLE_PROVIDER_REQUIRED' });
        }
        if (!normalizedText(guardian.evidenceRef, 200)) {
            errors.push({ field: 'childGuardian.evidenceRef', code: 'PROVIDER_EVIDENCE_REQUIRED' });
        }
        return;
    }

    if (guardian.method === GUARDIAN_CONSENT_METHODS.GUARDIAN_ASSERTION) {
        if (!normalizedText(guardian.guardianName, 50)) {
            errors.push({ field: 'childGuardian.guardianName', code: 'GUARDIAN_NAME_REQUIRED' });
        }
        if (!normalizedText(guardian.relationship, 30)) {
            errors.push({ field: 'childGuardian.relationship', code: 'GUARDIAN_RELATIONSHIP_REQUIRED' });
        }
        return;
    }

    errors.push({ field: 'childGuardian.method', code: 'INVALID_GUARDIAN_METHOD' });
};

export const validateSignupConsent = (
    { birthdate, consents, audience = 'member', ageConfirmed14Plus = false } = {},
    { asOf = new Date() } = {},
) => {
    const errors = [];
    const assertedAdultAdmin = audience === 'communityAdmin' && ageConfirmed14Plus === true && !birthdate;
    const reference = kstDateParts(asOf);
    const ageAssessment = assertedAdultAdmin && reference ? {
        birthdate: null,
        asOfDate: reference.value,
        age: null,
        under14: false,
        confirmed14Plus: true,
    } : getAgeAssessment(birthdate, asOf);
    if (!ageAssessment) errors.push({ field: 'birthdate', code: 'INVALID_BIRTHDATE' });

    const payload = consents || {};
    getPolicyIdsForAudience(audience).forEach(field => requiredAgreement(payload[field], field, errors));
    if (ageAssessment?.under14) validateGuardianConsent(payload.childGuardian, errors);

    return {
        ok: errors.length === 0,
        errors,
        ageAssessment,
    };
};

const guardianSnapshot = guardian => {
    if (guardian.method === GUARDIAN_CONSENT_METHODS.GOOGLE_PROVIDER_SIGNAL) {
        return {
            agreed: true,
            method: guardian.method,
            provider: 'google',
            evidenceRef: normalizedText(guardian.evidenceRef, 200),
            // 상위 제공자 신호를 기록할 뿐, 플랫폼이 법정대리인 신원을 검증한 것은 아니다.
            identityVerifiedByPlatform: false,
            legalAuthorityVerifiedByPlatform: false,
        };
    }
    return {
        agreed: true,
        method: guardian.method,
        guardianName: normalizedText(guardian.guardianName, 50),
        relationship: normalizedText(guardian.relationship, 30),
        identityVerifiedByPlatform: false,
        legalAuthorityVerifiedByPlatform: false,
    };
};

// 반환값은 undefined, Date, 함수, Firebase 전용 타입을 포함하지 않는 순수 객체다.
// 그대로 users 문서의 `signupConsent` 필드에 저장할 수 있다.
export const buildSignupConsentSnapshot = (
    { birthdate, consents, audience = 'member', ageConfirmed14Plus = false },
    { asOf = new Date(), agreedAt = new Date().toISOString(), source = 'signup', locale = 'ko-KR' } = {},
) => {
    const result = validateSignupConsent({ birthdate, consents, audience, ageConfirmed14Plus }, { asOf });
    if (!result.ok) {
        const error = new Error('가입 동의 정보를 확인해주세요.');
        error.code = 'INVALID_SIGNUP_CONSENT';
        error.details = result.errors;
        throw error;
    }

    const agreedAtIso = agreedAt instanceof Date ? agreedAt.toISOString() : String(agreedAt || '').trim();
    if (!/^\d{4}-\d{2}-\d{2}T/.test(agreedAtIso) || Number.isNaN(Date.parse(agreedAtIso))) {
        const error = new Error('동의 시각이 올바르지 않습니다.');
        error.code = 'INVALID_CONSENT_TIMESTAMP';
        throw error;
    }

    const { ageAssessment } = result;
    const under14 = ageAssessment.under14;
    return {
        schemaVersion: 1,
        policyVersions: { ...SIGNUP_POLICY_VERSIONS },
        agreedAt: agreedAtIso,
        source: normalizedText(source, 50) || 'signup',
        locale: normalizedText(locale, 20) || 'ko-KR',
        audience,
        ageAssessment,
        agreements: {
            terms: { agreed: consents.terms === true },
            privacy: { agreed: consents.privacy === true },
            sensitive: { agreed: consents.sensitive === true },
            community: { agreed: consents.community === true },
            childGuardian: under14
                ? { required: true, ...guardianSnapshot(consents.childGuardian) }
                : {
                    required: false,
                    agreed: false,
                    method: null,
                    identityVerifiedByPlatform: false,
                    legalAuthorityVerifiedByPlatform: false,
                },
        },
    };
};

// 같은 공동체 구성원이 읽을 수 있는 users 본문에는 보호자 성명 같은 동의 원문을
// 넣지 않는다. 본문에는 버전과 완료 여부만 남기고 원문은 private/consent에 저장한다.
export const buildSignupConsentSummary = snapshot => ({
    schemaVersion: snapshot.schemaVersion,
    policyVersions: { ...snapshot.policyVersions },
    agreedAt: snapshot.agreedAt,
    audience: snapshot.audience,
    under14: snapshot.ageAssessment?.under14 === true,
    guardianConsentRecorded: snapshot.agreements?.childGuardian?.agreed === true,
});
