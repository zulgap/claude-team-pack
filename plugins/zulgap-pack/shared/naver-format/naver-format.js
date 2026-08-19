#!/usr/bin/env node
/**
 * 네이버 블로그 포맷 — 마크다운 조각을 «네이버 붙여넣기 HTML» 로 만든다
 *
 * @AI:INTENT 포맷 규칙의 유일한 집. 카드를 만드는 쪽(작성 스킬)과 올리는 쪽(발행 스킬)이
 *   같은 규칙을 본다 — 원소스 멀티유즈. 규칙이 파서마다 흩어지면 채널이 늘 때마다 무너진다.
 * @AI:CONSTRAINT 결정론 100%. 같은 입력이면 항상 같은 HTML 이다. 판단이 필요한 것
 *   (이미지를 어디에 넣을지·소제목 문구)은 «작성» 단계에서 이미 끝났다 — 여기서는 «표현»만 한다.
 *
 * 근거: 같은 폴더 FORMAT.md (대상 블로그 발행글 4편 + 에디터 실험 실측, 2026-08-16)
 */

// ─────────────────────────────────────────────────────────────
// 실측값 — FORMAT.md 와 «동기화 테스트»로 묶여 있다. 한쪽만 고치면 테스트가 깨진다.
// ─────────────────────────────────────────────────────────────
const TABLE_HEADER_BG = 'rgb(0,78,130)';   // 기존 발행글 표 머리 행 배경
const TABLE_HEADER_FG = '#ffffff';         // 🔴 td 가 아니라 span 에 준다 (td 는 안 먹는다)
// @AI:INTENT 셀 테두리. 기존 발행글은 «선이 없고» 색으로만 갈랐는데(2026-08-16 실측),
//   사장님이 검수하시고 선을 넣기로 하셨다(2026-08-16). 그래서 여기서만 다르다 —
//   기존 글과 모양이 갈리는 지점이니 되돌릴 때도 이 상수 하나만 보면 된다.
const TABLE_BORDER = '1px solid #d5d5d5';
const SPACER = '<p><br></p>';              // 여백 «한 칸»의 최소 단위 (빈 문단 하나)

// @AI:INTENT 여백은 «몇 칸»이냐가 규칙이다 — 담당자가 손으로 칠 때 엔터를 몇 번 누르는지와 같다.
//   2026-08-20 실무 확인: 문단↔문단은 «엔터 3번», 문단↔이미지는 «엔터 2번».
//   그 전에는 어디든 한 칸이라, 손으로 친 글과 나란히 놓으면 빽빽해 보였다.
// @AI:CONSTRAINT 이미지 옆이 «더 좁다». 반대로 넣지 말 것 — 이미지는 그 자체로 쉼이라
//   위아래까지 벌리면 글이 토막나 보인다.
const GAP_PARAGRAPH = 3;   // 문단 ↔ 문단 (소제목·표·구분선 사이도 같다)
const GAP_IMAGE = 2;       // 문단 ↔ 이미지

/** 여백 n 칸. */
function spacers(n) { return new Array(Math.max(0, n)).fill(SPACER).join('\n'); }

/**
 * 조각 안의 여백을 «정규화»한다 — 원고가 빈 줄을 몇 개 넣었든 규칙대로 다시 센다.
 *
 * @AI:INTENT 여백을 «쌓기»로 만들면 원고에 따라 들쭉날쭉해진다(문단 뒤 1칸 + 원고 빈 줄 1칸 = 2칸).
 *   그래서 만들 때는 한 칸만 넣어 두고, 여기서 «한 번에» 규칙대로 다시 센다. 결정론이 유지된다.
 * @AI:CONSTRAINT 조각의 «양 끝»은 이웃이 정한다 — 앞뒤가 이미지면 GAP_IMAGE, 글의 처음/끝이면 0.
 *   조각 «안»에서는 알 수 없어서(다음 조각을 모른다) 호출자가 알려 준다.
 * @AI:CONSTRAINT 🔴 표 줄(<tr>·<td>) 사이는 «여백 자리가 아니다». 빈 문단이 끼면 표가 쪼개진다.
 *   여기서는 SPACER 줄만 세므로 표 줄은 그대로 지나간다 — 그 성질을 깨는 수정을 하지 말 것.
 *
 * @param {string} html 조각 HTML
 * @param {{before:string, after:string}} neighbors 'image' 면 그쪽에 이미지가 붙어 있다
 */
