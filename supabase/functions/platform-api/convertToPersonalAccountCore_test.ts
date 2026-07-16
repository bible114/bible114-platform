import type { FirestoreDocument } from "../_shared/firestore.ts";
import {
  type ConvertToPersonalAccountRoster,
  type ConvertToPersonalAccountUser,
  ConvertToPersonalAccountValidationError,
  decideConvertToPersonalAccount,
} from "./convertToPersonalAccountCore.ts";

const PROJECT = "test-project";
const UID = "user-1";
const SOURCE = "church-1";
const PREFIX = `projects/${PROJECT}/databases/(default)/documents/`;
const TOKEN_EMAIL = `${encodeURIComponent("성도님")}_19900101p1234@bible.local`;
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
const expectValidation = (
  callback: () => unknown,
  code: ConvertToPersonalAccountValidationError["code"],
) => {
  try {
    callback();
    throw new Error(`expected ${code}`);
  } catch (error) {
    assert(
      error instanceof ConvertToPersonalAccountValidationError &&
        error.code === code,
      `expected ${code}, got ${error}`,
    );
  }
};

const baseUser = (overrides: Data = {}): ConvertToPersonalAccountUser => ({
  uid: UID,
  name: "성도님",
  birthdate: "19900101",
  email: "old-member@bible.local",
  role: "member",
  accountType: "church",
  churchId: SOURCE,
  churchName: "출발교회",
  primaryOrgId: null,
  isDeleted: false,
  score: 40,
  talent: 25,
  talentMigrated: true,
  talentWalletMigrated: false,
  currentDay: 30,
  streak: 7,
  readCount: 2,
  lastReadDate: "Wed Jul 15 2026",
  departmentId: "adult",
  departmentName: "장년부",
  subgroupId: "cell-1",
  subgroupName: "1구역",
  extraMemberships: [{
    departmentId: "adult",
    departmentName: "장년부",
    subgroupId: "cell-2",
    subgroupName: "2구역",
  }],
  ...overrides,
});

const baseRoster = (overrides: Data = {}): ConvertToPersonalAccountRoster => ({
  uid: UID,
  name: "성도님",
  score: 40,
  talent: 10,
  currentDay: 30,
  streak: 7,
  readCount: 2,
  lastReadDate: "Wed Jul 15 2026",
  departmentId: "adult",
  departmentName: "장년부",
  subgroupId: "cell-1",
  subgroupName: "1구역",
  extraMemberships: [],
  joinedAt: "2026-07-10T00:00:00.000Z",
  updatedAt: "2026-07-15T00:00:00.000Z",
  ...overrides,
});

const document = (
  orgId: string,
  data: ConvertToPersonalAccountRoster = baseRoster(),
  options: { pathOrgId?: string; pathUid?: string } = {},
): FirestoreDocument<ConvertToPersonalAccountRoster> => ({
  name: `${PREFIX}churches/${options.pathOrgId || orgId}/roster/${
    options.pathUid || UID
  }`,
  fields: {},
  data,
});

const decide = (overrides: {
  authenticatedUid?: string;
  tokenEmail?: string;
  expectedSourceOrgId?: string | null;
  user?: ConvertToPersonalAccountUser | null;
  sourceChurch?: Data | null;
  rosterDocuments?: FirestoreDocument<ConvertToPersonalAccountRoster>[];
  sourceRosterDocument?:
    | FirestoreDocument<ConvertToPersonalAccountRoster>
    | null;
} = {}) =>
  decideConvertToPersonalAccount({
    authenticatedUid: overrides.authenticatedUid ?? UID,
    tokenEmail: overrides.tokenEmail ?? TOKEN_EMAIL,
    ...(Object.prototype.hasOwnProperty.call(overrides, "expectedSourceOrgId")
      ? { expectedSourceOrgId: overrides.expectedSourceOrgId }
      : {}),
    user: overrides.user === undefined ? baseUser() : overrides.user,
    sourceChurch: overrides.sourceChurch === undefined
      ? { name: "출발교회", isDeleted: false }
      : overrides.sourceChurch,
    rosterDocuments: overrides.rosterDocuments || [],
    sourceRosterDocument: overrides.sourceRosterDocument || null,
  });

Deno.test("source roster가 없으면 canonical users 상태와 talent 0으로 seed한다", () => {
  const result = decide();
  assertEquals(result, {
    status: "converted",
    primaryOrgId: SOURCE,
    tokenEmail: TOKEN_EMAIL,
    writeUser: true,
    writeRoster: true,
    rosterSeed: {
      uid: UID,
      name: "성도님",
      score: 40,
      currentDay: 30,
      streak: 7,
      readCount: 2,
      lastReadDate: "Wed Jul 15 2026",
      talent: 0,
      departmentId: "adult",
      departmentName: "장년부",
      subgroupId: "cell-1",
      subgroupName: "1구역",
      extraMemberships: [{
        departmentId: "adult",
        departmentName: "장년부",
        subgroupId: "cell-2",
        subgroupName: "2구역",
      }],
    },
    rosterPatch: null,
  });
  assert((result.rosterSeed?.talent ?? -1) === 0);
});

