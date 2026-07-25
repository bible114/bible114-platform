import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = path => fs.readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const exists = path => fs.existsSync(new URL(`../${path}`, import.meta.url));

const constants = read('src/data/constants.js');
const envExample = read('.env.example');
const client = read('src/utils/platformApi.js');
const platformAuthSource = read('src/utils/platformAuth.js');
const userBibleActions = read('src/hooks/useUserBibleActions.js');
const useMemosSource = read('src/hooks/useMemos.js');
const helpersSource = read('src/utils/helpers.js');
const useAuthSource = read('src/hooks/useAuth.js');
const useUserAuthSource = read('src/hooks/useUserAuth.js');
const appSource = read('src/App.jsx');
const useDepartmentSource = read('src/hooks/useDepartment.js');
const planSelectionSource = read('src/components/PlanSelectionView.jsx');
const membershipCardSource = read('src/components/dashboard/CommunityMembershipCard.jsx');
const churchAdminSource = read('src/components/ChurchAdminView.jsx');
const platformAdminSource = read('src/components/PlatformAdminView.jsx');
const firestoreRules = read('firestore.rules');
const churchAdminSignupService = read('supabase/functions/platform-api/completeChurchAdminSignupService.ts');
const quizCard = read('src/components/dashboard/BibleQuizCard.jsx');
const userStateSync = read('src/utils/userStateSync.js');
const rosterClient = read('src/utils/roster.js');
const bibleLogic = read('src/hooks/useBibleLogic.js');
const quizProgressSource = read('src/utils/quizProgress.js');
const packageJson = JSON.parse(read('package.json'));

assert.match(constants, /export const PLATFORM_API_URL = import\.meta\.env\?\.VITE_PLATFORM_API_URL \|\| '';/);
assert.match(envExample, /^VITE_PLATFORM_API_URL=$/m);
assert.equal(packageJson.scripts['validate:round24'], 'node scripts/validate-round24.mjs');
assert.match(
    packageJson.scripts.validate,
    /npm run validate:round24 && npm run validate:round29 && npm run validate:daily-video-server && npm run validate:public-directory && npm run validate:church-lifecycle && npm run validate:t132-final-lockdown && npm run validate:platform-api$/,
);
assert.match(packageJson.scripts['validate:platform-api'], /deno test[\s\S]*deno check[\s\S]*deno fmt --check/);
assert.match(
    client,
    /const loadAuth = async \(\) => \(await import\('\.\/platformAuth\.js'\)\)\.getPlatformAuth\(\);/,
    'platformApi의 Node-safe 지연 경계는 브라우저 전용 platformAuth 모듈이어야 한다.',
);
assert.doesNotMatch(
    client,
    /import\('\.\/firebase\.js'\)/,
    'firebase.js를 직접 동적 import하면 정적 import와 겹쳐 Vite chunk 경고가 재발한다.',
);
assert.match(
    platformAuthSource,
    /import \{ auth \} from '\.\/firebase\.js';[\s\S]*export const getPlatformAuth = \(\) => auth;/,
    '브라우저 전용 경계는 초기화된 Firebase Auth 인스턴스만 반환해야 한다.',
);

