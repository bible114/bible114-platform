import { PlatformError } from "../_shared/errors.ts";
import {
  decodeFirestoreFields,
  type FirestoreDocument,
  type FirestoreValue,
  type FirestoreWrite,
} from "../_shared/firestore.ts";
import {
  type CompleteReadDependencies,
  type CompleteReadInput,
  completeReadTransaction,
} from "./readCompletionService.ts";

const PROJECT_ID = "test-project";
const SERVICE = { token: "service-token", projectId: PROJECT_ID };
const UID = "user-1";
const REQUEST_ID = "123e4567-e89b-42d3-a456-426614174000";
const TODAY = "Tue Jul 14 2026";
const NOW = new Date("2026-07-14T12:00:00.000Z");
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

const v2Shop = () => ({
  schemaVersion: 2,
  enabled: false,
  departmentSettings: {
    adults: { enabled: true, marketId: "shared" },
  },
  markets: {
    shared: { id: "shared", enabled: false, items: [] },
  },
});

const baseUser = (overrides: Data = {}): Data => ({
  uid: UID,
  role: "member",
  accountType: "member",
  churchId: "base-org",
  departmentId: "adults",
  currentDay: 10,
  readCount: 1,
  readingYear: 2026,
  yearCompletedRounds: 0,
  lifetimeCompletedRounds: 0,
  score: 0,
  talent: 5,
  streak: 0,
  maxStreak: 0,
  lastReadDate: null,
  dailyAdvanceDate: null,
  dailyAdvanceCount: 0,
  recentReadDates: [],
  secretShopUnlocked: false,
  ...overrides,
});

const input = (
  overrides: Partial<CompleteReadInput> = {},
): CompleteReadInput => ({
  requestId: REQUEST_ID,
  cycle: 1,
  day: 10,
  ...overrides,
});

type UpdateWrite = {
  update: { name: string; fields: Record<string, FirestoreValue> };
  updateMask?: { fieldPaths: string[] };
  currentDocument?: { exists?: boolean };
};

type Harness = ReturnType<typeof createHarness>;

