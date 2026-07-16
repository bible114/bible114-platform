import { PlatformError } from "../_shared/errors.ts";
import {
  decodeFirestoreFields,
  type FirestoreDocument,
  type FirestoreValue,
  type FirestoreWrite,
  updateWrite,
} from "../_shared/firestore.ts";
import {
  type AdminChurchVisibilityDependencies,
  type AdminChurchVisibilityInput,
  adminSetChurchVisibility,
} from "./adminChurchVisibilityService.ts";

const PROJECT = "test-project";
const SERVICE = { token: "service-token", projectId: PROJECT };
const UID = "platform-admin-1";
const CHURCH_ID = "church-1";
const REQUEST_ID = "123e4567-e89b-42d3-a456-426614174000";
const NOW = new Date("2026-07-16T03:04:05.000Z");
const PREFIX = `projects/${PROJECT}/databases/(default)/documents/`;
const actorPath = `users/${UID}`;
const churchPath = `churches/${CHURCH_ID}`;
const legacyPath = "settings/churchDirectory";
const publicPath = `publicChurches/${CHURCH_ID}`;
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
  email: "private-admin@example.invalid",
  ...overrides,
});
const church = (hidden = false, overrides: Data = {}): Data => ({
  name: "테스트 교회",
  isDeleted: false,
  hiddenFromDirectory: hidden,
  departments: [{ id: "adult", name: "장년부" }],
  ...overrides,
});
const targetProjection = (hidden: boolean): Data => ({
  id: CHURCH_ID,
  name: "테스트 교회",
  ...(hidden ? { hidden: true } : {}),
});
const directory = (
  hidden = false,
  overrides: { target?: Data; other?: Data; updatedAt?: string } = {},
): Data => ({
  churches: [
    overrides.target || targetProjection(hidden),
    overrides.other || { id: "church-2", name: "두 번째 교회" },
  ],
  updatedAt: overrides.updatedAt || "2026-07-15T00:00:00.000Z",
});
const storedLedger = (overrides: Data = {}): Data => ({
  schemaVersion: 1,
  action: "adminSetChurchVisibility",
  requestId: REQUEST_ID,
  actorUid: UID,
  input: { churchId: CHURCH_ID, hidden: true },
  result: { status: "updated", hidden: true },
  createdAt: NOW.toISOString(),
  ...overrides,
});
const input = (
  overrides: Partial<AdminChurchVisibilityInput> = {},
): AdminChurchVisibilityInput => ({
  requestId: REQUEST_ID,
  churchId: CHURCH_ID,
  hidden: true,
  ...overrides,
});
const baseState = (
  overrides: Record<string, Data | null> = {},
): Record<string, Data> => {
  const initial: Record<string, Data> = {
    [actorPath]: actor(),
    [churchPath]: church(false),
    [legacyPath]: directory(false),
    [publicPath]: targetProjection(false),
  };
  for (const [path, value] of Object.entries(overrides)) {
    if (value === null) delete initial[path];
    else initial[path] = value;
  }
  return initial;
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
  const versions = new Map<string, string>();
  let versionCounter = 0;
  const nextVersion = () =>
    `2026-07-16T00:00:${String(++versionCounter).padStart(2, "0")}.000Z`;
  state.forEach((_data, path) => versions.set(path, nextVersion()));
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
    updateTime: versions.get(path),
    data: clone(data) as T,
  });
  const commit = (
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
    const nextState = new Map(
      [...state.entries()].map(([path, data]) => [path, clone(data)]),
    );
    const nextVersions = new Map(versions);
    const paths: string[] = [];
    const masks: Array<string[] | null> = [];
    const currentDocuments: Array<UpdateWrite["currentDocument"] | null> = [];
    for (const raw of writes) {
      const write = raw as UpdateWrite;
      const path = decodeURIComponent(write.update.name.slice(PREFIX.length));
      const exists = nextState.has(path);
      if (
        (write.currentDocument?.exists === true && !exists) ||
        (write.currentDocument?.exists === false && exists) ||
        (write.currentDocument?.updateTime !== undefined &&
          write.currentDocument.updateTime !== nextVersions.get(path))
      ) {
        throw new PlatformError("FIRESTORE_WRITE_FAILED", {
          details: { status: 409 },
        });
      }
      const decoded = decodeFirestoreFields(write.update.fields);
      paths.push(path);
      masks.push(write.updateMask?.fieldPaths || null);
      currentDocuments.push(write.currentDocument || null);
      if (!write.updateMask) nextState.set(path, decoded);
      else {
        const merged = { ...(nextState.get(path) || {}) };
        for (const fieldPath of write.updateMask.fieldPaths) {
          merged[fieldPath] = decoded[fieldPath];
        }
        nextState.set(path, merged);
      }
      nextVersions.set(path, nextVersion());
    }
    commits.push({
      paths,
      masks,
      currentDocuments,
      transaction: options.transaction,
    });
    state.clear();
    nextState.forEach((data, path) => state.set(path, data));
    versions.clear();
    nextVersions.forEach((version, path) => versions.set(path, version));
    if (applyThenConflict) {
      applyThenConflict = false;
      throw new PlatformError("FIRESTORE_WRITE_FAILED", {
        details: { status: 409 },
      });
    }
    return Promise.resolve({});
  };
  const dependencies = {
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
    commitWrites: commit,
    updateWrite: undefined,
    now: () => new Date(NOW),
  } as unknown as Partial<AdminChurchVisibilityDependencies>;
  delete (dependencies as Record<string, unknown>).updateWrite;
  return {
    state,
    versions,
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
    replace(path: string, data: Data) {
      state.set(path, clone(data));
      versions.set(path, nextVersion());
    },
    rawCommit(writes: FirestoreWrite[]) {
      return commit("service-token", PROJECT, writes);
    },
  };
};