Deno.test("기존 source roster는 보존하고 missing T97 필드만 masked repair한다", () => {
  const canonical = document(SOURCE);
  assertEquals(
    decide({ rosterDocuments: [canonical], sourceRosterDocument: canonical }),
    {
      status: "converted",
      primaryOrgId: SOURCE,
      tokenEmail: TOKEN_EMAIL,
      writeUser: true,
      writeRoster: false,
      rosterSeed: null,
      rosterPatch: null,
    },
  );

  const legacy = document(
    SOURCE,
    baseRoster({ talent: undefined, extraMemberships: undefined }),
  );
  const result = decide({
    rosterDocuments: [legacy],
    sourceRosterDocument: legacy,
  });
  assertEquals(result.rosterPatch, {
    talent: 0,
    extraMemberships: [{
      departmentId: "adult",
      departmentName: "장년부",
      subgroupId: "cell-2",
      subgroupName: "2구역",
    }],
  });
});

Deno.test("source가 없을 때 기존 3개 roster는 4번째 생성을 거부하고 source 포함 3개는 허용한다", () => {
  const others = ["a", "b", "c"].map((orgId) => document(orgId));
  expectValidation(() => decide({ rosterDocuments: others }), "ROSTER_LIMIT");

  const source = document(SOURCE);
  const result = decide({
    rosterDocuments: [others[0], others[1], source],
    sourceRosterDocument: source,
  });
  assert(result.status === "converted" && !result.writeRoster);

  expectValidation(
    () =>
      decide({
        rosterDocuments: [others[0], others[1], others[2], source],
        sourceRosterDocument: source,
      }),
    "ROSTER_LIMIT",
  );
});

Deno.test("모든 roster의 canonical path, uid, unique org와 안전 상태를 검증한다", () => {
  for (
    const rosters of [
      [document("a", baseRoster({ uid: "other" }))],
      [document("a", baseRoster(), { pathUid: "other" })],
      [document("a"), document("a")],
      [document("a", baseRoster(), { pathOrgId: "bad/org" })],
      [document("a", baseRoster({ talent: -1 }))],
      [document("a", baseRoster({ extraMemberships: null }))],
      [document("a", baseRoster({ currentDay: 366 }))],
    ]
  ) {
    expectValidation(
      () => decide({ rosterDocuments: rosters }),
      "INVALID_ROSTERS",
    );
  }

  const legacyOther = document(
    "a",
    baseRoster({ talent: undefined, extraMemberships: undefined }),
  );
  assert(decide({ rosterDocuments: [legacyOther] }).status === "converted");
});

Deno.test("source direct read와 collectionGroup 결과는 같은 canonical 문서여야 한다", () => {
  const source = document(SOURCE);
  expectValidation(
    () => decide({ rosterDocuments: [], sourceRosterDocument: source }),
    "INVALID_SOURCE_ROSTER",
  );
  expectValidation(
    () => decide({ rosterDocuments: [source], sourceRosterDocument: null }),
    "INVALID_SOURCE_ROSTER",
  );
  expectValidation(
    () =>
      decide({
        rosterDocuments: [source],
        sourceRosterDocument: document(
          SOURCE,
          baseRoster({ score: 41 }),
        ),
      }),
    "INVALID_SOURCE_ROSTER",
  );
});

Deno.test("source roster의 schema, timestamp, wallet 손상을 덮어쓰지 않는다", () => {
  for (
    const roster of [
      baseRoster({ joinedAt: "2026-02-30T00:00:00Z" }),
      baseRoster({ updatedAt: null }),
      baseRoster({ talent: null }),
      baseRoster({ extraMemberships: "bad" }),
      baseRoster({ departmentId: " bad " }),
      baseRoster({ isDeleted: true }),
    ]
  ) {
    const source = document(SOURCE, roster);
    expectValidation(
      () => decide({ rosterDocuments: [source], sourceRosterDocument: source }),
      roster.joinedAt === "2026-02-30T00:00:00Z" || roster.updatedAt === null
        ? "INVALID_SOURCE_ROSTER"
        : "INVALID_ROSTERS",
    );
  }
});

Deno.test("token email은 users의 이전 email이 아니라 name+birthdate+p+4자리 계약으로 검증한다", () => {
  assert(decide({ user: baseUser({ email: "different-old@example.com" }) }));
  for (
    const tokenEmail of [
      "old-member@bible.local",
      `${encodeURIComponent("다른이름")}_19900101p1234@bible.local`,
      `${encodeURIComponent("성도님")}_19900101p123@bible.local`,
      `${encodeURIComponent("성도님")}_19900101p1234@example.com`,
    ]
  ) {
    expectValidation(
      () => decide({ tokenEmail }),
      "INVALID_IDENTITY_EMAIL",
    );
  }
});

