import { PlatformError } from "../_shared/errors.ts";
import {
  decodeFirestoreFields,
  type FirestoreDocument,
  type FirestoreValue,
  type FirestoreWrite,
} from "../_shared/firestore.ts";
import {
  ensureUnaffiliatedChurch,
  type EnsureUnaffiliatedChurchDependencies,
  type EnsureUnaffiliatedChurchInput,
} from "./ensureUnaffiliatedChurchService.ts";

const PROJECT = "test-project";
const SERVICE = { token: "service-token", projectId: PROJECT };
const UID = "platform-admin-1";
const REQUEST_ID = "123e4567-e89b-42d3-a456-426614174000";
const NOW = new Date("2026-07-16T03:04:05.000Z");
const CREATED_AT = "2026-07-01T01:02:03.000Z";
const PREFIX = `projects/${PROJECT}/databases/(default)/documents/`;
const churchId = "unaffiliated_v1";
const actorPath = `users/${UID}`;
const churchPath = `churches/${churchId}`;
const legacyPath = "settings/churchDirectory";
const publicPath = `publicChurches/${churchId}`;
const publicMetaPath = "publicDirectoryMeta/current";
const rebuildLockPath = "platformInternal/publicDirectoryRebuild";
const ledgerPath = `platformAdminActions/${REQUEST_ID}`;
type Data = Record<string, unknown>;

const assert = (condition: unknown, message = "assertion failed") => {
  if (!condition) throw new Error(message);
};
const assertEquals = (actual: unknown, expected: unknown, message = "") => {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(
      `${message ? `${message}: ` : ""}expected ${
        JSON.stringify(expected)
      }, got ${JSON.stringify(actual)}`,
    );
  }
};
const clone = <T>(value: T): T => structuredClone(value);

const actor = (overrides: Data = {}): Data => ({
  uid: UID,
  role: "platformAdmin",
  isDeleted: false,
  ...overrides,
});
const canonicalChurch = (overrides: Data = {}): Data => ({
  name: "성경 읽는 사람들",
  pastorName: "",
  denomination: "",
  isVirtual: true,
  departments: [{
    id: "personal",
    name: "개인 성도",
    color: "bg-emerald-500",
    subgroups: ["성경읽기 동행"],
  }],
  createdAt: CREATED_AT,
  updatedAt: NOW.toISOString(),
  ...overrides,
});
const input = (): EnsureUnaffiliatedChurchInput => ({ requestId: REQUEST_ID });
const ledger = (overrides: Data = {}): Data => ({
  schemaVersion: 1,
  action: "ensureUnaffiliatedChurch",
  requestId: REQUEST_ID,
  actorUid: UID,
  input: {},
  result: { status: "ensured", churchId },
  createdAt: NOW.toISOString(),
  ...overrides,
});
const baseState = (
  overrides: Record<string, Data | null> = {},
): Record<string, Data> => {
  const state: Record<string, Data> = {
    [actorPath]: actor(),
    [churchPath]: {
      name: "오염된 무소속",
      isVirtual: false,
      isDeleted: true,
      churchCode: "secret",
      churchCodeHash: "a".repeat(64),
      code: "legacy",
      adminUid: "legacy-admin",
      adminEmail: "legacy@example.invalid",
      createdAt: CREATED_AT,
    },
    [legacyPath]: {
      churches: [
        { id: churchId, name: "노출되면 안 됨", codeHash: "secret" },
        {
          id: "church-1",
          name: "정상 교회",
          hidden: true,
          codeHash: "other-secret-hash",
          churchCodeHash: "other-secret-hash-2",
          churchCode: "other-secret-code",
          code: "other-legacy-code",
          arbitrary: "remove-me",
        },
      ],
      updatedAt: "2026-07-15T00:00:00.000Z",
      rootSecret: "remove-root-secret",
    },
    [publicPath]: { id: churchId, name: "노출되면 안 됨" },
    [publicMetaPath]: {
      ready: true,
      mode: "public",
      schemaVersion: 1,
      count: 4,
      updatedAt: "2026-07-15T00:00:00.000Z",
    },
  };
  for (const [path, value] of Object.entries(overrides)) {
    if (value === null) delete state[path];
    else state[path] = value;
  }
  return state;
};

