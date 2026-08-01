import {
  buildMemberReactivation,
  MemberSignupValidationError,
  validateMemberSignup,
} from "./memberSignupCore.ts";
import { SIGNUP_POLICY_VERSION } from "./signupConsentCore.ts";

const assert = (condition: unknown, message: string) => {
  if (!condition) throw new Error(message);
};

const consent = (under14 = false) => ({
  schemaVersion: 1,
  policyVersions: {
    terms: SIGNUP_POLICY_VERSION,
    privacy: SIGNUP_POLICY_VERSION,
    sensitive: SIGNUP_POLICY_VERSION,
    community: SIGNUP_POLICY_VERSION,
    childGuardian: SIGNUP_POLICY_VERSION,
  },
  agreedAt: "2026-07-15T01:00:00.000Z",
  source: "church_member_signup",
  locale: "ko-KR",
  audience: "member",
  ageAssessment: {
    birthdate: under14 ? "20150101" : "20000101",
    asOfDate: "2026-07-15",
    age: under14 ? 11 : 26,
    under14,
  },
  agreements: {
    terms: { agreed: true },
    privacy: { agreed: true },
    sensitive: { agreed: true },
    community: { agreed: true },
    childGuardian: under14
      ? {
        required: true,
        agreed: true,
        method: "guardian_assertion",
        guardianName: "홍보호",
        relationship: "부",
        identityVerifiedByPlatform: false,
        legalAuthorityVerifiedByPlatform: false,
      }
      : {
        required: false,
        agreed: false,
        method: null,
        identityVerifiedByPlatform: false,
        legalAuthorityVerifiedByPlatform: false,
      },
  },
  recordedAt: "2026-07-15T01:00:01.000Z",
});

const fixture = (overrides: Record<string, unknown> = {}) => ({
  uid: "member-1",
  email: "%ed%99%8d%ea%b8%b8%eb%8f%99_20000101_church-1@bible.local",
  signInProvider: "password",
  churchId: "church-1",
  entryCodeHash: "hash",
  name: "홍길동",
  birthdate: "20000101",
  guestProgress: {
    currentDay: 42,
    streak: 3,
    lastReadDate: "Tue Jul 14 2026",
    planId: "1year_revised",
  },
  calendarDate: "2026-07-15",
  now: new Date("2026-07-15T01:01:00.000Z"),
  church: { name: "성서교회", churchCodeHash: "hash" },
  consent: consent(false),
  credentials: { password: "secret1" },
  existingUser: null,
  existingRoster: null,
  ...overrides,
});

const expectCode = (code: string, fn: () => unknown) => {
  try {
    fn();
    throw new Error(`expected ${code}`);
  } catch (error) {
    assert(
      error instanceof MemberSignupValidationError && error.code === code,
      `expected ${code}`,
    );
  }
};

Deno.test("교회 교인 가입은 서버가 프로필과 동의 요약을 정규화한다", () => {
  const result = validateMemberSignup(fixture());
  assert(result.status === "create", "new signup should create");
  assert(result.profile.churchName === "성서교회", "canonical church name");
  assert(result.profile.consentSummary.under14 === false, "adult summary");
  assert(result.profile.guestProgress.currentDay === 42, "guest progress");
});

Deno.test("일반 교인도 password provider·canonical email·private 암호를 요구한다", () => {
  for (
    const invalid of [
      { signInProvider: "google.com" },
      { signInProvider: "custom" },
      { email: "member-1@example.com" },
      { credentials: null },
      { credentials: { password: "short" } },
      { credentials: { password: "secret\n" } },
    ]
  ) {
    expectCode(
      "INVALID_PROFILE",
      () => validateMemberSignup(fixture(invalid)),
    );
  }
});

Deno.test("무소속 가상 공동체 가입은 입장코드 없이 서버에서 허용한다", () => {
  const result = validateMemberSignup(fixture({
    email:
      "%ED%99%8D%EA%B8%B8%EB%8F%99_20000101p1234_unaffiliated_v1@bible.local",
    churchId: "unaffiliated_v1",
    entryCodeHash: "",
    church: { name: "성경 읽는 사람들", isVirtual: true },
    credentials: { password: "secret1", phone4: "1234" },
  }));
  assert(result.status === "create", "virtual signup should create");
  expectCode("CHURCH_UNAVAILABLE", () =>
    validateMemberSignup(fixture({
      email:
        "%ED%99%8D%EA%B8%B8%EB%8F%99_20000101p1234_unaffiliated_v1@bible.local",
      churchId: "unaffiliated_v1",
      entryCodeHash: "",
      church: { name: "성경 읽는 사람들", isVirtual: false },
      credentials: { password: "secret1", phone4: "1234" },
    })));
  const validUnaffiliated = {
    email:
      "%ED%99%8D%EA%B8%B8%EB%8F%99_20000101p1234_unaffiliated_v1@bible.local",
    churchId: "unaffiliated_v1",
    entryCodeHash: "",
    church: { name: "성경 읽는 사람들", isVirtual: true },
    credentials: { password: "secret1", phone4: "1234" },
  };
  for (
    const invalid of [
      { credentials: null },
      { credentials: { password: "short", phone4: "1234" } },
      { credentials: { password: "secret1", phone4: "12a4" } },
      {
        credentials: { password: "secret1", phone4: "1234" },
        email: "different_20000101p1234_unaffiliated_v1@bible.local",
      },
    ]
  ) {
    expectCode("INVALID_PROFILE", () =>
      validateMemberSignup(fixture({
        ...validUnaffiliated,
        ...invalid,
      })));
  }
});

