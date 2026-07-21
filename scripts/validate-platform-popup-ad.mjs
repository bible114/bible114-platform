import assert from 'node:assert/strict';
import fs from 'node:fs';

const popup = fs.readFileSync(new URL('../src/components/PlatformPopupAd.jsx', import.meta.url), 'utf8');

assert.match(popup, /z-\[10020\]/, '교회 광고는 모든 일반 모달보다 높은 최상단 레이어여야 합니다.');
assert.match(popup, /WEEK_IN_MS = 7 \* 24 \* 60 \* 60 \* 1000/);
assert.match(popup, /expiresAt: Date\.now\(\) \+ WEEK_IN_MS/);
assert.match(popup, /Number\(hidden\?\.expiresAt\) > Date\.now\(\)/);
assert.match(popup, /일주일 동안 보지 않기/);
assert.doesNotMatch(popup, /오늘 하루 보지 않기|HIDE_TODAY_KEY/);
assert.match(popup, /max-w-sm/);
assert.match(popup, /min-h-10/);

console.log('교회 광고 팝업 우선순위, 7일 숨김, 모바일 디자인 검증 통과');
