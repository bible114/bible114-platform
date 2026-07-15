import {
  isRequestId,
  parsePlatformApiRequest,
  PlatformApiRequestError,
} from "./core.ts";

const assert = (condition: unknown, message: string) => {
  if (!condition) throw new Error(message);
};

const assertRequestError = (
  fn: () => unknown,
  expectedCode: PlatformApiRequestError["code"],
) => {
  try {
    fn();
    throw new Error(`expected ${expectedCode}`);
  } catch (error) {
    if (!(error instanceof PlatformApiRequestError)) {
      throw new Error("expected PlatformApiRequestError");
    }
    assert(
      error.code === expectedCode,
      `expected ${expectedCode}, received ${error.code}`,
    );
  }
};

Deno.test("requestId는 표준 UUID만 허용한다", () => {
  assert(
    isRequestId("123e4567-e89b-12d3-a456-426614174000"),
    "valid UUID rejected",
  );
  assert(
    isRequestId("018f5f3e-94c0-7ad2-a12e-4c9df184ba4f"),
    "valid UUID v7 rejected",
  );
  assert(
    !isRequestId("123e4567e89b12d3a456426614174000"),
    "UUID without hyphens accepted",
  );
  assert(
    !isRequestId("00000000-0000-0000-0000-000000000000"),
    "nil UUID accepted",
  );
  assert(!isRequestId("not-a-uuid"), "invalid UUID accepted");
});

Deno.test("preflight 요청을 정규화한다", () => {
  const parsed = parsePlatformApiRequest({
    action: "preflight",
    requestId: "123e4567-e89b-12d3-a456-426614174000",
    ignored: true,
  });
  assert(parsed.action === "preflight", "action mismatch");
  assert(
    parsed.requestId === "123e4567-e89b-12d3-a456-426614174000",
    "requestId mismatch",
  );
  assert(!("ignored" in parsed), "unknown field leaked into parsed request");
});

Deno.test("매일 영상 resolve는 requestId 외 클라이언트 입력을 거부한다", () => {
  const requestId = "123e4567-e89b-12d3-a456-426614174000";
  const parsed = parsePlatformApiRequest({
    action: "resolveDailyVideo",
    requestId,
  });
  assert(parsed.action === "resolveDailyVideo", "action mismatch");
  assert(parsed.requestId === requestId, "requestId mismatch");

  for (
    const extra of [
      { date: "2026-07-15" },
      { serviceDate: "2026-07-15" },
      { mode: "adult" },
      { playlistId: "PL-client-controlled" },
    ]
  ) {
    assertRequestError(
      () =>
        parsePlatformApiRequest({
          action: "resolveDailyVideo",
          requestId,
          ...extra,
        }),
      "INVALID_PAYLOAD",
    );
  }
});

Deno.test("상품 구매 요청은 서버 식별자만 받는다", () => {
  const parsed = parsePlatformApiRequest({
    action: "purchaseItem",
    requestId: "123e4567-e89b-12d3-a456-426614174000",
    churchId: " c1 ",
    itemId: " snack ",
    departmentId: " kids ",
    marketId: " shared ",
    price: 1,
  });
  assert(
    parsed.action === "purchaseItem" && parsed.itemId === "snack",
    "purchase normalization failed",
  );
  assert(!("price" in parsed), "client price must be ignored");
  assertRequestError(() =>
    parsePlatformApiRequest({
      action: "purchaseItem",
      requestId: "123e4567-e89b-12d3-a456-426614174000",
      churchId: "c1",
      itemId: "bad/item",
      departmentId: "kids",
      marketId: "shared",
    }), "INVALID_PAYLOAD");
});

Deno.test("읽기 완료 미리보기 요청의 회차와 날짜를 검증한다", () => {
  const parsed = parsePlatformApiRequest({
    action: "previewReadCompletion",
    requestId: "123e4567-e89b-12d3-a456-426614174000",
    cycle: 2,
    day: 365,
  });
  assert(parsed.action === "previewReadCompletion", "action mismatch");
  if (parsed.action !== "previewReadCompletion") return;
  assert(parsed.cycle === 2 && parsed.day === 365, "read position mismatch");

  for (const [cycle, day] of [[0, 1], [1.5, 1], [1, 0], [1, 366], [1, 2.5]]) {
    assertRequestError(
      () =>
        parsePlatformApiRequest({
          action: "previewReadCompletion",
          requestId: "123e4567-e89b-12d3-a456-426614174000",
          cycle,
          day,
        }),
      "INVALID_PAYLOAD",
    );
  }
});

Deno.test("퀴즈 제출 미리보기 요청을 정규화한다", () => {
  const parsed = parsePlatformApiRequest({
    action: "previewQuizSubmission",
    requestId: "123e4567-e89b-12d3-a456-426614174000",
    progressKey: "r12_d365",
    quizKey: "john-3_16",
    selectedIndex: 3,
    answerIndex: 3,
  });
  assert(parsed.action === "previewQuizSubmission", "action mismatch");
  if (parsed.action !== "previewQuizSubmission") return;
  assert(parsed.progressKey === "r12_d365", "progress key mismatch");
  assert(parsed.quizKey === "john-3_16", "quiz key mismatch");
  assert(parsed.selectedIndex === 3, "selected index mismatch");
  assert(!("answerIndex" in parsed), "unknown field leaked");
});

