import { PlatformError } from "../_shared/errors.ts";
import type {
  FirestoreDocument,
  FirestoreWrite,
} from "../_shared/firestore.ts";
import type { QuizIndexRecord } from "./quizCore.ts";
import {
  QUIZ_ACTIVITY_LEDGER_SCHEMA_VERSION,
  SKIP_QUIZ_ACTION,
  skipQuiz,
  SUBMIT_QUIZ_ACTION,
  submitQuiz,
} from "./quizSubmission.ts";

const SERVICE = { token: "service-token", projectId: "test-project" };
const UID = "user-1";
const NOW = new Date("2026-07-14T03:00:00.000Z");
const TODAY = "Tue Jul 14 2026";
const QUIZ_KEY = "test-quiz";
const OTHER_QUIZ_KEY = "test-quiz-next";
const PROGRESS_KEY = "r1_d10";
const OTHER_PROGRESS_KEY = "r1_d11";
const EPOCH_PROGRESS_KEY = "e1_r1_d10";
const REQUEST_ID = "123e4567-e89b-42d3-a456-426614174000";
const OTHER_REQUEST_ID = "223e4567-e89b-42d3-a456-426614174000";
const THIRD_REQUEST_ID = "323e4567-e89b-42d3-a456-426614174000";

const QUESTIONS: Record<string, QuizIndexRecord> = {
  [QUIZ_KEY]: {
    answerIndex: 2,
    allowed: { whole: [10], nt: [] },
  },
  [OTHER_QUIZ_KEY]: {
    answerIndex: 2,
    allowed: { whole: [11], nt: [] },
  },
};

type StoredDocument = { data: Record<string, unknown>; updateTime: string };
type MemoryWrite = {
  path: string;
  data: Record<string, unknown>;
  updateMask?: string[];
  exists?: boolean;
};

type HarnessOptions = {
  failNextBeginStatus?: number;
  failNextCommitStatus?: number;
};

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

const assertEquals = (actual: unknown, expected: unknown, message: string) => {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(
      `${message}: expected ${JSON.stringify(expected)}, got ${
        JSON.stringify(actual)
      }`,
    );
  }
};

const record = (value: unknown): Record<string, unknown> | null =>
  value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;

const valueAtPath = (
  data: Record<string, unknown>,
  fieldPath: string,
): unknown => {
  let current: unknown = data;
  for (const segment of fieldPath.split(".")) {
    const currentRecord = record(current);
    if (!currentRecord || !(segment in currentRecord)) return undefined;
    current = currentRecord[segment];
  }
  return current;
};

const setAtPath = (
  data: Record<string, unknown>,
  fieldPath: string,
  value: unknown,
) => {
  const segments = fieldPath.split(".");
  let current = data;
  for (const segment of segments.slice(0, -1)) {
    const existing = record(current[segment]);
    if (!existing) current[segment] = {};
    current = current[segment] as Record<string, unknown>;
  }
  current[segments.at(-1)!] = structuredClone(value);
};

