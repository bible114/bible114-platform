import type {
  FirestoreDocument,
  FirestoreWrite,
} from "../_shared/firestore.ts";
import {
  DAILY_VIDEO_CHAPTERS_TTL_MS,
  type DailyVideoMode,
} from "./dailyVideoCore.ts";
import { resolveDailyVideo } from "./dailyVideoResolve.ts";

const NOW_MS = Date.parse("2026-07-15T00:00:00.000Z");
const SERVICE_DATE = "2026-07-15";
const SERVICE = { token: "service-token", projectId: "test-project" };
const CONFIG_PATH = "settings/videoAutoConfig";
const DAILY_PATH = `dailyVideos/${SERVICE_DATE}`;
const JOB_PATH = `dailyVideoJobs/${SERVICE_DATE}`;
const REQUEST_ID = "123e4567-e89b-42d3-a456-426614174000";

const MODE_CONFIG = {
  adult: { playlistId: "PL_ADULT", videoId: "A1234567890" },
  kids: { playlistId: "PL_KIDS", videoId: "K1234567890" },
} as const;

type StoredDocument = {
  data: Record<string, unknown>;
  updateTime: string;
};

type MemoryWrite =
  | {
    kind: "update";
    path: string;
    data: Record<string, unknown>;
    updateMask?: string[];
    exists?: boolean;
  }
  | { kind: "delete"; path: string; exists?: boolean };

type MemoryState = {
  abortedFetches: number;
  documents: Map<string, StoredDocument>;
  commits: MemoryWrite[][];
  events: string[];
  rollbacks: number;
  transactions: number;
  youtubeUrls: URL[];
  updateSequence: number;
};

type HarnessOptions = {
  available?: Partial<Record<DailyVideoMode, boolean>>;
  chapterDescriptions?: Partial<Record<DailyVideoMode, string>>;
  envApiKey?: string;
  hangYouTube?: boolean;
  onVideoDetails?: (state: MemoryState) => void;
  videoDetails?: Partial<
    Record<DailyVideoMode, "valid" | "empty" | "missingSnippet" | "wrongId">
  >;
  youtubeDeadlineMs?: number;
};

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

const valueAtFieldPath = (
  data: Record<string, unknown>,
  fieldPath: string,
): { found: boolean; value?: unknown } => {
  let current: unknown = data;
  for (const segment of fieldPath.split(".")) {
    if (
      !current || typeof current !== "object" || Array.isArray(current) ||
      !Object.prototype.hasOwnProperty.call(current, segment)
    ) {
      return { found: false };
    }
    current = (current as Record<string, unknown>)[segment];
  }
  return { found: true, value: current };
};

const setFieldPath = (
  data: Record<string, unknown>,
  fieldPath: string,
  value: unknown,
) => {
  const segments = fieldPath.split(".");
  let current = data;
  for (const segment of segments.slice(0, -1)) {
    const existing = current[segment];
    if (!existing || typeof existing !== "object" || Array.isArray(existing)) {
      current[segment] = {};
    }
    current = current[segment] as Record<string, unknown>;
  }
  current[segments.at(-1)!] = structuredClone(value);
};

const nextUpdateTime = (state: MemoryState): string => {
  state.updateSequence += 1;
  return new Date(NOW_MS + state.updateSequence).toISOString();
};

const setDocument = (
  state: MemoryState,
  path: string,
  data: Record<string, unknown>,
  updateTime = nextUpdateTime(state),
) => {
  state.documents.set(path, { data, updateTime });
};

const getDocumentData = (
  state: MemoryState,
  path: string,
): Record<string, unknown> | null => state.documents.get(path)?.data || null;

const configData = ({ kids = true }: { kids?: boolean } = {}) => ({
  enabled: true,
  apiKey: "firestore-key",
  adultPlaylistId: MODE_CONFIG.adult.playlistId,
  kidsPlaylistId: kids ? MODE_CONFIG.kids.playlistId : "",
});

const videoEntry = (
  mode: DailyVideoMode,
  { matchedDate = true }: { matchedDate?: boolean } = {},
) => ({
  url: `https://youtu.be/${MODE_CONFIG[mode].videoId}`,
  chapters: [
    { label: "해설", sec: 0 },
    { label: "성경읽기", sec: 393 },
  ],
  title: `7월 15일 ${mode}`,
  publishedAt: "2026-07-14T20:00:00.000Z",
  matchedDate,
});

const manualVideo = () => ({
  adult: {
    url: "https://youtu.be/M1234567890",
    chapters: [{ label: "해설", sec: 0 }],
    title: "관리자 수동 영상",
  },
  kids: null,
  autoFilled: false,
});

const freshChaptersRefreshedAt = () =>
  new Date(NOW_MS - DAILY_VIDEO_CHAPTERS_TTL_MS + 1).toISOString();

const staleChaptersRefreshedAt = () =>
  new Date(NOW_MS - DAILY_VIDEO_CHAPTERS_TTL_MS).toISOString();

const richManualVideo = () => ({
  adult: {
    url: videoEntry("adult").url,
    chapters: [{ label: "해설", sec: 11 }],
    title: "관리자 성인 제목",
    publishedAt: "2026-07-10T00:00:00.000Z",
    matchedDate: false,
    sentinel: { owner: "admin", keep: true },
  },
  kids: {
    url: videoEntry("kids").url,
    chapters: [{ label: "기도", sec: 22 }],
    title: "관리자 어린이 제목",
    publishedAt: "2026-07-11T00:00:00.000Z",
    matchedDate: false,
    sentinel: { owner: "admin-kids", keep: true },
  },
  autoFilled: false,
  updatedAt: "2026-07-14T00:00:00.000Z",
  chaptersRefreshedAt: staleChaptersRefreshedAt(),
  sentinel: { topLevel: "keep" },
});

