import { PlatformError } from "../_shared/errors.ts";
import {
  batchGetDocuments,
  commitWrites,
  type FirestoreDocument,
  getDocument,
  listCollectionDocuments,
  runRootCollectionQuery,
  updateWrite,
} from "../_shared/firestore.ts";
import {
  calendarDatesForYear,
  COMMUNITY_PROGRESS_SCHEMA_VERSION,
  COMMUNITY_PROGRESS_SHARD_COUNT,
  type CommunityProgressMember,
  communityProgressShard,
  legacyDateToIso,
  mergeCommunityProgressMembers,
  projectCommunityProgressMember,
  projectRosterCommunityProgressMember,
  splitCommunityProgressMembers,
} from "./communityProgressCore.ts";

type ServiceAccess = { token: string; projectId: string };
type UnknownRecord = Record<string, unknown>;
type CommunityProgressSourceDependencies = {
  loadPrimaryDocuments: (
    service: ServiceAccess,
    orgId: string,
  ) => Promise<FirestoreDocument<UnknownRecord>[]>;
  loadRosterDocuments: (
    service: ServiceAccess,
    orgId: string,
  ) => Promise<FirestoreDocument<UnknownRecord>[]>;
  loadUserProfiles: (
    service: ServiceAccess,
    paths: string[],
  ) => Promise<FirestoreDocument<UnknownRecord>[]>;
};

const PROFILE_BATCH_SIZE = 100;
const PROFILE_BATCH_CONCURRENCY = 5;
const PROFILE_FIELD_PATHS = ["planId", "fixtureType", "isDeleted"];

const documentId = (name: string) =>
  decodeURIComponent(name.split("/documents/")[1]?.split("/").at(-1) || "");

const boardMetaPath = (orgId: string) => `churches/${orgId}/progressCache/meta`;
const boardShardPath = (orgId: string, shard: number) =>
  `churches/${orgId}/progressCache/shard-${String(shard).padStart(2, "0")}`;
const calendarPath = (uid: string, year: number) =>
  `users/${uid}/calendarYears/${year}`;

const memberFromDocument = (
  document: FirestoreDocument<UnknownRecord>,
  { roster = false }: { roster?: boolean } = {},
) => {
  const uid = roster
    ? (typeof document.data.uid === "string" ? document.data.uid : "")
    : documentId(document.name);
  if (roster && uid !== documentId(document.name)) return null;
  return projectCommunityProgressMember(uid, document.data);
};

const rosterSourceFromDocument = (
  document: FirestoreDocument<UnknownRecord>,
) => {
  const uid = typeof document.data.uid === "string" ? document.data.uid : "";
  if (!uid || uid !== documentId(document.name)) return null;
  return { uid, data: document.data };
};

const DEFAULT_SOURCE_DEPENDENCIES: CommunityProgressSourceDependencies = {
  loadPrimaryDocuments: (service, orgId) =>
    runRootCollectionQuery<UnknownRecord>(
      service.token,
      service.projectId,
      "users",
      "churchId",
      orgId,
      { limit: 5_000 },
    ),
  loadRosterDocuments: (service, orgId) =>
    listCollectionDocuments<UnknownRecord>(
      service.token,
      service.projectId,
      `churches/${orgId}/roster`,
      { pageSize: 500 },
    ),
  loadUserProfiles: (service, paths) =>
    batchGetDocuments<UnknownRecord>(
      service.token,
      service.projectId,
      paths,
      { fieldPaths: PROFILE_FIELD_PATHS },
    ),
};

const loadRosterUserProfiles = async (
  service: ServiceAccess,
  uids: string[],
  loadUserProfiles: CommunityProgressSourceDependencies["loadUserProfiles"],
) => {
  const uniqueUids = [...new Set(uids)];
  const chunks = Array.from(
    { length: Math.ceil(uniqueUids.length / PROFILE_BATCH_SIZE) },
    (_, index) =>
      uniqueUids.slice(
        index * PROFILE_BATCH_SIZE,
        (index + 1) * PROFILE_BATCH_SIZE,
      ).map((uid) => `users/${uid}`),
  );
  const documents: FirestoreDocument<UnknownRecord>[] = [];
  for (
    let offset = 0;
    offset < chunks.length;
    offset += PROFILE_BATCH_CONCURRENCY
  ) {
    const wave = await Promise.all(
      chunks.slice(offset, offset + PROFILE_BATCH_CONCURRENCY).map((paths) =>
        loadUserProfiles(service, paths)
      ),
    );
    documents.push(...wave.flat());
  }

  const requested = new Set(uniqueUids);
  const profiles = new Map<string, UnknownRecord>();
  for (const document of documents) {
    const uid = documentId(document.name);
    if (requested.has(uid)) profiles.set(uid, document.data);
  }
  return profiles;
};

