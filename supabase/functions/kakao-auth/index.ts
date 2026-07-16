import {
  createRemoteJWKSet,
  importPKCS8,
  jwtVerify,
  SignJWT,
} from "npm:jose@5.9.6";
import {
  buildFirebaseClaims,
  buildGoogleAccessClaims,
  exchangeKakaoProfile,
  kakaoLinkDocumentId,
} from "./core.ts";

const ALLOWED_ORIGINS = new Set([
  "https://www.bible114.net",
  "https://bible114.net",
  "http://localhost:5173",
  "http://localhost:5174",
  "http://localhost:5177",
]);

const json = (origin: string, status: number, body: Record<string, unknown>) =>
  new Response(
    status === 204 ? null : JSON.stringify(body),
    {
      status,
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Access-Control-Allow-Origin": origin,
        "Access-Control-Allow-Headers": "content-type",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Vary": "Origin",
      },
    },
  );

const getEnv = (name: string) => {
  const value = Deno.env.get(name)?.trim();
  if (!value) throw new Error(`${name}_MISSING`);
  return value;
};

const firebasePublicKeys = createRemoteJWKSet(
  new URL(
    "https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com",
  ),
);

const createFirebaseCustomToken = async (uid: string, kakaoId: string) => {
  const serviceAccount = getServiceAccount();
  const now = Math.floor(Date.now() / 1000);
  const privateKey = await importPKCS8(serviceAccount.private_key, "RS256");
  const claims = buildFirebaseClaims(
    uid,
    kakaoId,
    serviceAccount.client_email,
    now,
  );
  return await new SignJWT({ uid: claims.uid, claims: claims.claims })
    .setProtectedHeader({ alg: "RS256", typ: "JWT" })
    .setIssuer(serviceAccount.client_email)
    .setSubject(serviceAccount.client_email)
    .setAudience(claims.aud)
    .setIssuedAt(now)
    .setExpirationTime(now + 3600)
    .sign(privateKey);
};

const getServiceAccount = () => {
  const serviceAccount = JSON.parse(getEnv("FIREBASE_SERVICE_ACCOUNT")) as {
    client_email?: string;
    private_key?: string;
    project_id?: string;
  };
  if (
    !serviceAccount.client_email || !serviceAccount.private_key ||
    !serviceAccount.project_id
  ) {
    throw new Error("FIREBASE_SERVICE_ACCOUNT_INVALID");
  }
  return serviceAccount as {
    client_email: string;
    private_key: string;
    project_id: string;
  };
};

const createGoogleAccessToken = async () => {
  const serviceAccount = getServiceAccount();
  const now = Math.floor(Date.now() / 1000);
  const privateKey = await importPKCS8(serviceAccount.private_key, "RS256");
  const claims = buildGoogleAccessClaims(serviceAccount.client_email, now);
  const assertion = await new SignJWT({ scope: claims.scope })
    .setProtectedHeader({ alg: "RS256", typ: "JWT" })
    .setIssuer(serviceAccount.client_email)
    .setAudience(claims.aud)
    .setIssuedAt(now)
    .setExpirationTime(now + 3600)
    .sign(privateKey);
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion,
    }),
  });
  const payload = await response.json();
  if (!response.ok || !payload.access_token) {
    throw new Error("GOOGLE_ACCESS_TOKEN_FAILED");
  }
  return payload.access_token as string;
};

const verifyFirebaseIdToken = async (idToken: string) => {
  const { project_id: projectId } = getServiceAccount();
  const { payload } = await jwtVerify(idToken, firebasePublicKeys, {
    audience: projectId,
    issuer: `https://securetoken.google.com/${projectId}`,
  });
  if (!payload.sub || typeof payload.sub !== "string") {
    throw new Error("FIREBASE_ID_TOKEN_INVALID");
  }
  const signInProvider =
    (payload as { firebase?: { sign_in_provider?: string } }).firebase
      ?.sign_in_provider;
  if (signInProvider === "anonymous") {
    throw new Error("FIREBASE_ID_TOKEN_ANONYMOUS");
  }
  return payload.sub;
};

