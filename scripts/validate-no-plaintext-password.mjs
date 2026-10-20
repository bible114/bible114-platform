#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = path => fs.readFileSync(path, 'utf8');
const app = read('src/App.jsx');
const platformAdmin = read('src/components/PlatformAdminView.jsx');
const churchAdmin = read('src/components/ChurchAdminView.jsx');
const membersTab = read('src/components/churchAdmin/MembersTab.jsx');
const login = read('src/components/LoginView.jsx');
const onboarding = read('src/components/SocialOnboardingView.jsx');
const constants = read('src/data/constants.js');
const loginEntry = login.slice(
    login.indexOf('const renderEntryChoice ='),
    login.indexOf('// ── Render login card content'),
);

assert.doesNotMatch(app, /setMemberPasswordByAdmin|adminPasswordErrorMessage|changePassword\s*=|changingPassword=/,
    '앱에서 관리자 비밀번호 변경 흐름을 호출하면 안 됩니다.');
assert.doesNotMatch(platformAdmin, /fetchMemberCredentials|setChangingPassword|changingPassword=|title="암호 변경"|Change Password Modal/,
    '플랫폼 관리자 화면에서 비밀번호를 조회하거나 변경하면 안 됩니다.');
assert.doesNotMatch(churchAdmin, /fetchMemberCredentials|setMemberPasswordByAdmin|비밀번호 초기화|비밀번호 조회/,
    '교회 관리자 화면에서 비밀번호를 조회하거나 초기화하면 안 됩니다.');
assert.doesNotMatch(membersTab, /비밀번호 초기화|passwordRecoveryMembers/,
    '회원 명부에 비밀번호 초기화 기능이 남으면 안 됩니다.');
assert.match(loginEntry, /handleKakaoAccountStart[\s\S]*handleGoogleAccountStart/,
    '첫 로그인 화면은 카카오·구글 시작 동선을 제공해야 합니다.');
assert.doesNotMatch(loginEntry, /onMemberLogin|onChurchAdminLogin|onPersonalSignup|onMemberSignup|type="password"|ChurchPicker/,
    '첫 로그인 화면에서 옛 비밀번호 인증·가입 경로를 제공하면 안 됩니다.');
assert.doesNotMatch(app, /onMemberLogin=|onChurchAdminLogin=|onPersonalSignup=|onMemberSignup=/,
    '앱은 비밀번호 기반 로그인·가입 callback을 로그인 화면에 넘기면 안 됩니다.');
assert.doesNotMatch(onboarding, /onLegacyLink|legacyPassword|기존 비밀번호|type="password"/,
    '소셜 온보딩에서 옛 비밀번호 복구 UI를 제공하면 안 됩니다.');
assert.doesNotMatch(constants, /ADMIN_SET_PASSWORD_URL/,
    '폐기된 관리자 비밀번호 변경 API 설정이 남으면 안 됩니다.');

console.log('✅ 비밀번호 UI·호출 경로 제거 검증 통과');
