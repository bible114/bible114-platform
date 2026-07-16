import { PlatformError } from "../_shared/errors.ts";
import type {
  FirestoreDocument,
  FirestoreWrite,
} from "../_shared/firestore.ts";
import { rebuildPublicChurches } from "./publicDirectoryService.ts";

const SERVICE = { token: "service-token", projectId: "test-project" };
const NOW = new Date("2026-07-16T01:02:03.000Z");
const REQUEST_ID = "123e4567-e89b-42d3-a456-426614174000";
const TAKEOVER_REQUEST_ID = "123e4567-e89b-42d3-a456-426614174001";

type TestWrite =
  | {
    kind: "update";
    path: string;
    data: Record<string, unknown>;
    options: {
      updateMask?: string[];
      exists?: boolean;
      updateTime?: string;
    };
  }
  | { kind: "delete"; path: string; exists?: boolean };

const assert = (condition: unknown, message: string) => {
  if (!condition) throw new Error(message);
};

const assertEquals = (actual: unknown, expected: unknown, message: string) => {
  const actualJson = JSON.stringify(actual);
  const expectedJson = JSON.stringify(expected);
  if (actualJson !== expectedJson) {
    throw new Error(`${message}: expected ${expectedJson}, got ${actualJson}`);
  }
};

const deferred = () => {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
};

const document = <T extends Record<string, unknown>>(
  collection: string,
  id: string,
  data: T,
  updateTime?: string,
): FirestoreDocument<T> => ({
  name:
    `projects/test-project/databases/(default)/documents/${collection}/${id}`,
  fields: {},
  data,
  ...(updateTime ? { updateTime } : {}),
});

type HarnessOptions = {
  sources?: FirestoreDocument<Record<string, unknown>>[];
  publicDocuments?: FirestoreDocument<Record<string, unknown>>[];
  legacy?: FirestoreDocument<Record<string, unknown>> | null;
  failLegacyStatus?: number;
  failLegacyCanonicalStatus?: string;
  failAfterAcquireCommit?: boolean;
  writeBatchSize?: number;
  initialLock?: Record<string, unknown>;
  onAfterCommit?: (writes: TestWrite[]) => void | Promise<void>;
};

