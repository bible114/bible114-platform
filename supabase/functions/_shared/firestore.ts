import { PlatformError } from "./errors.ts";

export type FirestoreValue =
  | { nullValue: null }
  | { booleanValue: boolean }
  | { integerValue: string }
  | { doubleValue: number }
  | { timestampValue: string }
  | { stringValue: string }
  | { bytesValue: string }
  | { referenceValue: string }
  | { geoPointValue: { latitude: number; longitude: number } }
  | { arrayValue: { values?: FirestoreValue[] } }
  | { mapValue: { fields?: Record<string, FirestoreValue> } };

export type FirestoreDocument<T = Record<string, unknown>> = {
  name: string;
  fields: Record<string, FirestoreValue>;
  createTime?: string;
  updateTime?: string;
  data: T;
};

export type FirestoreWrite = Record<string, unknown>;

const databaseRoot = (projectId: string) =>
  `projects/${projectId}/databases/(default)`;
const firestoreBaseUrl = (projectId: string) =>
  `https://firestore.googleapis.com/v1/${databaseRoot(projectId)}`;

const validateDocumentPath = (path: string): string[] => {
  const segments = path.split("/");
  if (
    !path ||
    segments.some((segment) => !segment || segment === "." || segment === "..")
  ) {
    throw new PlatformError("BAD_REQUEST", {
      message: "문서 경로가 올바르지 않습니다.",
    });
  }
  return segments;
};

// URL 경로 전용 인코딩. 서버가 URL 디코딩을 거치므로 특수문자 uid도 원문으로 도달한다.
export const encodeDocumentPath = (path: string): string =>
  validateDocumentPath(path).map(encodeURIComponent).join("/");

// commit 본문(update.name 등)의 리소스 이름은 URL 디코딩 없이 문자 그대로 비교된다.
// 여기서 percent 인코딩하면 `kakao:123` 같은 uid가 별개 문서(`kakao%3A123`)를
// 가리켜 exists 전제조건이 항상 실패한다 — 절대 인코딩하지 말 것.
export const rawDocumentPath = (path: string): string =>
  validateDocumentPath(path).join("/");

export const encodeFirestoreValue = (value: unknown): FirestoreValue => {
  if (value === null || value === undefined) return { nullValue: null };
  if (typeof value === "boolean") return { booleanValue: value };
  if (typeof value === "string") return { stringValue: value };
  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      throw new PlatformError("BAD_REQUEST", {
        message: "유한한 숫자만 저장할 수 있습니다.",
      });
    }
    return Number.isInteger(value)
      ? { integerValue: String(value) }
      : { doubleValue: value };
  }
  if (value instanceof Date) {
    if (!Number.isFinite(value.getTime())) {
      throw new PlatformError("BAD_REQUEST", {
        message: "날짜가 올바르지 않습니다.",
      });
    }
    return { timestampValue: value.toISOString() };
  }
  if (Array.isArray(value)) {
    return { arrayValue: { values: value.map(encodeFirestoreValue) } };
  }
  if (typeof value === "object") {
    return {
      mapValue: {
        fields: encodeFirestoreFields(value as Record<string, unknown>),
      },
    };
  }
  throw new PlatformError("BAD_REQUEST", {
    message: "지원하지 않는 데이터 형식입니다.",
  });
};

export const encodeFirestoreFields = (
  data: Record<string, unknown>,
): Record<string, FirestoreValue> =>
  Object.fromEntries(
    Object.entries(data).map((
      [key, value],
    ) => [key, encodeFirestoreValue(value)]),
  );

export const decodeFirestoreValue = (
  value: FirestoreValue | undefined,
): unknown => {
  if (!value || "nullValue" in value) return null;
  if ("booleanValue" in value) return value.booleanValue;
  if ("integerValue" in value) return Number(value.integerValue);
  if ("doubleValue" in value) return value.doubleValue;
  if ("timestampValue" in value) return value.timestampValue;
  if ("stringValue" in value) return value.stringValue;
  if ("bytesValue" in value) return value.bytesValue;
  if ("referenceValue" in value) return value.referenceValue;
  if ("geoPointValue" in value) return value.geoPointValue;
  if ("arrayValue" in value) {
    return (value.arrayValue.values ?? []).map(decodeFirestoreValue);
  }
  if ("mapValue" in value) {
    return decodeFirestoreFields(value.mapValue.fields ?? {});
  }
  return null;
};