const createHarness = (options: HarnessOptions = {}) => {
  const state: MemoryState = {
    abortedFetches: 0,
    documents: new Map(),
    commits: [],
    events: [],
    rollbacks: 0,
    transactions: 0,
    youtubeUrls: [],
    updateSequence: 0,
  };
  let videoDetailsHookCalled = false;

  const beginTransaction = async () => {
    state.transactions += 1;
    const transaction = `transaction-${state.transactions}`;
    state.events.push(`begin:${transaction}`);
    return transaction;
  };

  const readDocument = async <T>(
    _token: string,
    _projectId: string,
    path: string,
  ): Promise<FirestoreDocument<T> | null> => {
    const stored = state.documents.get(path);
    if (!stored) return null;
    return {
      name: `projects/test-project/databases/(default)/documents/${path}`,
      fields: {},
      data: stored.data as T,
      updateTime: stored.updateTime,
    };
  };

  const updateWrite = (
    _projectId: string,
    path: string,
    data: Record<string, unknown>,
    writeOptions: { updateMask?: string[]; exists?: boolean } = {},
  ): FirestoreWrite => ({
    kind: "update",
    path,
    data,
    updateMask: writeOptions.updateMask,
    exists: writeOptions.exists,
  } as unknown as FirestoreWrite);

  const deleteWrite = (
    _projectId: string,
    path: string,
    exists?: boolean,
  ): FirestoreWrite => ({
    kind: "delete",
    path,
    exists,
  } as unknown as FirestoreWrite);

  const commitWrites = async (
    _token: string,
    _projectId: string,
    writes: FirestoreWrite[],
  ) => {
    const memoryWrites = writes as unknown as MemoryWrite[];
    state.commits.push(memoryWrites);
    state.events.push(
      `commit:${memoryWrites.map((write) => write.path).join(",")}`,
    );
    for (const write of memoryWrites) {
      const exists = state.documents.has(write.path);
      if (write.exists === true && !exists) {
        throw new Error(`expected existing document: ${write.path}`);
      }
      if (write.exists === false && exists) {
        throw new Error(`expected missing document: ${write.path}`);
      }
      if (write.kind === "delete") {
        state.documents.delete(write.path);
      } else {
        if (!write.updateMask) {
          setDocument(state, write.path, structuredClone(write.data));
          continue;
        }
        const merged = structuredClone(
          state.documents.get(write.path)?.data || {},
        );
        for (const fieldPath of write.updateMask) {
          const field = valueAtFieldPath(write.data, fieldPath);
          if (!field.found) {
            throw new Error(`updateMask field missing from data: ${fieldPath}`);
          }
          setFieldPath(merged, fieldPath, field.value);
        }
        setDocument(state, write.path, merged);
      }
    }
    return {};
  };

  const rollbackTransaction = async () => {
    state.rollbacks += 1;
  };

  const fetcher = async (
    input: RequestInfo | URL,
    init?: RequestInit,
  ): Promise<Response> => {
    const url = new URL(
      input instanceof URL
        ? input.toString()
        : typeof input === "string"
        ? input
        : input.url,
    );
    state.youtubeUrls.push(url);
    state.events.push(`fetch:${url.pathname.split("/").at(-1)}`);

    if (options.hangYouTube) {
      return await new Promise<Response>((_resolve, reject) => {
        const signal = init?.signal;
        if (!signal) return;
        const rejectAbort = () => {
          state.abortedFetches += 1;
          reject(new DOMException("YouTube deadline", "AbortError"));
        };
        if (signal.aborted) rejectAbort();
        else signal.addEventListener("abort", rejectAbort, { once: true });
      });
    }

    if (url.pathname.endsWith("/playlistItems")) {
      const playlistId = url.searchParams.get("playlistId");
      const mode = (Object.entries(MODE_CONFIG) as Array<[
        DailyVideoMode,
        { playlistId: string; videoId: string },
      ]>).find(([, config]) => config.playlistId === playlistId)?.[0];
      const available = mode && options.available?.[mode] !== false;
      return Response.json({
        items: available
          ? [{
            snippet: { title: `7월 15일 ${mode}` },
            contentDetails: {
              videoPublishedAt: "2026-07-14T20:00:00.000Z",
              videoId: MODE_CONFIG[mode].videoId,
            },
          }]
          : [],
      });
    }

    if (url.pathname.endsWith("/videos")) {
      const videoId = url.searchParams.get("id");
      const mode = (Object.entries(MODE_CONFIG) as Array<[
        DailyVideoMode,
        { playlistId: string; videoId: string },
      ]>).find(([, config]) => config.videoId === videoId)?.[0];
      if (!videoDetailsHookCalled) {
        videoDetailsHookCalled = true;
        options.onVideoDetails?.(state);
      }
      const detailsKind = mode
        ? options.videoDetails?.[mode] || "valid"
        : "empty";
      return Response.json({
        items: detailsKind === "empty"
          ? []
          : detailsKind === "missingSnippet"
          ? [{ id: videoId }]
          : detailsKind === "wrongId"
          ? [{
            id: "Z1234567890",
            snippet: {
              title: "wrong video",
              description: "0:00 매일성경 묵상",
            },
          }]
          : mode
          ? [{
            id: videoId,
            snippet: {
              title: `7월 15일 ${mode}`,
              description: options.chapterDescriptions?.[mode] ||
                "0:00 매일성경 묵상\n6:33 성경읽기",
              publishedAt: "2026-07-14T20:00:00.000Z",
            },
          }]
          : [],
      });
    }

    return Response.json({ error: "unexpected URL" }, { status: 404 });
  };

  const dependencies = {
    beginTransaction,
    commitWrites,
    deleteWrite,
    getDocument: readDocument,
    rollbackTransaction,
    updateWrite,
    fetcher,
    getEnv: (name: string) =>
      name === "YOUTUBE_API_KEY" ? options.envApiKey : undefined,
    now: () => new Date(NOW_MS),
    ...(options.youtubeDeadlineMs === undefined
      ? {}
      : { youtubeDeadlineMs: options.youtubeDeadlineMs }),
  };

  return { state, dependencies };
};