const createHarness = (options: HarnessOptions = {}) => {
  const documents = new Map<string, StoredDocument>();
  const commits: MemoryWrite[][] = [];
  const transactions: string[] = [];
  let rollbacks = 0;
  let failNextBeginStatus = options.failNextBeginStatus;
  let failNextCommitStatus = options.failNextCommitStatus;
  let sequence = 0;

  const nextUpdateTime = () =>
    new Date(NOW.getTime() + ++sequence).toISOString();
  const setDocument = (
    path: string,
    data: Record<string, unknown>,
    updateTime = nextUpdateTime(),
  ) => {
    documents.set(path, { data: structuredClone(data), updateTime });
  };
  const data = (path: string): Record<string, unknown> | null =>
    documents.get(path)?.data || null;

  const beginTransaction = async () => {
    if (failNextBeginStatus !== undefined) {
      const status = failNextBeginStatus;
      failNextBeginStatus = undefined;
      throw new PlatformError("FIRESTORE_READ_FAILED", {
        details: { status },
      });
    }
    const transaction = `transaction-${transactions.length + 1}`;
    transactions.push(transaction);
    return transaction;
  };
  const getDocument = async <T>(
    _token: string,
    _projectId: string,
    path: string,
  ): Promise<FirestoreDocument<T> | null> => {
    const stored = documents.get(path);
    if (!stored) return null;
    return {
      name: `projects/test-project/databases/(default)/documents/${path}`,
      fields: {},
      data: structuredClone(stored.data) as T,
      updateTime: stored.updateTime,
    };
  };
  const runCollectionGroupQuery = async <T>(
    _token: string,
    _projectId: string,
    collectionId: string,
    field: string,
    value: unknown,
    queryOptions: { limit?: number } = {},
  ): Promise<FirestoreDocument<T>[]> => {
    assert(collectionId === "roster", "unexpected collection group");
    assert(field === "uid", "unexpected roster filter");
    return Array.from(documents.entries()).flatMap(([path, stored]) => {
      const segments = path.split("/");
      if (
        segments.length !== 4 || segments[0] !== "churches" ||
        segments[2] !== "roster" || stored.data.uid !== value
      ) return [];
      return [{
        name: `projects/test-project/databases/(default)/documents/${path}`,
        fields: {},
        data: structuredClone(stored.data) as T,
        updateTime: stored.updateTime,
      }];
    }).slice(0, queryOptions.limit ?? 100);
  };
  const runCollectionQuery = async <T>(
    _token: string,
    _projectId: string,
    parentPath: string,
    collectionId: string,
    field: string,
    value: unknown,
    queryOptions: { limit?: number } = {},
  ): Promise<FirestoreDocument<T>[]> => {
    const prefix = `${parentPath}/${collectionId}/`;
    return Array.from(documents.entries()).flatMap(([path, stored]) => {
      if (
        !path.startsWith(prefix) || path.slice(prefix.length).includes("/") ||
        stored.data[field] !== value
      ) return [];
      return [{
        name: `projects/test-project/databases/(default)/documents/${path}`,
        fields: {},
        data: structuredClone(stored.data) as T,
        updateTime: stored.updateTime,
      }];
    }).slice(0, queryOptions.limit ?? 100);
  };
  const updateWrite = (
    _projectId: string,
    path: string,
    writeData: Record<string, unknown>,
    writeOptions: { updateMask?: string[]; exists?: boolean } = {},
  ): FirestoreWrite => ({
    path,
    data: structuredClone(writeData),
    ...writeOptions,
  });
  const commitWrites = async (
    _token: string,
    _projectId: string,
    rawWrites: FirestoreWrite[],
  ) => {
    if (failNextCommitStatus !== undefined) {
      const status = failNextCommitStatus;
      failNextCommitStatus = undefined;
      throw new PlatformError("FIRESTORE_WRITE_FAILED", {
        details: { status },
      });
    }
    const writes = rawWrites as MemoryWrite[];
    for (const write of writes) {
      const exists = documents.has(write.path);
      if (write.exists === true && !exists) {
        throw new PlatformError("FIRESTORE_WRITE_FAILED", {
          details: { status: 409 },
        });
      }
      if (write.exists === false && exists) {
        throw new PlatformError("FIRESTORE_WRITE_FAILED", {
          details: { status: 409 },
        });
      }
    }
    const nextDocuments = new Map(documents);
    for (const write of writes) {
      const previous = structuredClone(
        nextDocuments.get(write.path)?.data || {},
      );
      const next = write.updateMask ? previous : structuredClone(write.data);
      for (const fieldPath of write.updateMask || []) {
        setAtPath(next, fieldPath, valueAtPath(write.data, fieldPath));
      }
      nextDocuments.set(write.path, {
        data: next,
        updateTime: nextUpdateTime(),
      });
    }
    documents.clear();
    for (const [path, stored] of nextDocuments) documents.set(path, stored);
    commits.push(structuredClone(writes));
    return {};
  };
  const rollbackTransaction = async () => {
    rollbacks += 1;
  };

  const dependencies = {
    beginTransaction,
    commitWrites,
    getDocument,
    rollbackTransaction,
    runCollectionQuery,
    runCollectionGroupQuery,
    updateWrite,
    now: () => new Date(NOW),
    questions: QUESTIONS,
  };

  return {
    commits,
    data,
    dependencies,
    documents,
    get rollbacks() {
      return rollbacks;
    },
    setDocument,
    transactions,
  };
};

const talentShop = (enabled: boolean) => ({
  schemaVersion: 2,
  enabled: true,
  departmentSettings: {
    adult: { enabled, marketId: "main" },
  },
  markets: {
    main: { id: "main", enabled: true, items: [] },
  },
});

const seedUser = (
  harness: ReturnType<typeof createHarness>,
  overrides: Record<string, unknown> = {},
) => {
  harness.setDocument(`users/${UID}`, {
    uid: UID,
    currentDay: 10,
    readCount: 1,
    dayOffset: 0,
    planId: "whole_1",
    accountType: "church",
    baseChurchId: "base",
    departmentId: "adult",
    talent: 5,
    ...overrides,
  });
};

const seedRoster = (
  harness: ReturnType<typeof createHarness>,
  orgId: string,
  talent: unknown,
  enabled = true,
) => {
  harness.setDocument(`churches/${orgId}/roster/${UID}`, {
    uid: UID,
    departmentId: "adult",
    talent,
  });
  harness.setDocument(
    `churches/${orgId}/settings/talentShop`,
    talentShop(enabled),
  );
};

const seedBaseShop = (
  harness: ReturnType<typeof createHarness>,
  enabled = true,
) => {
  harness.setDocument("churches/base/settings/talentShop", talentShop(enabled));
};

const runSubmit = (
  harness: ReturnType<typeof createHarness>,
  overrides: Partial<{
    requestId: string;
    progressKey: string;
    quizKey: string;
    selectedIndex: number;
    attemptSlot: 1 | 2;
  }> = {},
) =>
  submitQuiz(SERVICE, {
    uid: UID,
    requestId: REQUEST_ID,
    progressKey: PROGRESS_KEY,
    quizKey: QUIZ_KEY,
    selectedIndex: 2,
    attemptSlot: 1,
    ...overrides,
  }, { dependencies: harness.dependencies as never });

const runSkip = (
  harness: ReturnType<typeof createHarness>,
  overrides: Partial<{
    requestId: string;
    progressKey: string;
    quizKey: string;
  }> = {},
) =>
  skipQuiz(SERVICE, {
    uid: UID,
    requestId: REQUEST_ID,
    progressKey: PROGRESS_KEY,
    quizKey: QUIZ_KEY,
    ...overrides,
  }, { dependencies: harness.dependencies as never });

