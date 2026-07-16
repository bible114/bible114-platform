import { UNAFFILIATED_CHURCH_ID } from '../data/constants.js';

const MAX_BALANCE = 1_000_000_000;
const hasControlCharacters = value => /[\u0000-\u001f\u007f]/.test(value);
const isCanonicalId = value => typeof value === 'string'
    && value === value.trim()
    && value.length >= 1
    && value.length <= 128
    && value !== '.'
    && value !== '..'
    && !value.includes('/')
    && !hasControlCharacters(value);
const isSafeInteger = (value, min, max = Number.MAX_SAFE_INTEGER) => (
    Number.isSafeInteger(value) && value >= min && value <= max
);

// platform-api 응답에는 UI에 적용할 사용자/명부 snapshot을 넣지 않는다.
// action 뒤 source-server로 다시 읽은 전체 canonical 상태만 이 검증을 거쳐 적용한다.
export const validateJoinedSoloCommunityState = (
    state,
    expectedUid,
    { requireWalletSettled = false } = {},
) => {
    const uid = String(expectedUid || '').trim();
    if (!uid || !state || typeof state !== 'object' || Array.isArray(state)
        || state.uid !== uid
        || state.role !== 'member'
        || state.accountType !== 'personal'
        || state.churchId !== null
        || state.isDeleted !== false
        || state.talentMigrated !== true
        || !isSafeInteger(state.score, 0, MAX_BALANCE)
        || !isSafeInteger(state.talent, 0, MAX_BALANCE)
        || !isSafeInteger(state.currentDay, 1, 365)
        || !isSafeInteger(state.streak, 0)
        || !isSafeInteger(state.readCount, 1)
        || !Array.isArray(state.extraOrgs)
        || state.extraOrgs.length < 1
        || state.extraOrgs.length > 3) {
        throw new Error('invalid solo community server state');
    }

    const seen = new Set();
    for (const org of state.extraOrgs) {
        const orgId = org?.orgId;
        if (!isCanonicalId(orgId)
            || org?.uid !== uid
            || org?.rosterPath !== `churches/${orgId}/roster/${uid}`
            || seen.has(orgId)
            || !isSafeInteger(org?.talent, 0, MAX_BALANCE)) {
            throw new Error('invalid solo community roster state');
        }
        seen.add(orgId);
    }
    const target = state.extraOrgs.find(org => org.orgId === UNAFFILIATED_CHURCH_ID);
    if (!target
        || target.departmentId !== null
        || target.departmentName !== null
        || target.subgroupId !== null
        || target.subgroupName !== null
        || !Array.isArray(target.extraMemberships)
        || target.extraMemberships.length !== 0
        || !isCanonicalId(state.primaryOrgId)
        || !seen.has(state.primaryOrgId)) {
        throw new Error('invalid solo community membership state');
    }
    if (requireWalletSettled
        && (state.talentWalletMigrated !== true || state.talent !== 0)) {
        throw new Error('solo community wallet not settled');
    }
    return state;
};