const runResolve = (
  harness: ReturnType<typeof createHarness>,
  requestId = REQUEST_ID,
) =>
  resolveDailyVideo(SERVICE, requestId, {
    dependencies: harness.dependencies as never,
  });

const dailyWrites = (state: MemoryState): MemoryWrite[] =>
  state.commits.flat().filter((write) =>
    write.kind === "update" && write.path === DAILY_PATH
  );

const requireUpdateWrite = (
  write: MemoryWrite | undefined,
  message: string,
): Extract<MemoryWrite, { kind: "update" }> => {
  if (!write || write.kind !== "update") throw new Error(message);
  return write;
};

const timestampIso = (value: unknown): string | null => {
  if (value instanceof Date) return value.toISOString();
  if (typeof value !== "string" && typeof value !== "number") return null;
  const parsed = new Date(value);
  return Number.isFinite(parsed.getTime()) ? parsed.toISOString() : null;
};

const assertNoPrivateResolveData = (result: unknown, message: string) => {
  const serialized = JSON.stringify(result);
  for (
    const secret of [
      "secret-key",
      "firestore-key",
      MODE_CONFIG.adult.playlistId,
      MODE_CONFIG.kids.playlistId,
      DAILY_PATH,
      JOB_PATH,
      CONFIG_PATH,
    ]
  ) {
    assert(!serialized.includes(secret), `${message}: leaked ${secret}`);
  }
  for (
    const internalField of [
      "apiKey",
      "playlistId",
      "leaseOwner",
      "leasePurpose",
      "leaseExpiresAt",
      "refreshAttemptCount",
      "refreshNextRetryAt",
      "chaptersRefreshedAt",
    ]
  ) {
    assert(
      !serialized.includes(`"${internalField}"`),
      `${message}: leaked ${internalField}`,
    );
  }
};

Deno.test("fresh 수동 문서는 그대로 반환하고 write와 YouTube 호출을 하지 않는다", async () => {
  const harness = createHarness();
  setDocument(harness.state, CONFIG_PATH, configData());
  setDocument(harness.state, DAILY_PATH, {
    ...manualVideo(),
    chaptersRefreshedAt: freshChaptersRefreshedAt(),
  });

  const result = await runResolve(harness);

  assertEquals(result, {
    serviceDate: SERVICE_DATE,
    video: manualVideo(),
    transient: null,
    pending: false,
  }, "manual result");
  assertEquals(harness.state.commits.length, 0, "manual write count");
  assertEquals(harness.state.youtubeUrls.length, 0, "manual YouTube count");
});

Deno.test("fresh 문서의 미래 updatedAt은 반복 refresh lease를 만들지 않는다", async () => {
  const original = {
    ...richManualVideo(),
    updatedAt: new Date(NOW_MS + 86_400_000).toISOString(),
    chaptersRefreshedAt: new Date(NOW_MS).toISOString(),
  };
  const harness = createHarness({ envApiKey: "secret-key" });
  setDocument(harness.state, CONFIG_PATH, configData());
  setDocument(harness.state, DAILY_PATH, original);

  const result = await runResolve(harness);

  assertEquals(result.pending, false, "future updatedAt pending");
  assertEquals(result.video?.adult?.url, original.adult.url, "stored video");
  assertEquals(harness.state.youtubeUrls.length, 0, "future updatedAt fetches");
  assertEquals(harness.state.commits.length, 0, "future updatedAt writes");
  assertEquals(getDocumentData(harness.state, JOB_PATH), null, "job created");
});

Deno.test("fresh 완성 자동 문서는 lease 없이 반환한다", async () => {
  const harness = createHarness();
  setDocument(harness.state, CONFIG_PATH, configData());
  setDocument(harness.state, DAILY_PATH, {
    adult: videoEntry("adult"),
    kids: videoEntry("kids"),
    autoFilled: true,
    chaptersRefreshedAt: freshChaptersRefreshedAt(),
  });

  const result = await runResolve(harness);

  assert(!result.pending, "complete auto document became pending");
  assertEquals(result.video?.adult?.url, videoEntry("adult").url, "adult URL");
  assertEquals(result.video?.kids?.url, videoEntry("kids").url, "kids URL");
  assertEquals(harness.state.commits.length, 0, "complete auto lease count");
  assertEquals(
    harness.state.youtubeUrls.length,
    0,
    "complete auto YouTube count",
  );
  assertEquals(getDocumentData(harness.state, JOB_PATH), null, "job created");
});

Deno.test("stale 수동 문서는 videos API로만 갱신하고 chapters 외 필드를 보존한다", async () => {
  const original = richManualVideo();
  const harness = createHarness({
    envApiKey: "secret-key",
    chapterDescriptions: {
      adult: "1:00 매일성경 묵상\n5:00 기도제목",
      kids: "2:00 매일성경 묵상\n7:00 성경읽기",
    },
  });
  setDocument(harness.state, CONFIG_PATH, configData());
  setDocument(harness.state, DAILY_PATH, original);

  const result = await runResolve(harness);

  assertEquals(result.pending, false, "manual refresh pending");
  assertEquals(result.transient, null, "manual refresh transient");
  assertEquals(harness.state.youtubeUrls.length, 2, "manual videos calls");
  assert(
    harness.state.youtubeUrls.every((url) => url.pathname.endsWith("/videos")),
    "manual refresh called playlistItems",
  );
  for (const url of harness.state.youtubeUrls) {
    assertEquals(url.searchParams.get("key"), "secret-key", "refresh secret");
    assert(
      !url.toString().includes("firestore-key"),
      "refresh fallback leaked",
    );
  }
  assert(
    harness.state.events.findIndex((event) => event.startsWith("commit:")) <
      harness.state.events.findIndex((event) => event.startsWith("fetch:")),
    "manual refresh fetched before lease commit",
  );
  assertEquals(harness.state.commits.length, 2, "manual refresh commits");
  assertEquals(
    harness.state.commits[1].map((write) => `${write.kind}:${write.path}`),
    [`update:${DAILY_PATH}`, `delete:${JOB_PATH}`],
    "manual refresh final writes",
  );
  const refreshWrite = requireUpdateWrite(
    dailyWrites(harness.state)[0],
    "manual refresh write missing",
  );
  assertEquals(
    refreshWrite.updateMask,
    ["adult.chapters", "kids.chapters", "chaptersRefreshedAt"],
    "manual refresh update mask",
  );

  const expected = structuredClone(original);
  expected.adult.chapters = [
    { label: "해설", sec: 60 },
    { label: "기도", sec: 300 },
  ];
  expected.kids.chapters = [
    { label: "해설", sec: 120 },
    { label: "성경읽기", sec: 420 },
  ];
  (expected as Record<string, unknown>).chaptersRefreshedAt = new Date(NOW_MS);
  assertEquals(
    getDocumentData(harness.state, DAILY_PATH),
    expected,
    "manual non-chapter fields changed",
  );
  assertEquals(getDocumentData(harness.state, JOB_PATH), null, "refresh job");
  assertEquals(
    result.video?.adult?.chapters,
    expected.adult.chapters,
    "manual response adult chapters",
  );
  assertEquals(result.video?.autoFilled, false, "manual autoFilled changed");
  assertNoPrivateResolveData(result, "manual refresh response");
});

