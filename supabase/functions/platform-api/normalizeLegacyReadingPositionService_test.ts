import { PlatformError } from "../_shared/errors.ts";
import {
  decodeFirestoreFields,
  type FirestoreDocument,
  type FirestoreValue,
  type FirestoreWrite,
  updateWrite,
} from "../_shared/firestore.ts";
import {
  normalizeLegacyReadingPosition,
  type NormalizeLegacyReadingPositionDependencies,
  type NormalizeLegacyReadingPositionInput,
} from "./normalizeLegacyReadingPositionService.ts";

const PROJECT_ID = "test-project";
const SERVICE = { token: "service-token", projectId: PROJECT_ID };
const UID = "user-1";
const REQUEST_ID = "123e4567-e89b-42d3-a456-426614174000";
const NOW = new Date("2026-07-16T01:02:03.000Z");
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

const baseUser = (overrides: Data = {}): Data => {
  const data = {
    uid: UID,
    name: "민감한 이름",
    password: "plain-support-password",
    isDeleted: false,
    currentDay: 731,
    readCount: 2,
    score: 0,
    readingEpoch: 0,
    ...overrides,
  };
  const currentDay = Number(data.currentDay);
  const readCount = Number(data.readCount ?? 1);
  const completed = Math.max(
    0,
    readCount - 1 + Math.floor((currentDay - 1) / 365),
  );
  return {
    readingYear: 2026,
    yearCompletedRounds: completed,
    lifetimeCompletedRounds: completed,
    ...data,
  };
};