const createHarness = (options: HarnessOptions = {}) => {
  const commits: TestWrite[][] = [];
  const listCalls: string[] = [];
  const getCalls: string[] = [];
  const operationCalls: string[] = [];
  const rollbacks: string[] = [];
  const sources = options.sources ?? [];
  const publicDocuments = options.publicDocuments ?? [];
  const legacy = options.legacy ?? null;
  const transactionLockVersions = new Map<string, number>();
  let transactionCount = 0;
  let lockVersion = options.initialLock ? 1 : 0;
  let lock: FirestoreDocument<Record<string, unknown>> | null =
    options.initialLock
      ? document(
        "platformInternal",
        "publicDirectoryRebuild",
        structuredClone(options.initialLock),
        new Date(NOW.getTime() - 1).toISOString(),
      )
      : null;
  let nowMs = NOW.getTime();
  let ownerSequence = 0;
  let onAfterCommit = options.onAfterCommit;
  let acquireResponseLost = false;

  const listCollectionDocuments = async <T>(
    _token: string,
    _projectId: string,
    collectionPath: string,
  ): Promise<FirestoreDocument<T>[]> => {
    listCalls.push(collectionPath);
    operationCalls.push(`list:${collectionPath}`);
    return (collectionPath === "churches"
      ? sources
      : publicDocuments) as FirestoreDocument<T>[];
  };
  const getDocument = async <T>(
    _token: string,
    _projectId: string,
    path: string,
    readOptions: { transaction?: string } = {},
  ): Promise<FirestoreDocument<T> | null> => {
    getCalls.push(path);
    operationCalls.push(`get:${path}`);
    if (path === "platformInternal/publicDirectoryRebuild") {
      if (readOptions.transaction) {
        transactionLockVersions.set(readOptions.transaction, lockVersion);
      }
      return lock
        ? ({ ...lock, data: structuredClone(lock.data) } as FirestoreDocument<
          T
        >)
        : null;
    }
    return legacy as FirestoreDocument<T> | null;
  };
  const updateWrite = (
    _projectId: string,
    path: string,
    data: Record<string, unknown>,
    writeOptions: {
      updateMask?: string[];
      exists?: boolean;
      updateTime?: string;
    } = {},
  ): FirestoreWrite => ({
    kind: "update",
    path,
    data,
    options: writeOptions,
  } as unknown as FirestoreWrite);
  const deleteWrite = (
    _projectId: string,
    path: string,
    exists?: boolean,
  ): FirestoreWrite => ({
    kind: "delete",
    path,
    exists,
  } as unknown as FirestoreWrite);
  const commitWrites = async (
    _token: string,
    _projectId: string,
    writes: FirestoreWrite[],
    commitOptions: { transaction?: string } = {},
  ) => {
    const testWrites = writes as unknown as TestWrite[];
    if (
      commitOptions.transaction &&
      transactionLockVersions.get(commitOptions.transaction) !== lockVersion
    ) {
      throw new PlatformError("FIRESTORE_WRITE_FAILED", {
        details: { status: 409 },
      });
    }
    if (
      options.failLegacyStatus &&
      testWrites.some((write) => write.path === "settings/churchDirectory")
    ) {
      throw new PlatformError("FIRESTORE_WRITE_FAILED", {
        details: {
          status: options.failLegacyStatus,
          ...(options.failLegacyCanonicalStatus
            ? { canonicalStatus: options.failLegacyCanonicalStatus }
            : {}),
        },
      });
    }
    commits.push(testWrites);
    for (const write of testWrites) {
      if (write.path !== "platformInternal/publicDirectoryRebuild") continue;
      lockVersion += 1;
      if (write.kind === "delete") {
        lock = null;
      } else {
        lock = document(
          "platformInternal",
          "publicDirectoryRebuild",
          structuredClone(write.data),
          new Date(nowMs + lockVersion).toISOString(),
        );
      }
    }
    await onAfterCommit?.(testWrites);
    if (
      options.failAfterAcquireCommit && !acquireResponseLost &&
      testWrites.some((write) =>
        write.kind === "update" &&
        write.path === "publicDirectoryMeta/current" &&
        write.data.ready === false
      )
    ) {
      acquireResponseLost = true;
      throw new PlatformError("FIRESTORE_WRITE_FAILED", {
        details: { status: 503 },
      });
    }
    return {};
  };
  const beginTransaction = async () => {
    transactionCount += 1;
    return `transaction-${transactionCount}`;
  };
  const rollbackTransaction = async (
    _token: string,
    _projectId: string,
    transaction: string,
  ) => {
    rollbacks.push(transaction);
  };

  return {
    commits,
    getCalls,
    listCalls,
    operationCalls,
    rollbacks,
    get lock() {
      return lock;
    },
    get transactionCount() {
      return transactionCount;
    },
    setNow(value: Date) {
      nowMs = value.getTime();
    },
    setAfterCommit(
      hook: ((writes: TestWrite[]) => void | Promise<void>) | undefined,
    ) {
      onAfterCommit = hook;
    },
    dependencies: {
      beginTransaction: beginTransaction as never,
      listCollectionDocuments: listCollectionDocuments as never,
      getDocument: getDocument as never,
      updateWrite: updateWrite as never,
      deleteWrite: deleteWrite as never,
      commitWrites: commitWrites as never,
      rollbackTransaction: rollbackTransaction as never,
      createOwnerToken: () => `owner-${++ownerSequence}`,
      now: () => new Date(nowMs),
      ...(options.writeBatchSize
        ? { writeBatchSize: options.writeBatchSize }
        : {}),
    },
  };
};