type Harness = ReturnType<typeof createHarness>;
const setVisibility = (
  harness: Harness,
  request: AdminChurchVisibilityInput = input(),
) =>
  adminSetChurchVisibility(
    SERVICE,
    { uid: UID, anonymous: false },
    request,
    harness.dependencies,
  );
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

Deno.test("변경은 actor/church/legacy/public/ledger를 한 transaction에서 읽고 exact 4문서를 commit한다", async () => {
  const originalChurch = church(false, { unrelated: { keep: true } });
  const harness = createHarness(baseState({
    [churchPath]: originalChurch,
    [legacyPath]: directory(false, {
      target: {
        id: CHURCH_ID,
        name: "옛 이름",
        codeHash: "secret-must-be-removed",
      },
      other: {
        id: "church-2",
        name: "두 번째 교회",
        churchCode: "secret-must-be-removed",
      },
    }),
    [publicPath]: {
      id: CHURCH_ID,
      name: "옛 이름",
      codeHash: "secret-must-be-removed",
    },
  }));
  const result = await setVisibility(harness);
  assertEquals(result, { status: "updated", hidden: true });
  assertEquals(Object.keys(result).sort(), ["hidden", "status"]);
  assertEquals(harness.reads, [
    { path: actorPath, transaction: "tx-1" },
    { path: churchPath, transaction: "tx-1" },
    { path: legacyPath, transaction: "tx-1" },
    { path: publicPath, transaction: "tx-1" },
    { path: ledgerPath, transaction: "tx-1" },
  ]);
  assertEquals(harness.commits, [{
    paths: [churchPath, legacyPath, publicPath, ledgerPath],
    masks: [["hiddenFromDirectory", "updatedAt"], null, null, null],
    currentDocuments: [
      { exists: true },
      { exists: true },
      { exists: true },
      { exists: false },
    ],
    transaction: "tx-1",
  }]);
  assertEquals(harness.state.get(churchPath), {
    ...originalChurch,
    hiddenFromDirectory: true,
    updatedAt: NOW.toISOString(),
  });
  assertEquals(harness.state.get(legacyPath), {
    churches: [
      { id: CHURCH_ID, name: "테스트 교회", hidden: true },
      { id: "church-2", name: "두 번째 교회" },
    ],
    updatedAt: NOW.toISOString(),
  });
  assertEquals(harness.state.get(publicPath), {
    id: CHURCH_ID,
    name: "테스트 교회",
    hidden: true,
  });
  assertEquals(harness.state.get(ledgerPath), storedLedger());
  assert(!JSON.stringify(harness.state.get(legacyPath)).includes("secret"));
});

