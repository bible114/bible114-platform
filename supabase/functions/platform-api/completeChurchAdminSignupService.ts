import { PlatformError } from "../_shared/errors.ts";
import {
  beginTransaction,
  commitWrites,
  getDocument,
  rollbackTransaction,
  updateWrite,
} from "../_shared/firestore.ts";
import {
  COMPLETE_CHURCH_ADMIN_SIGNUP_ACTION,
  type CompleteChurchAdminSignupAccess,
  type CompleteChurchAdminSignupAdmin,
  type CompleteChurchAdminSignupChurch,
  type CompleteChurchAdminSignupIdentity,
  type CompleteChurchAdminSignupInput,
  type CompleteChurchAdminSignupUser,
  CompleteChurchAdminSignupValidationError,
  exactDeepEqual,
  isActionChurchId,
  isCanonicalFirestoreTimestamp,
  normalizeChurchAdminSignupDocumentId,
  sanitizeChurchAdminSignupLegacyDirectory,
  validateCanonicalChurchAdminSignupState,
  validateCompleteChurchAdminSignup,
  type ValidatedChurchAdminSignup,
} from "./completeChurchAdminSignupCore.ts";
import { nextPlatformStatsAfterSignup } from "./platformStatsService.ts";

const LEDGER_SCHEMA_VERSION = 1;
const MAX_TRANSACTION_ATTEMPTS = 3;
const LEGACY_DIRECTORY_PATH = "settings/churchDirectory";
const PUBLIC_META_PATH = "publicDirectoryMeta/current";
const PUBLIC_REBUILD_LOCK_PATH = "platformInternal/publicDirectoryRebuild";
const PLATFORM_STATS_PATH = "settings/platformStats";

type ServiceAccess = { token: string; projectId: string };
type UnknownRecord = Record<string, unknown>;

export type CompleteChurchAdminSignupResult = {
  status: "created" | "alreadyCompleted";
  churchId: string;
};

type LifecycleInput = {
  tokenEmail: string | null;
  contactEmail: string;
  signInProvider: "password" | "google.com" | "kakao.com";
  name: string;
  churchName: string;
  pastorName: string;
  denomination: string;
  departments: ValidatedChurchAdminSignup["departments"];
  entryCodeHash: string;
  consent: ValidatedChurchAdminSignup["consent"];
};

type StoredLifecycleLedger = {
  schemaVersion?: unknown;
  action?: unknown;
  requestId?: unknown;
  actorUid?: unknown;
  input?: unknown;
  result?: unknown;
  createdAt?: unknown;
};

type PublicDirectoryMeta = {
  ready?: unknown;
  mode?: unknown;
  schemaVersion?: unknown;
  count?: unknown;
  updatedAt?: unknown;
};

type ParsedPublicDirectoryMeta = {
  exists: boolean;
  ready: boolean;
  count: number | null;
};

export type CompleteChurchAdminSignupDependencies = {
  beginTransaction: typeof beginTransaction;
  commitWrites: typeof commitWrites;
  getDocument: typeof getDocument;
  rollbackTransaction: typeof rollbackTransaction;
  updateWrite: typeof updateWrite;
  hashEntryCode: (entryCode: string) => Promise<string>;
  now: () => Date;
};

const sha256 = async (value: string): Promise<string> => {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(value),
  );
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
};

const DEFAULT_DEPENDENCIES: CompleteChurchAdminSignupDependencies = {
  beginTransaction,
  commitWrites,
  getDocument,
  rollbackTransaction,
  updateWrite,
  hashEntryCode: sha256,
  now: () => new Date(),
};

const isRecord = (value: unknown): value is UnknownRecord =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value);

const exactKeys = (value: UnknownRecord, expected: readonly string[]) => {
  const keys = Object.keys(value).sort();
  const canonical = [...expected].sort();
  return keys.length === canonical.length &&
    keys.every((key, index) => key === canonical[index]);
};

const conflict = (
  message = "공동체 등록 상태를 안전하게 확인할 수 없습니다.",
) => new PlatformError("CONFLICT", { message });

const retryableConflict = (message: string) =>
  new PlatformError("CONFLICT", { message, retryable: true });

const mapValidationError = (error: unknown): never => {
  if (!(error instanceof CompleteChurchAdminSignupValidationError)) {
    throw error;
  }
  if (
    error.code === "INVALID_IDENTITY" || error.code === "INVALID_INPUT" ||
    error.code === "INVALID_DEPARTMENTS" || error.code === "INVALID_CONSENT"
  ) throw new PlatformError("BAD_REQUEST");
  throw conflict();
};

