import {
  decideRotateChurchAccessCode,
  inspectRotateChurchAccessCode,
  type RotateChurchAccessCodeAccess,
  type RotateChurchAccessCodeActor,
  type RotateChurchAccessCodeAdminProof,
  type RotateChurchAccessCodeChurch,
  RotateChurchAccessCodeValidationError,
} from "./rotateChurchAccessCodeCore.ts";

const UID = "church-admin-1";
const CHURCH_ID = "church-1";
const HASH = "a".repeat(64);
const OLD_HASH = "b".repeat(64);
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
  code: RotateChurchAccessCodeValidationError["code"],
) => {
  try {
    callback();
    throw new Error(`expected ${code}`);
  } catch (error) {
    assert(
      error instanceof RotateChurchAccessCodeValidationError &&
        error.code === code,
      `expected ${code}`,
    );
  }
};

const actor = (overrides: Data = {}): RotateChurchAccessCodeActor => ({
  uid: UID,
  role: "churchAdmin",
  churchId: CHURCH_ID,
  isDeleted: false,
  ...overrides,
});
const church = (overrides: Data = {}): RotateChurchAccessCodeChurch => ({
  name: "테스트 교회",
  isDeleted: false,
  adminUid: UID,
  ...overrides,
});
const proof = (overrides: Data = {}): RotateChurchAccessCodeAdminProof => ({
  adminUid: UID,
  adminEmail: "admin@example.invalid",
  updatedAt: UPDATED_AT,
  ...overrides,
});
const access = (overrides: Data = {}): RotateChurchAccessCodeAccess => ({
  codeHash: OLD_HASH,
  version: 3,
  updatedAt: UPDATED_AT,
  ...overrides,
});
const decide = (overrides: {
  authenticatedUid?: string;
  actor?: RotateChurchAccessCodeActor | null;
  churchId?: string;
  church?: RotateChurchAccessCodeChurch | null;
  privateAdmin?: RotateChurchAccessCodeAdminProof | null;
  access?: RotateChurchAccessCodeAccess | null;
  expectedVersion?: number;
  nextCodeHash?: string;
} = {}) =>
  decideRotateChurchAccessCode({
    authenticatedUid: overrides.authenticatedUid ?? UID,
    actor: overrides.actor === undefined ? actor() : overrides.actor,
    churchId: overrides.churchId ?? CHURCH_ID,
    church: overrides.church === undefined ? church() : overrides.church,
    privateAdmin: overrides.privateAdmin === undefined
      ? proof()
      : overrides.privateAdmin,
    access: overrides.access === undefined ? access() : overrides.access,
    expectedVersion: overrides.expectedVersion ?? 3,
    nextCodeHash: overrides.nextCodeHash ?? HASH,
  });

Deno.test("private/admin 소유 증명이 맞는 active churchAdmin은 version을 1 증가시킨다", () => {
  assertEquals(decide(), {
    accessExists: true,
    currentVersion: 3,
    currentCodeHash: OLD_HASH,
    nextVersion: 4,
    nextCodeHash: HASH,
  });
});

Deno.test("private/access 누락과 legacy version 없는 access는 version 0으로 본다", () => {
  assertEquals(decide({ access: null, expectedVersion: 0 }), {
    accessExists: false,
    currentVersion: 0,
    currentCodeHash: "",
    nextVersion: 1,
    nextCodeHash: HASH,
  });
  assertEquals(
    decide({
      access: { codeHash: OLD_HASH, updatedAt: UPDATED_AT },
      expectedVersion: 0,
    }).nextVersion,
    1,
  );
});

Deno.test("private/admin이 없을 때만 church.adminUid legacy 증명을 허용한다", () => {
  assert(decide({ privateAdmin: null }));
  expectValidation(
    () =>
      decide({
        privateAdmin: null,
        church: church({ adminUid: "other" }),
      }),
    "ADMIN_PROOF_UNAVAILABLE",
  );
});

Deno.test("private/admin drift는 legacy가 맞아도 churchAdmin이 우회할 수 없다", () => {
  expectValidation(
    () => decide({ privateAdmin: proof({ adminUid: "other" }) }),
    "ADMIN_PROOF_UNAVAILABLE",
  );
  expectValidation(
    () => decide({ privateAdmin: proof({ updatedAt: "bad" }) }),
    "INVALID_ADMIN_PROOF",
  );
});

Deno.test("active platformAdmin/superAdmin은 private/admin drift를 우회한다", () => {
  for (const role of ["platformAdmin", "superAdmin"]) {
    assert(
      decide({
        actor: actor({ role, churchId: "other" }),
        privateAdmin: proof({ adminUid: "other", updatedAt: "bad" }),
      }),
    );
  }
});

Deno.test("교회 관리자 actor 교회 불일치와 비활성/일반 actor를 거부한다", () => {
  expectValidation(
    () => decide({ actor: actor({ churchId: "other" }) }),
    "ADMIN_PROOF_UNAVAILABLE",
  );
  expectValidation(
    () => decide({ actor: actor({ isDeleted: true }) }),
    "ACTOR_UNAVAILABLE",
  );
  expectValidation(
    () => decide({ actor: actor({ role: "member" }) }),
    "ACTOR_UNAVAILABLE",
  );
  expectValidation(
    () => decide({ actor: actor({ uid: "other" }) }),
    "INVALID_ACTOR",
  );
});

Deno.test("삭제/가상/무소속/손상 교회는 fail closed한다", () => {
  expectValidation(() => decide({ church: null }), "CHURCH_UNAVAILABLE");
  expectValidation(
    () => decide({ church: church({ isDeleted: true }) }),
    "CHURCH_UNAVAILABLE",
  );
  for (
    const invalid of [
      church({ name: " bad" }),
      church({ isDeleted: "false" }),
      church({ isVirtual: true }),
    ]
  ) {
    expectValidation(() => decide({ church: invalid }), "INVALID_CHURCH");
  }
  expectValidation(
    () => decide({ churchId: "unaffiliated_v1" }),
    "INVALID_CHURCH",
  );
});

Deno.test("access 손상과 stale expectedVersion을 구분해 거부한다", () => {
  for (
    const invalid of [
      access({ version: -1 }),
      access({ version: 1.5 }),
      access({ codeHash: "short" }),
      access({ codeHash: "", version: 1 }),
      access({ updatedAt: "2026-02-30T00:00:00Z" }),
    ]
  ) {
    expectValidation(() => decide({ access: invalid }), "INVALID_ACCESS");
  }
  expectValidation(
    () => decide({ expectedVersion: 2 }),
    "VERSION_CONFLICT",
  );
  expectValidation(
    () => decide({ nextCodeHash: "short" }),
    "INVALID_HASH",
  );
});

Deno.test("inspection은 replay 검증용으로 expectedVersion 없이 권한과 현재 access를 확인한다", () => {
  assertEquals(
    inspectRotateChurchAccessCode({
      authenticatedUid: UID,
      actor: actor(),
      churchId: CHURCH_ID,
      church: church(),
      privateAdmin: proof(),
      access: access(),
    }),
    { accessExists: true, currentVersion: 3, currentCodeHash: OLD_HASH },
  );
});
