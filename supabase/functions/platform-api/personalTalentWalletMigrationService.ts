import { PlatformError } from "../_shared/errors.ts";
import {
  beginTransaction,
  commitWrites,
  getDocument,
  rollbackTransaction,
  updateWrite,
} from "../_shared/firestore.ts";
import {
  decidePersonalTalentWalletMigration,
  normalizePersonalWalletDocumentId,
  type PersonalTalentWalletMigrationDecision,
  PersonalTalentWalletMigrationValidationError,
  type PersonalTalentWalletRoster,
  type PersonalTalentWalletUser,
} from "./personalTalentWalletMigrationCore.ts";

export const MIGRATE_PERSONAL_TALENT_WALLET_ACTION =
  "migratePersonalTalentWallet" as const;

const ACTIVITY_LEDGER_SCHEMA_VERSION = 1;
const MAX_TRANSACTION_ATTEMPTS = 3;
const REQUEST_ID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const FIRESTORE_TIMESTAMP_PATTERN =
  /^(\d{4})-(\d{2})-(\d{2})T([01]\d|2[0-3]):([0-5]\d):([0-5]\d)(?:\.\d{1,9})?Z$/;

type ServiceAccess = { token: string; projectId: string };
type UnknownRecord = Record<string, unknown>;

export type MigratePersonalTalentWalletIdentity = {
  uid: string;
  anonymous: boolean;
};

export type MigratePersonalTalentWalletInput = {
  requestId: string;
};

export type MigratePersonalTalentWalletResult = {
  status: "migrated" | "alreadyMigrated" | "primaryMissing";
};

export type MigratePersonalTalentWalletResponse = {
  alreadyCompleted: boolean;
  committed: boolean;
  result: MigratePersonalTalentWalletResult;
};

type StoredMigrationLedger = {
  schemaVersion?: unknown;
  action?: unknown;
  requestId?: unknown;
  input?: unknown;
  result?: unknown;
  createdAt?: unknown;
};

export type MigratePersonalTalentWalletDependencies = {
  beginTransaction: typeof beginTransaction;
  commitWrites: typeof commitWrites;
  getDocument: typeof getDocument;
  rollbackTransaction: typeof rollbackTransaction;
  updateWrite: typeof updateWrite;
  now: () => Date;
};

const DEFAULT_DEPENDENCIES: MigratePersonalTalentWalletDependencies = {
  beginTransaction,
  commitWrites,
  getDocument,
  rollbackTransaction,
  updateWrite,
  now: () => new Date(),
};

const isRecord = (value: unknown): value is UnknownRecord =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value);

const conflict = (
  message = "개인 달란트 지갑 상태를 안전하게 확인할 수 없습니다.",
) => new PlatformError("CONFLICT", { message });

const requireExactKeys = (
  value: UnknownRecord,
  expected: readonly string[],
  field: string,
) => {
  const keys = Object.keys(value).sort();
  const allowed = [...expected].sort();
  if (
    keys.length !== allowed.length ||
    keys.some((key, index) => key !== allowed[index])
  ) throw conflict(`저장된 ${field} 필드가 올바르지 않습니다.`);
};

const canonicalIdentity = (
  identity: MigratePersonalTalentWalletIdentity,
): string => {
  if (identity?.anonymous !== false) {
    throw new PlatformError("ANONYMOUS_NOT_ALLOWED");
  }
  const uid = normalizePersonalWalletDocumentId(identity?.uid);
  if (!uid || uid !== identity.uid) throw new PlatformError("BAD_REQUEST");
  return uid;
};

const validateInput = (
  input: MigratePersonalTalentWalletInput,
): MigratePersonalTalentWalletInput => {
  if (!isRecord(input)) throw new PlatformError("BAD_REQUEST");
  if (
    Object.keys(input).length !== 1 || !("requestId" in input) ||
    typeof input.requestId !== "string" ||
    !REQUEST_ID_PATTERN.test(input.requestId)
  ) throw new PlatformError("BAD_REQUEST");
  return { requestId: input.requestId };
};

