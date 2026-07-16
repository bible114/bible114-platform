import {
  decideEnsureUnaffiliatedChurch,
  type EnsureUnaffiliatedChurchActor,
  EnsureUnaffiliatedChurchValidationError,
  isCanonicalUnaffiliatedChurch,
  UNAFFILIATED_CHURCH_ID,
  UNAFFILIATED_CHURCH_NAME,
} from "./ensureUnaffiliatedChurchCore.ts";

const UID = "platform-admin-1";
const CREATED_AT = "2026-07-15T01:02:03.000Z";
const UPDATED_AT = "2026-07-16T03:04:05.000Z";
type Data = Record<string, unknown>;

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
const expectValidation = (
  callback: () => unknown,
  code: EnsureUnaffiliatedChurchValidationError["code"],
) => {
  try {
    callback();
    throw new Error(`expected ${code}`);
  } catch (error) {
    assert(
      error instanceof EnsureUnaffiliatedChurchValidationError &&
        error.code === code,
      `expected ${code}`,
    );
  }
};

const actor = (overrides: Data = {}): EnsureUnaffiliatedChurchActor => ({
  uid: UID,
  role: "platformAdmin",
  isDeleted: false,
  ...overrides,
});
const canonicalChurch = (overrides: Data = {}): Data => ({
  name: UNAFFILIATED_CHURCH_NAME,
  pastorName: "",
  denomination: "",
  isVirtual: true,
  departments: [{
    id: "personal",
    name: "개인 성도",
    color: "bg-emerald-500",
    subgroups: ["성경읽기 동행"],
  }],
  createdAt: CREATED_AT,
  updatedAt: UPDATED_AT,
  ...overrides,
});
const decide = (overrides: {
  authenticatedUid?: string;
  actor?: EnsureUnaffiliatedChurchActor | null;
  church?: unknown | null;
  legacyDirectory?: unknown | null;
  publicExists?: boolean;
  publicDirectoryMeta?: unknown | null;
} = {}) =>
  decideEnsureUnaffiliatedChurch({
    authenticatedUid: overrides.authenticatedUid ?? UID,
    actor: overrides.actor === undefined ? actor() : overrides.actor,
    church: overrides.church === undefined
      ? canonicalChurch()
      : overrides.church,
    legacyDirectory: overrides.legacyDirectory === undefined
      ? { churches: [{ id: "church-1", name: "교회" }], updatedAt: UPDATED_AT }
      : overrides.legacyDirectory,
    publicExists: overrides.publicExists ?? false,
    publicDirectoryMeta: overrides.publicDirectoryMeta === undefined
      ? {
        ready: true,
        mode: "public",
        schemaVersion: 1,
        count: 10,
        updatedAt: UPDATED_AT,
      }
      : overrides.publicDirectoryMeta,
  });

Deno.test("exact canonical virtual church와 디렉토리 무소속 부재는 no repair 상태다", () => {
  assert(isCanonicalUnaffiliatedChurch(canonicalChurch()));
  assertEquals(decide(), {
    churchExists: true,
    churchNeedsWrite: false,
    preservedCreatedAt: CREATED_AT,
    legacyExists: true,
    legacyNeedsWrite: false,
    legacyChurches: [{ id: "church-1", name: "교회" }],
    publicExists: false,
    publicMetaExists: true,
    publicMetaNeedsFallback: false,
  });
});

Deno.test("누락/손상 virtual church는 복구하고 유효 createdAt만 보존한다", () => {
  assertEquals(decide({ church: null }).preservedCreatedAt, null);
  assert(decide({ church: null }).churchNeedsWrite);
  const drift = decide({
    church: canonicalChurch({
      name: "가짜 이름",
      churchCode: "secret",
      adminUid: "legacy-admin",
    }),
  });
  assert(drift.churchNeedsWrite);
  assertEquals(drift.preservedCreatedAt, CREATED_AT);
  assertEquals(
    decide({ church: canonicalChurch({ createdAt: "bad" }) })
      .preservedCreatedAt,
    null,
  );
});

Deno.test("legacy directory는 무소속과 모든 추가/비밀 필드를 제거해 최소 투영한다", () => {
  const result = decide({
    legacyDirectory: {
      churches: [
        { id: UNAFFILIATED_CHURCH_ID, name: "노출되면 안 됨" },
        {
          id: "church-1",
          name: "교회",
          hidden: true,
          codeHash: "secret-hash",
          churchCodeHash: "secret-hash-2",
          churchCode: "secret-code",
          code: "legacy-code",
          arbitrary: "remove-me",
        },
      ],
      updatedAt: UPDATED_AT,
      rootSecret: "remove-root",
    },
  });
  assert(result.legacyNeedsWrite);
  assertEquals(result.legacyChurches, [
    { id: "church-1", name: "교회", hidden: true },
  ]);
});

Deno.test("canonical legacy root와 최소 투영은 no-op이고 hidden:false는 정리 대상이다", () => {
  const canonical = decide({
    legacyDirectory: {
      churches: [
        { id: "church-1", name: "교회" },
        { id: "church-2", name: "숨김 교회", hidden: true },
      ],
      updatedAt: UPDATED_AT,
    },
  });
  assert(!canonical.legacyNeedsWrite);
  assertEquals(canonical.legacyChurches, [
    { id: "church-1", name: "교회" },
    { id: "church-2", name: "숨김 교회", hidden: true },
  ]);

  const falseHidden = decide({
    legacyDirectory: {
      churches: [{ id: "church-1", name: "교회", hidden: false }],
    },
  });
  assert(falseHidden.legacyNeedsWrite);
  assertEquals(falseHidden.legacyChurches, [
    { id: "church-1", name: "교회" },
  ]);
});

