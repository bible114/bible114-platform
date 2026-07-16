import { PlatformError } from "../_shared/errors.ts";
import {
  decodeFirestoreFields,
  type FirestoreDocument,
  type FirestoreValue,
  type FirestoreWrite,
} from "../_shared/firestore.ts";
import {
  joinSoloCommunity,
  type JoinSoloCommunityDependencies,
  type JoinSoloCommunityInput,
} from "./joinSoloCommunityService.ts";

const PROJECT = "test-project";
const SERVICE = { token: "service-token", projectId: PROJECT };
const UID = "user-1";
const SOLO = "unaffiliated_v1";
const REQUEST_ID = "123e4567-e89b-42d3-a456-426614174000";
const NOW = new Date("2026-07-16T03:04:05.000Z");
const PREFIX = `projects/${PROJECT}/databases/(default)/documents/`;
const userPath = `users/${UID}`;
const targetPath = `churches/${SOLO}/roster/${UID}`;
const ledgerPath = `${userPath}/activityActions/${REQUEST_ID}`;
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

const baseUser = (overrides: Data = {}): Data => ({
  uid: UID,
  name: "민감한 이름",
  password: "plain-support-password",
  role: "member",
  accountType: "personal",
  churchId: null,
  primaryOrgId: null,
  isDeleted: false,
  score: 40,
  talent: 25,
  talentMigrated: true,
  talentWalletMigrated: false,
  currentDay: 30,
  streak: 7,
  readCount: 2,
  lastReadDate: "Wed Jul 15 2026",
  unrelated: { keep: true },
  ...overrides,
});

const baseRoster = (overrides: Data = {}): Data => ({
  uid: UID,
  name: "민감한 이름",
  score: 40,
  talent: 10,
  currentDay: 30,
  streak: 7,
  readCount: 2,
  lastReadDate: "Wed Jul 15 2026",
  departmentId: "adult",
  departmentName: "장년부",
  subgroupId: "cell-1",
  subgroupName: "1구역",
  extraMemberships: [],
  joinedAt: "2026-07-10T00:00:00.000Z",
  updatedAt: "2026-07-15T00:00:00.000Z",
  ...overrides,
});
const soloRoster = (overrides: Data = {}): Data =>
  baseRoster({
    departmentId: null,
    departmentName: null,
    subgroupId: null,
    subgroupName: null,
    ...overrides,
  });
const storedLedger = (overrides: Data = {}): Data => ({
  schemaVersion: 1,
  action: "joinSoloCommunity",
  requestId: REQUEST_ID,
  input: {},
  result: { status: "joined" },
  createdAt: NOW.toISOString(),
  ...overrides,
});
const input = (
  overrides: Partial<JoinSoloCommunityInput> = {},
): JoinSoloCommunityInput => ({ requestId: REQUEST_ID, ...overrides });

type UpdateWrite = {
  update: { name: string; fields: Record<string, FirestoreValue> };
  updateMask?: { fieldPaths: string[] };
  currentDocument?: { exists?: boolean };
};

