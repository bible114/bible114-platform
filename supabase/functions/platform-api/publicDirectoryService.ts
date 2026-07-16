import { PlatformError } from "../_shared/errors.ts";
import {
  beginTransaction,
  commitWrites,
  deleteWrite,
  type FirestoreDocument,
  type FirestoreWrite,
  getDocument,
  listCollectionDocuments,
  rollbackTransaction,
  updateWrite,
} from "../_shared/firestore.ts";

type ServiceAccess = { token: string; projectId: string };

type SourceChurchDocument = {
  name?: unknown;
  isDeleted?: unknown;
  hiddenFromDirectory?: unknown;
};

type PublicChurch = {
  id: string;
  name: string;
  hidden?: true;
};

type LegacyDirectoryDocument = {
  churches?: unknown;
};

type PublicDirectoryLockDocument = {
  runId?: unknown;
  ownerToken?: unknown;
  leaseExpiresAt?: unknown;
};

export type PublicDirectorySummary = {
  sourceCount: number;
  expectedCount: number;
  publicCount: number;
  legacyCount: number;
  upsertCount: number;
  deleteCount: number;
  legacyChanged: boolean;
  invalidCount: number;
};

export type RebuildPublicChurchesResult = {
  dryRun: boolean;
  applied: boolean;
  mode: "legacy";
  summary: PublicDirectorySummary;
};

type PublicDirectoryDependencies = {
  beginTransaction: typeof beginTransaction;
  commitWrites: typeof commitWrites;
  deleteWrite: typeof deleteWrite;
  getDocument: typeof getDocument;
  listCollectionDocuments: typeof listCollectionDocuments;
  rollbackTransaction: typeof rollbackTransaction;
  updateWrite: typeof updateWrite;
  createOwnerToken: () => string;
  now: () => Date;
  writeBatchSize: number;
};

const DEFAULT_DEPENDENCIES: PublicDirectoryDependencies = {
  beginTransaction,
  commitWrites,
  deleteWrite,
  getDocument,
  listCollectionDocuments,
  rollbackTransaction,
  updateWrite,
  createOwnerToken: () => crypto.randomUUID(),
  now: () => new Date(),
  // Firestore commit accepts at most 500 writes. Keep headroom for future
  // transforms/preconditions without coupling safety to that hard ceiling.
  writeBatchSize: 450,
};

const UNAFFILIATED_CHURCH_ID = "unaffiliated_v1";
const SOURCE_COLLECTION = "churches";
const PUBLIC_COLLECTION = "publicChurches";
const LEGACY_DIRECTORY_PATH = "settings/churchDirectory";
const PUBLIC_META_PATH = "publicDirectoryMeta/current";
const PUBLIC_LOCK_PATH = "platformInternal/publicDirectoryRebuild";
const PUBLIC_DIRECTORY_LEASE_MS = 10 * 60 * 1_000;
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const hasControlCharacter = (value: string): boolean =>
  /[\u0000-\u001f\u007f]/.test(value);

const resourceDocumentId = (
  documentName: string,
  collectionId: string,
): string | null => {
  const marker = "/documents/";
  const markerIndex = documentName.indexOf(marker);
  if (markerIndex < 0) return null;
  const path = documentName.slice(markerIndex + marker.length);
  const segments = path.split("/");
  if (segments.length !== 2 || segments[0] !== collectionId) return null;
  const id = segments[1];
  return id && id === id.trim() && id.length <= 128 && !id.includes("/") &&
      !hasControlCharacter(id)
    ? id
    : null;
};

const normalizeChurchName = (value: unknown): string | null => {
  if (typeof value !== "string") return null;
  const name = value.trim();
  return name && name.length <= 200 && !hasControlCharacter(name) ? name : null;
};

const compareText = (left: string, right: string): number => {
  const leftPoints = Array.from(left, (character) => character.codePointAt(0)!);
  const rightPoints = Array.from(
    right,
    (character) => character.codePointAt(0)!,
  );
  const length = Math.min(leftPoints.length, rightPoints.length);
  for (let index = 0; index < length; index += 1) {
    if (leftPoints[index] !== rightPoints[index]) {
      return leftPoints[index] - rightPoints[index];
    }
  }
  return leftPoints.length - rightPoints.length;
};

const compareChurches = (left: PublicChurch, right: PublicChurch): number =>
  compareText(left.name, right.name) || compareText(left.id, right.id);

const exactPublicChurchEqual = (
  value: unknown,
  expected: PublicChurch,
): boolean => {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const actual = value as Record<string, unknown>;
  const expectedKeys = expected.hidden === true
    ? ["id", "name", "hidden"]
    : ["id", "name"];
  const actualKeys = Object.keys(actual);
  return actualKeys.length === expectedKeys.length &&
    actualKeys.every((key) => expectedKeys.includes(key)) &&
    actual.id === expected.id && actual.name === expected.name &&
    (expected.hidden === true ? actual.hidden === true : !("hidden" in actual));
};