const createHarness = (initial: Record<string, Data> = {}) => {
  const state = new Map(
    Object.entries(initial).map(([path, data]) => [path, clone(data)]),
  );
  const readCalls: Array<{ path: string; transaction?: string }> = [];
  const queryCalls: Array<{ limit?: number; transaction?: string }> = [];
  const commits: Array<{ paths: string[]; transaction?: string }> = [];
  let transactionCount = 0;
  let rollbackCount = 0;
  let applyThenConflictOnce = false;
  let beginConflictOnce = false;

  const asDocument = <T>(path: string, data: Data): FirestoreDocument<T> => ({
    name: documentName(path),
    fields: {},
    data: clone(data) as T,
  });

  const begin = async () => {
    if (beginConflictOnce) {
      beginConflictOnce = false;
      throw new PlatformError("FIRESTORE_READ_FAILED", {
        details: { status: 409 },
      });
    }
    return `tx-${++transactionCount}`;
  };
  const read = async <T>(
    _token: string,
    _projectId: string,
    path: string,
    options: { transaction?: string } = {},
  ): Promise<FirestoreDocument<T> | null> => {
    readCalls.push({ path, transaction: options.transaction });
    const data = state.get(path);
    return data ? asDocument<T>(path, data) : null;
  };
  const query = async <T>(
    _token: string,
    _projectId: string,
    collectionId: string,
    field: string,
    value: unknown,
    options: { limit?: number; transaction?: string } = {},
  ): Promise<FirestoreDocument<T>[]> => {
    assert(collectionId === "roster", "unexpected collection group");
    queryCalls.push({ limit: options.limit, transaction: options.transaction });
    const matches = Array.from(state.entries()).flatMap(([path, data]) => {
      const match = /^churches\/([^/]+)\/roster\/([^/]+)$/.exec(path);
      return match && data[field] === value ? [asDocument<T>(path, data)] : [];
    });
    return matches.slice(0, options.limit ?? 100);
  };
  const rollback = async () => {
    rollbackCount += 1;
  };
  const commit = async (
    _token: string,
    _projectId: string,
    writes: FirestoreWrite[],
    options: { transaction?: string } = {},
  ) => {
    const next = new Map(
      Array.from(state.entries()).map(([path, data]) => [
        path,
        clone(data),
      ]),
    );
    const paths: string[] = [];
    for (const rawWrite of writes) {
      const write = rawWrite as UpdateWrite;
      assert(write.update, "only update writes are expected");
      const path = pathFromName(write.update.name);
      paths.push(path);
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
    commits.push({ paths, transaction: options.transaction });
    state.clear();
    next.forEach((data, path) => state.set(path, data));
    if (applyThenConflictOnce) {
      applyThenConflictOnce = false;
      throw new PlatformError("FIRESTORE_WRITE_FAILED", {
        details: { status: 409 },
      });
    }
    return {};
  };

  const dependencies = {
    beginTransaction: begin,
    commitWrites: commit,
    getDocument: read,
    rollbackTransaction: rollback,
    runCollectionGroupQuery: query,
    now: () => new Date(NOW),
    getTodayLegacy: () => TODAY,
  } as unknown as Partial<CompleteReadDependencies>;

  return {
    state,
    readCalls,
    queryCalls,
    commits,
    dependencies,
    get transactionCount() {
      return transactionCount;
    },
    get rollbackCount() {
      return rollbackCount;
    },
    conflictAfterNextAppliedCommit() {
      applyThenConflictOnce = true;
    },
    conflictBeforeNextTransaction() {
      beginConflictOnce = true;
    },
  };
};

const complete = (harness: Harness, request = input()) =>
  completeReadTransaction(
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

Deno.test("첫 읽기는 users·canonical roster·history·ledger·통계를 한 commit에 쓴다", async () => {
  const harness = createHarness({
    [`users/${UID}`]: baseUser(),
    [`churches/base-org/settings/talentShop`]: v2Shop(),
    [`churches/roster-a/roster/${UID}`]: {
      uid: UID,
      departmentId: "adults",
      talent: 7,
    },
    [`churches/roster-a/settings/talentShop`]: v2Shop(),
    [`churches/roster-b/roster/${UID}`]: {
      uid: UID,
      departmentId: "youth",
      talent: 9,
    },
    [`churches/roster-b/settings/talentShop`]: v2Shop(),
    "settings/platformStats": {
      today_date: TODAY,
      readers_today: 4,
      finished_total: 2,
      total_readers: 100,
    },
  });

  const response = await complete(harness);
  assert(response.committed && !response.alreadyCompleted, "not committed");
  assert(response.result.status === "ready", "ready result missing");
  assertEquals(response.state.user, {
    currentDay: 11,
    readCount: 1,
    readingYear: 2026,
    yearCompletedRounds: 0,
    lifetimeCompletedRounds: 0,
    score: 10,
    talent: 16,
    streak: 1,
    maxStreak: 1,
    lastReadDate: TODAY,
    dailyAdvanceDate: TODAY,
    dailyAdvanceCount: 1,
    weeklyReadKey: "Sun Jul 12 2026",
    weeklyReadCount: 1,
    recentReadDates: [TODAY],
    secretShopUnlocked: false,
  }, "fresh user state");
  assertEquals(response.state.rosters, [
    { orgId: "roster-a", talent: 18 },
    { orgId: "roster-b", talent: 9 },
  ], "fresh roster state");
  assert(harness.commits.length === 1, "must use one atomic commit");
  assertEquals(harness.commits[0].paths, [
    `users/${UID}`,
    `churches/roster-a/roster/${UID}`,
    `churches/roster-b/roster/${UID}`,
    `users/${UID}/history/${REQUEST_ID}`,
    `users/${UID}/activityActions/${REQUEST_ID}`,
    "settings/platformStats",
  ], "atomic write paths");
  assert(
    harness.commits[0].transaction === "tx-1",
    "commit did not bind transaction",
  );
  assert(
    harness.readCalls.every((call) => call.transaction === "tx-1") &&
      harness.queryCalls[0]?.transaction === "tx-1" &&
      harness.queryCalls[0]?.limit === 4,
    "fresh reads did not share transaction",
  );
  const rosterAAfterRead = harness.state.get(`churches/roster-a/roster/${UID}`);
  const rosterBAfterRead = harness.state.get(`churches/roster-b/roster/${UID}`);
  assert(
    rosterAAfterRead?.talent === 18 &&
      rosterBAfterRead?.talent === 9 &&
      Array.isArray(rosterAAfterRead?.recentReadDates) &&
      rosterAAfterRead.recentReadDates[0] === TODAY &&
      rosterAAfterRead?.weeklyReadKey === "Sun Jul 12 2026" &&
      rosterAAfterRead?.weeklyReadCount === 1 &&
      Array.isArray(rosterBAfterRead?.recentReadDates) &&
      rosterBAfterRead.recentReadDates[0] === TODAY &&
      rosterBAfterRead?.weeklyReadKey === "Sun Jul 12 2026" &&
      rosterBAfterRead?.weeklyReadCount === 1,
    "per-roster talent routing mismatch",
  );
  assert(
    harness.state.get("settings/platformStats")?.readers_today === 5 &&
      harness.state.get("settings/platformStats")?.total_readers === 100,
    "platform stats merge mismatch",
  );
  assert(
    harness.state.get(`users/${UID}/history/${REQUEST_ID}`)?.day === 10 &&
      harness.state.get(`users/${UID}/activityActions/${REQUEST_ID}`)
          ?.requestId === REQUEST_ID &&
      harness.state.get(`users/${UID}/history/${REQUEST_ID}`)
          ?.readingEpoch === 0 &&
      harness.state.get(`users/${UID}/activityActions/${REQUEST_ID}`)
          ?.readingEpoch === 0,
    "deterministic history or ledger missing",
  );
});

Deno.test("platformStats가 없어도 첫 읽기 transaction이 문서를 안전하게 생성한다", async () => {
  const harness = createHarness({
    [`users/${UID}`]: baseUser(),
    [`churches/base-org/settings/talentShop`]: v2Shop(),
  });

  const response = await complete(harness);
  assert(response.committed, "read was not committed");
  assertEquals(harness.state.get("settings/platformStats"), {
    updatedAt: NOW,
    readers_today: 1,
    today_date: TODAY,
  }, "missing stats document was not created");
});

Deno.test("같은 requestId replay는 입력을 결속하고 통계·history를 중복 기록하지 않는다", async () => {
  const harness = createHarness({
    [`users/${UID}`]: baseUser(),
    [`churches/base-org/settings/talentShop`]: v2Shop(),
    "settings/platformStats": { today_date: TODAY, readers_today: 0 },
  });
  const first = await complete(harness);
  const storedUser = harness.state.get(`users/${UID}`)!;
  storedUser.currentDay = 12;
  storedUser.talent = 99;
  const replay = await complete(harness);

  assert(first.result.status === "ready", "initial result missing");
  assert(replay.alreadyCompleted && replay.committed, "replay not detected");
  assert(replay.result.status === "ready", "stored result missing");
  if (replay.result.status === "ready") {
    assert(replay.result.updateData.currentDay === 11, "ledger result drifted");
  }
  assert(
    replay.state.user.currentDay === 12 && replay.state.user.talent === 99,
    "replay did not return fresh current state",
  );
  assert(harness.commits.length === 1, "replay committed twice");
  assert(
    harness.state.get("settings/platformStats")?.readers_today === 1,
    "replay incremented stats twice",
  );

  await expectPlatformError(
    () => complete(harness, input({ day: 11 })),
    "CONFLICT",
  );
  assert(harness.commits.length === 1, "input collision wrote data");
});

Deno.test("readingEpoch 0의 기존 ledger와 history를 replay 호환한다", async () => {
  const harness = createHarness({
    [`users/${UID}`]: baseUser(),
    [`churches/base-org/settings/talentShop`]: v2Shop(),
    "settings/platformStats": { today_date: TODAY, readers_today: 0 },
  });
  await complete(harness);
  const ledger = harness.state.get(
    `users/${UID}/activityActions/${REQUEST_ID}`,
  )!;
  const history = harness.state.get(`users/${UID}/history/${REQUEST_ID}`)!;
  ledger.schemaVersion = 1;
  delete ledger.readingEpoch;
  delete history.readingEpoch;

  const replay = await complete(harness);

  assert(replay.alreadyCompleted, "legacy epoch-0 replay was rejected");
  assert(harness.commits.length === 1, "legacy replay wrote again");
});

Deno.test("현재 readingEpoch만 읽기를 쓰고 stale 요청과 replay는 무쓰기 거부한다", async () => {
  const current = createHarness({
    [`users/${UID}`]: baseUser({ readingEpoch: 2 }),
    [`churches/base-org/settings/talentShop`]: v2Shop(),
    "settings/platformStats": { today_date: TODAY, readers_today: 0 },
  });
  const response = await complete(current, input({ readingEpoch: 2 }));
  assert(response.committed, "current epoch read was rejected");
  assert(
    current.state.get(`users/${UID}/activityActions/${REQUEST_ID}`)
      ?.readingEpoch === 2,
    "current epoch was not bound to ledger",
  );

  const staleFresh = createHarness({
    [`users/${UID}`]: baseUser({ readingEpoch: 1 }),
    [`churches/base-org/settings/talentShop`]: v2Shop(),
  });
  await expectPlatformError(() => complete(staleFresh), "CONFLICT");
  assert(staleFresh.commits.length === 0, "stale fresh request wrote data");

  const staleReplay = createHarness({
    [`users/${UID}`]: baseUser(),
    [`churches/base-org/settings/talentShop`]: v2Shop(),
    "settings/platformStats": { today_date: TODAY, readers_today: 0 },
  });
  await complete(staleReplay);
  staleReplay.state.get(`users/${UID}`)!.readingEpoch = 1;
  await expectPlatformError(() => complete(staleReplay), "CONFLICT");
  assert(staleReplay.commits.length === 1, "stale replay repaired or rewrote");
});

Deno.test("동일 requestId 경쟁 commit 뒤에는 bounded retry로 ledger replay를 반환한다", async () => {
  const harness = createHarness({
    [`users/${UID}`]: baseUser(),
    [`churches/base-org/settings/talentShop`]: v2Shop(),
    "settings/platformStats": { today_date: TODAY, readers_today: 0 },
  });
  harness.conflictAfterNextAppliedCommit();
  const response = await complete(harness);
  assert(response.alreadyCompleted, "contention did not become replay");
  assert(harness.transactionCount === 2, "contention retry count mismatch");
  assert(harness.commits.length === 1, "contention duplicated commit");
  assert(
    harness.state.get("settings/platformStats")?.readers_today === 1,
    "contention duplicated first-read stats",
  );
});

Deno.test("transaction 시작의 read 409도 bounded retry한다", async () => {
  const harness = createHarness({
    [`users/${UID}`]: baseUser(),
    [`churches/base-org/settings/talentShop`]: v2Shop(),
    "settings/platformStats": { today_date: TODAY, readers_today: 0 },
  });
  harness.conflictBeforeNextTransaction();

  const response = await complete(harness);

  assert(response.result.status === "ready", "begin retry result mismatch");
  assert(harness.transactionCount === 1, "fresh transaction was not opened");
  assert(harness.commits.length === 1, "begin retry committed more than once");
  assert(
    harness.state.get("settings/platformStats")?.readers_today === 1,
    "begin retry duplicated first-read stats",
  );
});

Deno.test("같은 날 추가 읽기는 진행·history만 쓰고 platformStats는 쓰지 않는다", async () => {
  const harness = createHarness({
    [`users/${UID}`]: baseUser({
      score: 20,
      talent: 5,
      streak: 2,
      lastReadDate: TODAY,
      dailyAdvanceDate: TODAY,
      dailyAdvanceCount: 1,
    }),
    [`churches/base-org/settings/talentShop`]: v2Shop(),
    "settings/platformStats": { today_date: TODAY, readers_today: 8 },
  });
  const response = await complete(harness);
  assert(response.result.status === "ready", "second read not ready");
  if (response.result.status === "ready") {
    assert(
      response.result.summary.scoreEarned === 0 &&
        response.result.summary.talentEarned === 0,
      "second read received a reward",
    );
  }
  assert(
    !harness.commits[0].paths.includes("settings/platformStats") &&
      harness.state.get("settings/platformStats")?.readers_today === 8,
    "second read changed platform stats",
  );
});

Deno.test("같은 날 추가 읽기로 365일을 마치면 독자 수는 두고 완독만 한 번 집계한다", async () => {
  const harness = createHarness({
    [`users/${UID}`]: baseUser({
      currentDay: 365,
      score: 20,
      talent: 5,
      streak: 2,
      lastReadDate: TODAY,
      dailyAdvanceDate: TODAY,
      dailyAdvanceCount: 1,
    }),
    [`churches/base-org/settings/talentShop`]: v2Shop(),
    "settings/platformStats": {
      today_date: TODAY,
      readers_today: 8,
      finished_total: 2,
    },
  });
  const request = input({ day: 365 });
  const response = await complete(harness, request);
  assert(response.result.status === "ready", "completion read not ready");
  if (response.result.status === "ready") {
    assert(
      response.result.summary.scoreEarned === 0 &&
        response.result.summary.completedRound,
      "same-day completion summary mismatch",
    );
  }
  const stats = harness.state.get("settings/platformStats")!;
  assert(
    stats.readers_today === 8 && stats.today_date === TODAY &&
      stats.finished_total === 3,
    "same-day completion changed readers or missed finished total",
  );
  const statsWrite = harness.commits[0].paths.filter((path) =>
    path === "settings/platformStats"
  );
  assert(
    statsWrite.length === 1,
    "completion stats write was not exactly once",
  );

  const replay = await complete(harness, request);
  assert(replay.alreadyCompleted, "completion replay not detected");
  assert(
    harness.state.get("settings/platformStats")?.finished_total === 3 &&
      harness.commits.length === 1,
    "completion replay duplicated stats",
  );
});

Deno.test("position mismatch는 ledger 없이 안전하게 rollback한다", async () => {
  const mismatch = createHarness({
    [`users/${UID}`]: baseUser({ currentDay: 11 }),
    [`churches/base-org/settings/talentShop`]: v2Shop(),
  });
  const mismatchResponse = await complete(mismatch);
  assert(
    mismatchResponse.result.status === "positionMismatch" &&
      !mismatchResponse.committed,
    "position mismatch committed",
  );
  assert(mismatch.commits.length === 0 && mismatch.rollbackCount === 1);
});

Deno.test("익명·unsafe request와 저장 정수 overflow를 쓰기 전에 거부한다", async () => {
  const harness = createHarness({
    [`users/${UID}`]: baseUser(),
    [`churches/base-org/settings/talentShop`]: v2Shop(),
  });
  await expectPlatformError(
    () =>
      completeReadTransaction(
        SERVICE,
        { uid: UID, anonymous: true },
        input(),
        harness.dependencies,
      ),
    "ANONYMOUS_NOT_ALLOWED",
  );
  await expectPlatformError(
    () => complete(harness, input({ cycle: Number.MAX_SAFE_INTEGER + 1 })),
    "BAD_REQUEST",
  );
  await expectPlatformError(
    () => complete(harness, input({ readingEpoch: -1 })),
    "BAD_REQUEST",
  );
  assert(harness.transactionCount === 0, "invalid request opened transaction");

  harness.state.set(
    `users/${UID}`,
    baseUser({
      score: Number.MAX_SAFE_INTEGER,
    }),
  );
  await expectPlatformError(() => complete(harness), "CONFLICT");
  assert(harness.commits.length === 0, "overflow committed");

  harness.state.set(`users/${UID}`, baseUser({ readingEpoch: "1" }));
  await expectPlatformError(() => complete(harness), "CONFLICT");
  assert(harness.commits.length === 0, "invalid reading epoch committed");
});

Deno.test("4번째 또는 비정규 roster는 어떤 지갑도 쓰기 전에 거부한다", async () => {
  const initial: Record<string, Data> = {
    [`users/${UID}`]: baseUser(),
    [`churches/base-org/settings/talentShop`]: v2Shop(),
  };
  for (const orgId of ["a", "b", "c", "d"]) {
    initial[`churches/${orgId}/roster/${UID}`] = {
      uid: UID,
      departmentId: "adults",
      talent: 1,
    };
  }
  const harness = createHarness(initial);
  await expectPlatformError(() => complete(harness), "CONFLICT");
  assert(harness.commits.length === 0, "too many rosters committed");

  const malformed = createHarness({
    [`users/${UID}`]: baseUser(),
    "churches/a/roster/other": { uid: UID, talent: 1 },
  });
  await expectPlatformError(() => complete(malformed), "CONFLICT");
  assert(malformed.commits.length === 0, "foreign roster committed");
});

Deno.test("비정규 기본 공동체와 기본·roster 중복 지갑은 fail-closed한다", async () => {
  const nonCanonical = createHarness({
    [`users/${UID}`]: baseUser({ churchId: " base-org" }),
  });
  await expectPlatformError(() => complete(nonCanonical), "CONFLICT");
  assert(nonCanonical.commits.length === 0, "non-canonical org committed");

  const duplicate = createHarness({
    [`users/${UID}`]: baseUser(),
    [`churches/base-org/roster/${UID}`]: {
      uid: UID,
      departmentId: "adults",
      talent: 1,
    },
  });
  await expectPlatformError(() => complete(duplicate), "CONFLICT");
  assert(duplicate.commits.length === 0, "duplicate wallet committed");

  const conflictingBase = createHarness({
    [`users/${UID}`]: baseUser({ baseChurchId: "other-org" }),
  });
  await expectPlatformError(() => complete(conflictingBase), "CONFLICT");
  assert(
    conflictingBase.commits.length === 0,
    "conflicting base org committed",
  );

  const oversizedOrgId = "x".repeat(129);
  const malformedRoster = createHarness({
    [`users/${UID}`]: baseUser(),
    [`churches/${oversizedOrgId}/roster/${UID}`]: {
      uid: UID,
      departmentId: "adults",
      talent: 1,
    },
  });
  await expectPlatformError(() => complete(malformedRoster), "CONFLICT");
  assert(malformedRoster.commits.length === 0, "unsafe roster org committed");
});

Deno.test("손상된 읽기 날짜는 첫 읽기 보상으로 재해석하지 않는다", async () => {
  for (
    const overrides of [
      { lastReadDate: "garbage" },
      { lastReadDate: "2026-07-14" },
      { lastReadDate: "Wed Jul 15 2026" },
      { dailyAdvanceDate: "garbage" },
      { recentReadDates: ["garbage"] },
    ]
  ) {
    const harness = createHarness({
      [`users/${UID}`]: baseUser(overrides),
    });
    await expectPlatformError(() => complete(harness), "CONFLICT");
    assert(harness.commits.length === 0, "corrupt date granted a reward");
  }
});

Deno.test("손상·미래 platformStats 날짜는 독자 수를 1로 덮지 않는다", async () => {
  for (const todayDate of ["garbage", "Wed Jul 15 2026", 123]) {
    const harness = createHarness({
      [`users/${UID}`]: baseUser(),
      [`churches/base-org/settings/talentShop`]: v2Shop(),
      "settings/platformStats": { today_date: todayDate, readers_today: 99 },
    });
    await expectPlatformError(() => complete(harness), "CONFLICT");
    assert(harness.commits.length === 0, "corrupt stats date committed");
    assert(
      harness.state.get("settings/platformStats")?.readers_today === 99,
      "corrupt stats date reset readers",
    );
  }
});

Deno.test("읽기 보상은 공통 달란트 잔액 상한을 넘지 않는다", async () => {
  const userAtLimit = createHarness({
    [`users/${UID}`]: baseUser({ talent: 1_000_000_000 }),
    [`churches/base-org/settings/talentShop`]: v2Shop(),
  });
  await expectPlatformError(() => complete(userAtLimit), "CONFLICT");
  assert(userAtLimit.commits.length === 0, "user talent limit overflowed");

  const rosterAtLimit = createHarness({
    [`users/${UID}`]: baseUser({ accountType: "personal", churchId: null }),
    [`churches/roster-a/roster/${UID}`]: {
      uid: UID,
      departmentId: "adults",
      talent: 1_000_000_000,
    },
    [`churches/roster-a/settings/talentShop`]: v2Shop(),
  });
  await expectPlatformError(() => complete(rosterAtLimit), "CONFLICT");
  assert(rosterAtLimit.commits.length === 0, "roster talent limit overflowed");
});
