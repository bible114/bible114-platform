import { PlatformError } from "../_shared/errors.ts";
import {
  decodeFirestoreFields,
  type FirestoreDocument,
  type FirestoreValue,
  type FirestoreWrite,
} from "../_shared/firestore.ts";
import {
  type CompleteChurchAdminSignupIdentity,
  type CompleteChurchAdminSignupInput,
  exactDeepEqual,
} from "./completeChurchAdminSignupCore.ts";
import {
  completeChurchAdminSignup,
  type CompleteChurchAdminSignupDependencies,
} from "./completeChurchAdminSignupService.ts";

const PROJECT = "test-project";
const SERVICE = { token: "service-token", projectId: PROJECT };
const UID = "admin-1";
const REQUEST_ID = "123e4567-e89b-42d3-a456-426614174000";
const OTHER_REQUEST_ID = "123e4567-e89b-42d3-a456-426614174001";
const CHURCH_ID = "church_123e4567e89b42d3a456426614174000";
const OTHER_CHURCH_ID = "church_123e4567e89b42d3a456426614174001";
const NOW = new Date("2026-07-16T03:04:05.000Z");
const HASH = "a".repeat(64);
const PREFIX = `projects/${PROJECT}/databases/(default)/documents/`;
const userPath = `users/${UID}`;
const churchPath = `churches/${CHURCH_ID}`;
const consentPath = `${userPath}/private/consent`;
const adminPath = `${churchPath}/private/admin`;
const accessPath = `${churchPath}/private/access`;
const legacyPath = "settings/churchDirectory";
const publicPath = `publicChurches/${CHURCH_ID}`;
const metaPath = "publicDirectoryMeta/current";
const lockPath = "platformInternal/publicDirectoryRebuild";
const statsPath = "settings/platformStats";
const ledgerPath = `churchLifecycleActions/${REQUEST_ID}`;
type Data = Record<string, unknown>;

const assert = (condition: unknown, message = "assertion failed") => {
  if (!condition) throw new Error(message);
};

const assertEquals = (actual: unknown, expected: unknown, message = "") => {
  if (!exactDeepEqual(actual, expected)) {
    throw new Error(
      `${message ? `${message}: ` : ""}expected ${
        JSON.stringify(expected)
      }, got ${JSON.stringify(actual)}`,
    );
  }
};

const assertPlatformError = async (
  code: string,
  fn: () => Promise<unknown>,
  retryable?: boolean,
) => {
  try {
    await fn();
  } catch (error) {
    if (!(error instanceof PlatformError)) throw error;
    assertEquals(error.code, code);
    if (retryable !== undefined) assertEquals(error.retryable, retryable);
    return error;
  }
  throw new Error(`expected ${code}`);
};

const clone = <T>(value: T): T => structuredClone(value);

const consent = (
  provider: "password" | "google.com" | "kakao.com" = "password",
) => ({
  schemaVersion: 1,
  policyVersions: {
    terms: "2026-07-16",
    privacy: "2026-07-16",
    sensitive: "2026-07-16",
    community: "2026-07-16",
    childGuardian: "2026-07-16",
  },
  agreedAt: "2026-07-16T03:00:00.000Z",
  source: provider === "password"
    ? "email_community_admin_signup"
    : provider === "google.com"
    ? "google_community_admin_signup"
    : "kakao_community_admin_signup",
  locale: "ko-KR",
  audience: "communityAdmin",
  ageAssessment: {
    birthdate: null,
    asOfDate: "2026-07-16",
    age: null,
    under14: false,
    confirmed14Plus: true,
  },
  agreements: {
    terms: { agreed: true },
    privacy: { agreed: true },
    sensitive: { agreed: true },
    community: { agreed: true },
    childGuardian: {
      required: false,
      agreed: false,
      method: null,
      identityVerifiedByPlatform: false,
      legalAuthorityVerifiedByPlatform: false,
    },
  },
});

