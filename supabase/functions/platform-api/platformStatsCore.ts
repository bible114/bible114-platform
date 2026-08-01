export const PLATFORM_STATS_READER_COUNTED_FIELD =
  "platformStatsReaderCounted" as const;

export const shouldCountPlatformReader = (
  user: Record<string, unknown>,
): boolean => user.isDeleted !== true && user.excludeFromPublicStats !== true;
