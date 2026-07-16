import {
  decideCompleteMemberOnboarding,
  type MemberOnboardingValidationCode,
  MemberOnboardingValidationError,
  normalizeOwnMembershipDocumentId,
} from "./ownMembershipCore.ts";

const UID = "user-1";
const ORG_ID = "org-1";

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

const emptyMembership = {
  departmentId: null,
  departmentName: null,
  subgroupId: null,
  subgroupName: null,
};

const canonicalMembership = {
  departmentId: "dept-1",
  departmentName: "청년부",
  subgroupId: "group-1",
  subgroupName: "믿음반",
};

const baseUser = (overrides: Record<string, unknown> = {}) => ({
  uid: UID,
  role: "member",
  churchId: ORG_ID,
  accountType: "church",
  isDeleted: false,
  planId: "1year_revised",
  ...emptyMembership,
  ...overrides,
});

const baseChurch = (overrides: Record<string, unknown> = {}) => ({
  isDeleted: false,
  departments: [{
    id: "dept-1",
    name: "청년부",
    subgroups: [{ id: "group-1", name: "믿음반" }],
  }],
  ...overrides,
});

const baseRoster = (overrides: Record<string, unknown> = {}) => ({
  uid: UID,
  isDeleted: false,
  ...emptyMembership,
  ...overrides,
});

const decide = (overrides: Record<string, unknown> = {}) =>
  decideCompleteMemberOnboarding({
    authenticatedUid: UID,
    orgId: ORG_ID,
    planId: "1year_new",
    departmentId: "dept-1",
    subgroupId: "group-1",
    user: baseUser(),
    church: baseChurch(),
    roster: null,
    ...overrides,
  });

const expectValidationError = (
  callback: () => unknown,
  code: MemberOnboardingValidationCode,
) => {
  try {
    callback();
    throw new Error(`expected ${code}`);
  } catch (error) {
    assert(
      error instanceof MemberOnboardingValidationError && error.code === code,
      `expected ${code}, got ${error}`,
    );
  }
};

Deno.test("최초 온보딩 ID는 원문 그대로인 안전한 단일 segment만 허용한다", () => {
  assert(normalizeOwnMembershipDocumentId("org-1") === "org-1");
  assert(normalizeOwnMembershipDocumentId("", { allowEmpty: true }) === "");
  for (const value of ["", " org-1", "org-1 ", ".", "..", "a/b", "a\n"]) {
    assert(normalizeOwnMembershipDocumentId(value) === null, String(value));
  }
});

Deno.test("fresh 일반 회원은 서버 파생 이름과 선택 plan으로 users를 완료한다", () => {
  assertEquals(decide(), {
    status: "completed",
    orgId: ORG_ID,
    planId: "1year_new",
    membership: canonicalMembership,
    writeUser: true,
    writeRoster: false,
  });
});

Deno.test("optional legacy roster가 있으면 users와 함께 같은 소속으로 미러한다", () => {
  assertEquals(decide({ roster: baseRoster() }), {
    status: "completed",
    orgId: ORG_ID,
    planId: "1year_new",
    membership: canonicalMembership,
    writeUser: true,
    writeRoster: true,
  });
});

Deno.test("교회 관리자는 roster 없이 users-only 최초 온보딩을 완료한다", () => {
  assert(
    decide({
      user: baseUser({
        role: "churchAdmin",
        planId: null,
        onboardingPending: true,
      }),
    }).writeUser,
  );
  for (const onboardingPending of [undefined, false, "true"]) {
    expectValidationError(
      () =>
        decide({
          user: baseUser({ role: "churchAdmin", onboardingPending }),
        }),
      onboardingPending === "true" ? "INVALID_USER" : "ONBOARDING_CONFLICT",
    );
  }
});

Deno.test("미완료 legacy plan은 사용자가 고른 현재 허용 plan으로 회수한다", () => {
  const decision = decide({ user: baseUser({ planId: "1year_easy" }) });
  assert(decision.status === "completed");
  assert(decision.planId === "1year_new");
});

