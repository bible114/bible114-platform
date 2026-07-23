const DAYS_PER_CYCLE = 365;
const DAY_MS = 86_400_000;
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
] as const;
const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;

export const TALENT_STREAK_MILESTONE_BONUSES: Readonly<Record<number, number>> =
  {
    7: 6,
    30: 10,
    60: 15,
    90: 20,
    120: 20,
    180: 25,
    270: 30,
    365: 40,
  };

export const getTalentStreakMilestoneBonus = (streak: number): number =>
  TALENT_STREAK_MILESTONE_BONUSES[streak] || 0;

export type StoredReadUser = {
  currentDay?: unknown;
  readCount?: unknown;
  readingYear?: unknown;
  yearCompletedRounds?: unknown;
  lifetimeCompletedRounds?: unknown;
  dailyAdvanceDate?: unknown;
  dailyAdvanceCount?: unknown;
  weeklyReadKey?: unknown;
  weeklyReadCount?: unknown;
  lastReadDate?: unknown;
  score?: unknown;
  streak?: unknown;
  maxStreak?: unknown;
  talent?: unknown;
  accountType?: unknown;
  secretShopUnlocked?: unknown;
  recentReadDates?: unknown;
};

// 클라이언트 요청에는 위치만 둔다. 점수·달란트·roster 값은 서버가 읽은 StoredReadUser에서만 취한다.
export type ReadCompletionRequest = { cycle: number; day: number };

export type TalentRewardRouting = {
  directCanEarnTalent: boolean;
  rosterCanEarnTalent: boolean;
};

export type ReadCompletionUpdate = {
  currentDay: number;
  readCount: number;
  readingYear: number;
  yearCompletedRounds: number;
  lifetimeCompletedRounds: number;
  score: number;
  streak: number;
  maxStreak: number;
  lastReadDate: string;
  dailyAdvanceDate: string;
  dailyAdvanceCount: number;
  weeklyReadKey: string;
  weeklyReadCount: number;
  recentReadDates: string[];
  talent?: number;
  secretShopUnlocked?: true;
};

export type ReadCompletionResult =
  | {
    status: "positionMismatch";
    expected: ReadCompletionRequest;
    received: ReadCompletionRequest;
  }
  | {
    status: "ready";
    updateData: ReadCompletionUpdate;
    summary: {
      oldLevel: number;
      newLevel: number;
      scoreEarned: number;
      streakBonus: number;
      talentEarned: number;
      newStreak: number;
      newReadCount: number;
      newProgressDay: number;
      nextViewingDay: number;
      completedRound: boolean;
      secretShopJustUnlocked: boolean;
      rewardsUserWallet: boolean;
      talentProgramEnabled: boolean;
    };
  };

const finiteNumber = (value: unknown, fallback = 0): number => {
  const number = typeof value === "number" ? value : Number(value);
  return Number.isFinite(number) ? number : fallback;
};

const nonNegativeInteger = (value: unknown, fallback = 0): number =>
  Math.max(0, Math.floor(finiteNumber(value, fallback)));

export const normalizeProgressDay = (value: unknown): number => {
  const day = Math.floor(finiteNumber(value, 1));
  if (day < 1) return 1;
  return ((day - 1) % DAYS_PER_CYCLE) + 1;
};

export const normalizeReadCount = (value: unknown): number =>
  Math.max(1, Math.floor(finiteNumber(value, 1)));

