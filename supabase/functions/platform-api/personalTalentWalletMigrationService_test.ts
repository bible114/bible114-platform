import { PlatformError } from "../_shared/errors.ts";
import {
  decodeFirestoreFields,
  type FirestoreDocument,
  type FirestoreValue,
  type FirestoreWrite,
} from "../_shared/firestore.ts";
import {
  migratePersonalTalentWallet,
  type MigratePersonalTalentWalletDependencies,
  type MigratePersonalTalentWalletInput,
} from "./personalTalentWalletMigrationService.ts";

const PROJECT_ID = "test-project";
const SERVICE = { token: "service-token", projectId: PROJECT_ID };
const UID = "user-1";
const ORG_ID = "org-1";
const REQUEST_ID = "123e4567-e89b-42d3-a456-426614174000";
const NOW = new Date("2026-07-16T03:04:05.000Z");
const DOCUMENT_PREFIX = `projects/${PROJECT_ID}/databases/(default)/documents/`;

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
const documentName = (path: string) => `${DOCUMENT_PREFIX}${path}`;
const pathFromName = (name: string): string => {
  assert(name.startsWith(DOCUMENT_PREFIX), `unexpected document name: ${name}`);
  return name.slice(DOCUMENT_PREFIX.length).split("/").map(decodeURIComponent)
    .join("/");
};

const userPath = `users/${UID}`;
const rosterPath = `churches/${ORG_ID}/roster/${UID}`;
const ledgerPath = `${userPath}/activityActions/${REQUEST_ID}`;

const baseUser = (overrides: Data = {}): Data => ({
  uid: UID,
  name: "민감한 이름",
  password: "plain-support-password",
  role: "member",
  accountType: "personal",
  isDeleted: false,
  primaryOrgId: ORG_ID,
  talent: 25,
  talentWalletMigrated: false,
  unrelated: { keep: true },
  ...overrides,
});

const baseRoster = (overrides: Data = {}): Data => ({
  uid: UID,
  name: "민감한 이름",
  talent: 40,
  extraMemberships: [],
  unrelated: { keep: true },
  ...overrides,
});

const storedLedger = (overrides: Data = {}): Data => ({
  schemaVersion: 1,
  action: "migratePersonalTalentWallet",
  requestId: REQUEST_ID,
  input: {},
  result: { status: "migrated" },
  createdAt: NOW.toISOString(),
  ...overrides,
});

const input = (
  overrides: Partial<MigratePersonalTalentWalletInput> = {},
): MigratePersonalTalentWalletInput => ({
  requestId: REQUEST_ID,
  ...overrides,
});

type UpdateWrite = {
  update: { name: string; fields: Record<string, FirestoreValue> };
  updateMask?: { fieldPaths: string[] };
  currentDocument?: { exists?: boolean };
};