// 플랫폼 관리자 회원 편집은 일반 비개인 회원의 조직만 바꿀 수 있다.
const memberOrganizationGuard = /editingUser\.role === 'member' && editingUser\.accountType !== 'personal'/g;
assert.equal(
    (platformAdminSource.match(memberOrganizationGuard) || []).length,
    3,
    '교회·부서·소그룹 편집 UI는 일반 비개인 회원에게만 보여야 한다.',
);
assert.match(
    platformAdminSource,
    /editingUser\.role !== 'member'[\s\S]*관리자 계정의 소속 교회는 권한 범위를 결정하므로 이 화면에서 변경할 수 없습니다/,
    '관리자 계정에는 정식 위임 절차 안내가 보여야 한다.',
);
const saveEditUserSource = appSource.slice(
    appSource.indexOf('const saveEditUser = async'),
    appSource.indexOf('/*', appSource.indexOf('const saveEditUser = async')),
);
assert.doesNotMatch(
    saveEditUserSource,
    /const originalUser = allUsers\.find/,
    '회원 편집 권한 판정에 화면 allUsers 캐시를 authority로 사용하면 안 된다.',
);
assert.match(
    saveEditUserSource,
    /db\.runTransaction\(async transaction => \{[\s\S]*transaction\.get\(userRef\)[\s\S]*const latestUser = latestDoc\.data\(\)[\s\S]*latestUser\.churchId[\s\S]*editingUser\.churchId[\s\S]*latestUser\.churchName[\s\S]*editingUser\.churchName/,
    '저장 transaction에서 최신 users 문서의 교회 ID·이름을 authority로 다시 읽어야 한다.',
);
const freshUserReadIndex = saveEditUserSource.indexOf('transaction.get(userRef)');
const protectedAdminGuardIndex = saveEditUserSource.indexOf("if (latestUser.role !== 'member' && churchIdentityChanged)");
const editUserWriteIndex = saveEditUserSource.indexOf('transaction.set(userRef, updateData, { merge: true })');
assert.ok(
    freshUserReadIndex >= 0 && protectedAdminGuardIndex > freshUserReadIndex && editUserWriteIndex > protectedAdminGuardIndex,
    '최신 사용자 read, 관리자 소속 차단, 같은 transaction write 순서를 지켜야 한다.',
);
assert.match(
    saveEditUserSource,
    /latestUser\.role !== 'member' && churchIdentityChanged\)[\s\S]*EDIT_ADMIN_IDENTITY_CONFLICT[\s\S]*const canEditMemberOrganization = latestUser\.role === 'member'[\s\S]*latestUser\.accountType !== 'personal'[\s\S]*\.\.\.\(canEditMemberOrganization \? \{[\s\S]*churchId: editingUser\.churchId[\s\S]*\} : \{\}\)/,
    '동시 member→admin 승격이나 personal 전환 뒤 stale 조직 payload를 쓰지 않아야 한다.',
);
assert.doesNotMatch(
    saveEditUserSource,
    /db\.collection\('users'\)\.doc\(editingUser\.uid\)\.set/,
    '회원 편집을 transaction 밖에서 직접 저장하면 안 된다.',
);

// 브라우저 클라이언트 계약: 인증 토큰, 멱등 requestId, 12초 제한, 표준 오류.
for (const pattern of [
    /export class PlatformApiError extends Error/,
    /export const callPlatformApi = async \(action, payload = \{\}, options = \{\}\)/,
    /export const callPlatformApiPublic = async \(action, payload = \{\}, options = \{\}\)/,
    /export const preflightPlatformApi =/,
    /export const previewReadCompletion = \(cycle, day, options = \{\}\)/,
    /export const completeRead = \(cycle, day, options = \{\}\)/,
    /export const validateCompleteReadResponse = \(payload, result, expectedRequestId\)/,
    /export const submitQuiz = \(progressKey, quizKey, selectedIndex, attemptSlot, options = \{\}\)/,
    /export const validateSubmitQuizResponse = \(payload, result, expectedRequestId\)/,
    /export const skipQuiz = \(progressKey, quizKey, options = \{\}\)/,
    /export const validateSkipQuizResponse = \(payload, result, expectedRequestId\)/,
    /export const syncAchievements = \(trigger, options = \{\}\)/,
    /export const validateSyncAchievementsResponse = \(payload, result, expectedRequestId\)/,
    /export const migratePersonalTalentWallet = \(options = \{\}\)/,
    /export const validateMigratePersonalTalentWalletResponse = \(result, expectedRequestId\)/,
    /export const normalizeLegacyReadingPosition = \(options = \{\}\)/,
    /export const validateNormalizeLegacyReadingPositionResponse = \(result, expectedRequestId\)/,
    /export const completeMemberOnboarding = \(input, options = \{\}\)/,
    /export const validateCompleteMemberOnboardingResponse = \(\s*payload,\s*result,\s*expectedRequestId,?\s*\)/,
    /export const resolveDailyVideo = \(options = \{\}\)/,
    /export const validateDailyVideoResolveResponse = \(result, expectedRequestId\)/,
    /export const adminPreviewDailyVideo = \(input, options = \{\}\)/,
    /export const validateAdminDailyVideoPreviewResponse = \(payload, result, expectedRequestId\)/,
    /export const issueJoinTicket = \(\{ churchId, entryCode, purpose \}, options = \{\}\)/,
    /export const joinCommunity = \(\{ churchId, entryCode = '', joinTicket = '', departmentId, subgroupId = '' \}, options = \{\}\)/,
    /Number\.isInteger\(cycle\)/,
    /Number\.isInteger\(day\)/,
    /callPlatformApi\('previewReadCompletion', \{ cycle, day \}, options\)/,
    /const requestUser = auth\.currentUser/,
    /requestUser\.getIdToken\(forceRefresh\)/,
    /expectedUid && requestUser\.uid !== expectedUid/,
    /auth\.currentUser\?\.uid !== requestUser\.uid/,
    /code: 'AUTH_CHANGED'/,
    /cryptoImpl\?\.randomUUID/,
    /cryptoImpl\?\.getRandomValues/,
    /export const createRequestId = \(cryptoImpl = globalThis\.crypto, random = Math\.random\)/,
    /return formatUuidV4\(bytes\)/,
    /const DEFAULT_TIMEOUT_MS = 12_000/,
    /new AbortController\(\)/,
    /setTimeout\(\(\) => controller\.abort\(\), timeoutMs\)/,
    /Authorization: `Bearer \$\{token\}`/,
    /JSON\.stringify\(\{ action, requestId, \.\.\.payload \}\)/,
    /code: 'FEATURE_DISABLED'/,
    /first\.response\.status !== 401/,
    /forceRefresh: true/,
]) assert.match(client, pattern);

assert.equal((client.match(/forceRefresh: true/g) || []).length, 1, '401 토큰 강제 갱신은 정확히 한 번이어야 한다.');
assert.doesNotMatch(client, /for\s*\(|while\s*\(|setInterval\s*\(/, '플랫폼 API 클라이언트에 일반 자동 재시도 루프가 없어야 한다.');
assert.doesNotMatch(
    client,
    /(?:db\.collection|firebase\.firestore|\bgetDocument\s*\(|\bsetDoc\s*\(|\bupdateDoc\s*\(|\brunTransaction\s*\(|\bcommitWrites\s*\()/,
    '플랫폼 API 클라이언트가 데이터베이스를 직접 읽거나 쓰면 안 된다.',
);

// Node에서 오류 타입과 URL 미설정 안전장치를 import/실행할 수 있어야 한다.
const platformApi = await import('../src/utils/platformApi.js');
const { ACHIEVEMENTS } = await import('../src/data/achievements.js');
const quizProgressRuntime = await import('../src/utils/quizProgress.js');
const { strictCanonicalRosterEntries } = await import('../src/utils/rosterSnapshot.js');
const { updateRosterTalents } = await import('../src/utils/talentWallet.js');
const { normalizeOnboardingOrganizations } = await import('../src/utils/onboardingOrganizations.js');
const { reconcileStoredRequestIds } = await import('../src/utils/adminTalentRequests.js');
const {
    __resetActivityRequestFallbackForTests,
    clearActivityRequest,
    getOrCreateQuizActivityRequest,
    getOrCreateQuizSkipActivityRequest,
    getOrCreateReadActivityRequest,
    getOrCreateRestartActivityRequest,
} = await import('../src/utils/userActivityRequests.js');
const sampleError = new platformApi.PlatformApiError('fixture', { code: 'FIXTURE', status: 418, retryable: false });
assert.equal(sampleError.code, 'FIXTURE');
assert.equal(sampleError.status, 418);
assert.equal(sampleError.retryable, false);
const makeCanonicalRosterSnapshot = (orgIds, overrides = {}) => ({
    docs: orgIds.map((orgId, index) => {
        const uid = overrides.uid ?? 'user-1';
        const pathUid = overrides.pathUid ?? uid;
        const path = overrides.path ?? `churches/${orgId}/roster/${pathUid}`;
        return {
            id: overrides.id ?? uid,
            exists: overrides.exists ?? true,
            data: () => ({ uid, talent: index + 1 }),
            ref: {
                path,
                parent: { parent: { id: overrides.parentOrgId ?? orgId } },
            },
        };
    }),
});
assert.deepEqual(
    strictCanonicalRosterEntries(makeCanonicalRosterSnapshot(['z-org', 'a-org']), 'user-1')
        .map(entry => entry.rosterPath),
    ['churches/a-org/roster/user-1', 'churches/z-org/roster/user-1'],
    'transaction 대상 canonical roster 경로는 uid/path를 검증하고 결정적으로 정렬해야 한다.',
);
assert.throws(
    () => strictCanonicalRosterEntries(makeCanonicalRosterSnapshot(['a', 'b', 'c', 'd']), 'user-1'),
    /limit exceeded/,
    'canonical roster가 3개를 넘으면 일부만 적용하지 말고 fail-closed 해야 한다.',
);
for (const invalidSnapshot of [
    makeCanonicalRosterSnapshot(['a'], { id: 'other-user' }),
    makeCanonicalRosterSnapshot(['a'], { uid: 'other-user', pathUid: 'user-1' }),
    makeCanonicalRosterSnapshot(['a'], { path: 'churches/a/members/user-1' }),
    makeCanonicalRosterSnapshot(['a'], { parentOrgId: 'other-org' }),
    makeCanonicalRosterSnapshot(['a'], { exists: false }),
]) {
    assert.throws(
        () => strictCanonicalRosterEntries(invalidSnapshot, 'user-1'),
        /invalid canonical roster row/,
        '비canonical uid/path 또는 transaction 중 사라진 roster를 거부해야 한다.',
    );
}
const currentQuizContext = { uid: 'user-1', readCount: 2, currentDay: 10, readingEpoch: 3 };
const runtimeCalendarDate = 'Thu Jul 16 2026';
assert.equal(
    quizProgressRuntime.userAllowsQuizProgressKey(currentQuizContext, 'e3_r2_d10', runtimeCalendarDate),
    true,
    'fresh quiz context는 같은 uid·epoch·cycle·day에서만 유효해야 한다.',
);
for (const staleKey of ['e2_r2_d10', 'e3_r1_d10', 'e3_r2_d9']) {
    assert.equal(
        quizProgressRuntime.userAllowsQuizProgressKey(currentQuizContext, staleKey, runtimeCalendarDate),
        false,
        `다른 탭의 restart/read로 오래어진 퀴즈 context(${staleKey})를 거부해야 한다.`,
    );
}
assert.equal(
    quizProgressRuntime.userAllowsQuizProgressKey(
        { ...currentQuizContext, lastReadDate: runtimeCalendarDate },
        'e3_r2_d9',
        runtimeCalendarDate,
    ),
    true,
    '오늘 방금 완료한 직전 Day 퀴즈 context를 허용해야 한다.',
);
assert.equal(
    quizProgressRuntime.userAllowsQuizProgressKey(
        { uid: 'user-1', readCount: 3, currentDay: 1, readingEpoch: 3, lastReadDate: runtimeCalendarDate },
        'e3_r2_d365',
        runtimeCalendarDate,
    ),
    true,
    '회차 경계 직후에는 이전 회차 Day 365 퀴즈 context를 허용해야 한다.',
);
assert.equal(
    quizProgressRuntime.userAllowsQuizProgressKey(
        { ...currentQuizContext, lastReadDate: 'Wed Jul 15 2026' },
        'e3_r2_d9',
        runtimeCalendarDate,
    ),
    false,
    '오늘 읽기 완료가 아니면 직전 Day 퀴즈 context를 거부해야 한다.',
);
assert.notEqual(
    quizProgressRuntime.getQuizConfigurationKey({ ...currentQuizContext, dayOffset: 0, planId: '1year_revised' }),
    quizProgressRuntime.getQuizConfigurationKey({ ...currentQuizContext, dayOffset: 1, planId: '1year_revised' }),
    '다른 탭에서 dayOffset이 바뀐 퀴즈 context를 구분해야 한다.',
);
const uuidV4Pattern = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
assert.match(platformApi.createRequestId(null, () => 0), uuidV4Pattern, 'crypto 완전 부재 fallback도 UUIDv4여야 한다.');
assert.match(platformApi.createRequestId({
    getRandomValues: bytes => bytes.fill(255),
}, () => 0), uuidV4Pattern, 'getRandomValues fallback도 UUIDv4여야 한다.');
assert.doesNotMatch(client, /`b114-/, '서버가 거부하는 비 UUID requestId fallback이 없어야 한다.');
const completedAdminRequestId = '123e4567-e89b-42d3-a456-426614174000';
const fallbackRequests = new Map([
    ['b114_admin_talent_request_v1:done', completedAdminRequestId],
    ['b114_admin_talent_request_v1:pending', '223e4567-e89b-42d3-a456-426614174000'],
]);
const storedRequests = new Map([
    ['b114_admin_talent_request_v1:done', completedAdminRequestId],
    ['b114_admin_talent_request_v1:pending', '223e4567-e89b-42d3-a456-426614174000'],
    ['unrelated', completedAdminRequestId],
]);
const fakeStorage = {
    get length() { return storedRequests.size; },
    key: index => [...storedRequests.keys()][index] ?? null,
    getItem: key => storedRequests.get(key) ?? null,
    removeItem: key => storedRequests.delete(key),
};
assert.equal(reconcileStoredRequestIds({
    completedRequestIds: new Set([completedAdminRequestId]),
    fallback: fallbackRequests,
    storage: fakeStorage,
    prefix: 'b114_admin_talent_request_v1:',
}), 2);
assert.equal(fallbackRequests.has('b114_admin_talent_request_v1:done'), false);
assert.equal(storedRequests.has('b114_admin_talent_request_v1:done'), false);
assert.equal(storedRequests.has('b114_admin_talent_request_v1:pending'), true);
assert.equal(storedRequests.has('unrelated'), true);
await assert.rejects(
    () => platformApi.callPlatformApi('preflight'),
    error => error instanceof platformApi.PlatformApiError && error.code === 'FEATURE_DISABLED' && error.status === 0 && error.retryable === false,
);

const makeStorage = () => {
    const values = new Map();
    return {
        get length() { return values.size; },
        key: index => [...values.keys()][index] ?? null,
        getItem: key => values.get(key) ?? null,
        setItem: (key, value) => values.set(key, value),
        removeItem: key => values.delete(key),
        values,
    };
};
const activityStorage = makeStorage();
const readRequestId = '523e4567-e89b-42d3-a456-426614174000';
const readRequest = getOrCreateReadActivityRequest(
    { uid: 'user-1', cycle: 2, day: 10, readingEpoch: 0 },
    { storage: activityStorage, requestIdFactory: () => readRequestId },
);
assert.equal(readRequest.requestId, readRequestId);
assert.deepEqual(readRequest.payload, { cycle: 2, day: 10, readingEpoch: 0 });
assert.equal(
    getOrCreateReadActivityRequest(
        { uid: 'user-1', cycle: 2, day: 10, readingEpoch: 0 },
        { storage: activityStorage, requestIdFactory: () => { throw new Error('must reuse'); } },
    ).requestId,
    readRequestId,
    '같은 읽기 위치는 저장된 requestId를 재사용해야 한다.',
);

const restartRequestId = '573e4567-e89b-42d3-a456-426614174000';
const restartRequest = getOrCreateRestartActivityRequest(
    { uid: 'user-1', cycle: 2, day: 10, readingEpoch: 3 },
    { storage: activityStorage, requestIdFactory: () => restartRequestId },
);
assert.equal(restartRequest.requestId, restartRequestId);
assert.deepEqual(restartRequest.payload, { cycle: 2, day: 10, readingEpoch: 3 });
assert.equal(
    getOrCreateRestartActivityRequest(
        { uid: 'user-1', cycle: 9, day: 300, readingEpoch: 8 },
        { storage: activityStorage, requestIdFactory: () => { throw new Error('must reuse'); } },
    ).requestId,
    restartRequestId,
    '미확정 재시작은 상태가 바뀌어도 UID별 최초 requestId를 재사용해야 한다.',
);
assert.equal(clearActivityRequest(restartRequest, { storage: activityStorage }), true);

const quizRequestId = '623e4567-e89b-42d3-a456-426614174000';
const firstQuizRequest = getOrCreateQuizActivityRequest(
    { uid: 'user-1', progressKey: 'r2_d10', quizKey: 'quiz-1', attemptSlot: 1, selectedIndex: 0 },
    { storage: activityStorage, requestIdFactory: () => quizRequestId },
);
const changedAnswerRetry = getOrCreateQuizActivityRequest(
    { uid: 'user-1', progressKey: 'r2_d10', quizKey: 'quiz-1', attemptSlot: 1, selectedIndex: 3 },
    { storage: activityStorage, requestIdFactory: () => { throw new Error('must reuse'); } },
);
assert.equal(changedAnswerRetry.requestId, quizRequestId);
assert.equal(changedAnswerRetry.payload.selectedIndex, 0, '미확정 퀴즈 재전송은 최초 답을 보존해야 한다.');
assert.equal(changedAnswerRetry.payload.attemptSlot, 1, '미확정 퀴즈 재전송은 최초 시도 슬롯을 보존해야 한다.');
assert.equal(clearActivityRequest(firstQuizRequest, { storage: activityStorage }), true);
const secondQuizRequestId = '723e4567-e89b-42d3-a456-426614174000';
assert.equal(
    getOrCreateQuizActivityRequest(
        { uid: 'user-1', progressKey: 'r2_d10', quizKey: 'quiz-1', attemptSlot: 1, selectedIndex: 3 },
        { storage: activityStorage, requestIdFactory: () => secondQuizRequestId },
    ).requestId,
    secondQuizRequestId,
    '확정 성공 뒤에는 새 시도 requestId를 만들 수 있어야 한다.',
);
const skipRequestId = '823e4567-e89b-42d3-a456-426614174000';
const firstSkipRequest = getOrCreateQuizSkipActivityRequest(
    { uid: 'user-1', progressKey: 'r2_d10', quizKey: 'quiz-1' },
    { storage: activityStorage, requestIdFactory: () => skipRequestId },
);
assert.equal(
    getOrCreateQuizSkipActivityRequest(
        { uid: 'user-1', progressKey: 'r2_d10', quizKey: 'quiz-1' },
        { storage: activityStorage, requestIdFactory: () => { throw new Error('must reuse'); } },
    ).requestId,
    skipRequestId,
    '같은 퀴즈 건너뛰기는 저장된 requestId를 재사용해야 한다.',
);
assert.equal(clearActivityRequest(firstSkipRequest, { storage: activityStorage }), true);
const secondSkipRequestId = '923e4567-e89b-42d3-a456-426614174000';
assert.equal(
    getOrCreateQuizSkipActivityRequest(
        { uid: 'user-1', progressKey: 'r2_d10', quizKey: 'quiz-1' },
        { storage: activityStorage, requestIdFactory: () => secondSkipRequestId },
    ).requestId,
    secondSkipRequestId,
    '확정된 건너뛰기 뒤에는 새 requestId를 만들 수 있어야 한다.',
);
__resetActivityRequestFallbackForTests();
const recoveredRosterUser = updateRosterTalents(
    { uid: 'user-1', extraOrgs: [] },
    { Z_org: 12, a_org: 7 },
    { authoritative: true },
);
assert.deepEqual(
    recoveredRosterUser.extraOrgs.map(({ orgId, talent }) => ({ orgId, talent })),
    [{ orgId: 'Z_org', talent: 12 }, { orgId: 'a_org', talent: 7 }],
    '서버 명부 상태는 비어 있는 브라우저 캐시도 복구하고 코드포인트 순으로 정렬해야 한다.',
);
assert.equal(recoveredRosterUser.extraOrgs[0].rosterPath, 'churches/Z_org/roster/user-1');
assert.deepEqual(
    updateRosterTalents(
        { uid: 'user-1', extraOrgs: [{ orgId: 'keep', talent: 1 }, { orgId: 'change', talent: 2 }] },
        { change: 9 },
    ).extraOrgs,
    [{ orgId: 'keep', talent: 1 }, { orgId: 'change', talent: 9 }],
    '일반 부분 갱신은 응답에 없는 기존 명부 행을 제거하지 않아야 한다.',
);
for (const [cycle, day] of [[0, 1], [1.5, 1], [1, 0], [1, 366], [1, 2.5]]) {
    for (const action of [platformApi.previewReadCompletion, platformApi.completeRead]) {
        assert.throws(
            () => action(cycle, day),
            error => error instanceof platformApi.PlatformApiError
                && error.code === 'INVALID_PAYLOAD'
                && error.status === 0
                && error.retryable === false,
            `잘못된 읽기 범위(${cycle}, ${day})는 네트워크 요청 전에 거부해야 한다.`,
        );
    }
}

// 업적 서버 action은 canonical ID의 결정적 부분집합만 받아들이고, 2xx 본문의
// 키·echo·순서·중복·결과 boolean 조합 중 하나라도 어긋나면 fail-closed한다.
const achievementRequestId = 'a23e4567-e89b-42d3-a456-426614174000';
const validAchievementPayload = { trigger: 'read' };
const validAchievementResponse = {
    ok: true,
    action: 'syncAchievements',
    requestId: achievementRequestId,
    alreadyCompleted: false,
    committed: true,
    result: { trigger: 'read', newIds: ['first_read', 'score_100'] },
};
assert.deepEqual(
    platformApi.validateSyncAchievementsResponse(
        validAchievementPayload,
        validAchievementResponse,
        achievementRequestId,
    ),
    validAchievementResponse,
);
for (const validOutcome of [
    {
        ...validAchievementResponse,
        alreadyCompleted: true,
    },
    {
        ...validAchievementResponse,
        committed: false,
        result: { trigger: 'read', newIds: [] },
    },
]) {
    assert.deepEqual(
        platformApi.validateSyncAchievementsResponse(
            validAchievementPayload,
            validOutcome,
            achievementRequestId,
        ),
        validOutcome,
        '신규 commit·replay·무변경 결과의 세 가지 canonical 조합을 허용해야 한다.',
    );
}
const expectInvalidAchievementResponse = (mutate, label) => {
    const response = structuredClone(validAchievementResponse);
    mutate(response);
    assert.throws(
        () => platformApi.validateSyncAchievementsResponse(
            validAchievementPayload,
            response,
            achievementRequestId,
        ),
        error => error instanceof platformApi.PlatformApiError
            && error.code === 'INVALID_RESPONSE'
            && error.status === 200
            && error.retryable === true,
        label,
    );
};
for (const [label, mutate] of [
    ['extra top-level', response => { response.achievements = ['first_read']; }],
    ['extra result', response => { response.result.score = 100; }],
    ['wrong action', response => { response.action = 'completeRead'; }],
    ['wrong requestId echo', response => { response.requestId = readRequestId; }],
    ['wrong trigger echo', response => { response.result.trigger = 'memo'; }],
    ['unknown achievement', response => { response.result.newIds = ['unknown_badge']; }],
    ['duplicate achievement', response => { response.result.newIds = ['first_read', 'first_read']; }],
    ['non-canonical order', response => { response.result.newIds = ['score_100', 'first_read']; }],
    ['alreadyCompleted type', response => { response.alreadyCompleted = 0; }],
    ['committed type', response => { response.committed = 1; }],
    ['new IDs without commit', response => { response.committed = false; }],
    ['empty committed result', response => { response.result.newIds = []; }],
    ['uncommitted replay', response => {
        response.alreadyCompleted = true;
        response.committed = false;
    }],
    ['empty replay', response => {
        response.alreadyCompleted = true;
        response.result.newIds = [];
    }],
]) expectInvalidAchievementResponse(mutate, label);
for (const trigger of [undefined, null, '', 'quiz', 'READ', 1, {}]) {
    assert.throws(
        () => platformApi.syncAchievements(trigger),
        error => error instanceof platformApi.PlatformApiError
            && error.code === 'INVALID_PAYLOAD'
            && error.status === 0
            && error.retryable === false,
        `허용되지 않은 업적 trigger는 네트워크 전에 거부해야 한다: ${String(trigger)}`,
    );
}

// 개인 달란트 지갑 이관은 인증 uid·조직·금액을 payload로 받지 않으며,
// 명부 누락 no-write를 포함한 네 가지 canonical 멱등 결과 외의
// 2xx 본문은 모두 fail-closed한다.
assert.match(
    client,
    /callPlatformApi\('migratePersonalTalentWallet', \{\}, \{ \.\.\.options, requestId \}\)[\s\S]*validateMigratePersonalTalentWalletResponse\(result, requestId\)/,
    '개인 지갑 이관 payload는 정확히 빈 객체여야 한다.',
);
const walletMigrationRequestId = 'b23e4567-e89b-42d3-a456-426614174000';
const validWalletMigrationResponse = {
    ok: true,
    action: 'migratePersonalTalentWallet',
    requestId: walletMigrationRequestId,
    alreadyCompleted: false,
    committed: true,
    result: { status: 'migrated' },
};
for (const validOutcome of [
    validWalletMigrationResponse,
    { ...validWalletMigrationResponse, alreadyCompleted: true },
    {
        ...validWalletMigrationResponse,
        committed: false,
        result: { status: 'alreadyMigrated' },
    },
    {
        ...validWalletMigrationResponse,
        committed: false,
        result: { status: 'primaryMissing' },
    },
]) {
    assert.deepEqual(
        platformApi.validateMigratePersonalTalentWalletResponse(
            validOutcome,
            walletMigrationRequestId,
        ),
        validOutcome,
        '신규 이관·replay·이미 이관됨·기본 명부 누락의 canonical 조합만 허용해야 한다.',
    );
}
const expectInvalidWalletMigrationResponse = (mutate, label) => {
    const response = structuredClone(validWalletMigrationResponse);
    mutate(response);
    assert.throws(
        () => platformApi.validateMigratePersonalTalentWalletResponse(
            response,
            walletMigrationRequestId,
        ),
        error => error instanceof platformApi.PlatformApiError
            && error.code === 'INVALID_RESPONSE'
            && error.status === 200
            && error.retryable === true,
        label,
    );
};
for (const [label, mutate] of [
    ['extra top-level', response => { response.uid = 'user-1'; }],
    ['extra result', response => { response.result.orgId = 'church-1'; }],
    ['wrong action', response => { response.action = 'syncAchievements'; }],
    ['wrong requestId echo', response => { response.requestId = achievementRequestId; }],
    ['unknown status', response => { response.result.status = 'pending'; }],
    ['migrated without commit', response => { response.committed = false; }],
    ['alreadyMigrated with commit', response => { response.result.status = 'alreadyMigrated'; }],
    ['alreadyMigrated replay', response => {
        response.result.status = 'alreadyMigrated';
        response.alreadyCompleted = true;
        response.committed = false;
    }],
    ['primaryMissing with commit', response => {
        response.result.status = 'primaryMissing';
    }],
    ['primaryMissing replay', response => {
        response.result.status = 'primaryMissing';
        response.alreadyCompleted = true;
        response.committed = false;
    }],
]) expectInvalidWalletMigrationResponse(mutate, label);

// 혼자 읽기 공동체 참여도 인증 uid 외 권위 값을 payload로 받지 않고,
// 최소 status 응답의 canonical 멱등 조합만 허용한다.
assert.match(
    client,
    /callPlatformApi\('joinSoloCommunity', \{\}, \{ \.\.\.options, requestId \}\)[\s\S]*validateJoinSoloCommunityResponse\(result, requestId\)/,
    '혼자 읽기 참여 payload는 정확히 빈 객체여야 한다.',
);
const joinSoloRequestId = 'c23e4567-e89b-42d3-a456-426614174000';
const validJoinSoloResponse = {
    ok: true,
    action: 'joinSoloCommunity',
    requestId: joinSoloRequestId,
    alreadyCompleted: false,
    committed: true,
    result: { status: 'joined' },
};
for (const validOutcome of [
    validJoinSoloResponse,
    { ...validJoinSoloResponse, alreadyCompleted: true },
    { ...validJoinSoloResponse, result: { status: 'rosterRepaired' } },
    { ...validJoinSoloResponse, result: { status: 'primaryRepaired' } },
    {
        ...validJoinSoloResponse,
        committed: false,
        result: { status: 'alreadyJoined' },
    },
]) {
    assert.deepEqual(
        platformApi.validateJoinSoloCommunityResponse(validOutcome, joinSoloRequestId),
        validOutcome,
        'joinSoloCommunity canonical commit, replay, no-op 조합만 허용해야 한다.',
    );
}
for (const [label, mutate] of [
    ['extra top-level', response => { response.uid = 'user-1'; }],
    ['extra result', response => { response.result.orgId = 'unaffiliated_v1'; }],
    ['wrong action', response => { response.action = 'joinCommunity'; }],
    ['wrong requestId', response => { response.requestId = walletMigrationRequestId; }],
    ['unknown status', response => { response.result.status = 'pending'; }],
    ['commit status without commit', response => { response.committed = false; }],
    ['no-op with commit', response => { response.result.status = 'alreadyJoined'; }],
    ['no-op replay', response => {
        response.result.status = 'alreadyJoined';
        response.alreadyCompleted = true;
        response.committed = false;
    }],
]) {
    const response = structuredClone(validJoinSoloResponse);
    mutate(response);
    assert.throws(
        () => platformApi.validateJoinSoloCommunityResponse(response, joinSoloRequestId),
        error => error instanceof platformApi.PlatformApiError
            && error.code === 'INVALID_RESPONSE'
            && error.status === 200
            && error.retryable === true,
        label,
    );
}

const joinSoloClientStart = membershipCardSource.indexOf(
    'const joinSoloCommunity = async () => {',
);
const joinSoloClientEnd = membershipCardSource.indexOf(
    '\n    };',
    joinSoloClientStart,
) + 7;
assert.ok(joinSoloClientStart >= 0 && joinSoloClientEnd > joinSoloClientStart,
    '혼자 읽기 참여 client 구간이 필요하다.');
const joinSoloClient = membershipCardSource.slice(joinSoloClientStart, joinSoloClientEnd);
for (const pattern of [
    /auth\?\.currentUser\?\.uid !== requestUid/,
    /const requestGeneration = \{ uid: requestUid \}/,
    /soloJoinInFlightRef\.current !== requestGeneration/,
    /soloJoinInFlightRef\.current === requestGeneration/,
    /joinSoloCommunityViaApi\(\{ expectedUid: requestUid \}\)/,
    /loadCanonicalUserStateFromServer\(requestUid\)/,
    /validateJoinedSoloCommunityState/,
    /requireWalletSettled: true/,
    /isLatestCanonicalUserState\(requestUid, freshState\)/,
]) assert.match(joinSoloClient, pattern);
assert.doesNotMatch(
    joinSoloClient,
    /soloJoinInFlightRef\.current\s*[!=]==?\s*requestUid/,
    'UID 문자열 자체를 generation으로 쓰면 A-B-A 계정 전환에서 이전 응답이 다시 살아날 수 있다.',
);
assert.doesNotMatch(
    joinSoloClient,
    /db\.|firebase\.|\.set\(|\.update\(|runTransaction/,
    '혼자 읽기 참여 client가 users/roster를 직접 쓰면 안 된다.',
);
assert.match(
    membershipCardSource,
    /return \(\) => \{\s*soloJoinInFlightRef\.current = null;\s*\};\s*\}, \[currentUser\?\.uid\]\)/,
    '계정 전환 또는 unmount는 이전 solo 참여 generation을 폐기해야 한다.',
);

const walletMigrationHelperStart = helpersSource.indexOf(
    'export const migratePersonalTalentWalletIfNeeded = async (uid, primaryOrgId, knownUserData = null) => {',
);
const walletMigrationHelperEnd = helpersSource.indexOf('\n};', walletMigrationHelperStart) + 3;
assert.ok(walletMigrationHelperStart >= 0 && walletMigrationHelperEnd > walletMigrationHelperStart,
    '개인 지갑 이관 helper 구간이 필요하다.');
const walletMigrationHelper = helpersSource.slice(walletMigrationHelperStart, walletMigrationHelperEnd);
assert.ok(
    walletMigrationHelper.indexOf("auth?.currentUser?.uid !== requestUid")
        < walletMigrationHelper.indexOf("knownUserData && knownUserData.accountType !== 'personal'"),
    '계정 UID 검증은 모든 지갑 이관 early return보다 먼저 실행해야 한다.',
);
assert.match(walletMigrationHelper, /knownUserData && knownUserData\.accountType !== 'personal'/,
    '확실한 비개인 계정만 서버 호출을 생략해야 한다.');
assert.match(walletMigrationHelper, /knownUserData\?\.accountType === 'personal'[\s\S]*String\(knownUserData\.primaryOrgId \|\| primaryOrgId \|\| ''\)\.trim\(\)[\s\S]*if \(!hasKnownPrimaryOrg\) return null/,
    '공동체가 없는 혼자 읽기 개인 계정은 로그인 중 잘못된 이관 요청을 보내면 안 된다.');
assert.doesNotMatch(walletMigrationHelper, /talentWalletMigrated === true[\s\S]{0,200}return null/,
    '완료·0 잔액 힌트도 서버가 roster와 최신 환불 경합을 확인해야 한다.');
assert.match(walletMigrationHelper, /await migratePersonalTalentWalletViaApi\(\{\s*expectedUid: requestUid,?\s*\}\)/,
    'API 옵션으로 현재 인증 uid를 고정하되 payload 권위 값으로 보내면 안 된다.');
assert.match(
    walletMigrationHelper,
    /migrationResponse\.result\.status === 'primaryMissing'[\s\S]*userRef\.get\(\{ source: 'server' \}\)/,
    '기본 명부 누락은 API 응답을 상태 분기로만 쓰고 users를 source-server로 다시 확인해야 한다.',
);
for (const pattern of [
    /user\.role !== 'member'/,
    /user\.accountType !== 'personal'/,
    /!validDeletedState/,
    /user\.isDeleted === true/,
    /!validMigrationFlag/,
    /!isCanonicalOrgId\(user\.primaryOrgId\)/,
    /!Number\.isSafeInteger\(user\.talent\)/,
    /user\.talent < 0/,
    /user\.talent > MAX_TALENT_BALANCE/,
]) assert.match(walletMigrationHelper, pattern);
assert.doesNotMatch(
    walletMigrationHelper,
    /migrationResponse\.result\.(?:orgId|primaryOrgId|talent|balance)/,
    '명부 누락 로그인이 API 응답의 조직·잔액을 사용하면 안 된다.',
);
assert.match(walletMigrationHelper, /const userSnap = await transaction\.get\(userRef\)[\s\S]*const orgId = user\.primaryOrgId[\s\S]*const rosterSnap = await transaction\.get\(rosterRef\)/,
    'users와 그 문서의 primary roster를 같은 read-only transaction에서 읽어야 한다.');
for (const pattern of [
    /auth\?\.currentUser\?\.uid !== requestUid/,
    /user\.accountType !== 'personal'/,
    /user\.isDeleted === true/,
    /user\.talentWalletMigrated !== true/,
    /user\.talent !== 0/,
    /isCanonicalOrgId\(orgId\)/,
    /roster\.uid !== requestUid/,
    /Number\.isSafeInteger\(roster\.talent\)/,
    /return \{ orgId, talent: roster\.talent \}/,
]) assert.match(walletMigrationHelper, pattern);
assert.doesNotMatch(walletMigrationHelper, /transaction\.(?:set|update|delete)\(/,
    '브라우저 helper가 개인 지갑 이관 쓰기를 직접 수행하면 안 된다.');
assert.doesNotMatch(walletMigrationHelper, /migratePersonalTalentWalletViaApi\(\{[^}]+(?:uid|orgId|talent|primaryOrgId)/,
    '브라우저 힌트의 지갑·조직 상태를 API payload 권위로 보내면 안 된다.');
assert.match(useAuthSource, /talent: 0,[\s\S]*talentWalletMigrated: true/,
    '이관 후 users 지갑 상태는 검증된 canonical 결과에 맞춰 적용해야 한다.');
const sessionWalletMigrationIndex = useUserAuthSource.indexOf(
    'const walletMigration = await migratePersonalTalentWalletIfNeeded(',
);
const sessionPositionAuditIndex = useUserAuthSource.indexOf(
    'positionAudit = await normalizeLegacyReadingPosition({',
);
const sessionRosterRefreshIndex = useUserAuthSource.indexOf(
    'sessionPatch.extraOrgs = await loadUserExtraOrgs(firebaseUser.uid, {',
);
assert.ok(
    sessionWalletMigrationIndex >= 0
        && sessionWalletMigrationIndex < sessionPositionAuditIndex
        && sessionPositionAuditIndex < sessionRosterRefreshIndex,
    '세션 상세 갱신은 primary legacy 지갑 보정 뒤 진도 감사, 최종 명부 재조회 순서여야 한다.',
);
assert.match(
    useUserAuthSource.slice(sessionRosterRefreshIndex, sessionRosterRefreshIndex + 180),
    /source: 'server'/,
    '세션 복원의 최종 명부는 server action 이전에 시작한 stale query가 아닌 source-server여야 한다.',
);
assert.doesNotMatch(
    useUserAuthSource,
    /const extraOrgsPromise = loadUserExtraOrgs/,
    '세션 복원에서 server action 전에 명부 query를 미리 시작하면 안 된다.',
);
assert.match(
    useUserAuthSource,
    /if \(localUserNeedsNormalization\) \{[\s\S]*await loadSessionDetails\(\)[\s\S]*\} else \{[\s\S]*setCurrentUser\(user\);[\s\S]*setAuthLoading\(false\);[\s\S]*void loadSessionDetails\(\)/,
    '정상 진도 계정은 상세 감사 전에 화면을 열고, 보정 필요 계정만 상세 확인을 기다려야 한다.',
);
assert.match(
    useUserAuthSource,
    /if \(current\?\.uid !== firebaseUser\.uid\) return current;[\s\S]*const progressUnchanged = current\.currentDay === user\.currentDay[\s\S]*const nextUser = \{ \.\.\.current \};[\s\S]*current\.extraOrgs === user\.extraOrgs[\s\S]*current\.primaryOrgId === user\.primaryOrgId[\s\S]*if \(progressUnchanged[\s\S]*nextUser\.currentDay = sessionPatch\.currentDay/,
    '비차단 상세 갱신은 같은 uid의 바뀌지 않은 진도·소속 필드에만 합쳐야 한다.',
);
assert.doesNotMatch(useUserAuthSource, /진정희|user\.name\s*===\s*['"][^'"]+['"][\s\S]{0,300}readCount/,
    '특정 이름만으로 운영 진도·완독 횟수를 자동 보정하는 writer가 남으면 안 된다.');
assert.doesNotMatch(useDepartmentSource, /changeSubgroup|collection\('users'\)[\s\S]{0,200}subgroupId/,
    '진입점 없는 레거시 소그룹 직접 users writer가 남으면 안 된다.');
assert.doesNotMatch(appSource, /showSubgroupChange|changeSubgroup=/,
    '죽은 소그룹 변경 모달 상태·prop을 다시 연결하면 안 된다.');
assert.equal(exists('src/components/modals/SubgroupChangeModal.jsx'), false,
    '고정 기본 조직을 쓰는 죽은 소그룹 변경 모달은 제거되어야 한다.');

// 최초 교인 온보딩은 plan과 선택 ID만 서버에 보내고 조직명은 서버가 파생한다.
assert.match(client, /callPlatformApi\('completeMemberOnboarding', payload, \{ \.\.\.options, requestId \}\)[\s\S]*validateCompleteMemberOnboardingResponse\(payload, result, requestId\)/,
    '최초 온보딩은 strict 서버 action과 응답 검증을 거쳐야 한다.');
const onboardingRequestId = 'd23e4567-e89b-42d3-a456-426614174000';
const onboardingPayload = {
    orgId: 'church-1',
    planId: '1year_revised',
    departmentId: 'adult',
    subgroupId: 'cell-1',
};
const validOnboardingResponse = {
    ok: true,
    action: 'completeMemberOnboarding',
    requestId: onboardingRequestId,
    alreadyCompleted: false,
    committed: true,
    result: {
        status: 'completed',
        ...onboardingPayload,
        departmentName: '장년부',
        subgroupName: '1구역',
    },
};
for (const validOutcome of [
    validOnboardingResponse,
    { ...validOnboardingResponse, alreadyCompleted: true },
    {
        ...validOnboardingResponse,
        committed: false,
        result: { ...validOnboardingResponse.result, status: 'alreadyCompleted' },
    },
]) {
    assert.deepEqual(
        platformApi.validateCompleteMemberOnboardingResponse(
            onboardingPayload,
            validOutcome,
            onboardingRequestId,
        ),
        validOutcome,
    );
}
const expectInvalidOnboardingResponse = (mutate, label) => {
    const response = structuredClone(validOnboardingResponse);
    mutate(response);
    assert.throws(
        () => platformApi.validateCompleteMemberOnboardingResponse(
            onboardingPayload,
            response,
            onboardingRequestId,
        ),
        error => error instanceof platformApi.PlatformApiError
            && error.code === 'INVALID_RESPONSE'
            && error.status === 200
            && error.retryable === true,
        label,
    );
};
for (const [label, mutate] of [
    ['extra top-level', response => { response.uid = 'forged'; }],
    ['extra result', response => { response.result.role = 'churchAdmin'; }],
    ['wrong org', response => { response.result.orgId = 'other'; }],
    ['wrong plan', response => { response.result.planId = 'nt_new'; }],
    ['wrong department', response => { response.result.departmentId = 'kids'; }],
    ['wrong subgroup', response => { response.result.subgroupId = 'cell-2'; }],
    ['unsafe name', response => { response.result.departmentName = ' 장년부'; }],
    ['empty department name', response => { response.result.departmentName = ''; }],
    ['empty subgroup mismatch', response => { response.result.subgroupName = ''; }],
    ['completed without commit', response => { response.committed = false; }],
    ['no-op replay', response => {
        response.result.status = 'alreadyCompleted';
        response.alreadyCompleted = true;
        response.committed = false;
    }],
]) expectInvalidOnboardingResponse(mutate, label);
assert.match(appSource, /await completeMemberOnboarding\(\{[\s\S]*orgId,[\s\S]*planId,[\s\S]*departmentId,[\s\S]*subgroupId,[\s\S]*\}, \{ expectedUid: requestUid \}\)/,
    '온보딩 UI는 서버 action에 인증 UID를 결속해야 한다.');
assert.match(appSource, /completeMemberOnboarding[\s\S]*\.get\(\{ source: 'server' \}\)[\s\S]*stored\.planId !== membership\.planId[\s\S]*stored\.subgroupName !== membership\.subgroupName/,
    '성공 뒤 users source-server 상태를 exact membership과 대조해야 한다.');
const onboardingHandlerStart = appSource.indexOf('const handleSubgroupSelect = async');
const onboardingHandlerEnd = appSource.indexOf('\n    };', onboardingHandlerStart) + 7;
const onboardingHandler = appSource.slice(onboardingHandlerStart, onboardingHandlerEnd);
assert.doesNotMatch(onboardingHandler, /\.set\(|\.update\(|runTransaction/,
    '최초 온보딩 UI가 users 소속을 직접 쓰면 안 된다.');
assert.match(planSelectionSource, /handleSubgroupSelect\(''\)/,
    '소그룹이 없는 부서는 서버 canonical 빈 subgroup ID로 완료해야 한다.');
for (const source of [appSource, useAuthSource]) {
    assert.match(source, /role === 'churchAdmin'[\s\S]*onboardingPending === true[\s\S]*!user\?\.departmentId \|\| typeof user\?\.subgroupId !== 'string'/,
        '신규 관리자 marker와 일반 회원의 빈 subgroup 완료 상태를 분리해야 한다.');
}
assert.match(useAuthSource, /completeChurchAdminSignupViaApi\(\{[\s\S]*password: signupPassword,[\s\S]*consent,[\s\S]*expectedUid: authUser\.uid/,
    '이메일·Google 관리자 가입은 같은 서버 action을 사용해야 한다.');
assert.match(churchAdminSignupService, /role: "churchAdmin",[\s\S]*planId: null,[\s\S]*onboardingPending: true,[\s\S]*departmentId: null,[\s\S]*departmentName: null,[\s\S]*subgroupId: null/,
    '서버가 신규 공동체 관리자 문서를 재개 가능한 pending 상태로 만들어야 한다.');
const usersCreateStart = firestoreRules.indexOf("allow create: if isRealUser() && request.auth.uid == uid &&");
const usersCreateEnd = firestoreRules.indexOf('// 본인 수정은', usersCreateStart);
assert.ok(usersCreateStart >= 0 && usersCreateEnd > usersCreateStart,
    'users 최초 생성 rules 구간이 필요하다.');
const usersCreateRules = firestoreRules.slice(usersCreateStart, usersCreateEnd);
assert.match(usersCreateRules, /request\.resource\.data\.role == 'member'[\s\S]*request\.resource\.data\.churchId == 'unaffiliated_v1'/,
    '브라우저 users create는 기존 무소속 성도 호환 경로로만 제한해야 한다.');
assert.doesNotMatch(usersCreateRules, /role == 'churchAdmin'/,
    '공동체 관리자 users 문서는 completeChurchAdminSignup 서버만 생성해야 한다.');
for (const field of ['departmentId', 'departmentName', 'subgroupId', 'subgroupName']) {
    const emptyField = new RegExp(`request\\.resource\\.data\\.get\\('${field}', null\\) == null`);
    assert.match(usersCreateRules, emptyField,
        `무소속 성도 create는 ${field}를 직접 seed할 수 없어야 한다.`);
}
assert.match(usersCreateRules, /request\.resource\.data\.get\('score', 0\) == 0/,
    '브라우저 users create는 초기 score를 seed할 수 없어야 한다.');
assert.match(usersCreateRules, /request\.resource\.data\.get\('talent', 0\) == 0/,
    '브라우저 users create는 초기 talent를 seed할 수 없어야 한다.');
assert.match(usersCreateRules, /request\.resource\.data\.get\('talentMigrated', false\) == true/,
    '신규 users는 legacy false→true 이관 예외를 재사용할 수 없게 시작해야 한다.');
assert.match(usersCreateRules, /request\.resource\.data\.extraMemberships is list[\s\S]*extraMemberships\.size\(\) == 0/,
    '신규 users는 추가 소속을 create payload로 seed할 수 없어야 한다.');
assert.match(appSource, /requestUser\.role === 'churchAdmin' && stored\.onboardingPending !== false/,
    '관리자 온보딩 성공은 서버가 pending marker를 닫은 상태까지 확인해야 한다.');
assert.match(appSource, /memberOnboardingRequestRef\.current[\s\S]*finally[\s\S]*memberOnboardingRequestRef\.current = null/,
    '최초 소속 제출은 한 번에 하나만 진행해야 한다.');
assert.doesNotMatch(planSelectionSource, /DEFAULT_DEPARTMENTS/,
    '조직 로드 실패를 임의 기본 부서로 대체하면 서버와 선택지가 어긋난다.');
assert.deepEqual(normalizeOnboardingOrganizations([
    '청년부',
    { name: '장년부', subgroups: ['1구역', { name: '2구역' }] },
    { id: 'kids', name: '어린이부' },
]), [
    { id: '청년부', name: '청년부', subgroups: [] },
    {
        id: '장년부', name: '장년부',
        subgroups: [{ id: '1구역', name: '1구역' }, { id: '2구역', name: '2구역' }],
    },
    { id: 'kids', name: '어린이부', subgroups: [] },
]);
assert.throws(() => normalizeOnboardingOrganizations(['a/b']));
assert.throws(() => normalizeOnboardingOrganizations(['중복', { name: '중복' }]));

// currentDay > 365 legacy 보정은 빈 payload의 서버 action만 호출하고,
// source-server users 문서 확인 전에는 로컬 진도를 바꾸지 않는다.
assert.match(
    client,
    /callPlatformApi\('normalizeLegacyReadingPosition', \{\}, \{ \.\.\.options, requestId \}\)[\s\S]*validateNormalizeLegacyReadingPositionResponse\(result, requestId\)/,
    'legacy 진도 보정 payload는 정확히 빈 객체여야 한다.',
);
const normalizePositionRequestId = 'c23e4567-e89b-42d3-a456-426614174000';
const validNormalizePositionResponse = {
    ok: true,
    action: 'normalizeLegacyReadingPosition',
    requestId: normalizePositionRequestId,
    alreadyCompleted: false,
    committed: true,
    result: { status: 'normalized', currentDay: 1, readCount: 4 },
};
for (const validOutcome of [
    validNormalizePositionResponse,
    { ...validNormalizePositionResponse, alreadyCompleted: true },
    {
        ...validNormalizePositionResponse,
        committed: false,
        result: { status: 'alreadyNormalized', currentDay: 365, readCount: 3 },
    },
]) {
    assert.deepEqual(
        platformApi.validateNormalizeLegacyReadingPositionResponse(
            validOutcome,
            normalizePositionRequestId,
        ),
        validOutcome,
        '신규 보정·replay·fresh no-op의 canonical 조합만 허용해야 한다.',
    );
}
const expectInvalidNormalizePositionResponse = (mutate, label) => {
    const response = structuredClone(validNormalizePositionResponse);
    mutate(response);
    assert.throws(
        () => platformApi.validateNormalizeLegacyReadingPositionResponse(
            response,
            normalizePositionRequestId,
        ),
        error => error instanceof platformApi.PlatformApiError
            && error.code === 'INVALID_RESPONSE'
            && error.status === 200
            && error.retryable === true,
        label,
    );
};
for (const [label, mutate] of [
    ['extra top-level', response => { response.uid = 'user-1'; }],
    ['extra result', response => { response.result.orgId = 'church-1'; }],
    ['wrong action', response => { response.action = 'completeRead'; }],
    ['wrong requestId echo', response => { response.requestId = walletMigrationRequestId; }],
    ['unknown status', response => { response.result.status = 'pending'; }],
    ['normalized without commit', response => { response.committed = false; }],
    ['no-op with commit', response => { response.result.status = 'alreadyNormalized'; }],
    ['no-op replay', response => {
        response.result.status = 'alreadyNormalized';
        response.alreadyCompleted = true;
        response.committed = false;
    }],
    ['day zero', response => { response.result.currentDay = 0; }],
    ['day overflow', response => { response.result.currentDay = 366; }],
    ['unsafe readCount', response => { response.result.readCount = Number.MAX_SAFE_INTEGER + 1; }],
]) expectInvalidNormalizePositionResponse(mutate, label);

const normalizePositionStart = useUserAuthSource.indexOf(
    'const localUserNeedsNormalization = Boolean(',
);
const normalizePositionEnd = useUserAuthSource.indexOf(
    '\n                                sessionPatch.extraOrgs =',
    normalizePositionStart,
);
assert.ok(
    normalizePositionStart >= 0 && normalizePositionEnd > normalizePositionStart,
    'useUserAuth legacy 진도 보정 구간이 필요하다.',
);
const normalizePositionClient = useUserAuthSource.slice(normalizePositionStart, normalizePositionEnd);
for (const pattern of [
    /const localUserNeedsNormalization = Boolean\([\s\S]*user\.currentDay > 365/,
    /positionAudit = await normalizeLegacyReadingPosition\(\{[\s\S]*expectedUid: firebaseUser\.uid/,
    /if \(discardStaleEvent\(\)\) return/,
    /localUserNeedsNormalization[\s\S]*!isRecoverableReadingPositionAuditError\(positionAuditError\)[\s\S]*throw positionAuditError/,
    /console\.error\('canonical roster 진도 감사 실패:', positionAuditError\)/,
    /positionAudit[\s\S]*localUserNeedsNormalization \|\| positionAudit\.committed/,
    /\.get\(\{ source: 'server' \}\)/,
    /Number\.isSafeInteger\(normalizedData\.currentDay\)/,
    /normalizedData\.currentDay > 365/,
    /Number\.isSafeInteger\(normalizedData\.readCount\)/,
    /sessionPatch\.currentDay = normalizedData\.currentDay/,
    /sessionPatch\.readCount = normalizedData\.readCount/,
]) assert.match(normalizePositionClient, pattern);
assert.match(
    useUserAuthSource,
    /const isRecoverableReadingPositionAuditError = error => \{[\s\S]*error\?\.code === 'CONFLICT'[\s\S]*error\?\.retryable === true[\s\S]*status === 0 \|\| status >= 500/,
    '정상 users의 roster 감사는 경합과 retryable 네트워크·5xx 실패를 로그인과 분리해야 한다.',
);
assert.ok(
    normalizePositionClient.indexOf('await normalizeLegacyReadingPosition')
        < normalizePositionClient.indexOf('sessionPatch.currentDay = normalizedData.currentDay'),
    '서버 보정과 source-server 검증 전에 로컬 currentDay를 선반영하면 안 된다.',
);
assert.doesNotMatch(
    normalizePositionClient,
    /\.update\(|\.set\(|runTransaction|Math\.floor|extraDays|extraRounds|needsUpdate/,
    'useUserAuth가 legacy 진도를 직접 계산하거나 Firestore에 쓰면 안 된다.',
);

// 매일 영상은 익명 Firebase 게스트도 인증형 API를 사용하고, 브라우저가 2xx 본문을
// 그대로 신뢰하지 않도록 식별자·날짜·URL·중첩 필드를 모두 fail-closed 검증한다.
assert.match(
    client,
    /const requestId = options\.requestId \|\| createRequestId\(\);[\s\S]*callPlatformApi\('resolveDailyVideo', \{\}, \{ \.\.\.options, requestId, timeoutMs \}\)[\s\S]*validateDailyVideoResolveResponse\(result, requestId\)/,
);
assert.match(client, /const DAILY_VIDEO_TIMEOUT_MS = 70_000/);
assert.doesNotMatch(client, /callPlatformApiPublic\('resolveDailyVideo'/);

const dailyVideoRequestId = '323e4567-e89b-42d3-a456-426614174000';
const manualDailyVideoPayload = {
    adult: {
        url: 'https://youtu.be/M1234567890',
        chapters: [{ label: '해설', sec: 0 }, { label: '기도', sec: 600 }],
        title: '관리자 수동 영상',
    },
    kids: null,
    autoFilled: false,
};
const validDailyVideoResponse = {
    ok: true,
    action: 'resolveDailyVideo',
    requestId: dailyVideoRequestId,
    serviceDate: '2026-07-15',
    video: manualDailyVideoPayload,
    transient: null,
    pending: false,
};
assert.deepEqual(
    platformApi.validateDailyVideoResolveResponse(validDailyVideoResponse, dailyVideoRequestId),
    validDailyVideoResponse,
);

for (const hostUrl of [
    'https://youtube.com/watch?v=M1234567890',
    'https://www.youtube.com/live/M1234567890',
    'https://youtu.be/M1234567890',
    'https://www.youtu.be/M1234567890',
]) {
    const response = structuredClone(validDailyVideoResponse);
    response.video.adult.url = hostUrl;
    assert.equal(
        platformApi.validateDailyVideoResolveResponse(response, dailyVideoRequestId).video.adult.url,
        hostUrl,
    );
}

const pendingDailyVideoResponse = {
    ...validDailyVideoResponse,
    video: {
        adult: { ...manualDailyVideoPayload.adult, matchedDate: true },
        kids: null,
        autoFilled: true,
    },
    transient: {
        adult: { ...manualDailyVideoPayload.adult, matchedDate: true },
        kids: {
            url: 'https://youtu.be/K1234567890',
            chapters: [{ label: '성경읽기', sec: 120 }],
            matchedDate: true,
        },
        autoFilled: true,
    },
    pending: true,
    retryAfterMs: 1_800_000,
};
assert.equal(
    platformApi.validateDailyVideoResolveResponse(pendingDailyVideoResponse, dailyVideoRequestId).retryAfterMs,
    1_800_000,
);

const expectInvalidDailyVideoResponse = (mutate, label) => {
    const response = structuredClone(validDailyVideoResponse);
    mutate(response);
    assert.throws(
        () => platformApi.validateDailyVideoResolveResponse(response, dailyVideoRequestId),
        error => error instanceof platformApi.PlatformApiError
            && error.code === 'INVALID_RESPONSE'
            && error.status === 200
            && error.retryable === true,
        label,
    );
};

for (const [label, mutate] of [
    ['ok', response => { response.ok = false; }],
    ['action', response => { response.action = 'preflight'; }],
    ['requestId', response => { response.requestId = 'wrong'; }],
    ['calendar date', response => { response.serviceDate = '2026-02-31'; }],
    ['extra top-level', response => { response.apiKey = 'secret'; }],
    ['pending without retry', response => { response.pending = true; }],
    ['retry on complete', response => { response.retryAfterMs = 1000; }],
    ['non-null complete transient', response => { response.transient = manualDailyVideoPayload; }],
    ['manual video with transient', response => {
        response.pending = true;
        response.retryAfterMs = 1000;
        response.transient = pendingDailyVideoResponse.transient;
    }],
    ['empty payload', response => { response.video = { adult: null, kids: null, autoFilled: false }; }],
    ['auto without matched date', response => { response.video.autoFilled = true; }],
    ['nested private field', response => { response.video.leaseOwner = 'owner'; }],
    ['unknown chapter', response => { response.video.adult.chapters[0].label = '광고'; }],
    ['duplicate chapter', response => { response.video.adult.chapters[1].label = '해설'; }],
    ['negative chapter', response => { response.video.adult.chapters[0].sec = -1; }],
    ['fraction chapter', response => { response.video.adult.chapters[0].sec = 1.5; }],
    ['chapter extra field', response => { response.video.adult.chapters[0].url = 'secret'; }],
]) expectInvalidDailyVideoResponse(mutate, label);

for (const unsafeUrl of [
    'http://youtube.com/watch?v=M1234567890',
    'https://user:pass@youtube.com/watch?v=M1234567890',
    'https://youtube.com:443/watch?v=M1234567890',
    'https://youtube.com.evil.example/watch?v=M1234567890',
    'https://youtu.be.evil.example/M1234567890',
    'https://m.youtube.com/watch?v=M1234567890',
    'https://youtube.com./watch?v=M1234567890',
    ' https://youtu.be/M1234567890',
]) {
    expectInvalidDailyVideoResponse(
        response => { response.video.adult.url = unsafeUrl; },
        `unsafe daily video URL: ${unsafeUrl}`,
    );
}

// 플랫폼 관리자 미리보기도 인증형 API만 사용하며, 입력 재생목록과 2xx 응답을
// 모두 엄격히 검증한다. 날짜와 YouTube 결과는 브라우저가 계산하지 않는다.
const adminPreviewStart = client.indexOf('export const adminPreviewDailyVideo =');
const adminPreviewEnd = client.indexOf('\nexport const issueJoinTicket =', adminPreviewStart);
assert.ok(adminPreviewStart >= 0 && adminPreviewEnd > adminPreviewStart, '관리자 매일 영상 미리보기 wrapper가 필요하다.');
const adminPreviewClient = client.slice(adminPreviewStart, adminPreviewEnd);
for (const pattern of [
    /if \(!isResponseRecord\(input\)\)/,
    /const \{ adultPlaylistId, kidsPlaylistId = '', \.\.\.unknownFields \} = input/,
    /Object\.keys\(unknownFields\)\.length > 0/,
    /DAILY_VIDEO_PLAYLIST_ID_PATTERN\.test\(normalizedAdultPlaylistId\)/,
    /adultPlaylistId: normalizedAdultPlaylistId/,
    /kidsPlaylistId: normalizedKidsPlaylistId/,
    /const requestId = options\.requestId \|\| createRequestId\(\)/,
    /: DAILY_VIDEO_TIMEOUT_MS/,
    /callPlatformApi\('adminPreviewDailyVideo', payload, \{ \.\.\.options, requestId, timeoutMs \}\)/,
    /validateAdminDailyVideoPreviewResponse\(payload, result, requestId\)/,
]) assert.match(adminPreviewClient, pattern);
assert.doesNotMatch(adminPreviewClient, /callPlatformApiPublic|\bfetch\s*\(/, '관리자 미리보기는 인증 API 경계만 사용해야 한다.');
assert.match(client, /const DAILY_VIDEO_TIMEOUT_MS = 70_000/, '관리자 미리보기는 서버 YouTube 조회를 위해 70초 제한을 사용해야 한다.');

const adminPreviewRequestId = '423e4567-e89b-42d3-a456-426614174000';
const adminPreviewPayload = {
    adultPlaylistId: 'PLadult_123',
    kidsPlaylistId: 'PLkids_456',
};
const adminPreviewAdult = {
    url: 'https://youtu.be/A1234567890',
    chapters: [{ label: '해설', sec: 0 }, { label: '기도', sec: 720 }],
    title: '7월 15일 성인 매일 영상',
    matchedDate: true,
};
const validAdminPreviewResponse = {
    ok: true,
    action: 'adminPreviewDailyVideo',
    requestId: adminPreviewRequestId,
    serviceDate: '2026-07-15',
    previews: {
        adult: adminPreviewAdult,
        kids: null,
    },
};
assert.deepEqual(
    platformApi.validateAdminDailyVideoPreviewResponse(
        adminPreviewPayload,
        validAdminPreviewResponse,
        adminPreviewRequestId,
    ),
    validAdminPreviewResponse,
);
const allRequestedMissing = {
    ...validAdminPreviewResponse,
    previews: { adult: null, kids: null },
};
assert.deepEqual(
    platformApi.validateAdminDailyVideoPreviewResponse(
        adminPreviewPayload,
        allRequestedMissing,
        adminPreviewRequestId,
    ),
    allRequestedMissing,
    '요청한 재생목록에 당일 영상이 없으면 모드별 null은 정상 응답이어야 한다.',
);
const adultOnlyPreviewPayload = { adultPlaylistId: 'PLadult_123', kidsPlaylistId: '' };
assert.deepEqual(
    platformApi.validateAdminDailyVideoPreviewResponse(
        adultOnlyPreviewPayload,
        allRequestedMissing,
        adminPreviewRequestId,
    ).previews,
    { adult: null, kids: null },
    '요청하지 않은 어린이 모드는 null이어야 한다.',
);

const expectInvalidAdminPreviewResponse = (
    mutate,
    label,
    payload = adminPreviewPayload,
) => {
    const response = structuredClone(validAdminPreviewResponse);
    mutate(response);
    assert.throws(
        () => platformApi.validateAdminDailyVideoPreviewResponse(payload, response, adminPreviewRequestId),
        error => error instanceof platformApi.PlatformApiError
            && error.code === 'INVALID_RESPONSE'
            && error.status === 200
            && error.retryable === true,
        label,
    );
};

for (const [label, mutate] of [
    ['ok', response => { response.ok = false; }],
    ['action', response => { response.action = 'resolveDailyVideo'; }],
    ['requestId echo', response => { response.requestId = 'wrong'; }],
    ['calendar date', response => { response.serviceDate = '2026-02-31'; }],
    ['extra top-level', response => { response.apiKey = 'secret'; }],
    ['previews array', response => { response.previews = []; }],
    ['previews null', response => { response.previews = null; }],
    ['extra preview mode', response => { response.previews.private = null; }],
    ['missing adult mode', response => { delete response.previews.adult; }],
    ['missing kids mode', response => { delete response.previews.kids; }],
    ['nested private field', response => { response.previews.adult.leaseOwner = 'owner'; }],
    ['missing matchedDate', response => { delete response.previews.adult.matchedDate; }],
    ['false matchedDate', response => { response.previews.adult.matchedDate = false; }],
    ['invalid title', response => { response.previews.adult.title = 123; }],
    ['invalid publishedAt', response => { response.previews.adult.publishedAt = 'not-a-date'; }],
]) expectInvalidAdminPreviewResponse(mutate, label);

for (const unsafeUrl of [
    'http://youtube.com/watch?v=A1234567890',
    'https://user:pass@youtube.com/watch?v=A1234567890',
    'https://youtube.com:443/watch?v=A1234567890',
    'https://youtube.com.evil.example/watch?v=A1234567890',
    'https://youtu.be.evil.example/A1234567890',
    'https://m.youtube.com/watch?v=A1234567890',
    'https://youtube.com./watch?v=A1234567890',
    ' https://youtu.be/A1234567890',
]) {
    expectInvalidAdminPreviewResponse(
        response => { response.previews.adult.url = unsafeUrl; },
        `unsafe admin preview URL: ${unsafeUrl}`,
    );
}
expectInvalidAdminPreviewResponse(
    response => {
        response.previews.kids = {
            url: 'https://youtu.be/K1234567890',
            chapters: [],
            matchedDate: true,
        };
    },
    'unrequested kids preview',
    adultOnlyPreviewPayload,
);

for (const invalidInput of [
    null,
    [],
    {},
    { adultPlaylistId: '' },
    { adultPlaylistId: 'https://youtube.com/playlist?list=PLadult_123' },
    { adultPlaylistId: 'bad/id' },
    { adultPlaylistId: 'P'.repeat(201) },
    { adultPlaylistId: 'PLadult_123', kidsPlaylistId: 'bad/id' },
    { adultPlaylistId: 'PLadult_123', kidsPlaylistId: 'PLkids_456', apiKey: 'secret' },
    { adultPlaylistId: 'PLadult_123', serviceDate: '2026-07-15' },
    { adultPlaylistId: 'PLadult_123', enabled: true },
    { adultPlaylistId: 'PLadult_123', extra: true },
]) {
    assert.throws(
        () => platformApi.adminPreviewDailyVideo(invalidInput),
        error => error instanceof platformApi.PlatformApiError
            && error.code === 'INVALID_PAYLOAD'
            && error.status === 0
            && error.retryable === false,
        `잘못된 관리자 미리보기 입력은 네트워크 전에 거부해야 한다: ${JSON.stringify(invalidInput)}`,
    );
}

// 결정적 action 뒤에는 응답 snapshot을 merge하지 않는다. server query로 찾은
// canonical roster 경로와 users 문서를 같은 read-only transaction에서 읽고,
// query 전후 membership 경로가 안정된 경우에만 base currentUser를 만든다.
for (const pattern of [
    /import\s*\{\s*userDocToState\s*\}\s*from\s*['"]\.\/helpers['"]/,
    /loadCanonicalRosterRefsFromServer/,
    /strictCanonicalRosterEntries/,
    /rosterSnapshotToExtraOrgs/,
    /const MAX_CANONICAL_ROSTERS = 3/,
    /const MAX_MEMBERSHIP_SNAPSHOT_ATTEMPTS = 3/,
    /for \(let attempt = 0; attempt < MAX_MEMBERSHIP_SNAPSHOT_ATTEMPTS; attempt \+= 1\)/,
    /const discoveredBefore = await discoverCanonicalRosters\(normalizedUid\)/,
    /dbInstance\.runTransaction\(async transaction =>/,
    /transaction\.get\(userRef\)/,
    /\.\.\.discoveredBefore\.map\(entry => transaction\.get\(entry\.ref\)\)/,
    /const discoveredAfter = await discoverCanonicalRosters\(normalizedUid\)/,
    /sameRosterPaths\(expectedPaths, rosterPaths\(discoveredAfter\)\)/,
    /throw new Error\(['"]user state sync unstable membership['"]\)/,
    /latestSyncGenerationByUid\.set\(normalizedUid, generation\)/,
    /stateSyncGeneration\.set\(state, \{ uid:\s*normalizedUid, generation \}\)/,
    /export const isLatestCanonicalUserState =/,
    /const state = \{ \.\.\.transactionState\.user, extraOrgs: transactionState\.extraOrgs \}[\s\S]*return state/,
]) assert.match(userStateSync, pattern);
assert.doesNotMatch(
    userStateSync,
    /\.doc\(normalizedUid\)\.get\(\{ source:\s*['"]server['"] \}\)/,
    'users와 roster를 독립 server read로 조합하면 hybrid snapshot이 될 수 있다.',
);
const canonicalSyncTransactionStart = userStateSync.indexOf('transactionState = await dbInstance.runTransaction(async transaction => {');
const canonicalSyncTransactionEnd = userStateSync.indexOf('const discoveredAfter =', canonicalSyncTransactionStart);
assert.ok(
    canonicalSyncTransactionStart >= 0 && canonicalSyncTransactionEnd > canonicalSyncTransactionStart,
    'canonical user state read-only transaction 구간이 필요하다.',
);
assert.doesNotMatch(
    userStateSync.slice(canonicalSyncTransactionStart, canonicalSyncTransactionEnd),
    /transaction\.(?:set|update|delete)\(/,
    'canonical user state transaction은 읽기 전용이어야 한다.',
);
assert.match(rosterClient, /query\.get\(\{ source:\s*['"]server['"] \}\)/);
assert.match(rosterClient, /export const loadCanonicalRosterRefsFromServer = async/);
assert.match(rosterClient, /strictCanonicalRosterEntries\(snapshot, normalizedUid, MAX_CANONICAL_USER_ORGS\)/);
assert.match(rosterClient, /\.get\(\{ source:\s*['"]server['"] \}\)/);
assert.match(rosterClient, /requestKey = `\$\{normalizedUid\}:\$\{maxOrgs\}:\$\{source\}`/);
assert.match(rosterClient, /const shouldDedupe = source !== ['"]server['"]/);
assert.match(rosterClient, /if \(shouldDedupe\) rosterLoadPromises\.set\(requestKey, loadPromise\)/);
assert.match(userBibleActions, /import\s*\{[^}]*isLatestCanonicalUserState[^}]*loadCanonicalUserStateFromServer[^}]*\}\s*from\s*['"]\.\.\/utils\/userStateSync['"]/);
const syncLatestUserStart = userBibleActions.indexOf('const syncLatestUser = useCallback(async (uid) => {');
const syncLatestUserEnd = userBibleActions.indexOf('const checkAchievements = useCallback(', syncLatestUserStart);
assert.ok(syncLatestUserStart >= 0 && syncLatestUserEnd > syncLatestUserStart, 'fresh user sync helper가 필요하다.');
const syncLatestUserContract = userBibleActions.slice(syncLatestUserStart, syncLatestUserEnd);
assert.match(syncLatestUserContract, /await loadCanonicalUserStateFromServer\(uid\)/);
assert.match(syncLatestUserContract, /isLatestCanonicalUserState\(uid, freshUser\)/);
assert.match(syncLatestUserContract, /auth\.currentUser\?\.uid !== uid/);
assert.match(syncLatestUserContract, /setCurrentUser\(freshUser\)/);
assert.doesNotMatch(syncLatestUserContract, /setCurrentUser\([^)]*=>/);

// 업적 판정과 merge는 서버 한 곳에서만 수행한다. 클라이언트는 인증 계정을
// 고정해 action을 호출한 뒤 source-server에서 실제 반영된 ID만 UI에 사용한다.
assert.match(
    userBibleActions,
    /import\s*\{[^}]*syncAchievements[^}]*\}\s*from\s*['"]\.\.\/utils\/platformApi['"]/,
);
assert.doesNotMatch(
    userBibleActions,
    /import\s*\{[^}]*(?:getNewAchievementIds|mergeAchievementIds)[^}]*\}\s*from\s*['"]\.\.\/data\/achievements['"]/,
    '브라우저 hook이 업적 판정·merge helper를 다시 가져오면 안 된다.',
);
const checkAchievementsStart = userBibleActions.indexOf('const checkAchievements = useCallback(');
const checkAchievementsEnd = userBibleActions.indexOf('const handleRead = useCallback(', checkAchievementsStart);
assert.ok(checkAchievementsStart >= 0 && checkAchievementsEnd > checkAchievementsStart, 'checkAchievements 서버 sync helper가 필요하다.');
const checkAchievementsContract = userBibleActions.slice(checkAchievementsStart, checkAchievementsEnd);
for (const pattern of [
    /const uid = user\?\.uid/,
    /auth\.currentUser\?\.uid !== uid/,
    /await syncAchievements\(trigger, \{ expectedUid:\s*uid \}\)/,
    /const returnedIds = response\.result\.newIds/,
    /await syncLatestUser\(uid\)/,
    /freshUser\.achievements/,
    /returnedIds\.filter\(achievementId => freshAchievementIds\.has\(achievementId\)\)/,
]) assert.match(checkAchievementsContract, pattern);
assert.doesNotMatch(
    checkAchievementsContract,
    /db\.runTransaction|getNewAchievementIds|mergeAchievementIds|transaction\.(?:get|set|update|delete)|setCurrentUser\(/,
    'checkAchievements가 Firestore를 직접 쓰거나 응답 snapshot을 로컬 사용자에 merge하면 안 된다.',
);

// 메모 본문 쓰기가 성공한 뒤 memo trigger를 호출한다. 업적 action 실패는 이미
// 저장된 메모를 실패·재append시키지 않으며 기존 onComplete 흐름도 보존한다.
const saveMemoStart = useMemosSource.indexOf('const saveMemo = useCallback(');
const saveMemoEnd = useMemosSource.indexOf('\n    return {', saveMemoStart);
assert.ok(saveMemoStart >= 0 && saveMemoEnd > saveMemoStart, 'saveMemo 계약 구간이 필요하다.');
const saveMemoContract = useMemosSource.slice(saveMemoStart, saveMemoEnd);
const memoWriteStart = saveMemoContract.indexOf("await db.collection('users').doc(uid).set(");
const memoAchievementStart = saveMemoContract.indexOf("await checkAchievements(currentUser, 'memo')");
const memoAchievementCatch = saveMemoContract.indexOf('catch (achievementError)', memoAchievementStart);
const memoOnComplete = saveMemoContract.indexOf("typeof onComplete === 'function'", memoAchievementStart);
assert.ok(
    memoWriteStart >= 0
        && memoAchievementStart > memoWriteStart
        && memoAchievementCatch > memoAchievementStart
        && memoOnComplete > memoAchievementCatch,
    '메모 저장 → 분리된 업적 동기화/catch → onComplete 순서를 지켜야 한다.',
);
assert.match(
    saveMemoContract.slice(memoWriteStart, memoOnComplete),
    /try\s*\{[\s\S]*await checkAchievements\(currentUser, 'memo'\)[\s\S]*\}\s*catch \(achievementError\)/,
);
assert.match(saveMemoContract.slice(memoAchievementCatch, memoOnComplete), /console\.warn\(/);
assert.match(saveMemoContract.slice(memoAchievementCatch, memoOnComplete), /currentUidRef\.current !== uid/);

// 읽기 완료는 브라우저 Firestore transaction이 아니라 멱등 requestId를 붙인
// completeRead 서버 action 한 번으로 저장하고, 2xx 응답도 fail-closed 검증한다.
assert.match(userBibleActions, /import\s*\{[^}]*completeRead[^}]*restartReading[^}]*\}\s*from\s*['"]\.\.\/utils\/platformApi['"]/);
assert.match(
    userBibleActions,
    /import\s*\{[^}]*clearActivityRequest[^}]*getOrCreateReadActivityRequest[^}]*\}\s*from\s*['"]\.\.\/utils\/userActivityRequests['"]/,
);
const handleReadStart = userBibleActions.indexOf('const handleRead = useCallback(async () => {');
const handleReadEnd = userBibleActions.indexOf('const handleRestart = useCallback(', handleReadStart);
assert.ok(handleReadStart >= 0 && handleReadEnd > handleReadStart, 'handleRead 서버 저장 구간이 필요하다.');
const handleReadContract = userBibleActions.slice(handleReadStart, handleReadEnd);
assert.match(
    handleReadContract,
    /getOrCreateReadActivityRequest\([\s\S]*cycle:\s*submittedReadCount[\s\S]*day:\s*vDay[\s\S]*readingEpoch:\s*requestStartUser\.readingEpoch\s*\?\?\s*0/,
    '현재 읽기 위치에 묶인 멱등 requestId를 먼저 복구·생성해야 한다.',
);
assert.match(
    handleReadContract,
    /await completeRead\([\s\S]*activityRequest\.payload\.cycle[\s\S]*activityRequest\.payload\.day[\s\S]*requestId:\s*activityRequest\.requestId[\s\S]*expectedUid:\s*uid[\s\S]*readingEpoch:\s*activityRequest\.payload\.readingEpoch/,
    'completeRead에는 저장된 원본 payload·requestId와 제출 계정 UID를 함께 보내야 한다.',
);
assert.match(handleReadContract, /clearActivityRequest\(activityRequest\)/);
assert.match(handleReadContract, /auth\.currentUser\?\.uid !== uid/);
assert.match(handleReadContract, /freshUser = await syncLatestUser\(uid\)/);
assert.match(handleReadContract, /requestCommunityRefresh\?\.\(\)/);
assert.match(handleReadContract, /sameReadingPosition\(readingPosition\(freshUser\), responsePosition\)/);
assert.match(handleReadContract, /\{ applyLocal:\s*false, showToast:\s*false \}/);
assert.ok(
    (handleReadContract.match(/freshUser = await syncLatestUser\(uid\)/g) || []).length >= 2,
    '업적 transaction 뒤에도 source-server final sync를 다시 수행해야 한다.',
);
assert.ok(
    handleReadContract.indexOf('clearActivityRequest(activityRequest)')
        < handleReadContract.indexOf('freshUser = await syncLatestUser(uid)'),
    '결정적 read requestId를 정리한 뒤 source-server sync를 수행해야 한다.',
);
assert.match(
    handleReadContract,
    /shouldPreserveRequest[\s\S]*error\?\.retryable === true[\s\S]*error\?\.code === 'INVALID_RESPONSE'/,
    '결과가 불확실한 오류는 같은 requestId 재전송을 위해 보존해야 한다.',
);
assert.doesNotMatch(
    handleReadContract,
    /previewReadCompletion|compareReadCompletionShadow|\[read(?:-completion)?-shadow\]/,
    '실제 읽기 저장 경로에 shadow preview가 남으면 안 된다.',
);
assert.doesNotMatch(
    handleReadContract,
    /db\.runTransaction\s*\(|\btransaction\.(?:get|set|update|delete)\s*\(|collection\(['"]platformStats['"]\)|collection\(['"]history['"]\)\.add\s*\(/,
    'handleRead가 읽기·지갑·통계를 브라우저에서 직접 transaction/write하면 안 된다.',
);
assert.doesNotMatch(handleReadContract, /loadAllMembers|setAllMembersForRace|setDepartmentMembers|setSubgroupStats/);
assert.doesNotMatch(handleReadContract, /updateRosterTalents|\.\.\.response\.state\.user/);
assert.match(
    handleReadContract,
    /checkAchievements\([\s\S]*freshUser,[\s\S]*['"]read['"][\s\S]*\{ applyLocal:\s*false, showToast:\s*false \}/,
    '읽기 완료는 read trigger를 서버에 보내되 final 위치 확인 전 toast를 띄우면 안 된다.',
);
const handleReadFinalSync = handleReadContract.lastIndexOf('freshUser = await syncLatestUser(uid)');
const handleReadAchievementFilter = handleReadContract.indexOf(
    'achievementIds = achievementIds.filter(achievementId => freshAchievementIds.has(achievementId))',
    handleReadFinalSync,
);
const handleReadAchievementToast = handleReadContract.indexOf('showAchievementToast(', handleReadAchievementFilter);
assert.ok(
    handleReadFinalSync >= 0
        && handleReadAchievementFilter > handleReadFinalSync
        && handleReadAchievementToast > handleReadAchievementFilter,
    'final source-server sync 뒤 실제 fresh achievements에 남은 ID만 읽기 toast에 사용해야 한다.',
);

const readCalendarDate = 'Thu Jul 16 2026';
const validCompleteReadResponse = {
    ok: true,
    action: 'completeRead',
    requestId: readRequestId,
    alreadyCompleted: false,
    committed: true,
    calendarDate: readCalendarDate,
    result: {
        status: 'ready',
        updateData: {
            currentDay: 2,
            readCount: 1,
            readingYear: 2026,
            yearCompletedRounds: 0,
            lifetimeCompletedRounds: 0,
            score: 10,
            talent: 11,
            streak: 1,
            maxStreak: 1,
            lastReadDate: readCalendarDate,
            dailyAdvanceDate: readCalendarDate,
            dailyAdvanceCount: 1,
            recentReadDates: [readCalendarDate],
        },
        summary: {
            oldLevel: 0,
            newLevel: 0,
            scoreEarned: 10,
            streakBonus: 0,
            talentEarned: 11,
            newStreak: 1,
            newReadCount: 1,
            newProgressDay: 2,
            nextViewingDay: 2,
            totalDays: 365,
            completedRound: false,
            requiresNextPlan: false,
            secretShopJustUnlocked: false,
            rewardsUserWallet: true,
            talentProgramEnabled: true,
        },
    },
    state: {
        user: {
            currentDay: 2,
            readCount: 1,
            readingYear: 2026,
            yearCompletedRounds: 0,
            lifetimeCompletedRounds: 0,
            score: 10,
            talent: 11,
            streak: 1,
            maxStreak: 1,
            lastReadDate: readCalendarDate,
            dailyAdvanceDate: readCalendarDate,
            dailyAdvanceCount: 1,
            recentReadDates: [readCalendarDate],
            secretShopUnlocked: false,
        },
        rosters: [],
    },
};
const validCompleteReadPayload = { cycle: 1, day: 1, readingEpoch: 0 };
assert.deepEqual(
    platformApi.validateCompleteReadResponse(
        validCompleteReadPayload,
        validCompleteReadResponse,
        readRequestId,
    ),
    validCompleteReadResponse,
);
const validFourthReadPayload = { cycle: 1, day: 4, readingEpoch: 0 };
const validFourthReadResponse = structuredClone(validCompleteReadResponse);
validFourthReadResponse.result.updateData.currentDay = 5;
validFourthReadResponse.result.updateData.dailyAdvanceCount = 4;
validFourthReadResponse.result.summary.scoreEarned = 0;
validFourthReadResponse.result.summary.talentEarned = 0;
validFourthReadResponse.result.summary.newProgressDay = 5;
validFourthReadResponse.result.summary.nextViewingDay = 5;
validFourthReadResponse.state.user.currentDay = 5;
validFourthReadResponse.state.user.dailyAdvanceCount = 4;
assert.deepEqual(
    platformApi.validateCompleteReadResponse(
        validFourthReadPayload,
        validFourthReadResponse,
        readRequestId,
    ),
    validFourthReadResponse,
    '같은 날 4장째 성공 응답도 저장 실패로 오판하면 안 된다.',
);
const validZeroCountReadGuardResponse = structuredClone(validCompleteReadResponse);
validZeroCountReadGuardResponse.committed = false;
validZeroCountReadGuardResponse.result = {
    status: 'positionMismatch',
    expected: { cycle: 1, day: 2 },
    received: { cycle: 1, day: 1 },
};
validZeroCountReadGuardResponse.state.user.currentDay = 2;
validZeroCountReadGuardResponse.state.user.dailyAdvanceCount = 0;
assert.equal(
    platformApi.validateCompleteReadResponse(
        validCompleteReadPayload,
        validZeroCountReadGuardResponse,
        readRequestId,
    ).state.user.dailyAdvanceCount,
    0,
    '날짜가 있는 count 0 무보상 guard는 유효한 서버 상태로 받아들여야 한다.',
);
for (const mutate of [
    response => { response.extra = true; },
    response => { response.requestId = quizRequestId; },
    response => { response.calendarDate = '2026-07-16'; },
    response => { response.state.user.score = 9; },
    response => { response.result.updateData.talent = 1_000_000_001; },
    response => { delete response.result.summary.nextViewingDay; },
    response => { response.state.rosters = [{ orgId: 'z-org', talent: 1 }, { orgId: 'a-org', talent: 1 }]; },
    response => {
        response.result.summary.secretShopJustUnlocked = true;
        response.result.updateData.secretShopUnlocked = true;
        response.state.user.secretShopUnlocked = true;
    },
]) {
    const response = structuredClone(validCompleteReadResponse);
    mutate(response);
    assert.throws(
        () => platformApi.validateCompleteReadResponse(validCompleteReadPayload, response, readRequestId),
        error => error instanceof platformApi.PlatformApiError
            && error.code === 'INVALID_RESPONSE'
            && error.status === 200
            && error.retryable === true,
        '읽기 2xx 응답의 키·식별자·날짜·상태 불일치는 fail-closed여야 한다.',
    );
}

// Day 1 재시작은 읽기 회차(readCount)를 완독으로 오표시하지 않고 보존하며,
// 별도 readingEpoch로 과거 탭과 퀴즈 의미 원장을 분리한다.
const validRestartPayload = { cycle: 2, day: 10, readingEpoch: 3 };
const validRestartResponse = {
    ok: true,
    action: 'restartReading',
    requestId: restartRequestId,
    alreadyCompleted: false,
    committed: true,
    calendarDate: readCalendarDate,
    result: {
        status: 'restarted',
        previous: { cycle: 2, day: 10, readingEpoch: 3 },
        next: { cycle: 2, day: 1, readingEpoch: 4 },
    },
    state: {
        user: {
            currentDay: 1,
            readCount: 2,
            readingEpoch: 4,
            score: 0,
            talent: 77,
            streak: 0,
            maxStreak: 8,
            startDate: readCalendarDate,
            lastReadDate: null,
            dailyAdvanceDate: readCalendarDate,
            dailyAdvanceCount: 2,
            recentReadDates: [readCalendarDate],
            achievements: [],
            dayOffset: 0,
            secretShopUnlocked: true,
            quizDate: null,
            quizAttempts: 0,
            quizSolved: false,
            quizSkipped: false,
            quizKey: null,
            quizRewardDate: readCalendarDate,
            quizRewardAmount: 10,
        },
        rosters: [{
            orgId: 'a-org',
            currentDay: 1,
            readCount: 2,
            score: 0,
            streak: 0,
            lastReadDate: null,
            talent: 33,
        }],
    },
};
assert.deepEqual(
    platformApi.validateRestartReadingResponse(
        validRestartPayload,
        validRestartResponse,
        restartRequestId,
    ),
    validRestartResponse,
);
for (const mutate of [
    response => { response.extra = true; },
    response => { response.requestId = readRequestId; },
    response => { response.result.next.readingEpoch = 3; },
    response => { response.state.user.readCount = 3; },
    response => { response.state.user.lastReadDate = readCalendarDate; },
    response => { response.state.user.dailyAdvanceDate = null; },
    response => { response.state.user.achievements = ['first_memo']; },
    response => { response.state.user.quizProgress = {}; },
    response => { response.state.rosters[0].talent = 1_000_000_001; },
]) {
    const response = structuredClone(validRestartResponse);
    mutate(response);
    assert.throws(
        () => platformApi.validateRestartReadingResponse(validRestartPayload, response, restartRequestId),
        error => error instanceof platformApi.PlatformApiError
            && error.code === 'INVALID_RESPONSE'
            && error.status === 200
            && error.retryable === true,
        '재시작 2xx 응답의 키·epoch·보존 상태 불일치는 fail-closed여야 한다.',
    );
}

const handleRestartStart = userBibleActions.indexOf('const handleRestart = useCallback(async () => {');
const handleRestartEnd = userBibleActions.indexOf('const changeStartDate = useCallback(', handleRestartStart);
assert.ok(handleRestartStart >= 0 && handleRestartEnd > handleRestartStart, 'handleRestart 서버 저장 구간이 필요하다.');
const handleRestartContract = userBibleActions.slice(handleRestartStart, handleRestartEnd);
for (const pattern of [
    /restartSubmittingRef\.current/,
    /getOrCreateRestartActivityRequest\([\s\S]*readingEpoch:\s*requestStartUser\.readingEpoch\s*\?\?\s*0/,
    /await restartReading\([\s\S]*requestId:\s*activityRequest\.requestId[\s\S]*expectedUid:\s*uid[\s\S]*readingEpoch:\s*activityRequest\.payload\.readingEpoch/,
    /clearActivityRequest\(activityRequest\)/,
    /auth\.currentUser\?\.uid !== uid/,
    /freshUser = await syncLatestUser\(uid\)/,
    /restartWasObserved[\s\S]*freshUser\.readingEpoch >= response\.result\.next\.readingEpoch/,
    /response\.result\.status === 'positionMismatch'/,
    /if \(response\.alreadyCompleted\)/,
    /shouldPreserveRequest[\s\S]*error\?\.retryable === true[\s\S]*error\?\.code === 'INVALID_RESPONSE'/,
]) assert.match(handleRestartContract, pattern);
assert.ok(
    handleRestartContract.indexOf('clearActivityRequest(activityRequest)')
        < handleRestartContract.indexOf('freshUser = await syncLatestUser(uid)'),
    '결정적 restart requestId를 정리한 뒤 source-server sync를 수행해야 한다.',
);
assert.match(handleRestartContract, /requestCommunityRefresh\?\.\(\)/);
assert.match(handleRestartContract, /setCompletionSummary\(null\)[\s\S]*const restartIsLatest/);
assert.doesNotMatch(
    handleRestartContract,
    /db\.collection|db\.runTransaction|firebase\.firestore|setReadHistory\s*\(|dailyAdvanceDate:\s*null|dailyAdvanceCount:\s*0|readCount:\s*1|loadAllMembers|setAllMembersForRace|setDepartmentMembers|setSubgroupStats|updateRosterTalents|\.\.\.response\.state\.user/,
    '재시작 경로가 Firestore·기록·보상 제한·완독 횟수를 브라우저에서 직접 초기화하면 안 된다.',
);

const dashboardView = read('src/components/DashboardView.jsx');
const restartModal = read('src/components/modals/RestartConfirmModal.jsx');
const dateSettingsModal = read('src/components/modals/DateSettingsModal.jsx');
assert.match(dashboardView, /setShowRestartConfirm\(true\)/, '재시작 모달의 실제 진입점이 필요하다.');
assert.match(dateSettingsModal, /Day 1로 다시 시작/);
assert.match(dateSettingsModal, /const saved = await changeStartDate\(newOffset\)/);
assert.match(dateSettingsModal, /disabled=\{saving\}/);
assert.match(restartModal, /disabled=\{submitting\}/);
assert.match(restartModal, /달란트, 묵상, 과거 읽기 기록, 최고 연속 기록, 완독 횟수/);
assert.match(restartModal, /같은 날 읽기·퀴즈 보상은 중복 지급되지 않습니다/);
assert.match(quizProgressSource, /epoch === 0 \? legacyKey : `e\$\{epoch\}_\$\{legacyKey\}`/);
assert.match(quizCard, /getQuizProgressKey\(progressCycle, progressDay, readingEpoch\)/);
const changeStartDateStart = userBibleActions.indexOf('const changeStartDate = useCallback(async (dayOffset) => {');
const changeStartDateEnd = userBibleActions.indexOf('\n\n    return {', changeStartDateStart);
assert.ok(changeStartDateStart >= 0 && changeStartDateEnd > changeStartDateStart, '날짜 설정 transaction 구간이 필요하다.');
const changeStartDateContract = userBibleActions.slice(changeStartDateStart, changeStartDateEnd);
assert.match(changeStartDateContract, /db\.runTransaction\(async \(transaction\) =>/);
assert.match(changeStartDateContract, /sameReadingPosition\(readingPosition\(snapshot\.data\(\)\), submittedPosition\)/);
assert.match(changeStartDateContract, /auth\.currentUser\?\.uid !== uid/);
assert.match(changeStartDateContract, /freshUser = await syncLatestUser\(uid\)/);
assert.match(changeStartDateContract, /return freshUser\.dayOffset === dayOffset/);
assert.doesNotMatch(changeStartDateContract, /setCurrentUser\([^)]*=>|\.\.\.previous/);

// read/restart 랭킹 refresh는 같은 hook의 세대 effect를 nonce로 재실행한다.
for (const pattern of [
    /const \[communityRefreshNonce, setCommunityRefreshNonce\] = useState\(0\)/,
    /const requestCommunityRefresh = useCallback\(\(\) =>/,
    /const requestId = \+\+communityRequestRef\.current/,
    /const isCurrentRequest = \(\) => requestId === communityRequestRef\.current/,
    /communityRefreshNonce/,
]) assert.match(bibleLogic, pattern);

// 퀴즈 정답 서버 권위 기반: 클라이언트와 생성기가 같은 결정적 섞기 함수를
// 공유하고, 서버에 배치되는 인덱스가 전체 원본과 정확히 대응해야 한다.
const quizShufflePath = 'src/utils/quizShuffle.js';
const quizEnginePath = 'src/utils/quizEngine.js';
const quizAnswerGeneratorPath = 'scripts/generate-quiz-answer-index.mjs';
const quizAnswerIndexPath = 'supabase/functions/platform-api/quiz-answer-index.json';
const quizCorePath = 'supabase/functions/platform-api/quizCore.ts';
const quizCoreTestPath = 'supabase/functions/platform-api/quizCore_test.ts';
for (const path of [
    quizShufflePath,
    quizEnginePath,
    quizAnswerGeneratorPath,
    quizAnswerIndexPath,
    quizCorePath,
    quizCoreTestPath,
]) assert.equal(exists(path), true, `${path}가 필요하다.`);

const quizShuffle = read(quizShufflePath);
const quizEngine = read(quizEnginePath);
for (const exportName of ['hashStringToSeed', 'createSeededRandom', 'shuffleQuizChoices']) {
    assert.match(quizShuffle, new RegExp(`export const ${exportName}\\s*=`));
}
assert.match(
    quizEngine,
    /import\s*\{[^}]*createSeededRandom[^}]*shuffleQuizChoices[^}]*\}\s*from\s*['"]\.\/quizShuffle['"]/,
    'quizEngine은 공용 quizShuffle 구현을 import해야 한다.',
);
assert.match(quizEngine, /export\s*\{\s*shuffleQuizChoices\s*\}/, '기존 호출부를 위해 shuffleQuizChoices를 re-export해야 한다.');
assert.doesNotMatch(
    quizEngine,
    /(?:const|let|var|function)\s+(?:hashStringToSeed|createSeededRandom)\b/,
    'quizEngine에 hash/seeded random 중복 구현을 두면 안 된다.',
);

assert.equal(packageJson.scripts['generate:quiz-answer-index'], 'node scripts/generate-quiz-answer-index.mjs');
assert.equal(packageJson.scripts['validate:quiz-answer-index'], 'node scripts/generate-quiz-answer-index.mjs --check');
const validateScript = packageJson.scripts.validate;
const answerIndexValidation = 'npm run validate:quiz-answer-index';
const round24Validation = 'npm run validate:round24';
assert.ok(validateScript.includes(answerIndexValidation), '최상위 validate에 정답 인덱스 검사가 필요하다.');
assert.ok(
    validateScript.indexOf(answerIndexValidation) < validateScript.indexOf(round24Validation),
    '정답 인덱스 검사는 Round 24 계약 검사보다 먼저 실행해야 한다.',
);

const quizAnswerIndex = JSON.parse(read(quizAnswerIndexPath));
assert.equal(quizAnswerIndex.schemaVersion, 1, '퀴즈 정답 인덱스 schemaVersion은 1이어야 한다.');
assert.equal(
    quizAnswerIndex.questions && typeof quizAnswerIndex.questions === 'object' && !Array.isArray(quizAnswerIndex.questions),
    true,
    '퀴즈 정답 인덱스 questions는 객체여야 한다.',
);
const indexedQuestions = Object.entries(quizAnswerIndex.questions);
assert.equal(indexedQuestions.length, 6657, '퀴즈 정답 인덱스는 정확히 6,657문항이어야 한다.');
const quizKindCounts = { standard: 0, ntEasy: 0, bank: 0 };
for (const [key, record] of indexedQuestions) {
    let kind;
    if (/^ntEasy-(?:[1-9]\d{0,2})-(?:[1-9]\d*)$/.test(key)) kind = 'ntEasy';
    else if (/^bank-(?:0|[1-9]\d*)$/.test(key)) kind = 'bank';
    else if (/^[a-z0-9]+-(?:[1-9]\d*)-(?:[1-9]\d*)$/.test(key)) kind = 'standard';
    else assert.fail(`허용되지 않은 퀴즈 key 형식: ${key}`);
    quizKindCounts[kind] += 1;

    assert.ok(Number.isInteger(record?.answerIndex) && record.answerIndex >= 0 && record.answerIndex <= 3, `${key}: answerIndex는 0~3 정수여야 한다.`);
    assert.equal(record?.allowed && typeof record.allowed === 'object', true, `${key}: allowed가 필요하다.`);
    for (const plan of ['whole', 'nt', 'sequential']) {
        const days = record.allowed?.[plan];
        assert.ok(Array.isArray(days), `${key}: allowed.${plan}은 배열이어야 한다.`);
        assert.ok(days.every(day => Number.isInteger(day) && day >= 1 && day <= 365), `${key}: allowed.${plan}은 Day 1~365만 포함해야 한다.`);
        assert.equal(new Set(days).size, days.length, `${key}: allowed.${plan}에 중복 Day가 있다.`);
    }
    if (kind === 'bank') {
        assert.equal(record.legacyBank, true, `${key}: 레거시 은행 문항 표시가 필요하다.`);
        assert.deepEqual(record.allowed, { whole: [], nt: [], sequential: [] }, `${key}: 은행 문항은 새 위치에 허용하면 안 된다.`);
    } else {
        assert.notEqual(record.legacyBank, true, `${key}: 일반 문항을 legacyBank로 표시하면 안 된다.`);
    }
}
assert.deepEqual(
    quizKindCounts,
    { standard: 4719, ntEasy: 1825, bank: 113 },
    '퀴즈 종류별 인덱스 문항 수가 원본과 달라졌다.',
);

const quizCore = read(quizCorePath);
const corePath = 'supabase/functions/platform-api/core.ts';
const indexPath = 'supabase/functions/platform-api/index.ts';
assert.equal(exists(corePath), true, `${corePath}가 필요하다.`);
assert.equal(exists(indexPath), true, `${indexPath}가 필요하다.`);
const serverCore = read(corePath);
const serverIndex = read(indexPath);

// T127e: legacy 읽기 위치 보정은 인증 UID만으로 서버가 users와 canonical
// roster를 원자 갱신하며, no-op에는 원장을 만들지 않는다.
const normalizePositionServicePath = 'supabase/functions/platform-api/normalizeLegacyReadingPositionService.ts';
const normalizePositionServiceTestPath = 'supabase/functions/platform-api/normalizeLegacyReadingPositionService_test.ts';
for (const path of [normalizePositionServicePath, normalizePositionServiceTestPath]) {
    assert.equal(exists(path), true, `${path}가 필요하다.`);
}
const normalizePositionService = read(normalizePositionServicePath);
const normalizePositionServiceTest = read(normalizePositionServiceTestPath);
assert.match(serverCore, /NORMALIZE_LEGACY_READING_POSITION_ACTION\s*=\s*[\s\S]{0,80}"normalizeLegacyReadingPosition"/);
const normalizePositionParserStart = serverCore.indexOf(
    'if (action === NORMALIZE_LEGACY_READING_POSITION_ACTION)',
);
const normalizePositionParserEnd = serverCore.indexOf(
    'if (action === MIGRATE_PERSONAL_TALENT_WALLET_ACTION)',
    normalizePositionParserStart,
);
assert.ok(
    normalizePositionParserStart >= 0 && normalizePositionParserEnd > normalizePositionParserStart,
    'normalizeLegacyReadingPosition exact parser 구간이 필요하다.',
);
const normalizePositionParser = serverCore.slice(normalizePositionParserStart, normalizePositionParserEnd);
assert.match(normalizePositionParser, /new Set\(\["action", "requestId"\]\)/);
assert.doesNotMatch(normalizePositionParser, /\b(?:uid|currentDay|readCount|churchId|orgId)\b\s*:/);
for (const pattern of [
    /beginTransaction\(/,
    /runCollectionGroupQuery<LegacyReadingRoster>/,
    /"roster",[\s\S]*"uid",[\s\S]*uid,[\s\S]*\{ limit: 4, transaction \}/,
    /parseRosterTalentWallets\(documents, uid\)/,
    /Math\.floor\(\(currentDay - 1\) \/ 365\)/,
    /const nextReadCount = readCount \+ extraRounds/,
    /Number\.isSafeInteger\(nextReadCount\)/,
    /const userNeedsLegacyNormalization = storedUser\.currentDay > 365/,
    /const userNeedsAnnualNormalization = annualFieldsMissing \|\| isNewYear/,
    /rosters\.filter\(\(roster\) => roster\.needsRepair\)/,
    /!userNeedsNormalization && !churchNameNeedsRepair &&[\s\S]*rosterTargets\.length === 0/,
    /`churches\/\$\{user\.churchId\}`/,
    /churchNameNeedsRepair \? \{ churchName: authoritativeChurchName \} : \{\}/,
    /roster\.currentDay === undefined/,
    /roster\.readCount === undefined/,
    /status: "alreadyNormalized"/,
    /committed: false/,
    /activityActions\/\$\{input\.requestId\}/,
    /updateMask: Object\.keys\(progressUpdate\)/,
    /input: \{\}/,
    /MAX_TRANSACTION_ATTEMPTS = 3/,
    /alreadyCompleted: true/,
]) assert.match(normalizePositionService, pattern);
assert.match(normalizePositionService, /const readCount = requireSafeInteger\(user\.readCount,[\s\S]{0,160}fallback: 1/,
    'legacy users.readCount 누락은 기존 1회차 의미로 호환해야 한다.');
const normalizeLedgerStart = normalizePositionService.indexOf(
    'dependencies.updateWrite(service.projectId, ledgerPath',
);
const normalizeLedgerEnd = normalizePositionService.indexOf(
    'await dependencies.commitWrites(',
    normalizeLedgerStart,
);
assert.ok(normalizeLedgerStart >= 0 && normalizeLedgerEnd > normalizeLedgerStart,
    'legacy 진도 보정 최소 ledger 쓰기가 필요하다.');
assert.doesNotMatch(
    normalizePositionService.slice(normalizeLedgerStart, normalizeLedgerEnd),
    /\b(?:uid|user|email|name|password|churchId|orgId|roster)\b\s*:/,
    'legacy 진도 보정 ledger에 식별자·조직·PII를 복제하면 안 된다.',
);
for (const pattern of [
    /fresh no-op/,
    /roster currentDay가 365를 넘으면 roster만 복구/,
    /roster readCount는 canonical users 값으로 복구/,
    /roster currentDay\/readCount 누락도/,
    /apply-then-409/,
    /readCount가 없는 legacy users/,
    /기준 공동체 이름만 users에 점진 보정/,
    /malformed deleted marker/,
    /canonical roster/,
    /지속 409/,
]) assert.match(normalizePositionServiceTest, pattern);
assert.match(
    serverIndex,
    /import \{ normalizeLegacyReadingPosition \} from "\.\/normalizeLegacyReadingPositionService\.ts";/,
);
const normalizePositionBranchStart = serverIndex.indexOf(
    'if (parsed.action === "normalizeLegacyReadingPosition")',
);
const firstAuthenticatedUserRead = serverIndex.indexOf(
    'const userDocument = await getDocument<UserDocument>',
    normalizePositionBranchStart,
);
assert.ok(
    normalizePositionBranchStart > serverIndex.indexOf('const [verifiedUser, service] = await Promise.all([')
        && firstAuthenticatedUserRead > normalizePositionBranchStart,
    'legacy 진도 보정은 nonanonymous verifiedUser 인증 뒤 공용 user read 전에 실행해야 한다.',
);
const normalizePositionBranch = serverIndex.slice(normalizePositionBranchStart, firstAuthenticatedUserRead);
assert.match(
    normalizePositionBranch,
    /normalizeLegacyReadingPosition\([\s\S]*service,[\s\S]*verifiedUser,[\s\S]*requestId: parsed\.requestId/,
);
assert.match(normalizePositionBranch, /ok: true[\s\S]*action: parsed\.action[\s\S]*requestId: parsed\.requestId[\s\S]*\.\.\.result/);
assert.doesNotMatch(
    normalizePositionBranch,
    /\b(?:uid|currentDay|readCount|churchId|orgId|roster|user)\b\s*:/,
    'legacy 진도 보정 HTTP 응답에서 상태 외 식별자·조직 snapshot을 직접 추가하면 안 된다.',
);

// 서버 업적 계산기는 클라이언트의 14개 ID·순서·경계값과 정확히 같아야 하며,
// 외부 I/O 없이 서버가 읽은 사용자 상태만 계산한다.
const achievementCorePath = 'supabase/functions/platform-api/achievementCore.ts';
const achievementCoreTestPath = 'supabase/functions/platform-api/achievementCore_test.ts';
const achievementSyncServicePath = 'supabase/functions/platform-api/achievementSyncService.ts';
const achievementSyncServiceTestPath = 'supabase/functions/platform-api/achievementSyncService_test.ts';
for (const path of [
    achievementCorePath,
    achievementCoreTestPath,
    achievementSyncServicePath,
    achievementSyncServiceTestPath,
]) assert.equal(exists(path), true, `${path}가 필요하다.`);
const achievementCore = read(achievementCorePath);
const achievementCoreTest = read(achievementCoreTestPath);
const achievementSyncService = read(achievementSyncServicePath);
const achievementSyncServiceTest = read(achievementSyncServiceTestPath);
const achievementThresholdContract = [
    ['first_read', 'currentDay', 2],
    ['streak_7', 'streak', 7],
    ['streak_30', 'streak', 30],
    ['streak_100', 'streak', 100],
    ['day_30', 'currentDay', 30],
    ['day_100', 'currentDay', 100],
    ['day_200', 'currentDay', 200],
    ['day_365', 'currentDay', 365],
    ['first_memo', 'memoCount', 1],
    ['memo_10', 'memoCount', 10],
    ['memo_50', 'memoCount', 50],
    ['score_100', 'score', 100],
    ['score_500', 'score', 500],
    ['score_1000', 'score', 1000],
];
assert.deepEqual(
    ACHIEVEMENTS.map(achievement => achievement.id),
    achievementThresholdContract.map(([id]) => id),
    '클라이언트 업적 ID와 표시 순서는 canonical 14개와 같아야 한다.',
);
const serverAchievementCatalog = Array.from(
    achievementCore.matchAll(
        /\{\s*id:\s*"([^"]+)",\s*threshold:\s*\{\s*field:\s*"([^"]+)",\s*value:\s*(\d+)\s*\}\s*\}/g,
    ),
    match => [match[1], match[2], Number(match[3])],
);
assert.deepEqual(
    serverAchievementCatalog,
    achievementThresholdContract,
    'achievementCore의 ID·순서·field·threshold가 클라이언트 계약과 정확히 같아야 한다.',
);
assert.doesNotMatch(
    achievementCore,
    /(?:\bfetch\s*\(|\bDeno\.|db\.collection|firebase\.firestore|\bgetDocument\s*\(|\bbeginTransaction\s*\(|\bcommitWrites\s*\(|\brollbackTransaction\s*\(|\bupdateWrite\s*\()/,
    'achievementCore는 외부 I/O가 없는 순수 계산 모듈이어야 한다.',
);
for (const exportedName of [
    'ACHIEVEMENT_CATALOG',
    'ACHIEVEMENT_IDS',
    'calculateAchievementSync',
    'isKnownAchievementId',
    'isCatalogOrderedAchievementSubset',
]) assert.match(achievementCore, new RegExp(`export const ${exportedName}\\b`));
for (const pattern of [
    /for \(const definition of ACHIEVEMENT_CATALOG\)/,
    /definition\.threshold\.value - 1/,
    /stateFor\(definition\.id, definition\.threshold\.value\)/,
    /trigger:\s*"read"/,
    /memoCount:\s*50/,
    /isCatalogOrderedAchievementSubset/,
]) assert.match(achievementCoreTest, pattern, 'achievementCore 경계·trigger·순서 테스트가 필요하다.');

// 공개 요청은 trigger만 제어할 수 있다. 사용자 수치·메모·업적 목록을 함께 보내
// 서버 판정을 위조하는 입력은 parser와 service 양쪽에서 exact-key로 거부한다.
assert.match(serverCore, /SYNC_ACHIEVEMENTS_ACTION\s*=\s*['"]syncAchievements['"]/);
const syncAchievementsParserStart = serverCore.indexOf('if (action === SYNC_ACHIEVEMENTS_ACTION)');
const syncAchievementsParserEnd = serverCore.indexOf('if (action === RESOLVE_DAILY_VIDEO_ACTION)', syncAchievementsParserStart);
assert.ok(
    syncAchievementsParserStart >= 0 && syncAchievementsParserEnd > syncAchievementsParserStart,
    'syncAchievements 요청 parser 구간이 필요하다.',
);
const syncAchievementsParser = serverCore.slice(syncAchievementsParserStart, syncAchievementsParserEnd);
assert.match(syncAchievementsParser, /new Set\(\["action", "requestId", "trigger"\]\)/);
assert.match(
    syncAchievementsParser,
    /(?:\(trigger !== "read" && trigger !== "memo"\)|!\["read", "memo"\]\.includes\(String\(trigger\)\))/,
);
const coreTestSource = read('supabase/functions/platform-api/core_test.ts');
for (const controlledField of [
    'uid',
    'user',
    'memos',
    'memoCount',
    'currentDay',
    'streak',
    'score',
    'achievementIds',
    'threshold',
    'readingEpoch',
]) {
    assert.match(
        coreTestSource,
        new RegExp(`\\b${controlledField}\\s*:`),
        `syncAchievements parser가 client controlled ${controlledField}를 거부하는 테스트가 필요하다.`,
    );
}
for (const pattern of [
    /keys\.length !== 2/,
    /keys\[0\] !== "requestId"/,
    /keys\[1\] !== "trigger"/,
    /(?:\(input\.trigger !== "read" && input\.trigger !== "memo"\)|!\["read", "memo"\]\.includes\(String\(input\.trigger\)\))/,
]) assert.match(achievementSyncService, pattern, 'achievement service도 exact input을 확인해야 한다.');

// 인증된 UID 아래 activityActions ledger와 users.achievements를 같은 transaction에
// 저장하며, 응답과 ledger에는 업적 결과 외 사용자 문서/PII를 복제하지 않는다.
for (const pattern of [
    /const userPath = `users\/\$\{uid\}`/,
    /const ledgerPath = `\$\{userPath\}\/activityActions\/\$\{input\.requestId\}`/,
    /beginTransaction\(/,
    /commitWrites\(/,
    /rollbackTransaction\(/,
    /memoCount:\s*input\.trigger === "memo" \? user\.memoCount : 0/,
    /\{ achievements:\s*calculation\.mergedIds \}/,
    /updateMask:\s*\["achievements"\]/,
    /action:\s*SYNC_ACHIEVEMENTS_ACTION/,
    /input:\s*\{ trigger:\s*input\.trigger \}/,
    /alreadyCompleted:\s*true/,
    /alreadyCompleted:\s*false/,
    /committed:\s*false/,
    /committed:\s*true/,
]) assert.match(achievementSyncService, pattern);
assert.match(achievementSyncService, /requireExactKeys\(ledger\.input, \["trigger"\]/);
assert.match(achievementSyncService, /requireExactKeys\(value, \["trigger", "newIds"\]/);
assert.match(achievementSyncService, /new Set\(newIds\)\.size !== newIds\.length/);
assert.match(achievementSyncService, /isCatalogOrderedAchievementSubset\(newIds\)/);
const achievementLedgerWriteStart = achievementSyncService.indexOf(
    'dependencies.updateWrite(\n        service.projectId,\n        ledgerPath',
);
const achievementLedgerWriteEnd = achievementSyncService.indexOf(
    'await dependencies.commitWrites(',
    achievementLedgerWriteStart,
);
assert.ok(
    achievementLedgerWriteStart >= 0 && achievementLedgerWriteEnd > achievementLedgerWriteStart,
    '업적 activityActions ledger 쓰기 구간이 필요하다.',
);
assert.doesNotMatch(
    achievementSyncService.slice(achievementLedgerWriteStart, achievementLedgerWriteEnd),
    /\b(?:email|name|birthdate|password|memos|currentDay|streak|score|churchId|orgId)\b\s*:/,
    '업적 ledger에 사용자 문서나 PII를 복제하면 안 된다.',
);
for (const pattern of [
    /activityActions/,
    /alreadyCompleted/,
    /committed/,
    /newIds/,
    /trigger/,
    /CONFLICT/,
]) assert.match(achievementSyncServiceTest, pattern, 'achievement service의 commit·replay·검증 테스트가 필요하다.');

assert.match(serverIndex, /import \{ syncAchievements \} from "\.\/achievementSyncService\.ts";/);
const verifiedUserStart = serverIndex.indexOf('const [verifiedUser, service] = await Promise.all([');
const syncAchievementsBranchStart = serverIndex.indexOf('if (parsed.action === "syncAchievements")');
const syncAchievementsBranchEnd = serverIndex.indexOf(
    'const userDocument = await getDocument<UserDocument>',
    syncAchievementsBranchStart,
);
assert.ok(
    verifiedUserStart >= 0
        && syncAchievementsBranchStart > verifiedUserStart
        && syncAchievementsBranchEnd > syncAchievementsBranchStart,
    'syncAchievements는 익명 허용 분기가 아니라 verifiedUser 인증 뒤에 실행해야 한다.',
);
const syncAchievementsBranch = serverIndex.slice(syncAchievementsBranchStart, syncAchievementsBranchEnd);
assert.match(
    syncAchievementsBranch,
    /syncAchievements\(service, verifiedUser, \{[\s\S]*requestId:\s*parsed\.requestId[\s\S]*trigger:\s*parsed\.trigger/,
);
const syncAchievementsResponseStart = syncAchievementsBranch.indexOf('return jsonResponse(origin, 200, {');
const syncAchievementsResponseEnd = syncAchievementsBranch.indexOf('\n      });', syncAchievementsResponseStart);
assert.ok(
    syncAchievementsResponseStart >= 0 && syncAchievementsResponseEnd > syncAchievementsResponseStart,
    'syncAchievements 최소 응답 구간이 필요하다.',
);
const syncAchievementsResponse = syncAchievementsBranch.slice(
    syncAchievementsResponseStart,
    syncAchievementsResponseEnd,
);
assert.match(syncAchievementsResponse, /ok:\s*true/);
assert.match(syncAchievementsResponse, /action:\s*parsed\.action/);
assert.match(syncAchievementsResponse, /requestId:\s*parsed\.requestId/);
assert.match(syncAchievementsResponse, /\.\.\.result/);
assert.doesNotMatch(
    syncAchievementsResponse,
    /\b(?:uid|user|state|email|name|birthdate|password|memos|currentDay|streak|score|churchId|orgId|achievements)\b\s*:/,
    'syncAchievements 응답은 식별자·사용자 snapshot·PII를 노출하면 안 된다.',
);

// T123 v2 달란트 계산 계약: 브라우저 talentProgram과 동일한 순수 해석,
// canonical roster 검증, 응답 최소화, 실제 적립 가능한 지갑 기준 보상을 고정한다.
const talentProgramCorePath = 'supabase/functions/platform-api/talentProgramCore.ts';
const talentProgramCoreTestPath = 'supabase/functions/platform-api/talentProgramCore_test.ts';
assert.equal(exists(talentProgramCorePath), true, `${talentProgramCorePath}가 필요하다.`);
assert.equal(exists(talentProgramCoreTestPath), true, `${talentProgramCoreTestPath}가 필요하다.`);
const talentProgramCore = read(talentProgramCorePath);
assert.doesNotMatch(
    talentProgramCore,
    /(?:\bfetch\s*\(|\bDeno\.|db\.collection|firebase\.firestore|\bgetDocument\s*\(|\bbeginTransaction\s*\(|\bcommitWrites\s*\()/,
    'talentProgramCore는 외부 I/O가 없는 순수 계산 모듈이어야 한다.',
);
for (const exportedName of [
    'normalizeTalentProgram',
    'resolveTalentProgram',
    'parseRosterTalentWallets',
    'resolveTalentWalletPrograms',
]) {
    assert.match(talentProgramCore, new RegExp(`export const ${exportedName}\\b`));
}
assert.match(
    talentProgramCore,
    /program\.legacy[\s\S]*membershipDepartmentIds\.length > 0[\s\S]*:\s*\[null\]/,
    'v1과 설정 문서 없음은 부서 없는 기존 계정도 적립 가능해야 한다.',
);
assert.match(
    talentProgramCore,
    /!setting\?\.enabled \|\| !setting\.marketId[\s\S]*program\.markets\[setting\.marketId\]/,
    'v2 적립은 활성 부서 설정과 실제 시장 존재를 함께 확인해야 한다.',
);
assert.match(talentProgramCore, /segments\.length === 3 && segments\[1\] === "roster"/);
assert.match(talentProgramCore, /segments\[2\] !== uid/);
assert.match(talentProgramCore, /document\.data\.uid/);
assert.match(talentProgramCore, /seen\.has\(orgId\)/);
assert.match(talentProgramCore, /wallets\.length > 3/);
assert.match(
    talentProgramCore,
    /wallets\.sort\(\(left, right\) =>[\s\S]*left\.orgId < right\.orgId \? -1 : left\.orgId > right\.orgId \? 1 : 0[\s\S]*\);/,
    '명부 정렬은 런타임 locale이 아닌 Firestore/ledger와 같은 코드포인트 순서를 써야 한다.',
);

const talentRoutingStart = serverIndex.indexOf('const loadPreviewTalentRouting = async');
const talentRoutingEnd = serverIndex.indexOf('const sha256Hex = async', talentRoutingStart);
assert.ok(talentRoutingStart >= 0 && talentRoutingEnd > talentRoutingStart, 'preview 달란트 routing 로더가 필요하다.');
const talentRoutingContract = serverIndex.slice(talentRoutingStart, talentRoutingEnd);
for (const pattern of [
    /parseRosterTalentWallets\(rosterDocuments, uid\)/,
    /rosters\.map\(\(\{ orgId \}\) => orgId\)/,
    /churches\/\$\{orgId\}\/settings\/talentShop/,
    /talentShops\[index\]\?\.data \|\| null/,
    /resolveTalentWalletPrograms\(/,
    /rosterCanEarnTalent:\s*resolution\.rosterCanEarnTalent\.some\(Boolean\)/,
]) assert.match(talentRoutingContract, pattern);

// T125 입장코드 방어 계약: 목적과 무관한 이중 속도 제한, requestId에 묶인
// ticket 재시도, 공개 오류의 동일 응답을 정적 검증한다.
const joinSecurityCorePath = 'supabase/functions/platform-api/joinSecurityCore.ts';
const joinSecurityCoreTestPath = 'supabase/functions/platform-api/joinSecurityCore_test.ts';
assert.equal(exists(joinSecurityCorePath), true, `${joinSecurityCorePath}가 필요하다.`);
assert.equal(exists(joinSecurityCoreTestPath), true, `${joinSecurityCoreTestPath}가 필요하다.`);
const joinSecurityCore = read(joinSecurityCorePath);
assert.doesNotMatch(
    joinSecurityCore,
    /(?:\bfetch\s*\(|\bDeno\.|db\.collection|firebase\.firestore|\bgetDocument\s*\(|\bbeginTransaction\s*\(|\bcommitWrites\s*\()/,
    'joinSecurityCore는 외부 I/O가 없는 순수 보안 계약이어야 한다.',
);
assert.match(joinSecurityCore, /JOIN_CLIENT_HOURLY_LIMIT\s*=\s*10/);
assert.match(joinSecurityCore, /JOIN_CHURCH_HOURLY_LIMIT\s*=\s*200/);
assert.match(joinSecurityCore, /scope:\s*"clientChurch"[\s\S]*scope:\s*"churchGlobal"/);
const rateScopeStart = joinSecurityCore.indexOf('export const buildJoinRateLimitScopes');
const rateScopeEnd = joinSecurityCore.indexOf('export const canConsumeJoinAttempt', rateScopeStart);
assert.ok(rateScopeStart >= 0 && rateScopeEnd > rateScopeStart, '공유 입장코드 속도 제한 키 계산기가 필요하다.');
assert.doesNotMatch(
    joinSecurityCore.slice(rateScopeStart, rateScopeEnd),
    /purpose/,
    '회원가입·온보딩·추가 참여가 purpose별 제한을 따로 가져서는 안 된다.',
);
assert.match(joinSecurityCore, /usedRequestId\?: unknown/);
assert.match(
    joinSecurityCore,
    /ticket\.usedAt && ticket\.usedBy === input\.uid[\s\S]*ticket\.usedRequestId === input\.requestId[\s\S]*consume:\s*false/,
    '같은 uid라도 동일 requestId일 때만 ticket 응답 유실 재시도를 허용해야 한다.',
);

const consumeAttemptStart = serverIndex.indexOf('const consumeJoinAttempt = async');
const consumeAttemptEnd = serverIndex.indexOf('const getChurchAccessHash = async', consumeAttemptStart);
assert.ok(consumeAttemptStart >= 0 && consumeAttemptEnd > consumeAttemptStart, '입장코드 속도 제한 소비 함수가 필요하다.');
const consumeAttempt = serverIndex.slice(consumeAttemptStart, consumeAttemptEnd);
for (const pattern of [
    /beginTransaction\(/,
    /paths\.map\(/,
    /canConsumeJoinAttempt/,
    /commitWrites\([\s\S]*paths\.map\([\s\S]*\{ transaction \}/,
]) assert.match(consumeAttempt, pattern);
assert.doesNotMatch(consumeAttempt, /purpose/, '모든 입장코드 목적은 같은 속도 제한 예산을 소비해야 한다.');

const accessHashStart = serverIndex.indexOf('const getChurchAccessHash = async');
const accessHashEnd = serverIndex.indexOf('const resolveJoinCredential = async', accessHashStart);
assert.ok(accessHashStart >= 0 && accessHashEnd > accessHashStart, 'private/access 우선 조회 함수가 필요하다.');
const accessHashContract = serverIndex.slice(accessHashStart, accessHashEnd);
assert.match(accessHashContract, /churches\/\$\{churchId\}\/private\/access/);
assert.match(accessHashContract, /privateHash \|\| legacyHash/);
assert.equal(
    (accessHashContract.match(/message:\s*INVALID_JOIN_CODE_MESSAGE/g) || []).length,
    2,
    '없는·삭제된 공동체와 코드 미설정은 동일한 공개 오류를 사용해야 한다.',
);
assert.match(serverIndex, /const INVALID_JOIN_CODE_MESSAGE = "입장코드가 올바르지 않습니다\."/);

const ticketBranchStart = serverIndex.indexOf('if (parsed.action === "issueJoinTicket")');
const ticketBranchEnd = serverIndex.indexOf('const idToken = getBearerToken(request)', ticketBranchStart);
assert.ok(ticketBranchStart >= 0 && ticketBranchEnd > ticketBranchStart, '공개 join ticket 발급 분기가 필요하다.');
const ticketBranch = serverIndex.slice(ticketBranchStart, ticketBranchEnd);
assert.match(ticketBranch, /consumeJoinAttempt\([\s\S]*parsed\.churchId/);
assert.match(ticketBranch, /hash !== await sha256Hex\(parsed\.entryCode\)[\s\S]*message:\s*INVALID_JOIN_CODE_MESSAGE/);
assert.match(ticketBranch, /usedRequestId:\s*null/);

const credentialStart = serverIndex.indexOf('const resolveJoinCredential = async');
const credentialEnd = serverIndex.indexOf('const joinValidationError', credentialStart);
const credentialContract = serverIndex.slice(credentialStart, credentialEnd);
assert.match(credentialContract, /requestId:\s*string/);
assert.match(credentialContract, /usedRequestId|validateJoinTicketUse/);
assert.ok(
    (serverIndex.match(/usedRequestId:\s*parsed\.requestId/g) || []).length >= 3,
    '가입·온보딩·추가 참여 모두 성공 transaction에서 ticket을 requestId와 함께 소비해야 한다.',
);
assert.ok(
    (serverIndex.match(/updateMask:\s*\["usedAt", "usedBy", "usedRequestId"\]/g) || []).length >= 3,
    'ticket 소비 표식은 세 서버 참여 경로 모두 원자 커밋에 포함되어야 한다.',
);
assert.match(quizCore, /export const validateQuizSubmission\s*=/);
assert.match(
    quizCore,
    /const canReplaceStoredQuizKey = attempts === 0 && stored\.solved !== true &&[\s\S]*stored\.skipped !== true/,
    '시도 전 사라진 저장 문항만 현재 후보 문항으로 교체할 수 있어야 한다.',
);
assert.match(
    quizCore,
    /!canReplaceStoredQuizKey && validQuizKey\(stored\.quizKey\)[\s\S]*stored\.quizKey !== input\.quizKey[\s\S]*status:\s*"invalidQuiz"/,
    '한 번이라도 시도했거나 완료한 저장 문항의 quizKey 교체를 거부해야 한다.',
);

// 퀴즈 제출도 원본 답과 requestId를 submitQuiz 서버 action에 보내고,
// 서버의 정답·보상·최신 상태만 브라우저 상태에 반영한다.
assert.match(serverCore, /SUBMIT_QUIZ_ACTION\s*=\s*['"]submitQuiz['"]/);
assert.match(serverCore, /SKIP_QUIZ_ACTION\s*=\s*['"]skipQuiz['"]/);
assert.match(
    serverCore,
    /action\s*===\s*SUBMIT_QUIZ_ACTION[\s\S]*Number\.isInteger\(selectedIndex\)[\s\S]*selectedIndex[\s\S]*(?:<\s*0|>=?\s*4)/,
    '서버 parser가 submitQuiz selectedIndex 0~3 정수 범위를 확인해야 한다.',
);
for (const field of ['progressKey', 'quizKey', 'selectedIndex', 'attemptSlot']) {
    assert.match(
        serverCore,
        new RegExp(`action\\s*===\\s*SUBMIT_QUIZ_ACTION[\\s\\S]*\\b${field}\\b`),
        `submitQuiz 요청에 ${field}가 필요하다.`,
    );
}
for (const field of ['progressKey', 'quizKey']) {
    assert.match(
        serverCore,
        new RegExp(`action\\s*===\\s*SKIP_QUIZ_ACTION[\\s\\S]*\\b${field}\\b`),
        `skipQuiz 요청에 ${field}가 필요하다.`,
    );
}

assert.match(client, /callPlatformApi\(['"]submitQuiz['"],\s*payload,\s*\{ \.\.\.options, requestId \}\)/);
assert.match(client, /\.then\(result\s*=>\s*validateSubmitQuizResponse\(payload, result, requestId\)\)/);
assert.match(client, /callPlatformApi\(['"]skipQuiz['"],\s*payload,\s*\{ \.\.\.options, requestId \}\)/);
assert.match(client, /\.then\(result\s*=>\s*validateSkipQuizResponse\(payload, result, requestId\)\)/);
for (const args of [
    ['', 'genesis-1-1', 0, 1],
    ['r0_d1', 'genesis-1-1', 0, 1],
    ['r1_d366', 'genesis-1-1', 0, 1],
    ['r1_d1', '', 0, 1],
    ['r1_d1', 'bad key', 0, 1],
    ['r1_d1', 'genesis-1-1', -1, 1],
    ['r1_d1', 'genesis-1-1', 4, 1],
    ['r1_d1', 'genesis-1-1', 1.5, 1],
    ['r1_d1', 'genesis-1-1', 0, 0],
    ['r1_d1', 'genesis-1-1', 0, 3],
    ['r1_d1', 'genesis-1-1', 0, 1.5],
]) {
    assert.throws(
        () => platformApi.submitQuiz(...args),
        error => error instanceof platformApi.PlatformApiError
            && error.code === 'INVALID_PAYLOAD'
            && error.status === 0
            && error.retryable === false,
        `잘못된 퀴즈 제출 입력(${JSON.stringify(args)})은 네트워크 전에 거부해야 한다.`,
    );
}
for (const args of [
    ['', 'genesis-1-1'],
    ['r0_d1', 'genesis-1-1'],
    ['r1_d366', 'genesis-1-1'],
    ['r1_d1', ''],
    ['r1_d1', 'bad key'],
]) {
    assert.throws(
        () => platformApi.skipQuiz(...args),
        error => error instanceof platformApi.PlatformApiError
            && error.code === 'INVALID_PAYLOAD'
            && error.status === 0
            && error.retryable === false,
        `잘못된 퀴즈 건너뛰기 입력(${JSON.stringify(args)})은 네트워크 전에 거부해야 한다.`,
    );
}

assert.match(quizCard, /import\s*\{[^}]*PlatformApiError[^}]*skipQuiz[^}]*submitQuiz[^}]*\}\s*from\s*['"]\.\.\/\.\.\/utils\/platformApi['"]/);
assert.match(
    quizCard,
    /import\s*\{[^}]*clearActivityRequest[^}]*getOrCreateQuizActivityRequest[^}]*getOrCreateQuizSkipActivityRequest[^}]*\}\s*from\s*['"]\.\.\/\.\.\/utils\/userActivityRequests['"]/,
);
const skipTodayStart = quizCard.indexOf('const skipToday = async () => {');
const skipTodayEnd = quizCard.indexOf('const submitAnswer = async () => {', skipTodayStart);
assert.ok(skipTodayStart >= 0 && skipTodayEnd > skipTodayStart, 'skipToday 서버 저장 구간이 필요하다.');
const skipTodayContract = quizCard.slice(skipTodayStart, skipTodayEnd);
assert.match(skipTodayContract, /getOrCreateQuizSkipActivityRequest\([\s\S]*uid:\s*submittedUid[\s\S]*progressKey[\s\S]*quizKey/);
assert.match(
    skipTodayContract,
    /await skipQuiz\([\s\S]*activityRequest\.payload\.progressKey[\s\S]*activityRequest\.payload\.quizKey[\s\S]*requestId:\s*activityRequest\.requestId[\s\S]*expectedUid:\s*submittedUid/,
    'skipQuiz에는 저장된 원본 payload·requestId와 제출 계정 UID를 보내야 한다.',
);
assert.match(skipTodayContract, /clearActivityRequest\(activityRequest\)/);
assert.match(skipTodayContract, /submissionStillCurrent\([\s\S]*submittedUid,[\s\S]*submittedEpoch,[\s\S]*submittedProgressKey,[\s\S]*submittedQuizConfigurationKey,[\s\S]*submittedRosterOrgId/);
assert.match(skipTodayContract, /freshUser = await loadCanonicalUserStateFromServer\(submittedUid\)/);
assert.match(skipTodayContract, /setCurrentUser\(freshUser\)/);
assert.match(skipTodayContract, /getQuizConfigurationKey\(freshConfigurationUser\) !== submittedQuizConfigurationKey/);
assert.match(skipTodayContract, /userAllowsQuizProgressKey\([\s\S]*response\.calendarDate/);
assert.match(skipTodayContract, /freshUser\.quizProgress\?\.\[submittedProgressKey\]/);
assert.ok(
    skipTodayContract.indexOf('clearActivityRequest(activityRequest)')
        < skipTodayContract.indexOf('freshUser = await loadCanonicalUserStateFromServer(submittedUid)'),
    '결정적 skip requestId를 정리한 뒤 source-server sync를 수행해야 한다.',
);
assert.doesNotMatch(
    skipTodayContract,
    /db\.collection\s*\(|db\.runTransaction\s*\(|\btransaction\.(?:get|set|update|delete)\s*\(|setCurrentUser\([^)]*=>|updateRosterTalents/,
    'skipToday가 브라우저 Firestore 쓰기로 제출 결과를 덮어쓰면 안 된다.',
);
const submitAnswerStart = quizCard.indexOf('const submitAnswer = async () => {');
const submitAnswerEnd = quizCard.indexOf('const currentProgress =', submitAnswerStart);
assert.ok(submitAnswerStart >= 0 && submitAnswerEnd > submitAnswerStart, 'submitAnswer 서버 저장 구간이 필요하다.');
const submitAnswerContract = quizCard.slice(submitAnswerStart, submitAnswerEnd);
assert.match(
    submitAnswerContract,
    /getOrCreateQuizActivityRequest\([\s\S]*attemptSlot:\s*Number\(attempts\) \+ 1[\s\S]*selectedIndex/,
    '퀴즈 시도 슬롯과 최초 답을 멱등 요청에 고정해야 한다.',
);
assert.match(
    submitAnswerContract,
    /await submitQuiz\([\s\S]*payload\.progressKey[\s\S]*payload\.quizKey[\s\S]*payload\.selectedIndex[\s\S]*payload\.attemptSlot[\s\S]*\{ requestId, expectedUid:\s*submittedUid \}/,
    'submitQuiz에는 저장된 원본 payload·requestId와 제출 계정 UID를 보내야 한다.',
);
assert.match(submitAnswerContract, /clearActivityRequest\(activityRequest\)/);
assert.match(submitAnswerContract, /submissionStillCurrent\([\s\S]*submittedUid,[\s\S]*submittedEpoch,[\s\S]*submittedProgressKey,[\s\S]*submittedQuizConfigurationKey,[\s\S]*submittedRosterOrgId/);
assert.match(submitAnswerContract, /freshUser = await loadCanonicalUserStateFromServer\(submittedUid\)/);
assert.match(submitAnswerContract, /setCurrentUser\(freshUser\)/);
assert.match(submitAnswerContract, /getQuizConfigurationKey\(freshConfigurationUser\) !== submittedQuizConfigurationKey/);
assert.match(submitAnswerContract, /userAllowsQuizProgressKey\([\s\S]*response\.calendarDate/);
assert.match(submitAnswerContract, /freshUser\.quizProgress\?\.\[submittedProgressKey\]/);
assert.ok(
    submitAnswerContract.indexOf('clearActivityRequest(activityRequest)')
        < submitAnswerContract.indexOf('freshUser = await loadCanonicalUserStateFromServer(submittedUid)'),
    '결정적 submit requestId를 정리한 뒤 source-server sync를 수행해야 한다.',
);
assert.match(
    submitAnswerContract,
    /outcomeUncertain[\s\S]*e\.retryable === true[\s\S]*e\.status >= 200 && e\.status < 300/,
    '결과가 불확실한 퀴즈 오류는 같은 requestId와 최초 답을 보존해야 한다.',
);
assert.doesNotMatch(
    submitAnswerContract,
    /previewQuizSubmission|compareQuizSubmissionShadow|\[quiz-shadow\]|db\.runTransaction\s*\(|\btransaction\.(?:get|set|update|delete)\s*\(|setCurrentUser\([^)]*=>|updateRosterTalents/,
    'submitAnswer가 shadow나 브라우저 Firestore transaction으로 퀴즈·지갑을 확정하면 안 된다.',
);

const validQuizPayload = {
    progressKey: 'r2_d10', quizKey: 'genesis-1-1', selectedIndex: 0, attemptSlot: 1,
};
const validQuizProgress = {
    attempts: 1,
    solved: true,
    skipped: false,
    quizKey: validQuizPayload.quizKey,
    reward: 10,
    updatedDate: readCalendarDate,
};
const validSubmitQuizResponse = {
    ok: true,
    action: 'submitQuiz',
    requestId: quizRequestId,
    calendarDate: readCalendarDate,
    alreadyCompleted: false,
    result: {
        status: 'ready',
        attempts: 1,
        solved: true,
        skipped: false,
        isCorrect: true,
        reward: 10,
        quizKey: validQuizPayload.quizKey,
        entry: { ...validQuizProgress },
        rewardsUserWallet: true,
        rewardedRosterOrgIds: [],
    },
    state: {
        progressKey: validQuizPayload.progressKey,
        progress: { ...validQuizProgress },
        quizRewardDate: readCalendarDate,
        quizRewardAmount: 10,
        userTalent: 21,
        rosterTalents: [],
    },
};
assert.deepEqual(
    platformApi.validateSubmitQuizResponse(validQuizPayload, validSubmitQuizResponse, quizRequestId),
    validSubmitQuizResponse,
);
const validNonterminalReplay = structuredClone(validSubmitQuizResponse);
validNonterminalReplay.alreadyCompleted = true;
validNonterminalReplay.result = {
    status: 'ready',
    attempts: 1,
    solved: false,
    skipped: false,
    isCorrect: false,
    reward: 0,
    quizKey: validQuizPayload.quizKey,
    entry: {
        attempts: 1,
        solved: false,
        skipped: false,
        quizKey: validQuizPayload.quizKey,
        reward: 0,
        updatedDate: readCalendarDate,
    },
    rewardsUserWallet: false,
    rewardedRosterOrgIds: [],
};
validNonterminalReplay.state.progress = {
    attempts: 2,
    solved: true,
    skipped: false,
    quizKey: validQuizPayload.quizKey,
    reward: 5,
    updatedDate: readCalendarDate,
};
validNonterminalReplay.state.quizRewardAmount = 5;
assert.deepEqual(
    platformApi.validateSubmitQuizResponse(validQuizPayload, validNonterminalReplay, quizRequestId),
    validNonterminalReplay,
    '첫 오답 replay는 서버가 반환한 정상 2차 진행 상태를 허용해야 한다.',
);
for (const mutate of [
    response => { response.answerIndex = 0; },
    response => { response.requestId = readRequestId; },
    response => { response.calendarDate = '2026-07-16'; },
    response => { response.state.progress.reward = 5; },
    response => { response.state.progress.attempts = 3; },
    response => { response.state.quizRewardDate = null; },
    response => {
        response.result.reward = 7;
        response.result.entry.reward = 7;
        response.state.progress.reward = 7;
        response.state.quizRewardAmount = 7;
    },
    response => {
        response.alreadyCompleted = true;
        response.state.progress = {
            attempts: 0,
            solved: false,
            skipped: true,
            quizKey: validQuizPayload.quizKey,
            reward: 0,
            updatedDate: readCalendarDate,
        };
    },
    response => { response.state.userTalent = 1_000_000_001; },
    response => { response.result.rewardedRosterOrgIds = ['z-org', 'a-org']; },
]) {
    const response = structuredClone(validSubmitQuizResponse);
    mutate(response);
    assert.throws(
        () => platformApi.validateSubmitQuizResponse(validQuizPayload, response, quizRequestId),
        error => error instanceof platformApi.PlatformApiError
            && error.code === 'INVALID_RESPONSE'
            && error.status === 200
            && error.retryable === true,
        '퀴즈 2xx 응답의 키·식별자·날짜·보상·상태 불일치는 fail-closed여야 한다.',
    );
}

const validSkipQuizPayload = { progressKey: 'r2_d10', quizKey: 'genesis-1-1' };
const validSkipQuizProgress = {
    attempts: 0,
    solved: false,
    skipped: true,
    quizKey: validSkipQuizPayload.quizKey,
    reward: 0,
    updatedDate: readCalendarDate,
};
const validSkipQuizResponse = {
    ok: true,
    action: 'skipQuiz',
    requestId: secondSkipRequestId,
    calendarDate: readCalendarDate,
    alreadyCompleted: false,
    committed: true,
    state: {
        progressKey: validSkipQuizPayload.progressKey,
        progress: { ...validSkipQuizProgress },
    },
};
assert.deepEqual(
    platformApi.validateSkipQuizResponse(
        validSkipQuizPayload,
        validSkipQuizResponse,
        secondSkipRequestId,
    ),
    validSkipQuizResponse,
);
for (const mutate of [
    response => { response.extra = true; },
    response => { response.requestId = quizRequestId; },
    response => { response.calendarDate = '2026-07-16'; },
    response => { response.state.progress.attempts = 2; },
    response => { response.state.progress.skipped = false; },
    response => { response.state.progress.updatedDate = 'Wed Jul 15 2026'; },
]) {
    const response = structuredClone(validSkipQuizResponse);
    mutate(response);
    assert.throws(
        () => platformApi.validateSkipQuizResponse(validSkipQuizPayload, response, secondSkipRequestId),
        error => error instanceof platformApi.PlatformApiError
            && error.code === 'INVALID_RESPONSE'
            && error.status === 200
            && error.retryable === true,
        '퀴즈 건너뛰기 2xx 응답의 키·식별자·날짜·상태 불일치는 fail-closed여야 한다.',
    );
}

const sharedContracts = {
    'supabase/functions/_shared/cors.ts': ['ALLOWED_ORIGINS', 'isAllowedOrigin', 'handleCors', 'jsonResponse'],
    'supabase/functions/_shared/errors.ts': ['PlatformError', 'ERROR_DEFINITIONS', 'errorPayload'],
    'supabase/functions/_shared/time.ts': ['getServiceDateKst', 'getCalendarDateKst', 'getLegacyCalendarDateStringKst'],
    'supabase/functions/_shared/firebase.ts': ['verifyFirebaseIdToken', 'getServiceAccessToken'],
    'supabase/functions/_shared/firestore.ts': ['encodeFirestoreValue', 'decodeFirestoreValue', 'getDocument', 'runCollectionGroupQuery', 'beginTransaction', 'commitWrites', 'rollbackTransaction'],
};

for (const [path, exports] of Object.entries(sharedContracts)) {
    assert.equal(exists(path), true, `${path}가 필요하다.`);
    const source = read(path);
    for (const name of exports) assert.match(source, new RegExp(`export (?:const|class|function|type|interface|async function) ${name}\\b`));
}

const readCorePath = 'supabase/functions/platform-api/readCore.ts';
assert.equal(exists(readCorePath), true, `${readCorePath}가 필요하다.`);
const readCore = read(readCorePath);

assert.doesNotMatch(
    readCore,
    /(?:\bfetch\s*\(|\bDeno\.|db\.collection|firebase\.firestore|\bgetDocument\s*\(|\bbeginTransaction\s*\(|\bcommitWrites\s*\(|\brollbackTransaction\s*\(|\bupdateWrite\s*\(|\bdeleteWrite\s*\()/,
    'T123 readCore는 외부 I/O나 Firestore 쓰기가 없는 순수 계산 모듈이어야 한다.',
);

assert.match(serverCore, /PREFLIGHT_ACTION\s*=\s*['"]preflight['"]/);
assert.match(serverCore, /PREVIEW_READ_COMPLETION_ACTION\s*=\s*['"]previewReadCompletion['"]/);
assert.match(serverCore, /parsePlatformApiRequest/);
assert.match(serverIndex, /verifyFirebaseIdToken/);
assert.match(serverIndex, /parsePlatformApiRequest/);
assert.match(serverIndex, /getDocument/);
assert.match(serverIndex, /runCollectionGroupQuery/);
assert.match(serverIndex, /\{\s*limit:\s*4\s*\}/);
assert.match(serverIndex, /calculateReadCompletion/);
assert.match(serverIndex, /loadPreviewTalentRouting\(/);
assert.match(serverIndex, /\bresult\b/);

for (const [label, branchStart, branchEnd] of [
    ['읽기', serverIndex.indexOf('if (parsed.action === "previewReadCompletion")'), serverIndex.indexOf('if (parsed.action === "previewQuizSubmission")')],
    ['퀴즈', serverIndex.indexOf('if (parsed.action === "previewQuizSubmission")'), serverIndex.indexOf('\n    return jsonResponse(origin, 200, {', serverIndex.indexOf('if (parsed.action === "previewQuizSubmission")'))],
]) {
    const responseStart = serverIndex.indexOf('return jsonResponse(origin, 200, {', branchStart);
    const responseEnd = serverIndex.indexOf('\n      });', responseStart);
    assert.ok(branchStart >= 0 && branchEnd > branchStart && responseStart > branchStart && responseEnd > responseStart, `${label} preview 응답 분기가 필요하다.`);
    const response = serverIndex.slice(responseStart, responseEnd);
    assert.doesNotMatch(
        response,
        /\b(?:uid|role|rosterCount|orgId|churchId|organizationId|organizationIds|documentPath|path|balance|talentShop|settings|answerIndex|indexRecord|allowed|userTalent|rosterTalentByOrgId)\b\s*[:,]/,
        `${label} preview 응답에 사용자 식별자, 조직·경로·잔액·설정·정답 정보를 노출하면 안 된다.`,
    );
}

assert.match(readCore, /const baseTalentEarned = isFirstReadToday/);
assert.match(readCore, /accountUsesDirectWallet && talentRouting\.directCanEarnTalent/);
assert.match(readCore, /rosterCanEarnTalent:\s*boolean/);
assert.match(readCore, /const talentProgramEnabled = directCanEarnTalent \|\| rosterCanEarnTalent/);
assert.match(readCore, /const talentEarned = talentProgramEnabled \? baseTalentEarned : 0/);
assert.match(readCore, /if \(directCanEarnTalent\) \{[\s\S]*updateData\.talent/);
assert.match(readCore, /talentProgramEnabled,/);

assert.match(quizCore, /const baseReward = !isCorrect \|\| rewardAlready/);
assert.match(quizCore, /accountUsesDirectWallet && input\.talentRouting\.directCanEarnTalent/);
assert.match(quizCore, /const reward = directCanEarnTalent \|\| rosterCanEarnTalent \? baseReward : 0/);
assert.match(quizCore, /entry = \{[\s\S]*reward,[\s\S]*updatedDate/);
assert.match(quizCore, /rewardsUserWallet:\s*directCanEarnTalent/);

// 기존 preview는 무쓰기 진단 경로로만 남고, 실제 저장은 아래 전용 service action이 맡는다.
const readPreviewStart = serverIndex.indexOf('if (parsed.action === "previewReadCompletion")');
const readPreviewEnd = serverIndex.indexOf('if (parsed.action === "previewQuizSubmission")', readPreviewStart);
assert.ok(readPreviewStart >= 0 && readPreviewEnd > readPreviewStart, '읽기 preview 분기가 필요하다.');
assert.doesNotMatch(
    serverIndex.slice(readPreviewStart, readPreviewEnd),
    /\b(?:beginTransaction|commitWrites|rollbackTransaction|updateWrite|deleteWrite)\s*\(/,
    '읽기 preview는 Firestore를 쓰지 않아야 한다.',
);

const readCompletionServicePath = 'supabase/functions/platform-api/readCompletionService.ts';
const readCompletionServiceTestPath = 'supabase/functions/platform-api/readCompletionService_test.ts';
const restartReadingServicePath = 'supabase/functions/platform-api/restartReadingService.ts';
const restartReadingServiceTestPath = 'supabase/functions/platform-api/restartReadingService_test.ts';
const quizSubmissionPath = 'supabase/functions/platform-api/quizSubmission.ts';
const quizSubmissionTestPath = 'supabase/functions/platform-api/quizSubmission_test.ts';
for (const path of [
    readCompletionServicePath,
    readCompletionServiceTestPath,
    restartReadingServicePath,
    restartReadingServiceTestPath,
    quizSubmissionPath,
    quizSubmissionTestPath,
]) assert.equal(exists(path), true, `${path}가 필요하다.`);
const readCompletionService = read(readCompletionServicePath);
const restartReadingService = read(restartReadingServicePath);
const quizSubmission = read(quizSubmissionPath);
assert.match(serverCore, /COMPLETE_READ_ACTION\s*=\s*['"]completeRead['"]/);
assert.match(serverCore, /RESTART_READING_ACTION\s*=\s*['"]restartReading['"]/);
for (const field of ['cycle', 'day']) {
    assert.match(
        serverCore,
        new RegExp(`action\\s*===\\s*COMPLETE_READ_ACTION[\\s\\S]*\\b${field}\\b`),
        `completeRead 요청에 ${field}가 필요하다.`,
    );
}
assert.match(serverCore, /COMPLETE_READ_ACTION[\s\S]*new Set\(\["action", "requestId", "cycle", "day", "readingEpoch"\]\)/);
assert.match(serverCore, /RESTART_READING_ACTION[\s\S]*new Set\(\[[\s\S]*"readingEpoch"[\s\S]*\]\)/);
assert.match(serverCore, /SUBMIT_QUIZ_ACTION[\s\S]*new Set\(\[[\s\S]*"selectedIndex"[\s\S]*"attemptSlot"[\s\S]*\]\)/);
assert.match(serverCore, /SKIP_QUIZ_ACTION[\s\S]*new Set\(\["action", "requestId", "progressKey", "quizKey"\]\)/);
assert.match(
    serverIndex,
    /import \{ completeReadTransaction \} from "\.\/readCompletionService\.ts";/,
);
assert.match(serverIndex, /import \{ restartReading \} from "\.\/restartReadingService\.ts";/);
assert.match(serverIndex, /import \{ skipQuiz, submitQuiz \} from "\.\/quizSubmission\.ts";/);

const completeReadBranchStart = serverIndex.indexOf('if (parsed.action === "completeRead")');
const restartReadingBranchStart = serverIndex.indexOf('if (parsed.action === "restartReading")', completeReadBranchStart);
const submitQuizBranchStart = serverIndex.indexOf('if (parsed.action === "submitQuiz")', restartReadingBranchStart);
const skipQuizBranchStart = serverIndex.indexOf('if (parsed.action === "skipQuiz")', submitQuizBranchStart);
const activityBranchEnd = serverIndex.indexOf('const role = normalizeRole', skipQuizBranchStart);
assert.ok(
    completeReadBranchStart >= 0 && restartReadingBranchStart > completeReadBranchStart
        && submitQuizBranchStart > restartReadingBranchStart
        && skipQuizBranchStart > submitQuizBranchStart && activityBranchEnd > skipQuizBranchStart,
    '인증 사용자 확인 뒤 completeRead·restartReading·submitQuiz·skipQuiz action 분기가 필요하다.',
);
const completeReadBranch = serverIndex.slice(completeReadBranchStart, restartReadingBranchStart);
const restartReadingBranch = serverIndex.slice(restartReadingBranchStart, submitQuizBranchStart);
const submitQuizBranch = serverIndex.slice(submitQuizBranchStart, skipQuizBranchStart);
const skipQuizBranch = serverIndex.slice(skipQuizBranchStart, activityBranchEnd);
assert.match(
    completeReadBranch,
    /completeReadTransaction\(service, verifiedUser, \{[\s\S]*requestId:\s*parsed\.requestId[\s\S]*cycle:\s*parsed\.cycle[\s\S]*day:\s*parsed\.day[\s\S]*readingEpoch:\s*parsed\.readingEpoch/,
);
assert.match(completeReadBranch, /action:\s*parsed\.action[\s\S]*requestId:\s*parsed\.requestId[\s\S]*\.\.\.result/);
assert.match(
    restartReadingBranch,
    /restartReading\(service, verifiedUser, \{[\s\S]*requestId:\s*parsed\.requestId[\s\S]*cycle:\s*parsed\.cycle[\s\S]*day:\s*parsed\.day[\s\S]*readingEpoch:\s*parsed\.readingEpoch/,
);
assert.match(restartReadingBranch, /action:\s*parsed\.action[\s\S]*requestId:\s*parsed\.requestId[\s\S]*\.\.\.result/);
assert.match(
    submitQuizBranch,
    /submitQuiz\(service, \{[\s\S]*uid,[\s\S]*requestId:\s*parsed\.requestId[\s\S]*progressKey:\s*parsed\.progressKey[\s\S]*quizKey:\s*parsed\.quizKey[\s\S]*selectedIndex:\s*parsed\.selectedIndex[\s\S]*attemptSlot:\s*parsed\.attemptSlot/,
);
assert.match(
    skipQuizBranch,
    /skipQuiz\(service, \{[\s\S]*uid,[\s\S]*requestId:\s*parsed\.requestId[\s\S]*progressKey:\s*parsed\.progressKey[\s\S]*quizKey:\s*parsed\.quizKey/,
);

for (const [label, source] of [
    ['읽기', readCompletionService],
    ['재시작', restartReadingService],
    ['퀴즈', quizSubmission],
]) {
    assert.match(source, /activityActions\/\$\{input\.requestId\}/, `${label} service에 사용자 하위 멱등 ledger가 필요하다.`);
    assert.match(source, /beginTransaction\(/, `${label} service가 서버 transaction을 시작해야 한다.`);
    assert.match(source, /commitWrites\(/, `${label} service가 ledger와 상태를 한 transaction으로 커밋해야 한다.`);
    assert.match(source, /alreadyCompleted:\s*true/, `${label} service가 requestId replay를 명시해야 한다.`);
}
for (const pattern of [
    /readingEpoch/,
    /currentDay:\s*1/,
    /score:\s*0/,
    /streak:\s*0/,
    /lastReadDate:\s*null/,
    /activityActions\/\$\{input\.requestId\}/,
    /parseRosterTalentWallets\(/,
    /MAX_TRANSACTION_ATTEMPTS\s*=\s*3/,
]) assert.match(restartReadingService, pattern);
assert.doesNotMatch(restartReadingService, /history\/\$\{input\.requestId\}/, '재시작은 읽기 이력 문서를 만들면 안 된다.');
assert.match(readCompletionService, /readingEpoch/);
assert.match(quizSubmission, /readingEpoch/);
assert.match(quizSubmission, /quizAttemptSlots\/\$\{input\.progressKey\}_a1/);
assert.match(
    firestoreRules,
    /match \/activityActions\/\{requestId\}\s*\{\s*allow read, write: if false;\s*\}/,
    'activityActions ledger는 브라우저 사용자·관리자 모두 직접 접근할 수 없어야 한다.',
);
assert.match(
    firestoreRules,
    /match \/quizAttemptSlots\/\{slotId\}\s*\{\s*allow read, write: if false;\s*\}/,
    'quizAttemptSlots 의미 기반 ledger는 브라우저 사용자·관리자 모두 직접 접근할 수 없어야 한다.',
);
assert.match(
    firestoreRules,
    /function isPersonalPrimaryRoster\(churchId, memberUid\)[\s\S]*let before = get\([\s\S]*let after = getAfter\([\s\S]*before\.get\('accountType', null\) == 'personal'[\s\S]*before\.get\('primaryOrgId', null\) == churchId[\s\S]*after\.get\('accountType', null\) == 'personal'[\s\S]*after\.get\('primaryOrgId', null\) == churchId/,
    '개인 계정의 기본 명부를 users 원장으로 판별해야 한다.',
);
assert.match(
    firestoreRules,
    /allow delete: if !isPersonalPrimaryRoster\(churchId, memberUid\)[\s\S]*resource\.data\.get\('talent', 0\) == 0[\s\S]*request\.auth\.uid == memberUid[\s\S]*isChurchAdmin\(churchId\)[\s\S]*isPlatformAdmin\(\)/,
    '개인 계정의 기본 명부는 본인·공동체 관리자·플랫폼 관리자 브라우저 삭제를 모두 막아야 한다.',
);
assert.match(
    membershipCardSource,
    /transaction\.get\(rosterRef\)[\s\S]*latestTalent > 0[\s\S]*달란트[^\n]*남아 있어 탈퇴할 수 없어요/,
    '본인 탈퇴는 source transaction의 최신 secondary roster 잔액이 0일 때만 삭제해야 한다.',
);
assert.match(
    churchAdminSource,
    /executeExpelRosterMember[\s\S]*transaction\.get\(rosterRef\)[\s\S]*latestTalent > 0[\s\S]*남아 있어 제명할 수 없습니다/,
    '관리자 제명도 source transaction의 최신 secondary roster 잔액이 0일 때만 삭제해야 한다.',
);
assert.match(
    firestoreRules,
    /before\.get\('talentMigrated', false\) == true[\s\S]*after\.get\('talentMigrated', false\) == true[\s\S]*afterTalent == beforeTalent[\s\S]*afterScore == beforeScore/,
    '이관 완료 users의 self 쓰기는 users.score/talent를 완전히 동결해야 한다.',
);
assert.doesNotMatch(
    firestoreRules,
    /!wasMigrated|!isMigrated|afterTalent == beforeScore|afterScore >= beforeScore/,
    '백필 완료 뒤 legacy false→true 이관 분기는 제거해야 한다.',
);
assert.doesNotMatch(
    firestoreRules,
    /afterTalent <= beforeTalent \+ 17|afterScore <= beforeScore \+ 15/,
    '일반 공동체 users의 true→true 호환 보상 상한은 최종 차단 뒤 남으면 안 된다.',
);
const t127RosterUpdateRules = firestoreRules.match(
    /match \/roster\/\{memberUid\} \{([\s\S]*?)\n        allow delete/,
)?.[1] || '';
assert.match(
    t127RosterUpdateRules,
    /get\('score', 0\) == resource\.data\.get\('score', 0\)[\s\S]*get\('talent', 0\) == resource\.data\.get\('talent', 0\)[\s\S]*get\('currentDay', 1\) == resource\.data\.get\('currentDay', 1\)/,
    '모든 roster score/talent/진도를 브라우저에서 exact-freeze해야 한다.',
);
assert.doesNotMatch(
    t127RosterUpdateRules,
    /\+ 15|\+ 17/,
    '일반 공동체 roster의 구버전 호환 상한은 최종 차단 뒤 남으면 안 된다.',
);
assert.match(quizSubmission, /quizAttemptSlots\/\$\{input\.progressKey\}_a1/);
assert.match(quizSubmission, /quizAttemptSlots\/\$\{input\.progressKey\}_a2/);
assert.match(quizSubmission, /quizAttemptSlots\/\$\{input\.progressKey\}_skip/);
assert.match(quizSubmission, /action:\s*SKIP_QUIZ_ACTION/);
assert.match(quizSubmission, /quizProgress\.\$\{input\.progressKey\}/);
assert.match(quizSubmission, /sameProgress\(semantic\.skip\.progress, replay\.progress\)/);
assert.match(quizSubmission, /repairCanonicalProgress\(canonicalProgress\)/);

// 운영 로그는 action 결과와 지연만 남기며 사용자·조직·답·지갑·요청 본문은 기록하지 않는다.
const successLogStart = serverIndex.indexOf('console.info(\n      "platform-api action"');
const successLogEnd = serverIndex.indexOf('\n    );', successLogStart);
assert.ok(successLogStart >= 0 && successLogEnd > successLogStart, '성공 action 관측 로그가 필요하다.');
const successLog = serverIndex.slice(successLogStart, successLogEnd);
const successLogKeys = Array.from(
    successLog.matchAll(/\b(action|outcome|status|replay|pending|latencyMs)\b\s*(?=[:,])/g),
    match => match[1],
);
assert.deepEqual(
    [...new Set(successLogKeys)].sort(),
    ['action', 'outcome', 'status', 'replay', 'pending', 'latencyMs'].sort(),
    '성공 관측 로그는 action·결과·상태·지연 필드만 가져야 한다.',
);
assert.doesNotMatch(
    successLog,
    /\b(?:uid|requestId|payload|selectedIndex|quizKey|answerIndex|talent|orgId|churchId|entryCode)\b/,
    '성공 관측 로그에 PII·요청·정답·조직·지갑 정보를 포함하면 안 된다.',
);
const failureLogStart = serverIndex.indexOf('console.error(\n      "platform-api action"');
const failureLogEnd = serverIndex.indexOf('\n    );', failureLogStart);
assert.ok(failureLogStart >= 0 && failureLogEnd > failureLogStart, '실패 action 관측 로그가 필요하다.');
const failureLog = serverIndex.slice(failureLogStart, failureLogEnd);
const failureLogKeys = Array.from(
    failureLog.matchAll(/\b(action|outcome|code|latencyMs)\b\s*(?=[:,])/g),
    match => match[1],
);
assert.deepEqual(
    [...new Set(failureLogKeys)].sort(),
    ['action', 'outcome', 'code', 'latencyMs'].sort(),
    '실패 관측 로그는 action·결과·오류코드·지연 필드만 가져야 한다.',
);
assert.doesNotMatch(
    failureLog,
    /\b(?:uid|requestId|payload|selectedIndex|quizKey|answerIndex|talent|orgId|churchId|entryCode)\b/,
    '실패 관측 로그에 PII·요청·정답·조직·지갑 정보를 포함하면 안 된다.',
);

const memberSignupCorePath = 'supabase/functions/platform-api/memberSignupCore.ts';
const memberSignupCoreTestPath = 'supabase/functions/platform-api/memberSignupCore_test.ts';
assert.equal(exists(memberSignupCorePath), true, `${memberSignupCorePath}가 필요하다.`);
assert.equal(exists(memberSignupCoreTestPath), true, `${memberSignupCoreTestPath}가 필요하다.`);
const memberSignupCore = read(memberSignupCorePath);
assert.doesNotMatch(
    memberSignupCore,
    /(?:\bfetch\s*\(|\bDeno\.|db\.collection|firebase\.firestore|\bgetDocument\s*\(|\bbeginTransaction\s*\(|\bcommitWrites\s*\(|\brollbackTransaction\s*\()/,
    'memberSignupCore는 외부 I/O가 없는 순수 검증 모듈이어야 한다.',
);
assert.match(serverCore, /COMPLETE_MEMBER_SIGNUP_ACTION\s*=\s*['"]completeMemberSignup['"]/);
for (const field of ['churchId', 'entryCode', 'name', 'birthdate', 'guestProgress']) {
    assert.match(serverCore, new RegExp(`action\\s*===\\s*COMPLETE_MEMBER_SIGNUP_ACTION[\\s\\S]*\\b${field}\\b`));
}
const signupBranchStart = serverIndex.indexOf('if (parsed.action === "completeMemberSignup")');
const firstUserRead = serverIndex.indexOf('const userDocument = await getDocument<UserDocument>');
assert.ok(signupBranchStart >= 0 && firstUserRead > signupBranchStart, '최초 가입은 users 존재 검사보다 먼저 처리해야 한다.');
const signupBranch = serverIndex.slice(signupBranchStart, firstUserRead);
for (const pattern of [
    /beginTransaction\(/,
    /getDocument<MemberSignupUser>/,
    /getDocument<MemberSignupChurch>/,
    /getDocument<MemberSignupConsent>/,
    /resolveJoinCredential\(service,/,
    /validateMemberSignup\(/,
    /updateWrite\(service\.projectId, userPath/,
    /commitWrites\(/,
]) assert.match(signupBranch, pattern);
assert.match(client, /callPlatformApi\(['"]completeMemberSignup['"],\s*\{/);

const personalSignupCorePath = 'supabase/functions/platform-api/personalSignupCore.ts';
const personalSignupCoreTestPath = 'supabase/functions/platform-api/personalSignupCore_test.ts';
assert.equal(exists(personalSignupCorePath), true, `${personalSignupCorePath}가 필요하다.`);
assert.equal(exists(personalSignupCoreTestPath), true, `${personalSignupCoreTestPath}가 필요하다.`);
const personalSignupCore = read(personalSignupCorePath);
assert.doesNotMatch(personalSignupCore, /(?:\bfetch\s*\(|\bDeno\.|db\.collection|firebase\.firestore|\bgetDocument\s*\(|\bbeginTransaction\s*\(|\bcommitWrites\s*\(|\brollbackTransaction\s*\()/);
assert.match(serverCore, /COMPLETE_PERSONAL_SIGNUP_ACTION\s*=\s*['"]completePersonalSignup['"]/);
assert.match(serverIndex, /if \(parsed\.action === "completePersonalSignup"\)[\s\S]*validatePersonalSignup\([\s\S]*updateWrite\(service\.projectId, userPath[\s\S]*updateWrite\(service\.projectId, rosterPath[\s\S]*commitWrites\(/);
assert.match(client, /callPlatformApi\(['"]completePersonalSignup['"],\s*payload/);
for (const args of [
    { churchId: '', entryCode: '1234', name: '홍길동', birthdate: '20000101' },
    { churchId: 'bad/path', entryCode: '1234', name: '홍길동', birthdate: '20000101' },
    { churchId: 'church-1', entryCode: '123', name: '홍길동', birthdate: '20000101' },
    { churchId: 'church-1', entryCode: '1234', name: '', birthdate: '20000101' },
    { churchId: 'church-1', entryCode: '1234', name: '홍길동', birthdate: '200001' },
]) {
    assert.throws(
        () => platformApi.completeMemberSignup(args),
        error => error instanceof platformApi.PlatformApiError
            && error.code === 'INVALID_PAYLOAD'
            && error.status === 0,
        `잘못된 최초 교인 가입 입력(${JSON.stringify(args)})은 네트워크 전에 거부해야 한다.`,
    );
}

const joinCorePath = 'supabase/functions/platform-api/joinCore.ts';
const joinCoreTestPath = 'supabase/functions/platform-api/joinCore_test.ts';
const membershipCardPath = 'src/components/dashboard/CommunityMembershipCard.jsx';
assert.equal(exists(joinCorePath), true, `${joinCorePath}가 필요하다.`);
assert.equal(exists(joinCoreTestPath), true, `${joinCoreTestPath}가 필요하다.`);
const joinCore = read(joinCorePath);
const membershipCard = read(membershipCardPath);
assert.doesNotMatch(
    joinCore,
    /(?:\bfetch\s*\(|\bDeno\.|db\.collection|firebase\.firestore|\bgetDocument\s*\(|\bbeginTransaction\s*\(|\bcommitWrites\s*\(|\brollbackTransaction\s*\()/,
    'joinCore는 외부 I/O가 없는 순수 검증 모듈이어야 한다.',
);
assert.match(serverCore, /JOIN_COMMUNITY_ACTION\s*=\s*['"]joinCommunity['"]/);
for (const field of ['churchId', 'entryCode', 'departmentId', 'subgroupId']) {
    assert.match(serverCore, new RegExp(`action\\s*===\\s*JOIN_COMMUNITY_ACTION[\\s\\S]*\\b${field}\\b`));
}
const joinBranchStart = serverIndex.indexOf('if (parsed.action === "joinCommunity")');
const joinBranchEnd = serverIndex.indexOf('if (parsed.action === "previewReadCompletion")', joinBranchStart);
assert.ok(joinBranchStart >= 0 && joinBranchEnd > joinBranchStart, 'joinCommunity 서버 분기가 필요하다.');
const joinBranch = serverIndex.slice(joinBranchStart, joinBranchEnd);
for (const pattern of [
    /beginTransaction\(/,
    /getDocument<JoinCommunityUser>/,
    /getDocument<JoinCommunityChurch>/,
    /runCollectionGroupQuery<Record<string, unknown>>/,
    /validateJoinCommunity\(/,
    /updateWrite\(service\.projectId, rosterPath/,
    /commitWrites\(/,
]) assert.match(joinBranch, pattern);
assert.match(client, /callPlatformApi\(['"]joinCommunity['"],\s*\{/);
for (const args of [
    { churchId: '', entryCode: '1234', departmentId: 'kids' },
    { churchId: 'bad/path', entryCode: '1234', departmentId: 'kids' },
    { churchId: 'church-2', entryCode: '123', departmentId: 'kids' },
    { churchId: 'church-2', entryCode: '1234', departmentId: '' },
]) {
    assert.throws(
        () => platformApi.joinCommunity(args),
        error => error instanceof platformApi.PlatformApiError
            && error.code === 'INVALID_PAYLOAD'
            && error.status === 0,
        `잘못된 공동체 참여 입력(${JSON.stringify(args)})은 네트워크 전에 거부해야 한다.`,
    );
}
assert.match(membershipCard, /issueJoinTicket\(\{[\s\S]*churchId:\s*orgId[\s\S]*entryCode[\s\S]*purpose/);
assert.match(membershipCard, /joinCommunityViaApi\(\{[\s\S]*churchId:\s*orgId[\s\S]*joinTicket[\s\S]*departmentId[\s\S]*subgroupId/);
const clientJoinStart = membershipCard.indexOf('const joinCommunity = async () =>');
const clientLeaveStart = membershipCard.indexOf('const leaveCommunity = async', clientJoinStart);
assert.ok(clientJoinStart >= 0 && clientLeaveStart > clientJoinStart, '추가 공동체 참여 클라이언트 분기가 필요하다.');
assert.doesNotMatch(
    membershipCard.slice(clientJoinStart, clientLeaveStart),
    /(?:rosterRef\.set|transaction\.set\(rosterRef|db\.runTransaction)/,
    '일반 추가 공동체 참여는 roster를 클라이언트에서 직접 쓰면 안 된다.',
);

// T124 관리자 판매·수령·환불: 활성 관리자와 대상 지갑을 서버가 다시
// 검증하고 결과 불명 재전송을 불변 ledger로 멱등 처리해야 한다.
const adminPurchaseCorePath = 'supabase/functions/platform-api/adminPurchaseCore.ts';
const adminPurchaseCoreTestPath = 'supabase/functions/platform-api/adminPurchaseCore_test.ts';
const churchAdminViewPath = 'src/components/ChurchAdminView.jsx';
assert.equal(exists(adminPurchaseCorePath), true, `${adminPurchaseCorePath}가 필요하다.`);
assert.equal(exists(adminPurchaseCoreTestPath), true, `${adminPurchaseCoreTestPath}가 필요하다.`);
const adminPurchaseCore = read(adminPurchaseCorePath);
const churchAdminView = read(churchAdminViewPath);
assert.doesNotMatch(
    adminPurchaseCore,
    /(?:\bfetch\s*\(|\bDeno\.|db\.collection|firebase\.firestore|\bgetDocument\s*\(|\bbeginTransaction\s*\(|\bcommitWrites\s*\()/,
    'adminPurchaseCore는 외부 I/O가 없는 순수 검증 모듈이어야 한다.',
);
for (const action of ['adminCounterSale', 'adminDeliverPurchase', 'adminRefundPurchase']) {
    assert.match(serverCore, new RegExp(`["']${action}["']`));
    assert.match(client, new RegExp(`export const ${action}\\s*=`));
    assert.match(serverIndex, new RegExp(`parsed\\.action === ["']${action}["']`));
}
assert.match(client, /callValidatedAdminTalentAction[\s\S]*validateAdminTalentResponse/);
const counterBranchStart = serverIndex.indexOf('if (parsed.action === "adminCounterSale")');
const deliverBranchStart = serverIndex.indexOf('if (parsed.action === "adminDeliverPurchase")', counterBranchStart);
const refundBranchStart = serverIndex.indexOf('if (parsed.action === "adminRefundPurchase")', deliverBranchStart);
const purchaseBranchStart = serverIndex.indexOf('if (parsed.action === "purchaseItem")', refundBranchStart);
assert.ok(counterBranchStart >= 0 && deliverBranchStart > counterBranchStart
    && refundBranchStart > deliverBranchStart && purchaseBranchStart > refundBranchStart);
const adminBranches = [
    ['판매', serverIndex.slice(counterBranchStart, deliverBranchStart), /validateAdminCounterSale\(/],
    ['수령', serverIndex.slice(deliverBranchStart, refundBranchStart), /validateAdminPurchaseDelivery\(/],
    ['환불', serverIndex.slice(refundBranchStart, purchaseBranchStart), /validateAdminPurchaseRefund\(/],
];
for (const [label, branch, validatorPattern] of adminBranches) {
    for (const pattern of [/beginTransaction\(/, /talentAdminActions\/\$\{parsed\.requestId\}/,
        /requireOrganizationAdmin\(/, /validateAdminPurchaseReplay\(/, validatorPattern,
        /await commitWrites\([\s\S]*updateWrite\(service\.projectId, ledgerPath,[\s\S]*\{ exists: false \}\),[\s\S]*\], \{ transaction \}\);/]) {
        assert.match(branch, pattern, `관리자 ${label} 분기는 자체 transaction·권한 재검증·ledger·commit을 가져야 한다.`);
    }
}
const counterBranch = adminBranches[0][1];
const deliverBranch = adminBranches[1][1];
const refundBranch = adminBranches[2][1];
assert.match(counterBranch, /validateAdminPurchaseReplay\(\{[\s\S]*purchase:\s*existingPurchase\?\.data[\s\S]*user:\s*targetUser\?\.data[\s\S]*roster:\s*targetRoster\?\.data/);
assert.match(deliverBranch, /adminActionRequestId:\s*parsed\.requestId[\s\S]*updateMask:[\s\S]*"adminActionRequestId"/);
assert.match(refundBranch, /migratedWalletConfirmed:\s*parsed\.migratedWalletConfirmed[\s\S]*Promise\.all\(\[[\s\S]*userPath[\s\S]*rosterPath[\s\S]*validateAdminPurchaseRefund\(/);
assert.match(refundBranch, /validateAdminPurchaseReplay\(\{[\s\S]*purchase:\s*purchaseDocument\?\.data[\s\S]*user:\s*replayUser\?\.data[\s\S]*roster:\s*replayRoster\?\.data/);
assert.match(refundBranch, /balanceBefore:[\s\S]*balanceAfter:[\s\S]*result,[\s\S]*at:\s*now/);
assert.match(churchAdminView, /ADMIN_TALENT_REQUEST_STORAGE_PREFIX[\s\S]*getOrCreateAdminTalentRequestId/);
assert.match(churchAdminView, /adminCounterSale\([\s\S]*adminRefundPurchase\([\s\S]*adminDeliverPurchase\(/);
assert.match(churchAdminView, /reconcileAdminTalentRequestIds[\s\S]*purchase\.requestId, purchase\.adminActionRequestId/);
const purchaseStatusBranch = churchAdminView.slice(
    churchAdminView.indexOf('const updatePurchaseStatus = async'),
    churchAdminView.indexOf('const loadMorePendingPurchases = async'),
);
const migratedRefundIndex = purchaseStatusBranch.indexOf("error?.code === 'REFUND_MIGRATION_CONFIRM_REQUIRED'");
const genericConflictIndex = purchaseStatusBranch.indexOf("error?.code === 'CONFLICT'");
assert.ok(migratedRefundIndex >= 0 && genericConflictIndex > migratedRefundIndex,
    '개인 전환 환불 2차 확인은 일반 충돌 안내보다 먼저 처리해야 한다.');
assert.match(churchAdminView, /refundMigratedPurchase[\s\S]*migratedWalletConfirmed/);
assert.match(
    churchAdminView,
    /executeExpelRosterMember[\s\S]*error\?\.code === 'permission-denied'[\s\S]*기본 공동체이거나 달란트 잔액이 남은 명부에서는 제명할 수 없습니다/,
    '기본 또는 양수 잔액 명부 제명이 규칙에 막히면 관리자에게 사유를 안내해야 한다.',
);
assert.doesNotMatch(
    churchAdminView,
    /collection\('talentPurchases'\)\.doc\(\)[\s\S]*transaction\.set\(/,
    '관리자 화면이 구매 문서를 직접 만들면 안 된다.',
);
for (const invalidPrice of [0, -1, 1.5, 1_000_001]) {
    assert.throws(
        () => platformApi.adminCounterSale({
            churchId: 'church-1', memberUid: 'member-1', departmentId: 'adult',
            marketId: 'shared', itemName: '세탁세제', price: invalidPrice,
        }),
        error => error instanceof platformApi.PlatformApiError
            && error.code === 'INVALID_PAYLOAD' && error.status === 0,
    );
}

const adminRequestId = '123e4567-e89b-42d3-a456-426614174000';
const counterPayload = {
    churchId: 'church-1', memberUid: 'member-1', departmentId: 'adult',
    marketId: 'shared', itemName: '세탁세제', price: 7,
};
const validCounterResponse = {
    ok: true, action: 'adminCounterSale', requestId: adminRequestId, alreadyCompleted: false,
    nextTalent: 3, walletKind: 'user',
    purchase: {
        id: adminRequestId, requestId: adminRequestId, uid: 'member-1', status: 'delivered',
        walletKind: 'user', departmentId: 'adult', marketId: 'shared', itemName: '세탁세제', price: 7,
    },
};
assert.equal(
    platformApi.validateAdminTalentResponse(
        'adminCounterSale', counterPayload, validCounterResponse, adminRequestId,
    ),
    validCounterResponse,
);
const invalidAdminResponses = [
    {},
    { ...validCounterResponse, action: 'adminRefundPurchase' },
    { ...validCounterResponse, requestId: '223e4567-e89b-42d3-a456-426614174000' },
    { ...validCounterResponse, alreadyCompleted: 'false' },
    { ...validCounterResponse, nextTalent: 3.5 },
    { ...validCounterResponse, walletKind: 'other' },
    { ...validCounterResponse, purchase: { ...validCounterResponse.purchase, id: 'wrong' } },
    { ...validCounterResponse, purchase: { ...validCounterResponse.purchase, status: 'pending' } },
];
for (const response of invalidAdminResponses) {
    assert.throws(
        () => platformApi.validateAdminTalentResponse(
            'adminCounterSale', counterPayload, response, adminRequestId,
        ),
        error => error instanceof platformApi.PlatformApiError
            && error.code === 'INVALID_RESPONSE' && error.status === 200 && error.retryable === true,
    );
}
for (const [action, payload, response] of [
    ['adminDeliverPurchase', { purchaseId: 'purchase-1' }, {
        ok: true, action: 'adminDeliverPurchase', requestId: adminRequestId, alreadyCompleted: false,
        purchase: { id: 'purchase-1', status: 'delivered', adminActionRequestId: adminRequestId },
    }],
    ['adminRefundPurchase', { purchaseId: 'purchase-1' }, {
        ok: true, action: 'adminRefundPurchase', requestId: adminRequestId, alreadyCompleted: true,
        nextTalent: 10, walletKind: 'roster',
        purchase: {
            id: 'purchase-1', uid: 'member-1', status: 'cancelled', adminActionRequestId: adminRequestId,
        },
    }],
]) {
    assert.equal(platformApi.validateAdminTalentResponse(action, payload, response, adminRequestId), response);
}

const memberPurchasePayload = {
    churchId: 'church-1', itemId: 'item-1', departmentId: 'adult', marketId: 'shared',
};
const validMemberPurchaseResponse = {
    ok: true, action: 'purchaseItem', requestId: adminRequestId, alreadyCompleted: false,
    nextTalent: 9, walletKind: 'user',
    purchase: {
        id: adminRequestId, itemId: 'item-1', departmentId: 'adult', marketId: 'shared',
        status: 'pending', schemaVersion: 2, price: 1,
    },
};
assert.equal(
    platformApi.validatePurchaseItemResponse(
        memberPurchasePayload, validMemberPurchaseResponse, adminRequestId,
    ),
    validMemberPurchaseResponse,
);
for (const response of [
    {},
    { ...validMemberPurchaseResponse, requestId: 'wrong' },
    { ...validMemberPurchaseResponse, nextTalent: 9.5 },
    { ...validMemberPurchaseResponse, purchase: { ...validMemberPurchaseResponse.purchase, price: 1.5 } },
]) {
    assert.throws(
        () => platformApi.validatePurchaseItemResponse(memberPurchasePayload, response, adminRequestId),
        error => error instanceof platformApi.PlatformApiError
            && error.code === 'INVALID_RESPONSE' && error.status === 200 && error.retryable === true,
    );
}
assert.match(client, /callValidatedPurchaseAction[\s\S]*validatePurchaseItemResponse/);

console.log('✅ Round 24 server-authoritative activity + community validation passed');
