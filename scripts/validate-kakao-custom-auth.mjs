import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  isValidKakaoState,
  readKakaoCallback,
  sanitizeKakaoCallbackUrl,
} from '../src/utils/kakaoAuth.js';

const read = path => fs.readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const auth = read('src/hooks/useAuth.js');
const edge = read('supabase/functions/kakao-auth/index.ts');
const core = read('supabase/functions/kakao-auth/core.ts');

assert.equal(isValidKakaoState('same-state', 'same-state'), true);
assert.equal(isValidKakaoState('wrong-state', 'same-state'), false);
assert.equal(isValidKakaoState('', 'same-state'), false);

const callback = readKakaoCallback('https://www.bible114.net/?church=abc&code=fixture&state=same-state#top');
assert.deepEqual(callback, {
  code: 'fixture', state: 'same-state', error: null, errorDescription: null,
});
assert.equal(
  sanitizeKakaoCallbackUrl('https://www.bible114.net/?church=abc&code=fixture&state=same-state#top'),
  '/?church=abc#top',
);
const cancelled = readKakaoCallback('https://www.bible114.net/?error=access_denied&error_description=cancelled');
assert.equal(cancelled.error, 'access_denied');
assert.equal(sanitizeKakaoCallbackUrl('https://www.bible114.net/?error=access_denied'), '/');

assert.match(auth, /sessionStorage\.setItem\(KAKAO_STATE_KEY/);
assert.match(auth, /isValidKakaoState\(callback\.state, expectedState\)/);
assert.match(auth, /auth\.signInWithCustomToken\(profile\.token\)/);
assert.match(auth, /callback\.error === 'access_denied'/);
assert.match(edge, /FIREBASE_SERVICE_ACCOUNT/);
assert.match(edge, /new SignJWT/);
assert.match(core, /KAKAO_TOKEN_EXCHANGE_FAILED/);
assert.match(core, /Bearer \$\{tokenPayload\.access_token\}/);

console.log('카카오 커스텀 인증 계약 검증 통과: state, URL 정리, 취소, 함수 교환, JWT');
