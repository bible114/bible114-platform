import { PlatformError } from "../_shared/errors.ts";
import {
  beginTransaction,
  commitWrites,
  getDocument,
  rollbackTransaction,
  runCollectionGroupQuery,
  updateWrite,
} from "../_shared/firestore.ts";
import {
  CONVERT_TO_PERSONAL_ACCOUNT_ACTION,
  type ConvertToPersonalAccountChurch,
  type ConvertToPersonalAccountDecision,
  type ConvertToPersonalAccountRoster,
  type ConvertToPersonalAccountUser,
  ConvertToPersonalAccountValidationError,
  decideConvertToPersonalAccount,
  normalizeConvertPersonalDocumentId,
} from "./convertToPersonalAccountCore.ts";

const ACTIVITY_LEDGER_SCHEMA_VERSION = 1;
const MAX_TRANSACTION_ATTEMPTS = 3;
const REQUEST_ID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const FIRESTORE_TIMESTAMP_PATTERN =
  /^(\d{4})-(\d{2})-(\d{2})T([01]\d|2[0-3]):([0-5]\d):([0-5]\d)(?:\.\d{1,9})?Z$/;

type ServiceAccess = { token: string; projectId: string };
type UnknownRecord = Record<string, unknown>;

export type ConvertToPersonalAccountIdentity = {
  uid: string;
  anonymous: boolean;
  tokenEmail: string;
};

export type ConvertToPersonalAccountInput = {
  requestId: string;
};

export type ConvertToPersonalAccountResult = {
  status: "converted";
  primaryOrgId: string;
};

export type ConvertToPersonalAccountResponse = {
  alreadyCompleted: boolean;
  committed: boolean;
  result: ConvertToPersonalAccountResult;
};

type StoredConvertToPersonalAccountLedger = {
  schemaVersion?: unknown;
  action?: unknown;
  requestId?: unknown;
  input?: unknown;
  result?: unknown;
  createdAt?: unknown;
};

export type ConvertToPersonalAccountDependencies = {
  beginTransaction: typeof beginTransaction;
  commitWrites: typeof commitWrites;
  getDocument: typeof getDocument;
  rollbackTransaction: typeof rollbackTransaction;
  runCollectionGroupQuery: typeof runCollectionGroupQuery;
  updateWrite: typeof updateWrite;
  now: () => Date;
};

const DEFAULT_DEPENDENCIES: ConvertToPersonalAccountDependencies = {
  beginTransaction,
  commitWrites,
  getDocument,
  rollbackTransaction,
  runCollectionGroupQuery,
  updateWrite,
  now: () => new Date(),
};

const isRecord = (value: unknown): value is UnknownRecord =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value);

const conflict = (
  message = "개인 계정 전환 상태를 안전하게 확인할 수 없습니다.",
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
  identity: ConvertToPersonalAccountIdentity,
): { uid: string; tokenEmail: string } => {
  if (identity?.anonymous !== false) {
    throw new PlatformError("ANONYMOUS_NOT_ALLOWED");
  }
  const uid = normalizeConvertPersonalDocumentId(identity?.uid);
  if (!uid || uid !== identity.uid || typeof identity.tokenEmail !== "string") {
    throw new PlatformError("BAD_REQUEST");
  }
  return { uid, tokenEmail: identity.tokenEmail };
};