Deno.test("canonical plan과 소속이 이미 같으면 no-op이다", () => {
  assertEquals(
    decide({
      user: baseUser({ planId: "1year_new", ...canonicalMembership }),
      roster: baseRoster(canonicalMembership),
    }),
    {
      status: "alreadyCompleted",
      orgId: ORG_ID,
      planId: "1year_new",
      membership: canonicalMembership,
      writeUser: false,
      writeRoster: false,
    },
  );
  assertEquals(
    decide({
      user: baseUser({
        role: "churchAdmin",
        onboardingPending: false,
        planId: "1year_new",
        ...canonicalMembership,
      }),
    }).status,
    "alreadyCompleted",
  );
});

Deno.test("legacy string/object 조직을 joinCore와 같은 규칙으로 정규화한다", () => {
  assertEquals(
    decide({
      departmentId: "청년부",
      subgroupId: "믿음반",
      church: { communities: [{ name: " 청년부 ", subgroups: [" 믿음반 "] }] },
    }).membership,
    {
      departmentId: "청년부",
      departmentName: "청년부",
      subgroupId: "믿음반",
      subgroupName: "믿음반",
    },
  );
});

Deno.test("subgroup가 있으면 exact ID가 필수이고 없으면 빈 ID만 허용한다", () => {
  expectValidationError(
    () => decide({ subgroupId: "" }),
    "INVALID_SUBGROUP",
  );
  const church = { departments: [{ id: "dept-1", name: "청년부" }] };
  assert(decide({ subgroupId: "", church }).membership.subgroupName === "");
  expectValidationError(
    () => decide({ subgroupId: "group-1", church }),
    "INVALID_SUBGROUP",
  );
});

Deno.test("개인 계정, 삭제 사용자, 다른 교회와 지원하지 않는 역할은 거부한다", () => {
  expectValidationError(
    () => decide({ user: baseUser({ accountType: "personal" }) }),
    "PERSONAL_UNSUPPORTED",
  );
  for (
    const user of [
      baseUser({ isDeleted: true }),
      baseUser({ churchId: "org-2" }),
      baseUser({ role: "platformAdmin" }),
    ]
  ) {
    expectValidationError(() => decide({ user }), "USER_UNAVAILABLE");
  }
});

Deno.test("다른 기존 소속, 부분 소속, users/roster 불일치는 덮어쓰지 않는다", () => {
  for (
    const overrides of [
      { user: baseUser({ departmentId: "other" }) },
      { user: baseUser({ ...canonicalMembership, planId: "1year_revised" }) },
      { roster: baseRoster({ departmentId: "other" }) },
      {
        user: baseUser({ planId: "1year_new", ...canonicalMembership }),
        roster: baseRoster(),
      },
    ]
  ) {
    expectValidationError(
      () => decide(overrides),
      "ONBOARDING_CONFLICT",
    );
  }
});

Deno.test("roster는 활성 상태와 exact uid를 요구하고 extra 필드는 결정에 섞지 않는다", () => {
  for (
    const roster of [
      baseRoster({ uid: "other" }),
      baseRoster({ uid: undefined }),
      baseRoster({ isDeleted: true }),
      baseRoster({ isDeleted: "false" }),
    ]
  ) {
    expectValidationError(() => decide({ roster }), "INVALID_ROSTER");
  }
  const result = decide({
    roster: baseRoster({ extraMemberships: [{ keep: true }] }),
  });
  assert(!("extraMemberships" in result.membership));
});

Deno.test("plan, church와 조직 구조의 malformed 상태를 fail closed한다", () => {
  expectValidationError(() => decide({ planId: "admin_plan" }), "INVALID_PLAN");
  expectValidationError(
    () => decide({ church: baseChurch({ isDeleted: "false" }) }),
    "INVALID_CHURCH",
  );
  expectValidationError(
    () => decide({ church: baseChurch({ departments: ["a/b"] }) }),
    "INVALID_CHURCH",
  );
  expectValidationError(
    () => decide({ church: baseChurch({ departments: ["청년부", "청년부"] }) }),
    "INVALID_CHURCH",
  );
});