export const decodeFirestoreFields = (
  fields: Record<string, FirestoreValue> = {},
): Record<string, unknown> =>
  Object.fromEntries(
    Object.entries(fields).map((
      [key, value],
    ) => [key, decodeFirestoreValue(value)]),
  );

// Short aliases used by action handlers and contract tests.
export const decodeValue = decodeFirestoreValue;
export const decodeDocumentFields = decodeFirestoreFields;

const authenticatedFetch = async (
  url: string,
  token: string,
  init: RequestInit = {},
  fetcher: typeof fetch = fetch,
) =>
  fetcher(url, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...init.headers,
    },
  });

export const getDocument = async <T = Record<string, unknown>>(
  token: string,
  projectId: string,
  path: string,
  options: { transaction?: string; fetcher?: typeof fetch } = {},
): Promise<FirestoreDocument<T> | null> => {
  const url = new URL(
    `${firestoreBaseUrl(projectId)}/documents/${encodeDocumentPath(path)}`,
  );
  if (options.transaction) {
    url.searchParams.set("transaction", options.transaction);
  }
  const response = await authenticatedFetch(
    url.toString(),
    token,
    {},
    options.fetcher,
  );
  if (response.status === 404) return null;
  if (!response.ok) {
    throw new PlatformError("FIRESTORE_READ_FAILED", {
      details: { status: response.status, path },
    });
  }
  const payload = await response.json() as Omit<FirestoreDocument<T>, "data">;
  return {
    ...payload,
    fields: payload.fields ?? {},
    data: decodeFirestoreFields(payload.fields ?? {}) as T,
  };
};

/**
 * Reads a bounded set of known document paths in one Firestore request.
 * Firestore may return results out of order and emits missing documents as
 * separate rows, so callers must identify found documents by their names.
 */
export const batchGetDocuments = async <T = Record<string, unknown>>(
  token: string,
  projectId: string,
  paths: string[],
  options: {
    fieldPaths?: string[];
    transaction?: string;
    fetcher?: typeof fetch;
  } = {},
): Promise<FirestoreDocument<T>[]> => {
  if (
    !Array.isArray(paths) || paths.length === 0 || paths.length > 100
  ) {
    throw new PlatformError("BAD_REQUEST", {
      message: "일괄 조회 문서는 1~100개여야 합니다.",
    });
  }
  const normalizedPaths = paths.map(rawDocumentPath);
  if (new Set(normalizedPaths).size !== normalizedPaths.length) {
    throw new PlatformError("BAD_REQUEST", {
      message: "일괄 조회 문서 경로가 중복되었습니다.",
    });
  }
  const fieldPaths = options.fieldPaths ?? [];
  if (
    !Array.isArray(fieldPaths) ||
    fieldPaths.some((fieldPath) =>
      typeof fieldPath !== "string" || !fieldPath.trim()
    ) ||
    new Set(fieldPaths).size !== fieldPaths.length
  ) {
    throw new PlatformError("BAD_REQUEST", {
      message: "일괄 조회 필드가 올바르지 않습니다.",
    });
  }
  const response = await authenticatedFetch(
    `${firestoreBaseUrl(projectId)}/documents:batchGet`,
    token,
    {
      method: "POST",
      body: JSON.stringify({
        documents: normalizedPaths.map((path) =>
          `${databaseRoot(projectId)}/documents/${path}`
        ),
        ...(fieldPaths.length > 0 ? { mask: { fieldPaths } } : {}),
        ...(options.transaction ? { transaction: options.transaction } : {}),
      }),
    },
    options.fetcher,
  );
  if (!response.ok) {
    throw new PlatformError("FIRESTORE_READ_FAILED", {
      details: { status: response.status, documentCount: paths.length },
    });
  }
  const payload = await response.json() as unknown;
  if (!Array.isArray(payload)) {
    throw new PlatformError("FIRESTORE_READ_FAILED", {
      message: "Firestore 일괄 조회 응답이 올바르지 않습니다.",
      details: { documentCount: paths.length },
    });
  }
  return payload.flatMap((row) => {
    if (!row || typeof row !== "object" || Array.isArray(row)) return [];
    const found = (row as {
      found?: Omit<FirestoreDocument<T>, "data">;
    }).found;
    if (!found || typeof found.name !== "string") return [];
    const fields = found.fields ?? {};
    return [{
      ...found,
      fields,
      data: decodeFirestoreFields(fields) as T,
    }];
  });
};

