import { PlatformError } from "../_shared/errors.ts";
import {
  decodeFirestoreFields,
  type FirestoreDocument,
  type FirestoreValue,
  type FirestoreWrite,
  updateWrite,
} from "../_shared/firestore.ts";
import {
  type AdminChurchRenameDependencies,
  type AdminChurchRenameInput,
  adminRenameChurch,
} from "./adminChurchRenameService.ts";

const PROJECT_ID = "test-project";
const SERVICE = { token: "service-token", projectId: PROJECT_ID };
const UID = "platform-admin";
const CHURCH_ID = "church-1";
const REQUEST_ID = "123e4567-e89b-42d3-a456-426614174000";
const NOW = new Date("2026-07-17T01:02:03.000Z");
const PREFIX = `projects/${PROJECT_ID}/databases/(default)/documents/`;

type Data = Record<string, unknown>;
type UpdateWrite = {
  update: { name: string; fields: Record<string, FirestoreValue> };
  updateMask?: { fieldPaths: string[] };
  currentDocument?: { exists?: boolean };
};

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
const documentName = (path: string) => `${PREFIX}${path}`;
const pathFromName = (name: string) => {
  assert(name.startsWith(PREFIX), `unexpected document name: ${name}`);
  return name.slice(PREFIX.length).split("/").map(decodeURIComponent).join("/");
};

const baseState = (overrides: Record<string, Data> = {}) => ({
  [`users/${UID}`]: {
    uid: UID,
    role: "platformAdmin",
    isDeleted: false,
  },
  [`churches/${CHURCH_ID}`]: {
    name: "이전 이름",
    isDeleted: false,
    hiddenFromDirectory: true,
    pastorName: "보존 필드",
  },
  "settings/churchDirectory": {
    churches: [{ id: CHURCH_ID, name: "이전 이름", hidden: true }],
    updatedAt: "2026-07-16T00:00:00Z",
  },
  [`publicChurches/${CHURCH_ID}`]: {
    id: CHURCH_ID,
    name: "이전 이름",
    hidden: true,
  },
  ...overrides,
});

const createHarness = (initial: Record<string, Data>) => {
  const state = new Map(
    Object.entries(initial).map(([path, data]) => [path, clone(data)]),
  );
  const commits: Array<{ paths: string[]; transaction?: string }> = [];
  let transactionCount = 0;
  let rollbackCount = 0;
  let conflictsBeforeApply = 0;
  let conflictAfterApply = false;

  const asDocument = <T>(path: string, data: Data): FirestoreDocument<T> => ({
    name: documentName(path),
    fields: {},
    data: clone(data) as T,
  });
  const read = <T>(
    _token: string,
    _projectId: string,
    path: string,
  ): Promise<FirestoreDocument<T> | null> => {
    const data = state.get(path);
    return Promise.resolve(data ? asDocument<T>(path, data) : null);
  };
  const commit = (
    _token: string,
    _projectId: string,
    writes: FirestoreWrite[],
    options: { transaction?: string } = {},
  ) => {
    if (conflictsBeforeApply > 0) {
      conflictsBeforeApply -= 1;
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
    if (conflictAfterApply) {
      conflictAfterApply = false;
      throw new PlatformError("FIRESTORE_WRITE_FAILED", {
        details: { status: 409 },
      });
    }
    return Promise.resolve({});
  };
  const dependencies = {
    beginTransaction: () => Promise.resolve(`tx-${++transactionCount}`),
    commitWrites: commit,
    getDocument: read,
    rollbackTransaction: () => {
      rollbackCount += 1;
      return Promise.resolve();
    },
    updateWrite,
    now: () => new Date(NOW),
  } as unknown as Partial<AdminChurchRenameDependencies>;
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
    conflictBeforeCommit(count: number) {
      conflictsBeforeApply = count;
    },
    conflictAfterAppliedCommit() {
      conflictAfterApply = true;
    },
  };
};

