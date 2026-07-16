import {
  type AdminChurchVisibilityActor,
  type AdminChurchVisibilityChurch,
  AdminChurchVisibilityValidationError,
  decideAdminChurchVisibility,
} from "./adminChurchVisibilityCore.ts";

const UID = "platform-admin-1";
const CHURCH_ID = "church-1";
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
  code: AdminChurchVisibilityValidationError["code"],
) => {
  try {
    callback();
    throw new Error(`expected ${code}`);
  } catch (error) {
    assert(
      error instanceof AdminChurchVisibilityValidationError &&
        error.code === code,
      `expected ${code}`,
    );
  }
};

const actor = (overrides: Data = {}): AdminChurchVisibilityActor => ({
  uid: UID,
  role: "platformAdmin",
  isDeleted: false,
  ...overrides,
});
const church = (overrides: Data = {}): AdminChurchVisibilityChurch => ({
  name: "테스트 교회",
  isDeleted: false,
  hiddenFromDirectory: false,
  ...overrides,
});
const directory = (churches: unknown[] = [
  { id: CHURCH_ID, name: "테스트 교회" },
  { id: "church-2", name: "두 번째 교회", hidden: true },
]) => ({ churches, updatedAt: UPDATED_AT });
const decide = (overrides: {
  authenticatedUid?: string;
  actor?: AdminChurchVisibilityActor | null;
  churchId?: string;
  church?: AdminChurchVisibilityChurch | null;
  legacyDirectory?: unknown;
  publicChurch?: unknown | null;
  hidden?: boolean;
} = {}) =>
  decideAdminChurchVisibility({
    authenticatedUid: overrides.authenticatedUid ?? UID,
    actor: overrides.actor === undefined ? actor() : overrides.actor,
    churchId: overrides.churchId ?? CHURCH_ID,
    church: overrides.church === undefined ? church() : overrides.church,
    legacyDirectory: overrides.legacyDirectory === undefined
      ? directory()
      : overrides.legacyDirectory,
    publicChurch: overrides.publicChurch === undefined
      ? { id: CHURCH_ID, name: "테스트 교회" }
      : overrides.publicChurch,
    hidden: overrides.hidden ?? true,
  });

Deno.test("숨김 변경은 교회 이름을 권위로 minimal legacy/public 투영을 만든다", () => {
  assertEquals(
    decide({
      legacyDirectory: directory([
        {
          id: CHURCH_ID,
          name: "옛 표시 이름",
          codeHash: "secret-hash-must-be-dropped",
        },
        {
          id: "church-2",
          name: "두 번째 교회",
          hidden: true,
          churchCode: "private-code-must-be-dropped",
        },
      ]),
      publicChurch: {
        id: CHURCH_ID,
        name: "옛 표시 이름",
        codeHash: "must-not-survive",
      },
    }),
    {
      status: "updated",
      hidden: true,
      projection: { id: CHURCH_ID, name: "테스트 교회", hidden: true },
      legacyChurches: [
        { id: CHURCH_ID, name: "테스트 교회", hidden: true },
        { id: "church-2", name: "두 번째 교회", hidden: true },
      ],
      publicExists: true,
    },
  );
});

Deno.test("모든 투영이 exact하면 alreadySet no-op이고 false hidden은 필드를 생략한다", () => {
  assertEquals(
    decide({
      hidden: false,
      church: church({ hiddenFromDirectory: false }),
      legacyDirectory: directory(),
      publicChurch: { id: CHURCH_ID, name: "테스트 교회" },
    }),
    {
      status: "alreadySet",
      hidden: false,
      projection: { id: CHURCH_ID, name: "테스트 교회" },
      legacyChurches: [
        { id: CHURCH_ID, name: "테스트 교회" },
        { id: "church-2", name: "두 번째 교회", hidden: true },
      ],
      publicExists: true,
    },
  );
});

