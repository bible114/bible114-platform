const DAYS_PER_CYCLE = 365;

export type QuizProgressPosition = { cycle: number; day: number };

export type QuizIndexRecord = {
  answerIndex: number;
  allowed: {
    whole: number[];
    nt: number[];
  };
  legacyBank?: true;
};

export type StoredQuizEntry = {
  attempts?: unknown;
  solved?: unknown;
  skipped?: unknown;
  quizKey?: unknown;
  reward?: unknown;
  updatedDate?: unknown;
};

export type StoredQuizUser = {
  currentDay?: unknown;
  readCount?: unknown;
  dayOffset?: unknown;
  planId?: unknown;
  lastReadDate?: unknown;
  quizProgress?: unknown;
  quizAttempts?: unknown;
  quizSolved?: unknown;
  quizSkipped?: unknown;
  quizKey?: unknown;
  quizDate?: unknown;
  quizRewardDate?: unknown;
  accountType?: unknown;
};

export type QuizSubmissionInput = {
  user: StoredQuizUser;
  progressKey: unknown;
  quizKey: unknown;
  selectedIndex: unknown;
  todayLegacy: string;
  indexRecord: QuizIndexRecord | null | undefined;
  talentRouting?: {
    directCanEarnTalent: boolean;
    rosterCanEarnTalent: boolean;
  };
};

export type QuizSubmissionResult =
  | {
    status: "invalidPosition";
    requested: QuizProgressPosition | null;
    allowed: QuizProgressPosition[];
  }
  | { status: "invalidQuiz" }
  | {
    status: "alreadyDone";
    attempts: number;
    solved: boolean;
    skipped: boolean;
    reward: number;
    quizKey: string;
  }
  | {
    status: "ready";
    nextAttempts: number;
    isCorrect: boolean;
    reward: number;
    entry: {
      attempts: number;
      solved: boolean;
      skipped: false;
      quizKey: string;
      reward: number;
      updatedDate: string;
    };
    rewardsUserWallet: boolean;
  };

const integer = (value: unknown, fallback: number): number => {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? Math.floor(parsed) : fallback;
};

const normalizedCycle = (value: unknown): number =>
  Math.max(1, integer(value, 1));

const normalizedDay = (value: unknown): number => {
  const day = integer(value, 1);
  return ((day - 1) % DAYS_PER_CYCLE + DAYS_PER_CYCLE) % DAYS_PER_CYCLE + 1;
};

const normalizedAttempts = (value: unknown): number =>
  Math.max(0, integer(value, 0));

const normalizedReward = (value: unknown): number => {
  const reward = typeof value === "number" ? value : Number(value);
  return Number.isFinite(reward) ? Math.max(0, reward) : 0;
};

export const parseQuizProgressKey = (
  value: unknown,
): QuizProgressPosition | null => {
  if (typeof value !== "string") return null;
  const match = /^r([1-9]\d*)_d([1-9]\d*)$/.exec(value);
  if (!match) return null;
  const cycle = Number(match[1]);
  const day = Number(match[2]);
  if (!Number.isSafeInteger(cycle) || day < 1 || day > DAYS_PER_CYCLE) {
    return null;
  }
  return { cycle, day };
};

export const getQuizPlanScope = (planId: unknown): "nt" | "whole" =>
  String(planId).split("_")[0] === "nt" ? "nt" : "whole";

export const getActualQuizDay = (day: number, dayOffset: number): number => {
  const shifted = day + dayOffset;
  return ((shifted - 1) % DAYS_PER_CYCLE + DAYS_PER_CYCLE) % DAYS_PER_CYCLE + 1;
};

// 퀴즈는 아직 읽기 전인 현재 위치와, 오늘 읽고 진도가 이동한 직후의
// 직전 위치에서만 제출할 수 있다. 회차 경계에서는 rN_d365로 되돌린다.
export const getAllowedQuizPositions = (
  user: StoredQuizUser,
  todayLegacy: string,
): QuizProgressPosition[] => {
  const current = {
    cycle: normalizedCycle(user.readCount),
    day: normalizedDay(user.currentDay),
  };
  if (user.lastReadDate !== todayLegacy) return [current];

  const justCompleted = current.day === 1
    ? { cycle: current.cycle - 1, day: DAYS_PER_CYCLE }
    : { cycle: current.cycle, day: current.day - 1 };
  return justCompleted.cycle >= 1 ? [current, justCompleted] : [current];
};

const positionsEqual = (
  left: QuizProgressPosition,
  right: QuizProgressPosition,
): boolean => left.cycle === right.cycle && left.day === right.day;

const readProgressEntry = (
  user: StoredQuizUser,
  progressKey: string,
): StoredQuizEntry | null => {
  if (
    !user.quizProgress || typeof user.quizProgress !== "object" ||
    Array.isArray(user.quizProgress)
  ) return null;
  const entry = (user.quizProgress as Record<string, unknown>)[progressKey];
  return entry && typeof entry === "object" && !Array.isArray(entry)
    ? entry as StoredQuizEntry
    : null;
};

