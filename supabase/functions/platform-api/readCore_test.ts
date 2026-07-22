import {
  calculateReadCompletion,
  normalizeProgressDay,
  normalizeReadCount,
  type StoredReadUser,
  TALENT_STREAK_MILESTONE_BONUSES,
} from "./readCore.ts";

const TODAY = "Tue Jul 14 2026";
const YESTERDAY = "Mon Jul 13 2026";

const assert = (condition: unknown, message: string) => {
  if (!condition) throw new Error(message);
};

const ready = (user: StoredReadUser, cycle = 1, day = 10) => {
  const result = calculateReadCompletion(
    { currentDay: day, readCount: cycle, ...user },
    { cycle, day },
    TODAY,
  );
  if (result.status !== "ready") {
    throw new Error(`expected ready, got ${result.status}`);
  }
  return result;
};

Deno.test("첫 읽기는 점수와 달란트를 지급한다", () => {
  const result = ready({ score: 20, talent: 5, streak: 0 });
  assert(result.updateData.score === 30, "score mismatch");
  assert(result.updateData.talent === 16, "talent mismatch");
  assert(result.summary.scoreEarned === 10, "score reward mismatch");
  assert(result.summary.talentEarned === 11, "talent reward mismatch");
  assert(result.updateData.dailyAdvanceCount === 1, "daily count mismatch");
});

Deno.test("같은 날 둘째 읽기는 보상이 0이다", () => {
  const result = ready({
    score: 20,
    talent: 5,
    streak: 2,
    lastReadDate: TODAY,
    dailyAdvanceDate: TODAY,
    dailyAdvanceCount: 1,
  });
  assert(result.summary.scoreEarned === 0, "second read score awarded");
  assert(result.summary.talentEarned === 0, "second read talent awarded");
  assert(
    result.updateData.score === 20 && result.updateData.talent === 5,
    "wallet changed",
  );
  assert(result.updateData.dailyAdvanceCount === 2, "daily count mismatch");
});

Deno.test("같은 날 추가 읽기도 주간 읽기 횟수에 즉시 더한다", () => {
  const result = ready({
    lastReadDate: TODAY,
    dailyAdvanceDate: TODAY,
    dailyAdvanceCount: 3,
    recentReadDates: ["Sun Jul 12 2026", YESTERDAY, TODAY],
  });
  assert(
    result.updateData.weeklyReadKey === "Sun Jul 12 2026",
    "week key mismatch",
  );
  assert(
    result.updateData.weeklyReadCount === 6,
    "weekly count did not advance",
  );
});

Deno.test("저장된 주간 횟수가 있으면 날짜 수가 아니라 횟수를 이어간다", () => {
  const result = ready({
    lastReadDate: TODAY,
    dailyAdvanceDate: TODAY,
    dailyAdvanceCount: 4,
    weeklyReadKey: "Sun Jul 12 2026",
    weeklyReadCount: 11,
  });
  assert(
    result.updateData.weeklyReadCount === 12,
    "stored weekly count mismatch",
  );
});

Deno.test("새 주가 시작되면 주간 읽기 횟수를 다시 센다", () => {
  const result = calculateReadCompletion(
    {
      currentDay: 10,
      readCount: 1,
      weeklyReadKey: "Sun Jul 12 2026",
      weeklyReadCount: 20,
      lastReadDate: "Sat Jul 18 2026",
    },
    { cycle: 1, day: 10 },
    "Sun Jul 19 2026",
  );
  if (result.status !== "ready") throw new Error("expected ready");
  assert(
    result.updateData.weeklyReadKey === "Sun Jul 19 2026",
    "new week key mismatch",
  );
  assert(result.updateData.weeklyReadCount === 1, "new week count mismatch");
});

Deno.test("오늘 dailyAdvanceDate가 있으면 count 0이어도 보상이 0이다", () => {
  const result = ready({
    score: 20,
    talent: 5,
    streak: 2,
    lastReadDate: YESTERDAY,
    dailyAdvanceDate: TODAY,
    dailyAdvanceCount: 0,
  });
  assert(result.summary.scoreEarned === 0, "daily marker score awarded");
  assert(result.summary.talentEarned === 0, "daily marker talent awarded");
  assert(
    result.updateData.dailyAdvanceCount === 1,
    "daily marker count mismatch",
  );
});

Deno.test("같은 날 읽는 횟수와 관계없이 다음 DAY로 진행한다", () => {
  const result = ready({
    lastReadDate: TODAY,
    dailyAdvanceDate: TODAY,
    dailyAdvanceCount: 10_000,
  });
  assert(result.updateData.currentDay === 11, "progress did not advance");
  assert(
    result.updateData.dailyAdvanceCount === 10_001,
    "daily count mismatch",
  );
  assert(result.summary.scoreEarned === 0, "extra read score awarded");
  assert(result.summary.talentEarned === 0, "extra read talent awarded");
});

Deno.test("저장 위치와 요청 위치가 다르면 positionMismatch이다", () => {
  const result = calculateReadCompletion({ currentDay: 11, readCount: 2 }, {
    cycle: 1,
    day: 10,
  }, TODAY);
  assert(
    result.status === "positionMismatch",
    "position mismatch not detected",
  );
  if (result.status === "positionMismatch") {
    assert(
      result.expected.cycle === 2 && result.expected.day === 11,
      "expected position mismatch",
    );
  }
});