const expectPlatformError = async (
  promise: Promise<unknown>,
  code: string,
) => {
  try {
    await promise;
    throw new Error(`expected ${code}`);
  } catch (error) {
    if (!(error instanceof PlatformError)) {
      throw new Error("PlatformError expected", { cause: error });
    }
    assert(error.code === code, `expected ${code}, got ${error.code}`);
  }
};

Deno.test("첫 정답은 user와 활성 roster만 보상하고 ledger까지 원자 저장한다", async () => {
  const harness = createHarness();
  seedUser(harness);
  seedBaseShop(harness);
  seedRoster(harness, "alpha", 1, true);
  seedRoster(harness, "beta", 2, false);

  const response = await runSubmit(harness);

  assert(response.result.status === "ready", "ready result expected");
  assert(response.result.reward === 10, "first reward mismatch");
  assert(response.result.isCorrect, "correct result missing");
  assertEquals(
    response.result.rewardedRosterOrgIds,
    ["alpha"],
    "eligible roster mismatch",
  );
  assert(response.state.userTalent === 15, "user talent mismatch");
  assertEquals(response.state.rosterTalents, [
    { orgId: "alpha", talent: 11 },
    { orgId: "beta", talent: 2 },
  ], "fresh roster state mismatch");
  assert(harness.data(`users/${UID}`)?.talent === 15, "user write missing");
  assert(
    harness.data(`churches/alpha/roster/${UID}`)?.talent === 11,
    "roster reward missing",
  );
  assert(
    harness.data(`churches/beta/roster/${UID}`)?.talent === 2,
    "disabled roster changed",
  );
  const ledger = harness.data(
    `users/${UID}/activityActions/${REQUEST_ID}`,
  );
  assert(
    ledger?.schemaVersion === QUIZ_ACTIVITY_LEDGER_SCHEMA_VERSION,
    "ledger schema",
  );
  assert(ledger?.action === SUBMIT_QUIZ_ACTION, "ledger action");
  assert(ledger?.readingEpoch === 0, "epoch-0 ledger binding missing");
  assert(
    harness.data(
      `users/${UID}/quizAttemptSlots/${PROGRESS_KEY}_a1`,
    )?.requestId === REQUEST_ID,
    "semantic attempt ledger missing",
  );
  assert(harness.commits.length === 1, "single atomic commit expected");
  assert(
    !JSON.stringify(response).includes("answerIndex"),
    "answer index leaked",
  );
});

Deno.test("현재 readingEpoch 진도 키만 submit·skip을 허용한다", async () => {
  const submitted = createHarness();
  seedUser(submitted, { readingEpoch: 1 });
  seedBaseShop(submitted);
  const submitResponse = await runSubmit(submitted, {
    progressKey: EPOCH_PROGRESS_KEY,
  });
  assert(submitResponse.result.status === "ready", "epoch submit rejected");
  assert(
    submitted.data(
      `users/${UID}/quizAttemptSlots/${EPOCH_PROGRESS_KEY}_a1`,
    )?.readingEpoch === 1,
    "epoch submit semantic ledger missing",
  );

  const skipped = createHarness();
  seedUser(skipped, { readingEpoch: 1 });
  const skipResponse = await runSkip(skipped, {
    progressKey: EPOCH_PROGRESS_KEY,
  });
  assert(skipResponse.committed, "epoch skip rejected");
  assert(
    skipped.data(
      `users/${UID}/quizAttemptSlots/${EPOCH_PROGRESS_KEY}_skip`,
    )?.readingEpoch === 1,
    "epoch skip semantic ledger missing",
  );
});

Deno.test("readingEpoch 0의 기존 submit ledger를 replay 호환한다", async () => {
  const harness = createHarness();
  seedUser(harness);
  seedBaseShop(harness);
  await runSubmit(harness, { selectedIndex: 0 });
  for (
    const path of [
      `users/${UID}/activityActions/${REQUEST_ID}`,
      `users/${UID}/quizAttemptSlots/${PROGRESS_KEY}_a1`,
    ]
  ) {
    const ledger = { ...harness.data(path)! };
    ledger.schemaVersion = 1;
    delete ledger.readingEpoch;
    harness.setDocument(path, ledger);
  }

  const replay = await runSubmit(harness, { selectedIndex: 0 });

  assert(replay.alreadyCompleted, "legacy epoch-0 ledger rejected");
  assert(harness.commits.length === 1, "legacy replay wrote again");
});

Deno.test("readingEpoch 0의 기존 skip ledger를 replay 호환한다", async () => {
  const harness = createHarness();
  seedUser(harness);
  await runSkip(harness);
  for (
    const path of [
      `users/${UID}/activityActions/${REQUEST_ID}`,
      `users/${UID}/quizAttemptSlots/${PROGRESS_KEY}_skip`,
    ]
  ) {
    const ledger = { ...harness.data(path)! };
    ledger.schemaVersion = 1;
    delete ledger.readingEpoch;
    harness.setDocument(path, ledger);
  }

  const replay = await runSkip(harness);

  assert(replay.alreadyCompleted, "legacy epoch-0 skip ledger rejected");
  assert(harness.commits.length === 1, "legacy skip replay wrote again");
});