const validateSignup = (
  identity: CompleteChurchAdminSignupIdentity,
  input: CompleteChurchAdminSignupInput,
): ValidatedChurchAdminSignup => {
  try {
    return validateCompleteChurchAdminSignup(identity, input);
  } catch (error) {
    return mapValidationError(error);
  }
};

const lifecycleInput = (
  signup: ValidatedChurchAdminSignup,
  entryCodeHash: string,
): LifecycleInput => ({
  tokenEmail: signup.tokenEmail,
  contactEmail: signup.contactEmail,
  signInProvider: signup.signInProvider,
  name: signup.name,
  churchName: signup.churchName,
  pastorName: signup.pastorName,
  denomination: signup.denomination,
  departments: structuredClone(signup.departments),
  entryCodeHash,
  consent: structuredClone(signup.consent),
});

const validateStoredLedger = (
  value: StoredLifecycleLedger,
  signup: ValidatedChurchAdminSignup,
  expectedInput: LifecycleInput,
): string => {
  if (
    !isRecord(value) || !exactKeys(value, [
      "schemaVersion",
      "action",
      "requestId",
      "actorUid",
      "input",
      "result",
      "createdAt",
    ]) || value.schemaVersion !== LEDGER_SCHEMA_VERSION ||
    value.action !== COMPLETE_CHURCH_ADMIN_SIGNUP_ACTION ||
    value.requestId !== signup.requestId || value.actorUid !== signup.uid ||
    !exactDeepEqual(value.input, expectedInput) ||
    !isCanonicalFirestoreTimestamp(value.createdAt) ||
    !isRecord(value.result) ||
    !exactKeys(value.result, ["status", "churchId"]) ||
    value.result.status !== "created" ||
    !isActionChurchId(value.result.churchId) ||
    value.result.churchId !== signup.churchId
  ) {
    throw conflict("같은 요청 번호가 다른 공동체 등록에 사용되었습니다.");
  }
  return value.result.churchId;
};

const validatePublicMeta = (
  value: PublicDirectoryMeta | null,
): ParsedPublicDirectoryMeta => {
  if (value === null) return { exists: false, ready: false, count: null };
  if (
    !isRecord(value) ||
    Object.keys(value).some((key) =>
      !["ready", "mode", "schemaVersion", "count", "updatedAt"].includes(key)
    ) || !Object.prototype.hasOwnProperty.call(value, "ready") ||
    !Object.prototype.hasOwnProperty.call(value, "mode") ||
    !Object.prototype.hasOwnProperty.call(value, "schemaVersion") ||
    typeof value.ready !== "boolean" ||
    (value.mode !== "legacy" && value.mode !== "public") ||
    value.schemaVersion !== 1 ||
    (Object.prototype.hasOwnProperty.call(value, "count") &&
      (!Number.isSafeInteger(value.count) || Number(value.count) < 0)) ||
    (value.ready === true && !Number.isSafeInteger(value.count)) ||
    (Object.prototype.hasOwnProperty.call(value, "updatedAt") &&
      !isCanonicalFirestoreTimestamp(value.updatedAt))
  ) {
    throw conflict("공개 공동체 디렉터리 상태가 올바르지 않습니다.");
  }
  return {
    exists: true,
    ready: value.ready,
    count: Number.isSafeInteger(value.count) ? Number(value.count) : null,
  };
};

const isContention = (error: unknown): boolean =>
  error instanceof PlatformError &&
  ["FIRESTORE_READ_FAILED", "FIRESTORE_WRITE_FAILED"].includes(error.code) &&
  (error.details?.status === 409 || error.details?.status === 412 ||
    error.details?.canonicalStatus === "ABORTED" ||
    error.details?.canonicalStatus === "FAILED_PRECONDITION");

const rollbackQuietly = async (
  dependencies: CompleteChurchAdminSignupDependencies,
  service: ServiceAccess,
  transaction: string,
) => {
  await dependencies.rollbackTransaction(
    service.token,
    service.projectId,
    transaction,
  ).catch(() => {});
};

