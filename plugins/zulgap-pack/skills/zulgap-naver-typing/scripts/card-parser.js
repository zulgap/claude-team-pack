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
// @AI:CONSTRAINT 🔴 「참고 자료」를 이 목록에 «되돌리지 말 것» (2026-08-16 제거).
//   원 목록은 RPG 카드 «한 장»만 보고 지은 것이라 «독자에게 보여야 할» 출처 절까지 잘랐다.
//   댕묘 카드는 `### 참고 자료`(기관명·법령명) 다음에 «해시태그 10개»가 오는 구조라,
//   여기서 끊으면 출처와 해시태그가 «둘 다» 조용히 사라진다 — 그런데 검증은 통과한다
//   (끊긴 뒤라 유출 지문에도 안 걸린다). 실측: 댕묘형 카드에서 해시태그 유입 0건.
//   출처 표기는 저작권법상 필수이기도 하다(CLAUDE.md 「외부 자료 인용 하드리밋」).
//   전수 실측(2026-08-16, 카드 4장) 결과 이것을 «내부 메모»로 쓰는 동료사는 없었다.
const BODY_END_HEADINGS = [
  '재가공 내역', '썸네일', '발행 전 체크', '검수 결과', '키워드를 바꾼 이유',
  '내부 메모', '작업 메모',
];

// ⑥ 썸네일 — 검색결과·블로그 목록에 뜨는 «얼굴». 본문 이미지가 아니라 «따로» 회수한다.
// @AI:INTENT 네이버는 대표 이미지를 «본문에 있는 그림 중에서만» 고른다. 그래서 버리면
//   아무리 정성껏 만들어도 얼굴로 못 쓴다 — 본문 «맨 끝»에 한 장 얹는다(2026-08-16 사장님 결정).
// @AI:FRAGILE 🔴 자리가 동료사마다 다르다 (카드 4장 실측):
//   댕묘  해시태그 → `### 썸네일` → 그림 → `---` → `## 재가공 내역`   ← 이 헤딩이 «경계를 켠다»
//   RPG   … → `## 재가공 내역` → `## 썸네일` → 그림                  ← 경계 «너머»에 있다
//   엔노블·검단가온  섹션 자체가 «없다»
//   그래서 본문 파싱과 «별개의 훑기»로 뽑는다. 경계 상태에 얽히면 한쪽을 반드시 놓친다.
const THUMBNAIL_HEADINGS = ['썸네일'];

// ④ 헤딩만 버리고 «내용은 남기는» 것 — 원고 안의 구획 표시 (마미사형)
const LABEL_HEADINGS = ['본문', '해시태그', '원문'];
const TITLE_LABEL_HEADINGS = ['제목'];   // 이 헤딩 «다음 줄»이 제목이다

