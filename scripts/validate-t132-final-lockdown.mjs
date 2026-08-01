import assert from 'node:assert/strict';
import fs from 'node:fs';

const rules = fs.readFileSync('firestore.rules', 'utf8');
const publicDirectoryService = fs.readFileSync(
    'supabase/functions/platform-api/publicDirectoryService.ts',
    'utf8',
);
const platformApi = fs.readFileSync('src/utils/platformApi.js', 'utf8');
const memberCredentials = fs.readFileSync('src/utils/memberCredentials.js', 'utf8');

assert.match(
    rules,
    /function isPlatformAdmin\(\)[\s\S]*role in \['platformAdmin', 'superAdmin'\][\s\S]*get\('isDeleted', false\) != true/,
    '삭제된 플랫폼 관리자 계정은 관리자 권한을 가져서는 안 된다.',
);
assert.match(
    memberCredentials,
    /db\.runTransaction\(async transaction =>[\s\S]*transaction\.set\(privateRef,[\s\S]*transaction\.update\(userRef,/,
    '자격증명 보호 사본과 users null marker는 한 transaction으로 이관되어야 한다.',
);
const selfPreferenceRule = rules.match(
    /function isSafeSelfPreferenceUpdate\(before, after\) \{([\s\S]*?)\n    \}/,
)?.[1] || '';
assert.match(
    selfPreferenceRule,
    /changed\.hasOnly\(\[[\s\S]*'primaryOrgId'[\s\S]*'videoMode'[\s\S]*'updatedAt'/,
    'users 본인 수정은 환경설정 allowlist여야 한다.',
);
assert.doesNotMatch(
    selfPreferenceRule,
    /score|talent|readCount|readingEpoch|quizProgress|quizRewardDate/,
    'users 본인 수정에서 서버 권위 상태를 허용하면 안 된다.',
);
assert.match(
    rules,
    /function isSafeSelfPlanChange\(before, after\)[\s\S]*changed\.hasAny\(\['planId', 'currentDay'\]\)[\s\S]*changed\.hasOnly\(\['planId', 'currentDay', 'updatedAt'\]\)[\s\S]*after\.currentDay == \(\(beforeDay - 1\) % totalDays\) \+ 1/,
    '플랜 전환의 currentDay는 새 플랜 길이로만 정규화되어야 한다.',
);
const usersRule = rules.match(
    /match \/users\/\{uid\} \{([\s\S]*?)\n    \}\n\n    \/\/ 교회 문서/,
)?.[1] || '';
assert.match(usersRule, /allow create: if false;/, 'users 직접 생성이 열려 있다.');
assert.match(
    usersRule,
    /match \/history\/\{historyId\} \{[\s\S]*allow create: if false;/,
    '읽기 history 직접 생성이 열려 있다.',
);
assert.doesNotMatch(
    rules,
    /!wasMigrated|!isMigrated|afterTalent == beforeScore|afterScore >= beforeScore/,
    'legacy 브라우저 이관 분기가 남아 있다.',
);
assert.doesNotMatch(
    rules,
    /afterTalent <= beforeTalent \+ 17|afterScore <= beforeScore \+ 15/,
    'users 구버전 보상 호환 상한이 남아 있다.',
);

const rosterRule = rules.match(
    /match \/roster\/\{memberUid\} \{([\s\S]*?)\n        allow delete/,
)?.[1] || '';
assert.match(rosterRule, /allow create: if false;/, 'roster 생성은 서버 action 전용이어야 한다.');
assert.doesNotMatch(
    rosterRule,
    /request\.auth\.uid == memberUid[\s\S]*allow update/,
    'roster 본인 update가 다시 열리면 안 된다.',
);
assert.doesNotMatch(rosterRule, /\+ 15|\+ 17/, 'roster 구버전 보상 호환 상한이 남아 있다.');

const purchaseRule = rules.match(
    /match \/talentPurchases\/\{purchaseId\} \{([\s\S]*?)\n      \}/,
)?.[1] || '';
assert.match(
    purchaseRule,
    /allow create, update, delete: if false;/,
    '달란트 판매·수령·환불 직접 쓰기를 닫아야 한다.',
);
assert.match(
    rules,
    /match \/settings\/platformStats \{[\s\S]*allow read: if true;[\s\S]*allow write: if false;/,
    'platformStats는 공개 읽기·서버 전용 쓰기여야 한다.',
);
assert.match(
    rules,
    /match \/settings\/videoAutoConfig \{[\s\S]*allow read: if isPlatformAdmin\(\);[\s\S]*allow write: if isPlatformAdmin\(\);/,
    '영상 자동화 설정은 플랫폼 관리자에게만 보여야 한다.',
);
assert.match(
    rules,
    /match \/settings\/\{settingId\} \{[\s\S]*settingId != 'videoAutoConfig'[\s\S]*!\(settingId in \['churchDirectory', 'platformStats'\]\)/,
    '포괄적 settings 규칙이 보호 문서를 다시 열면 안 된다.',
);
assert.match(
    rules,
    /match \/dailyVideos\/\{dateId\} \{[\s\S]*allow create: if isPlatformAdmin\(\)[\s\S]*allow update, delete: if isPlatformAdmin\(\);/,
    'dailyVideos 직접 쓰기는 플랫폼 관리자 수동 등록만 허용해야 한다.',
);
assert.match(
    publicDirectoryService,
    /ready: true,[\s\S]*mode: "public"/,
    '공개 디렉토리 재생성의 최종 상태는 public이어야 한다.',
);
assert.match(
    platformApi,
    /result\.mode !== 'public'/,
    '클라이언트는 public 디렉토리 전환 응답만 승인해야 한다.',
);

console.log('✅ T132 최종 보안 차단 계약 검증 통과');
