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
  const [actor, users, churches, current] = await Promise.all([
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
  const today = getLegacyCalendarDateStringKst(dependencies.now());
  const expected = {
    total_readers: activeUsers.length,
    total_churches:
      churches.filter(({ data, name }) =>
        data.isDeleted !== true && data.isVirtual !== true &&
        !name.endsWith(`/churches/${UNAFFILIATED_CHURCH_ID}`)
      ).length,
    readers_today:
      activeUsers.filter(({ data }) => data.lastReadDate === today).length,
    finished_total: activeUsers.reduce((sum, { data }) => {
      const readCount = safeCount(data.readCount || 1);
      const next = sum + Math.max(readCount - 1, 0);
      if (!Number.isSafeInteger(next)) {
        throw new PlatformError("CONFLICT", {
          message: "누적 완독 수가 너무 큽니다.",
        });
      }
      return next;
    }, 0),
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
    if (users.length + churches.length > 480) {
      throw new PlatformError("CONFLICT", {
        message: "통계 재계산 대상이 단일 안전 스냅샷 한도를 넘었습니다.",
      });
    }
    const verifies: FirestoreWrite[] = [...users, ...churches]
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
  };
};