function normalizeGaps(html, { before = 'none', after = 'none' } = {}) {
  const lines = String(html == null ? '' : html).split('\n');
  const isSpacer = (l) => l.trim() === SPACER;

  // ① 안쪽의 «연속» 여백을 GAP_PARAGRAPH 칸으로 다시 센다
  const body = [];
  let run = 0;
  for (const l of lines) {
    if (isSpacer(l)) { run += 1; continue; }
    if (run > 0 && body.length) body.push(spacers(GAP_PARAGRAPH));
    run = 0;
    body.push(l);
  }
  // 끝에 남은 run 은 «조각 끝 여백»이라 ② 가 정한다 — 여기서 버린다

  // ② 양 끝 — 이웃이 정한다
  while (body.length && !body[0].trim()) body.shift();
  while (body.length && !body[body.length - 1].trim()) body.pop();
  const head = before === 'image' ? [spacers(GAP_IMAGE)] : [];
  const tail = after === 'image' ? [spacers(GAP_IMAGE)] : [];
  return [...head, ...body, ...tail].join('\n');
}

/**
 * 인라인 마크다운 → HTML.
 * @AI:CONSTRAINT 이스케이프를 «먼저» 한다. 나중에 하면 우리가 만든 태그까지 깨진다.
 */
// 마크다운 이스케이프 — 노션이 특수문자 앞에 `\` 를 붙여 내보낸다
// @AI:INTENT 🔴 2026-08-16 실측 — 안 풀면 «백슬래시가 글자로 나간다»:
//   `3\~4개월` · `2\~4개월` · `4시간 무료주차 \| 일요일·공휴일 진료 가능`
//   고객 블로그에 그대로 실리는 글이라 눈에 띈다.
// @AI:CONSTRAINT «문장부호 앞»의 백슬래시만 푼다. 모든 `\` 를 지우면 경로·정규식 같은
//   본문 내용이 망가진다. 마크다운이 실제로 이스케이프하는 문자만 목록으로 둔다.
// @AI:CONSTRAINT 굵게·기울임보다 «나중»에 푼다 — 먼저 풀면 `\*` 가 `*` 가 되어
//   기울임 변환에 걸리고, 이스케이프한 의미가 뒤집힌다.
const MD_ESCAPED = /\\([\\`*_{}[\]()#+\-.!|~>])/g;

function inline(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    // @AI:CONSTRAINT 🔴 `\*` 처럼 «이스케이프된» 별표는 서식으로 보지 않는다.
    //   앞의 백슬래시를 안 막으면 `\*별표 그대로\*` 가 `\<i>별표 그대로\</i>` 가 된다
    //   (2026-08-16 테스트가 잡음 — 백슬래시는 남고 기울임까지 먹는 최악의 조합).
    .replace(/(?<!\\)\*\*(.+?)(?<!\\)\*\*/g, '<b>$1</b>')
    .replace(/(?<![\\*])\*(?!\*)(.+?)(?<![\\*])\*(?!\*)/g, '<i>$1</i>')
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>')
    .replace(MD_ESCAPED, '$1');
}

/**
 * 소제목 — 🔴 «인용구»로 만든다.
 * @AI:FRAGILE `<h2>` 를 쓰지 말 것. 네이버에서 «별도 컴포넌트가 되지 않고» 앞 문단에 텍스트로
 *   흡수된다(2026-08-16 실험). 반면 `<blockquote>` 는 se-quotation 컴포넌트가 되고,
 *   그것이 이 블로그가 소제목을 다루는 방식이다(발행글 4편 전부 사용 — CIF 10개·마케터가 5개).
 */
function subheading(text) { return `<blockquote>${inline(text)}</blockquote>`; }

/** 본문 인용 — 소제목과 «같은 태그지만 다른 의도». 원문 인용·의료 안내 등이 여기 온다. */
function quote(text) { return `<blockquote>${inline(text)}</blockquote>`; }

/**
 * 문단. 뒤에 여백을 «한 칸» 붙인다.
 * @AI:CONSTRAINT 여기서 «몇 칸»인지 정하지 않는다 — 실제 칸 수는 normalizeGaps 가 조각 단위로
 *   다시 센다. 여기서 칸을 늘리면 원고의 빈 줄과 합쳐져 들쭉날쭉해진다.
 */
function paragraph(text, { spacer = true } = {}) {
  return spacer ? `<p>${inline(text)}</p>\n${SPACER}` : `<p>${inline(text)}</p>`;
}

/** 구분선. `---` 를 버리지 말 것 — 기존 글이 실제로 쓴다(마케터가 9개). */
function divider() { return '<hr>'; }

/** 목록 — 항목 배열을 통째로 받는다(열고 닫기를 호출자가 관리하지 않게). */
function list(items) {
  const li = (items || []).map((t) => `<li>${inline(t)}</li>`).join('\n');
  return `<ul>\n${li}\n</ul>`;
}

/** 큰 글씨 강조 — 기존 글에 19px 문단이 전부 있다(2~10개). */
function emphasis(text, px = 19) {
  return `<p><span style="font-size:${px}px">${inline(text)}</span></p>`;
}

// ─────────────────────────────────────────────────────────────
// 표
// ─────────────────────────────────────────────────────────────
const TABLE_OPEN_RE = /^<table/i;
const TABLE_CLOSE_RE = /<\/table>/i;
const ROW_OPEN_RE = /^<tr/i;
const CELL_RE = /^(<t[dh][^>]*>)([\s\S]*?)(<\/t[dh]>)$/i;

/** `<table …>` 줄에서 머리 행 여부를 읽는다. */
function tableWantsHeader(openLine) {
  return /header-row\s*=\s*["']?true/i.test(openLine);
}

/**
 * 표 셀 한 줄을 네이버용으로 바꾼다.
 *
 * @AI:CONSTRAINT 두 가지를 한다 —
 *   ① 셀 «안의» 마크다운을 푼다. 안 풀면 `<td>**THC**</td>` 의 별표가 «글자 그대로» 발행된다
 *      (RPG 카드에 실재한다 — 2026-08-16 실측).
 *   ② 머리 행이면 배경색을 입힌다. 🔴 `header-row="true"` 속성은 «네이버가 무시»하므로
 *      인라인 style 이 유일한 길이다. 글자색은 td 가 아니라 span 에 준다(td 는 안 먹는다).
 */
function tableCell(line, { isHeaderRow = false } = {}) {
  const m = line.match(CELL_RE);
  if (!m) return line;
  const [, open, innerText, close] = m;
  const html = inline(innerText);
  const style = isHeaderRow
    ? `border:${TABLE_BORDER};background-color:${TABLE_HEADER_BG}`
    : `border:${TABLE_BORDER}`;
  const openWithStyle = open.replace(/^(<t[dh])/i, `$1 style="${style}"`);
  if (!isHeaderRow) return `${openWithStyle}${html}${close}`;
  return `${openWithStyle}<span style="color:${TABLE_HEADER_FG};">${html}</span>${close}`;
}

/**
 * 표 전체(줄 배열)를 변환한다.
 * @param {string[]} lines `<table …>` 부터 `</table>` 까지
 */
function table(lines) {
  let wantsHeader = false;
  let row = 0;
  return (lines || []).map((line) => {
    if (TABLE_OPEN_RE.test(line)) { wantsHeader = tableWantsHeader(line); row = 0; return line; }
    if (ROW_OPEN_RE.test(line)) { row += 1; return line; }
    if (/^<t[dh]/i.test(line)) return tableCell(line, { isHeaderRow: wantsHeader && row === 1 });
    return line;
  }).join('\n');
}

// ─────────────────────────────────────────────────────────────
// 줄 단위 상태기 — 파서가 «무엇인지»만 판정하고 표현은 여기에 맡긴다
// ─────────────────────────────────────────────────────────────
/**
 * 표를 모으는 작은 상태기. 파서가 표 줄을 하나씩 흘려 넣으면
 * 닫히는 순간 완성된 HTML 을 돌려준다(그 전에는 null).
 */
function createTableCollector() {
  let open = false;
  let buf = [];
  return {
    get isOpen() { return open; },
    /** @returns {string|null} 표가 닫히면 완성 HTML, 아니면 null */
    feed(line) {
      if (!open && TABLE_OPEN_RE.test(line)) { open = true; buf = [line]; }
      else if (open) buf.push(line);
      else return null;
      if (open && TABLE_CLOSE_RE.test(line)) { open = false; const out = table(buf); buf = []; return out; }
      return null;
    },
  };
}

module.exports = {
  inline, subheading, quote, paragraph, divider, list, emphasis,
  table, tableCell, tableWantsHeader, createTableCollector,
  spacers, normalizeGaps,
  TABLE_HEADER_BG, TABLE_HEADER_FG, TABLE_BORDER, SPACER, GAP_PARAGRAPH, GAP_IMAGE,
};
