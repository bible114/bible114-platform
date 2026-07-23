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

Deno.test("업적 동기화는 requestId와 exact trigger만 받는다", () => {
  const requestId = "123e4567-e89b-12d3-a456-426614174000";
  for (const trigger of ["read", "memo"] as const) {
    const parsed = parsePlatformApiRequest({
      action: "syncAchievements",
      requestId,
      trigger,
    });
    assert(parsed.action === "syncAchievements", "action mismatch");
    if (parsed.action !== "syncAchievements") return;
    assert(parsed.requestId === requestId, "requestId mismatch");
    assert(parsed.trigger === trigger, "trigger mismatch");
  }

  for (
    const invalid of [
      {},
      { trigger: "quiz" },
      { trigger: 1 },
      { trigger: "read", uid: "forged-user" },
      { trigger: "read", user: { currentDay: 365 } },
      { trigger: "read", memos: { forged: "client memo" } },
      { trigger: "memo", memoCount: 50 },
      { trigger: "memo", currentDay: 365 },
      { trigger: "memo", streak: 100 },
      { trigger: "memo", score: 1000 },
      { trigger: "memo", achievementIds: ["score_1000"] },
      { trigger: "memo", threshold: 0 },
      { trigger: "memo", readingEpoch: 0 },
    ]
  ) {
    assertRequestError(
      () =>
        parsePlatformApiRequest({
          action: "syncAchievements",
          requestId,
          ...invalid,
        }),
      "INVALID_PAYLOAD",
    );
  }
});

Deno.test("개인 달란트 지갑 이전은 requestId 외 입력을 거부한다", () => {
  const requestId = "123e4567-e89b-42d3-a456-426614174000";
  const parsed = parsePlatformApiRequest({
    action: "migratePersonalTalentWallet",
    requestId,
  });
  assert(parsed.action === "migratePersonalTalentWallet", "action mismatch");
  assert(parsed.requestId === requestId, "requestId mismatch");

  for (
    const extra of [
      { uid: "forged-user" },
      { primaryOrgId: "forged-org" },
      { churchId: "forged-org" },
      { talent: 100 },
      { amount: 100 },
      { rosterTalent: 0 },
      { talentWalletMigrated: false },
      { input: {} },
    ]
  ) {
    assertRequestError(
      () =>
        parsePlatformApiRequest({
          action: "migratePersonalTalentWallet",
          requestId,
          ...extra,
        }),
      "INVALID_PAYLOAD",
    );
  }
});

Deno.test("혼자 읽기 모임 참여는 requestId 외 입력을 거부한다", () => {
  const requestId = "123e4567-e89b-42d3-a456-426614174000";
  const parsed = parsePlatformApiRequest({
    action: "joinSoloCommunity",
    requestId,
  });
  assert(parsed.action === "joinSoloCommunity", "action mismatch");
  assert(parsed.requestId === requestId, "requestId mismatch");

  for (
    const extra of [
      { uid: "forged-user" },
      { orgId: "unaffiliated_v1" },
      { churchId: "unaffiliated_v1" },
      { primaryOrgId: "unaffiliated_v1" },
      { talent: 100 },
      { name: "forged name" },
      { input: {} },
    ]
  ) {
    assertRequestError(
      () =>
        parsePlatformApiRequest({
          action: "joinSoloCommunity",
          requestId,
          ...extra,
        }),
      "INVALID_PAYLOAD",
    );
  }
});

Deno.test("개인 계정 전환은 requestId 외 클라이언트 입력을 거부한다", () => {
  const requestId = "123e4567-e89b-42d3-a456-426614174000";
  const parsed = parsePlatformApiRequest({
    action: "convertToPersonalAccount",
    requestId,
  });
  assert(parsed.action === "convertToPersonalAccount", "action mismatch");
  assert(parsed.requestId === requestId, "requestId mismatch");

  for (
    const extra of [
      { uid: "forged-user" },
      { churchId: "forged-org" },
      { primaryOrgId: "forged-org" },
      { email: "forged@example.com" },
      { phone4: "1234" },
      { roster: {} },
    ]
  ) {
    assertRequestError(
      () =>
        parsePlatformApiRequest({
          action: "convertToPersonalAccount",
          requestId,
          ...extra,
        }),
      "INVALID_PAYLOAD",
    );
  }
});

