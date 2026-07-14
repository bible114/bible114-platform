import {
  decodeDocumentFields,
  decodeValue,
  documentName,
  encodeDocumentPath,
  encodeFirestoreFields,
  encodeFirestoreValue,
  updateWrite,
} from "./firestore.ts";

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