const parseLegacyDay = (value: unknown): number | null => {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  const legacy = trimmed.match(
    /^(?:Sun|Mon|Tue|Wed|Thu|Fri|Sat) ([A-Z][a-z]{2}) (\d{1,2}) (\d{4})$/,
  );
  if (legacy) {
    const month = MONTHS.indexOf(legacy[1] as typeof MONTHS[number]);
    if (month < 0) return null;
    const timestamp = Date.UTC(Number(legacy[3]), month, Number(legacy[2]));
    const date = new Date(timestamp);
    return date.getUTCFullYear() === Number(legacy[3]) &&
        date.getUTCMonth() === month && date.getUTCDate() === Number(legacy[2])
      ? timestamp
      : null;
  }
  const isoDay = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})(?:T.*)?$/);
  if (!isoDay) return null;
  const timestamp = Date.UTC(
    Number(isoDay[1]),
    Number(isoDay[2]) - 1,
    Number(isoDay[3]),
  );
  const date = new Date(timestamp);
  return date.getUTCFullYear() === Number(isoDay[1]) &&
      date.getUTCMonth() === Number(isoDay[2]) - 1 &&
      date.getUTCDate() === Number(isoDay[3])
    ? timestamp
    : null;
};

const toLegacyDay = (timestamp: number): string => {
  const date = new Date(timestamp);
  return `${WEEKDAYS[date.getUTCDay()]} ${MONTHS[date.getUTCMonth()]} ${
    String(date.getUTCDate()).padStart(2, "0")
  } ${date.getUTCFullYear()}`;
};

const normalizeRecentReadDates = (
  values: unknown,
  todayTimestamp: number,
): string[] => {
  const cutoff = todayTimestamp - 13 * DAY_MS;
  const timestamps = Array.isArray(values)
    ? values.flatMap((value) => {
      const timestamp = parseLegacyDay(value);
      return timestamp !== null && timestamp >= cutoff &&
          timestamp <= todayTimestamp
        ? [timestamp]
        : [];
    })
    : [];
  return Array.from(new Set([...timestamps, todayTimestamp]))
    .sort((a, b) => a - b)
    .slice(-14)
    .map(toLegacyDay);
};

