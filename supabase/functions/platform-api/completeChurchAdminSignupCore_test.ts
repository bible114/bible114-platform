import {
  churchAdminSignupIdentityFromVerifiedUser,
  churchIdForAdminSignupRequest,
  type CompleteChurchAdminSignupIdentity,
  type CompleteChurchAdminSignupInput,
  CompleteChurchAdminSignupValidationError,
  exactDeepEqual,
  isCanonicalFirestoreTimestamp,
  sanitizeChurchAdminSignupLegacyDirectory,
  validateCanonicalChurchAdminSignupState,
  validateCompleteChurchAdminSignup,
} from "./completeChurchAdminSignupCore.ts";

const REQUEST_ID = "123e4567-e89b-42d3-a456-426614174000";
const CHURCH_ID = "church_123e4567e89b42d3a456426614174000";
const TIMESTAMP = "2026-07-16T03:04:05.000Z";
const HASH = "a".repeat(64);

const assert = (condition: unknown, message = "assertion failed") => {
  if (!condition) throw new Error(message);
};

const assertEquals = (actual: unknown, expected: unknown, message = "") => {
  if (!exactDeepEqual(actual, expected)) {
    throw new Error(
      `${message ? `${message}: ` : ""}expected ${
        JSON.stringify(expected)
      }, got ${JSON.stringify(actual)}`,
    );
  }
};

const assertValidationCode = (
  code: CompleteChurchAdminSignupValidationError["code"],
  fn: () => unknown,
) => {
  try {
    fn();
  } catch (error) {
    if (!(error instanceof CompleteChurchAdminSignupValidationError)) {
      throw error;
    }
    assertEquals(error.code, code);
    return;
  }
  throw new Error(`expected ${code}`);
};

const identity = (
  provider: "password" | "google.com" | "kakao.com" = "password",
  overrides: Record<string, unknown> = {},
): CompleteChurchAdminSignupIdentity => ({
  uid: provider === "kakao.com" ? "kakao:12345" : "admin-1",
  tokenEmail: provider === "kakao.com" ? null : "ADMIN@Example.com",
  signInProvider: provider === "kakao.com" ? "custom" : provider,
  kakaoProviderAttestation: provider === "kakao.com" ? "kakao.com" : null,
  kakaoId: provider === "kakao.com" ? "12345" : null,
  ...overrides,
});

const consent = (
  provider: "password" | "google.com" | "kakao.com" = "password",
) => ({
  schemaVersion: 1,
  policyVersions: {
    terms: "2026-07-16",
    privacy: "2026-07-16",
    sensitive: "2026-07-16",
    community: "2026-07-16",
    childGuardian: "2026-07-16",
  },
  agreedAt: "2026-07-16T03:00:00.000Z",
  source: provider === "password"
    ? "email_community_admin_signup"
    : provider === "google.com"
    ? "google_community_admin_signup"
    : "kakao_community_admin_signup",
  locale: "ko-KR",
  audience: "communityAdmin",
  ageAssessment: {
    birthdate: null,
    asOfDate: "2026-07-16",
    age: null,
    under14: false,
    confirmed14Plus: true,
  },
  agreements: {
    terms: { agreed: true },
    privacy: { agreed: true },
    sensitive: { agreed: true },
    community: { agreed: true },
    childGuardian: {
      required: false,
      agreed: false,
      method: null,
      identityVerifiedByPlatform: false,
      legalAuthorityVerifiedByPlatform: false,
    },
  },
});

const input = (
  provider: "password" | "google.com" | "kakao.com" = "password",
  overrides: Record<string, unknown> = {},
): CompleteChurchAdminSignupInput => ({
  requestId: REQUEST_ID,
  name: "관리자",
  churchName: "테스트교회",
  pastorName: "홍길동 목사",
  denomination: "예장합동",
  entryCode: "safe-code",
  departments: [{
    id: "adult",
    name: "장년부",
    subgroups: [{ id: "cell-1", name: "1구역" }],
  }],
  password: provider === "password" ? "secret-password" : null,
  contactEmail: "contact@example.com",
  consent: consent(provider),
  ...overrides,
});

