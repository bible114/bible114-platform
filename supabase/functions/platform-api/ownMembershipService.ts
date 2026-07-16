import { PlatformError } from "../_shared/errors.ts";
import {
  beginTransaction,
  commitWrites,
  getDocument,
  rollbackTransaction,
  updateWrite,
} from "../_shared/firestore.ts";
import {
  COMPLETE_MEMBER_ONBOARDING_ACTION,
  type CompleteMemberOnboardingDecision,
  decideCompleteMemberOnboarding,
  isMemberOnboardingPlanId,
  type MemberOnboardingChurch,
  type MemberOnboardingMembership,
  type MemberOnboardingPlanId,
  type MemberOnboardingRoster,
  type MemberOnboardingUser,
  MemberOnboardingValidationError,
  normalizeOwnMembershipDocumentId,
} from "./ownMembershipCore.ts";

const ACTIVITY_LEDGER_SCHEMA_VERSION = 1;
const MAX_TRANSACTION_ATTEMPTS = 3;
const UNAFFILIATED_CHURCH_ID = "unaffiliated_v1";
const UNAFFILIATED_VIRTUAL_CHURCH: MemberOnboardingChurch = {
  isDeleted: false,
  departments: [{
    id: "personal",
    name: "개인 성도",
    subgroups: ["성경읽기 동행"],
  }],
};
const REQUEST_ID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const FIRESTORE_TIMESTAMP_PATTERN =
  /^(\d{4})-(\d{2})-(\d{2})T([01]\d|2[0-3]):([0-5]\d):([0-5]\d)(?:\.\d{1,9})?Z$/;

type ServiceAccess = { token: string; projectId: string };
type UnknownRecord = Record<string, unknown>;

export type CompleteMemberOnboardingIdentity = {
  uid: string;
  anonymous: boolean;
};

export type CompleteMemberOnboardingInput = {
  requestId: string;
  orgId: string;
  planId: string;
  departmentId: string;
  subgroupId: string;
};

export type CompleteMemberOnboardingResult = MemberOnboardingMembership & {
  status: "completed" | "alreadyCompleted";
  orgId: string;
  planId: MemberOnboardingPlanId;
};

export type CompleteMemberOnboardingResponse = {
  alreadyCompleted: boolean;
  committed: boolean;
  result: CompleteMemberOnboardingResult;
};

type StoredMemberOnboardingLedger = {
  schemaVersion?: unknown;
  action?: unknown;
  requestId?: unknown;
  input?: unknown;
  result?: unknown;
  createdAt?: unknown;
};

export type CompleteMemberOnboardingDependencies = {
  beginTransaction: typeof beginTransaction;
  commitWrites: typeof commitWrites;
  getDocument: typeof getDocument;
  rollbackTransaction: typeof rollbackTransaction;
  updateWrite: typeof updateWrite;
  now: () => Date;
};

const DEFAULT_DEPENDENCIES: CompleteMemberOnboardingDependencies = {
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
  message = "최초 소속 설정 상태를 안전하게 확인할 수 없습니다.",
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
  identity: CompleteMemberOnboardingIdentity,
): string => {
  if (identity?.anonymous !== false) {
    throw new PlatformError("ANONYMOUS_NOT_ALLOWED");
  }
  const uid = normalizeOwnMembershipDocumentId(identity?.uid);
  if (!uid || uid !== identity.uid) throw new PlatformError("BAD_REQUEST");
  return uid;
};

