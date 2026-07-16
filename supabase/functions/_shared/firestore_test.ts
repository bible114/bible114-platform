import {
  commitWrites,
  decodeDocumentFields,
  decodeValue,
  documentName,
  encodeDocumentPath,
  encodeFirestoreFields,
  encodeFirestoreValue,
  listCollectionDocuments,
  runCollectionGroupQuery,
  runCollectionQuery,
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
  assertEquals(
    updateWrite("fixture-project", "settings/churchDirectory", {
      churches: [],
    }, {
      updateTime: "2026-07-16T00:00:00.000001Z",
    }),
    {
      update: {
        name: documentName(
          "fixture-project",
          "settings/churchDirectory",
        ),
        fields: { churches: { arrayValue: { values: [] } } },
      },
      currentDocument: { updateTime: "2026-07-16T00:00:00.000001Z" },
    },
  );
});

Deno.test("write resource names keep special-character uids raw", () => {
  // kakao:<id> 같은 uid는 URL에서만 인코딩하고 commit 본문 이름은 원문이어야
  // 트랜잭션 읽기와 같은 문서에 쓴다 (인코딩하면 exists 전제조건이 항상 실패).
  assertEquals(
    encodeDocumentPath("users/kakao:12345"),
    "users/kakao%3A12345",
  );
  assertEquals(
    documentName("fixture-project", "users/kakao:12345"),
    "projects/fixture-project/databases/(default)/documents/users/kakao:12345",
  );
  assertEquals(
    updateWrite("fixture-project", "users/kakao:12345/activityActions/req-1", {
      schemaVersion: 1,
    }, { exists: false }).update,
    {
      name:
        "projects/fixture-project/databases/(default)/documents/users/kakao:12345/activityActions/req-1",
      fields: { schemaVersion: { integerValue: "1" } },
    },
  );
});

Deno.test("commit errors preserve the canonical Firestore status", async () => {
  const fixtureFetch = (async () =>
    Response.json(
      { error: { status: "FAILED_PRECONDITION", message: "not exposed" } },
      { status: 400 },
    )) as typeof fetch;
  try {
    await commitWrites("token", "fixture-project", [], {
      fetcher: fixtureFetch,
    });
    throw new Error("expected commit rejection");
  } catch (error) {
    if (!(error instanceof PlatformError)) throw error;
    assertEquals(error.code, "FIRESTORE_WRITE_FAILED");
    assertEquals(error.details, {
      status: 400,
      canonicalStatus: "FAILED_PRECONDITION",
    });
  }
});

Deno.test("nested update masks preserve Firestore map structure", () => {
  const name = documentName(
    "fixture-project",
    "dailyVideos/2026-07-15",
  );
  assertEquals(
    updateWrite("fixture-project", "dailyVideos/2026-07-15", {
      adult: {
        chapters: [{ label: "기도", sec: 120 }],
      },
      chaptersRefreshedAt: new Date("2026-07-15T00:00:00.000Z"),
    }, {
      exists: true,
      updateMask: ["adult.chapters", "chaptersRefreshedAt"],
    }),
    {
      update: {
        name,
        fields: {
          adult: {
            mapValue: {
              fields: {
                chapters: {
                  arrayValue: {
                    values: [{
                      mapValue: {
                        fields: {
                          label: { stringValue: "기도" },
                          sec: { integerValue: "120" },
                        },
                      },
                    }],
                  },
                },
              },
            },
          },
          chaptersRefreshedAt: {
            timestampValue: "2026-07-15T00:00:00.000Z",
          },
        },
      },
      updateMask: {
        fieldPaths: ["adult.chapters", "chaptersRefreshedAt"],
      },
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

Deno.test("collection listing follows page tokens and decodes every page", async () => {
  const requests: URL[] = [];
  const fixtureFetch = (async (input: string | URL | Request) => {
    const url = new URL(String(input));
    requests.push(url);
    const pageToken = url.searchParams.get("pageToken");
    if (!pageToken) {
      return Response.json({
        documents: [{
          name: "projects/fixture/databases/(default)/documents/churches/a",
          fields: { name: { stringValue: "가 교회" } },
        }],
        nextPageToken: "second/page token",
      });
    }
    return Response.json({
      documents: [{
        name: "projects/fixture/databases/(default)/documents/churches/b",
        fields: {
          name: { stringValue: "나 교회" },
          hiddenFromDirectory: { booleanValue: true },
        },
      }],
    });
  }) as typeof fetch;

  const documents = await listCollectionDocuments<{
    name: string;
    hiddenFromDirectory?: boolean;
  }>("token", "fixture", "churches", {
    pageSize: 1,
    fetcher: fixtureFetch,
  });

  assertEquals(documents.map(({ data }) => data), [
    { name: "가 교회" },
    { name: "나 교회", hiddenFromDirectory: true },
  ]);
  assertEquals(requests.length, 2);
  assertEquals(
    requests[0].pathname,
    "/v1/projects/fixture/databases/(default)/documents/churches",
  );
  assertEquals(requests[0].searchParams.get("pageSize"), "1");
  assertEquals(requests[0].searchParams.get("orderBy"), "__name__");
  assertEquals(requests[1].searchParams.get("pageToken"), "second/page token");
});

Deno.test("collection listing validates collection paths and pagination limits", async () => {
  for (
    const invoke of [
      () => listCollectionDocuments("token", "project", ""),
      () => listCollectionDocuments("token", "project", "churches/id"),
      () =>
        listCollectionDocuments("token", "project", "churches", {
          pageSize: 1001,
        }),
      () =>
        listCollectionDocuments("token", "project", "churches", {
          maxPages: 0,
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

Deno.test("collection query stays under the concrete parent and joins a transaction", async () => {
  let requestUrl = "";
  let requestBody: unknown = null;
  const fixtureFetch =
    (async (input: string | URL | Request, init?: RequestInit) => {
      requestUrl = String(input);
      requestBody = JSON.parse(String(init?.body));
      return new Response(JSON.stringify([{
        document: {
          name:
            "projects/fixture/databases/(default)/documents/users/u1/activityActions/r1",
          fields: {
            action: { stringValue: "submitQuiz" },
            calendarDate: { stringValue: "Tue Jul 14 2026" },
          },
        },
      }]));
    }) as typeof fetch;

  const documents = await runCollectionQuery<{
    action: string;
    calendarDate: string;
  }>(
    "fixture-token",
    "fixture",
    "users/u1",
    "activityActions",
    "calendarDate",
    "Tue Jul 14 2026",
    { limit: 101, transaction: "fixture-transaction", fetcher: fixtureFetch },
  );
  assertEquals(
    requestUrl,
    "https://firestore.googleapis.com/v1/projects/fixture/databases/(default)/documents/users/u1:runQuery",
  );
  assertEquals(requestBody, {
    structuredQuery: {
      from: [{ collectionId: "activityActions" }],
      where: {
        fieldFilter: {
          field: { fieldPath: "calendarDate" },
          op: "EQUAL",
          value: { stringValue: "Tue Jul 14 2026" },
        },
      },
      limit: 101,
    },
    transaction: "fixture-transaction",
  });
  assertEquals(documents[0].data, {
    action: "submitQuiz",
    calendarDate: "Tue Jul 14 2026",
  });
});
