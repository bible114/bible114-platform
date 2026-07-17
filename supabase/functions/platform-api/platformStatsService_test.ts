import { PlatformError } from "../_shared/errors.ts";
import { updateWrite } from "../_shared/firestore.ts";
import {
  nextPlatformStatsAfterSignup,
  rebuildPlatformStats,
  type RebuildPlatformStatsDependencies,
} from "./platformStatsService.ts";

const assert = (condition: unknown, message = "assertion failed") => {
  if (!condition) throw new Error(message);
};

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
  const commits: unknown[][] = [];
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
    listCollectionDocuments: (_token, _project, path) =>
      Promise.resolve(
        path === "users"
          ? [
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
            document("users/deleted", { isDeleted: true, readCount: 8 }),
          ]
          : [
            document("churches/real", { isDeleted: false }),
            document("churches/deleted", { isDeleted: true }),
            document("churches/unaffiliated_v1", { isVirtual: true }),
          ],
      ) as never,
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
  assert(result.expected.total_readers === 2);
  assert(result.expected.total_churches === 1);
  assert(result.expected.readers_today === 2);
  assert(result.expected.finished_total === 3);
});
