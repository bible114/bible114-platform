import contractFixture from "../../../scripts/fixtures/daily-video-contract.json" with {
  type: "json",
};
import {
  buildDailyVideoFailureState,
  buildDailyVideoLease,
  DAILY_VIDEO_CHAPTERS_TTL_MS,
  DAILY_VIDEO_LEASE_MS,
  DAILY_VIDEO_RETRY_DELAYS_MS,
  DAILY_VIDEO_RETRY_IDLE_MS,
  extractYouTubeVideoId,
  getConfiguredDailyVideoModes,
  getDailyVideoBackoffMs,
  getDailyVideoFillState,
  getSafeDailyVideoBase,
  inspectDailyVideoLease,
  isDailyVideoChaptersRefreshDue,
  mapToStandardLabel,
  parseAndMapChapters,
  parseChapters,
  sanitizeDailyVideoEntry,
  sanitizeDailyVideoPayload,
  sanitizeYouTubeHttpsUrl,
  selectDailyVideoCandidate,
  titleMatchesDate,
} from "./dailyVideoCore.ts";

type ContractFixture = {
  schemaVersion: number;
  titleCases: Array<{
    name: string;
    title: string;
    dateKey: string;
    expected: boolean;
  }>;
  fillCases: Array<{
    name: string;
    configuredModeKeys: unknown;
    payload: unknown;
    expected: unknown;
  }>;
  candidateCases: Array<{
    name: string;
    targetDateKey: string;
    now: number;
    items: unknown[];
    expected: unknown;
  }>;
  labelCases: Array<{
    name: string;
    label: string;
    expected: string | null;
  }>;
  chapterCases: Array<{
    name: string;
    description: string;
    expectedParsed: unknown;
    expectedMapped: unknown;
  }>;
};

const fixture = contractFixture as ContractFixture;

const assert = (condition: unknown, message: string) => {
  if (!condition) throw new Error(message);
};

const assertEquals = (actual: unknown, expected: unknown, message: string) => {
  const actualJson = JSON.stringify(actual);
  const expectedJson = JSON.stringify(expected);
  if (actualJson !== expectedJson) {
    throw new Error(`${message}: expected ${expectedJson}, got ${actualJson}`);
  }
};

Deno.test("공유 fixture의 제목 날짜 계약을 모두 통과한다", () => {
  assert(fixture.schemaVersion === 1, "fixture schema mismatch");
  for (const testCase of fixture.titleCases) {
    assertEquals(
      titleMatchesDate(testCase.title, testCase.dateKey),
      testCase.expected,
      testCase.name,
    );
  }
});

Deno.test("공유 fixture의 설정 모드 fill 계약을 모두 통과한다", () => {
  for (const testCase of fixture.fillCases) {
    assertEquals(
      getDailyVideoFillState(
        testCase.configuredModeKeys,
        testCase.payload,
      ),
      testCase.expected,
      testCase.name,
    );
  }
});

Deno.test("공유 fixture의 게시 후보 선택 계약을 모두 통과한다", () => {
  for (const testCase of fixture.candidateCases) {
    const result = selectDailyVideoCandidate(testCase.items, {
      targetDateKey: testCase.targetDateKey,
      now: testCase.now,
      matchesDate: titleMatchesDate,
    });
    assertEquals(
      {
        candidateId: result.candidate?.it.id ?? null,
        publishedAt: result.candidate?.publishedAt ?? null,
        title: result.candidate?.title ?? null,
        matchedDate: result.matchedDate,
        pending: result.pending,
        stale: result.stale,
      },
      testCase.expected,
      testCase.name,
    );
  }
});

Deno.test("공유 fixture의 chapters 파싱과 표준 라벨 계약을 모두 통과한다", () => {
  for (const testCase of fixture.labelCases) {
    assertEquals(
      mapToStandardLabel(testCase.label),
      testCase.expected,
      testCase.name,
    );
  }
  for (const testCase of fixture.chapterCases) {
    assertEquals(
      parseChapters(testCase.description),
      testCase.expectedParsed,
      `${testCase.name} raw`,
    );
    assertEquals(
      parseAndMapChapters(testCase.description),
      testCase.expectedMapped,
      `${testCase.name} mapped`,
    );
  }
});

