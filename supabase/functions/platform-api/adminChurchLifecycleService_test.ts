import {
  assert,
  assertEquals,
  assertRejects,
} from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  decodeFirestoreFields,
  type FirestoreDocument,
  type FirestoreWrite,
  updateWrite,
} from "../_shared/firestore.ts";
import { PlatformError } from "../_shared/errors.ts";
import {
  type AdminChurchLifecycleDependencies,
  adminSetChurchLifecycle,
} from "./adminChurchLifecycleService.ts";

const RID = "123e4567-e89b-42d3-a456-426614174000";
const asDoc = <T>(path: string, data: T): FirestoreDocument<T> => ({
  name: `projects/p/databases/(default)/documents/${path}`,
  fields: {},
  data,
  updateTime: "2026-07-17T00:00:00Z",
});

const harness = ({ includeExcluded = false } = {}) => {
  const commits: FirestoreWrite[][] = [];
  const getDocument = async <T>(
    _token: string,
    _project: string,
    path: string,
  ) => {
    const data: Record<string, unknown> | null = path === "users/admin"
      ? { uid: "admin", role: "platformAdmin", isDeleted: false }
      : path === "churches/c1"
      ? { name: "테스트 공동체", isDeleted: false }
      : path === "settings/churchDirectory"
      ? { churches: [{ id: "c1", name: "테스트 공동체" }] }
      : path === "publicChurches/c1"
      ? { id: "c1", name: "테스트 공동체" }
      : path === "settings/platformStats"
      ? { total_readers: 10, total_churches: 2 }
      : null;
    return data ? asDoc(path, data) as FirestoreDocument<T> : null;
  };
  const listCollectionDocuments = async <T>(
    _token: string,
    _project: string,
    path: string,
  ) => {
    if (path === "users") {
      return [
        asDoc("users/u1", {
          role: "member",
          churchId: "c1",
          accountType: "church",
        }),
        ...(includeExcluded
          ? [
            asDoc("users/u2", {
              role: "member",
              churchId: "c1",
              accountType: "church",
              excludeFromPublicStats: true,
            }),
          ]
          : []),
        asDoc("users/p1", {
          role: "member",
          churchId: "c1",
          accountType: "personal",
        }),
      ] as FirestoreDocument<T>[];
    }
    if (path.endsWith("/roster")) {
      return [
        asDoc("churches/c1/roster/u1", { talent: 7 }),
        asDoc("churches/c1/roster/p1", { talent: 0 }),
      ] as FirestoreDocument<T>[];
    }
    if (path.endsWith("/talentPurchases")) {
      return [
        asDoc("churches/c1/talentPurchases/a", { status: "pending" }),
        asDoc("churches/c1/talentPurchases/b", { status: "delivered" }),
      ] as FirestoreDocument<T>[];
    }
    return [];
  };
  const dependencies = {
    beginTransaction: async () => "tx",
    commitWrites: async (
      _token: string,
      _project: string,
      writes: FirestoreWrite[],
    ) => {
      commits.push(writes);
      return {};
    },
    getDocument,
    listCollectionDocuments,
    rollbackTransaction: async () => {},
    updateWrite,
    now: () => new Date("2026-07-17T00:00:00Z"),
  } as unknown as AdminChurchLifecycleDependencies;
  return { dependencies, commits };
};

Deno.test("공동체 비활성화는 주 소속 users만 soft-delete하고 정산 수치를 보존한다", async () => {
  const { dependencies, commits } = harness();
  const result = await adminSetChurchLifecycle(
    { token: "t", projectId: "p" },
    { uid: "admin", anonymous: false },
    { requestId: RID, churchId: "c1", active: false },
    dependencies,
  );
  assertEquals(result, {
    status: "deactivated",
    churchId: "c1",
    active: false,
    affectedUsers: 1,
    positiveRosterCount: 1,
    positiveTalentTotal: 7,
    pendingPurchaseCount: 1,
  });
  assertEquals(commits.length, 3);
  const userWrites = commits.flat().filter((write) =>
    String((write.update as { name?: string })?.name || "").endsWith(
      "/users/u1",
    )
  );
  assertEquals(userWrites.length, 1);
  assertEquals(
    decodeFirestoreFields(
      (userWrites[0].update as { fields: Record<string, never> }).fields,
    ).deactivationGeneration,
    RID,
  );
  assert(
    !commits.flat().some((write) =>
      String((write.update as { name?: string })?.name || "").endsWith(
        "/users/p1",
      )
    ),
  );
});

Deno.test("공개 통계 제외 사용자는 lifecycle 대상이어도 참여 성도 증감에서 제외한다", async () => {
  const { dependencies, commits } = harness({ includeExcluded: true });
  const result = await adminSetChurchLifecycle(
    { token: "t", projectId: "p" },
    { uid: "admin", anonymous: false },
    { requestId: RID, churchId: "c1", active: false },
    dependencies,
  );
  assertEquals(result.affectedUsers, 2);
  const statsWrite = commits.flat().find((write) =>
    String((write.update as { name?: string })?.name || "").endsWith(
      "/settings/platformStats",
    )
  );
  assert(statsWrite);
  assertEquals(
    decodeFirestoreFields(
      (statsWrite.update as { fields: Record<string, never> }).fields,
    ).total_readers,
    9,
  );
});

Deno.test("익명 또는 무소속 가상 공동체 lifecycle 요청은 쓰기 전에 거부한다", async () => {
  const { dependencies, commits } = harness();
  await assertRejects(
    () =>
      adminSetChurchLifecycle(
        { token: "t", projectId: "p" },
        { uid: "admin", anonymous: true },
        { requestId: RID, churchId: "c1", active: false },
        dependencies,
      ),
    PlatformError,
  );
  await assertRejects(
    () =>
      adminSetChurchLifecycle(
        { token: "t", projectId: "p" },
        { uid: "admin", anonymous: false },
        { requestId: RID, churchId: "unaffiliated_v1", active: false },
        dependencies,
      ),
    PlatformError,
  );
  assertEquals(commits, []);
});
