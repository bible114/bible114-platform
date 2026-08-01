const MAX_TEXT = 120;
export const COMMUNITY_PROGRESS_SCHEMA_VERSION = 2;
export const COMMUNITY_PROGRESS_SHARD_COUNT = 8;
const COMMUNITY_PROGRESS_PLAN_IDS = new Set([
  "1year_sequential",
  "1year_revised",
  "1year_new",
  "nt_new",
  "readable_revised",
  "readable_new",
]);

type UnknownRecord = Record<string, unknown>;

export type CommunityProgressMember = {
  uid: string;
  name: string;
  planId: string;
  fixtureType: "reading-badge-test" | null;
  currentDay: number;
  readCount: number;
  readingYear: number | null;
  yearCompletedRounds: number | null;
  lifetimeCompletedRounds: number | null;
  score: number;
  streak: number;
  lastReadDate: string | null;
  recentReadDates: string[];
  weeklyReadKey: string | null;
  weeklyReadCount: number;
  departmentId: string | null;
  departmentName: string | null;
  subgroupId: string | null;
  subgroupName: string | null;
  extraMemberships: Array<{
    departmentId: string;
    departmentName: string | null;
    subgroupId: string | null;
    subgroupName: string | null;
  }>;
};

export type CommunityProgressIdentity = Pick<
  CommunityProgressMember,
  "planId" | "fixtureType"
>;

const text = (value: unknown, fallback = "") => {
  if (typeof value !== "string") return fallback;
  const normalized = value.trim();
  return normalized && normalized.length <= MAX_TEXT &&
      !/[\u0000-\u001f\u007f]/.test(normalized)
    ? normalized
    : fallback;
};

const optionalText = (value: unknown) => text(value) || null;
const nonNegative = (value: unknown, fallback = 0) =>
  Number.isSafeInteger(value) && Number(value) >= 0 ? Number(value) : fallback;

export const projectCommunityProgressIdentity = (
  value: UnknownRecord,
): CommunityProgressIdentity => ({
  planId: typeof value.planId === "string" &&
      COMMUNITY_PROGRESS_PLAN_IDS.has(value.planId)
    ? value.planId
    : "1year_revised",
  fixtureType: value.fixtureType === "reading-badge-test"
    ? "reading-badge-test"
    : null,
});

const memberships = (
  value: unknown,
): CommunityProgressMember["extraMemberships"] => {
  if (!Array.isArray(value)) return [];
  return value.slice(0, 3).flatMap((entry) => {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) return [];
    const row = entry as UnknownRecord;
    const departmentId = text(row.departmentId);
    if (!departmentId) return [];
    return [{
      departmentId,
      departmentName: optionalText(row.departmentName),
      subgroupId: optionalText(row.subgroupId),
      subgroupName: optionalText(row.subgroupName),
    }];
  });
};

export const projectCommunityProgressMember = (
  uid: string,
  value: UnknownRecord,
): CommunityProgressMember | null => {
  const normalizedUid = text(uid);
  if (!normalizedUid || value.isDeleted === true) return null;
  const identity = projectCommunityProgressIdentity(value);
  const totalDays = identity.planId === "readable_revised" ||
      identity.planId === "readable_new"
    ? 60
    : 365;
  const storedDay = Math.max(1, nonNegative(value.currentDay, 1));
  return {
    uid: normalizedUid,
    name: text(value.name, "이름 없음"),
    ...identity,
    currentDay: ((storedDay - 1) % totalDays) + 1,
    readCount: Math.max(1, nonNegative(value.readCount, 1)),
    readingYear: Number.isSafeInteger(value.readingYear) &&
        Number(value.readingYear) >= 2000
      ? Number(value.readingYear)
      : null,
    yearCompletedRounds: Number.isSafeInteger(value.yearCompletedRounds)
      ? Math.max(0, Number(value.yearCompletedRounds))
      : null,
    lifetimeCompletedRounds: Number.isSafeInteger(value.lifetimeCompletedRounds)
      ? Math.max(0, Number(value.lifetimeCompletedRounds))
      : null,
    score: nonNegative(value.score),
    streak: nonNegative(value.streak),
    lastReadDate: optionalText(value.lastReadDate),
    recentReadDates: Array.isArray(value.recentReadDates)
      ? value.recentReadDates.flatMap((date) => {
        const normalized = optionalText(date);
        return normalized ? [normalized] : [];
      }).slice(-14)
      : [],
    weeklyReadKey: optionalText(value.weeklyReadKey),
    weeklyReadCount: nonNegative(value.weeklyReadCount),
    departmentId: optionalText(value.departmentId ?? value.communityId),
    departmentName: optionalText(value.departmentName ?? value.communityName),
    subgroupId: optionalText(
      typeof value.subgroupId === "object" && value.subgroupId !== null
        ? (value.subgroupId as UnknownRecord).name
        : value.subgroupId,
    ),
    subgroupName: optionalText(value.subgroupName),
    extraMemberships: memberships(value.extraMemberships),
  };
};