// ⑤ 검증용 지문 — 본문에 이게 남아 있으면 «경계 판정이 뚫린 것»이다.
// @AI:INTENT 헤딩 이름이 아니라 «내용에 찍히는 흔적»을 본다. 구조가 바뀌어도 살아남는 축이다.
const LEAK_FINGERPRINTS = [
  'validate_blog_draft', '--ar ', '--style raw', 'SEO 제목', '메타 설명',
  '삽입 위치', '담당자 피드백', '도구 검수', '오검출', '유사문서',
  // 붙여넣기 안내 (2026-08-16) — 자리 판정(cutPasteNotice)이 1차, 이게 2차 방어선이다.
  // @AI:CONSTRAINT 「붙여넣」 만으로 줄이지 말 것 — 마미사는 «도구 사용법»을 다루는 블로그라
  //   본문에 「붙여넣기」가 정상적으로 나온다. 카드 템플릿의 «관용구»만 지문으로 쓴다.
  '붙여넣기 안내', '그대로 붙여넣는 원고',
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
function isThumbnailHeading(text) { return startsWithAny(text, THUMBNAIL_HEADINGS); }

/**
 * 「썸네일」 절의 그림 한 장을 뽑는다 — 본문 경계와 «무관하게» 훑는다.
 *
 * @AI:CONSTRAINT 🔴 URL 로 판정하지 말 것. 검단가온 카드는 «본문 첫 사진»이 노션 S3
 *   (`prod-files-secure…amazonaws`)라, URL 을 축으로 삼으면 본문 사진이 대표로 둔갑한다.
 *   축은 «썸네일 헤딩»이고, 그 다음 «헤딩 전까지»에서 첫 그림만 가져온다.
 * @AI:CONSTRAINT 그림 «한 장»만이다. 카피 메모(`카피 : …`)와 업로드 주의문은 그 절에 같이
 *   들어 있는 내부 메모라 절대 본문으로 넘기지 않는다 — 여기서 그림만 집으면 자동으로 지켜진다.
 * @returns {{url:string, caption:string}|null}
 */
function extractThumbnail(lines) {
  const at = lines.findIndex((l) => {
    const h = l.match(HEADING_RE);
    return h && isThumbnailHeading(h[2]);
  });
  if (at < 0) return null;
  for (let j = at + 1; j < lines.length; j++) {
    const l = lines[j].trimEnd();
    if (HEADING_RE.test(l)) break;               // 다음 절로 넘어갔다 — 없는 것이다
    const m = l.match(IMG_RE);
    if (m) return { url: m[2].trim(), caption: m[1].trim() };
  }
  return null;
}
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

/**
 * 카드 «맨 앞»의 붙여넣기 안내를 잘라낸다.
 *
 * @AI:INTENT 🔴 2026-08-16 실측 — 타이피스트에게 하는 말이 «고객 블로그 첫 줄»로 나가고 있었다:
 *   RPG  `> 네이버 블로그에 그대로 붙여넣는 원고입니다. …`
 *   댕묘  `> **붙여넣기 안내**` + `> 1. 제목 끝 괄호는 떼고 …` (여러 줄) + `---`
 *   이모지로 시작하지 않아 MEMO_QUOTE_RE 를 통과하고 유출 지문에도 없어 «검증까지 초록»이었다.
 *
 * @AI:CONSTRAINT 판정축은 «자리»다 — 첫 헤딩·첫 본문 줄보다 «앞»에 있는 인용문만.
 *   ❌ 문구 목록으로 잡지 말 것: 동료사마다 다르게 쓰고 새 문구가 계속 생긴다.
 *   ❌ «모든» 인용문을 버리지 말 것: 검단가온은 의료 안내·기관 인용을 본문에 인용문으로 싣고
 *      그건 발행돼야 한다. 그것들은 전부 본문 «안»(첫 줄 뒤)이라 이 규칙에 안 걸린다.
 *   안내문 뒤의 구분선 하나까지 함께 먹는다 — 그건 안내문과 본문을 가르는 선이지 본문이 아니다.
 */
function cutPasteNotice(lines) {
  let i = 0;
  while (i < lines.length && !lines[i].trim()) i++;               // 앞쪽 빈 줄
  let end = i;
  while (end < lines.length && /^>/.test(lines[end].trim())) end++;
  if (end === i) return { lines, cut: 0 };                        // 맨 앞이 인용문이 아니다 = 안내문 없음
  while (end < lines.length && !lines[end].trim()) end++;         // 뒤따르는 빈 줄
  if (end < lines.length && /^(-{3,}|\*{3,}|_{3,})$/.test(lines[end].trim())) {
    end++;                                                        // 안내문과 본문을 가르는 선 «하나»
    while (end < lines.length && !lines[end].trim()) end++;
  }
  return { lines: lines.slice(end), cut: end };
}

/** 인라인 마크다운 → HTML. 구현은 공용 정본에 있다(중복 금지). */
const inline = NF.inline;

/**
 * @param {string} md  노션 카드 본문 마크다운
 * @returns {{title:string|null, blocks:Array, dropped:number, images:number}}
 *   blocks: [{kind:'html', html}, {kind:'image', url, caption}]
 */
/**
 * 원고 손질 — 붙이기 «전»에 두 가지를 바꾼다 (담당자 확정 2026-08-20).
 *
 * @AI:INTENT ① 본문 안 해시태그는 «태그칸»이 갖는다. 본문에 남기면 글 끝이 태그 목록으로 끝난다.
 *   빼기만 하면 태그가 사라지므로 «돌려준다» — naver-fill 의 setTags 가 그걸 넣는다.
 * @AI:INTENT ② 「참고 자료」는 1열 2행 표로 감싼다 — 1행 「참고자료」(굵게), 2행은 기호목록(왼쪽 정렬).
 *   대상 블로그 발행글이 그 모양이고, 출처가 본문과 섞이지 않아 읽기 좋다.
 * @AI:CONSTRAINT 표 셀 안 줄바꿈은 `<br>` 로 넣는다 — inline() 이 escape 하므로 나중에 되돌린다.
 */
function prepareBody(md) {
  const lines = String(md == null ? '' : md).replace(/\r\n/g, '\n').split('\n');
  const out = [];
  const tags = [];
  let i = 0;
  while (i < lines.length) {
    const ln = lines[i];

    // 해시태그만 있는 줄 → 본문에서 빼고 태그로 돌려준다
    if (/^\s*#[^\s#]+(\s+#[^\s#]+)+\s*$/.test(ln)) {
      ln.trim().split(/\s+/).forEach((t) => tags.push(t.replace(/^#/, '')));
      i += 1;
      continue;
    }

    // 「참고 자료」 절 → 1열 2행 표
    if (/^#{2,4}\s*참고\s*자료\s*$/.test(ln)) {
      const items = [];
      let k = i + 1;
      while (k < lines.length && (/^\s*[-*]\s+/.test(lines[k]) || !lines[k].trim())) {
        if (/^\s*[-*]\s+/.test(lines[k])) items.push(lines[k].replace(/^\s*[-*]\s+/, '').trim());
        k += 1;
      }
      if (items.length) {
        out.push('<table header-row="false">');
        out.push('<tr>'); out.push('<td>참고자료</td>'); out.push('</tr>');
        out.push('<tr>'); out.push('<td>' + items.map((x) => '• ' + x).join('<br>') + '</td>'); out.push('</tr>');
        out.push('</table>');
        i = k;
        continue;
      }
    }
    out.push(ln);
    i += 1;
  }
  return { md: out.join('\n'), tags };
}
function parseCard(md) {
  // 🔴 붙이기 전에 원고를 손질한다 — 해시태그 분리 · 참고자료 표 (2026-08-20)
  const prepared = prepareBody(md);
  const cardTags = prepared.tags;
  const all = String(prepared.md || '').replace(/\r\n/g, '\n').split('\n');
  const cutRes = cutToBodyStart(all);
  // @AI:INTENT 순서가 중요하다 — «본문 시작» 헤딩을 먼저 보고, 그 뒤에 남은 것의 맨 앞을 본다.
  //   반대로 하면 마미사처럼 안내문이 머리말 «안»에 있는 구조에서 헛돈다(이미 잘려 있다).
  const noticeRes = cutPasteNotice(cutRes.lines);
  const lines = noticeRes.lines;
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
  let dropped = cutRes.cut + noticeRes.cut;  // 시작 경계·안내문에서 버린 줄까지 센다

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
    //
    // @AI:CONSTRAINT 🔴 «안쪽에 `**` 가 또 있으면 소제목이 아니다» (2026-08-20 실측).
    //   `$` 앵커 탓에 lazy 여부와 무관하게 «첫 `**` ~ 마지막 `**`» 가 통째로 걸린다.
    //   그래서 굵게로 «시작해서» 굵게로 «끝나는» 평범한 문단이 —
    //     `**주사기로 밀어 넣지 마세요.** 강제 급여는 … **나쁜 기억과 한 덩어리가 됩니다.**`
    //   — 문단 하나가 통째로 인용구가 되어 나갔다(댕묘 8/21 5편 중 3편에서 발생).
    //   증상이 «본문이 사라진 것»이 아니라 «소제목이 길어진 것»이라 검증도 눈도 안 걸렀고,
    //   사람이 발행 직전에 발견했다. 안쪽 `**` 하나만 세면 갈린다.
    const boldOnly = line.match(/^\*\*(.+?)\*\*$/);
    if (boldOnly && !boldOnly[1].includes('**')) {
      flushList(); buf.push(NF.subheading(boldOnly[1])); buf.push(NF.SPACER); continue;
    }

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

  // 썸네일은 «본문 맨 끝»에 한 장 얹는다 (2026-08-16 사장님 결정).
  // @AI:INTENT blocks 에 «넣는» 이유 = 다운로드·업로드·개수검증이 전부 blocks 를 돈다
  //   (naver-fill: downloadImages → 채우기 루프 → verifyFilled). 따로 들고 있으면
  //   그 세 곳에 배선을 새로 내야 하고, 한 곳만 빠져도 «얼굴 없이» 나간다.
  // @AI:INTENT thumbnailIndex 를 «따로» 주는 이유 = 대표로 지정할 자리를 채우는 쪽이
  //   세지 않아도 되게. 「마지막이 썸네일」은 썸네일이 있을 때만 참이라 셈으로 알면 틀린다.
  const thumbnail = extractThumbnail(lines);
  if (thumbnail) blocks.push({ kind: 'image', url: thumbnail.url, caption: thumbnail.caption });

  // 🔴 여백 정규화 — «조각을 다 만든 뒤» 한 번에 한다 (2026-08-20)
  // @AI:INTENT 여백 규칙은 이웃을 알아야 정할 수 있다(문단 옆 3칸 / 이미지 옆 2칸).
  //   파싱 루프 «안»에서는 다음 조각이 무엇인지 모른다 — 그래서 여기서, 앞뒤를 보고 정한다.
  // @AI:CONSTRAINT 규칙 자체는 naver-format 이 안다. 여기서 칸 수를 세지 말 것 —
  //   카드를 «만드는» 스킬도 같은 함수를 보므로, 숫자가 두 곳에 있으면 갈라진다.
  // 🔴 여백은 «이웃 한 쌍»이 정한다 (naver-format 의 규칙표). 문장 나누기도 여기서 함께 일어난다.
  // @AI:CONSTRAINT 칸 수를 여기서 세지 말 것 — 카드를 «만드는» 스킬도 같은 표를 본다.
  const spaced = NF.applyGaps(blocks);
  blocks.length = 0;
  spaced.forEach((x) => blocks.push(x));
  // 표 셀 — 가운데 정렬 · 16px · 1행 굵게 (참고자료 표의 2행은 왼쪽)
  blocks.forEach((b) => {
    if (b.kind === 'html') b.html = NF.styleTableCells(b.html).split('&lt;br&gt;').join('<br>');
  });
  const images = blocks.filter((b) => b.kind === 'image').length;
  return {
    title,
    tags: cardTags,
    blocks,
    dropped,
    images,
    thumbnail,
    thumbnailIndex: thumbnail ? images - 1 : null,
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

  // 🔴 썸네일 필수 (2026-08-16 사장님 확정 — 「블로그는 전부 썸네일을 넣는다」)
  //
  // @AI:CONSTRAINT 네이버는 대표 이미지를 «본문에 있는 그림 중에서만» 고른다.
  //   카드에 썸네일이 없으면 파서가 만들어낼 수 없고, 검색결과에는 본문 첫 도식이 나간다.
  //   그래서 「경고」가 아니라 «차단»이다 — 알림은 무시되지만 차단은 안 무시된다.
  // @AI:INTENT 🔴 이 검사가 없던 이유가 오독이었다 — 카드 4장을 열어 보고
  //   「엔노블·검단가온은 썸네일을 안 만든다」로 보고했는데, 그건 «카드가 빠뜨린 것»이지
  //   방침이 아니었다. 썸네일 생성기는 동료사마다 이미 있었고(`zulgap-*-thumbnail`)
  //   **부르는 자리만 없었다.** 관측을 정책으로 읽으면 결함이 규격이 된다.
  // @AI:CONSTRAINT 헤딩만 보고 통과시키지 말 것 — RPG 3편은 `## 썸네일` 아래에
  //   `⬜ **미제작**` 만 있다(2026-08-16 실측 16편 중 3편). 판정축은 «그림이 있나»다.
  //   `parsed.thumbnail` 은 그 절에서 «이미지 줄»만 집으므로 미제작이면 자동으로 null 이다.
  // @AI:INTENT opts.requireThumbnail=false 로 끌 수 있다 — 「없이 급히 내보낸다」는
  //   사람의 판단이지 도구의 판단이 아니다. 다만 «명시»해야 열린다(기본값은 막는 쪽).
  if (opts.requireThumbnail !== false && !parsed.thumbnail) {
    problems.push(
      '썸네일이 없습니다 — 네이버는 «본문에 있는 그림 중에서만» 얼굴(대표 이미지)을 고르므로 ' +
      '이대로 나가면 검색결과에 본문 첫 그림이 뜹니다. ' +
      '동료사 전용 썸네일 스킬(`zulgap-<동료사>-thumbnail`)로 만들어 카드 「## 썸네일」 절에 넣어 주세요',
    );
  }

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
