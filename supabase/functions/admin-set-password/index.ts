import { importPKCS8, SignJWT } from 'npm:jose@5.9.6';

const ALLOWED_ORIGINS = new Set(['https://www.bible114.net', 'https://bible114.net', 'http://localhost:5173', 'http://localhost:5177']);
const FIREBASE_API_KEY = 'AIzaSyBF122lgD5fTX70HBtd_nl0ZVKhyyQnyGo';
const json = (origin: string, status: number, body: Record<string, unknown>) => new Response(status === 204 ? null : JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Access-Control-Allow-Origin': origin, 'Access-Control-Allow-Headers': 'content-type, authorization', 'Access-Control-Allow-Methods': 'POST, OPTIONS', Vary: 'Origin' } });
const getEnv = (name: string) => { const value = Deno.env.get(name)?.trim(); if (!value) throw new Error(`${name}_MISSING`); return value; };
const fail = (code: string) => { throw new Error(code); };

const serviceAccessToken = async () => {
  const serviceAccount = JSON.parse(getEnv('FIREBASE_SERVICE_ACCOUNT')) as { client_email?: string; private_key?: string; token_uri?: string; };
  if (!serviceAccount.client_email || !serviceAccount.private_key) fail('SERVICE_ACCOUNT_INVALID');
  const now = Math.floor(Date.now() / 1000);
  const key = await importPKCS8(serviceAccount.private_key, 'RS256');
  const assertion = await new SignJWT({ scope: 'https://www.googleapis.com/auth/datastore https://www.googleapis.com/auth/identitytoolkit' })
    .setProtectedHeader({ alg: 'RS256', typ: 'JWT' }).setIssuer(serviceAccount.client_email).setSubject(serviceAccount.client_email)
    .setAudience(serviceAccount.token_uri || 'https://oauth2.googleapis.com/token').setIssuedAt(now).setExpirationTime(now + 3600).sign(key);
  const response = await fetch(serviceAccount.token_uri || 'https://oauth2.googleapis.com/token', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion }) });
  const payload = await response.json();
  if (!response.ok || !payload.access_token) fail('SERVICE_TOKEN_FAILED');
  return { token: payload.access_token as string, projectId: (serviceAccount as { project_id?: string }).project_id || 'bible114-platform' };
};

const getDocument = async (token: string, projectId: string, path: string) => {
  const response = await fetch(`https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/${path}`, { headers: { Authorization: `Bearer ${token}` } });
  if (!response.ok) fail('FIRESTORE_READ_FAILED');
  return (await response.json()).fields || {};
};
const str = (fields: Record<string, any>, name: string) => fields[name]?.stringValue ?? null;
const updatePrivatePassword = async (token: string, projectId: string, uid: string, password: string) => {
  const url = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/users/${uid}/private/auth?updateMask.fieldPaths=password`;
  const response = await fetch(url, { method: 'PATCH', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ fields: { password: { stringValue: password } } }) });
  if (!response.ok) fail('FIRESTORE_WRITE_FAILED');
};

Deno.serve(async request => {
  const origin = request.headers.get('origin') || '';
  if (!ALLOWED_ORIGINS.has(origin)) return new Response(JSON.stringify({ error: '허용되지 않은 요청 주소입니다.' }), { status: 403, headers: { 'Content-Type': 'application/json; charset=utf-8' } });
  if (request.method === 'OPTIONS') return json(origin, 204, {});
  if (request.method !== 'POST') return json(origin, 405, { error: 'POST 요청만 지원합니다.' });
  try {
    const bearer = request.headers.get('authorization')?.match(/^Bearer (.+)$/i)?.[1];
    const { targetUid, newPassword } = await request.json();
    if (!bearer || typeof targetUid !== 'string' || typeof newPassword !== 'string' || newPassword.length < 6) return json(origin, 400, { error: '요청 정보가 올바르지 않습니다.' });
    const lookup = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${FIREBASE_API_KEY}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ idToken: bearer }) });
    const lookupData = await lookup.json(); const callerUid = lookupData?.users?.[0]?.localId;
    if (!lookup.ok || !callerUid) return json(origin, 401, { error: '인증을 확인할 수 없습니다.' });
    const { token, projectId } = await serviceAccessToken();
    const [caller, target] = await Promise.all([getDocument(token, projectId, `users/${callerUid}`), getDocument(token, projectId, `users/${targetUid}`)]);
    const role = str(caller, 'role'); const callerChurchId = str(caller, 'churchId'); const targetChurchId = str(target, 'churchId'); const targetPrimaryOrgId = str(target, 'primaryOrgId');
    // 삭제 처리된 관리자 계정의 잔존 세션 방어
    if (caller.isDeleted?.booleanValue === true) return json(origin, 403, { error: '비밀번호 변경 권한이 없습니다.' });
    const isPlatform = role === 'platformAdmin' || role === 'superAdmin';
    if (!(isPlatform || (role === 'churchAdmin' && callerChurchId && (targetChurchId === callerChurchId || targetPrimaryOrgId === callerChurchId)))) return json(origin, 403, { error: '비밀번호 변경 권한이 없습니다.' });
    // 관리자 권한의 계정 수정(localId 지정)은 공개 API 키가 아니라 서비스 계정 OAuth 토큰이 필요하다
    const update = await fetch(`https://identitytoolkit.googleapis.com/v1/projects/${projectId}/accounts:update`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify({ localId: targetUid, password: newPassword }) });
    if (!update.ok) fail('AUTH_PASSWORD_UPDATE_FAILED');
    await updatePrivatePassword(token, projectId, targetUid, newPassword);
    return json(origin, 200, { ok: true });
  } catch (error) { console.error('admin-set-password failed', error instanceof Error ? error.message : error); return json(origin, 500, { error: '비밀번호 변경 중 오류가 발생했습니다.' }); }
});
