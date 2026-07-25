import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import { createRequire } from 'node:module';

const execute = process.argv.includes('--execute');
const projectId = 'bible114-platform';
const projectNumber = '57949868479';
const firebaseApiKey = 'AIzaSyBF122lgD5fTX70HBtd_nl0ZVKhyyQnyGo';
const platformApiUrl =
    'https://ejqnwajcvkvpcxechwzl.supabase.co/functions/v1/platform-api';
const origin = 'https://www.bible114.net';

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
const oauthToken = access?.access_token || access;
const googleHeaders = {
    Authorization: `Bearer ${oauthToken}`,
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

const firestoreBase =
    `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents`;
const usersPage = await jsonFetch(`${firestoreBase}/users?pageSize=300`, {
    headers: googleHeaders,
});
const platformAdmins = (usersPage.documents || []).filter(document => {
    const role = document.fields?.role?.stringValue || '';
    const deleted = document.fields?.isDeleted?.booleanValue === true;
    return !deleted && ['platformAdmin', 'superAdmin'].includes(role);
});
assert.equal(platformAdmins.length, 1, '활성 플랫폼 관리자 문서가 정확히 1개여야 합니다.');
const platformAdminUid = platformAdmins[0].name.split('/').pop();

const serviceAccounts = await jsonFetch(
    `https://iam.googleapis.com/v1/projects/${projectId}/serviceAccounts?pageSize=100`,
    { headers: googleHeaders },
);
const signer = (serviceAccounts.accounts || []).find(item =>
    String(item.email || '').startsWith('firebase-adminsdk-'));
assert.ok(signer?.email, 'Firebase Admin SDK 서비스 계정을 찾지 못했습니다.');

const serviceAccountIamUrl =
    `https://iam.googleapis.com/v1/projects/${projectId}/serviceAccounts/${encodeURIComponent(signer.email)}`;
let temporaryKeyName = null;

try {
    const now = Math.floor(Date.now() / 1000);
    const claims = {
        iss: signer.email,
        sub: signer.email,
        aud: 'https://identitytoolkit.googleapis.com/google.identity.identitytoolkit.v1.IdentityToolkit',
        iat: now,
        exp: now + 3600,
        uid: platformAdminUid,
    };
    const payload = JSON.stringify(claims);
    let signed;
    try {
        signed = await jsonFetch(
            `https://iamcredentials.googleapis.com/v1/projects/-/serviceAccounts/${encodeURIComponent(signer.email)}:signJwt`,
            {
                method: 'POST',
                headers: googleHeaders,
                body: JSON.stringify({ payload }),
            },
        );
    } catch (error) {
        if (!String(error?.message || '').includes("iam.serviceAccounts.signJwt")) throw error;
        const key = await jsonFetch(`${serviceAccountIamUrl}/keys`, {
            method: 'POST',
            headers: googleHeaders,
            body: JSON.stringify({
                privateKeyType: 'TYPE_GOOGLE_CREDENTIALS_FILE',
                keyAlgorithm: 'KEY_ALG_RSA_2048',
            }),
        });
        temporaryKeyName = key.name;
        const credentials = JSON.parse(Buffer.from(key.privateKeyData, 'base64').toString('utf8'));
        const encode = value => Buffer.from(JSON.stringify(value)).toString('base64url');
        const unsigned = `${encode({
            alg: 'RS256',
            typ: 'JWT',
            kid: credentials.private_key_id,
        })}.${encode(claims)}`;
        const signature = crypto.sign('RSA-SHA256', Buffer.from(unsigned), credentials.private_key)
            .toString('base64url');
        signed = { signedJwt: `${unsigned}.${signature}` };
    }
    assert.ok(signed?.signedJwt, '플랫폼 관리자용 일회성 custom token 서명에 실패했습니다.');

    let signIn;
    for (let attempt = 0; attempt < 15; attempt += 1) {
        try {
            signIn = await jsonFetch(
                `https://identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken?key=${firebaseApiKey}`,
                {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ token: signed.signedJwt, returnSecureToken: true }),
                },
            );
            break;
        } catch (error) {
            if (attempt === 14 || !String(error?.message || '').includes('INVALID_CUSTOM_TOKEN')) throw error;
            await new Promise(resolve => setTimeout(resolve, 1000));
        }
    }
    assert.ok(signIn.idToken, '일회성 플랫폼 관리자 ID token 발급에 실패했습니다.');

    const action = async (actionName, input) => jsonFetch(platformApiUrl, {
        method: 'POST',
        headers: {
            Authorization: `Bearer ${signIn.idToken}`,
            'Content-Type': 'application/json',
            Origin: origin,
        },
        body: JSON.stringify({
            action: actionName,
            requestId: crypto.randomUUID(),
            ...input,
        }),
    });

    const statsPreview = await action('rebuildPlatformStats', { dryRun: true });
    const directoryPreview = await action('rebuildPublicChurches', { dryRun: true });
    const videoPreview = await action('adminPreviewDailyVideo', {
        adultPlaylistId: 'PLkA5pHbjEOGsYpiH6aBbNp4LMMGaSKGaD',
        kidsPlaylistId: 'PLAXF9wEETjFo',
    });
    const preview = {
        stats: statsPreview.result,
        directory: {
            dryRun: directoryPreview.dryRun,
            mode: directoryPreview.mode,
            summary: directoryPreview.summary,
        },
        video: {
            serviceDate: videoPreview.serviceDate,
            adultReady: Boolean(videoPreview.previews?.adult),
            kidsReady: Boolean(videoPreview.previews?.kids),
        },
    };
    console.log(JSON.stringify({ execute, preview }, null, 2));

    if (execute) {
        assert.equal(directoryPreview.summary?.invalidCount, 0, '잘못된 교회 원본이 있어 전환을 중단합니다.');
        const statsApplied = await action('rebuildPlatformStats', { dryRun: false });
        const directoryApplied = await action('rebuildPublicChurches', { dryRun: false });
        assert.equal(statsApplied.result?.applied, true, '플랫폼 통계 적용 응답이 올바르지 않습니다.');
        assert.equal(directoryApplied.applied, true, '공개 디렉토리 적용 응답이 올바르지 않습니다.');
        assert.equal(directoryApplied.mode, 'public', '공개 디렉토리가 public 모드로 전환되지 않았습니다.');
        console.log(JSON.stringify({
            completed: true,
            stats: statsApplied.result.expected,
            directory: directoryApplied.summary,
        }, null, 2));
    }
} finally {
    if (temporaryKeyName) {
        await jsonFetch(`https://iam.googleapis.com/v1/${temporaryKeyName}`, {
            method: 'DELETE',
            headers: googleHeaders,
        });
    }
}
