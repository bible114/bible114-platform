import { PlatformError } from "../_shared/errors.ts";
import {
  decodeFirestoreFields,
  type FirestoreValue,
  type FirestoreWrite,
  updateWrite,
} from "../_shared/firestore.ts";
import {
  nextPlatformStatsAfterSignup,
  rebuildPlatformStats,
  type RebuildPlatformStatsDependencies,
} from "./platformStatsService.ts";

const assert = (condition: unknown, message = "assertion failed") => {
  if (!condition) throw new Error(message);
};
type UpdateWriteShape = {
  update?: {
    name?: string;
    fields?: Record<string, FirestoreValue>;
  };
  updateMask?: { fieldPaths?: string[] };
};
const updateShape = (write: FirestoreWrite) => write as UpdateWriteShape;

Deno.test("가입 통계는 없는 원장을 만들고 기존 원장은 정확히 증가시킨다", () => {
  const now = new Date("2026-07-17T00:00:00.000Z");
  const created = nextPlatformStatsAfterSignup(null, {
    readerDelta: 1,
    churchDelta: 1,
    now,
  });
  assert(created.total_readers === 1 && created.total_churches === 1);
  const incremented = nextPlatformStatsAfterSignup({
    total_readers: 10,
    total_churches: 3,
  }, { readerDelta: 1, churchDelta: 0, now });
  assert(
    incremented.total_readers === 11 && incremented.total_churches === 3,
  );
  const reactivated = nextPlatformStatsAfterSignup(incremented, {
    readerDelta: 0,
    churchDelta: 0,
    now,
  });
  assert(
    reactivated.total_readers === 11 && reactivated.total_churches === 3,
    "reactivation must not duplicate signup counters",
  );
});

Deno.test("가입 통계 원장이 손상되면 추정하지 않고 재계산을 요구한다", () => {
  try {
    nextPlatformStatsAfterSignup({ total_readers: "10", total_churches: 3 }, {
      readerDelta: 1,
      churchDelta: 0,
      now: new Date(),
    });
  } catch (error) {
    assert(error instanceof PlatformError && error.code === "CONFLICT");
    return;
  }
  throw new Error("corrupt stats accepted");
});