const readStoredProgress = (
  user: StoredQuizUser,
  progressKey: string,
  position: QuizProgressPosition,
  todayLegacy: string,
): StoredQuizEntry => {
  const current = readProgressEntry(user, progressKey);
  if (current) return current;

  // 기존 단일 quiz* 필드는 오늘의 현재/방금 완료 위치에만 승계한다.
  // 날짜 제한이 없으면 오래된 bank 키를 다른 Day에 재사용할 수 있다.
  const legacyPosition = getAllowedQuizPositions(user, todayLegacy).at(-1);
  const canUseLegacy = user.quizDate === todayLegacy && legacyPosition &&
    positionsEqual(position, legacyPosition);
  return canUseLegacy
    ? {
      attempts: user.quizAttempts,
      solved: user.quizSolved,
      skipped: user.quizSkipped,
      quizKey: user.quizKey,
      reward: user.quizSolved === true
        ? (normalizedAttempts(user.quizAttempts) === 1
          ? 10
          : normalizedAttempts(user.quizAttempts) === 2
          ? 5
          : 0)
        : 0,
    }
    : {};
};

const validQuizKey = (value: unknown): value is string =>
  typeof value === "string" && /^[A-Za-z0-9_-]{1,128}$/.test(value);

const validAnswerIndex = (value: unknown): value is number =>
  Number.isInteger(value) && Number(value) >= 0 && Number(value) <= 3;

export const validateQuizSubmission = (
  input: QuizSubmissionInput,
): QuizSubmissionResult => {
  const position = parseQuizProgressKey(input.progressKey);
  const allowedPositions = getAllowedQuizPositions(
    input.user,
    input.todayLegacy,
  );
  if (
    !position ||
    !allowedPositions.some((item) => positionsEqual(item, position))
  ) {
    return {
      status: "invalidPosition",
      requested: position,
      allowed: allowedPositions,
    };
  }

  if (!validQuizKey(input.quizKey) || !validAnswerIndex(input.selectedIndex)) {
    return { status: "invalidQuiz" };
  }
  const record = input.indexRecord;
  if (
    !record || !validAnswerIndex(record.answerIndex) || !record.allowed ||
    !Array.isArray(record.allowed.whole) || !Array.isArray(record.allowed.nt)
  ) return { status: "invalidQuiz" };

  const stored = readStoredProgress(
    input.user,
    input.progressKey as string,
    position,
    input.todayLegacy,
  );
  const attempts = normalizedAttempts(stored.attempts);
  // 첫 시도 뒤에는 같은 Day의 다른 허용 문항으로 바꿀 수 없다. 완료된
  // 기록도 요청 키가 다르면 그 결과를 노출하지 않고 잘못된 문항으로 본다.
  // 단, 시도 0인 저장 키가 현재 후보군에서 사라진 경우 클라이언트는 새 키로
  // 교체하므로 같은 예외를 허용한다.
  const canReplaceStoredQuizKey = attempts === 0 && stored.solved !== true &&
    stored.skipped !== true;
  if (
    !canReplaceStoredQuizKey && validQuizKey(stored.quizKey) &&
    stored.quizKey !== input.quizKey
  ) {
    return { status: "invalidQuiz" };
  }
  if (record.legacyBank === true) {
    if (stored.quizKey !== input.quizKey) return { status: "invalidQuiz" };
  } else {
    const scope = getQuizPlanScope(input.user.planId);
    const actualDay = getActualQuizDay(
      position.day,
      integer(input.user.dayOffset, 0),
    );
    if (!record.allowed[scope].includes(actualDay)) {
      return { status: "invalidQuiz" };
    }
  }

  const solved = stored.solved === true;
  const skipped = stored.skipped === true;
  if (solved || skipped || attempts >= 2) {
    return {
      status: "alreadyDone",
      attempts,
      solved,
      skipped,
      reward: normalizedReward(stored.reward),
      quizKey: validQuizKey(stored.quizKey) ? stored.quizKey : input.quizKey,
    };
  }

  const nextAttempts = attempts + 1;
  const isCorrect = input.selectedIndex === record.answerIndex;
  const rewardAlready = input.user.quizRewardDate === input.todayLegacy ||
    (input.user.quizDate === input.todayLegacy &&
      input.user.quizSolved === true);
  const baseReward = !isCorrect || rewardAlready
    ? 0
    : nextAttempts === 1
    ? 10
    : nextAttempts === 2
    ? 5
    : 0;
  const accountUsesDirectWallet = input.user.accountType !== "personal";
  const directCanEarnTalent = input.talentRouting
    ? accountUsesDirectWallet && input.talentRouting.directCanEarnTalent
    : accountUsesDirectWallet;
  const rosterCanEarnTalent = input.talentRouting
    ? input.talentRouting.rosterCanEarnTalent
    : !accountUsesDirectWallet;
  const reward = directCanEarnTalent || rosterCanEarnTalent ? baseReward : 0;
  const entry = {
    attempts: nextAttempts,
    solved: isCorrect,
    skipped: false as const,
    quizKey: input.quizKey,
    reward,
    updatedDate: input.todayLegacy,
  };
  return {
    status: "ready",
    nextAttempts,
    isCorrect,
    reward,
    entry,
    rewardsUserWallet: directCanEarnTalent,
  };
};
