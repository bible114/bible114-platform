import { importPKCS8, SignJWT } from 'npm:jose@5.9.6';
import { buildFirebaseClaims, exchangeKakaoProfile } from './core.ts';

const ALLOWED_ORIGINS = new Set([
  'https://www.bible114.net',
  'https://bible114.net',
  'http://localhost:5173',
  'http://localhost:5177',
]);

const json = (origin: string, status: number, body: Record<string, unknown>) => new Response(
  JSON.stringify(body),
  {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Access-Control-Allow-Origin': origin,
      'Access-Control-Allow-Headers': 'content-type',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Vary': 'Origin',
    },
  },
);

const getEnv = (name: string) => {
  const value = Deno.env.get(name)?.trim();
  if (!value) throw new Error(`${name}_MISSING`);
  return value;
};

const createFirebaseCustomToken = async (uid: string) => {
  const serviceAccount = JSON.parse(getEnv('FIREBASE_SERVICE_ACCOUNT')) as {
    client_email?: string;
    private_key?: string;
  };
  if (!serviceAccount.client_email || !serviceAccount.private_key) {
    throw new Error('FIREBASE_SERVICE_ACCOUNT_INVALID');
  }
  const now = Math.floor(Date.now() / 1000);
  const privateKey = await importPKCS8(serviceAccount.private_key, 'RS256');
  const claims = buildFirebaseClaims(uid, serviceAccount.client_email, now);
  return await new SignJWT({ uid: claims.uid })
    .setProtectedHeader({ alg: 'RS256', typ: 'JWT' })
    .setIssuer(serviceAccount.client_email)
    .setSubject(serviceAccount.client_email)
    .setAudience(claims.aud)
    .setIssuedAt(now)
    .setExpirationTime(now + 3600)
    .sign(privateKey);
};

Deno.serve(async (request) => {
  const origin = request.headers.get('origin') || '';
  if (!ALLOWED_ORIGINS.has(origin)) {
    return new Response(JSON.stringify({ error: '허용되지 않은 요청 주소입니다.' }), {
      status: 403,
      headers: { 'Content-Type': 'application/json; charset=utf-8' },
    });
  }
  if (request.method === 'OPTIONS') return json(origin, 204, {});
  if (request.method !== 'POST') return json(origin, 405, { error: 'POST 요청만 지원합니다.' });

  try {
    const { code, redirectUri } = await request.json();
    if (!code || !redirectUri) return json(origin, 400, { error: '카카오 인증 정보가 없습니다.' });
    const redirectOrigin = new URL(redirectUri).origin;
    if (!ALLOWED_ORIGINS.has(redirectOrigin)) {
      return json(origin, 400, { error: '허용되지 않은 리다이렉트 주소입니다.' });
    }

    const profile = await exchangeKakaoProfile({
      code, redirectUri,
      restKey: getEnv('KAKAO_REST_KEY'),
      clientSecret: getEnv('KAKAO_CLIENT_SECRET'),
    });

    const token = await createFirebaseCustomToken(`kakao:${profile.id}`);
    return json(origin, 200, {
      token,
      nickname: profile.nickname,
      email: profile.email,
    });
  } catch (error) {
    console.error('kakao-auth failed', error instanceof Error ? error.message : error);
    return json(origin, 500, { error: '카카오 로그인 처리 중 오류가 발생했습니다.' });
  }
});
