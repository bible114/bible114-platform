import { PlatformError } from "../_shared/errors.ts";
import {
  beginTransaction,
  commitWrites,
  getDocument,
  listCollectionDocuments,
  rollbackTransaction,
  updateWrite,
} from "../_shared/firestore.ts";
import {
  normalizeAdminChurchDocumentId,
  UNAFFILIATED_CHURCH_ID,
} from "./adminChurchVisibilityCore.ts";
import {
  PLATFORM_STATS_READER_COUNTED_FIELD,
  shouldCountPlatformReader,
} from "./platformStatsCore.ts";

export const ADMIN_SET_CHURCH_LIFECYCLE_ACTION =
  "adminSetChurchLifecycle" as const;
export const ADMIN_CHURCH_LIFECYCLE_RELEASE_BLOCKED = true as const;
const REQUEST_ID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MAX_BATCH_WRITES = 400;
type RecordValue = Record<string, unknown>;
type Service = { token: string; projectId: string };
export type AdminChurchLifecycleIdentity = { uid: string; anonymous: boolean };
export type AdminChurchLifecycleInput = {
  requestId: string;
  churchId: string;
  active: boolean;
};
export type AdminChurchLifecycleResult = {
  status: "deactivated" | "restored" | "alreadySet";
  churchId: string;
  active: boolean;
  affectedUsers: number;
  positiveRosterCount: number;
  positiveTalentTotal: number;
  pendingPurchaseCount: number;
};
export type AdminChurchLifecycleDependencies = {
  beginTransaction: typeof beginTransaction;
  commitWrites: typeof commitWrites;
  getDocument: typeof getDocument;
  listCollectionDocuments: typeof listCollectionDocuments;
  rollbackTransaction: typeof rollbackTransaction;
  updateWrite: typeof updateWrite;
  now: () => Date;
};
const DEFAULT_DEPENDENCIES: AdminChurchLifecycleDependencies = {
  beginTransaction,
  commitWrites,
  getDocument,
  listCollectionDocuments,
  rollbackTransaction,
  updateWrite,
  now: () => new Date(),
};
const isRecord = (value: unknown): value is RecordValue =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value);
const conflict = (message: string) =>
  new PlatformError("CONFLICT", { message });
const documentId = (name: string) =>
  decodeURIComponent(name.split("/documents/")[1]?.split("/").at(-1) || "");

const validateInput = (
  identity: AdminChurchLifecycleIdentity,
  input: AdminChurchLifecycleInput,
) => {
  if (identity?.anonymous !== false) {
    throw new PlatformError("ANONYMOUS_NOT_ALLOWED");
  }
  const uid = normalizeAdminChurchDocumentId(identity?.uid);
  const churchId = normalizeAdminChurchDocumentId(input?.churchId);
  if (
    !uid || uid !== identity.uid || !isRecord(input) ||
    Object.keys(input).sort().join(",") !== "active,churchId,requestId" ||
    typeof input.requestId !== "string" ||
    !REQUEST_ID_PATTERN.test(input.requestId) ||
    !churchId || churchId !== input.churchId ||
    churchId === UNAFFILIATED_CHURCH_ID ||
    typeof input.active !== "boolean"
  ) throw new PlatformError("BAD_REQUEST");
  return { uid, churchId, requestId: input.requestId, active: input.active };
};

const validateActor = (uid: string, actor: RecordValue | null) => {
  if (
    !actor || !["platformAdmin", "superAdmin"].includes(String(actor.role)) ||
    actor.isDeleted === true
  ) {
    throw new PlatformError("FORBIDDEN");
  }
  if (actor.uid != null && actor.uid !== uid) {
    throw conflict("관리자 식별자가 로그인과 일치하지 않습니다.");
  }
};

const directoryProjection = (
  value: unknown,
  churchId: string,
  active: boolean,
) => {
  if (!isRecord(value) || !Array.isArray(value.churches)) {
    throw conflict("공개 공동체 목록이 올바르지 않습니다.");
  }
  let found = false;
  const churches = value.churches.map((entry) => {
    if (
      !isRecord(entry) || typeof entry.id !== "string" ||
      typeof entry.name !== "string"
    ) {
      throw conflict("공개 공동체 항목이 올바르지 않습니다.");
    }
    if (entry.id !== churchId) {
      return {
        id: entry.id,
        name: entry.name,
        ...(entry.hidden === true ? { hidden: true } : {}),
      };
    }
    found = true;
    return {
      id: entry.id,
      name: entry.name,
      ...(!active ? { hidden: true } : {}),
    };
  });
  if (!found) throw conflict("공개 공동체 목록에서 대상을 찾을 수 없습니다.");
  return churches;
};

