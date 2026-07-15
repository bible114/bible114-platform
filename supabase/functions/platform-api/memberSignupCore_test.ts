import {
  MemberSignupValidationError,
  validateMemberSignup,
} from "./memberSignupCore.ts";

const assert = (condition: unknown, message: string) => {
  if (!condition) throw new Error(message);
};

const consent = (under14 = false) => ({
  schemaVersion: 1,
  policyVersions: {
    terms: "2026-07-14",
    privacy: "2026-07-14",
    sensitive: "2026-07-14",
    community: "2026-07-14",
    childGuardian: "2026-07-14",
  },
  agreedAt: "2026-07-15T01:00:00.000Z",
  audience: "member",
  ageAssessment: {
    birthdate: under14 ? "20150101" : "20000101",
    under14,
  },
  agreements: {
    terms: { agreed: true },
    privacy: { agreed: true },
    sensitive: { agreed: true },
    community: { agreed: true },
    childGuardian: { agreed: under14 },
  },
});

const fixture = (overrides: Record<string, unknown> = {}) => ({
  uid: "member-1",
  email: "member-1@example.com",
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
  church: { name: "성서교회", churchCodeHash: "hash" },
  consent: consent(false),
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

Deno.test("만 14세 미만은 보호자 동의 기록을 요구한다", () => {
  const childConsent = consent(true);
  const result = validateMemberSignup(fixture({
    birthdate: "20150101",
    consent: childConsent,
  }));
  assert(result.profile.consentSummary.under14 === true, "child summary");

  const missingGuardian = {
    ...childConsent,
    agreements: {
      ...childConsent.agreements,
      childGuardian: { agreed: false },
    },
  };
  expectCode("INVALID_CONSENT", () =>
    validateMemberSignup(fixture({
      birthdate: "20150101",
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
});
