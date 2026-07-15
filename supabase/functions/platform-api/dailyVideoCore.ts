export const DAILY_VIDEO_LEASE_MS = 90 * 1000;
export const DAILY_VIDEO_RETRY_DELAYS_MS = [2, 5, 15, 30].map(
  (minutes) => minutes * 60 * 1000,
) as readonly number[];
export const DAILY_VIDEO_RETRY_IDLE_MS = 60 * 60 * 1000;
export const DAILY_VIDEO_CHAPTERS_TTL_MS = 45 * 60 * 1000;

export type DailyVideoMode = "adult" | "kids";
export type DailyVideoChapterLabel = "해설" | "성경읽기" | "기도";
export type DailyVideoChapter = {
  label: DailyVideoChapterLabel;
  sec: number;
};
export type DailyVideoEntry = {
  url: string;
  chapters: DailyVideoChapter[];
  title?: string;
  publishedAt?: string;
  matchedDate?: boolean;
};
export type DailyVideoPayload = {
  adult: DailyVideoEntry | null;
  kids: DailyVideoEntry | null;
  autoFilled: boolean;
};
export type DailyVideoConfig = {
  enabled?: unknown;
  adultPlaylistId?: unknown;
  kidsPlaylistId?: unknown;
};
export type DailyVideoJob = {
  leaseExpiresAt?: unknown;
  attemptCount?: unknown;
  nextRetryAt?: unknown;
};

export type DailyVideoCandidateItem = {
  contentDetails?: {
    videoPublishedAt?: unknown;
    videoId?: unknown;
  };
  snippet?: {
    publishedAt?: unknown;
    title?: unknown;
    resourceId?: { videoId?: unknown };
  };
  [key: string]: unknown;
};

export type DailyVideoCandidate = {
  it: DailyVideoCandidateItem;
  publishedAt: unknown;
  title: unknown;
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value);

const isValidMonthDay = (year: number, month: number, day: number) => {
  if (!Number.isInteger(month) || !Number.isInteger(day)) return false;
  if (month < 1 || month > 12 || day < 1) return false;
  return day <= new Date(year, month, 0).getDate();
};