const standardFixture = () => ({
  sources: [
    document("churches", "b", {
      name: " Beta ",
      hiddenFromDirectory: true,
      churchCodeHash: "must-not-leak",
    }),
    document("churches", "a", { name: "Alpha" }),
    document("churches", "deleted", {
      name: "Deleted",
      isDeleted: true,
    }),
    document("churches", "unaffiliated_v1", { name: "개인" }),
  ],
  publicDocuments: [
    document("publicChurches", "a", { id: "a", name: "Alpha" }),
    document("publicChurches", "b", {
      id: "b",
      name: "old",
      codeHash: "must-be-removed",
    }),
    document("publicChurches", "stale", { id: "stale", name: "Stale" }),
  ],
  legacy: document(
    "settings",
    "churchDirectory",
    { churches: [{ id: "old", name: "Old" }] },
    "2026-07-16T00:00:00.000001Z",
  ),
});

Deno.test("public directory dry-run scans all sources and performs zero writes", async () => {
  const harness = createHarness(standardFixture());
  const result = await rebuildPublicChurches(
    SERVICE,
    { requestId: REQUEST_ID, dryRun: true },
    harness.dependencies,
  );

  assertEquals(result, {
    dryRun: true,
    applied: false,
    mode: "legacy",
    summary: {
      sourceCount: 4,
      expectedCount: 2,
      publicCount: 3,
      legacyCount: 1,
      upsertCount: 1,
      deleteCount: 1,
      legacyChanged: true,
      invalidCount: 0,
    },
  }, "dry-run summary mismatch");
  assertEquals(harness.commits, [], "dry-run wrote to Firestore");
  assertEquals(
    harness.listCalls.sort(),
    ["churches", "publicChurches"],
    "collections were not both scanned",
  );
  assertEquals(
    harness.getCalls,
    ["settings/churchDirectory"],
    "legacy directory was not read",
  );
  assertEquals(
    harness.operationCalls[0],
    "get:settings/churchDirectory",
    "legacy updateTime fence was not captured before collection scans",
  );
  assertEquals(harness.transactionCount, 0, "dry-run opened a transaction");
});

Deno.test("map key order changes do not create false public or legacy diffs", async () => {
  const harness = createHarness({
    sources: [
      document("churches", "b", {
        name: "Beta",
        hiddenFromDirectory: true,
      }),
      document("churches", "a", { name: "Alpha" }),
    ],
    publicDocuments: [
      document("publicChurches", "a", { name: "Alpha", id: "a" }),
      document("publicChurches", "b", {
        hidden: true,
        name: "Beta",
        id: "b",
      }),
    ],
    legacy: document(
      "settings",
      "churchDirectory",
      {
        churches: [
          { name: "Alpha", id: "a" },
          { hidden: true, name: "Beta", id: "b" },
        ],
      },
      "2026-07-16T00:00:00.000001Z",
    ),
  });

  const preview = await rebuildPublicChurches(
    SERVICE,
    { requestId: REQUEST_ID, dryRun: true },
    harness.dependencies,
  );

  assertEquals(preview.summary.upsertCount, 0, "key order caused an upsert");
  assertEquals(
    preview.summary.legacyChanged,
    false,
    "key order caused a legacy rewrite",
  );
  assertEquals(harness.commits.length, 0, "idempotent preview wrote data");
});

Deno.test("public and legacy projections use the client code-point order", async () => {
  const harness = createHarness({
    sources: [
      document("churches", "emoji", { name: "😀 교회" }),
      document("churches", "bmp", { name: "\uE000 교회" }),
    ],
    legacy: document(
      "settings",
      "churchDirectory",
      { churches: [] },
      "2026-07-16T00:00:00.000001Z",
    ),
  });
  await rebuildPublicChurches(
    SERVICE,
    { requestId: REQUEST_ID, dryRun: false },
    harness.dependencies,
  );
  const legacyWrite = harness.commits.flat().find((write) =>
    write.kind === "update" && write.path === "settings/churchDirectory"
  );
  assert(
    legacyWrite?.kind === "update",
    "legacy projection write was missing",
  );
  if (legacyWrite?.kind !== "update") return;
  assertEquals(
    (legacyWrite.data.churches as Array<{ id: string }>).map(({ id }) => id),
    ["bmp", "emoji"],
    "server order drifted from the client code-point comparator",
  );
});

