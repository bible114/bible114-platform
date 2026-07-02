import assert from 'node:assert/strict';
import { formatSaehangulText, extractVerseMarkers } from '../src/utils/saehangulParser.js';

const getMarkers = (text) => extractVerseMarkers(formatSaehangulText(text));

const judgesSix = [
    '# 사사기 6',
    '1 이스라엘 자손이 악한 일을 저질렀다. 2 미디안이 강해졌다. 3 이스라엘이 씨를 뿌리면 쳐들어왔다. 4 땅의 소산을 남겨 두지 않았다. 5 낙타가 셀 수 없이 많았다. 6 이스라엘이 매우 궁핍하게 되었다. 7 이스라엘 자손이 부르짖었다. 8 여호와께서 한 예언자를 보내셨다. 9 내가 너희를 이집트에서 이끌어 냈다. 10 나는 너희 하나님 여호와다. 11 여호와의 천사가 왔다. 12 사람들이 시스라에게 알려 주었다. 13시스라는 자신에게 있던 전투수레 곧 쇠 전투수레 900대와 자신이 거느린 백성을 다 불러 모았다. 14 드보라가 바락에게 말했다.'
].join('\n');

assert.deepEqual(
    getMarkers(judgesSix),
    [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14],
    '붙어 있는 13시스라도 빠뜨리지 않고 다음 절로 인식해야 한다.'
);

const gideonFood = [
    '# 사사기 6',
    '1 기드온이 가서 어린 염소로 먹을 것을 만들고, 밀가루 22리터로 누룩없는빵을 만들었다. 2하나님의 천사가 기드온에게 말했다. 3여호와의 천사가 손에 든 지팡이 끝을 뻗었다.'
].join('\n');

const gideonFormatted = formatSaehangulText(gideonFood);
assert.deepEqual(
    extractVerseMarkers(gideonFormatted),
    [1, 2, 3],
    '22리터처럼 본문 숫자는 절 번호로 인식하면 안 된다.'
);
assert.ok(
    !gideonFormatted.includes('[[VERSE:22]]'),
    '본문 숫자 22가 절 마커로 생성되면 안 된다.'
);

const boldSequential = [
    '# 출애굽기 1',
    '**1** 이름들은 이러하다. **2** 르우벤, 시므온, 레위, 유다, 3잇사갈, 스불론, 베냐민, **4** 단과 납달리.'
].join('\n');

assert.deepEqual(
    getMarkers(boldSequential),
    [1, 2],
    'bold 데이터에서는 예상 순서가 아닌 숫자를 절로 승격하지 않아야 한다.'
);

console.log('새한글 절 번호 파서 테스트 통과');
