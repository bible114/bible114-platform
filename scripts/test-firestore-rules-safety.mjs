#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

const PROJECT_ID = 'bible114-platform';
const allowKnownBlockers = process.argv.includes('--allow-known-blockers');
const rules = fs.readFileSync('firestore.rules', 'utf8');
const firebaseToolsRoot = [
  '/opt/homebrew/lib/node_modules/firebase-tools',
  '/usr/local/lib/node_modules/firebase-tools',
].find(root => fs.existsSync(path.join(root, 'package.json')));
if (!firebaseToolsRoot) throw new Error('Firebase CLI installation not found.');

const require = createRequire(path.join(firebaseToolsRoot, 'package.json'));
const firebaseAuth = require('./lib/auth');
const account = firebaseAuth.getGlobalDefaultAccount();
if (!account?.tokens?.refresh_token) throw new Error('Firebase CLI login not found.');
const scopes = String(
  account.tokens.scope || 'https://www.googleapis.com/auth/cloud-platform',
).split(/\s+/).filter(Boolean);
const tokenResult = await firebaseAuth.getAccessToken(
  account.tokens.refresh_token,
  scopes,
);
const accessToken = tokenResult?.access_token || tokenResult;
if (!accessToken) throw new Error('Unable to obtain Firebase access token.');

const passwordAuth = uid => ({
  uid,
  token: { firebase: { sign_in_provider: 'password' } },
});
const documentPath = value => `/databases/(default)/documents/${value}`;
const getMock = (document, data) => ({
  function: 'get',
  args: [{ exactValue: documentPath(document) }],
  result: { value: { data } },
});
const getAfterMock = (document, data) => ({
  function: 'getAfter',
  args: [{ exactValue: documentPath(document) }],
  result: { value: { data } },
});
const existsMock = (document, value) => ({
  function: 'exists',
  args: [{ exactValue: documentPath(document) }],
  result: { value },
});
const existsAfterMock = (document, value) => ({
  function: 'existsAfter',
  args: [{ exactValue: documentPath(document) }],
  result: { value },
});
const testCase = (label, expectation, request, extra = {}) => ({
  label,
  blocker: false,
  payload: {
    expectation,
    request,
    pathEncoding: 'PLAIN',
    ...extra,
  },
});

const callerUid = 'rules-test-church-admin';
const targetUid = 'rules-test-member';
const churchId = 'rules-test-church';
const privatePath = documentPath(`users/${targetUid}/private/auth`);
const callerData = {
  role: 'churchAdmin',
  churchId,
  isDeleted: false,
};
const targetData = {
  role: 'member',
  churchId,
  isDeleted: false,
  platformStatsReaderCounted: true,
  planId: '1year_revised',
  currentDay: 1,
  readCount: 1,
  score: 8,
  streak: 1,
  lastReadDate: '2026-07-29',
  talent: 25,
  talentMigrated: false,
  talentWalletMigrated: false,
  password: null,
};
const platformUid = 'rules-test-platform-admin';
const platformData = {
  role: 'platformAdmin',
  isDeleted: false,
};
const adminMocks = [
  existsMock(`users/${targetUid}`, true),
  getMock(`users/${callerUid}`, callerData),
  getMock(`users/${targetUid}`, targetData),
];
const storedPrivate = {
  data: {
    password: 'old-secret',
    phone4: '1234',
  },
};
const legacyCredentialTargetData = {
  ...targetData,
  password: 'old-secret',
  phone4: '1234',
};
const protectedCredentialData = {
  password: 'old-secret',
  phone4: '1234',
  updatedAt: '2026-07-30T00:00:00Z',
};