const validateInput = (
  input: CompleteMemberOnboardingInput,
): CompleteMemberOnboardingInput => {
  if (!isRecord(input)) throw new PlatformError("BAD_REQUEST");
  const keys = Object.keys(input).sort();
  const expectedKeys = [
    "requestId",
    "orgId",
    "planId",
    "departmentId",
    "subgroupId",
  ].sort();
  if (
    keys.length !== expectedKeys.length ||
    keys.some((key, index) => key !== expectedKeys[index])
  ) throw new PlatformError("BAD_REQUEST");
  const orgId = normalizeOwnMembershipDocumentId(input.orgId);
  const departmentId = normalizeOwnMembershipDocumentId(input.departmentId);
  const subgroupId = normalizeOwnMembershipDocumentId(input.subgroupId, {
    allowEmpty: true,
  });
  if (
    typeof input.requestId !== "string" ||
    !REQUEST_ID_PATTERN.test(input.requestId) || !orgId ||
    orgId !== input.orgId || !departmentId ||
    departmentId !== input.departmentId || subgroupId === null ||
    subgroupId !== input.subgroupId || !isMemberOnboardingPlanId(input.planId)
  ) {
    throw new PlatformError("BAD_REQUEST");
  }
  return {
    requestId: input.requestId,
    orgId,
    planId: input.planId,
    departmentId,
    subgroupId,
  };
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

const resultFromDecision = (
  decision: CompleteMemberOnboardingDecision,
  status = decision.status,
): CompleteMemberOnboardingResult => ({
  status,
  orgId: decision.orgId,
  planId: decision.planId,
  ...decision.membership,
});

const validateReplay = (
  ledger: StoredMemberOnboardingLedger,
  input: CompleteMemberOnboardingInput,
  decision: CompleteMemberOnboardingDecision,
): CompleteMemberOnboardingResult => {
  if (!isRecord(ledger)) {
    throw conflict("최초 소속 설정 원장이 올바르지 않습니다.");
  }
  requireExactKeys(
    ledger,
    ["schemaVersion", "action", "requestId", "input", "result", "createdAt"],
    "최초 소속 설정 원장",
  );
  if (
    ledger.schemaVersion !== ACTIVITY_LEDGER_SCHEMA_VERSION ||
    ledger.action !== COMPLETE_MEMBER_ONBOARDING_ACTION ||
    ledger.requestId !== input.requestId ||
    !isFirestoreTimestamp(ledger.createdAt) || !isRecord(ledger.input) ||
    !isRecord(ledger.result)
  ) {
    throw conflict("같은 요청 번호가 다른 최초 소속 작업에 사용되었습니다.");
  }
  requireExactKeys(
    ledger.input,
    ["orgId", "planId", "departmentId", "subgroupId"],
    "최초 소속 설정 원장 입력",
  );
  requireExactKeys(
    ledger.result,
    [
      "status",
      "orgId",
      "planId",
      "departmentId",
      "departmentName",
      "subgroupId",
      "subgroupName",
    ],
    "최초 소속 설정 원장 결과",
  );
  const exactInput = ledger.input.orgId === input.orgId &&
    ledger.input.planId === input.planId &&
    ledger.input.departmentId === input.departmentId &&
    ledger.input.subgroupId === input.subgroupId;
  const expected = resultFromDecision(decision, "completed");
  if (
    !exactInput || decision.status !== "alreadyCompleted" ||
    ledger.result.status !== expected.status ||
    ledger.result.orgId !== expected.orgId ||
    ledger.result.planId !== expected.planId ||
    ledger.result.departmentId !== expected.departmentId ||
    ledger.result.departmentName !== expected.departmentName ||
    ledger.result.subgroupId !== expected.subgroupId ||
    ledger.result.subgroupName !== expected.subgroupName
  ) {
    throw conflict("최초 소속 설정 원장과 현재 상태가 일치하지 않습니다.");
  }
  return expected;
};

const mapValidationError = (error: unknown): never => {
  if (error instanceof MemberOnboardingValidationError) {
    if (
      error.code === "USER_UNAVAILABLE" ||
      error.code === "PERSONAL_UNSUPPORTED"
    ) {
      throw new PlatformError("FORBIDDEN");
    }
    if (error.code === "CHURCH_UNAVAILABLE") {
      throw new PlatformError("NOT_FOUND");
    }
    if (
      error.code === "INVALID_PLAN" ||
      error.code === "INVALID_DEPARTMENT" ||
      error.code === "INVALID_SUBGROUP"
    ) {
      throw new PlatformError("BAD_REQUEST");
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
  dependencies: CompleteMemberOnboardingDependencies,
  service: ServiceAccess,
  transaction: string,
) => {
  await dependencies.rollbackTransaction(
    service.token,
    service.projectId,
    transaction,
  ).catch(() => {});
};

const executeCompleteMemberOnboarding = async (
  service: ServiceAccess,
  uid: string,
  input: CompleteMemberOnboardingInput,
  dependencies: CompleteMemberOnboardingDependencies,
): Promise<CompleteMemberOnboardingResponse> => {
  const transaction = await dependencies.beginTransaction(
    service.token,
    service.projectId,
  );
  const userPath = `users/${uid}`;
  const ledgerPath = `${userPath}/activityActions/${input.requestId}`;
  const churchPath = `churches/${input.orgId}`;
  const rosterPath = `${churchPath}/roster/${uid}`;
  try {
    const [userDocument, ledgerDocument, churchDocument, rosterDocument] =
      await Promise.all([
        dependencies.getDocument<MemberOnboardingUser>(
          service.token,
          service.projectId,
          userPath,
          { transaction },
        ),
        dependencies.getDocument<StoredMemberOnboardingLedger>(
          service.token,
          service.projectId,
          ledgerPath,
          { transaction },
        ),
        dependencies.getDocument<MemberOnboardingChurch>(
          service.token,
          service.projectId,
          churchPath,
          { transaction },
        ),
        dependencies.getDocument<MemberOnboardingRoster>(
          service.token,
          service.projectId,
          rosterPath,
          { transaction },
        ),
      ]);
    if (!userDocument) throw new PlatformError("NOT_FOUND");
    if (!churchDocument && input.orgId !== UNAFFILIATED_CHURCH_ID) {
      throw new PlatformError("NOT_FOUND");
    }
    const church = churchDocument?.data || UNAFFILIATED_VIRTUAL_CHURCH;

    const decision: CompleteMemberOnboardingDecision = (() => {
      try {
        return decideCompleteMemberOnboarding({
          authenticatedUid: uid,
          orgId: input.orgId,
          planId: input.planId,
          departmentId: input.departmentId,
          subgroupId: input.subgroupId,
          user: userDocument.data,
          church,
          roster: rosterDocument?.data || null,
        });
      } catch (error) {
        return mapValidationError(error);
      }
    })();

    if (ledgerDocument) {
      const result = validateReplay(ledgerDocument.data, input, decision);
      await rollbackQuietly(dependencies, service, transaction);
      return { alreadyCompleted: true, committed: true, result };
    }
    if (decision.status === "alreadyCompleted") {
      await rollbackQuietly(dependencies, service, transaction);
      return {
        alreadyCompleted: false,
        committed: false,
        result: resultFromDecision(decision),
      };
    }

    const now = dependencies.now();
    if (!(now instanceof Date) || !Number.isFinite(now.getTime())) {
      throw new PlatformError("INTERNAL");
    }
    const membershipUpdate = { ...decision.membership, updatedAt: now };
    const userUpdate = {
      planId: decision.planId,
      onboardingPending: false,
      ...membershipUpdate,
    };
    const result = resultFromDecision(decision);
    const writes = [
      dependencies.updateWrite(
        service.projectId,
        userPath,
        userUpdate,
        { updateMask: Object.keys(userUpdate), exists: true },
      ),
      ...(decision.writeRoster
        ? [
          dependencies.updateWrite(
            service.projectId,
            rosterPath,
            membershipUpdate,
            { updateMask: Object.keys(membershipUpdate), exists: true },
          ),
        ]
        : []),
      dependencies.updateWrite(
        service.projectId,
        ledgerPath,
        {
          schemaVersion: ACTIVITY_LEDGER_SCHEMA_VERSION,
          action: COMPLETE_MEMBER_ONBOARDING_ACTION,
          requestId: input.requestId,
          input: {
            orgId: input.orgId,
            planId: input.planId,
            departmentId: input.departmentId,
            subgroupId: input.subgroupId,
          },
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
    return { alreadyCompleted: false, committed: true, result };
  } catch (error) {
    await rollbackQuietly(dependencies, service, transaction);
    throw error;
  }
};

export const completeMemberOnboarding = async (
  service: ServiceAccess,
  identity: CompleteMemberOnboardingIdentity,
  rawInput: CompleteMemberOnboardingInput,
  overrides: Partial<CompleteMemberOnboardingDependencies> = {},
): Promise<CompleteMemberOnboardingResponse> => {
  const uid = canonicalIdentity(identity);
  const input = validateInput(rawInput);
  const dependencies = { ...DEFAULT_DEPENDENCIES, ...overrides };
  let lastError: unknown = null;
  for (let attempt = 0; attempt < MAX_TRANSACTION_ATTEMPTS; attempt += 1) {
    try {
      return await executeCompleteMemberOnboarding(
        service,
        uid,
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
