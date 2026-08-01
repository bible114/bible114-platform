import {
  assertEquals,
  assertRejects,
} from "https://deno.land/std@0.224.0/assert/mod.ts";
import { PlatformError } from "../_shared/errors.ts";
import {
  decodeFirestoreFields,
  type FirestoreDocument,
  type FirestoreValue,
  type FirestoreWrite,
  updateWrite,
} from "../_shared/firestore.ts";
import {
  type MemberLifecycleDependencies,
  setMemberActiveState,
} from "./memberLifecycleService.ts";

const RID = "123e4567-e89b-42d3-a456-426614174000";
const NOW = new Date("2026-07-30T12:00:00.000Z");
const PREFIX = "projects/p/databases/(default)/documents/";
type Data = Record<string, unknown>;
type Update = {
  update: { name: string; fields: Record<string, FirestoreValue> };
  updateMask?: { fieldPaths: string[] };
};
const doc = <T>(path: string, data: T): FirestoreDocument<T> => ({
  name: `${PREFIX}${path}`,
  fields: {},
  data,
  updateTime: "2026-07-30T11:00:00.000Z",
});

const harness = (overrides: Record<string, Data> = {}) => {
  const state = new Map<string, Data>(Object.entries({
    "users/admin": {
      uid: "admin",
      role: "churchAdmin",
      churchId: "c1",
      isDeleted: false,
    },
    "users/member": {
      role: "member",
      churchId: "c1",
      isDeleted: false,
      platformStatsReaderCounted: true,
    },
    "churches/c1": { name: "교회", isDeleted: false },
    "settings/platformStats": { total_readers: 10, total_churches: 1 },
    ...overrides,
  }));
  const commits: FirestoreWrite[][] = [];
  const getDocument = async <T>(
    _token: string,
    _project: string,
    path: string,
  ) => state.has(path) ? doc(path, state.get(path) as T) : null;
  const commitWrites = async (
    _token: string,
    _project: string,
    writes: FirestoreWrite[],
  ) => {
    for (const raw of writes) {
      const write = raw as Update;
      const path = write.update.name.slice(PREFIX.length);
      const decoded = decodeFirestoreFields(write.update.fields);
      const next = { ...(state.get(path) || {}) };
      for (
        const field of write.updateMask?.fieldPaths ||
          Object.keys(decoded)
      ) {
        next[field] = decoded[field];
      }
      state.set(path, next);
    }
    commits.push(writes);
    return {};
  };
  const dependencies = {
    beginTransaction: async () => "tx",
    commitWrites,
    getDocument,
    rollbackTransaction: async () => {},
    updateWrite,
    now: () => new Date(NOW),
  } as unknown as MemberLifecycleDependencies;
  return { state, commits, dependencies };
};

Deno.test("교회 관리자는 회원 비활성화와 독자 수 감소를 한 transaction에 쓴다", async () => {
  const { state, commits, dependencies } = harness();
  const result = await setMemberActiveState(
    { token: "t", projectId: "p" },
    { uid: "admin", anonymous: false },
    { requestId: RID, memberUid: "member", active: false },
    dependencies,
  );
  assertEquals(result.status, "deactivated");
  assertEquals(result.totalReaders, 9);
  assertEquals(state.get("users/member")?.isDeleted, true);
  assertEquals(
    state.get("users/member")?.platformStatsReaderCounted,
    false,
  );
  assertEquals(state.get("settings/platformStats")?.total_readers, 9);
  assertEquals(commits.length, 1);
});

Deno.test("복원은 false marker에서만 독자 수를 한 번 증가시키고 replay한다", async () => {
  const { state, dependencies } = harness({
    "users/member": {
      role: "member",
      churchId: "c1",
      isDeleted: true,
      deletedAt: "2026-07-29T00:00:00.000Z",
      deletedBy: "admin",
      platformStatsReaderCounted: false,
    },
  });
  const input = { requestId: RID, memberUid: "member", active: true };
  const first = await setMemberActiveState(
    { token: "t", projectId: "p" },
    { uid: "admin", anonymous: false },
    input,
    dependencies,
  );
  const replay = await setMemberActiveState(
    { token: "t", projectId: "p" },
    { uid: "admin", anonymous: false },
    input,
    dependencies,
  );
  assertEquals(first.status, "restored");
  assertEquals(replay, first);
  assertEquals(state.get("settings/platformStats")?.total_readers, 11);
});

Deno.test("공개 통계 제외 회원은 상태만 바꾸고 독자 수는 유지한다", async () => {
  const { state, dependencies } = harness({
    "users/member": {
      role: "member",
      churchId: "c1",
      isDeleted: false,
      excludeFromPublicStats: true,
      platformStatsReaderCounted: false,
    },
  });
  const result = await setMemberActiveState(
    { token: "t", projectId: "p" },
    { uid: "admin", anonymous: false },
    { requestId: RID, memberUid: "member", active: false },
    dependencies,
  );
  assertEquals(result.totalReaders, 10);
  assertEquals(state.get("settings/platformStats")?.total_readers, 10);
});

Deno.test("marker 누락 또는 타 교회 관리자는 쓰기 전에 거부한다", async () => {
  const missing = harness({
    "users/member": {
      role: "member",
      churchId: "c1",
      isDeleted: false,
    },
  });
  await assertRejects(
    () =>
      setMemberActiveState(
        { token: "t", projectId: "p" },
        { uid: "admin", anonymous: false },
        { requestId: RID, memberUid: "member", active: false },
        missing.dependencies,
      ),
    PlatformError,
  );
  assertEquals(missing.commits, []);

  const foreign = harness({
    "users/admin": {
      uid: "admin",
      role: "churchAdmin",
      churchId: "other",
      isDeleted: false,
    },
  });
  await assertRejects(
    () =>
      setMemberActiveState(
        { token: "t", projectId: "p" },
        { uid: "admin", anonymous: false },
        { requestId: RID, memberUid: "member", active: false },
        foreign.dependencies,
      ),
    PlatformError,
  );
  assertEquals(foreign.commits, []);
});