Deno.test("Firestore timestamp는 UTC Z의 0/3/6/9자리 정밀도만 허용한다", () => {
  for (
    const timestamp of [
      "2026-07-16T03:04:05Z",
      "2026-07-16T03:04:05.123Z",
      "2026-07-16T03:04:05.123456Z",
      "2026-07-16T03:04:05.123456789Z",
      "2024-02-29T23:59:59.000000000Z",
    ]
  ) {
    assert(
      isCanonicalFirestoreTimestamp(timestamp),
      `valid timestamp rejected: ${timestamp}`,
    );
  }

  for (
    const timestamp of [
      null,
      "not-a-date",
      "2026-07-16T03:04:05.1Z",
      "2026-07-16T03:04:05.1234Z",
      "2026-07-16T03:04:05.12345678Z",
      "2026-07-16T03:04:05.1234567890Z",
      "2026-07-16T03:04:05+00:00",
      "2026-07-16T03:04:05.000+00:00",
      "2026-07-16T03:04:05.000z",
      "2026-02-29T03:04:05Z",
      "2026-02-30T03:04:05.000000Z",
      "0000-01-01T00:00:00Z",
    ]
  ) {
    assert(
      !isCanonicalFirestoreTimestamp(timestamp),
      `invalid timestamp accepted: ${timestamp}`,
    );
  }
});

Deno.test("비밀번호 공동체 관리자 가입 입력을 strict canonical 값으로 만든다", () => {
  const result = validateCompleteChurchAdminSignup(identity(), input());
  assertEquals(result.churchId, CHURCH_ID);
  assertEquals(result.tokenEmail, "admin@example.com");
  assertEquals(result.contactEmail, "contact@example.com");
  assertEquals(result.password, "secret-password");
  assertEquals(result.consentSummary, {
    schemaVersion: 1,
    policyVersions: consent().policyVersions,
    agreedAt: "2026-07-16T03:00:00.000Z",
    audience: "communityAdmin",
    under14: false,
    guardianConsentRecorded: false,
  });
  assertEquals(churchIdForAdminSignupRequest(REQUEST_ID), CHURCH_ID);
});

Deno.test("Google 가입은 google.com token과 null password만 허용한다", () => {
  const result = validateCompleteChurchAdminSignup(
    identity("google.com"),
    input("google.com"),
  );
  assertEquals(result.signInProvider, "google.com");
  assertEquals(result.password, null);
  assertEquals(result.consent.source, "google_community_admin_signup");
  assertValidationCode(
    "INVALID_INPUT",
    () =>
      validateCompleteChurchAdminSignup(
        identity("google.com"),
        input("google.com", { password: "not-null" }),
      ),
  );
  assertValidationCode(
    "INVALID_INPUT",
    () =>
      validateCompleteChurchAdminSignup(
        identity(),
        input("password", { contactEmail: "admin@localhost" }),
      ),
  );
});

Deno.test("Kakao 가입은 custom token attestation을 canonical kakao.com으로 만든다", () => {
  const result = validateCompleteChurchAdminSignup(
    identity("kakao.com"),
    input("kakao.com", { contactEmail: "ADMIN-CONTACT@Example.com" }),
  );
  assertEquals(result.uid, "kakao:12345");
  assertEquals(result.signInProvider, "kakao.com");
  assertEquals(result.tokenEmail, null);
  assertEquals(result.contactEmail, "admin-contact@example.com");
  assertEquals(result.password, null);
  assertEquals(result.consent.source, "kakao_community_admin_signup");
});

Deno.test("Kakao 가입은 raw custom provider와 일치하는 서명 attestation·UID를 요구한다", () => {
  for (
    const overrides of [
      { signInProvider: "kakao.com" },
      { kakaoProviderAttestation: null },
      { kakaoProviderAttestation: "google.com" },
      { kakaoId: "99999" },
      { kakaoId: "012345" },
      { uid: "admin-1" },
    ]
  ) {
    assertValidationCode(
      "INVALID_IDENTITY",
      () =>
        validateCompleteChurchAdminSignup(
          identity("kakao.com", overrides),
          input("kakao.com"),
        ),
    );
  }
});

