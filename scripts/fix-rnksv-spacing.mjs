#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve('새번역_RNKSV_2001_자료');
const booksDir = path.join(root, 'books');
const backupPath = path.join(root, 'firestore-before-replacement.json');
const csvPath = path.join(root, 'rnksv-spacing-changes.csv');
const broken = /([가-힣][,.])(?=[가-힣])/gu;
const fix = text => text.replace(broken, '$1 ');
const csv = value => `"${String(value).replaceAll('"', '""')}"`;
const changes = [];

for (const filename of fs.readdirSync(booksDir).filter(name => name.endsWith('.json')).sort()) {
    const file = path.join(booksDir, filename);
    const book = JSON.parse(fs.readFileSync(file, 'utf8'));
    for (const chapter of book.chapters || []) for (const verse of chapter.verses || []) {
        const after = fix(verse.text || '');
        if (after !== verse.text) {
            changes.push({source: 'book', file: filename, location: `${chapter.number}:${verse.number}`, before: verse.text, after});
        }
    }
}

const backup = JSON.parse(fs.readFileSync(backupPath, 'utf8'));
for (const doc of backup.documents || []) {
    const text = doc.fields?.text;
    if (typeof text !== 'string') continue;
    const after = fix(text);
    if (after !== text) {
        changes.push({source: 'firestore-backup', file: 'firestore-before-replacement.json', location: doc.name.split('/').at(-1), before: text, after});
    }
}
const rows = [['source','file','location','before','after'], ...changes.map(x => [x.source,x.file,x.location,x.before,x.after])];
fs.writeFileSync(csvPath, `${rows.map(row => row.map(csv).join(',')).join('\n')}\n`, 'utf8');
console.log(`dry-run 후보 항목: ${changes.length}`);
console.log(`책 JSON 후보: ${changes.filter(x => x.source === 'book').length}`);
console.log(`Firestore 백업 문서 후보: ${changes.filter(x => x.source === 'firestore-backup').length}`);
console.log(`전/후 CSV: ${csvPath}`);