Deno.test("통계 재계산은 활성 사용자와 실제 공동체 스냅샷을 계산하고 반영한다", async () => {
  const projectId = "test-project";
  const prefix = `projects/${projectId}/databases/(default)/documents/`;
  const document = (path: string, data: Record<string, unknown>) => ({
    name: `${prefix}${path}`,
    fields: {},
    data,
    updateTime: "2026-07-17T00:00:00.000000Z",
  });
  const commits: FirestoreWrite[][] = [];
  const dependencies: RebuildPlatformStatsDependencies = {
    getDocument: (_token, _project, path) =>
      Promise.resolve(
        path === "users/admin"
          ? document(path, { role: "platformAdmin", isDeleted: false })
          : document(path, {
            total_readers: 99,
            total_churches: 99,
            readers_today: 99,
            finished_total: 99,
            today_date: "stale",
          }),
      ) as never,
    listCollectionDocuments: (_token, _project, path) => {
      if (path === "users") {
        return Promise.resolve([
          document("users/admin", {
            role: "platformAdmin",
            readCount: 1,
            lastReadDate: "Fri Jul 17 2026",
          }),
          document("users/member", {
            role: "member",
            readCount: 4,
            lastReadDate: "Fri Jul 17 2026",
          }),
          document("users/test-account", {
            role: "member",
            readCount: 99,
            lastReadDate: "Fri Jul 17 2026",
            excludeFromPublicStats: true,
          }),
          document("users/deleted", { isDeleted: true, readCount: 8 }),
        ]) as never;
      }
      if (path === "churches") {
        return Promise.resolve([
          document("churches/real", { isDeleted: false }),
          document("churches/external", { isDeleted: false }),
          document("churches/deleted", { isDeleted: true }),
          document("churches/unaffiliated_v1", { isVirtual: true }),
        ]) as never;
      }
      return Promise.resolve([
        document("platformExternalStats/sungseo", {
          enabled: true,
          churchId: "external",
          total_readers: 205,
          readers_today: 17,
          finished_total: 42,
          today_date: "Fri Jul 17 2026",
        }),
        document("platformExternalStats/stale", {
          enabled: true,
          churchId: "external",
          total_readers: 5,
          readers_today: 5,
          finished_total: 1,
          today_date: "Thu Jul 16 2026",
        }),
        document("platformExternalStats/orphan", {
          enabled: true,
          churchId: "missing",
          total_readers: 999,
          readers_today: 999,
          finished_total: 999,
          today_date: "Fri Jul 17 2026",
        }),
      ]) as never;
    },
    commitWrites: (_token, _project, writes) => {
      commits.push(writes);
      return Promise.resolve({}) as never;
    },
    updateWrite,
    now: () => new Date("2026-07-17T03:00:00.000Z"),
  };
  const result = await rebuildPlatformStats(
    { token: "token", projectId },
    { uid: "admin", anonymous: false },
    { dryRun: false },
    dependencies,
  );
  assert(result.applied === true && commits.length === 1);
  assert(result.expected.total_readers === 212);
  assert(result.expected.total_churches === 2);
  assert(result.expected.readers_today === 19);
  assert(result.expected.finished_total === 46);
  assert(result.externalSources.length === 2);
  assert(
    result.markerBackfill.total === 4 &&
      result.markerBackfill.toCounted === 2 &&
      result.markerBackfill.toUncounted === 2,
    "user counted marker backfill mismatch",
  );
  const markerWrites = commits[0].filter((write) =>
    String(updateShape(write).update?.name || "").includes("/documents/users/")
  );
  assert(markerWrites.length === 4, "all missing markers must be backfilled");
  const statsWrite = commits[0].find((write) =>
    String(updateShape(write).update?.name || "").endsWith(
      "/settings/platformStats",
    )
  );
  assert(
    statsWrite &&
      updateShape(statsWrite).updateMask?.fieldPaths?.includes("total_readers"),
  );
  assert(
    !statsWrite ||
      !updateShape(statsWrite).updateMask?.fieldPaths?.includes(
        "publicNationalRankingDisabledAt",
      ),
    "rebuild must preserve unrelated ranking fields",
  );
});

Deno.test("통계 값이 같아도 marker 누락은 dry-run과 apply 대상이다", async () => {
  const projectId = "test-project";
  const prefix = `projects/${projectId}/databases/(default)/documents/`;
  const document = (path: string, data: Record<string, unknown>) => ({
    name: `${prefix}${path}`,
    fields: {},
    data,
    updateTime: "2026-07-17T00:00:00.000000Z",
  });
  const users = [
    document("users/admin", {
      role: "platformAdmin",
      readCount: 1,
      platformStatsReaderCounted: true,
    }),
    document("users/member", { role: "member", readCount: 1 }),
  ];
  const churches = [
    document("churches/real", { isDeleted: false }),
  ];
  const current = document("settings/platformStats", {
    total_readers: 2,
    total_churches: 1,
    readers_today: 0,
    finished_total: 0,
    today_date: "Fri Jul 17 2026",
  });
  const commits: FirestoreWrite[][] = [];
  const dependencies: RebuildPlatformStatsDependencies = {
    getDocument: (_token, _project, path) =>
      Promise.resolve(
        path === "users/admin" ? document(path, users[0].data) : current,
      ) as never,
    listCollectionDocuments: (_token, _project, path) =>
      Promise.resolve(
        path === "users" ? users : path === "churches" ? churches : [],
      ) as never,
    commitWrites: (_token, _project, writes) => {
      commits.push(writes);
      return Promise.resolve({}) as never;
    },
    updateWrite,
    now: () => new Date("2026-07-17T03:00:00.000Z"),
  };
  const preview = await rebuildPlatformStats(
    { token: "token", projectId },
    { uid: "admin", anonymous: false },
    { dryRun: true },
    dependencies,
  );
  assert(preview.changed.length === 0);
  assert(preview.markerBackfill.total === 1);
  assert(preview.applied === false && commits.length === 0);

  const applied = await rebuildPlatformStats(
    { token: "token", projectId },
    { uid: "admin", anonymous: false },
    { dryRun: false },
    dependencies,
  );
  assert(applied.applied === true && commits.length === 1);
  const memberWrite = commits[0].find((write) =>
    String(updateShape(write).update?.name || "").endsWith("/users/member")
  );
  if (!memberWrite) throw new Error("missing member marker write");
  assert(
    decodeFirestoreFields(updateShape(memberWrite).update?.fields || {})
      .platformStatsReaderCounted === true,
  );
});