Deno.test("Kakao 연락 이메일은 필수이고 기존 provider는 token email로 호환 fallback한다", () => {
  assertValidationCode(
    "INVALID_INPUT",
    () =>
      validateCompleteChurchAdminSignup(
        identity("kakao.com"),
        input("kakao.com", { contactEmail: null }),
      ),
  );
  const password = validateCompleteChurchAdminSignup(
    identity(),
    input("password", { contactEmail: null }),
  );
  assertEquals(password.contactEmail, "admin@example.com");
  const google = validateCompleteChurchAdminSignup(
    identity("google.com"),
    input("google.com", { contactEmail: null }),
  );
  assertEquals(google.contactEmail, "admin@example.com");
  assertValidationCode(
    "INVALID_INPUT",
    () =>
      validateCompleteChurchAdminSignup(
        identity(),
        input("password", { contactEmail: "not-an-email" }),
      ),
  );
});

Deno.test("검증된 Firebase claim에서만 Kakao identity attestation을 추출한다", () => {
  assertEquals(
    churchAdminSignupIdentityFromVerifiedUser({
      uid: "kakao:12345",
      signInProvider: "custom",
      claims: {
        email: 123,
        bible114_auth_provider: "kakao.com",
        bible114_kakao_id: "12345",
      },
    }),
    {
      uid: "kakao:12345",
      tokenEmail: null,
      signInProvider: "custom",
      kakaoProviderAttestation: "kakao.com",
      kakaoId: "12345",
    },
  );
});

Deno.test("password provider는 6~128자 평문 password를 요구한다", () => {
  for (const password of [null, "12345", "x".repeat(129)]) {
    assertValidationCode(
      "INVALID_INPUT",
      () =>
        validateCompleteChurchAdminSignup(
          identity(),
          input("password", { password }),
        ),
    );
  }
  assertEquals(
    validateCompleteChurchAdminSignup(
      identity(),
      input("password", { password: "      " }),
    ).password,
    "      ",
  );
});

Deno.test("identity와 최상위 payload의 추가·누락 필드를 거부한다", () => {
  assertValidationCode(
    "INVALID_IDENTITY",
    () =>
      validateCompleteChurchAdminSignup(
        identity("password", { signInProvider: "anonymous" }),
        input(),
      ),
  );
  assertValidationCode(
    "INVALID_INPUT",
    () =>
      validateCompleteChurchAdminSignup(
        identity(),
        {
          ...input(),
          extra: true,
        } as unknown as CompleteChurchAdminSignupInput,
      ),
  );
  const missing = { ...input() } as Record<string, unknown>;
  delete missing.churchName;
  assertValidationCode(
    "INVALID_INPUT",
    () =>
      validateCompleteChurchAdminSignup(
        identity(),
        missing as CompleteChurchAdminSignupInput,
      ),
  );
});

Deno.test("이름·코드의 공백·제어문자·길이를 거부한다", () => {
  for (
    const overrides of [
      { name: " 관리자" },
      { churchName: "" },
      { pastorName: "목사\n" },
      { denomination: "x".repeat(101) },
      { password: "secret\n" },
      { entryCode: "abc" },
      { entryCode: " safe-code" },
    ]
  ) {
    assertValidationCode(
      "INVALID_INPUT",
      () =>
        validateCompleteChurchAdminSignup(
          identity(),
          input("password", overrides),
        ),
    );
  }
});

Deno.test("부서·소그룹 exact schema와 id 유일성을 검증한다", () => {
  const invalidDepartments = [
    [],
    [{
      id: "adult",
      name: "장년부",
      subgroups: [{ id: "same", name: "1" }, { id: "same", name: "2" }],
    }],
    [
      { id: "same", name: "장년부", subgroups: [{ id: "a", name: "1" }] },
      { id: "same", name: "청년부", subgroups: [{ id: "b", name: "1" }] },
    ],
    [{
      id: "adult",
      name: "장년부",
      subgroups: [{ id: "cell", name: "1", extra: true }],
    }],
  ];
  for (const departments of invalidDepartments) {
    assertValidationCode(
      "INVALID_DEPARTMENTS",
      () =>
        validateCompleteChurchAdminSignup(
          identity(),
          input("password", { departments }),
        ),
    );
  }
});