Deno.test("플랫폼 관리자 교회 숨김은 exact 교회 ID와 boolean만 받는다", () => {
  const requestId = "123e4567-e89b-42d3-a456-426614174000";
  const valid = {
    action: "adminSetChurchVisibility",
    requestId,
    churchId: "church-1",
    hidden: true,
  };
  const parsed = parsePlatformApiRequest(valid);
  assert(parsed.action === "adminSetChurchVisibility", "action mismatch");
  if (parsed.action !== "adminSetChurchVisibility") return;
  assert(parsed.churchId === valid.churchId, "church mismatch");
  assert(parsed.hidden === true, "hidden mismatch");

  for (
    const invalid of [
      { ...valid, churchId: " church-1" },
      { ...valid, churchId: "a/b" },
      { ...valid, churchId: "." },
      { ...valid, churchId: "unaffiliated_v1" },
      { ...valid, hidden: 1 },
      { ...valid, uid: "forged-admin" },
      { ...valid, churchName: "위조 이름" },
    ]
  ) {
    assertRequestError(
      () => parsePlatformApiRequest(invalid),
      "INVALID_PAYLOAD",
    );
  }
});

Deno.test("플랫폼 관리자 교회 이름 변경은 exact ID와 canonical 이름만 받는다", () => {
  const requestId = "123e4567-e89b-42d3-a456-426614174000";
  const valid = {
    action: "adminRenameChurch",
    requestId,
    churchId: "church-1",
    name: "새 공동체 이름",
  };
  const parsed = parsePlatformApiRequest(valid);
  assert(parsed.action === "adminRenameChurch", "action mismatch");
  if (parsed.action !== "adminRenameChurch") return;
  assert(parsed.churchId === valid.churchId, "church mismatch");
  assert(parsed.name === valid.name, "name mismatch");

  for (
    const invalid of [
      { ...valid, churchId: " church-1" },
      { ...valid, churchId: "a/b" },
      { ...valid, churchId: "." },
      { ...valid, churchId: "unaffiliated_v1" },
      { ...valid, name: " 새 이름" },
      { ...valid, name: "" },
      { ...valid, name: "bad\nname" },
      { ...valid, hidden: false },
      { ...valid, uid: "forged-admin" },
    ]
  ) {
    assertRequestError(
      () => parsePlatformApiRequest(invalid),
      "INVALID_PAYLOAD",
    );
  }
});

Deno.test("legacy 읽기 진도 보정은 requestId 외 입력을 거부한다", () => {
  const requestId = "123e4567-e89b-42d3-a456-426614174000";
  const parsed = parsePlatformApiRequest({
    action: "normalizeLegacyReadingPosition",
    requestId,
  });
  assert(
    parsed.action === "normalizeLegacyReadingPosition",
    "action mismatch",
  );
  assert(parsed.requestId === requestId, "requestId mismatch");

  for (
    const extra of [
      { uid: "forged-user" },
      { currentDay: 731 },
      { readCount: 2 },
      { churchId: "forged-org" },
      { roster: { currentDay: 731, readCount: 2 } },
      { input: {} },
    ]
  ) {
    assertRequestError(
      () =>
        parsePlatformApiRequest({
          action: "normalizeLegacyReadingPosition",
          requestId,
          ...extra,
        }),
      "INVALID_PAYLOAD",
    );
  }
});

