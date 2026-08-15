#!/usr/bin/env node
/**
 * 노션 카드 마크다운 → 「붙일 조각」 배열
 *
 * @AI:INTENT 이미지 자리에서 끊어 [텍스트][이미지][텍스트]... 로 만든다.
 *   네이버가 외부 이미지 URL 을 안 가져가므로(2026-08-15 실측), 텍스트는 붙여넣고
 *   이미지는 파일로 올려야 한다 → 그 교대 순서를 여기서 만든다.
 *
 * @AI:CONSTRAINT 카드에는 «본문» 뒤에 내부 메모(재가공 내역·썸네일·발행 전 체크)가 붙어 있다.
 *   그것까지 올리면 고객에게 내부 문서가 발행된다. 경계 판정이 이 파일의 제1 책임이다.
 */

// 본문이 끝나는 지점 — 이 헤딩을 만나면 이후는 전부 내부 메모다.
// @AI:FRAGILE 새 섹션명이 생기면 여기 추가. 못 알아보면 «내부 메모가 발행된다».
const BODY_END_HEADINGS = [
  '재가공 내역', '썸네일', '발행 전 체크', '검수 결과', '키워드를 바꾼 이유',
  '내부 메모', '작업 메모', '참고 자료',
];

const IMG_RE = /^!\[([^\]]*)\]\(([^)]+)\)\s*$/;
const HEADING_RE = /^(#{1,4})\s+(.+?)\s*$/;

function isBodyEndHeading(text) {
  const t = text.replace(/[()]/g, '').trim();
  return BODY_END_HEADINGS.some((k) => t.startsWith(k));
}

/** 인라인 마크다운 → HTML (네이버 에디터가 붙여넣기로 받는 형태) */
function inline(s) {
  return s
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/\*\*(.+?)\*\*/g, '<b>$1</b>')
    .replace(/(?<!\*)\*(?!\*)(.+?)(?<!\*)\*(?!\*)/g, '<i>$1</i>')
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>');
}

/**
 * @param {string} md  노션 카드 본문 마크다운
 * @returns {{title:string|null, blocks:Array, dropped:number, images:number}}
 *   blocks: [{kind:'html', html}, {kind:'image', url, caption}]
 */
function parseCard(md) {
  const lines = String(md || '').replace(/\r\n/g, '\n').split('\n');
  const blocks = [];
  let title = null;
  let buf = [];              // 현재 텍스트 조각 (HTML 줄들)
  let inTable = false;
  let listOpen = false;
  let ended = false;         // 본문 경계를 지났나
  let dropped = 0;

  const flushList = () => { if (listOpen) { buf.push('</ul>'); listOpen = false; } };
  const flushText = () => {
    flushList();
    const html = buf.join('\n').trim();
    if (html) blocks.push({ kind: 'html', html });
    buf = [];
  };

  for (const raw of lines) {
    const line = raw.trimEnd();

    if (ended) { dropped++; continue; }

    // 표는 원본 HTML 이 이미 들어있다 — 그대로 통과시킨다
    if (/^<table/i.test(line)) inTable = true;
    if (inTable) {
      buf.push(line);
      if (/<\/table>/i.test(line)) inTable = false;
      continue;
    }

    const img = line.match(IMG_RE);
    if (img) {
      flushText();
      blocks.push({ kind: 'image', url: img[2].trim(), caption: img[1].trim() });
      continue;
    }

    const h = line.match(HEADING_RE);
    if (h) {
      const level = h[1].length, text = h[2];
      if (level === 1 && title === null) { title = text; continue; }   // 제목은 제목칸으로
      if (isBodyEndHeading(text)) { flushText(); ended = true; dropped++; continue; }
      flushList();
      buf.push(`<h${Math.min(level, 4)}>${inline(text)}</h${Math.min(level, 4)}>`);
      continue;
    }

    if (/^(-{3,}|\*{3,}|_{3,})$/.test(line)) { flushList(); continue; }  // 구분선은 버린다

    const li = line.match(/^\s*[-*]\s+(.+)$/);
    if (li) {
      if (!listOpen) { buf.push('<ul>'); listOpen = true; }
      buf.push(`<li>${inline(li[1])}</li>`);
      continue;
    }

    const quote = line.match(/^>\s?(.*)$/);
    if (quote) { flushList(); buf.push(`<blockquote>${inline(quote[1])}</blockquote>`); continue; }

    if (!line.trim()) { flushList(); continue; }

    flushList();
    buf.push(`<p>${inline(line)}</p>`);
  }

  flushText();
  return {
    title,
    blocks,
    dropped,
    images: blocks.filter((b) => b.kind === 'image').length,
  };
}

/** 검증 — 붙이기 전에 「이 카드가 올려도 되는 상태인가」 */
function validateCard(parsed, opts = {}) {
  const problems = [];
  const textHtml = parsed.blocks.filter((b) => b.kind === 'html').map((b) => b.html).join('\n');
  const plain = textHtml.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();

  if (!parsed.title) problems.push('제목(# 줄)이 없습니다');
  if (plain.length < 300) problems.push(`본문이 너무 짧습니다 (${plain.length}자)`);
  if (parsed.images === 0) problems.push('이미지가 0장입니다');

  // 내부 메모가 새어 들어왔나 — 경계 판정 실패의 지문
  for (const k of BODY_END_HEADINGS) {
    if (plain.includes(k)) problems.push(`내부 메모로 보이는 문구가 본문에 남아 있습니다: "${k}"`);
  }
  // 지시문·마커 잔존
  if (/\[이미지\s*\d+/.test(plain)) problems.push('이미지 마커가 남아 있습니다');
  if (/TODO|FIXME|<[A-Z_]{3,}>/.test(plain)) problems.push('플레이스홀더가 남아 있습니다');

  return { ok: problems.length === 0, problems, body_chars: plain.length };
}

module.exports = { parseCard, validateCard, inline, BODY_END_HEADINGS };

if (require.main === module) {
  const fs = require('fs');
  const p = process.argv[2];
  if (!p) { console.log('사용: node card-parser.js <카드마크다운파일>'); process.exit(2); }
  const parsed = parseCard(fs.readFileSync(p, 'utf8'));
  const v = validateCard(parsed);
  console.log(JSON.stringify({
    제목: parsed.title,
    조각수: parsed.blocks.length,
    이미지: parsed.images,
    본문글자: v.body_chars,
    버린줄: parsed.dropped,
    검증: v.ok ? 'OK' : v.problems,
    순서: parsed.blocks.map((b) => b.kind === 'image' ? `[img]` : `[text ${b.html.length}]`).join(' '),
  }, null, 2));
}
