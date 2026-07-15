import type {
  FirestoreDocument,
  FirestoreWrite,
} from "../_shared/firestore.ts";
import type { DailyVideoMode } from "./dailyVideoCore.ts";
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
  envApiKey?: string;
  hangYouTube?: boolean;
  onVideoDetails?: (state: MemoryState) => void;
  videoDetails?: Partial<
    Record<DailyVideoMode, "valid" | "empty" | "missingSnippet">
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
    writeOptions: { exists?: boolean } = {},
  ): FirestoreWrite => ({
    kind: "update",
    path,
    data,
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
        setDocument(state, write.path, write.data);
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
          : mode
          ? [{
            id: MODE_CONFIG[mode].videoId,
            snippet: {
              title: `7월 15일 ${mode}`,
              description: "0:00 매일성경 묵상\n6:33 성경읽기",
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

Deno.test("수동 문서는 그대로 반환하고 write와 YouTube 호출을 하지 않는다", async () => {
  const harness = createHarness();
  setDocument(harness.state, CONFIG_PATH, configData());
  setDocument(harness.state, DAILY_PATH, manualVideo());

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

Deno.test("설정된 모든 모드가 완성된 자동 문서는 lease 없이 반환한다", async () => {
  const harness = createHarness();
  setDocument(harness.state, CONFIG_PATH, configData());
  setDocument(harness.state, DAILY_PATH, {
    adult: videoEntry("adult"),
    kids: videoEntry("kids"),
    autoFilled: true,
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
  for (const detailsKind of ["empty", "missingSnippet"] as const) {
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
