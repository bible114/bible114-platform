export const ERROR_DEFINITIONS = {
  BAD_REQUEST: {
    status: 400,
    message: "요청 정보가 올바르지 않습니다.",
    retryable: false,
  },
  UNAUTHORIZED: {
    status: 401,
    message: "로그인이 필요합니다.",
    retryable: false,
  },
  TOKEN_INVALID: {
    status: 401,
    message: "인증을 확인할 수 없습니다.",
    retryable: false,
  },
  ANONYMOUS_NOT_ALLOWED: {
    status: 403,
    message: "회원 로그인이 필요한 기능입니다.",
    retryable: false,
  },
  FORBIDDEN: {
    status: 403,
    message: "요청을 처리할 권한이 없습니다.",
    retryable: false,
  },
  NOT_FOUND: {
    status: 404,
    message: "요청한 정보를 찾을 수 없습니다.",
    retryable: false,
  },
  METHOD_NOT_ALLOWED: {
    status: 405,
    message: "지원하지 않는 요청 방식입니다.",
    retryable: false,
  },
  CONFLICT: {
    status: 409,
    message: "이미 처리되었거나 현재 상태와 충돌합니다.",
    retryable: false,
  },
  REFUND_MIGRATION_CONFIRM_REQUIRED: {
    status: 409,
    message: "개인 계정 전환 뒤 환불할 명부 지갑을 다시 확인해주세요.",
    retryable: false,
  },
  RATE_LIMITED: {
    status: 429,
    message: "요청이 너무 많습니다. 잠시 후 다시 시도해 주세요.",
    retryable: true,
  },
  SERVICE_ACCOUNT_INVALID: {
    status: 500,
    message: "서버 인증 설정을 확인할 수 없습니다.",
    retryable: false,
  },
  SERVICE_TOKEN_FAILED: {
    status: 502,
    message: "서버 인증 중 오류가 발생했습니다.",
    retryable: true,
  },
  FIRESTORE_READ_FAILED: {
    status: 502,
    message: "데이터를 불러오지 못했습니다.",
    retryable: true,
  },
  FIRESTORE_WRITE_FAILED: {
    status: 502,
    message: "데이터를 저장하지 못했습니다.",
    retryable: true,
  },
  INTERNAL: {
    status: 500,
    message: "서버 처리 중 오류가 발생했습니다.",
    retryable: true,
  },
} as const;

export type PlatformErrorCode = keyof typeof ERROR_DEFINITIONS;

export class PlatformError extends Error {
  readonly code: PlatformErrorCode;
  readonly status: number;
  readonly retryable: boolean;
  readonly details?: Record<string, unknown>;

  constructor(
    code: PlatformErrorCode,
    options: {
      message?: string;
      status?: number;
      retryable?: boolean;
      details?: Record<string, unknown>;
      cause?: unknown;
    } = {},
  ) {
    const definition = ERROR_DEFINITIONS[code];
    super(
      options.message ?? definition.message,
      options.cause === undefined ? undefined : { cause: options.cause },
    );
    this.name = "PlatformError";
    this.code = code;
    this.status = options.status ?? definition.status;
    this.retryable = options.retryable ?? definition.retryable;
    this.details = options.details;
  }
}

export const toPlatformError = (error: unknown): PlatformError => (
  error instanceof PlatformError
    ? error
    : new PlatformError("INTERNAL", { cause: error })
);

export const errorPayload = (error: unknown) => {
  const platformError = toPlatformError(error);
  return {
    ok: false as const,
    error: {
      code: platformError.code,
      message: platformError.message,
      retryable: platformError.retryable,
    },
  };
};
