import assert from 'node:assert/strict';
import fs from 'node:fs';

const source = fs.readFileSync(
    new URL('../src/utils/churchDirectory.js', import.meta.url),
    'utf8'
);
const pickerSource = fs.readFileSync(
    new URL('../src/components/ChurchPicker.jsx', import.meta.url),
    'utf8'
);

const functionBody = (name) => {
    const marker = `const ${name} =`;
    const start = source.indexOf(marker);
    assert.ok(start >= 0, `${name} 구현을 찾을 수 없습니다.`);

    const bodyStart = source.indexOf('{', start);
    assert.ok(bodyStart >= 0, `${name} 본문을 찾을 수 없습니다.`);

    let depth = 0;
    for (let index = bodyStart; index < source.length; index += 1) {
        if (source[index] === '{') depth += 1;
        if (source[index] === '}') {
            depth -= 1;
            if (depth === 0) return source.slice(bodyStart + 1, index);
        }
    }
    assert.fail(`${name} 본문이 닫히지 않았습니다.`);
};

const preferred = functionBody('readPreferredDirectory');
const retryReader = functionBody('readDirectoryWithRetry');
const publicGetter = functionBody('getChurchDirectory');

assert.match(
    preferred,
    /catch\s*\{[\s\S]*return\s+readLegacyDirectory\(\)/,
    'publicDirectoryMeta가 없거나 권한이 거부되면 settings/churchDirectory로 되돌아가야 합니다.'
);

assert.doesNotMatch(
    publicGetter,
    /return\s*\[\s*\]/,
    [
        '교회 디렉토리 읽기 실패를 빈 배열로 성공 처리하면 안 됩니다.',
        'publicDirectoryMeta 권한 거부 뒤 legacy 결과까지 누락된 것처럼 UI에 고정됩니다.',
        '캐시를 무효화한 뒤 오류를 전달하거나 legacy를 다시 읽어, 빈 검색 결과와 읽기 실패를 구분하세요.',
    ].join(' ')
);

assert.match(
    source,
    /const\s+DIRECTORY_READ_MAX_ATTEMPTS\s*=\s*2\s*;/,
    '교회 디렉토리 자동 재시도는 최초 시도 포함 최대 2회로 제한해야 합니다.'
);
assert.match(
    retryReader,
    /for\s*\([^;]+;\s*attempt\s*<=\s*DIRECTORY_READ_MAX_ATTEMPTS\s*;/,
    '자동 재시도는 DIRECTORY_READ_MAX_ATTEMPTS 경계를 사용해야 합니다.'
);
assert.match(
    retryReader,
    /throw\s+lastError/,
    '최종 실패는 빈 배열이 아니라 호출자에게 전달해야 합니다.'
);
assert.match(
    publicGetter,
    /readDirectoryWithRetry\(\)/,
    '공개 getChurchDirectory 진입점이 제한된 자동 재시도를 사용해야 합니다.'
);
assert.match(
    publicGetter,
    /cachePromise\s*=\s*null[\s\S]*throw\s+error/,
    '최종 실패 때 캐시를 비우고 오류를 전달해야 다음 호출이 복구할 수 있습니다.'
);

const loadingBranch = pickerSource.indexOf('{directoryLoading ? (');
const errorBranch = pickerSource.indexOf(') : directoryError ? (', loadingBranch);
const emptyBranch = pickerSource.indexOf(') : results.length === 0 ? (', errorBranch);
assert.ok(
    loadingBranch >= 0 && errorBranch > loadingBranch && emptyBranch > errorBranch,
    'ChurchPicker는 로딩 → 읽기 오류 → 실제 검색 결과 없음 순서로 상태를 구분해야 합니다.'
);
assert.match(
    pickerSource,
    /directoryLoading[\s\S]*교회 목록을 불러오는 중입니다/,
    '로딩 중에는 교회가 없다는 문구 대신 불러오는 중 상태를 보여야 합니다.'
);
assert.match(
    pickerSource,
    /directoryError[\s\S]*교회 목록을 불러오지 못했습니다/,
    '디렉토리 오류를 실제 검색 결과 없음과 구분해 안내해야 합니다.'
);
assert.match(
    pickerSource,
    /onClick=\{\(\) => setDirectoryRetry\([^}]+\)\}[\s\S]*다시 시도/,
    '오류 상태에는 사용자가 실행할 수 있는 다시 시도 버튼이 필요합니다.'
);
assert.match(
    pickerSource,
    /useEffect\([\s\S]*getChurchDirectory\(\)[\s\S]*\},\s*\[directoryRetry\]\)/,
    '다시 시도 상태 변경이 실제 디렉토리 읽기를 재실행해야 합니다.'
);

// 소비자 계약: public 메타가 거부되어도 정상 legacy 결과는 그대로 표시된다.
const resolveDirectory = async ({ readMeta, readLegacy }) => {
    try {
        await readMeta();
        assert.fail('이 회귀 시나리오에서는 public meta가 거부되어야 합니다.');
    } catch {
        return readLegacy();
    }
};

const legacyChurches = [
    { id: 'legacy-a', name: '서부교회' },
    { id: 'legacy-b', name: '테스트교회' },
];
const resolved = await resolveDirectory({
    readMeta: async () => {
        const error = new Error('Missing or insufficient permissions.');
        error.code = 'permission-denied';
        throw error;
    },
    readLegacy: async () => legacyChurches,
});

assert.deepEqual(
    resolved,
    legacyChurches,
    'publicDirectoryMeta 권한 거부가 legacy 교회 목록을 빈 배열로 바꾸면 안 됩니다.'
);

console.log('교회 디렉토리 fallback 계약 검증 통과');
