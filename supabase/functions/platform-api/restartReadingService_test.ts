import { PlatformError } from "../_shared/errors.ts";
import {
  decodeFirestoreFields,
  type FirestoreDocument,
  type FirestoreValue,
  type FirestoreWrite,
} from "../_shared/firestore.ts";
import {
  restartReading,
  type RestartReadingDependencies,
  type RestartReadingInput,
} from "./restartReadingService.ts";

const PROJECT_ID = "test-project";
const SERVICE = { token: "service-token", projectId: PROJECT_ID };
const UID = "user-1";
const REQUEST_ID = "123e4567-e89b-42d3-a456-426614174000";
const TODAY = "Tue Jul 14 2026";
const YESTERDAY = "Mon Jul 13 2026";
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

const baseUser = (overrides: Data = {}): Data => ({
  uid: UID,
  name: "민감한 이름",
  password: "plain-support-password",
  currentDay: 10,
  readCount: 2,
  readingEpoch: 4,
  score: 120,
  talent: 99,
  streak: 8,
  maxStreak: 12,
  startDate: "Wed Jul 01 2026",
  lastReadDate: TODAY,
  dailyAdvanceDate: TODAY,
  dailyAdvanceCount: 2,
  recentReadDates: [YESTERDAY, TODAY],
  achievements: ["first_read", "streak_7"],
  dayOffset: 17,
  secretShopUnlocked: true,
  quizDate: TODAY,
  quizAttempts: 1,
  quizSolved: true,
  quizSkipped: false,
  quizKey: "quiz-10",
  quizProgress: {
    e4_r2_d10: {
      attempts: 1,
      solved: true,
      skipped: false,
      quizKey: "quiz-10",
      reward: 10,
      updatedDate: TODAY,
    },
  },
  quizRewardDate: TODAY,
  quizRewardAmount: 10,
  memos: { 10: "보존할 묵상" },
  ...overrides,
});

