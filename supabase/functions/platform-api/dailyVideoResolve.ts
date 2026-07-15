import { PlatformError } from "../_shared/errors.ts";
import {
  beginTransaction,
  commitWrites,
  deleteWrite,
  type FirestoreDocument,
  type FirestoreWrite,
  getDocument,
  rollbackTransaction,
  updateWrite,
} from "../_shared/firestore.ts";
import { getServiceDateKst } from "../_shared/time.ts";
import {
  buildDailyVideoFailureState,
  buildDailyVideoLease,
  DAILY_VIDEO_LEASE_MS,
  type DailyVideoChapter,
  type DailyVideoEntry,
  type DailyVideoJob,
  type DailyVideoMode,
  type DailyVideoPayload,
  extractYouTubeVideoId,
  getConfiguredDailyVideoModes,
  getDailyVideoBackoffMs,
  getDailyVideoFillState,
  getSafeDailyVideoBase,
  inspectDailyVideoLease,
  isDailyVideoChaptersRefreshDue,
  parseAndMapChapters,
  sanitizeDailyVideoEntry,
  sanitizeDailyVideoPayload,
  selectDailyVideoCandidate,
  titleMatchesDate,
} from "./dailyVideoCore.ts";

type ServiceAccess = { token: string; projectId: string };

type VideoAutoConfigDocument = {
  enabled?: unknown;
  apiKey?: unknown;
  adultPlaylistId?: unknown;
  kidsPlaylistId?: unknown;
};

type DailyVideoJobDocument = DailyVideoJob & {
  leaseOwner?: unknown;
  leasePurpose?: unknown;
  configUpdateTime?: unknown;
  refreshAttemptCount?: unknown;
  refreshNextRetryAt?: unknown;
};

type DailyVideoLeasePurpose = "fill" | "refresh";

type DailyVideoRefreshTarget = {
  mode: DailyVideoMode;
  videoId: string | null;
};

type DailyVideoModeConfig = {
  mode: DailyVideoMode;
  playlistId: string;
};

type NormalizedVideoConfig = {
  enabled: boolean;
  apiKey: string;
  modes: DailyVideoModeConfig[];
};

export type DailyVideoResolveResult = {
  serviceDate: string;
  video: DailyVideoPayload | null;
  transient: DailyVideoPayload | null;
  pending: boolean;
  retryAfterMs?: number;
};

export type AdminDailyVideoPreviewResult = {
  serviceDate: string;
  previews: {
    adult: DailyVideoEntry | null;
    kids: DailyVideoEntry | null;
  };
};

type DailyVideoDependencies = {
  beginTransaction: typeof beginTransaction;
  commitWrites: typeof commitWrites;
  deleteWrite: typeof deleteWrite;
  getDocument: typeof getDocument;
  rollbackTransaction: typeof rollbackTransaction;
  updateWrite: typeof updateWrite;
  fetcher: typeof fetch;
  getEnv: (name: string) => string | undefined;
  now: () => Date;
  youtubeDeadlineMs: number;
};

const DEFAULT_DEPENDENCIES: DailyVideoDependencies = {
  beginTransaction,
  commitWrites,
  deleteWrite,
  getDocument,
  rollbackTransaction,
  updateWrite,
  fetcher: fetch,
  getEnv: (name) => Deno.env.get(name),
  now: () => new Date(),
  youtubeDeadlineMs: 60_000,
};

const MAX_PLAYLIST_PAGES = 5;
const MAX_YOUTUBE_DEADLINE_MS = Math.max(1, DAILY_VIDEO_LEASE_MS - 30_000);
const PLAYLIST_ID_PATTERN = /^[A-Za-z0-9_-]{1,200}$/;
const VIDEO_ID_PATTERN = /^[A-Za-z0-9_-]{11}$/;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value);