const identity = (
  provider: "password" | "google.com" | "kakao.com" = "password",
  overrides: Record<string, unknown> = {},
): CompleteChurchAdminSignupIdentity => ({
  uid: provider === "kakao.com" ? "kakao:12345" : UID,
  tokenEmail: provider === "kakao.com" ? null : "admin@example.com",
  signInProvider: provider === "kakao.com" ? "custom" : provider,
  kakaoProviderAttestation: provider === "kakao.com" ? "kakao.com" : null,
  kakaoId: provider === "kakao.com" ? "12345" : null,
  ...overrides,
});

const input = (
  provider: "password" | "google.com" | "kakao.com" = "password",
  overrides: Record<string, unknown> = {},
): CompleteChurchAdminSignupInput => ({
  requestId: REQUEST_ID,
  name: "관리자",
  churchName: "테스트교회",
  pastorName: "홍길동 목사",
  denomination: "예장합동",
  entryCode: "safe-code",
  departments: [{
    id: "adult",
    name: "장년부",
    subgroups: [{ id: "cell-1", name: "1구역" }],
  }],
  password: provider === "password" ? "secret-password" : null,
  contactEmail: "contact@example.com",
  consent: consent(provider),
  ...overrides,
});

const baseState = (
  overrides: Record<string, Data | null> = {},
): Record<string, Data> => {
  const state: Record<string, Data> = {
    [legacyPath]: {
      churches: [{
        id: "existing-church",
        name: "기존교회",
        codeHash: "legacy-secret",
      }],
      updatedAt: "2026-07-15T00:00:00.000Z",
    },
    [metaPath]: {
      ready: true,
      mode: "legacy",
      schemaVersion: 1,
      count: 1,
      updatedAt: "2026-07-15T00:00:00.000Z",
    },
  };
  for (const [path, value] of Object.entries(overrides)) {
    if (value === null) delete state[path];
    else state[path] = value;
  }
  return state;
};

type UpdateWrite = {
  update: { name: string; fields: Record<string, FirestoreValue> };
  updateMask?: { fieldPaths: string[] };
  currentDocument?: { exists?: boolean; updateTime?: string };
};

const createHarness = (initial: Record<string, Data> = baseState()) => {
  const state = new Map(
    Object.entries(initial).map(([path, data]) => [path, clone(data)]),
  );
  const reads: Array<{ path: string; transaction?: string }> = [];
  const commits: Array<{
    paths: string[];
    masks: Array<string[] | null>;
    currentDocuments: Array<UpdateWrite["currentDocument"] | null>;
    transaction?: string;
  }> = [];
  let transactions = 0;
  let rollbacks = 0;
  let conflictsBeforeApply = 0;
  let applyThenConflict = false;
  let conflictMutation: ((state: Map<string, Data>) => void) | null = null;

  const asDocument = <T>(path: string, data: Data): FirestoreDocument<T> => ({
    name: `${PREFIX}${path}`,
    fields: {},
    data: clone(data) as T,
  });

  const dependencies: Partial<CompleteChurchAdminSignupDependencies> = {
    beginTransaction: () => Promise.resolve(`tx-${++transactions}`),
    getDocument: <T>(
      _token: string,
      _project: string,
      path: string,
      options: { transaction?: string } = {},
    ): Promise<FirestoreDocument<T> | null> => {
      reads.push({ path, transaction: options.transaction });
      const data = state.get(path);
      return Promise.resolve(data ? asDocument<T>(path, data) : null);
    },
    rollbackTransaction: () => {
      rollbacks += 1;
      return Promise.resolve();
    },
    commitWrites: (
      _token: string,
      _project: string,
      writes: FirestoreWrite[],
      options: { transaction?: string } = {},
    ) => {
      if (conflictsBeforeApply > 0) {
        conflictsBeforeApply -= 1;
        conflictMutation?.(state);
        conflictMutation = null;
        throw new PlatformError("FIRESTORE_WRITE_FAILED", {
          details: { status: 409 },
        });
      }
      const next = new Map(
        [...state.entries()].map(([path, data]) => [path, clone(data)]),
      );
      const paths: string[] = [];
      const masks: Array<string[] | null> = [];
      const currentDocuments: Array<UpdateWrite["currentDocument"] | null> = [];
      for (const rawWrite of writes) {
        const write = rawWrite as UpdateWrite;
        const path = decodeURIComponent(write.update.name.slice(PREFIX.length));
        const exists = next.has(path);
        if (
          (write.currentDocument?.exists === true && !exists) ||
          (write.currentDocument?.exists === false && exists)
        ) {
          throw new PlatformError("FIRESTORE_WRITE_FAILED", {
            details: { status: 409 },
          });
        }
        const decoded = decodeFirestoreFields(write.update.fields);
        paths.push(path);
        masks.push(write.updateMask?.fieldPaths || null);
        currentDocuments.push(write.currentDocument || null);
        if (!write.updateMask) next.set(path, decoded);
        else {
          const merged = { ...(next.get(path) || {}) };
          for (const fieldPath of write.updateMask.fieldPaths) {
            merged[fieldPath] = decoded[fieldPath];
          }
          next.set(path, merged);
        }
      }
      commits.push({
        paths,
        masks,
        currentDocuments,
        transaction: options.transaction,
      });
      state.clear();
      next.forEach((data, path) => state.set(path, data));
      if (applyThenConflict) {
        applyThenConflict = false;
        throw new PlatformError("FIRESTORE_WRITE_FAILED", {
          details: { status: 409 },
        });
      }
      return Promise.resolve({});
    },
    hashEntryCode: () => Promise.resolve(HASH),
    now: () => new Date(NOW),
  };

  return {
    state,
    reads,
    commits,
    dependencies,
    get transactions() {
      return transactions;
    },
    get rollbacks() {
      return rollbacks;
    },
    conflictBeforeApply(
      count: number,
      mutation: ((state: Map<string, Data>) => void) | null = null,
    ) {
      conflictsBeforeApply = count;
      conflictMutation = mutation;
    },
    conflictAfterApply() {
      applyThenConflict = true;
    },
  };
};

