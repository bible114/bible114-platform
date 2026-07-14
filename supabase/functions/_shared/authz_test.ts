import {
  isPlatformRole,
  normalizeRole,
  requireOrganizationAdmin,
  requireRole,
} from "./authz.ts";
import { PlatformError } from "./errors.ts";

const assert = (condition: unknown, message = "assertion failed") => {
  if (!condition) throw new Error(message);
};

Deno.test("role guards default unknown roles to members and reject deleted users", () => {
  assert(normalizeRole("unexpected") === "member");
  assert(normalizeRole("member") === "member");
  assert(
    requireRole({ role: "churchAdmin" }, ["churchAdmin"]) === "churchAdmin",
  );
  assert(isPlatformRole("superAdmin"));
  try {
    requireRole({ role: "superAdmin", isDeleted: true }, ["superAdmin"]);
    throw new Error("expected rejection");
  } catch (error) {
    assert(error instanceof PlatformError && error.code === "FORBIDDEN");
  }
});

Deno.test("organization guard permits only the matching church admin or platform role", () => {
  requireOrganizationAdmin(
    { role: "churchAdmin", churchId: "church-a" },
    "church-a",
  );
  requireOrganizationAdmin({ role: "platformAdmin" }, "church-a");
  try {
    requireOrganizationAdmin(
      { role: "churchAdmin", churchId: "church-b" },
      "church-a",
    );
    throw new Error("expected rejection");
  } catch (error) {
    assert(error instanceof PlatformError && error.code === "FORBIDDEN");
  }
});
