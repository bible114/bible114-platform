import { PlatformError } from "../_shared/errors.ts";
import {
  beginTransaction,
  commitWrites,
  getDocument,
  rollbackTransaction,
  updateWrite,
} from "../_shared/firestore.ts";
import { normalizeAdminChurchDocumentId } from "./adminChurchVisibilityCore.ts";
import {
  PLATFORM_STATS_READER_COUNTED_FIELD,
  shouldCountPlatformReader,
} from "./platformStatsCore.ts";

export const SET_MEMBER_ACTIVE_STATE_ACTION = "setMemberActiveState" as const;
const REQUEST_ID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const STATS_PATH = "settings/platformStats";
const LEDGER_COLLECTION = "memberLifecycleActions";
type RecordValue = Record<string, unknown>;
type Service = { token: string; projectId: string };

export type MemberActiveStateInput = {
  requestId: string;
  memberUid: string;
  active: boolean;
};
export type MemberActiveStateResult = {
  status: "deactivated" | "restored" | "alreadySet";
  memberUid: string;
  active: boolean;
  counted: boolean;
  totalReaders: number;
  deletedAt: string | null;
  deletedBy: string | null;
};
export type MemberLifecycleDependencies = {
  beginTransaction: typeof beginTransaction;
  commitWrites: typeof commitWrites;
  getDocument: typeof getDocument;
  rollbackTransaction: typeof rollbackTransaction;
  updateWrite: typeof updateWrite;
  now: () => Date;
};
const DEFAULT_DEPENDENCIES: MemberLifecycleDependencies = {
  beginTransaction,
  commitWrites,
  getDocument,
  rollbackTransaction,
  updateWrite,
  now: () => new Date(),
};

const isRecord = (value: unknown): value is RecordValue =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value);
const conflict = (message: string) =>
  new PlatformError("CONFLICT", { message });
const rollbackQuietly = (
  dependencies: MemberLifecycleDependencies,
  service: Service,
  transaction: string,
) =>
  dependencies.rollbackTransaction(
    service.token,
    service.projectId,
    transaction,
  ).catch(() => {});
const timestampString = (value: unknown): string | null => {
  if (value instanceof Date && Number.isFinite(value.getTime())) {
    return value.toISOString();
  }
  if (typeof value === "string" && Number.isFinite(Date.parse(value))) {
    return new Date(value).toISOString();
  }
  return null;
};

const validateReplay = (
  ledger: RecordValue,
  input: MemberActiveStateInput,
  actorUid: string,
): MemberActiveStateResult => {
  if (
    ledger.action !== SET_MEMBER_ACTIVE_STATE_ACTION ||
    ledger.actorUid !== actorUid ||
    ledger.memberUid !== input.memberUid ||
    ledger.active !== input.active ||
    !isRecord(ledger.result)
  ) {
    throw conflict("같은 요청 번호가 다른 회원 작업에 사용되었습니다.");
  }
  const result = ledger.result;
  if (
    !["deactivated", "restored", "alreadySet"].includes(
      String(result.status),
    ) ||
    result.memberUid !== input.memberUid ||
    result.active !== input.active ||
    typeof result.counted !== "boolean" ||
    !Number.isSafeInteger(result.totalReaders) ||
    Number(result.totalReaders) < 0 ||
    !(result.deletedAt === null || typeof result.deletedAt === "string") ||
    !(result.deletedBy === null || typeof result.deletedBy === "string")
  ) {
    throw conflict("저장된 회원 활성 상태 결과가 올바르지 않습니다.");
  }
  return result as MemberActiveStateResult;
};

