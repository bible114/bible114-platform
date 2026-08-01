import {
  AdminPasswordOperationError,
  AdminPasswordRequestError,
  canAdminChangePassword,
  parseAdminPasswordRequest,
  updateAdminPasswordWithCompensation,
} from "./core.ts";

const assert = (condition: unknown, message: string) => {
  if (!condition) throw new Error(message);
};

const expectInvalid = (value: unknown) => {
  try {
    parseAdminPasswordRequest(value);
    throw new Error("expected invalid payload");
  } catch (error) {
    assert(
      error instanceof AdminPasswordRequestError,
      "wrong request error type",
    );
  }
};

Deno.test("비밀번호 변경 요청은 exact uid와 안전한 암호만 받는다", () => {
  const parsed = parseAdminPasswordRequest({
    targetUid: "member-1",
    newPassword: "새암호123",
  });
  assert(parsed.targetUid === "member-1", "uid mismatch");
  for (
    const invalid of [
      null,
      {},
      { targetUid: "member-1", newPassword: "12345" },
      { targetUid: "member-1", newPassword: `secret\n` },
      { targetUid: "bad/path", newPassword: "secret1" },
      { targetUid: " member-1", newPassword: "secret1" },
      { targetUid: "member-1", newPassword: "secret1", role: "member" },
      { targetUid: "member-1", newPassword: "x".repeat(129) },
    ]
  ) expectInvalid(invalid);
});

Deno.test("공동체 관리자는 같은 공동체의 활성 일반 교인만 변경한다", () => {
  const caller = {
    role: "churchAdmin",
    churchId: "church-1",
    isDeleted: false,
  };
  assert(
    canAdminChangePassword(caller, {
      role: "member",
      churchId: "church-1",
      isDeleted: false,
      hasPasswordProvider: true,
    }),
    "same church member rejected",
  );
  assert(
    canAdminChangePassword(caller, {
      role: "member",
      churchId: null,
      primaryOrgId: "church-1",
      isDeleted: false,
      hasPasswordProvider: true,
    }),
    "primary organization member rejected",
  );
  for (
    const target of [
      {
        role: "churchAdmin",
        churchId: "church-1",
        hasPasswordProvider: true,
      },
      {
        role: "platformAdmin",
        churchId: "church-1",
        hasPasswordProvider: true,
      },
      { role: "superAdmin", churchId: "church-1", hasPasswordProvider: true },
      { role: "member", churchId: "church-2", hasPasswordProvider: true },
      {
        role: "member",
        churchId: "church-1",
        isDeleted: true,
        hasPasswordProvider: true,
      },
      {
        role: "member",
        churchId: "church-1",
        hasPasswordProvider: false,
      },
      { role: "member", churchId: "church-1" },
    ]
  ) {
    assert(
      !canAdminChangePassword(caller, target),
      `unsafe target allowed: ${String(target.role)}`,
    );
  }
  assert(
    !canAdminChangePassword({ ...caller, isDeleted: true }, {
      role: "member",
      churchId: "church-1",
      hasPasswordProvider: true,
    }),
    "deleted caller allowed",
  );
});

Deno.test("플랫폼 관리 역할만 전체 대상 지원 권한을 가진다", () => {
  const target = {
    role: "churchAdmin",
    churchId: "church-2",
    hasPasswordProvider: true,
  };
  assert(
    canAdminChangePassword({ role: "platformAdmin" }, target),
    "platform admin rejected",
  );
  assert(
    canAdminChangePassword({ role: "superAdmin" }, target),
    "super admin rejected",
  );
  assert(
    !canAdminChangePassword({ role: "member", churchId: "church-2" }, target),
    "member caller allowed",
  );
  assert(
    !canAdminChangePassword({ role: "platformAdmin" }, {
      ...target,
      hasPasswordProvider: false,
    }),
    "social-only target allowed",
  );
});

const assertOperationCode = async (
  expected: AdminPasswordOperationError["code"],
  operation: () => Promise<void>,
) => {
  try {
    await operation();
    throw new Error(`expected ${expected}`);
  } catch (error) {
    if (!(error instanceof AdminPasswordOperationError)) {
      throw new Error("wrong operation error type");
    }
    assert(error.code === expected, `expected ${expected}, got ${error.code}`);
  }
};

Deno.test("Auth와 private 비밀번호를 순서대로 변경한다", async () => {
  const calls: string[] = [];
  await updateAdminPasswordWithCompensation("old-secret", "new-secret", {
    verifyPreviousPassword: () => Promise.resolve(true),
    updateAuthPassword: (password) => {
      calls.push(`auth:${password}`);
      return Promise.resolve();
    },
    updatePrivatePassword: (password) => {
      calls.push(`private:${password}`);
      return Promise.resolve();
    },
  });
  assert(
    calls.join(",") === "auth:new-secret,private:new-secret",
    `unexpected calls: ${calls.join(",")}`,
  );
});

Deno.test("되돌릴 기존 비밀번호가 없으면 외부 상태를 바꾸지 않는다", async () => {
  const calls: string[] = [];
  await assertOperationCode(
    "ROLLBACK_UNAVAILABLE",
    () =>
      updateAdminPasswordWithCompensation(null, "new-secret", {
        verifyPreviousPassword: () => Promise.resolve(true),
        updateAuthPassword: (password) => {
          calls.push(`auth:${password}`);
          return Promise.resolve();
        },
        updatePrivatePassword: (password) => {
          calls.push(`private:${password}`);
          return Promise.resolve();
        },
      }),
  );
  assert(calls.length === 0, "mutation happened without rollback basis");
});