const timestampMs = (value: unknown): number => {
  if (value instanceof Date) {
    const parsed = value.getTime();
    return Number.isFinite(parsed) ? parsed : 0;
  }
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  if (typeof value === "string") {
    const parsed = Date.parse(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
};

const normalizeAttemptCount = (value: unknown): number => {
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(parsed)) return 0;
  return Math.min(Number.MAX_SAFE_INTEGER, Math.max(0, Math.floor(parsed)));
};

const normalizedPlaylistId = (value: unknown): string => {
  if (typeof value !== "string") return "";
  const normalized = value.trim();
  return PLAYLIST_ID_PATTERN.test(normalized) ? normalized : "";
};

const normalizeConfig = (
  document: FirestoreDocument<VideoAutoConfigDocument> | null,
): NormalizedVideoConfig => {
  const data = document?.data || {};
  const enabled = data.enabled === true;
  const adultPlaylistId = normalizedPlaylistId(data.adultPlaylistId);
  const kidsPlaylistId = normalizedPlaylistId(data.kidsPlaylistId);
  const modes: DailyVideoModeConfig[] = [];
  const configuredModes = getConfiguredDailyVideoModes(data);
  if (configuredModes.includes("adult")) {
    modes.push({ mode: "adult", playlistId: adultPlaylistId });
  }
  if (configuredModes.includes("kids")) {
    modes.push({ mode: "kids", playlistId: kidsPlaylistId });
  }
  return {
    enabled,
    apiKey: typeof data.apiKey === "string" ? data.apiKey.trim() : "",
    modes,
  };
};

const configSignature = (config: NormalizedVideoConfig): string =>
  JSON.stringify({
    enabled: config.enabled,
    modes: config.modes,
  });

const publicPayload = (value: unknown): DailyVideoPayload | null => {
  const payload = sanitizeDailyVideoPayload(value);
  if (!payload) return null;
  return payload.adult || payload.kids ? payload : null;
};

const safeAutoPayload = (value: unknown): DailyVideoPayload | null =>
  publicPayload(getSafeDailyVideoBase(value));

const storedPayload = (value: unknown): DailyVideoPayload | null =>
  isRecord(value) && value.autoFilled === true
    ? safeAutoPayload(value)
    : publicPayload(value);

const refreshTargetsForPayload = (
  payload: DailyVideoPayload | null,
): DailyVideoRefreshTarget[] => {
  if (!payload) return [];
  const targets: DailyVideoRefreshTarget[] = [];
  for (const mode of ["adult", "kids"] as const) {
    if (!payload[mode]?.url) continue;
    targets.push({ mode, videoId: extractYouTubeVideoId(payload[mode]?.url) });
  }
  return targets;
};

const inspectRefreshLease = (
  job: DailyVideoJobDocument | null | undefined,
  nowMs: number,
): { canAcquire: boolean; retryAfterMs: number } => {
  const leaseRemaining = Math.max(
    0,
    Math.ceil(timestampMs(job?.leaseExpiresAt) - nowMs),
  );
  const retryRemaining = Math.max(
    0,
    Math.ceil(timestampMs(job?.refreshNextRetryAt) - nowMs),
  );
  if (leaseRemaining > 0) {
    return {
      canAcquire: false,
      retryAfterMs: Math.max(leaseRemaining, retryRemaining),
    };
  }
  if (retryRemaining > 0) {
    return { canAcquire: false, retryAfterMs: retryRemaining };
  }
  return { canAcquire: true, retryAfterMs: 0 };
};

const isFirestoreContention = (error: unknown): boolean =>
  error instanceof PlatformError &&
  error.code === "FIRESTORE_WRITE_FAILED" &&
  error.details?.status === 409;

const rollbackQuietly = async (
  dependencies: DailyVideoDependencies,
  service: ServiceAccess,
  transaction: string,
) => {
  await dependencies.rollbackTransaction(
    service.token,
    service.projectId,
    transaction,
  ).catch(() => {});
};

const retryAfterForJob = (
  job: DailyVideoJobDocument | null,
  nowMs: number,
  fallback = 60_000,
): number =>
  Math.max(
    1_000,
    inspectDailyVideoLease(job, nowMs).retryAfterMs || fallback,
  );

const readJson = async (
  response: Response,
): Promise<Record<string, unknown>> => {
  if (!response.ok) throw new Error("YOUTUBE_REQUEST_FAILED");
  const body = await response.json();
  if (!isRecord(body)) throw new Error("YOUTUBE_RESPONSE_INVALID");
  return body;
};

const fetchPlaylistCandidates = async (
  playlistId: string,
  apiKey: string,
  fetcher: typeof fetch,
  signal?: AbortSignal,
): Promise<unknown[]> => {
  const candidates: unknown[] = [];
  let pageToken = "";
  for (let page = 0; page < MAX_PLAYLIST_PAGES; page += 1) {
    const url = new URL("https://www.googleapis.com/youtube/v3/playlistItems");
    url.searchParams.set("part", "snippet,contentDetails");
    url.searchParams.set("playlistId", playlistId);
    url.searchParams.set("maxResults", "50");
    url.searchParams.set("key", apiKey);
    if (pageToken) url.searchParams.set("pageToken", pageToken);
    const body = await readJson(await fetcher(url, { signal }));
    if (Array.isArray(body.items)) candidates.push(...body.items);
    pageToken = typeof body.nextPageToken === "string"
      ? body.nextPageToken
      : "";
    if (!pageToken) break;
  }
  return candidates;
};

export const fetchDailyVideoEntry = async ({
  playlistId,
  apiKey,
  serviceDate,
  nowMs,
  fetcher = fetch,
  signal,
}: {
  playlistId: string;
  apiKey: string;
  serviceDate: string;
  nowMs: number;
  fetcher?: typeof fetch;
  signal?: AbortSignal;
}): Promise<DailyVideoEntry | null> => {
  if (!PLAYLIST_ID_PATTERN.test(playlistId)) return null;
  const candidates = await fetchPlaylistCandidates(
    playlistId,
    apiKey,
    fetcher,
    signal,
  );
  const selection = selectDailyVideoCandidate(candidates, {
    targetDateKey: serviceDate,
    now: nowMs,
    matchesDate: titleMatchesDate,
  });
  if (!selection.candidate) return null;
  const item = selection.candidate.it;
  const rawVideoId = item.contentDetails?.videoId ||
    item.snippet?.resourceId?.videoId;
  const videoId = typeof rawVideoId === "string" ? rawVideoId.trim() : "";
  if (!VIDEO_ID_PATTERN.test(videoId)) return null;

  const url = new URL("https://www.googleapis.com/youtube/v3/videos");
  url.searchParams.set("part", "snippet");
  url.searchParams.set("id", videoId);
  url.searchParams.set("key", apiKey);
  const videoBody = await readJson(await fetcher(url, { signal }));
  const first = Array.isArray(videoBody.items) ? videoBody.items[0] : null;
  if (
    !isRecord(first) || first.id !== videoId || !isRecord(first.snippet)
  ) return null;
  const snippet = first.snippet;
  if (typeof snippet.title !== "string") return null;
  const resolvedTitle = snippet.title;
  // playlistItems 선택 뒤 제목이 수정됐을 수 있으므로 실제 videos 응답도
  // 같은 기준일과 일치할 때만 matchedDate=true로 저장한다.
  if (!titleMatchesDate(resolvedTitle, serviceDate)) return null;
  const entry = sanitizeDailyVideoEntry({
    url: `https://youtu.be/${videoId}`,
    chapters: parseAndMapChapters(
      typeof snippet.description === "string" ? snippet.description : "",
    ),
    title: resolvedTitle,
    publishedAt: selection.candidate.publishedAt || snippet.publishedAt,
    matchedDate: true,
  });
  return entry;
};

const fetchMissingVideoEntries = async (
  modes: DailyVideoModeConfig[],
  apiKey: string,
  serviceDate: string,
  dependencies: DailyVideoDependencies,
): Promise<Array<readonly [DailyVideoMode, DailyVideoEntry | null]>> => {
  const controller = new AbortController();
  const completed = new Map<DailyVideoMode, DailyVideoEntry | null>();
  const work = Promise.all(modes.map(async (modeConfig) => {
    let entry: DailyVideoEntry | null = null;
    try {
      entry = await fetchDailyVideoEntry({
        playlistId: modeConfig.playlistId,
        apiKey,
        serviceDate,
        nowMs: dependencies.now().getTime(),
        fetcher: dependencies.fetcher,
        signal: controller.signal,
      });
    } catch {
      entry = null;
    }
    completed.set(modeConfig.mode, entry);
  }));
  const deadlineMs = Math.min(
    MAX_YOUTUBE_DEADLINE_MS,
    Math.max(1, dependencies.youtubeDeadlineMs),
  );
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => {
      controller.abort();
      reject(new Error("YOUTUBE_DEADLINE_EXCEEDED"));
    }, deadlineMs);
  });
  try {
    await Promise.race([work, timeout]);
  } catch {
    // 시간 안에 끝난 모드만 transient 후보로 유지한다. abort된 모드는 null이다.
  } finally {
    if (timeoutId !== undefined) clearTimeout(timeoutId);
  }
  return modes.map(({ mode }) => [mode, completed.get(mode) || null] as const);
};

