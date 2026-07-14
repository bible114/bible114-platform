import { assertEquals, assertThrows } from "jsr:@std/assert@1";
import {
  PersonalSignupValidationError,
  validatePersonalSignup,
} from "./personalSignupCore.ts";

const consent = (under14 = false) => ({
  schemaVersion: 1,
  policyVersions: { terms: "v1", privacy: "v1", sensitive: "v1", community: "v1", childGuardian: "v1" },
  agreedAt: "2026-07-15T00:00:00.000Z",
  audience: "personal",
  ageAssessment: { birthdate: under14 ? "20150101" : "19900101", under14 },
  agreements: {
    terms: { agreed: true }, privacy: { agreed: true }, sensitive: { agreed: true },
    community: { agreed: true }, childGuardian: { agreed: under14 },
  },
});

const base = () => ({
  uid: "uid-1",
  email: "reader@example.com",
  signInProvider: "google.com",
  authProvider: "google.com",
  name: "홍길동",
  birthdate: "19900101",
  guestProgress: { currentDay: 3, streak: 2, lastReadDate: "Tue Jul 14 2026", planId: "1year_revised" },
  calendarDate: "2026-07-15",
  churchId: "church-1",
  entryCodeHash: "hash",
  departmentId: "children",
  subgroupId: "class-1",
  church: {
    name: "테스트교회",
    churchCodeHash: "hash",
    departments: [{ id: "children", name: "주일학교", subgroups: [{ id: "class-1", name: "1반" }] }],
  },
  consent: consent(),
  existingUser: null,
  existingRoster: null,
});

Deno.test("개인 소셜 가입은 서버 공동체 조직과 동의를 정규화한다", () => {
  const result = validatePersonalSignup(base());
  assertEquals(result.status, "create");
  assertEquals(result.membership, {
    departmentId: "children", departmentName: "주일학교", subgroupId: "class-1", subgroupName: "1반",
  });
  assertEquals(result.consentSummary.audience, "personal");
});

Deno.test("혼자 읽기와 비밀번호 개인 가입도 안전한 서버 경로를 사용한다", () => {
  const solo = base();
  Object.assign(solo, { churchId: "unaffiliated_v1", entryCodeHash: "", departmentId: "", subgroupId: "", church: null });
  assertEquals(validatePersonalSignup(solo).membership?.departmentId, null);

  const password = base();
  Object.assign(password, {
    signInProvider: "password", authProvider: "password", churchId: "", entryCodeHash: "",
    departmentId: "", subgroupId: "", church: null,
  });
  assertEquals(validatePersonalSignup(password).membership, null);
});

Deno.test("삭제 계정과 고아 roster는 재활성화하지 않고 거부한다", () => {
  const deleted = {
    ...base(),
    existingUser: { role: "member", accountType: "personal", primaryOrgId: "church-1", isDeleted: true },
  };
  assertThrows(() => validatePersonalSignup(deleted), PersonalSignupValidationError, "USER_CONFLICT");
  const orphan = { ...base(), existingRoster: { uid: "uid-1" } };
  assertThrows(() => validatePersonalSignup(orphan), PersonalSignupValidationError, "ROSTER_CONFLICT");
});

Deno.test("보호자 동의, 공급자, 미래 게스트 날짜를 검증한다", () => {
  const child = base();
  Object.assign(child, { birthdate: "20150101", consent: consent(false) });
  assertThrows(() => validatePersonalSignup(child), PersonalSignupValidationError, "INVALID_CONSENT");
  const provider = base();
  provider.authProvider = "kakao.com";
  assertThrows(() => validatePersonalSignup(provider), PersonalSignupValidationError, "INVALID_PROFILE");
  const future = base();
  future.guestProgress = { ...future.guestProgress, lastReadDate: "Thu Jul 16 2026" };
  assertThrows(() => validatePersonalSignup(future), PersonalSignupValidationError, "INVALID_PROFILE");
});