type Harness = ReturnType<typeof createHarness>;
const input = (
  overrides: Partial<AdminChurchRenameInput> = {},
): AdminChurchRenameInput => ({
  requestId: REQUEST_ID,
  churchId: CHURCH_ID,
  name: "새 이름",
  ...overrides,
});
const rename = (harness: Harness, request = input()) =>
  adminRenameChurch(
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

Deno.test("교회 이름은 원본·legacy/public 투영·불변 원장을 한 transaction에서 바꾼다", async () => {
  const harness = createHarness(baseState());
  const result = await rename(harness);
  assertEquals(result, {
    status: "renamed",
    churchId: CHURCH_ID,
    previousName: "이전 이름",
    name: "새 이름",
  });
  assertEquals(harness.commits[0].paths, [
    `churches/${CHURCH_ID}`,
    "settings/churchDirectory",
    `publicChurches/${CHURCH_ID}`,
    `platformAdminActions/${REQUEST_ID}`,
  ]);
  assert(
    harness.commits[0].transaction === "tx-1",
    "writes must use the read transaction",
  );
  assertEquals(harness.state.get(`churches/${CHURCH_ID}`), {
    name: "새 이름",
    isDeleted: false,
    hiddenFromDirectory: true,
    pastorName: "보존 필드",
    updatedAt: NOW.toISOString(),
  });
  assertEquals(
    harness.state.get("settings/churchDirectory")?.churches,
    [{ id: CHURCH_ID, name: "새 이름", hidden: true }],
  );
  assertEquals(harness.state.get(`publicChurches/${CHURCH_ID}`), {
    id: CHURCH_ID,
    name: "새 이름",
    hidden: true,
  });
  const ledger = harness.state.get(`platformAdminActions/${REQUEST_ID}`)!;
  assertEquals(Object.keys(ledger).sort(), [
    "action",
    "actorUid",
    "createdAt",
    "input",
    "requestId",
    "result",
    "schemaVersion",
  ]);
  assert(ledger.action === "adminRenameChurch");
});

Deno.test("같은 이름과 canonical 투영이면 fresh no-op이며 UUID를 소비하지 않는다", async () => {
  const harness = createHarness(baseState({
    [`churches/${CHURCH_ID}`]: {
      name: "새 이름",
      isDeleted: false,
      hiddenFromDirectory: true,
    },
    "settings/churchDirectory": {
      churches: [{ id: CHURCH_ID, name: "새 이름", hidden: true }],
      updatedAt: "2026-07-16T00:00:00Z",
    },
    [`publicChurches/${CHURCH_ID}`]: {
      id: CHURCH_ID,
      name: "새 이름",
      hidden: true,
    },
  }));
  assertEquals(await rename(harness), {
    status: "alreadyNamed",
    churchId: CHURCH_ID,
    previousName: "새 이름",
    name: "새 이름",
  });
  assertEquals(harness.commits, []);
  assert(harness.rollbackCount === 1);
  assert(!harness.state.has(`platformAdminActions/${REQUEST_ID}`));
});

Deno.test("legacy 비밀 drift와 누락 public projection도 이름 변경 transaction이 복구한다", async () => {
  const initial: Record<string, Data> = baseState({
    "settings/churchDirectory": {
      churches: [{
        id: CHURCH_ID,
        name: "오래된 이름",
        hidden: true,
        codeHash: "remove-me",
      }],
      updatedAt: "2026-07-16T00:00:00Z",
    },
  });
  delete initial[`publicChurches/${CHURCH_ID}`];
  const harness = createHarness(initial);
  await rename(harness);
  assertEquals(
    harness.state.get("settings/churchDirectory")?.churches,
    [{ id: CHURCH_ID, name: "새 이름", hidden: true }],
  );
  assertEquals(harness.state.get(`publicChurches/${CHURCH_ID}`), {
    id: CHURCH_ID,
    name: "새 이름",
    hidden: true,
  });
});

Deno.test("원본 이름이 같아도 projection repair는 원장 replay로 수렴한다", async () => {
  const initial: Record<string, Data> = baseState({
    [`churches/${CHURCH_ID}`]: {
      name: "새 이름",
      isDeleted: false,
      hiddenFromDirectory: true,
    },
    "settings/churchDirectory": {
      churches: [{ id: CHURCH_ID, name: "오래된 이름", hidden: true }],
      updatedAt: "2026-07-16T00:00:00Z",
    },
  });
  const harness = createHarness(initial);
  harness.conflictAfterAppliedCommit();

  assertEquals(await rename(harness), {
    status: "renamed",
    churchId: CHURCH_ID,
    previousName: "새 이름",
    name: "새 이름",
  });
  assertEquals(harness.commits.length, 1);
  assertEquals(await rename(harness), {
    status: "renamed",
    churchId: CHURCH_ID,
    previousName: "새 이름",
    name: "새 이름",
  });
  assertEquals(harness.commits.length, 1);
});

Deno.test("apply-then-409와 동일 UUID replay는 저장된 이름 변경 결과로 수렴한다", async () => {
  const harness = createHarness(baseState());
  harness.conflictAfterAppliedCommit();
  const replay = await rename(harness);
  assertEquals(replay, {
    status: "renamed",
    churchId: CHURCH_ID,
    previousName: "이전 이름",
    name: "새 이름",
  });
  assert(harness.transactionCount === 2, "lost response must retry once");
  assertEquals(await rename(harness), replay, "exact replay drifted");
});

Deno.test("409는 최대 3회 재시도하고 다른 입력·손상 원장은 fail closed 한다", async () => {
  const retryHarness = createHarness(baseState());
  retryHarness.conflictBeforeCommit(2);
  await rename(retryHarness);
  assert(retryHarness.transactionCount === 3);

  const replayHarness = createHarness(baseState());
  await rename(replayHarness);
  await expectPlatformError(
    () => rename(replayHarness, input({ name: "다른 이름" })),
    "CONFLICT",
  );
});

Deno.test("삭제 관리자·가상 교회·비canonical 입력은 쓰기 전에 거부한다", async () => {
  const deletedActor = createHarness(baseState({
    [`users/${UID}`]: { uid: UID, role: "platformAdmin", isDeleted: true },
  }));
  await expectPlatformError(() => rename(deletedActor), "FORBIDDEN");
  assertEquals(deletedActor.commits, []);

  const harness = createHarness(baseState());
  await expectPlatformError(
    () => rename(harness, input({ churchId: "unaffiliated_v1" })),
    "BAD_REQUEST",
  );
  await expectPlatformError(
    () => rename(harness, input({ name: " 새 이름" })),
    "BAD_REQUEST",
  );
  await expectPlatformError(
    () =>
      adminRenameChurch(
        SERVICE,
        { uid: UID, anonymous: true },
        input(),
        harness.dependencies,
      ),
    "ANONYMOUS_NOT_ALLOWED",
  );
});
