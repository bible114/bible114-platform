export type Fetcher = typeof fetch;

export const FIREBASE_CUSTOM_TOKEN_AUDIENCE =
  'https://identitytoolkit.googleapis.com/google.identity.identitytoolkit.v1.IdentityToolkit';

export const buildFirebaseClaims = (uid: string, clientEmail: string, now: number) => ({
  iss: clientEmail,
  sub: clientEmail,
  aud: FIREBASE_CUSTOM_TOKEN_AUDIENCE,
  iat: now,
  exp: now + 3600,
  uid,
});

export const exchangeKakaoProfile = async ({
  code,
  redirectUri,
  restKey,
  clientSecret,
  fetcher = fetch,
}: {
  code: string;
  redirectUri: string;
  restKey: string;
  clientSecret: string;
  fetcher?: Fetcher;
}) => {
  const tokenResponse = await fetcher('https://kauth.kakao.com/oauth/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded;charset=utf-8' },
    body: new URLSearchParams({
      grant_type: 'authorization_code', client_id: restKey,
      client_secret: clientSecret, redirect_uri: redirectUri, code,
    }),
  });
  const tokenPayload = await tokenResponse.json();
  if (!tokenResponse.ok || !tokenPayload.access_token) throw new Error('KAKAO_TOKEN_EXCHANGE_FAILED');

  const profileResponse = await fetcher('https://kapi.kakao.com/v2/user/me', {
    headers: { Authorization: `Bearer ${tokenPayload.access_token}` },
  });
  const profile = await profileResponse.json();
  if (!profileResponse.ok || !profile.id) throw new Error('KAKAO_PROFILE_FAILED');
  return {
    id: String(profile.id),
    nickname: profile.kakao_account?.profile?.nickname || '',
    email: profile.kakao_account?.email || null,
  };
};
