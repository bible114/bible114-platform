import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const sourceRoot = path.join(repoRoot, 'src');
const sourceExtensions = new Set(['.js', '.jsx', '.ts', '.tsx']);

const targetOrder = [
    'users',
    'roster',
    'churchDirectory',
    'platformStats',
    'dailyVideos',
    'videoAutoConfig',
    'talentPurchases',
];
const protectedUserFields = new Set([
    'accountType', 'achievements', 'churchId', 'churchName', 'currentDay', 'dayOffset',
    'departmentId', 'departmentName', 'extraMemberships', 'finishedCount', 'isDeleted',
    'lastReadDate', 'maxStreak', 'planId', 'primaryOrgId', 'quizProgress', 'quizRewardDate',
    'readCount', 'readDates', 'readingEpoch', 'score', 'streak', 'subgroupId', 'subgroupName',
    'talent', 'talentMigrated', 'talentWalletMigrated',
]);
const protectedRosterFields = new Set([
    'currentDay', 'dayOffset', 'departmentId', 'departmentName', 'extraMemberships',
    'lastReadDate', 'planId', 'readCount', 'readingEpoch', 'score', 'subgroupId',
    'subgroupName', 'talent',
]);

const walk = directory => fs.readdirSync(directory, { withFileTypes: true })
    .flatMap(entry => {
        const absolute = path.join(directory, entry.name);
        if (entry.isDirectory()) return walk(absolute);
        return sourceExtensions.has(path.extname(entry.name)) ? [absolute] : [];
    })
    .sort((left, right) => left.localeCompare(right));

const lineAt = (text, offset) => text.slice(0, offset).split('\n').length;

const readBalanced = (text, openOffset) => {
    let depth = 0;
    let quote = '';
    let escaped = false;
    let lineComment = false;
    let blockComment = false;
    for (let index = openOffset; index < text.length; index += 1) {
        const char = text[index];
        const next = text[index + 1];
        if (lineComment) {
            if (char === '\n') lineComment = false;
            continue;
        }
        if (blockComment) {
            if (char === '*' && next === '/') {
                blockComment = false;
                index += 1;
            }
            continue;
        }
        if (quote) {
            if (escaped) escaped = false;
            else if (char === '\\') escaped = true;
            else if (char === quote) quote = '';
            continue;
        }
        if (char === '/' && next === '/') {
            lineComment = true;
            index += 1;
            continue;
        }
        if (char === '/' && next === '*') {
            blockComment = true;
            index += 1;
            continue;
        }
        if (char === "'" || char === '"' || char === '`') {
            quote = char;
            continue;
        }
        if (char === '(') depth += 1;
        else if (char === ')') {
            depth -= 1;
            if (depth === 0) return text.slice(openOffset + 1, index);
        }
    }
    throw new Error(`닫히지 않은 호출 괄호: ${openOffset}`);
};

const splitTopLevel = text => {
    const parts = [];
    let start = 0;
    let depth = 0;
    let quote = '';
    let escaped = false;
    for (let index = 0; index < text.length; index += 1) {
        const char = text[index];
        if (quote) {
            if (escaped) escaped = false;
            else if (char === '\\') escaped = true;
            else if (char === quote) quote = '';
            continue;
        }
        if (char === "'" || char === '"' || char === '`') quote = char;
        else if ('({['.includes(char)) depth += 1;
        else if (')}]'.includes(char)) depth -= 1;
        else if (char === ',' && depth === 0) {
            parts.push(text.slice(start, index).trim());
            start = index + 1;
        }
    }
    parts.push(text.slice(start).trim());
    return parts;
};