Deno.test("legacy directory 누락은 빈 디렉토리를 새로 만들지 않는다", () => {
  assertEquals(decide({ legacyDirectory: null }), {
    churchExists: true,
    churchNeedsWrite: false,
    preservedCreatedAt: CREATED_AT,
    legacyExists: false,
    legacyNeedsWrite: false,
    legacyChurches: [],
    publicExists: false,
    publicMetaExists: true,
    publicMetaNeedsFallback: false,
  });
});

Deno.test("stale public 문서와 ready meta는 legacy fallback 대상으로 함께 전달한다", () => {
  const ready = decide({ publicExists: true });
  assert(ready.publicExists);
  assert(ready.publicMetaExists);
  assert(ready.publicMetaNeedsFallback);

  const alreadyFallback = decide({
    publicExists: true,
    publicDirectoryMeta: {
      ready: false,
      mode: "legacy",
      schemaVersion: 1,
      count: 10,
      updatedAt: UPDATED_AT,
    },
  });
  assert(!alreadyFallback.publicMetaNeedsFallback);

  const missingMeta = decide({
    publicExists: true,
    publicDirectoryMeta: null,
  });
  assert(!missingMeta.publicMetaExists);
  assert(!missingMeta.publicMetaNeedsFallback);
});

Deno.test("platformAdmin/superAdmin만 허용하고 actor 손상을 구분한다", () => {
  assert(decide({ actor: actor({ role: "superAdmin" }) }));
  expectValidation(
    () => decide({ actor: actor({ role: "churchAdmin" }) }),
    "ACTOR_UNAVAILABLE",
  );
  expectValidation(
    () => decide({ actor: actor({ isDeleted: true }) }),
    "ACTOR_UNAVAILABLE",
  );
  expectValidation(
    () => decide({ actor: actor({ uid: "other" }) }),
    "INVALID_ACTOR",
  );
  expectValidation(
    () => decide({ authenticatedUid: " platform-admin-1" }),
    "INVALID_IDENTITY",
  );
});

Deno.test("legacy directory churches 타입 손상은 무쓰기 fail closed한다", () => {
  for (const invalid of [{}, { churches: "bad" }, []]) {
    expectValidation(
      () => decide({ legacyDirectory: invalid }),
      "INVALID_DIRECTORY",
    );
  }
});

Deno.test("legacy entry의 duplicate/invalid id/name/hidden은 fail closed한다", () => {
  for (
    const invalid of [
      {
        churches: [
          { id: "church-1", name: "교회" },
          { id: "church-1", name: "중복 교회" },
        ],
      },
      { churches: [{ id: " church-1", name: "교회" }] },
      { churches: [{ id: "church/1", name: "교회" }] },
      { churches: [{ id: "church-1", name: " 교회" }] },
      { churches: [{ id: "church-1", name: "교회\n이름" }] },
      { churches: [{ id: "church-1", name: "교회", hidden: "yes" }] },
      {
        churches: [{ id: UNAFFILIATED_CHURCH_ID, name: "무소속" }, {
          id: UNAFFILIATED_CHURCH_ID,
          name: "무소속 중복",
        }],
      },
    ]
  ) {
    expectValidation(
      () => decide({ legacyDirectory: invalid }),
      "INVALID_DIRECTORY",
    );
  }
});

Deno.test("legacy root의 추가 필드나 invalid updatedAt은 fail이 아니라 scrub 대상이다", () => {
  for (
    const legacyDirectory of [
      {
        churches: [{ id: "church-1", name: "교회" }],
        rootSecret: "secret",
      },
      {
        churches: [{ id: "church-1", name: "교회" }],
        updatedAt: "invalid",
      },
    ]
  ) {
    const result = decide({ legacyDirectory });
    assert(result.legacyNeedsWrite);
    assertEquals(result.legacyChurches, [{ id: "church-1", name: "교회" }]);
  }
});

Deno.test("public directory meta는 canonical schema만 허용한다", () => {
  for (
    const invalid of [
      {},
      { ready: true, mode: "public", schemaVersion: 1 },
      { ready: false, mode: "other", schemaVersion: 1 },
      { ready: false, mode: "legacy", schemaVersion: 2 },
      { ready: false, mode: "legacy", schemaVersion: 1, count: -1 },
      {
        ready: false,
        mode: "legacy",
        schemaVersion: 1,
        extra: true,
      },
    ]
  ) {
    expectValidation(
      () => decide({ publicDirectoryMeta: invalid }),
      "INVALID_DIRECTORY",
    );
  }
});

Deno.test("server canonical 무소속 이름은 앱 확정 이름을 사용한다", () => {
  assertEquals(UNAFFILIATED_CHURCH_NAME, "성경 읽는 사람들");
  assert(isCanonicalUnaffiliatedChurch(canonicalChurch()));
  assert(
    !isCanonicalUnaffiliatedChurch(canonicalChurch({
      name: "개인 성도 (소속 교회 없음)",
    })),
  );
});
