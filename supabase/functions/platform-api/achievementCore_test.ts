import {
  ACHIEVEMENT_CATALOG,
  ACHIEVEMENT_IDS,
  type AchievementId,
  type AchievementSyncState,
  calculateAchievementSync,
  isCatalogOrderedAchievementSubset,
} from "./achievementCore.ts";

const assert = (condition: unknown, message = "assertion failed") => {
  if (!condition) throw new Error(message);
};

const assertEquals = (actual: unknown, expected: unknown, message = "") => {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(
      `${message ? `${message}: ` : ""}expected ${
        JSON.stringify(expected)
      }, got ${JSON.stringify(actual)}`,
    );
  }
};

const stateFor = (
  target: AchievementId,
  value: number,
): AchievementSyncState => {
  const definition = ACHIEVEMENT_CATALOG.find(({ id }) => id === target);
  if (!definition) throw new Error(`missing definition: ${target}`);
  const state: AchievementSyncState = {
    currentIds: ACHIEVEMENT_IDS.filter((id) => id !== target),
    currentDay: 1,
    streak: 0,
    score: 0,
    memoCount: 0,
    trigger: definition.threshold.field === "memoCount" ? "memo" : "read",
  };
  state[definition.threshold.field] = value;
  return state;
};

Deno.test("14개 업적은 정의된 경계 바로 아래에서는 없고 경계에서 생긴다", () => {
  for (const definition of ACHIEVEMENT_CATALOG) {
    const below = calculateAchievementSync(
      stateFor(definition.id, definition.threshold.value - 1),
    );
    assertEquals(below.newIds, [], `${definition.id} below threshold`);

    const exact = calculateAchievementSync(
      stateFor(definition.id, definition.threshold.value),
    );
    assertEquals(exact.newIds, [definition.id], `${definition.id} threshold`);
  }
});

Deno.test("read trigger는 저장된 memo 개수와 무관하게 메모 업적을 만들지 않는다", () => {
  const result = calculateAchievementSync({
    currentIds: [],
    currentDay: 1,
    streak: 0,
    score: 0,
    memoCount: 50,
    trigger: "read",
  });
  assertEquals(result.newIds, [], "read awarded memo achievements");
});

Deno.test("memo trigger는 key 개수 1, 10, 50 경계를 누적 적용한다", () => {
  const expected: Array<[number, AchievementId[]]> = [
    [1, ["first_memo"]],
    [10, ["first_memo", "memo_10"]],
    [50, ["first_memo", "memo_10", "memo_50"]],
  ];
  for (const [memoCount, newIds] of expected) {
    const result = calculateAchievementSync({
      currentIds: [],
      currentDay: 1,
      streak: 0,
      score: 0,
      memoCount,
      trigger: "memo",
    });
    assertEquals(result.newIds, newIds, `memoCount=${memoCount}`);
  }
});

Deno.test("기존 unknown ID와 순서를 보존하고 중복을 제거한 뒤 catalog 순서로 union한다", () => {
  const result = calculateAchievementSync({
    currentIds: ["legacy_badge", "score_100", "legacy_badge"],
    currentDay: 30,
    streak: 7,
    score: 100,
    memoCount: 1,
    trigger: "memo",
  });
  assertEquals(result.newIds, [
    "first_read",
    "streak_7",
    "day_30",
    "first_memo",
  ]);
  assertEquals(result.mergedIds, [
    "legacy_badge",
    "score_100",
    "first_read",
    "streak_7",
    "day_30",
    "first_memo",
  ]);
  assert(
    isCatalogOrderedAchievementSubset(result.newIds),
    "new IDs are not catalog ordered",
  );
  assert(
    !isCatalogOrderedAchievementSubset(["score_100", "first_read"]),
    "reversed subset accepted",
  );
});