Deno.test("canonical no-op은 원장/commit 없이 alreadySet을 반환하고 UUID를 소비하지 않는다", async () => {
  const harness = createHarness(baseState({
    [churchPath]: church(true),
    [legacyPath]: directory(true),
    [publicPath]: targetProjection(true),
  }));
  assertEquals(await setVisibility(harness), {
    status: "alreadySet",
    hidden: true,
  });
  assertEquals(harness.commits, []);
  assert(!harness.state.has(ledgerPath));
  assert(harness.rollbacks === 1);

  // No-op policy: the UUID remains available if state later changes and the
  // same desired visibility becomes a real mutation.
  harness.replace(churchPath, church(false));
  harness.replace(legacyPath, directory(false));
  harness.replace(publicPath, targetProjection(false));
  assertEquals(await setVisibility(harness), {
    status: "updated",
    hidden: true,
  });
  assert(harness.state.has(ledgerPath));
});

Deno.test("publicChurches target 누락은 exists:false로 canonical 문서를 원자 생성한다", async () => {
  // Church + legacy are already exact: the missing public document alone must
  // force an updated result and consume the request ledger.
  const harness = createHarness(baseState({
    [churchPath]: church(true),
    [legacyPath]: directory(true),
    [publicPath]: null,
  }));
  assertEquals(await setVisibility(harness), {
    status: "updated",
    hidden: true,
  });
  assertEquals(harness.commits[0].paths, [
    churchPath,
    legacyPath,
    publicPath,
    ledgerPath,
  ]);
  assertEquals(harness.commits[0].currentDocuments, [
    { exists: true },
    { exists: true },
    { exists: false },
    { exists: false },
  ]);
  assertEquals(harness.state.get(publicPath), targetProjection(true));

  // If another writer creates the missing document first, retry from a fresh
  // snapshot and switch to exists:true rather than blindly creating over it.
  const raced = createHarness(baseState({
    [churchPath]: church(true),
    [legacyPath]: directory(true),
    [publicPath]: null,
  }));
  raced.conflictBeforeApply(1, (state) => {
    state.set(publicPath, { id: CHURCH_ID, name: "동시 생성된 옛 이름" });
  });
  assertEquals(await setVisibility(raced), {
    status: "updated",
    hidden: true,
  });
  assert(raced.transactions === 2);
  assertEquals(raced.commits[0].currentDocuments[2], { exists: true });
  assertEquals(raced.state.get(publicPath), targetProjection(true));
});

Deno.test("exact ledger와 canonical post-state만 replay하고 다른 입력/actor/형식 충돌은 거부한다", async () => {
  const canonical = baseState({
    [churchPath]: church(true),
    [legacyPath]: directory(true),
    [publicPath]: targetProjection(true),
    [ledgerPath]: storedLedger(),
  });
  const harness = createHarness(canonical);
  assertEquals(await setVisibility(harness), {
    status: "updated",
    hidden: true,
  });
  assertEquals(harness.commits, []);

  const collision = createHarness(canonical);
  await expectError(
    () => setVisibility(collision, input({ hidden: false })),
    "CONFLICT",
  );
  for (
    const ledger of [
      storedLedger({ extra: true }),
      storedLedger({ action: "other" }),
      storedLedger({ actorUid: "other" }),
      storedLedger({ input: { churchId: CHURCH_ID, hidden: false } }),
      storedLedger({ result: { status: "alreadySet", hidden: true } }),
      storedLedger({
        result: { status: "updated", hidden: true, name: "leak" },
      }),
      storedLedger({ createdAt: "2026-02-30T00:00:00Z" }),
    ]
  ) {
    const malformed = createHarness({ ...canonical, [ledgerPath]: ledger });
    await expectError(() => setVisibility(malformed), "CONFLICT");
  }

  const drifted = createHarness({
    ...canonical,
    [churchPath]: church(false),
  });
  await expectError(() => setVisibility(drifted), "CONFLICT");
});

