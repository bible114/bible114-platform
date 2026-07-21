import assert from 'node:assert/strict';
import fs from 'node:fs';

const source = fs.readFileSync(new URL('../src/components/OrgEditor.jsx', import.meta.url), 'utf8');

assert.match(source, /export const buildNumberedSubgroupNames/);
assert.match(source, /MAX_BULK_SUBGROUPS = 50/);
assert.match(source, /\+ 여러 소그룹 한 번에/);
assert.match(source, /이름 앞말[\s\S]*시작 번호[\s\S]*끝 번호[\s\S]*이름 뒷말/);
assert.match(source, /중복.*제외했어요/);
assert.match(source, /\+ 소그룹 추가/);
assert.match(source, /소그룹 없이.*전체를 하나의 그룹으로 운영합니다/);
assert.match(source, /소그룹 없이 운영/);
assert.match(source, /subgroups: \[\]/);

console.log('조직 편집기 일괄 추가·대그룹 운영 검증 통과');
