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
  input: { readerDelta: 1; churchDelta: 0 | 1; now: Date },
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
  const activeUsers = users.filter(({ data }) => data.isDeleted !== true);
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
  const today = getLegacyCalendarDateStringKst(dependencies.now());
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
  if (!input.dryRun && changed.length > 0) {
    if (users.length + churches.length + externalSources.length > 480) {
      throw new PlatformError("CONFLICT", {
        message: "통계 재계산 대상이 단일 안전 스냅샷 한도를 넘었습니다.",
      });
    }
    const verifies: FirestoreWrite[] = [
      ...users,
      ...churches,
      ...externalSources,
    ]
      .filter((document) => document.updateTime)
      .map((document) => ({
        verify: document.name,
        currentDocument: { updateTime: document.updateTime },
      }));
    await dependencies.commitWrites(service.token, service.projectId, [
      ...verifies,
      dependencies.updateWrite(service.projectId, "settings/platformStats", {
        ...expected,
        updatedAt: dependencies.now(),
        rebuiltAt: dependencies.now(),
        rebuiltBy: uid,
      }, current ? { updateTime: current.updateTime } : { exists: false }),
    ]);
  }
  return {
    dryRun: input.dryRun,
    applied: !input.dryRun && changed.length > 0,
    expected,
    current: currentValues,
    changed,
    externalSources: enabledExternalSources.map(({ data, name }) => ({
      id: name.split("/").at(-1) || "",
      churchId: data.churchId,
      todayDate: data.today_date,
    })),
  };
};
