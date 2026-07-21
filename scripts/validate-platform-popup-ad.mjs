import assert from 'node:assert/strict';
import fs from 'node:fs';

const popup = fs.readFileSync(new URL('../src/components/PlatformPopupAd.jsx', import.meta.url), 'utf8');

assert.match(popup, /z-\[10020\]/, '교회 광고는 모든 일반 모달보다 높은 최상단 레이어여야 합니다.');
assert.match(popup, /WEEK_IN_MS = 7 \* 24 \* 60 \* 60 \* 1000/);
assert.match(popup, /expiresAt: Date\.now\(\) \+ WEEK_IN_MS/);
assert.match(popup, /Number\(hidden\?\.expiresAt\) > Date\.now\(\)/);
assert.match(popup, /일주일 동안 보지 않기/);
assert.doesNotMatch(popup, /오늘 하루 보지 않기|HIDE_TODAY_KEY/);
assert.match(popup, /max-w-\[27rem\]/);
assert.match(popup, /min-h-10/);
assert.match(popup, /성경통독114 소식/);
assert.match(popup, /bg-gradient-to-r from-indigo-500 via-blue-500 to-amber-400/);
assert.doesNotMatch(popup, /flex-1 items-center justify-center rounded-xl bg-slate-900/);

const admin = fs.readFileSync(new URL('../src/components/PlatformAdminView.jsx', import.meta.url), 'utf8');
assert.match(admin, /import \{ PlatformPopupCard \} from '\.\/PlatformPopupAd'/);
assert.match(admin, /<PlatformPopupCard popup=\{popupInput\} preview \/>/);

console.log('교회 광고 팝업 우선순위, 7일 숨김, 실제-미리보기 공통 디자인 검증 통과');
