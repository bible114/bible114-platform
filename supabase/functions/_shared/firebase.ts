import {
  createRemoteJWKSet,
  importPKCS8,
  type JWTPayload,
  jwtVerify,
  SignJWT,
} from "npm:jose@5.9.6";
import { PlatformError } from "./errors.ts";

export type FirebaseServiceAccount = {
  client_email: string;
  private_key: string;
  project_id: string;
  token_uri: string;
};

export type VerifiedFirebaseUser = {
  uid: string;
  anonymous: boolean;
  signInProvider: string | null;
  claims: JWTPayload;
};

const FIREBASE_JWK_URL = new URL(
  "https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com",
);
const firebasePublicKeys = createRemoteJWKSet(FIREBASE_JWK_URL);

export const parseServiceAccount = (raw: string): FirebaseServiceAccount => {
  try {
    const parsed = JSON.parse(raw) as Partial<FirebaseServiceAccount>;
    if (!parsed.client_email || !parsed.private_key || !parsed.project_id) {
      throw new Error("missing fields");
    }
    return {
      client_email: parsed.client_email,
      private_key: parsed.private_key,
      project_id: parsed.project_id,
      token_uri: parsed.token_uri || "https://oauth2.googleapis.com/token",
    };
  } catch (error) {
    throw new PlatformError("SERVICE_ACCOUNT_INVALID", { cause: error });
  }
};

export const getServiceAccount = (): FirebaseServiceAccount => {
  const raw = Deno.env.get("FIREBASE_SERVICE_ACCOUNT")?.trim();
  if (!raw) throw new PlatformError("SERVICE_ACCOUNT_INVALID");
  return parseServiceAccount(raw);
};

export const getBearerToken = (request: Request): string => {
  const token = request.headers.get("authorization")?.match(/^Bearer\s+(.+)$/i)
    ?.[1]?.trim();
  if (!token) throw new PlatformError("UNAUTHORIZED");
  return token;
};

export const verifyFirebaseIdToken = async (
  idToken: string,
  options: {
    allowAnonymous?: boolean;
    serviceAccount?: FirebaseServiceAccount;
  } = {},
): Promise<VerifiedFirebaseUser> => {
  const serviceAccount = options.serviceAccount ?? getServiceAccount();
  try {
    const { payload } = await jwtVerify(idToken, firebasePublicKeys, {
      algorithms: ["RS256"],
      audience: serviceAccount.project_id,
      issuer: `https://securetoken.google.com/${serviceAccount.project_id}`,
    });
    if (!payload.sub || typeof payload.sub !== "string") {
      throw new Error("missing subject");
    }
    const firebaseClaim = payload.firebase as
      | { sign_in_provider?: unknown }
      | undefined;
    const signInProvider = typeof firebaseClaim?.sign_in_provider === "string"
      ? firebaseClaim.sign_in_provider
      : null;
    const anonymous = signInProvider === "anonymous";
    if (anonymous && !options.allowAnonymous) {
      throw new PlatformError("ANONYMOUS_NOT_ALLOWED");
    }
    return { uid: payload.sub, anonymous, signInProvider, claims: payload };
  } catch (error) {
    if (error instanceof PlatformError) throw error;
    throw new PlatformError("TOKEN_INVALID", { cause: error });
  }
};

let accessTokenCache:
  | { value: string; projectId: string; expiresAt: number }
  | null = null;

export const getServiceAccessToken = async (
  options: {
    serviceAccount?: FirebaseServiceAccount;
    now?: number;
    fetcher?: typeof fetch;
  } = {},
) => {
  const now = options.now ?? Date.now();
  const serviceAccount = options.serviceAccount ?? getServiceAccount();
  if (
    accessTokenCache?.projectId === serviceAccount.project_id &&
    accessTokenCache.expiresAt - 60_000 > now
  ) {
    return {
      token: accessTokenCache.value,
      projectId: serviceAccount.project_id,
    };
  }
  try {
    const issuedAt = Math.floor(now / 1000);
    const key = await importPKCS8(serviceAccount.private_key, "RS256");
    const assertion = await new SignJWT({
      scope:
        "https://www.googleapis.com/auth/datastore https://www.googleapis.com/auth/identitytoolkit",
    })
      .setProtectedHeader({ alg: "RS256", typ: "JWT" })
      .setIssuer(serviceAccount.client_email)
      .setSubject(serviceAccount.client_email)
      .setAudience(serviceAccount.token_uri)
      .setIssuedAt(issuedAt)
      .setExpirationTime(issuedAt + 3600)
      .sign(key);
    const response = await (options.fetcher ?? fetch)(
      serviceAccount.token_uri,
      {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
          assertion,
        }),
      },
    );
    const payload = await response.json() as {
      access_token?: string;
      expires_in?: number;
    };
    if (!response.ok || !payload.access_token) {
      throw new Error("missing access token");
    }
    accessTokenCache = {
      value: payload.access_token,
      projectId: serviceAccount.project_id,
      expiresAt: now + Math.max(60, payload.expires_in ?? 3600) * 1000,
    };
    return {
      token: accessTokenCache.value,
      projectId: serviceAccount.project_id,
    };
  } catch (error) {
    throw new PlatformError("SERVICE_TOKEN_FAILED", { cause: error });
  }
};
