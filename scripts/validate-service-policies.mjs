import assert from 'node:assert/strict';
import {
    POLICY_AUDIENCE_IDS,
    POLICY_PUBLICATION_CHECKLIST,
    SERVICE_POLICIES,
    SERVICE_POLICY_VERSION,
    createEmptyPolicyConsents,
    getPolicyIdsForAudience,
    isPolicyConsentComplete,
} from '../src/data/servicePolicies.js';

assert.match(SERVICE_POLICY_VERSION, /^\d{4}-\d{2}-\d{2}$/);
assert.deepEqual(getPolicyIdsForAudience('communityAdmin'), ['terms', 'privacy', 'sensitive', 'community']);
assert.deepEqual(getPolicyIdsForAudience('unknown'), POLICY_AUDIENCE_IDS.member);

for (const [id, policy] of Object.entries(SERVICE_POLICIES)) {
    assert.equal(policy.id, id);
    assert.ok(policy.title);
    assert.ok(policy.shortLabel);
    assert.ok(policy.required);
    assert.ok(policy.sections.length > 0);
}

for (const ids of Object.values(POLICY_AUDIENCE_IDS)) {
    ids.forEach(id => assert.ok(SERVICE_POLICIES[id], `unknown policy id: ${id}`));
}

const emptyCommunityConsent = createEmptyPolicyConsents('communityAdmin');
assert.equal(isPolicyConsentComplete(emptyCommunityConsent, 'communityAdmin'), false);
const fullCommunityConsent = Object.fromEntries(
    getPolicyIdsForAudience('communityAdmin').map(id => [id, true])
);
assert.equal(isPolicyConsentComplete(fullCommunityConsent, 'communityAdmin'), true);
assert.equal(isPolicyConsentComplete({ ...fullCommunityConsent, sensitive: false }, 'communityAdmin'), false);

assert.ok(SERVICE_POLICIES.terms.sections.some(section => (
    section.paragraphs?.some(text => text.includes('주요 교단') && text.includes('소명'))
)));
assert.ok(SERVICE_POLICIES.privacy.sections.some(section => (
    section.paragraphs?.some(text => text.includes('공동체 탈퇴') && text.includes('개인 계정 탈퇴'))
)));
assert.ok(SERVICE_POLICIES.sensitive.sections.some(section => (
    section.paragraphs?.some(text => text.includes('민감정보'))
)));
assert.ok(POLICY_PUBLICATION_CHECKLIST.length >= 5);
assert.deepEqual(getPolicyIdsForAudience('member'), ['terms', 'privacy', 'sensitive', 'community']);
assert.deepEqual(getPolicyIdsForAudience('personal'), ['terms', 'privacy', 'sensitive', 'community']);

console.log(`service policy validation passed: ${Object.keys(SERVICE_POLICIES).length} documents`);