Deno.test("공동체·관리자·private·두 디렉토리·원장을 한 transaction으로 생성한다", async () => {
  const harness = createHarness();
  const result = await completeChurchAdminSignup(
    SERVICE,
    identity(),
    input(),
    harness.dependencies,
  );
  assertEquals(result, { status: "created", churchId: CHURCH_ID });
  assertEquals(harness.commits.length, 1);
  assertEquals(harness.commits[0].paths, [
    churchPath,
    userPath,
    consentPath,
    adminPath,
    accessPath,
    legacyPath,
    publicPath,
    metaPath,
    ledgerPath,
    statsPath,
  ]);
  assertEquals(harness.state.get(statsPath)?.total_readers, 1);
  assertEquals(harness.state.get(statsPath)?.total_churches, 1);
  assertEquals(harness.state.get(userPath)?.password, "secret-password");
  assertEquals(harness.state.get(userPath)?.email, "admin@example.com");
  assertEquals(harness.state.get(userPath)?.authProvider, "password");
  assertEquals(harness.state.get(userPath)?.authProviders, ["password"]);
  assertEquals(harness.state.get(adminPath)?.adminEmail, "contact@example.com");
  assertEquals(harness.state.get(userPath)?.startDate, "Thu Jul 16 2026");
  assertEquals(harness.state.get(accessPath)?.codeHash, HASH);
  assertEquals(harness.state.get(publicPath), {
    id: CHURCH_ID,
    name: "테스트교회",
  });
  assertEquals(harness.state.get(metaPath)?.count, 2);
  assertEquals(harness.state.get(legacyPath)?.churches, [
    { id: "existing-church", name: "기존교회" },
    { id: CHURCH_ID, name: "테스트교회" },
  ]);
  const ledgerText = JSON.stringify(harness.state.get(ledgerPath));
  assert(!ledgerText.includes("safe-code"), "raw entry code leaked to ledger");
  assert(!ledgerText.includes("secret-password"), "password leaked to ledger");
});

Deno.test("Google 생성은 token email을 쓰고 password를 null로 고정한다", async () => {
  const harness = createHarness();
  const result = await completeChurchAdminSignup(
    SERVICE,
    identity("google.com"),
    input("google.com"),
    harness.dependencies,
  );
  assertEquals(result.status, "created");
  assertEquals(harness.state.get(userPath)?.password, null);
  assertEquals(
    (harness.state.get(ledgerPath)?.input as Data)?.signInProvider,
    "google.com",
  );
});

