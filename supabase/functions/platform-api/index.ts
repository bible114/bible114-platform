import {
  handleCors,
  jsonResponse,
  platformErrorResponse,
} from "../_shared/cors.ts";
import { normalizeRole } from "../_shared/authz.ts";
import { PlatformError } from "../_shared/errors.ts";
import {
  getBearerToken,
  getServiceAccessToken,
  verifyFirebaseIdToken,
} from "../_shared/firebase.ts";
import {
  beginTransaction,
  commitWrites,
  getDocument,
  rollbackTransaction,
  runCollectionGroupQuery,
  updateWrite,
} from "../_shared/firestore.ts";
import {
  getCalendarDateKst,
  getLegacyCalendarDateStringKst,
  getServiceDateKst,
} from "../_shared/time.ts";
import { parsePlatformApiRequest, PlatformApiRequestError } from "./core.ts";
import quizAnswerIndex from "./quiz-answer-index.json" with { type: "json" };
import {
  type QuizIndexRecord,
  type StoredQuizUser,
  validateQuizSubmission,
} from "./quizCore.ts";
import { calculateReadCompletion, type StoredReadUser } from "./readCore.ts";
import {
  type JoinCommunityChurch,
  type JoinCommunityUser,
  JoinCommunityValidationError,
  validateJoinCommunity,
} from "./joinCore.ts";
import {
  type MemberSignupChurch,
  type MemberSignupConsent,
  type MemberSignupUser,
  MemberSignupValidationError,
  validateMemberSignup,
} from "./memberSignupCore.ts";
import {
  type PersonalSignupChurch,
  type PersonalSignupConsent,
  type PersonalSignupUser,
  PersonalSignupValidationError,
  validatePersonalSignup,
} from "./personalSignupCore.ts";
import {
  type PurchaseRecord,
  PurchaseValidationError,
  validatePurchase,
} from "./purchaseCore.ts";
import {
  buildJoinRateLimitScopes,
  canConsumeJoinAttempt,
  type JoinPurpose,
  type JoinTicketRecord,
  validateJoinTicketUse,
} from "./joinSecurityCore.ts";

// T122-T123 shadow 단계: 읽기·퀴즈 결과를 계산만 하며 Firestore 쓰기는 금지한다.
type UserDocument = StoredReadUser & StoredQuizUser & {
  role?: unknown;
  isDeleted?: unknown;
};

type JoinRateLimitDocument = {
  count?: unknown;
  resetAt?: unknown;
};

const INVALID_JOIN_CODE_MESSAGE = "입장코드가 올바르지 않습니다.";

const sha256Hex = async (value: string): Promise<string> => {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(
    new Uint8Array(digest),
    (byte) => byte.toString(16).padStart(2, "0"),
  ).join("");
};

const isUuid = (value: string) =>
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
    .test(value);

const sanitizeDocId = (value: string) => value.replace(/[^A-Za-z0-9_-]/g, "_");

const getClientIp = (request: Request) => {
  const forwarded = request.headers.get("x-forwarded-for") || "";
  const forwardedChain = forwarded.split(",").map((value) => value.trim())
    .filter(Boolean);
  return (
    request.headers.get("cf-connecting-ip") ||
    forwardedChain.at(-1) ||
    request.headers.get("x-real-ip") ||
    "unknown"
  ).slice(0, 128);
};

const rateLimitKey = async (
  request: Request,
  churchId: string,
) => {
  const now = new Date();
  const hour = `${now.toISOString().slice(0, 13)}:00`;
  const salt = Deno.env.get("JOIN_CODE_RATE_LIMIT_SALT") ||
    "bible114-platform-api";
  const scopes = buildJoinRateLimitScopes({
    hour,
    churchId,
    clientId: getClientIp(request),
  });
  return {
    hour,
    scopes: await Promise.all(scopes.map(async (scope) => ({
      ...scope,
      key: (await sha256Hex(`${salt}:${scope.keyInput}`)).slice(0, 40),
    }))),
  };
};

