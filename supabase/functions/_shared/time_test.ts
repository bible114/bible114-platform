import { getServiceDateKey, getServiceDateKst } from "./time.ts";

const assertEquals = (actual: unknown, expected: unknown) => {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(
      `expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`,
    );
  }
};

Deno.test("KST service day changes at 03:00", () => {
  assertEquals(
    getServiceDateKst(new Date("2026-07-13T17:59:59.999Z")),
    "2026-07-13",
  );
  assertEquals(
    getServiceDateKst(new Date("2026-07-13T18:00:00.000Z")),
    "2026-07-14",
  );
  assertEquals(
    getServiceDateKey(new Date("2026-07-13T18:00:00.000Z")),
    "20260714",
  );
});