Deno.test("stale 완성 자동 문서도 nested chapters와 timestamp만 갱신한다", async () => {
  const original = {
    adult: { ...videoEntry("adult"), sentinel: "adult-keep" },
    kids: { ...videoEntry("kids"), sentinel: "kids-keep" },
    autoFilled: true,
    updatedAt: "2026-07-14T00:00:00.000Z",
    chaptersRefreshedAt: staleChaptersRefreshedAt(),
    sentinel: { topLevel: "keep" },
  };
  const harness = createHarness({
    envApiKey: "secret-key",
    chapterDescriptions: {
      adult: "3:00 매일성경 묵상\n8:00 기도제목",
      kids: "4:00 매일성경 묵상\n9:00 성경읽기",
    },
  });
  setDocument(harness.state, CONFIG_PATH, configData());
  setDocument(harness.state, DAILY_PATH, original);

  const result = await runResolve(harness);

  assertEquals(result.pending, false, "auto refresh pending");
  assertEquals(harness.state.youtubeUrls.length, 2, "auto videos calls");
  assert(
    harness.state.youtubeUrls.every((url) => url.pathname.endsWith("/videos")),
    "auto refresh called playlistItems",
  );
  const refreshWrite = requireUpdateWrite(
    dailyWrites(harness.state)[0],
    "auto refresh write missing",
  );
  assertEquals(
    refreshWrite.updateMask,
    ["adult.chapters", "kids.chapters", "chaptersRefreshedAt"],
    "auto refresh update mask",
  );
  const expected = structuredClone(original);
  expected.adult.chapters = [
    { label: "해설", sec: 180 },
    { label: "기도", sec: 480 },
  ];
  expected.kids.chapters = [
    { label: "해설", sec: 240 },
    { label: "성경읽기", sec: 540 },
  ];
  (expected as Record<string, unknown>).chaptersRefreshedAt = new Date(NOW_MS);
  assertEquals(
    getDocumentData(harness.state, DAILY_PATH),
    expected,
    "auto non-chapter fields changed",
  );
  assertNoPrivateResolveData(result, "auto refresh response");
});

Deno.test("두 모드 refresh 일부 성공은 성공 chapters만 저장하고 독립 2분 backoff한다", async () => {
  const original = richManualVideo();
  const fillNextRetryAt = new Date(NOW_MS + 30 * 60 * 1000).toISOString();
  const harness = createHarness({
    envApiKey: "secret-key",
    chapterDescriptions: { adult: "1:30 매일성경 묵상\n10:00 기도제목" },
    videoDetails: { kids: "empty" },
  });
  setDocument(harness.state, CONFIG_PATH, configData());
  setDocument(harness.state, DAILY_PATH, original);
  setDocument(harness.state, JOB_PATH, {
    leaseExpiresAt: new Date(NOW_MS).toISOString(),
    attemptCount: 4,
    nextRetryAt: fillNextRetryAt,
    refreshAttemptCount: 0,
    refreshNextRetryAt: new Date(NOW_MS).toISOString(),
  });

  const result = await runResolve(harness);

  assertEquals(result.pending, true, "partial refresh pending");
  assertEquals(result.retryAfterMs, 120_000, "partial refresh retry");
  assertEquals(result.transient, null, "partial refresh transient");
  assertEquals(harness.state.youtubeUrls.length, 2, "partial videos calls");
  const refreshWrite = requireUpdateWrite(
    dailyWrites(harness.state)[0],
    "partial daily write missing",
  );
  assertEquals(
    refreshWrite.updateMask,
    ["adult.chapters"],
    "partial refresh update mask",
  );
  const expected = structuredClone(original);
  expected.adult.chapters = [
    { label: "해설", sec: 90 },
    { label: "기도", sec: 600 },
  ];
  assertEquals(
    getDocumentData(harness.state, DAILY_PATH),
    expected,
    "partial refresh changed failed mode or metadata",
  );
  assertEquals(
    result.video?.kids?.chapters,
    original.kids.chapters,
    "failed kids chapters changed",
  );
  const job = getDocumentData(harness.state, JOB_PATH);
  assertEquals(job?.attemptCount, 4, "fill attempt count changed");
  assertEquals(job?.nextRetryAt, fillNextRetryAt, "fill backoff changed");
  assertEquals(job?.refreshAttemptCount, 1, "refresh attempt count");
  assertEquals(
    timestampIso(job?.refreshNextRetryAt),
    new Date(NOW_MS + 120_000).toISOString(),
    "refresh next retry",
  );
  assertEquals(job?.leaseOwner, null, "partial refresh lease owner");
  assertNoPrivateResolveData(result, "partial refresh response");
});

