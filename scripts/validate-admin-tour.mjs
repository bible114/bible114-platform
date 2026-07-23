import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = path => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const tutorial = read('src/components/ChurchAdminTutorial.jsx');
const view = read('src/components/ChurchAdminView.jsx');
const dashboard = read('src/components/churchAdmin/DashboardTab.jsx');
const members = read('src/components/churchAdmin/MembersTab.jsx');
const talent = read('src/components/churchAdmin/TalentShopTab.jsx');
const organization = read('src/components/churchAdmin/OrganizationTab.jsx');
const announcement = read('src/components/churchAdmin/AnnouncementTab.jsx');
const settings = read('src/components/churchAdmin/SettingsTab.jsx');

const steps = [...tutorial.matchAll(/^\s*id: '(admin-tut-[^']+)',\n\s*tab: '([^']+)'/gm)]
    .map(([, id, tab]) => ({ id, tab }));
assert.deepEqual(steps, [
    { id: 'admin-tut-header', tab: 'dashboard' },
    { id: 'admin-tut-tabs', tab: 'dashboard' },
    { id: 'admin-tut-dashboard', tab: 'dashboard' },
    { id: 'admin-tut-member-list', tab: 'members' },
    { id: 'admin-tut-talent-shop', tab: 'talentShop' },
    { id: 'admin-tut-org-section', tab: 'org' },
    { id: 'admin-tut-announcement-section', tab: 'announcement' },
    { id: 'admin-tut-settings-section', tab: 'settings' },
]);

for (const [id, source] of [
    ['admin-tut-header', view],
    ['admin-tut-tabs', view],
    ['admin-tut-dashboard', dashboard],
    ['admin-tut-member-list', members],
    ['admin-tut-talent-shop', talent],
    ['admin-tut-org-section', organization],
    ['admin-tut-announcement-section', announcement],
    ['admin-tut-settings-section', settings],
]) {
    assert.match(source, new RegExp(id), `관리자 화면에 ${id}가 있어야 합니다.`);
}

assert.match(view, /🧭 관리자 화면 투어/);
assert.match(tutorial, /role="dialog"/);
assert.match(tutorial, /aria-modal="true"/);
assert.match(tutorial, /onTabChange\?\.\(current\.tab\)/);
assert.match(tutorial, /isMobile[\s\S]*bottom: 12/);
assert.doesNotMatch(tutorial, /4개의 탭|이름순 \/ 진행순 \/ 점수순|오른쪽에 3가지 관리 버튼/);
assert.match(tutorial, /목양 대시보드/);
assert.match(tutorial, /달란트 상점 운영/);
assert.match(tutorial, /기존 성도는 새 가입 대신 카카오·구글/);

console.log('관리자 화면 투어 검증 통과');