export const loadCanonicalCommunityProgressMembers = async (
  service: ServiceAccess,
  orgId: string,
  overrides: Partial<CommunityProgressSourceDependencies> = {},
) => {
  const dependencies = { ...DEFAULT_SOURCE_DEPENDENCIES, ...overrides };
  const [primaryDocuments, rosterDocuments] = await Promise.all([
    orgId === "unaffiliated_v1"
      ? Promise.resolve([] as FirestoreDocument<UnknownRecord>[])
      : dependencies.loadPrimaryDocuments(service, orgId),
    dependencies.loadRosterDocuments(service, orgId),
  ]);
  const primary = primaryDocuments.flatMap((document) => {
    // 기존 클라이언트 쿼리(password == null)와 결과 집합을 맞춘다.
    if (document.data.password !== null) return [];
    const member = memberFromDocument(document);
    return member ? [member] : [];
  });
  const rosterSources = rosterDocuments.flatMap((document) => {
    const source = rosterSourceFromDocument(document);
    return source ? [source] : [];
  });
  const profiles = await loadRosterUserProfiles(
    service,
    rosterSources.map(({ uid }) => uid),
    dependencies.loadUserProfiles,
  );
  const roster = rosterSources.flatMap(({ uid, data }) => {
    const member = projectRosterCommunityProgressMember(
      uid,
      data,
      profiles.get(uid) ?? null,
    );
    return member ? [member] : [];
  });
  return mergeCommunityProgressMembers(primary, roster);
};

const readBoardShards = async (
  service: ServiceAccess,
  orgId: string,
  shardCount: number,
) => {
  const documents = await Promise.all(
    Array.from(
      { length: shardCount },
      (_, shard) =>
        getDocument<{ members?: unknown }>(
          service.token,
          service.projectId,
          boardShardPath(orgId, shard),
        ),
    ),
  );
  const seen = new Set<string>();
  return documents.flatMap((document) => {
    if (!document || !Array.isArray(document.data.members)) return [];
    return document.data.members.flatMap((value) => {
      if (!value || typeof value !== "object" || Array.isArray(value)) {
        return [];
      }
      const row = value as UnknownRecord;
      const uid = typeof row.uid === "string" ? row.uid : "";
      const member = projectCommunityProgressMember(uid, row);
      if (!member || seen.has(member.uid)) return [];
      seen.add(member.uid);
      return [member];
    });
  });
};

const rebuildBoard = async (
  service: ServiceAccess,
  orgId: string,
  serviceDate: string,
  now: Date,
) => {
  const members = await loadCanonicalCommunityProgressMembers(service, orgId);
  const shards = splitCommunityProgressMembers(members);
  const writes = shards.map((shard, index) =>
    updateWrite(service.projectId, boardShardPath(orgId, index), {
      schemaVersion: COMMUNITY_PROGRESS_SCHEMA_VERSION,
      shard: index,
      members: shard,
      updatedAt: now,
    })
  );
  writes.push(updateWrite(service.projectId, boardMetaPath(orgId), {
    schemaVersion: COMMUNITY_PROGRESS_SCHEMA_VERSION,
    serviceDate,
    shardCount: COMMUNITY_PROGRESS_SHARD_COUNT,
    memberCount: members.length,
    rebuiltAt: now,
  }));
  await commitWrites(service.token, service.projectId, writes);
  return members;
};

const canonicalCallerMember = async (
  service: ServiceAccess,
  orgId: string,
  uid: string,
  userDocument: FirestoreDocument<UnknownRecord>,
) => {
  const isDirect = userDocument.data.accountType !== "personal" &&
    userDocument.data.churchId === orgId &&
    userDocument.data.password === null;
  if (isDirect) {
    return projectCommunityProgressMember(uid, userDocument.data);
  }
  const rosterDocument = await getDocument<UnknownRecord>(
    service.token,
    service.projectId,
    `churches/${orgId}/roster/${uid}`,
  );
  if (!rosterDocument || rosterDocument.data.uid !== uid) return null;
  return projectRosterCommunityProgressMember(
    uid,
    rosterDocument.data,
    userDocument.data,
  );
};