Deno.test("409는 최대 3회 최신 snapshot을 재평가하고 apply-then-409는 ledger replay로 수렴한다", async () => {
  const retry = createHarness();
  retry.conflictBeforeApply(2);
  assertEquals(await setVisibility(retry), { status: "updated", hidden: true });
  assert(retry.transactions === 3);

  const exhausted = createHarness();
  exhausted.conflictBeforeApply(3);
  await expectError(() => setVisibility(exhausted), "FIRESTORE_WRITE_FAILED");
  assert(exhausted.transactions === 3);

  const applied = createHarness();
  applied.conflictAfterApply();
  assertEquals(await setVisibility(applied), {
    status: "updated",
    hidden: true,
  });
  assert(applied.transactions === 2);
  assert(applied.state.has(ledgerPath));
});

Deno.test("동시 다른 entry 변경은 409 retry에서 최신 배열을 보존하고 secret만 제거한다", async () => {
  const harness = createHarness();
  harness.conflictBeforeApply(1, (state) => {
    state.set(
      legacyPath,
      directory(false, {
        other: {
          id: "church-2",
          name: "동시 변경된 이름",
          hidden: true,
          codeHash: "drop-on-retry",
        },
      }),
    );
  });
  assertEquals(await setVisibility(harness), {
    status: "updated",
    hidden: true,
  });
  assertEquals(harness.state.get(legacyPath), {
    churches: [
      { id: CHURCH_ID, name: "테스트 교회", hidden: true },
      { id: "church-2", name: "동시 변경된 이름", hidden: true },
    ],
    updatedAt: NOW.toISOString(),
  });
  assert(harness.transactions === 2);
});

Deno.test("legacy 문서를 같은 transaction에서 갱신해 stale rebuild updateTime precondition을 무효화한다", async () => {
  const harness = createHarness();
  const staleUpdateTime = harness.versions.get(legacyPath)!;
  await setVisibility(harness);
  assert(harness.versions.get(legacyPath) !== staleUpdateTime);
  await expectError(
    () =>
      harness.rawCommit([
        updateWrite(PROJECT, legacyPath, {
          churches: [{ id: CHURCH_ID, name: "stale rebuild" }],
          updatedAt: NOW,
        }, { updateTime: staleUpdateTime }),
      ]),
    "FIRESTORE_WRITE_FAILED",
  );
  assertEquals(harness.state.get(legacyPath)?.churches, [
    { id: CHURCH_ID, name: "테스트 교회", hidden: true },
    { id: "church-2", name: "두 번째 교회" },
  ]);
});

Deno.test("anonymous/non-exact input은 transaction 전, 권한·교회·directory 손상은 무쓰기로 거부한다", async () => {
  const preflight = createHarness();
  await expectError(
    () =>
      adminSetChurchVisibility(
        SERVICE,
        { uid: UID, anonymous: true },
        input(),
        preflight.dependencies,
      ),
    "ANONYMOUS_NOT_ALLOWED",
  );
  await expectError(
    () =>
      setVisibility(
        preflight,
        { ...input(), extra: true } as AdminChurchVisibilityInput,
      ),
    "BAD_REQUEST",
  );
  await expectError(
    () => setVisibility(preflight, input({ churchId: "unaffiliated_v1" })),
    "BAD_REQUEST",
  );
  assert(preflight.transactions === 0);

  const invalidStates: Array<[Record<string, Data>, string]> = [
    [baseState({ [actorPath]: actor({ role: "churchAdmin" }) }), "FORBIDDEN"],
    [baseState({ [actorPath]: actor({ isDeleted: true }) }), "FORBIDDEN"],
    [baseState({ [churchPath]: null }), "NOT_FOUND"],
    [
      baseState({ [churchPath]: church(false, { isDeleted: true }) }),
      "NOT_FOUND",
    ],
    [baseState({ [churchPath]: church(false, { name: " bad" }) }), "CONFLICT"],
    [
      baseState({
        [legacyPath]: directory(false, {
          other: { id: CHURCH_ID, name: "중복" },
        }),
      }),
      "CONFLICT",
    ],
    [
      baseState({
        [legacyPath]: {
          churches: [{ id: CHURCH_ID, name: "테스트 교회", extra: true }],
          updatedAt: "2026-07-15T00:00:00.000Z",
        },
      }),
      "CONFLICT",
    ],
  ];
  for (const [state, code] of invalidStates) {
    const harness = createHarness(state);
    await expectError(() => setVisibility(harness), code);
    assertEquals(harness.commits, []);
  }
});