Deno.test("재시작 뒤 stale submit·skip replay는 보상·progress repair 없이 거부한다", async () => {
  const submitted = createHarness();
  seedUser(submitted);
  seedBaseShop(submitted);
  await runSubmit(submitted);
  const rewarded = submitted.data(`users/${UID}`)!;
  submitted.setDocument(`users/${UID}`, {
    ...rewarded,
    readingEpoch: 1,
    quizProgress: {},
    quizRewardDate: null,
    quizRewardAmount: 0,
  });

  await expectPlatformError(runSubmit(submitted), "CONFLICT");
  assert(submitted.commits.length === 1, "stale submit replay wrote data");
  assert(
    Object.keys(record(submitted.data(`users/${UID}`)?.quizProgress) || {})
          .length === 0 &&
      submitted.data(`users/${UID}`)?.quizRewardDate === null &&
      submitted.data(`users/${UID}`)?.talent === 15,
    "stale submit repaired progress or changed reward",
  );

  const skipped = createHarness();
  seedUser(skipped);
  await runSkip(skipped);
  const skippedUser = skipped.data(`users/${UID}`)!;
  skipped.setDocument(`users/${UID}`, {
    ...skippedUser,
    readingEpoch: 1,
    quizProgress: {},
  });

  await expectPlatformError(runSkip(skipped), "CONFLICT");
  assert(skipped.commits.length === 1, "stale skip replay wrote repair");
  assert(
    Object.keys(record(skipped.data(`users/${UID}`)?.quizProgress) || {})
      .length === 0,
    "stale skip restored old progress",
  );

  const staleFresh = createHarness();
  seedUser(staleFresh, { readingEpoch: 1 });
  seedBaseShop(staleFresh);
  await expectPlatformError(runSubmit(staleFresh), "CONFLICT");
  assert(staleFresh.commits.length === 0, "stale fresh submit wrote data");
});

Deno.test("오답도 progress와 ledger를 한 번만 저장하고 멱등 replay는 fresh state를 돌려준다", async () => {
  const harness = createHarness();
  seedUser(harness);
  seedBaseShop(harness);

  const first = await runSubmit(harness, { selectedIndex: 0 });
  assert(first.result.status === "ready", "ready expected");
  assert(
    !first.result.solved && first.result.reward === 0,
    "wrong result mismatch",
  );
  assert(first.state.progress.attempts === 1, "attempt not persisted");
  assert(
    harness.data(`users/${UID}`)?.quizRewardDate === undefined,
    "wrong answer consumed reward date",
  );

  const user = harness.data(`users/${UID}`)!;
  harness.setDocument(`users/${UID}`, { ...user, talent: 77 });
  const replay = await runSubmit(harness, { selectedIndex: 0 });
  assert(replay.alreadyCompleted, "ledger replay not detected");
  assert(replay.state.userTalent === 77, "replay state was stale");
  assert(harness.commits.length === 1, "replay wrote again");

  await expectPlatformError(
    runSubmit(harness, { selectedIndex: 1 }),
    "CONFLICT",
  );
  assert(harness.commits.length === 1, "conflicting replay wrote data");
});

Deno.test("같은 attempt slot의 다른 requestId는 semantic winner를 순차 replay한다", async () => {
  const harness = createHarness();
  seedUser(harness);
  seedBaseShop(harness);

  const winner = await runSubmit(harness, { selectedIndex: 0 });
  const replay = await runSubmit(harness, {
    requestId: OTHER_REQUEST_ID,
    selectedIndex: 0,
  });

  assert(winner.result.status === "ready", "winner result missing");
  assert(replay.alreadyCompleted, "semantic replay was not detected");
  assert(
    replay.result.status === "ready" && replay.result.attempts === 1 &&
      !replay.result.isCorrect,
    "semantic winner result mismatch",
  );
  assert(harness.commits.length === 1, "same slot was consumed twice");
  assert(
    !harness.data(`users/${UID}/activityActions/${OTHER_REQUEST_ID}`),
    "losing request created a second activity ledger",
  );
  await expectPlatformError(
    runSubmit(harness, {
      requestId: THIRD_REQUEST_ID,
      selectedIndex: 1,
    }),
    "CONFLICT",
  );
  assert(harness.commits.length === 1, "conflicting answer changed winner");
});

Deno.test("동시 동일 attempt slot은 semantic exists precondition으로 한 번만 소비한다", async () => {
  const harness = createHarness();
  seedUser(harness);
  seedBaseShop(harness);

  const [left, right] = await Promise.all([
    runSubmit(harness, { selectedIndex: 0 }),
    runSubmit(harness, {
      requestId: OTHER_REQUEST_ID,
      selectedIndex: 0,
    }),
  ]);

  assert(
    Number(left.alreadyCompleted) + Number(right.alreadyCompleted) === 1,
    "exactly one concurrent request must replay",
  );
  assert(harness.commits.length === 1, "concurrent slot committed twice");
  assert(
    record(harness.data(`users/${UID}`)?.quizProgress)?.[PROGRESS_KEY] &&
      record(record(harness.data(`users/${UID}`)?.quizProgress)?.[PROGRESS_KEY])
          ?.attempts === 1,
    "concurrent slot consumed more than one attempt",
  );
});

