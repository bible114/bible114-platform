import {
  normalizeTalentProgram,
  parseRosterTalentWallets,
  resolveTalentProgram,
  resolveTalentWalletPrograms,
} from "./talentProgramCore.ts";

const assert = (condition: unknown, message: string) => {
  if (!condition) throw new Error(message);
};

const v2 = (overrides: Record<string, unknown> = {}) => ({
  schemaVersion: 2,
  enabled: true,
  departmentSettings: {
    adults: { enabled: true, marketId: "shared" },
    kids: { enabled: true, marketId: "shared" },
    youth: { enabled: false, marketId: "youth" },
  },
  markets: {
    shared: { id: "shared", enabled: true, items: [] },
    youth: { id: "youth", enabled: true, items: [] },
  },
  ...overrides,
});

Deno.test("v1은 상점 OFF와 부서 없는 레거시 계정도 기존처럼 적립한다", () => {
  const off = resolveTalentProgram({
    user: {},
    talentShop: { enabled: false },
  });
  assert(off.legacy && off.canEarnTalent, "v1 off earning parity mismatch");
  assert(!off.canUseMarket, "v1 off market must remain hidden");
  assert(
    resolveTalentProgram({ user: {}, talentShop: null }).canEarnTalent,
    "missing v1 document must retain legacy earning",
  );
  const on = resolveTalentProgram({
    user: { departmentId: "kids" },
    talentShop: { enabled: true, items: [{ id: "gift" }] },
  });
  assert(on.canEarnTalent && on.canUseMarket, "v1 enabled mismatch");
});

Deno.test("v2는 활성 부서와 존재하는 시장이 모두 있어야 적립한다", () => {
  assert(
    resolveTalentProgram({ user: { departmentId: "kids" }, talentShop: v2() })
      .canEarnTalent,
    "active shared department rejected",
  );
  assert(
    !resolveTalentProgram({ user: { departmentId: "youth" }, talentShop: v2() })
      .canEarnTalent,
    "disabled department earned talent",
  );
  assert(
    !resolveTalentProgram({
      user: { departmentId: "kids" },
      talentShop: v2({ markets: {} }),
    }).canEarnTalent,
    "missing market earned talent",
  );
});

Deno.test("공유 시장과 상점 OFF는 적립과 사용 가능 여부를 분리한다", () => {
  const program = resolveTalentProgram({
    user: {
      departmentId: "adults",
      extraMemberships: [{ departmentId: "kids" }],
      talentDepartmentId: "kids",
    },
    talentShop: v2({ enabled: false }),
  });
  assert(program.activeDepartments.length === 2, "shared departments missing");
  assert(program.selectedDepartmentId === "kids", "explicit selection missing");
  assert(program.canEarnTalent, "shop off must not disable earning");
  assert(!program.canUseMarket, "shop off market was usable");
  const marketOff = resolveTalentProgram({
    user: { departmentId: "kids" },
    talentShop: v2({
      markets: {
        shared: { id: "shared", enabled: false, items: [] },
        youth: { id: "youth", enabled: true, items: [] },
      },
    }),
  });
  assert(marketOff.canEarnTalent, "market off must not disable earning");
  assert(!marketOff.canUseMarket, "disabled market was usable");
});

Deno.test("주 소속과 추가 소속은 중복 제거하고 추가 소속을 최대 3개만 본다", () => {
  const normalized = normalizeTalentProgram(v2());
  assert(
    normalized.schemaVersion === 2 && !normalized.legacy,
    "v2 normalize failed",
  );
  const result = resolveTalentProgram({
    user: {
      departmentId: "adults",
      extraMemberships: [
        { departmentId: "adults" },
        { departmentId: "kids" },
        { departmentId: "youth" },
        { departmentId: "ignored" },
      ],
    },
    talentShop: v2(),
  });
  assert(
    result.activeDepartments.length === 2,
    "membership normalization mismatch",
  );
});

Deno.test("개인 계정 direct 없음과 여러 roster를 지갑별로 판정한다", () => {
  const routing = resolveTalentWalletPrograms({
    direct: null,
    rosters: [{
      user: { departmentId: "kids" },
      talentShop: v2(),
    }, {
      user: { departmentId: "youth" },
      talentShop: v2(),
    }, {
      user: {},
      talentShop: { enabled: false },
    }],
  });
  assert(!routing.directCanEarnTalent, "personal direct wallet enabled");
  assert(
    JSON.stringify(routing.rosterCanEarnTalent) ===
      JSON.stringify([true, false, true]),
    "per-roster routing mismatch",
  );
  assert(routing.canEarnAny, "personal roster reward missing");
});

Deno.test("roster 원장은 인증 uid·정규 경로·고유 org를 검증한 뒤 정렬한다", () => {
  const document = (orgId: string, uid = "user-1") => ({
    name:
      `projects/p/databases/(default)/documents/churches/${orgId}/roster/${uid}`,
    data: { uid, departmentId: "kids" },
  });
  const parsed = parseRosterTalentWallets([
    document("church-b"),
    document("church-a"),
  ], "user-1");
  assert(parsed.ok, "valid roster rejected");
  if (parsed.ok) {
    assert(parsed.wallets[0].orgId === "church-a", "rosters not sorted");
  }
  const mixedCase = parseRosterTalentWallets([
    document("aOrg"),
    document("BOrg"),
  ], "user-1");
  assert(mixedCase.ok, "mixed-case roster rejected");
  if (mixedCase.ok) {
    assert(
      mixedCase.wallets.map(({ orgId }) => orgId).join(",") === "BOrg,aOrg",
      "roster order must use deterministic code-point comparison",
    );
  }
  assert(
    !parseRosterTalentWallets([document("church-a", "other")], "user-1").ok,
    "foreign uid accepted",
  );
  assert(
    !parseRosterTalentWallets([document(" church-a")], "user-1").ok &&
      !parseRosterTalentWallets([document("x".repeat(129))], "user-1").ok &&
      !parseRosterTalentWallets([{
        ...document("church-a"),
        data: { uid: " user-1", departmentId: "kids" },
      }], "user-1").ok,
    "non-canonical roster identity accepted",
  );
  assert(
    !parseRosterTalentWallets(
      [document("church-a"), document("church-a")],
      "user-1",
    ).ok,
    "duplicate org accepted",
  );
  assert(
    !parseRosterTalentWallets([
      document("a"),
      document("b"),
      document("c"),
      document("d"),
    ], "user-1").ok,
    "fourth roster accepted",
  );
});
