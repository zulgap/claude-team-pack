#!/usr/bin/env node
/**
 * 노션 카드 마크다운 → 「붙일 조각」 배열
 *
 * @AI:INTENT 이미지 자리에서 끊어 [텍스트][이미지][텍스트]... 로 만든다.
 *   네이버가 외부 이미지 URL 을 안 가져가므로(2026-08-15 실측), 텍스트는 붙여넣고
 *   이미지는 파일로 올려야 한다 → 그 교대 순서를 여기서 만든다.
 *
 * @AI:CONSTRAINT 카드에는 원고와 «내부 메모»가 섞여 있다. 그것까지 올리면 고객 블로그에
 *   우리 내부 문서가 발행된다. 경계 판정이 이 파일의 제1 책임이다.
 *
 * @AI:FRAGILE 🔴 카드 구조가 «동료사마다 다르다» (2026-08-16 전수 실측).
 *   한 가지만 알던 파서가 4개 중 3개를 잘못 다뤘다:
 *     RPG      원고 → `## 재가공 내역` 메모        ✅ 원래 되던 것
 *     마미사    메모 → `## 네이버 게시용 원고` → 원고  ⚠️ 원고를 통째로 버렸다
 *     엔노블    원고 → `> 🔁` 인용문 메모           🔴 메모가 본문에 실렸다
 *     검단가온  `## SEO 제목`·`## 메타 설명` → `# 제목` → 원고  🔴 머리말이 실렸다
 *   그래서 경계를 «네 방향»으로 본다: 시작 / 머리말 / 끝 / 끼어든 메모.
 *   새 동료사를 붙일 때는 카드를 실제로 태워 보고 목록을 늘릴 것.
 */

// ① 본문이 «시작»되는 지점 — 이 헤딩이 있으면 그 앞은 전부 버린다 (마미사형)
const BODY_START_HEADINGS = ['네이버 게시용 원고', '게시용 원고'];

// ② 머리말 — 본문 앞에 붙는 내부 항목. 이 헤딩부터 «다음 헤딩 전까지» 버린다 (검단가온형)
const FRONT_MATTER_HEADINGS = ['SEO 제목', '메타 설명', '황금키워드 분석', '재가공 안내'];

// ③ 본문이 «끝»나는 지점 — 이 헤딩을 만나면 이후는 전부 내부 메모다 (RPG형)
const BODY_END_HEADINGS = [
  '재가공 내역', '썸네일', '발행 전 체크', '검수 결과', '키워드를 바꾼 이유',
  '내부 메모', '작업 메모', '참고 자료',
];

// ④ 헤딩만 버리고 «내용은 남기는» 것 — 원고 안의 구획 표시 (마미사형)
const LABEL_HEADINGS = ['본문', '해시태그', '원문'];
const TITLE_LABEL_HEADINGS = ['제목'];   // 이 헤딩 «다음 줄»이 제목이다

// ⑤ 검증용 지문 — 본문에 이게 남아 있으면 «경계 판정이 뚫린 것»이다.
// @AI:INTENT 헤딩 이름이 아니라 «내용에 찍히는 흔적»을 본다. 구조가 바뀌어도 살아남는 축이다.
const LEAK_FINGERPRINTS = [
  'validate_blog_draft', '--ar ', '--style raw', 'SEO 제목', '메타 설명',
  '삽입 위치', '담당자 피드백', '도구 검수', '오검출', '유사문서',
];

// 강조 밀도 기준 — 2026-08-16 실측(발행글 「원산지증명서」 편: 2,698자에 볼드 37개 ≈ 73자당 1개)
// @AI:INTENT 알림용 잣대일 뿐 차단선이 아니다. 근거는 shared/naver-format/FORMAT.md 「강조」 절.
const EMPHASIS_REF_CHARS_PER_BOLD = 73;   // 기존 글이 이만큼마다 하나씩 굵게 한다
const EMPHASIS_MAX_CHARS_PER_BOLD = 200;  // 이보다 드물면 「강조가 거의 없다」로 보고 알린다