const exactPublicChurchListEqual = (
  value: unknown,
  expected: PublicChurch[],
): boolean =>
  Array.isArray(value) && value.length === expected.length &&
  value.every((entry, index) => exactPublicChurchEqual(entry, expected[index]));

const createPlan = (
  sourceDocuments: FirestoreDocument<SourceChurchDocument>[],
  publicDocuments: FirestoreDocument<Record<string, unknown>>[],
  legacyDocument: FirestoreDocument<LegacyDirectoryDocument> | null,
) => {
  const expectedById = new Map<string, PublicChurch>();
  let invalidCount = 0;
  for (const source of sourceDocuments) {
    const id = resourceDocumentId(source.name, SOURCE_COLLECTION);
    if (!id) {
      invalidCount += 1;
      continue;
    }
    if (id === UNAFFILIATED_CHURCH_ID || source.data.isDeleted === true) {
      continue;
    }
    if (
      (source.data.isDeleted !== undefined &&
        typeof source.data.isDeleted !== "boolean") ||
      (source.data.hiddenFromDirectory !== undefined &&
        typeof source.data.hiddenFromDirectory !== "boolean")
    ) {
      invalidCount += 1;
      continue;
    }
    const name = normalizeChurchName(source.data.name);
    if (!name || expectedById.has(id)) {
      invalidCount += 1;
      continue;
    }
    expectedById.set(id, {
      id,
      name,
      ...(source.data.hiddenFromDirectory === true ? { hidden: true } : {}),
    });
  }

  const expected = Array.from(expectedById.values()).sort(compareChurches);
  const expectedIds = new Set(expectedById.keys());
  const existingById = new Map<
    string,
    FirestoreDocument<Record<string, unknown>>
  >();
  const stalePaths: string[] = [];
  for (const document of publicDocuments) {
    const id = resourceDocumentId(document.name, PUBLIC_COLLECTION);
    if (!id || existingById.has(id)) {
      throw new PlatformError("CONFLICT", {
        message: "공개 디렉터리 문서 경로를 확인해 주세요.",
      });
    }
    existingById.set(id, document);
    if (!expectedIds.has(id)) stalePaths.push(`${PUBLIC_COLLECTION}/${id}`);
  }

  const upserts = expected.filter((church) => {
    const existing = existingById.get(church.id);
    return !existing || !exactPublicChurchEqual(existing.data, church);
  });
  const legacyChurches = Array.isArray(legacyDocument?.data.churches)
    ? legacyDocument.data.churches
    : [];

  return {
    expected,
    upserts,
    stalePaths,
    summary: {
      sourceCount: sourceDocuments.length,
      expectedCount: expected.length,
      publicCount: publicDocuments.length,
      legacyCount: legacyChurches.length,
      upsertCount: upserts.length,
      deleteCount: stalePaths.length,
      legacyChanged: !exactPublicChurchListEqual(legacyChurches, expected),
      invalidCount,
    } satisfies PublicDirectorySummary,
  };
};