type UpdateWriteShape = {
  update: { name: string; fields: Record<string, FirestoreValue> };
  updateMask?: { fieldPaths: string[] };
  currentDocument?: { exists?: boolean };
};
type DeleteWriteShape = {
  delete: string;
  currentDocument?: { exists?: boolean };
};

const createHarness = (initial = baseState()) => {
  const state = new Map(
    Object.entries(initial).map(([path, data]) => [path, clone(data)]),
  );
  const commits: Array<{ paths: string[]; transaction?: string }> = [];
  const reads: Array<{ path: string; transaction?: string }> = [];
  let transactionCount = 0;
  let rollbackCount = 0;
  let conflicts = 0;
  let applyThenConflict = false;
  const asDocument = <T>(path: string, data: Data): FirestoreDocument<T> => ({
    name: `${PREFIX}${path}`,
    fields: {},
    data: clone(data) as T,
  });
  const commitWrites = async (
    _token: string,
    _project: string,
    writes: FirestoreWrite[],
    options: { transaction?: string } = {},
  ) => {
    if (conflicts > 0) {
      conflicts -= 1;
      throw new PlatformError("FIRESTORE_WRITE_FAILED", {
        details: { status: 409 },
      });
    }
    const paths: string[] = [];
    for (const raw of writes) {
      if ("delete" in raw) {
        const write = raw as DeleteWriteShape;
        const path = decodeURIComponent(write.delete.slice(PREFIX.length));
        if (write.currentDocument?.exists === true && !state.has(path)) {
          throw new PlatformError("FIRESTORE_WRITE_FAILED", {
            details: { status: 409 },
          });
        }
        paths.push(path);
        state.delete(path);
        continue;
      }
      const write = raw as UpdateWriteShape;
      const path = decodeURIComponent(write.update.name.slice(PREFIX.length));
      const exists = state.has(path);
      if (
        write.currentDocument?.exists === true && !exists ||
        write.currentDocument?.exists === false && exists
      ) {
        throw new PlatformError("FIRESTORE_WRITE_FAILED", {
          details: { status: 409 },
        });
      }
      paths.push(path);
      const decoded = decodeFirestoreFields(write.update.fields);
      if (!write.updateMask) {
        state.set(path, decoded);
      } else {
        const merged = { ...(state.get(path) || {}) };
        for (const field of write.updateMask.fieldPaths) {
          if (Object.prototype.hasOwnProperty.call(decoded, field)) {
            merged[field] = decoded[field];
          } else delete merged[field];
        }
        state.set(path, merged);
      }
    }
    commits.push({ paths, transaction: options.transaction });
    if (applyThenConflict) {
      applyThenConflict = false;
      throw new PlatformError("FIRESTORE_WRITE_FAILED", {
        details: { status: 409 },
      });
    }
    return {};
  };
  const dependencies: Partial<EnsureUnaffiliatedChurchDependencies> = {
    beginTransaction: () => Promise.resolve(`tx-${++transactionCount}`),
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
      rollbackCount += 1;
      return Promise.resolve();
    },
    commitWrites,
    now: () => new Date(NOW),
  };
  return {
    state,
    commits,
    reads,
    dependencies,
    get transactions() {
      return transactionCount;
    },
    get rollbacks() {
      return rollbackCount;
    },
    conflict(count: number) {
      conflicts = count;
    },
    conflictAfterApply() {
      applyThenConflict = true;
    },
  };
};

type Harness = ReturnType<typeof createHarness>;
const ensure = (
  harness: Harness,
  request: EnsureUnaffiliatedChurchInput = input(),
  identity = { uid: UID, anonymous: false },
) => ensureUnaffiliatedChurch(SERVICE, identity, request, harness.dependencies);
const expectError = async (
  callback: () => Promise<unknown>,
  code: string,
): Promise<PlatformError> => {
  try {
    await callback();
    throw new Error(`expected ${code}`);
  } catch (error) {
    if (!(error instanceof PlatformError) || error.code !== code) {
      throw new Error(
        `expected ${code}, got ${
          error instanceof PlatformError ? error.code : error
        }`,
      );
    }
    return error;
  }
};