Deno.test("Kakao 생성은 attested kakao UID를 쓰고 수동 연락 이메일은 private admin에만 둔다", async () => {
  const harness = createHarness();
  const result = await completeChurchAdminSignup(
    SERVICE,
    identity("kakao.com"),
    input("kakao.com", { contactEmail: "kakao-contact@example.com" }),
    harness.dependencies,
  );
  const kakaoUserPath = "users/kakao:12345";
  const kakaoConsentPath = `${kakaoUserPath}/private/consent`;
  assertEquals(result, { status: "created", churchId: CHURCH_ID });
  assertEquals(harness.state.get(kakaoUserPath)?.email, null);
  assertEquals(harness.state.get(kakaoUserPath)?.authProvider, "kakao.com");
  assertEquals(harness.state.get(kakaoUserPath)?.authProviders, ["kakao.com"]);
  assertEquals(harness.state.get(kakaoUserPath)?.password, null);
  assertEquals(
    harness.state.get(adminPath)?.adminEmail,
    "kakao-contact@example.com",
  );
  assertEquals(
    harness.state.get(kakaoConsentPath)?.source,
    "kakao_community_admin_signup",
  );
  const ledgerInput = harness.state.get(ledgerPath)?.input as Data;
  assertEquals(ledgerInput.signInProvider, "kakao.com");
  assertEquals(ledgerInput.tokenEmail, null);
  assertEquals(ledgerInput.contactEmail, "kakao-contact@example.com");
  assert(
    JSON.stringify(harness.state.get(churchPath)).includes("kakao-contact") ===
      false,
    "contact email leaked to public church",
  );
});

Deno.test("legacy/meta가 없어도 secret-free legacy와 public 문서를 생성한다", async () => {
  const harness = createHarness(baseState({
    [legacyPath]: null,
    [metaPath]: null,
  }));
  await completeChurchAdminSignup(
    SERVICE,
    identity(),
    input(),
    harness.dependencies,
  );
  assertEquals(harness.state.get(legacyPath)?.churches, [
    { id: CHURCH_ID, name: "테스트교회" },
  ]);
  assertEquals(harness.state.has(metaPath), false);
  assertEquals(harness.commits[0].paths.length, 9);
  const legacyWriteIndex = harness.commits[0].paths.indexOf(legacyPath);
  assertEquals(
    harness.commits[0].currentDocuments[legacyWriteIndex],
    { exists: false },
  );
});

Deno.test("ready:false meta는 발행하지 않고 원래 상태를 보존한다", async () => {
  const harness = createHarness(baseState({
    [metaPath]: {
      ready: false,
      mode: "legacy",
      schemaVersion: 1,
      updatedAt: "2026-07-15T00:00:00.000Z",
    },
  }));
  await completeChurchAdminSignup(
    SERVICE,
    identity(),
    input(),
    harness.dependencies,
  );
  assert(!harness.commits[0].paths.includes(metaPath));
  assertEquals(harness.state.get(metaPath), {
    ready: false,
    mode: "legacy",
    schemaVersion: 1,
    updatedAt: "2026-07-15T00:00:00.000Z",
  });
});

Deno.test("같은 UUID exact replay는 새 write 없이 alreadyCompleted를 반환한다", async () => {
  const harness = createHarness();
  await completeChurchAdminSignup(
    SERVICE,
    identity(),
    input(),
    harness.dependencies,
  );
  const replay = await completeChurchAdminSignup(
    SERVICE,
    identity(),
    input(),
    harness.dependencies,
  );
  assertEquals(replay, { status: "alreadyCompleted", churchId: CHURCH_ID });
  assertEquals(harness.commits.length, 1);
  assert(harness.rollbacks >= 1);
});

