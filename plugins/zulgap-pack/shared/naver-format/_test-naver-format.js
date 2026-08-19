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
ok('blockquote 로 나온다', F.subheading('먼저 갈리는 자리') === '<blockquote><b>먼저 갈리는 자리</b></blockquote>',
   F.subheading('먼저 갈리는 자리'));
ok('h2 를 만들지 않는다', !F.subheading('제목').includes('<h2'));
ok('소제목 안 마크다운도 푼다', F.subheading('**꼭** 보세요').includes('<b>꼭</b>'));

// 🔴 인용구 «안»은 굵게 (2026-08-20 실무 확인)
//   인용구는 이 블로그에서 소제목 자리다 — 굵기가 없으면 본문과 구별이 안 된다.
ok('🔴 소제목이 굵게 나온다', /^<blockquote><b>.+<\/b><\/blockquote>$/.test(F.subheading('소제목')),
   F.subheading('소제목'));
ok('🔴 본문 인용도 «같이» 굵게 — 네이버에서 같은 컴포넌트다',
   /^<blockquote><b>.+<\/b><\/blockquote>$/.test(F.quote('기관 인용입니다')), F.quote('기관 인용입니다'));
// @AI:CONSTRAINT 겹쳐 걸면 네이버가 별표째 남기거나 태그를 뭉갠다
ok('🔴 이미 굵은 줄에 «겹쳐 걸지» 않는다',
   F.subheading('**이미 굵음**') === '<blockquote><b>이미 굵음</b></blockquote>',
   F.subheading('**이미 굵음**'));
ok('문장 «일부»만 굵은 줄은 통째로 감싼다',
   F.subheading('**앞부분**만 굵다') === '<blockquote><b><b>앞부분</b>만 굵다</b></blockquote>',
   F.subheading('**앞부분**만 굵다'));
ok('빈 인용구는 안 감싼다', F.bold('') === '' && F.subheading('') === '<blockquote></blockquote>',
   F.subheading(''));

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
ok('머리 행에 배경색', out.includes(`background-color:${F.TABLE_HEADER_BG}"`));
ok('머리 행에 셀 테두리', out.includes(`border:${F.TABLE_BORDER}`));
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
ok('본문 셀에도 테두리', F.tableCell('<td>값</td>') === `<td style="border:${F.TABLE_BORDER}">값</td>`);
ok('본문 셀엔 배경색이 없다', !F.tableCell('<td>값</td>').includes('background-color'));
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

