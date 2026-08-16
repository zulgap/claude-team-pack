#!/usr/bin/env node
/**
 * 네이버 블로그 포맷 — 마크다운 조각을 «네이버 붙여넣기 HTML» 로 만든다
 *
 * @AI:INTENT 포맷 규칙의 유일한 집. 카드를 만드는 쪽(작성 스킬)과 올리는 쪽(발행 스킬)이
 *   같은 규칙을 본다 — 원소스 멀티유즈. 규칙이 파서마다 흩어지면 채널이 늘 때마다 무너진다.
 * @AI:CONSTRAINT 결정론 100%. 같은 입력이면 항상 같은 HTML 이다. 판단이 필요한 것
 *   (이미지를 어디에 넣을지·소제목 문구)은 «작성» 단계에서 이미 끝났다 — 여기서는 «표현»만 한다.
 *
 * 근거: 같은 폴더 FORMAT.md (ff1030 발행글 4편 + 에디터 실험 실측, 2026-08-16)
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
const SPACER = '<p><br></p>';              // 문단 사이 여백. 기존 글은 문단의 56~61% 가 빈 문단

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

/** 문단. 뒤에 여백 한 칸을 붙인다 — 이 블로그 글은 여백으로 숨을 쉰다. */
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
  TABLE_HEADER_BG, TABLE_HEADER_FG, TABLE_BORDER, SPACER,
};