Deno.test("전날 읽었으면 streak과 보너스가 증가한다", () => {
  const result = ready({
    score: 90,
    talent: 0,
    streak: 6,
    maxStreak: 6,
    lastReadDate: YESTERDAY,
  });
  assert(
    result.updateData.streak === 7 && result.updateData.maxStreak === 7,
    "streak mismatch",
  );
  assert(result.summary.scoreEarned === 15, "streak score bonus mismatch");
  assert(result.summary.talentEarned === 23, "streak talent mismatch");
  assert(
    result.updateData.secretShopUnlocked === true,
    "secret shop not unlocked",
  );
});

Deno.test("연속 읽기 이정표마다 정해진 달란트 보너스를 한 번 더 지급한다", () => {
  for (
    const [streakText, bonus] of Object.entries(
      TALENT_STREAK_MILESTONE_BONUSES,
    )
  ) {
    const streak = Number(streakText);
    const result = ready({
      talent: 0,
      streak: streak - 1,
      maxStreak: streak - 1,
      lastReadDate: YESTERDAY,
    });
    assert(result.summary.newStreak === streak, `${streak}일 streak mismatch`);
    assert(
      result.summary.talentEarned === 17 + bonus,
      `${streak}일 milestone talent mismatch`,
    );
  }
});

Deno.test("첫 365일 최대 달란트는 이정표 보너스를 포함해 정확히 10000이다", () => {
  const readingTalent = 11 + 12 + 13 + 14 + 15 + 16 + 17 + 17 * (365 - 7);
  const quizTalent = 10 * 365;
  const milestoneTalent = Object.values(TALENT_STREAK_MILESTONE_BONUSES)
    .reduce((sum, value) => sum + value, 0);
  assert(milestoneTalent === 166, "milestone sum mismatch");
  assert(
    readingTalent + quizTalent + milestoneTalent === 10_000,
    "annual talent maximum mismatch",
  );
});

Deno.test("365일 완료는 다음 회차 1일로 순환한다", () => {
  const result = ready({ score: 0, talent: 0 }, 2, 365);
  assert(result.updateData.currentDay === 1, "day did not wrap");
  assert(result.updateData.readCount === 3, "cycle did not increment");
  assert(
    result.summary.completedRound === true &&
      result.summary.nextViewingDay === 1,
    "wrap summary mismatch",
  );
});

Deno.test("개인 계정은 users talent를 변경하지 않는다", () => {
  const result = ready({ accountType: "personal", talent: 99, score: 0 });
  assert(
    !("talent" in result.updateData),
    "personal user talent must remain untouched",
  );
  assert(result.summary.talentEarned === 11, "roster reward summary missing");
  assert(
    result.summary.rewardsUserWallet === false,
    "personal wallet route mismatch",
  );
});

Deno.test("달란트 v2 routing은 실제 적립 가능한 지갑이 없으면 보상을 0으로 만든다", () => {
  const disabled = calculateReadCompletion(
    { currentDay: 10, readCount: 1, talent: 9 },
    { cycle: 1, day: 10 },
    TODAY,
    { directCanEarnTalent: false, rosterCanEarnTalent: false },
  );
  assert(disabled.status === "ready", "ready expected");
  if (disabled.status !== "ready") return;
  assert(disabled.summary.talentEarned === 0, "disabled program rewarded");
  assert(!disabled.summary.talentProgramEnabled, "disabled flag mismatch");
  assert(!("talent" in disabled.updateData), "direct wallet was changed");
});

Deno.test("roster만 활성인 개인 계정은 유효 보상을 유지하되 users 잔액은 숨긴다", () => {
  const rosterOnly = calculateReadCompletion(
    { currentDay: 10, readCount: 1, accountType: "personal", talent: 99 },
    { cycle: 1, day: 10 },
    TODAY,
    { directCanEarnTalent: false, rosterCanEarnTalent: true },
  );
  assert(rosterOnly.status === "ready", "ready expected");
  if (rosterOnly.status !== "ready") return;
  assert(rosterOnly.summary.talentEarned === 11, "roster reward missing");
  assert(rosterOnly.summary.talentProgramEnabled, "roster flag mismatch");
  assert(!("talent" in rosterOnly.updateData), "personal user balance leaked");
});

Deno.test("진도와 최근 날짜를 안정적으로 정규화한다", () => {
  assert(
    normalizeProgressDay(366) === 1 && normalizeProgressDay(0) === 1,
    "day normalization mismatch",
  );
  assert(normalizeReadCount(0) === 1, "cycle normalization mismatch");
  const result = ready({
    recentReadDates: [
      "2026-07-01T12:00:00.000Z",
      "Mon Jul 13 2026",
      "bad-date",
    ],
  });
  assert(
    result.updateData.recentReadDates.length === 3,
    "recent dates mismatch",
  );
  assert(
    result.updateData.recentReadDates.at(-1) === TODAY,
    "today missing from recent dates",
  );
});