console.log('\n[9-b] 🔴 여백 칸 수 — 문단 3칸 / 이미지 2칸 (2026-08-20)');
{
  const S = F.SPACER;
  const cnt = (html) => html.split('\n').filter((l) => l.trim() === S).length;
  const runAt = (html, from) => {
    const L = html.split('\n'); let n = 0;
    for (let i = from; i < L.length && L[i].trim() === S; i += 1) n += 1;
    return n;
  };
  const head = (html) => runAt(html, 0);
  const tail = (html) => { const L = html.split('\n'); let n = 0;
    for (let i = L.length - 1; i >= 0 && L[i].trim() === S; i -= 1) n += 1; return n; };

  ok('상수가 3칸 / 2칸이다', F.GAP_PARAGRAPH === 3 && F.GAP_IMAGE === 2,
     `${F.GAP_PARAGRAPH}/${F.GAP_IMAGE}`);
  ok('spacers(n) 는 빈 문단 n 개', F.spacers(3) === [S, S, S].join('\n'));
  ok('spacers(0) 는 빈 문자열', F.spacers(0) === '');

  const src = ['<p>A</p>', S, '<p>B</p>'].join('\n');
  const mid = F.normalizeGaps(src, {});
  ok('문단 사이는 3칸', runAt(mid, 1) === 3, mid);

  // 🔴 원고가 빈 줄을 몇 개 넣었든 «다시 센다» — 쌓기가 아니다
  const messy = ['<p>A</p>', S, S, S, S, S, '<p>B</p>'].join('\n');
  ok('🔴 여백이 쌓이지 않는다 (5칸이 와도 3칸)', runAt(F.normalizeGaps(messy, {}), 1) === 3,
     F.normalizeGaps(messy, {}));

  const both = F.normalizeGaps(src, { before: 'image', after: 'image' });
  ok('이미지 앞은 2칸', head(both) === 2, `${head(both)}칸`);
  ok('이미지 뒤는 2칸', tail(both) === 2, `${tail(both)}칸`);
  ok('🔴 이미지 옆이 문단 사이보다 «좁다»', F.GAP_IMAGE < F.GAP_PARAGRAPH);

  const edge = F.normalizeGaps(src, {});
  ok('글의 처음·끝에는 여백을 안 붙인다', head(edge) === 0 && tail(edge) === 0, edge);

  // 🔴 표는 문단이 아니다 — 줄 사이에 빈 문단이 끼면 네이버가 표를 쪼갠다
  const tbl = ['<p>앞</p>', S, '<table>', '<tr>', '<td>a</td>', '</tr>', '</table>'].join('\n');
  const out = F.normalizeGaps(tbl, {});
  ok('🔴 표 «안»에는 여백을 안 넣는다',
     /<table>\n<tr>\n<td>a<\/td>\n<\/tr>\n<\/table>/.test(out), out);
  ok('표도 문단처럼 3칸을 받는다', runAt(out, 1) === 3, out);

  ok('빈 입력 안전', F.normalizeGaps('', {}) === '' && F.normalizeGaps(null, {}) === '');
  ok('여백만 있는 조각은 비워진다', F.normalizeGaps([S, S].join('\n'), {}) === '');
  ok('결정론 — 두 번 돌려도 같다',
     F.normalizeGaps(both, { before: 'image', after: 'image' }) === both);
}

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
  // 🔴 칸 수는 «문서와 코드 둘 다»에 있다 — 한쪽만 고치면 작성 스킬이 옛 규칙으로 카드를 만든다
  ok('문단 여백 칸 수가 문서와 같다', doc.includes(`**${F.GAP_PARAGRAPH}칸**`),
     `코드=${F.GAP_PARAGRAPH}칸`);
  ok('이미지 여백 칸 수가 문서와 같다', doc.includes(`**${F.GAP_IMAGE}칸**`),
     `코드=${F.GAP_IMAGE}칸`);
  ok('문서가 옆트임을 명시', /옆트임/.test(doc) && /se-object-arrangement-extend/.test(doc));
  ok('🔴 문서가 «클래스로 판정하지 말라»를 명시', /se-l-default/.test(doc));
  ok('문서가 blockquote 를 소제목으로 명시', /blockquote/.test(doc) && /소제목/.test(doc));
  ok('문서가 «인용구 안 굵게»를 명시', /인용구 안/.test(doc) && /굵게/.test(doc));
  ok('문서가 h2 금지를 명시', /h2/.test(doc));
}

// ─────────────────────────────────────────────────────────────
// 🔴 마크다운 이스케이프 — 노션이 특수문자 앞에 `\` 를 붙여 내보낸다 (2026-08-16 실사고)
//   안 풀면 «백슬래시가 글자로» 고객 블로그에 나간다. 실측으로 본 것:
//     3\~4개월 · 2\~4개월 · 4시간 무료주차 \| 일요일·공휴일 진료 가능
// ─────────────────────────────────────────────────────────────
console.log('\n[이스케이프] 노션이 붙인 백슬래시를 푼다');
{
  const t = (s) => F.inline(s);
  ok('🔴 물결(\\~)이 글자로 안 나간다', t('3\\~4개월') === '3~4개월', t('3\\~4개월'));
  ok('🔴 세로선(\\|)도 푼다', t('무료주차 \\| 일요일') === '무료주차 | 일요일', t('무료주차 \\| 일요일'));
  ok('여러 개가 한 줄에 있어도 다 푼다', t('20대\\~40대 · A\\|B') === '20대~40대 · A|B', t('20대\\~40대 · A\\|B'));
  ok('괄호·대괄호도 푼다', t('\\[샘크 철학소구\\]') === '[샘크 철학소구]', t('\\[샘크 철학소구\\]'));

  // @AI:CONSTRAINT 굵게·기울임보다 «나중»에 풀어야 한다 — 먼저 풀면 \* 가 * 가 되어
  //   기울임 변환에 걸리고 이스케이프한 의미가 뒤집힌다.
  ok('🔴 굵게는 그대로 산다', t('**굵게**는 유지') === '<b>굵게</b>는 유지', t('**굵게**는 유지'));
  ok('🔴 이스케이프한 별표는 «기울임이 되지 않는다»',
     !/<i>/.test(t('\\*별표 그대로\\*')) && t('\\*별표 그대로\\*') === '*별표 그대로*', t('\\*별표 그대로\\*'));

  // @AI:CONSTRAINT «모든» 백슬래시를 지우면 본문이 망가진다 — 문장부호 앞만 푼다
  ok('🔴 경로의 백슬래시는 «안» 건드린다', t('C:\\Users 경로').includes('C:\\Users'), t('C:\\Users 경로'));
}

console.log(`\n${fail === 0 ? '✅ ALL PASS' : '❌ FAIL'}  ${pass}/${pass + fail}\n`);
process.exit(fail === 0 ? 0 : 1);