Deno.test("execute writes exact public fields, deletes stale rows, fences legacy, and publishes meta last", async () => {
  const harness = createHarness({ ...standardFixture(), writeBatchSize: 1 });
  const result = await rebuildPublicChurches(
    SERVICE,
    { requestId: REQUEST_ID, dryRun: false },
    harness.dependencies,
  );

  assert(result.applied && !result.dryRun, "execute result was not applied");
  assertEquals(harness.commits.length, 5, "unexpected commit sequence");
  assertEquals(
    harness.commits[0].map(({ path }) => path),
    [
      "platformInternal/publicDirectoryRebuild",
      "publicDirectoryMeta/current",
    ],
    "lock and meta safety gate were not acquired atomically first",
  );
  assert(
    harness.commits[0][0].kind === "update" &&
      harness.commits[0][0].data.runId === REQUEST_ID &&
      harness.commits[0][0].data.ownerToken === "owner-1",
    "lock owner mismatch",
  );
  assertEquals(harness.commits[1].slice(1), [{
    kind: "update",
    path: "publicChurches/b",
    data: { id: "b", name: "Beta", hidden: true },
    options: {},
  }], "public upsert was not minimal and exact");
  assertEquals(harness.commits[2].slice(1), [{
    kind: "delete",
    path: "publicChurches/stale",
    exists: undefined,
  }], "stale public document was not deleted");
  assertEquals(harness.commits[3].slice(1), [{
    kind: "update",
    path: "settings/churchDirectory",
    data: {
      churches: [
        { id: "a", name: "Alpha" },
        { id: "b", name: "Beta", hidden: true },
      ],
      updatedAt: NOW,
    },
    options: { updateTime: "2026-07-16T00:00:00.000001Z" },
  }], "legacy mirror or updateTime fence mismatch");
  assertEquals(
    harness.commits[4].map(({ path }) => path),
    [
      "publicDirectoryMeta/current",
      "platformInternal/publicDirectoryRebuild",
    ],
    "ready meta and lock release were not atomic and last",
  );
  const finalMeta = harness.commits[4][0];
  assert(
    finalMeta.kind === "update" && finalMeta.data.ready === true &&
      finalMeta.data.count === 2,
    "ready meta payload mismatch",
  );
  assert(
    harness.commits[4][1].kind === "delete",
    "final lock was not deleted",
  );
  assert(
    harness.commits.every((writes) => writes.length <= 2),
    "configured write batch ceiling was exceeded",
  );
  assertEquals(harness.lock, null, "lock survived successful completion");
});

Deno.test("missing legacy document is protected with an exists:false fence", async () => {
  const harness = createHarness({
    sources: [document("churches", "a", { name: "Alpha" })],
    legacy: null,
  });
  await rebuildPublicChurches(
    SERVICE,
    { requestId: REQUEST_ID, dryRun: false },
    harness.dependencies,
  );
  const legacyWrite = harness.commits.flat().find((write) =>
    write.path === "settings/churchDirectory"
  );
  assertEquals(
    legacyWrite && "options" in legacyWrite ? legacyWrite.options : null,
    { exists: false },
    "missing legacy fence mismatch",
  );
});

Deno.test("invalid source fields are report-only in dry-run and fail closed on execute", async () => {
  const harness = createHarness({
    sources: [
      document("churches", " bad", { name: "Bad id" }),
      document("churches", "bad-name", { name: "bad\u0000name" }),
      document("churches", "bad-delete", {
        name: "Bad delete",
        isDeleted: "false",
      }),
      document("churches", "bad-hidden", {
        name: "Bad hidden",
        hiddenFromDirectory: 1,
      }),
      document("churches", "good", { name: "Good" }),
    ],
  });
  const preview = await rebuildPublicChurches(
    SERVICE,
    { requestId: REQUEST_ID, dryRun: true },
    harness.dependencies,
  );
  assertEquals(preview.summary.invalidCount, 4, "invalid count mismatch");
  assertEquals(preview.summary.expectedCount, 1, "valid source was lost");
  assertEquals(harness.commits.length, 0, "invalid dry-run wrote data");

  try {
    await rebuildPublicChurches(
      SERVICE,
      { requestId: REQUEST_ID, dryRun: false },
      harness.dependencies,
    );
    throw new Error("expected invalid source rejection");
  } catch (error) {
    assert(
      error instanceof PlatformError && error.code === "CONFLICT",
      "invalid execute did not fail closed",
    );
  }
  assertEquals(harness.commits.length, 0, "invalid execute wrote data");
});