// 숫자 축약 날짜는 성경 장절과 모양이 같으므로 제목 머리말에서만 허용한다.
const hasDateLikePrefix = (text: string, matchIndex: number) => {
  const prefix = text.slice(0, matchIndex).trim();
  return /^[\[({<【〔#|·\-–—]*$/.test(prefix);
};

// src/utils/dailyVideoPolicy.js와 동일한 제목 날짜 계약이다.
export const titleMatchesDate = (title: unknown, dateKey: unknown): boolean => {
  if (!title || !dateKey) return false;
  const target = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(dateKey));
  if (!target) return false;
  const targetYear = Number(target[1]);
  const targetMonth = Number(target[2]);
  const targetDay = Number(target[3]);
  const text = String(title);

  const matchesTarget = (month: number, day: number) =>
    isValidMonthDay(targetYear, month, day) &&
    month === targetMonth && day === targetDay;

  for (const match of text.matchAll(/(\d{1,2})\s*월\s*(\d{1,2})\s*일/g)) {
    if (matchesTarget(Number(match[1]), Number(match[2]))) return true;
  }
  for (const match of text.matchAll(/(?<!\d)(20\d{2})(\d{2})(\d{2})(?!\d)/g)) {
    if (
      Number(match[1]) === targetYear &&
      matchesTarget(Number(match[2]), Number(match[3]))
    ) return true;
  }

  const abbreviatedPatterns = [
    /(?<!\d)(\d{1,2})\s*\/\s*(\d{1,2})(?!\d)/g,
    /(?<!\d)(\d{1,2})\s*\.\s*(\d{1,2})(?!\d)/g,
    /(?<!\d)(\d{2})(\d{2})(?!\d)/g,
  ];
  for (const pattern of abbreviatedPatterns) {
    for (const match of text.matchAll(pattern)) {
      if (
        hasDateLikePrefix(text, match.index) &&
        matchesTarget(Number(match[1]), Number(match[2]))
      ) return true;
    }
  }
  return false;
};

const modeUrl = (payload: unknown, key: string): unknown => {
  if (payload === null || payload === undefined) return undefined;
  const entry = (payload as Record<string, unknown>)[key];
  return isRecord(entry) ? entry.url : undefined;
};

// URL의 형식이 아니라 브라우저의 기존 truthy 계약을 그대로 비교한다.
export const getDailyVideoFillState = (
  configuredModeKeys: unknown,
  payload: unknown,
) => {
  const modeKeys = Array.isArray(configuredModeKeys)
    ? configuredModeKeys as string[]
    : [];
  const missingModes = modeKeys.filter((key) => !modeUrl(payload, key));
  return {
    hasAny: modeKeys.some((key) => Boolean(modeUrl(payload, key))),
    allReady: modeKeys.length > 0 && missingModes.length === 0,
    missingModes,
  };
};

const candidateTime = (value: unknown): number =>
  new Date(value as string | number | Date).getTime();

// src/utils/dailyVideoPolicy.js와 동일하게 실제 영상 게시 시각을 우선한다.
export const selectDailyVideoCandidate = (
  items: unknown,
  {
    targetDateKey = "",
    now = Date.now(),
    matchesDate = () => false,
  }: {
    targetDateKey?: string;
    now?: number;
    matchesDate?: (title: unknown, dateKey: string) => boolean;
  } = {},
) => {
  const candidates = (Array.isArray(items) ? items : [])
    .map((item) => {
      const it = (isRecord(item) ? item : {}) as DailyVideoCandidateItem;
      return {
        it,
        publishedAt: it.contentDetails?.videoPublishedAt ||
          it.snippet?.publishedAt || null,
        title: it.snippet?.title || "",
      } satisfies DailyVideoCandidate;
    })
    .filter(({ publishedAt }) =>
      Boolean(publishedAt) && candidateTime(publishedAt) <= now
    )
    .sort((left, right) =>
      candidateTime(right.publishedAt) - candidateTime(left.publishedAt)
    );

  const chosenCandidate = targetDateKey
    ? candidates.find((candidate) =>
      matchesDate(candidate.title, targetDateKey)
    )
    : candidates[0];

  return {
    candidate: chosenCandidate || null,
    matchedDate: Boolean(targetDateKey && chosenCandidate),
    pending: Boolean(targetDateKey && !chosenCandidate),
    stale: Boolean(
      targetDateKey && !chosenCandidate && candidates.length > 0,
    ),
  };
};

const LEADING_TIMESTAMP_RE = /^\s*(?:(\d{1,2}):)?(\d{1,2}):(\d{2})\b/;
const ANY_TIMESTAMP_RE = /(\d{1,2}:)?(\d{1,2}):(\d{2})/;

const toSec = (match: RegExpMatchArray) =>
  (match[1] ? parseInt(match[1]) * 3600 : 0) +
  parseInt(match[2]) * 60 + parseInt(match[3]);
const cleanLabel = (line: string, matchText: string) =>
  line.replace(matchText, "").trim().replace(
    /^[-–|·:]+|[-–|·:]+$/g,
    "",
  ).trim();

// 설명 전체에 선두 timestamp가 하나라도 있으면 라벨-먼저 폴백은 사용하지 않는다.
export const parseChapters = (
  desc: unknown,
): Array<{ label: string; sec: number }> => {
  const lines = ((desc || "") as string).split("\n");
  const leading: Array<{ label: string; sec: number }> = [];
  for (const line of lines) {
    const match = line.match(LEADING_TIMESTAMP_RE);
    if (!match) continue;
    const label = cleanLabel(line, match[0]);
    if (label) leading.push({ label, sec: toSec(match) });
  }
  if (leading.length > 0) return leading;

  const output: Array<{ label: string; sec: number }> = [];
  for (const line of lines) {
    const match = line.match(ANY_TIMESTAMP_RE);
    if (!match) continue;
    const label = cleanLabel(line, match[0]);
    if (label) output.push({ label, sec: toSec(match) });
  }
  return output;
};

export const mapToStandardLabel = (
  label: string,
): DailyVideoChapterLabel | null => {
  if (label.includes("해설") || label.includes("묵상")) return "해설";
  if (label.includes("성경") || label.includes("읽기")) return "성경읽기";
  if (label.includes("기도")) return "기도";
  return null;
};

export const parseAndMapChapters = (desc: unknown): DailyVideoChapter[] => {
  const parsed = parseChapters(desc);
  const mapped: DailyVideoChapter[] = [];
  for (const { label, sec } of parsed) {
    const standard = mapToStandardLabel(label);
    if (standard && !mapped.find((item) => item.label === standard)) {
      mapped.push({ label: standard, sec });
    }
  }
  return mapped;
};

export const getConfiguredDailyVideoModes = (
  config: unknown,
): DailyVideoMode[] => {
  if (!isRecord(config) || config.enabled !== true) return [];
  const modes: DailyVideoMode[] = [];
  if (
    typeof config.adultPlaylistId === "string" &&
    config.adultPlaylistId.trim()
  ) modes.push("adult");
  if (
    typeof config.kidsPlaylistId === "string" && config.kidsPlaylistId.trim()
  ) modes.push("kids");
  return modes;
};

const ALLOWED_YOUTUBE_HOSTS = new Set([
  "youtube.com",
  "www.youtube.com",
  "youtu.be",
  "www.youtu.be",
]);
const YOUTUBE_VIDEO_ID_PATTERN = /^[A-Za-z0-9_-]{11}$/;

const parseStrictYouTubeUrl = (value: unknown): URL | null => {
  if (typeof value !== "string" || !value.trim()) return null;
  const normalized = value.trim();
  // URL.port는 명시적인 기본 :443을 빈 값으로 정규화하므로 raw authority도 검사한다.
  const authority = /^https:\/\/([^/?#]+)(?:[/?#]|$)/i.exec(normalized)?.[1];
  if (!authority || !ALLOWED_YOUTUBE_HOSTS.has(authority.toLowerCase())) {
    return null;
  }
  try {
    const parsed = new URL(normalized);
    if (
      parsed.protocol !== "https:" || parsed.username || parsed.password ||
      parsed.port || !ALLOWED_YOUTUBE_HOSTS.has(parsed.hostname)
    ) return null;
    return parsed;
  } catch {
    return null;
  }
};

export const extractYouTubeVideoId = (value: unknown): string | null => {
  const parsed = parseStrictYouTubeUrl(value);
  if (!parsed) return null;
  if (parsed.hostname === "youtu.be" || parsed.hostname === "www.youtu.be") {
    const match = /^\/([A-Za-z0-9_-]{11})\/?$/.exec(parsed.pathname);
    return match?.[1] || null;
  }

  if (/^\/watch\/?$/.test(parsed.pathname)) {
    const ids = parsed.searchParams.getAll("v");
    return ids.length === 1 && YOUTUBE_VIDEO_ID_PATTERN.test(ids[0])
      ? ids[0]
      : null;
  }
  const pathMatch = /^\/(?:live|shorts|embed)\/([A-Za-z0-9_-]{11})\/?$/
    .exec(parsed.pathname);
  return pathMatch?.[1] || null;
};

export const sanitizeYouTubeHttpsUrl = (value: unknown): string | null => {
  const parsed = parseStrictYouTubeUrl(value);
  return parsed?.toString() || null;
};

const sanitizeStoredChapters = (value: unknown): DailyVideoChapter[] => {
  if (!Array.isArray(value)) return [];
  const chapters: DailyVideoChapter[] = [];
  for (const item of value) {
    if (!isRecord(item)) continue;
    const label = typeof item.label === "string"
      ? mapToStandardLabel(item.label) === item.label
        ? item.label as DailyVideoChapterLabel
        : null
      : null;
    if (
      !label || typeof item.sec !== "number" ||
      !Number.isSafeInteger(item.sec) || item.sec < 0 ||
      chapters.some((chapter) => chapter.label === label)
    ) continue;
    chapters.push({ label, sec: item.sec });
  }
  return chapters;
};

export const sanitizeDailyVideoEntry = (
  value: unknown,
): DailyVideoEntry | null => {
  if (!isRecord(value)) return null;
  const url = sanitizeYouTubeHttpsUrl(value.url);
  if (!url) return null;
  const entry: DailyVideoEntry = {
    url,
    chapters: sanitizeStoredChapters(value.chapters),
  };
  if (typeof value.title === "string") entry.title = value.title;
  if (
    typeof value.publishedAt === "string" &&
    Number.isFinite(Date.parse(value.publishedAt))
  ) entry.publishedAt = value.publishedAt;
  if (typeof value.matchedDate === "boolean") {
    entry.matchedDate = value.matchedDate;
  }
  return entry;
};

export const sanitizeDailyVideoPayload = (
  value: unknown,
): DailyVideoPayload | null => {
  if (!isRecord(value)) return null;
  return {
    adult: sanitizeDailyVideoEntry(value.adult),
    kids: sanitizeDailyVideoEntry(value.kids),
    autoFilled: value.autoFilled === true,
  };
};

// 수동 문서는 자동 보충의 base가 아니다. 자동 문서도 오늘 날짜가 검증된 항목만 유지한다.
export const getSafeDailyVideoBase = (
  value: unknown,
): DailyVideoPayload | null => {
  if (!isRecord(value) || value.autoFilled !== true) return null;
  const payload = sanitizeDailyVideoPayload(value);
  if (!payload) return null;
  return {
    adult: payload.adult?.matchedDate === true ? payload.adult : null,
    kids: payload.kids?.matchedDate === true ? payload.kids : null,
    autoFilled: true,
  };
};

const normalizeAttemptCount = (value: unknown): number => {
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(parsed)) return 0;
  return Math.min(Number.MAX_SAFE_INTEGER, Math.max(0, Math.floor(parsed)));
};

const requireNowMs = (value: number): number => {
  if (!Number.isFinite(value)) throw new TypeError("INVALID_NOW");
  return value;
};

const validTimestampMs = (value: unknown): number | null => {
  if (value instanceof Date) {
    return Number.isFinite(value.getTime()) ? value.getTime() : null;
  }
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "string") {
    const parsed = Date.parse(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
};

const timestampMs = (value: unknown): number => validTimestampMs(value) ?? 0;

export const isDailyVideoChaptersRefreshDue = (
  chaptersRefreshedAt: unknown,
  nowMs: number,
  documentUpdatedAt?: unknown,
): boolean => {
  const now = requireNowMs(nowMs);
  const refreshedAt = validTimestampMs(chaptersRefreshedAt);
  if (refreshedAt === null) return true;
  if (refreshedAt > now) return false;
  const updatedAt = validTimestampMs(documentUpdatedAt);
  // 수동 저장은 merge:true라 과거 TTL이 남을 수 있다. 문서가 그 뒤 수정됐으면 즉시 재조회한다.
  // 단, 미래 updatedAt은 신뢰하지 않아 성공 직후에도 계속 due가 되는 쿼터 우회를 막는다.
  if (updatedAt !== null && updatedAt <= now && updatedAt > refreshedAt) {
    return true;
  }
  return now - refreshedAt >= DAILY_VIDEO_CHAPTERS_TTL_MS;
};

// attempt 1~4는 2/5/15/30분, 그 뒤는 시간당 한 번이다.
export const getDailyVideoBackoffMs = (attemptCount: unknown): number => {
  const attempt = Math.max(1, normalizeAttemptCount(attemptCount));
  return DAILY_VIDEO_RETRY_DELAYS_MS[attempt - 1] ??
    DAILY_VIDEO_RETRY_IDLE_MS;
};

export type DailyVideoLeaseDecision = {
  canAcquire: boolean;
  reason: "ready" | "leaseActive" | "backoff";
  retryAfterMs: number;
};

export const inspectDailyVideoLease = (
  job: DailyVideoJob | null | undefined,
  nowMs: number,
): DailyVideoLeaseDecision => {
  const now = requireNowMs(nowMs);
  const leaseRemaining = Math.max(
    0,
    Math.ceil(timestampMs(job?.leaseExpiresAt) - now),
  );
  const retryRemaining = Math.max(
    0,
    Math.ceil(timestampMs(job?.nextRetryAt) - now),
  );
  if (leaseRemaining > 0) {
    return {
      canAcquire: false,
      reason: "leaseActive",
      retryAfterMs: Math.max(leaseRemaining, retryRemaining),
    };
  }
  if (retryRemaining > 0) {
    return {
      canAcquire: false,
      reason: "backoff",
      retryAfterMs: retryRemaining,
    };
  }
  return { canAcquire: true, reason: "ready", retryAfterMs: 0 };
};

export type DailyVideoLeaseState = {
  leaseExpiresAt: Date;
  attemptCount: number;
  nextRetryAt: Date;
};

export const buildDailyVideoLease = (
  job: DailyVideoJob | null | undefined,
  nowMs: number,
): DailyVideoLeaseDecision & { lease: DailyVideoLeaseState | null } => {
  const now = requireNowMs(nowMs);
  const decision = inspectDailyVideoLease(job, now);
  if (!decision.canAcquire) return { ...decision, lease: null };
  const attemptCount = Math.min(
    Number.MAX_SAFE_INTEGER,
    normalizeAttemptCount(job?.attemptCount) + 1,
  );
  return {
    ...decision,
    lease: {
      leaseExpiresAt: new Date(now + DAILY_VIDEO_LEASE_MS),
      attemptCount,
      nextRetryAt: new Date(now),
    },
  };
};

export const buildDailyVideoFailureState = (
  attemptCount: unknown,
  nowMs: number,
): DailyVideoLeaseState & { retryAfterMs: number } => {
  const now = requireNowMs(nowMs);
  const normalizedAttempt = Math.max(1, normalizeAttemptCount(attemptCount));
  const retryAfterMs = getDailyVideoBackoffMs(normalizedAttempt);
  return {
    leaseExpiresAt: new Date(now),
    attemptCount: normalizedAttempt,
    nextRetryAt: new Date(now + retryAfterMs),
    retryAfterMs,
  };
};
