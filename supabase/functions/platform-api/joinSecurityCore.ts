export type JoinPurpose =
  | "memberSignup"
  | "personalSignup"
  | "joinCommunity";

export const JOIN_CLIENT_HOURLY_LIMIT = 10;
export const JOIN_CHURCH_HOURLY_LIMIT = 200;

export type JoinRateLimitScope = {
  scope: "clientChurch" | "churchGlobal";
  keyInput: string;
  limit: number;
};

export const buildJoinRateLimitScopes = (input: {
  hour: string;
  churchId: string;
  clientId: string;
}): JoinRateLimitScope[] => [{
  scope: "clientChurch",
  keyInput: `${input.hour}:${input.churchId}:client:${input.clientId}`,
  limit: JOIN_CLIENT_HOURLY_LIMIT,
}, {
  scope: "churchGlobal",
  keyInput: `${input.hour}:${input.churchId}:global`,
  limit: JOIN_CHURCH_HOURLY_LIMIT,
}];

export const canConsumeJoinAttempt = (count: unknown, limit: number) => {
  const normalized = Number(count || 0);
  return Number.isFinite(normalized) && normalized >= 0 && normalized < limit;
};

export type JoinTicketRecord = {
  churchId?: unknown;
  purpose?: unknown;
  codeHash?: unknown;
  expiresAt?: unknown;
  usedAt?: unknown;
  usedBy?: unknown;
  usedRequestId?: unknown;
};

export type JoinTicketUseInput = {
  churchId: string;
  purpose: JoinPurpose;
  uid: string;
  requestId: string;
  nowMs: number;
};

export type JoinTicketDecision =
  | { allowed: true; consume: boolean; codeHash: string }
  | { allowed: false; consume: false; reason: string };

export const validateJoinTicketUse = (
  ticket: JoinTicketRecord | null,
  input: JoinTicketUseInput,
): JoinTicketDecision => {
  if (!ticket) return { allowed: false, consume: false, reason: "missing" };
  if (ticket.churchId !== input.churchId) {
    return { allowed: false, consume: false, reason: "church" };
  }
  if (ticket.purpose !== input.purpose) {
    return { allowed: false, consume: false, reason: "purpose" };
  }
  if (typeof ticket.codeHash !== "string" || !ticket.codeHash) {
    return { allowed: false, consume: false, reason: "hash" };
  }
  const expiresAt = typeof ticket.expiresAt === "string"
    ? Date.parse(ticket.expiresAt)
    : NaN;
  if (!Number.isFinite(expiresAt) || expiresAt <= input.nowMs) {
    return { allowed: false, consume: false, reason: "expired" };
  }

  const hasConsumptionMarker = Boolean(
    ticket.usedAt || ticket.usedBy || ticket.usedRequestId,
  );
  if (!hasConsumptionMarker) {
    return { allowed: true, consume: true, codeHash: ticket.codeHash };
  }
  if (
    ticket.usedAt && ticket.usedBy === input.uid &&
    ticket.usedRequestId === input.requestId
  ) {
    return { allowed: true, consume: false, codeHash: ticket.codeHash };
  }
  return { allowed: false, consume: false, reason: "consumed" };
};
