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
const banner = read('src/components/dashboard/SocialLinkBanner.jsx');

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
assert.match(auth, /openExistingSocialUser\(firebaseUser, doc, loginTiming\)/);
// 연결된 카카오가 플랫폼/슈퍼관리자 uid면 Google 큰 버튼(T112b)과 같은 관리자 로그인으로 진입한다.
assert.match(auth, /\['platformAdmin', 'superAdmin'\]\.includes\(doc\.data\(\)\?\.role\)/);
assert.match(auth, /finishAdminLogin\(cred, \{ requireRegisteredAdmin: true, loginTiming \}\)/);
// 다른 방식으로 등록된 계정의 카카오 로그인은 일반 실패 문구로 뭉개지 않고 안내 후 세션을 정리한다.
assert.match(auth, /error\?\.message === 'NOT_MEMBER_ACCOUNT'/);
assert.match(auth, /linkWithPopup\(new firebase\.auth\.GoogleAuthProvider\(\)\)/);
assert.match(auth, /exchangeKakaoCode\(\{ code: callback\.code, redirectUri: getKakaoRedirectUri\(\), linkIdToken \}\)/);
assert.match(auth, /authProviders: firebase\.firestore\.FieldValue\.arrayUnion\('kakao\.com'\)/);
assert.match(auth, /callback\.error === 'access_denied'/);
assert.match(edge, /FIREBASE_SERVICE_ACCOUNT/);
assert.match(edge, /verifyFirebaseIdToken/);
assert.match(edge, /kakaoLinks/);
assert.match(edge, /linkedUid \|\| `kakao:\$\{profile\.id\}`/);
assert.match(edge, /status: 409|json\(origin, 409/);
assert.match(edge, /new SignJWT/);
assert.match(core, /kakaoLinkDocumentId/);
assert.match(core, /KAKAO_TOKEN_EXCHANGE_FAILED/);
assert.match(core, /Bearer \$\{tokenPayload\.access_token\}/);
assert.match(banner, /7일 동안 보지 않기/);
assert.match(banner, /다음부터 카카오\/구글로 3초 로그인/);

console.log('카카오 커스텀 인증 계약 검증 통과: 로그인 매핑, 기존 계정 연결, state, JWT');