const consumeJoinAttempt = async (
  request: Request,
  service: { token: string; projectId: string },
  churchId: string,
) => {
  const { hour, scopes } = await rateLimitKey(request, churchId);
  const paths = scopes.map(({ key }) =>
    `joinCodeRateLimits/${sanitizeDocId(`${hour}_${key}`)}`
  );
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const transaction = await beginTransaction(
      service.token,
      service.projectId,
    );
    try {
      const existingDocuments = await Promise.all(
        paths.map((path) =>
          getDocument<JoinRateLimitDocument>(
            service.token,
            service.projectId,
            path,
            { transaction },
          )
        ),
      );
      if (
        existingDocuments.some((existing, index) =>
          !canConsumeJoinAttempt(existing?.data.count, scopes[index].limit)
        )
      ) {
        throw new PlatformError("RATE_LIMITED");
      }
      const now = new Date();
      const resetAt = new Date(now);
      resetAt.setMinutes(59, 59, 999);
      await commitWrites(
        service.token,
        service.projectId,
        paths.map((path, index) => {
          const existing = existingDocuments[index];
          return updateWrite(service.projectId, path, {
            churchId,
            scope: scopes[index].scope,
            hour,
            count: Number(existing?.data.count || 0) + 1,
            resetAt,
            updatedAt: now,
          }, { exists: existing ? true : false });
        }),
        { transaction },
      );
      return;
    } catch (error) {
      await rollbackTransaction(service.token, service.projectId, transaction)
        .catch(() => {});
      const retryableContention = error instanceof PlatformError &&
        error.code === "FIRESTORE_WRITE_FAILED" &&
        error.details?.status === 409;
      if (retryableContention && attempt < 2) continue;
      throw error;
    }
  }
};

const getChurchAccessHash = async (
  service: { token: string; projectId: string },
  churchId: string,
  options: { transaction?: string } = {},
) => {
  const [accessDocument, churchDocument] = await Promise.all([
    getDocument<Record<string, unknown>>(
      service.token,
      service.projectId,
      `churches/${churchId}/private/access`,
      options,
    ),
    getDocument<Record<string, unknown>>(
      service.token,
      service.projectId,
      `churches/${churchId}`,
      options,
    ),
  ]);
  if (!churchDocument || churchDocument.data.isDeleted === true) {
    throw new PlatformError("FORBIDDEN", {
      message: INVALID_JOIN_CODE_MESSAGE,
    });
  }
  const privateHash = typeof accessDocument?.data.codeHash === "string"
    ? accessDocument.data.codeHash
    : "";
  const legacyHash = typeof churchDocument.data.churchCodeHash === "string"
    ? churchDocument.data.churchCodeHash
    : "";
  const hash = privateHash || legacyHash;
  if (!hash) {
    throw new PlatformError("FORBIDDEN", {
      message: INVALID_JOIN_CODE_MESSAGE,
    });
  }
  return { hash, church: churchDocument };
};

const resolveJoinCredential = async (
  service: { token: string; projectId: string },
  input: {
    churchId: string;
    entryCode: string;
    joinTicket: string;
    purpose: JoinPurpose;
    uid: string;
    requestId: string;
    transaction: string;
  },
) => {
  if (input.joinTicket) {
    if (!isUuid(input.joinTicket)) throw new PlatformError("BAD_REQUEST");
    const path = `joinTickets/${input.joinTicket}`;
    const ticket = await getDocument<JoinTicketRecord>(
      service.token,
      service.projectId,
      path,
      { transaction: input.transaction },
    );
    const decision = validateJoinTicketUse(ticket?.data || null, {
      churchId: input.churchId,
      purpose: input.purpose,
      uid: input.uid,
      requestId: input.requestId,
      nowMs: Date.now(),
    });
    if (!decision.allowed) {
      throw new PlatformError("FORBIDDEN", {
        message: "입장코드를 다시 확인해주세요.",
      });
    }
    return {
      entryCodeHash: decision.codeHash,
      ticketPath: path,
      consumeTicket: decision.consume,
    };
  }
  return {
    entryCodeHash: await sha256Hex(input.entryCode),
    ticketPath: null,
    consumeTicket: false,
  };
};

const joinValidationError = (error: JoinCommunityValidationError) => {
  switch (error.code) {
    case "USER_UNAVAILABLE":
      return new PlatformError("FORBIDDEN");
    case "CHURCH_UNAVAILABLE":
    case "UNSUPPORTED_CHURCH":
      return new PlatformError("NOT_FOUND", {
        message: "참여할 공동체를 찾을 수 없습니다.",
      });
    case "BASE_CHURCH":
      return new PlatformError("CONFLICT", {
        message: "현재 주 소속은 추가할 수 없습니다.",
      });
    case "INVALID_ENTRY_CODE":
      return new PlatformError("FORBIDDEN", {
        message: "공동체 입장코드가 틀렸습니다.",
      });
    case "MEMBERSHIP_LIMIT":
      return new PlatformError("CONFLICT", {
        message: "공동체는 최대 3개까지 추가할 수 있습니다.",
      });
    case "INVALID_DEPARTMENT":
    case "INVALID_SUBGROUP":
      return new PlatformError("BAD_REQUEST", {
        message: "공동체의 부서와 소그룹을 다시 선택해주세요.",
      });
  }
};

