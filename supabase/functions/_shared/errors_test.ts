import { errorPayload, PlatformError, toPlatformError } from "./errors.ts";

const assertEquals = (actual: unknown, expected: unknown) => {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error("values differ");
  }
};

Deno.test("platform errors expose stable status and retry classification", () => {
  const rateLimited = new PlatformError("RATE_LIMITED");
  assertEquals([rateLimited.status, rateLimited.retryable], [429, true]);
  assertEquals(
    errorPayload(new PlatformError("BAD_REQUEST")).error.code,
    "BAD_REQUEST",
  );
  assertEquals(toPlatformError(new Error("secret detail")).code, "INTERNAL");
});

Deno.test("public error payload never exposes internal details", () => {
  const error = new PlatformError("FIRESTORE_READ_FAILED", {
    details: { status: 502, path: "users/private-user/private/auth" },
  });
  const payload = errorPayload(error);
  assertEquals("details" in payload.error, false);
  assertEquals(JSON.stringify(payload).includes("private-user"), false);
  assertEquals(error.details?.path, "users/private-user/private/auth");
});