const directTargets = expression => {
    const targets = new Set();
    if (/\.collection\(\s*['"]users['"]\s*\)/.test(expression)) targets.add('users');
    if (/\.(?:collection|collectionGroup)\(\s*['"]roster['"]\s*\)/.test(expression)) targets.add('roster');
    if (/\.collection\(\s*['"]dailyVideos['"]\s*\)/.test(expression)) targets.add('dailyVideos');
    if (/\.collection\(\s*['"]talentPurchases['"]\s*\)/.test(expression)) targets.add('talentPurchases');
    if (/\.collection\(\s*['"]settings['"]\s*\)\s*\.doc\(\s*['"]churchDirectory['"]\s*\)/.test(expression)) targets.add('churchDirectory');
    if (/\.collection\(\s*['"]settings['"]\s*\)\s*\.doc\(\s*['"]platformStats['"]\s*\)/.test(expression)) targets.add('platformStats');
    if (/\.collection\(\s*['"]settings['"]\s*\)\s*\.doc\(\s*['"]videoAutoConfig['"]\s*\)/.test(expression)) targets.add('videoAutoConfig');
    return targets;
};

const resolveTargets = (expression, symbols) => {
    const result = directTargets(expression);
    for (const [name, targets] of symbols) {
        if (new RegExp(`\\b${name}\\b`).test(expression)) {
            targets.forEach(target => result.add(target));
        }
    }
    return result;
};

const buildSymbols = source => {
    const symbols = new Map();
    const assignments = [];
    const assignmentPattern = /\b(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*([\s\S]*?);/g;
    for (const match of source.matchAll(assignmentPattern)) {
        assignments.push({ name: match[1], expression: match[2] });
    }
    for (let pass = 0; pass < assignments.length + 1; pass += 1) {
        let changed = false;
        for (const { name, expression } of assignments) {
            const resolved = resolveTargets(expression, symbols);
            const existing = symbols.get(name) || new Set();
            const before = existing.size;
            resolved.forEach(target => existing.add(target));
            if (existing.size !== before) {
                symbols.set(name, existing);
                changed = true;
            }
        }
        if (!changed) break;
    }

    return symbols;
};

const objectFields = expression => {
    const trimmed = expression.trim();
    if (!trimmed.startsWith('{')) return ['<dynamic>'];
    const objectBody = trimmed.slice(1);
    const fields = new Set();
    const keyPattern = /(?:^|[,\n])\s*(?:['"]([^'"]+)['"]|([A-Za-z_$][\w$]*))\s*(?=:|,|\})/g;
    for (const match of objectBody.matchAll(keyPattern)) fields.add(match[1] || match[2]);
    if (/\.\.\./.test(trimmed)) fields.add('<spread>');
    return [...fields].sort((left, right) => left.localeCompare(right));
};

const hasProtectedFields = (target, fields) => {
    if (!['users', 'roster'].includes(target)) return true;
    if (fields.includes('<dynamic>') || fields.length === 0) return true;
    const protectedFields = target === 'users' ? protectedUserFields : protectedRosterFields;
    const concreteFields = fields.filter(field => field !== '<spread>');
    return concreteFields.length === 0 || concreteFields.some(field => protectedFields.has(field));
};

const inventoryFile = absolutePath => {
    const source = fs.readFileSync(absolutePath, 'utf8');
    const symbols = buildSymbols(source);
    const entries = [];
    const writePattern = /\.\s*(set|update|delete)\s*\(/g;
    for (const match of source.matchAll(writePattern)) {
        const method = match[1];
        const prefix = source.slice(Math.max(0, match.index - 1_200), match.index);
        const receiver = prefix.match(/([A-Za-z_$][\w$]*)\s*$/)?.[1] || '';
        const receiverCall = prefix.match(/([A-Za-z_$][\w$]*)\s*\(\s*\)\s*$/)?.[1] || '';
        const openOffset = match.index + match[0].lastIndexOf('(');
        const args = splitTopLevel(readBalanced(source, openOffset));
        const isContainerWrite = receiver === 'transaction' || receiver === 'batch';
        const referenceExpression = isContainerWrite ? (args[0] || '') : (receiverCall || receiver);
        const fieldsExpression = method === 'delete'
            ? ''
            : (isContainerWrite ? (args[1] || '') : (args[0] || ''));
        const targets = resolveTargets(referenceExpression, symbols);
        if (!isContainerWrite && symbols.has(receiver)) {
            symbols.get(receiver).forEach(target => targets.add(target));
        }
        if (!isContainerWrite && receiverCall && symbols.has(receiverCall)) {
            symbols.get(receiverCall).forEach(target => targets.add(target));
        }
        // `db.collection(...).doc(...).set()`처럼 ref를 변수로 떼지 않은 직접 chain.
        const directChainOffset = Math.max(prefix.lastIndexOf('db.collection('), prefix.lastIndexOf('.collection('));
        if (!isContainerWrite && targets.size === 0 && directChainOffset >= 0) {
            const directChain = prefix.slice(directChainOffset);
            if (!/[;{}]/.test(directChain)) directTargets(directChain).forEach(target => targets.add(target));
        }
        // query 결과의 `target.ref`/`doc.ref` batch 작업은 바로 앞 반복문의 원천 query만 사용한다.
        if (isContainerWrite && targets.size === 0 && /\.[Rr]ef\b/.test(referenceExpression)) {
            directTargets(prefix).forEach(target => targets.add(target));
        }
        if (targets.size === 0) continue;
        const fields = method === 'delete' ? [] : objectFields(fieldsExpression);
        for (const target of [...targets].sort((left, right) => targetOrder.indexOf(left) - targetOrder.indexOf(right))) {
            if (!hasProtectedFields(target, fields)) continue;
            entries.push({
                target,
                file: path.relative(repoRoot, absolutePath).split(path.sep).join('/'),
                line: lineAt(source, match.index),
                write: isContainerWrite ? `${receiver}.${method}` : method,
                fields,
            });
        }
    }
    return entries;
};

const entries = walk(sourceRoot).flatMap(inventoryFile).sort((left, right) => (
    targetOrder.indexOf(left.target) - targetOrder.indexOf(right.target)
    || left.file.localeCompare(right.file)
    || left.line - right.line
    || left.write.localeCompare(right.write)
));
const summary = Object.fromEntries(targetOrder.map(target => [
    target,
    entries.filter(entry => entry.target === target).length,
]));

console.log(JSON.stringify({
    schemaVersion: 1,
    scope: 'conservative src Firestore direct-writer candidates; server API calls excluded',
    note: 'A call site can appear under multiple targets when the same local symbol name is reused in separate scopes; final audit must inspect each reported file and line.',
    sourceFilesScanned: walk(sourceRoot).length,
    total: entries.length,
    summary,
    entries,
}, null, 2));