const fetchDailyVideoChapters = async (
  videoId: string,
  apiKey: string,
  fetcher: typeof fetch,
  signal?: AbortSignal,
): Promise<DailyVideoChapter[] | null> => {
  if (!VIDEO_ID_PATTERN.test(videoId)) return null;
  const url = new URL("https://www.googleapis.com/youtube/v3/videos");
  url.searchParams.set("part", "snippet");
  url.searchParams.set("id", videoId);
  url.searchParams.set("key", apiKey);
  const body = await readJson(await fetcher(url, { signal }));
  const first = Array.isArray(body.items) ? body.items[0] : null;
  if (!isRecord(first) || first.id !== videoId || !isRecord(first.snippet)) {
    return null;
  }
  const chapters = parseAndMapChapters(first.snippet.description);
  return chapters.length > 0 ? chapters : null;
};

const fetchRefreshedChapters = async (
  targets: DailyVideoRefreshTarget[],
  apiKey: string,
  dependencies: DailyVideoDependencies,
): Promise<Array<readonly [DailyVideoMode, DailyVideoChapter[] | null]>> => {
  const controller = new AbortController();
  const completed = new Map<DailyVideoMode, DailyVideoChapter[] | null>();
  const work = Promise.all(targets.map(async ({ mode, videoId }) => {
    let chapters: DailyVideoChapter[] | null = null;
    try {
      chapters = videoId
        ? await fetchDailyVideoChapters(
          videoId,
          apiKey,
          dependencies.fetcher,
          controller.signal,
        )
        : null;
    } catch {
      chapters = null;
    }
    completed.set(mode, chapters);
  }));
  const deadlineMs = Math.min(
    MAX_YOUTUBE_DEADLINE_MS,
    Math.max(1, dependencies.youtubeDeadlineMs),
  );
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => {
      controller.abort();
      reject(new Error("YOUTUBE_DEADLINE_EXCEEDED"));
    }, deadlineMs);
  });
  try {
    await Promise.race([work, timeout]);
  } catch {
    // 같은 deadline 안에 성공한 모드만 저장 후보로 유지한다.
  } finally {
    if (timeoutId !== undefined) clearTimeout(timeoutId);
  }
  return targets.map(({ mode }) =>
    [mode, completed.get(mode) || null] as const
  );
};