Deno.test("추출 불가 모드가 섞이면 성공 모드만 갱신하고 전체 TTL을 전진시키지 않는다", async () => {
  const original = richManualVideo();
  original.kids.url = `${videoEntry("kids").url}/extra`;
  const harness = createHarness({
    envApiKey: "secret-key",
    chapterDescriptions: { adult: "1:30 매일성경 묵상\n10:00 기도제목" },
  });
  setDocument(harness.state, CONFIG_PATH, configData());
  setDocument(harness.state, DAILY_PATH, original);

  const result = await runResolve(harness);

  assertEquals(result.pending, true, "unextractable mixed pending");
  assertEquals(result.retryAfterMs, 120_000, "unextractable mixed retry");
  assertEquals(harness.state.youtubeUrls.length, 1, "valid-mode fetch count");
  const refreshWrite = requireUpdateWrite(
    dailyWrites(harness.state)[0],
    "mixed refresh write missing",
  );
  assertEquals(
    refreshWrite.updateMask,
    ["adult.chapters"],
    "mixed refresh advanced global TTL",
  );
  const stored = getDocumentData(harness.state, DAILY_PATH);
  assertEquals(
    stored?.chaptersRefreshedAt,
    original.chaptersRefreshedAt,
    "mixed refresh timestamp changed",
  );
  assertEquals(
    (stored?.kids as { chapters?: unknown })?.chapters,
    original.kids.chapters,
    "unextractable mode chapters changed",
  );
  assertEquals(
    getDocumentData(harness.state, JOB_PATH)?.refreshAttemptCount,
    1,
    "mixed refresh attempt count",
  );
});

Deno.test("모든 저장 URL이 추출 불가면 lease와 YouTube 호출 없이 기존 영상을 반환한다", async () => {
  const original = {
    ...manualVideo(),
    adult: {
      ...manualVideo().adult,
      url: "https://youtu.be/M1234567890/extra",
    },
    chaptersRefreshedAt: staleChaptersRefreshedAt(),
  };
  const harness = createHarness({ envApiKey: "secret-key" });
  setDocument(harness.state, CONFIG_PATH, configData({ kids: false }));
  setDocument(harness.state, DAILY_PATH, original);

  const result = await runResolve(harness);

  assertEquals(result.pending, false, "all-unextractable pending");
  assertEquals(result.video?.adult?.url, original.adult.url, "cached URL");
  assertEquals(harness.state.youtubeUrls.length, 0, "unexpected YouTube call");
  assertEquals(harness.state.commits.length, 0, "unexpected lease/write");
  assertEquals(getDocumentData(harness.state, JOB_PATH), null, "job created");
});

Deno.test("refresh 전부 실패 또는 timeout이면 daily를 쓰지 않고 기존 chapters를 반환한다", async () => {
  for (const failure of ["empty", "timeout"] as const) {
    const original = richManualVideo();
    const harness = createHarness({
      envApiKey: "secret-key",
      ...(failure === "empty"
        ? { videoDetails: { adult: "empty", kids: "empty" } as const }
        : { hangYouTube: true, youtubeDeadlineMs: 5 }),
    });
    setDocument(harness.state, CONFIG_PATH, configData());
    setDocument(harness.state, DAILY_PATH, original);

    let watchdog: ReturnType<typeof setTimeout> | undefined;
    const result = await Promise.race([
      runResolve(harness),
      new Promise<never>((_resolve, reject) => {
        watchdog = setTimeout(
          () => reject(new Error(`${failure} refresh did not finish`)),
          500,
        );
      }),
    ]).finally(() => clearTimeout(watchdog));

    assertEquals(result.pending, true, `${failure}: pending`);
    assertEquals(result.retryAfterMs, 120_000, `${failure}: retry`);
    assertEquals(result.transient, null, `${failure}: transient`);
    assertEquals(
      dailyWrites(harness.state).length,
      0,
      `${failure}: daily write`,
    );
    assertEquals(
      getDocumentData(harness.state, DAILY_PATH),
      original,
      `${failure}: stored video changed`,
    );
    assertEquals(
      result.video?.adult?.chapters,
      original.adult.chapters,
      `${failure}: adult chapters changed`,
    );
    assertEquals(
      result.video?.kids?.chapters,
      original.kids.chapters,
      `${failure}: kids chapters changed`,
    );
    assertEquals(
      harness.state.youtubeUrls.length,
      2,
      `${failure}: videos calls`,
    );
    if (failure === "timeout") {
      assertEquals(harness.state.abortedFetches, 2, "refresh abort count");
    }
    const job = getDocumentData(harness.state, JOB_PATH);
    assertEquals(job?.refreshAttemptCount, 1, `${failure}: attempt count`);
    assertEquals(job?.leaseOwner, null, `${failure}: lease owner`);
    assertNoPrivateResolveData(result, `${failure} refresh response`);
  }
});

Deno.test("active refresh lease와 refresh backoff는 기존 video를 즉시 반환하고 YouTube를 호출하지 않는다", async () => {
  for (const blockedBy of ["lease", "backoff"] as const) {
    const original = richManualVideo();
    const harness = createHarness({ envApiKey: "secret-key" });
    setDocument(harness.state, CONFIG_PATH, configData());
    setDocument(harness.state, DAILY_PATH, original);
    setDocument(harness.state, JOB_PATH, {
      leaseExpiresAt: new Date(
        blockedBy === "lease" ? NOW_MS + 90_000 : NOW_MS,
      ).toISOString(),
      leaseOwner: blockedBy === "lease" ? "other-owner" : null,
      leasePurpose: "refresh",
      refreshAttemptCount: 2,
      refreshNextRetryAt: new Date(
        blockedBy === "backoff" ? NOW_MS + 300_000 : NOW_MS,
      ).toISOString(),
    });

    const result = await runResolve(harness);

    assertEquals(result.pending, true, `${blockedBy}: pending`);
    assertEquals(
      result.retryAfterMs,
      blockedBy === "lease" ? 90_000 : 300_000,
      `${blockedBy}: retry boundary`,
    );
    assertEquals(
      result.video?.adult?.url,
      original.adult.url,
      `${blockedBy}: stored video missing`,
    );
    assertEquals(harness.state.youtubeUrls.length, 0, `${blockedBy}: fetches`);
    assertEquals(harness.state.commits.length, 0, `${blockedBy}: writes`);
  }
});