const memberSignupValidationError = (error: MemberSignupValidationError) => {
  switch (error.code) {
    case "CHURCH_UNAVAILABLE":
      return new PlatformError("NOT_FOUND", {
        message: "가입할 공동체를 찾을 수 없습니다.",
      });
    case "INVALID_ENTRY_CODE":
      return new PlatformError("FORBIDDEN", {
        message: "교회 입장코드가 틀렸습니다.",
      });
    case "INVALID_PROFILE":
      return new PlatformError("BAD_REQUEST", {
        message: "가입자 정보를 다시 확인해주세요.",
      });
    case "INVALID_CONSENT":
      return new PlatformError("BAD_REQUEST", {
        message: "가입 동의 정보를 다시 확인해주세요.",
      });
    case "USER_CONFLICT":
    case "ROSTER_CONFLICT":
      return new PlatformError("CONFLICT", {
        message: "기존 가입 정보와 충돌합니다. 관리자에게 문의해주세요.",
      });
  }
};

const personalSignupValidationError = (
  error: PersonalSignupValidationError,
) => {
  switch (error.code) {
    case "CHURCH_UNAVAILABLE":
      return new PlatformError("NOT_FOUND", {
        message: "가입할 공동체를 찾을 수 없습니다.",
      });
    case "INVALID_ENTRY_CODE":
      return new PlatformError("FORBIDDEN", {
        message: "공동체 입장코드가 틀렸습니다.",
      });
    case "INVALID_DEPARTMENT":
    case "INVALID_SUBGROUP":
    case "INVALID_PROFILE":
    case "INVALID_CONSENT":
      return new PlatformError("BAD_REQUEST", {
        message: "가입 정보를 다시 확인해주세요.",
      });
    case "USER_CONFLICT":
    case "ROSTER_CONFLICT":
      return new PlatformError("CONFLICT", {
        message: "기존 가입 정보와 충돌합니다. 다시 로그인해주세요.",
      });
  }
};

const purchaseValidationError = (error: PurchaseValidationError) => {
  switch (error.code) {
    case "USER_UNAVAILABLE":
    case "MEMBERSHIP_REQUIRED":
      return new PlatformError("FORBIDDEN");
    case "MARKET_UNAVAILABLE":
    case "INVALID_DEPARTMENT":
    case "ITEM_UNAVAILABLE":
      return new PlatformError("BAD_REQUEST", {
        message: "현재 구매할 수 없는 상품입니다.",
      });
    case "INSUFFICIENT_TALENT":
      return new PlatformError("CONFLICT", { message: "달란트가 부족합니다." });
  }
};

const readJsonBody = async (request: Request): Promise<unknown> => {
  try {
    return await request.json();
  } catch (error) {
    throw new PlatformError("BAD_REQUEST", { cause: error });
  }
};

const requestError = (error: PlatformApiRequestError): PlatformError => {
  if (error.code === "INVALID_ACTION") {
    return new PlatformError("BAD_REQUEST", {
      message: "지원하지 않는 작업입니다.",
    });
  }
  return new PlatformError("BAD_REQUEST");
};

