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