const input = (
  overrides: Partial<NormalizeLegacyReadingPositionInput> = {},
): NormalizeLegacyReadingPositionInput => ({
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
    updateWrite,
    now: () => new Date(NOW),
  } as unknown as Partial<NormalizeLegacyReadingPositionDependencies>;

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
const normalize = (harness: Harness, request = input()) =>
  normalizeLegacyReadingPosition(
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

Deno.test("legacy 진도는 user·모든 canonical roster·최소 원장을 한 transaction에서 보정한다", async () => {
  const harness = createHarness({
    [`users/${UID}`]: baseUser(),
    [`churches/org-b/roster/${UID}`]: {
      uid: UID,
      currentDay: 730,
      readCount: 2,
      privateNote: "응답 금지",
    },
    [`churches/org-a/roster/${UID}`]: {
      uid: UID,
      currentDay: 731,
      readCount: 2,
    },
  });
  const response = await normalize(harness);

  assertEquals(response, {
    alreadyCompleted: false,
    committed: true,
    result: { status: "normalized", currentDay: 1, readCount: 4 },
  });
  assertEquals(harness.commits[0].paths, [
    `users/${UID}`,
    `churches/org-a/roster/${UID}`,
    `churches/org-b/roster/${UID}`,
    `users/${UID}/activityActions/${REQUEST_ID}`,
  ]);
  assert(
    harness.queries[0].collectionId === "roster" &&
      harness.queries[0].field === "uid" && harness.queries[0].value === UID &&
      harness.queries[0].limit === 4 &&
      harness.queries[0].transaction === "tx-1",
    "canonical roster query must be bounded and transactional",
  );
  for (
    const path of [
      `users/${UID}`,
      `churches/org-a/roster/${UID}`,
      `churches/org-b/roster/${UID}`,
    ]
  ) {
    const stored = harness.state.get(path)!;
    assert(
      stored.currentDay === 1 && stored.readCount === 4,
      `${path} drifted`,
    );
  }
  const ledger = harness.state.get(
    `users/${UID}/activityActions/${REQUEST_ID}`,
  )!;
  assertEquals(Object.keys(ledger).sort(), [
    "action",
    "createdAt",
    "input",
    "requestId",
    "result",
    "schemaVersion",
  ]);
  assertEquals(ledger.input, {});
  const publicJson = JSON.stringify({ response, ledger });
  for (
    const secret of [
      UID,
      "org-a",
      "org-b",
      "민감한 이름",
      "plain-support-password",
      "응답 금지",
    ]
  ) {
    assert(!publicJson.includes(secret), `private field leaked: ${secret}`);
  }
});

Deno.test("로그인 감사가 기준 공동체 이름만 users에 점진 보정한다", async () => {
  const harness = createHarness({
    [`users/${UID}`]: baseUser({
      currentDay: 42,
      readCount: 2,
      churchId: "church-1",
      churchName: "이전 이름",
    }),
    "churches/church-1": {
      name: "새 이름",
      isDeleted: false,
    },
  });

  assertEquals(await normalize(harness), {
    alreadyCompleted: false,
    committed: true,
    result: { status: "normalized", currentDay: 42, readCount: 2 },
  });
  assertEquals(harness.commits[0].paths, [
    `users/${UID}`,
    `users/${UID}/activityActions/${REQUEST_ID}`,
  ]);
  assertEquals(harness.state.get(`users/${UID}`), {
    ...baseUser({
      currentDay: 42,
      readCount: 2,
      churchId: "church-1",
      churchName: "새 이름",
    }),
  });
  const ledger = harness.state.get(
    `users/${UID}/activityActions/${REQUEST_ID}`,
  );
  assert(ledger && !JSON.stringify(ledger).includes("새 이름"));
});

Deno.test("이미 1~365 범위면 원장도 쓰지 않는 fresh no-op이다", async () => {
  const harness = createHarness({
    [`users/${UID}`]: baseUser({ currentDay: 365, readCount: 7 }),
    [`churches/org-a/roster/${UID}`]: {
      uid: UID,
      currentDay: 365,
      readCount: 7,
      readingYear: 2026,
      yearCompletedRounds: 6,
      lifetimeCompletedRounds: 6,
      score: 0,
    },
  });
  const response = await normalize(harness);
  assertEquals(response, {
    alreadyCompleted: false,
    committed: false,
    result: { status: "alreadyNormalized", currentDay: 365, readCount: 7 },
  });
  assertEquals(harness.commits, []);
  assert(
    !harness.state.has(`users/${UID}/activityActions/${REQUEST_ID}`),
    "no-op ledger must not be created",
  );
  assert(harness.rollbackCount === 1, "no-op transaction not rolled back");
});

Deno.test("새해에는 현재 진도·연간 완독·점수만 초기화하고 평생 완독과 달란트는 보존한다", async () => {
  const harness = createHarness({
    [`users/${UID}`]: baseUser({
      currentDay: 120,
      readCount: 11,
      readingEpoch: 2,
      readingYear: 2026,
      yearCompletedRounds: 10,
      lifetimeCompletedRounds: 10,
      score: 999,
      talent: 4321,
    }),
    [`churches/org-a/roster/${UID}`]: {
      uid: UID,
      currentDay: 120,
      readCount: 11,
      readingYear: 2026,
      yearCompletedRounds: 10,
      lifetimeCompletedRounds: 10,
      score: 999,
      talent: 876,
    },
  });
  harness.dependencies.now = () => new Date("2027-01-01T01:00:00.000Z");

  const response = await normalize(harness);
  assert(response.committed, "new-year rollover must commit");
  const user = harness.state.get(`users/${UID}`);
  const roster = harness.state.get(`churches/org-a/roster/${UID}`);
  assertEquals({
    currentDay: user?.currentDay,
    readCount: user?.readCount,
    readingEpoch: user?.readingEpoch,
    readingYear: user?.readingYear,
    yearCompletedRounds: user?.yearCompletedRounds,
    lifetimeCompletedRounds: user?.lifetimeCompletedRounds,
    score: user?.score,
    talent: user?.talent,
  }, {
    currentDay: 1,
    readCount: 11,
    readingEpoch: 3,
    readingYear: 2027,
    yearCompletedRounds: 0,
    lifetimeCompletedRounds: 10,
    score: 0,
    talent: 4321,
  });
  assertEquals({
    currentDay: roster?.currentDay,
    readCount: roster?.readCount,
    readingYear: roster?.readingYear,
    yearCompletedRounds: roster?.yearCompletedRounds,
    lifetimeCompletedRounds: roster?.lifetimeCompletedRounds,
    score: roster?.score,
    talent: roster?.talent,
  }, {
    currentDay: 1,
    readCount: 11,
    readingYear: 2027,
    yearCompletedRounds: 0,
    lifetimeCompletedRounds: 10,
    score: 0,
    talent: 876,
  });
});

Deno.test("users가 정상이지만 roster currentDay가 365를 넘으면 roster만 복구한다", async () => {
  const user = baseUser({ currentDay: 10, readCount: 2 });
  const harness = createHarness({
    [`users/${UID}`]: user,
    [`churches/org-a/roster/${UID}`]: {
      uid: UID,
      currentDay: 731,
      readCount: 2,
    },
  });
  const response = await normalize(harness);
  assertEquals(response, {
    alreadyCompleted: false,
    committed: true,
    result: { status: "normalized", currentDay: 10, readCount: 2 },
  });
  assertEquals(harness.commits[0].paths, [
    `churches/org-a/roster/${UID}`,
    `users/${UID}/activityActions/${REQUEST_ID}`,
  ]);
  assertEquals(
    harness.state.get(`users/${UID}`),
    user,
    "users must not be written",
  );
  const roster = harness.state.get(`churches/org-a/roster/${UID}`)!;
  assert(roster.currentDay === 10 && roster.readCount === 2);
});

Deno.test("users와 다른 roster readCount는 canonical users 값으로 복구한다", async () => {
  const user = baseUser({ currentDay: 42, readCount: 3 });
  const harness = createHarness({
    [`users/${UID}`]: user,
    [`churches/org-a/roster/${UID}`]: {
      uid: UID,
      currentDay: 42,
      readCount: 9,
    },
  });
  const response = await normalize(harness);
  assert(response.committed && response.result.status === "normalized");
  assertEquals(
    harness.state.get(`users/${UID}`),
    user,
    "users must not be written",
  );
  const roster = harness.state.get(`churches/org-a/roster/${UID}`)!;
  assert(roster.currentDay === 42 && roster.readCount === 3);
});

Deno.test("roster currentDay/readCount 누락도 명시적인 미러 복구 대상으로 삼는다", async () => {
  const user = baseUser({ currentDay: 50, readCount: 4 });
  const harness = createHarness({
    [`users/${UID}`]: user,
    [`churches/org-a/roster/${UID}`]: { uid: UID, readCount: 4 },
    [`churches/org-b/roster/${UID}`]: { uid: UID, currentDay: 50 },
  });
  const response = await normalize(harness);
  assert(response.committed && response.result.status === "normalized");
  assertEquals(harness.commits[0].paths, [
    `churches/org-a/roster/${UID}`,
    `churches/org-b/roster/${UID}`,
    `users/${UID}/activityActions/${REQUEST_ID}`,
  ]);
  assertEquals(
    harness.state.get(`users/${UID}`),
    user,
    "users must not be written",
  );
  for (const orgId of ["org-a", "org-b"]) {
    const roster = harness.state.get(`churches/${orgId}/roster/${UID}`)!;
    assert(roster.currentDay === 50 && roster.readCount === 4);
  }
});

Deno.test("readCount가 없는 legacy users 문서는 1회차로 호환 보정한다", async () => {
  const legacyUser = baseUser();
  delete legacyUser.readCount;
  const harness = createHarness({ [`users/${UID}`]: legacyUser });
  const response = await normalize(harness);
  assertEquals(response.result, {
    status: "normalized",
    currentDay: 1,
    readCount: 3,
  });
  assert(harness.state.get(`users/${UID}`)?.readCount === 3);
});

Deno.test("동일 UUID replay와 apply-then-409는 저장된 exact 결과로 수렴한다", async () => {
  const harness = createHarness({ [`users/${UID}`]: baseUser() });
  harness.conflictAfterAppliedCommit();
  const replayAfterLostResponse = await normalize(harness);
  assert(
    replayAfterLostResponse.alreadyCompleted &&
      replayAfterLostResponse.committed,
  );
  assertEquals(replayAfterLostResponse.result, {
    status: "normalized",
    currentDay: 1,
    readCount: 4,
  });
  assert(harness.transactionCount === 2, "apply-then-409 was not retried");
  assert(harness.commits.length === 1, "normalization committed twice");

  const latest = harness.state.get(`users/${UID}`)!;
  latest.currentDay = 2;
  latest.readCount = 4;
  harness.state.set(`users/${UID}`, latest);
  const exactReplay = await normalize(harness);
  assert(exactReplay.alreadyCompleted && exactReplay.committed);
  assertEquals(exactReplay.result, replayAfterLostResponse.result);
  assert(harness.commits.length === 1, "replay wrote again");
});

Deno.test("손상·overflow 상태와 비활성 사용자는 fail closed 한다", async () => {
  for (
    const [label, user, code] of [
      ["string day", baseUser({ currentDay: "731" }), "CONFLICT"],
      ["zero count", baseUser({ readCount: 0 }), "CONFLICT"],
      [
        "overflow",
        baseUser({
          currentDay: Number.MAX_SAFE_INTEGER,
          readCount: Number.MAX_SAFE_INTEGER,
        }),
        "CONFLICT",
      ],
      ["deleted", baseUser({ isDeleted: true }), "FORBIDDEN"],
      [
        "malformed deleted marker",
        baseUser({ isDeleted: "false" }),
        "CONFLICT",
      ],
    ] as Array<[string, Data, string]>
  ) {
    const harness = createHarness({ [`users/${UID}`]: user });
    await expectPlatformError(() => normalize(harness), code);
    assertEquals(harness.commits, [], `${label} wrote data`);
  }

  const badRoster = createHarness({
    [`users/${UID}`]: baseUser(),
    [`churches/org-a/roster/${UID}`]: {
      uid: UID,
      currentDay: "731",
      readCount: 2,
    },
  });
  await expectPlatformError(() => normalize(badRoster), "CONFLICT");
  assertEquals(badRoster.commits, []);
});

Deno.test("canonical roster 경로·uid·최대 3개를 엄격히 검증한다", async () => {
  const badPath = createHarness({
    [`users/${UID}`]: baseUser(),
    [`organizations/org-a/teams/t1/roster/${UID}`]: {
      uid: UID,
      currentDay: 731,
      readCount: 2,
    },
  });
  await expectPlatformError(() => normalize(badPath), "CONFLICT");

  const wrongDocumentId = createHarness({
    [`users/${UID}`]: baseUser(),
    "churches/org-a/roster/another-doc": {
      uid: UID,
      currentDay: 731,
      readCount: 2,
    },
  });
  await expectPlatformError(() => normalize(wrongDocumentId), "CONFLICT");

  const tooMany = createHarness({ [`users/${UID}`]: baseUser() });
  for (const orgId of ["a", "b", "c", "d"]) {
    tooMany.state.set(`churches/${orgId}/roster/${UID}`, {
      uid: UID,
      currentDay: 731,
      readCount: 2,
    });
  }
  await expectPlatformError(() => normalize(tooMany), "CONFLICT");
  assertEquals(tooMany.commits, []);
});

Deno.test("원장 충돌·요청 위조와 지속 409를 제한된 횟수로 거부한다", async () => {
  const forgedLedger = createHarness({
    [`users/${UID}`]: baseUser({ currentDay: 1, readCount: 4 }),
    [`users/${UID}/activityActions/${REQUEST_ID}`]: {
      schemaVersion: 1,
      action: "normalizeLegacyReadingPosition",
      requestId: REQUEST_ID,
      input: { currentDay: 731 },
      result: { status: "normalized", currentDay: 1, readCount: 4 },
      createdAt: NOW.toISOString(),
    },
  });
  await expectPlatformError(() => normalize(forgedLedger), "CONFLICT");

  await expectPlatformError(
    () =>
      normalizeLegacyReadingPosition(
        SERVICE,
        { uid: UID, anonymous: true },
        input(),
        forgedLedger.dependencies,
      ),
    "ANONYMOUS_NOT_ALLOWED",
  );
  await expectPlatformError(
    () =>
      normalizeLegacyReadingPosition(
        SERVICE,
        { uid: UID, anonymous: false },
        { ...input(), currentDay: 731 } as NormalizeLegacyReadingPositionInput,
        forgedLedger.dependencies,
      ),
    "BAD_REQUEST",
  );

  const exhausted = createHarness({ [`users/${UID}`]: baseUser() });
  exhausted.conflictBeforeCommit(3);
  await expectPlatformError(
    () => normalize(exhausted),
    "FIRESTORE_WRITE_FAILED",
  );
  assert(
    exhausted.transactionCount === 3,
    "409 retry was not bounded at three",
  );
  assertEquals(exhausted.commits, []);
  assertEquals(exhausted.state.get(`users/${UID}`), baseUser());
});