Deno.test("fill은 refresh backoff와 세대를 덮지 않고 독립적으로 획득한다", async () => {
  const harness = createHarness({ envApiKey: "secret-key" });
  setDocument(harness.state, CONFIG_PATH, configData({ kids: false }));
  setDocument(harness.state, JOB_PATH, {
    leaseExpiresAt: new Date(NOW_MS).toISOString(),
    attemptCount: 0,
    nextRetryAt: new Date(NOW_MS).toISOString(),
    refreshAttemptCount: 4,
    refreshNextRetryAt: new Date(NOW_MS + 60 * 60 * 1000).toISOString(),
  });

  const result = await runResolve(harness);

  assertEquals(result.pending, false, "fill blocked by refresh backoff");
  assertEquals(harness.state.youtubeUrls.length, 2, "fill YouTube calls");
  const leaseWrite = requireUpdateWrite(
    harness.state.commits[0]?.[0],
    "fill lease write missing",
  );
  assertEquals(
    leaseWrite.updateMask,
    [
      "leaseExpiresAt",
      "attemptCount",
      "nextRetryAt",
      "leaseOwner",
      "leasePurpose",
      "configUpdateTime",
      "updatedAt",
    ],
    "fill lease changed refresh fields",
  );
  assertEquals(
    (leaseWrite.data as Record<string, unknown>).leasePurpose,
    "fill",
    "fill purpose",
  );
  assertEquals(getDocumentData(harness.state, JOB_PATH), null, "fill job");
});

Deno.test("refresh fetch 중 수동 URL 또는 chapters 수정은 updateTime fence로 보존한다", async () => {
  for (const mutation of ["url", "chapters"] as const) {
    const original = richManualVideo();
    let adminVersion: ReturnType<typeof richManualVideo> | undefined;
    const harness = createHarness({
      envApiKey: "secret-key",
      onVideoDetails: (state) => {
        adminVersion = structuredClone(original);
        if (mutation === "url") {
          adminVersion.adult.url = "https://youtu.be/Z1234567890";
          adminVersion.adult.chapters = [{ label: "해설", sec: 777 }];
        } else {
          adminVersion.adult.chapters = [{ label: "기도", sec: 888 }];
        }
        setDocument(state, DAILY_PATH, adminVersion);
      },
    });
    setDocument(harness.state, CONFIG_PATH, configData());
    setDocument(harness.state, DAILY_PATH, original);

    const result = await runResolve(harness);

    const latestAdminVersion = adminVersion;
    if (!latestAdminVersion) {
      throw new Error(`${mutation}: admin mutation missing`);
    }
    assertEquals(
      getDocumentData(harness.state, DAILY_PATH),
      latestAdminVersion,
      `${mutation}: admin edit overwritten`,
    );
    assertEquals(
      dailyWrites(harness.state).length,
      0,
      `${mutation}: daily write`,
    );
    assertEquals(harness.state.commits.length, 1, `${mutation}: final commit`);
    assertEquals(result.pending, false, `${mutation}: stale worker pending`);
    assertEquals(
      result.video?.adult?.chapters,
      latestAdminVersion.adult.chapters,
      `${mutation}: latest chapters not returned`,
    );
  }
});

Deno.test("refresh lease purpose와 generation 변경은 이전 worker 결과를 폐기한다", async () => {
  for (const mutation of ["purpose", "generation"] as const) {
    const original = richManualVideo();
    const harness = createHarness({
      envApiKey: "secret-key",
      onVideoDetails: (state) => {
        const job = getDocumentData(state, JOB_PATH);
        if (!job) throw new Error(`${mutation}: refresh lease missing`);
        setDocument(state, JOB_PATH, {
          ...job,
          ...(mutation === "purpose" ? { leasePurpose: "fill" } : {
            refreshAttemptCount: Number(job.refreshAttemptCount) + 1,
            leaseExpiresAt: new Date(NOW_MS + 90_000).toISOString(),
          }),
        });
      },
    });
    setDocument(harness.state, CONFIG_PATH, configData());
    setDocument(harness.state, DAILY_PATH, original);

    const result = await runResolve(harness);

    assertEquals(
      getDocumentData(harness.state, DAILY_PATH),
      original,
      `${mutation}: stale refresh stored`,
    );
    assertEquals(
      dailyWrites(harness.state).length,
      0,
      `${mutation}: daily write`,
    );
    assertEquals(harness.state.commits.length, 1, `${mutation}: final commit`);
    assertEquals(result.pending, false, `${mutation}: stale worker pending`);
  }
});

Deno.test("첫 resolve는 lease를 먼저 저장하고 full 모드일 때만 daily를 저장한 뒤 job을 삭제한다", async () => {
  const harness = createHarness({ envApiKey: "secret-key" });
  setDocument(harness.state, CONFIG_PATH, configData());

  const result = await runResolve(harness);

  assert(!result.pending && result.video, "full result missing");
  assertEquals(harness.state.commits.length, 2, "full commit count");
  assertEquals(
    harness.state.commits[0].map((write) => write.path),
    [JOB_PATH],
    "lease write",
  );
  assertEquals(
    harness.state.commits[1].map((write) => `${write.kind}:${write.path}`),
    [`update:${DAILY_PATH}`, `delete:${JOB_PATH}`],
    "final writes",
  );
  assert(
    harness.state.events.findIndex((event) => event.startsWith("commit:")) <
      harness.state.events.findIndex((event) => event.startsWith("fetch:")),
    "YouTube was called before lease commit",
  );
  const stored = getDocumentData(harness.state, DAILY_PATH);
  assert(stored?.autoFilled === true, "full daily not stored");
  assert((stored?.adult as { url?: string })?.url, "adult not stored");
  assert((stored?.kids as { url?: string })?.url, "kids not stored");
  assertEquals(
    (stored?.chaptersRefreshedAt as Date)?.toISOString(),
    new Date(NOW_MS).toISOString(),
    "full fill chapters refresh timestamp",
  );
  assertEquals(
    getDocumentData(harness.state, JOB_PATH),
    null,
    "job not deleted",
  );
  assertEquals(harness.state.youtubeUrls.length, 4, "full YouTube call count");
});

