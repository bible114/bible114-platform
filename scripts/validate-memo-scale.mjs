import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
    expandMemoEntries,
    filterMemosByYear,
    flattenMemoBuckets,
    groupMemosByCalendarBucket,
    MAX_MEMO_DAY_CHARS,
    MAX_MEMO_TEXT_CHARS,
    memoBucketId,
    memoYearsBefore,
} from '../src/utils/memoStore.js';

const hookSource = await readFile(new URL('../src/hooks/useMemos.js', import.meta.url), 'utf8');
const contentSource = await readFile(new URL('../src/hooks/useBibleContent.js', import.meta.url), 'utf8');
const modalSource = await readFile(new URL('../src/components/modals/MemoListModal.jsx', import.meta.url), 'utf8');
const rulesSource = await readFile(new URL('../firestore.rules', import.meta.url), 'utf8');

const legacy = {
    '1_0': { text: '첫 묵상', date: '2025-01-02T00:00:00.000Z', title: '창 1장', round: 1, day: 0 },
    '1_31': { texts: ['두 번째 묵상', '같은 날 다시 쓴 묵상'], date: '2025-02-03T00:00:00.000Z', title: '창 32장', round: 1, day: 31 },
    '2_0': { texts: ['새해 묵상'], date: '2026-01-04T00:00:00.000Z', title: '창 1장', round: 2, day: 0 },
};
const grouped = groupMemosByCalendarBucket(legacy);
assert.deepEqual(Object.keys(grouped).sort(), ['2025_01_1', '2025_02_1', '2026_01_1']);
assert.equal(grouped['2025_01_1'].entries['1_0'].texts[0], '첫 묵상');
assert.equal(memoBucketId(2026, 7, 30), '2026_07_5');
assert.deepEqual(
    Object.keys(expandMemoEntries(legacy)).sort(),
    ['1_0', '1_31__1', '1_31__2', '2_0'],
);

const flattened = flattenMemoBuckets({
    docs: Object.values(grouped).map(bucket => ({ data: () => bucket })),
});
assert.equal(flattened['1_31__1'].texts[0], '두 번째 묵상');
assert.equal(flattened['1_31__2'].texts[0], '같은 날 다시 쓴 묵상');
assert.deepEqual(memoYearsBefore(flattened, 2026), [2025]);
assert.deepEqual(Object.keys(filterMemosByYear(flattened, 2025)).sort(), ['1_0', '1_31__1', '1_31__2']);

const largestMonth = {};
for (let day = 0; day < 31; day += 1) {
    largestMonth[`9_${day}`] = {
        texts: Array.from(
            { length: MAX_MEMO_DAY_CHARS / MAX_MEMO_TEXT_CHARS },
            () => '가'.repeat(MAX_MEMO_TEXT_CHARS),
        ),
        date: `2026-07-${String(day + 1).padStart(2, '0')}T00:00:00.000Z`,
        title: '장기 묵상',
        round: 9,
        day,
    };
}
const largestMonthBuckets = groupMemosByCalendarBucket(largestMonth);
const largestBucketBytes = Math.max(...Object.values(largestMonthBuckets).map(
    bucket => Buffer.byteLength(JSON.stringify(bucket)),
));
assert.ok(largestBucketBytes < 700 * 1024, `월·주 묵상 문서가 지나치게 큽니다: ${largestBucketBytes}`);

assert.doesNotMatch(hookSource, /memos:\s*newMemos/, '묵상 전체를 사용자 본문서에 다시 저장하면 안 됩니다.');
assert.match(hookSource, /memoBucketId\(year, month, calendarDay\)/, '묵상은 월·주 단위 하위 문서에 저장해야 합니다.');
assert.match(hookSource, /createMemoEntryKey\(readCount, day\)/, '새 묵상마다 독립 식별자를 만들어야 합니다.');
assert.match(hookSource, /entries:\s*\{\s*\.\.\.entries,\s*\[entryKey\]: savedMemo\s*\}/, '같은 DAY의 새 묵상을 기존 글에 합치면 안 됩니다.');
assert.match(hookSource, /flattenMemoBuckets\(verification\)[\s\S]*FieldValue\.delete\(\)/, '이관 재검증 뒤에만 구형 묵상을 제거해야 합니다.');
assert.doesNotMatch(modalSource, /연 1회|서버 기록 정리|deleteMemoYear/, '연간 정리 안내와 삭제 동작을 노출하면 안 됩니다.');
assert.match(rulesSource, /match \/memoBuckets\/\{bucketId\}[\s\S]*request\.auth\.uid == uid/, '묵상 월별 문서는 본인만 접근해야 합니다.');

assert.match(contentSource, /requestIdleCallback/, '다음 날 본문은 브라우저 유휴 시간에 준비해야 합니다.');
assert.match(contentSource, /dayToShow < totalPlanDays/, '마지막 날 뒤에는 사전 요청을 만들면 안 됩니다.');
assert.match(contentSource, /scheduleNextDayPrefetch\(planId, nextActualDay\)/, '다음 실제 일차를 사전 로딩해야 합니다.');
assert.match(contentSource, /cancelScheduledPrefetch/, '빠른 날짜 이동 시 오래된 사전 요청을 취소해야 합니다.');

console.log(`장기 묵상·다음 날 사전 로딩 검증 통과 (월·주 최대 모의 ${largestBucketBytes} bytes)`);
