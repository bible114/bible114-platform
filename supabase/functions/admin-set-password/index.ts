import { importPKCS8, SignJWT } from "npm:jose@5.9.6";
import {
  AdminPasswordOperationError,
  canAdminChangePassword,
  MAX_REQUEST_BYTES,
  parseAdminPasswordRequest,
  updateAdminPasswordWithCompensation,
} from "./core.ts";

const ALLOWED_ORIGINS = new Set([
  "https://www.bible114.net",
  "https://bible114.net",
  "http://localhost:5173",
  "http://localhost:5177",
]);
const FIREBASE_API_KEY = "AIzaSyBF122lgD5fTX70HBtd_nl0ZVKhyyQnyGo";
const json = (origin: string, status: number, body: Record<string, unknown>) =>
  new Response(status === 204 ? null : JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Access-Control-Allow-Origin": origin,
      "Access-Control-Allow-Headers": "content-type, authorization",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      Vary: "Origin",
    },
  });
const getEnv = (name: string) => {
  const value = Deno.env.get(name)?.trim();
  if (!value) throw new Error(`${name}_MISSING`);
  return value;
};
const fail = (code: string): never => {
  throw new Error(code);
};

type FirestoreField = {
  stringValue?: string;
  booleanValue?: boolean;
  nullValue?: null;
};
type FirestoreFields = Record<string, FirestoreField>;
type FirestoreDocumentSnapshot = {
  fields: FirestoreFields;
  updateTime: string;
};
type IdentityToolkitUser = {
  localId?: string;
  email?: string;
  passwordHash?: string;
  passwordUpdatedAt?: string | number;
  providerUserInfo?: Array<{ providerId?: string }>;
};
type PasswordChangeLock = {
  updateTime: string;
};
// Supabase Edge의 최대 wall-clock(유료 400초)보다 길게 잡아, 느린 첫 요청이
// 살아 있는 동안 다른 인스턴스가 잠금을 회수해 겹쳐 쓰지 못하게 한다.
const PASSWORD_CHANGE_LOCK_MS = 10 * 60 * 1000;

const serviceAccessToken = async () => {
  const serviceAccount = JSON.parse(getEnv("FIREBASE_SERVICE_ACCOUNT")) as {
    client_email?: string;
    private_key?: string;
    token_uri?: string;
    project_id?: string;
  };
  if (!serviceAccount.client_email || !serviceAccount.private_key) {
    fail("SERVICE_ACCOUNT_INVALID");
  }
  const clientEmail = serviceAccount.client_email as string;
  const privateKey = serviceAccount.private_key as string;
  const now = Math.floor(Date.now() / 1000);
  const key = await importPKCS8(privateKey, "RS256");
  const assertion = await new SignJWT({
    scope:
      "https://www.googleapis.com/auth/datastore https://www.googleapis.com/auth/identitytoolkit",
  })
    .setProtectedHeader({ alg: "RS256", typ: "JWT" }).setIssuer(
      clientEmail,
    ).setSubject(clientEmail)
    .setAudience(
      serviceAccount.token_uri || "https://oauth2.googleapis.com/token",
    ).setIssuedAt(now).setExpirationTime(now + 3600).sign(key);
  const response = await fetch(
    serviceAccount.token_uri || "https://oauth2.googleapis.com/token",
    {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
        assertion,
      }),
    },
  );
  const payload = await response.json();
  if (!response.ok || !payload.access_token) fail("SERVICE_TOKEN_FAILED");
  return {
    token: payload.access_token as string,
    projectId: (serviceAccount as { project_id?: string }).project_id ||
      "bible114-platform",
  };
};