Deno.test("fresh attemptSlot은 서버의 다음 시도 번호와 정확히 일치해야 한다", async () => {
  const harness = createHarness();
  seedUser(harness);
  seedBaseShop(harness);

  await expectPlatformError(
    runSubmit(harness, { attemptSlot: 2 }),
    "CONFLICT",
  );
  assert(harness.commits.length === 0, "out-of-order slot was committed");
});

Deno.test("당일 보상 marker와 progress를 지워도 immutable ledger가 재적립을 막는다", async () => {
  const harness = createHarness();
  seedUser(harness);
  seedBaseShop(harness);

  const first = await runSubmit(harness);
  assert(
    first.result.status === "ready" && first.result.reward === 10,
    "first reward",
  );
  const rewardedUser = harness.data(`users/${UID}`)!;
  harness.setDocument(`users/${UID}`, {
    ...rewardedUser,
    currentDay: 11,
    quizProgress: {},
    quizRewardDate: null,
    quizRewardAmount: 0,
  });

  const second = await runSubmit(harness, {
    requestId: OTHER_REQUEST_ID,
    progressKey: OTHER_PROGRESS_KEY,
    quizKey: OTHER_QUIZ_KEY,
  });

  assert(second.result.status === "ready", "second result");
  assert(second.result.reward === 0, "daily reward was issued twice");
  assert(second.state.userTalent === 15, "wallet was rewarded twice");
  assert(second.state.quizRewardDate === TODAY, "marker was not repaired");
  assert(
    second.state.quizRewardAmount === 10,
    "reward amount was not repaired",
  );
  assert(
    harness.data(`users/${UID}`)?.quizRewardDate === TODAY,
    "stored marker not repaired",
  );
  assert(
    harness.data(`users/${UID}`)?.talent === 15,
    "stored wallet changed twice",
  );
});

Deno.test("혼합 대소문자 roster 순서도 fresh와 ledger replay가 동일하다", async () => {
  const harness = createHarness();
  seedUser(harness);
  seedBaseShop(harness);
  seedRoster(harness, "aOrg", 1, true);
  seedRoster(harness, "BOrg", 2, true);

  const first = await runSubmit(harness);
  assertEquals(
    first.result.status === "ready" ? first.result.rewardedRosterOrgIds : [],
    ["BOrg", "aOrg"],
    "fresh roster order mismatch",
  );
  const replay = await runSubmit(harness);
  assert(replay.alreadyCompleted, "mixed-case ledger replay failed");
  assertEquals(
    replay.result.status === "ready" ? replay.result.rewardedRosterOrgIds : [],
    ["BOrg", "aOrg"],
    "replay roster order mismatch",
  );
});

Deno.test("개인 계정 둘째 정답은 활성 roster에만 5달란트를 준다", async () => {
  const harness = createHarness();
  seedUser(harness, {
    accountType: "personal",
    baseChurchId: null,
    churchId: "unaffiliated_v1",
    talent: 99,
    quizProgress: {
      [PROGRESS_KEY]: {
        attempts: 1,
        solved: false,
        skipped: false,
        quizKey: QUIZ_KEY,
        reward: 0,
        updatedDate: TODAY,
      },
    },
  });
  seedRoster(harness, "alpha", 3, true);

  const response = await runSubmit(harness, { attemptSlot: 2 });

  assert(response.result.status === "ready", "ready expected");
  assert(response.result.reward === 5, "second reward mismatch");
  assert(!response.result.rewardsUserWallet, "personal user wallet rewarded");
  assert(response.state.userTalent === 99, "personal legacy balance changed");
  assert(
    response.state.rosterTalents[0].talent === 8,
    "roster balance mismatch",
  );
  assert(
    harness.data(`users/${UID}`)?.quizRewardAmount === 5,
    "reward marker missing",
  );
});

Deno.test("완료된 퀴즈는 새 ledger나 쓰기 없이 fresh 완료 상태를 반환한다", async () => {
  const harness = createHarness();
  seedUser(harness, {
    quizProgress: {
      [PROGRESS_KEY]: {
        attempts: 2,
        solved: false,
        skipped: false,
        quizKey: QUIZ_KEY,
        reward: 0,
        updatedDate: TODAY,
      },
    },
  });
  seedBaseShop(harness);

  const response = await runSubmit(harness);

  assert(response.result.status === "alreadyDone", "alreadyDone expected");
  assert(!response.alreadyCompleted, "new request was marked replay");
  assert(response.state.progress.attempts === 2, "fresh progress mismatch");
  assert(harness.commits.length === 0, "alreadyDone wrote data");
  assert(
    !harness.data(`users/${UID}/activityActions/${REQUEST_ID}`),
    "alreadyDone ledger created",
  );
});

Deno.test("퀴즈 건너뛰기는 progress와 ledger를 원자 저장하고 replay한다", async () => {
  const harness = createHarness();
  seedUser(harness);

  const first = await runSkip(harness);

  assert(first.committed && !first.alreadyCompleted, "skip was not committed");
  assert(first.state.progress.skipped, "skip progress missing");
  assert(first.state.progress.attempts === 0, "skip consumed an attempt");
  assert(first.state.progress.reward === 0, "skip received a reward");
  assert(
    harness.data(`users/${UID}/activityActions/${REQUEST_ID}`)?.action ===
      SKIP_QUIZ_ACTION,
    "skip ledger missing",
  );

  const replay = await runSkip(harness);
  assert(replay.alreadyCompleted && replay.committed, "skip replay missing");
  assert(harness.commits.length === 1, "skip replay wrote twice");
});

