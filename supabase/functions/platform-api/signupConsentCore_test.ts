import { assertEquals, assertThrows } from "jsr:@std/assert@1";
import {
  SIGNUP_POLICY_VERSION,
  SignupConsentValidationError,
  validateStoredSignupConsent,
} from "./signupConsentCore.ts";

const consent = ({
  audience = "member",
  birthdate = "20000101",
  under14 = false,
}: {
  audience?: "member" | "personal";
  birthdate?: string;
  under14?: boolean;
} = {}) => ({
  schemaVersion: 1,
  policyVersions: {
    terms: SIGNUP_POLICY_VERSION,
    privacy: SIGNUP_POLICY_VERSION,
    sensitive: SIGNUP_POLICY_VERSION,
    community: SIGNUP_POLICY_VERSION,
    childGuardian: SIGNUP_POLICY_VERSION,
  },
  agreedAt: "2026-07-15T01:00:00.000Z",
  source: audience === "member"
    ? "church_member_signup"
    : "manual_personal_signup",
  locale: "ko-KR",
  audience,
  ageAssessment: {
    birthdate,
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

const validate = (value: Record<string, unknown>) =>
  validateStoredSignupConsent({
    consent: value,
    birthdate: String(
      (value.ageAssessment as Record<string, unknown>).birthdate,
    ),
    calendarDate: "2026-07-15",
    now: new Date("2026-07-15T01:01:00.000Z"),
    audience: value.audience as "member" | "personal",
    allowedSources: value.audience === "member"
      ? ["church_member_signup"]
      : ["manual_personal_signup"],
  });

Deno.test("현재 정책의 exact 회원 동의만 요약한다", () => {
  const result = validate(consent());
  assertEquals(result.policyVersions.terms, SIGNUP_POLICY_VERSION);
  assertEquals(result.under14, false);
  assertEquals(result.guardianConsentRecorded, false);
});

Deno.test("현재 정책과 다른 버전, 미래 시각, 추가 필드를 거부한다", () => {
  const stale = consent();
  (stale.policyVersions as Record<string, string>).terms = "2026-07-14";
  assertThrows(() => validate(stale), SignupConsentValidationError);

  const future = consent();
  future.agreedAt = "2099-01-01T00:00:00.000Z";
  assertThrows(() => validate(future), SignupConsentValidationError);

  assertThrows(
    () => validate({ ...consent(), forged: true }),
    SignupConsentValidationError,
  );
});

Deno.test("아동은 정확한 보호자 이름과 관계 증빙을 요구한다", () => {
  const child = consent({
    birthdate: "20150101",
    under14: true,
  });
  assertEquals(validate(child).guardianConsentRecorded, true);

  const incomplete = structuredClone(child);
  delete incomplete.agreements.childGuardian.guardianName;
  assertThrows(() => validate(incomplete), SignupConsentValidationError);

  const invalidRelationship = structuredClone(child);
  invalidRelationship.agreements.childGuardian.relationship = "친구";
  assertThrows(
    () => validate(invalidRelationship),
    SignupConsentValidationError,
  );
});
