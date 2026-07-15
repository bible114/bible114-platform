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
  type DailyVideoEntry,
  type DailyVideoJob,
  type DailyVideoMode,
  type DailyVideoPayload,
  getConfiguredDailyVideoModes,
  getDailyVideoFillState,
  getSafeDailyVideoBase,
  inspectDailyVideoLease,
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
  configUpdateTime?: unknown;
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

type AcquireResult =
  | { kind: "return"; result: DailyVideoResolveResult }
  | {
    kind: "acquired";
    config: NormalizedVideoConfig;
    configUpdateTime: string | null;
    base: DailyVideoPayload | null;
    attemptCount: number;
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

      if (dailyDocument && dailyDocument.data.autoFilled !== true) {
        await rollbackQuietly(dependencies, service, transaction);
        return {
          kind: "return",
          result: {
            serviceDate,
            video: publicPayload(dailyDocument.data),
            transient: null,
            pending: false,
          },
        };
      }

      const base = safeAutoPayload(dailyDocument?.data);
      if (configuredModes.length === 0) {
        await rollbackQuietly(dependencies, service, transaction);
        return {
          kind: "return",
          result: {
            serviceDate,
            video: base,
            transient: null,
            pending: false,
          },
        };
      }
      if (getDailyVideoFillState(configuredModes, base).allReady) {
        await rollbackQuietly(dependencies, service, transaction);
        return {
          kind: "return",
          result: {
            serviceDate,
            video: base,
            transient: null,
            pending: false,
          },
        };
      }

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

      const configUpdateTime = configDocument?.updateTime || null;
      await dependencies.commitWrites(
        service.token,
        service.projectId,
        [dependencies.updateWrite(service.projectId, jobPath, {
          leaseExpiresAt: leaseDecision.lease.leaseExpiresAt,
          attemptCount: leaseDecision.lease.attemptCount,
          nextRetryAt: leaseDecision.lease.nextRetryAt,
          leaseOwner: requestId,
          configUpdateTime,
          updatedAt: now,
        }, { exists: Boolean(jobDocument) })],
        { transaction },
      );
      return {
        kind: "acquired",
        config,
        configUpdateTime,
        base,
        attemptCount: leaseDecision.lease.attemptCount,
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
        jobDocument.data.configUpdateTime === acquired.configUpdateTime &&
        jobDocument.data.attemptCount === acquired.attemptCount;
      const configUnchanged = (configDocument?.updateTime || null) ===
          acquired.configUpdateTime &&
        configSignature(config) === configSignature(acquired.config);
      if (!ownsLease || !configUnchanged) {
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
        const writes: FirestoreWrite[] = [
          dependencies.updateWrite(service.projectId, dailyPath, {
            adult: combined.adult,
            kids: combined.kids,
            autoFilled: true,
            updatedAt: now,
          }, { exists: Boolean(dailyDocument) }),
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
          configUpdateTime: null,
          updatedAt: now,
        }, { exists: true })],
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