const createHarness = (initial: Record<string, Data> = {}) => {
  const state = new Map(
    Object.entries(initial).map(([path, data]) => [path, clone(data)]),
  );
  const commits: Array<{
    paths: string[];
    masks: Array<string[] | null>;
    transaction?: string;
  }> = [];
  const reads: Array<{ path: string; transaction?: string }> = [];
  let transactionCount = 0;
  let rollbackCount = 0;
  let beginConflicts = 0;
  let commitConflictsBeforeApply = 0;
  let applyThenConflictOnce = false;

  const asDocument = <T>(path: string, data: Data): FirestoreDocument<T> => ({
    name: documentName(path),
    fields: {},
    data: clone(data) as T,
  });

  const begin = () => {
    transactionCount += 1;
    if (beginConflicts > 0) {
      beginConflicts -= 1;
      throw new PlatformError("FIRESTORE_READ_FAILED", {
        details: { status: 409 },
      });
    }
    return Promise.resolve(`tx-${transactionCount}`);
  };

  const read = <T>(
    _token: string,
    _projectId: string,
    path: string,
    options: { transaction?: string } = {},
  ): Promise<FirestoreDocument<T> | null> => {
    reads.push({ path, transaction: options.transaction });
    const data = state.get(path);
    return Promise.resolve(data ? asDocument<T>(path, data) : null);
  };

  const rollback = () => {
    rollbackCount += 1;
    return Promise.resolve();
  };

  const commit = (
    _token: string,
    _projectId: string,
    writes: FirestoreWrite[],
    options: { transaction?: string } = {},
  ) => {
    if (commitConflictsBeforeApply > 0) {
      commitConflictsBeforeApply -= 1;
      throw new PlatformError("FIRESTORE_WRITE_FAILED", {
        details: { status: 409 },
      });
    }
    const next = new Map(
      Array.from(state.entries()).map(([path, data]) => [path, clone(data)]),
    );
    const paths: string[] = [];
    const masks: Array<string[] | null> = [];
    for (const rawWrite of writes) {
      const write = rawWrite as UpdateWrite;
      assert(write.update, "only update writes are expected");
      const path = pathFromName(write.update.name);
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
      if (!write.updateMask) {
        next.set(path, decoded);
        continue;
      }
      const merged = { ...(next.get(path) || {}) };
      for (const fieldPath of write.updateMask.fieldPaths) {
        merged[fieldPath] = decoded[fieldPath];
      }
      next.set(path, merged);
    }
    commits.push({ paths, masks, transaction: options.transaction });
    state.clear();
    next.forEach((data, path) => state.set(path, data));
    if (applyThenConflictOnce) {
      applyThenConflictOnce = false;
      throw new PlatformError("FIRESTORE_WRITE_FAILED", {
        details: { status: 409 },
      });
    }
    return Promise.resolve({});
  };

  const dependencies = {
    beginTransaction: begin,
    commitWrites: commit,
    getDocument: read,
    rollbackTransaction: rollback,
    now: () => new Date(NOW),
  } as unknown as Partial<MigratePersonalTalentWalletDependencies>;

  return {
    state,
    commits,
    reads,
    dependencies,
    get transactionCount() {
      return transactionCount;
    },
    get rollbackCount() {
      return rollbackCount;
    },
    conflictAtBegin(count: number) {
      beginConflicts = count;
    },
    conflictBeforeCommit(count: number) {
      commitConflictsBeforeApply = count;
    },
    conflictAfterAppliedCommit() {
      applyThenConflictOnce = true;
    },
  };
};

type Harness = ReturnType<typeof createHarness>;
const migrate = (
  harness: Harness,
  request: MigratePersonalTalentWalletInput = input(),
) =>
  migratePersonalTalentWallet(
    SERVICE,
    { uid: UID, anonymous: false },
    request,
    harness.dependencies,
  );