Deno.test("퀴즈 제출 미리보기의 진도, 문항, 답안을 엄격히 검증한다", () => {
  const valid = {
    action: "previewQuizSubmission",
    requestId: "123e4567-e89b-12d3-a456-426614174000",
    progressKey: "r1_d1",
    quizKey: "quiz-1",
    selectedIndex: 0,
  };
  for (const progressKey of ["r0_d1", "r01_d1", "r1_d0", "r1_d366", 1]) {
    assertRequestError(
      () => parsePlatformApiRequest({ ...valid, progressKey }),
      "INVALID_PAYLOAD",
    );
  }
  for (const quizKey of ["", "bad key", "a".repeat(129), 1]) {
    assertRequestError(
      () => parsePlatformApiRequest({ ...valid, quizKey }),
      "INVALID_PAYLOAD",
    );
  }
  for (const selectedIndex of [-1, 4, 1.5, "1"]) {
    assertRequestError(
      () => parsePlatformApiRequest({ ...valid, selectedIndex }),
      "INVALID_PAYLOAD",
    );
  }
});

Deno.test("공동체 참여 요청을 정규화하고 경로·코드를 검증한다", () => {
  const parsed = parsePlatformApiRequest({
    action: "joinCommunity",
    requestId: "123e4567-e89b-12d3-a456-426614174000",
    churchId: " church-2 ",
    entryCode: " 1234 ",
    departmentId: " kids ",
    subgroupId: " faith ",
  });
  assert(parsed.action === "joinCommunity", "action mismatch");
  if (parsed.action !== "joinCommunity") return;
  assert(parsed.churchId === "church-2", "church mismatch");
  assert(parsed.entryCode === "1234", "entry code mismatch");
  assert(parsed.departmentId === "kids", "department mismatch");
  assert(parsed.subgroupId === "faith", "subgroup mismatch");

  for (
    const payload of [
      {
        churchId: "bad/path",
        entryCode: "1234",
        departmentId: "kids",
        subgroupId: "",
      },
      {
        churchId: "church-2",
        entryCode: "123",
        departmentId: "kids",
        subgroupId: "",
      },
      {
        churchId: "church-2",
        entryCode: "1234",
        departmentId: "",
        subgroupId: "",
      },
      {
        churchId: "church-2",
        entryCode: "1234",
        departmentId: "kids",
        subgroupId: 1,
      },
    ]
  ) {
    assertRequestError(
      () =>
        parsePlatformApiRequest({
          action: "joinCommunity",
          requestId: "123e4567-e89b-12d3-a456-426614174000",
          ...payload,
        }),
      "INVALID_PAYLOAD",
    );
  }
});

Deno.test("최초 교인 가입 요청의 최소 프로필을 정규화한다", () => {
  const parsed = parsePlatformApiRequest({
    action: "completeMemberSignup",
    requestId: "123e4567-e89b-12d3-a456-426614174000",
    churchId: " church-1 ",
    entryCode: " 1234 ",
    name: " 홍길동 ",
    birthdate: "20000101",
    guestProgress: {
      currentDay: 42,
      streak: 3,
      lastReadDate: "Tue Jul 14 2026",
      planId: "1year_revised",
    },
  });
  assert(parsed.action === "completeMemberSignup", "action mismatch");
  if (parsed.action !== "completeMemberSignup") return;
  assert(parsed.churchId === "church-1", "church mismatch");
  assert(parsed.entryCode === "1234", "entry code mismatch");
  assert(parsed.name === "홍길동", "name mismatch");
  assert(parsed.guestProgress.currentDay === 42, "guest progress mismatch");

  for (
    const payload of [
      {
        churchId: "bad/path",
        entryCode: "1234",
        name: "홍길동",
        birthdate: "20000101",
      },
      {
        churchId: "church-1",
        entryCode: "123",
        name: "홍길동",
        birthdate: "20000101",
      },
      {
        churchId: "church-1",
        entryCode: "1234",
        name: "",
        birthdate: "20000101",
      },
      {
        churchId: "church-1",
        entryCode: "1234",
        name: "홍길동",
        birthdate: "200001",
      },
    ]
  ) {
    assertRequestError(() =>
      parsePlatformApiRequest({
        action: "completeMemberSignup",
        requestId: "123e4567-e89b-12d3-a456-426614174000",
        ...payload,
      }), "INVALID_PAYLOAD");
  }
});