/**
 * Lists every document directly under one collection, following Firestore REST
 * page tokens until the collection is exhausted. The collection path must end
 * at a collection (for example `churches` or `churches/{id}/roster`).
 */
export const listCollectionDocuments = async <
  T = Record<string, unknown>,
>(
  token: string,
  projectId: string,
  collectionPath: string,
  options: {
    pageSize?: number;
    maxPages?: number;
    fetcher?: typeof fetch;
  } = {},
): Promise<FirestoreDocument<T>[]> => {
  const segments = collectionPath.split("/");
  if (
    !collectionPath || segments.length % 2 !== 1 ||
    segments.some((segment) => !segment || segment === "." || segment === "..")
  ) {
    throw new PlatformError("BAD_REQUEST", {
      message: "컬렉션 경로가 올바르지 않습니다.",
    });
  }
  const pageSize = options.pageSize ?? 300;
  const maxPages = options.maxPages ?? 10_000;
  if (
    !Number.isInteger(pageSize) || pageSize <= 0 || pageSize > 1_000 ||
    !Number.isInteger(maxPages) || maxPages <= 0
  ) {
    throw new PlatformError("BAD_REQUEST", {
      message: "페이지 설정이 올바르지 않습니다.",
    });
  }

  const documents: FirestoreDocument<T>[] = [];
  const seenPageTokens = new Set<string>();
  let pageToken = "";
  for (let page = 0; page < maxPages; page += 1) {
    const url = new URL(
      `${firestoreBaseUrl(projectId)}/documents/${
        encodeDocumentPath(collectionPath)
      }`,
    );
    url.searchParams.set("pageSize", String(pageSize));
    url.searchParams.set("orderBy", "__name__");
    if (pageToken) url.searchParams.set("pageToken", pageToken);
    const response = await authenticatedFetch(
      url.toString(),
      token,
      {},
      options.fetcher,
    );
    if (!response.ok) {
      throw new PlatformError("FIRESTORE_READ_FAILED", {
        details: { status: response.status, collectionPath },
      });
    }
    const payload = await response.json() as {
      documents?: Array<Omit<FirestoreDocument<T>, "data">>;
      nextPageToken?: string;
    };
    for (const document of payload.documents ?? []) {
      const fields = document.fields ?? {};
      documents.push({
        ...document,
        fields,
        data: decodeFirestoreFields(fields) as T,
      });
    }
    const nextPageToken = typeof payload.nextPageToken === "string"
      ? payload.nextPageToken
      : "";
    if (!nextPageToken) return documents;
    if (seenPageTokens.has(nextPageToken)) {
      throw new PlatformError("FIRESTORE_READ_FAILED", {
        message: "Firestore 페이지 토큰이 반복되었습니다.",
        details: { collectionPath },
      });
    }
    seenPageTokens.add(nextPageToken);
    pageToken = nextPageToken;
  }
  throw new PlatformError("FIRESTORE_READ_FAILED", {
    message: "Firestore 컬렉션 페이지 한도를 초과했습니다.",
    details: { collectionPath },
  });
};