const cases = [
  testCase(
    '공개 통계 읽기 허용',
    'ALLOW',
    {
      path: documentPath('settings/platformStats'),
      method: 'get',
    },
  ),
  testCase(
    '브라우저 users 최초 생성 거부',
    'DENY',
    {
      auth: passwordAuth(targetUid),
      path: documentPath(`users/${targetUid}`),
      method: 'create',
      resource: { data: targetData },
    },
  ),
  testCase(
    '같은 교회 관리자의 private/auth 조회 허용',
    'ALLOW',
    {
      auth: passwordAuth(callerUid),
      path: privatePath,
      method: 'get',
    },
    {
      resource: storedPrivate,
      functionMocks: adminMocks,
    },
  ),
  testCase(
    '같은 교회 관리자의 다른 관리자 private/auth 조회 거부',
    'DENY',
    {
      auth: passwordAuth(callerUid),
      path: privatePath,
      method: 'get',
    },
    {
      resource: storedPrivate,
      functionMocks: [
        existsMock(`users/${targetUid}`, true),
        getMock(`users/${callerUid}`, callerData),
        getMock(`users/${targetUid}`, {
          ...targetData,
          role: 'churchAdmin',
        }),
      ],
    },
  ),
  testCase(
    '같은 교회 관리자의 삭제 회원 private/auth 조회 거부',
    'DENY',
    {
      auth: passwordAuth(callerUid),
      path: privatePath,
      method: 'get',
    },
    {
      resource: storedPrivate,
      functionMocks: [
        existsMock(`users/${targetUid}`, true),
        getMock(`users/${callerUid}`, callerData),
        getMock(`users/${targetUid}`, {
          ...targetData,
          isDeleted: true,
        }),
      ],
    },
  ),
  testCase(
    'role이 손상된 대상의 private/auth 조회 거부',
    'DENY',
    {
      auth: passwordAuth(callerUid),
      path: privatePath,
      method: 'get',
    },
    {
      resource: storedPrivate,
      functionMocks: [
        existsMock(`users/${targetUid}`, true),
        getMock(`users/${callerUid}`, callerData),
        getMock(`users/${targetUid}`, {
          churchId,
          isDeleted: false,
          password: null,
        }),
      ],
    },
  ),
  testCase(
    '같은 교회 관리자의 private/auth 수정 거부',
    'DENY',
    {
      auth: passwordAuth(callerUid),
      path: privatePath,
      method: 'update',
      time: '2026-07-30T00:00:00Z',
      resource: {
        data: {
          password: 'poisoned-secret',
          phone4: '1234',
          updatedAt: '2026-07-30T00:00:00Z',
        },
      },
    },
    {
      resource: storedPrivate,
      functionMocks: adminMocks,
    },
  ),
  testCase(
    '같은 교회 관리자의 private/auth 삭제 거부',
    'DENY',
    {
      auth: passwordAuth(callerUid),
      path: privatePath,
      method: 'delete',
    },
    {
      resource: storedPrivate,
      functionMocks: adminMocks,
    },
  ),
  testCase(
    '본인의 private/auth 삭제 거부',
    'DENY',
    {
      auth: passwordAuth(targetUid),
      path: privatePath,
      method: 'delete',
    },
    { resource: storedPrivate },
  ),
  testCase(
    '삭제 처리된 본인의 private/auth 조회 거부',
    'DENY',
    {
      auth: passwordAuth(targetUid),
      path: privatePath,
      method: 'get',
    },
    {
      resource: storedPrivate,
      functionMocks: [
        existsMock(`users/${targetUid}`, true),
        getMock(`users/${targetUid}`, {
          ...targetData,
          isDeleted: true,
        }),
      ],
    },
  ),
  testCase(
    '삭제 처리된 본인의 private/auth 수정 거부',
    'DENY',
    {
      auth: passwordAuth(targetUid),
      path: privatePath,
      method: 'update',
      time: '2026-07-30T00:00:00Z',
      resource: {
        data: {
          password: 'old-secret',
          phone4: '5678',
          updatedAt: '2026-07-30T00:00:00Z',
        },
      },
    },
    {
      resource: storedPrivate,
      functionMocks: [
        existsMock(`users/${targetUid}`, true),
        getMock(`users/${targetUid}`, {
          ...targetData,
          isDeleted: true,
        }),
      ],
    },
  ),
  testCase(
    '가입 서버 실패 뒤 users 원장이 없는 본인의 private/auth 재시도 허용',
    'ALLOW',
    {
      auth: passwordAuth('rules-test-signup-pending'),
      path: documentPath('users/rules-test-signup-pending/private/auth'),
      method: 'update',
      time: '2026-07-30T00:00:00Z',
      resource: {
        data: {
          password: 'retry-secret',
          phone4: '5678',
          updatedAt: '2026-07-30T00:00:00Z',
        },
      },
    },
    {
      resource: {
        data: {
          password: 'old-secret',
          phone4: '1234',
        },
      },
      functionMocks: [
        existsMock('users/rules-test-signup-pending', false),
      ],
    },
  ),
  testCase(
    '비로그인 private/auth 조회 거부',
    'DENY',
    {
      path: privatePath,
      method: 'get',
    },
    { resource: storedPrivate },
  ),
  testCase(
    '같은 교회 관리자의 users 소속 변경 허용',
    'ALLOW',
    {
      auth: passwordAuth(callerUid),
      path: documentPath(`users/${targetUid}`),
      method: 'update',
      time: '2026-07-30T00:00:00Z',
      resource: {
        data: {
          ...targetData,
          departmentId: 'adult',
          departmentName: '장년',
          subgroupId: 'a',
          subgroupName: 'A반',
          updatedAt: '2026-07-30T00:00:00Z',
        },
      },
    },
    {
      resource: { data: targetData },
      functionMocks: [getMock(`users/${callerUid}`, callerData)],
    },
  ),
  testCase(
    '같은 교회 관리자의 users 직접 삭제 거부',
    'DENY',
    {
      auth: passwordAuth(callerUid),
      path: documentPath(`users/${targetUid}`),
      method: 'update',
      time: '2026-07-30T00:00:00Z',
      resource: {
        data: {
          ...targetData,
          isDeleted: true,
          deletedAt: '2026-07-30T00:00:00Z',
          deletedBy: callerUid,
          platformStatsReaderCounted: false,
          updatedAt: '2026-07-30T00:00:00Z',
        },
      },
    },
    {
      resource: { data: targetData },
      functionMocks: [getMock(`users/${callerUid}`, callerData)],
    },
  ),
  testCase(
    '같은 교회 관리자의 users 직접 복원 거부',
    'DENY',
    {
      auth: passwordAuth(callerUid),
      path: documentPath(`users/${targetUid}`),
      method: 'update',
      time: '2026-07-30T00:00:00Z',
      resource: {
        data: {
          ...targetData,
          updatedAt: '2026-07-30T00:00:00Z',
        },
      },
    },
    {
      resource: {
        data: {
          ...targetData,
          isDeleted: true,
          deletedAt: '2026-07-29T00:00:00Z',
          deletedBy: callerUid,
          platformStatsReaderCounted: false,
        },
      },
      functionMocks: [getMock(`users/${callerUid}`, callerData)],
    },
  ),
  testCase(
    '플랫폼 관리자의 users 직접 lifecycle 변경 거부',
    'DENY',
    {
      auth: passwordAuth(platformUid),
      path: documentPath(`users/${targetUid}`),
      method: 'update',
      time: '2026-07-30T00:00:00Z',
      resource: {
        data: {
          ...targetData,
          isDeleted: true,
          deletedAt: '2026-07-30T00:00:00Z',
          deletedBy: platformUid,
          platformStatsReaderCounted: false,
          updatedAt: '2026-07-30T00:00:00Z',
        },
      },
    },
    {
      resource: { data: targetData },
      functionMocks: [getMock(`users/${platformUid}`, platformData)],
    },
  ),
  testCase(
    '플랫폼 관리자의 users counted marker 직접 변경 거부',
    'DENY',
    {
      auth: passwordAuth(platformUid),
      path: documentPath(`users/${targetUid}`),
      method: 'update',
      resource: {
        data: {
          ...targetData,
          platformStatsReaderCounted: false,
        },
      },
    },
    {
      resource: { data: targetData },
      functionMocks: [getMock(`users/${platformUid}`, platformData)],
    },
  ),
  testCase(
    '플랫폼 관리자의 users 통계 제외 직접 변경 거부',
    'DENY',
    {
      auth: passwordAuth(platformUid),
      path: documentPath(`users/${targetUid}`),
      method: 'update',
      resource: {
        data: {
          ...targetData,
          excludeFromPublicStats: true,
        },
      },
    },
    {
      resource: { data: targetData },
      functionMocks: [getMock(`users/${platformUid}`, platformData)],
    },
  ),
  // platformAdmin users exact allowlist: 20개 독립 계약 사례.
  testCase(
    '플랫폼 관리자의 active 일반 member 조직 변경 허용',
    'ALLOW',
    {
      auth: passwordAuth(platformUid),
      path: documentPath(`users/${targetUid}`),
      method: 'update',
      time: '2026-07-30T00:00:00Z',
      resource: {
        data: {
          ...targetData,
          churchId: 'rules-test-next-church',
          churchName: '옮긴 공동체',
          departmentId: 'adult',
          departmentName: '장년',
          subgroupId: 'a',
          subgroupName: 'A반',
          updatedAt: '2026-07-30T00:00:00Z',
        },
      },
    },
    {
      resource: { data: targetData },
      functionMocks: [getMock(`users/${platformUid}`, platformData)],
    },
  ),
  testCase(
    '플랫폼 관리자의 active credential parent 정리 허용',
    'ALLOW',
    {
      auth: passwordAuth(platformUid),
      path: documentPath(`users/${targetUid}`),
      method: 'update',
      resource: { data: targetData },
    },
    {
      resource: { data: legacyCredentialTargetData },
      functionMocks: [
        getMock(`users/${platformUid}`, platformData),
        existsAfterMock(`users/${targetUid}/private/auth`, true),
        getAfterMock(`users/${targetUid}/private/auth`, protectedCredentialData),
      ],
    },
  ),
  testCase(
    '플랫폼 관리자의 deleted credential parent 정리 허용',
    'ALLOW',
    {
      auth: passwordAuth(platformUid),
      path: documentPath(`users/${targetUid}`),
      method: 'update',
      resource: {
        data: {
          ...targetData,
          isDeleted: true,
        },
      },
    },
    {
      resource: {
        data: {
          ...legacyCredentialTargetData,
          isDeleted: true,
        },
      },
      functionMocks: [
        getMock(`users/${platformUid}`, platformData),
        existsAfterMock(`users/${targetUid}/private/auth`, true),
        getAfterMock(`users/${targetUid}/private/auth`, protectedCredentialData),
      ],
    },
  ),
  testCase(
    '플랫폼 관리자의 private 보호 사본 없는 credential parent 정리 거부',
    'DENY',
    {
      auth: passwordAuth(platformUid),
      path: documentPath(`users/${targetUid}`),
      method: 'update',
      resource: { data: targetData },
    },
    {
      resource: { data: legacyCredentialTargetData },
      functionMocks: [
        getMock(`users/${platformUid}`, platformData),
        existsAfterMock(`users/${targetUid}/private/auth`, false),
      ],
    },
  ),
  testCase(
    '플랫폼 관리자의 password 불일치 credential parent 정리 거부',
    'DENY',
    {
      auth: passwordAuth(platformUid),
      path: documentPath(`users/${targetUid}`),
      method: 'update',
      resource: { data: targetData },
    },
    {
      resource: { data: legacyCredentialTargetData },
      functionMocks: [
        getMock(`users/${platformUid}`, platformData),
        existsAfterMock(`users/${targetUid}/private/auth`, true),
        getAfterMock(`users/${targetUid}/private/auth`, {
          ...protectedCredentialData,
          password: 'different-secret',
        }),
      ],
    },
  ),
  testCase(
    '플랫폼 관리자의 phone4 불일치 credential parent 정리 거부',
    'DENY',
    {
      auth: passwordAuth(platformUid),
      path: documentPath(`users/${targetUid}`),
      method: 'update',
      resource: { data: targetData },
    },
    {
      resource: { data: legacyCredentialTargetData },
      functionMocks: [
        getMock(`users/${platformUid}`, platformData),
        existsAfterMock(`users/${targetUid}/private/auth`, true),
        getAfterMock(`users/${targetUid}/private/auth`, {
          ...protectedCredentialData,
          phone4: '9999',
        }),
      ],
    },
  ),
  testCase(
    '플랫폼 관리자의 active talent reset 허용',
    'ALLOW',
    {
      auth: passwordAuth(platformUid),
      path: documentPath(`users/${targetUid}`),
      method: 'update',
      time: '2026-07-30T00:00:00Z',
      resource: {
        data: {
          ...targetData,
          talent: 0,
          talentMigrated: true,
          talentWalletMigrated: true,
          updatedAt: '2026-07-30T00:00:00Z',
        },
      },
    },
    {
      resource: { data: targetData },
      functionMocks: [getMock(`users/${platformUid}`, platformData)],
    },
  ),
  testCase(
    '플랫폼 관리자의 deleted talent reset 허용',
    'ALLOW',
    {
      auth: passwordAuth(platformUid),
      path: documentPath(`users/${targetUid}`),
      method: 'update',
      time: '2026-07-30T00:00:00Z',
      resource: {
        data: {
          ...targetData,
          isDeleted: true,
          talent: 0,
          talentMigrated: true,
          talentWalletMigrated: true,
          updatedAt: '2026-07-30T00:00:00Z',
        },
      },
    },
    {
      resource: {
        data: {
          ...targetData,
          isDeleted: true,
        },
      },
      functionMocks: [getMock(`users/${platformUid}`, platformData)],
    },
  ),
  testCase(
    '플랫폼 관리자의 updatedAt-only timestamp touch 허용',
    'ALLOW',
    {
      auth: passwordAuth(platformUid),
      path: documentPath(`users/${targetUid}`),
      method: 'update',
      time: '2026-07-30T00:00:00Z',
      resource: {
        data: {
          ...targetData,
          updatedAt: '2026-07-30T00:00:00Z',
        },
      },
    },
    {
      resource: { data: targetData },
      functionMocks: [getMock(`users/${platformUid}`, platformData)],
    },
  ),
  testCase(
    '본인의 정규화된 plan 변경 허용',
    'ALLOW',
    {
      auth: passwordAuth(targetUid),
      path: documentPath(`users/${targetUid}`),
      method: 'update',
      time: '2026-07-30T00:00:00Z',
      resource: {
        data: {
          ...targetData,
          planId: 'readable_revised',
          currentDay: 1,
          updatedAt: '2026-07-30T00:00:00Z',
        },
      },
    },
    {
      resource: {
        data: {
          ...targetData,
          currentDay: 61,
        },
      },
    },
  ),
  testCase(
    '본인의 GoogleLink provider 메타데이터 변경 허용',
    'ALLOW',
    {
      auth: passwordAuth(targetUid),
      path: documentPath(`users/${targetUid}`),
      method: 'update',
      time: '2026-07-30T00:00:00Z',
      resource: {
        data: {
          ...targetData,
          authProvider: 'google.com',
          authProviders: ['password', 'google.com'],
          updatedAt: '2026-07-30T00:00:00Z',
        },
      },
    },
    {
      resource: {
        data: {
          ...targetData,
          authProvider: 'password',
          authProviders: ['password'],
        },
      },
    },
  ),
  testCase(
    '플랫폼 관리자의 planId 단독 변경 거부',
    'DENY',
    {
      auth: passwordAuth(platformUid),
      path: documentPath(`users/${targetUid}`),
      method: 'update',
      resource: { data: { ...targetData, planId: 'nt_new' } },
    },
    {
      resource: { data: targetData },
      functionMocks: [getMock(`users/${platformUid}`, platformData)],
    },
  ),
  testCase(
    '플랫폼 관리자의 currentDay 단독 변경 거부',
    'DENY',
    {
      auth: passwordAuth(platformUid),
      path: documentPath(`users/${targetUid}`),
      method: 'update',
      resource: { data: { ...targetData, currentDay: 2 } },
    },
    {
      resource: { data: targetData },
      functionMocks: [getMock(`users/${platformUid}`, platformData)],
    },
  ),
  testCase(
    '플랫폼 관리자의 readCount 단독 변경 거부',
    'DENY',
    {
      auth: passwordAuth(platformUid),
      path: documentPath(`users/${targetUid}`),
      method: 'update',
      resource: { data: { ...targetData, readCount: 2 } },
    },
    {
      resource: { data: targetData },
      functionMocks: [getMock(`users/${platformUid}`, platformData)],
    },
  ),
  testCase(
    '플랫폼 관리자의 score 단독 변경 거부',
    'DENY',
    {
      auth: passwordAuth(platformUid),
      path: documentPath(`users/${targetUid}`),
      method: 'update',
      resource: { data: { ...targetData, score: 16 } },
    },
    {
      resource: { data: targetData },
      functionMocks: [getMock(`users/${platformUid}`, platformData)],
    },
  ),
  testCase(
    '플랫폼 관리자의 streak 단독 변경 거부',
    'DENY',
    {
      auth: passwordAuth(platformUid),
      path: documentPath(`users/${targetUid}`),
      method: 'update',
      resource: { data: { ...targetData, streak: 2 } },
    },
    {
      resource: { data: targetData },
      functionMocks: [getMock(`users/${platformUid}`, platformData)],
    },
  ),
  testCase(
    '플랫폼 관리자의 lastReadDate 단독 변경 거부',
    'DENY',
    {
      auth: passwordAuth(platformUid),
      path: documentPath(`users/${targetUid}`),
      method: 'update',
      resource: { data: { ...targetData, lastReadDate: '2026-07-30' } },
    },
    {
      resource: { data: targetData },
      functionMocks: [getMock(`users/${platformUid}`, platformData)],
    },
  ),
  testCase(
    '플랫폼 관리자의 읽기 ledger 묶음 변경 거부',
    'DENY',
    {
      auth: passwordAuth(platformUid),
      path: documentPath(`users/${targetUid}`),
      method: 'update',
      resource: {
        data: {
          ...targetData,
          planId: 'nt_new',
          currentDay: 2,
          readCount: 2,
          score: 16,
          streak: 2,
          lastReadDate: '2026-07-30',
        },
      },
    },
    {
      resource: { data: targetData },
      functionMocks: [getMock(`users/${platformUid}`, platformData)],
    },
  ),
  testCase(
    '플랫폼 관리자의 arbitrary talent 변경 거부',
    'DENY',
    {
      auth: passwordAuth(platformUid),
      path: documentPath(`users/${targetUid}`),
      method: 'update',
      time: '2026-07-30T00:00:00Z',
      resource: {
        data: {
          ...targetData,
          talent: 999,
          updatedAt: '2026-07-30T00:00:00Z',
        },
      },
    },
    {
      resource: { data: targetData },
      functionMocks: [getMock(`users/${platformUid}`, platformData)],
    },
  ),
  testCase(
    '플랫폼 관리자의 role escalation 거부',
    'DENY',
    {
      auth: passwordAuth(platformUid),
      path: documentPath(`users/${targetUid}`),
      method: 'update',
      time: '2026-07-30T00:00:00Z',
      resource: {
        data: {
          ...targetData,
          role: 'platformAdmin',
          updatedAt: '2026-07-30T00:00:00Z',
        },
      },
    },
    {
      resource: { data: targetData },
      functionMocks: [getMock(`users/${platformUid}`, platformData)],
    },
  ),
  testCase(
    '플랫폼 관리자의 seed users hard delete 거부',
    'DENY',
    {
      auth: passwordAuth(platformUid),
      path: documentPath('users/seed_rules_test'),
      method: 'delete',
    },
    {
      resource: {
        data: {
          ...targetData,
          churchId,
        },
      },
      functionMocks: [getMock(`users/${platformUid}`, platformData)],
    },
  ),
  testCase(
    '플랫폼 관리자의 seed users 직접 생성 거부',
    'DENY',
    {
      auth: passwordAuth(platformUid),
      path: documentPath('users/seed_rules_test_new'),
      method: 'create',
      resource: {
        data: {
          ...targetData,
          churchId,
        },
      },
    },
    {
      functionMocks: [getMock(`users/${platformUid}`, platformData)],
    },
  ),
  {
    ...testCase(
      '일반 교인의 같은 교회 users 원문 조회 거부',
      'DENY',
      {
        auth: passwordAuth('rules-test-peer-member'),
        path: documentPath(`users/${targetUid}`),
        method: 'get',
      },
      {
        resource: {
          data: {
            ...targetData,
            name: '테스트교인',
            email: 'masked@example.invalid',
            birthdate: '1900-01-01',
          },
        },
        functionMocks: [
          getMock('users/rules-test-peer-member', {
            role: 'member',
            churchId,
            isDeleted: false,
          }),
        ],
      },
    ),
    blocker: true,
  },
];