export const calculateReadCompletion = (
  user: StoredReadUser,
  request: ReadCompletionRequest,
  todayLegacy: string,
  talentRouting?: TalentRewardRouting,
): ReadCompletionResult => {
  const currentDay = normalizeProgressDay(user.currentDay);
  const readCount = normalizeReadCount(user.readCount);
  const expected = { cycle: readCount, day: currentDay };
  if (
    !Number.isInteger(request.cycle) || !Number.isInteger(request.day) ||
    request.cycle !== expected.cycle || request.day !== expected.day
  ) {
    return { status: "positionMismatch", expected, received: request };
  }

  const todayTimestamp = parseLegacyDay(todayLegacy);
  if (todayTimestamp === null) throw new TypeError("INVALID_TODAY_LEGACY");
  const normalizedToday = toLegacyDay(todayTimestamp);
  const dailyAdvanceDateMatches = user.dailyAdvanceDate === normalizedToday;
  const lastReadDateMatches = user.lastReadDate === normalizedToday;
  const dailyAdvanceCount = dailyAdvanceDateMatches
    ? nonNegativeInteger(user.dailyAdvanceCount)
    : (lastReadDateMatches ? 1 : 0);
  const isFirstReadToday = !dailyAdvanceDateMatches && !lastReadDateMatches;
  const weekStartTimestamp = todayTimestamp -
    new Date(todayTimestamp).getUTCDay() * DAY_MS;
  const weeklyReadKey = toLegacyDay(weekStartTimestamp);
  const storedWeeklyReadCount = user.weeklyReadKey === weeklyReadKey
    ? nonNegativeInteger(user.weeklyReadCount)
    : null;
  const previousDaysThisWeek = Array.isArray(user.recentReadDates)
    ? new Set(user.recentReadDates.flatMap((value) => {
      const timestamp = parseLegacyDay(value);
      return timestamp !== null && timestamp >= weekStartTimestamp &&
          timestamp < todayTimestamp
        ? [timestamp]
        : [];
    })).size
    : 0;
  // 기존 계정은 첫 저장 때 이번 주 날짜 수와 오늘 이미 읽은 횟수를 안전하게 이관한다.
  const weeklyReadCount = storedWeeklyReadCount ??
    (previousDaysThisWeek + dailyAdvanceCount);
  const oldScore = finiteNumber(user.score);
  const oldStreak = nonNegativeInteger(user.streak);
  const streakBonus = isFirstReadToday ? Math.min(5, oldStreak) : 0;
  const scoreEarned = isFirstReadToday ? 10 + streakBonus : 0;
  const newScore = oldScore + scoreEarned;

  let newStreak = 1;
  const lastReadTimestamp = parseLegacyDay(user.lastReadDate);
  if (lastReadTimestamp !== null) {
    const diffDays = Math.floor((todayTimestamp - lastReadTimestamp) / DAY_MS);
    if (diffDays === 1) newStreak = oldStreak + 1;
    else if (diffDays === 0) newStreak = oldStreak;
  }

  const completedRound = currentDay === DAYS_PER_CYCLE;
  const newProgressDay = completedRound ? 1 : currentDay + 1;
  const newReadCount = completedRound ? readCount + 1 : readCount;
  const readingYear = nonNegativeInteger(user.readingYear);
  const yearCompletedRounds = nonNegativeInteger(
    user.yearCompletedRounds,
    Math.max(0, readCount - 1),
  ) + (completedRound ? 1 : 0);
  const lifetimeCompletedRounds = Math.max(
    nonNegativeInteger(
      user.lifetimeCompletedRounds,
      Math.max(0, readCount - 1),
    ),
    Math.max(0, readCount - 1),
  ) + (completedRound ? 1 : 0);
  const baseTalentEarned = isFirstReadToday
    ? 10 + Math.min(newStreak, 7) + getTalentStreakMilestoneBonus(newStreak)
    : 0;
  const accountUsesDirectWallet = user.accountType !== "personal";
  const directCanEarnTalent = talentRouting
    ? accountUsesDirectWallet && talentRouting.directCanEarnTalent
    : accountUsesDirectWallet;
  // 구 호출부에는 기존 의미를 보존한다. 서버 preview는 항상 명시 routing을 넘긴다.
  const rosterCanEarnTalent = talentRouting
    ? talentRouting.rosterCanEarnTalent
    : !accountUsesDirectWallet;
  const talentProgramEnabled = directCanEarnTalent || rosterCanEarnTalent;
  const talentEarned = talentProgramEnabled ? baseTalentEarned : 0;
  const rewardsUserWallet = directCanEarnTalent;
  const maxStreak = Math.max(
    nonNegativeInteger(user.maxStreak, oldStreak),
    oldStreak,
    newStreak,
  );
  const secretShopJustUnlocked = user.secretShopUnlocked !== true &&
    newStreak >= 7;

  const updateData: ReadCompletionUpdate = {
    currentDay: newProgressDay,
    readCount: newReadCount,
    readingYear,
    yearCompletedRounds,
    lifetimeCompletedRounds,
    score: newScore,
    streak: newStreak,
    maxStreak,
    lastReadDate: normalizedToday,
    dailyAdvanceDate: normalizedToday,
    dailyAdvanceCount: dailyAdvanceCount + 1,
    weeklyReadKey,
    weeklyReadCount: weeklyReadCount + 1,
    recentReadDates: normalizeRecentReadDates(
      user.recentReadDates,
      todayTimestamp,
    ),
  };
  if (directCanEarnTalent) {
    updateData.talent = finiteNumber(user.talent) + talentEarned;
  }
  if (secretShopJustUnlocked) updateData.secretShopUnlocked = true;

  return {
    status: "ready",
    updateData,
    summary: {
      oldLevel: Math.floor(oldScore / 100),
      newLevel: Math.floor(newScore / 100),
      scoreEarned,
      streakBonus,
      talentEarned,
      newStreak,
      newReadCount,
      newProgressDay,
      nextViewingDay: request.day >= DAYS_PER_CYCLE ? 1 : request.day + 1,
      completedRound,
      secretShopJustUnlocked,
      rewardsUserWallet,
      talentProgramEnabled,
    },
  };
};
