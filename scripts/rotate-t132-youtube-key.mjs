import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';

const execute = process.argv.includes('--execute');
const projectId = 'bible114-platform';
const projectNumber = '57949868479';
const supabaseProjectRef = 'ejqnwajcvkvpcxechwzl';
const firebaseToolsRoot = [
    '/opt/homebrew/lib/node_modules/firebase-tools',
    '/usr/local/lib/node_modules/firebase-tools',
].find(root => fs.existsSync(`${root}/package.json`));
if (!firebaseToolsRoot) throw new Error('Firebase CLI를 찾지 못했습니다.');

const require = createRequire(`${firebaseToolsRoot}/package.json`);
const auth = require('./lib/auth');
const account = auth.getGlobalDefaultAccount();
const scopes = String(account.tokens.scope || 'https://www.googleapis.com/auth/cloud-platform')
    .split(/\s+/)
    .filter(Boolean);
const access = await auth.getAccessToken(account.tokens.refresh_token, scopes);
const token = access?.access_token || access;
const headers = {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
};

const jsonFetch = async (url, init = {}) => {
    const response = await fetch(url, init);
    const body = await response.json().catch(() => ({}));
    if (!response.ok) {
        throw new Error(`${init.method || 'GET'} ${url}: HTTP ${response.status} ${body?.error?.message || ''}`);
    }
    return body;
};

const documentUrl =
    `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/settings/videoAutoConfig`;
const document = await jsonFetch(documentUrl, { headers });
const legacyKey = document?.fields?.apiKey?.stringValue || '';
assert.ok(legacyKey, '삭제할 legacy apiKey 필드가 없습니다.');

let service = await jsonFetch(
    `https://serviceusage.googleapis.com/v1/projects/${projectNumber}/services/youtube.googleapis.com`,
    { headers },
);

console.log(JSON.stringify({
    execute,
    projectId,
    youtubeApiEnabled: service.state === 'ENABLED',
    legacyFieldPresent: true,
    legacyKeyFingerprint: crypto.createHash('sha256').update(legacyKey).digest('hex').slice(0, 12),
}, null, 2));
if (!execute) process.exit(0);

if (service.state !== 'ENABLED') {
    let enableOperation = await jsonFetch(
        `https://serviceusage.googleapis.com/v1/projects/${projectNumber}/services/youtube.googleapis.com:enable`,
        { method: 'POST', headers, body: '{}' },
    );
    for (let attempt = 0; !enableOperation.done && attempt < 60; attempt += 1) {
        await new Promise(resolve => setTimeout(resolve, 1000));
        enableOperation = await jsonFetch(
            `https://serviceusage.googleapis.com/v1/${enableOperation.name}`,
            { headers },
        );
    }
    assert.ok(enableOperation.done && !enableOperation.error, 'YouTube Data API 활성화에 실패했습니다.');
    service = await jsonFetch(
        `https://serviceusage.googleapis.com/v1/projects/${projectNumber}/services/youtube.googleapis.com`,
        { headers },
    );
}
assert.equal(service.state, 'ENABLED', 'youtube.googleapis.com API가 활성화되지 않았습니다.');

const keyId = `bible114-youtube-${Date.now()}`;
const operation = await jsonFetch(
    `https://apikeys.googleapis.com/v2/projects/${projectNumber}/locations/global/keys?keyId=${keyId}`,
    {
        method: 'POST',
        headers,
        body: JSON.stringify({
            displayName: `Bible114 Supabase YouTube ${new Date().toISOString().slice(0, 10)}`,
            restrictions: { apiTargets: [{ service: 'youtube.googleapis.com' }] },
        }),
    },
);

let completed = operation;
for (let attempt = 0; !completed.done && attempt < 30; attempt += 1) {
    await new Promise(resolve => setTimeout(resolve, 1000));
    completed = await jsonFetch(`https://apikeys.googleapis.com/v2/${operation.name}`, { headers });
}
assert.ok(completed.done, '새 API 키 생성 작업이 제한 시간 안에 끝나지 않았습니다.');
assert.ok(!completed.error, `새 API 키 생성 실패: ${completed.error?.message || 'unknown'}`);
const keyName = completed.response?.name;
assert.ok(keyName, '새 API 키 resource name이 없습니다.');

const keyBody = await jsonFetch(`https://apikeys.googleapis.com/v2/${keyName}/keyString`, { headers });
const newKey = keyBody.keyString || '';
assert.ok(newKey, '새 API 키 문자열을 받지 못했습니다.');

const youtubeTest = await fetch(
    `https://www.googleapis.com/youtube/v3/videos?part=id&id=dQw4w9WgXcQ&key=${encodeURIComponent(newKey)}`,
);
if (!youtubeTest.ok) {
    const failure = await youtubeTest.json().catch(() => ({}));
    throw new Error(`새 YouTube API 키 검증 실패: HTTP ${youtubeTest.status} ${failure?.error?.message || ''}`);
}

const tempDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'bible114-youtube-key-'));
const envFile = path.join(tempDirectory, 'secret.env');
try {
    fs.writeFileSync(envFile, `YOUTUBE_API_KEY=${newKey}\n`, { mode: 0o600 });
    execFileSync(
        'npx',
        ['supabase', 'secrets', 'set', '--env-file', envFile, '--project-ref', supabaseProjectRef],
        { stdio: 'inherit' },
    );
} finally {
    if (fs.existsSync(envFile)) fs.rmSync(envFile);
    fs.rmSync(tempDirectory, { recursive: true, force: true });
}

const patchUrl = new URL(documentUrl);
patchUrl.searchParams.append('updateMask.fieldPaths', 'apiKey');
patchUrl.searchParams.set('currentDocument.updateTime', document.updateTime);
await jsonFetch(patchUrl, {
    method: 'PATCH',
    headers,
    body: JSON.stringify({ fields: {} }),
});

const verifiedDocument = await jsonFetch(documentUrl, { headers });
assert.ok(!verifiedDocument?.fields?.apiKey, 'legacy apiKey 필드 삭제 검증에 실패했습니다.');

const auditDirectory = path.resolve('operations/private');
fs.mkdirSync(auditDirectory, { recursive: true, mode: 0o700 });
const auditPath = path.join(auditDirectory, `t132-youtube-key-rotation-${new Date().toISOString().replaceAll(':', '-')}.json`);
fs.writeFileSync(
    auditPath,
    `${JSON.stringify({
        completedAt: new Date().toISOString(),
        projectId,
        newKeyResourceName: keyName,
        newKeyFingerprint: crypto.createHash('sha256').update(newKey).digest('hex').slice(0, 12),
        legacyKeyFingerprint: crypto.createHash('sha256').update(legacyKey).digest('hex').slice(0, 12),
        supabaseProjectRef,
        firestoreLegacyFieldRemoved: true,
    }, null, 2)}\n`,
    { mode: 0o600 },
);

console.log(JSON.stringify({
    completed: true,
    newKeyResourceName: keyName,
    firestoreLegacyFieldRemoved: true,
    auditPath,
}, null, 2));