const settlement = (
  rosters: Array<{ data: RecordValue }>,
  purchases: Array<{ data: RecordValue }>,
) => {
  let positiveRosterCount = 0;
  let positiveTalentTotal = 0;
  for (const { data } of rosters) {
    const talent = data.talent ?? 0;
    if (!Number.isSafeInteger(talent) || Number(talent) < 0) {
      throw conflict("공동체 달란트 잔액이 올바르지 않습니다.");
    }
    if (Number(talent) > 0) {
      positiveRosterCount += 1;
      positiveTalentTotal += Number(talent);
    }
    if (!Number.isSafeInteger(positiveTalentTotal)) {
      throw conflict("공동체 달란트 합계를 계산할 수 없습니다.");
    }
  }
  return {
    positiveRosterCount,
    positiveTalentTotal,
    pendingPurchaseCount:
      purchases.filter(({ data }) => data.status === "pending").length,
  };
};

export const adminSetChurchLifecycle = async (
  service: Service,
  identity: AdminChurchLifecycleIdentity,
  rawInput: AdminChurchLifecycleInput,
  dependencies: AdminChurchLifecycleDependencies = DEFAULT_DEPENDENCIES,
): Promise<AdminChurchLifecycleResult> => {
  const input = validateInput(identity, rawInput);
  if (ADMIN_CHURCH_LIFECYCLE_RELEASE_BLOCKED) {
    throw conflict(
      "외부 공동체 통계까지 원자적으로 정산하는 동안 공동체 비활성화·복원은 일시 중단되었습니다.",
    );
  }
  const [
    actorDoc,
    churchDoc,
    users,
    rosters,
    purchases,
    directoryDoc,
    publicDoc,
    ledgerDoc,
  ] = await Promise.all([
    dependencies.getDocument<RecordValue>(
      service.token,
      service.projectId,
      `users/${input.uid}`,
    ),
    dependencies.getDocument<RecordValue>(
      service.token,
      service.projectId,
      `churches/${input.churchId}`,
    ),
    dependencies.listCollectionDocuments<RecordValue>(
      service.token,
      service.projectId,
      "users",
    ),
    dependencies.listCollectionDocuments<RecordValue>(
      service.token,
      service.projectId,
      `churches/${input.churchId}/roster`,
    ),
    dependencies.listCollectionDocuments<RecordValue>(
      service.token,
      service.projectId,
      `churches/${input.churchId}/talentPurchases`,
    ),
    dependencies.getDocument<RecordValue>(
      service.token,
      service.projectId,
      "settings/churchDirectory",
    ),
    dependencies.getDocument<RecordValue>(
      service.token,
      service.projectId,
      `publicChurches/${input.churchId}`,
    ),
    dependencies.getDocument<RecordValue>(
      service.token,
      service.projectId,
      `platformAdminActions/${input.requestId}`,
    ),
  ]);
  validateActor(input.uid, actorDoc?.data || null);
  if (
    !churchDoc || !isRecord(churchDoc.data) ||
    typeof churchDoc.data.name !== "string" || churchDoc.data.isVirtual === true
  ) {
    throw new PlatformError("NOT_FOUND", {
      message: "변경할 공동체를 찾을 수 없습니다.",
    });
  }
  const currentActive = churchDoc.data.isDeleted !== true;
  const lifecycleStatus = typeof churchDoc.data.lifecycleStatus === "string"
    ? churchDoc.data.lifecycleStatus
    : "";
  const storedGeneration =
    typeof churchDoc.data.deactivationGeneration === "string"
      ? churchDoc.data.deactivationGeneration
      : "";
  const resumingDeactivation = !input.active && !currentActive &&
    lifecycleStatus === "deactivating" &&
    REQUEST_ID_PATTERN.test(storedGeneration);
  const resumingRestoration = input.active && !currentActive &&
    lifecycleStatus === "restoring" &&
    REQUEST_ID_PATTERN.test(storedGeneration);
  const summary = settlement(rosters, purchases);
  if (ledgerDoc) {
    const ledger = ledgerDoc.data;
    if (
      ledger.action !== ADMIN_SET_CHURCH_LIFECYCLE_ACTION ||
      ledger.actorUid !== input.uid ||
      ledger.churchId !== input.churchId || ledger.active !== input.active ||
      !isRecord(ledger.result)
    ) {
      throw conflict("같은 요청 번호가 다른 작업에 사용되었습니다.");
    }
    return ledger.result as AdminChurchLifecycleResult;
  }
  if (
    ["deactivating", "restoring"].includes(lifecycleStatus) &&
    !resumingDeactivation && !resumingRestoration
  ) {
    throw conflict("다른 공동체 활성 상태 작업이 진행 중입니다.");
  }
  if (
    currentActive === input.active &&
    !resumingDeactivation && !resumingRestoration
  ) {
    return {
      status: "alreadySet",
      churchId: input.churchId,
      active: input.active,
      affectedUsers: 0,
      ...summary,
    };
  }

  const generation = input.active || resumingDeactivation
    ? storedGeneration
    : input.requestId;
  if (input.active && !REQUEST_ID_PATTERN.test(generation)) {
    throw conflict("복원할 비활성화 세대를 확인할 수 없습니다.");
  }
  const managedUsers = users.filter(({ data }) => {
    const mainMember = data.role === "member" &&
      data.accountType !== "personal" && data.churchId === input.churchId;
    if (!mainMember) return false;
    return input.active
      ? data.deactivationGeneration === generation
      : data.isDeleted !== true || data.deactivationGeneration === generation;
  });
  if (
    managedUsers.some(({ data }) =>
      data[PLATFORM_STATS_READER_COUNTED_FIELD] !==
        shouldCountPlatformReader(data)
    )
  ) {
    throw conflict("회원 통계 원장을 먼저 전수 재계산해 주세요.");
  }
  const publicStatsManagedUsers = managedUsers.filter(({ data }) =>
    data.excludeFromPublicStats !== true
  );
  const targets = managedUsers.filter(({ data }) =>
    input.active ? data.isDeleted === true : data.isDeleted !== true
  );
  if (targets.length > 20_000) {
    throw conflict("한 번에 처리할 수 있는 주 소속 사용자 수를 초과했습니다.");
  }
  const now = dependencies.now();

  // 비활성화는 공동체를 먼저 닫아 신규 가입을 차단한다. 복원은 사용자를 먼저
  // 되살리고 마지막 transaction에서 공동체를 연다.
  if (!input.active && !resumingDeactivation) {
    const transaction = await dependencies.beginTransaction(
      service.token,
      service.projectId,
    );
    try {
      const freshChurch = await dependencies.getDocument<RecordValue>(
        service.token,
        service.projectId,
        `churches/${input.churchId}`,
        { transaction },
      );
      if (!freshChurch || freshChurch.data.isDeleted === true) {
        throw conflict("공동체 상태가 변경되었습니다.");
      }
      const churches = directoryProjection(
        directoryDoc?.data,
        input.churchId,
        false,
      );
      await dependencies.commitWrites(service.token, service.projectId, [
        dependencies.updateWrite(
          service.projectId,
          `churches/${input.churchId}`,
          {
            isDeleted: true,
            hiddenFromDirectory: true,
            lifecycleStatus: "deactivating",
            deactivationGeneration: generation,
            deactivatedAt: now,
            deactivatedBy: input.uid,
            updatedAt: now,
          },
          {
            updateMask: [
              "isDeleted",
              "hiddenFromDirectory",
              "lifecycleStatus",
              "deactivationGeneration",
              "deactivatedAt",
              "deactivatedBy",
              "updatedAt",
            ],
            updateTime: freshChurch.updateTime,
          },
        ),
        dependencies.updateWrite(
          service.projectId,
          "settings/churchDirectory",
          { churches, updatedAt: now },
          {
            updateMask: ["churches", "updatedAt"],
            updateTime: directoryDoc?.updateTime,
          },
        ),
        dependencies.updateWrite(
          service.projectId,
          `publicChurches/${input.churchId}`,
          {
            id: input.churchId,
            name: churchDoc.data.name,
            hidden: true,
            updatedAt: now,
          },
          {
            updateMask: ["id", "name", "hidden", "updatedAt"],
            exists: Boolean(publicDoc),
          },
        ),
      ], { transaction });
    } catch (error) {
      await dependencies.rollbackTransaction(
        service.token,
        service.projectId,
        transaction,
      ).catch(() => {});
      throw error;
    }
  }

  if (input.active && !resumingRestoration) {
    const transaction = await dependencies.beginTransaction(
      service.token,
      service.projectId,
    );
    try {
      const freshChurch = await dependencies.getDocument<RecordValue>(
        service.token,
        service.projectId,
        `churches/${input.churchId}`,
        { transaction },
      );
      if (
        !freshChurch || freshChurch.data.isDeleted !== true ||
        freshChurch.data.lifecycleStatus !== "inactive" ||
        freshChurch.data.deactivationGeneration !== generation
      ) {
        throw conflict("공동체 상태가 변경되었습니다.");
      }
      await dependencies.commitWrites(
        service.token,
        service.projectId,
        [
          dependencies.updateWrite(
            service.projectId,
            `churches/${input.churchId}`,
            {
              lifecycleStatus: "restoring",
              restorationStartedAt: now,
              restorationStartedBy: input.uid,
              updatedAt: now,
            },
            {
              updateMask: [
                "lifecycleStatus",
                "restorationStartedAt",
                "restorationStartedBy",
                "updatedAt",
              ],
              updateTime: freshChurch.updateTime,
            },
          ),
        ],
        { transaction },
      );
    } catch (error) {
      await dependencies.rollbackTransaction(
        service.token,
        service.projectId,
        transaction,
      ).catch(() => {});
      throw error;
    }
  }

  for (let offset = 0; offset < targets.length; offset += MAX_BATCH_WRITES) {
    const batch = targets.slice(offset, offset + MAX_BATCH_WRITES);
    await dependencies.commitWrites(
      service.token,
      service.projectId,
      batch.map((document) => {
        const uid = documentId(document.name);
        const data = input.active
          ? {
            isDeleted: false,
            [PLATFORM_STATS_READER_COUNTED_FIELD]:
              document.data.excludeFromPublicStats !== true,
            restoredAt: now,
            restoredBy: input.uid,
            updatedAt: now,
          }
          : {
            isDeleted: true,
            [PLATFORM_STATS_READER_COUNTED_FIELD]: false,
            deletedAt: now,
            deletedBy: input.uid,
            deactivationGeneration: generation,
            deactivatedChurchId: input.churchId,
            updatedAt: now,
          };
        return dependencies.updateWrite(
          service.projectId,
          `users/${uid}`,
          data,
          { updateMask: Object.keys(data), updateTime: document.updateTime },
        );
      }),
    );
  }

  const result: AdminChurchLifecycleResult = {
    status: input.active ? "restored" : "deactivated",
    churchId: input.churchId,
    active: input.active,
    affectedUsers: managedUsers.length,
    ...summary,
  };
  const finalTransaction = await dependencies.beginTransaction(
    service.token,
    service.projectId,
  );
  try {
    const freshChurch = await dependencies.getDocument<RecordValue>(
      service.token,
      service.projectId,
      `churches/${input.churchId}`,
      { transaction: finalTransaction },
    );
    const freshLedger = await dependencies.getDocument<RecordValue>(
      service.token,
      service.projectId,
      `platformAdminActions/${input.requestId}`,
      { transaction: finalTransaction },
    );
    const statsDocument = await dependencies.getDocument<RecordValue>(
      service.token,
      service.projectId,
      "settings/platformStats",
      { transaction: finalTransaction },
    );
    if (freshLedger) {
      await dependencies.rollbackTransaction(
        service.token,
        service.projectId,
        finalTransaction,
      ).catch(() => {});
      return freshLedger.data.result as AdminChurchLifecycleResult;
    }
    const expectedLifecycleStatus = input.active ? "restoring" : "deactivating";
    if (
      !freshChurch ||
      freshChurch.data.isDeleted !== true ||
      freshChurch.data.lifecycleStatus !== expectedLifecycleStatus ||
      freshChurch.data.deactivationGeneration !== generation
    ) {
      const finalized = input.active
        ? freshChurch?.data.isDeleted !== true &&
          freshChurch?.data.lifecycleStatus === "active"
        : freshChurch?.data.isDeleted === true &&
          freshChurch?.data.lifecycleStatus === "inactive";
      if (finalized) {
        await dependencies.rollbackTransaction(
          service.token,
          service.projectId,
          finalTransaction,
        ).catch(() => {});
        return {
          status: "alreadySet",
          churchId: input.churchId,
          active: input.active,
          affectedUsers: 0,
          ...summary,
        };
      }
      throw conflict("공동체 활성 상태 작업이 다른 요청과 충돌했습니다.");
    }
    const currentReaders = statsDocument?.data.total_readers;
    const currentChurches = statsDocument?.data.total_churches;
    if (
      !Number.isSafeInteger(currentReaders) || Number(currentReaders) < 0 ||
      !Number.isSafeInteger(currentChurches) || Number(currentChurches) < 0
    ) throw conflict("플랫폼 통계를 먼저 재계산해 주세요.");
    const nextReaders = Number(currentReaders) +
      (input.active
        ? publicStatsManagedUsers.length
        : -publicStatsManagedUsers.length);
    const nextChurches = Number(currentChurches) + (input.active ? 1 : -1);
    if (nextReaders < 0 || nextChurches < 0) {
      throw conflict("플랫폼 통계 감소값이 올바르지 않습니다.");
    }
    const writes = [];
    if (input.active) {
      const churches = directoryProjection(
        directoryDoc?.data,
        input.churchId,
        true,
      );
      writes.push(
        dependencies.updateWrite(
          service.projectId,
          `churches/${input.churchId}`,
          {
            isDeleted: false,
            hiddenFromDirectory: false,
            lifecycleStatus: "active",
            restoredAt: now,
            restoredBy: input.uid,
            updatedAt: now,
          },
          {
            updateMask: [
              "isDeleted",
              "hiddenFromDirectory",
              "lifecycleStatus",
              "restoredAt",
              "restoredBy",
              "updatedAt",
            ],
            updateTime: freshChurch?.updateTime,
          },
        ),
        dependencies.updateWrite(
          service.projectId,
          "settings/churchDirectory",
          { churches, updatedAt: now },
          {
            updateMask: ["churches", "updatedAt"],
            updateTime: directoryDoc?.updateTime,
          },
        ),
        dependencies.updateWrite(
          service.projectId,
          `publicChurches/${input.churchId}`,
          {
            id: input.churchId,
            name: churchDoc.data.name,
            updatedAt: now,
          },
          {
            updateMask: ["id", "name", "hidden", "updatedAt"],
            exists: Boolean(publicDoc),
          },
        ),
      );
    } else {
      writes.push(
        dependencies.updateWrite(
          service.projectId,
          `churches/${input.churchId}`,
          { lifecycleStatus: "inactive", updatedAt: now },
          {
            updateMask: ["lifecycleStatus", "updatedAt"],
            updateTime: freshChurch?.updateTime,
          },
        ),
      );
    }
    writes.push(
      dependencies.updateWrite(
        service.projectId,
        "settings/platformStats",
        {
          total_readers: nextReaders,
          total_churches: nextChurches,
          updatedAt: now,
        },
        {
          updateMask: ["total_readers", "total_churches", "updatedAt"],
          updateTime: statsDocument?.updateTime,
        },
      ),
      dependencies.updateWrite(
        service.projectId,
        `platformAdminActions/${input.requestId}`,
        {
          schemaVersion: 1,
          action: ADMIN_SET_CHURCH_LIFECYCLE_ACTION,
          requestId: input.requestId,
          actorUid: input.uid,
          churchId: input.churchId,
          active: input.active,
          generation,
          result,
          createdAt: now,
        },
        { exists: false },
      ),
    );
    await dependencies.commitWrites(service.token, service.projectId, writes, {
      transaction: finalTransaction,
    });
    return result;
  } catch (error) {
    await dependencies.rollbackTransaction(
      service.token,
      service.projectId,
      finalTransaction,
    ).catch(() => {});
    throw error;
  }
};
