export const ACHIEVEMENT_CATALOG = [
  { id: "first_read", threshold: { field: "currentDay", value: 2 } },
  { id: "streak_7", threshold: { field: "streak", value: 7 } },
  { id: "streak_30", threshold: { field: "streak", value: 30 } },
  { id: "streak_100", threshold: { field: "streak", value: 100 } },
  { id: "day_30", threshold: { field: "currentDay", value: 30 } },
  { id: "day_100", threshold: { field: "currentDay", value: 100 } },
  { id: "day_200", threshold: { field: "currentDay", value: 200 } },
  { id: "day_365", threshold: { field: "currentDay", value: 365 } },
  { id: "first_memo", threshold: { field: "memoCount", value: 1 } },
  { id: "memo_10", threshold: { field: "memoCount", value: 10 } },
  { id: "memo_50", threshold: { field: "memoCount", value: 50 } },
  { id: "score_100", threshold: { field: "score", value: 100 } },
  { id: "score_500", threshold: { field: "score", value: 500 } },
  { id: "score_1000", threshold: { field: "score", value: 1000 } },
] as const;

export type AchievementId = (typeof ACHIEVEMENT_CATALOG)[number]["id"];
export type AchievementTrigger = "read" | "memo";

export type AchievementSyncState = {
  currentIds: string[];
  currentDay: number;
  streak: number;
  score: number;
  memoCount: number;
  trigger: AchievementTrigger;
};

export type AchievementSyncCalculation = {
  newIds: AchievementId[];
  mergedIds: string[];
};

export const ACHIEVEMENT_IDS: readonly AchievementId[] = ACHIEVEMENT_CATALOG
  .map(({ id }) => id);

const achieved = (
  definition: (typeof ACHIEVEMENT_CATALOG)[number],
  state: Omit<AchievementSyncState, "currentIds">,
): boolean => {
  const { field, value } = definition.threshold;
  if (field === "memoCount") {
    return state.trigger === "memo" && state.memoCount >= value;
  }
  return state[field] >= value;
};

/**
 * 업적 정의 순서대로 새 항목을 계산한다. 기존 배열은 레거시/알 수 없는 ID도
 * 순서 그대로 보존하되 중복만 제거하여 기존 브라우저 merge 의미와 맞춘다.
 */
export const calculateAchievementSync = (
  state: AchievementSyncState,
): AchievementSyncCalculation => {
  const mergedIds = Array.from(new Set(state.currentIds));
  const earnedIds = new Set(mergedIds);
  const newIds = ACHIEVEMENT_CATALOG
    .filter((definition) =>
      !earnedIds.has(definition.id) && achieved(definition, state)
    )
    .map(({ id }) => id);

  return {
    newIds,
    mergedIds: [...mergedIds, ...newIds],
  };
};

export const isKnownAchievementId = (
  value: unknown,
): value is AchievementId =>
  typeof value === "string" &&
  (ACHIEVEMENT_IDS as readonly string[]).includes(value);

export const isCatalogOrderedAchievementSubset = (
  values: readonly AchievementId[],
): boolean => {
  let previousIndex = -1;
  for (const value of values) {
    const index = ACHIEVEMENT_IDS.indexOf(value);
    if (index <= previousIndex) return false;
    previousIndex = index;
  }
  return true;
};