// @AI:INTENT 「무엇인가」(경계 판정)는 이 파일, 「어떻게 보이나」(포맷)는 공용 정본.
//   경로가 pack root 기준이라 스킬 폴더 이름이 설치마다 달라도 같은 곳을 가리킨다.
//   규칙을 여기에 되돌려 적지 말 것 — 채널이 늘 때마다 흩어진다(2026-08-16 그래서 분리했다).
const NF = require('../../../shared/naver-format/naver-format');

const IMG_RE = /^!\[([^\]]*)\]\(([^)]+)\)\s*$/;
const HEADING_RE = /^(#{1,4})\s+(.+?)\s*$/;

/**
 * 본문 한가운데 끼어든 내부 메모 (엔노블형).
 * @AI:CONSTRAINT «모든 인용문»을 버리면 안 된다 — 검단가온 카드는 의료 안내와 기관 인용을
 *   인용문으로 싣고, 그건 발행돼야 한다(`> **의료 안내**`, `> 1. 국소 마취를…`).
 *   내부 메모만 «이모지로 시작»한다는 것이 둘을 가르는 실측 지문이다.
 */
const MEMO_QUOTE_RE = /^>\s*(🔁|✅|📌|⚠️|ℹ️|🗂️|🖼️|📝|💡|🔴|🚨)/u;
/** AI 이미지 지시줄 — `🖼️ **이미지1 (AI)**: …` 과 그 뒤 프롬프트 코드블록 */
const IMG_DIRECTIVE_RE = /^🖼️/u;
const FENCE_RE = /^```/;

const startsWithAny = (text, list) => {
  const t = text.replace(/[()[\]]/g, '').trim();
  return list.some((k) => t.startsWith(k));
};
function isBodyEndHeading(text) { return startsWithAny(text, BODY_END_HEADINGS); }
function isBodyStartHeading(text) { return startsWithAny(text, BODY_START_HEADINGS); }
function isFrontMatterHeading(text) { return startsWithAny(text, FRONT_MATTER_HEADINGS); }
function isLabelHeading(text) { return startsWithAny(text, LABEL_HEADINGS); }
function isTitleLabelHeading(text) { return startsWithAny(text, TITLE_LABEL_HEADINGS); }

/**
 * 본문 시작 헤딩이 있으면 그 앞을 잘라낸다.
 * @AI:INTENT 2-pass 로 나눈 이유 — 한 번에 돌면 «앞쪽» 메모의 `검수 결과` 를 만나 끝으로 판정하고
 *   진짜 원고를 통째로 버린다(마미사 3편이 실제로 그랬다). 자를 곳을 먼저 정한다.
 */
function cutToBodyStart(lines) {
  const idx = lines.findIndex((l) => {
    const h = l.match(HEADING_RE);
    return h && isBodyStartHeading(h[2]);
  });
  return idx < 0 ? { lines, cut: 0 } : { lines: lines.slice(idx + 1), cut: idx + 1 };
}

/** 인라인 마크다운 → HTML. 구현은 공용 정본에 있다(중복 금지). */
const inline = NF.inline;

/**
 * @param {string} md  노션 카드 본문 마크다운
 * @returns {{title:string|null, blocks:Array, dropped:number, images:number}}
 *   blocks: [{kind:'html', html}, {kind:'image', url, caption}]
 */
function parseCard(md) {
  const all = String(md || '').replace(/\r\n/g, '\n').split('\n');
  const cutRes = cutToBodyStart(all);
  const lines = cutRes.lines;
  const blocks = [];
  let title = null;
  let buf = [];              // 현재 텍스트 조각 (HTML 줄들)
  let inTable = false;
  let listOpen = false;
  let ended = false;         // 본문 경계를 지났나
  let inFence = false;       // ``` 코드블록 안 (AI 이미지 프롬프트)
  let skipSection = false;   // 머리말 섹션 안 (다음 헤딩까지 버린다)
  let expectTitle = false;   // 「제목」 라벨 바로 다음 줄을 기다린다
  let tableRow = 0;          // 표 안 몇 번째 행인가 (머리 행 판정)
  let tableHasHeader = false;
  let dropped = cutRes.cut;  // 시작 경계 앞에서 버린 줄까지 센다

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

    // 코드블록 — AI 이미지 프롬프트가 여기 들어 있다. 통째로 버린다.
    // @AI:CONSTRAINT 열림/닫힘을 «먼저» 본다. 안 그러면 프롬프트 안의 #·- 가 헤딩·목록으로 해석된다.
    if (FENCE_RE.test(line)) { inFence = !inFence; dropped++; continue; }
    if (inFence) { dropped++; continue; }

    // 본문에 끼어든 내부 메모 (엔노블형) — 이모지로 시작하는 인용문·지시줄
    if (MEMO_QUOTE_RE.test(line) || IMG_DIRECTIVE_RE.test(line)) { flushText(); dropped++; continue; }

    // 표 — 구조는 원본을 그대로 두고, «표현»만 공용 정본에 맡긴다
    // (머리 행 색 + 셀 안 마크다운 풀기. 규칙은 naver-format.js 가 안다)
    if (/^<table/i.test(line)) { inTable = true; tableRow = 0; tableHasHeader = NF.tableWantsHeader(line); }
    if (inTable) {
      if (skipSection) { dropped++; }
      else {
        if (/^<tr/i.test(line)) tableRow += 1;
        buf.push(/^<t[dh]/i.test(line)
          ? NF.tableCell(line, { isHeaderRow: tableHasHeader && tableRow === 1 })
          : line);
      }
      if (/<\/table>/i.test(line)) inTable = false;
      continue;
    }

    const img = line.match(IMG_RE);
    if (img) {
      if (skipSection) { dropped++; continue; }
      flushText();
      blocks.push({ kind: 'image', url: img[2].trim(), caption: img[1].trim() });
      continue;
    }

    const h = line.match(HEADING_RE);
    if (h) {
      const level = h[1].length, text = h[2];
      // @AI:CONSTRAINT 판정 순서가 곧 안전이다. 「SEO 제목」을 「제목」으로 먼저 잡으면
      //   내부 머리말이 글 제목이 된다 — 머리말·끝 경계를 제목보다 «먼저» 본다.
      if (isBodyEndHeading(text)) { flushText(); ended = true; dropped++; continue; }
      if (isFrontMatterHeading(text)) { flushText(); skipSection = true; dropped++; continue; }
      skipSection = false;                                   // 다른 헤딩 = 머리말 구간 끝
      if (level === 1 && title === null) { title = text; continue; }   // 제목은 제목칸으로
      if (isTitleLabelHeading(text)) { expectTitle = true; dropped++; continue; }  // 다음 줄이 제목
      if (isLabelHeading(text)) { dropped++; continue; }      // 구획 표시 — 헤딩만 버리고 내용은 남긴다
      flushList();
      // 🔴 소제목은 «인용구»다 — <h2> 는 네이버에서 컴포넌트가 안 되고 앞 문단에 흡수된다.
      //   이 블로그 발행글 4편이 전부 인용구를 소제목 자리에 쓴다(CIF 10개·마케터가 5개).
      buf.push(NF.subheading(text));
      buf.push(NF.SPACER);
      continue;
    }

    if (skipSection) { dropped++; continue; }

    // 「제목」 라벨 다음의 첫 내용 줄 = 글 제목 (마미사형)
    if (expectTitle) {
      if (!line.trim()) continue;
      if (title === null) title = line.trim();
      expectTitle = false;
      dropped++;
      continue;
    }

    // 구분선 — 버리지 않는다. 기존 발행글이 실제로 쓴다(마케터가 편 9개)
    if (/^(-{3,}|\*{3,}|_{3,})$/.test(line)) { flushList(); buf.push(NF.divider()); continue; }

    // 🔴 «줄 전체가 볼드» = 소제목 (2026-08-16 실측)
    // @AI:INTENT 카드가 소제목을 `##` 로 쓰기도 하고 `**볼드**` 로 쓰기도 한다.
    //   마미사·검단가온 카드는 후자다 — 그대로 두면 굵은 문단이 되어 네이버에서 밋밋하다.
    // @AI:FRAGILE 판정축은 «줄 전체»다. 본문 중간 강조는 문장 «일부»라(`**A**입니다.`)
    //   안 걸린다. 길이로 자르지 말 것 — 긴 소제목이 있고 짧은 강조 문장도 있다.
    const boldOnly = line.match(/^\*\*(.+?)\*\*$/);
    if (boldOnly) { flushList(); buf.push(NF.subheading(boldOnly[1])); buf.push(NF.SPACER); continue; }

    const li = line.match(/^\s*[-*]\s+(.+)$/);
    if (li) {
      if (!listOpen) { buf.push('<ul>'); listOpen = true; }
      buf.push(`<li>${inline(li[1])}</li>`);
      continue;
    }

    const quote = line.match(/^>\s?(.*)$/);
    if (quote) { flushList(); buf.push(NF.quote(quote[1])); continue; }

    // 원고의 빈 줄은 «여백»이다. 버리면 문단이 빽빽하게 붙는다
    if (!line.trim()) { flushList(); buf.push(NF.SPACER); continue; }

    flushList();
    // 문단 뒤에 여백 한 칸 — 기존 글은 빈 문단이 56~61%
    buf.push(NF.paragraph(line));
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

  // @AI:INTENT 카드에 제목이 «없는 것이 정상»인 구조가 있다 — 엔노블 카드는 본문에 H1 이 없고
  //   노션 「기획안(👇클릭해주세요)」 속성이 제목이다. 그때는 조회한 값을 opts.title 로 넘긴다.
  const effectiveTitle = parsed.title || opts.title;
  if (!effectiveTitle) {
    problems.push('제목이 없습니다 (카드에 「# 제목」 줄이 없으면 노션 「기획안」 값을 opts.title 로 넘기세요)');
  }
  if (plain.length < 300) problems.push(`본문이 너무 짧습니다 (${plain.length}자)`);
  if (parsed.images === 0) problems.push('이미지가 0장입니다');

  // 내부 메모가 새어 들어왔나 — 경계 판정 실패의 지문
  // @AI:CONSTRAINT 경계 판정이 «또» 뚫릴 것을 전제한 2차 방어선이다(구조가 4가지였고
  //   앞으로 더 늘어난다). 헤딩 목록만 보던 1차 방어는 엔노블·검단가온을 놓쳤다.
  for (const k of [...BODY_END_HEADINGS, ...LEAK_FINGERPRINTS]) {
    if (plain.includes(k)) problems.push(`내부 메모로 보이는 문구가 본문에 남아 있습니다: "${k}"`);
  }
  // 지시문·마커 잔존
  if (/\[이미지\s*\d+/.test(plain)) problems.push('이미지 마커가 남아 있습니다');
  if (/TODO|FIXME|<[A-Z_]{3,}>/.test(plain)) problems.push('플레이스홀더가 남아 있습니다');

  // 강조 밀도 — «세기만» 한다
  // @AI:CONSTRAINT 여기서 볼드를 «넣지» 말 것. 어디를 굵게 할지는 「작성」의 판단이고,
  //   발행이 정하면 원고를 고치는 셈이다(FORMAT.md 「강조」 절). 세는 것은 결정론이라 여기서 한다.
  // @AI:INTENT 막지 않고 알리기만 한다 — 이미 만들어진 카드 26편이 전부 강조 0 이라
  //   차단하면 전부 멈춘다. 강조 부족은 «깨짐»이 아니라 «덜 좋음»이다.
  const warnings = [];
  const bolds = (textHtml.match(/<b>/g) || []).length;
  const perBold = bolds ? Math.round(plain.length / bolds) : null;
  if (plain.length >= 300 && (bolds === 0 || perBold > EMPHASIS_MAX_CHARS_PER_BOLD)) {
    warnings.push(
      `문장 안 강조가 ${bolds}개입니다 (본문 ${plain.length}자). ` +
      `기존 발행글은 ${EMPHASIS_REF_CHARS_PER_BOLD}자당 1개꼴이라 ` +
      `${Math.round(plain.length / EMPHASIS_REF_CHARS_PER_BOLD)}개 안팎이 어울립니다 — ` +
      `카드를 만드는 쪽에서 «문장 일부»를 **굵게** 표시해 주세요`,
    );
  }

  return {
    ok: problems.length === 0, problems, warnings,
    body_chars: plain.length, bolds, chars_per_bold: perBold,
    title: effectiveTitle || null,
  };
}

module.exports = {
  parseCard, validateCard, inline,
  BODY_END_HEADINGS, BODY_START_HEADINGS, FRONT_MATTER_HEADINGS,
  LABEL_HEADINGS, TITLE_LABEL_HEADINGS, LEAK_FINGERPRINTS,
};

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
