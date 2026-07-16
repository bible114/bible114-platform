import assert from "node:assert/strict";
import fs from "node:fs";

const read = (path) =>
  fs.readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

const rules = read("firestore.rules");
const core = read("supabase/functions/platform-api/core.ts");
const coreTest = read("supabase/functions/platform-api/core_test.ts");
const index = read("supabase/functions/platform-api/index.ts");
const service = read(
  "supabase/functions/platform-api/publicDirectoryService.ts",
);
const serviceTest = read(
  "supabase/functions/platform-api/publicDirectoryService_test.ts",
);
const firestore = read("supabase/functions/_shared/firestore.ts");
const firestoreTest = read("supabase/functions/_shared/firestore_test.ts");
const client = read("src/utils/platformApi.js");
const directory = read("src/utils/churchDirectory.js");
const platformAdmin = read("src/components/PlatformAdminView.jsx");
const churchAdmin = read("src/components/ChurchAdminView.jsx");

assert.match(
  rules,
  /function isPublicDirectoryReady\(\)[\s\S]*meta\.ready == true[\s\S]*meta\.mode == 'public'[\s\S]*match \/publicChurches\/\{churchId\}\s*\{\s*allow read: if isPublicDirectoryReady\(\);\s*allow write: if false;/,
  "publicChurches query는 public 전환 meta로만 열고 서비스 계정만 쓰게 해야 한다.",
);
assert.match(
  rules,
  /match \/publicDirectoryMeta\/current[\s\S]*resource\.data\.keys\(\)\.hasOnly\([\s\S]*'ready'[\s\S]*'mode'[\s\S]*'schemaVersion'[\s\S]*allow write: if false;/,
  "publicDirectoryMeta/current는 최소 상태 스키마만 읽고 서비스 계정만 쓰게 해야 한다.",
);
assert.match(
  rules,
  /match \/platformInternal\/\{documentId\}\s*\{\s*allow read, write: if false;/,
  "재생성 lease와 소유권 문서는 브라우저에서 완전히 닫혀야 한다.",
);

assert.match(
  core,
  /export const REBUILD_PUBLIC_CHURCHES_ACTION =\s*"rebuildPublicChurches" as const;/,
);
assert.match(
  core,
  /action:\s*typeof REBUILD_PUBLIC_CHURCHES_ACTION;\s*requestId:\s*string;\s*dryRun:\s*boolean;/,
);
assert.match(core, /new Set\(\["action", "requestId", "dryRun"\]\)/);
assert.match(core, /typeof dryRun !== "boolean"/);
assert.match(
  coreTest,
  /공개 디렉터리 재생성은 dryRun 외 브라우저 값을 받지 않는다/,
);

const handlerStart = index.indexOf(
  'if (parsed.action === "rebuildPublicChurches")',
);
assert.ok(handlerStart >= 0, "rebuildPublicChurches 서버 라우터가 필요하다.");
const handler = index.slice(
  handlerStart,
  index.indexOf("\n    if (parsed.action ===", handlerStart + 10),
);
assert.match(handler, /requireRole\([^;]+\["platformAdmin", "superAdmin"\]\)/);
assert.match(
  handler,
  /rebuildPublicChurches\(service, \{\s*requestId: parsed\.requestId,\s*dryRun: parsed\.dryRun,?\s*\}\)/,
  "서버 전용 owner를 요청별로 묶기 위해 검증된 requestId를 서비스에 넘겨야 한다.",
);

for (
  const pattern of [
    /listCollectionDocuments<SourceChurchDocument>/,
    /listCollectionDocuments<Record<string, unknown>>/,
    /SOURCE_COLLECTION = "churches"/,
    /PUBLIC_COLLECTION = "publicChurches"/,
    /PUBLIC_META_PATH = "publicDirectoryMeta\/current"/,
    /UNAFFILIATED_CHURCH_ID = "unaffiliated_v1"/,
    /source\.data\.isDeleted === true/,
    /source\.data\.hiddenFromDirectory === true/,
    /invalidCount > 0/,
    /PUBLIC_LOCK_PATH = "platformInternal\/publicDirectoryRebuild"/,
    /PUBLIC_DIRECTORY_LEASE_MS = 10 \* 60 \* 1_000/,
    /createOwnerToken: \(\) => crypto\.randomUUID\(\)/,
    /codePointAt\(0\)/,
    /lock\.data\.runId !== requestId[\s\S]*lock\.data\.ownerToken !== ownerToken/,
    /legacyDocument = await dependencies\.getDocument<[\s\S]*LEGACY_DIRECTORY_PATH[\s\S]*const \[sourceDocuments, publicDocuments\] = await Promise\.all/,
    /ready: false,[\s\S]*mode: "legacy"/,
    /ready: true,[\s\S]*mode: "legacy"/,
    /writeBatchSize: 450/,
  ]
) assert.match(service, pattern);
assert.doesNotMatch(
  service,
  /mode:\s*"public"/,
  "남은 직접 writer가 있는 동안 public mode를 활성화하면 안 된다.",
);

const metaOff = service.indexOf("ready: false");
const publicWrites = service.indexOf("const publicWrites");
const legacyWrite = service.indexOf("LEGACY_DIRECTORY_PATH", publicWrites);
const metaOn = service.indexOf("ready: true", legacyWrite);
assert.ok(
  metaOff >= 0 && metaOff < publicWrites && publicWrites < legacyWrite &&
    legacyWrite < metaOn,
  "부분 실패 시 legacy fallback을 보장하는 meta off → public → legacy → meta on 순서여야 한다.",
);

assert.match(firestore, /export const listCollectionDocuments = async/);
assert.match(firestore, /nextPageToken/);
assert.match(firestore, /seenPageTokens/);
assert.match(firestoreTest, /listCollectionDocuments/);
assert.match(
  firestoreTest,
  /commit errors preserve the canonical Firestore status/,
);
assert.match(serviceTest, /dryRun/);
assert.match(serviceTest, /invalid/);
assert.match(serviceTest, /stale/);
assert.match(serviceTest, /active lease rejects a different run/);
assert.match(
  serviceTest,
  /lost acquire response releases only the ambiguous owner lease/,
);
assert.match(serviceTest, /expired lease is taken over/);
assert.match(serviceTest, /same requestId can safely resume/);
assert.match(
  serviceTest,
  /owner takeover blocks every stale batch and stale cleanup/,
);
assert.match(serviceTest, /legacy updateTime conflict is retryable/);
assert.match(
  serviceTest,
  /legacy updateTime fence was not captured before collection scans/,
);

for (
  const pattern of [
    /meta\?\.ready !== true/,
    /meta\?\.schemaVersion !== 1/,
    /meta\?\.mode !== 'public'/,
    /snapshot\.size !== meta\.count/,
    /doc\.id !== data\.id/,
    /Object\.keys\(data\)/,
    /return readLegacyDirectory\(\)/,
    /sortDirectoryChurches/,
  ]
) assert.match(directory, pattern);
assert.doesNotMatch(
  churchAdmin,
  /syncChurchDirectoryEntry/,
  "입장코드 변경은 공개 디렉토리를 다시 쓸 이유가 없다.",
);
assert.match(platformAdmin, /await rebuildPublicChurches\(true,/);
assert.match(platformAdmin, /await rebuildPublicChurches\(false,/);
assert.doesNotMatch(platformAdmin, /\brebuildChurchDirectory\b/);

const platformApi = await import("../src/utils/platformApi.js");
const requestId = "123e4567-e89b-42d3-a456-426614174000";
const summary = {
  sourceCount: 3,
  expectedCount: 2,
  publicCount: 1,
  legacyCount: 2,
  upsertCount: 1,
  deleteCount: 0,
  legacyChanged: true,
  invalidCount: 0,
};
assert.deepEqual(
  platformApi.validateRebuildPublicChurchesResponse(
    { dryRun: true },
    {
      ok: true,
      action: "rebuildPublicChurches",
      requestId,
      dryRun: true,
      applied: false,
      mode: "legacy",
      summary,
    },
    requestId,
  ).summary,
  summary,
);
for (
  const mutate of [
    (result) => {
      result.extra = true;
    },
    (result) => {
      result.mode = "public";
    },
    (result) => {
      result.summary.expectedCount = -1;
    },
    (result) => {
      result.applied = true;
    },
  ]
) {
  const result = {
    ok: true,
    action: "rebuildPublicChurches",
    requestId,
    dryRun: true,
    applied: false,
    mode: "legacy",
    summary: { ...summary },
  };
  mutate(result);
  assert.throws(
    () =>
      platformApi.validateRebuildPublicChurchesResponse(
        { dryRun: true },
        result,
        requestId,
      ),
    (error) =>
      error instanceof platformApi.PlatformApiError &&
      error.code === "INVALID_RESPONSE" &&
      error.retryable === true,
  );
}

assert.match(
  client,
  /export const rebuildPublicChurches = \(dryRun, options = \{\}\)/,
);
assert.match(client, /callPlatformApi\('rebuildPublicChurches', payload/);
assert.match(client, /const PUBLIC_DIRECTORY_TIMEOUT_MS = 120_000/);

console.log("✅ T125 publicChurches 안전 백필·legacy fallback 계약 검증 통과");
