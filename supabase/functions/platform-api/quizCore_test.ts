import {
  getActualQuizDay,
  getAllowedQuizPositions,
  getQuizPlanScope,
  parseQuizProgressKey,
  type QuizIndexRecord,
  type QuizSubmissionInput,
  validateQuizSubmission,
} from "./quizCore.ts";

const TODAY = "Tue Jul 14 2026";
const assert = (condition: unknown, message: string) => {
  if (!condition) throw new Error(message);
};

const RECORD: QuizIndexRecord = {
  answerIndex: 2,
  allowed: { whole: [10], nt: [110] },
};

const submission = (
  overrides: Partial<QuizSubmissionInput> = {},
): QuizSubmissionInput => ({
  user: { currentDay: 10, readCount: 1, dayOffset: 0, planId: "whole_1" },
  progressKey: "r1_d10",
  quizKey: "genesis-1-1",
  selectedIndex: 2,
  todayLegacy: TODAY,
  indexRecord: RECORD,
  ...overrides,
});

Deno.test("진도 키, 계획 범위, 실제 Day를 엄격히 계산한다", () => {
  assert(parseQuizProgressKey("r2_d365")?.cycle === 2, "valid key rejected");
  assert(
    parseQuizProgressKey("e3_r2_d365")?.epoch === 3,
    "epoch key rejected",
  );
  for (
    const key of [
      "r0_d1",
      "r1_d0",
      "r1_d366",
      "r01_d1",
      "r1_d01",
      "r1_d1x",
      "e0_r1_d1",
      "e01_r1_d1",
      "e1_r01_d1",
      1,
    ]
  ) {
    assert(parseQuizProgressKey(key) === null, `invalid key accepted: ${key}`);
  }
  assert(getQuizPlanScope("nt_easy") === "nt", "nt scope mismatch");
  assert(getQuizPlanScope("whole_1") === "whole", "whole scope mismatch");
  assert(getActualQuizDay(365, 1) === 1, "positive wrap mismatch");
  assert(getActualQuizDay(1, -1) === 365, "negative wrap mismatch");
});

Deno.test("현재 위치와 오늘 방금 완료한 위치만 허용한다", () => {
  const same = getAllowedQuizPositions(
    { currentDay: 11, readCount: 2, lastReadDate: TODAY },
    TODAY,
  );
  assert(
    same.some((item) => item.cycle === 2 && item.day === 10),
    "just-completed position missing",
  );
  const wrapped = getAllowedQuizPositions(
    { currentDay: 1, readCount: 3, lastReadDate: TODAY },
    TODAY,
  );
  assert(
    wrapped.some((item) => item.cycle === 2 && item.day === 365),
    "wrapped completed position missing",
  );
  const restarted = getAllowedQuizPositions(
    { readingEpoch: 4, currentDay: 1, readCount: 3, lastReadDate: TODAY },
    TODAY,
  );
  assert(
    restarted.every((item) => item.epoch === 4),
    "allowed position lost reading epoch",
  );
});

Deno.test("사용자 readingEpoch와 다른 진도 키는 허용하지 않는다", () => {
  const accepted = validateQuizSubmission(submission({
    user: {
      readingEpoch: 2,
      currentDay: 10,
      readCount: 1,
      dayOffset: 0,
      planId: "whole_1",
    },
    progressKey: "e2_r1_d10",
  }));
  assert(accepted.status === "ready", "current epoch position rejected");

  const stale = validateQuizSubmission(submission({
    user: {
      readingEpoch: 2,
      currentDay: 10,
      readCount: 1,
      dayOffset: 0,
      planId: "whole_1",
    },
    progressKey: "r1_d10",
  }));
  assert(stale.status === "invalidPosition", "stale epoch position accepted");

  const corrupt = validateQuizSubmission(submission({
    user: {
      readingEpoch: "2",
      currentDay: 10,
      readCount: 1,
      dayOffset: 0,
      planId: "whole_1",
    },
  }));
  assert(
    corrupt.status === "invalidPosition" && corrupt.allowed.length === 0,
    "corrupt user epoch was normalized to epoch 0",
  );
});

Deno.test("첫 시도 정답은 10달란트와 저장 entry를 계산한다", () => {
  const result = validateQuizSubmission(submission());
  assert(result.status === "ready", "ready expected");
  if (result.status !== "ready") return;
  assert(result.nextAttempts === 1, "attempt mismatch");
  assert(result.isCorrect && result.reward === 10, "first reward mismatch");
  assert(
    result.entry.quizKey === "genesis-1-1" && result.entry.solved,
    "entry mismatch",
  );
  assert(result.rewardsUserWallet, "shared wallet route mismatch");
});

Deno.test("첫 오답 뒤 둘째 정답은 5달란트다", () => {
  const result = validateQuizSubmission(submission({
    user: {
      currentDay: 10,
      readCount: 1,
      quizProgress: {
        r1_d10: {
          attempts: 1,
          solved: false,
          quizKey: "genesis-1-1",
        },
      },
    },
  }));
  assert(result.status === "ready", "ready expected");
  if (result.status !== "ready") return;
  assert(
    result.nextAttempts === 2 && result.reward === 5,
    "second reward mismatch",
  );
});

