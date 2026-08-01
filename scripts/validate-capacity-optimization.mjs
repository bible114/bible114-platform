import fs from 'node:fs';
import assert from 'node:assert/strict';
import { normalizeCommunityProgressMember } from '../src/utils/capacityApi.js';

const read = path => fs.readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const bibleLogic = read('src/hooks/useBibleLogic.js');
const dashboard = read('src/components/DashboardView.jsx');
const department = read('src/hooks/useDepartment.js');
const calendar = read('src/components/modals/CalendarModal.jsx');
const core = read('supabase/functions/platform-api/communityProgressCore.ts');
const service = read('supabase/functions/platform-api/communityProgressService.ts');
const capacityApi = read('src/utils/capacityApi.js');
const platformIndex = read('supabase/functions/platform-api/index.ts');

const checks = [
    ['대시보드 365건 상시 조회 제거', !bibleLogic.includes('.limit(365)') && !bibleLogic.includes("collection('history')")],
    ['달력 열기 전 서버 호출 금지', dashboard.includes("if (!showCalendar || !currentUser?.uid) return undefined")],
    ['달력 연도 캐시', dashboard.includes('calendarYears[calendarCacheKey]')],
    ['같은 날 중복 제거', core.includes('new Set(values.flatMap') && core.includes('calendarDatesForYear')],
    ['ISO 월별 달력 표시', calendar.includes('monthPrefix') && calendar.includes('readDates')],
    ['공동체 진행판 API 우선', department.includes('await getCommunityProgress(orgId')],
    ['진행판 8개 shard', core.includes('COMMUNITY_PROGRESS_SHARD_COUNT = 8')],
    ['진행판 planId·fixture 최소 투영', core.includes('planId: string') && core.includes('fixtureType: "reading-badge-test" | null')],
    ['신형 진행판 projection 버전 요청', capacityApi.includes('{ orgId, projectionVersion: 2 }')],
    ['구버전 웹 진행판 응답 호환', platformIndex.includes('result.members.map(legacyCommunityProgressMember)')],
    ['일일 원본 재대조', service.includes('meta.data.serviceDate === serviceDate') && service.includes('rebuildBoard')],
    ['민감 필드 미투영', !/CommunityProgressMember[^]*?(email|password|birthdate|memos|talent):/.test(core)],
    ['진행판 실패 시 개인정보 조회 없이 종료', department.includes("console.error('공동체 진행판 요약 로딩 실패:'") && !department.includes("collection('users')")],
];

const failed = checks.filter(([, ok]) => !ok);
for (const [label, ok] of checks) console.log(`${ok ? 'PASS' : 'FAIL'} ${label}`);
if (failed.length) process.exit(1);

const progressMember = {
    uid: 'member-1',
    name: '성도',
    planId: 'readable_new',
    fixtureType: null,
    currentDay: 60,
    readCount: 1,
    readingYear: null,
    yearCompletedRounds: null,
    lifetimeCompletedRounds: null,
    score: 0,
    streak: 0,
    lastReadDate: null,
    recentReadDates: [],
    weeklyReadKey: null,
    weeklyReadCount: 0,
    departmentId: null,
    departmentName: null,
    subgroupId: null,
    subgroupName: null,
    extraMemberships: [],
};
assert.equal(normalizeCommunityProgressMember(progressMember).currentDay, 60);
assert.throws(
    () => normalizeCommunityProgressMember({ ...progressMember, currentDay: 61 }),
    error => error?.code === 'INVALID_RESPONSE',
    '60일 plan의 Day 61 응답은 거부해야 한다'
);
assert.equal(normalizeCommunityProgressMember({
    ...progressMember,
    planId: '1year_new',
    currentDay: 365,
}).currentDay, 365);
console.log('PASS 진행판 plan별 currentDay exact 검증');