export const runCollectionGroupQuery = async <T = Record<string, unknown>>(
  token: string,
  projectId: string,
  collectionId: string,
  field: string,
  value: unknown,
  options: { limit?: number; transaction?: string; fetcher?: typeof fetch } =
    {},
): Promise<FirestoreDocument<T>[]> => {
  if (!collectionId.trim() || !field.trim()) {
    throw new PlatformError("BAD_REQUEST", {
      message: "컬렉션과 검색 필드가 필요합니다.",
    });
  }
  const limit = options.limit ?? 100;
  if (!Number.isInteger(limit) || limit <= 0) {
    throw new PlatformError("BAD_REQUEST", {
      message: "검색 개수는 양의 정수여야 합니다.",
    });
  }
  const response = await authenticatedFetch(
    `${firestoreBaseUrl(projectId)}/documents:runQuery`,
    token,
    {
      method: "POST",
      body: JSON.stringify({
        structuredQuery: {
          from: [{ collectionId, allDescendants: true }],
          where: {
            fieldFilter: {
              field: { fieldPath: field },
              op: "EQUAL",
              value: encodeFirestoreValue(value),
            },
          },
          limit,
        },
        ...(options.transaction ? { transaction: options.transaction } : {}),
      }),
    },
    options.fetcher,
  );
  if (!response.ok) {
    throw new PlatformError("FIRESTORE_READ_FAILED", {
      details: { status: response.status, collectionId, field },
    });
  }
  const payload = await response.json() as Array<{
    document?: Omit<FirestoreDocument<T>, "data">;
  }>;
  return payload.flatMap(({ document }) => {
    if (!document) return [];
    const fields = document.fields ?? {};
    return [{
      ...document,
      fields,
      data: decodeFirestoreFields(fields) as T,
    }];
  });
};

/**
 * Runs an equality query against one concrete subcollection. Unlike
 * runCollectionGroupQuery, the parent path keeps the query scoped to a single
 * owner (for example users/{uid}/activityActions).
 */
export const runCollectionQuery = async <T = Record<string, unknown>>(
  token: string,
  projectId: string,
  parentPath: string,
  collectionId: string,
  field: string,
  value: unknown,
  options: { limit?: number; transaction?: string; fetcher?: typeof fetch } =
    {},
): Promise<FirestoreDocument<T>[]> => {
  if (!parentPath.trim() || !collectionId.trim() || !field.trim()) {
    throw new PlatformError("BAD_REQUEST", {
      message: "부모 경로와 컬렉션, 검색 필드가 필요합니다.",
    });
  }
  const limit = options.limit ?? 100;
  if (!Number.isInteger(limit) || limit <= 0) {
    throw new PlatformError("BAD_REQUEST", {
      message: "검색 개수는 양의 정수여야 합니다.",
    });
  }
  const response = await authenticatedFetch(
    `${firestoreBaseUrl(projectId)}/documents/${
      encodeDocumentPath(parentPath)
    }:runQuery`,
    token,
    {
      method: "POST",
      body: JSON.stringify({
        structuredQuery: {
          from: [{ collectionId }],
          where: {
            fieldFilter: {
              field: { fieldPath: field },
              op: "EQUAL",
              value: encodeFirestoreValue(value),
            },
          },
          limit,
        },
        ...(options.transaction ? { transaction: options.transaction } : {}),
      }),
    },
    options.fetcher,
  );
  if (!response.ok) {
    throw new PlatformError("FIRESTORE_READ_FAILED", {
      details: {
        status: response.status,
        parentPath,
        collectionId,
        field,
      },
    });
  }
  const payload = await response.json() as Array<{
    document?: Omit<FirestoreDocument<T>, "data">;
  }>;
  return payload.flatMap(({ document }) => {
    if (!document) return [];
    const fields = document.fields ?? {};
    return [{
      ...document,
      fields,
      data: decodeFirestoreFields(fields) as T,
    }];
  });
};

/**
 * Runs an equality query against a root collection. This is intentionally
 * separate from collection-group queries so a nested collection with the same
 * ID can never be pulled into an operational projection.
 */
export const runRootCollectionQuery = async <T = Record<string, unknown>>(
  token: string,
  projectId: string,
  collectionId: string,
  field: string,
  value: unknown,
  options: { limit?: number; transaction?: string; fetcher?: typeof fetch } =
    {},
): Promise<FirestoreDocument<T>[]> => {
  if (!collectionId.trim() || !field.trim()) {
    throw new PlatformError("BAD_REQUEST", {
      message: "컬렉션과 검색 필드가 필요합니다.",
    });
  }
  const limit = options.limit ?? 1_000;
  if (!Number.isInteger(limit) || limit <= 0 || limit > 10_000) {
    throw new PlatformError("BAD_REQUEST", {
      message: "검색 개수는 1~10000 사이여야 합니다.",
    });
  }
  const response = await authenticatedFetch(
    `${firestoreBaseUrl(projectId)}/documents:runQuery`,
    token,
    {
      method: "POST",
      body: JSON.stringify({
        structuredQuery: {
          from: [{ collectionId }],
          where: {
            fieldFilter: {
              field: { fieldPath: field },
              op: "EQUAL",
              value: encodeFirestoreValue(value),
            },
          },
          limit,
        },
        ...(options.transaction ? { transaction: options.transaction } : {}),
      }),
    },
    options.fetcher,
  );
  if (!response.ok) {
    throw new PlatformError("FIRESTORE_READ_FAILED", {
      details: { status: response.status, collectionId, field },
    });
  }
  const payload = await response.json() as Array<{
    document?: Omit<FirestoreDocument<T>, "data">;
  }>;
  return payload.flatMap(({ document }) => {
    if (!document) return [];
    const fields = document.fields ?? {};
    return [{
      ...document,
      fields,
      data: decodeFirestoreFields(fields) as T,
    }];
  });
};