Deno.test("활성 member, legacy nonpersonal, canonical source church와 안전 users 상태만 허용한다", () => {
  assert(decide({ user: baseUser({ accountType: undefined }) }));
  assert(decide({ user: baseUser({ accountType: null }) }));
  assert(decide({ user: baseUser({ accountType: "member" }) }));
  assert(
    decide({ user: baseUser({ talentWalletMigrated: true, talent: 25 }) }),
  );
  for (
    const user of [
      null,
      baseUser({ uid: "other" }),
      baseUser({ role: "churchAdmin" }),
      baseUser({ accountType: "personal" }),
      baseUser({ accountType: "unknown" }),
      baseUser({ churchId: "unaffiliated_v1" }),
      baseUser({ churchId: " bad " }),
      baseUser({ primaryOrgId: SOURCE }),
      baseUser({ isDeleted: true }),
      baseUser({ talentMigrated: false }),
      baseUser({ talentWalletMigrated: "true" }),
      baseUser({ score: 1.5 }),
      baseUser({ currentDay: 366 }),
      baseUser({ birthdate: "19900230" }),
    ]
  ) {
    expectValidation(
      () => decide({ user }),
      user === null ||
        (user as ConvertToPersonalAccountUser)?.role !== "member" ||
        (user as ConvertToPersonalAccountUser)?.isDeleted === true ||
        (user as ConvertToPersonalAccountUser)?.accountType === "personal" ||
        (user as ConvertToPersonalAccountUser)?.accountType === "unknown" ||
        (user as ConvertToPersonalAccountUser)?.churchId ===
          "unaffiliated_v1" ||
        (user as ConvertToPersonalAccountUser)?.churchId === " bad " ||
        (user as ConvertToPersonalAccountUser)?.primaryOrgId === SOURCE ||
        (user as ConvertToPersonalAccountUser)?.talentWalletMigrated === "true"
        ? "USER_UNAVAILABLE"
        : "INVALID_USER",
    );
  }

  expectValidation(
    () => decide({ sourceChurch: null }),
    "SOURCE_CHURCH_UNAVAILABLE",
  );
  expectValidation(
    () => decide({ sourceChurch: { name: "출발교회", isDeleted: true } }),
    "SOURCE_CHURCH_UNAVAILABLE",
  );
});

Deno.test("후속 지갑 이관이 가능한 합계만 허용하고 conversion은 잔액을 이동하지 않는다", () => {
  const nearMax = document(SOURCE, baseRoster({ talent: 999_999_990 }));
  expectValidation(
    () =>
      decide({
        user: baseUser({ talent: 11 }),
        rosterDocuments: [nearMax],
        sourceRosterDocument: nearMax,
      }),
    "INVALID_WALLET",
  );
  const safe = decide({
    user: baseUser({ talent: 10 }),
    rosterDocuments: [nearMax],
    sourceRosterDocument: nearMax,
  });
  assert(!safe.rosterPatch && !safe.rosterSeed, "existing balance must remain");
});

Deno.test("exact replay는 안전한 미이관 또는 후속 이관 완료 상태만 허용한다", () => {
  const source = document(SOURCE);
  const intermediate = baseUser({
    accountType: "personal",
    email: TOKEN_EMAIL,
    churchId: null,
    churchName: null,
    primaryOrgId: SOURCE,
  });
  assertEquals(
    decide({
      expectedSourceOrgId: SOURCE,
      user: intermediate,
      rosterDocuments: [source],
      sourceRosterDocument: source,
    }),
    {
      status: "alreadyConverted",
      primaryOrgId: SOURCE,
      tokenEmail: TOKEN_EMAIL,
      writeUser: false,
      writeRoster: false,
      rosterSeed: null,
      rosterPatch: null,
    },
  );

  const migratedSource = document(SOURCE, baseRoster({ talent: 35 }));
  assert(
    decide({
      expectedSourceOrgId: SOURCE,
      user: { ...intermediate, talent: 0, talentWalletMigrated: true },
      rosterDocuments: [migratedSource],
      sourceRosterDocument: migratedSource,
    }).status === "alreadyConverted",
  );
  assert(
    decide({
      expectedSourceOrgId: SOURCE,
      user: { ...intermediate, talent: 5, talentWalletMigrated: true },
      rosterDocuments: [migratedSource],
      sourceRosterDocument: migratedSource,
    }).status === "alreadyConverted",
    "late positive refund must remain eligible for the follow-up wallet action",
  );

  for (
    const user of [
      { ...intermediate, email: "wrong@bible.local" },
      { ...intermediate, primaryOrgId: "other" },
      { ...intermediate, talentWalletMigrated: "true" },
    ]
  ) {
    expectValidation(
      () =>
        decide({
          expectedSourceOrgId: SOURCE,
          user,
          rosterDocuments: [source],
          sourceRosterDocument: source,
        }),
      "INVALID_REPLAY_STATE",
    );
  }
  expectValidation(
    () =>
      decide({
        expectedSourceOrgId: SOURCE,
        user: intermediate,
      }),
    "INVALID_REPLAY_STATE",
  );
});
