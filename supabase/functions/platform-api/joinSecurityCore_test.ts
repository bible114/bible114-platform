import {
  buildJoinRateLimitScopes,
  canConsumeJoinAttempt,
  JOIN_CHURCH_HOURLY_LIMIT,
  JOIN_CLIENT_HOURLY_LIMIT,
  validateJoinTicketUse,
} from "./joinSecurityCore.ts";

const assert = (condition: unknown, message: string) => {
  if (!condition) throw new Error(message);
};

const request = {
  churchId: "church-1",
  purpose: "joinCommunity" as const,
  uid: "user-1",
  requestId: "123e4567-e89b-12d3-a456-426614174000",
  nowMs: Date.parse("2026-07-15T00:02:00.000Z"),
};

const ticket = {
  churchId: "church-1",
  purpose: "joinCommunity",
  codeHash: "hash-ok",
  expiresAt: "2026-07-15T00:05:00.000Z",
  usedAt: null,
  usedBy: null,
  usedRequestId: null,
};

Deno.test("참여권은 만료·공동체·용도를 모두 검증한다", () => {
  assert(
    validateJoinTicketUse(ticket, request).allowed,
    "valid ticket rejected",
  );
  assert(
    !validateJoinTicketUse({ ...ticket, churchId: "other" }, request).allowed,
    "church mismatch accepted",
  );
  assert(
    !validateJoinTicketUse({ ...ticket, purpose: "memberSignup" }, request)
      .allowed,
    "purpose mismatch accepted",
  );
  assert(
    !validateJoinTicketUse(
      { ...ticket, expiresAt: "2026-07-15T00:01:59.000Z" },
      request,
    ).allowed,
    "expired ticket accepted",
  );
  assert(
    !validateJoinTicketUse(
      { ...ticket, expiresAt: "2026-07-15T00:02:00.000Z" },
      request,
    ).allowed,
    "ticket expiring exactly now accepted",
  );
});

Deno.test("미사용 참여권은 한 번만 소비 대상으로 판정한다", () => {
  const decision = validateJoinTicketUse(ticket, request);
  assert(
    decision.allowed && decision.consume,
    "unused ticket must be consumed",
  );
});

Deno.test("소비된 참여권은 같은 uid와 같은 requestId 재시도만 허용한다", () => {
  const consumed = {
    ...ticket,
    usedAt: "2026-07-15T00:03:00.000Z",
    usedBy: request.uid,
    usedRequestId: request.requestId,
  };
  const retry = validateJoinTicketUse(consumed, request);
  assert(retry.allowed && !retry.consume, "same request retry rejected");
  assert(
    !validateJoinTicketUse(consumed, { ...request, uid: "user-2" }).allowed,
    "different uid accepted",
  );
  assert(
    !validateJoinTicketUse(consumed, {
      ...request,
      requestId: "018f5f3e-94c0-7ad2-a12e-4c9df184ba4f",
    }).allowed,
    "different request accepted",
  );
});

Deno.test("부분 소비 표식이 있는 참여권은 안전하게 거부한다", () => {
  assert(
    !validateJoinTicketUse({ ...ticket, usedBy: request.uid }, request).allowed,
    "partial consumption accepted",
  );
});

Deno.test("세 목적은 같은 clientChurch와 churchGlobal 제한 키를 공유한다", () => {
  const base = {
    hour: "2026-07-15T00:00",
    churchId: "church-1",
    clientId: "ip-hash",
  };
  const scopes = buildJoinRateLimitScopes(base);
  assert(scopes.length === 2, "expected two scopes");
  assert(scopes[0].limit === JOIN_CLIENT_HOURLY_LIMIT, "client limit mismatch");
  assert(scopes[1].limit === JOIN_CHURCH_HOURLY_LIMIT, "church limit mismatch");
  assert(
    scopes.every((scope) => !scope.keyInput.includes("memberSignup")),
    "purpose leaked into key",
  );
});

Deno.test("rate limit은 한도 직전까지만 소비한다", () => {
  assert(
    canConsumeJoinAttempt(0, JOIN_CLIENT_HOURLY_LIMIT),
    "first attempt rejected",
  );
  assert(
    canConsumeJoinAttempt(
      JOIN_CLIENT_HOURLY_LIMIT - 1,
      JOIN_CLIENT_HOURLY_LIMIT,
    ),
    "last allowed attempt rejected",
  );
  assert(
    !canConsumeJoinAttempt(JOIN_CLIENT_HOURLY_LIMIT, JOIN_CLIENT_HOURLY_LIMIT),
    "limit accepted",
  );
  assert(
    !canConsumeJoinAttempt(-1, JOIN_CLIENT_HOURLY_LIMIT),
    "negative count accepted",
  );
  assert(
    !canConsumeJoinAttempt("broken", JOIN_CLIENT_HOURLY_LIMIT),
    "invalid count accepted",
  );
});
