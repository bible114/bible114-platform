#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  formatNationalReadingProgress,
  normalizePublicNationalRanking,
  normalizePublicNationalRankingSnapshot,
  PUBLIC_NATIONAL_RANKING_LIMIT,
  PUBLIC_NATIONAL_RANKING_SCHEMA_VERSION,
  PUBLIC_NATIONAL_RANKING_STATUS,
} from '../src/utils/publicNationalRanking.js';

const validEntries = Array.from({ length: PUBLIC_NATIONAL_RANKING_LIMIT }, (_, index) => ({
  rank: index + 1,
  churchName: `교회 ${index + 1}`,
  maskedName: '이＊암',
  readCount: 13,
  currentDay: Math.min(index + 1, 365),
}));

assert.equal(PUBLIC_NATIONAL_RANKING_LIMIT, 50);
assert.deepEqual(normalizePublicNationalRanking(validEntries), validEntries);
assert.deepEqual(
  normalizePublicNationalRankingSnapshot({
    national_ranking_schema_version: PUBLIC_NATIONAL_RANKING_SCHEMA_VERSION,
    national_ranking_publication_status: PUBLIC_NATIONAL_RANKING_STATUS,
    national_ranking: validEntries,
  }),
  validEntries,
);
assert.deepEqual(
  normalizePublicNationalRankingSnapshot({
    national_ranking_schema_version: 1,
    national_ranking_publication_status: 'draft',
    national_ranking: validEntries,
  }),
  [],
  '검증된 schema와 공개 상태가 아니면 순위를 표시하면 안 됩니다.',
);
assert.deepEqual(
  normalizePublicNationalRanking([
    validEntries[0],
    { ...validEntries[1], rank: 3 },
  ]),
  [],
  '공개 순위가 손상되면 부분 행을 표시하지 않고 전체를 거부해야 합니다.',
);
assert.deepEqual(
  normalizePublicNationalRanking([{ ...validEntries[0], maskedName: '이재암' }]),
  [],
  '가리지 않은 이름은 공개 순위에서 거부해야 합니다.',
);
assert.equal(formatNationalReadingProgress({ readCount: 1, currentDay: 200 }), '200일째 읽는 중');
assert.equal(formatNationalReadingProgress({ readCount: 2, currentDay: 30 }), '1독 · 30일째 읽는 중');
assert.equal(formatNationalReadingProgress({ readCount: 13, currentDay: 77 }), '12독 · 77일째 읽는 중');
assert.equal(formatNationalReadingProgress({ readCount: 1, currentDay: 366 }), '');

const loginView = fs.readFileSync('src/components/LoginView.jsx', 'utf8');
const rankingComponent = fs.readFileSync('src/components/NationalReadingRanking.jsx', 'utf8');
const syncScript = fs.readFileSync('scripts/sync-national-reading-ranking.mjs', 'utf8');
const firestoreRules = fs.readFileSync('firestore.rules', 'utf8');
const packageJson = JSON.parse(fs.readFileSync('package.json', 'utf8'));

assert.match(loginView, /normalizePublicNationalRankingSnapshot\(d\)/);
assert.match(loginView, /<NationalReadingRanking[\s\S]*entries=\{nationalRanking\}/);
assert.match(rankingComponent, /h-\[270px\].*overflow-y-auto.*overscroll-contain/);
assert.match(rankingComponent, /\{entry\.churchName\}[\s\S]*·[\s\S]*\{entry\.maskedName\}/);
assert.match(rankingComponent, /formatNationalReadingProgress\(entry\)/);
assert.match(rankingComponent, /1–\{entries\.length\}위/);
assert.doesNotMatch(rankingComponent, /🥇|🥈|🥉/);
assert.match(syncScript, /PUBLIC_NATIONAL_RANKING_LIMIT/);
assert.match(syncScript, /schemaVersion !== 3/);
assert.match(syncScript, /exactKeys\(entry, \['sourceRow', 'maskedName', 'readCount', 'currentDay'\]\)/);
assert.match(syncScript, /calculatedTotalProgressDays/);
assert.match(syncScript, /data\.excludeFromPublicStats === true/);
assert.match(syncScript, /data\.hideFromPublicRanking === true/);
assert.match(syncScript, /data\.fixtureType === 'reading-badge-test'/);
assert.match(syncScript, /PRIVATE_RANKING_SOURCES_PATH = 'platformInternal\/nationalRankingSources'/);
assert.match(syncScript, /--sungseo-ranking-stdin/);
assert.match(syncScript, /mode & 0o077/);
assert.match(syncScript, /national_ranking: ranking/);
assert.match(syncScript, /national_ranking_publication_status: PUBLIC_NATIONAL_RANKING_STATUS/);
assert.match(syncScript, /church_ranking: \[\]/);
assert.doesNotMatch(syncScript, /birthdate|phone4|password/);
assert.match(
  firestoreRules,
  /match \/platformInternal\/\{documentId\} \{\s*allow read, write: if false;\s*\}/,
);
assert.equal(
  packageJson.scripts['sync:national-ranking'],
  'node scripts/sync-national-reading-ranking.mjs',
);

console.log('✅ 전국 통독 개인 가린이름 50위·5행 스크롤 계약 검증 통과');
