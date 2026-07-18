import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import QRCode from 'qrcode';

const root = new URL('../', import.meta.url);
const source = fs.readFileSync(new URL('src/components/ChurchAdminView.jsx', root), 'utf8');
const start = source.indexOf('const printMemberGuide = async');
const end = source.indexOf('// ── 관리자 매뉴얼', start);
const guide = source.slice(start, end);
const templateMatch = guide.match(/const html = `([\s\S]*?)`;\n\s*openPrintWindow/);
if (!templateMatch) throw new Error('성도용 가입 안내문 HTML 템플릿을 찾지 못했습니다.');

const SITE_URL = 'https://www.bible114.net';
const churchName = '테스트교회';
const qrDataUrl = await QRCode.toDataURL(SITE_URL, { width: 560, margin: 1 });
const codeBlock = '<span class="code">114TEST</span>';
const esc = value => String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
const render = new Function('churchName', 'qrDataUrl', 'codeBlock', 'esc', 'SITE_URL', `return \`${templateMatch[1]}\`;`);
const previewCss = `
@media screen {
  body { background: #e2e8f0; padding: 24px 0; }
  main { width: 210mm; height: 297mm; padding: 15mm; margin: 0 auto 24px; background: white; overflow: hidden; }
  .page-two { break-before: auto; page-break-before: auto; padding-top: 17mm; }
}`;
const html = render(churchName, qrDataUrl, codeBlock, esc, SITE_URL)
    .replace('</style>', `${previewCss}\n</style>`)
    .replace(/<script>window\.onload = function\(\)\{ window\.print\(\); \};<\/script>/, '');

const outputDir = fileURLToPath(new URL('test-artifacts/round29-20260718/', root));
fs.mkdirSync(outputDir, { recursive: true });
const outputPath = path.join(outputDir, 'member-guide.html');
fs.writeFileSync(outputPath, html);
console.log(outputPath);
