import type { FirestoreDocument } from "../_shared/firestore.ts";
import {
  decideJoinSoloCommunity,
  type JoinSoloCommunityRoster,
  type JoinSoloCommunityUser,
  JoinSoloCommunityValidationError,
  SOLO_COMMUNITY_ID,
} from "./joinSoloCommunityCore.ts";

const PROJECT = "test-project";
const UID = "user-1";
const PREFIX = `projects/${PROJECT}/databases/(default)/documents/`;
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
  code: JoinSoloCommunityValidationError["code"],
) => {
  try {
    callback();
    throw new Error(`expected ${code}`);
  } catch (error) {
    assert(
      error instanceof JoinSoloCommunityValidationError && error.code === code,
      `expected ${code}`,
    );
  }
};

const baseUser = (overrides: Data = {}): JoinSoloCommunityUser => ({
  uid: UID,
  name: "성도님",
  role: "member",
  accountType: "personal",
  churchId: null,
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
  ...overrides,
});

const baseRoster = (overrides: Data = {}): JoinSoloCommunityRoster => ({
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

const soloRoster = (overrides: Data = {}): JoinSoloCommunityRoster =>
  baseRoster({
    departmentId: null,
    departmentName: null,
    subgroupId: null,
    subgroupName: null,
    ...overrides,
  });

const document = (
  orgId: string,
  data: JoinSoloCommunityRoster,
  options: { uid?: string; pathOrgId?: string } = {},
): FirestoreDocument<JoinSoloCommunityRoster> => {
  const pathUid = options.uid || UID;
  const pathOrgId = options.pathOrgId || orgId;
  return {
    name: `${PREFIX}churches/${pathOrgId}/roster/${pathUid}`,
    fields: {},
    data,
  };
};

const decide = (overrides: {
  authenticatedUid?: string;
  user?: JoinSoloCommunityUser | null;
  rosterDocuments?: FirestoreDocument<JoinSoloCommunityRoster>[];
  targetDocument?: FirestoreDocument<JoinSoloCommunityRoster> | null;
} = {}) =>
  decideJoinSoloCommunity({
    authenticatedUid: overrides.authenticatedUid ?? UID,
    user: overrides.user === undefined ? baseUser() : overrides.user,
    rosterDocuments: overrides.rosterDocuments || [],
    targetDocument: overrides.targetDocument || null,
  });

Deno.test("fresh solo 참여는 users snapshot으로 정확한 roster seed를 만든다", () => {
  assertEquals(decide(), {
    status: "joined",
    writeRoster: true,
    writeUser: true,
    rosterSeed: {
      uid: UID,
      name: "성도님",
      score: 40,
      talent: 0,
      currentDay: 30,
      streak: 7,
      readCount: 2,
      lastReadDate: "Wed Jul 15 2026",
      departmentId: null,
      departmentName: null,
      subgroupId: null,
      subgroupName: null,
      extraMemberships: [],
    },
    rosterPatch: null,
  });
});

Deno.test("다른 primary가 canonical roster에 있으면 solo만 추가하고 primary를 덮어쓰지 않는다", () => {
  const other = document("church-1", baseRoster());
  const result = decide({
    user: baseUser({ primaryOrgId: "church-1" }),
    rosterDocuments: [other],
  });
  assert(result.status === "joined");
  assert(result.writeRoster && !result.writeUser);
});

Deno.test("T97 이전 non-target roster의 누락 지갑 필드는 가입을 막지 않고 명시 손상은 거부한다", () => {
  const legacyPrimary = document(
    "church-1",
    baseRoster({ talent: undefined, extraMemberships: undefined }),
  );
  const result = decide({
    user: baseUser({ primaryOrgId: "church-1" }),
    rosterDocuments: [legacyPrimary],
  });
  assert(result.status === "joined");
  assert(result.writeRoster && !result.writeUser);

  for (
    const invalidRoster of [
      baseRoster({ talent: null }),
      baseRoster({ extraMemberships: null }),
    ]
  ) {
    expectValidation(
      () =>
        decide({
          user: baseUser({ primaryOrgId: "church-1" }),
          rosterDocuments: [document("church-1", invalidRoster)],
        }),
      "INVALID_ROSTERS",
    );
  }
});

Deno.test("존재하는 solo target은 no-op 또는 null primary만 복구한다", () => {
  const target = document(SOLO_COMMUNITY_ID, soloRoster());
  assertEquals(
    decide({
      user: baseUser({ primaryOrgId: SOLO_COMMUNITY_ID }),
      rosterDocuments: [target],
      targetDocument: target,
    }),
    {
      status: "alreadyJoined",
      writeRoster: false,
      writeUser: false,
      rosterSeed: null,
      rosterPatch: null,
    },
  );
  assertEquals(
    decide({ rosterDocuments: [target], targetDocument: target }),
    {
      status: "primaryRepaired",
      writeRoster: false,
      writeUser: true,
      rosterSeed: null,
      rosterPatch: null,
    },
  );
});

Deno.test("legacy에서 solo primary roster만 삭제된 명시적 재참여는 target을 재생성한다", () => {
  const result = decide({
    user: baseUser({ primaryOrgId: SOLO_COMMUNITY_ID }),
  });
  assert(result.status === "rosterRepaired");
  assert(result.writeRoster && !result.writeUser);
});

Deno.test("초기 solo target에서만 missing talent/extra를 0/[] patch로 복구한다", () => {
  const legacy = document(
    SOLO_COMMUNITY_ID,
    soloRoster({ talent: undefined, extraMemberships: undefined }),
  );
  assertEquals(
    decide({
      user: baseUser({ primaryOrgId: SOLO_COMMUNITY_ID }),
      rosterDocuments: [legacy],
      targetDocument: legacy,
    }),
    {
      status: "rosterRepaired",
      writeRoster: true,
      writeUser: false,
      rosterSeed: null,
      rosterPatch: { talent: 0, extraMemberships: [] },
    },
  );
  for (
    const roster of [
      soloRoster({ talent: null }),
      soloRoster({ extraMemberships: null }),
    ]
  ) {
    const target = document(SOLO_COMMUNITY_ID, roster);
    expectValidation(
      () =>
        decide({
          user: baseUser({ primaryOrgId: SOLO_COMMUNITY_ID }),
          rosterDocuments: [target],
          targetDocument: target,
        }),
      "INVALID_TARGET",
    );
  }
});

Deno.test("다른 nonnull primary roster 누락은 solo로 덮어쓰지 않는다", () => {
  expectValidation(
    () => decide({ user: baseUser({ primaryOrgId: "church-missing" }) }),
    "INVALID_PRIMARY",
  );
});

Deno.test("신규 target은 3개 상한을 지키고 존재 target은 3개에서도 멱등 허용한다", () => {
  const others = ["a", "b", "c"].map((orgId) => document(orgId, baseRoster()));
  expectValidation(
    () => decide({ rosterDocuments: others }),
    "ROSTER_LIMIT",
  );
  const target = document(SOLO_COMMUNITY_ID, soloRoster());
  const threeIncludingTarget = [others[0], others[1], target];
  assert(
    decide({
      user: baseUser({ primaryOrgId: "a" }),
      rosterDocuments: threeIncludingTarget,
      targetDocument: target,
    }).status === "alreadyJoined",
  );
  expectValidation(
    () =>
      decide({
        user: baseUser({ primaryOrgId: "a" }),
        rosterDocuments: [...threeIncludingTarget, others[2]],
        targetDocument: target,
      }),
    "ROSTER_LIMIT",
  );
});

Deno.test("경로·uid·중복·target query 누락을 fail closed한다", () => {
  const target = document(SOLO_COMMUNITY_ID, soloRoster());
  for (
    const rosterDocuments of [
      [document("church-1", baseRoster(), { uid: "other" })],
      [document("church-1", baseRoster({ uid: "other" }))],
      [document("church-1", baseRoster()), document("church-1", baseRoster())],
      [document("church-1", baseRoster(), { pathOrgId: "bad/org" })],
    ]
  ) {
    expectValidation(
      () => decide({ rosterDocuments }),
      "INVALID_ROSTERS",
    );
  }
  expectValidation(
    () => decide({ targetDocument: target, rosterDocuments: [] }),
    "INVALID_TARGET",
  );
});

Deno.test("users 활성·정체성·legacy talent 의미를 fail closed한다", () => {
  // legacy conversion users는 uid/isDeleted 필드가 없을 수 있다.
  assert(decide({ user: baseUser({ uid: undefined, isDeleted: undefined }) }));
  for (
    const user of [
      null,
      baseUser({ uid: "other" }),
      baseUser({ role: "churchAdmin" }),
      baseUser({ accountType: "church" }),
      baseUser({ churchId: "church-1" }),
      baseUser({ isDeleted: true }),
      baseUser({ isDeleted: "false" }),
      baseUser({ talentMigrated: false }),
      baseUser({ talentMigrated: undefined }),
      baseUser({ talent: -1 }),
      baseUser({ score: 1.5 }),
      baseUser({ currentDay: 366 }),
      baseUser({ readCount: 0 }),
    ]
  ) {
    expectValidation(
      () => decide({ user }),
      user === null || (user as JoinSoloCommunityUser)?.role !== "member" ||
        (user as JoinSoloCommunityUser)?.accountType !== "personal" ||
        (user as JoinSoloCommunityUser)?.churchId !== null ||
        (user as JoinSoloCommunityUser)?.isDeleted === true
        ? "USER_UNAVAILABLE"
        : "INVALID_USER",
    );
  }
});

Deno.test("target의 삭제·지갑·소속·timestamp 손상을 복구라고 덮어쓰지 않는다", () => {
  for (
    const roster of [
      soloRoster({ isDeleted: true }),
      soloRoster({ talent: -1 }),
      soloRoster({ score: 1.5 }),
      soloRoster({ departmentId: "forged" }),
      soloRoster({ extraMemberships: [{ forged: true }] }),
      soloRoster({ joinedAt: "2026-02-30T00:00:00Z" }),
    ]
  ) {
    const target = document(SOLO_COMMUNITY_ID, roster);
    expectValidation(
      () =>
        decide({
          user: baseUser({ primaryOrgId: SOLO_COMMUNITY_ID }),
          rosterDocuments: [target],
          targetDocument: target,
        }),
      "INVALID_TARGET",
    );
  }
});