const createHarness = (initial: Record<string, Data> = {}) => {
  const state = new Map(
    Object.entries(initial).map(([path, data]) => [path, clone(data)]),
  );
  const reads: Array<{ path: string; transaction?: string }> = [];
  const queries: Array<{ limit?: number; transaction?: string }> = [];
  const commits: Array<{
    paths: string[];
    masks: Array<string[] | null>;
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
    runCollectionGroupQuery: <T>(
      _token: string,
      _project: string,
      collectionId: string,
      field: string,
      value: unknown,
      options: { limit?: number; transaction?: string } = {},
    ): Promise<FirestoreDocument<T>[]> => {
      assert(collectionId === "roster" && field === "uid" && value === UID);
      queries.push({ limit: options.limit, transaction: options.transaction });
      return Promise.resolve(
        [...state.entries()].flatMap(([path, data]) =>
          /^churches\/[^/]+\/roster\/[^/]+$/.test(path) && data.uid === UID
            ? [asDocument<T>(path, data)]
            : []
        ).slice(0, options.limit),
      );
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
      for (const raw of writes) {
        const write = raw as UpdateWrite;
        const path = decodeURIComponent(write.update.name.slice(PREFIX.length));
        const exists = next.has(path);
        if (write.currentDocument?.exists === true && !exists) {
          throw new PlatformError("FIRESTORE_WRITE_FAILED", {
            details: { status: 409 },
          });
        }
        if (write.currentDocument?.exists === false && exists) {
          throw new PlatformError("FIRESTORE_WRITE_FAILED", {
            details: { status: 409 },
          });
        }
        const decoded = decodeFirestoreFields(write.update.fields);
        paths.push(path);
        masks.push(write.updateMask?.fieldPaths || null);
        if (!write.updateMask) next.set(path, decoded);
        else {
          const merged = { ...(next.get(path) || {}) };
          for (const fieldPath of write.updateMask.fieldPaths) {
            merged[fieldPath] = decoded[fieldPath];
          }
          next.set(path, merged);
        }
      }
      commits.push({ paths, masks, transaction: options.transaction });
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
    updateWrite: undefined,
    now: () => new Date(NOW),
  } as unknown as Partial<JoinSoloCommunityDependencies>;
  delete (dependencies as Record<string, unknown>).updateWrite;
  return {
    state,
    reads,
    queries,
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

type Harness = ReturnType<typeof createHarness>;
const join = (harness: Harness, request = input()) =>
  joinSoloCommunity(
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

Deno.test("fresh join은 users/target/query/ledger를 한 transaction에서 읽고 exact roster+primary+ledger를 commit한다", async () => {
  const originalUser = baseUser();
  const harness = createHarness({ [userPath]: originalUser });
  assertEquals(await join(harness), {
    alreadyCompleted: false,
    committed: true,
    result: { status: "joined" },
  });
  assertEquals(harness.reads, [
    { path: userPath, transaction: "tx-1" },
    { path: ledgerPath, transaction: "tx-1" },
    { path: targetPath, transaction: "tx-1" },
  ]);
  assertEquals(harness.queries, [{ limit: 4, transaction: "tx-1" }]);
  assertEquals(harness.commits, [{
    paths: [targetPath, userPath, ledgerPath],
    masks: [null, ["primaryOrgId", "updatedAt"], null],
    transaction: "tx-1",
  }]);
  assertEquals(harness.state.get(targetPath), {
    uid: UID,
    name: "민감한 이름",
    score: 40,
    talent: 0,
    currentDay: 30,
    streak: 7,
    readCount: 2,
    lastReadDate: "Wed Jul 15 2026",
    departmentId: null,
    departmentName: null,
    subgroupId: null,
    subgroupName: null,
    extraMemberships: [],
    joinedAt: NOW.toISOString(),
    updatedAt: NOW.toISOString(),
  });
  assertEquals(harness.state.get(userPath), {
    ...originalUser,
    primaryOrgId: SOLO,
    updatedAt: NOW.toISOString(),
  });
  assert(
    harness.state.get(userPath)?.talent === 25,
    "join must not reinterpret wallet",
  );
  assert(harness.state.get(userPath)?.talentWalletMigrated === false);
  assertEquals(harness.state.get(ledgerPath), storedLedger());
  const responseAndLedger = JSON.stringify({
    response: await join(harness),
    ledger: harness.state.get(ledgerPath),
  });
  for (
    const forbidden of [
      UID,
      SOLO,
      "민감한 이름",
      "plain-support-password",
      "talent",
      "balance",
    ]
  ) {
    assert(!responseAndLedger.includes(forbidden), `leaked ${forbidden}`);
  }
});

Deno.test("다른 primary가 있으면 primary를 보존하고 target+ledger만 쓴다", async () => {
  const otherPath = `churches/church-1/roster/${UID}`;
  const user = baseUser({ primaryOrgId: "church-1" });
  const harness = createHarness({
    [userPath]: user,
    [otherPath]: baseRoster(),
  });
  await join(harness);
  assertEquals(harness.commits[0].paths, [targetPath, ledgerPath]);
  assertEquals(harness.state.get(userPath), user);
});

Deno.test("T97 이전 일반 primary의 누락 talent/extra를 보존한 채 solo를 추가한다", async () => {
  const otherPath = `churches/church-1/roster/${UID}`;
  const legacyPrimary = baseRoster({
    talent: undefined,
    extraMemberships: undefined,
  });
  const harness = createHarness({
    [userPath]: baseUser({ primaryOrgId: "church-1" }),
    [otherPath]: legacyPrimary,
  });
  assertEquals(await join(harness), {
    alreadyCompleted: false,
    committed: true,
    result: { status: "joined" },
  });
  assertEquals(harness.commits[0].paths, [targetPath, ledgerPath]);
  assertEquals(harness.state.get(otherPath), legacyPrimary);
});

Deno.test("기존 target+null primary는 target 잔액을 보존하고 primary+ledger만 복구한다", async () => {
  const target = soloRoster({ talent: 77, unrelated: { keep: true } });
  const harness = createHarness({
    [userPath]: baseUser({ talentWalletMigrated: undefined }),
    [targetPath]: target,
  });
  assertEquals(await join(harness), {
    alreadyCompleted: false,
    committed: true,
    result: { status: "primaryRepaired" },
  });
  assertEquals(harness.commits[0].paths, [userPath, ledgerPath]);
  assertEquals(harness.state.get(targetPath), target);
  assert(harness.state.get(userPath)?.talent === 25);
  // 후속 migratePersonalTalentWallet action이 77+25를 합산한다.
  assert(harness.state.get(userPath)?.primaryOrgId === SOLO);
});

Deno.test("초기 target의 missing talent/extra는 primary 복구와 함께 masked patch한다", async () => {
  const legacy = soloRoster({
    talent: undefined,
    extraMemberships: undefined,
    unrelated: { keep: true },
  });
  const harness = createHarness({
    [userPath]: baseUser(),
    [targetPath]: legacy,
  });
  assertEquals(await join(harness), {
    alreadyCompleted: false,
    committed: true,
    result: { status: "rosterRepaired" },
  });
  assertEquals(harness.commits[0], {
    paths: [targetPath, userPath, ledgerPath],
    masks: [
      ["talent", "extraMemberships", "updatedAt"],
      ["primaryOrgId", "updatedAt"],
      null,
    ],
    transaction: "tx-1",
  });
  assertEquals(harness.state.get(targetPath), {
    ...legacy,
    talent: 0,
    extraMemberships: [],
    updatedAt: NOW.toISOString(),
  });
});

Deno.test("solo primary만 남고 target가 삭제된 legacy 상태는 target+ledger로 복구한다", async () => {
  const harness = createHarness({
    [userPath]: baseUser({ primaryOrgId: SOLO }),
  });
  assertEquals((await join(harness)).result, { status: "rosterRepaired" });
  assertEquals(harness.commits[0].paths, [targetPath, ledgerPath]);
  assert(harness.state.get(userPath)?.primaryOrgId === SOLO);
});

Deno.test("canonical target+primary는 no-op이고 원장을 만들지 않는다", async () => {
  const target = soloRoster();
  const harness = createHarness({
    [userPath]: baseUser({ primaryOrgId: SOLO }),
    [targetPath]: target,
  });
  assertEquals(await join(harness), {
    alreadyCompleted: false,
    committed: false,
    result: { status: "alreadyJoined" },
  });
  assertEquals(harness.commits, []);
  assert(harness.rollbacks === 1);
});

Deno.test("exact ledger+canonical post-state만 replay하고 UUID 충돌은 409한다", async () => {
  const canonical = {
    [userPath]: baseUser({ primaryOrgId: SOLO }),
    [targetPath]: soloRoster(),
    [ledgerPath]: storedLedger(),
  };
  const harness = createHarness(canonical);
  assertEquals(await join(harness), {
    alreadyCompleted: true,
    committed: true,
    result: { status: "joined" },
  });
  for (
    const ledger of [
      storedLedger({ extra: true }),
      storedLedger({ action: "other" }),
      storedLedger({ input: { uid: UID } }),
      storedLedger({ result: { status: "alreadyJoined" } }),
      storedLedger({ result: { status: "joined", talent: 25 } }),
      storedLedger({ createdAt: "2026-02-30T00:00:00Z" }),
    ]
  ) {
    const malformed = createHarness({ ...canonical, [ledgerPath]: ledger });
    await expectError(() => join(malformed), "CONFLICT");
  }
});

Deno.test("409는 최대 3회 재평가하고 apply-then-409는 ledger replay로 수렴한다", async () => {
  const retry = createHarness({ [userPath]: baseUser() });
  retry.conflictBeforeApply(2);
  assert((await join(retry)).result.status === "joined");
  assert(retry.transactions === 3);

  const exhausted = createHarness({ [userPath]: baseUser() });
  exhausted.conflictBeforeApply(3);
  await expectError(() => join(exhausted), "FIRESTORE_WRITE_FAILED");
  assert(exhausted.transactions === 3);

  const applied = createHarness({ [userPath]: baseUser() });
  applied.conflictAfterApply();
  assertEquals(await join(applied), {
    alreadyCompleted: true,
    committed: true,
    result: { status: "joined" },
  });
  assert(applied.transactions === 2);
});

Deno.test("동시 일반 join winner가 3번째 roster/primary를 만들면 retry가 새 snapshot으로 상한을 재평가한다", async () => {
  const a = `churches/a/roster/${UID}`;
  const b = `churches/b/roster/${UID}`;
  const c = `churches/c/roster/${UID}`;
  const harness = createHarness({
    [userPath]: baseUser({ primaryOrgId: "a" }),
    [a]: baseRoster(),
    [b]: baseRoster(),
  });
  harness.conflictBeforeApply(1, (state) => {
    state.set(c, baseRoster());
  });
  await expectError(() => join(harness), "CONFLICT");
  assert(harness.transactions === 2);
  assert(!harness.state.has(targetPath));
});

Deno.test("anonymous/non-exact input은 transaction 전에, 상한·손상·primary 누락은 무쓰기로 거부한다", async () => {
  const harness = createHarness({ [userPath]: baseUser() });
  await expectError(
    () =>
      joinSoloCommunity(
        SERVICE,
        { uid: UID, anonymous: true },
        input(),
        harness.dependencies,
      ),
    "ANONYMOUS_NOT_ALLOWED",
  );
  await expectError(
    () => join(harness, { ...input(), uid: UID } as JoinSoloCommunityInput),
    "BAD_REQUEST",
  );
  assert(harness.transactions === 0);

  for (
    const initial of [
      {},
      { [userPath]: baseUser({ isDeleted: true }) },
      { [userPath]: baseUser({ role: "churchAdmin" }) },
      { [userPath]: baseUser({ accountType: "church" }) },
      { [userPath]: baseUser({ churchId: "church-1" }) },
      { [userPath]: baseUser({ talentMigrated: false }) },
      { [userPath]: baseUser({ primaryOrgId: "missing" }) },
      {
        [userPath]: baseUser({ primaryOrgId: "a" }),
        [`churches/a/roster/${UID}`]: baseRoster({ talent: 1.5 }),
      },
      {
        [userPath]: baseUser({ primaryOrgId: "a" }),
        [`churches/a/roster/${UID}`]: baseRoster(),
        [`churches/b/roster/${UID}`]: baseRoster(),
        [`churches/c/roster/${UID}`]: baseRoster(),
      },
    ] as Array<Record<string, Data>>
  ) {
    const invalid = createHarness(initial);
    const candidateUser = initial[userPath];
    const expectedCode = Object.keys(initial).length === 0
      ? "NOT_FOUND"
      : candidateUser?.isDeleted === true ||
          candidateUser?.role === "churchAdmin" ||
          candidateUser?.accountType === "church" ||
          candidateUser?.churchId === "church-1"
      ? "FORBIDDEN"
      : "CONFLICT";
    await expectError(
      () => join(invalid),
      expectedCode,
    );
    assertEquals(invalid.commits, []);
  }
});