Deno.test("소그룹이 아직 없는 부서도 가입 후 관리 화면에서 설정할 수 있다", () => {
  const validated = validateCompleteChurchAdminSignup(
    identity(),
    input("password", {
      departments: [{ id: "adult", name: "장년부", subgroups: [] }],
    }),
  );
  assert(validated.departments[0].subgroups.length === 0);
});

Deno.test("동의 정책 버전·source·성인 확인·agreement exact schema를 검증한다", () => {
  const cases = [
    { ...consent(), source: "signup" },
    {
      ...consent(),
      policyVersions: { ...consent().policyVersions, terms: "old" },
    },
    {
      ...consent(),
      ageAssessment: { ...consent().ageAssessment, confirmed14Plus: false },
    },
    {
      ...consent(),
      agreements: {
        ...consent().agreements,
        privacy: { agreed: false },
      },
    },
    { ...consent(), extra: true },
  ];
  for (const invalidConsent of cases) {
    assertValidationCode(
      "INVALID_CONSENT",
      () =>
        validateCompleteChurchAdminSignup(
          identity(),
          input("password", { consent: invalidConsent }),
        ),
    );
  }
});

Deno.test("legacy directory를 secret 없는 최소 projection으로 정리한다", () => {
  const result = sanitizeChurchAdminSignupLegacyDirectory({
    churches: [
      { id: "church-1", name: "첫 교회", codeHash: HASH },
      { id: "church-2", name: "둘째 교회", hidden: true, churchCode: "secret" },
    ],
    updatedAt: TIMESTAMP,
  });
  assertEquals(result, {
    exists: true,
    churches: [
      { id: "church-1", name: "첫 교회" },
      { id: "church-2", name: "둘째 교회", hidden: true },
    ],
  });
  assertEquals(sanitizeChurchAdminSignupLegacyDirectory(null), {
    exists: false,
    churches: [],
  });
});

Deno.test("legacy directory의 중복·무소속·비정상 timestamp를 거부한다", () => {
  for (
    const directory of [
      {
        churches: [{ id: "same", name: "1" }, { id: "same", name: "2" }],
        updatedAt: TIMESTAMP,
      },
      {
        churches: [{ id: "unaffiliated_v1", name: "개인" }],
        updatedAt: TIMESTAMP,
      },
      { churches: [], updatedAt: "not-a-date" },
      { churches: [], updatedAt: TIMESTAMP, extra: true },
    ]
  ) {
    assertValidationCode(
      "INVALID_DIRECTORY",
      () => sanitizeChurchAdminSignupLegacyDirectory(directory),
    );
  }
});

Deno.test("canonical 기존 관리자 상태를 response-loss 완료로 인정한다", () => {
  const signup = validateCompleteChurchAdminSignup(identity(), input());
  const state = {
    signup,
    entryCodeHash: HASH,
    churchId: CHURCH_ID,
    user: {
      uid: "admin-1",
      name: "관리자",
      email: "admin@example.com",
      authProvider: "password",
      authProviders: ["password"],
      password: null,
      role: "churchAdmin",
      churchId: CHURCH_ID,
      churchName: "테스트교회",
      isDeleted: false,
    },
    church: {
      name: "테스트교회",
      pastorName: "홍길동 목사",
      denomination: "예장합동",
      departments: signup.departments,
      isDeleted: false,
      hiddenFromDirectory: false,
    },
    admin: {
      adminUid: "admin-1",
      adminEmail: "contact@example.com",
      updatedAt: "2026-07-16T03:04:05Z",
    },
    access: { codeHash: HASH, updatedAt: "2026-07-16T03:04:05.123456Z" },
    consent: {
      ...signup.consent,
      recordedAt: "2026-07-16T03:04:05.123456789Z",
    },
    legacyDirectory: {
      churches: [{ id: CHURCH_ID, name: "테스트교회" }],
      updatedAt: "2026-07-16T03:04:05.654321Z",
    },
    publicChurch: { id: CHURCH_ID, name: "테스트교회" },
  };
  validateCanonicalChurchAdminSignupState(state);
  assertValidationCode(
    "INVALID_EXISTING_STATE",
    () =>
      validateCanonicalChurchAdminSignupState({
        ...state,
        publicChurch: { id: CHURCH_ID, name: "다른 이름" },
      }),
  );
});
