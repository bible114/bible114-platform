import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const source = await readFile(new URL('../src/components/modals/MemoListModal.jsx', import.meta.url), 'utf8');

assert.match(source, /h-\[94dvh\]/, '묵상 일기장은 모바일 화면 높이에 맞는 전체 시트여야 합니다.');
assert.match(source, /최근 기록[\s\S]*달력[\s\S]*성경별/, '최근, 달력, 성경별 찾기 탭이 모두 있어야 합니다.');
assert.match(source, /SCHEDULE_DATA\[currentUser\?\.planId\]/, '사용자의 읽기 계획에서 성경 범위를 찾아야 합니다.');
assert.match(source, /dateCounts\[key\]/, '기록이 있는 날짜를 달력에 표시해야 합니다.');
assert.match(source, /selectedBook === '전체' \|\| entry\.book === selectedBook/, '성경별 기록 필터가 동작해야 합니다.');
assert.match(source, /document\.body\.style\.overflow = 'hidden'/, '일기장을 연 동안 배경 화면이 움직이지 않아야 합니다.');
assert.match(source, /min-h-11/, '주요 모바일 버튼은 충분한 터치 높이를 가져야 합니다.');

console.log('묵상 일기장 모바일 UX 검증 통과');