Deno.test("ensure는 public 삭제와 ready meta fallback까지 같은 transaction에서 원자 처리한다", async () => {
  const harness = createHarness();
  assertEquals(await ensure(harness), {
    alreadyCompleted: false,
    committed: true,
    result: { status: "ensured", churchId },
  });
  assertEquals(harness.commits, [{
    paths: [churchPath, legacyPath, publicPath, publicMetaPath, ledgerPath],
    transaction: "tx-1",
  }]);
  assertEquals(harness.state.get(churchPath), canonicalChurch());
  assertEquals(harness.state.get(legacyPath), {
    churches: [{ id: "church-1", name: "정상 교회", hidden: true }],
    updatedAt: NOW.toISOString(),
  });
  assert(!harness.state.has(publicPath));
  assertEquals(harness.state.get(publicMetaPath), {
    ready: false,
    mode: "legacy",
    schemaVersion: 1,
    count: 4,
    updatedAt: NOW.toISOString(),
  });
  for (const path of [publicMetaPath, rebuildLockPath]) {
    assert(
      harness.reads.some((read) =>
        read.path === path && read.transaction === "tx-1"
      ),
      `${path} must be read in tx-1`,
    );
  }
  assertEquals(harness.state.get(ledgerPath), ledger());
  const churchJson = JSON.stringify(harness.state.get(churchPath));
  const directoryJson = JSON.stringify(harness.state.get(legacyPath));
  assert(!churchJson.includes("secret"));
  assert(!churchJson.includes("adminUid"));
  assert(!directoryJson.includes("secret"));
  assert(!directoryJson.includes("arbitrary"));
});

Deno.test("meta 누락 또는 이미 legacy fallback이면 stale public만 삭제한다", async () => {
  const missing = createHarness(baseState({ [publicMetaPath]: null }));
  await ensure(missing);
  assert(!missing.state.has(publicPath));
  assert(!missing.state.has(publicMetaPath));
  assert(!missing.commits[0].paths.includes(publicMetaPath));

  const fallbackMeta = {
    ready: false,
    mode: "legacy",
    schemaVersion: 1,
    count: 4,
    updatedAt: "2026-07-15T00:00:00.000Z",
  };
  const fallback = createHarness(baseState({
    [publicMetaPath]: fallbackMeta,
  }));
  await ensure(fallback);
  assert(!fallback.state.has(publicPath));
  assertEquals(fallback.state.get(publicMetaPath), fallbackMeta);
  assert(!fallback.commits[0].paths.includes(publicMetaPath));
});

Deno.test("public rebuild lock 경합은 같은 transaction에서 retryable conflict로 무쓰기 실패한다", async () => {
  const harness = createHarness(baseState({
    [rebuildLockPath]: {
      runId: "other-run",
      ownerToken: "other-owner",
      leaseExpiresAt: "2026-07-16T03:14:05.000Z",
    },
  }));
  const error = await expectError(() => ensure(harness), "CONFLICT");
  assert(error.retryable === true);
  assertEquals(harness.commits, []);
  assert(harness.rollbacks === 1);
  for (const path of [publicMetaPath, rebuildLockPath]) {
    assert(
      harness.reads.some((read) =>
        read.path === path && read.transaction === "tx-1"
      ),
      `${path} must be read in tx-1`,
    );
  }
});

Deno.test("손상된 public meta는 stale 문서를 지우지 않고 fail closed한다", async () => {
  const harness = createHarness(baseState({
    [publicMetaPath]: {
      ready: true,
      mode: "public",
      schemaVersion: 1,
    },
  }));
  await expectError(() => ensure(harness), "CONFLICT");
  assertEquals(harness.commits, []);
  assert(harness.state.has(publicPath));
});

Deno.test("missing church는 canonical create하고 invalid createdAt은 현재 시각으로 대체한다", async () => {
  const harness = createHarness(baseState({
    [churchPath]: null,
    [legacyPath]: { churches: [] },
    [publicPath]: null,
  }));
  await ensure(harness);
  assertEquals(
    harness.state.get(churchPath),
    canonicalChurch({
      createdAt: NOW.toISOString(),
    }),
  );
});