Deno.test("다른 requestId의 중복 skip도 하나의 semantic winner만 replay한다", async () => {
  const sequential = createHarness();
  seedUser(sequential);
  await runSkip(sequential);
  const replay = await runSkip(sequential, { requestId: OTHER_REQUEST_ID });
  assert(replay.alreadyCompleted && replay.committed, "skip semantic replay");
  assert(sequential.commits.length === 1, "sequential skip committed twice");
  assert(
    !sequential.data(`users/${UID}/activityActions/${OTHER_REQUEST_ID}`),
    "duplicate skip created activity ledger",
  );
  assert(
    sequential.data(
      `users/${UID}/quizAttemptSlots/${PROGRESS_KEY}_skip`,
    )?.requestId === REQUEST_ID,
    "skip semantic winner missing",
  );

  const concurrent = createHarness();
  seedUser(concurrent);
  const [left, right] = await Promise.all([
    runSkip(concurrent),
    runSkip(concurrent, { requestId: OTHER_REQUEST_ID }),
  ]);
  assert(
    left.committed && right.committed,
    "concurrent skip response mismatch",
  );
  assert(
    Number(left.alreadyCompleted) + Number(right.alreadyCompleted) === 1,
    "exactly one concurrent skip must replay",
  );
  assert(concurrent.commits.length === 1, "concurrent skip committed twice");
});

Deno.test("submit과 skip 경합은 먼저 완료된 상태를 다른 writer가 덮지 않는다", async () => {
  const submitted = createHarness();
  seedUser(submitted);
  seedBaseShop(submitted);
  const answer = await runSubmit(submitted);
  assert(
    answer.result.status === "ready" && answer.result.reward === 10,
    "answer",
  );

  const lateSkip = await runSkip(submitted, { requestId: OTHER_REQUEST_ID });
  assert(!lateSkip.committed, "late skip overwrote submitted quiz");
  assert(lateSkip.state.progress.solved, "solved state was lost");
  assert(submitted.commits.length === 1, "late skip created a write");

  const skipped = createHarness();
  seedUser(skipped);
  seedBaseShop(skipped);
  await runSkip(skipped);
  const lateAnswer = await runSubmit(skipped, { requestId: OTHER_REQUEST_ID });
  assert(
    lateAnswer.result.status === "alreadyDone",
    "late answer ignored skip",
  );
  assert(skipped.commits.length === 1, "late answer created a write");
});

Deno.test("skip replay는 구버전 탭이 덮은 progress를 immutable ledger 값으로 복구한다", async () => {
  const harness = createHarness();
  seedUser(harness);
  await runSkip(harness);
  const user = harness.data(`users/${UID}`)!;
  harness.setDocument(`users/${UID}`, {
    ...user,
    quizProgress: {
      [PROGRESS_KEY]: {
        attempts: 1,
        solved: false,
        skipped: false,
        quizKey: QUIZ_KEY,
        reward: 0,
        updatedDate: TODAY,
      },
    },
  });

  const replay = await runSkip(harness);

  assert(replay.alreadyCompleted, "skip repair was not replay");
  assert(replay.state.progress.skipped, "skip repair response mismatch");
  assert(
    record(harness.data(`users/${UID}`)?.quizProgress)?.[PROGRESS_KEY] &&
      record(record(harness.data(`users/${UID}`)?.quizProgress)?.[PROGRESS_KEY])
          ?.skipped === true,
    "skip progress was not repaired",
  );
  assert(harness.commits.length === 2, "skip repair did not commit once");
});

Deno.test("terminal submit replay는 구버전 skip 덮어쓰기를 ledger 결과로 복구한다", async () => {
  const harness = createHarness();
  seedUser(harness);
  seedBaseShop(harness);
  await runSubmit(harness);
  const user = harness.data(`users/${UID}`)!;
  harness.setDocument(`users/${UID}`, {
    ...user,
    quizRewardDate: null,
    quizRewardAmount: 0,
    quizProgress: {
      [PROGRESS_KEY]: {
        attempts: 0,
        solved: false,
        skipped: true,
        quizKey: QUIZ_KEY,
        reward: 0,
        updatedDate: TODAY,
      },
    },
  });

  const replay = await runSubmit(harness);

  assert(replay.alreadyCompleted, "submit repair was not replay");
  assert(
    replay.state.progress.solved,
    "terminal solved state was not restored",
  );
  assert(
    replay.state.progress.reward === 10,
    "terminal reward was not restored",
  );
  assert(replay.state.quizRewardDate === TODAY, "reward date was not restored");
  assert(
    replay.state.quizRewardAmount === 10,
    "reward amount was not restored",
  );
  const storedProgress = record(
    record(harness.data(`users/${UID}`)?.quizProgress)?.[PROGRESS_KEY],
  );
  assert(
    storedProgress?.solved === true,
    "stored terminal progress not repaired",
  );
  assert(harness.commits.length === 2, "terminal repair did not commit once");
});