Deno.test("private 저장 실패 시 두 저장소를 기존 비밀번호로 되돌린다", async () => {
  const calls: string[] = [];
  let privateAttempts = 0;
  await assertOperationCode(
    "PASSWORD_UPDATE_ROLLED_BACK",
    () =>
      updateAdminPasswordWithCompensation("old-secret", "new-secret", {
        verifyPreviousPassword: () => Promise.resolve(true),
        updateAuthPassword: (password) => {
          calls.push(`auth:${password}`);
          return Promise.resolve();
        },
        updatePrivatePassword: (password) => {
          calls.push(`private:${password}`);
          privateAttempts += 1;
          return privateAttempts === 1
            ? Promise.reject(new Error("write failed"))
            : Promise.resolve();
        },
      }),
  );
  assert(
    calls.join(",") ===
      "auth:new-secret,private:new-secret,auth:old-secret,private:old-secret",
    `unexpected compensation calls: ${calls.join(",")}`,
  );
});

Deno.test("보상 단계가 하나라도 실패하면 PARTIAL_UPDATE로 식별한다", async () => {
  const calls: string[] = [];
  await assertOperationCode(
    "PARTIAL_UPDATE",
    () =>
      updateAdminPasswordWithCompensation("old-secret", "new-secret", {
        verifyPreviousPassword: () => Promise.resolve(true),
        updateAuthPassword: (password) => {
          calls.push(`auth:${password}`);
          return password === "old-secret"
            ? Promise.reject(new Error("rollback failed"))
            : Promise.resolve();
        },
        updatePrivatePassword: (password) => {
          calls.push(`private:${password}`);
          return password === "new-secret"
            ? Promise.reject(new Error("write failed"))
            : Promise.resolve();
        },
      }),
  );
  assert(
    calls.join(",") ===
      "auth:new-secret,private:new-secret,auth:old-secret,private:old-secret",
    `unexpected partial calls: ${calls.join(",")}`,
  );
});

Deno.test("저장된 이전 비밀번호가 실제 Auth와 다르면 외부 상태를 바꾸지 않는다", async () => {
  const calls: string[] = [];
  await assertOperationCode(
    "ROLLBACK_UNAVAILABLE",
    () =>
      updateAdminPasswordWithCompensation("stale-secret", "new-secret", {
        verifyPreviousPassword: (password) => {
          calls.push(`verify:${password}`);
          return Promise.resolve(false);
        },
        updateAuthPassword: (password) => {
          calls.push(`auth:${password}`);
          return Promise.resolve();
        },
        updatePrivatePassword: (password) => {
          calls.push(`private:${password}`);
          return Promise.resolve();
        },
      }),
  );
  assert(
    calls.join(",") === "verify:stale-secret",
    `mutation happened after failed verification: ${calls.join(",")}`,
  );
});

Deno.test("최초 Auth 변경 응답 유실도 두 저장소를 기존 값으로 보상한다", async () => {
  const calls: string[] = [];
  let firstAuthAttempt = true;
  await assertOperationCode(
    "PASSWORD_UPDATE_ROLLED_BACK",
    () =>
      updateAdminPasswordWithCompensation("old-secret", "new-secret", {
        verifyPreviousPassword: () => Promise.resolve(true),
        updateAuthPassword: (password) => {
          calls.push(`auth:${password}`);
          if (firstAuthAttempt) {
            firstAuthAttempt = false;
            return Promise.reject(new Error("ambiguous response loss"));
          }
          return Promise.resolve();
        },
        updatePrivatePassword: (password) => {
          calls.push(`private:${password}`);
          return Promise.resolve();
        },
      }),
  );
  assert(
    calls.join(",") ===
      "auth:new-secret,auth:old-secret,private:old-secret",
    `unexpected ambiguous-failure compensation: ${calls.join(",")}`,
  );
});

Deno.test("mutation 직전 권한이 바뀌면 외부 상태를 변경하지 않는다", async () => {
  const calls: string[] = [];
  await assertOperationCode(
    "AUTHORIZATION_CHANGED",
    () =>
      updateAdminPasswordWithCompensation("old-secret", "new-secret", {
        verifyPreviousPassword: () => Promise.resolve(true),
        revalidateAuthorization: () => Promise.resolve(false),
        updateAuthPassword: (password) => {
          calls.push(`auth:${password}`);
          return Promise.resolve();
        },
        updatePrivatePassword: (password) => {
          calls.push(`private:${password}`);
          return Promise.resolve();
        },
      }),
  );
  assert(calls.length === 0, "mutation happened after authorization changed");
});

Deno.test("동시 제3의 Auth 비밀번호를 과거 값으로 덮어쓰지 않는다", async () => {
  const calls: string[] = [];
  let currentAuthPassword = "old-secret";
  await assertOperationCode(
    "PARTIAL_UPDATE",
    () =>
      updateAdminPasswordWithCompensation("old-secret", "new-secret", {
        verifyPreviousPassword: (password) =>
          Promise.resolve(currentAuthPassword === password),
        verifyCurrentPassword: (password) =>
          Promise.resolve(currentAuthPassword === password),
        updateAuthPassword: (password) => {
          calls.push(`auth:${password}`);
          currentAuthPassword = password;
          return Promise.resolve();
        },
        updatePrivatePassword: (password) => {
          calls.push(`private:${password}`);
          if (password === "new-secret") {
            currentAuthPassword = "third-party-secret";
            return Promise.reject(new Error("concurrent user change"));
          }
          return Promise.resolve();
        },
      }),
  );
  assert(
    calls.join(",") === "auth:new-secret,private:new-secret",
    `third-party password was overwritten: ${calls.join(",")}`,
  );
  assert(
    currentAuthPassword === "third-party-secret",
    "third-party password did not survive",
  );
});