Deno.test("partial 결과는 daily에 저장하지 않고 2분 backoff와 transient만 반환한다", async () => {
  const harness = createHarness({
    envApiKey: "secret-key",
    available: { adult: true, kids: false },
  });
  setDocument(harness.state, CONFIG_PATH, configData());

  const result = await runResolve(harness);

  assertEquals(result.pending, true, "partial pending");
  assertEquals(result.retryAfterMs, 120_000, "first backoff");
  assertEquals(result.video, null, "partial persisted video response");
  assertEquals(
    result.transient?.adult?.url,
    videoEntry("adult").url,
    "transient adult",
  );
  assertEquals(result.transient?.kids, null, "transient kids");
  assertEquals(
    getDocumentData(harness.state, DAILY_PATH),
    null,
    "partial daily stored",
  );
  const job = getDocumentData(harness.state, JOB_PATH);
  assertEquals(job?.attemptCount, 1, "partial attempt count");
  assertEquals(job?.leaseOwner, null, "partial lease owner");
  assertEquals(
    (job?.nextRetryAt as Date)?.toISOString(),
    new Date(NOW_MS + 120_000).toISOString(),
    "partial next retry",
  );
});

Deno.test("partial 자동 문서가 fill 중 삭제되면 이전 worker가 문서를 되살리지 않는다", async () => {
  const original = {
    adult: videoEntry("adult"),
    kids: null,
    autoFilled: true,
    updatedAt: "2026-07-14T00:00:00.000Z",
  };
  const harness = createHarness({
    envApiKey: "secret-key",
    onVideoDetails: (state) => state.documents.delete(DAILY_PATH),
  });
  setDocument(harness.state, CONFIG_PATH, configData());
  setDocument(harness.state, DAILY_PATH, original);

  const result = await runResolve(harness);

  assertEquals(result.pending, true, "deleted daily pending");
  assertEquals(
    result.video,
    null,
    "deleted daily video resurrected in response",
  );
  assertEquals(result.transient, null, "stale fill transient leaked");
  assertEquals(
    getDocumentData(harness.state, DAILY_PATH),
    null,
    "daily recreated",
  );
  assertEquals(dailyWrites(harness.state).length, 0, "stale daily write");
  assertEquals(harness.state.youtubeUrls.length, 2, "missing mode fetch count");
  assertEquals(
    harness.state.commits.length,
    1,
    "stale worker finalized writes",
  );
});

Deno.test("활성 lease는 같은 requestId여도 YouTube 호출 없이 pending을 반환한다", async () => {
  const harness = createHarness({ envApiKey: "secret-key" });
  setDocument(harness.state, CONFIG_PATH, configData());
  setDocument(harness.state, JOB_PATH, {
    leaseExpiresAt: new Date(NOW_MS + 90_000).toISOString(),
    attemptCount: 1,
    nextRetryAt: new Date(NOW_MS).toISOString(),
    leaseOwner: REQUEST_ID,
  });

  const result = await runResolve(harness, REQUEST_ID);

  assertEquals(result.pending, true, "active lease pending");
  assertEquals(result.retryAfterMs, 90_000, "active lease retry");
  assertEquals(
    harness.state.youtubeUrls.length,
    0,
    "active lease YouTube count",
  );
  assertEquals(harness.state.commits.length, 0, "active lease write count");
});

Deno.test("fetch 뒤 owner, config, manual 변경 시 가져온 영상을 모두 폐기한다", async () => {
  for (const mutation of ["owner", "config", "manual"] as const) {
    const harness = createHarness({
      envApiKey: "secret-key",
      onVideoDetails: (state) => {
        if (mutation === "owner") {
          const job = getDocumentData(state, JOB_PATH);
          assert(job, "lease missing before owner mutation");
          setDocument(state, JOB_PATH, { ...job, leaseOwner: "other-owner" });
        } else if (mutation === "config") {
          setDocument(state, CONFIG_PATH, {
            ...configData({ kids: false }),
            enabled: false,
          });
        } else {
          setDocument(state, DAILY_PATH, manualVideo());
        }
      },
    });
    setDocument(harness.state, CONFIG_PATH, configData({ kids: false }));

    const result = await runResolve(harness);

    assertEquals(
      result.transient,
      null,
      `${mutation}: fetched transient leaked`,
    );
    if (mutation === "manual") {
      assertEquals(result.video, manualVideo(), "manual final result");
      assertEquals(
        getDocumentData(harness.state, DAILY_PATH),
        manualVideo(),
        "manual overwritten",
      );
    } else {
      assertEquals(result.video, null, `${mutation}: fetched video leaked`);
      assertEquals(
        getDocumentData(harness.state, DAILY_PATH),
        null,
        `${mutation}: fetched daily stored`,
      );
    }
    assertEquals(
      harness.state.youtubeUrls.length,
      2,
      `${mutation}: fetch count`,
    );
  }
});

Deno.test("YOUTUBE_API_KEY secret은 Firestore apiKey보다 모든 YouTube URL에서 우선한다", async () => {
  const harness = createHarness({ envApiKey: "secret-key" });
  setDocument(harness.state, CONFIG_PATH, configData({ kids: false }));

  const result = await runResolve(harness);

  assert(!result.pending, "secret-key resolve failed");
  assertEquals(harness.state.youtubeUrls.length, 2, "secret-key fetch count");
  for (const url of harness.state.youtubeUrls) {
    assertEquals(
      url.searchParams.get("key"),
      "secret-key",
      "secret precedence",
    );
    assert(!url.toString().includes("firestore-key"), "Firestore key leaked");
  }
  assertNoPrivateResolveData(result, "fill secret response");
});