Deno.test("운영 microsecond legacy/meta에서 생성하고 0/6/9자리 상태를 replay한다", async () => {
  const harness = createHarness(baseState({
    [legacyPath]: {
      churches: [{ id: "existing-church", name: "기존교회" }],
      updatedAt: "2026-07-15T00:00:00.123456Z",
    },
    [metaPath]: {
      ready: true,
      mode: "legacy",
      schemaVersion: 1,
      count: 1,
      updatedAt: "2026-07-15T00:00:00.654321Z",
    },
  }));
  const microsecondInput = input("password", {
    consent: {
      ...consent(),
      agreedAt: "2026-07-16T03:00:00.123456Z",
    },
  });
  const created = await completeChurchAdminSignup(
    SERVICE,
    identity(),
    microsecondInput,
    harness.dependencies,
  );
  assertEquals(created, { status: "created", churchId: CHURCH_ID });

  const replaceTimestamp = (
    path: string,
    field: string,
    timestamp: string,
  ) => {
    const current = harness.state.get(path);
    assert(current, `missing fixture document: ${path}`);
    harness.state.set(path, { ...current, [field]: timestamp });
  };
  replaceTimestamp(adminPath, "updatedAt", "2026-07-16T03:04:05Z");
  replaceTimestamp(
    accessPath,
    "updatedAt",
    "2026-07-16T03:04:05.123456Z",
  );
  replaceTimestamp(
    consentPath,
    "recordedAt",
    "2026-07-16T03:04:05.123456789Z",
  );
  replaceTimestamp(
    legacyPath,
    "updatedAt",
    "2026-07-16T03:04:05.234567Z",
  );
  replaceTimestamp(
    metaPath,
    "updatedAt",
    "2026-07-16T03:04:05.345678Z",
  );
  replaceTimestamp(
    ledgerPath,
    "createdAt",
    "2026-07-16T03:04:05.123456789Z",
  );

  const replay = await completeChurchAdminSignup(
    SERVICE,
    identity(),
    microsecondInput,
    harness.dependencies,
  );
  assertEquals(replay, { status: "alreadyCompleted", churchId: CHURCH_ID });
  assertEquals(harness.commits.length, 1);
});

Deno.test("응답 유실 뒤 새 UUID도 canonical 기존 churchAdmin으로 수렴한다", async () => {
  const harness = createHarness();
  await completeChurchAdminSignup(
    SERVICE,
    identity(),
    input(),
    harness.dependencies,
  );
  const recovered = await completeChurchAdminSignup(
    SERVICE,
    identity(),
    input("password", { requestId: OTHER_REQUEST_ID }),
    harness.dependencies,
  );
  assertEquals(recovered, {
    status: "alreadyCompleted",
    churchId: CHURCH_ID,
  });
  assertEquals(harness.commits.length, 1);
  assertEquals(
    harness.state.has(`churchLifecycleActions/${OTHER_REQUEST_ID}`),
    false,
  );
});

Deno.test("같은 uid의 서로 다른 UUID 동시 생성은 users transaction 경합 뒤 한 교회로 수렴한다", async () => {
  const winner = createHarness();
  await completeChurchAdminSignup(
    SERVICE,
    identity(),
    input("password", { requestId: OTHER_REQUEST_ID }),
    winner.dependencies,
  );
  const loser = createHarness();
  loser.conflictBeforeApply(1, (state) => {
    state.clear();
    winner.state.forEach((data, path) => state.set(path, clone(data)));
  });
  const result = await completeChurchAdminSignup(
    SERVICE,
    identity(),
    input(),
    loser.dependencies,
  );
  assertEquals(result, {
    status: "alreadyCompleted",
    churchId: OTHER_CHURCH_ID,
  });
  assertEquals(loser.transactions, 2);
  assertEquals(loser.commits.length, 0);
  assertEquals(loser.state.has(churchPath), false);
  assertEquals(loser.state.has(`churches/${OTHER_CHURCH_ID}`), true);
});