const getDocumentSnapshot = async (
  token: string,
  projectId: string,
  path: string,
  allowMissing = false,
): Promise<FirestoreDocumentSnapshot | null> => {
  const encodedPath = path.split("/").map(encodeURIComponent).join("/");
  const response = await fetch(
    `https://firestore.googleapis.com/v1/projects/${
      encodeURIComponent(projectId)
    }/databases/(default)/documents/${encodedPath}`,
    { headers: { Authorization: `Bearer ${token}` } },
  );
  if (allowMissing && response.status === 404) return null;
  if (!response.ok) fail("FIRESTORE_READ_FAILED");
  const document = (await response.json()) as {
    fields?: FirestoreFields;
    updateTime?: string;
  };
  const updateTime = document.updateTime ||
    fail("FIRESTORE_UPDATE_TIME_MISSING");
  return {
    fields: document.fields || {},
    updateTime,
  };
};
const getDocument = async (
  token: string,
  projectId: string,
  path: string,
  allowMissing = false,
) =>
  (await getDocumentSnapshot(token, projectId, path, allowMissing))?.fields ||
  null;
const str = (fields: FirestoreFields | null, name: string) =>
  fields?.[name]?.stringValue ?? null;
const hasNullPasswordMarker = (fields: FirestoreFields) =>
  Object.prototype.hasOwnProperty.call(fields, "password") &&
  fields.password?.nullValue === null;

const getIdentityToolkitUser = async (
  token: string,
  projectId: string,
  uid: string,
): Promise<IdentityToolkitUser> => {
  const response = await fetch(
    `https://identitytoolkit.googleapis.com/v1/projects/${
      encodeURIComponent(projectId)
    }/accounts:lookup`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ localId: [uid] }),
    },
  );
  if (!response.ok) fail("AUTH_TARGET_LOOKUP_FAILED");
  const payload = (await response.json()) as {
    users?: IdentityToolkitUser[];
  };
  const user = payload.users?.find((candidate) => candidate.localId === uid);
  if (user) return user;
  return fail("AUTH_TARGET_NOT_FOUND");
};

const hasPasswordProvider = (user: IdentityToolkitUser) => {
  if (
    user.providerUserInfo?.some((provider) =>
      provider.providerId === "password"
    )
  ) return true;
  if (typeof user.passwordHash === "string" && user.passwordHash.length > 0) {
    return true;
  }
  const passwordUpdatedAt = Number(user.passwordUpdatedAt);
  return Number.isFinite(passwordUpdatedAt) && passwordUpdatedAt > 0;
};

const identityPasswordFingerprint = (user: IdentityToolkitUser) =>
  JSON.stringify({
    localId: user.localId || null,
    email: user.email || null,
    passwordUpdatedAt: user.passwordUpdatedAt || null,
    passwordHash: user.passwordHash || null,
    providers: (user.providerUserInfo || [])
      .map((provider) => provider.providerId || "")
      .sort(),
  });

const lookupCallerUid = async (idToken: string) => {
  const response = await fetch(
    `https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${FIREBASE_API_KEY}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ idToken }),
    },
  );
  const payload = await response.json();
  const uid = payload?.users?.[0]?.localId;
  return response.ok && typeof uid === "string" && uid ? uid : null;
};

const loadAdminPasswordContext = async (
  token: string,
  projectId: string,
  callerUid: string,
  targetUid: string,
) => {
  const [callerDocument, targetDocument, targetAuth] = await Promise.all([
    getDocumentSnapshot(token, projectId, `users/${callerUid}`),
    getDocumentSnapshot(token, projectId, `users/${targetUid}`),
    getIdentityToolkitUser(token, projectId, targetUid),
  ]);
  const verifiedCallerDocument = callerDocument ||
    fail("FIRESTORE_READ_FAILED");
  const verifiedTargetDocument = targetDocument ||
    fail("FIRESTORE_READ_FAILED");
  const caller = verifiedCallerDocument.fields;
  const target = verifiedTargetDocument.fields;
  return {
    callerDocument: verifiedCallerDocument,
    targetDocument: verifiedTargetDocument,
    targetAuth,
    callerUser: {
      role: str(caller, "role"),
      churchId: str(caller, "churchId"),
      primaryOrgId: str(caller, "primaryOrgId"),
      isDeleted: caller?.isDeleted?.booleanValue === true,
      email: str(caller, "email"),
    },
    targetUser: {
      role: str(target, "role"),
      churchId: str(target, "churchId"),
      primaryOrgId: str(target, "primaryOrgId"),
      isDeleted: target?.isDeleted?.booleanValue === true,
      hasPasswordProvider: hasPasswordProvider(targetAuth),
      email: str(target, "email"),
    },
  };
};

const verifyIdentityPassword = async (
  uid: string,
  email: string,
  password: string,
) => {
  if (!email) return false;
  const response = await fetch(
    `https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${FIREBASE_API_KEY}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email,
        password,
        returnSecureToken: true,
      }),
    },
  );
  if (!response.ok) return false;
  const payload = (await response.json()) as { localId?: string };
  return payload.localId === uid;
};