Deno.test("오답은 두 번 모두 무보상이고 두 번 뒤에는 완료 상태다", () => {
  const first = validateQuizSubmission(submission({ selectedIndex: 0 }));
  assert(
    first.status === "ready" && first.nextAttempts === 1 && first.reward === 0,
    "first wrong mismatch",
  );
  const second = validateQuizSubmission(submission({
    selectedIndex: 0,
    user: {
      currentDay: 10,
      readCount: 1,
      quizProgress: { r1_d10: first.status === "ready" ? first.entry : {} },
    },
  }));
  assert(
    second.status === "ready" && second.nextAttempts === 2 &&
      second.reward === 0,
    "second wrong mismatch",
  );
  const done = validateQuizSubmission(submission({
    user: {
      currentDay: 10,
      readCount: 1,
      quizProgress: { r1_d10: second.status === "ready" ? second.entry : {} },
    },
  }));
  assert(done.status === "alreadyDone", "two attempts not closed");
});

Deno.test("같은 날 다른 퀴즈 보상을 받은 사용자는 정답도 무보상이다", () => {
  const result = validateQuizSubmission(submission({
    user: {
      currentDay: 10,
      readCount: 1,
      quizRewardDate: TODAY,
      accountType: "personal",
    },
  }));
  assert(result.status === "ready", "ready expected");
  if (result.status !== "ready") return;
  assert(result.isCorrect && result.reward === 0, "duplicate reward granted");
  assert(!result.rewardsUserWallet, "personal wallet route mismatch");
});

Deno.test("달란트 프로그램이 모든 지갑에서 꺼져 있으면 정답 보상도 0이다", () => {
  const result = validateQuizSubmission(submission({
    talentRouting: {
      directCanEarnTalent: false,
      rosterCanEarnTalent: false,
    },
  }));
  assert(result.status === "ready", "ready expected");
  if (result.status !== "ready") return;
  assert(result.isCorrect && result.reward === 0, "disabled program rewarded");
  assert(result.entry.reward === 0, "stored reward mismatch");
  assert(!result.rewardsUserWallet, "direct wallet route mismatch");
});

Deno.test("개인 계정은 roster 프로그램이 활성일 때만 유효 보상을 유지한다", () => {
  const result = validateQuizSubmission(submission({
    user: { currentDay: 10, readCount: 1, accountType: "personal" },
    talentRouting: {
      directCanEarnTalent: false,
      rosterCanEarnTalent: true,
    },
  }));
  assert(result.status === "ready", "ready expected");
  if (result.status !== "ready") return;
  assert(
    result.reward === 10 && result.entry.reward === 10,
    "roster reward missing",
  );
  assert(!result.rewardsUserWallet, "personal direct wallet enabled");
});

Deno.test("다른 Day나 계획 범위의 문항은 거부한다", () => {
  const otherPosition = validateQuizSubmission(
    submission({ progressKey: "r1_d9" }),
  );
  assert(otherPosition.status === "invalidPosition", "other progress accepted");

  const otherDay = validateQuizSubmission(submission({
    indexRecord: { answerIndex: 2, allowed: { whole: [9], nt: [10] } },
  }));
  assert(otherDay.status === "invalidQuiz", "other day quiz accepted");

  const ntMismatch = validateQuizSubmission(submission({
    user: { currentDay: 10, readCount: 1, planId: "nt_easy" },
  }));
  assert(ntMismatch.status === "invalidQuiz", "other plan scope accepted");
});

Deno.test("저장된 문항이 있으면 같은 Day의 다른 허용 문항도 거부한다", () => {
  const result = validateQuizSubmission(submission({
    quizKey: "genesis-1-2",
    user: {
      currentDay: 10,
      readCount: 1,
      quizProgress: {
        r1_d10: {
          attempts: 1,
          solved: false,
          quizKey: "genesis-1-1",
        },
      },
    },
  }));
  assert(result.status === "invalidQuiz", "stored quiz key was replaced");
});

Deno.test("시도 0인 사라진 저장 문항은 현재 후보 문항으로 한 번 교체한다", () => {
  const result = validateQuizSubmission(submission({
    quizKey: "genesis-1-2",
    user: {
      currentDay: 10,
      readCount: 1,
      quizProgress: {
        r1_d10: {
          attempts: 0,
          solved: false,
          skipped: false,
          quizKey: "removed-question",
        },
      },
    },
  }));
  assert(result.status === "ready", "zero-attempt replacement rejected");
  if (result.status !== "ready") return;
  assert(
    result.entry.quizKey === "genesis-1-2",
    "replacement key not persisted",
  );
});

Deno.test("legacyBank 문항은 같은 위치에 저장된 동일 키만 허용한다", () => {
  const bankRecord: QuizIndexRecord = {
    answerIndex: 1,
    allowed: { whole: [], nt: [] },
    legacyBank: true,
  };
  const rejected = validateQuizSubmission(submission({
    quizKey: "bank-4",
    selectedIndex: 1,
    indexRecord: bankRecord,
  }));
  assert(rejected.status === "invalidQuiz", "new legacy bank quiz accepted");

  const accepted = validateQuizSubmission(submission({
    quizKey: "bank-4",
    selectedIndex: 1,
    indexRecord: bankRecord,
    user: {
      currentDay: 10,
      readCount: 1,
      quizProgress: {
        r1_d10: { attempts: 0, solved: false, quizKey: "bank-4" },
      },
    },
  }));
  assert(accepted.status === "ready", "stored legacy bank quiz rejected");
});

Deno.test("잘못된 키와 선택지 인덱스를 거부한다", () => {
  for (
    const input of [
      submission({ quizKey: "" }),
      submission({ quizKey: "bad key" }),
      submission({ selectedIndex: -1 }),
      submission({ selectedIndex: 4 }),
      submission({ selectedIndex: 1.5 }),
      submission({
        indexRecord: { answerIndex: 4, allowed: { whole: [10], nt: [] } },
      }),
    ]
  ) {
    assert(
      validateQuizSubmission(input).status === "invalidQuiz",
      "invalid quiz input accepted",
    );
  }
});
