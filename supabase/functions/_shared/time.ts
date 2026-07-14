const SERVICE_DAY_OFFSET_MS = 6 * 60 * 60 * 1000;

/** Korea time is UTC+9 and the service day rolls over at 03:00, hence UTC now + 6h. */
export const getServiceDateKst = (now: Date | number = new Date()): string => {
  const timestamp = now instanceof Date ? now.getTime() : now;
  if (!Number.isFinite(timestamp)) throw new TypeError("INVALID_NOW");
  return new Date(timestamp + SERVICE_DAY_OFFSET_MS).toISOString().slice(0, 10);
};

export const getServiceDateKey = (now: Date | number = new Date()): string =>
  getServiceDateKst(now).replaceAll("-", "");