type AcquireResult =
  | { kind: "return"; result: DailyVideoResolveResult }
  | {
    kind: "acquired";
    config: NormalizedVideoConfig;
    configUpdateTime: string | null;
    base: DailyVideoPayload | null;
    attemptCount: number;
    dailyUpdateTime: string | null;
  }
  | {
    kind: "refresh";
    config: NormalizedVideoConfig;
    configUpdateTime: string | null;
    dailyUpdateTime: string | null;
    video: DailyVideoPayload;
    targets: DailyVideoRefreshTarget[];
    refreshAttemptCount: number;
  };

const acquireLease = async (
  service: ServiceAccess,
  requestId: string,
  serviceDate: string,
  dependencies: DailyVideoDependencies,
): Promise<AcquireResult> => {
  const dailyPath = `dailyVideos/${serviceDate}`;
  const configPath = "settings/videoAutoConfig";
  const jobPath = `dailyVideoJobs/${serviceDate}`;

  for (
    let contentionAttempt = 0;
    contentionAttempt < 3;
    contentionAttempt += 1
  ) {
    const transaction = await dependencies.beginTransaction(
      service.token,
      service.projectId,
    );
    try {
      const [dailyDocument, configDocument, jobDocument] = await Promise.all([
        dependencies.getDocument<Record<string, unknown>>(
          service.token,
          service.projectId,
          dailyPath,
          { transaction },
        ),
        dependencies.getDocument<VideoAutoConfigDocument>(
          service.token,
          service.projectId,
          configPath,
          { transaction },
        ),
        dependencies.getDocument<DailyVideoJobDocument>(
          service.token,
          service.projectId,
          jobPath,
          { transaction },
        ),
      ]);
      const now = dependencies.now();
      const nowMs = now.getTime();
      const config = normalizeConfig(configDocument);
      const configuredModes = config.modes.map(({ mode }) => mode);
      const base = safeAutoPayload(dailyDocument?.data);
      const isManual = Boolean(
        dailyDocument && dailyDocument.data.autoFilled !== true,
      );
      const fillNeeded = !isManual && configuredModes.length > 0 &&
        !getDailyVideoFillState(configuredModes, base).allReady;
      const configUpdateTime = configDocument?.updateTime || null;

      // 빠진 오늘 영상 보충이 stale chapter 갱신보다 항상 우선한다.
      if (fillNeeded) {
        const leaseDecision = buildDailyVideoLease(jobDocument?.data, nowMs);
        if (!leaseDecision.canAcquire || !leaseDecision.lease) {
          await rollbackQuietly(dependencies, service, transaction);
          return {
            kind: "return",
            result: {
              serviceDate,
              video: base,
              transient: null,
              pending: true,
              retryAfterMs: Math.max(1_000, leaseDecision.retryAfterMs),
            },
          };
        }

        await dependencies.commitWrites(
          service.token,
          service.projectId,
          [dependencies.updateWrite(service.projectId, jobPath, {
            leaseExpiresAt: leaseDecision.lease.leaseExpiresAt,
            attemptCount: leaseDecision.lease.attemptCount,
            nextRetryAt: leaseDecision.lease.nextRetryAt,
            leaseOwner: requestId,
            leasePurpose: "fill" satisfies DailyVideoLeasePurpose,
            configUpdateTime,
            updatedAt: now,
          }, {
            exists: Boolean(jobDocument),
            updateMask: [
              "leaseExpiresAt",
              "attemptCount",
              "nextRetryAt",
              "leaseOwner",
              "leasePurpose",
              "configUpdateTime",
              "updatedAt",
            ],
          })],
          { transaction },
        );
        return {
          kind: "acquired",
          config,
          configUpdateTime,
          base,
          attemptCount: leaseDecision.lease.attemptCount,
          dailyUpdateTime: dailyDocument?.updateTime || null,
        };
      }

      const video = storedPayload(dailyDocument?.data);
      const apiKey = dependencies.getEnv("YOUTUBE_API_KEY")?.trim() ||
        config.apiKey;
      const refreshDue = Boolean(
        dailyDocument && video && apiKey &&
          isDailyVideoChaptersRefreshDue(
            dailyDocument.data.chaptersRefreshedAt,
            nowMs,
            dailyDocument.data.updatedAt,
          ),
      );
      const targets = refreshDue ? refreshTargetsForPayload(video) : [];
      const hasRefreshableTarget = targets.some(({ videoId }) => videoId);
      if (!dailyDocument || !video || !hasRefreshableTarget) {
        await rollbackQuietly(dependencies, service, transaction);
        return {
          kind: "return",
          result: {
            serviceDate,
            video,
            transient: null,
            pending: false,
          },
        };
      }

      const leaseDecision = inspectRefreshLease(jobDocument?.data, nowMs);
      if (!leaseDecision.canAcquire) {
        await rollbackQuietly(dependencies, service, transaction);
        return {
          kind: "return",
          result: {
            serviceDate,
            video,
            transient: null,
            pending: true,
            retryAfterMs: Math.max(1_000, leaseDecision.retryAfterMs),
          },
        };
      }

      const refreshAttemptCount = Math.min(
        Number.MAX_SAFE_INTEGER,
        normalizeAttemptCount(jobDocument?.data.refreshAttemptCount) + 1,
      );
      await dependencies.commitWrites(
        service.token,
        service.projectId,
        [dependencies.updateWrite(service.projectId, jobPath, {
          leaseExpiresAt: new Date(nowMs + DAILY_VIDEO_LEASE_MS),
          leaseOwner: requestId,
          leasePurpose: "refresh" satisfies DailyVideoLeasePurpose,
          configUpdateTime,
          refreshAttemptCount,
          refreshNextRetryAt: now,
          updatedAt: now,
        }, {
          exists: Boolean(jobDocument),
          updateMask: [
            "leaseExpiresAt",
            "leaseOwner",
            "leasePurpose",
            "configUpdateTime",
            "refreshAttemptCount",
            "refreshNextRetryAt",
            "updatedAt",
          ],
        })],
        { transaction },
      );
      return {
        kind: "refresh",
        config,
        configUpdateTime,
        dailyUpdateTime: dailyDocument.updateTime || null,
        video,
        targets,
        refreshAttemptCount,
      };
    } catch (error) {
      await rollbackQuietly(dependencies, service, transaction);
      if (isFirestoreContention(error) && contentionAttempt < 2) continue;
      throw error;
    }
  }
  throw new PlatformError("FIRESTORE_WRITE_FAILED");
};

