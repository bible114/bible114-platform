export const PREFLIGHT_ACTION = "preflight" as const;
export const PREVIEW_READ_COMPLETION_ACTION = "previewReadCompletion" as const;
export const PREVIEW_QUIZ_SUBMISSION_ACTION = "previewQuizSubmission" as const;
export const COMPLETE_READ_ACTION = "completeRead" as const;
export const RESTART_READING_ACTION = "restartReading" as const;
export const SUBMIT_QUIZ_ACTION = "submitQuiz" as const;
export const SKIP_QUIZ_ACTION = "skipQuiz" as const;
export const JOIN_COMMUNITY_ACTION = "joinCommunity" as const;
export const ISSUE_JOIN_TICKET_ACTION = "issueJoinTicket" as const;
export const COMPLETE_MEMBER_SIGNUP_ACTION = "completeMemberSignup" as const;
export const COMPLETE_PERSONAL_SIGNUP_ACTION =
  "completePersonalSignup" as const;
export const PURCHASE_ITEM_ACTION = "purchaseItem" as const;
export const ADMIN_COUNTER_SALE_ACTION = "adminCounterSale" as const;
export const ADMIN_DELIVER_PURCHASE_ACTION = "adminDeliverPurchase" as const;
export const ADMIN_REFUND_PURCHASE_ACTION = "adminRefundPurchase" as const;
export const RESOLVE_DAILY_VIDEO_ACTION = "resolveDailyVideo" as const;
export const ADMIN_PREVIEW_DAILY_VIDEO_ACTION =
  "adminPreviewDailyVideo" as const;
export const REBUILD_PUBLIC_CHURCHES_ACTION = "rebuildPublicChurches" as const;
export const SYNC_ACHIEVEMENTS_ACTION = "syncAchievements" as const;
export const MIGRATE_PERSONAL_TALENT_WALLET_ACTION =
  "migratePersonalTalentWallet" as const;
export const NORMALIZE_LEGACY_READING_POSITION_ACTION =
  "normalizeLegacyReadingPosition" as const;
export const COMPLETE_MEMBER_ONBOARDING_ACTION =
  "completeMemberOnboarding" as const;
export const JOIN_SOLO_COMMUNITY_ACTION = "joinSoloCommunity" as const;
export const ADMIN_SET_CHURCH_VISIBILITY_ACTION =
  "adminSetChurchVisibility" as const;
export const ADMIN_RENAME_CHURCH_ACTION = "adminRenameChurch" as const;
export const ADMIN_SET_CHURCH_LIFECYCLE_ACTION =
  "adminSetChurchLifecycle" as const;
export const REBUILD_PLATFORM_STATS_ACTION = "rebuildPlatformStats" as const;
export const CONVERT_TO_PERSONAL_ACCOUNT_ACTION =
  "convertToPersonalAccount" as const;
export const COMPLETE_CHURCH_ADMIN_SIGNUP_ACTION =
  "completeChurchAdminSignup" as const;
export const ROTATE_CHURCH_ACCESS_CODE_ACTION =
  "rotateChurchAccessCode" as const;
export const ENSURE_UNAFFILIATED_CHURCH_ACTION =
  "ensureUnaffiliatedChurch" as const;

