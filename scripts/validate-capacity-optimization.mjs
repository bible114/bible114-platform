import fs from 'node:fs';

const read = path => fs.readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const bibleLogic = read('src/hooks/useBibleLogic.js');
const dashboard = read('src/components/DashboardView.jsx');
const department = read('src/hooks/useDepartment.js');
const calendar = read('src/components/modals/CalendarModal.jsx');
const core = read('supabase/functions/platform-api/communityProgressCore.ts');
const service = read('supabase/functions/platform-api/communityProgressService.ts');

const checks = [
    ['대시보드 365건 상시 조회 제거', !bibleLogic.includes('.limit(365)') && !bibleLogic.includes("collection('history')")],
    ['달력 열기 전 서버 호출 금지', dashboard.includes("if (!showCalendar || !currentUser?.uid) return undefined")],
    ['달력 연도 캐시', dashboard.includes('calendarYears[calendarCacheKey]')],
    ['같은 날 중복 제거', core.includes('new Set(values.flatMap') && core.includes('calendarDatesForYear')],
    ['ISO 월별 달력 표시', calendar.includes('monthPrefix') && calendar.includes('readDates')],
    ['공동체 진행판 API 우선', department.includes('await getCommunityProgress(orgId')],
    ['진행판 실패 시 기존 경로 복구', department.includes('기존 명단 조회로 복구')],
    ['진행판 8개 shard', core.includes('COMMUNITY_PROGRESS_SHARD_COUNT = 8')],
    ['일일 원본 재대조', service.includes('meta.data.serviceDate === serviceDate') && service.includes('rebuildBoard')],
    ['민감 필드 미투영', !/CommunityProgressMember[^]*?(email|password|birthdate|memos|talent):/.test(core)],
];

const failed = checks.filter(([, ok]) => !ok);
for (const [label, ok] of checks) console.log(`${ok ? 'PASS' : 'FAIL'} ${label}`);
if (failed.length) process.exit(1);