const passwordLockUrl = (
  projectId: string,
  uid: string,
) =>
  `https://firestore.googleapis.com/v1/projects/${
    encodeURIComponent(projectId)
  }/databases/(default)/documents/platformInternal/passwordChangeLocks/targets/${
    encodeURIComponent(uid)
  }`;

const readPasswordLock = async (
  token: string,
  projectId: string,
  uid: string,
) => {
  const response = await fetch(passwordLockUrl(projectId, uid), {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (response.status === 404) return null;
  if (!response.ok) fail("PASSWORD_LOCK_READ_FAILED");
  return (await response.json()) as {
    updateTime?: string;
    fields?: { expiresAt?: { timestampValue?: string } };
  };
};

const writePasswordLock = async (
  token: string,
  projectId: string,
  uid: string,
  owner: string,
  precondition: { exists: false } | { updateTime: string },
) => {
  const url = new URL(passwordLockUrl(projectId, uid));
  if ("exists" in precondition) {
    url.searchParams.set("currentDocument.exists", "false");
  } else {
    url.searchParams.set("currentDocument.updateTime", precondition.updateTime);
  }
  const now = new Date();
  const response = await fetch(url, {
    method: "PATCH",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      fields: {
        owner: { stringValue: owner },
        expiresAt: {
          timestampValue: new Date(
            now.getTime() + PASSWORD_CHANGE_LOCK_MS,
          ).toISOString(),
        },
        updatedAt: { timestampValue: now.toISOString() },
      },
    }),
  });
  if (response.status === 409 || response.status === 412) return null;
  if (!response.ok) fail("PASSWORD_LOCK_WRITE_FAILED");
  const payload = (await response.json()) as { updateTime?: string };
  if (!payload.updateTime) fail("PASSWORD_LOCK_UPDATE_TIME_MISSING");
  return { updateTime: payload.updateTime } as PasswordChangeLock;
};

const acquirePasswordLock = async (
  token: string,
  projectId: string,
  uid: string,
) => {
  const owner = crypto.randomUUID();
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const current = await readPasswordLock(token, projectId, uid);
    if (!current) {
      const created = await writePasswordLock(
        token,
        projectId,
        uid,
        owner,
        { exists: false },
      );
      if (created) return created;
      continue;
    }
    const expiresAt = Date.parse(
      current.fields?.expiresAt?.timestampValue || "",
    );
    if (Number.isFinite(expiresAt) && expiresAt > Date.now()) {
      throw new AdminPasswordOperationError("PASSWORD_CHANGE_BUSY");
    }
    const currentUpdateTime = current.updateTime ||
      fail("PASSWORD_LOCK_UPDATE_TIME_MISSING");
    const reclaimed = await writePasswordLock(
      token,
      projectId,
      uid,
      owner,
      { updateTime: currentUpdateTime },
    );
    if (reclaimed) return reclaimed;
  }
  throw new AdminPasswordOperationError("PASSWORD_CHANGE_BUSY");
};