Deno.test("설정된 playlist 모드만 반환한다", () => {
  assertEquals(getConfiguredDailyVideoModes(null), [], "null config");
  assertEquals(
    getConfiguredDailyVideoModes({
      enabled: false,
      adultPlaylistId: "PL-adult",
    }),
    [],
    "disabled config",
  );
  assertEquals(
    getConfiguredDailyVideoModes({
      enabled: true,
      adultPlaylistId: " PL-adult ",
      kidsPlaylistId: "",
    }),
    ["adult"],
    "adult-only config",
  );
  assertEquals(
    getConfiguredDailyVideoModes({
      enabled: true,
      adultPlaylistId: "PL-adult",
      kidsPlaylistId: "PL-kids",
    }),
    ["adult", "kids"],
    "two-mode config",
  );
});

Deno.test("chapters TTL은 45분 경계와 미래 시각을 엄격히 판정한다", () => {
  const now = Date.parse("2026-07-15T00:00:00.000Z");
  assertEquals(DAILY_VIDEO_CHAPTERS_TTL_MS, 2_700_000, "chapters TTL");
  for (
    const missingOrInvalid of [
      undefined,
      null,
      "",
      "not-a-date",
      Number.NaN,
      new Date(Number.NaN),
    ]
  ) {
    assertEquals(
      isDailyVideoChaptersRefreshDue(missingOrInvalid, now),
      true,
      `invalid timestamp ${String(missingOrInvalid)}`,
    );
  }
  assertEquals(
    isDailyVideoChaptersRefreshDue(now - 2_699_999, now),
    false,
    "just inside TTL",
  );
  assertEquals(
    isDailyVideoChaptersRefreshDue(now - 2_700_000, now),
    true,
    "exact TTL boundary",
  );
  assertEquals(
    isDailyVideoChaptersRefreshDue(
      new Date(now - 2_700_001).toISOString(),
      now,
    ),
    true,
    "ISO timestamp outside TTL",
  );
  assertEquals(
    isDailyVideoChaptersRefreshDue(new Date(now + 86_400_000), now),
    false,
    "future timestamp",
  );

  let invalidNowRejected = false;
  try {
    isDailyVideoChaptersRefreshDue(null, Number.NaN);
  } catch (error) {
    invalidNowRejected = error instanceof TypeError &&
      error.message === "INVALID_NOW";
  }
  assert(invalidNowRejected, "invalid now accepted");
});

Deno.test("수동 저장 updatedAt이 TTL보다 새로우면 즉시 chapters 갱신 대상이다", () => {
  const now = Date.parse("2026-07-15T00:00:00.000Z");
  const refreshedAt = now - 60_000;
  assertEquals(
    isDailyVideoChaptersRefreshDue(refreshedAt, now, refreshedAt + 1),
    true,
    "newer manual update",
  );
  assertEquals(
    isDailyVideoChaptersRefreshDue(refreshedAt, now, now),
    true,
    "server-now updatedAt is eligible",
  );
  assertEquals(
    isDailyVideoChaptersRefreshDue(refreshedAt, now, now + 86_400_000),
    false,
    "future updatedAt must not force repeated refresh",
  );
  assertEquals(
    isDailyVideoChaptersRefreshDue(
      refreshedAt,
      now + 86_400_000,
      now + 86_400_000,
    ),
    true,
    "updatedAt becomes eligible after server time catches up",
  );
  assertEquals(
    isDailyVideoChaptersRefreshDue(
      new Date(refreshedAt).toISOString(),
      now,
      new Date(refreshedAt).toISOString(),
    ),
    false,
    "same update timestamp",
  );
  assertEquals(
    isDailyVideoChaptersRefreshDue(refreshedAt, now, refreshedAt - 1),
    false,
    "older update timestamp",
  );
  assertEquals(
    isDailyVideoChaptersRefreshDue(
      now - DAILY_VIDEO_CHAPTERS_TTL_MS,
      now,
      "invalid-updated-at",
    ),
    true,
    "invalid updatedAt preserves TTL decision",
  );
  assertEquals(
    isDailyVideoChaptersRefreshDue(
      now - DAILY_VIDEO_CHAPTERS_TTL_MS,
      now,
      now + 86_400_000,
    ),
    true,
    "future updatedAt does not suppress elapsed TTL",
  );
});