Deno.test("최초 개인 가입은 소속 선택과 무소속 요청을 구분해 정규화한다", () => {
  const requestId = "123e4567-e89b-12d3-a456-426614174000";
  const regular = parsePlatformApiRequest({
    action: "completePersonalSignup",
    requestId,
    churchId: " church-1 ",
    entryCode: " 1234 ",
    departmentId: " kids ",
    subgroupId: " class-1 ",
    name: " 홍길동 ",
    birthdate: "19900101",
    authProvider: "google.com",
    guestProgress: {
      currentDay: 1,
      streak: 0,
      lastReadDate: null,
      planId: "1year_revised",
    },
  });
  assert(
    regular.action === "completePersonalSignup",
    "personal action rejected",
  );
  if (regular.action === "completePersonalSignup") {
    assert(regular.departmentId === "kids", "department not normalized");
  }

  const solo = parsePlatformApiRequest({
    action: "completePersonalSignup",
    requestId,
    churchId: "unaffiliated_v1",
    entryCode: "",
    departmentId: "",
    subgroupId: "",
    name: "홍길동",
    birthdate: "19900101",
    authProvider: "kakao.com",
    guestProgress: {
      currentDay: 1,
      streak: 0,
      lastReadDate: null,
      planId: "nt_new",
    },
  });
  assert(solo.action === "completePersonalSignup", "solo action rejected");
  assertRequestError(() =>
    parsePlatformApiRequest({
      action: "completePersonalSignup",
      requestId,
      churchId: "unaffiliated_v1",
      entryCode: "forged",
      departmentId: "",
      subgroupId: "",
      name: "홍길동",
      birthdate: "19900101",
      authProvider: "kakao.com",
      guestProgress: {
        currentDay: 1,
        streak: 0,
        lastReadDate: null,
        planId: "nt_new",
      },
    }), "INVALID_PAYLOAD");
});

Deno.test("관리자 창구 판매 요청은 대상과 금액을 엄격히 정규화한다", () => {
  const requestId = "123e4567-e89b-12d3-a456-426614174000";
  const parsed = parsePlatformApiRequest({
    action: "adminCounterSale",
    requestId,
    churchId: " church-1 ",
    memberUid: " member-1 ",
    departmentId: " adult ",
    marketId: " shared ",
    itemName: " 세탁세제 ",
    price: 7,
  });
  assert(parsed.action === "adminCounterSale", "counter action rejected");
  if (parsed.action === "adminCounterSale") {
    assert(
      parsed.churchId === "church-1" && parsed.memberUid === "member-1" &&
        parsed.itemName === "세탁세제" && parsed.price === 7,
      "counter payload not normalized",
    );
  }
  for (const invalid of [0, -1, 1.5, 1_000_001, "7"]) {
    assertRequestError(() =>
      parsePlatformApiRequest({
        action: "adminCounterSale",
        requestId,
        churchId: "church-1",
        memberUid: "member-1",
        departmentId: "adult",
        marketId: "shared",
        itemName: "세탁세제",
        price: invalid,
      }), "INVALID_PAYLOAD");
  }
});

Deno.test("관리자 수령·환불 요청은 구매 ID와 레거시 지갑만 받는다", () => {
  const requestId = "123e4567-e89b-12d3-a456-426614174000";
  const delivered = parsePlatformApiRequest({
    action: "adminDeliverPurchase",
    requestId,
    churchId: "church-1",
    purchaseId: "purchase-1",
  });
  assert(delivered.action === "adminDeliverPurchase", "deliver rejected");
  const refunded = parsePlatformApiRequest({
    action: "adminRefundPurchase",
    requestId,
    churchId: "church-1",
    purchaseId: "purchase-1",
    legacyWalletKind: " roster ",
    migratedWalletConfirmed: true,
  });
  assert(
    refunded.action === "adminRefundPurchase" &&
      refunded.legacyWalletKind === "roster" &&
      refunded.migratedWalletConfirmed === true,
    "refund wallet not normalized",
  );
  assertRequestError(() =>
    parsePlatformApiRequest({
      action: "adminRefundPurchase",
      requestId,
      churchId: "church-1",
      purchaseId: "purchase-1",
      legacyWalletKind: "other",
    }), "INVALID_PAYLOAD");
  assertRequestError(() =>
    parsePlatformApiRequest({
      action: "adminRefundPurchase",
      requestId,
      churchId: "church-1",
      purchaseId: "purchase-1",
      migratedWalletConfirmed: "yes",
    }), "INVALID_PAYLOAD");
});

Deno.test("알 수 없는 action은 거부한다", () => {
  assertRequestError(
    () =>
      parsePlatformApiRequest({
        action: "award-reading",
        requestId: "123e4567-e89b-12d3-a456-426614174000",
      }),
    "INVALID_ACTION",
  );
});

Deno.test("본문과 requestId 오류를 구분한다", () => {
  assertRequestError(() => parsePlatformApiRequest(null), "INVALID_BODY");
  assertRequestError(
    () => parsePlatformApiRequest({ action: "preflight", requestId: "bad" }),
    "INVALID_REQUEST_ID",
  );
});