const isFirestoreTimestamp = (value: unknown): value is string => {
  if (typeof value !== "string" || value.length > 64) return false;
  const match = FIRESTORE_TIMESTAMP_PATTERN.exec(value);
  if (!match) return false;
  const parsed = new Date(value);
  return Number.isFinite(parsed.getTime()) &&
    parsed.getUTCFullYear() === Number(match[1]) &&
    parsed.getUTCMonth() + 1 === Number(match[2]) &&
    parsed.getUTCDate() === Number(match[3]) &&
    parsed.getUTCHours() === Number(match[4]) &&
    parsed.getUTCMinutes() === Number(match[5]) &&
    parsed.getUTCSeconds() === Number(match[6]);
};

const validateReplay = (
  ledger: StoredMigrationLedger,
  input: MigratePersonalTalentWalletInput,
): MigratePersonalTalentWalletResult => {
  if (!isRecord(ledger)) {
    throw conflict("개인 지갑 이전 원장이 올바르지 않습니다.");
  }
  requireExactKeys(
    ledger,
    ["schemaVersion", "action", "requestId", "input", "result", "createdAt"],
    "개인 지갑 이전 원장",
  );
  if (
    ledger.schemaVersion !== ACTIVITY_LEDGER_SCHEMA_VERSION ||
    ledger.action !== MIGRATE_PERSONAL_TALENT_WALLET_ACTION ||
    ledger.requestId !== input.requestId ||
    !isFirestoreTimestamp(ledger.createdAt) || !isRecord(ledger.input) ||
    !isRecord(ledger.result)
  ) {
    throw conflict("같은 요청 번호가 다른 개인 지갑 작업에 사용되었습니다.");
  }
  requireExactKeys(ledger.input, [], "개인 지갑 이전 원장 입력");
  requireExactKeys(ledger.result, ["status"], "개인 지갑 이전 원장 결과");
  if (ledger.result.status !== "migrated") {
    throw conflict("개인 지갑 이전 원장 결과가 올바르지 않습니다.");
  }
  return { status: "migrated" };
};

const mapValidationError = (error: unknown): never => {
  if (error instanceof PersonalTalentWalletMigrationValidationError) {
    const code = error.code;
    if (code === "USER_UNAVAILABLE") {
      throw new PlatformError("FORBIDDEN");
    }
    throw conflict();
  }
  throw error;
};

const isContention = (error: unknown): boolean =>
  error instanceof PlatformError &&
  ["FIRESTORE_READ_FAILED", "FIRESTORE_WRITE_FAILED"].includes(error.code) &&
  error.details?.status === 409;

const rollbackQuietly = async (
  dependencies: MigratePersonalTalentWalletDependencies,
  service: ServiceAccess,
  transaction: string,
) => {
  await dependencies.rollbackTransaction(
    service.token,
    service.projectId,
    transaction,
  ).catch(() => {});
};

