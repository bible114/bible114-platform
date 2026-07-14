import { ALLOWED_ORIGINS, handleCors, isAllowedOrigin } from "./cors.ts";

const assert = (condition: unknown, message = "assertion failed") => {
  if (!condition) throw new Error(message);
};

Deno.test("production and supported local origins are allowed", () => {
  for (
    const origin of [
      "https://www.bible114.net",
      "https://bible114.net",
      "http://localhost:5173",
      "http://localhost:5174",
      "http://localhost:5177",
    ]
  ) assert(isAllowedOrigin(origin), `${origin} should be allowed`);
  assert(ALLOWED_ORIGINS.size === 5);
  assert(!isAllowedOrigin("https://evil.example"));
});

Deno.test("OPTIONS receives an empty CORS response and untrusted origins are rejected", async () => {
  const preflight = handleCors(
    new Request("https://edge.example", {
      method: "OPTIONS",
      headers: { Origin: "https://www.bible114.net" },
    }),
  );
  if (!(preflight instanceof Response)) {
    throw new Error("expected preflight response");
  }
  assert(preflight.status === 204);
  assert(
    preflight.headers.get("Access-Control-Allow-Origin") ===
      "https://www.bible114.net",
  );

  const rejected = handleCors(
    new Request("https://edge.example", {
      method: "POST",
      headers: { Origin: "https://evil.example" },
    }),
  );
  if (!(rejected instanceof Response)) {
    throw new Error("expected rejection response");
  }
  assert(rejected.status === 403);
  const payload = await rejected.json();
  assert(payload.error.code === "FORBIDDEN");
});