const releasePasswordLock = async (
  token: string,
  projectId: string,
  uid: string,
  lock: PasswordChangeLock,
) => {
  const url = new URL(passwordLockUrl(projectId, uid));
  url.searchParams.set("currentDocument.updateTime", lock.updateTime);
  const response = await fetch(url, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${token}` },
  });
  if (
    !response.ok && response.status !== 404 && response.status !== 409 &&
    response.status !== 412
  ) fail("PASSWORD_LOCK_RELEASE_FAILED");
};

const updateIdentityPassword = async (
  token: string,
  projectId: string,
  uid: string,
  password: string,
) => {
  const response = await fetch(
    `https://identitytoolkit.googleapis.com/v1/projects/${
      encodeURIComponent(projectId)
    }/accounts:update`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ localId: uid, password }),
    },
  );
  if (!response.ok) fail("AUTH_PASSWORD_UPDATE_FAILED");
};

const updatePrivatePassword = async (
  token: string,
  projectId: string,
  uid: string,
  password: string,
) => {
  const url = `https://firestore.googleapis.com/v1/projects/${
    encodeURIComponent(projectId)
  }/databases/(default)/documents/users/${
    encodeURIComponent(uid)
  }/private/auth?updateMask.fieldPaths=password`;
  const response = await fetch(url, {
    method: "PATCH",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ fields: { password: { stringValue: password } } }),
  });
  if (!response.ok) fail("FIRESTORE_WRITE_FAILED");
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
    const bearer = request.headers.get("authorization")?.match(/^Bearer (.+)$/i)
      ?.[1];
    const declaredLength = Number(request.headers.get("content-length") || 0);
    if (Number.isFinite(declaredLength) && declaredLength > MAX_REQUEST_BYTES) {
      return json(origin, 413, { error: "요청 정보가 너무 큽니다." });
    }
    const rawBody = await request.text();
    if (new TextEncoder().encode(rawBody).byteLength > MAX_REQUEST_BYTES) {
      return json(origin, 413, { error: "요청 정보가 너무 큽니다." });
    }
    let parsedBody: unknown;
    try {
      parsedBody = JSON.parse(rawBody);
    } catch {
      return json(origin, 400, { error: "요청 정보가 올바르지 않습니다." });
    }
    let targetUid: string;
    let newPassword: string;
    try {
      ({ targetUid, newPassword } = parseAdminPasswordRequest(parsedBody));
    } catch {
      return json(origin, 400, { error: "요청 정보가 올바르지 않습니다." });
    }
    if (!bearer) {
      return json(origin, 401, { error: "인증을 확인할 수 없습니다." });
    }
    const callerUid = await lookupCallerUid(bearer);
    if (!callerUid) {
      return json(origin, 401, { error: "인증을 확인할 수 없습니다." });
    }
    const { token, projectId } = await serviceAccessToken();
    const initialContext = await loadAdminPasswordContext(
      token,
      projectId,
      callerUid,
      targetUid,
    );
    if (
      !canAdminChangePassword(
        initialContext.callerUser,
        initialContext.targetUser,
      )
    ) {
      return json(origin, 403, { error: "비밀번호 변경 권한이 없습니다." });
    }
    const passwordLock = await acquirePasswordLock(token, projectId, targetUid);
    try {
      // 잠금을 기다리는 동안 관리자 권한·대상 소속·Auth provider가 바뀔 수 있으므로
      // 잠금 안에서 원장을 다시 읽고, mutation 직전에도 같은 버전인지 확인한다.
      const lockedContext = await loadAdminPasswordContext(
        token,
        projectId,
        callerUid,
        targetUid,
      );
      if (
        !canAdminChangePassword(
          lockedContext.callerUser,
          lockedContext.targetUser,
        )
      ) {
        throw new AdminPasswordOperationError("AUTHORIZATION_CHANGED");
      }
      if (!hasNullPasswordMarker(lockedContext.targetDocument.fields)) {
        throw new AdminPasswordOperationError(
          "CREDENTIAL_MIGRATION_REQUIRED",
        );
      }
      const privateAuth = await getDocument(
        token,
        projectId,
        `users/${targetUid}/private/auth`,
        true,
      );
      const previousPassword = str(privateAuth, "password");
      await updateAdminPasswordWithCompensation(
        previousPassword,
        newPassword,
        {
          verifyPreviousPassword: (password) =>
            verifyIdentityPassword(
              targetUid,
              lockedContext.targetAuth.email || "",
              password,
            ),
          verifyCurrentPassword: (password) =>
            verifyIdentityPassword(
              targetUid,
              lockedContext.targetAuth.email || "",
              password,
            ),
          revalidateAuthorization: async () => {
            const [latestCallerUid, latestContext] = await Promise.all([
              lookupCallerUid(bearer),
              loadAdminPasswordContext(
                token,
                projectId,
                callerUid,
                targetUid,
              ),
            ]);
            return latestCallerUid === callerUid &&
              latestContext.callerDocument.updateTime ===
                lockedContext.callerDocument.updateTime &&
              latestContext.targetDocument.updateTime ===
                lockedContext.targetDocument.updateTime &&
              identityPasswordFingerprint(latestContext.targetAuth) ===
                identityPasswordFingerprint(lockedContext.targetAuth) &&
              hasNullPasswordMarker(latestContext.targetDocument.fields) &&
              canAdminChangePassword(
                latestContext.callerUser,
                latestContext.targetUser,
              );
          },
          updateAuthPassword: (password) =>
            updateIdentityPassword(token, projectId, targetUid, password),
          updatePrivatePassword: (password) =>
            updatePrivatePassword(token, projectId, targetUid, password),
        },
      );
    } finally {
      try {
        await releasePasswordLock(
          token,
          projectId,
          targetUid,
          passwordLock,
        );
      } catch {
        // 유실된 잠금은 10분 후 만료되어 자동 회수된다. UID는 로그에 남기지 않는다.
        console.error("admin-set-password lock release failed");
      }
    }
    return json(origin, 200, { ok: true });
  } catch (error) {
    if (error instanceof AdminPasswordOperationError) {
      if (error.code === "PASSWORD_CHANGE_BUSY") {
        return json(origin, 409, {
          error:
            "같은 회원의 비밀번호 변경이 이미 진행 중입니다. 잠시 후 다시 시도해주세요.",
          code: error.code,
        });
      }
      if (error.code === "ROLLBACK_UNAVAILABLE") {
        console.error("admin-set-password ROLLBACK_UNAVAILABLE");
        return json(origin, 409, {
          error:
            "기존 비밀번호 기록을 확인할 수 없어 안전하게 변경하지 않았습니다.",
          code: error.code,
        });
      }
      if (error.code === "CREDENTIAL_MIGRATION_REQUIRED") {
        return json(origin, 409, {
          error:
            "이 회원의 자격증명 보호 이관을 먼저 완료한 뒤 다시 시도해주세요.",
          code: error.code,
        });
      }
      if (error.code === "AUTHORIZATION_CHANGED") {
        return json(origin, 409, {
          error:
            "작업 중 관리자 권한 또는 회원 상태가 변경되어 비밀번호를 바꾸지 않았습니다.",
          code: error.code,
        });
      }
      if (error.code === "PASSWORD_UPDATE_ROLLED_BACK") {
        console.error(
          "admin-set-password PASSWORD_UPDATE_ROLLED_BACK",
        );
        return json(origin, 503, {
          error:
            "비밀번호 변경을 완료하지 못해 기존 비밀번호로 되돌렸습니다. 잠시 후 다시 시도해주세요.",
          code: error.code,
        });
      }
      console.error("admin-set-password PARTIAL_UPDATE");
      return json(origin, 500, {
        error:
          "비밀번호 변경이 일부만 반영되었습니다. 즉시 플랫폼 관리자에게 문의해주세요.",
        code: "PARTIAL_UPDATE",
      });
    }
    console.error(
      "admin-set-password failed",
      error instanceof Error ? error.message : error,
    );
    return json(origin, 500, {
      error: "비밀번호 변경 중 오류가 발생했습니다.",
    });
  }
});