const legacyKstDateString = (date: Date): string => {
  const shifted = new Date(date.getTime() + 9 * 60 * 60 * 1_000);
  const weekdays = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const months = [
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
  return `${weekdays[shifted.getUTCDay()]} ${months[shifted.getUTCMonth()]} ${
    String(shifted.getUTCDate()).padStart(2, "0")
  } ${shifted.getUTCFullYear()}`;
};

const executeCompleteChurchAdminSignup = async (
  service: ServiceAccess,
  signup: ValidatedChurchAdminSignup,
  entryCodeHash: string,
  dependencies: CompleteChurchAdminSignupDependencies,
): Promise<CompleteChurchAdminSignupResult> => {
  const transaction = await dependencies.beginTransaction(
    service.token,
    service.projectId,
  );
  const userPath = `users/${signup.uid}`;
  const ledgerPath = `churchLifecycleActions/${signup.requestId}`;
  const expectedLedgerInput = lifecycleInput(signup, entryCodeHash);
  try {
    const [
      userDocument,
      ledgerDocument,
      legacyDirectoryDocument,
      publicMetaDocument,
      rebuildLockDocument,
      platformStatsDocument,
    ] = await Promise.all([
      dependencies.getDocument<CompleteChurchAdminSignupUser>(
        service.token,
        service.projectId,
        userPath,
        { transaction },
      ),
      dependencies.getDocument<StoredLifecycleLedger>(
        service.token,
        service.projectId,
        ledgerPath,
        { transaction },
      ),
      dependencies.getDocument<UnknownRecord>(
        service.token,
        service.projectId,
        LEGACY_DIRECTORY_PATH,
        { transaction },
      ),
      dependencies.getDocument<PublicDirectoryMeta>(
        service.token,
        service.projectId,
        PUBLIC_META_PATH,
        { transaction },
      ),
      dependencies.getDocument<UnknownRecord>(
        service.token,
        service.projectId,
        PUBLIC_REBUILD_LOCK_PATH,
        { transaction },
      ),
      dependencies.getDocument<UnknownRecord>(
        service.token,
        service.projectId,
        PLATFORM_STATS_PATH,
        { transaction },
      ),
    ]);
    if (rebuildLockDocument) {
      throw retryableConflict(
        "공개 공동체 디렉터리를 정리하고 있습니다. 잠시 후 다시 시도해 주세요.",
      );
    }
    const publicMeta = validatePublicMeta(publicMetaDocument?.data || null);
    const storedChurchId = ledgerDocument
      ? validateStoredLedger(ledgerDocument.data, signup, expectedLedgerInput)
      : null;
    const rawChurchId = storedChurchId ?? userDocument?.data.churchId ??
      signup.churchId;
    const churchId = normalizeChurchAdminSignupDocumentId(rawChurchId);
    if (!churchId || churchId !== rawChurchId || !isActionChurchId(churchId)) {
      throw conflict();
    }
    const churchPath = `churches/${churchId}`;
    const consentPath = `${userPath}/private/consent`;
    const adminPath = `${churchPath}/private/admin`;
    const accessPath = `${churchPath}/private/access`;
    const publicChurchPath = `publicChurches/${churchId}`;
    const [
      churchDocument,
      consentDocument,
      adminDocument,
      accessDocument,
      publicChurchDocument,
    ] = await Promise.all([
      dependencies.getDocument<CompleteChurchAdminSignupChurch>(
        service.token,
        service.projectId,
        churchPath,
        { transaction },
      ),
      dependencies.getDocument<UnknownRecord>(
        service.token,
        service.projectId,
        consentPath,
        { transaction },
      ),
      dependencies.getDocument<CompleteChurchAdminSignupAdmin>(
        service.token,
        service.projectId,
        adminPath,
        { transaction },
      ),
      dependencies.getDocument<CompleteChurchAdminSignupAccess>(
        service.token,
        service.projectId,
        accessPath,
        { transaction },
      ),
      dependencies.getDocument<UnknownRecord>(
        service.token,
        service.projectId,
        publicChurchPath,
        { transaction },
      ),
    ]);

    if (userDocument) {
      try {
        validateCanonicalChurchAdminSignupState({
          signup,
          entryCodeHash,
          churchId,
          user: userDocument.data,
          church: churchDocument?.data || null,
          admin: adminDocument?.data || null,
          access: accessDocument?.data || null,
          consent: consentDocument?.data || null,
          legacyDirectory: legacyDirectoryDocument?.data || null,
          publicChurch: publicChurchDocument?.data || null,
        });
      } catch (error) {
        mapValidationError(error);
      }
      await rollbackQuietly(dependencies, service, transaction);
      return { status: "alreadyCompleted", churchId };
    }

    if (
      ledgerDocument || churchDocument || consentDocument || adminDocument ||
      accessDocument || publicChurchDocument
    ) throw conflict();
    const legacyDirectory = (() => {
      try {
        return sanitizeChurchAdminSignupLegacyDirectory(
          legacyDirectoryDocument?.data || null,
        );
      } catch (error) {
        return mapValidationError(error);
      }
    })();
    if (legacyDirectory.churches.some((entry) => entry.id === churchId)) {
      throw conflict();
    }
    if (
      publicMeta.ready &&
      (publicMeta.count === null || publicMeta.count >= Number.MAX_SAFE_INTEGER)
    ) {
      throw conflict("공개 공동체 디렉터리 개수를 안전하게 늘릴 수 없습니다.");
    }
    const now = dependencies.now();
    if (!(now instanceof Date) || !Number.isFinite(now.getTime())) {
      throw new PlatformError("INTERNAL");
    }
    const projection = { id: churchId, name: signup.churchName };
    const result = { status: "created" as const, churchId };
    const writes = [
      dependencies.updateWrite(service.projectId, churchPath, {
        name: signup.churchName,
        pastorName: signup.pastorName,
        denomination: signup.denomination,
        departments: signup.departments,
        isDeleted: false,
        hiddenFromDirectory: false,
        createdAt: now,
        updatedAt: now,
      }, { exists: false }),
      dependencies.updateWrite(service.projectId, userPath, {
        name: signup.name,
        email: signup.tokenEmail,
        authProvider: signup.signInProvider,
        authProviders: [signup.signInProvider],
        password: signup.password,
        birthdate: null,
        role: "churchAdmin",
        churchId,
        churchName: signup.churchName,
        extraMemberships: [],
        startDate: legacyKstDateString(now),
        currentDay: 1,
        streak: 0,
        score: 0,
        talent: 0,
        talentMigrated: true,
        readCount: 1,
        lastReadDate: null,
        gender: "male",
        planId: null,
        onboardingPending: true,
        departmentId: null,
        departmentName: null,
        subgroupId: null,
        consentSummary: signup.consentSummary,
        createdAt: now,
        updatedAt: now,
      }, { exists: false }),
      dependencies.updateWrite(service.projectId, consentPath, {
        ...signup.consent,
        recordedAt: now,
      }, { exists: false }),
      dependencies.updateWrite(service.projectId, adminPath, {
        adminUid: signup.uid,
        adminEmail: signup.contactEmail,
        updatedAt: now,
      }, { exists: false }),
      dependencies.updateWrite(service.projectId, accessPath, {
        codeHash: entryCodeHash,
        updatedAt: now,
      }, { exists: false }),
      dependencies.updateWrite(service.projectId, LEGACY_DIRECTORY_PATH, {
        churches: [...legacyDirectory.churches, projection],
        updatedAt: now,
      }, { exists: legacyDirectory.exists }),
      dependencies.updateWrite(
        service.projectId,
        publicChurchPath,
        projection,
        { exists: false },
      ),
      ...(publicMeta.ready
        ? [
          dependencies.updateWrite(service.projectId, PUBLIC_META_PATH, {
            count: (publicMeta.count as number) + 1,
            updatedAt: now,
          }, {
            updateMask: ["count", "updatedAt"],
            exists: true,
          }),
        ]
        : []),
      dependencies.updateWrite(service.projectId, ledgerPath, {
        schemaVersion: LEDGER_SCHEMA_VERSION,
        action: COMPLETE_CHURCH_ADMIN_SIGNUP_ACTION,
        requestId: signup.requestId,
        actorUid: signup.uid,
        input: expectedLedgerInput,
        result,
        createdAt: now,
      }, { exists: false }),
      dependencies.updateWrite(
        service.projectId,
        PLATFORM_STATS_PATH,
        nextPlatformStatsAfterSignup(platformStatsDocument?.data || null, {
          readerDelta: 1,
          churchDelta: 1,
          now,
        }),
        {
          updateMask: ["total_readers", "total_churches", "updatedAt"],
          exists: Boolean(platformStatsDocument),
        },
      ),
    ];
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

export const completeChurchAdminSignup = async (
  service: ServiceAccess,
  identity: CompleteChurchAdminSignupIdentity,
  input: CompleteChurchAdminSignupInput,
  overrides: Partial<CompleteChurchAdminSignupDependencies> = {},
): Promise<CompleteChurchAdminSignupResult> => {
  const signup = validateSignup(identity, input);
  const dependencies = { ...DEFAULT_DEPENDENCIES, ...overrides };
  const entryCodeHash = await dependencies.hashEntryCode(signup.entryCode);
  if (!/^[0-9a-f]{64}$/.test(entryCodeHash)) {
    throw new PlatformError("INTERNAL");
  }
  let lastError: unknown = null;
  for (let attempt = 0; attempt < MAX_TRANSACTION_ATTEMPTS; attempt += 1) {
    try {
      return await executeCompleteChurchAdminSignup(
        service,
        signup,
        entryCodeHash,
        dependencies,
      );
    } catch (error) {
      lastError = error;
      if (!isContention(error) || attempt + 1 >= MAX_TRANSACTION_ATTEMPTS) {
        throw error;
      }
    }
  }
  throw lastError;
};
