import assert from 'node:assert/strict';
import fs from 'node:fs';
import { getMembershipList, normalizeExtraMemberships } from '../src/utils/memberships.js';
import { rosterSnapshotToExtraOrgs } from '../src/utils/rosterSnapshot.js';
import { rosterSnapshotToMembers } from '../src/utils/rosterMembers.js';

const read = path => fs.readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

const extras = [
    { departmentId: 'adult', departmentName: '장년부', subgroupId: 'cell-2', subgroupName: '2구역' },
    { departmentId: 'kids', departmentName: '주일학교', subgroupId: 'class-1', subgroupName: '믿음반' },
    { departmentId: 'adult', departmentName: '장년부', subgroupId: 'cell-2', subgroupName: '중복' },
    { departmentId: 'youth', departmentName: '청소년부', subgroupId: 'team-1', subgroupName: '1팀' },
];

assert.deepEqual(
    normalizeExtraMemberships(extras).map(item => [item.departmentId, item.subgroupId]),
    [['adult', 'cell-2'], ['kids', 'class-1']],
    '저장 순서상 앞의 3개 안에서 중복을 제거해야 한다.'
);
assert.deepEqual(normalizeExtraMemberships(null), []);
assert.equal(getMembershipList({
    departmentId: 'adult',
    subgroupId: 'cell-1',
    extraMemberships: extras,
}).length, 3);

const makeDoc = data => ({
    id: 'user-1',
    data: () => data,
    ref: {
        path: 'churches/church-1/roster/user-1',
        parent: { parent: { id: 'church-1' } },
    },
});

const legacySnapshot = { docs: [makeDoc({ uid: 'user-1', departmentId: 'adult', subgroupId: 'cell-1' })] };
assert.deepEqual(rosterSnapshotToExtraOrgs(legacySnapshot, 'user-1')[0].extraMemberships, []);
assert.deepEqual(rosterSnapshotToMembers(legacySnapshot)[0].extraMemberships, []);

const modernSnapshot = { docs: [makeDoc({
    uid: 'user-1',
    departmentId: 'adult',
    subgroupId: 'cell-1',
    recentReadDates: ['Sun Jul 19 2026', 'Mon Jul 20 2026'],
    extraMemberships: extras,
})] };
const modernOrg = rosterSnapshotToExtraOrgs(modernSnapshot, 'user-1')[0];
const modernMember = rosterSnapshotToMembers(modernSnapshot)[0];
assert.deepEqual(modernOrg.extraMemberships, modernMember.extraMemberships);
assert.deepEqual(modernMember.recentReadDates, ['Sun Jul 19 2026', 'Mon Jul 20 2026']);
assert.deepEqual(
    getMembershipList(modernMember).map(item => [item.departmentId, item.subgroupId]),
    [['adult', 'cell-1'], ['adult', 'cell-2'], ['kids', 'class-1']]
);

const rules = read('firestore.rules');
assert.match(rules, /'subgroupId', 'subgroupName', 'extraMemberships'/);
assert.match(rules, /request\.resource\.data\.extraMemberships\.size\(\) == 0/);
assert.match(rules, /request\.resource\.data\.get\('extraMemberships', \[\]\) ==[\s\S]*resource\.data\.get\('extraMemberships', \[\]\)/);
assert.match(rules, /affectedKeys\(\)\.hasAny\(\['extraMemberships'\]\)[\s\S]*extraMemberships\.size\(\) <= 3/);
assert.match(rules, /hasAny\(\['role', 'churchId', 'accountType', 'isDeleted', 'extraMemberships',[\s\S]*'talentWalletMigrated', 'departmentId', 'departmentName',[\s\S]*'subgroupId', 'subgroupName'\]\)/,
    '일반 사용자가 users 문서의 추가 소속을 직접 바꾸지 못해야 한다.');
assert.match(rules, /request\.resource\.data\.talent == 0[\s\S]*extraMemberships\.size\(\) == 0/,
    '직접 생성 roster는 잔액 0, 추가 소속 없음으로 시작해야 한다.');
assert.match(rules, /request\.resource\.data\.churchId == 'unaffiliated_v1'[\s\S]*request\.resource\.data\.get\('primaryOrgId', null\) == null[\s\S]*request\.resource\.data\.get\('score', 0\) == 0[\s\S]*request\.resource\.data\.get\('talent', 0\) == 0/,
    '무소속 users 직접 생성은 임의 점수·달란트 seed로 시작할 수 없어야 한다.');