const executeMigration = async (
  service: ServiceAccess,
  uid: string,
  input: MigratePersonalTalentWalletInput,
  dependencies: MigratePersonalTalentWalletDependencies,
): Promise<MigratePersonalTalentWalletResponse> => {
  const transaction = await dependencies.beginTransaction(
    service.token,
    service.projectId,
  );
  const userPath = `users/${uid}`;
  const ledgerPath = `${userPath}/activityActions/${input.requestId}`;
  try {
    const [userDocument, ledgerDocument] = await Promise.all([
      dependencies.getDocument<PersonalTalentWalletUser>(
        service.token,
        service.projectId,
        userPath,
        { transaction },
      ),
      dependencies.getDocument<StoredMigrationLedger>(
        service.token,
        service.projectId,
        ledgerPath,
        { transaction },
      ),
    ]);
    if (!userDocument) throw new PlatformError("NOT_FOUND");
    if (
      userDocument.data.isDeleted === true ||
      userDocument.data.role !== "member" ||
      userDocument.data.accountType !== "personal"
    ) {
      throw new PlatformError("FORBIDDEN");
    }

    const primaryOrgId = normalizePersonalWalletDocumentId(
      userDocument.data.primaryOrgId,
    );
    if (!primaryOrgId || primaryOrgId !== userDocument.data.primaryOrgId) {
      throw conflict();
    }
    const rosterPath = `churches/${primaryOrgId}/roster/${uid}`;
    const rosterDocument = await dependencies.getDocument<
      PersonalTalentWalletRoster
    >(
      service.token,
      service.projectId,
      rosterPath,
      { transaction },
    );

    const decision: PersonalTalentWalletMigrationDecision = (() => {
      try {
        return decidePersonalTalentWalletMigration({
          authenticatedUid: uid,
          user: userDocument.data,
          roster: rosterDocument?.data || null,
        });
      } catch (error) {
        return mapValidationError(error);
      }
    })();

    if (ledgerDocument) {
      const result = validateReplay(ledgerDocument.data, input);
      await rollbackQuietly(dependencies, service, transaction);
      return {
        alreadyCompleted: true,
        committed: true,
        result,
      };
    }

    if (decision.status === "primaryMissing") {
      await rollbackQuietly(dependencies, service, transaction);
      return {
        alreadyCompleted: false,
        committed: false,
        result: { status: "primaryMissing" },
      };
    }

    if (decision.status === "alreadyMigrated") {
      await rollbackQuietly(dependencies, service, transaction);
      return {
        alreadyCompleted: false,
        committed: false,
        result: { status: "alreadyMigrated" },
      };
    }

    const now = dependencies.now();
    if (!(now instanceof Date) || !Number.isFinite(now.getTime())) {
      throw new PlatformError("INTERNAL");
    }
    const userUpdate = decision.userTalent > 0
      ? { talent: 0, talentWalletMigrated: true }
      : { talentWalletMigrated: true };
    const userUpdateMask = decision.userTalent > 0
      ? ["talent", "talentWalletMigrated"]
      : ["talentWalletMigrated"];
    const result: MigratePersonalTalentWalletResult = { status: "migrated" };
    const writes = [
      ...(decision.writeUser
        ? [
          dependencies.updateWrite(
            service.projectId,
            userPath,
            userUpdate,
            { updateMask: userUpdateMask, exists: true },
          ),
        ]
        : []),
      ...(decision.writeRoster && decision.rosterPatch
        ? [
          dependencies.updateWrite(
            service.projectId,
            rosterPath,
            decision.rosterPatch,
            {
              updateMask: Object.keys(decision.rosterPatch),
              exists: true,
            },
          ),
        ]
        : []),
      dependencies.updateWrite(
        service.projectId,
        ledgerPath,
        {
          schemaVersion: ACTIVITY_LEDGER_SCHEMA_VERSION,
          action: MIGRATE_PERSONAL_TALENT_WALLET_ACTION,
          requestId: input.requestId,
          input: {},
          result,
          createdAt: now,
        },
        { exists: false },
      ),
    ];
    await dependencies.commitWrites(
      service.token,
      service.projectId,
      writes,
      { transaction },
    );
    return {
      alreadyCompleted: false,
      committed: true,
      result,
    };
  } catch (error) {
    await rollbackQuietly(dependencies, service, transaction);
    throw error;
  }
};

export const migratePersonalTalentWallet = async (
  service: ServiceAccess,
  identity: MigratePersonalTalentWalletIdentity,
  rawInput: MigratePersonalTalentWalletInput,
  overrides: Partial<MigratePersonalTalentWalletDependencies> = {},
): Promise<MigratePersonalTalentWalletResponse> => {
  const uid = canonicalIdentity(identity);
  const input = validateInput(rawInput);
  const dependencies = { ...DEFAULT_DEPENDENCIES, ...overrides };
  let lastError: unknown = null;
  for (let attempt = 0; attempt < MAX_TRANSACTION_ATTEMPTS; attempt += 1) {
    try {
      return await executeMigration(service, uid, input, dependencies);
    } catch (error) {
      lastError = error;
      if (!isContention(error) || attempt + 1 >= MAX_TRANSACTION_ATTEMPTS) {
        throw error;
      }
    }
  }
  throw lastError;
};
