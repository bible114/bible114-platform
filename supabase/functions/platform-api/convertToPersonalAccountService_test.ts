import { PlatformError } from "../_shared/errors.ts";
import {
  decodeFirestoreFields,
  type FirestoreDocument,
  type FirestoreValue,
  type FirestoreWrite,
} from "../_shared/firestore.ts";
import {
  convertToPersonalAccount,
  type ConvertToPersonalAccountDependencies,
  type ConvertToPersonalAccountInput,
} from "./convertToPersonalAccountService.ts";

const PROJECT = "test-project";
const SERVICE = { token: "service-token", projectId: PROJECT };
const UID = "user-1";
const SOURCE = "church-1";
const REQUEST_ID = "123e4567-e89b-42d3-a456-426614174000";
const NOW = new Date("2026-07-16T03:04:05.000Z");
const TOKEN_EMAIL = `${encodeURIComponent("성도님")}_19900101p1234@bible.local`;
const PREFIX = `projects/${PROJECT}/databases/(default)/documents/`;
const userPath = `users/${UID}`;
const churchPath = `churches/${SOURCE}`;
const sourceRosterPath = `${churchPath}/roster/${UID}`;
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
  name: "성도님",
  birthdate: "19900101",
  email: "old-member@bible.local",
  password: "plain-support-password",
  role: "member",
  accountType: "church",
  churchId: SOURCE,
  churchName: "출발교회",
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
  departmentId: "adult",
  departmentName: "장년부",
  subgroupId: "cell-1",
  subgroupName: "1구역",
  extraMemberships: [],
  unrelated: { keep: true },
  ...overrides,
});
const convertedUser = (overrides: Data = {}): Data =>
  baseUser({
    accountType: "personal",
    email: TOKEN_EMAIL,
    churchId: null,
    churchName: null,
    primaryOrgId: SOURCE,
    ...overrides,
  });