const mergeVideoPayloads = (
  current: DailyVideoPayload | null,
  fetched: DailyVideoPayload,
): DailyVideoPayload => ({
  adult: current?.adult || fetched.adult,
  kids: current?.kids || fetched.kids,
  autoFilled: true,
});

const finalizeLease = async (
  service: ServiceAccess,
  requestId: string,
  serviceDate: string,
  acquired: Extract<AcquireResult, { kind: "acquired" }>,
  fetched: DailyVideoPayload,
  dependencies: DailyVideoDependencies,
): Promise<DailyVideoResolveResult> => {
  const dailyPath = `dailyVideos/${serviceDate}`;
  const configPath = "settings/videoAutoConfig";
  const jobPath = `dailyVideoJobs/${serviceDate}`;

  for (
    let contentionAttempt = 0;
    contentionAttempt < 3;
    contentionAttempt += 1
  ) {
    const transaction = await dependencies.beginTransaction(
      service.token,
      service.projectId,
    );
    try {
      const [dailyDocument, configDocument, jobDocument] = await Promise.all([
        dependencies.getDocument<Record<string, unknown>>(
          service.token,
          service.projectId,
          dailyPath,
          { transaction },
        ),
        dependencies.getDocument<VideoAutoConfigDocument>(
          service.token,
          service.projectId,
          configPath,
          { transaction },
        ),
        dependencies.getDocument<DailyVideoJobDocument>(
          service.token,
          service.projectId,
          jobPath,
          { transaction },
        ),
      ]);
      const now = dependencies.now();
      const nowMs = now.getTime();
      const config = normalizeConfig(configDocument);
      const currentBase = safeAutoPayload(dailyDocument?.data);

      const ownsLease = jobDocument?.data.leaseOwner === requestId &&
        jobDocument.data.leasePurpose === "fill" &&
        jobDocument.data.configUpdateTime === acquired.configUpdateTime &&
        jobDocument.data.attemptCount === acquired.attemptCount;
      const configUnchanged = (configDocument?.updateTime || null) ===
          acquired.configUpdateTime &&
        configSignature(config) === configSignature(acquired.config);
      const dailyUnchanged = (dailyDocument?.updateTime || null) ===
        acquired.dailyUpdateTime;
      if (!ownsLease || !configUnchanged || !dailyUnchanged) {
        await rollbackQuietly(dependencies, service, transaction);
        if (dailyDocument && dailyDocument.data.autoFilled !== true) {
          return {
            serviceDate,
            video: publicPayload(dailyDocument.data),
            transient: null,
            pending: false,
          };
        }
        const configuredModes = config.modes.map(({ mode }) => mode);
        if (
          configuredModes.length === 0 ||
          getDailyVideoFillState(configuredModes, currentBase).allReady
        ) {
          return {
            serviceDate,
            video: currentBase,
            transient: null,
            pending: false,
          };
        }
        return {
          serviceDate,
          video: currentBase,
          transient: null,
          pending: true,
          retryAfterMs: retryAfterForJob(jobDocument?.data || null, nowMs),
        };
      }

      if (dailyDocument && dailyDocument.data.autoFilled !== true) {
        await dependencies.commitWrites(
          service.token,
          service.projectId,
          [dependencies.deleteWrite(service.projectId, jobPath, true)],
          { transaction },
        );
        return {
          serviceDate,
          video: publicPayload(dailyDocument.data),
          transient: null,
          pending: false,
        };
      }

      const configuredModes = config.modes.map(({ mode }) => mode);
      if (configuredModes.length === 0) {
        await dependencies.commitWrites(
          service.token,
          service.projectId,
          [dependencies.deleteWrite(service.projectId, jobPath, true)],
          { transaction },
        );
        return {
          serviceDate,
          video: currentBase,
          transient: null,
          pending: false,
        };
      }

      const combined = mergeVideoPayloads(currentBase, fetched);
      if (getDailyVideoFillState(configuredModes, combined).allReady) {
        const allCurrentEntriesFetched = acquired.base === null;
        const dailyUpdate: Record<string, unknown> = {
          adult: combined.adult,
          kids: combined.kids,
          autoFilled: true,
          updatedAt: now,
        };
        const dailyUpdateMask = ["adult", "kids", "autoFilled", "updatedAt"];
        if (allCurrentEntriesFetched) {
          dailyUpdate.chaptersRefreshedAt = now;
          dailyUpdateMask.push("chaptersRefreshedAt");
        }
        const writes: FirestoreWrite[] = [
          dependencies.updateWrite(service.projectId, dailyPath, dailyUpdate, {
            exists: Boolean(dailyDocument),
            updateMask: dailyUpdateMask,
          }),
          dependencies.deleteWrite(service.projectId, jobPath, true),
        ];
        await dependencies.commitWrites(
          service.token,
          service.projectId,
          writes,
          { transaction },
        );
        return {
          serviceDate,
          video: publicPayload(combined),
          transient: null,
          pending: false,
        };
      }

      const failure = buildDailyVideoFailureState(
        jobDocument?.data.attemptCount ?? acquired.attemptCount,
        nowMs,
      );
      await dependencies.commitWrites(
        service.token,
        service.projectId,
        [dependencies.updateWrite(service.projectId, jobPath, {
          leaseExpiresAt: failure.leaseExpiresAt,
          attemptCount: failure.attemptCount,
          nextRetryAt: failure.nextRetryAt,
          leaseOwner: null,
          leasePurpose: null,
          configUpdateTime: null,
          updatedAt: now,
        }, {
          exists: true,
          updateMask: [
            "leaseExpiresAt",
            "attemptCount",
            "nextRetryAt",
            "leaseOwner",
            "leasePurpose",
            "configUpdateTime",
            "updatedAt",
          ],
        })],
        { transaction },
      );
      return {
        serviceDate,
        video: currentBase,
        transient: publicPayload(combined),
        pending: true,
        retryAfterMs: failure.retryAfterMs,
      };
    } catch (error) {
      await rollbackQuietly(dependencies, service, transaction);
      if (isFirestoreContention(error) && contentionAttempt < 2) continue;
      throw error;
    }
  }
  throw new PlatformError("FIRESTORE_WRITE_FAILED");
};