export type PlatformApiRequest =
  | {
    action: typeof COMPLETE_CHURCH_ADMIN_SIGNUP_ACTION;
    requestId: string;
    name: string;
    churchName: string;
    pastorName: string;
    denomination: string;
    entryCode: string;
    departments: unknown[];
    password: string | null;
    contactEmail: string | null;
    consent: Record<string, unknown>;
  }
  | {
    action: typeof ROTATE_CHURCH_ACCESS_CODE_ACTION;
    requestId: string;
    churchId: string;
    entryCode: string;
    expectedVersion: number;
  }
  | {
    action: typeof ENSURE_UNAFFILIATED_CHURCH_ACTION;
    requestId: string;
  }
  | {
    action: typeof CONVERT_TO_PERSONAL_ACCOUNT_ACTION;
    requestId: string;
  }
  | {
    action: typeof ADMIN_SET_CHURCH_VISIBILITY_ACTION;
    requestId: string;
    churchId: string;
    hidden: boolean;
  }
  | {
    action: typeof ADMIN_RENAME_CHURCH_ACTION;
    requestId: string;
    churchId: string;
    name: string;
  }
  | {
    action: typeof ADMIN_SET_CHURCH_LIFECYCLE_ACTION;
    requestId: string;
    churchId: string;
    active: boolean;
  }
  | {
    action: typeof REBUILD_PLATFORM_STATS_ACTION;
    requestId: string;
    dryRun: boolean;
  }
  | {
    action: typeof JOIN_SOLO_COMMUNITY_ACTION;
    requestId: string;
  }
  | {
    action: typeof COMPLETE_MEMBER_ONBOARDING_ACTION;
    requestId: string;
    orgId: string;
    planId: "1year_sequential" | "1year_revised" | "1year_new" | "nt_new";
    departmentId: string;
    subgroupId: string;
  }
  | {
    action: typeof NORMALIZE_LEGACY_READING_POSITION_ACTION;
    requestId: string;
  }
  | {
    action: typeof MIGRATE_PERSONAL_TALENT_WALLET_ACTION;
    requestId: string;
  }
  | {
    action: typeof SYNC_ACHIEVEMENTS_ACTION;
    requestId: string;
    trigger: "read" | "memo";
  }
  | {
    action: typeof RESTART_READING_ACTION;
    requestId: string;
    cycle: number;
    day: number;
    readingEpoch: number;
  }
  | {
    action: typeof REBUILD_PUBLIC_CHURCHES_ACTION;
    requestId: string;
    dryRun: boolean;
  }
  | {
    action: typeof ADMIN_PREVIEW_DAILY_VIDEO_ACTION;
    requestId: string;
    adultPlaylistId: string;
    kidsPlaylistId: string;
  }
  | {
    action: typeof RESOLVE_DAILY_VIDEO_ACTION;
    requestId: string;
  }
  | {
    action: typeof ADMIN_COUNTER_SALE_ACTION;
    requestId: string;
    churchId: string;
    memberUid: string;
    departmentId: string;
    marketId: string;
    itemName: string;
    price: number;
  }
  | {
    action: typeof ADMIN_DELIVER_PURCHASE_ACTION;
    requestId: string;
    churchId: string;
    purchaseId: string;
  }
  | {
    action: typeof ADMIN_REFUND_PURCHASE_ACTION;
    requestId: string;
    churchId: string;
    purchaseId: string;
    legacyWalletKind: "" | "user" | "roster";
    migratedWalletConfirmed: boolean;
  }
  | {
    action: typeof PURCHASE_ITEM_ACTION;
    requestId: string;
    churchId: string;
    itemId: string;
    departmentId: string;
    marketId: string;
  }
  | {
    action: typeof PREFLIGHT_ACTION;
    requestId: string;
  }
  | {
    action: typeof PREVIEW_READ_COMPLETION_ACTION;
    requestId: string;
    cycle: number;
    day: number;
  }
  | {
    action: typeof COMPLETE_READ_ACTION;
    requestId: string;
    cycle: number;
    day: number;
    readingEpoch: number;
  }
  | {
    action: typeof PREVIEW_QUIZ_SUBMISSION_ACTION;
    requestId: string;
    progressKey: string;
    quizKey: string;
    selectedIndex: number;
  }
  | {
    action: typeof SUBMIT_QUIZ_ACTION;
    requestId: string;
    progressKey: string;
    quizKey: string;
    selectedIndex: number;
    attemptSlot: 1 | 2;
  }
  | {
    action: typeof SKIP_QUIZ_ACTION;
    requestId: string;
    progressKey: string;
    quizKey: string;
  }
  | {
    action: typeof ISSUE_JOIN_TICKET_ACTION;
    requestId: string;
    churchId: string;
    entryCode: string;
    purpose: "memberSignup" | "personalSignup" | "joinCommunity";
  }
  | {
    action: typeof JOIN_COMMUNITY_ACTION;
    requestId: string;
    churchId: string;
    entryCode: string;
    joinTicket: string;
    departmentId: string;
    subgroupId: string;
  }
  | {
    action: typeof COMPLETE_MEMBER_SIGNUP_ACTION;
    requestId: string;
    churchId: string;
    entryCode: string;
    joinTicket: string;
    name: string;
    birthdate: string;
    guestProgress: {
      currentDay: number;
      streak: number;
      lastReadDate: string | null;
      planId: string;
    };
  }
  | {
    action: typeof COMPLETE_PERSONAL_SIGNUP_ACTION;
    requestId: string;
    churchId: string;
    entryCode: string;
    joinTicket: string;
    departmentId: string;
    subgroupId: string;
    name: string;
    birthdate: string;
    authProvider: string;
    guestProgress: {
      currentDay: number;
      streak: number;
      lastReadDate: string | null;
      planId: string;
    };
  };

export type PlatformApiRequestErrorCode =
  | "INVALID_BODY"
  | "INVALID_ACTION"
  | "INVALID_REQUEST_ID"
  | "INVALID_PAYLOAD";

export class PlatformApiRequestError extends Error {
  readonly code: PlatformApiRequestErrorCode;

  constructor(code: PlatformApiRequestErrorCode) {
    super(code);
    this.name = "PlatformApiRequestError";
    this.code = code;
  }
}

// RFC 4122/9562 UUID의 표준 8-4-4-4-12 표기만 허용한다.
// requestId는 서버 쓰기 action이 추가될 때 멱등성 키로 그대로 사용할 값이다.
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export const isRequestId = (value: unknown): value is string =>
  typeof value === "string" && UUID_PATTERN.test(value);