Deno.test("canonical no-op도 감사 ledger를 만들고 church/directory를 불필요하게 건드리지 않는다", async () => {
  const harness = createHarness(baseState({
    [churchPath]: canonicalChurch(),
    [legacyPath]: { churches: [{ id: "church-1", name: "정상 교회" }] },
    [publicPath]: null,
  }));
  assertEquals(await ensure(harness), {
    alreadyCompleted: false,
    committed: true,
    result: { status: "ensured", churchId },
  });
  assertEquals(harness.commits[0].paths, [ledgerPath]);
});

Deno.test("exact ledger는 canonical post-state에서만 replay한다", async () => {
  const canonical = baseState({
    [churchPath]: canonicalChurch(),
    [legacyPath]: { churches: [{ id: "church-1", name: "정상 교회" }] },
    [publicPath]: null,
    [ledgerPath]: ledger(),
  });
  const harness = createHarness(canonical);
  assertEquals(await ensure(harness), {
    alreadyCompleted: true,
    committed: false,
    result: { status: "ensured", churchId },
  });
  assertEquals(harness.commits, []);

  const drifted = createHarness({
    ...canonical,
    [publicPath]: { id: churchId, name: "stale" },
  });
  await expectError(() => ensure(drifted), "CONFLICT");
  const collision = createHarness({
    ...canonical,
    [ledgerPath]: ledger({ action: "other" }),
  });
  await expectError(() => ensure(collision), "CONFLICT");
});

Deno.test("platform/super 외 actor와 손상 directory는 무쓰기 거부한다", async () => {
  const denied = createHarness(baseState({
    [actorPath]: actor({ role: "churchAdmin" }),
  }));
  await expectError(() => ensure(denied), "FORBIDDEN");
  assertEquals(denied.commits, []);

  const superAdmin = createHarness(baseState({
    [actorPath]: actor({ role: "superAdmin" }),
  }));
  assertEquals((await ensure(superAdmin)).result.churchId, churchId);

  const malformed = createHarness(baseState({
    [legacyPath]: { churches: "bad" },
  }));
  await expectError(() => ensure(malformed), "CONFLICT");
});

Deno.test("legacy duplicate/invalid projection은 원본을 보존하고 0-write 실패한다", async () => {
  for (
    const churches of [
      [
        { id: "church-1", name: "정상 교회" },
        { id: "church-1", name: "중복 교회" },
      ],
      [{ id: " church-1", name: "잘못된 ID" }],
      [{ id: "church-1", name: " 잘못된 이름" }],
      [{ id: "church-1", name: "교회", hidden: "yes" }],
    ]
  ) {
    const initial = baseState({
      [legacyPath]: { churches, rootSecret: "must-survive-failed-write" },
    });
    const harness = createHarness(initial);
    await expectError(() => ensure(harness), "CONFLICT");
    assertEquals(harness.commits, []);
    assertEquals(harness.state.get(legacyPath), initial[legacyPath]);
  }
});

Deno.test("anonymous/non-exact input은 transaction 전에 거부한다", async () => {
  const harness = createHarness();
  await expectError(
    () => ensure(harness, input(), { uid: UID, anonymous: true }),
    "ANONYMOUS_NOT_ALLOWED",
  );
  await expectError(
    () =>
      ensure(
        harness,
        { ...input(), extra: true } as EnsureUnaffiliatedChurchInput,
      ),
    "BAD_REQUEST",
  );
  assert(harness.transactions === 0);
});

Deno.test("409는 최대 3회 재시도하고 apply-then-409는 ledger replay로 수렴한다", async () => {
  const retry = createHarness();
  retry.conflict(2);
  assertEquals((await ensure(retry)).result.churchId, churchId);
  assert(retry.transactions === 3);

  const exhausted = createHarness();
  exhausted.conflict(3);
  await expectError(() => ensure(exhausted), "FIRESTORE_WRITE_FAILED");
  assert(exhausted.transactions === 3);

  const applied = createHarness();
  applied.conflictAfterApply();
  const response = await ensure(applied);
  assert(response.alreadyCompleted);
  assert(applied.transactions === 2);
});