const timestampMs = (value: unknown): number => {
  if (value instanceof Date) {
    const parsed = value.getTime();
    return Number.isFinite(parsed) ? parsed : 0;
  }
  if (typeof value !== "string") return 0;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const getNow = (dependencies: PublicDirectoryDependencies): Date => {
  const now = dependencies.now();
  if (!Number.isFinite(now.getTime())) throw new PlatformError("INTERNAL");
  return now;
};

const retryableConflict = (message: string, cause?: unknown) =>
  new PlatformError("CONFLICT", {
    message,
    retryable: true,
    ...(cause === undefined ? {} : { cause }),
  });

const mapFirestoreContention = (error: unknown): unknown =>
  error instanceof PlatformError &&
    (error.code === "FIRESTORE_WRITE_FAILED" ||
      error.code === "FIRESTORE_READ_FAILED") &&
    (error.details?.status === 409 || error.details?.status === 412 ||
      error.details?.canonicalStatus === "ABORTED" ||
      error.details?.canonicalStatus === "FAILED_PRECONDITION")
    ? retryableConflict("디렉터리가 변경되었습니다. 다시 시도해 주세요.", error)
    : error;

const rollbackQuietly = async (
  service: ServiceAccess,
  transaction: string,
  dependencies: PublicDirectoryDependencies,
): Promise<void> => {
  await dependencies.rollbackTransaction(
    service.token,
    service.projectId,
    transaction,
  ).catch(() => {});
};

const lockData = (
  requestId: string,
  ownerToken: string,
  now: Date,
) => ({
  runId: requestId,
  ownerToken,
  leaseExpiresAt: new Date(now.getTime() + PUBLIC_DIRECTORY_LEASE_MS),
  updatedAt: now,
});

const acquireRebuildLock = async (
  service: ServiceAccess,
  requestId: string,
  ownerToken: string,
  dependencies: PublicDirectoryDependencies,
): Promise<void> => {
  const transaction = await dependencies.beginTransaction(
    service.token,
    service.projectId,
  );
  try {
    const existing = await dependencies.getDocument<
      PublicDirectoryLockDocument
    >(
      service.token,
      service.projectId,
      PUBLIC_LOCK_PATH,
      { transaction },
    );
    const now = getNow(dependencies);
    if (existing && existing.data.runId !== requestId) {
      const expiresAt = timestampMs(existing.data.leaseExpiresAt);
      if (!expiresAt || expiresAt > now.getTime()) {
        throw retryableConflict("다른 디렉터리 재생성 작업이 진행 중입니다.");
      }
    }
    // A repeated call with the same requestId deliberately receives a fresh
    // server-only owner token. It can resume immediately while every older
    // invocation becomes stale before its next guarded transaction.
    await dependencies.commitWrites(
      service.token,
      service.projectId,
      [
        dependencies.updateWrite(
          service.projectId,
          PUBLIC_LOCK_PATH,
          lockData(requestId, ownerToken, now),
        ),
        dependencies.updateWrite(service.projectId, PUBLIC_META_PATH, {
          ready: false,
          mode: "legacy",
          schemaVersion: 1,
          updatedAt: now,
        }),
      ],
      { transaction },
    );
  } catch (error) {
    await rollbackQuietly(service, transaction, dependencies);
    throw mapFirestoreContention(error);
  }
};

const commitOwnedWrites = async (
  service: ServiceAccess,
  requestId: string,
  ownerToken: string,
  writes: FirestoreWrite[],
  dependencies: PublicDirectoryDependencies,
  { finish = false }: { finish?: boolean } = {},
): Promise<void> => {
  const transaction = await dependencies.beginTransaction(
    service.token,
    service.projectId,
  );
  try {
    const lock = await dependencies.getDocument<PublicDirectoryLockDocument>(
      service.token,
      service.projectId,
      PUBLIC_LOCK_PATH,
      { transaction },
    );
    if (
      !lock || lock.data.runId !== requestId ||
      lock.data.ownerToken !== ownerToken
    ) {
      throw retryableConflict("디렉터리 재생성 소유권이 변경되었습니다.");
    }
    const guardedWrites = finish
      ? [
        ...writes,
        dependencies.deleteWrite(service.projectId, PUBLIC_LOCK_PATH),
      ]
      : [
        dependencies.updateWrite(
          service.projectId,
          PUBLIC_LOCK_PATH,
          lockData(requestId, ownerToken, getNow(dependencies)),
        ),
        ...writes,
      ];
    await dependencies.commitWrites(
      service.token,
      service.projectId,
      guardedWrites,
      { transaction },
    );
  } catch (error) {
    await rollbackQuietly(service, transaction, dependencies);
    throw mapFirestoreContention(error);
  }
};

const commitInBatches = async (
  service: ServiceAccess,
  requestId: string,
  ownerToken: string,
  writes: FirestoreWrite[],
  dependencies: PublicDirectoryDependencies,
): Promise<void> => {
  for (
    let offset = 0;
    offset < writes.length;
    offset += dependencies.writeBatchSize
  ) {
    await commitOwnedWrites(
      service,
      requestId,
      ownerToken,
      writes.slice(offset, offset + dependencies.writeBatchSize),
      dependencies,
    );
  }
};

const releaseRebuildLock = async (
  service: ServiceAccess,
  requestId: string,
  ownerToken: string,
  dependencies: PublicDirectoryDependencies,
): Promise<void> => {
  const transaction = await dependencies.beginTransaction(
    service.token,
    service.projectId,
  );
  try {
    const lock = await dependencies.getDocument<PublicDirectoryLockDocument>(
      service.token,
      service.projectId,
      PUBLIC_LOCK_PATH,
      { transaction },
    );
    if (
      !lock || lock.data.runId !== requestId ||
      lock.data.ownerToken !== ownerToken
    ) {
      await rollbackQuietly(service, transaction, dependencies);
      return;
    }
    await dependencies.commitWrites(
      service.token,
      service.projectId,
      [dependencies.deleteWrite(service.projectId, PUBLIC_LOCK_PATH)],
      { transaction },
    );
  } catch {
    await rollbackQuietly(service, transaction, dependencies);
  }
};

export const rebuildPublicChurches = async (
  service: ServiceAccess,
  input: { requestId: string; dryRun: boolean },
  dependencyOverrides: Partial<PublicDirectoryDependencies> = {},
): Promise<RebuildPublicChurchesResult> => {
  const dependencies = { ...DEFAULT_DEPENDENCIES, ...dependencyOverrides };
  if (
    !UUID_PATTERN.test(input.requestId) ||
    !Number.isInteger(dependencies.writeBatchSize) ||
    dependencies.writeBatchSize <= 0 || dependencies.writeBatchSize > 499
  ) {
    throw new PlatformError("INTERNAL");
  }

  // Capture the compatibility document's updateTime before either collection
  // scan. A direct writer that commits after this point must invalidate the
  // final legacy precondition instead of letting an older source snapshot
  // overwrite its newer directory.
  const legacyDocument = await dependencies.getDocument<
    LegacyDirectoryDocument
  >(
    service.token,
    service.projectId,
    LEGACY_DIRECTORY_PATH,
  );
  const [sourceDocuments, publicDocuments] = await Promise.all([
    dependencies.listCollectionDocuments<SourceChurchDocument>(
      service.token,
      service.projectId,
      SOURCE_COLLECTION,
    ),
    dependencies.listCollectionDocuments<Record<string, unknown>>(
      service.token,
      service.projectId,
      PUBLIC_COLLECTION,
    ),
  ]);
  const plan = createPlan(sourceDocuments, publicDocuments, legacyDocument);

  if (input.dryRun) {
    return {
      dryRun: true,
      applied: false,
      mode: "legacy",
      summary: plan.summary,
    };
  }
  // Never publish a partial projection when an eligible source row cannot be
  // represented by the minimal public schema.
  if (plan.summary.invalidCount > 0) {
    throw new PlatformError("CONFLICT", {
      message: "공개 디렉터리 원본을 먼저 정리해 주세요.",
    });
  }

  const legacyPrecondition = legacyDocument
    ? (typeof legacyDocument.updateTime === "string" &&
        legacyDocument.updateTime.length > 0 &&
        !hasControlCharacter(legacyDocument.updateTime)
      ? { updateTime: legacyDocument.updateTime }
      : null)
    : { exists: false };
  if (!legacyPrecondition) {
    throw new PlatformError("CONFLICT", {
      message: "기존 공개 디렉터리 버전을 확인할 수 없습니다.",
    });
  }

  const ownerToken = dependencies.createOwnerToken();
  if (
    typeof ownerToken !== "string" || !ownerToken || ownerToken.length > 128 ||
    hasControlCharacter(ownerToken)
  ) {
    throw new PlatformError("INTERNAL");
  }
  try {
    // Acquisition is inside the cleanup scope because a successful Firestore
    // commit can still lose its HTTP response. In that ambiguous case the
    // owner-only release removes our lease without touching a newer owner.
    await acquireRebuildLock(
      service,
      input.requestId,
      ownerToken,
      dependencies,
    );

    const projectionUpdatedAt = getNow(dependencies);
    const publicWrites = [
      ...plan.upserts.map((church) =>
        dependencies.updateWrite(
          service.projectId,
          `${PUBLIC_COLLECTION}/${church.id}`,
          church,
        )
      ),
      ...plan.stalePaths.map((path) =>
        dependencies.deleteWrite(service.projectId, path)
      ),
    ];
    await commitInBatches(
      service,
      input.requestId,
      ownerToken,
      publicWrites,
      dependencies,
    );

    // Replace the legacy document rather than merging it so no stale public
    // fields survive alongside the exact compatibility mirror. The scan's
    // updateTime precondition also fences every remaining direct browser
    // writer while the service lock serializes rebuild workers.
    await commitOwnedWrites(
      service,
      input.requestId,
      ownerToken,
      [
        dependencies.updateWrite(
          service.projectId,
          LEGACY_DIRECTORY_PATH,
          {
            churches: plan.expected,
            updatedAt: projectionUpdatedAt,
          },
          legacyPrecondition,
        ),
      ],
      dependencies,
    );

    // `mode: legacy` is deliberate until every remaining direct browser
    // writer is removed and the later rules rollout has completed its
    // observation gate. Publishing ready and deleting this run's lock are one
    // transaction, so a stale worker cannot reopen readiness afterward.
    await commitOwnedWrites(
      service,
      input.requestId,
      ownerToken,
      [
        dependencies.updateWrite(service.projectId, PUBLIC_META_PATH, {
          ready: true,
          mode: "legacy",
          schemaVersion: 1,
          count: plan.expected.length,
          updatedAt: projectionUpdatedAt,
        }),
      ],
      dependencies,
      { finish: true },
    );
  } catch (error) {
    // Keep meta.ready=false, but do not make an ordinary retry wait for the
    // full lease. A changed owner can never be deleted by this cleanup.
    await releaseRebuildLock(
      service,
      input.requestId,
      ownerToken,
      dependencies,
    );
    throw error;
  }

  return {
    dryRun: false,
    applied: true,
    mode: "legacy",
    summary: plan.summary,
  };
};