Deno.test("YOUTUBE_API_KEY secret이 없을 때만 Firestore apiKey를 한시적으로 사용한다", async () => {
  const harness = createHarness();
  setDocument(harness.state, CONFIG_PATH, configData({ kids: false }));

  const result = await runResolve(harness);

  assert(!result.pending, "Firestore fallback resolve failed");
  assertEquals(harness.state.youtubeUrls.length, 2, "fallback fetch count");
  for (const url of harness.state.youtubeUrls) {
    assertEquals(
      url.searchParams.get("key"),
      "firestore-key",
      "Firestore fallback key",
    );
  }
  assertNoPrivateResolveData(result, "fill fallback response");
});

Deno.test("값이 있으나 형식이 잘못된 playlist 모드도 완료 조건에서 제외하지 않는다", async () => {
  const harness = createHarness({ envApiKey: "secret-key" });
  setDocument(harness.state, CONFIG_PATH, {
    ...configData(),
    kidsPlaylistId: "https://invalid.example/playlist",
  });

  const result = await runResolve(harness);

  assertEquals(result.pending, true, "invalid configured mode pending");
  assertEquals(result.retryAfterMs, 120_000, "invalid mode backoff");
  assertEquals(result.video, null, "invalid mode completed video");
  assertEquals(
    result.transient?.adult?.url,
    videoEntry("adult").url,
    "valid mode transient",
  );
  assertEquals(result.transient?.kids, null, "invalid mode transient");
  assertEquals(
    getDocumentData(harness.state, DAILY_PATH),
    null,
    "invalid mode stored daily",
  );
  assertEquals(harness.state.youtubeUrls.length, 2, "invalid mode fetch count");
});

Deno.test("videos API가 빈 items 또는 snippet 없는 항목을 반환하면 완료 저장하지 않는다", async () => {
  for (const detailsKind of ["empty", "wrongId", "missingSnippet"] as const) {
    const harness = createHarness({
      envApiKey: "secret-key",
      videoDetails: { adult: detailsKind },
    });
    setDocument(harness.state, CONFIG_PATH, configData({ kids: false }));

    const result = await runResolve(harness);

    assertEquals(result.pending, true, `${detailsKind}: pending`);
    assertEquals(result.retryAfterMs, 120_000, `${detailsKind}: backoff`);
    assertEquals(result.video, null, `${detailsKind}: completed video leaked`);
    assertEquals(result.transient, null, `${detailsKind}: invalid transient`);
    assertEquals(
      getDocumentData(harness.state, DAILY_PATH),
      null,
      `${detailsKind}: invalid daily stored`,
    );
    const job = getDocumentData(harness.state, JOB_PATH);
    assertEquals(job?.attemptCount, 1, `${detailsKind}: attempt count`);
    assertEquals(job?.leaseOwner, null, `${detailsKind}: lease release`);
  }
});

Deno.test("멈춘 YouTube fetch는 lease보다 짧은 deadline에 중단하고 backoff한다", async () => {
  const harness = createHarness({
    envApiKey: "secret-key",
    hangYouTube: true,
    youtubeDeadlineMs: 5,
  });
  setDocument(harness.state, CONFIG_PATH, configData({ kids: false }));

  let watchdog: ReturnType<typeof setTimeout> | undefined;
  const result = await Promise.race([
    runResolve(harness),
    new Promise<never>((_resolve, reject) => {
      watchdog = setTimeout(
        () => reject(new Error("resolver did not honor YouTube deadline")),
        500,
      );
    }),
  ]).finally(() => clearTimeout(watchdog));

  assertEquals(result.pending, true, "deadline pending");
  assertEquals(result.retryAfterMs, 120_000, "deadline backoff");
  assertEquals(result.video, null, "deadline completed video");
  assertEquals(result.transient, null, "deadline transient");
  assertEquals(
    getDocumentData(harness.state, DAILY_PATH),
    null,
    "deadline stored daily",
  );
  assertEquals(harness.state.abortedFetches, 1, "deadline abort count");
  const job = getDocumentData(harness.state, JOB_PATH);
  assertEquals(job?.attemptCount, 1, "deadline attempt count");
  assertEquals(job?.leaseOwner, null, "deadline lease release");
});

Deno.test("같은 requestId의 새 lease 세대가 생기면 이전 worker 결과를 폐기한다", async () => {
  const harness = createHarness({
    envApiKey: "secret-key",
    onVideoDetails: (state) => {
      const job = getDocumentData(state, JOB_PATH);
      if (!job) throw new Error("first lease missing before generation change");
      setDocument(state, JOB_PATH, {
        ...job,
        leaseOwner: REQUEST_ID,
        attemptCount: Number(job.attemptCount) + 1,
        leaseExpiresAt: new Date(NOW_MS + 90_000).toISOString(),
        nextRetryAt: new Date(NOW_MS).toISOString(),
      });
    },
  });
  setDocument(harness.state, CONFIG_PATH, configData({ kids: false }));

  const result = await runResolve(harness, REQUEST_ID);

  assertEquals(result.pending, true, "generation fence pending");
  assertEquals(result.retryAfterMs, 90_000, "new lease retry boundary");
  assertEquals(result.video, null, "old worker video leaked");
  assertEquals(result.transient, null, "old worker transient leaked");
  assertEquals(
    getDocumentData(harness.state, DAILY_PATH),
    null,
    "old worker stored daily",
  );
  const job = getDocumentData(harness.state, JOB_PATH);
  assertEquals(job?.attemptCount, 2, "new lease generation overwritten");
  assertEquals(job?.leaseOwner, REQUEST_ID, "new lease owner overwritten");
  assertEquals(harness.state.commits.length, 1, "old worker finalized writes");
});