const baseRoster = (overrides: Data = {}): Data => ({
  uid: UID,
  name: "성도님",
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
const baseChurch = (overrides: Data = {}): Data => ({
  name: "출발교회",
  isDeleted: false,
  ...overrides,
});
const storedLedger = (overrides: Data = {}): Data => ({
  schemaVersion: 1,
  action: "convertToPersonalAccount",
  requestId: REQUEST_ID,
  input: {},
  result: { status: "converted", primaryOrgId: SOURCE },
  createdAt: NOW.toISOString(),
  ...overrides,
});
const input = (
  overrides: Partial<ConvertToPersonalAccountInput> = {},
): ConvertToPersonalAccountInput => ({ requestId: REQUEST_ID, ...overrides });

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
  } as unknown as Partial<ConvertToPersonalAccountDependencies>;
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
const convert = (harness: Harness, request = input()) =>
  convertToPersonalAccount(
    SERVICE,
    { uid: UID, anonymous: false, tokenEmail: TOKEN_EMAIL },
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

Deno.test("fresh conversion은 users/ledger/source church/source roster/query를 한 transaction에서 읽고 원자 commit한다", async () => {
  const originalUser = baseUser();
  const harness = createHarness({
    [userPath]: originalUser,
    [churchPath]: baseChurch(),
  });
  assertEquals(await convert(harness), {
    alreadyCompleted: false,
    committed: true,
    result: { status: "converted", primaryOrgId: SOURCE },
  });
  assertEquals(harness.reads, [
    { path: userPath, transaction: "tx-1" },
    { path: ledgerPath, transaction: "tx-1" },
    { path: churchPath, transaction: "tx-1" },
    { path: sourceRosterPath, transaction: "tx-1" },
  ]);
  assertEquals(harness.queries, [{ limit: 4, transaction: "tx-1" }]);
  assertEquals(harness.commits, [{
    paths: [sourceRosterPath, userPath, ledgerPath],
    masks: [
      null,
      [
        "accountType",
        "email",
        "churchId",
        "churchName",
        "primaryOrgId",
        "updatedAt",
      ],
      null,
    ],
    transaction: "tx-1",
  }]);
  assertEquals(harness.state.get(sourceRosterPath), {
    uid: UID,
    name: "성도님",
    score: 40,
    currentDay: 30,
    streak: 7,
    readCount: 2,
    lastReadDate: "Wed Jul 15 2026",
    planId: "1year_revised",
    fixtureType: null,
    talent: 0,
    departmentId: "adult",
    departmentName: "장년부",
    subgroupId: "cell-1",
    subgroupName: "1구역",
    extraMemberships: [],
    joinedAt: NOW.toISOString(),
    updatedAt: NOW.toISOString(),
  });
  assertEquals(harness.state.get(userPath), {
    ...originalUser,
    accountType: "personal",
    email: TOKEN_EMAIL,
    churchId: null,
    churchName: null,
    primaryOrgId: SOURCE,
    updatedAt: NOW.toISOString(),
  });
  assert(harness.state.get(userPath)?.talent === 25);
  assert(harness.state.get(userPath)?.talentWalletMigrated === false);
  assertEquals(harness.state.get(ledgerPath), storedLedger());

  const publicShape = JSON.stringify({
    response: await convert(harness),
    ledger: harness.state.get(ledgerPath),
  });
  for (
    const forbidden of [
      UID,
      TOKEN_EMAIL,
      "성도님",
      "plain-support-password",
      "talent",
      "balance",
    ]
  ) {
    assert(!publicShape.includes(forbidden), `leaked ${forbidden}`);
  }
});

Deno.test("기존 source roster는 잔액을 보존하고 missing T97 필드만 masked patch한다", async () => {
  const legacy = baseRoster({
    talent: undefined,
    extraMemberships: undefined,
    unrelated: { keep: true },
  });
  const harness = createHarness({
    [userPath]: baseUser(),
    [churchPath]: baseChurch(),
    [sourceRosterPath]: legacy,
  });
  await convert(harness);
  assertEquals(harness.commits[0], {
    paths: [sourceRosterPath, userPath, ledgerPath],
    masks: [
      ["talent", "extraMemberships", "updatedAt"],
      [
        "accountType",
        "email",
        "churchId",
        "churchName",
        "primaryOrgId",
        "updatedAt",
      ],
      null,
    ],
    transaction: "tx-1",
  });
  assertEquals(harness.state.get(sourceRosterPath), {
    ...legacy,
    talent: 0,
    extraMemberships: [],
    updatedAt: NOW.toISOString(),
  });

  const existing = createHarness({
    [userPath]: baseUser(),
    [churchPath]: baseChurch(),
    [sourceRosterPath]: baseRoster({ talent: 77, unrelated: "keep" }),
  });
  await convert(existing);
  assertEquals(existing.commits[0].paths, [userPath, ledgerPath]);
  assert(existing.state.get(sourceRosterPath)?.talent === 77);

  const resetPreviously = createHarness({
    [userPath]: baseUser({ talentWalletMigrated: true, talent: 25 }),
    [churchPath]: baseChurch(),
  });
  await convert(resetPreviously);
  assert(resetPreviously.state.get(userPath)?.talentWalletMigrated === true);
  assert(resetPreviously.state.get(userPath)?.talent === 25);
  assert(resetPreviously.state.get(sourceRosterPath)?.talent === 0);
});

Deno.test("exact ledger와 canonical post-state만 replay하고 후속 지갑 이관 완료도 허용한다", async () => {
  const canonical = {
    [userPath]: convertedUser(),
    [churchPath]: baseChurch(),
    [sourceRosterPath]: baseRoster(),
    [ledgerPath]: storedLedger(),
  };
  const harness = createHarness(canonical);
  assertEquals(await convert(harness), {
    alreadyCompleted: true,
    committed: true,
    result: { status: "converted", primaryOrgId: SOURCE },
  });
  assertEquals(harness.commits, []);
  assert(harness.rollbacks === 1);

  const migrated = createHarness({
    ...canonical,
    [userPath]: convertedUser({ talent: 0, talentWalletMigrated: true }),
    [sourceRosterPath]: baseRoster({ talent: 35 }),
  });
  assert((await convert(migrated)).alreadyCompleted);

  const lateRefund = createHarness({
    ...canonical,
    [userPath]: convertedUser({ talent: 5, talentWalletMigrated: true }),
    [sourceRosterPath]: baseRoster({ talent: 35 }),
  });
  assert((await convert(lateRefund)).alreadyCompleted);
});

Deno.test("UUID collision과 손상 ledger 또는 post-state는 409한다", async () => {
  const canonical = {
    [userPath]: convertedUser(),
    [churchPath]: baseChurch(),
    [sourceRosterPath]: baseRoster(),
  };
  for (
    const ledger of [
      storedLedger({ extra: true }),
      storedLedger({ action: "other" }),
      storedLedger({ input: { uid: UID } }),
      storedLedger({ result: { status: "converted" } }),
      storedLedger({
        result: { status: "alreadyConverted", primaryOrgId: SOURCE },
      }),
      storedLedger({ createdAt: "2026-02-30T00:00:00Z" }),
    ]
  ) {
    const harness = createHarness({ ...canonical, [ledgerPath]: ledger });
    await expectError(() => convert(harness), "CONFLICT");
    assertEquals(harness.commits, []);
  }

  const wrongState = createHarness({
    ...canonical,
    [userPath]: convertedUser({ primaryOrgId: "other" }),
    [ledgerPath]: storedLedger(),
  });
  await expectError(() => convert(wrongState), "CONFLICT");
});

Deno.test("409는 최대 3회 재평가하고 apply-then-409는 ledger replay로 수렴한다", async () => {
  const initial = { [userPath]: baseUser(), [churchPath]: baseChurch() };
  const retry = createHarness(initial);
  retry.conflictBeforeApply(2);
  assert((await convert(retry)).result.status === "converted");
  assert(retry.transactions === 3);

  const exhausted = createHarness(initial);
  exhausted.conflictBeforeApply(3);
  await expectError(() => convert(exhausted), "FIRESTORE_WRITE_FAILED");
  assert(exhausted.transactions === 3);
  assertEquals(exhausted.state.get(userPath), baseUser());
  assert(
    !exhausted.state.has(sourceRosterPath) && !exhausted.state.has(ledgerPath),
  );

  const applied = createHarness(initial);
  applied.conflictAfterApply();
  assertEquals(await convert(applied), {
    alreadyCompleted: true,
    committed: true,
    result: { status: "converted", primaryOrgId: SOURCE },
  });
  assert(applied.transactions === 2);
});

Deno.test("동시 3번째 roster winner는 retry snapshot에서 4번째 source 생성을 409한다", async () => {
  const a = `churches/a/roster/${UID}`;
  const b = `churches/b/roster/${UID}`;
  const c = `churches/c/roster/${UID}`;
  const harness = createHarness({
    [userPath]: baseUser(),
    [churchPath]: baseChurch(),
    [a]: baseRoster(),
    [b]: baseRoster(),
  });
  harness.conflictBeforeApply(1, (state) => state.set(c, baseRoster()));
  await expectError(() => convert(harness), "CONFLICT");
  assert(harness.transactions === 2);
  assert(!harness.state.has(sourceRosterPath));
  assertEquals(harness.state.get(userPath), baseUser());
});

Deno.test("anonymous/non-exact input과 token email 누락은 transaction 전에 또는 무쓰기로 거부한다", async () => {
  const harness = createHarness({
    [userPath]: baseUser(),
    [churchPath]: baseChurch(),
  });
  await expectError(
    () =>
      convertToPersonalAccount(
        SERVICE,
        { uid: UID, anonymous: true, tokenEmail: TOKEN_EMAIL },
        input(),
        harness.dependencies,
      ),
    "ANONYMOUS_NOT_ALLOWED",
  );
  await expectError(
    () =>
      convert(
        harness,
        { ...input(), uid: UID } as ConvertToPersonalAccountInput,
      ),
    "BAD_REQUEST",
  );
  assert(harness.transactions === 0);

  const badEmail = createHarness({
    [userPath]: baseUser(),
    [churchPath]: baseChurch(),
  });
  await expectError(
    () =>
      convertToPersonalAccount(
        SERVICE,
        { uid: UID, anonymous: false, tokenEmail: "old-member@bible.local" },
        input(),
        badEmail.dependencies,
      ),
    "FORBIDDEN",
  );
  assertEquals(badEmail.commits, []);
});

Deno.test("missing/deleted source church, unsafe wallet, source 없는 3 roster는 partial write 없이 거부한다", async () => {
  const invalidCases: Array<[Record<string, Data>, string]> = [
    [{ [userPath]: baseUser() }, "NOT_FOUND"],
    [{
      [userPath]: baseUser(),
      [churchPath]: baseChurch({ isDeleted: true }),
    }, "NOT_FOUND"],
    [{
      [userPath]: baseUser({ talent: 20 }),
      [churchPath]: baseChurch(),
      [sourceRosterPath]: baseRoster({ talent: 999_999_990 }),
    }, "CONFLICT"],
    [{
      [userPath]: baseUser(),
      [churchPath]: baseChurch(),
      [`churches/a/roster/${UID}`]: baseRoster(),
      [`churches/b/roster/${UID}`]: baseRoster(),
      [`churches/c/roster/${UID}`]: baseRoster(),
    }, "CONFLICT"],
  ];
  for (const [initial, code] of invalidCases) {
    const harness = createHarness(initial);
    await expectError(() => convert(harness), code);
    assertEquals(harness.commits, []);
    assert(!harness.state.has(ledgerPath));
  }
});
