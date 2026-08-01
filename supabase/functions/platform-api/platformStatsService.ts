import { PlatformError } from "../_shared/errors.ts";
import {
  commitWrites,
  type FirestoreWrite,
  getDocument,
  listCollectionDocuments,
  updateWrite,
} from "../_shared/firestore.ts";
import { getLegacyCalendarDateStringKst } from "../_shared/time.ts";
import {
  normalizeAdminChurchDocumentId,
  UNAFFILIATED_CHURCH_ID,
} from "./adminChurchVisibilityCore.ts";
import {
  PLATFORM_STATS_READER_COUNTED_FIELD,
  shouldCountPlatformReader,
} from "./platformStatsCore.ts";

export const REBUILD_PLATFORM_STATS_ACTION = "rebuildPlatformStats" as const;
type RecordValue = Record<string, unknown>;
type Service = { token: string; projectId: string };
export type RebuildPlatformStatsDependencies = {
  getDocument: typeof getDocument;
  listCollectionDocuments: typeof listCollectionDocuments;
  commitWrites: typeof commitWrites;
  updateWrite: typeof updateWrite;
  now: () => Date;
};
const depsDefault: RebuildPlatformStatsDependencies = {
  getDocument,
  listCollectionDocuments,
  commitWrites,
  updateWrite,
  now: () => new Date(),
};
const safeCount = (value: unknown) =>
  Number.isSafeInteger(value) && Number(value) >= 0 ? Number(value) : 0;
const safeAdd = (left: number, right: number, label: string) => {
  const value = left + right;
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new PlatformError("CONFLICT", {
      message: `${label} 통계 값이 너무 큽니다.`,
    });
  }
  return value;
};

export const nextPlatformStatsAfterSignup = (
  current: RecordValue | null,
  input: { readerDelta: 0 | 1; churchDelta: 0 | 1; now: Date },
) => {
  const readCounter = (key: "total_readers" | "total_churches") => {
    const value = current?.[key];
    if (value === undefined && current === null) return 0;
    if (!Number.isSafeInteger(value) || Number(value) < 0) {
      throw new PlatformError("CONFLICT", {
        message:
          "플랫폼 통계 원장을 안전하게 갱신할 수 없습니다. 먼저 통계를 재계산해 주세요.",
      });
    }
    return Number(value);
  };
  const totalReaders = readCounter("total_readers") + input.readerDelta;
  const totalChurches = readCounter("total_churches") + input.churchDelta;
  if (
    !Number.isSafeInteger(totalReaders) || !Number.isSafeInteger(totalChurches)
  ) {
    throw new PlatformError("CONFLICT", {
      message: "플랫폼 통계 값이 너무 큽니다.",
    });
  }
  return {
    total_readers: totalReaders,
    total_churches: totalChurches,
    updatedAt: input.now,
  };
};