export const beginTransaction = async (
  token: string,
  projectId: string,
  options: { readOnly?: boolean; fetcher?: typeof fetch } = {},
): Promise<string> => {
  const response = await authenticatedFetch(
    `${firestoreBaseUrl(projectId)}/documents:beginTransaction`,
    token,
    {
      method: "POST",
      body: JSON.stringify(
        options.readOnly
          ? { options: { readOnly: {} } }
          : { options: { readWrite: {} } },
      ),
    },
    options.fetcher,
  );
  const payload = await response.json() as { transaction?: string };
  if (!response.ok || !payload.transaction) {
    throw new PlatformError("FIRESTORE_READ_FAILED", {
      details: { status: response.status },
    });
  }
  return payload.transaction;
};

/** Atomic commit. Pass a transaction returned by beginTransaction for read-then-write validation. */
export const commitWrites = async (
  token: string,
  projectId: string,
  writes: FirestoreWrite[],
  options: { transaction?: string; fetcher?: typeof fetch } = {},
) => {
  const response = await authenticatedFetch(
    `${firestoreBaseUrl(projectId)}/documents:commit`,
    token,
    {
      method: "POST",
      body: JSON.stringify({
        writes,
        ...(options.transaction ? { transaction: options.transaction } : {}),
      }),
    },
    options.fetcher,
  );
  const payload = await response.json() as {
    error?: { status?: unknown };
  };
  if (!response.ok) {
    const canonicalStatus = typeof payload.error?.status === "string"
      ? payload.error.status
      : undefined;
    throw new PlatformError("FIRESTORE_WRITE_FAILED", {
      details: {
        status: response.status,
        ...(canonicalStatus ? { canonicalStatus } : {}),
      },
    });
  }
  return payload;
};

export const commitTransaction = commitWrites;

export const rollbackTransaction = async (
  token: string,
  projectId: string,
  transaction: string,
  fetcher: typeof fetch = fetch,
): Promise<void> => {
  const response = await authenticatedFetch(
    `${firestoreBaseUrl(projectId)}/documents:rollback`,
    token,
    { method: "POST", body: JSON.stringify({ transaction }) },
    fetcher,
  );
  if (!response.ok) {
    throw new PlatformError("FIRESTORE_WRITE_FAILED", {
      details: { status: response.status },
    });
  }
};

export const documentName = (projectId: string, path: string): string =>
  `${databaseRoot(projectId)}/documents/${rawDocumentPath(path)}`;

export const updateWrite = (
  projectId: string,
  path: string,
  data: Record<string, unknown>,
  options: {
    updateMask?: string[];
    exists?: boolean;
    updateTime?: string;
  } = {},
): FirestoreWrite => ({
  update: {
    name: documentName(projectId, path),
    fields: encodeFirestoreFields(data),
  },
  ...(options.updateMask
    ? { updateMask: { fieldPaths: options.updateMask } }
    : {}),
  ...(options.updateTime
    ? { currentDocument: { updateTime: options.updateTime } }
    : options.exists === undefined
    ? {}
    : { currentDocument: { exists: options.exists } }),
});

export const deleteWrite = (
  projectId: string,
  path: string,
  exists?: boolean,
): FirestoreWrite => ({
  delete: documentName(projectId, path),
  ...(exists === undefined ? {} : { currentDocument: { exists } }),
});