const input = (
  overrides: Partial<RestartReadingInput> = {},
): RestartReadingInput => ({
  requestId: REQUEST_ID,
  cycle: 2,
  day: 10,
  readingEpoch: 4,
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
  const queries: Array<{
    collectionId: string;
    field: string;
    value: unknown;
    limit?: number;
    transaction?: string;
  }> = [];
  const commits: Array<{ paths: string[]; transaction?: string }> = [];
  let transactionCount = 0;
  let rollbackCount = 0;
  let applyThenConflictOnce = false;
  let commitConflictsBeforeApply = 0;

  const asDocument = <T>(path: string, data: Data): FirestoreDocument<T> => ({
    name: documentName(path),
    fields: {},
    data: clone(data) as T,
  });

  const begin = () => Promise.resolve(`tx-${++transactionCount}`);
  const read = <T>(
    _token: string,
    _projectId: string,
    path: string,
  ): Promise<FirestoreDocument<T> | null> => {
    const data = state.get(path);
    return Promise.resolve(data ? asDocument<T>(path, data) : null);
  };
  const query = <T>(
    _token: string,
    _projectId: string,
    collectionId: string,
    field: string,
    value: unknown,
    options: { limit?: number; transaction?: string } = {},
  ): Promise<FirestoreDocument<T>[]> => {
    queries.push({ collectionId, field, value, ...options });
    return Promise.resolve(
      Array.from(state.entries()).flatMap(([path, data]) => {
        const isRoster = /(?:^|\/)roster\/[^/]+$/.test(path);
        return isRoster && data[field] === value
          ? [asDocument<T>(path, data)]
          : [];
      }).slice(0, options.limit ?? 100),
    );
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
    return Promise.resolve({});
  };

  const dependencies = {
    beginTransaction: begin,
    commitWrites: commit,
    getDocument: read,
    rollbackTransaction: rollback,
    runCollectionGroupQuery: query,
    now: () => new Date(NOW),
    getTodayLegacy: () => TODAY,
  } as unknown as Partial<RestartReadingDependencies>;

  return {
    state,
    queries,
    commits,
    dependencies,
    get transactionCount() {
      return transactionCount;
    },
    get rollbackCount() {
      return rollbackCount;
    },
    conflictAfterAppliedCommit() {
      applyThenConflictOnce = true;
    },
    conflictBeforeCommit(count: number) {
      commitConflictsBeforeApply = count;
    },
  };
};

type Harness = ReturnType<typeof createHarness>;
const restart = (harness: Harness, request = input()) =>
  restartReading(
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

Deno.test("재시작은 user·모든 canonical roster·원장을 한 transaction에서 갱신한다", async () => {
  const harness = createHarness({
    [`users/${UID}`]: baseUser(),
    [`churches/org-a/roster/${UID}`]: {
      uid: UID,
      currentDay: 9,
      readCount: 2,
      score: 110,
      talent: 7,
      streak: 7,
      lastReadDate: YESTERDAY,
      privateNote: "응답 금지",
    },
    [`churches/org-b/roster/${UID}`]: {
      uid: UID,
      currentDay: 10,
      readCount: 2,
      score: 120,
      talent: 9,
      streak: 8,
      lastReadDate: TODAY,
    },
  });

  const response = await restart(harness);
  assert(response.committed && !response.alreadyCompleted, "not committed");
  assertEquals(response.result, {
    status: "restarted",
    previous: { cycle: 2, day: 10, readingEpoch: 4 },
    next: { cycle: 2, day: 1, readingEpoch: 5 },
  });
  assertEquals(response.state.user, {
    currentDay: 1,
    readCount: 2,
    readingEpoch: 5,
    score: 0,
    talent: 99,
    streak: 0,
    maxStreak: 12,
    startDate: TODAY,
    lastReadDate: null,
    dailyAdvanceDate: TODAY,
    dailyAdvanceCount: 2,
    recentReadDates: [YESTERDAY, TODAY],
    achievements: [],
    dayOffset: 0,
    secretShopUnlocked: true,
    quizDate: null,
    quizAttempts: 0,
    quizSolved: false,
    quizSkipped: false,
    quizKey: null,
    quizRewardDate: TODAY,
    quizRewardAmount: 10,
  });
  assertEquals(response.state.rosters, [
    {
      orgId: "org-a",
      currentDay: 1,
      readCount: 2,
      score: 0,
      streak: 0,
      lastReadDate: null,
      talent: 7,
    },
    {
      orgId: "org-b",
      currentDay: 1,
      readCount: 2,
      score: 0,
      streak: 0,
      lastReadDate: null,
      talent: 9,
    },
  ]);
  assertEquals(harness.commits.length, 1, "must use one commit");
  assertEquals(harness.commits[0].paths, [
    `users/${UID}`,
    `churches/org-a/roster/${UID}`,
    `churches/org-b/roster/${UID}`,
    `users/${UID}/activityActions/${REQUEST_ID}`,
  ]);
  assert(
    harness.queries[0].limit === 4 &&
      harness.queries[0].transaction === "tx-1",
    "canonical roster query was not bounded and transactional",
  );
  assert(
    !harness.commits[0].paths.some((path) => path.includes("/history/")),
    "restart must not create a reading history row",
  );

  const stored = harness.state.get(`users/${UID}`)!;
  assert(stored.readCount === 2, "readCount must be preserved");
  assert(stored.talent === 99, "user talent changed");
  assert(stored.maxStreak === 12, "max streak changed");
  assertEquals(stored.recentReadDates, [YESTERDAY, TODAY]);
  assert(stored.dailyAdvanceDate === TODAY && stored.dailyAdvanceCount === 2);
  assert(stored.quizRewardDate === TODAY && stored.quizRewardAmount === 10);
  assertEquals(stored.memos, { 10: "보존할 묵상" });
  assertEquals(stored.quizProgress, baseUser().quizProgress);
  const publicJson = JSON.stringify(response);
  for (
    const secret of [
      "민감한 이름",
      "plain-support-password",
      "보존할 묵상",
      "quizProgress",
      UID,
    ]
  ) {
    assert(!publicJson.includes(secret), `private field leaked: ${secret}`);
  }
});

Deno.test("stale 위치나 epoch는 무쓰기 positionMismatch와 최신 상태를 반환한다", async () => {
  const harness = createHarness({ [`users/${UID}`]: baseUser() });
  const response = await restart(harness, input({ readingEpoch: 3 }));
  assert(!response.committed && !response.alreadyCompleted);
  assertEquals(response.result, {
    status: "positionMismatch",
    expected: { cycle: 2, day: 10, readingEpoch: 4 },
    received: { cycle: 2, day: 10, readingEpoch: 3 },
  });
  assert(response.state.user.readingEpoch === 4, "fresh epoch missing");
  assertEquals(harness.commits.length, 0, "stale request wrote data");
  assert(harness.rollbackCount === 1, "stale transaction not rolled back");
});

Deno.test("동일 UUID replay는 재초기화 없이 저장 결과와 최신 상태를 반환한다", async () => {
  const harness = createHarness({ [`users/${UID}`]: baseUser() });
  const first = await restart(harness);
  const latest = harness.state.get(`users/${UID}`)!;
  latest.currentDay = 2;
  latest.score = 10;
  latest.streak = 1;
  latest.lastReadDate = TODAY;
  harness.state.set(`users/${UID}`, latest);

  const replay = await restart(harness);
  assert(replay.alreadyCompleted && replay.committed, "not replayed");
  assertEquals(replay.result, first.result, "immutable result changed");
  assert(replay.calendarDate === first.calendarDate, "ledger date changed");
  assert(
    replay.state.user.currentDay === 2 && replay.state.user.score === 10 &&
      replay.state.user.readingEpoch === 5,
    "latest state not returned",
  );
  assertEquals(harness.commits.length, 1, "replay wrote again");
});

Deno.test("같은 UUID의 action/input/result 충돌은 fail closed 한다", async () => {
  const harness = createHarness({
    [`users/${UID}`]: baseUser(),
    [`users/${UID}/activityActions/${REQUEST_ID}`]: {
      schemaVersion: 1,
      action: "restartReading",
      requestId: REQUEST_ID,
      uid: UID,
      input: { cycle: 2, day: 10, readingEpoch: 3 },
      calendarDate: TODAY,
      result: {
        status: "restarted",
        previous: { cycle: 2, day: 10, readingEpoch: 3 },
        next: { cycle: 2, day: 1, readingEpoch: 4 },
      },
      createdAt: NOW.toISOString(),
    },
  });
  await expectPlatformError(() => restart(harness), "CONFLICT");
  assertEquals(harness.commits.length, 0);

  const extraResultHarness = createHarness({
    [`users/${UID}`]: baseUser(),
    [`users/${UID}/activityActions/${REQUEST_ID}`]: {
      schemaVersion: 1,
      action: "restartReading",
      requestId: REQUEST_ID,
      uid: UID,
      input: { cycle: 2, day: 10, readingEpoch: 4 },
      calendarDate: TODAY,
      result: {
        status: "restarted",
        previous: { cycle: 2, day: 10, readingEpoch: 4 },
        next: { cycle: 2, day: 1, readingEpoch: 5 },
        forged: true,
      },
      createdAt: NOW.toISOString(),
    },
  });
  await expectPlatformError(() => restart(extraResultHarness), "CONFLICT");
});

Deno.test("canonical roster 경로·uid·최대 3개를 엄격히 검증한다", async () => {
  const badPath = createHarness({
    [`users/${UID}`]: baseUser(),
    [`organizations/org-a/teams/t1/roster/${UID}`]: {
      uid: UID,
      talent: 5,
    },
  });
  await expectPlatformError(() => restart(badPath), "CONFLICT");
  assertEquals(badPath.commits.length, 0);

  const wrongUid = createHarness({
    [`users/${UID}`]: baseUser(),
    [`churches/org-a/roster/${UID}`]: {
      uid: "another-user",
      talent: 5,
    },
  });
  // Query semantics filter the wrong uid out, so explicitly use a canonical path
  // whose stored uid matches the filter but whose document id does not.
  wrongUid.state.set("churches/org-a/roster/another-doc", {
    uid: UID,
    talent: 5,
  });
  await expectPlatformError(() => restart(wrongUid), "CONFLICT");

  const tooMany = createHarness({ [`users/${UID}`]: baseUser() });
  for (const orgId of ["a", "b", "c", "d"]) {
    tooMany.state.set(`churches/${orgId}/roster/${UID}`, {
      uid: UID,
      talent: 1,
    });
  }
  await expectPlatformError(() => restart(tooMany), "CONFLICT");
  assertEquals(tooMany.commits.length, 0);
});

Deno.test("commit 응답 유실 경합은 ledger replay로 수렴하고 중복 초기화하지 않는다", async () => {
  const harness = createHarness({ [`users/${UID}`]: baseUser() });
  harness.conflictAfterAppliedCommit();
  const response = await restart(harness);
  assert(
    response.alreadyCompleted && response.committed,
    "retry did not replay",
  );
  assert(harness.transactionCount === 2, "bounded retry not used");
  assertEquals(harness.commits.length, 1, "restart was committed twice");
  assert(harness.state.get(`users/${UID}`)?.readingEpoch === 5);
});

Deno.test("지속되는 409는 3회 후 종료하며 부분 쓰기를 남기지 않는다", async () => {
  const initial = baseUser();
  const harness = createHarness({ [`users/${UID}`]: initial });
  harness.conflictBeforeCommit(3);
  await expectPlatformError(() => restart(harness), "FIRESTORE_WRITE_FAILED");
  assert(
    harness.transactionCount === 3,
    "retry count must be bounded at three",
  );
  assertEquals(
    harness.state.get(`users/${UID}`),
    initial,
    "user partially changed",
  );
  assert(
    !harness.state.has(`users/${UID}/activityActions/${REQUEST_ID}`),
    "ledger partially created",
  );
  assertEquals(harness.commits.length, 0);
});

Deno.test("익명 사용자와 삭제 사용자는 재시작할 수 없다", async () => {
  const harness = createHarness({ [`users/${UID}`]: baseUser() });
  await expectPlatformError(
    () =>
      restartReading(
        SERVICE,
        { uid: UID, anonymous: true },
        input(),
        harness.dependencies,
      ),
    "ANONYMOUS_NOT_ALLOWED",
  );
  const deleted = createHarness({
    [`users/${UID}`]: baseUser({ isDeleted: true }),
  });
  await expectPlatformError(() => restart(deleted), "FORBIDDEN");
});

Deno.test("보존 날짜의 미래값과 불가능한 횟수·streak 조합을 거부한다", async () => {
  const future = "Wed Jul 15 2026";
  for (
    const overrides of [
      { lastReadDate: future },
      { dailyAdvanceDate: future },
      { recentReadDates: [future] },
      { quizDate: future },
      { quizRewardDate: future },
      {
        lastReadDate: null,
        dailyAdvanceDate: null,
        dailyAdvanceCount: 1,
      },
      { streak: 9, maxStreak: 8 },
    ]
  ) {
    const harness = createHarness({
      [`users/${UID}`]: baseUser(overrides),
    });
    await expectPlatformError(() => restart(harness), "CONFLICT");
    assertEquals(harness.commits.length, 0, "invalid state was written");
  }
});

Deno.test("recentReadDates는 legacy·ISO·혼합 저장 날짜를 원문 그대로 보존한다", async () => {
  const cases = [
    [YESTERDAY, TODAY],
    ["2026-07-13", "2026-07-14T03:00:00.000Z"],
    [YESTERDAY, "2026-07-14"],
  ];
  for (const recentReadDates of cases) {
    const harness = createHarness({
      [`users/${UID}`]: baseUser({ recentReadDates }),
    });
    const response = await restart(harness);
    assertEquals(response.state.user.recentReadDates, recentReadDates);
    assertEquals(
      harness.state.get(`users/${UID}`)?.recentReadDates,
      recentReadDates,
    );
  }
});

Deno.test("recentReadDates의 미래 ISO와 손상된 혼합 배열은 fail closed 한다", async () => {
  for (
    const recentReadDates of [
      ["2026-07-15"],
      ["2026-07-15T00:00:00.000Z"],
      [YESTERDAY, "2026-02-30"],
      [YESTERDAY, "2026-07-14Tinvalid"],
      [YESTERDAY, 20260714],
    ]
  ) {
    const harness = createHarness({
      [`users/${UID}`]: baseUser({ recentReadDates }),
    });
    await expectPlatformError(() => restart(harness), "CONFLICT");
    assertEquals(harness.commits.length, 0, "invalid recent date was written");
  }
});

Deno.test("일일·마지막 읽기·퀴즈 날짜는 ISO를 허용하지 않는다", async () => {
  for (
    const overrides of [
      { lastReadDate: "2026-07-14" },
      { dailyAdvanceDate: "2026-07-14" },
      { quizDate: "2026-07-14" },
      { quizRewardDate: "2026-07-14", quizRewardAmount: 10 },
    ]
  ) {
    const harness = createHarness({
      [`users/${UID}`]: baseUser(overrides),
    });
    await expectPlatformError(() => restart(harness), "CONFLICT");
    assertEquals(
      harness.commits.length,
      0,
      "non-legacy guard date was written",
    );
  }
});

Deno.test("legacy 횟수만 있는 문서는 lastReadDate로 일일 표식을 보수적으로 복구한다", async () => {
  const harness = createHarness({
    [`users/${UID}`]: baseUser({
      lastReadDate: YESTERDAY,
      dailyAdvanceDate: undefined,
      dailyAdvanceCount: 1,
    }),
  });
  const response = await restart(harness);
  assert(response.committed, "legacy marker was not repairable");
  assert(response.state.user.lastReadDate === null);
  assert(response.state.user.dailyAdvanceDate === YESTERDAY);
  assert(response.state.user.dailyAdvanceCount === 1);
  const stored = harness.state.get(`users/${UID}`)!;
  assert(stored.dailyAdvanceDate === YESTERDAY, "marker repair was not saved");
});

Deno.test("오늘 lastReadDate만 있는 legacy 문서는 최소 1회 guard를 저장한다", async () => {
  for (const dailyAdvanceCount of [0, undefined]) {
    const harness = createHarness({
      [`users/${UID}`]: baseUser({
        lastReadDate: TODAY,
        dailyAdvanceDate: undefined,
        dailyAdvanceCount,
      }),
    });
    const response = await restart(harness);
    assert(response.state.user.lastReadDate === null);
    assert(response.state.user.dailyAdvanceDate === TODAY);
    assert(response.state.user.dailyAdvanceCount === 1);
    const stored = harness.state.get(`users/${UID}`)!;
    assert(stored.dailyAdvanceDate === TODAY);
    assert(stored.dailyAdvanceCount === 1);
    const replay = await restart(harness);
    assert(replay.alreadyCompleted && replay.committed);
    assert(replay.state.user.dailyAdvanceDate === TODAY);
    assert(replay.state.user.dailyAdvanceCount === 1);
    assertEquals(harness.commits.length, 1, "replay rewrote daily guard");
  }
});

Deno.test("더 최신 lastReadDate는 오래된 daily guard를 해당 날짜 최소 1회로 승격한다", async () => {
  for (const dailyAdvanceCount of [0, 3]) {
    const harness = createHarness({
      [`users/${UID}`]: baseUser({
        lastReadDate: TODAY,
        dailyAdvanceDate: YESTERDAY,
        dailyAdvanceCount,
      }),
    });
    const response = await restart(harness);
    assert(response.state.user.lastReadDate === null);
    assert(response.state.user.dailyAdvanceDate === TODAY);
    assert(response.state.user.dailyAdvanceCount === 1);
    const stored = harness.state.get(`users/${UID}`)!;
    assert(stored.dailyAdvanceDate === TODAY);
    assert(stored.dailyAdvanceCount === 1);
  }
});

Deno.test("명시 dailyAdvanceDate와 count 0은 유효한 guard로 보존한다", async () => {
  const harness = createHarness({
    [`users/${UID}`]: baseUser({
      lastReadDate: null,
      dailyAdvanceDate: TODAY,
      dailyAdvanceCount: 0,
    }),
  });
  const response = await restart(harness);
  assert(response.committed);
  assert(response.state.user.dailyAdvanceDate === TODAY);
  assert(response.state.user.dailyAdvanceCount === 0);
  const stored = harness.state.get(`users/${UID}`)!;
  assert(stored.dailyAdvanceDate === TODAY && stored.dailyAdvanceCount === 0);
});

Deno.test("같거나 더 최신인 정상 daily guard의 날짜와 count는 그대로 보존한다", async () => {
  const harness = createHarness({
    [`users/${UID}`]: baseUser({
      lastReadDate: YESTERDAY,
      dailyAdvanceDate: TODAY,
      dailyAdvanceCount: 2,
    }),
  });
  const response = await restart(harness);
  assert(response.state.user.dailyAdvanceDate === TODAY);
  assert(response.state.user.dailyAdvanceCount === 2);
  const stored = harness.state.get(`users/${UID}`)!;
  assert(stored.dailyAdvanceDate === TODAY && stored.dailyAdvanceCount === 2);
});

Deno.test("날짜 근거 없는 양수 daily count는 fail closed 한다", async () => {
  const harness = createHarness({
    [`users/${UID}`]: baseUser({
      lastReadDate: null,
      dailyAdvanceDate: null,
      dailyAdvanceCount: 1,
    }),
  });
  await expectPlatformError(() => restart(harness), "CONFLICT");
  assertEquals(harness.commits.length, 0);
});

Deno.test("과거 날짜를 포함한 legacy 퀴즈 완료는 guard로 복구되고 replay에도 보존된다", async () => {
  for (const quizDate of [TODAY, YESTERDAY]) {
    for (const [quizAttempts, expectedReward] of [[1, 10], [2, 5]]) {
      const harness = createHarness({
        [`users/${UID}`]: baseUser({
          quizDate,
          quizAttempts,
          quizSolved: true,
          quizSkipped: false,
          quizRewardDate: null,
          quizRewardAmount: 0,
        }),
      });
      const first = await restart(harness);
      assert(first.state.user.quizDate === null);
      assert(first.state.user.quizAttempts === 0);
      assert(!first.state.user.quizSolved && !first.state.user.quizSkipped);
      assert(first.state.user.quizRewardDate === quizDate);
      assert(first.state.user.quizRewardAmount === expectedReward);
      const stored = harness.state.get(`users/${UID}`)!;
      assert(stored.quizRewardDate === quizDate);
      assert(stored.quizRewardAmount === expectedReward);

      const replay = await restart(harness);
      assert(replay.alreadyCompleted && replay.committed);
      assert(replay.state.user.quizRewardDate === quizDate);
      assert(replay.state.user.quizRewardAmount === expectedReward);
      assertEquals(
        harness.commits.length,
        1,
        "replay rewrote recovered guard",
      );
    }
  }
});

Deno.test("더 최신 legacy 퀴즈 완료는 오래된 reward guard를 승격한다", async () => {
  const harness = createHarness({
    [`users/${UID}`]: baseUser({
      quizDate: TODAY,
      quizAttempts: 1,
      quizSolved: true,
      quizRewardDate: YESTERDAY,
      quizRewardAmount: 5,
    }),
  });
  const response = await restart(harness);
  assert(response.state.user.quizRewardDate === TODAY);
  assert(response.state.user.quizRewardAmount === 10);
  const stored = harness.state.get(`users/${UID}`)!;
  assert(stored.quizRewardDate === TODAY && stored.quizRewardAmount === 10);
});

Deno.test("시도 횟수 누락·0인 solved legacy는 기존 최대 보상 10을 보수적 guard로 쓴다", async () => {
  for (const quizAttempts of [undefined, 0]) {
    const harness = createHarness({
      [`users/${UID}`]: baseUser({
        quizDate: TODAY,
        quizAttempts,
        quizSolved: true,
        quizRewardDate: null,
        quizRewardAmount: 0,
      }),
    });
    const response = await restart(harness);
    assert(response.state.user.quizDate === null);
    assert(response.state.user.quizAttempts === 0);
    assert(response.state.user.quizRewardDate === TODAY);
    assert(response.state.user.quizRewardAmount === 10);
    const stored = harness.state.get(`users/${UID}`)!;
    assert(stored.quizRewardDate === TODAY);
    assert(stored.quizRewardAmount === 10);
  }
});

Deno.test("더 최신 정상 reward guard는 과거 legacy 퀴즈 완료보다 우선한다", async () => {
  const harness = createHarness({
    [`users/${UID}`]: baseUser({
      quizDate: YESTERDAY,
      quizAttempts: 1,
      quizSolved: true,
      quizRewardDate: TODAY,
      quizRewardAmount: 5,
    }),
  });
  const response = await restart(harness);
  assert(response.state.user.quizRewardDate === TODAY);
  assert(response.state.user.quizRewardAmount === 5);
  const stored = harness.state.get(`users/${UID}`)!;
  assert(stored.quizRewardDate === TODAY && stored.quizRewardAmount === 5);
});

Deno.test("readingEpoch가 없는 기존 사용자는 epoch 0에서 안전하게 시작한다", async () => {
  const harness = createHarness({
    [`users/${UID}`]: baseUser({ readingEpoch: undefined }),
  });
  const response = await restart(harness, input({ readingEpoch: 0 }));
  assert(response.committed && response.result.status === "restarted");
  assert(response.state.user.readCount === 2, "readCount changed");
  assert(response.state.user.readingEpoch === 1, "legacy epoch not advanced");
});