const mergeRefreshedChapters = (
  current: DailyVideoPayload,
  results: Array<readonly [DailyVideoMode, DailyVideoChapter[] | null]>,
): DailyVideoPayload => {
  const merged: DailyVideoPayload = {
    adult: current.adult ? { ...current.adult } : null,
    kids: current.kids ? { ...current.kids } : null,
    autoFilled: current.autoFilled,
  };
  for (const [mode, chapters] of results) {
    if (chapters && merged[mode]) {
      merged[mode] = { ...merged[mode], chapters };
    }
  }
  return merged;
};

const finalizeRefreshLease = async (
  service: ServiceAccess,
  requestId: string,
  serviceDate: string,
  acquired: Extract<AcquireResult, { kind: "refresh" }>,
  results: Array<readonly [DailyVideoMode, DailyVideoChapter[] | null]>,
  dependencies: DailyVideoDependencies,
): Promise<DailyVideoResolveResult> => {
  const dailyPath = `dailyVideos/${serviceDate}`;
  const configPath = "settings/videoAutoConfig";
  const jobPath = `dailyVideoJobs/${serviceDate}`;

  for (
    let contentionAttempt = 0;
    contentionAttempt < 3;
    contentionAttempt += 1
  ) {
    const transaction = await dependencies.beginTransaction(
      service.token,
      service.projectId,
    );
    try {
      const [dailyDocument, configDocument, jobDocument] = await Promise.all([
        dependencies.getDocument<Record<string, unknown>>(
          service.token,
          service.projectId,
          dailyPath,
          { transaction },
        ),
        dependencies.getDocument<VideoAutoConfigDocument>(
          service.token,
          service.projectId,
          configPath,
          { transaction },
        ),
        dependencies.getDocument<DailyVideoJobDocument>(
          service.token,
          service.projectId,
          jobPath,
          { transaction },
        ),
      ]);
      const now = dependencies.now();
      const nowMs = now.getTime();
      const config = normalizeConfig(configDocument);
      const currentVideo = storedPayload(dailyDocument?.data);
      const ownsLease = jobDocument?.data.leaseOwner === requestId &&
        jobDocument.data.leasePurpose === "refresh" &&
        jobDocument.data.configUpdateTime === acquired.configUpdateTime &&
        jobDocument.data.refreshAttemptCount === acquired.refreshAttemptCount;
      const configUnchanged = (configDocument?.updateTime || null) ===
          acquired.configUpdateTime &&
        configSignature(config) === configSignature(acquired.config);
      const dailyUnchanged = (dailyDocument?.updateTime || null) ===
        acquired.dailyUpdateTime;
      if (!ownsLease || !configUnchanged || !dailyUnchanged || !currentVideo) {
        await rollbackQuietly(dependencies, service, transaction);
        return {
          serviceDate,
          video: currentVideo,
          transient: null,
          pending: false,
        };
      }

      const successfulResults = results.filter(
        (result): result is readonly [DailyVideoMode, DailyVideoChapter[]] =>
          Boolean(result[1]?.length),
      );
      const allSucceeded = successfulResults.length === acquired.targets.length;
      const merged = mergeRefreshedChapters(currentVideo, successfulResults);
      const writes: FirestoreWrite[] = [];
      if (successfulResults.length > 0) {
        const dailyUpdate: Record<string, unknown> = {};
        const dailyUpdateMask: string[] = [];
        for (const [mode, chapters] of successfulResults) {
          dailyUpdate[mode] = { chapters };
          dailyUpdateMask.push(`${mode}.chapters`);
        }
        if (allSucceeded) {
          dailyUpdate.chaptersRefreshedAt = now;
          dailyUpdateMask.push("chaptersRefreshedAt");
        }
        writes.push(dependencies.updateWrite(
          service.projectId,
          dailyPath,
          dailyUpdate,
          { exists: true, updateMask: dailyUpdateMask },
        ));
      }

      if (allSucceeded) {
        writes.push(dependencies.deleteWrite(service.projectId, jobPath, true));
        await dependencies.commitWrites(
          service.token,
          service.projectId,
          writes,
          { transaction },
        );
        return {
          serviceDate,
          video: merged,
          transient: null,
          pending: false,
        };
      }

      const retryAfterMs = getDailyVideoBackoffMs(
        jobDocument.data.refreshAttemptCount ?? acquired.refreshAttemptCount,
      );
      writes.push(dependencies.updateWrite(service.projectId, jobPath, {
        leaseExpiresAt: now,
        leaseOwner: null,
        leasePurpose: null,
        configUpdateTime: null,
        refreshAttemptCount: acquired.refreshAttemptCount,
        refreshNextRetryAt: new Date(nowMs + retryAfterMs),
        updatedAt: now,
      }, {
        exists: true,
        updateMask: [
          "leaseExpiresAt",
          "leaseOwner",
          "leasePurpose",
          "configUpdateTime",
          "refreshAttemptCount",
          "refreshNextRetryAt",
          "updatedAt",
        ],
      }));
      await dependencies.commitWrites(
        service.token,
        service.projectId,
        writes,
        { transaction },
      );
      return {
        serviceDate,
        video: merged,
        transient: null,
        pending: true,
        retryAfterMs,
      };
    } catch (error) {
      await rollbackQuietly(dependencies, service, transaction);
      if (isFirestoreContention(error) && contentionAttempt < 2) continue;
      throw error;
    }
  }
  throw new PlatformError("FIRESTORE_WRITE_FAILED");
};

