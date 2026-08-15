#!/usr/bin/env node
/**
 * naver-format 시나리오 — 규칙은 전부 «실측»에서 왔다 (FORMAT.md 참조)
 * 실행: node _test-naver-format.js   (종료코드 0 = ALL PASS)
 */
const F = require('./naver-format');

let pass = 0, fail = 0;
const ok = (n, c, d = '') => { c ? (pass++, console.log(`  ✅ ${n}`)) : (fail++, console.log(`  ❌ ${n}${d ? '  → ' + d : ''}`)); };

console.log('\n[1] inline — 마크다운 인라인');
ok('굵게', F.inline('아주 **중요**합니다') === '아주 <b>중요</b>합니다');
ok('기울임', F.inline('*강조*') === '<i>강조</i>');
ok('링크', F.inline('[줄갭](https://zulgap.kr)') === '<a href="https://zulgap.kr">줄갭</a>');
ok('🔴 이스케이프를 먼저 — 꺾쇠가 태그로 새지 않는다', F.inline('a < b & c') === 'a &lt; b &amp; c');
ok('우리가 만든 태그는 안 깨진다', F.inline('**<b>**').includes('<b>&lt;b&gt;</b>'));
ok('빈값 안전', F.inline(null) === '' && F.inline(undefined) === '');

console.log('\n[2] 소제목 — 🔴 h2 가 아니라 인용구');
ok('blockquote 로 나온다', F.subheading('먼저 갈리는 자리') === '<blockquote>먼저 갈리는 자리</blockquote>');
ok('h2 를 만들지 않는다', !F.subheading('제목').includes('<h2'));
ok('소제목 안 마크다운도 푼다', F.subheading('**꼭** 보세요').includes('<b>꼭</b>'));

console.log('\n[3] 여백 — 이 블로그 글은 여백으로 숨을 쉰다 (기존 글 빈 문단 56~61%)');
const p = F.paragraph('본문입니다');
ok('문단 뒤에 여백이 붙는다', p.endsWith(F.SPACER), p);
ok('여백은 빈 문단이다', F.SPACER === '<p><br></p>');
ok('끄면 여백이 없다', F.paragraph('본문', { spacer: false }) === '<p>본문</p>');

console.log('\n[4] 구분선 — 버리지 말 것 (마케터가 편 9개 사용)');
ok('hr 로 나온다', F.divider() === '<hr>');

console.log('\n[5] 목록·강조');
ok('ul/li', F.list(['하나', '둘']) === '<ul>\n<li>하나</li>\n<li>둘</li>\n</ul>');
ok('빈 목록도 안 깨진다', F.list([]).includes('<ul>') && F.list(null).includes('<ul>'));
ok('19px 강조', F.emphasis('중요') === '<p><span style="font-size:19px">중요</span></p>');

console.log('\n[6] 표 — 머리 행 색 (🔴 header-row 속성은 네이버가 무시한다)');
const TABLE = [
  '<table header-row="true">',
  '<tr>', '<td>항목</td>', '<td>**THC**</td>', '</tr>',
  '<tr>', '<td>운임</td>', '<td>대당 부과</td>', '</tr>',
  '</table>',
];
const out = F.table(TABLE);
ok('머리 행에 배경색', out.includes(`style="background-color:${F.TABLE_HEADER_BG}"`));
ok('🔴 글자색은 span 에 (td 는 안 먹는다)', out.includes(`<span style="color:${F.TABLE_HEADER_FG};">항목</span>`));
ok('머리 행 셀 마크다운도 푼다', out.includes('<b>THC</b>'));
ok('본문 행에는 배경색이 없다', !out.split('</tr>')[1].includes('background-color'));
ok('본문 행 마크다운도 푼다', F.table(['<table>', '<tr>', '<td>**굵게**</td>', '</tr>', '</table>']).includes('<b>굵게</b>'));
ok('표 구조는 유지된다', out.startsWith('<table header-row="true">') && out.trimEnd().endsWith('</table>'));

console.log('\n[7] 표 — header-row 가 없으면 색을 넣지 않는다');
const plainTable = F.table(['<table>', '<tr>', '<td>머리</td>', '</tr>', '</table>']);
ok('색 없음', !plainTable.includes('background-color'));
ok('tableWantsHeader 판정', F.tableWantsHeader('<table header-row="true">') === true
  && F.tableWantsHeader('<table>') === false);

console.log('\n[8] tableCell — 단독 호출');
ok('머리 셀', F.tableCell('<td>값</td>', { isHeaderRow: true }).includes('background-color'));
ok('본문 셀', F.tableCell('<td>값</td>') === '<td>값</td>');
ok('th 도 처리', F.tableCell('<th>값</th>', { isHeaderRow: true }).includes('<th style='));
ok('셀이 아니면 그대로', F.tableCell('<tr>') === '<tr>');

console.log('\n[9] createTableCollector — 파서가 줄을 흘려 넣는 통로');
const c = F.createTableCollector();
let done = null;
for (const line of TABLE) { const r = c.feed(line); if (r) done = r; }
ok('닫힐 때만 결과를 준다', done !== null);
ok('결과가 table() 과 같다', done === out);
ok('닫힌 뒤엔 열려 있지 않다', c.isOpen === false);
const c2 = F.createTableCollector();
ok('표 밖 줄은 무시', c2.feed('<p>문단</p>') === null && c2.isOpen === false);
ok('여는 줄만 넣으면 아직 안 닫힘', c2.feed('<table>') === null && c2.isOpen === true);

console.log('\n[10] 🔴 FORMAT.md 동기화 — 문서와 코드가 갈라지면 여기서 깨진다');
const fs = require('fs');
const path = require('path');
const docPath = path.join(__dirname, 'FORMAT.md');
if (!fs.existsSync(docPath)) {
  ok('FORMAT.md 존재', false, '정본 문서가 없다 — 코드만 있으면 작성 스킬이 규칙을 못 읽는다');
} else {
  const doc = fs.readFileSync(docPath, 'utf8');
  ok('표 머리 배경값이 문서와 같다', doc.includes(F.TABLE_HEADER_BG), `코드=${F.TABLE_HEADER_BG}`);
  ok('표 머리 글자색이 문서와 같다', doc.includes(F.TABLE_HEADER_FG), `코드=${F.TABLE_HEADER_FG}`);
  ok('여백 표기가 문서와 같다', doc.includes(F.SPACER), `코드=${F.SPACER}`);
  ok('문서가 blockquote 를 소제목으로 명시', /blockquote/.test(doc) && /소제목/.test(doc));
  ok('문서가 h2 금지를 명시', /h2/.test(doc));
}

console.log(`\n${fail === 0 ? '✅ ALL PASS' : '❌ FAIL'}  ${pass}/${pass + fail}\n`);
process.exit(fail === 0 ? 0 : 1);