Deno.test("만 14세 미만은 보호자 동의 기록을 요구한다", () => {
  const childConsent = consent(true);
  const result = validateMemberSignup(fixture({
    birthdate: "20150101",
    email: "%ed%99%8d%ea%b8%b8%eb%8f%99_20150101_church-1@bible.local",
    consent: childConsent,
  }));
  assert(result.profile.consentSummary.under14 === true, "child summary");

  const missingGuardian = {
    ...childConsent,
    agreements: {
      ...childConsent.agreements,
      childGuardian: {
        ...childConsent.agreements.childGuardian,
        agreed: false,
      },
    },
  };
  expectCode("INVALID_CONSENT", () =>
    validateMemberSignup(fixture({
      birthdate: "20150101",
      email: "%ed%99%8d%ea%b8%b8%eb%8f%99_20150101_church-1@bible.local",
      consent: missingGuardian,
    })));
});

Deno.test("동일 uid·교회의 정상 회원은 멱등, 삭제 회원은 재활성화한다", () => {
  const active = validateMemberSignup(fixture({
    existingUser: { role: "member", churchId: "church-1", isDeleted: false },
  }));
  assert(active.status === "alreadyCompleted", "active retry is idempotent");
  const deleted = validateMemberSignup(fixture({
    existingUser: { role: "member", churchId: "church-1", isDeleted: true },
  }));
  assert(deleted.status === "reactivate", "deleted member can reactivate");
});

Deno.test("삭제 회원 재활성화는 기존 진도·지갑·조직·가입일을 보존한다", () => {
  const existingUser = {
    role: "member",
    churchId: "church-1",
    isDeleted: true,
    platformStatsReaderCounted: false,
    score: 987,
    talent: 45,
    currentDay: 212,
    readCount: 219,
    departmentId: "youth",
    createdAt: "2024-01-01T00:00:00.000Z",
  };
  const decision = validateMemberSignup(fixture({ existingUser }));
  const now = new Date("2026-07-15T01:02:00.000Z");
  const plan = buildMemberReactivation({
    existingUser,
    consentSummary: decision.profile.consentSummary,
    now,
  });
  assert(plan.readerDelta === 1, "reactivation reader stats not restored");
  assert(plan.responseUser.score === 987, "score reset");
  assert(plan.responseUser.talent === 45, "talent reset");
  assert(plan.responseUser.currentDay === 212, "progress reset");
  assert(plan.responseUser.departmentId === "youth", "organization reset");
  assert(
    plan.responseUser.createdAt === "2024-01-01T00:00:00.000Z",
    "createdAt reset",
  );
  assert(
    plan.updateMask.join(",") ===
      "isDeleted,deletedAt,deletedBy,platformStatsReaderCounted,consentSummary,updatedAt",
    "reactivation update mask widened",
  );
});

Deno.test("삭제 회원 marker가 없거나 어긋나면 재활성화 전에 재계산을 요구한다", () => {
  const decision = validateMemberSignup(fixture({
    existingUser: {
      role: "member",
      churchId: "church-1",
      isDeleted: true,
    },
  }));
  expectCode("STATS_REBUILD_REQUIRED", () =>
    buildMemberReactivation({
      existingUser: {
        role: "member",
        churchId: "church-1",
        isDeleted: true,
      },
      consentSummary: decision.profile.consentSummary,
      now: new Date("2026-07-15T01:02:00.000Z"),
    }));
});

Deno.test("입장코드·소속 충돌·고아 roster를 거부한다", () => {
  expectCode(
    "INVALID_ENTRY_CODE",
    () => validateMemberSignup(fixture({ entryCodeHash: "wrong" })),
  );
  expectCode("USER_CONFLICT", () =>
    validateMemberSignup(fixture({
      existingUser: { role: "member", churchId: "church-2" },
    })));
  expectCode("ROSTER_CONFLICT", () =>
    validateMemberSignup(fixture({
      existingRoster: { uid: "member-1" },
    })));
});

Deno.test("게스트 진도는 일자·범위·허용 플랜을 검증한다", () => {
  expectCode("INVALID_PROFILE", () =>
    validateMemberSignup(fixture({
      guestProgress: {
        currentDay: 366,
        streak: 0,
        lastReadDate: null,
        planId: "1year_revised",
      },
    })));
  expectCode("INVALID_PROFILE", () =>
    validateMemberSignup(fixture({
      guestProgress: {
        currentDay: 2,
        streak: 1,
        lastReadDate: "Thu Jul 16 2026",
        planId: "1year_revised",
      },
    })));
  expectCode("INVALID_PROFILE", () =>
    validateMemberSignup(fixture({
      guestProgress: {
        currentDay: 2,
        streak: 1,
        lastReadDate: null,
        planId: "admin_plan",
      },
    })));
  const readable = validateMemberSignup(fixture({
    guestProgress: {
      currentDay: 185,
      streak: 1,
      lastReadDate: null,
      planId: "readable_revised",
    },
  }));
  assert(readable.profile.guestProgress.currentDay === 5, "60-day progress");
});