Deno.test("an active lease rejects a different run without changing meta or lock", async () => {
  const activeLease = new Date(NOW.getTime() + 60_000).toISOString();
  const harness = createHarness({
    ...standardFixture(),
    initialLock: {
      runId: TAKEOVER_REQUEST_ID,
      ownerToken: "active-owner",
      leaseExpiresAt: activeLease,
      updatedAt: NOW,
    },
  });
  try {
    await rebuildPublicChurches(
      SERVICE,
      { requestId: REQUEST_ID, dryRun: false },
      harness.dependencies,
    );
    throw new Error("expected active lease rejection");
  } catch (error) {
    assert(
      error instanceof PlatformError && error.code === "CONFLICT" &&
        error.retryable,
      "active lease was not a retryable conflict",
    );
  }
  assertEquals(harness.commits.length, 0, "active lease was overwritten");
  assert(
    harness.lock?.data.ownerToken === "active-owner",
    "active lock owner changed",
  );
});

Deno.test("a lost acquire response releases only the ambiguous owner lease", async () => {
  const harness = createHarness({
    ...standardFixture(),
    failAfterAcquireCommit: true,
  });
  try {
    await rebuildPublicChurches(
      SERVICE,
      { requestId: REQUEST_ID, dryRun: false },
      harness.dependencies,
    );
    throw new Error("expected ambiguous acquire failure");
  } catch (error) {
    assert(
      error instanceof PlatformError && error.code === "FIRESTORE_WRITE_FAILED",
      "ambiguous acquire error changed unexpectedly",
    );
  }
  assertEquals(harness.lock, null, "ambiguous acquire left its lease behind");
  const readyWrites = harness.commits.flat().filter((write) =>
    write.kind === "update" &&
    write.path === "publicDirectoryMeta/current" && write.data.ready === true
  );
  assertEquals(readyWrites.length, 0, "ambiguous acquire published ready meta");
});

Deno.test("an expired lease is taken over and the new run completes", async () => {
  const harness = createHarness({
    ...standardFixture(),
    initialLock: {
      runId: TAKEOVER_REQUEST_ID,
      ownerToken: "expired-owner",
      leaseExpiresAt: new Date(NOW.getTime() - 1).toISOString(),
      updatedAt: new Date(NOW.getTime() - 600_001),
    },
  });
  const result = await rebuildPublicChurches(
    SERVICE,
    { requestId: REQUEST_ID, dryRun: false },
    harness.dependencies,
  );
  const acquiredLock = harness.commits[0].find((write) =>
    write.path === "platformInternal/publicDirectoryRebuild"
  );
  assert(
    result.applied && acquiredLock?.kind === "update" &&
      acquiredLock.data.runId === REQUEST_ID &&
      acquiredLock.data.ownerToken === "owner-1",
    "expired lease was not taken over",
  );
  assertEquals(harness.lock, null, "takeover lock survived completion");
});

Deno.test("the same requestId can safely resume an active abandoned run", async () => {
  const harness = createHarness({
    ...standardFixture(),
    initialLock: {
      runId: REQUEST_ID,
      ownerToken: "abandoned-owner",
      leaseExpiresAt: new Date(NOW.getTime() + 60_000).toISOString(),
      updatedAt: NOW,
    },
  });
  const result = await rebuildPublicChurches(
    SERVICE,
    { requestId: REQUEST_ID, dryRun: false },
    harness.dependencies,
  );
  const reacquired = harness.commits[0].find((write) =>
    write.kind === "update" &&
    write.path === "platformInternal/publicDirectoryRebuild"
  );
  assert(
    result.applied && reacquired?.kind === "update" &&
      reacquired.data.ownerToken === "owner-1",
    "same requestId did not receive a fresh owner token",
  );
  assertEquals(harness.lock, null, "resumed run did not release its lock");
});