export const resolveDailyVideo = async (
  service: ServiceAccess,
  requestId: string,
  options: { dependencies?: Partial<DailyVideoDependencies> } = {},
): Promise<DailyVideoResolveResult> => {
  const dependencies = {
    ...DEFAULT_DEPENDENCIES,
    ...(options.dependencies || {}),
  } as DailyVideoDependencies;
  const serviceDate = getServiceDateKst(dependencies.now());
  const acquired = await acquireLease(
    service,
    requestId,
    serviceDate,
    dependencies,
  );
  if (acquired.kind === "return") return acquired.result;

  const apiKey = dependencies.getEnv("YOUTUBE_API_KEY")?.trim() ||
    acquired.config.apiKey;
  if (acquired.kind === "refresh") {
    const results = apiKey
      ? await fetchRefreshedChapters(acquired.targets, apiKey, dependencies)
      : acquired.targets.map(({ mode }) => [mode, null] as const);
    return finalizeRefreshLease(
      service,
      requestId,
      serviceDate,
      acquired,
      results,
      dependencies,
    );
  }

  const fetched: DailyVideoPayload = {
    adult: acquired.base?.adult || null,
    kids: acquired.base?.kids || null,
    autoFilled: true,
  };
  if (apiKey) {
    const missingModes = acquired.config.modes.filter(({ mode }) =>
      !fetched[mode]?.url
    );
    const results = await fetchMissingVideoEntries(
      missingModes,
      apiKey,
      serviceDate,
      dependencies,
    );
    for (const [mode, entry] of results) fetched[mode] = entry;
  }

  return finalizeLease(
    service,
    requestId,
    serviceDate,
    acquired,
    fetched,
    dependencies,
  );
};

