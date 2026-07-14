import {
  decodeDocumentFields,
  decodeValue,
  documentName,
  encodeDocumentPath,
  encodeFirestoreFields,
  encodeFirestoreValue,
  runCollectionGroupQuery,
  updateWrite,
} from "./firestore.ts";
import { PlatformError } from "./errors.ts";

const assertEquals = (actual: unknown, expected: unknown) => {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(
      `expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`,
    );
  }
};

Deno.test("Firestore values preserve strings, numbers, booleans, lists and maps", () => {
  const source = {
    title: "성경읽기",
    count: 3,
    ratio: 0.5,
    active: true,
    empty: null,
    items: ["하나", 2],
    nested: { score: 10 },
  };
  const fields = encodeFirestoreFields(source);
  assertEquals(fields.title, { stringValue: "성경읽기" });
  assertEquals(fields.count, { integerValue: "3" });
  assertEquals(decodeDocumentFields(fields), source);
  assertEquals(decodeValue(encodeFirestoreValue(-12)), -12);
});

Deno.test("document paths are encoded by segment and writes use full resource names", () => {
  assertEquals(
    encodeDocumentPath("users/user name/private/auth"),
    "users/user%20name/private/auth",
  );
  const name = documentName("fixture-project", "users/user-1");
  assertEquals(
    name,
    "projects/fixture-project/databases/(default)/documents/users/user-1",
  );
  assertEquals(
    updateWrite("fixture-project", "users/user-1", { score: 1 }, {
      exists: true,
    }),
    {
      update: { name, fields: { score: { integerValue: "1" } } },
      currentDocument: { exists: true },
    },
  );
});

Deno.test("collection group query sends an equality filter and decodes only documents", async () => {
  let requestUrl = "";
  let requestBody: Record<string, unknown> | null = null;
  const fixtureFetch =
    (async (input: string | URL | Request, init?: RequestInit) => {
      requestUrl = String(input);
      requestBody = JSON.parse(String(init?.body)) as Record<string, unknown>;
      return Response.json([
        {
          document: {
            name:
              "projects/fixture/databases/(default)/documents/churches/a/members/u1",
            fields: {
              uid: { stringValue: "user-1" },
              talent: { integerValue: "7" },
            },
          },
        },
        { readTime: "2026-07-14T00:00:00Z" },
      ]);
    }) as typeof fetch;

  const documents = await runCollectionGroupQuery<
    { uid: string; talent: number }
  >(
    "fixture-token",
    "fixture",
    "members",
    "uid",
    "user-1",
    { limit: 3, transaction: "fixture-transaction", fetcher: fixtureFetch },
  );
  assertEquals(
    requestUrl,
    "https://firestore.googleapis.com/v1/projects/fixture/databases/(default)/documents:runQuery",
  );
  assertEquals(requestBody, {
    structuredQuery: {
      from: [{ collectionId: "members", allDescendants: true }],
      where: {
        fieldFilter: {
          field: { fieldPath: "uid" },
          op: "EQUAL",
          value: { stringValue: "user-1" },
        },
      },
      limit: 3,
    },
    transaction: "fixture-transaction",
  });
  assertEquals(documents.length, 1);
  assertEquals(documents[0].data, { uid: "user-1", talent: 7 });
});

Deno.test("collection group query rejects empty identifiers and non-positive limits", async () => {
  for (
    const invoke of [
      () => runCollectionGroupQuery("token", "project", "", "uid", "u1"),
      () => runCollectionGroupQuery("token", "project", "members", "", "u1"),
      () =>
        runCollectionGroupQuery("token", "project", "members", "uid", "u1", {
          limit: 0,
        }),
    ]
  ) {
    try {
      await invoke();
      throw new Error("expected rejection");
    } catch (error) {
      if (!(error instanceof PlatformError) || error.code !== "BAD_REQUEST") {
        throw error;
      }
    }
  }
});
