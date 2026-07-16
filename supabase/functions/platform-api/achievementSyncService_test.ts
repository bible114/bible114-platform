import { PlatformError } from "../_shared/errors.ts";
import {
  decodeFirestoreFields,
  type FirestoreDocument,
  type FirestoreValue,
  type FirestoreWrite,
} from "../_shared/firestore.ts";
import {
  syncAchievements,
  type SyncAchievementsDependencies,
  type SyncAchievementsInput,
} from "./achievementSyncService.ts";

const PROJECT_ID = "test-project";
const SERVICE = { token: "service-token", projectId: PROJECT_ID };
const UID = "user-1";
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

const baseUser = (overrides: Data = {}): Data => ({
  uid: UID,
  name: "민감한 이름",
  password: "plain-support-password",
  currentDay: 1,
  streak: 0,
  score: 0,
  achievements: [],
  memos: {},
  unrelated: { keep: true },
  ...overrides,
});

const input = (
  overrides: Partial<SyncAchievementsInput> = {},
): SyncAchievementsInput => ({
  requestId: REQUEST_ID,
  trigger: "read",
  ...overrides,
});

const ledger = (overrides: Data = {}): Data => ({
  schemaVersion: 1,
  action: "syncAchievements",
  requestId: REQUEST_ID,
  uid: UID,
  input: { trigger: "read" },
  result: { trigger: "read", newIds: ["first_read"] },
  createdAt: NOW.toISOString(),
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
  ): Promise<FirestoreDocument<T> | null> => {
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
  } as unknown as Partial<SyncAchievementsDependencies>;

  return {
    state,
    commits,
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
const sync = (
  harness: Harness,
  request: SyncAchievementsInput = input(),
) =>
  syncAchievements(
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

Deno.test("fresh award는 achievements와 최소 schema1 원장을 한 transaction에 저장한다", async () => {
  const userPath = `users/${UID}`;
  const ledgerPath = `${userPath}/activityActions/${REQUEST_ID}`;
  const original = baseUser({
    currentDay: 30,
    streak: 7,
    score: 100,
    achievements: ["legacy_badge", "score_100", "legacy_badge"],
    memos: { 1: { texts: ["원장에 절대 저장하지 않을 묵상"] } },
  });
  const harness = createHarness({ [userPath]: original });

  const response = await sync(harness, input({ trigger: "memo" }));
  assertEquals(Object.keys(response).sort(), [
    "alreadyCompleted",
    "committed",
    "result",
  ]);
  assertEquals(response, {
    alreadyCompleted: false,
    committed: true,
    result: {
      trigger: "memo",
      newIds: ["first_read", "streak_7", "day_30", "first_memo"],
    },
  });
  assertEquals(harness.commits.length, 1, "expected one atomic commit");
  assertEquals(harness.commits[0].paths, [userPath, ledgerPath]);
  assertEquals(harness.commits[0].masks, [["achievements"], null]);
  assert(Boolean(harness.commits[0].transaction), "transaction missing");

  const storedUser = harness.state.get(userPath);
  assertEquals(storedUser, {
    ...original,
    achievements: [
      "legacy_badge",
      "score_100",
      "first_read",
      "streak_7",
      "day_30",
      "first_memo",
    ],
  });
  const storedLedger = harness.state.get(ledgerPath);
  assertEquals(Object.keys(storedLedger || {}).sort(), [
    "action",
    "createdAt",
    "input",
    "requestId",
    "result",
    "schemaVersion",
    "uid",
  ]);
  assertEquals(storedLedger, {
    schemaVersion: 1,
    action: "syncAchievements",
    requestId: REQUEST_ID,
    uid: UID,
    input: { trigger: "memo" },
    result: {
      trigger: "memo",
      newIds: ["first_read", "streak_7", "day_30", "first_memo"],
    },
    createdAt: NOW.toISOString(),
  });
  const serializedLedger = JSON.stringify(storedLedger);
  for (
    const forbidden of [
      "plain-support-password",
      "민감한 이름",
      "원장에 절대 저장하지 않을 묵상",
      '"currentDay":',
      '"streak":',
      '"score":',
      '"memoCount":',
    ]
  ) {
    assert(!serializedLedger.includes(forbidden), `ledger leaked ${forbidden}`);
  }
});

Deno.test("no-op은 user와 원장을 쓰지 않고 transaction을 rollback한다", async () => {
  const userPath = `users/${UID}`;
  const harness = createHarness({
    [userPath]: baseUser({
      memos: Object.fromEntries(
        Array.from({ length: 50 }, (_, index) => [String(index), "private"]),
      ),
    }),
  });
  const response = await sync(harness, input({ trigger: "read" }));
  assertEquals(response, {
    alreadyCompleted: false,
    committed: false,
    result: { trigger: "read", newIds: [] },
  });
  assertEquals(harness.commits.length, 0, "no-op wrote data");
  assertEquals(harness.rollbackCount, 1, "no-op did not rollback");
  assert(
    !harness.state.has(`${userPath}/activityActions/${REQUEST_ID}`),
    "no-op created ledger",
  );
});

Deno.test("업적 관련 필드가 없는 legacy user는 명시된 기본값으로 계산한다", async () => {
  const harness = createHarness({
    [`users/${UID}`]: { uid: UID, name: "legacy" },
  });
  const readResponse = await sync(harness, input({ trigger: "read" }));
  assertEquals(readResponse, {
    alreadyCompleted: false,
    committed: false,
    result: { trigger: "read", newIds: [] },
  });
  const memoResponse = await sync(harness, input({ trigger: "memo" }));
  assertEquals(memoResponse, {
    alreadyCompleted: false,
    committed: false,
    result: { trigger: "memo", newIds: [] },
  });
  assertEquals(harness.commits.length, 0, "legacy defaults wrote data");
});

Deno.test("memo trigger는 서버 memos map의 key 개수만 사용한다", async () => {
  const userPath = `users/${UID}`;
  const harness = createHarness({
    [userPath]: baseUser({
      memos: Object.fromEntries(
        Array.from({ length: 10 }, (_, index) => [
          String(index),
          { texts: index === 0 ? ["a", "b", "c"] : ["a"] },
        ]),
      ),
    }),
  });
  const response = await sync(harness, input({ trigger: "memo" }));
  assertEquals(response.result.newIds, ["first_memo", "memo_10"]);
});

Deno.test("exact ledger replay는 원래 nonempty 결과를 반환하고 다시 쓰지 않는다", async () => {
  const userPath = `users/${UID}`;
  const ledgerPath = `${userPath}/activityActions/${REQUEST_ID}`;
  const harness = createHarness({
    [userPath]: baseUser(),
    // 읽기 재시작 등으로 현재 achievements가 비어도 stale replay 자체는 유효하다.
    [ledgerPath]: ledger(),
  });
  const response = await sync(harness);
  assertEquals(response, {
    alreadyCompleted: true,
    committed: true,
    result: { trigger: "read", newIds: ["first_read"] },
  });
  assertEquals(harness.commits.length, 0, "replay wrote twice");
  assertEquals(harness.rollbackCount, 1, "replay did not rollback");
});

Deno.test("같은 UUID의 trigger/action/result 충돌과 원장 extra 필드는 fail closed한다", async () => {
  const invalidLedgers: Data[] = [
    ledger({
      input: { trigger: "memo" },
      result: { trigger: "memo", newIds: ["first_memo"] },
    }),
    ledger({ action: "completeRead" }),
    ledger({ uid: "other-user" }),
    ledger({ requestId: "018f5f3e-94c0-7ad2-a12e-4c9df184ba4f" }),
    ledger({ result: { trigger: "read", newIds: [] } }),
    ledger({ result: { trigger: "read", newIds: ["unknown"] } }),
    ledger({
      result: { trigger: "read", newIds: ["first_read", "first_read"] },
    }),
    ledger({
      result: { trigger: "read", newIds: ["score_100", "first_read"] },
    }),
    ledger({ input: { trigger: "read", currentDay: 365 } }),
    ledger({ leakedMemo: "private" }),
    ledger({ createdAt: "not-a-timestamp" }),
    ledger({ createdAt: "0" }),
    ledger({ createdAt: "2026-02-31T03:04:05.000Z" }),
    ledger({ createdAt: "2026-07-16T12:04:05+09:00" }),
    ledger({ createdAt: 123 }),
  ];
  for (const invalidLedger of invalidLedgers) {
    const userPath = `users/${UID}`;
    const harness = createHarness({
      [userPath]: baseUser(),
      [`${userPath}/activityActions/${REQUEST_ID}`]: invalidLedger,
    });
    await expectPlatformError(() => sync(harness), "CONFLICT");
    assertEquals(harness.commits.length, 0, "invalid ledger wrote data");
  }
});

Deno.test("409는 최대 3회 fresh transaction에서 재평가한다", async () => {
  const userPath = `users/${UID}`;
  const retry = createHarness({
    [userPath]: baseUser({ currentDay: 2 }),
  });
  retry.conflictBeforeCommit(1);
  const response = await sync(retry);
  assert(response.committed && !response.alreadyCompleted, "retry failed");
  assertEquals(retry.transactionCount, 2, "did not start fresh transaction");
  assertEquals(retry.commits.length, 1, "retry committed more than once");

  const beginRetry = createHarness({
    [userPath]: baseUser({ currentDay: 2 }),
  });
  beginRetry.conflictAtBegin(1);
  const beginResponse = await sync(beginRetry);
  assert(beginResponse.committed, "begin conflict was not retried");
  assertEquals(beginRetry.transactionCount, 2);

  const exhausted = createHarness({
    [userPath]: baseUser({ currentDay: 2 }),
  });
  exhausted.conflictBeforeCommit(3);
  await expectPlatformError(() => sync(exhausted), "FIRESTORE_WRITE_FAILED");
  assertEquals(exhausted.transactionCount, 3, "retry was not bounded at 3");
  assertEquals(exhausted.commits.length, 0, "failed commits mutated state");
  assert(
    !exhausted.state.has(`${userPath}/activityActions/${REQUEST_ID}`),
    "failed retry left partial ledger",
  );
});

Deno.test("commit 적용 뒤 409도 다음 transaction의 ledger replay로 복구한다", async () => {
  const userPath = `users/${UID}`;
  const harness = createHarness({
    [userPath]: baseUser({ currentDay: 2 }),
  });
  harness.conflictAfterAppliedCommit();
  const response = await sync(harness);
  assertEquals(response, {
    alreadyCompleted: true,
    committed: true,
    result: { trigger: "read", newIds: ["first_read"] },
  });
  assertEquals(harness.transactionCount, 2, "replay transaction missing");
  assertEquals(harness.commits.length, 1, "applied commit repeated");
});

Deno.test("missing, deleted, anonymous, malformed 사용자 상태를 fail closed한다", async () => {
  const missing = createHarness();
  await expectPlatformError(() => sync(missing), "NOT_FOUND");

  const deleted = createHarness({
    [`users/${UID}`]: baseUser({ isDeleted: true }),
  });
  await expectPlatformError(() => sync(deleted), "FORBIDDEN");

  const anonymous = createHarness({ [`users/${UID}`]: baseUser() });
  await expectPlatformError(
    () =>
      syncAchievements(
        SERVICE,
        { uid: UID, anonymous: true },
        input(),
        anonymous.dependencies,
      ),
    "ANONYMOUS_NOT_ALLOWED",
  );
  assertEquals(anonymous.transactionCount, 0, "anonymous opened transaction");

  const malformedValues: Data[] = [
    { isDeleted: null },
    { currentDay: null },
    { currentDay: 0 },
    { currentDay: 366 },
    { streak: "0" },
    { score: -1 },
    { achievements: null },
    { achievements: ["valid", 1] },
    { achievements: ["bad\u0000id"] },
    {
      achievements: Array.from(
        { length: 101 },
        (_, index) => `legacy-${index}`,
      ),
    },
    { memos: null },
    { memos: [] },
  ];
  for (const malformed of malformedValues) {
    const harness = createHarness({
      [`users/${UID}`]: baseUser(malformed),
    });
    await expectPlatformError(() => sync(harness), "CONFLICT");
    assertEquals(harness.commits.length, 0, "malformed user wrote data");
  }
});

Deno.test("서비스 경계도 extra client state와 잘못된 identity/input을 거부한다", async () => {
  const harness = createHarness({ [`users/${UID}`]: baseUser() });
  await expectPlatformError(
    () =>
      syncAchievements(
        SERVICE,
        { uid: UID, anonymous: false },
        { ...input(), score: 1000 } as SyncAchievementsInput,
        harness.dependencies,
      ),
    "BAD_REQUEST",
  );
  await expectPlatformError(
    () =>
      syncAchievements(
        SERVICE,
        { uid: ` ${UID}`, anonymous: false },
        input(),
        harness.dependencies,
      ),
    "BAD_REQUEST",
  );
  assertEquals(
    harness.transactionCount,
    0,
    "invalid request opened transaction",
  );
});

Deno.test("새 업적 union이 100개 한도를 넘으면 기존 unknown ID를 버리지 않고 거부한다", async () => {
  const existing = Array.from({ length: 100 }, (_, index) => `legacy-${index}`);
  const harness = createHarness({
    [`users/${UID}`]: baseUser({ currentDay: 2, achievements: existing }),
  });
  await expectPlatformError(() => sync(harness), "CONFLICT");
  assertEquals(harness.commits.length, 0, "overflow wrote data");
  assertEquals(
    harness.state.get(`users/${UID}`)?.achievements,
    existing,
    "overflow silently cleaned existing IDs",
  );
});
