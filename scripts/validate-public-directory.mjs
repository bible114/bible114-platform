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
const visibilityCore = read(
  "supabase/functions/platform-api/adminChurchVisibilityCore.ts",
);
const visibilityService = read(
  "supabase/functions/platform-api/adminChurchVisibilityService.ts",
);
const visibilityServiceTest = read(
  "supabase/functions/platform-api/adminChurchVisibilityService_test.ts",
);
const renameService = read(
  "supabase/functions/platform-api/adminChurchRenameService.ts",
);
const renameServiceTest = read(
  "supabase/functions/platform-api/adminChurchRenameService_test.ts",
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
    /ready: true,[\s\S]*mode: "public"/,
    /writeBatchSize: 450/,
  ]
) assert.match(service, pattern);
assert.match(
  service,
  /mode:\s*"public"/,
  "T132 최종 차단 뒤 public mode를 활성화해야 한다.",
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

assert.match(
  core,
  /ADMIN_SET_CHURCH_VISIBILITY_ACTION =\s*\n?\s*"adminSetChurchVisibility" as const/,
);
assert.match(
  core,
  /new Set\(\["action", "requestId", "churchId", "hidden"\]\)/,
);
assert.match(visibilityCore, /status: "updated" \| "alreadySet"/);
assert.match(visibilityCore, /LEGACY_ENTRY_KEYS[\s\S]*"codeHash"[\s\S]*"churchCodeHash"/);
assert.match(visibilityCore, /seen\.has\(id\)/);
assert.match(visibilityCore, /actor\.role !== "platformAdmin" && actor\.role !== "superAdmin"/);
for (const pattern of [
  /const ledgerPath = `platformAdminActions\/\$\{input\.requestId\}`/,
  /legacyDirectoryPath = "settings\/churchDirectory"/,
  /publicChurchPath = `publicChurches\/\$\{input\.churchId\}`/,
  /updateMask: \["hiddenFromDirectory", "updatedAt"\]/,
  /churches: decision\.legacyChurches, updatedAt: now/,
  /MAX_TRANSACTION_ATTEMPTS = 3/,
]) assert.match(visibilityService, pattern);
assert.match(visibilityServiceTest, /apply-then-409/);
assert.match(visibilityServiceTest, /exact ledger[\s\S]*replay/);

for (const pattern of [
  /const legacyPath = "settings\/churchDirectory"/,
  /const publicPath = `publicChurches\/\$\{input\.churchId\}`/,
  /updateMask: \["name", "updatedAt"\]/,
  /churches: decision\.legacyChurches, updatedAt: now/,
]) assert.match(renameService, pattern);
assert.match(renameServiceTest, /legacy 비밀 drift/);
assert.match(renameServiceTest, /apply-then-409/);

const visibilityHandlerStart = index.indexOf(
  'if (parsed.action === "adminSetChurchVisibility")',
);
assert.ok(visibilityHandlerStart >= 0, "adminSetChurchVisibility 서버 라우터가 필요하다.");
const visibilityHandler = index.slice(
  visibilityHandlerStart,
  index.indexOf("\n    if (parsed.action ===", visibilityHandlerStart + 10),
);
assert.match(
  visibilityHandler,
  /adminSetChurchVisibility\(service, verifiedUser, \{[\s\S]*requestId: parsed\.requestId[\s\S]*churchId: parsed\.churchId[\s\S]*hidden: parsed\.hidden/,
);

const toggleStart = platformAdmin.indexOf("const toggleChurchHidden = async");
const toggleEnd = platformAdmin.indexOf("\n    };", toggleStart) + 7;
assert.ok(toggleStart >= 0 && toggleEnd > toggleStart, "교회 숨김 UI 진입점이 필요하다.");
const toggleContract = platformAdmin.slice(toggleStart, toggleEnd);
assert.match(toggleContract, /await adminSetChurchVisibility\(\{[\s\S]*churchId: church\.id[\s\S]*hidden: next[\s\S]*expectedUid: currentUser\?\.uid/);
assert.match(toggleContract, /invalidateChurchDirectoryCache\(\)/);
assert.doesNotMatch(toggleContract, /db\.|syncChurchDirectoryEntry|\.update\(|\.set\(/,
  "교회 숨김 UI가 브라우저에서 교회·directory를 직접 쓰면 안 된다.");

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
      mode: "public",
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
      result.mode = "legacy";
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
    mode: "public",
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

const visibilityPayload = { churchId: "church-1", hidden: true };
const visibilityResponse = {
  ok: true,
  action: "adminSetChurchVisibility",
  requestId,
  status: "updated",
  hidden: true,
};
assert.deepEqual(
  platformApi.validateAdminSetChurchVisibilityResponse(
    visibilityPayload,
    visibilityResponse,
    requestId,
  ),
  visibilityResponse,
);
for (const mutate of [
  (result) => { result.extra = true; },
  (result) => { result.hidden = false; },
  (result) => { result.status = "pending"; },
  (result) => { result.requestId = "223e4567-e89b-42d3-a456-426614174000"; },
]) {
  const result = structuredClone(visibilityResponse);
  mutate(result);
  assert.throws(
    () => platformApi.validateAdminSetChurchVisibilityResponse(
      visibilityPayload,
      result,
      requestId,
    ),
    error => error instanceof platformApi.PlatformApiError
      && error.code === "INVALID_RESPONSE" && error.retryable === true,
  );
}

const renamePayload = { churchId: "church-1", name: "새 이름" };
const renameResponse = {
  ok: true,
  action: "adminRenameChurch",
  requestId,
  status: "renamed",
  churchId: "church-1",
  previousName: "이전 이름",
  name: "새 이름",
};
assert.deepEqual(
  platformApi.validateAdminRenameChurchResponse(
    renamePayload,
    renameResponse,
    requestId,
  ),
  renameResponse,
);
assert.deepEqual(
  platformApi.validateAdminRenameChurchResponse(
    renamePayload,
    { ...renameResponse, previousName: "새 이름" },
    requestId,
  ).status,
  "renamed",
);
for (const mutate of [
  (result) => { result.extra = true; },
  (result) => { result.name = "다른 이름"; },
  (result) => { result.status = "pending"; },
  (result) => { result.churchId = "church-2"; },
]) {
  const result = structuredClone(renameResponse);
  mutate(result);
  assert.throws(
    () => platformApi.validateAdminRenameChurchResponse(
      renamePayload,
      result,
      requestId,
    ),
    error => error instanceof platformApi.PlatformApiError
      && error.code === "INVALID_RESPONSE" && error.retryable === true,
  );
}

assert.match(
  client,
  /export const rebuildPublicChurches = \(dryRun, options = \{\}\)/,
);
assert.match(client, /callPlatformApi\('rebuildPublicChurches', payload/);
assert.match(client, /const PUBLIC_DIRECTORY_TIMEOUT_MS = 120_000/);

console.log("✅ T125 publicChurches 안전 백필·legacy fallback 계약 검증 통과");