assert.match(rules, /churchId == 'unaffiliated_v1'[\s\S]*\.data\.churchId == churchId/,
    '기존 사용자의 임의 타 공동체 roster 직접 생성은 차단해야 한다.');
assert.match(rules, /churchId == 'unaffiliated_v1'[\s\S]*\.data\.get\('isDeleted', false\) != true[\s\S]*request\.resource\.data\.score == get\(/,
    '무소속 roster도 활성 users 원장의 점수·소속을 그대로 복사해야 한다.');
assert.match(rules, /resource\.data\.churchId != 'unaffiliated_v1'[\s\S]*request\.resource\.data\.get\('primaryOrgId', null\) == resource\.data\.churchId[\s\S]*affectedKeys\(\)\.hasOnly\([\s\S]*'accountType', 'email', 'churchId', 'churchName', 'primaryOrgId', 'updatedAt'/,
    '개인계정 전환은 정상 필드만 바꾸고 무소속 seed 전환을 허용하지 않아야 한다.');
assert.doesNotMatch(rules, /신규 소셜 가입은 users \+ roster/);

const membershipCard = read('src/components/dashboard/CommunityMembershipCard.jsx');
const joinCore = read('supabase/functions/platform-api/joinCore.ts');
const joinSoloCore = read('supabase/functions/platform-api/joinSoloCommunityCore.ts');
const app = read('src/App.jsx');
const adminView = read('src/components/ChurchAdminView.jsx');
const authHook = read('src/hooks/useAuth.js');
const personalMigration = read('src/utils/personalAccountMigration.js');
const convertPersonalCore = read('supabase/functions/platform-api/convertToPersonalAccountCore.ts');
const convertPersonalService = read('supabase/functions/platform-api/convertToPersonalAccountService.ts');
assert.match(membershipCard, /joinCommunityViaApi\(\{/,
    '일반 추가 공동체 참여는 서버 API를 사용해야 한다.');
assert.match(joinCore, /membership:\s*\{[\s\S]*extraMemberships:\s*\[\]/,
    '서버가 새 roster를 추가 소속 빈 배열로 시작해야 한다.');
assert.match(authHook, /completePersonalSignupViaApi\(\{[\s\S]*departmentId: organization\.departmentId[\s\S]*subgroupId: organization\.subgroupId/);
assert.match(personalMigration, /convertToPersonalAccount\(\{[\s\S]*requestId: state\.conversionRequestId/,
    '개인계정 전환은 브라우저 users/roster 쓰기 대신 멱등 서버 action을 사용해야 한다.');
assert.doesNotMatch(personalMigration, /transaction\.set|\.collection\('users'\)\.doc\([^)]*\)\.update/,
    '개인계정 전환 브라우저가 users 또는 roster를 직접 쓰면 안 된다.');
assert.match(convertPersonalCore, /rosterSeed:[\s\S]*extraMemberships: userExtras/,
    '서버 전환 core가 최신 users 추가 소속을 source roster seed에 복사해야 한다.');
assert.match(convertPersonalService, /runCollectionGroupQuery<ConvertToPersonalAccountRoster>[\s\S]*"roster"[\s\S]*identity\.uid[\s\S]*limit: 4, transaction/,
    '서버 전환이 4번째 소속 생성을 막도록 canonical roster를 같은 transaction에서 읽어야 한다.');
assert.match(membershipCard, /joinSoloCommunityViaApi\(\{ expectedUid: requestUid \}\)/,
    '혼자 읽기 공동체 복귀는 브라우저 roster 생성 대신 서버 API를 사용해야 한다.');
assert.match(joinSoloCore, /rosterSeed:[\s\S]*extraMemberships: \[\]/,
    '서버가 혼자 읽기 roster를 추가 소속 빈 배열로 시작해야 한다.');
assert.match(app, /extraMemberships: Array\.isArray\(activeRosterOrg\.extraMemberships\)/);
assert.match(adminView, /isExternalOrgMember[\s\S]*collection\('roster'\)/,
    '외부 명부 회원의 추가 소속은 해당 공동체 roster에 저장해야 한다.');

console.log('roster multi-membership validation passed');
