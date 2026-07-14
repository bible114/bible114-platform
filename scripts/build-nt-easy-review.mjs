import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const REVIEW_DIR = path.join(ROOT, 'review');
const shardNames = [
    'nt_easy_quiz_candidates_001_122.json',
    'nt_easy_quiz_candidates_123_244.json',
    'nt_easy_quiz_candidates_245_365.json',
];
const days = shardNames.flatMap(name => JSON.parse(fs.readFileSync(path.join(REVIEW_DIR, name), 'utf8')))
    .sort((a, b) => Number(a.day) - Number(b.day));
const embedded = JSON.stringify(days).replace(/</g, '\\u003c');

const html = `<!doctype html>
<html lang="ko">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>신약일독 쉬운 퀴즈 검수</title>
  <style>
    *{box-sizing:border-box}body{margin:0;background:#f5f7fb;color:#182230;font-family:-apple-system,BlinkMacSystemFont,"Apple SD Gothic Neo","Malgun Gothic",sans-serif}
    header{position:sticky;top:0;z-index:5;background:#fff;border-bottom:1px solid #dde3ee;padding:18px 20px}.wrap{max-width:1100px;margin:auto}
    h1{font-size:22px;margin:0 0 8px}.muted{color:#667085;font-size:13px}.toolbar{display:flex;flex-wrap:wrap;gap:8px;margin-top:14px}
    input,select,button,textarea{font:inherit}input,select{border:1px solid #cfd6e4;border-radius:10px;padding:9px 11px;background:white}button{border:0;border-radius:10px;padding:9px 12px;font-weight:700;cursor:pointer}
    main{padding:20px}.day{background:white;border:1px solid #e1e6ef;border-radius:18px;margin-bottom:16px;overflow:hidden}.dayhead{padding:16px 18px;background:#eef2ff}.dayhead h2{font-size:18px;margin:0}.questions{padding:8px 18px 18px}
    .q{border-top:1px solid #edf0f5;padding:16px 0}.q:first-child{border-top:0}.qtitle{font-weight:800;margin-bottom:9px}.choices{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:7px}.choice{background:#f7f8fa;border-radius:9px;padding:8px 10px}.answer{background:#dcfce7;color:#166534;font-weight:800}
    .meta{font-size:12px;color:#667085;margin-top:8px}.review{display:flex;flex-wrap:wrap;gap:7px;margin-top:10px}.review button{background:#e9edf4;color:#344054}.review button.active[data-status="approved"]{background:#16a34a;color:white}.review button.active[data-status="revise"]{background:#f59e0b;color:white}.review button.active[data-status="rejected"]{background:#dc2626;color:white}.note{width:100%;margin-top:8px;padding:8px;border:1px solid #d8deea;border-radius:9px}
    .primary{background:#4f46e5;color:white}.summary{font-weight:800;color:#4338ca}.empty{text-align:center;color:#667085;padding:50px}.hidden{display:none}
    @media(max-width:650px){.choices{grid-template-columns:1fr}.toolbar>*{width:100%}header{position:static}}
  </style>
</head>
<body>
<header><div class="wrap"><h1>신약일독 쉬운 퀴즈 검수</h1><div class="muted">검수 전 후보입니다. 변경 내용은 이 브라우저에 임시 저장되며, 내보내기로 결과를 보관할 수 있습니다.</div><div class="toolbar"><input id="search" placeholder="본문·질문 검색"><input id="fromDay" type="number" min="1" max="365" value="1" aria-label="시작 DAY"><input id="toDay" type="number" min="1" max="365" value="20" aria-label="끝 DAY"><select id="status"><option value="all">전체 상태</option><option value="pending">대기</option><option value="approved">승인</option><option value="revise">수정 필요</option><option value="rejected">제외</option></select><button class="primary" id="export">검수 결과 내보내기</button></div><div class="summary" id="summary"></div></div></header>
<main class="wrap" id="app"></main>
<script>
const days=${embedded};
const storageKey='b114_nt_easy_quiz_review_v1';
const saved=JSON.parse(localStorage.getItem(storageKey)||'{}');
const getId=(day,index)=>'d'+day+'_q'+(index+1);
const stateFor=(day,index,q)=>saved[getId(day,index)]||{status:q.reviewStatus||'pending',note:q.reviewNote||''};
function persist(){localStorage.setItem(storageKey,JSON.stringify(saved));renderSummary()}
function setReview(day,index,status){const id=getId(day,index);saved[id]={...(saved[id]||{}),status,note:saved[id]?.note||''};persist();render()}
function setNote(day,index,note){const id=getId(day,index);saved[id]={...(saved[id]||{}),status:saved[id]?.status||'pending',note};persist()}
function filtered(){const text=document.querySelector('#search').value.trim().toLowerCase();const from=Number(document.querySelector('#fromDay').value)||1;const to=Number(document.querySelector('#toDay').value)||365;const wanted=document.querySelector('#status').value;return days.filter(d=>d.day>=from&&d.day<=to).map(d=>({...d,questions:d.questions.map((q,i)=>({...q,_i:i,_review:stateFor(d.day,i,q)})).filter(q=>(wanted==='all'||q._review.status===wanted)&&(!text||[d.range,q.q,q.ref,...q.choices].join(' ').toLowerCase().includes(text)))})).filter(d=>d.questions.length)}
function esc(v){return String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}
function renderSummary(){const all=days.flatMap(d=>d.questions.map((q,i)=>stateFor(d.day,i,q).status));const counts={pending:0,approved:0,revise:0,rejected:0};all.forEach(s=>counts[s]=(counts[s]||0)+1);document.querySelector('#summary').textContent='전체 '+all.length+'문항 · 대기 '+counts.pending+' · 승인 '+counts.approved+' · 수정 '+counts.revise+' · 제외 '+counts.rejected}
function render(){const app=document.querySelector('#app');const list=filtered();if(!list.length){app.innerHTML='<div class="empty">조건에 맞는 문항이 없습니다.</div>';renderSummary();return}app.innerHTML=list.map(d=>'<section class="day"><div class="dayhead"><h2>DAY '+d.day+' · '+esc(d.range)+'</h2><div class="muted">'+esc(d.date)+'</div></div><div class="questions">'+d.questions.map(q=>'<article class="q"><div class="qtitle">'+(q._i+1)+'. '+esc(q.q)+'</div><div class="choices">'+q.choices.map((c,i)=>'<div class="choice '+(i===q.answerIndex?'answer':'')+'">'+(i+1)+'. '+esc(c)+'</div>').join('')+'</div><div class="meta">근거: '+esc(q.ref)+'</div><div class="review">'+[['approved','승인'],['revise','수정 필요'],['rejected','제외']].map(x=>'<button data-status="'+x[0]+'" class="'+(q._review.status===x[0]?'active':'')+'" onclick="setReview('+d.day+','+q._i+',\\''+x[0]+'\\')">'+x[1]+'</button>').join('')+'</div><textarea class="note" rows="2" placeholder="수정 의견" oninput="setNote('+d.day+','+q._i+',this.value)">'+esc(q._review.note)+'</textarea></article>').join('')+'</div></section>').join('');renderSummary()}
['search','fromDay','toDay','status'].forEach(id=>document.querySelector('#'+id).addEventListener('input',render));
document.querySelector('#export').addEventListener('click',()=>{const result=days.map(d=>({...d,questions:d.questions.map((q,i)=>({...q,...stateFor(d.day,i,q)}))}));const blob=new Blob([JSON.stringify(result,null,2)],{type:'application/json'});const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download='nt_easy_quiz_review_result.json';a.style.display='none';document.body.appendChild(a);a.click();a.remove();const button=document.querySelector('#export');button.textContent='내보내기 완료';setTimeout(()=>{URL.revokeObjectURL(url);button.textContent='검수 결과 내보내기'},1000)});
render();
</script>
</body></html>`;

const output = path.join(REVIEW_DIR, 'NT_EASY_QUIZ_REVIEW.html');
fs.writeFileSync(output, html);
console.log(`검수 화면 생성: ${path.relative(ROOT, output)} (${days.length}일)`);