Deno.test("첫 오답 replay는 정상 2차 제출 상태를 되돌리지 않는다", async () => {
  const harness = createHarness();
  seedUser(harness);
  seedBaseShop(harness);
  await runSubmit(harness, { selectedIndex: 0 });
  const second = await runSubmit(harness, {
    requestId: OTHER_REQUEST_ID,
    attemptSlot: 2,
  });
  assert(
    second.result.status === "ready" && second.state.progress.attempts === 2 &&
      second.state.progress.solved,
    "second attempt did not finish",
  );

  const replay = await runSubmit(harness, { selectedIndex: 0 });

  assert(replay.alreadyCompleted, "first attempt replay missing");
  assert(replay.state.progress.attempts === 2, "second attempt was reverted");
  assert(replay.state.progress.solved, "second solved state was reverted");
  assert(harness.commits.length === 2, "nonterminal replay wrote a repair");
});

Deno.test("첫 오답 replay도 둘째 terminal semantic 상태와 당일 marker를 복구한다", async () => {
  const harness = createHarness();
  seedUser(harness);
  seedBaseShop(harness);
  await runSubmit(harness, { selectedIndex: 0 });
  const second = await runSubmit(harness, {
    requestId: OTHER_REQUEST_ID,
    attemptSlot: 2,
  });
  assert(
    second.result.status === "ready" && second.result.isCorrect &&
      second.result.reward === 5,
    "second terminal result missing",
  );
  const user = harness.data(`users/${UID}`)!;
  harness.setDocument(`users/${UID}`, {
    ...user,
    quizRewardDate: null,
    quizRewardAmount: 0,
    quizProgress: {
      [PROGRESS_KEY]: {
        attempts: 1,
        solved: false,
        skipped: true,
        quizKey: QUIZ_KEY,
        reward: 0,
        updatedDate: TODAY,
      },
    },
  });

  const replay = await runSubmit(harness, { selectedIndex: 0 });

  assert(replay.alreadyCompleted, "first request replay missing");
  assert(
    replay.result.status === "ready" && !replay.result.isCorrect,
    "A result",
  );
  assert(
    replay.state.progress.attempts === 2 && replay.state.progress.solved &&
      replay.state.progress.reward === 5,
    "B terminal semantic state was not restored",
  );
  assert(
    replay.state.quizRewardDate === TODAY &&
      replay.state.quizRewardAmount === 5,
    "B reward marker was not restored",
  );
  const storedProgress = record(
    record(harness.data(`users/${UID}`)?.quizProgress)?.[PROGRESS_KEY],
  );
  assert(
    storedProgress?.attempts === 2 && storedProgress.solved === true,
    "canonical terminal progress was not stored",
  );
  assert(harness.commits.length === 3, "canonical repair commit mismatch");
});

Deno.test("safe integer가 아닌 잔액과 네 개 이상의 canonical roster를 거부한다", async () => {
  const invalidBalance = createHarness();
  seedUser(invalidBalance, { talent: "5" });
  seedBaseShop(invalidBalance);
  await expectPlatformError(runSubmit(invalidBalance), "CONFLICT");
  assert(invalidBalance.commits.length === 0, "invalid balance wrote data");

  const tooMany = createHarness();
  seedUser(tooMany);
  seedBaseShop(tooMany);
  for (const orgId of ["a", "b", "c", "d"]) {
    seedRoster(tooMany, orgId, 0);
  }
  await expectPlatformError(runSubmit(tooMany), "CONFLICT");
  assert(tooMany.commits.length === 0, "too many rosters wrote data");
});

Deno.test("commit 실패는 progress, balance, ledger를 모두 남기지 않는다", async () => {
  const harness = createHarness({ failNextCommitStatus: 500 });
  seedUser(harness);
  seedBaseShop(harness);
  seedRoster(harness, "alpha", 1);

  await expectPlatformError(runSubmit(harness), "FIRESTORE_WRITE_FAILED");

  assert(harness.data(`users/${UID}`)?.talent === 5, "user partially updated");
  assert(
    harness.data(`users/${UID}`)?.quizProgress === undefined,
    "progress partially updated",
  );
  assert(
    harness.data(`churches/alpha/roster/${UID}`)?.talent === 1,
    "roster partially updated",
  );
  assert(
    !harness.data(`users/${UID}/activityActions/${REQUEST_ID}`),
    "ledger partially updated",
  );
  assert(harness.rollbacks === 1, "transaction was not rolled back");
});

Deno.test("409 contention은 fresh transaction에서 재계산해 정확히 한 번 저장한다", async () => {
  const harness = createHarness({ failNextCommitStatus: 409 });
  seedUser(harness);
  seedBaseShop(harness);

  const response = await runSubmit(harness, { requestId: OTHER_REQUEST_ID });

  assert(response.result.status === "ready", "retry result mismatch");
  assert(harness.transactions.length === 2, "contention was not retried");
  assert(harness.commits.length === 1, "retry committed more than once");
  assert(
    harness.data(`users/${UID}`)?.talent === 15,
    "retry reward mismatch",
  );
});