Deno.test("같은 UUID 다른 payload 또는 actor 충돌을 거부한다", async () => {
  const harness = createHarness();
  await completeChurchAdminSignup(
    SERVICE,
    identity(),
    input(),
    harness.dependencies,
  );
  await assertPlatformError(
    "CONFLICT",
    () =>
      completeChurchAdminSignup(
        SERVICE,
        identity(),
        input("password", { churchName: "다른교회" }),
        harness.dependencies,
      ),
  );
  await assertPlatformError(
    "CONFLICT",
    () =>
      completeChurchAdminSignup(
        SERVICE,
        identity(),
        input("password", { contactEmail: "different@example.com" }),
        harness.dependencies,
      ),
  );
  await assertPlatformError(
    "CONFLICT",
    () =>
      completeChurchAdminSignup(
        SERVICE,
        identity("password", {
          uid: "other-admin",
          tokenEmail: "other@example.com",
        }),
        input(),
        harness.dependencies,
      ),
  );
  assertEquals(harness.commits.length, 1);
});

Deno.test("public rebuild lock이 있으면 retryable conflict로 안전 실패한다", async () => {
  const harness = createHarness(baseState({
    [lockPath]: {
      runId: "other-run",
      ownerToken: "owner",
      leaseExpiresAt: "2099-01-01T00:00:00.000Z",
    },
  }));
  await assertPlatformError(
    "CONFLICT",
    () =>
      completeChurchAdminSignup(
        SERVICE,
        identity(),
        input(),
        harness.dependencies,
      ),
    true,
  );
  assertEquals(harness.commits.length, 0);
  assertEquals(harness.transactions, 1);
});

Deno.test("409는 최대 3회 재시도하고 세 번째에 성공한다", async () => {
  const harness = createHarness();
  harness.conflictBeforeApply(2);
  const result = await completeChurchAdminSignup(
    SERVICE,
    identity(),
    input(),
    harness.dependencies,
  );
  assertEquals(result.status, "created");
  assertEquals(harness.transactions, 3);
  assertEquals(harness.commits.length, 1);
});

Deno.test("409가 3회 계속되면 네 번째 transaction 없이 실패한다", async () => {
  const harness = createHarness();
  harness.conflictBeforeApply(3);
  await assertPlatformError(
    "FIRESTORE_WRITE_FAILED",
    () =>
      completeChurchAdminSignup(
        SERVICE,
        identity(),
        input(),
        harness.dependencies,
      ),
  );
  assertEquals(harness.transactions, 3);
  assertEquals(harness.commits.length, 0);
});

Deno.test("apply 뒤 409 응답 유실은 ledger와 canonical state로 수렴한다", async () => {
  const harness = createHarness();
  harness.conflictAfterApply();
  const result = await completeChurchAdminSignup(
    SERVICE,
    identity(),
    input(),
    harness.dependencies,
  );
  assertEquals(result, { status: "alreadyCompleted", churchId: CHURCH_ID });
  assertEquals(harness.transactions, 2);
  assertEquals(harness.commits.length, 1);
});

Deno.test("canonical public projection drift는 새 UUID 복구로 숨기지 않는다", async () => {
  const harness = createHarness();
  await completeChurchAdminSignup(
    SERVICE,
    identity(),
    input(),
    harness.dependencies,
  );
  harness.state.set(publicPath, { id: CHURCH_ID, name: "오염된 이름" });
  await assertPlatformError(
    "CONFLICT",
    () =>
      completeChurchAdminSignup(
        SERVICE,
        identity(),
        input("password", { requestId: OTHER_REQUEST_ID }),
        harness.dependencies,
      ),
  );
  assertEquals(harness.commits.length, 1);
});

Deno.test("ready meta count overflow와 손상 meta는 write 전에 거부한다", async () => {
  for (
    const meta of [
      {
        ready: true,
        mode: "legacy",
        schemaVersion: 1,
        count: Number.MAX_SAFE_INTEGER,
        updatedAt: "2026-07-15T00:00:00.000Z",
      },
      {
        ready: true,
        mode: "legacy",
        schemaVersion: 1,
        count: "1",
        updatedAt: "2026-07-15T00:00:00.000Z",
      },
    ]
  ) {
    const harness = createHarness(baseState({ [metaPath]: meta }));
    await assertPlatformError(
      "CONFLICT",
      () =>
        completeChurchAdminSignup(
          SERVICE,
          identity(),
          input(),
          harness.dependencies,
        ),
    );
    assertEquals(harness.commits.length, 0);
  }
});
