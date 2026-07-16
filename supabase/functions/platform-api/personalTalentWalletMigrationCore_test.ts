import {
  decidePersonalTalentWalletMigration,
  MAX_PERSONAL_TALENT_WALLET_VALUE,
  normalizePersonalWalletDocumentId,
  PersonalTalentWalletMigrationValidationError,
} from "./personalTalentWalletMigrationCore.ts";

const UID = "user-1";

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

const baseUser = (overrides: Record<string, unknown> = {}) => ({
  role: "member",
  accountType: "personal",
  isDeleted: false,
  primaryOrgId: "org-1",
  talent: 25,
  talentWalletMigrated: false,
  ...overrides,
});

const baseRoster = (overrides: Record<string, unknown> = {}) => ({
  uid: UID,
  talent: 40,
  ...overrides,
});

const decide = (
  user: Record<string, unknown> | null = baseUser(),
  roster: Record<string, unknown> | null = baseRoster(),
) =>
  decidePersonalTalentWalletMigration({
    authenticatedUid: UID,
    user,
    roster,
  });

const expectValidationError = (
  callback: () => unknown,
  code: PersonalTalentWalletMigrationValidationError["code"],
) => {
  try {
    callback();
    throw new Error(`expected ${code}`);
  } catch (error) {
    assert(
      error instanceof PersonalTalentWalletMigrationValidationError &&
        error.code === code,
      `expected ${code}, got ${error}`,
    );
  }
};

Deno.test("개인 지갑 문서 ID는 원문 그대로인 안전한 단일 segment만 허용한다", () => {
  assert(normalizePersonalWalletDocumentId("org-1") === "org-1");
  for (const value of ["", " org-1", "org-1 ", ".", "..", "a/b", "a\n"]) {
    assert(normalizePersonalWalletDocumentId(value) === null, String(value));
  }
});

Deno.test("users 달란트를 canonical roster에 더할 결정을 만든다", () => {
  assertEquals(decide(), {
    status: "migrated",
    primaryOrgId: "org-1",
    userTalent: 25,
    rosterTalent: 40,
    nextRosterTalent: 65,
    writeUser: true,
    writeRoster: true,
  });
});

Deno.test("0 달란트는 flag만 이전하고 이미 완료된 상태는 no-op이다", () => {
  assertEquals(decide(baseUser({ talent: 0, talentWalletMigrated: false })), {
    status: "migrated",
    primaryOrgId: "org-1",
    userTalent: 0,
    rosterTalent: 40,
    nextRosterTalent: 40,
    writeUser: true,
    writeRoster: false,
  });
  assertEquals(decide(baseUser({ talent: 0, talentWalletMigrated: true })), {
    status: "alreadyMigrated",
    primaryOrgId: "org-1",
    userTalent: 0,
    rosterTalent: 40,
    nextRosterTalent: 40,
    writeUser: false,
    writeRoster: false,
  });
});

Deno.test("이전 완료 뒤 늦게 들어온 양수 환불 잔액도 다시 primary roster로 옮긴다", () => {
  assertEquals(
    decide(baseUser({ talent: 25, talentWalletMigrated: true })),
    {
      status: "migrated",
      primaryOrgId: "org-1",
      userTalent: 25,
      rosterTalent: 40,
      nextRosterTalent: 65,
      writeUser: true,
      writeRoster: true,
    },
  );
});

Deno.test("primary roster가 없고 users 지갑이 안전하면 무쓰기 상태로 분리한다", () => {
  assertEquals(decide(baseUser(), null), {
    status: "primaryMissing",
    primaryOrgId: "org-1",
    userTalent: 25,
    writeUser: false,
    writeRoster: false,
  });
  assertEquals(
    decide(baseUser({ talent: 0, talentWalletMigrated: true }), null),
    {
      status: "primaryMissing",
      primaryOrgId: "org-1",
      userTalent: 0,
      writeUser: false,
      writeRoster: false,
    },
  );
});

Deno.test("활성 개인 회원과 canonical primary roster만 허용한다", () => {
  for (
    const user of [
      null,
      baseUser({ isDeleted: true }),
      baseUser({ role: "churchAdmin" }),
      baseUser({ accountType: "church" }),
    ]
  ) {
    expectValidationError(() => decide(user), "USER_UNAVAILABLE");
  }
  for (
    const primaryOrgId of [null, "", " org-1", "org/1", ".", "a\n"]
  ) {
    expectValidationError(
      () => decide(baseUser({ primaryOrgId })),
      "INVALID_PRIMARY_ORG",
    );
  }
  for (
    const roster of [
      baseRoster({ uid: "other-user" }),
      baseRoster({ uid: undefined }),
      baseRoster({ isDeleted: true }),
    ]
  ) {
    expectValidationError(() => decide(baseUser(), roster), "INVALID_ROSTER");
  }
});

Deno.test("두 지갑은 0..1e9 safe integer이고 합계도 범위 안이어야 한다", () => {
  for (const talent of [-1, 1.5, "1", NaN, Infinity, 1_000_000_001]) {
    expectValidationError(
      () => decide(baseUser({ talent })),
      "INVALID_WALLET",
    );
    expectValidationError(
      () => decide(baseUser(), baseRoster({ talent })),
      "INVALID_WALLET",
    );
    expectValidationError(
      () => decide(baseUser({ talent }), null),
      "INVALID_WALLET",
    );
  }
  expectValidationError(
    () =>
      decide(
        baseUser({ talent: 1 }),
        baseRoster({ talent: MAX_PERSONAL_TALENT_WALLET_VALUE }),
      ),
    "INVALID_WALLET",
  );
  const maxBalanceDecision = decide(
    baseUser({ talent: 1 }),
    baseRoster({ talent: MAX_PERSONAL_TALENT_WALLET_VALUE - 1 }),
  );
  assert(
    maxBalanceDecision.status !== "primaryMissing" &&
      maxBalanceDecision.nextRosterTalent ===
        MAX_PERSONAL_TALENT_WALLET_VALUE,
  );
});

Deno.test("삭제 flag와 이전 flag의 malformed 값은 fail closed한다", () => {
  expectValidationError(
    () => decide(baseUser({ isDeleted: "false" })),
    "INVALID_USER",
  );
  expectValidationError(
    () => decide(baseUser({ talentWalletMigrated: "false" })),
    "INVALID_USER",
  );
  expectValidationError(
    () => decide(baseUser(), baseRoster({ isDeleted: "false" })),
    "INVALID_ROSTER",
  );
});
