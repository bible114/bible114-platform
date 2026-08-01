import { PlatformError } from "../_shared/errors.ts";
import {
  decodeFirestoreFields,
  type FirestoreDocument,
  type FirestoreValue,
  type FirestoreWrite,
} from "../_shared/firestore.ts";
import {
  completeMemberOnboarding,
  type CompleteMemberOnboardingDependencies,
  type CompleteMemberOnboardingInput,
} from "./ownMembershipService.ts";

const PROJECT_ID = "test-project";
const SERVICE = { token: "service-token", projectId: PROJECT_ID };
const UID = "user-1";
const ORG_ID = "org-1";
const REQUEST_ID = "123e4567-e89b-42d3-a456-426614174000";
const NOW = new Date("2026-07-16T03:04:05.000Z");
const PREFIX = `projects/${PROJECT_ID}/databases/(default)/documents/`;
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
const userPath = `users/${UID}`;
const churchPath = `churches/${ORG_ID}`;
const rosterPath = `${churchPath}/roster/${UID}`;
const ledgerPath = `${userPath}/activityActions/${REQUEST_ID}`;

const emptyMembership = {
  departmentId: null,
  departmentName: null,
  subgroupId: null,
  subgroupName: null,
};
const membership = {
  departmentId: "dept-1",
  departmentName: "청년부",
  subgroupId: "group-1",
  subgroupName: "믿음반",
};
const result = (
  status: "completed" | "alreadyCompleted" = "completed",
  overrides: Data = {},
) => ({
  status,
  orgId: ORG_ID,
  planId: "1year_new",
  currentDay: 365,
  ...membership,
  ...overrides,
});
const baseUser = (overrides: Data = {}): Data => ({
  uid: UID,
  name: "민감한 이름",
  password: "plain-support-password",
  role: "member",
  accountType: "church",
  churchId: ORG_ID,
  isDeleted: false,
  planId: "1year_revised",
  currentDay: 365,
  ...emptyMembership,
  unrelated: { keep: true },
  ...overrides,
});
const baseChurch = (overrides: Data = {}): Data => ({
  isDeleted: false,
  departments: [{
    id: "dept-1",
    name: "청년부",
    subgroups: [{ id: "group-1", name: "믿음반" }],
  }],
  ...overrides,
});
const baseRoster = (overrides: Data = {}): Data => ({
  uid: UID,
  currentDay: 365,
  ...emptyMembership,
  talent: 99,
  extraMemberships: [{ keep: true }],
  ...overrides,
});
const storedLedger = (overrides: Data = {}): Data => ({
  schemaVersion: 2,
  action: "completeMemberOnboarding",
  requestId: REQUEST_ID,
  input: {
    orgId: ORG_ID,
    planId: "1year_new",
    departmentId: "dept-1",
    subgroupId: "group-1",
  },
  result: result(),
  createdAt: NOW.toISOString(),
  ...overrides,
});
const storedLegacyLedger = (overrides: Data = {}): Data => ({
  schemaVersion: 1,
  action: "completeMemberOnboarding",
  requestId: REQUEST_ID,
  input: {
    orgId: ORG_ID,
    planId: "1year_new",
    departmentId: "dept-1",
    subgroupId: "group-1",
  },
  result: {
    status: "completed",
    orgId: ORG_ID,
    planId: "1year_new",
    ...membership,
  },
  createdAt: NOW.toISOString(),
  ...overrides,
});
const input = (
  overrides: Partial<CompleteMemberOnboardingInput> = {},
): CompleteMemberOnboardingInput => ({
  requestId: REQUEST_ID,
  orgId: ORG_ID,
  planId: "1year_new",
  departmentId: "dept-1",
  subgroupId: "group-1",
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
  const commits: Array<
    { paths: string[]; masks: Array<string[] | null>; transaction?: string }
  > = [];
  const reads: Array<{ path: string; transaction?: string }> = [];
  let transactions = 0;
  let rollbacks = 0;
  let conflicts = 0;
  let applyThenConflict = false;
  const document = <T>(path: string, data: Data): FirestoreDocument<T> => ({
    name: `${PREFIX}${path}`,
    fields: {},
    data: clone(data) as T,
  });
  const dependencies = {
    beginTransaction: () => Promise.resolve(`tx-${++transactions}`),
    getDocument: <T>(
      _token: string,
      _projectId: string,
      path: string,
      options: { transaction?: string } = {},
    ): Promise<FirestoreDocument<T> | null> => {
      reads.push({ path, transaction: options.transaction });
      const data = state.get(path);
      return Promise.resolve(data ? document<T>(path, data) : null);
    },
    rollbackTransaction: () => {
      rollbacks += 1;
      return Promise.resolve();
    },
    commitWrites: (
      _token: string,
      _projectId: string,
      writes: FirestoreWrite[],
      options: { transaction?: string } = {},
    ) => {
      if (conflicts > 0) {
        conflicts -= 1;
        throw new PlatformError("FIRESTORE_WRITE_FAILED", {
          details: { status: 409 },
        });
      }
      const next = new Map(
        Array.from(state.entries()).map(([path, data]) => [path, clone(data)]),
      );
      const paths: string[] = [];
      const masks: Array<string[] | null> = [];
      for (const raw of writes) {
        const write = raw as UpdateWrite;
        const path = decodeURIComponent(write.update.name.slice(PREFIX.length));
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
        paths.push(path);
        masks.push(write.updateMask?.fieldPaths || null);
        if (!write.updateMask) next.set(path, decoded);
        else {
          const merged = { ...(next.get(path) || {}) };
          for (const field of write.updateMask.fieldPaths) {
            merged[field] = decoded[field];
          }
          next.set(path, merged);
        }
      }
      commits.push({ paths, masks, transaction: options.transaction });
      state.clear();
      next.forEach((data, path) => state.set(path, data));
      if (applyThenConflict) {
        applyThenConflict = false;
        throw new PlatformError("FIRESTORE_WRITE_FAILED", {
          details: { status: 409 },
        });
      }
      return Promise.resolve({});
    },
    updateWrite: undefined,
    now: () => new Date(NOW),
  } as unknown as Partial<CompleteMemberOnboardingDependencies>;
  // 실제 encoder를 기본 dependency에서 쓰도록 undefined override는 제거한다.
  delete (dependencies as Record<string, unknown>).updateWrite;
  return {
    state,
    commits,
    reads,
    dependencies,
    get transactions() {
      return transactions;
    },
    get rollbacks() {
      return rollbacks;
    },
    conflictBeforeCommit(count: number) {
      conflicts = count;
    },
    conflictAfterApply() {
      applyThenConflict = true;
    },
  };
};

type Harness = ReturnType<typeof createHarness>;
const complete = (harness: Harness, request = input()) =>
  completeMemberOnboarding(
    SERVICE,
    { uid: UID, anonymous: false },
    request,
    harness.dependencies,
  );
const expectError = async (callback: () => Promise<unknown>, code: string) => {
  try {
    await callback();
    throw new Error(`expected ${code}`);
  } catch (error) {
    assert(
      error instanceof PlatformError && error.code === code,
      `expected ${code}`,
    );
  }
};

Deno.test("fresh users-only 온보딩은 plan+currentDay+소속과 schema2 원장을 원자 commit한다", async () => {
  const original = baseUser();
  const harness = createHarness({
    [userPath]: original,
    [churchPath]: baseChurch(),
  });
  assertEquals(await complete(harness), {
    alreadyCompleted: false,
    committed: true,
    result: result(),
  });
  assertEquals(harness.reads, [
    { path: userPath, transaction: "tx-1" },
    { path: ledgerPath, transaction: "tx-1" },
    { path: churchPath, transaction: "tx-1" },
    { path: rosterPath, transaction: "tx-1" },
  ]);
  assertEquals(harness.commits[0].paths, [userPath, ledgerPath]);
  assertEquals(harness.commits[0].masks, [[
    "planId",
    "onboardingPending",
    "departmentId",
    "departmentName",
    "subgroupId",
    "subgroupName",
    "currentDay",
    "updatedAt",
  ], null]);
  assertEquals(harness.state.get(userPath), {
    ...original,
    planId: "1year_new",
    onboardingPending: false,
    ...membership,
    currentDay: 365,
    updatedAt: NOW.toISOString(),
  });
  assertEquals(harness.state.get(ledgerPath), storedLedger());
  const serialized = JSON.stringify(harness.state.get(ledgerPath));
  for (
    const forbidden of [
      UID,
      "민감한 이름",
      "plain-support-password",
      "talent",
      "balance",
    ]
  ) {
    assert(!serialized.includes(forbidden), `ledger leaked ${forbidden}`);
  }
});

Deno.test("신규 교회 관리자는 빈 plan과 pending marker를 서버 완료 상태로 닫는다", async () => {
  const original = baseUser({
    role: "churchAdmin",
    planId: null,
    onboardingPending: true,
  });
  const harness = createHarness({
    [userPath]: original,
    [churchPath]: baseChurch(),
  });
  assertEquals(await complete(harness), {
    alreadyCompleted: false,
    committed: true,
    result: result(),
  });
  assertEquals(harness.state.get(userPath), {
    ...original,
    planId: "1year_new",
    onboardingPending: false,
    ...membership,
    currentDay: 365,
    updatedAt: NOW.toISOString(),
  });
});

Deno.test("optional roster는 소속+currentDay만 미러하고 잔액/extra를 보존한다", async () => {
  const roster = baseRoster({ currentDay: 17 });
  const harness = createHarness({
    [userPath]: baseUser(),
    [churchPath]: baseChurch(),
    [rosterPath]: roster,
  });
  await complete(harness);
  assertEquals(harness.commits[0].paths, [userPath, rosterPath, ledgerPath]);
  assertEquals(harness.commits[0].masks[1], [
    "departmentId",
    "departmentName",
    "subgroupId",
    "subgroupName",
    "currentDay",
    "updatedAt",
  ]);
  assertEquals(harness.state.get(rosterPath), {
    ...roster,
    ...membership,
    currentDay: 365,
    updatedAt: NOW.toISOString(),
  });
});

Deno.test("60일 plan은 기존 day를 modulo 정규화해 user+roster+ledger에 원자 저장한다", async () => {
  const originalUser = baseUser({ currentDay: 365 });
  const originalRoster = baseRoster({ currentDay: 60 });
  const harness = createHarness({
    [userPath]: originalUser,
    [churchPath]: baseChurch(),
    [rosterPath]: originalRoster,
  });
  const readableInput = input({ planId: "readable_new" });
  const readableResult = result("completed", {
    planId: "readable_new",
    currentDay: 5,
  });

  assertEquals(await complete(harness, readableInput), {
    alreadyCompleted: false,
    committed: true,
    result: readableResult,
  });
  assertEquals(harness.commits[0].paths, [
    userPath,
    rosterPath,
    ledgerPath,
  ]);
  assertEquals(harness.state.get(userPath), {
    ...originalUser,
    planId: "readable_new",
    onboardingPending: false,
    ...membership,
    currentDay: 5,
    updatedAt: NOW.toISOString(),
  });
  assertEquals(harness.state.get(rosterPath), {
    ...originalRoster,
    ...membership,
    currentDay: 5,
    updatedAt: NOW.toISOString(),
  });
  assertEquals(
    harness.state.get(ledgerPath),
    storedLedger({
      input: {
        orgId: ORG_ID,
        planId: "readable_new",
        departmentId: "dept-1",
        subgroupId: "group-1",
      },
      result: readableResult,
    }),
  );
});

Deno.test("무소속 교회 문서가 없으면 canonical virtual 조직으로 최초 온보딩한다", async () => {
  const virtualOrgId = "unaffiliated_v1";
  const virtualUserPath = `users/${UID}`;
  const harness = createHarness({
    [virtualUserPath]: baseUser({ churchId: virtualOrgId }),
  });
  const response = await completeMemberOnboarding(
    SERVICE,
    { uid: UID, anonymous: false },
    input({
      orgId: virtualOrgId,
      departmentId: "personal",
      subgroupId: "성경읽기 동행",
    }),
    harness.dependencies,
  );
  assertEquals(response.result, {
    status: "completed",
    orgId: virtualOrgId,
    planId: "1year_new",
    currentDay: 365,
    departmentId: "personal",
    departmentName: "개인 성도",
    subgroupId: "성경읽기 동행",
    subgroupName: "성경읽기 동행",
  });
});

Deno.test("canonical fresh request는 rollback no-op이고 새 원장을 만들지 않는다", async () => {
  const harness = createHarness({
    [userPath]: baseUser({ planId: "1year_new", ...membership }),
    [churchPath]: baseChurch(),
  });
  assertEquals(await complete(harness), {
    alreadyCompleted: false,
    committed: false,
    result: result("alreadyCompleted"),
  });
  assertEquals(harness.commits, []);
  assert(harness.rollbacks === 1);
});

Deno.test("exact ledger+canonical state만 replay하고 malformed ledger/state는 fail closed한다", async () => {
  const canonical = baseUser({ planId: "1year_new", ...membership });
  const harness = createHarness({
    [userPath]: canonical,
    [churchPath]: baseChurch(),
    [ledgerPath]: storedLedger(),
  });
  assertEquals(await complete(harness), {
    alreadyCompleted: true,
    committed: true,
    result: result(),
  });
  const legacy = createHarness({
    [userPath]: canonical,
    [churchPath]: baseChurch(),
    [ledgerPath]: storedLegacyLedger(),
  });
  assertEquals(await complete(legacy), {
    alreadyCompleted: true,
    committed: true,
    result: result(),
  });
  for (
    const ledger of [
      storedLedger({ extra: true }),
      storedLedger({ action: "other" }),
      storedLedger({ input: { orgId: ORG_ID } }),
      storedLedger({ result: { ...result(), departmentName: "위조" } }),
      storedLedger({ result: { ...result(), currentDay: 364 } }),
      storedLedger({ createdAt: "2026-02-30T00:00:00Z" }),
    ]
  ) {
    const malformed = createHarness({
      [userPath]: canonical,
      [churchPath]: baseChurch(),
      [ledgerPath]: ledger,
    });
    await expectError(() => complete(malformed), "CONFLICT");
  }
  const stateMismatch = createHarness({
    [userPath]: baseUser(),
    [churchPath]: baseChurch(),
    [ledgerPath]: storedLedger(),
  });
  await expectError(() => complete(stateMismatch), "CONFLICT");
});

Deno.test("schema1 readable replay는 currentDay 복구와 schema2 원장 승격을 원자 commit한다", async () => {
  const readableInput = input({ planId: "readable_new" });
  const readableResult = result("completed", {
    planId: "readable_new",
    currentDay: 5,
  });
  const legacyResult = {
    status: "completed",
    orgId: ORG_ID,
    planId: "readable_new",
    ...membership,
  };
  const legacyInput = {
    orgId: ORG_ID,
    planId: "readable_new",
    departmentId: "dept-1",
    subgroupId: "group-1",
  };
  const originalUser = baseUser({
    planId: "readable_new",
    currentDay: 365,
    ...membership,
  });
  const originalRoster = baseRoster({
    currentDay: 365,
    ...membership,
  });
  const originalLedger = storedLegacyLedger({
    input: legacyInput,
    result: legacyResult,
  });
  const harness = createHarness({
    [userPath]: originalUser,
    [churchPath]: baseChurch(),
    [rosterPath]: originalRoster,
    [ledgerPath]: originalLedger,
  });

  assertEquals(await complete(harness, readableInput), {
    alreadyCompleted: true,
    committed: true,
    result: readableResult,
  });
  assertEquals(harness.commits[0].paths, [
    userPath,
    rosterPath,
    ledgerPath,
  ]);
  assertEquals(harness.commits[0].masks, [
    ["currentDay", "updatedAt"],
    ["currentDay", "updatedAt"],
    ["schemaVersion", "result"],
  ]);
  assertEquals(harness.state.get(userPath), {
    ...originalUser,
    currentDay: 5,
    updatedAt: NOW.toISOString(),
  });
  assertEquals(harness.state.get(rosterPath), {
    ...originalRoster,
    currentDay: 5,
    updatedAt: NOW.toISOString(),
  });
  assertEquals(harness.state.get(ledgerPath), {
    ...originalLedger,
    schemaVersion: 2,
    result: readableResult,
  });

  for (
    const ledger of [
      storedLegacyLedger({
        input: { ...legacyInput, planId: "1year_new" },
        result: legacyResult,
      }),
      storedLegacyLedger({
        input: legacyInput,
        result: { ...legacyResult, departmentName: "위조" },
      }),
    ]
  ) {
    const malformed = createHarness({
      [userPath]: originalUser,
      [churchPath]: baseChurch(),
      [rosterPath]: originalRoster,
      [ledgerPath]: ledger,
    });
    await expectError(
      () => complete(malformed, readableInput),
      "CONFLICT",
    );
    assertEquals(malformed.commits, []);
  }
});

Deno.test("409는 최대 3회 재시도하고 apply-then-409는 exact replay로 종료한다", async () => {
  const retry = createHarness({
    [userPath]: baseUser(),
    [churchPath]: baseChurch(),
  });
  retry.conflictBeforeCommit(2);
  assert((await complete(retry)).result.status === "completed");
  assert(retry.transactions === 3);

  const exhausted = createHarness({
    [userPath]: baseUser(),
    [churchPath]: baseChurch(),
  });
  exhausted.conflictBeforeCommit(3);
  await expectError(() => complete(exhausted), "FIRESTORE_WRITE_FAILED");
  assert(exhausted.transactions === 3);

  const applied = createHarness({
    [userPath]: baseUser(),
    [churchPath]: baseChurch(),
  });
  applied.conflictAfterApply();
  assertEquals(await complete(applied), {
    alreadyCompleted: true,
    committed: true,
    result: result(),
  });
  assert(applied.transactions === 2);
});

Deno.test("anonymous, unsafe ID, unsupported plan과 non-exact input은 transaction 전에 거부한다", async () => {
  const harness = createHarness({
    [userPath]: baseUser(),
    [churchPath]: baseChurch(),
  });
  await expectError(
    () =>
      completeMemberOnboarding(
        SERVICE,
        { uid: UID, anonymous: true },
        input(),
        harness.dependencies,
      ),
    "ANONYMOUS_NOT_ALLOWED",
  );
  for (
    const request of [
      input({ orgId: "org/1" }),
      input({ departmentId: " dept-1" }),
      input({ planId: "admin_plan" }),
      { ...input(), amount: 1 } as CompleteMemberOnboardingInput,
    ]
  ) await expectError(() => complete(harness, request), "BAD_REQUEST");
  assert(harness.transactions === 0);
});

Deno.test("missing/삭제/개인/다른 교회/다른 기존 소속과 malformed roster는 쓰지 않는다", async () => {
  const missing = createHarness({ [churchPath]: baseChurch() });
  await expectError(() => complete(missing), "NOT_FOUND");
  for (
    const user of [
      baseUser({ isDeleted: true }),
      baseUser({ accountType: "personal" }),
      baseUser({ churchId: "org-2" }),
    ]
  ) {
    const harness = createHarness({
      [userPath]: user,
      [churchPath]: baseChurch(),
    });
    await expectError(() => complete(harness), "FORBIDDEN");
  }
  for (
    const initial of [
      {
        [userPath]: baseUser({ departmentId: "other" }),
        [churchPath]: baseChurch(),
      },
      {
        [userPath]: baseUser(),
        [churchPath]: baseChurch(),
        [rosterPath]: baseRoster({ uid: "other" }),
      },
      {
        [userPath]: baseUser({ currentDay: 0 }),
        [churchPath]: baseChurch(),
      },
    ] as Array<Record<string, Data>>
  ) {
    const harness = createHarness(initial);
    await expectError(() => complete(harness), "CONFLICT");
    assertEquals(harness.commits, []);
  }
});