Deno.test("owner takeover blocks every stale batch and stale cleanup", async () => {
  const harness = createHarness({ ...standardFixture(), writeBatchSize: 1 });
  const firstAcquired = deferred();
  const releaseFirst = deferred();
  const takeoverReachedLegacy = deferred();
  const releaseTakeover = deferred();

  harness.setAfterCommit(async (writes) => {
    const lockWrite = writes.find((write) =>
      write.kind === "update" &&
      write.path === "platformInternal/publicDirectoryRebuild"
    );
    if (
      lockWrite?.kind === "update" && lockWrite.data.runId === REQUEST_ID &&
      writes.some((write) =>
        write.path === "publicDirectoryMeta/current" &&
        write.kind === "update" && write.data.ready === false
      )
    ) {
      firstAcquired.resolve();
      await releaseFirst.promise;
    }
    if (
      lockWrite?.kind === "update" &&
      lockWrite.data.runId === TAKEOVER_REQUEST_ID &&
      writes.some((write) => write.path === "settings/churchDirectory")
    ) {
      takeoverReachedLegacy.resolve();
      await releaseTakeover.promise;
    }
  });

  const firstOutcomePromise = rebuildPublicChurches(
    SERVICE,
    { requestId: REQUEST_ID, dryRun: false },
    harness.dependencies,
  ).then(
    () => ({ ok: true as const, error: null }),
    (error: unknown) => ({ ok: false as const, error }),
  );
  await firstAcquired.promise;

  harness.setNow(new Date(NOW.getTime() + 11 * 60_000));
  const takeoverPromise = rebuildPublicChurches(
    SERVICE,
    { requestId: TAKEOVER_REQUEST_ID, dryRun: false },
    harness.dependencies,
  );
  await takeoverReachedLegacy.promise;
  assert(
    harness.lock?.data.runId === TAKEOVER_REQUEST_ID &&
      harness.lock?.data.ownerToken === "owner-2",
    "takeover owner was not installed",
  );

  releaseFirst.resolve();
  const firstOutcome = await firstOutcomePromise;
  assert(
    !firstOutcome.ok && firstOutcome.error instanceof PlatformError &&
      firstOutcome.error.code === "CONFLICT",
    "stale owner was not rejected",
  );
  const staleMutation = harness.commits.some((writes) =>
    writes.some((write) =>
      write.kind === "update" &&
      write.path === "platformInternal/publicDirectoryRebuild" &&
      write.data.ownerToken === "owner-1"
    ) && writes.some((write) =>
      write.path.startsWith("publicChurches/") ||
      write.path === "settings/churchDirectory"
    )
  );
  assert(!staleMutation, "stale owner committed a projection batch");
  assert(
    harness.lock?.data.ownerToken === "owner-2",
    "stale cleanup deleted the takeover lock",
  );

  releaseTakeover.resolve();
  const takeover = await takeoverPromise;
  assert(takeover.applied, "takeover run did not finish");
  assertEquals(harness.lock, null, "takeover final lock was not released");
});

Deno.test("legacy updateTime conflict is retryable and never publishes ready meta", async () => {
  const harness = createHarness({
    ...standardFixture(),
    failLegacyStatus: 400,
    failLegacyCanonicalStatus: "FAILED_PRECONDITION",
  });
  try {
    await rebuildPublicChurches(
      SERVICE,
      { requestId: REQUEST_ID, dryRun: false },
      harness.dependencies,
    );
    throw new Error("expected concurrent legacy conflict");
  } catch (error) {
    assert(
      error instanceof PlatformError && error.code === "CONFLICT" &&
        error.retryable,
      "legacy conflict was not mapped to retryable conflict",
    );
  }
  const metaWrites = harness.commits.flat().filter((write) =>
    write.path === "publicDirectoryMeta/current"
  );
  assertEquals(metaWrites.length, 1, "ready meta was written after conflict");
  assert(
    metaWrites[0].kind === "update" && metaWrites[0].data.ready === false,
    "safety meta was not left closed",
  );
  assertEquals(harness.lock, null, "failed owner lock was not released");
});