const getKakaoLink = async (kakaoId: string, accessToken: string) => {
  const { project_id: projectId } = getServiceAccount();
  const docId = encodeURIComponent(kakaoLinkDocumentId(kakaoId));
  const response = await fetch(
    `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/kakaoLinks/${docId}`,
    {
      headers: { Authorization: `Bearer ${accessToken}` },
    },
  );
  if (response.status === 404) return null;
  const payload = await response.json();
  if (!response.ok) throw new Error("KAKAO_LINK_READ_FAILED");
  return payload.fields?.uid?.stringValue
    ? String(payload.fields.uid.stringValue)
    : null;
};

const saveKakaoLink = async (
  kakaoId: string,
  uid: string,
  accessToken: string,
) => {
  const { project_id: projectId } = getServiceAccount();
  const docId = encodeURIComponent(kakaoLinkDocumentId(kakaoId));
  const response = await fetch(
    `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/kakaoLinks/${docId}?currentDocument.exists=false`,
    {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ fields: { uid: { stringValue: uid } } }),
    },
  );
  if (response.status === 412) return false;
  if (!response.ok) throw new Error("KAKAO_LINK_WRITE_FAILED");
  return true;
};

Deno.serve(async (request) => {
  const origin = request.headers.get("origin") || "";
  if (!ALLOWED_ORIGINS.has(origin)) {
    return new Response(
      JSON.stringify({ error: "허용되지 않은 요청 주소입니다." }),
      {
        status: 403,
        headers: { "Content-Type": "application/json; charset=utf-8" },
      },
    );
  }
  if (request.method === "OPTIONS") return json(origin, 204, {});
  if (request.method !== "POST") {
    return json(origin, 405, { error: "POST 요청만 지원합니다." });
  }

  try {
    const { code, redirectUri, linkIdToken } = await request.json();
    if (!code || !redirectUri) {
      return json(origin, 400, { error: "카카오 인증 정보가 없습니다." });
    }
    const redirectOrigin = new URL(redirectUri).origin;
    if (!ALLOWED_ORIGINS.has(redirectOrigin)) {
      return json(origin, 400, {
        error: "허용되지 않은 리다이렉트 주소입니다.",
      });
    }

    const profile = await exchangeKakaoProfile({
      code,
      redirectUri,
      restKey: getEnv("KAKAO_REST_KEY"),
      clientSecret: getEnv("KAKAO_CLIENT_SECRET"),
    });

    const accessToken = await createGoogleAccessToken();
    const linkedUid = await getKakaoLink(profile.id, accessToken);
    if (linkIdToken) {
      const verifiedUid = await verifyFirebaseIdToken(String(linkIdToken));
      if (linkedUid && linkedUid !== verifiedUid) {
        return json(origin, 409, {
          error: "이미 다른 계정에 연결된 카카오 계정입니다.",
        });
      }
      if (!linkedUid) {
        const created = await saveKakaoLink(
          profile.id,
          verifiedUid,
          accessToken,
        );
        if (!created) {
          const racedUid = await getKakaoLink(profile.id, accessToken);
          if (racedUid !== verifiedUid) {
            return json(origin, 409, {
              error: "이미 다른 계정에 연결된 카카오 계정입니다.",
            });
          }
        }
      }
      return json(origin, 200, { linked: true });
    }

    const token = await createFirebaseCustomToken(
      linkedUid || `kakao:${profile.id}`,
      profile.id,
    );
    return json(origin, 200, {
      token,
      nickname: profile.nickname,
      email: profile.email,
    });
  } catch (error) {
    console.error(
      "kakao-auth failed",
      error instanceof Error ? error.message : error,
    );
    return json(origin, 500, {
      error: "카카오 로그인 처리 중 오류가 발생했습니다.",
    });
  }
});