const validateInput = (
  input: ConvertToPersonalAccountInput,
): ConvertToPersonalAccountInput => {
  if (
    !isRecord(input) || Object.keys(input).length !== 1 ||
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

const validateStoredLedger = (
  ledger: StoredConvertToPersonalAccountLedger,
  input: ConvertToPersonalAccountInput,
): ConvertToPersonalAccountResult => {
  if (!isRecord(ledger)) {
    throw conflict("개인 계정 전환 원장이 올바르지 않습니다.");
  }
  requireExactKeys(
    ledger,
    ["schemaVersion", "action", "requestId", "input", "result", "createdAt"],
    "개인 계정 전환 원장",
  );
  if (
    ledger.schemaVersion !== ACTIVITY_LEDGER_SCHEMA_VERSION ||
    ledger.action !== CONVERT_TO_PERSONAL_ACCOUNT_ACTION ||
    ledger.requestId !== input.requestId || !isRecord(ledger.input) ||
    !isRecord(ledger.result) || !isFirestoreTimestamp(ledger.createdAt)
  ) throw conflict("같은 요청 번호가 다른 작업에 사용되었습니다.");
  requireExactKeys(ledger.input, [], "개인 계정 전환 원장 입력");
  requireExactKeys(
    ledger.result,
    ["status", "primaryOrgId"],
    "개인 계정 전환 원장 결과",
  );
  const primaryOrgId = normalizeConvertPersonalDocumentId(
    ledger.result.primaryOrgId,
  );
  if (
    ledger.result.status !== "converted" || !primaryOrgId ||
    primaryOrgId !== ledger.result.primaryOrgId ||
    primaryOrgId === "unaffiliated_v1"
  ) throw conflict("개인 계정 전환 원장 결과가 올바르지 않습니다.");
  return { status: "converted", primaryOrgId };
};

const resultFromDecision = (
  decision: ConvertToPersonalAccountDecision,
): ConvertToPersonalAccountResult => ({
  status: "converted",
  primaryOrgId: decision.primaryOrgId,
});

const mapValidationError = (error: unknown): never => {
  if (!(error instanceof ConvertToPersonalAccountValidationError)) throw error;
  if (error.code === "USER_UNAVAILABLE") {
    throw new PlatformError("FORBIDDEN", {
      message: "활성 교회 성도 계정만 개인 계정으로 전환할 수 있습니다.",
    });
  }
  if (error.code === "INVALID_IDENTITY_EMAIL") {
    throw new PlatformError("FORBIDDEN", {
      message: "개인 계정 로그인 이메일 변경을 먼저 완료해 주세요.",
    });
  }
  if (error.code === "SOURCE_CHURCH_UNAVAILABLE") {
    throw new PlatformError("NOT_FOUND", {
      message: "현재 소속 공동체를 확인할 수 없습니다.",
    });
  }
  if (error.code === "ROSTER_LIMIT") {
    throw conflict("전환 전에 추가 공동체를 2개 이하로 줄여 주세요.");
  }
  throw conflict();
};

const isContention = (error: unknown): boolean =>
  error instanceof PlatformError &&
  ["FIRESTORE_READ_FAILED", "FIRESTORE_WRITE_FAILED"].includes(error.code) &&
  error.details?.status === 409;

const rollbackQuietly = async (
  dependencies: ConvertToPersonalAccountDependencies,
  service: ServiceAccess,
  transaction: string,
) => {
  await dependencies.rollbackTransaction(
    service.token,
    service.projectId,
    transaction,
  ).catch(() => {});
};

const executeConvertToPersonalAccount = async (
  service: ServiceAccess,
  identity: { uid: string; tokenEmail: string },
  input: ConvertToPersonalAccountInput,
  dependencies: ConvertToPersonalAccountDependencies,
): Promise<ConvertToPersonalAccountResponse> => {
  const transaction = await dependencies.beginTransaction(
    service.token,
    service.projectId,
  );
  const userPath = `users/${identity.uid}`;
  const ledgerPath = `${userPath}/activityActions/${input.requestId}`;
  try {
    const [userDocument, ledgerDocument] = await Promise.all([
      dependencies.getDocument<ConvertToPersonalAccountUser>(
        service.token,
        service.projectId,
        userPath,
        { transaction },
      ),
      dependencies.getDocument<StoredConvertToPersonalAccountLedger>(
        service.token,
        service.projectId,
        ledgerPath,
        { transaction },
      ),
    ]);
    if (!userDocument) throw new PlatformError("NOT_FOUND");

    const storedResult = ledgerDocument
      ? validateStoredLedger(ledgerDocument.data, input)
      : null;
    const rawSourceOrgId = storedResult?.primaryOrgId ??
      userDocument.data.churchId;
    const sourceOrgId = normalizeConvertPersonalDocumentId(rawSourceOrgId);
    if (
      !sourceOrgId || sourceOrgId !== rawSourceOrgId ||
      sourceOrgId === "unaffiliated_v1"
    ) {
      throw conflict("전환할 기존 공동체 식별자가 올바르지 않습니다.");
    }
    const churchPath = `churches/${sourceOrgId}`;
    const rosterPath = `${churchPath}/roster/${identity.uid}`;
    const [sourceChurchDocument, sourceRosterDocument, rosterDocuments] =
      await Promise.all([
        dependencies.getDocument<ConvertToPersonalAccountChurch>(
          service.token,
          service.projectId,
          churchPath,
          { transaction },
        ),
        dependencies.getDocument<ConvertToPersonalAccountRoster>(
          service.token,
          service.projectId,
          rosterPath,
          { transaction },
        ),
        dependencies.runCollectionGroupQuery<ConvertToPersonalAccountRoster>(
          service.token,
          service.projectId,
          "roster",
          "uid",
          identity.uid,
          { limit: 4, transaction },
        ),
      ]);

    const decision: ConvertToPersonalAccountDecision = (() => {
      try {
        return decideConvertToPersonalAccount({
          authenticatedUid: identity.uid,
          tokenEmail: identity.tokenEmail,
          ...(storedResult
            ? { expectedSourceOrgId: storedResult.primaryOrgId }
            : {}),
          user: userDocument.data,
          sourceChurch: sourceChurchDocument?.data || null,
          rosterDocuments,
          sourceRosterDocument,
        });
      } catch (error) {
        return mapValidationError(error);
      }
    })();

    if (storedResult) {
      if (
        decision.status !== "alreadyConverted" || decision.writeUser ||
        decision.writeRoster ||
        decision.primaryOrgId !== storedResult.primaryOrgId
      ) {
        throw conflict("전환 원장과 현재 계정 상태가 일치하지 않습니다.");
      }
      await rollbackQuietly(dependencies, service, transaction);
      return {
        alreadyCompleted: true,
        committed: true,
        result: storedResult,
      };
    }
    if (decision.status !== "converted" || !decision.writeUser) {
      throw conflict();
    }

    const now = dependencies.now();
    if (!(now instanceof Date) || !Number.isFinite(now.getTime())) {
      throw new PlatformError("INTERNAL");
    }
    const result = resultFromDecision(decision);
    const writes = [
      ...(decision.rosterSeed
        ? [
          dependencies.updateWrite(
            service.projectId,
            rosterPath,
            { ...decision.rosterSeed, joinedAt: now, updatedAt: now },
            { exists: false },
          ),
        ]
        : []),
      ...(decision.rosterPatch
        ? [
          dependencies.updateWrite(
            service.projectId,
            rosterPath,
            { ...decision.rosterPatch, updatedAt: now },
            {
              updateMask: [...Object.keys(decision.rosterPatch), "updatedAt"],
              exists: true,
            },
          ),
        ]
        : []),
      dependencies.updateWrite(
        service.projectId,
        userPath,
        {
          accountType: "personal",
          email: decision.tokenEmail,
          churchId: null,
          churchName: null,
          primaryOrgId: decision.primaryOrgId,
          updatedAt: now,
        },
        {
          updateMask: [
            "accountType",
            "email",
            "churchId",
            "churchName",
            "primaryOrgId",
            "updatedAt",
          ],
          exists: true,
        },
      ),
      dependencies.updateWrite(
        service.projectId,
        ledgerPath,
        {
          schemaVersion: ACTIVITY_LEDGER_SCHEMA_VERSION,
          action: CONVERT_TO_PERSONAL_ACCOUNT_ACTION,
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

export const convertToPersonalAccount = async (
  service: ServiceAccess,
  rawIdentity: ConvertToPersonalAccountIdentity,
  rawInput: ConvertToPersonalAccountInput,
  overrides: Partial<ConvertToPersonalAccountDependencies> = {},
): Promise<ConvertToPersonalAccountResponse> => {
  const identity = canonicalIdentity(rawIdentity);
  const input = validateInput(rawInput);
  const dependencies = { ...DEFAULT_DEPENDENCIES, ...overrides };
  let lastError: unknown = null;
  for (let attempt = 0; attempt < MAX_TRANSACTION_ATTEMPTS; attempt += 1) {
    try {
      return await executeConvertToPersonalAccount(
        service,
        identity,
        input,
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