const response = await fetch(
  `https://firebaserules.googleapis.com/v1/projects/${PROJECT_ID}:test`,
  {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      source: { files: [{ name: 'firestore.rules', content: rules }] },
      testSuite: { testCases: cases.map(entry => entry.payload) },
    }),
  },
);
const body = await response.json().catch(() => ({}));
if (!response.ok) {
  throw new Error(`Rules API test failed: HTTP ${response.status}`);
}
const issues = Array.isArray(body.issues) ? body.issues : [];
const errors = issues.filter(issue => issue.severity === 'ERROR');
for (const issue of issues) {
  console.log(`${issue.severity}: ${issue.description}`);
}
if (errors.length > 0) process.exit(1);

const results = Array.isArray(body.testResults) ? body.testResults : [];
if (results.length !== cases.length) {
  throw new Error(`Expected ${cases.length} test results, got ${results.length}.`);
}
let failed = false;
let blockerCount = 0;
results.forEach((result, index) => {
  const ok = result.state === 'SUCCESS';
  const isBlocker = cases[index].blocker && !ok;
  const prefix = isBlocker ? 'BLOCKER' : (ok ? 'PASS' : 'FAIL');
  console.log(`${prefix} ${cases[index].label}`);
  if (isBlocker) blockerCount += 1;
  if (!ok && !cases[index].blocker) {
    failed = true;
  }
  if (!ok) {
    for (const message of result.debugMessages || []) console.log(`  ${message}`);
  }
});
const passedCount = results.filter(result => result.state === 'SUCCESS').length;
console.log(`Firestore Rules API 기대 ${passedCount}/${cases.length}개 일치, 출시 차단 ${blockerCount}개`);
if (failed || (blockerCount > 0 && !allowKnownBlockers)) process.exit(1);
if (blockerCount > 0) {
  console.log('⚠️ 진단 모드: 알려진 출시 차단을 재현했지만 --allow-known-blockers로 종료를 허용했습니다.');
} else {
  console.log('✅ Firestore Rules 출시 안전 게이트 통과');
}
