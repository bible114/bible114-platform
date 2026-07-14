import { getBearerToken, parseServiceAccount } from "./firebase.ts";
import { PlatformError } from "./errors.ts";

const assert = (condition: unknown, message = "assertion failed") => {
  if (!condition) throw new Error(message);
};

Deno.test("service account parser validates required fields without exposing secrets", () => {
  const parsed = parseServiceAccount(JSON.stringify({
    client_email: "server@example.test",
    private_key: "fixture-key",
    project_id: "fixture-project",
  }));
  assert(parsed.project_id === "fixture-project");
  assert(parsed.token_uri === "https://oauth2.googleapis.com/token");
  try {
    parseServiceAccount('{"client_email":"missing-fields"}');
    throw new Error("expected error");
  } catch (error) {
    assert(
      error instanceof PlatformError &&
        error.code === "SERVICE_ACCOUNT_INVALID",
    );
  }
});

Deno.test("bearer token extraction is strict and case insensitive", () => {
  const request = new Request("https://edge.example", {
    headers: { Authorization: "bearer fixture-token" },
  });
  assert(getBearerToken(request) === "fixture-token");
  try {
    getBearerToken(new Request("https://edge.example"));
    throw new Error("expected error");
  } catch (error) {
    assert(error instanceof PlatformError && error.code === "UNAUTHORIZED");
  }
});
