import { assertEquals } from 'jsr:@std/assert@1';
import { buildFirebaseClaims, exchangeKakaoProfile } from './core.ts';

Deno.test('카카오 코드 교환과 프로필 응답을 연결한다', async () => {
  const calls: Array<[string, RequestInit | undefined]> = [];
  const fetcher = (async (input: string | URL | Request, init?: RequestInit) => {
    calls.push([String(input), init]);
    if (String(input).includes('/oauth/token')) {
      return Response.json({ access_token: 'fixture-access-token' });
    }
    return Response.json({
      id: 12345,
      kakao_account: { profile: { nickname: '테스트' }, email: 'test@example.com' },
    });
  }) as typeof fetch;
  const profile = await exchangeKakaoProfile({
    code: 'fixture-code', redirectUri: 'http://localhost:5173/',
    restKey: 'fixture-rest', clientSecret: 'fixture-secret', fetcher,
  });
  assertEquals(profile, { id: '12345', nickname: '테스트', email: 'test@example.com' });
  assertEquals(calls.length, 2);
  assertEquals(new Headers(calls[1][1]?.headers).get('Authorization'), 'Bearer fixture-access-token');
});

Deno.test('Firebase 커스텀 토큰 클레임을 1시간으로 만든다', () => {
  const claims = buildFirebaseClaims('kakao:12345', 'firebase@example.com', 1000);
  assertEquals(claims.uid, 'kakao:12345');
  assertEquals(claims.iss, 'firebase@example.com');
  assertEquals(claims.sub, 'firebase@example.com');
  assertEquals(claims.exp, 4600);
});
