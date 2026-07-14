const SERVICE_DAY_OFFSET_MS = 6 * 60 * 60 * 1000;
const KST_OFFSET_MS = 9 * 60 * 60 * 1000;
const ENGLISH_WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const ENGLISH_MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

const toTimestamp = (now: Date | number): number => {
  const timestamp = now instanceof Date ? now.getTime() : now;
  if (!Number.isFinite(timestamp)) throw new TypeError("INVALID_NOW");
  return timestamp;
};

/** Korea time is UTC+9 and the service day rolls over at 03:00, hence UTC now + 6h. */
export const getServiceDateKst = (now: Date | number = new Date()): string => {
  return new Date(toTimestamp(now) + SERVICE_DAY_OFFSET_MS).toISOString().slice(
    0,
    10,
  );
};

export const getServiceDateKey = (now: Date | number = new Date()): string =>
  getServiceDateKst(now).replaceAll("-", "");

/** Calendar date in Korea, rolling over at local midnight rather than the 03:00 service boundary. */
export const getCalendarDateKst = (now: Date | number = new Date()): string =>
  new Date(toTimestamp(now) + KST_OFFSET_MS).toISOString().slice(0, 10);

/** Legacy Date#toDateString-compatible value, generated without host locale or timezone dependence. */
export const getLegacyCalendarDateStringKst = (
  now: Date | number = new Date(),
): string => {
  const kst = new Date(toTimestamp(now) + KST_OFFSET_MS);
  return `${ENGLISH_WEEKDAYS[kst.getUTCDay()]} ${
    ENGLISH_MONTHS[kst.getUTCMonth()]
  } ${String(kst.getUTCDate()).padStart(2, "0")} ${kst.getUTCFullYear()}`;
};