Deno.test("최초 교인 온보딩은 plan과 소속 ID의 exact 입력만 받는다", () => {
  const requestId = "123e4567-e89b-42d3-a456-426614174000";
  const valid = {
    action: "completeMemberOnboarding",
    requestId,
    orgId: "church-1",
    planId: "1year_revised",
    departmentId: "adult",
    subgroupId: "cell-1",
  };
  const parsed = parsePlatformApiRequest(valid);
  assert(parsed.action === "completeMemberOnboarding", "action mismatch");
  if (parsed.action !== "completeMemberOnboarding") return;
  assert(parsed.orgId === "church-1", "org mismatch");
  assert(parsed.planId === "1year_revised", "plan mismatch");
  assert(parsed.departmentId === "adult", "department mismatch");
  assert(parsed.subgroupId === "cell-1", "subgroup mismatch");

  for (
    const invalid of [
      { ...valid, uid: "forged-user" },
      { ...valid, orgId: " other" },
      { ...valid, orgId: "a/b" },
      { ...valid, orgId: "." },
      { ...valid, planId: "1year_easy" },
      { ...valid, departmentId: "" },
      { ...valid, departmentId: ".." },
      { ...valid, subgroupId: "a/b" },
      { ...valid, departmentName: "위조 이름" },
      { ...valid, subgroupName: "위조 이름" },
    ]
  ) {
    assertRequestError(
      () => parsePlatformApiRequest(invalid),
      "INVALID_PAYLOAD",
    );
  }

  const noSubgroup = parsePlatformApiRequest({ ...valid, subgroupId: "" });
  assert(
    noSubgroup.action === "completeMemberOnboarding" &&
      noSubgroup.subgroupId === "",
    "empty subgroup should remain canonical",
  );
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

Deno.test("관리자 영상 미리보기는 playlist ID만 엄격히 정규화한다", () => {
  const requestId = "123e4567-e89b-12d3-a456-426614174000";
  const parsed = parsePlatformApiRequest({
    action: "adminPreviewDailyVideo",
    requestId,
    adultPlaylistId: " PL_ADULT-123 ",
    kidsPlaylistId: "",
  });
  assert(parsed.action === "adminPreviewDailyVideo", "action mismatch");
  if (parsed.action !== "adminPreviewDailyVideo") return;
  assert(parsed.requestId === requestId, "requestId mismatch");
  assert(parsed.adultPlaylistId === "PL_ADULT-123", "adult playlist mismatch");
  assert(parsed.kidsPlaylistId === "", "empty kids playlist rejected");

  for (
    const invalid of [
      { adultPlaylistId: "", kidsPlaylistId: "PL_KIDS" },
      {
        adultPlaylistId: "https://youtube.com/playlist?list=PL_ADULT",
        kidsPlaylistId: "PL_KIDS",
      },
      { adultPlaylistId: "PL_ADULT", kidsPlaylistId: "bad/list" },
      { adultPlaylistId: "PL_ADULT" },
      {
        adultPlaylistId: "PL_ADULT",
        kidsPlaylistId: "",
        apiKey: "client-key",
      },
      {
        adultPlaylistId: "PL_ADULT",
        kidsPlaylistId: "",
        serviceDate: "2026-07-15",
      },
      {
        adultPlaylistId: "PL_ADULT",
        kidsPlaylistId: "",
        mode: "adult",
      },
    ]
  ) {
    assertRequestError(
      () =>
        parsePlatformApiRequest({
          action: "adminPreviewDailyVideo",
          requestId,
          ...invalid,
        }),
      "INVALID_PAYLOAD",
    );
  }
});

Deno.test("공개 디렉터리 재생성은 dryRun 외 브라우저 값을 받지 않는다", () => {
  const requestId = "123e4567-e89b-12d3-a456-426614174000";
  for (const dryRun of [true, false]) {
    const parsed = parsePlatformApiRequest({
      action: "rebuildPublicChurches",
      requestId,
      dryRun,
    });
    assert(parsed.action === "rebuildPublicChurches", "action mismatch");
    if (parsed.action !== "rebuildPublicChurches") return;
    assert(parsed.dryRun === dryRun, "dryRun mismatch");
  }

  for (
    const invalid of [
      { dryRun: "true" },
      {},
      { dryRun: true, role: "platformAdmin" },
      { dryRun: true, churchId: "client-church" },
      { dryRun: true, churches: [{ id: "forged", name: "위조" }] },
      { dryRun: false, count: 1 },
    ]
  ) {
    assertRequestError(
      () =>
        parsePlatformApiRequest({
          action: "rebuildPublicChurches",
          requestId,
          ...invalid,
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

Deno.test("읽기 완료 실제 쓰기 요청은 위치 외 필드를 거부한다", () => {
  const requestId = "123e4567-e89b-42d3-a456-426614174000";
  const parsed = parsePlatformApiRequest({
    action: "completeRead",
    requestId,
    cycle: 2,
    day: 365,
  });
  assert(parsed.action === "completeRead", "complete read action mismatch");
  if (parsed.action !== "completeRead") return;
  assert(parsed.cycle === 2 && parsed.day === 365, "read position mismatch");
  assert(parsed.readingEpoch === 0, "legacy epoch must default to zero");
  const currentEpoch = parsePlatformApiRequest({
    action: "completeRead",
    requestId,
    cycle: 2,
    day: 365,
    readingEpoch: 7,
  });
  assert(
    currentEpoch.action === "completeRead" &&
      currentEpoch.readingEpoch === 7,
    "current epoch was not preserved",
  );
  for (const readingEpoch of [-1, 1.5, "1"]) {
    assertRequestError(
      () =>
        parsePlatformApiRequest({
          action: "completeRead",
          requestId,
          cycle: 2,
          day: 365,
          readingEpoch,
        }),
      "INVALID_PAYLOAD",
    );
  }
  for (
    const extra of [
      { score: 10 },
      { talent: 17 },
      { churchId: "client-org" },
      { rosterIds: ["client-org"] },
    ]
  ) {
    assertRequestError(
      () =>
        parsePlatformApiRequest({
          action: "completeRead",
          requestId,
          cycle: 2,
          day: 365,
          ...extra,
        }),
      "INVALID_PAYLOAD",
    );
  }
});

Deno.test("읽기 재시작은 현재 epoch와 위치만 정확히 받는다", () => {
  const requestId = "123e4567-e89b-42d3-a456-426614174000";
  const parsed = parsePlatformApiRequest({
    action: "restartReading",
    requestId,
    cycle: 2,
    day: 10,
    readingEpoch: 3,
  });
  assert(parsed.action === "restartReading", "restart action mismatch");
  if (parsed.action !== "restartReading") return;
  assert(
    parsed.cycle === 2 && parsed.day === 10 && parsed.readingEpoch === 3,
    "restart position mismatch",
  );
  for (
    const invalid of [
      { cycle: 2, day: 10 },
      { cycle: 2, day: 10, readingEpoch: -1 },
      { cycle: 2, day: 10, readingEpoch: 1.5 },
      { cycle: 2, day: 10, readingEpoch: "1" },
      { cycle: 2, day: 10, readingEpoch: 0, score: 0 },
      { cycle: 2, day: 10, readingEpoch: 0, quizProgress: {} },
    ]
  ) {
    assertRequestError(
      () =>
        parsePlatformApiRequest({
          action: "restartReading",
          requestId,
          ...invalid,
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

Deno.test("퀴즈 실제 제출은 표시 답 외 보상 입력을 거부한다", () => {
  const requestId = "123e4567-e89b-42d3-a456-426614174000";
  const valid = {
    action: "submitQuiz",
    requestId,
    progressKey: "r2_d10",
    quizKey: "genesis-3-8",
    selectedIndex: 1,
    attemptSlot: 1,
  };
  const parsed = parsePlatformApiRequest(valid);
  assert(parsed.action === "submitQuiz", "submit quiz action mismatch");
  if (parsed.action !== "submitQuiz") return;
  assert(parsed.selectedIndex === 1, "selected answer mismatch");
  assert(parsed.attemptSlot === 1, "attempt slot mismatch");
  const epochParsed = parsePlatformApiRequest({
    ...valid,
    progressKey: "e3_r2_d10",
  });
  assert(
    epochParsed.action === "submitQuiz" &&
      epochParsed.progressKey === "e3_r2_d10",
    "epoch progress key rejected",
  );
  for (const progressKey of ["e0_r2_d10", "e01_r2_d10", "e1_r2_d366"]) {
    assertRequestError(
      () => parsePlatformApiRequest({ ...valid, progressKey }),
      "INVALID_PAYLOAD",
    );
  }
  for (const attemptSlot of [0, 3, 1.5, "1"]) {
    assertRequestError(
      () => parsePlatformApiRequest({ ...valid, attemptSlot }),
      "INVALID_PAYLOAD",
    );
  }
  for (
    const extra of [
      { answerIndex: 1 },
      { isCorrect: true },
      { reward: 10 },
      { talent: 10 },
    ]
  ) {
    assertRequestError(
      () => parsePlatformApiRequest({ ...valid, ...extra }),
      "INVALID_PAYLOAD",
    );
  }
});

Deno.test("퀴즈 건너뛰기는 위치와 문항 외 클라이언트 상태를 거부한다", () => {
  const requestId = "123e4567-e89b-42d3-a456-426614174000";
  const valid = {
    action: "skipQuiz",
    requestId,
    progressKey: "r2_d10",
    quizKey: "genesis-3-8",
  };
  const parsed = parsePlatformApiRequest(valid);
  assert(parsed.action === "skipQuiz", "skip quiz action mismatch");
  const epochParsed = parsePlatformApiRequest({
    ...valid,
    progressKey: "e2_r2_d10",
  });
  assert(
    epochParsed.action === "skipQuiz" &&
      epochParsed.progressKey === "e2_r2_d10",
    "epoch skip progress key rejected",
  );
  for (const extra of [{ skipped: true }, { reward: 0 }, { attempts: 1 }]) {
    assertRequestError(
      () => parsePlatformApiRequest({ ...valid, ...extra }),
      "INVALID_PAYLOAD",
    );
  }
  for (
    const invalid of [
      { progressKey: "r1_d366" },
      { progressKey: "r01_d1" },
      { quizKey: "bad key" },
    ]
  ) {
    assertRequestError(
      () => parsePlatformApiRequest({ ...valid, ...invalid }),
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

Deno.test("사용자가 같은 교회 소그룹을 직접 변경하는 요청을 검증한다", () => {
  const parsed = parsePlatformApiRequest({
    action: "updateSelfSubgroupMembership",
    requestId: "123e4567-e89b-42d3-a456-426614174000",
    churchId: "test-church",
    operation: "add",
    departmentId: "young",
    subgroupId: "cell-2",
  });
  assert(parsed.action === "updateSelfSubgroupMembership", "action mismatch");
  if (parsed.action !== "updateSelfSubgroupMembership") return;
  assert(parsed.operation === "add", "operation mismatch");
  assert(parsed.subgroupId === "cell-2", "subgroup mismatch");

  for (
    const invalid of [
      { operation: "replace" },
      { churchId: "unaffiliated_v1" },
      { subgroupId: "bad/path" },
    ]
  ) {
    assertRequestError(
      () =>
        parsePlatformApiRequest({
          action: "updateSelfSubgroupMembership",
          requestId: "123e4567-e89b-42d3-a456-426614174000",
          churchId: "test-church",
          operation: "remove",
          departmentId: "young",
          subgroupId: "cell-2",
          ...invalid,
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

Deno.test("교회 관리자 가입은 서버 권위 생성에 필요한 exact 입력만 받는다", () => {
  const requestId = "123e4567-e89b-42d3-a456-426614174000";
  const valid = {
    action: "completeChurchAdminSignup",
    requestId,
    name: "관리자",
    churchName: "성서교회",
    pastorName: "담임목사",
    denomination: "대한예수교장로회",
    entryCode: "safe-code",
    departments: [{ id: "adult", name: "장년", subgroups: [] }],
    password: "secret1",
    contactEmail: "ADMIN-CONTACT@Example.com",
    consent: { schemaVersion: 1 },
  };
  const parsed = parsePlatformApiRequest(valid);
  assert(parsed.action === "completeChurchAdminSignup", "signup rejected");
  if (parsed.action !== "completeChurchAdminSignup") return;
  assert(parsed.churchName === "성서교회", "church name mismatch");
  assert(parsed.password === "secret1", "password mismatch");
  assert(
    parsed.contactEmail === "admin-contact@example.com",
    "contact email not canonicalized",
  );

  const google = parsePlatformApiRequest({
    ...valid,
    password: null,
    contactEmail: undefined,
  });
  assert(
    google.action === "completeChurchAdminSignup" && google.password === null &&
      google.contactEmail === null,
    "legacy google signup fallback rejected",
  );
  for (
    const invalid of [
      { ...valid, uid: "forged" },
      { ...valid, churchName: " 성서교회" },
      { ...valid, pastorName: "bad\nname" },
      { ...valid, entryCode: "123" },
      { ...valid, departments: {} },
      { ...valid, consent: [] },
      { ...valid, password: "short" },
      { ...valid, contactEmail: "not-an-email" },
      { ...valid, contactEmail: "admin@localhost" },
      { ...valid, contactEmail: 123 },
    ]
  ) {
    assertRequestError(
      () => parsePlatformApiRequest(invalid),
      "INVALID_PAYLOAD",
    );
  }
});

Deno.test("입장코드 회전과 무소속 점검은 버전 및 exact 입력만 받는다", () => {
  const requestId = "123e4567-e89b-42d3-a456-426614174000";
  const rotated = parsePlatformApiRequest({
    action: "rotateChurchAccessCode",
    requestId,
    churchId: "church-1",
    entryCode: "new-code",
    expectedVersion: 0,
  });
  assert(
    rotated.action === "rotateChurchAccessCode" &&
      rotated.expectedVersion === 0,
    "rotate rejected",
  );
  for (
    const invalid of [
      {
        churchId: "unaffiliated_v1",
        entryCode: "new-code",
        expectedVersion: 0,
      },
      { churchId: " church-1", entryCode: "new-code", expectedVersion: 0 },
      { churchId: "church-1", entryCode: " code", expectedVersion: 0 },
      { churchId: "church-1", entryCode: "new-code", expectedVersion: -1 },
      {
        churchId: "church-1",
        entryCode: "new-code",
        expectedVersion: 0,
        uid: "x",
      },
    ]
  ) {
    assertRequestError(
      () =>
        parsePlatformApiRequest({
          action: "rotateChurchAccessCode",
          requestId,
          ...invalid,
        }),
      "INVALID_PAYLOAD",
    );
  }
  const ensured = parsePlatformApiRequest({
    action: "ensureUnaffiliatedChurch",
    requestId,
  });
  assert(ensured.action === "ensureUnaffiliatedChurch", "ensure rejected");
  assertRequestError(
    () =>
      parsePlatformApiRequest({
        action: "ensureUnaffiliatedChurch",
        requestId,
        churchId: "unaffiliated_v1",
      }),
    "INVALID_PAYLOAD",
  );
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

Deno.test("진행판과 읽기 달력 조회는 최소 입력만 받는다", () => {
  const requestId = "123e4567-e89b-42d3-a456-426614174000";
  const progress = parsePlatformApiRequest({
    action: "getCommunityProgress",
    requestId,
    orgId: "church-1",
  });
  assert(
    progress.action === "getCommunityProgress" &&
      progress.orgId === "church-1",
    "progress request rejected",
  );
  const calendar = parsePlatformApiRequest({
    action: "getReadingCalendar",
    requestId,
    year: 2026,
  });
  assert(
    calendar.action === "getReadingCalendar" && calendar.year === 2026,
    "calendar request rejected",
  );
  for (
    const invalid of [
      { action: "getCommunityProgress", orgId: "../church" },
      { action: "getCommunityProgress", orgId: "church-1", uid: "forged" },
      { action: "getReadingCalendar", year: 1999 },
      { action: "getReadingCalendar", year: 2026, uid: "forged" },
    ]
  ) {
    assertRequestError(
      () => parsePlatformApiRequest({ requestId, ...invalid }),
      "INVALID_PAYLOAD",
    );
  }
});

Deno.test("본문과 requestId 오류를 구분한다", () => {
  assertRequestError(() => parsePlatformApiRequest(null), "INVALID_BODY");
  assertRequestError(
    () => parsePlatformApiRequest({ action: "preflight", requestId: "bad" }),
    "INVALID_REQUEST_ID",
  );
});