const safeDocumentId = (value: unknown, { optional = false } = {}) => {
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  if (optional && !normalized) return "";
  return normalized && normalized.length <= 128 && !normalized.includes("/") &&
      !/[\u0000-\u001f\u007f]/.test(normalized)
    ? normalized
    : null;
};

const strictText = (
  value: unknown,
  { min = 0, max }: { min?: number; max: number },
) => {
  if (typeof value !== "string" || value !== value.trim()) return null;
  return value.length >= min && value.length <= max &&
      !/[\u0000-\u001f\u007f]/.test(value)
    ? value
    : null;
};

const hasEntryCodeOrTicket = (entryCode: string, joinTicket: string) => {
  const hasEntryCode = entryCode.length >= 4 && entryCode.length <= 128 &&
    !/[\u0000-\u001f\u007f]/.test(entryCode);
  const hasTicket = isRequestId(joinTicket);
  return hasEntryCode !== hasTicket;
};

export const parsePlatformApiRequest = (body: unknown): PlatformApiRequest => {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    throw new PlatformApiRequestError("INVALID_BODY");
  }

  const {
    action,
    requestId,
    cycle,
    day,
    readingEpoch,
    progressKey,
    quizKey,
    selectedIndex,
    attemptSlot,
    orgId,
    planId,
    churchId,
    entryCode,
    joinTicket,
    purpose,
    departmentId,
    subgroupId,
    name,
    birthdate,
    authProvider,
    guestProgress,
    itemId,
    marketId,
    memberUid,
    itemName,
    price,
    purchaseId,
    legacyWalletKind,
    migratedWalletConfirmed,
    adultPlaylistId,
    kidsPlaylistId,
    dryRun,
    trigger,
    hidden,
    active,
    churchName,
    pastorName,
    denomination,
    departments,
    password,
    contactEmail,
    consent,
    expectedVersion,
  } = body as Record<string, unknown>;
  if (!isRequestId(requestId)) {
    throw new PlatformApiRequestError("INVALID_REQUEST_ID");
  }

  if (action === PREFLIGHT_ACTION) return { action, requestId };
  if (action === ENSURE_UNAFFILIATED_CHURCH_ACTION) {
    const allowedKeys = new Set(["action", "requestId"]);
    if (Object.keys(body).some((key) => !allowedKeys.has(key))) {
      throw new PlatformApiRequestError("INVALID_PAYLOAD");
    }
    return { action, requestId };
  }
  if (action === ROTATE_CHURCH_ACCESS_CODE_ACTION) {
    const allowedKeys = new Set([
      "action",
      "requestId",
      "churchId",
      "entryCode",
      "expectedVersion",
    ]);
    const normalizedChurchId = safeDocumentId(churchId);
    const normalizedEntryCode = typeof entryCode === "string"
      ? entryCode.trim()
      : "";
    if (
      Object.keys(body).some((key) => !allowedKeys.has(key)) ||
      !normalizedChurchId || normalizedChurchId !== churchId ||
      normalizedChurchId === "." || normalizedChurchId === ".." ||
      normalizedChurchId === "unaffiliated_v1" ||
      normalizedEntryCode !== entryCode ||
      normalizedEntryCode.length < 4 || normalizedEntryCode.length > 128 ||
      /[\u0000-\u001f\u007f]/.test(normalizedEntryCode) ||
      !Number.isSafeInteger(expectedVersion) || Number(expectedVersion) < 0 ||
      Number(expectedVersion) >= 999_999_999
    ) {
      throw new PlatformApiRequestError("INVALID_PAYLOAD");
    }
    return {
      action,
      requestId,
      churchId: normalizedChurchId,
      entryCode: normalizedEntryCode,
      expectedVersion: Number(expectedVersion),
    };
  }
  if (action === COMPLETE_CHURCH_ADMIN_SIGNUP_ACTION) {
    const allowedKeys = new Set([
      "action",
      "requestId",
      "name",
      "churchName",
      "pastorName",
      "denomination",
      "entryCode",
      "departments",
      "password",
      "contactEmail",
      "consent",
    ]);
    const normalizedName = strictText(name, { min: 1, max: 50 });
    const normalizedChurchName = strictText(churchName, { min: 1, max: 200 });
    const normalizedPastorName = strictText(pastorName, { min: 1, max: 100 });
    const normalizedDenomination = strictText(denomination, {
      min: 0,
      max: 100,
    });
    const normalizedEntryCode = strictText(entryCode, { min: 4, max: 128 });
    const normalizedContactEmail = contactEmail === undefined ||
        contactEmail === null
      ? null
      : (typeof contactEmail === "string"
        ? contactEmail.trim().toLowerCase()
        : "");
    const validContactEmail = normalizedContactEmail === null ||
      (normalizedContactEmail.length <= 254 &&
        /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedContactEmail) &&
        !/[\u0000-\u001f\u007f]/.test(normalizedContactEmail));
    if (
      Object.keys(body).some((key) => !allowedKeys.has(key)) ||
      normalizedName === null || normalizedChurchName === null ||
      normalizedPastorName === null || normalizedDenomination === null ||
      normalizedEntryCode === null || !Array.isArray(departments) ||
      !consent || typeof consent !== "object" || Array.isArray(consent) ||
      !validContactEmail ||
      !(password === null ||
        (typeof password === "string" && password.length >= 6 &&
          password.length <= 128 && !/[\u0000-\u001f\u007f]/.test(password)))
    ) {
      throw new PlatformApiRequestError("INVALID_PAYLOAD");
    }
    return {
      action,
      requestId,
      name: normalizedName,
      churchName: normalizedChurchName,
      pastorName: normalizedPastorName,
      denomination: normalizedDenomination,
      entryCode: normalizedEntryCode,
      departments,
      password,
      contactEmail: normalizedContactEmail,
      consent: consent as Record<string, unknown>,
    };
  }
  if (action === CONVERT_TO_PERSONAL_ACCOUNT_ACTION) {
    const allowedKeys = new Set(["action", "requestId"]);
    if (Object.keys(body).some((key) => !allowedKeys.has(key))) {
      throw new PlatformApiRequestError("INVALID_PAYLOAD");
    }
    return { action, requestId };
  }
  if (action === ADMIN_SET_CHURCH_VISIBILITY_ACTION) {
    const allowedKeys = new Set(["action", "requestId", "churchId", "hidden"]);
    const normalizedChurchId = safeDocumentId(churchId);
    if (
      Object.keys(body).some((key) => !allowedKeys.has(key)) ||
      !normalizedChurchId || normalizedChurchId !== churchId ||
      normalizedChurchId === "." || normalizedChurchId === ".." ||
      normalizedChurchId === "unaffiliated_v1" || typeof hidden !== "boolean"
    ) {
      throw new PlatformApiRequestError("INVALID_PAYLOAD");
    }
    return { action, requestId, churchId: normalizedChurchId, hidden };
  }
  if (action === ADMIN_RENAME_CHURCH_ACTION) {
    const allowedKeys = new Set(["action", "requestId", "churchId", "name"]);
    const normalizedChurchId = safeDocumentId(churchId);
    const normalizedName = strictText(name, { min: 1, max: 200 });
    if (
      Object.keys(body).some((key) => !allowedKeys.has(key)) ||
      !normalizedChurchId || normalizedChurchId !== churchId ||
      normalizedChurchId === "." || normalizedChurchId === ".." ||
      normalizedChurchId === "unaffiliated_v1" || normalizedName === null
    ) {
      throw new PlatformApiRequestError("INVALID_PAYLOAD");
    }
    return {
      action,
      requestId,
      churchId: normalizedChurchId,
      name: normalizedName,
    };
  }
  if (action === ADMIN_SET_CHURCH_LIFECYCLE_ACTION) {
    const allowedKeys = new Set(["action", "requestId", "churchId", "active"]);
    const normalizedChurchId = safeDocumentId(churchId);
    if (
      Object.keys(body).some((key) => !allowedKeys.has(key)) ||
      !normalizedChurchId || normalizedChurchId !== churchId ||
      normalizedChurchId === "unaffiliated_v1" || typeof active !== "boolean"
    ) {
      throw new PlatformApiRequestError("INVALID_PAYLOAD");
    }
    return { action, requestId, churchId: normalizedChurchId, active };
  }
  if (action === REBUILD_PLATFORM_STATS_ACTION) {
    const allowedKeys = new Set(["action", "requestId", "dryRun"]);
    if (
      Object.keys(body).some((key) => !allowedKeys.has(key)) ||
      typeof dryRun !== "boolean"
    ) {
      throw new PlatformApiRequestError("INVALID_PAYLOAD");
    }
    return { action, requestId, dryRun };
  }
  if (action === JOIN_SOLO_COMMUNITY_ACTION) {
    const allowedKeys = new Set(["action", "requestId"]);
    if (Object.keys(body).some((key) => !allowedKeys.has(key))) {
      throw new PlatformApiRequestError("INVALID_PAYLOAD");
    }
    return { action, requestId };
  }
  if (action === COMPLETE_MEMBER_ONBOARDING_ACTION) {
    const allowedKeys = new Set([
      "action",
      "requestId",
      "orgId",
      "planId",
      "departmentId",
      "subgroupId",
    ]);
    const normalizedOrgId = safeDocumentId(orgId);
    const normalizedDepartmentId = safeDocumentId(departmentId);
    const normalizedSubgroupId = safeDocumentId(subgroupId, { optional: true });
    const allowedPlans = new Set([
      "1year_sequential",
      "1year_revised",
      "1year_new",
      "nt_new",
    ]);
    if (
      Object.keys(body).some((key) => !allowedKeys.has(key)) ||
      !normalizedOrgId || normalizedOrgId !== orgId ||
      normalizedOrgId === "." || normalizedOrgId === ".." ||
      !normalizedDepartmentId || normalizedDepartmentId !== departmentId ||
      normalizedDepartmentId === "." || normalizedDepartmentId === ".." ||
      normalizedSubgroupId === null || normalizedSubgroupId !== subgroupId ||
      normalizedSubgroupId === "." || normalizedSubgroupId === ".." ||
      typeof planId !== "string" || !allowedPlans.has(planId)
    ) {
      throw new PlatformApiRequestError("INVALID_PAYLOAD");
    }
    return {
      action,
      requestId,
      orgId: normalizedOrgId,
      planId: planId as
        | "1year_sequential"
        | "1year_revised"
        | "1year_new"
        | "nt_new",
      departmentId: normalizedDepartmentId,
      subgroupId: normalizedSubgroupId,
    };
  }
  if (action === NORMALIZE_LEGACY_READING_POSITION_ACTION) {
    const allowedKeys = new Set(["action", "requestId"]);
    if (Object.keys(body).some((key) => !allowedKeys.has(key))) {
      throw new PlatformApiRequestError("INVALID_PAYLOAD");
    }
    return { action, requestId };
  }
  if (action === MIGRATE_PERSONAL_TALENT_WALLET_ACTION) {
    const allowedKeys = new Set(["action", "requestId"]);
    if (Object.keys(body).some((key) => !allowedKeys.has(key))) {
      throw new PlatformApiRequestError("INVALID_PAYLOAD");
    }
    return { action, requestId };
  }
  if (action === SYNC_ACHIEVEMENTS_ACTION) {
    const allowedKeys = new Set(["action", "requestId", "trigger"]);
    if (
      Object.keys(body).some((key) => !allowedKeys.has(key)) ||
      (trigger !== "read" && trigger !== "memo")
    ) {
      throw new PlatformApiRequestError("INVALID_PAYLOAD");
    }
    return { action, requestId, trigger };
  }
  if (action === RESOLVE_DAILY_VIDEO_ACTION) {
    const allowedKeys = new Set(["action", "requestId"]);
    if (Object.keys(body).some((key) => !allowedKeys.has(key))) {
      throw new PlatformApiRequestError("INVALID_PAYLOAD");
    }
    return { action, requestId };
  }
  if (action === REBUILD_PUBLIC_CHURCHES_ACTION) {
    const allowedKeys = new Set(["action", "requestId", "dryRun"]);
    if (
      Object.keys(body).some((key) => !allowedKeys.has(key)) ||
      typeof dryRun !== "boolean"
    ) {
      throw new PlatformApiRequestError("INVALID_PAYLOAD");
    }
    return { action, requestId, dryRun };
  }
  if (action === ADMIN_PREVIEW_DAILY_VIDEO_ACTION) {
    const allowedKeys = new Set([
      "action",
      "requestId",
      "adultPlaylistId",
      "kidsPlaylistId",
    ]);
    const normalizePlaylistId = (value: unknown, optional = false) => {
      if (typeof value !== "string") return null;
      const normalized = value.trim();
      if (optional && !normalized) return "";
      return /^[A-Za-z0-9_-]{1,200}$/.test(normalized) ? normalized : null;
    };
    const normalizedAdultPlaylistId = normalizePlaylistId(adultPlaylistId);
    const normalizedKidsPlaylistId = normalizePlaylistId(kidsPlaylistId, true);
    if (
      Object.keys(body).some((key) => !allowedKeys.has(key)) ||
      !normalizedAdultPlaylistId || normalizedKidsPlaylistId === null
    ) {
      throw new PlatformApiRequestError("INVALID_PAYLOAD");
    }
    return {
      action,
      requestId,
      adultPlaylistId: normalizedAdultPlaylistId,
      kidsPlaylistId: normalizedKidsPlaylistId,
    };
  }
  if (action === ISSUE_JOIN_TICKET_ACTION) {
    const normalizedChurchId = safeDocumentId(churchId);
    const normalizedEntryCode = typeof entryCode === "string"
      ? entryCode.trim()
      : "";
    if (
      !normalizedChurchId || normalizedChurchId === "unaffiliated_v1" ||
      normalizedEntryCode.length < 4 || normalizedEntryCode.length > 128 ||
      !["memberSignup", "personalSignup", "joinCommunity"].includes(
        String(purpose),
      )
    ) {
      throw new PlatformApiRequestError("INVALID_PAYLOAD");
    }
    return {
      action,
      requestId,
      churchId: normalizedChurchId,
      entryCode: normalizedEntryCode,
      purpose: purpose as "memberSignup" | "personalSignup" | "joinCommunity",
    };
  }
  if (action === PURCHASE_ITEM_ACTION) {
    const safeId = (value: unknown) => {
      if (typeof value !== "string") return null;
      const normalized = value.trim();
      return normalized && normalized.length <= 128 &&
          !normalized.includes("/") &&
          !/[\u0000-\u001f\u007f]/.test(normalized)
        ? normalized
        : null;
    };
    const normalizedChurchId = safeId(churchId);
    const normalizedItemId = safeId(itemId);
    const normalizedDepartmentId = safeId(departmentId);
    const normalizedMarketId = safeId(marketId);
    if (
      !normalizedChurchId || !normalizedItemId || !normalizedDepartmentId ||
      !normalizedMarketId
    ) {
      throw new PlatformApiRequestError("INVALID_PAYLOAD");
    }
    return {
      action,
      requestId,
      churchId: normalizedChurchId,
      itemId: normalizedItemId,
      departmentId: normalizedDepartmentId,
      marketId: normalizedMarketId,
    };
  }
  if (action === ADMIN_COUNTER_SALE_ACTION) {
    const normalizedChurchId = safeDocumentId(churchId);
    const normalizedMemberUid = safeDocumentId(memberUid);
    const normalizedDepartmentId = safeDocumentId(departmentId);
    const normalizedMarketId = safeDocumentId(marketId);
    const normalizedItemName = typeof itemName === "string"
      ? itemName.trim()
      : "";
    if (
      !normalizedChurchId || !normalizedMemberUid ||
      !normalizedDepartmentId || !normalizedMarketId ||
      !normalizedItemName || normalizedItemName.length > 100 ||
      /[\u0000-\u001f\u007f]/.test(normalizedItemName) ||
      !Number.isSafeInteger(price) || Number(price) <= 0 ||
      Number(price) > 1_000_000
    ) {
      throw new PlatformApiRequestError("INVALID_PAYLOAD");
    }
    return {
      action,
      requestId,
      churchId: normalizedChurchId,
      memberUid: normalizedMemberUid,
      departmentId: normalizedDepartmentId,
      marketId: normalizedMarketId,
      itemName: normalizedItemName,
      price: Number(price),
    };
  }
  if (action === ADMIN_DELIVER_PURCHASE_ACTION) {
    const normalizedChurchId = safeDocumentId(churchId);
    const normalizedPurchaseId = safeDocumentId(purchaseId);
    if (!normalizedChurchId || !normalizedPurchaseId) {
      throw new PlatformApiRequestError("INVALID_PAYLOAD");
    }
    return {
      action,
      requestId,
      churchId: normalizedChurchId,
      purchaseId: normalizedPurchaseId,
    };
  }
  if (action === ADMIN_REFUND_PURCHASE_ACTION) {
    const normalizedChurchId = safeDocumentId(churchId);
    const normalizedPurchaseId = safeDocumentId(purchaseId);
    const normalizedLegacyWalletKind = typeof legacyWalletKind === "string"
      ? legacyWalletKind.trim()
      : "";
    if (
      !normalizedChurchId || !normalizedPurchaseId ||
      !["", "user", "roster"].includes(normalizedLegacyWalletKind) ||
      (migratedWalletConfirmed !== undefined &&
        typeof migratedWalletConfirmed !== "boolean")
    ) {
      throw new PlatformApiRequestError("INVALID_PAYLOAD");
    }
    return {
      action,
      requestId,
      churchId: normalizedChurchId,
      purchaseId: normalizedPurchaseId,
      legacyWalletKind: normalizedLegacyWalletKind as "" | "user" | "roster",
      migratedWalletConfirmed: migratedWalletConfirmed === true,
    };
  }
  if (
    action === PREVIEW_READ_COMPLETION_ACTION ||
    action === COMPLETE_READ_ACTION
  ) {
    if (
      action === COMPLETE_READ_ACTION &&
      Object.keys(body).some((key) =>
        !new Set(["action", "requestId", "cycle", "day", "readingEpoch"])
          .has(key)
      )
    ) {
      throw new PlatformApiRequestError("INVALID_PAYLOAD");
    }
    if (
      !Number.isSafeInteger(cycle) || Number(cycle) < 1 ||
      !Number.isSafeInteger(day) || Number(day) < 1 || Number(day) > 365
    ) {
      throw new PlatformApiRequestError("INVALID_PAYLOAD");
    }
    if (action === COMPLETE_READ_ACTION) {
      if (
        readingEpoch !== undefined &&
        (!Number.isSafeInteger(readingEpoch) || Number(readingEpoch) < 0)
      ) throw new PlatformApiRequestError("INVALID_PAYLOAD");
      return {
        action,
        requestId,
        cycle: Number(cycle),
        day: Number(day),
        readingEpoch: readingEpoch === undefined ? 0 : Number(readingEpoch),
      };
    }
    return { action, requestId, cycle: Number(cycle), day: Number(day) };
  }
  if (action === RESTART_READING_ACTION) {
    const allowedKeys = new Set([
      "action",
      "requestId",
      "cycle",
      "day",
      "readingEpoch",
    ]);
    if (
      Object.keys(body).some((key) => !allowedKeys.has(key)) ||
      !Number.isSafeInteger(cycle) || Number(cycle) < 1 ||
      !Number.isSafeInteger(day) || Number(day) < 1 || Number(day) > 365 ||
      !Number.isSafeInteger(readingEpoch) || Number(readingEpoch) < 0
    ) {
      throw new PlatformApiRequestError("INVALID_PAYLOAD");
    }
    return {
      action,
      requestId,
      cycle: Number(cycle),
      day: Number(day),
      readingEpoch: Number(readingEpoch),
    };
  }
  if (
    action === PREVIEW_QUIZ_SUBMISSION_ACTION ||
    action === SUBMIT_QUIZ_ACTION
  ) {
    if (
      action === SUBMIT_QUIZ_ACTION &&
      Object.keys(body).some((key) =>
        !new Set([
          "action",
          "requestId",
          "progressKey",
          "quizKey",
          "selectedIndex",
          "attemptSlot",
        ]).has(key)
      )
    ) {
      throw new PlatformApiRequestError("INVALID_PAYLOAD");
    }
    const progressMatch = typeof progressKey === "string"
      ? /^(?:e([1-9]\d*)_)?r([1-9]\d*)_d([1-9]\d*)$/.exec(progressKey)
      : null;
    const progressEpoch = progressMatch && progressMatch[1]
      ? Number(progressMatch[1])
      : 0;
    const progressCycle = progressMatch ? Number(progressMatch[2]) : NaN;
    const progressDay = progressMatch ? Number(progressMatch[3]) : NaN;
    if (
      !progressMatch || !Number.isSafeInteger(progressEpoch) ||
      !Number.isSafeInteger(progressCycle) ||
      !Number.isSafeInteger(progressDay) || progressDay < 1 ||
      progressDay > 365 || typeof quizKey !== "string" ||
      !/^[A-Za-z0-9_-]{1,128}$/.test(quizKey) ||
      !Number.isInteger(selectedIndex) || Number(selectedIndex) < 0 ||
      Number(selectedIndex) > 3 ||
      (action === SUBMIT_QUIZ_ACTION &&
        (!Number.isInteger(attemptSlot) ||
          ![1, 2].includes(Number(attemptSlot))))
    ) {
      throw new PlatformApiRequestError("INVALID_PAYLOAD");
    }
    const normalized = {
      requestId,
      progressKey: String(progressKey),
      quizKey: String(quizKey),
      selectedIndex: Number(selectedIndex),
    };
    return action === SUBMIT_QUIZ_ACTION
      ? { action, ...normalized, attemptSlot: Number(attemptSlot) as 1 | 2 }
      : { action, ...normalized };
  }
  if (action === SKIP_QUIZ_ACTION) {
    if (
      Object.keys(body).some((key) =>
        !new Set(["action", "requestId", "progressKey", "quizKey"]).has(key)
      )
    ) throw new PlatformApiRequestError("INVALID_PAYLOAD");
    const progressMatch = typeof progressKey === "string"
      ? /^(?:e([1-9]\d*)_)?r([1-9]\d*)_d([1-9]\d*)$/.exec(progressKey)
      : null;
    const progressEpoch = progressMatch && progressMatch[1]
      ? Number(progressMatch[1])
      : 0;
    const progressCycle = progressMatch ? Number(progressMatch[2]) : NaN;
    const progressDay = progressMatch ? Number(progressMatch[3]) : NaN;
    if (
      !progressMatch || !Number.isSafeInteger(progressEpoch) ||
      !Number.isSafeInteger(progressCycle) ||
      !Number.isSafeInteger(progressDay) || progressDay < 1 ||
      progressDay > 365 || typeof quizKey !== "string" ||
      !/^[A-Za-z0-9_-]{1,128}$/.test(quizKey)
    ) throw new PlatformApiRequestError("INVALID_PAYLOAD");
    return {
      action,
      requestId,
      progressKey: String(progressKey),
      quizKey: String(quizKey),
    };
  }
  if (action === JOIN_COMMUNITY_ACTION) {
    const safeId = (value: unknown, { optional = false } = {}) => {
      if (typeof value !== "string") return null;
      const normalized = value.trim();
      if (optional && !normalized) return "";
      if (
        !normalized || normalized.length > 128 || normalized.includes("/") ||
        /[\u0000-\u001f\u007f]/.test(normalized)
      ) return null;
      return normalized;
    };
    const normalizedChurchId = safeId(churchId);
    const normalizedDepartmentId = safeId(departmentId);
    const normalizedSubgroupId = safeId(subgroupId, { optional: true });
    const normalizedEntryCode = typeof entryCode === "string"
      ? entryCode.trim()
      : "";
    const normalizedJoinTicket = typeof joinTicket === "string"
      ? joinTicket.trim()
      : "";
    if (
      !normalizedChurchId || !normalizedDepartmentId ||
      normalizedSubgroupId === null ||
      !hasEntryCodeOrTicket(normalizedEntryCode, normalizedJoinTicket)
    ) {
      throw new PlatformApiRequestError("INVALID_PAYLOAD");
    }
    return {
      action,
      requestId,
      churchId: normalizedChurchId,
      entryCode: normalizedEntryCode,
      joinTicket: normalizedJoinTicket,
      departmentId: normalizedDepartmentId,
      subgroupId: normalizedSubgroupId,
    };
  }
  if (action === COMPLETE_MEMBER_SIGNUP_ACTION) {
    const normalizedChurchId = typeof churchId === "string"
      ? churchId.trim()
      : "";
    const normalizedEntryCode = typeof entryCode === "string"
      ? entryCode.trim()
      : "";
    const normalizedJoinTicket = typeof joinTicket === "string"
      ? joinTicket.trim()
      : "";
    const normalizedName = typeof name === "string" ? name.trim() : "";
    const normalizedBirthdate = typeof birthdate === "string"
      ? birthdate.trim()
      : "";
    const normalizedGuestProgress = guestProgress &&
        typeof guestProgress === "object" && !Array.isArray(guestProgress)
      ? guestProgress as Record<string, unknown>
      : null;
    if (
      !normalizedChurchId || normalizedChurchId.length > 128 ||
      normalizedChurchId.includes("/") ||
      /[\u0000-\u001f\u007f]/.test(normalizedChurchId) ||
      normalizedChurchId === "unaffiliated_v1" ||
      !hasEntryCodeOrTicket(normalizedEntryCode, normalizedJoinTicket) ||
      !normalizedName || normalizedName.length > 50 ||
      !/^\d{8}$/.test(normalizedBirthdate) || !normalizedGuestProgress
    ) {
      throw new PlatformApiRequestError("INVALID_PAYLOAD");
    }
    return {
      action,
      requestId,
      churchId: normalizedChurchId,
      entryCode: normalizedEntryCode,
      joinTicket: normalizedJoinTicket,
      name: normalizedName,
      birthdate: normalizedBirthdate,
      guestProgress: {
        currentDay: Number(normalizedGuestProgress.currentDay),
        streak: Number(normalizedGuestProgress.streak),
        lastReadDate: normalizedGuestProgress.lastReadDate === null
          ? null
          : String(normalizedGuestProgress.lastReadDate ?? ""),
        planId: String(normalizedGuestProgress.planId ?? ""),
      },
    };
  }
  if (action === COMPLETE_PERSONAL_SIGNUP_ACTION) {
    const safeId = (value: unknown) => {
      if (typeof value !== "string") return null;
      const normalized = value.trim();
      return normalized.length <= 128 && !normalized.includes("/") &&
          !/[\u0000-\u001f\u007f]/.test(normalized)
        ? normalized
        : null;
    };
    const normalizedChurchId = safeId(churchId);
    const normalizedDepartmentId = safeId(departmentId);
    const normalizedSubgroupId = safeId(subgroupId);
    const normalizedEntryCode = typeof entryCode === "string"
      ? entryCode.trim()
      : "";
    const normalizedJoinTicket = typeof joinTicket === "string"
      ? joinTicket.trim()
      : "";
    const normalizedName = typeof name === "string" ? name.trim() : "";
    const normalizedBirthdate = typeof birthdate === "string"
      ? birthdate.trim()
      : "";
    const normalizedAuthProvider = typeof authProvider === "string"
      ? authProvider.trim()
      : "";
    const progress = guestProgress && typeof guestProgress === "object" &&
        !Array.isArray(guestProgress)
      ? guestProgress as Record<string, unknown>
      : null;
    const realChurch = Boolean(
      normalizedChurchId && normalizedChurchId !== "unaffiliated_v1",
    );
    if (
      normalizedChurchId === null || normalizedDepartmentId === null ||
      normalizedSubgroupId === null ||
      !normalizedName || normalizedName.length > 50 ||
      !/^\d{8}$/.test(normalizedBirthdate) || !progress ||
      !["password", "google.com", "kakao.com"].includes(
        normalizedAuthProvider,
      ) ||
      (realChurch &&
        (!hasEntryCodeOrTicket(normalizedEntryCode, normalizedJoinTicket) ||
          !normalizedDepartmentId)) ||
      (!realChurch &&
        (normalizedEntryCode || normalizedJoinTicket ||
          normalizedDepartmentId || normalizedSubgroupId))
    ) {
      throw new PlatformApiRequestError("INVALID_PAYLOAD");
    }
    return {
      action,
      requestId,
      churchId: normalizedChurchId,
      entryCode: normalizedEntryCode,
      joinTicket: normalizedJoinTicket,
      departmentId: normalizedDepartmentId,
      subgroupId: normalizedSubgroupId,
      name: normalizedName,
      birthdate: normalizedBirthdate,
      authProvider: normalizedAuthProvider,
      guestProgress: {
        currentDay: Number(progress.currentDay),
        streak: Number(progress.streak),
        lastReadDate: progress.lastReadDate === null
          ? null
          : String(progress.lastReadDate ?? ""),
        planId: String(progress.planId ?? ""),
      },
    };
  }
  throw new PlatformApiRequestError("INVALID_ACTION");
};