Deno.test("공동체 lifecycle 중간 스냅샷은 dry-run과 apply 모두 거부한다", async () => {
  const projectId = "test-project";
  const prefix = `projects/${projectId}/databases/(default)/documents/`;
  const document = (path: string, data: Record<string, unknown>) => ({
    name: `${prefix}${path}`,
    fields: {},
    data,
    updateTime: "2026-07-17T00:00:00.000000Z",
  });
  let commits = 0;
  const dependencies: RebuildPlatformStatsDependencies = {
    getDocument: (_token, _project, path) =>
      Promise.resolve(
        path === "users/admin"
          ? document(path, { role: "platformAdmin", isDeleted: false })
          : document(path, { total_readers: 1, total_churches: 1 }),
      ) as never,
    listCollectionDocuments: (_token, _project, path) =>
      Promise.resolve(
        path === "users"
          ? [
            document("users/admin", {
              role: "platformAdmin",
              platformStatsReaderCounted: true,
            }),
          ]
          : path === "churches"
          ? [
            document("churches/c1", {
              isDeleted: true,
              lifecycleStatus: "deactivating",
            }),
          ]
          : [],
      ) as never,
    commitWrites: () => {
      commits += 1;
      return Promise.resolve({}) as never;
    },
    updateWrite,
    now: () => new Date("2026-07-17T03:00:00.000Z"),
  };
  for (const dryRun of [true, false]) {
    try {
      await rebuildPlatformStats(
        { token: "token", projectId },
        { uid: "admin", anonymous: false },
        { dryRun },
        dependencies,
      );
      throw new Error("transitioning church snapshot accepted");
    } catch (error) {
      assert(error instanceof PlatformError && error.code === "CONFLICT");
    }
  }
  assert(commits === 0);
});

Deno.test("통계 재계산은 실제 verify+marker+stats 쓰기 500건까지만 허용한다", async () => {
  const run = async (userCount: number) => {
    const projectId = "test-project";
    const prefix = `projects/${projectId}/databases/(default)/documents/`;
    const document = (path: string, data: Record<string, unknown>) => ({
      name: `${prefix}${path}`,
      fields: {},
      data,
      updateTime: "2026-07-17T00:00:00.000000Z",
    });
    const users = Array.from(
      { length: userCount },
      (_, index) =>
        document(`users/u${index}`, {
          role: index === 0 ? "platformAdmin" : "member",
          readCount: 1,
          platformStatsReaderCounted: true,
        }),
    );
    const churches = [document("churches/real", { isDeleted: false })];
    let committedWrites = 0;
    const dependencies: RebuildPlatformStatsDependencies = {
      getDocument: (_token, _project, path) =>
        Promise.resolve(
          path === "users/u0" ? document(path, users[0].data) : document(path, {
            total_readers: 0,
            total_churches: 1,
            readers_today: 0,
            finished_total: 0,
            today_date: "Fri Jul 17 2026",
          }),
        ) as never,
      listCollectionDocuments: (_token, _project, path) =>
        Promise.resolve(
          path === "users" ? users : path === "churches" ? churches : [],
        ) as never,
      commitWrites: (_token, _project, writes) => {
        committedWrites = writes.length;
        return Promise.resolve({}) as never;
      },
      updateWrite,
      now: () => new Date("2026-07-17T03:00:00.000Z"),
    };
    try {
      await rebuildPlatformStats(
        { token: "token", projectId },
        { uid: "u0", anonymous: false },
        { dryRun: false },
        dependencies,
      );
      return { error: null, committedWrites };
    } catch (error) {
      return { error, committedWrites };
    }
  };
  const atLimit = await run(498);
  assert(atLimit.error === null && atLimit.committedWrites === 500);
  const overLimit = await run(499);
  assert(
    overLimit.error instanceof PlatformError &&
      overLimit.error.code === "CONFLICT" &&
      overLimit.committedWrites === 0,
  );
});
