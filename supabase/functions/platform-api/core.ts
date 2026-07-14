export const PREFLIGHT_ACTION = "preflight" as const;
export const PREVIEW_READ_COMPLETION_ACTION = "previewReadCompletion" as const;
export const PREVIEW_QUIZ_SUBMISSION_ACTION = "previewQuizSubmission" as const;

export type PlatformApiRequest =
  | {
    action: typeof PREFLIGHT_ACTION;
    requestId: string;
  }
  | {
    action: typeof PREVIEW_READ_COMPLETION_ACTION;
    requestId: string;
    cycle: number;
    day: number;
  }
  | {
    action: typeof PREVIEW_QUIZ_SUBMISSION_ACTION;
    requestId: string;
    progressKey: string;
    quizKey: string;
    selectedIndex: number;
  };

export type PlatformApiRequestErrorCode =
  | "INVALID_BODY"
  | "INVALID_ACTION"
  | "INVALID_REQUEST_ID"
  | "INVALID_PAYLOAD";

export class PlatformApiRequestError extends Error {
  readonly code: PlatformApiRequestErrorCode;

  constructor(code: PlatformApiRequestErrorCode) {
    super(code);
    this.name = "PlatformApiRequestError";
    this.code = code;
  }
}

// RFC 4122/9562 UUID의 표준 8-4-4-4-12 표기만 허용한다.
// requestId는 서버 쓰기 action이 추가될 때 멱등성 키로 그대로 사용할 값이다.
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export const isRequestId = (value: unknown): value is string =>
  typeof value === "string" && UUID_PATTERN.test(value);

export const parsePlatformApiRequest = (body: unknown): PlatformApiRequest => {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    throw new PlatformApiRequestError("INVALID_BODY");
  }

  const {
    action,
    requestId,
    cycle,
    day,
    progressKey,
    quizKey,
    selectedIndex,
  } = body as Record<string, unknown>;
  if (!isRequestId(requestId)) {
    throw new PlatformApiRequestError("INVALID_REQUEST_ID");
  }

  if (action === PREFLIGHT_ACTION) return { action, requestId };
  if (action === PREVIEW_READ_COMPLETION_ACTION) {
    if (
      !Number.isInteger(cycle) || Number(cycle) < 1 ||
      !Number.isInteger(day) || Number(day) < 1 || Number(day) > 365
    ) {
      throw new PlatformApiRequestError("INVALID_PAYLOAD");
    }
    return { action, requestId, cycle: Number(cycle), day: Number(day) };
  }
  if (action === PREVIEW_QUIZ_SUBMISSION_ACTION) {
    const progressMatch = typeof progressKey === "string"
      ? /^r([1-9]\d*)_d([1-9]\d*)$/.exec(progressKey)
      : null;
    const progressCycle = progressMatch ? Number(progressMatch[1]) : NaN;
    const progressDay = progressMatch ? Number(progressMatch[2]) : NaN;
    if (
      !progressMatch || !Number.isSafeInteger(progressCycle) ||
      !Number.isSafeInteger(progressDay) || progressDay < 1 ||
      progressDay > 365 || typeof quizKey !== "string" ||
      !/^[A-Za-z0-9_-]{1,128}$/.test(quizKey) ||
      !Number.isInteger(selectedIndex) || Number(selectedIndex) < 0 ||
      Number(selectedIndex) > 3
    ) {
      throw new PlatformApiRequestError("INVALID_PAYLOAD");
    }
    return {
      action,
      requestId,
      progressKey: String(progressKey),
      quizKey: String(quizKey),
      selectedIndex: Number(selectedIndex),
    };
  }
  throw new PlatformApiRequestError("INVALID_ACTION");
};
