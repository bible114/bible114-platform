import {
  getCalendarDateKst,
  getLegacyCalendarDateStringKst,
  getServiceDateKey,
  getServiceDateKst,
} from "./time.ts";

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

Deno.test("KST calendar date changes at local midnight", () => {
  const justBeforeMidnight = new Date("2026-07-14T14:59:59.999Z");
  const midnight = new Date("2026-07-14T15:00:00.000Z");
  assertEquals(getCalendarDateKst(justBeforeMidnight), "2026-07-14");
  assertEquals(getCalendarDateKst(midnight), "2026-07-15");
  assertEquals(
    getLegacyCalendarDateStringKst(justBeforeMidnight),
    "Tue Jul 14 2026",
  );
  assertEquals(getLegacyCalendarDateStringKst(midnight), "Wed Jul 15 2026");
});