Deno.test("서버 chapters 갱신용 YouTube ID 추출은 허용 URL만 받는다", () => {
  const id = "AbCdEf123_-";
  for (
    const url of [
      `https://youtu.be/${id}`,
      `https://www.youtu.be/${id}/?si=share`,
      `https://youtube.com/watch?v=${id}`,
      `https://www.youtube.com/watch/?feature=share&v=${id}`,
      `https://youtube.com/live/${id}?feature=share`,
      `https://www.youtube.com/shorts/${id}/`,
      `https://youtube.com/embed/${id}#start`,
      `HTTPS://WWW.YOUTUBE.COM/watch?v=${id}`,
    ]
  ) {
    assertEquals(extractYouTubeVideoId(url), id, `valid URL: ${url}`);
  }

  for (
    const url of [
      null,
      "",
      `http://youtube.com/watch?v=${id}`,
      `https://m.youtube.com/watch?v=${id}`,
      `https://youtube.com.evil.example/watch?v=${id}`,
      `https://user:password@youtube.com/watch?v=${id}`,
      `https://youtube.com:443/watch?v=${id}`,
      `https://youtube.com:8443/watch?v=${id}`,
      `https://youtu.be/${id}/extra`,
      `https://youtu.be/${id}x`,
      `https://youtube.com/watch?v=${id}&v=${id}`,
      `https://youtube.com/watch?v=${id}x`,
      `https://youtube.com/?v=${id}`,
      `https://youtube.com/live/${id}.html`,
      `https://youtube.com/embed/${id}/extra`,
      `javascript:alert("${id}")`,
    ]
  ) {
    assertEquals(extractYouTubeVideoId(url), null, `unsafe URL: ${url}`);
  }
});

Deno.test("lease는 90초이고 실패 횟수별 backoff를 고정한다", () => {
  assertEquals(DAILY_VIDEO_LEASE_MS, 90_000, "lease duration");
  assertEquals(
    DAILY_VIDEO_RETRY_DELAYS_MS,
    [120_000, 300_000, 900_000, 1_800_000],
    "retry schedule",
  );
  assertEquals(DAILY_VIDEO_RETRY_IDLE_MS, 3_600_000, "idle retry");
  for (
    const [attempt, expected] of [
      [1, 120_000],
      [2, 300_000],
      [3, 900_000],
      [4, 1_800_000],
      [5, 3_600_000],
      [20, 3_600_000],
    ] as const
  ) {
    assertEquals(
      getDailyVideoBackoffMs(attempt),
      expected,
      `attempt ${attempt}`,
    );
  }
});

Deno.test("활성 lease와 미도래 nextRetryAt은 획득을 차단한다", () => {
  const now = Date.parse("2026-07-15T00:00:00.000Z");
  assertEquals(
    inspectDailyVideoLease(
      {
        leaseExpiresAt: new Date(now + 90_000).toISOString(),
        nextRetryAt: new Date(now + 300_000).toISOString(),
      },
      now,
    ),
    { canAcquire: false, reason: "leaseActive", retryAfterMs: 300_000 },
    "active lease must honor the later retry boundary",
  );
  assertEquals(
    inspectDailyVideoLease(
      {
        leaseExpiresAt: new Date(now - 1).toISOString(),
        nextRetryAt: new Date(now + 120_000).toISOString(),
      },
      now,
    ),
    { canAcquire: false, reason: "backoff", retryAfterMs: 120_000 },
    "future retry must block",
  );
  assertEquals(
    inspectDailyVideoLease(
      {
        leaseExpiresAt: new Date(now - 1).toISOString(),
        nextRetryAt: new Date(now).toISOString(),
      },
      now,
    ),
    { canAcquire: true, reason: "ready", retryAfterMs: 0 },
    "expired boundaries must allow",
  );
});

