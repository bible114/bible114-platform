import {
  type JoinCommunityInput,
  JoinCommunityValidationError,
  validateJoinCommunity,
} from "./joinCore.ts";

const assert = (condition: unknown, message: string) => {
  if (!condition) throw new Error(message);
};

const fixture = (
  overrides: Partial<JoinCommunityInput> = {},
): JoinCommunityInput => ({
  uid: "user-1",
  churchId: "church-2",
  entryCodeHash: "hash-ok",
  departmentId: "kids",
  subgroupId: "faith",
  rosterCount: 1,
  existingRoster: null,
  user: {
    name: "테스트",
    churchId: "church-1",
    accountType: "personal",
    primaryOrgId: null,
    score: 12,
    currentDay: 4,
    streak: 2,
    readCount: 1,
    planId: "readable_new",
    fixtureType: "reading-badge-test",
  },
  church: {
    churchCodeHash: "hash-ok",
    departments: [{
      id: "kids",
      name: "주일학교",
      subgroups: [{ id: "faith", name: "믿음반" }],
    }],
  },
  ...overrides,
});

const expectCode = (code: string, overrides: Record<string, unknown>) => {
  try {
    validateJoinCommunity(fixture(overrides));
    throw new Error(`expected ${code}`);
  } catch (error) {
    assert(
      error instanceof JoinCommunityValidationError && error.code === code,
      `expected ${code}`,
    );
  }
};

Deno.test("서버 원장 값으로 roster와 personal 기본 공동체를 계산한다", () => {
  const result = validateJoinCommunity(fixture());
  assert(result.status === "ready", "ready expected");
  assert(result.shouldAssignPrimary, "primary assignment expected");
  assert(
    result.membership.departmentName === "주일학교",
    "canonical department expected",
  );
  assert(
    result.membership.subgroupName === "믿음반",
    "canonical subgroup expected",
  );
  assert(
    result.membership.score === 12 && result.membership.talent === 0,
    "server wallet snapshot expected",
  );
  assert(
    result.membership.planId === "readable_new" &&
      result.membership.fixtureType === "reading-badge-test",
    "community progress identity snapshot expected",
  );
});

Deno.test("입장코드, 기본 공동체, 삭제 상태, 최대 3개를 거부한다", () => {
  expectCode("INVALID_ENTRY_CODE", { entryCodeHash: "wrong" });
  expectCode("BASE_CHURCH", { user: { churchId: "church-2" } });
  expectCode("USER_UNAVAILABLE", { user: { isDeleted: true } });
  expectCode("CHURCH_UNAVAILABLE", { church: { isDeleted: true } });
  expectCode("MEMBERSHIP_LIMIT", { rosterCount: 3 });
});

Deno.test("서버 공동체 조직에 없는 부서와 소그룹을 거부한다", () => {
  expectCode("INVALID_DEPARTMENT", { departmentId: "adult" });
  expectCode("INVALID_SUBGROUP", { subgroupId: "unknown" });
  expectCode("INVALID_SUBGROUP", {
    subgroupId: "",
    church: {
      churchCodeHash: "hash-ok",
      departments: [{ id: "kids", name: "주일학교", subgroups: ["믿음반"] }],
    },
  });
});

Deno.test("기존 roster는 중복 쓰기 없이 멱등 성공한다", () => {
  const existingRoster = { uid: "user-1", departmentId: "kids" };
  const result = validateJoinCommunity(fixture({
    rosterCount: 3,
    existingRoster,
  }));
  assert(result.status === "alreadyJoined", "idempotent result expected");
  assert(result.membership === existingRoster, "stored membership expected");
});
