import assert from 'node:assert/strict';
import fs from 'node:fs';
import { getMembershipList, normalizeExtraMemberships } from '../src/utils/memberships.js';
import { rosterSnapshotToExtraOrgs } from '../src/utils/rosterSnapshot.js';
import {
    hasVerifiedCommunityProgress,
    mergeCanonicalProgressIntoRosterMembers,
    rosterSnapshotToMembers,
} from '../src/utils/rosterMembers.js';

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
const legacyMember = rosterSnapshotToMembers(legacySnapshot)[0];
assert.deepEqual(legacyMember.extraMemberships, []);
assert.equal(legacyMember.communityProgressIdentityVerified, false);
assert.equal(legacyMember.planId, null);
assert.equal(legacyMember.currentDay, 1);
assert.equal(legacyMember.lastReadDate, null);
assert.equal(hasVerifiedCommunityProgress(legacyMember), false);
const recoveredLegacyMember = mergeCanonicalProgressIntoRosterMembers(
    [legacyMember],
    [{
        uid: 'user-1',
        planId: 'readable_new',
        fixtureType: 'reading-badge-test',
        currentDay: 31,
        readCount: 2,
        readingYear: 2026,
        yearCompletedRounds: 1,
        lifetimeCompletedRounds: 1,
        score: 50,
        streak: 7,
        lastReadDate: 'Mon Jul 20 2026',
        recentReadDates: ['Mon Jul 20 2026'],
        weeklyReadKey: 'Sun Jul 19 2026',
        weeklyReadCount: 1,
    }],
)[0];
assert.equal(hasVerifiedCommunityProgress(recoveredLegacyMember), true);
assert.equal(recoveredLegacyMember.planId, 'readable_new');
assert.equal(recoveredLegacyMember.currentDay, 31);
assert.equal(recoveredLegacyMember.fixtureType, 'reading-badge-test');
assert.equal(recoveredLegacyMember.departmentId, 'adult');

const modernSnapshot = { docs: [makeDoc({
    uid: 'user-1',
    planId: 'readable_new',
    fixtureType: null,
    departmentId: 'adult',
    subgroupId: 'cell-1',
    recentReadDates: ['Sun Jul 19 2026', 'Mon Jul 20 2026'],
    extraMemberships: extras,
})] };
const modernOrg = rosterSnapshotToExtraOrgs(modernSnapshot, 'user-1')[0];
const modernMember = rosterSnapshotToMembers(modernSnapshot)[0];
assert.deepEqual(modernOrg.extraMemberships, modernMember.extraMemberships);
assert.equal(modernMember.communityProgressIdentityVerified, true);
assert.equal(modernMember.planId, 'readable_new');
assert.equal(modernMember.fixtureType, null);
assert.deepEqual(modernMember.recentReadDates, ['Sun Jul 19 2026', 'Mon Jul 20 2026']);
assert.deepEqual(
    getMembershipList(modernMember).map(item => [item.departmentId, item.subgroupId]),
    [['adult', 'cell-1'], ['adult', 'cell-2'], ['kids', 'class-1']]
);

const rules = read('firestore.rules');
assert.match(rules, /'subgroupId', 'subgroupName',[\s\S]*'extraMemberships', 'updatedAt'/);
assert.match(rules, /affectedKeys\(\)\.hasAny\(\['extraMemberships'\]\)[\s\S]*extraMemberships\.size\(\) <= 3/);
const selfPreferenceRules = rules.match(
    /function isSafeSelfPreferenceUpdate\(before, after\) \{([\s\S]*?)\n    \}/,
)?.[1] || '';
assert.doesNotMatch(selfPreferenceRules, /extraMemberships/,
    '일반 사용자가 users 문서의 추가 소속을 직접 바꾸지 못해야 한다.');
const usersCreateRulesStart = rules.indexOf('allow create:', rules.indexOf('match /users/{uid}'));
const usersCreateRulesEnd = rules.indexOf('allow update:', usersCreateRulesStart);
assert.match(rules.slice(usersCreateRulesStart, usersCreateRulesEnd), /allow create: if false;/,
    '무소속을 포함한 users 최초 생성은 검증된 서버 가입 action만 수행해야 한다.');