Deno.test("lease 획득과 실패 상태는 attempt를 일관되게 유지한다", () => {
  const now = Date.parse("2026-07-15T00:00:00.000Z");
  const acquired = buildDailyVideoLease(null, now);
  assert(acquired.canAcquire && acquired.lease !== null, "lease not acquired");
  assertEquals(
    acquired.lease,
    {
      leaseExpiresAt: new Date(now + 90_000),
      attemptCount: 1,
      nextRetryAt: new Date(now),
    },
    "first lease state",
  );

  const blocked = buildDailyVideoLease(
    { leaseExpiresAt: new Date(now + 1).toISOString(), attemptCount: 7 },
    now,
  );
  assert(
    !blocked.canAcquire && blocked.lease === null,
    "active lease replaced",
  );

  assertEquals(
    buildDailyVideoFailureState(acquired.lease?.attemptCount, now),
    {
      leaseExpiresAt: new Date(now),
      attemptCount: 1,
      nextRetryAt: new Date(now + 120_000),
      retryAfterMs: 120_000,
    },
    "first failure state",
  );
  assertEquals(
    buildDailyVideoFailureState(5, now).retryAfterMs,
    3_600_000,
    "later failure state",
  );
});

Deno.test("영상 sanitizer는 HTTPS YouTube 주소만 보존한다", () => {
  for (
    const url of [
      "https://youtube.com/watch?v=abcdefghijk",
      "https://www.youtube.com/live/abcdefghijk",
      "https://youtu.be/abcdefghijk",
      "https://www.youtu.be/abcdefghijk",
    ]
  ) {
    assert(sanitizeYouTubeHttpsUrl(url) !== null, `valid URL rejected: ${url}`);
  }
  for (
    const url of [
      "http://youtube.com/watch?v=abcdefghijk",
      "https://m.youtube.com/watch?v=abcdefghijk",
      "https://youtube.com.evil.example/watch?v=abcdefghijk",
      "https://youtube.com@evil.example/watch?v=abcdefghijk",
      "https://youtube.com:443/watch?v=abcdefghijk",
      "https://vimeo.com/abcdefghijk",
      "javascript:alert(1)",
    ]
  ) {
    assertEquals(sanitizeYouTubeHttpsUrl(url), null, `unsafe URL: ${url}`);
  }

  assertEquals(
    sanitizeDailyVideoEntry({
      url: "https://youtu.be/abcdefghijk",
      chapters: [
        { label: "해설", sec: 0 },
        { label: "해설", sec: 10 },
        { label: "성경읽기", sec: 120 },
        { label: "오늘의 기도", sec: 180 },
        { label: "기도", sec: -1 },
      ],
      title: "제목",
      publishedAt: "not-a-date",
      matchedDate: true,
      secret: "drop-me",
    }),
    {
      url: "https://youtu.be/abcdefghijk",
      chapters: [
        { label: "해설", sec: 0 },
        { label: "성경읽기", sec: 120 },
      ],
      title: "제목",
      matchedDate: true,
    },
    "entry sanitizer",
  );
  assertEquals(
    sanitizeDailyVideoPayload({
      adult: { url: "https://evil.example/video" },
      kids: { url: "https://youtu.be/abcdefghijk", chapters: [] },
      autoFilled: true,
    }),
    {
      adult: null,
      kids: {
        url: "https://youtu.be/abcdefghijk",
        chapters: [],
      },
      autoFilled: true,
    },
    "payload sanitizer",
  );
});

Deno.test("기존 자동 영상은 matchedDate가 true인 안전 항목만 base로 쓴다", () => {
  assertEquals(
    getSafeDailyVideoBase({
      adult: {
        url: "https://youtu.be/abcdefghijk",
        chapters: [],
        matchedDate: true,
      },
      kids: {
        url: "https://youtu.be/lmnopqrstuv",
        chapters: [],
        matchedDate: false,
      },
      autoFilled: true,
    }),
    {
      adult: {
        url: "https://youtu.be/abcdefghijk",
        chapters: [],
        matchedDate: true,
      },
      kids: null,
      autoFilled: true,
    },
    "safe auto base",
  );
  assertEquals(
    getSafeDailyVideoBase({
      adult: {
        url: "https://youtu.be/abcdefghijk",
        chapters: [],
        matchedDate: true,
      },
      autoFilled: false,
    }),
    null,
    "manual document must not become auto base",
  );
});