Deno.test("transaction 시작의 read 409도 bounded retry한다", async () => {
  const harness = createHarness({ failNextBeginStatus: 409 });
  seedUser(harness);
  seedBaseShop(harness);

  const response = await runSubmit(harness);

  assert(response.result.status === "ready", "begin retry result mismatch");
  assert(harness.transactions.length === 1, "fresh transaction was not opened");
  assert(harness.commits.length === 1, "begin retry committed more than once");
  assert(
    harness.data(`users/${UID}`)?.talent === 15,
    "begin retry reward mismatch",
  );
});

Deno.test("비정규 기본 공동체와 기본·roster 중복 지갑은 보상 전에 거부한다", async () => {
  const nonCanonical = createHarness();
  seedUser(nonCanonical, { baseChurchId: " base" });
  await expectPlatformError(runSubmit(nonCanonical), "CONFLICT");
  assert(nonCanonical.commits.length === 0, "non-canonical org wrote data");

  const duplicate = createHarness();
  seedUser(duplicate);
  seedRoster(duplicate, "base", 1);
  await expectPlatformError(runSubmit(duplicate), "CONFLICT");
  assert(duplicate.commits.length === 0, "duplicate wallet wrote data");

  const conflictingBase = createHarness();
  seedUser(conflictingBase, { churchId: "other" });
  await expectPlatformError(runSubmit(conflictingBase), "CONFLICT");
  assert(
    conflictingBase.commits.length === 0,
    "conflicting base org wrote data",
  );

  const oversizedOrgId = "x".repeat(129);
  const malformedRoster = createHarness();
  seedUser(malformedRoster);
  seedRoster(malformedRoster, oversizedOrgId, 1);
  await expectPlatformError(runSubmit(malformedRoster), "CONFLICT");
  assert(malformedRoster.commits.length === 0, "unsafe roster org wrote data");
});

Deno.test("손상된 퀴즈 날짜·진행 상태는 commit 전에 거부한다", async () => {
  const badEpoch = createHarness();
  seedUser(badEpoch, { readingEpoch: "1" });
  seedBaseShop(badEpoch);
  await expectPlatformError(runSubmit(badEpoch), "CONFLICT");
  assert(badEpoch.commits.length === 0, "bad reading epoch committed");

  const badRewardDate = createHarness();
  seedUser(badRewardDate, { quizRewardDate: 123 });
  seedBaseShop(badRewardDate);
  await expectPlatformError(
    runSubmit(badRewardDate, { selectedIndex: 0 }),
    "CONFLICT",
  );
  assert(badRewardDate.commits.length === 0, "bad reward date committed");
  assert(
    !badRewardDate.data(`users/${UID}/activityActions/${REQUEST_ID}`),
    "bad reward date left a ledger",
  );

  const badEntry = createHarness();
  seedUser(badEntry, {
    quizProgress: {
      [PROGRESS_KEY]: {
        attempts: 1,
        solved: "false",
        skipped: false,
        quizKey: QUIZ_KEY,
        reward: 0,
        updatedDate: TODAY,
      },
    },
  });
  seedBaseShop(badEntry);
  await expectPlatformError(runSubmit(badEntry), "CONFLICT");
  assert(badEntry.commits.length === 0, "bad progress committed");

  const impossibleReward = createHarness();
  seedUser(impossibleReward, {
    quizProgress: {
      [PROGRESS_KEY]: {
        attempts: 1,
        solved: false,
        skipped: false,
        quizKey: QUIZ_KEY,
        reward: 10,
        updatedDate: TODAY,
      },
    },
  });
  seedBaseShop(impossibleReward);
  await expectPlatformError(runSubmit(impossibleReward), "CONFLICT");
  assert(impossibleReward.commits.length === 0, "impossible reward committed");

  const impossibleSkip = createHarness();
  seedUser(impossibleSkip, {
    quizProgress: {
      [PROGRESS_KEY]: {
        attempts: 2,
        solved: false,
        skipped: true,
        quizKey: QUIZ_KEY,
        reward: 0,
        updatedDate: TODAY,
      },
    },
  });
  seedBaseShop(impossibleSkip);
  await expectPlatformError(runSkip(impossibleSkip), "CONFLICT");
  assert(impossibleSkip.commits.length === 0, "impossible skip committed");

  const invalidLegacyKey = createHarness();
  seedUser(invalidLegacyKey, {
    quizDate: TODAY,
    quizAttempts: 1,
    quizSolved: false,
    quizSkipped: false,
    quizKey: "bad key",
  });
  seedBaseShop(invalidLegacyKey);
  await expectPlatformError(runSubmit(invalidLegacyKey), "CONFLICT");
  assert(invalidLegacyKey.commits.length === 0, "bad legacy key committed");

  const futureMarker = createHarness();
  seedUser(futureMarker, { quizRewardDate: "Wed Jul 15 2026" });
  seedBaseShop(futureMarker);
  await expectPlatformError(runSubmit(futureMarker), "CONFLICT");
  assert(futureMarker.commits.length === 0, "future reward marker committed");
});

Deno.test("퀴즈 보상은 공통 달란트 잔액 상한을 넘지 않는다", async () => {
  const harness = createHarness();
  seedUser(harness, { talent: 1_000_000_000 });
  seedBaseShop(harness);
  await expectPlatformError(runSubmit(harness), "CONFLICT");
  assert(harness.commits.length === 0, "talent limit overflowed");
});