export const rebuildPlatformStats = async (
  service: Service,
  identity: { uid: string; anonymous: boolean },
  input: { dryRun: boolean },
  dependencies: RebuildPlatformStatsDependencies = depsDefault,
) => {
  const uid = normalizeAdminChurchDocumentId(identity?.uid);
  if (
    identity?.anonymous !== false || !uid || uid !== identity.uid ||
    typeof input?.dryRun !== "boolean"
  ) {
    throw new PlatformError("BAD_REQUEST");
  }
  const [actor, users, churches, externalSources, current] = await Promise.all([
    dependencies.getDocument<RecordValue>(
      service.token,
      service.projectId,
      `users/${uid}`,
    ),
    dependencies.listCollectionDocuments<RecordValue>(
      service.token,
      service.projectId,
      "users",
    ),
    dependencies.listCollectionDocuments<RecordValue>(
      service.token,
      service.projectId,
      "churches",
    ),
    dependencies.listCollectionDocuments<RecordValue>(
      service.token,
      service.projectId,
      "platformExternalStats",
    ),
    dependencies.getDocument<RecordValue>(
      service.token,
      service.projectId,
      "settings/platformStats",
    ),
  ]);
  if (
    !actor ||
    !["platformAdmin", "superAdmin"].includes(String(actor.data.role)) ||
    actor.data.isDeleted === true
  ) {
    throw new PlatformError("FORBIDDEN");
  }
  const transitioningChurch = churches.find(({ data }) =>
    data.lifecycleStatus === "deactivating" ||
    data.lifecycleStatus === "restoring"
  );
  if (transitioningChurch) {
    throw new PlatformError("CONFLICT", {
      message:
        "공동체 활성 상태 작업이 진행 중이라 통계를 재계산할 수 없습니다.",
    });
  }
  const activeUsers = users.filter(({ data }) =>
    shouldCountPlatformReader(data)
  );
  const markerBackfillDocuments = users.filter(({ data }) =>
    data[PLATFORM_STATS_READER_COUNTED_FIELD] !==
      shouldCountPlatformReader(data)
  );
  const markerBackfill = {
    total: markerBackfillDocuments.length,
    toCounted:
      markerBackfillDocuments.filter(({ data }) =>
        shouldCountPlatformReader(data)
      ).length,
    toUncounted:
      markerBackfillDocuments.filter(({ data }) =>
        !shouldCountPlatformReader(data)
      ).length,
  };
  const activeChurchIds = new Set(
    churches
      .filter(({ data, name }) =>
        data.isDeleted !== true && data.isVirtual !== true &&
        !name.endsWith(`/churches/${UNAFFILIATED_CHURCH_ID}`)
      )
      .map(({ name }) => name.split("/").at(-1) || ""),
  );
  const enabledExternalSources = externalSources.filter(({ data }) =>
    data.enabled === true &&
    typeof data.churchId === "string" &&
    activeChurchIds.has(data.churchId)
  );
  const now = dependencies.now();
  if (!(now instanceof Date) || !Number.isFinite(now.getTime())) {
    throw new PlatformError("INTERNAL");
  }
  const today = getLegacyCalendarDateStringKst(now);
  const externalTotal = (
    key: "total_readers" | "finished_total" | "readers_today",
    onlyToday = false,
  ) =>
    enabledExternalSources
      .filter(({ data }) => !onlyToday || data.today_date === today)
      .reduce(
        (sum, { data }) => safeAdd(sum, safeCount(data[key]), `외부 ${key}`),
        0,
      );
  const expected = {
    total_readers: safeAdd(
      activeUsers.length,
      externalTotal("total_readers"),
      "전체 독자",
    ),
    total_churches: activeChurchIds.size,
    readers_today: safeAdd(
      activeUsers.filter(({ data }) => data.lastReadDate === today).length,
      externalTotal("readers_today", true),
      "오늘 독자",
    ),
    finished_total: safeAdd(
      activeUsers.reduce((sum, { data }) => {
        const readCount = safeCount(data.readCount || 1);
        return safeAdd(sum, Math.max(readCount - 1, 0), "누적 완독");
      }, 0),
      externalTotal("finished_total"),
      "누적 완독",
    ),
    today_date: today,
  };
  const expectedKeys = Object.keys(expected) as Array<keyof typeof expected>;
  const currentValues = Object.fromEntries(
    expectedKeys.map((key) => [key, current?.data[key] ?? null]),
  );
  const changed = expectedKeys.filter((key) =>
    currentValues[key] !== expected[key]
  );
  const needsApply = changed.length > 0 || markerBackfill.total > 0;
  if (!input.dryRun && needsApply) {
    const markerBackfillNames = new Set(
      markerBackfillDocuments.map(({ name }) => name),
    );
    const userSnapshotWrites: FirestoreWrite[] = users.map((document) => {
      if (!document.updateTime) {
        throw new PlatformError("CONFLICT", {
          message: "사용자 통계 스냅샷을 안전하게 검증할 수 없습니다.",
        });
      }
      if (markerBackfillNames.has(document.name)) {
        return dependencies.updateWrite(
          service.projectId,
          document.name.split("/documents/")[1],
          {
            [PLATFORM_STATS_READER_COUNTED_FIELD]: shouldCountPlatformReader(
              document.data,
            ),
          },
          {
            updateMask: [PLATFORM_STATS_READER_COUNTED_FIELD],
            updateTime: document.updateTime,
          },
        );
      }
      return {
        verify: document.name,
        currentDocument: { updateTime: document.updateTime },
      };
    });
    const sourceVerifies: FirestoreWrite[] = [
      ...churches,
      ...externalSources,
    ].map((document) => {
      if (!document.updateTime) {
        throw new PlatformError("CONFLICT", {
          message: "통계 원본 스냅샷을 안전하게 검증할 수 없습니다.",
        });
      }
      return {
        verify: document.name,
        currentDocument: { updateTime: document.updateTime },
      };
    });
    const statsWrite = dependencies.updateWrite(
      service.projectId,
      "settings/platformStats",
      {
        ...expected,
        updatedAt: now,
        rebuiltAt: now,
        rebuiltBy: uid,
      },
      {
        updateMask: [
          ...expectedKeys,
          "updatedAt",
          "rebuiltAt",
          "rebuiltBy",
        ],
        ...(current
          ? { updateTime: current.updateTime }
          : { exists: false as const }),
      },
    );
    const writes = [...userSnapshotWrites, ...sourceVerifies, statsWrite];
    if (writes.length > 500) {
      throw new PlatformError("CONFLICT", {
        message: "통계 재계산 대상이 단일 안전 스냅샷 한도를 넘었습니다.",
      });
    }
    await dependencies.commitWrites(service.token, service.projectId, writes);
  }
  return {
    dryRun: input.dryRun,
    applied: !input.dryRun && needsApply,
    expected,
    current: currentValues,
    changed,
    markerBackfill,
    externalSources: enabledExternalSources.map(({ data, name }) => ({
      id: name.split("/").at(-1) || "",
      churchId: data.churchId,
      todayDate: typeof data.today_date === "string" ? data.today_date : null,
    })),
  };
};