Deno.test("legacy target와 public 문서 누락은 canonical projection 복구 대상으로 판정한다", () => {
  const result = decide({
    legacyDirectory: directory([
      { id: "church-2", name: "두 번째 교회" },
    ]),
    publicChurch: null,
  });
  assert(result.status === "updated");
  assert(result.publicExists === false);
  assertEquals(result.legacyChurches, [
    { id: "church-2", name: "두 번째 교회" },
    { id: CHURCH_ID, name: "테스트 교회", hidden: true },
  ]);

  const publicOnlyDrift = decide({
    hidden: false,
    church: church({ hiddenFromDirectory: false }),
    legacyDirectory: directory(),
    publicChurch: null,
  });
  assert(publicOnlyDrift.status === "updated");
  assert(publicOnlyDrift.publicExists === false);
  assertEquals(publicOnlyDrift.projection, {
    id: CHURCH_ID,
    name: "테스트 교회",
  });
});

Deno.test("platformAdmin과 superAdmin의 active canonical actor만 허용한다", () => {
  assert(decide({ actor: actor({ role: "superAdmin" }) }));
  assert(decide({ actor: actor({ isDeleted: undefined }) }));
  for (
    const invalid of [
      null,
      actor({ uid: "other" }),
      actor({ role: "churchAdmin" }),
      actor({ isDeleted: true }),
      actor({ isDeleted: "false" }),
    ]
  ) {
    expectValidation(
      () => decide({ actor: invalid as AdminChurchVisibilityActor | null }),
      invalid === null || (invalid as AdminChurchVisibilityActor).role ===
          "churchAdmin" ||
        (invalid as AdminChurchVisibilityActor).isDeleted === true
        ? "ACTOR_UNAVAILABLE"
        : "INVALID_ACTOR",
    );
  }
  expectValidation(
    () => decide({ authenticatedUid: " platform-admin-1" }),
    "INVALID_IDENTITY",
  );
});

Deno.test("삭제·무소속·손상 이름/상태 교회는 fail closed한다", () => {
  expectValidation(() => decide({ church: null }), "CHURCH_UNAVAILABLE");
  expectValidation(
    () => decide({ church: church({ isDeleted: true }) }),
    "CHURCH_UNAVAILABLE",
  );
  for (
    const invalidChurch of [
      church({ isDeleted: "false" }),
      church({ name: " 잘못된 이름" }),
      church({ name: "" }),
      church({ hiddenFromDirectory: "true" }),
    ]
  ) {
    expectValidation(
      () => decide({ church: invalidChurch }),
      "INVALID_CHURCH",
    );
  }
  expectValidation(
    () => decide({ churchId: "unaffiliated_v1" }),
    "INVALID_CHURCH",
  );
});

Deno.test("legacy 전체 배열의 중복·스키마·타입 손상은 fail closed한다", () => {
  const malformed = [
    null,
    {},
    { churches: "not-array", updatedAt: UPDATED_AT },
    { churches: [], updatedAt: "2026-02-30T00:00:00Z" },
    { churches: [], updatedAt: UPDATED_AT, extra: true },
    directory([{ id: CHURCH_ID, name: "테스트 교회", unknown: true }]),
    directory([
      { id: CHURCH_ID, name: "테스트 교회" },
      { id: CHURCH_ID, name: "중복" },
    ]),
    directory([{ id: "bad/id", name: "테스트 교회" }]),
    directory([{ id: "unaffiliated_v1", name: "무소속" }]),
    directory([{ id: CHURCH_ID, name: " 테스트 교회" }]),
    directory([{ id: CHURCH_ID, name: "테스트 교회", hidden: "true" }]),
  ];
  malformed.forEach((legacyDirectory) =>
    expectValidation(
      () => decide({ legacyDirectory }),
      "INVALID_DIRECTORY",
    )
  );
});

Deno.test("public projection의 extra/secret/false hidden은 exact 교체 대상으로 판정한다", () => {
  for (
    const publicChurch of [
      { id: CHURCH_ID, name: "테스트 교회", hidden: false },
      { id: CHURCH_ID, name: "테스트 교회", secret: "x" },
      { id: "other", name: "테스트 교회" },
    ]
  ) {
    const result = decide({
      hidden: false,
      church: church({ hiddenFromDirectory: false }),
      publicChurch,
    });
    assert(result.status === "updated");
    assertEquals(result.projection, {
      id: CHURCH_ID,
      name: "테스트 교회",
    });
  }
});

Deno.test("church hidden 필드가 누락되면 false 요청도 exact materialize 대상이다", () => {
  const result = decide({
    hidden: false,
    church: church({ hiddenFromDirectory: undefined }),
    publicChurch: { id: CHURCH_ID, name: "테스트 교회" },
  });
  assert(result.status === "updated");
});