const rosterRuleStart = rules.indexOf('match /roster/{memberUid}');
const rosterCreateRulesStart = rules.indexOf('allow create:', rosterRuleStart);
const rosterCreateRulesEnd = rules.indexOf('allow update:', rosterCreateRulesStart);
assert.match(rules.slice(rosterCreateRulesStart, rosterCreateRulesEnd), /allow create: if false;/,
    '추가 공동체와 개인계정 전환 roster 생성은 서버 action만 수행해야 한다.');
assert.match(rules, /resource\.data\.churchId != 'unaffiliated_v1'[\s\S]*request\.resource\.data\.get\('primaryOrgId', null\) == resource\.data\.churchId[\s\S]*affectedKeys\(\)\.hasOnly\([\s\S]*'accountType', 'email', 'churchId', 'churchName', 'primaryOrgId', 'updatedAt'/,
    '개인계정 전환은 정상 필드만 바꾸고 무소속 seed 전환을 허용하지 않아야 한다.');
assert.doesNotMatch(rules, /신규 소셜 가입은 users \+ roster/);

const membershipCard = read('src/components/dashboard/CommunityMembershipCard.jsx');
const planSelection = read('src/components/PlanSelectionView.jsx');
const adminFirstGuide = read('src/components/dashboard/ChurchAdminReaderGuide.jsx');
const joinCore = read('supabase/functions/platform-api/joinCore.ts');
const joinSoloCore = read('supabase/functions/platform-api/joinSoloCommunityCore.ts');
const app = read('src/App.jsx');
const adminView = read('src/components/ChurchAdminView.jsx');
const adminDashboard = read('src/components/churchAdmin/DashboardTab.jsx');
const statsUtils = read('src/utils/statsUtils.js');
const authHook = read('src/hooks/useAuth.js');
const personalMigration = read('src/utils/personalAccountMigration.js');
const convertPersonalCore = read('supabase/functions/platform-api/convertToPersonalAccountCore.ts');
const convertPersonalService = read('supabase/functions/platform-api/convertToPersonalAccountService.ts');
assert.match(membershipCard, /joinCommunityViaApi\(\{/,
    '일반 추가 공동체 참여는 서버 API를 사용해야 한다.');
assert.doesNotMatch(membershipCard, />현재 교회 소그룹</,
    '소그룹 영역 제목은 현재 교회라는 일반 문구 대신 실제 교회명을 보여야 한다.');
assert.match(membershipCard, /\{selectedChurchName\} 소그룹/,
    '공동체 선택에서 현재 보고 있는 교회 이름을 소그룹 제목에 보여야 한다.');
assert.match(membershipCard, /주일학교 선생님은 자신의 소그룹과 맡은 반을 함께 선택하세요/,
    '가입 후 공동체 선택 화면에 교사용 다중 소그룹 안내가 있어야 한다.');
assert.match(planSelection, /가입 후 <b>메뉴 → 공동체 선택<\/b>에서 맡은 반/,
    '최초 가입 화면은 교사에게 가입 후 맡은 반을 추가하는 경로를 알려야 한다.');
assert.match(planSelection, /tempUser\?\.churchName \? `\$\{tempUser\.churchName\} 소그룹 선택`/,
    '최초 가입 소그룹 화면에도 실제 교회 이름을 보여야 한다.');
assert.match(adminFirstGuide, /주일학교 선생님에게는 가입 후 <b>메뉴 → 공동체 선택<\/b>에서 맡은 반도 함께 추가/,
    '관리자 최초 안내에 주일학교 교사 소그룹 설정 방법이 있어야 한다.');
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
assert.match(adminView, /progressMembers = members\.filter\(hasVerifiedCommunityProgress\)/,
    '동기화되지 않은 외부 명부는 관리자 진행 집계에서 제외해야 한다.');
assert.match(adminView, /진행 동기화 필요/,
    '동기화되지 않은 외부 명부를 DAY 0으로 오표시하면 안 된다.');
assert.match(adminView, /mergeCanonicalProgressIntoRosterMembers[\s\S]*getCommunityProgress/,
    '관리자 명부는 서버 권위 진행판으로 기존 roster를 비동기 보강해야 한다.');
assert.match(statsUtils, /filter\(hasVerifiedCommunityProgress\)/,
    '위험·MVP·소그룹 진행 집계는 검증된 진행만 사용해야 한다.');
assert.match(adminDashboard, /집계에서 제외합니다/,
    '관리자에게 동기화 전 제외 상태를 명시해야 한다.');

console.log('roster multi-membership validation passed');
