export const MAX_REQUEST_BYTES = 4_096;

export type AdminPasswordUser = {
  role?: unknown;
  churchId?: unknown;
  primaryOrgId?: unknown;
  isDeleted?: unknown;
  hasPasswordProvider?: unknown;
  email?: unknown;
};

export type AdminPasswordRequest = {
  targetUid: string;
  newPassword: string;
};

export class AdminPasswordRequestError extends Error {
  constructor() {
    super("INVALID_PAYLOAD");
    this.name = "AdminPasswordRequestError";
  }
}

export type AdminPasswordOperationCode =
  | "ROLLBACK_UNAVAILABLE"
  | "PASSWORD_CHANGE_BUSY"
  | "CREDENTIAL_MIGRATION_REQUIRED"
  | "AUTHORIZATION_CHANGED"
  | "PASSWORD_UPDATE_ROLLED_BACK"
  | "PARTIAL_UPDATE";

export class AdminPasswordOperationError extends Error {
  readonly code: AdminPasswordOperationCode;

  constructor(code: AdminPasswordOperationCode) {
    super(code);
    this.name = "AdminPasswordOperationError";
    this.code = code;
  }
}

export type AdminPasswordMutationDependencies = {
  verifyPreviousPassword: (password: string) => Promise<boolean>;
  verifyCurrentPassword?: (password: string) => Promise<boolean>;
  revalidateAuthorization?: () => Promise<boolean>;
  updateAuthPassword: (password: string) => Promise<void>;
  updatePrivatePassword: (password: string) => Promise<void>;
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value);

const isCanonicalUid = (value: string) =>
  value.length >= 1 && value.length <= 128 &&
  value === value.trim() && value !== "." && value !== ".." &&
  !value.includes("/") && !/[\u0000-\u001f\u007f]/.test(value);

const isSafePassword = (value: unknown): value is string =>
  typeof value === "string" &&
  value.length >= 6 && value.length <= 128 &&
  !/[\u0000-\u001f\u007f]/.test(value);

export const parseAdminPasswordRequest = (
  value: unknown,
): AdminPasswordRequest => {
  if (!isRecord(value)) throw new AdminPasswordRequestError();
  const keys = Object.keys(value).sort();
  if (keys.join("\0") !== ["newPassword", "targetUid"].join("\0")) {
    throw new AdminPasswordRequestError();
  }
  const targetUid = typeof value.targetUid === "string" ? value.targetUid : "";
  const newPassword = typeof value.newPassword === "string"
    ? value.newPassword
    : "";
  if (
    !isCanonicalUid(targetUid) ||
    !isSafePassword(newPassword)
  ) throw new AdminPasswordRequestError();
  return { targetUid, newPassword };
};

const text = (value: unknown) => typeof value === "string" ? value.trim() : "";

export const canAdminChangePassword = (
  caller: AdminPasswordUser | null,
  target: AdminPasswordUser | null,
) => {
  if (
    !caller || !target || caller.isDeleted === true ||
    target.hasPasswordProvider !== true
  ) return false;
  const callerRole = text(caller.role);
  if (callerRole === "platformAdmin" || callerRole === "superAdmin") {
    return true;
  }
  if (
    callerRole !== "churchAdmin" ||
    target.role !== "member" ||
    target.isDeleted === true
  ) return false;
  const callerChurchId = text(caller.churchId);
  if (!callerChurchId) return false;
  return text(target.churchId) === callerChurchId ||
    text(target.primaryOrgId) === callerChurchId;
};

export const updateAdminPasswordWithCompensation = async (
  previousPassword: unknown,
  newPassword: string,
  dependencies: AdminPasswordMutationDependencies,
) => {
  if (!isSafePassword(previousPassword)) {
    throw new AdminPasswordOperationError("ROLLBACK_UNAVAILABLE");
  }

  let previousPasswordVerified = false;
  try {
    previousPasswordVerified = await dependencies.verifyPreviousPassword(
      previousPassword,
    );
  } catch {
    previousPasswordVerified = false;
  }
  if (!previousPasswordVerified) {
    throw new AdminPasswordOperationError("ROLLBACK_UNAVAILABLE");
  }

  if (dependencies.revalidateAuthorization) {
    let stillAuthorized = false;
    try {
      stillAuthorized = await dependencies.revalidateAuthorization();
    } catch {
      stillAuthorized = false;
    }
    if (!stillAuthorized) {
      throw new AdminPasswordOperationError("AUTHORIZATION_CHANGED");
    }
  }

  const verifyCurrentPassword = dependencies.verifyCurrentPassword ||
    dependencies.verifyPreviousPassword;
  try {
    // 최초 Auth 요청이 서버에서 반영된 뒤 응답만 유실될 수도 있으므로 이 호출도
    // 보상 범위 안에 둔다. 실패가 확정적이어도 기존 값 재적용은 멱등이다.
    await dependencies.updateAuthPassword(newPassword);
    await dependencies.updatePrivatePassword(newPassword);
    if (!(await verifyCurrentPassword(newPassword))) {
      throw new Error("AUTH_FINAL_VERIFICATION_FAILED");
    }
  } catch {
    // 사용자가 동시에 제3의 비밀번호로 바꿨다면 그 값을 과거 비밀번호로 덮지 않는다.
    // 이번 요청의 새 값 또는 직전 값임을 확인할 수 있을 때만 보상한다.
    let newPasswordIsCurrent = false;
    let previousPasswordIsCurrent = false;
    try {
      newPasswordIsCurrent = await verifyCurrentPassword(newPassword);
      if (!newPasswordIsCurrent) {
        previousPasswordIsCurrent = await verifyCurrentPassword(
          previousPassword,
        );
      }
    } catch {
      newPasswordIsCurrent = false;
      previousPasswordIsCurrent = false;
    }
    if (!newPasswordIsCurrent && !previousPasswordIsCurrent) {
      throw new AdminPasswordOperationError("PARTIAL_UPDATE");
    }

    let compensationFailed = false;
    if (newPasswordIsCurrent) {
      try {
        await dependencies.updateAuthPassword(previousPassword);
        if (!(await verifyCurrentPassword(previousPassword))) {
          compensationFailed = true;
        }
      } catch {
        compensationFailed = true;
      }
    }
    try {
      await dependencies.updatePrivatePassword(previousPassword);
    } catch {
      compensationFailed = true;
    }
    throw new AdminPasswordOperationError(
      compensationFailed ? "PARTIAL_UPDATE" : "PASSWORD_UPDATE_ROLLED_BACK",
    );
  }
};