export const adminPreviewDailyVideo = async (
  service: ServiceAccess,
  playlistIds: { adultPlaylistId: string; kidsPlaylistId: string },
  options: { dependencies?: Partial<DailyVideoDependencies> } = {},
): Promise<AdminDailyVideoPreviewResult> => {
  const dependencies = {
    ...DEFAULT_DEPENDENCIES,
    ...(options.dependencies || {}),
  } as DailyVideoDependencies;
  const serviceDate = getServiceDateKst(dependencies.now());
  let apiKey = dependencies.getEnv("YOUTUBE_API_KEY")?.trim() || "";
  if (!apiKey) {
    const configDocument = await dependencies.getDocument<
      VideoAutoConfigDocument
    >(
      service.token,
      service.projectId,
      "settings/videoAutoConfig",
    );
    apiKey = normalizeConfig(configDocument).apiKey;
  }
  if (!apiKey) {
    throw new PlatformError("CONFLICT", {
      message: "YouTube API 서버 설정을 확인해 주세요.",
    });
  }

  const modes: DailyVideoModeConfig[] = [{
    mode: "adult",
    playlistId: playlistIds.adultPlaylistId,
  }];
  if (playlistIds.kidsPlaylistId) {
    modes.push({
      mode: "kids",
      playlistId: playlistIds.kidsPlaylistId,
    });
  }
  const previews: AdminDailyVideoPreviewResult["previews"] = {
    adult: null,
    kids: null,
  };
  const results = await fetchMissingVideoEntries(
    modes,
    apiKey,
    serviceDate,
    dependencies,
  );
  for (const [mode, entry] of results) previews[mode] = entry;
  return { serviceDate, previews };
};
