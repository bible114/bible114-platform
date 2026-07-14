import { errorPayload, PlatformError, toPlatformError } from "./errors.ts";

export const ALLOWED_ORIGINS = new Set([
  "https://www.bible114.net",
  "https://bible114.net",
  "http://localhost:5173",
  "http://localhost:5174",
  "http://localhost:5177",
]);

export const isAllowedOrigin = (origin: string | null): origin is string =>
  Boolean(origin && ALLOWED_ORIGINS.has(origin));

export const corsHeaders = (origin: string) => ({
  "Access-Control-Allow-Origin": origin,
  "Access-Control-Allow-Headers": "authorization, content-type, x-request-id",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Max-Age": "86400",
  "Content-Type": "application/json; charset=utf-8",
  "Vary": "Origin",
});

export const jsonResponse = (origin: string, status: number, body: unknown) =>
  new Response(
    status === 204 ? null : JSON.stringify(body),
    { status, headers: corsHeaders(origin) },
  );

/** Returns a response when CORS or method handling is complete, otherwise the approved origin. */
export const handleCors = (request: Request): Response | string => {
  const origin = request.headers.get("origin");
  if (!isAllowedOrigin(origin)) {
    const error = new PlatformError("FORBIDDEN", {
      message: "허용되지 않은 요청 주소입니다.",
    });
    return new Response(JSON.stringify(errorPayload(error)), {
      status: error.status,
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Vary": "Origin",
      },
    });
  }
  if (request.method === "OPTIONS") return jsonResponse(origin, 204, {});
  if (request.method !== "POST") {
    const error = new PlatformError("METHOD_NOT_ALLOWED");
    return jsonResponse(origin, error.status, errorPayload(error));
  }
  return origin;
};

export const platformErrorResponse = (origin: string, error: unknown) => {
  const normalized = toPlatformError(error);
  return jsonResponse(origin, normalized.status, errorPayload(normalized));
};
