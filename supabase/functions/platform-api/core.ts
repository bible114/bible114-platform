export const PREFLIGHT_ACTION = "preflight" as const;
export const PREVIEW_READ_COMPLETION_ACTION = "previewReadCompletion" as const;

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

  const { action, requestId, cycle, day } = body as Record<string, unknown>;
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
  throw new PlatformApiRequestError("INVALID_ACTION");
};
