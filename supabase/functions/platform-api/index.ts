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
import { getDocument, runCollectionGroupQuery } from "../_shared/firestore.ts";
import {
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

// T122-T123 shadow 단계: 읽기·퀴즈 결과를 계산만 하며 Firestore 쓰기는 금지한다.
type UserDocument = StoredReadUser & StoredQuizUser & {
  role?: unknown;
  isDeleted?: unknown;
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

    const idToken = getBearerToken(request);
    const [{ uid }, service] = await Promise.all([
      verifyFirebaseIdToken(idToken, { allowAnonymous: false }),
      getServiceAccessToken(),
    ]);
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