export const setMemberActiveState = async (
  service: Service,
  identity: { uid: string; anonymous: boolean },
  rawInput: MemberActiveStateInput,
  dependencies: MemberLifecycleDependencies = DEFAULT_DEPENDENCIES,
): Promise<MemberActiveStateResult> => {
  const actorUid = normalizeAdminChurchDocumentId(identity?.uid);
  const memberUid = normalizeAdminChurchDocumentId(rawInput?.memberUid);
  if (
    identity?.anonymous !== false || !actorUid || actorUid !== identity.uid ||
    !isRecord(rawInput) ||
    Object.keys(rawInput).sort().join(",") !== "active,memberUid,requestId" ||
    typeof rawInput.requestId !== "string" ||
    !REQUEST_ID_PATTERN.test(rawInput.requestId) ||
    !memberUid || memberUid !== rawInput.memberUid ||
    typeof rawInput.active !== "boolean"
  ) {
    throw new PlatformError("BAD_REQUEST");
  }
  const input = {
    requestId: rawInput.requestId,
    memberUid,
    active: rawInput.active,
  };
  const transaction = await dependencies.beginTransaction(
    service.token,
    service.projectId,
  );
  try {
    const actorPath = `users/${actorUid}`;
    const memberPath = `users/${memberUid}`;
    const ledgerPath = `${LEDGER_COLLECTION}/${input.requestId}`;
    const [actorDocument, memberDocument, statsDocument, ledgerDocument] =
      await Promise.all([
        dependencies.getDocument<RecordValue>(
          service.token,
          service.projectId,
          actorPath,
          { transaction },
        ),
        dependencies.getDocument<RecordValue>(
          service.token,
          service.projectId,
          memberPath,
          { transaction },
        ),
        dependencies.getDocument<RecordValue>(
          service.token,
          service.projectId,
          STATS_PATH,
          { transaction },
        ),
        dependencies.getDocument<RecordValue>(
          service.token,
          service.projectId,
          ledgerPath,
          { transaction },
        ),
      ]);
    if (!actorDocument || actorDocument.data.isDeleted === true) {
      throw new PlatformError("FORBIDDEN");
    }
    if (ledgerDocument) {
      const replay = validateReplay(
        ledgerDocument.data,
        input,
        actorUid,
      );
      await rollbackQuietly(dependencies, service, transaction);
      return replay;
    }
    if (!memberDocument || memberDocument.data.role !== "member") {
      throw new PlatformError("NOT_FOUND", {
        message: "변경할 일반 회원을 찾을 수 없습니다.",
      });
    }
    const actorRole = String(actorDocument.data.role || "");
    const platformAdmin = ["platformAdmin", "superAdmin"].includes(actorRole);
    const sameChurchAdmin = actorRole === "churchAdmin" &&
      actorDocument.data.churchId === memberDocument.data.churchId &&
      memberDocument.data.accountType !== "personal";
    if (!platformAdmin && !sameChurchAdmin) {
      throw new PlatformError("FORBIDDEN");
    }
    if (input.active && typeof memberDocument.data.churchId === "string") {
      const churchDocument = await dependencies.getDocument<RecordValue>(
        service.token,
        service.projectId,
        `churches/${memberDocument.data.churchId}`,
        { transaction },
      );
      if (!churchDocument || churchDocument.data.isDeleted === true) {
        throw conflict("비활성 공동체의 회원은 먼저 공동체를 복원해야 합니다.");
      }
    }
    const expectedBefore = shouldCountPlatformReader(memberDocument.data);
    const countedBefore =
      memberDocument.data[PLATFORM_STATS_READER_COUNTED_FIELD];
    if (countedBefore !== expectedBefore) {
      throw conflict(
        "회원 통계 원장을 먼저 전수 재계산해 주세요.",
      );
    }
    const currentReaders = statsDocument?.data.total_readers;
    if (!Number.isSafeInteger(currentReaders) || Number(currentReaders) < 0) {
      throw conflict("플랫폼 통계를 먼저 전수 재계산해 주세요.");
    }
    const currentActive = memberDocument.data.isDeleted !== true;
    const countedAfter = input.active &&
      memberDocument.data.excludeFromPublicStats !== true;
    const delta = Number(countedAfter) - Number(countedBefore);
    const nextReaders = Number(currentReaders) + delta;
    if (!Number.isSafeInteger(nextReaders) || nextReaders < 0) {
      throw conflict("플랫폼 독자 수를 안전하게 변경할 수 없습니다.");
    }
    const now = dependencies.now();
    if (!(now instanceof Date) || !Number.isFinite(now.getTime())) {
      throw new PlatformError("INTERNAL");
    }
    const status = currentActive === input.active
      ? "alreadySet"
      : input.active
      ? "restored"
      : "deactivated";
    const result: MemberActiveStateResult = {
      status,
      memberUid,
      active: input.active,
      counted: countedAfter,
      totalReaders: nextReaders,
      deletedAt: input.active
        ? null
        : currentActive
        ? now.toISOString()
        : timestampString(memberDocument.data.deletedAt),
      deletedBy: input.active
        ? null
        : currentActive
        ? actorUid
        : typeof memberDocument.data.deletedBy === "string"
        ? memberDocument.data.deletedBy
        : null,
    };
    const writes = [];
    if (currentActive !== input.active) {
      writes.push(
        dependencies.updateWrite(service.projectId, memberPath, {
          isDeleted: !input.active,
          deletedAt: input.active ? null : now,
          deletedBy: input.active ? null : actorUid,
          [PLATFORM_STATS_READER_COUNTED_FIELD]: countedAfter,
          updatedAt: now,
        }, {
          updateMask: [
            "isDeleted",
            "deletedAt",
            "deletedBy",
            PLATFORM_STATS_READER_COUNTED_FIELD,
            "updatedAt",
          ],
          exists: true,
        }),
      );
      if (delta !== 0) {
        writes.push(
          dependencies.updateWrite(service.projectId, STATS_PATH, {
            total_readers: nextReaders,
            updatedAt: now,
          }, {
            updateMask: ["total_readers", "updatedAt"],
            exists: true,
          }),
        );
      }
    }
    writes.push(
      dependencies.updateWrite(service.projectId, ledgerPath, {
        schemaVersion: 1,
        action: SET_MEMBER_ACTIVE_STATE_ACTION,
        requestId: input.requestId,
        actorUid,
        memberUid,
        active: input.active,
        result,
        createdAt: now,
      }, { exists: false }),
    );
    await dependencies.commitWrites(
      service.token,
      service.projectId,
      writes,
      { transaction },
    );
    return result;
  } catch (error) {
    await rollbackQuietly(dependencies, service, transaction);
    throw error;
  }
};
