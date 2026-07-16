import { PlatformError } from "../_shared/errors.ts";
import {
  decodeFirestoreFields,
  type FirestoreDocument,
  type FirestoreValue,
  type FirestoreWrite,
} from "../_shared/firestore.ts";
import {
  rotateChurchAccessCode,
  type RotateChurchAccessCodeDependencies,
  type RotateChurchAccessCodeInput,
} from "./rotateChurchAccessCodeService.ts";

const PROJECT = "test-project";
const SERVICE = { token: "service-token", projectId: PROJECT };
const UID = "church-admin-1";
const CHURCH_ID = "church-1";
const REQUEST_ID = "123e4567-e89b-42d3-a456-426614174000";
const NOW = new Date("2026-07-16T03:04:05.000Z");
const OLD_HASH = "b".repeat(64);
const NEW_HASH = "a".repeat(64);
const FINGERPRINT = "c".repeat(64);
const ENTRY_CODE = "새입장코드1234";
const PREFIX = `projects/${PROJECT}/databases/(default)/documents/`;
const actorPath = `users/${UID}`;
const churchPath = `churches/${CHURCH_ID}`;
const adminPath = `${churchPath}/private/admin`;
const accessPath = `${churchPath}/private/access`;
const ledgerPath = `${churchPath}/adminActions/${REQUEST_ID}`;
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
  role: "churchAdmin",
  churchId: CHURCH_ID,
  isDeleted: false,
  ...overrides,
});
const church = (overrides: Data = {}): Data => ({
  name: "테스트 교회",
  isDeleted: false,
  adminUid: UID,
  departments: [{ id: "adult", name: "장년부" }],
  ...overrides,
});
const admin = (overrides: Data = {}): Data => ({
  adminUid: UID,
  adminEmail: "admin@example.invalid",
  updatedAt: "2026-07-15T00:00:00.000Z",
  ...overrides,
});
const access = (overrides: Data = {}): Data => ({
  codeHash: OLD_HASH,
  version: 0,
  updatedAt: "2026-07-15T00:00:00.000Z",
  ...overrides,
});
const input = (
  overrides: Partial<RotateChurchAccessCodeInput> = {},
): RotateChurchAccessCodeInput => ({
  requestId: REQUEST_ID,
  churchId: CHURCH_ID,
  entryCode: ENTRY_CODE,
  expectedVersion: 0,
  ...overrides,
});
const ledger = (overrides: Data = {}): Data => ({
  schemaVersion: 1,
  action: "rotateChurchAccessCode",
  requestId: REQUEST_ID,
  actorUid: UID,
  input: {
    churchId: CHURCH_ID,
    expectedVersion: 0,
    fingerprint: FINGERPRINT,
  },
  result: { status: "rotated", churchId: CHURCH_ID, version: 1 },
  createdAt: NOW.toISOString(),
  ...overrides,
});
const baseState = (
  overrides: Record<string, Data | null> = {},
): Record<string, Data> => {
  const state: Record<string, Data> = {
    [actorPath]: actor(),
    [churchPath]: church({
      churchCode: "legacy-secret",
      churchCodeHash: OLD_HASH,
      code: "legacy-code",
    }),
    [adminPath]: admin(),
    [accessPath]: access(),
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
  currentDocument?: { exists?: boolean };
};

const createHarness = (initial = baseState()) => {
  const state = new Map(
    Object.entries(initial).map(([path, data]) => [path, clone(data)]),
  );
  const commits: Array<{ paths: string[]; transaction?: string }> = [];
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
      const write = raw as UpdateWrite;
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
      const decoded = decodeFirestoreFields(write.update.fields);
      paths.push(path);
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
  const dependencies: Partial<RotateChurchAccessCodeDependencies> = {
    beginTransaction: () => Promise.resolve(`tx-${++transactionCount}`),
    getDocument: <T>(
      _token: string,
      _project: string,
      path: string,
    ): Promise<FirestoreDocument<T> | null> => {
      const data = state.get(path);
      return Promise.resolve(data ? asDocument<T>(path, data) : null);
    },
    rollbackTransaction: () => {
      rollbackCount += 1;
      return Promise.resolve();
    },
    commitWrites,
    hashText: (value) =>
      Promise.resolve(value.startsWith("rotateChurchAccessCode:v1"))
        .then((isFingerprint) => isFingerprint ? FINGERPRINT : NEW_HASH),
    now: () => new Date(NOW),
  };
  return {
    state,
    commits,
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
const rotate = (
  harness: Harness,
  request: RotateChurchAccessCodeInput = input(),
  identity = { uid: UID, anonymous: false },
) => rotateChurchAccessCode(SERVICE, identity, request, harness.dependencies);
const expectError = async (callback: () => Promise<unknown>, code: string) => {
  try {
    await callback();
    throw new Error(`expected ${code}`);
  } catch (error) {
    assert(
      error instanceof PlatformError && error.code === code,
      `expected ${code}, got ${
        error instanceof PlatformError ? error.code : error
      }`,
    );
  }
};

Deno.test("rotation은 access/church/immutable ledger를 한 transaction에서 쓰고 secret을 원장에서 제외한다", async () => {
  const harness = createHarness();
  assertEquals(await rotate(harness), {
    alreadyCompleted: false,
    committed: true,
    result: { status: "rotated", churchId: CHURCH_ID, version: 1 },
  });
  assertEquals(harness.commits, [{
    paths: [accessPath, churchPath, ledgerPath],
    transaction: "tx-1",
  }]);
  assertEquals(harness.state.get(accessPath), {
    codeHash: NEW_HASH,
    version: 1,
    updatedAt: NOW.toISOString(),
  });
  assertEquals(harness.state.get(churchPath), {
    name: "테스트 교회",
    isDeleted: false,
    adminUid: UID,
    departments: [{ id: "adult", name: "장년부" }],
    updatedAt: NOW.toISOString(),
  });
  assertEquals(harness.state.get(ledgerPath), ledger());
  const serializedLedger = JSON.stringify(harness.state.get(ledgerPath));
  assert(!serializedLedger.includes(ENTRY_CODE));
  assert(!serializedLedger.includes(NEW_HASH));
  assert(serializedLedger.includes(FINGERPRINT));
});

Deno.test("private/access 누락은 expectedVersion 0에서 exists:false 생성으로 수렴한다", async () => {
  const harness = createHarness(baseState({ [accessPath]: null }));
  assertEquals((await rotate(harness)).result.version, 1);
  assertEquals(harness.state.get(accessPath)?.version, 1);
});

Deno.test("exact ledger와 exact post-state만 replay한다", async () => {
  const canonical = baseState({
    [churchPath]: church({ updatedAt: NOW.toISOString() }),
    [accessPath]: {
      codeHash: NEW_HASH,
      version: 1,
      updatedAt: NOW.toISOString(),
    },
    [ledgerPath]: ledger(),
  });
  const harness = createHarness(canonical);
  assertEquals(await rotate(harness), {
    alreadyCompleted: true,
    committed: false,
    result: { status: "rotated", churchId: CHURCH_ID, version: 1 },
  });
  assertEquals(harness.commits, []);

  const drifted = createHarness({
    ...canonical,
    [accessPath]: { ...canonical[accessPath], codeHash: OLD_HASH },
  });
  await expectError(() => rotate(drifted), "CONFLICT");
  const collision = createHarness({
    ...canonical,
    [ledgerPath]: ledger({ actorUid: "other" }),
  });
  await expectError(() => rotate(collision), "CONFLICT");
});

Deno.test("churchAdmin proof drift는 거부하고 platformAdmin은 우회한다", async () => {
  const rejected = createHarness(baseState({
    [adminPath]: admin({ adminUid: "other" }),
  }));
  await expectError(() => rotate(rejected), "FORBIDDEN");

  const platform = createHarness(baseState({
    [actorPath]: actor({ role: "platformAdmin", churchId: "other" }),
    [adminPath]: admin({ adminUid: "other", updatedAt: "bad" }),
  }));
  assertEquals((await rotate(platform)).result.version, 1);
});

Deno.test("stale expectedVersion과 손상 access는 무쓰기 conflict다", async () => {
  const stale = createHarness();
  await expectError(
    () => rotate(stale, input({ expectedVersion: 1 })),
    "CONFLICT",
  );
  assertEquals(stale.commits, []);
  const malformed = createHarness(baseState({
    [accessPath]: access({ version: "0" }),
  }));
  await expectError(() => rotate(malformed), "CONFLICT");
});

Deno.test("anonymous/non-exact input은 transaction 전에 거부한다", async () => {
  const harness = createHarness();
  await expectError(
    () => rotate(harness, input(), { uid: UID, anonymous: true }),
    "ANONYMOUS_NOT_ALLOWED",
  );
  await expectError(
    () =>
      rotate(
        harness,
        { ...input(), extra: true } as RotateChurchAccessCodeInput,
      ),
    "BAD_REQUEST",
  );
  await expectError(
    () => rotate(harness, input({ entryCode: "123" })),
    "BAD_REQUEST",
  );
  assert(harness.transactions === 0);
});

Deno.test("409는 최대 3회 재시도하고 apply-then-409는 ledger replay로 수렴한다", async () => {
  const retry = createHarness();
  retry.conflict(2);
  assertEquals((await rotate(retry)).result.version, 1);
  assert(retry.transactions === 3);

  const exhausted = createHarness();
  exhausted.conflict(3);
  await expectError(() => rotate(exhausted), "FIRESTORE_WRITE_FAILED");
  assert(exhausted.transactions === 3);

  const applied = createHarness();
  applied.conflictAfterApply();
  const response = await rotate(applied);
  assert(response.alreadyCompleted);
  assert(applied.transactions === 2);
});