/**
 * Roster documents carry the member's community placement and mirrored reading
 * progress, while the root user document is authoritative for plan/fixture
 * identity and active state.
 */
export const projectRosterCommunityProgressMember = (
  uid: string,
  roster: UnknownRecord,
  sourceUser: UnknownRecord | null,
): CommunityProgressMember | null => {
  if (!sourceUser || sourceUser.isDeleted === true) return null;
  return projectCommunityProgressMember(uid, {
    ...roster,
    planId: sourceUser.planId,
    fixtureType: sourceUser.fixtureType,
  });
};

export const legacyCommunityProgressMember = (
  member: CommunityProgressMember,
): Omit<CommunityProgressMember, "planId" | "fixtureType"> => {
  const { planId: _planId, fixtureType: _fixtureType, ...legacy } = member;
  return legacy;
};

export const mergeCommunityProgressMembers = (
  primary: CommunityProgressMember[],
  roster: CommunityProgressMember[],
) => {
  const merged = new Map<string, CommunityProgressMember>();
  for (const member of primary) {
    if (!merged.has(member.uid)) merged.set(member.uid, member);
  }
  for (const member of roster) {
    if (!merged.has(member.uid)) merged.set(member.uid, member);
  }
  return [...merged.values()];
};

export const communityProgressShard = (
  uid: string,
  shardCount = COMMUNITY_PROGRESS_SHARD_COUNT,
) => {
  let hash = 2166136261;
  for (let index = 0; index < uid.length; index += 1) {
    hash ^= uid.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0) % shardCount;
};

export const splitCommunityProgressMembers = (
  members: CommunityProgressMember[],
  shardCount = COMMUNITY_PROGRESS_SHARD_COUNT,
) => {
  const shards = Array.from(
    { length: shardCount },
    () => [] as CommunityProgressMember[],
  );
  for (const member of members) {
    shards[communityProgressShard(member.uid, shardCount)].push(member);
  }
  for (const shard of shards) shard.sort((a, b) => a.uid.localeCompare(b.uid));
  return shards;
};

const LEGACY_DATE =
  /^(Sun|Mon|Tue|Wed|Thu|Fri|Sat) (Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec) (0[1-9]|[12]\d|3[01]) (\d{4})$/;
const MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

export const legacyDateToIso = (value: unknown): string | null => {
  if (typeof value !== "string") return null;
  if (/^\d{4}-(?:0[1-9]|1[0-2])-(?:0[1-9]|[12]\d|3[01])$/.test(value)) {
    const isoDate = new Date(`${value}T00:00:00Z`);
    return !Number.isNaN(isoDate.getTime()) &&
        isoDate.toISOString().slice(0, 10) === value
      ? value
      : null;
  }
  const match = LEGACY_DATE.exec(value);
  if (!match) return null;
  const month = MONTHS.indexOf(match[2]) + 1;
  if (!month) return null;
  const iso = `${match[4]}-${String(month).padStart(2, "0")}-${match[3]}`;
  const date = new Date(`${iso}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) &&
      date.getUTCFullYear() === Number(match[4]) &&
      date.getUTCMonth() + 1 === month &&
      date.getUTCDate() === Number(match[3])
    ? iso
    : null;
};

export const calendarDatesForYear = (
  values: unknown[],
  year: number,
): string[] =>
  Array.from(
    new Set(values.flatMap((value) => {
      const row = value && typeof value === "object" && !Array.isArray(value)
        ? value as UnknownRecord
        : {};
      const iso = legacyDateToIso(row.date);
      return iso?.startsWith(`${year}-`) ? [iso] : [];
    })),
  ).sort();