Deno.serve(async (request) => {
  const corsResult = handleCors(request);
  if (corsResult instanceof Response) return corsResult;
  const origin = corsResult;

  try {
    let parsed;
    try {
      parsed = parsePlatformApiRequest(await readJsonBody(request));
    } catch (error) {
      if (error instanceof PlatformApiRequestError) throw requestError(error);
      throw error;
    }

    if (parsed.action === "issueJoinTicket") {
      const service = await getServiceAccessToken();
      await consumeJoinAttempt(
        request,
        service,
        parsed.churchId,
      );
      const { hash, church } = await getChurchAccessHash(
        service,
        parsed.churchId,
      );
      if (hash !== await sha256Hex(parsed.entryCode)) {
        throw new PlatformError("FORBIDDEN", {
          message: INVALID_JOIN_CODE_MESSAGE,
        });
      }
      const now = new Date();
      const expiresAt = new Date(now.getTime() + 5 * 60 * 1000);
      const ticketId = parsed.requestId;
      await commitWrites(service.token, service.projectId, [
        updateWrite(service.projectId, `joinTickets/${ticketId}`, {
          churchId: parsed.churchId,
          purpose: parsed.purpose,
          codeHash: hash,
          issuedAt: now,
          expiresAt,
          usedAt: null,
          usedBy: null,
          usedRequestId: null,
        }, { exists: false }),
      ]);
      return jsonResponse(origin, 200, {
        ok: true,
        action: parsed.action,
        requestId: parsed.requestId,
        joinTicket: ticketId,
        expiresAt: expiresAt.toISOString(),
        church: {
          id: parsed.churchId,
          name: typeof church.data.name === "string" ? church.data.name : "",
          departments: Array.isArray(church.data.departments)
            ? church.data.departments
            : (Array.isArray(church.data.communities)
              ? church.data.communities
              : []),
        },
      });
    }

    const idToken = getBearerToken(request);
    const [verifiedUser, service] = await Promise.all([
      verifyFirebaseIdToken(idToken, { allowAnonymous: false }),
      getServiceAccessToken(),
    ]);
    const { uid } = verifiedUser;

    // 최초 교회 교인 가입은 users 문서가 아직 없으므로
    // 기존 사용자 조회·삭제 검사보다 먼저 처리한다.
    if (parsed.action === "completeMemberSignup") {
      if (parsed.entryCode) {
        await consumeJoinAttempt(
          request,
          service,
          parsed.churchId,
        );
      }
      const tokenEmail = typeof verifiedUser.claims.email === "string"
        ? verifiedUser.claims.email
        : "";
      const transaction = await beginTransaction(
        service.token,
        service.projectId,
      );
      try {
        const userPath = `users/${uid}`;
        const churchPath = `churches/${parsed.churchId}`;
        const consentPath = `${userPath}/private/consent`;
        // 기본 교회 소속은 users.churchId가 원장이고 roster는 추가
        // 공동체 소속 원장이다. 여기서 기본 roster까지 만들면
        // 현재 온보딩의 부서 선택과 탈퇴 UI에 중복 소속으로 노출된다.
        // 다만 새 users가 없는데 동일 기본 roster만 남은 충돌은 거부한다.
        const rosterPath = `${churchPath}/roster/${uid}`;
        const [
          existingUser,
          churchDocument,
          accessDocument,
          consentDocument,
          existingRoster,
        ] = await Promise.all([
          getDocument<MemberSignupUser>(
            service.token,
            service.projectId,
            userPath,
            { transaction },
          ),
          getDocument<MemberSignupChurch>(
            service.token,
            service.projectId,
            churchPath,
            { transaction },
          ),
          getDocument<Record<string, unknown>>(
            service.token,
            service.projectId,
            `${churchPath}/private/access`,
            { transaction },
          ),
          getDocument<MemberSignupConsent>(
            service.token,
            service.projectId,
            consentPath,
            { transaction },
          ),
          getDocument<Record<string, unknown>>(
            service.token,
            service.projectId,
            rosterPath,
            { transaction },
          ),
        ]);

        const credential = await resolveJoinCredential(service, {
          churchId: parsed.churchId,
          entryCode: parsed.entryCode,
          joinTicket: parsed.joinTicket,
          purpose: "memberSignup",
          uid,
          requestId: parsed.requestId,
          transaction,
        });
        const churchData = churchDocument?.data
          ? {
            ...churchDocument.data,
            churchCodeHash: typeof accessDocument?.data.codeHash === "string"
              ? accessDocument.data.codeHash
              : churchDocument.data.churchCodeHash,
          }
          : null;
        let decision;
        try {
          decision = validateMemberSignup({
            uid,
            email: tokenEmail,
            churchId: parsed.churchId,
            entryCodeHash: credential.entryCodeHash,
            name: parsed.name,
            birthdate: parsed.birthdate,
            guestProgress: parsed.guestProgress,
            calendarDate: getCalendarDateKst(),
            church: churchData,
            consent: consentDocument?.data || null,
            existingUser: existingUser?.data || null,
            existingRoster: existingRoster?.data || null,
          });
        } catch (error) {
          if (error instanceof MemberSignupValidationError) {
            throw memberSignupValidationError(error);
          }
          throw error;
        }

        if (decision.status === "alreadyCompleted") {
          await rollbackTransaction(
            service.token,
            service.projectId,
            transaction,
          ).catch(() => {});
          return jsonResponse(origin, 200, {
            ok: true,
            action: parsed.action,
            requestId: parsed.requestId,
            alreadyCompleted: true,
            created: false,
            user: existingUser?.data,
          });
        }

        const now = new Date();
        const { guestProgress, ...safeProfile } = decision.profile;
        const userData = {
          ...safeProfile,
          password: null,
          role: "member",
          churchId: parsed.churchId,
          extraMemberships: [],
          startDate: getLegacyCalendarDateStringKst(now),
          currentDay: guestProgress.currentDay,
          streak: guestProgress.streak,
          score: 0,
          talent: 0,
          talentMigrated: true,
          readCount: 1,
          lastReadDate: guestProgress.lastReadDate,
          dailyAdvanceDate: null,
          dailyAdvanceCount: 0,
          gender: "male",
          planId: guestProgress.planId,
          departmentId: null,
          departmentName: null,
          subgroupId: null,
          subgroupName: null,
          isDeleted: false,
          deletedAt: null,
          deletedBy: null,
          createdAt: now,
          updatedAt: now,
        };
        const writes = [
          updateWrite(service.projectId, userPath, userData, {
            exists: decision.status === "reactivate" ? true : false,
          }),
        ];
        if (credential.ticketPath && credential.consumeTicket) {
          writes.push(updateWrite(service.projectId, credential.ticketPath, {
            usedAt: now,
            usedBy: uid,
            usedRequestId: parsed.requestId,
          }, {
            updateMask: ["usedAt", "usedBy", "usedRequestId"],
            exists: true,
          }));
        }
        await commitWrites(
          service.token,
          service.projectId,
          writes,
          { transaction },
        );
        return jsonResponse(origin, 200, {
          ok: true,
          action: parsed.action,
          requestId: parsed.requestId,
          alreadyCompleted: false,
          created: decision.status === "create",
          reactivated: decision.status === "reactivate",
          user: {
            ...userData,
            createdAt: now.toISOString(),
            updatedAt: now.toISOString(),
          },
        });
      } catch (error) {
        await rollbackTransaction(
          service.token,
          service.projectId,
          transaction,
        ).catch(() => {});
        throw error;
      }
    }

    // 개인 계정의 최초 users 문서와 선택 공동체 roster를 서버가 원자적으로 만든다.
    // Auth만 생성되고 응답이 끊긴 경우 같은 요청을 다시 보내도 기존 결과를 복구한다.
    if (parsed.action === "completePersonalSignup") {
      if (
        parsed.entryCode && parsed.churchId &&
        parsed.churchId !== "unaffiliated_v1"
      ) {
        await consumeJoinAttempt(
          request,
          service,
          parsed.churchId,
        );
      }
      const transaction = await beginTransaction(
        service.token,
        service.projectId,
      );
      try {
        const userPath = `users/${uid}`;
        const consentPath = `${userPath}/private/consent`;
        const churchPath = parsed.churchId ? `churches/${parsed.churchId}` : "";
        const rosterPath = churchPath ? `${churchPath}/roster/${uid}` : "";
        const [
          existingUser,
          consentDocument,
          churchDocument,
          accessDocument,
          existingRoster,
        ] = await Promise.all([
          getDocument<PersonalSignupUser>(
            service.token,
            service.projectId,
            userPath,
            { transaction },
          ),
          getDocument<PersonalSignupConsent>(
            service.token,
            service.projectId,
            consentPath,
            { transaction },
          ),
          churchPath && parsed.churchId !== "unaffiliated_v1"
            ? getDocument<PersonalSignupChurch>(
              service.token,
              service.projectId,
              churchPath,
              { transaction },
            )
            : Promise.resolve(null),
          churchPath && parsed.churchId !== "unaffiliated_v1"
            ? getDocument<Record<string, unknown>>(
              service.token,
              service.projectId,
              `${churchPath}/private/access`,
              { transaction },
            )
            : Promise.resolve(null),
          rosterPath
            ? getDocument<Record<string, unknown>>(
              service.token,
              service.projectId,
              rosterPath,
              { transaction },
            )
            : Promise.resolve(null),
        ]);
        const tokenEmail = typeof verifiedUser.claims.email === "string"
          ? verifiedUser.claims.email
          : null;
        const credential =
          parsed.churchId && parsed.churchId !== "unaffiliated_v1"
            ? await resolveJoinCredential(service, {
              churchId: parsed.churchId,
              entryCode: parsed.entryCode,
              joinTicket: parsed.joinTicket,
              purpose: "personalSignup",
              uid,
              requestId: parsed.requestId,
              transaction,
            })
            : { entryCodeHash: "", ticketPath: null, consumeTicket: false };
        const churchData = churchDocument?.data
          ? {
            ...churchDocument.data,
            churchCodeHash: typeof accessDocument?.data.codeHash === "string"
              ? accessDocument.data.codeHash
              : churchDocument.data.churchCodeHash,
          }
          : null;
        let decision;
        try {
          decision = validatePersonalSignup({
            uid,
            email: tokenEmail,
            signInProvider: verifiedUser.signInProvider,
            authProvider: parsed.authProvider,
            name: parsed.name,
            birthdate: parsed.birthdate,
            guestProgress: parsed.guestProgress,
            calendarDate: getCalendarDateKst(),
            churchId: parsed.churchId,
            entryCodeHash: credential.entryCodeHash,
            departmentId: parsed.departmentId,
            subgroupId: parsed.subgroupId,
            church: churchData,
            consent: consentDocument?.data || null,
            existingUser: existingUser?.data || null,
            existingRoster: existingRoster?.data || null,
          });
        } catch (error) {
          if (error instanceof PersonalSignupValidationError) {
            throw personalSignupValidationError(error);
          }
          throw error;
        }

        if (decision.status === "alreadyCompleted") {
          await rollbackTransaction(
            service.token,
            service.projectId,
            transaction,
          ).catch(() => {});
          return jsonResponse(origin, 200, {
            ok: true,
            action: parsed.action,
            requestId: parsed.requestId,
            alreadyCompleted: true,
            created: false,
            user: existingUser?.data,
            membership: existingRoster?.data || null,
          });
        }

        const now = new Date();
        const progress = parsed.guestProgress;
        const churchName = parsed.churchId === "unaffiliated_v1"
          ? "성경 읽는 사람들"
          : (typeof churchDocument?.data.name === "string"
            ? churchDocument.data.name.trim()
            : null);
        const userData = {
          uid,
          name: parsed.name,
          email: decision.email,
          birthdate: parsed.birthdate,
          password: null,
          role: "member",
          accountType: "personal",
          churchId: null,
          churchName: null,
          primaryOrgId: parsed.churchId || null,
          extraMemberships: [],
          authProvider: parsed.authProvider,
          authProviders: [parsed.authProvider],
          startDate: getLegacyCalendarDateStringKst(now),
          currentDay: progress.currentDay,
          streak: progress.streak,
          score: 0,
          talent: 0,
          talentMigrated: true,
          readCount: 1,
          lastReadDate: progress.lastReadDate,
          dailyAdvanceDate: null,
          dailyAdvanceCount: 0,
          gender: "male",
          planId: progress.planId,
          departmentId: null,
          departmentName: null,
          subgroupId: null,
          subgroupName: null,
          consentSummary: decision.consentSummary,
          isDeleted: false,
          deletedAt: null,
          deletedBy: null,
          createdAt: now,
          updatedAt: now,
        };
        const membership = decision.membership && rosterPath
          ? {
            uid,
            name: parsed.name,
            score: 0,
            talent: 0,
            currentDay: progress.currentDay,
            streak: progress.streak,
            readCount: 1,
            lastReadDate: progress.lastReadDate,
            ...decision.membership,
            extraMemberships: [],
            joinedAt: now,
            updatedAt: now,
          }
          : null;
        const writes = [
          updateWrite(service.projectId, userPath, userData, { exists: false }),
        ];
        if (membership && rosterPath) {
          writes.push(
            updateWrite(service.projectId, rosterPath, membership, {
              exists: false,
            }),
          );
        }
        if (credential.ticketPath && credential.consumeTicket) {
          writes.push(updateWrite(service.projectId, credential.ticketPath, {
            usedAt: now,
            usedBy: uid,
            usedRequestId: parsed.requestId,
          }, {
            updateMask: ["usedAt", "usedBy", "usedRequestId"],
            exists: true,
          }));
        }
        await commitWrites(service.token, service.projectId, writes, {
          transaction,
        });
        return jsonResponse(origin, 200, {
          ok: true,
          action: parsed.action,
          requestId: parsed.requestId,
          alreadyCompleted: false,
          created: true,
          user: {
            ...userData,
            createdAt: now.toISOString(),
            updatedAt: now.toISOString(),
          },
          membership: membership
            ? {
              ...membership,
              joinedAt: now.toISOString(),
              updatedAt: now.toISOString(),
            }
            : null,
          churchName,
        });
      } catch (error) {
        await rollbackTransaction(service.token, service.projectId, transaction)
          .catch(() => {});
        throw error;
      }
    }

    const userDocument = await getDocument<UserDocument>(
      service.token,
      service.projectId,
      `users/${uid}`,
    );
    if (!userDocument) throw new PlatformError("NOT_FOUND");
    if (userDocument.data.isDeleted === true) {
      throw new PlatformError("FORBIDDEN");
    }

    const role = normalizeRole(userDocument.data.role);

    if (parsed.action === "purchaseItem") {
      const transaction = await beginTransaction(
        service.token,
        service.projectId,
      );
      try {
        const userPath = `users/${uid}`;
        const churchPath = `churches/${parsed.churchId}`;
        const rosterPath = `${churchPath}/roster/${uid}`;
        const shopPath = `${churchPath}/settings/talentShop`;
        const purchasePath =
          `${churchPath}/talentPurchases/${parsed.requestId}`;
        const [freshUser, roster, talentShop, existingPurchase] = await Promise
          .all([
            getDocument<PurchaseRecord>(
              service.token,
              service.projectId,
              userPath,
              { transaction },
            ),
            getDocument<PurchaseRecord>(
              service.token,
              service.projectId,
              rosterPath,
              { transaction },
            ),
            getDocument<PurchaseRecord>(
              service.token,
              service.projectId,
              shopPath,
              { transaction },
            ),
            getDocument<PurchaseRecord>(
              service.token,
              service.projectId,
              purchasePath,
              { transaction },
            ),
          ]);
        if (existingPurchase) {
          if (existingPurchase.data.uid !== uid) {
            throw new PlatformError("CONFLICT");
          }
          await rollbackTransaction(
            service.token,
            service.projectId,
            transaction,
          ).catch(() => {});
          return jsonResponse(origin, 200, {
            ok: true,
            action: parsed.action,
            requestId: parsed.requestId,
            alreadyCompleted: true,
            nextTalent: existingPurchase.data.walletBalanceAfter,
            walletKind: existingPurchase.data.walletKind,
            purchase: {
              id: parsed.requestId,
              itemId: existingPurchase.data.itemId,
              itemName: existingPurchase.data.itemName,
              price: existingPurchase.data.price,
              status: existingPurchase.data.status,
              createdAt: existingPurchase.data.createdAt,
              departmentId: existingPurchase.data.departmentId,
              departmentName: existingPurchase.data.departmentName,
              marketId: existingPurchase.data.marketId,
              schemaVersion: 2,
            },
          });
        }
        if (!freshUser) throw new PlatformError("NOT_FOUND");
        let decision;
        try {
          decision = validatePurchase({
            uid,
            churchId: parsed.churchId,
            itemId: parsed.itemId,
            departmentId: parsed.departmentId,
            marketId: parsed.marketId,
            user: freshUser.data,
            roster: roster?.data || null,
            talentShop: talentShop?.data || null,
          });
        } catch (error) {
          if (error instanceof PurchaseValidationError) {
            throw purchaseValidationError(error);
          }
          throw error;
        }
        const now = new Date();
        const walletPath = decision.walletKind === "roster"
          ? rosterPath
          : userPath;
        const purchase = {
          uid,
          memberName: String(
            roster?.data.name || freshUser.data.name || "회원",
          ),
          itemId: decision.item.id,
          itemName: decision.item.name,
          price: decision.item.price,
          status: "pending",
          createdAt: now,
          schemaVersion: 2,
          departmentId: decision.departmentId,
          departmentName: decision.departmentName,
          marketId: decision.marketId,
          walletKind: decision.walletKind,
          walletOrgId: parsed.churchId,
          walletBalanceAfter: decision.nextTalent,
          requestId: parsed.requestId,
        };
        const walletUpdate = decision.walletKind === "roster"
          ? { talent: decision.nextTalent, updatedAt: now }
          : { talent: decision.nextTalent };
        await commitWrites(service.token, service.projectId, [
          updateWrite(service.projectId, walletPath, walletUpdate, {
            updateMask: Object.keys(walletUpdate),
            exists: true,
          }),
          updateWrite(service.projectId, purchasePath, purchase, {
            exists: false,
          }),
        ], { transaction });
        return jsonResponse(origin, 200, {
          ok: true,
          action: parsed.action,
          requestId: parsed.requestId,
          alreadyCompleted: false,
          nextTalent: decision.nextTalent,
          walletKind: decision.walletKind,
          purchase: {
            id: parsed.requestId,
            itemId: purchase.itemId,
            itemName: purchase.itemName,
            price: purchase.price,
            status: purchase.status,
            createdAt: now.toISOString(),
            schemaVersion: 2,
            departmentId: purchase.departmentId,
            departmentName: purchase.departmentName,
            marketId: purchase.marketId,
          },
        });
      } catch (error) {
        await rollbackTransaction(service.token, service.projectId, transaction)
          .catch(() => {});
        throw error;
      }
    }

    if (parsed.action === "joinCommunity") {
      if (parsed.entryCode) {
        await consumeJoinAttempt(
          request,
          service,
          parsed.churchId,
        );
      }
      const transaction = await beginTransaction(
        service.token,
        service.projectId,
      );
      try {
        const userPath = `users/${uid}`;
        const churchPath = `churches/${parsed.churchId}`;
        const rosterPath = `${churchPath}/roster/${uid}`;
        const [
          transactionUser,
          churchDocument,
          accessDocument,
          existingRoster,
          rosterDocuments,
        ] = await Promise.all([
          getDocument<JoinCommunityUser>(
            service.token,
            service.projectId,
            userPath,
            { transaction },
          ),
          getDocument<JoinCommunityChurch>(
            service.token,
            service.projectId,
            churchPath,
            { transaction },
          ),
          getDocument<Record<string, unknown>>(
            service.token,
            service.projectId,
            `${churchPath}/private/access`,
            { transaction },
          ),
          getDocument<Record<string, unknown>>(
            service.token,
            service.projectId,
            rosterPath,
            { transaction },
          ),
          runCollectionGroupQuery<Record<string, unknown>>(
            service.token,
            service.projectId,
            "roster",
            "uid",
            uid,
            { limit: 4, transaction },
          ),
        ]);
        if (!transactionUser) throw new PlatformError("NOT_FOUND");
        if (!churchDocument) {
          throw new PlatformError("NOT_FOUND", {
            message: "참여할 공동체를 찾을 수 없습니다.",
          });
        }

        const credential = await resolveJoinCredential(service, {
          churchId: parsed.churchId,
          entryCode: parsed.entryCode,
          joinTicket: parsed.joinTicket,
          purpose: "joinCommunity",
          uid,
          requestId: parsed.requestId,
          transaction,
        });
        const churchData = {
          ...churchDocument.data,
          churchCodeHash: typeof accessDocument?.data.codeHash === "string"
            ? accessDocument.data.codeHash
            : churchDocument.data.churchCodeHash,
        };
        let decision;
        try {
          decision = validateJoinCommunity({
            uid,
            churchId: parsed.churchId,
            entryCodeHash: credential.entryCodeHash,
            departmentId: parsed.departmentId,
            subgroupId: parsed.subgroupId,
            rosterCount: rosterDocuments.length,
            existingRoster: existingRoster?.data || null,
            user: transactionUser.data,
            church: churchData,
          });
        } catch (error) {
          if (error instanceof JoinCommunityValidationError) {
            throw joinValidationError(error);
          }
          throw error;
        }

        if (decision.status === "alreadyJoined") {
          await rollbackTransaction(
            service.token,
            service.projectId,
            transaction,
          ).catch(() => {});
          return jsonResponse(origin, 200, {
            ok: true,
            action: parsed.action,
            requestId: parsed.requestId,
            alreadyJoined: true,
            primaryOrgId: transactionUser.data.primaryOrgId || null,
            membership: decision.membership,
          });
        }

        const now = new Date();
        const membership = {
          ...decision.membership,
          joinedAt: now,
          updatedAt: now,
        };
        const writes = [
          updateWrite(service.projectId, rosterPath, membership, {
            exists: false,
          }),
        ];
        if (credential.ticketPath && credential.consumeTicket) {
          writes.push(updateWrite(service.projectId, credential.ticketPath, {
            usedAt: now,
            usedBy: uid,
            usedRequestId: parsed.requestId,
          }, {
            updateMask: ["usedAt", "usedBy", "usedRequestId"],
            exists: true,
          }));
        }
        if (decision.shouldAssignPrimary) {
          writes.push(updateWrite(service.projectId, userPath, {
            primaryOrgId: parsed.churchId,
            updatedAt: now,
          }, {
            updateMask: ["primaryOrgId", "updatedAt"],
            exists: true,
          }));
        }
        await commitWrites(service.token, service.projectId, writes, {
          transaction,
        });
        return jsonResponse(origin, 200, {
          ok: true,
          action: parsed.action,
          requestId: parsed.requestId,
          alreadyJoined: false,
          primaryOrgId: decision.shouldAssignPrimary
            ? parsed.churchId
            : (transactionUser.data.primaryOrgId || null),
          membership: {
            ...decision.membership,
            joinedAt: now.toISOString(),
            updatedAt: now.toISOString(),
          },
        });
      } catch (error) {
        await rollbackTransaction(
          service.token,
          service.projectId,
          transaction,
        ).catch(() => {});
        throw error;
      }
    }

    if (parsed.action === "previewReadCompletion") {
      const todayLegacy = getLegacyCalendarDateStringKst();
      const rosterDocuments = await runCollectionGroupQuery(
        service.token,
        service.projectId,
        "roster",
        "uid",
        uid,
        { limit: 4 },
      );
      if (rosterDocuments.length >= 4) {
        throw new PlatformError("CONFLICT", {
          message: "가입 공동체 수를 확인해 주세요.",
        });
      }
      const result = calculateReadCompletion(
        userDocument.data,
        { cycle: parsed.cycle, day: parsed.day },
        todayLegacy,
      );
      return jsonResponse(origin, 200, {
        ok: true,
        action: parsed.action,
        requestId: parsed.requestId,
        uid,
        role,
        calendarDate: todayLegacy,
        rosterCount: rosterDocuments.length,
        result,
      });
    }

    if (parsed.action === "previewQuizSubmission") {
      const todayLegacy = getLegacyCalendarDateStringKst();
      const questions = quizAnswerIndex.questions as Record<
        string,
        QuizIndexRecord | undefined
      >;
      const result = validateQuizSubmission({
        user: userDocument.data,
        progressKey: parsed.progressKey,
        quizKey: parsed.quizKey,
        selectedIndex: parsed.selectedIndex,
        todayLegacy,
        indexRecord: questions[parsed.quizKey],
      });
      return jsonResponse(origin, 200, {
        ok: true,
        action: parsed.action,
        requestId: parsed.requestId,
        uid,
        role,
        calendarDate: todayLegacy,
        result,
      });
    }

    return jsonResponse(origin, 200, {
      ok: true,
      action: parsed.action,
      requestId: parsed.requestId,
      uid,
      role,
      serviceDate: getServiceDateKst(),
    });
  } catch (error) {
    // 요청 본문이나 토큰 같은 민감값은 로그에 남기지 않는다.
    const label = error instanceof PlatformError ? error.code : "INTERNAL";
    console.error("platform-api failed", label);
    return platformErrorResponse(origin, error);
  }
});
