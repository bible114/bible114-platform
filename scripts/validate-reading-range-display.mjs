import assert from 'node:assert/strict';
import { formatReadingRangeForDisplay } from '../src/utils/readingRangeDisplay.js';

const cases = [
    ['시 1장', '시편 1편'],
    ['시 1-7장', '시편 1-7편'],
    ['신 32-34장, 시 90장', '신 32-34장, 시편 90편'],
    ['시편 23장', '시편 23편'],
    ['시 118:1-119:80', '시편 118:1-119:80'],
    ['사 1-3장', '사 1-3장'],
];

for (const [input, expected] of cases) {
    assert.equal(formatReadingRangeForDisplay(input), expected, input);
}

console.log('날짜 설정 시편 편 표기 검증 통과');