const expectPlatformError = async (
  callback: () => Promise<unknown>,
  code: string,
) => {
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

Deno.test("fresh 이전은 users와 primary roster, 최소 schema1 원장을 한 transaction에 쓴다", async () => {
  const originalUser = baseUser();
  const originalRoster = baseRoster();
  const harness = createHarness({
    [userPath]: originalUser,
    [rosterPath]: originalRoster,
  });

  const response = await migrate(harness);
  assertEquals(Object.keys(response).sort(), [
    "alreadyCompleted",
    "committed",
    "result",
  ]);
  assertEquals(response, {
    alreadyCompleted: false,
    committed: true,
    result: { status: "migrated" },
  });
  assertEquals(harness.commits, [{
    paths: [userPath, rosterPath, ledgerPath],
    masks: [["talent", "talentWalletMigrated"], ["talent"], null],
    transaction: "tx-1",
  }]);
  assertEquals(harness.reads, [
    { path: userPath, transaction: "tx-1" },
    { path: ledgerPath, transaction: "tx-1" },
    { path: rosterPath, transaction: "tx-1" },
  ]);
  assertEquals(harness.state.get(userPath), {
    ...originalUser,
    talent: 0,
    talentWalletMigrated: true,
  });
  assertEquals(harness.state.get(rosterPath), {
    ...originalRoster,
    talent: 65,
  });
  const ledger = harness.state.get(ledgerPath)!;
  assertEquals(ledger, storedLedger());
  const serializedLedger = JSON.stringify(ledger);
  for (
    const forbidden of [
      UID,
      ORG_ID,
      "민감한 이름",
      "plain-support-password",
      "amount",
      "balance",
      "path",
      "talent",
    ]
  ) {
    assert(!serializedLedger.includes(forbidden), `ledger leaked ${forbidden}`);
  }
});

Deno.test("0 달란트 미이전 상태는 users flag와 원장만 쓰고 roster는 보존한다", async () => {
  const roster = baseRoster();
  const harness = createHarness({
    [userPath]: baseUser({ talent: 0, talentWalletMigrated: false }),
    [rosterPath]: roster,
  });
  assertEquals(await migrate(harness), {
    alreadyCompleted: false,
    committed: true,
    result: { status: "migrated" },
  });
  assertEquals(harness.commits[0].paths, [userPath, ledgerPath]);
  assertEquals(harness.commits[0].masks, [["talentWalletMigrated"], null]);
  assertEquals(harness.state.get(rosterPath), roster);
  assert(harness.state.get(userPath)?.talent === 0);
  assert(harness.state.get(userPath)?.talentWalletMigrated === true);
});

Deno.test("legacy primary 누락 필드는 users 무쓰기 roster masked patch+원장으로 materialize한다", async () => {
  const originalUser = baseUser({ talent: 0, talentWalletMigrated: true });
  const legacyRoster = baseRoster({
    talent: undefined,
    extraMemberships: undefined,
  });
  const harness = createHarness({
    [userPath]: originalUser,
    [rosterPath]: legacyRoster,
  });
  assertEquals(await migrate(harness), {
    alreadyCompleted: false,
    committed: true,
    result: { status: "migrated" },
  });
  assertEquals(harness.commits, [{
    paths: [rosterPath, ledgerPath],
    masks: [["talent", "extraMemberships"], null],
    transaction: "tx-1",
  }]);
  assertEquals(harness.state.get(userPath), originalUser);
  assertEquals(harness.state.get(rosterPath), {
    ...legacyRoster,
    talent: 0,
    extraMemberships: [],
  });
  assertEquals(harness.state.get(ledgerPath), storedLedger());
});

Deno.test("legacy 0 roster에 users 잔액을 더하면서 nonempty extraMemberships는 보존한다", async () => {
  const extraMemberships = [{ departmentId: "adult", subgroupId: "cell-1" }];
  const harness = createHarness({
    [userPath]: baseUser({ talent: 25, talentWalletMigrated: true }),
    [rosterPath]: baseRoster({ talent: undefined, extraMemberships }),
  });
  await migrate(harness);
  assertEquals(harness.commits[0], {
    paths: [userPath, rosterPath, ledgerPath],
    masks: [["talent", "talentWalletMigrated"], ["talent"], null],
    transaction: "tx-1",
  });
  assert(harness.state.get(rosterPath)?.talent === 25);
  assertEquals(
    harness.state.get(rosterPath)?.extraMemberships,
    extraMemberships,
  );
});

Deno.test("완료 표식 뒤 늦은 환불 잔액도 새 요청에서 정확히 한 번 재이관한다", async () => {
  const harness = createHarness({
    [userPath]: baseUser({ talent: 25, talentWalletMigrated: true }),
    [rosterPath]: baseRoster(),
  });
  assertEquals(await migrate(harness), {
    alreadyCompleted: false,
    committed: true,
    result: { status: "migrated" },
  });
  assert(harness.state.get(userPath)?.talent === 0);
  assert(harness.state.get(userPath)?.talentWalletMigrated === true);
  assert(harness.state.get(rosterPath)?.talent === 65);
  assert(harness.state.has(ledgerPath), "late refund migration ledger missing");
});

Deno.test("이미 0 달란트로 이전된 fresh 요청은 rollback no-op이고 원장을 만들지 않는다", async () => {
  const harness = createHarness({
    [userPath]: baseUser({ talent: 0, talentWalletMigrated: true }),
    [rosterPath]: baseRoster(),
  });
  assertEquals(await migrate(harness), {
    alreadyCompleted: false,
    committed: false,
    result: { status: "alreadyMigrated" },
  });
  assertEquals(harness.commits, []);
  assert(!harness.state.has(ledgerPath));
  assert(harness.rollbackCount === 1, "no-op transaction was not rolled back");
});

Deno.test("primary roster가 없는 canonical personal user는 무쓰기 primaryMissing이다", async () => {
  const originalUser = baseUser({ talent: 25, talentWalletMigrated: true });
  const harness = createHarness({ [userPath]: originalUser });
  assertEquals(await migrate(harness), {
    alreadyCompleted: false,
    committed: false,
    result: { status: "primaryMissing" },
  });
  assertEquals(harness.commits, []);
  assertEquals(harness.state.get(userPath), originalUser);
  assert(!harness.state.has(ledgerPath));
  assert(
    harness.rollbackCount === 1,
    "missing-primary no-op was not rolled back",
  );
});

Deno.test("exact 원장은 replay로만 응답하고 다시 쓰지 않는다", async () => {
  const harness = createHarness({
    [userPath]: baseUser({ talent: 0, talentWalletMigrated: true }),
    [rosterPath]: baseRoster({ talent: 65 }),
    [ledgerPath]: storedLedger(),
  });
  assertEquals(await migrate(harness), {
    alreadyCompleted: true,
    committed: true,
    result: { status: "migrated" },
  });
  assertEquals(harness.commits, []);
  assert(harness.rollbackCount === 1, "replay transaction was not rolled back");
});

Deno.test("primary roster가 나중에 사라져도 기존 exact 원장은 replay를 보존한다", async () => {
  const harness = createHarness({
    [userPath]: baseUser({ talent: 0, talentWalletMigrated: true }),
    [ledgerPath]: storedLedger(),
  });
  assertEquals(await migrate(harness), {
    alreadyCompleted: true,
    committed: true,
    result: { status: "migrated" },
  });
  assertEquals(harness.commits, []);
  assert(
    harness.rollbackCount === 1,
    "missing-primary replay was not rolled back",
  );
});

Deno.test("원장은 exact keys, 빈 input, migrated result, RFC3339 timestamp를 요구한다", async () => {
  const malformed = [
    storedLedger({ extra: true }),
    storedLedger({ schemaVersion: 2 }),
    storedLedger({ action: "other" }),
    storedLedger({ requestId: "223e4567-e89b-42d3-a456-426614174000" }),
    storedLedger({ input: { amount: 25 } }),
    storedLedger({ result: { status: "alreadyMigrated" } }),
    storedLedger({ result: { status: "migrated", amount: 25 } }),
    storedLedger({ createdAt: "2026-02-30T00:00:00Z" }),
  ];
  for (const ledger of malformed) {
    const harness = createHarness({
      [userPath]: baseUser({ talent: 0, talentWalletMigrated: true }),
      [rosterPath]: baseRoster(),
      [ledgerPath]: ledger,
    });
    await expectPlatformError(() => migrate(harness), "CONFLICT");
    assertEquals(harness.commits, []);
  }
});

Deno.test("409는 최대 3회 재시도하고 apply-then-409는 ledger replay가 된다", async () => {
  const retry = createHarness({
    [userPath]: baseUser(),
    [rosterPath]: baseRoster(),
  });
  retry.conflictBeforeCommit(2);
  assertEquals(await migrate(retry), {
    alreadyCompleted: false,
    committed: true,
    result: { status: "migrated" },
  });
  assert(retry.transactionCount === 3, "did not retry twice");

  const exhausted = createHarness({
    [userPath]: baseUser(),
    [rosterPath]: baseRoster(),
  });
  exhausted.conflictAtBegin(3);
  await expectPlatformError(() => migrate(exhausted), "FIRESTORE_READ_FAILED");
  assert(exhausted.transactionCount === 3, "attempt limit was not enforced");

  const applied = createHarness({
    [userPath]: baseUser(),
    [rosterPath]: baseRoster(),
  });
  applied.conflictAfterAppliedCommit();
  assertEquals(await migrate(applied), {
    alreadyCompleted: true,
    committed: true,
    result: { status: "migrated" },
  });
  assert(applied.transactionCount === 2, "applied conflict did not replay");
  assert(applied.state.get(rosterPath)?.talent === 65, "talent moved twice");
});

Deno.test("anonymous, malformed uid와 non-exact service input은 transaction 전에 거부한다", async () => {
  const harness = createHarness({
    [userPath]: baseUser(),
    [rosterPath]: baseRoster(),
  });
  await expectPlatformError(
    () =>
      migratePersonalTalentWallet(
        SERVICE,
        { uid: UID, anonymous: true },
        input(),
        harness.dependencies,
      ),
    "ANONYMOUS_NOT_ALLOWED",
  );
  await expectPlatformError(
    () =>
      migratePersonalTalentWallet(
        SERVICE,
        { uid: ` ${UID}`, anonymous: false },
        input(),
        harness.dependencies,
      ),
    "BAD_REQUEST",
  );
  await expectPlatformError(
    () =>
      migratePersonalTalentWallet(
        SERVICE,
        { uid: UID, anonymous: false },
        {
          requestId: REQUEST_ID,
          amount: 25,
        } as MigratePersonalTalentWalletInput,
        harness.dependencies,
      ),
    "BAD_REQUEST",
  );
  assert(harness.transactionCount === 0, "invalid request opened transaction");
});

Deno.test("missing user, inactive, nonpersonal, wrong roster와 invalid wallet은 fail closed한다", async () => {
  const missing = createHarness();
  await expectPlatformError(() => migrate(missing), "NOT_FOUND");

  for (
    const user of [
      baseUser({ isDeleted: true }),
      baseUser({ role: "churchAdmin" }),
      baseUser({ accountType: "church" }),
    ]
  ) {
    const harness = createHarness({
      [userPath]: user,
      [rosterPath]: baseRoster(),
    });
    await expectPlatformError(() => migrate(harness), "FORBIDDEN");
  }

  for (
    const state of [
      { user: baseUser({ primaryOrgId: " org-1" }), roster: baseRoster() },
      { user: baseUser(), roster: baseRoster({ uid: "other-user" }) },
      { user: baseUser({ talent: -1 }), roster: baseRoster() },
      { user: baseUser({ talent: -1 }), roster: null },
      {
        user: baseUser({ talentWalletMigrated: "true" }),
        roster: null,
      },
      { user: baseUser({ isDeleted: "false" }), roster: null },
      {
        user: baseUser({ talent: 1 }),
        roster: baseRoster({ talent: 1_000_000_000 }),
      },
      { user: baseUser(), roster: baseRoster({ talent: null }) },
      {
        user: baseUser(),
        roster: baseRoster({ extraMemberships: null }),
      },
      {
        user: baseUser(),
        roster: baseRoster({ extraMemberships: "invalid" }),
      },
    ]
  ) {
    const initial: Record<string, Data> = { [userPath]: state.user };
    if (state.roster) initial[rosterPath] = state.roster;
    const harness = createHarness(initial);
    await expectPlatformError(() => migrate(harness), "CONFLICT");
    assertEquals(harness.commits, []);
  }
});