const syncCallerShard = async (
  service: ServiceAccess,
  orgId: string,
  member: CommunityProgressMember | null,
  uid: string,
  now: Date,
) => {
  const shard = communityProgressShard(uid);
  const path = boardShardPath(orgId, shard);
  const document = await getDocument<{ members?: unknown }>(
    service.token,
    service.projectId,
    path,
  );
  if (!document || !Array.isArray(document.data.members)) return;
  const existing = document.data.members.flatMap((value) =>
    value && typeof value === "object" && !Array.isArray(value)
      ? [value as UnknownRecord]
      : []
  );
  const next = existing.filter((value) => value.uid !== uid);
  if (member) next.push(member);
  next.sort((left, right) => String(left.uid).localeCompare(String(right.uid)));
  if (JSON.stringify(existing) === JSON.stringify(next)) return;
  try {
    await commitWrites(service.token, service.projectId, [
      updateWrite(service.projectId, path, {
        schemaVersion: COMMUNITY_PROGRESS_SCHEMA_VERSION,
        shard,
        members: next,
        updatedAt: now,
      }, document.updateTime ? { updateTime: document.updateTime } : {}),
    ]);
  } catch (error) {
    // 같은 shard의 다른 사용자가 동시에 갱신하면 다음 대시보드 요청 또는
    // 일일 재구축이 복구한다. 순위 로딩 자체를 실패시키지는 않는다.
    if (
      !(error instanceof PlatformError) ||
      error.code !== "FIRESTORE_WRITE_FAILED" ||
      error.details?.status !== 409
    ) throw error;
  }
};

export const getCommunityProgress = async (
  service: ServiceAccess,
  uid: string,
  orgId: string,
  serviceDate: string,
  now = new Date(),
) => {
  const userDocument = await getDocument<UnknownRecord>(
    service.token,
    service.projectId,
    `users/${uid}`,
  );
  if (!userDocument || userDocument.data.isDeleted === true) {
    throw new PlatformError("NOT_FOUND");
  }
  const callerMember = await canonicalCallerMember(
    service,
    orgId,
    uid,
    userDocument,
  );
  if (!callerMember) {
    throw new PlatformError("FORBIDDEN", {
      message: "현재 참여 중인 공동체의 진행 상황만 볼 수 있습니다.",
    });
  }

  const meta = await getDocument<{
    schemaVersion?: unknown;
    serviceDate?: unknown;
    shardCount?: unknown;
  }>(service.token, service.projectId, boardMetaPath(orgId));
  const fresh = meta?.data.schemaVersion ===
      COMMUNITY_PROGRESS_SCHEMA_VERSION &&
    meta.data.serviceDate === serviceDate &&
    meta.data.shardCount === COMMUNITY_PROGRESS_SHARD_COUNT;
  if (!fresh) {
    const members = await rebuildBoard(service, orgId, serviceDate, now);
    return { members, rebuilt: true };
  }

  await syncCallerShard(service, orgId, callerMember, uid, now);
  const members = await readBoardShards(
    service,
    orgId,
    COMMUNITY_PROGRESS_SHARD_COUNT,
  );
  return { members, rebuilt: false };
};

export const getReadingCalendar = async (
  service: ServiceAccess,
  uid: string,
  year: number,
  now = new Date(),
) => {
  const userDocument = await getDocument<UnknownRecord>(
    service.token,
    service.projectId,
    `users/${uid}`,
  );
  if (!userDocument || userDocument.data.isDeleted === true) {
    throw new PlatformError("NOT_FOUND");
  }
  const path = calendarPath(uid, year);
  const cached = await getDocument<{
    dates?: unknown;
    backfilledAt?: unknown;
  }>(service.token, service.projectId, path);
  let dates = Array.isArray(cached?.data.dates)
    ? cached!.data.dates.flatMap((value) =>
      typeof value === "string" && value.startsWith(`${year}-`) ? [value] : []
    )
    : [];

  if (!cached?.data.backfilledAt) {
    const history = await listCollectionDocuments<UnknownRecord>(
      service.token,
      service.projectId,
      `users/${uid}/history`,
      { pageSize: 500 },
    );
    dates = calendarDatesForYear(
      history.map((document) => document.data),
      year,
    );
  }
  const latestIso = legacyDateToIso(userDocument.data.lastReadDate);
  if (latestIso?.startsWith(`${year}-`) && !dates.includes(latestIso)) {
    dates.push(latestIso);
    dates.sort();
  }
  const needsWrite = !cached?.data.backfilledAt ||
    JSON.stringify(cached?.data.dates ?? []) !== JSON.stringify(dates);
  if (needsWrite) {
    await commitWrites(service.token, service.projectId, [
      updateWrite(service.projectId, path, {
        schemaVersion: 1,
        year,
        dates,
        readDays: dates.length,
        backfilledAt: cached?.data.backfilledAt || now,
        updatedAt: now,
      }),
    ]);
  }
  return { dates, readDays: dates.length };
};
