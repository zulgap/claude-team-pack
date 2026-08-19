#!/usr/bin/env node
/**
 * 네이버 글쓰기 창 채우기 — 조각 배열을 순서대로 넣는다
 *
 * @AI:CONSTRAINT 등록·저장 버튼을 누르지 않는다. 채우고 «멈춘다». 등록은 사람이 한다.
 * @AI:INTENT 클립보드를 쓰지 않는다 — 팀원이 작업 중 무언가를 복사하면 깨지기 때문.
 *   paste 이벤트를 에디터에 직접 전달한다(2026-08-15 실측: 서식 유지된 채 주입 성공).
 *
 * 실측으로 확정된 셀렉터 (2026-08-15)
 *   본문 컨테이너 : `.se-content`    ← `.se-main-container` 는 «존재하지 않는다»
 *   문단          : `.se-text-paragraph`
 *   에디터 프레임 : name === 'mainFrame'
 *   file input    : 0개 → 「사진」 버튼 클릭 후 filechooser 를 가로챈다
 */

const fs = require('fs');
const path = require('path');
// 포맷 정본 — 글꼴 같은 «규칙»은 여기서 읽는다 (카드를 만드는 쪽과 같은 값)
const NF = require(path.join(__dirname, '../../../shared/naver-format/naver-format.js'));

const BODY = '.se-content';
const PARA = '.se-text-paragraph';

// ─────────────────────────────────────────────────────────────
function getFrame(page) {
  const f = page.frames().find((x) => x.name() === 'mainFrame');
  if (!f) throw new Error('글쓰기 화면이 아닙니다 (mainFrame 없음). 네이버 블로그 글쓰기를 열어 주세요.');
  return f;
}

/**
 * 본문 상태를 읽는다.
 *
 * @AI:FRAGILE 빈 글쓰기 창도 `.se-content` innerText 가 55자쯤 나온다 — 전부 «플레이스홀더»다
 *   (2026-08-15 실측): "제목" + "나를 돌아보는 회고, 뜻밖의 발견을 기다립니다. #모두의회고"
 *   가운데 문구는 «네이버 캠페인»이라 수시로 바뀐다.
 *
 *   ❌ 문구를 목록으로 막지 말 것 — 캠페인이 바뀌는 날 빈 창을 「내용 있음」으로 판정해
 *      스킬이 통째로 멈춘다(사람은 왜 막혔는지 모른다).
 *   ❌ cloneNode 후 innerText 도 안 된다 — 복사본은 화면에 없어 «숨은 텍스트까지» 세서
 *      오히려 늘어난다(실측 55 → 88자).
 *   ✅ 네이버 «자신의» 판정축을 쓴다: 컴포넌트마다 `.se-placeholder` 가 있고
 *      내용이 들어가면 그것이 `display:none` 이 된다. 보이면 = 비어 있음.
 */
async function readBody(frame) {
  return frame.evaluate((sel) => {
    const c = document.querySelector(sel);
    if (!c) return { chars: 0, images: 0, naverImages: 0, externalImages: 0, missing: true };

    const hasRealContent = (comp) => {
      const ph = comp.querySelector('.se-placeholder');
      if (!ph) return true;                                   // placeholder 자체가 없으면 실제 내용
      return getComputedStyle(ph).display === 'none';          // 숨겨졌으면 사용자가 채운 것
    };

    // 제목칸(se-documentTitle)은 본문이 아니다 — 본문 컴포넌트만 센다
    const bodyComps = [...c.querySelectorAll('.se-component')]
      .filter((comp) => !comp.classList.contains('se-documentTitle'));

    const chars = bodyComps
      .filter(hasRealContent)
      .map((comp) => (comp.innerText || '').replace(/​/g, '').trim())
      .join('\n').trim().length;

    const srcOf = (i) => i.getAttribute('src') || '';
    const allImgs = bodyComps.flatMap((comp) => [...comp.querySelectorAll('img')]);
    const imgs = allImgs.filter((i) => !/^data:/.test(srcOf(i)));

    return {
      chars,
      images: imgs.length,
      naverImages: imgs.filter((i) => /pstatic|naver/.test(srcOf(i))).length,
      externalImages: imgs.filter((i) => !/pstatic|naver/.test(srcOf(i))).length,
      // @AI:INTENT 이미지 «자리» 수 — 플레이스홀더로 그려진 것까지 센다. 이것이 판정축이다.
      //   2026-08-16 실측: 글을 붙이면 이미 올라간 이미지가 화면에서 SVG 플레이스홀더로 바뀐다.
      //   그런데 임시저장된 문서를 서버에서 받아 보면 이미지 URL 이 «10개 전부» 들어 있다
      //   (RabbitTempPostRead 응답: 이미지 10 / SVG 0). 즉 깨진 게 아니라 «표시»만 바뀐 것이다.
      //   그래서 naverImages(화면에 URL 이 붙은 수)로 성공을 재면 오판하고,
      //   그 오판이 재시도와 «멀쩡한 이미지 삭제»를 부른다.
      slots: allImgs.length,
      // @AI:CONSTRAINT 이 숫자를 「업로드 실패」로 읽지 말 것 — 위 실측이 아니라고 말한다.
      //   화면 표시 상태일 뿐이라 사람에게 보여 줄 참고값이다.
      placeholders: allImgs.filter((i) => /^data:image\/svg/.test(srcOf(i))).length,

      // 🔴 서식 오염 — 우리가 «안 보낸» 서식이 글에 먹었나 (2026-08-16 실사고)
      // @AI:INTENT 취소선 토글이 켜진 채 붙여넣으면 «글 전체»가 취소선이 된다(실측 175개).
      //   우리 HTML 에는 <s>/<del>/<strike> 이 «한 번도» 들어가지 않는다 — 그러니 화면에
      //   하나라도 있으면 그건 «에디터가 씌운 것»이고, 그대로 나가면 고객 블로그에 줄 그은 글이 실린다.
      // @AI:CONSTRAINT 끄는 것(clearFormatting)만으로는 부족하다 — «결과»를 세야 안 나간다.
      //   사장님이 화면을 보고 발견하신 사고다. 사람 눈이 마지막 방어선이면 안 된다.
      struck: c.querySelectorAll('s, del, strike').length,

      // 🔴 굵게 누출 (2026-08-20 실사고 — 나래님이 화면에서 발견)
      // @AI:INTENT 취소선과 달리 굵게는 «우리도 쓴다». 그래서 「있으면 막는다」로는 못 잡는다.
      //   재는 축은 «글자 수»다 — 우리가 보낸 <b> 안의 글자보다 화면이 훨씬 많으면 번진 것이다.
      // @AI:CONSTRAINT 개수(<b> 태그 수)로 재지 말 것 — 에디터가 한 문단을 span 여러 개로 쪼개
      //   태그 수가 원본과 안 맞는다. 글자 수는 쪼개져도 합이 같아 흔들리지 않는다.
      boldChars: [...c.querySelectorAll('b, strong')]
        .map((b) => (b.innerText || '').replace(/\s+/g, '').length)
        .reduce((a, n) => a + n, 0),
    };
  }, BODY);
}

const PLACEHOLDER_IMG = 'img[src^="data:image/svg"]';

/**
 * 플레이스홀더로 «그려진» 이미지 자리 하나를 지운다.
 *
 * 🔴 **채우기 경로에서 부르지 말 것.** 플레이스홀더는 「업로드 실패」가 아니라 «화면 표시»다 —
 *   문서에는 이미지가 온전히 들어 있음을 서버 응답으로 확인했다(2026-08-16, PROVENANCE 참조).
 *   그걸 모르고 이 함수로 «정리»하다가 멀쩡한 그림을 지웠다(10장 → 9장).
 *   사람이 「이 그림은 빼 달라」고 지목했을 때를 위해 남겨 둘 뿐이다.
 *
 * @AI:CONSTRAINT DOM 에서 직접 remove 하지 않는다 — 네이버 에디터는 자체 문서 모델을 들고 있어
 *   DOM 만 지우면 저장 때 되살아나거나 문서가 깨진다. 에디터가 스스로 지우게 한다.
 * @AI:FRAGILE `element.click()` 은 «선택»으로 인식되지 않는다(2026-08-16 실측: 지워지지 않음).
 *   실제 마우스 좌표 클릭이라야 컴포넌트가 선택되고 Delete 가 먹는다.
 *   여기서는 좌표를 써도 안전하다 — 대상 컴포넌트의 boundingBox 한가운데이고, 본문 영역이라
 *   발행 버튼 같은 위험한 것이 근처에 없다.
 * @returns {boolean} 실제로 하나 줄었는지
 */
async function removePlaceholder(page, frame) {
  const before = await readBody(frame);
  if (!before.placeholders) return false;

  const ph = frame.locator('.se-content .se-component.se-image')
    .filter({ has: frame.locator(PLACEHOLDER_IMG) }).first();
  if (await ph.count() === 0) return false;

  await ph.scrollIntoViewIfNeeded({ timeout: 8000 }).catch(() => {});
  const box = await ph.boundingBox();
  if (!box) return false;

  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  await page.waitForTimeout(600);
  await page.keyboard.press('Delete');
  await page.waitForTimeout(900);

  // @AI:CONSTRAINT 「지웠다」고 믿지 않는다 — «자리 수»로 확인한다.
  //   naverImages 로 재지 말 것: 화면 표시는 글을 붙일 때마다 흔들려서, 엉뚱한 것을 지워도
  //   안 줄어 보이거나 멀쩡한데도 줄어 보인다(2026-08-16 실측). 자리 수는 지운 만큼만 줄어든다.
  const after = await readBody(frame);
  const removed = before.slots - after.slots;
  if (removed > 1 || removed < 0) {
    const e = new Error(`한 자리만 지우려 했는데 이미지 자리가 ${removed}개 줄었습니다 (${before.slots} → ${after.slots}). 화면을 확인해 주세요.`);
    e.code = 'DELETED_WRONG_IMAGE';
    throw e;
  }
  return removed === 1;
}

/**
 * 글쓰기 창을 열면 뜨는 팝업 처리.
 *
 * @AI:CONSTRAINT 「작성 중인 글이 있습니다 … 이어서 작성하시겠습니까?」에서
 *   «확인»을 누르면 이전 작업물을 불러온다 → 그 위에 우리가 덧쓰면 남의 원고가 섞인다.
 *   반드시 «취소»(새로 쓰기)다.
 * @AI:FRAGILE 모르는 팝업은 «임의로 누르지 않는다». 무슨 버튼인지 모르고 누르는 것이
 *   이 스킬에서 가장 위험한 동작이다 — 사람에게 넘긴다.
 */
async function handleStartupPopup(page, frame, timeoutMs = 5000) {
  const deadline = Date.now() + timeoutMs;
  const results = [];
  while (Date.now() < deadline) {
    const info = await frame.evaluate(() => {
      const pop = document.querySelector('.se-popup-alert, [data-group="popupLayer"]');
      if (!pop || !pop.offsetParent) return null;
      return { text: (pop.innerText || '').replace(/\s+/g, ' ').trim().slice(0, 200) };
    });
    if (!info) break;

    if (/작성\s*중인?\s*글이?\s*있습니다|이어서\s*작성/.test(info.text)) {
      await frame.locator('.se-popup-button-cancel').first().click({ timeout: 5000 });
      results.push('작성중인글:취소(새로쓰기)');
      await page.waitForTimeout(900);
      continue;
    }
    // 모르는 팝업 — 멈춘다
    const e = new Error(`처음 보는 팝업이 떠 있습니다. 직접 처리해 주세요:\n  "${info.text}"`);
    e.code = 'UNKNOWN_POPUP';
    throw e;
  }
  return results;
}

/**
 * 팝업이 «늦게» 떠서 클릭을 가로챌 때 한 번 치우고 다시 해 본다.
 *
 * @AI:INTENT 시작 팝업은 창을 연 직후가 아니라 «몇 초 뒤»에 뜨기도 한다(2026-08-16 실측:
 *   3편 첫 실행이 제목 클릭에서 멈췄고, 화면에는 「작성 중인 글이 있습니다」가 떠 있었다).
 *   그때 dim 이 화면을 덮어 Playwright 가 「다른 요소가 가로챈다」로 거부한다.
 * @AI:CONSTRAINT 팝업이 «실제로 있었을 때»만 재시도한다. 없었으면 원래 오류를 그대로 올린다 —
 *   아무 실패나 두 번씩 시도하면 진짜 고장을 늦게 알게 된다.
 */
async function withPopupGuard(page, frame, fn) {
  try {
    return await fn();
  } catch (e) {
    if (!/intercept|Timeout|not stable/i.test(e.message || '')) throw e;
    const handled = await handleStartupPopup(page, frame, 6000);
    if (!handled.length) throw e;
    await page.waitForTimeout(600);
    return fn();
  }
}

// ─────────────────────────────────────────────────────────────
// 서식 토글 초기화 — 🔴 2026-08-16 실사고
//
// 사장님이 화면에서 «글자에 취소선이 박힌 것»을 발견하셨다. 실측해 보니
// **창을 연 직후부터** 취소선 버튼이 `se-is-selected` 였다 — 우리가 누른 것이 아니라
// **네이버가 계정에 마지막 서식 상태를 기억**하고 있었던 것이다.
// 그 상태로 붙여넣으면 **글 전체가 그 서식을 먹는다**(실측: STRIKE 175개).
//
// @AI:CONSTRAINT 「우리가 안 눌렀으니 우리 탓이 아니다」로 넘기지 말 것 —
//   결과물이 고객 블로그에 취소선 그은 글로 나간다. 켜져 있으면 «끄고» 시작한다.
// @AI:CONSTRAINT 굵게(b)는 «끄지 않는다» — 본문에 정상적으로 쓰이고, 우리가 HTML 로
//   직접 넣는다. 토글이 켜져 있어도 붙여넣는 HTML 이 이기는지는 확인되지 않았으므로
//   «글 전체를 덮는» 축(취소선·밑줄·기울임)만 끈다.
// ─────────────────────────────────────────────────────────────
const FORMAT_TOGGLES = [
  ['취소선', '.se-strikethrough-toolbar-button'],
  ['밑줄',   '.se-underline-toolbar-button'],
  ['기울임', '.se-italic-toolbar-button'],
];
const TOGGLE_ON = 'se-is-selected';

// 이미지가 먹는 빈 문단 한 칸을 미리 채워 둔다 (위 ④ 루프 참조 — 실측 보정이다)
const IMAGE_EATS_LINES = 1;

// @AI:INTENT 조각을 붙이기 «직전»에 끄는 것들 — FORMAT_TOGGLES 와 «굵게 하나»가 다르다.
//   왜 다른지는 clearCaretFormatting 의 주석에 있다. 두 목록을 합치지 말 것.
const CARET_TOGGLES = [
  ['굵게',   '.se-bold-toolbar-button'],
  ...FORMAT_TOGGLES,
];

/**
 * 켜져 있는 서식 토글을 끈다.
 * @returns {{turnedOff:string[], stillOn:string[]}}
 */
async function clearFormatting(page, frame) {
  const turnedOff = [], stillOn = [];
  for (const [name, sel] of FORMAT_TOGGLES) {
    const on = await frame.evaluate((s) => {
      const b = document.querySelector(s.sel);
      return b ? b.classList.contains(s.on) : null;
    }, { sel, on: TOGGLE_ON });
    if (on !== true) continue;                       // 없거나(null) 꺼져 있으면 둘 것
    await frame.evaluate((s) => { document.querySelector(s.sel)?.click(); }, { sel });
    await page.waitForTimeout(300);
    const after = await frame.evaluate((s) => {
      const b = document.querySelector(s.sel);
      return b ? b.classList.contains(s.on) : null;
    }, { sel, on: TOGGLE_ON });
    // @AI:CONSTRAINT 「껐다」고 믿지 않는다 — 화면에서 다시 읽는다. 토글이라 한 번 더 누르면 되켜진다.
    (after === false ? turnedOff : stillOn).push(name);
  }
  return { turnedOff, stillOn };
}

// ─────────────────────────────────────────────────────────────
// 글꼴 — 「마루부리」 (2026-08-20)
// ─────────────────────────────────────────────────────────────
// @AI:INTENT 에디터 기본값은 «나눔고딕»이다. 그냥 두면 담당자가 손으로 친 글과 서체가 갈린다.
// @AI:CONSTRAINT 어떤 글꼴인지는 «포맷 정본»(naver-format)이 안다 — 여기서 이름을 박지 말 것.
//   카드를 만드는 쪽과 올리는 쪽이 같은 값을 봐야 한다.
// @AI:CONSTRAINT 🔴 «붙여넣기 전»에 골라야 한다. 뒤에 고르면 이미 들어간 글자는 안 바뀐다
//   (선택 영역이 없으면 토글은 «다음에 칠 글자»에만 걸린다).
const FONT_BTN = '.se-font-family-toolbar-button';
const FONT_OPT = (code) => `[data-name="font-family"][data-value="${code}"]`;

/**
 * 글꼴을 고른다.
 * @AI:CONSTRAINT 「눌렀다」로 끝내지 않는다 — 고른 «뒤» aria-current 를 다시 읽어 확인한다.
 *   드롭다운은 토글이라 이미 열려 있을 때 또 누르면 «닫힌다»(카테고리에서 겪은 것과 같은 함정).
 */
async function setFont(page, frame, code, { force = false } = {}) {
  // @AI:CONSTRAINT 🔴 force 를 «선택 영역이 있을 때» 반드시 켠다.
  //   aria-current 는 «다음에 칠 글자»의 상태다. 선택한 글자에 입히려면 이미 그 글꼴로
  //   보이더라도 «실제로 눌러야» 한다. 2026-08-20 실측: 이 조기 반환 때문에 전체 선택 패스가
  //   통째로 건너뛰어져 46곳과 제목이 나눔고딕으로 남았다 — 그런데 결과는 ok 였다.
  const already = await frame.evaluate((sel) => {
    const o = document.querySelector(sel);
    return o ? o.getAttribute('aria-current') === 'true' : null;
  }, FONT_OPT(code));
  if (already === true && !force) return { ok: true, code, already: true };

  const opened = await frame.evaluate((sel) => {
    const o = document.querySelector(sel);
    return !!(o && o.offsetParent !== null);
  }, FONT_OPT(code));
  if (!opened) {
    const btn = frame.locator(`${FONT_BTN}:visible`).first();
    if (!(await btn.count())) return { ok: false, code, reason: 'NO_BUTTON' };
    await btn.click({ timeout: 8000 });
    await page.waitForTimeout(500);
  }

  const opt = frame.locator(`${FONT_OPT(code)}:visible`).first();
  if (!(await opt.count())) return { ok: false, code, reason: 'NOT_FOUND' };
  await opt.click({ timeout: 8000 });
  await page.waitForTimeout(500);

  const after = await frame.evaluate((sel) => {
    const o = document.querySelector(sel);
    return o ? o.getAttribute('aria-current') === 'true' : null;
  }, FONT_OPT(code));
  return after === true ? { ok: true, code, already: false } : { ok: false, code, reason: 'NOT_APPLIED' };
}

/**
 * 채우기가 «끝난 뒤» 글 전체를 골라 글꼴을 입힌다.
 *
 * @AI:INTENT 미리 고르는 것(①-c)만으로는 부족하다 — 실측(2026-08-20): 264곳 중 218곳만
 *   마루부리가 되고 46곳과 «제목칸»이 나눔고딕으로 남았다. 글꼴은 커서 자리의 성질이라
 *   이미지 업로드를 지나며 기본값으로 되돌아가는 자리가 생긴다.
 * @AI:CONSTRAINT 그래서 «전체 선택»으로 한 번 더 입힌다. 선택 영역이 있으면 글꼴은
 *   그 영역에 통째로 걸리므로 표·인용구 안까지 닿는다.
 * @AI:CONSTRAINT 🔴 제목칸은 «본문과 다른 편집 영역»이다 — 본문에서 전체 선택해도 안 닿는다.
 *   따로 눌러서 따로 걸어야 한다(실측: 제목만 나눔고딕으로 남았다).
 * @AI:CONSTRAINT 미리 고르는 것을 «없애지 말 것» — 없애면 붙는 동안 내내 다른 서체로 보이고,
 *   중간에 실패하면 통째로 남의 서체인 글이 남는다.
 */
async function applyFontToAll(page, frame, code, { tries = 3 } = {}) {
  const want = `se-ff-${code}`;
  const out = { body: null, title: null, rounds: 0 };
  const mixed = async () => {
    const f = await readFonts(frame);
    return Object.keys(f).filter((k) => k !== want);
  };

  // ① 본문 — 전체 선택해서 입힌다 (🔴 표 셀은 이 길로만 닿는다)
  for (let i = 0; i < tries; i += 1) {
    if (!(await mixed()).length) { out.body = { ok: true }; break; }
    out.rounds += 1;
    await withPopupGuard(page, frame, () => cursorToEnd(page, frame));
    await page.keyboard.press('Control+A');
    await page.waitForTimeout(400);
    out.body = await setFont(page, frame, code, { force: true });
    await page.waitForTimeout(700);
  }

  // ② 인용구는 «건드릴 수 없다» — 네이버가 막아 둔 자리다 (2026-08-20 실측)
  // @AI:INTENT 인용구 안에 커서를 두면 «글꼴 버튼이 화면에서 사라진다»(라벨 null · 클릭 불가).
  //   즉 서체를 못 바꾸는 게 아니라 «바꾸지 못하게 되어 있다». 인용구는 제 서체(나눔명조)가 고정이다.
  // @AI:CONSTRAINT 🔴 여기에 「인용구도 마루부리로」 코드를 다시 넣지 말 것 —
  //   클릭·전체선택·강제누르기 다 해 봤고 20개 전부 실패했다. 되는 길이 없다.
  //   대신 readFonts 가 인용구를 «세지 않는다» — 세면 영원히 「섞였다」가 나온다.

  // ③ 제목칸 — 🔴 «본문과 다른 편집 영역»이라 전체 선택이 안 닿는다. 따로 눌러 따로 건다.
  const t = frame.locator('.se-documentTitle .se-text-paragraph, .se-title-text .se-text-paragraph').first();
  if (await t.count()) {
    for (let i = 0; i < tries; i += 1) {
      const now = await frame.evaluate(() => {
        const el = document.querySelector('.se-documentTitle [class*="se-ff-"]');
        return el ? [...el.classList].find((c) => c.startsWith('se-ff-')) : null;
      });
      if (now === null || now === want) { out.title = { ok: true }; break; }
      await withPopupGuard(page, frame, () => t.click({ timeout: 10000 }));
      await page.waitForTimeout(400);
      await page.keyboard.press('Control+A');
      await page.waitForTimeout(400);
      out.title = await setFont(page, frame, code, { force: true });
      await page.waitForTimeout(700);
    }
  }

  // 선택을 풀고 커서를 본문 끝으로 (다음 단계가 선택 영역을 물고 가지 않게)
  await withPopupGuard(page, frame, () => cursorToEnd(page, frame));
  return out;
}

/**
 * 글에 «다른 글꼴»이 섞였나 — 화면 클래스로 센다.
 *
 * @AI:CONSTRAINT 🔴 범위는 «글이 있는 두 곳»뿐이다 — 본문(.se-content)과 제목칸.
 *   body 전체를 보면 «글꼴 드롭다운»이 잡힌다. 그 메뉴의 항목들은 각자 제 서체로 그려져 있어서
 *   (나눔스퀘어·바른히피·우리딸손글씨…) 글이 완벽해도 «섞였다»가 나온다(2026-08-20 실측).
 * @AI:CONSTRAINT 🔴 «보이고 글자가 있는 것»만 센다. 지워지지 않는 자리표시자가 있다 —
 *   이미지의 「사진 설명을 입력하세요」, 인용구의 「출처 입력」. 우리가 쓴 글이 아닌데
 *   그냥 세면 영원히 「섞였다」가 나온다(실측 35곳).
 * @AI:CONSTRAINT 🔴 인용구(se-quotation)는 «빼고» 센다 — 네이버가 그 안에서 글꼴 버튼을
 *   아예 감춘다(2026-08-20 실측: 커서를 넣으면 버튼이 사라져 클릭조차 못 한다).
 *   바꿀 수 없는 것을 세면 «고칠 수 없는 문제»가 매번 뜬다.
 */
async function readFonts(frame) {
  return frame.evaluate((roots) => {
    const out = {};
    roots.forEach((sel) => {
      document.querySelectorAll(`${sel} [class*="se-ff-"]`).forEach((el) => {
        if (el.offsetParent === null) return;               // 숨은 것 = 자리표시자
        if (!(el.innerText || '').trim()) return;           // 빈 것 = 자리표시자
        if (el.closest('.se-quotation')) return;            // 인용구 = 서체를 못 바꾸는 자리
        [...el.classList].filter((x) => x.startsWith('se-ff-'))
          .forEach((x) => { out[x] = (out[x] || 0) + 1; });
      });
    });
    return out;
  }, ['.se-content', '.se-documentTitle']);
}

// ─────────────────────────────────────────────────────────────
// 이미지 가로폭 — 「옆트임」 (2026-08-20)
// ─────────────────────────────────────────────────────────────
// @AI:INTENT 이 블로그는 본문 그림을 «옆트임»으로 넣는다(2026-08-20 실무 확인).
//   올린 직후 기본값은 «문서 너비»라, 그냥 두면 그림이 좁게 나간다.
//
// 🔴 실측 (2026-08-20 · RPG 9편 · 1080px 원본 7장)
//
//   | 설정      | 화면 폭 | 토글 se-is-selected |
//   |-----------|--------:|---------------------|
//   | 작게      |   375px | normal              |
//   | 문서 너비 |   500px | fit    ← 올린 직후 기본값
//   | 옆트임    |   700px | extend                |
//
// @AI:FRAGILE 🔴 «컴포넌트 클래스로 판정하지 말 것.» 세 설정 모두 `se-l-default` 로 «똑같다».
//   클래스가 안 바뀌는 것을 보고 「안 먹었다」고 오판하기 딱 좋다(2026-08-20에 그렇게 헤맸다).
//   판정축은 둘 — ① 그 이미지를 «선택한 상태»에서 읽는 토글, ② 화면에서 잰 «폭».
// @AI:FRAGILE 🔴 토글은 이미지를 «선택하지 않았을 때»도 값이 보인다 — 그건 «다음에 넣을 그림»의
//   기본값이지 이 그림의 상태가 아니다. 반드시 선택한 «뒤»에 읽는다. 안 그러면 조용한 오답이다.
const ARRANGE = {
  작게: '.se-context-toolbar-group-toggle-button.se-object-arrangement-normal-toolbar-button',
  문서너비: '.se-context-toolbar-group-toggle-button.se-object-arrangement-fit-toolbar-button',
  옆트임: '.se-context-toolbar-group-toggle-button.se-object-arrangement-extend-toolbar-button',
};

/** i 번째 이미지를 선택하고, 그 «선택 상태»에서 폭·토글을 읽는다. */
async function selectImage(page, frame, index) {
  const img = frame.locator(`${IMG_COMPONENT} img`).nth(index);
  await img.scrollIntoViewIfNeeded();
  await img.click({ timeout: 10000 });
  await page.waitForTimeout(500);
  return frame.evaluate((a) => {
    const c = document.querySelectorAll(a.comp)[a.i];
    const el = c && c.querySelector('img');
    const read = (sel) => {
      const b = [...document.querySelectorAll(sel)].find((x) => x.offsetParent !== null);
      return b ? b.classList.contains('se-is-selected') : null;
    };
    return {
      width: el ? Math.round(el.getBoundingClientRect().width) : null,
      옆트임: read(a.sel.옆트임), 문서너비: read(a.sel.문서너비), 작게: read(a.sel.작게),
    };
  }, { comp: IMG_COMPONENT, i: index, sel: ARRANGE });
}

/**
 * i 번째 이미지를 «옆트임»으로 만든다.
 * @AI:CONSTRAINT 이미 옆트임이면 «누르지 않는다» — 눌러서 나빠질 일만 있고 좋아질 일은 없다.
 * @AI:CONSTRAINT 「눌렀다」로 끝내지 않는다. 누른 «뒤» 토글과 폭을 다시 읽어 둘 다 맞을 때만 ok.
 *   폭까지 보는 이유는, 토글만 보면 «선택이 풀린 채» 읽은 기본값을 성공으로 오독할 수 있어서다.
 */
async function setImageExtend(page, frame, index) {
  const before = await selectImage(page, frame, index);
  if (before.옆트임 === true) return { ok: true, index, already: true, width: before.width };
  if (before.옆트임 === null) return { ok: false, index, reason: 'NO_BUTTON' };

  await frame.locator(`${ARRANGE.옆트임}:visible`).first().click({ timeout: 8000 });
  await page.waitForTimeout(700);

  const after = await selectImage(page, frame, index);
  if (after.옆트임 !== true) return { ok: false, index, reason: 'NOT_APPLIED', width: after.width };
  if (before.width !== null && after.width !== null && after.width < before.width) {
    return { ok: false, index, reason: 'WIDTH_SHRANK', from: before.width, to: after.width };
  }
  return { ok: true, index, already: false, width: after.width };
}

/**
 * 본문 그림 «전부»를 옆트임으로.
 * @AI:CONSTRAINT 한 장이 실패해도 나머지를 계속한다 — 하나 때문에 멈추면 사람이 여섯 장을 손으로 만진다.
 *   대신 실패한 번호를 그대로 돌려주어 «무엇이 남았는지» 사람이 알 수 있게 한다.
 */
async function extendAllImages(page, frame) {
  const n = await frame.locator(IMG_COMPONENT).count();
  const done = [], failed = [];
  for (let i = 0; i < n; i += 1) {
    let r;
    try { r = await setImageExtend(page, frame, i); }
    catch (e) { r = { ok: false, index: i, reason: e.message.slice(0, 60) }; }
    (r.ok ? done : failed).push(r);
  }
  return { total: n, done, failed };
}

/** 커서를 본문 «맨 끝»에 둔다 — 문단 중간에 박히는 사고 방지(2026-08-15 실측) */
async function cursorToEnd(page, frame) {
  const paras = frame.locator(PARA);
  const n = await paras.count();
  if (n === 0) {
    await frame.locator('[contenteditable="true"]').first().click({ timeout: 8000 });
  } else {
    await paras.nth(n - 1).click({ timeout: 10000 });
  }
  await page.keyboard.press('End');
  await page.waitForTimeout(200);
}

/**
 * 🔴 커서 «자리»의 서식을 끈다 — 조각을 붙이기 직전마다 (2026-08-20 실사고)
 *
 * @AI:INTENT ①-b 의 clearFormatting 은 «맨 처음 한 번»이라 이걸 못 막는다.
 *   앞 조각이 굵게로 «끝나면» 커서가 <b> 안에 남고(빈 문단에 <b></b> 가 남는 것이 그 흔적),
 *   이미지 업로드를 지나 다음 조각을 붙일 때 그 안으로 딸려 들어간다. 한 번 켜지면 «끝까지» 간다.
 *   실측(2026-08-20, RPG 9편): 「성수기 항공 건은…」 문단이 굵게로 끝난 뒤
 *   나머지 글 전체가 굵게가 됐고, 도구는 그대로 ready_to_register 를 냈다.
 *
 * @AI:CONSTRAINT 🔴 여기서는 굵게«도» 끈다 — ①-b 가 굵게를 일부러 뺀 것과 다르다.
 *   ①-b 는 «글 전체»의 서식 상태를 다루므로 굵게를 끄면 안 될 이유가 있었지만(우리가 <b> 로 직접 넣는다),
 *   조각을 붙이기 «직전»의 커서 자리는 «아무 서식도 안 켜진» 상태여야 한다.
 *   붙일 HTML 이 자기 <b> 를 들고 오므로, 켜 둘 이유가 없고 켜져 있으면 반드시 번진다.
 * @AI:CONSTRAINT 커서가 «접혀 있을 때»만 누른다. 선택 영역이 있으면 토글이 그 «선택»에 걸려
 *   멀쩡한 글을 굵게로 만든다. cursorToEnd 뒤(End 키)라 접혀 있는 것이 정상이지만, 확인하고 누른다.
 */
async function clearCaretFormatting(page, frame) {
  const turnedOff = [];
  for (const [name, sel] of CARET_TOGGLES) {
    const state = await frame.evaluate((s2) => {
      const b = document.querySelector(s2.sel);
      if (!b) return { on: null };
      const sel0 = document.getSelection();
      return { on: b.classList.contains(s2.on), collapsed: !sel0 || sel0.isCollapsed };
    }, { sel, on: TOGGLE_ON });
    if (state.on !== true) continue;
    if (state.collapsed === false) continue;          // 선택이 걸려 있으면 손대지 않는다
    await frame.evaluate((s2) => { document.querySelector(s2.sel)?.click(); }, { sel });
    await page.waitForTimeout(150);
    const after = await frame.evaluate((s2) => {
      const b = document.querySelector(s2.sel);
      return b ? b.classList.contains(s2.on) : null;
    }, { sel, on: TOGGLE_ON });
    if (after === false) turnedOff.push(name);
  }
  return turnedOff;
}

/** 클립보드를 쓰지 않는 붙여넣기 */
async function pasteHtml(page, frame, html) {
  await withPopupGuard(page, frame, () => cursorToEnd(page, frame));
  // 🔴 붙이기 «직전»에 커서 자리의 서식을 끈다 — 안 끄면 앞 조각의 굵게가 이 조각을 통째로 먹는다
  await clearCaretFormatting(page, frame);
  const res = await frame.evaluate((h) => {
    const el = document.activeElement?.isContentEditable
      ? document.activeElement : document.querySelector('[contenteditable="true"]');
    if (!el) return 'no-editable';
    const dt = new DataTransfer();
    dt.setData('text/html', h);
    dt.setData('text/plain', h.replace(/<[^>]+>/g, ''));
    el.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }));
    return 'ok';
  }, html);
  if (res !== 'ok') throw new Error(`붙여넣기 실패: ${res}`);
  await page.waitForTimeout(500);
}

/** 「사진」 버튼 → 파일선택창 가로채기 → 서버 반영까지 1회 시도 */
async function uploadOnce(page, frame, filePath, timeoutMs) {
  const before = await readBody(frame);
  const btn = frame.locator('button.se-image-toolbar-button, [data-name="image"], button:has-text("사진")').first();
  const [chooser] = await Promise.all([
    page.waitForEvent('filechooser', { timeout: 15000 }),
    btn.click({ timeout: 10000 }),
  ]);
  await chooser.setFiles(filePath);

  // @AI:CONSTRAINT 「이미지 자리가 늘었나」로 잰다 — naverImages 로 재지 말 것.
  //   글을 붙이면 이미 올라간 이미지가 화면에서 플레이스홀더로 바뀌어 naverImages 가 «줄어든다».
  //   그러면 새 이미지가 들어와도 늘어난 것이 안 보여 «실패»로 오판하고,
  //   그 오판이 재시도와 멀쩡한 이미지 삭제를 부른다(2026-08-16 실측: 10장 → 9장 유실).
  //   자리 수는 표시 상태와 무관하게 늘기만 하므로 흔들리지 않는다.
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    await page.waitForTimeout(1000);
    const now = await readBody(frame);
    if (now.slots > before.slots) return { ok: true, slots: now.slots };
  }
  const end = await readBody(frame);
  return {
    ok: false,
    reason: '업로드 후 이미지 자리가 늘지 않았습니다',
    before: before.slots,
    after: end.slots,
  };
}

/**
 * 이미지 1장 업로드 — «자리는 건드리지 않는다».
 *
 * @AI:CONSTRAINT 실패해 보여도 여기서 자리를 지우거나 다시 올리지 말 것.
 *   2026-08-16 관측: 업로드는 늘 1.1초에 성공하고, «실패»는 대부분 오판이다 —
 *   다음 텍스트를 붙일 때 이전 이미지가 SVG 자리로 깨지면서 네이버 이미지 수가 «줄어»
 *   「개수가 늘었나」 판정이 어긋나기 때문이다. 그 상태에서 자리를 지우면
 *   «멀쩡한 자리에서 깨진 그림»을 위치까지 함께 날린다(1회차에 실제로 그렇게 잃었다).
 *   복구는 텍스트가 전부 들어간 뒤 repairBrokenImages() 가 «자리를 지키며» 한다.
 */
async function uploadImage(page, frame, filePath, timeoutMs = 45000) {
  return uploadOnce(page, frame, filePath, timeoutMs);
}

// ─────────────────────────────────────────────────────────────
// 대표 이미지 (썸네일) — 2026-08-16 실측
//
// 네이버 검색결과·블로그 목록에 뜨는 «얼굴»이다. 발행 패널에는 이 항목이 **없고**
// (실측: 카테고리·주제·공개설정·태그·발행시간·공지사항이 전부),
// 본문 이미지마다 붙은 `.se-set-rep-image-button` 이 그 일을 한다.
//
// 실측 4단계 —
//   ① 그림 2장 업로드 직후: **첫 장이 자동으로 대표**(se-is-selected), 2번은 아님
//   ② 2번 이미지를 클릭만 해서는 안 바뀐다
//   ③ 2번의 .se-set-rep-image-button 클릭
//   ④ 대표가 1번 → 2번으로 «옮겨간다»(배타적)
// ─────────────────────────────────────────────────────────────

const REP_BTN = '.se-set-rep-image-button';
const REP_ON = 'se-is-selected';
const IMG_COMPONENT = '.se-content .se-component.se-image';

/**
 * 지금 몇 번째 그림이 대표인가.
 * @AI:INTENT 「지정했다」를 믿지 않고 화면에서 다시 읽으려고 분리했다.
 * @returns {{index:number|null, total:number}} index 는 0부터. 대표가 없으면 null
 */
async function readRepImage(frame) {
  return frame.evaluate((s) => {
    const list = [...document.querySelectorAll(s.comp)];
    let index = null;
    list.forEach((c, i) => {
      const b = c.querySelector(s.btn);
      if (b && b.classList.contains(s.on)) index = i;
    });
    return { index, total: list.length };
  }, { comp: IMG_COMPONENT, btn: REP_BTN, on: REP_ON });
}

/**
 * n번째 그림을 대표로 지정한다(0부터).
 *
 * @AI:CONSTRAINT 🔴 이미 그 그림이 대표면 **누르지 않는다.** 이 버튼은 토글이라
 *   한 번 더 누르면 대표가 «풀릴» 수 있고, 그러면 네이버가 다시 첫 장을 쓴다.
 * @AI:CONSTRAINT 지정 후 화면에서 다시 읽어 확인한다. 안 바뀌었으면 거짓을 돌려주고 멈춘다 —
 *   대표 이미지는 검색결과에 그대로 노출되므로 «아마 됐을 것»으로 넘기지 않는다.
 */
async function setRepImage(page, frame, index = 0) {
  const before = await readRepImage(frame);
  if (!before.total) return { ok: false, code: 'NO_IMAGE', reason: '본문에 그림이 없습니다' };
  if (index < 0 || index >= before.total) {
    return { ok: false, code: 'OUT_OF_RANGE', reason: `${index + 1}번째 그림이 없습니다 (총 ${before.total}장)`, total: before.total };
  }
  if (before.index === index) return { ok: true, index, total: before.total, already: true };

  const clicked = await frame.evaluate((s) => {
    const c = [...document.querySelectorAll(s.comp)][s.i];
    const b = c && c.querySelector(s.btn);
    if (!b) return false;
    b.click();
    return true;
  }, { comp: IMG_COMPONENT, btn: REP_BTN, i: index });
  if (!clicked) return { ok: false, code: 'NO_BUTTON', reason: `${index + 1}번째 그림에 대표 버튼이 없습니다` };

  await page.waitForTimeout(1200);
  const after = await readRepImage(frame);
  if (after.index !== index) {
    return { ok: false, code: 'NOT_APPLIED', reason: `대표가 반영되지 않았습니다 (지금 ${after.index === null ? '없음' : after.index + 1}번째)`, actual: after };
  }
  return { ok: true, index, total: after.total, moved_from: before.index };
}

/**
 * 이미지 내려받기가 실패했을 때 «왜인지»를 사람 말로.
 *
 * @AI:INTENT 🔴 2026-08-16 실측 — 카드 그림의 «호스팅이 두 계열»이고 수명이 다르다:
 *     본문 AI 그림   supabase `media-assets/…`      → 영구 public
 *     썸네일·실사진   노션 `prod-files-secure…`      → AWS 서명 URL, `X-Amz-Expires=300` (**5분**)
 *   그래서 카드를 받아 두고 몇 분 뒤에 파싱하면 «썸네일만» 죽는다. 그런데 증상은
 *   「이미지 1장 다운로드 실패」로만 떠서 원인이 안 보이고, 사람은 네트워크를 의심한다.
 *   회수 경로는 하나뿐이다 — «노션에서 카드를 다시 받는 것»(URL 을 손으로 이어붙일 수 없다).
 * @AI:INTENT 순수 함수로 뽑은 이유 = 망 없이 시험할 수 있게. 만료는 실전에서만 나는데,
 *   실전에서 나면 이미 사람이 창 앞에 앉아 있다.
 */
function describeImageFailure(url, status) {
  const u = String(url || '');
  const signed = /[?&]X-Amz-(Expires|Signature)=/i.test(u) || u.includes('prod-files-secure');
  if (signed && (status === 403 || status === 400)) {
    return '노션 이미지 주소가 만료됐습니다(서명 URL 5분). 노션에서 카드를 «다시 받아» 주세요';
  }
  if (status === 404) return '이미지가 지워졌습니다 (원본 카드 확인 필요)';
  return `내려받기 실패 (HTTP ${status})`;
}

/** 이미지 URL → 로컬 파일 (순서 보존 이름) */
async function downloadImages(blocks, dir) {
  fs.mkdirSync(dir, { recursive: true });
  const out = [];
  let i = 0;
  for (const b of blocks) {
    if (b.kind !== 'image') continue;
    i += 1;
    const ext = (b.url.match(/\.(png|jpe?g|webp|gif)(\?|$)/i) || [null, 'png'])[1].toLowerCase();
    const file = path.join(dir, `${String(i).padStart(2, '0')}_.${ext}`);
    const res = await fetch(b.url);
    if (!res.ok) {
      out.push({ index: i, url: b.url, ok: false, status: res.status, reason: describeImageFailure(b.url, res.status) });
      continue;
    }
    fs.writeFileSync(file, Buffer.from(await res.arrayBuffer()));
    out.push({ index: i, url: b.url, ok: true, file, bytes: fs.statSync(file).size });
  }
  return out;
}

// ─────────────────────────────────────────────────────────────
/**
 * 카드 하나를 글쓰기 창에 채운다.
 * @returns {{status, checkpoint, filled, problems[]}}
 */
async function fillCard(page, parsed, imageDir, opts = {}) {
  const frame = getFrame(page);
  const problems = [];
  const notes = [];          // @AI:INTENT 정상 처리 기록. problems 에 넣으면 「부분 실패」로 오판된다
  let checkpoint = 'draft_started';

  // ⓪ 시작 팝업 («작성 중인 글» → 새로 쓰기). 모르는 팝업이면 여기서 멈춘다.
  const popups = await handleStartupPopup(page, frame);
  if (popups.length) notes.push(`팝업 처리: ${popups.join(', ')}`);

  // ① 덮어쓰기 방지 — 판정은 반드시 .se-content 로 (2026-08-15 오독 사고)
  const start = await readBody(frame);
  if (start.chars > (opts.allowExistingChars ?? 40) || start.images > 0) {
    return {
      status: 'blocked',
      checkpoint,
      reason: `이미 내용이 있습니다 (글자 ${start.chars} · 이미지 ${start.images}). ` +
              `빈 글쓰기 창에서 실행하세요.`,
    };
  }

  // ①-b 서식 토글 끄기 — 🔴 «창을 연 직후부터» 켜져 있을 수 있다 (2026-08-16 실사고)
  //   네이버가 계정에 마지막 서식 상태를 기억한다. 켜진 채 붙여넣으면 글 전체가 먹는다.
  //   반드시 «붙여넣기 전»이어야 한다 — 뒤에 끄면 이미 먹은 것은 안 풀린다.
  const fmt = await clearFormatting(page, frame);
  if (fmt.turnedOff.length) notes.push(`켜져 있던 서식을 껐습니다: ${fmt.turnedOff.join(', ')}`);
  if (fmt.stillOn.length) problems.push(`서식이 안 꺼집니다: ${fmt.stillOn.join(', ')} (이대로 채우면 글 전체가 그 서식을 먹습니다)`);

  // ①-c 글꼴 — 🔴 «붙여넣기 전»에 골라야 이미 들어간 글자가 안 남는다 (2026-08-20)
  const fontCode = opts.font || NF.FONT_FAMILY;
  if (fontCode) {
    // @AI:CONSTRAINT 여기서 실패해도 «막지 않는다» — ⑤-c 가 전체 선택으로 다시 입히고,
    //   최종 판정은 «화면 클래스 개수»가 한다. 여기서 막으면 되살릴 수 있는 글이 버려진다.
    const fr = await setFont(page, frame, fontCode);
    notes.push(fr.ok ? `글꼴 ${fontCode} (미리 고름)` : `글꼴 미리 고르기 실패 (${fr.reason}) — 채운 뒤 다시 겁니다`);
  }

  // ② 이미지 미리 받기 — 중간에 받으면 실패 시 반쪽 글이 남는다
  const files = await downloadImages(parsed.blocks, imageDir);
  const failed = files.filter((f) => !f.ok);
  // @AI:INTENT 번호만 적으면 사람이 원인을 못 찾는다 — «왜»를 함께 적는다(만료 vs 삭제 vs 망).
  if (failed.length) {
    problems.push(`이미지 ${failed.length}장 다운로드 실패 — ` +
      failed.map((f) => `${f.index}번: ${f.reason || `HTTP ${f.status}`}`).join(' / '));
  }
  // 🔴 썸네일은 «맨 끝 한 장»이라 실패해도 본문은 멀쩡하다 — 그래서 조용히 얼굴만 빠진다. 따로 말한다.
  if (parsed.thumbnailIndex !== null && parsed.thumbnailIndex !== undefined
      && failed.some((f) => f.index === parsed.thumbnailIndex + 1)) {
    problems.push('썸네일을 받지 못해 «대표 이미지를 지정할 수 없습니다» (검색결과에 본문 첫 그림이 나갑니다)');
  }
  if (files.length && failed.length === files.length) {
    return { status: 'failed', checkpoint, reason: '이미지를 하나도 받지 못했습니다', problems };
  }

  // ③ 제목
  if (parsed.title) {
    const t = frame.locator('.se-documentTitle .se-text-paragraph, .se-title-text .se-text-paragraph').first();
    await withPopupGuard(page, frame, () => t.click({ timeout: 10000 }));
    await page.keyboard.type(parsed.title, { delay: 12 });
    await page.waitForTimeout(300);
  }

  // ④ 조각 순서대로
  let imgSeq = 0, uploaded = 0;
  const unsureUploads = [];   // 중간 판정이 「안 늘었다」고 본 것 — 대개 오판이라 ⑤에서 화면으로 가른다
  for (const b of parsed.blocks) {
    if (b.kind === 'html') {
      await pasteHtml(page, frame, b.html);
      checkpoint = 'text_ok';
    } else {
      imgSeq += 1;
      const f = files.find((x) => x.index === imgSeq);
      if (!f || !f.ok) { problems.push(`이미지 ${imgSeq} 건너뜀 (파일 없음)`); continue; }
      // 🔴 이미지 삽입이 «맨 끝 빈 문단 하나를 먹는다» (2026-08-20 실측)
      // @AI:INTENT 조각 끝에 여백 2칸을 보냈는데 화면에는 1칸만 남았다 — 이미지가 커서 자리의
      //   빈 문단을 «자기 자리로 쓰기» 때문이다. 이미지 «뒤»(2칸)는 멀쩡하고 «앞»만 줄었다.
      //   실측: 그림 6곳 전부 2 → 1. 예외 없다.
      // @AI:CONSTRAINT 🔴 이 보정을 normalizeGaps 로 올리지 말 것. 저 함수는 «포맷 정본»이고
      //   카드를 만드는 쪽도 본다 — 에디터가 한 칸 먹는 것은 «올리는 쪽»의 사정이다.
      //   정본에 3칸을 적어 두면 카드 원고가 규칙과 어긋나게 된다.
      // @AI:FRAGILE 🔴 «빈 문단 붙여넣기»로는 안 된다 — 이미 빈 문단인 자리에 흡수돼 아무 일도 안 난다
      //   (2026-08-20 실측: 보정 전후 화면이 «완전히 동일»했다). 엔터 키만 실제로 문단을 늘린다.
      await withPopupGuard(page, frame, () => cursorToEnd(page, frame));
      for (let k = 0; k < IMAGE_EATS_LINES; k += 1) {
        await page.keyboard.press('Enter');
        await page.waitForTimeout(120);
      }
      const r = await uploadImage(page, frame, f.file);
      // @AI:INTENT 여기서 problems 로 올리지 않는다 — 이 판정은 «개수 증가»라서 자주 오판이다
      //   (붙여넣기가 이전 이미지를 깨뜨리면 개수가 줄어 늘어난 것이 안 보인다).
      //   ④-b 가 자리를 되살리므로, 최종 화면이 온전하면 문제가 아니다. ⑤ 가 화면으로 판정한다.
      if (!r.ok) { unsureUploads.push(imgSeq); continue; }
      uploaded += 1;
      checkpoint = `image_ok(${uploaded}/${parsed.images})`;
    }
    // 사람처럼 — 조각 사이에 쉼
    await page.waitForTimeout(opts.gapMs ?? 700);
  }

  // @AI:CONSTRAINT ④-b 「플레이스홀더 정리」를 여기에 되살리지 말 것.
  //   그것이 «멀쩡한 이미지»를 지워 그림이 사라지게 한 원인이었다(2026-08-16 실측).
  //   화면의 플레이스홀더는 «표시»일 뿐이고 문서에는 이미지가 온전히 들어 있다
  //   (임시저장분 서버 응답 RabbitTempPostRead: 이미지 URL 10 / SVG 0 — PROVENANCE 참조).
  //   고칠 것이 없으므로 아무것도 하지 않는다.

  // ⑤ 결과 검증 — 판정은 «화면»이 한다
  const end = await readBody(frame);
  // @AI:INTENT 「원고가 굵게로 지정한 글자」 수 — 우리가 보낸 <b> 안의 글자를 그대로 센다.
  //   화면 값과 견주는 것이 굵게 누출 판정의 축이다(verifyFilled 참조).
  const expectedBoldChars = countBoldChars(parsed.blocks);
  const verdict = verifyFilled({ start, end, expected: parsed.images, uploaded, expectedBoldChars });
  problems.push(...verdict);
  // 중간에 「안 늘었다」고 본 것들은, 화면이 온전하면 문제가 아니다 — 기록만 남긴다
  if (unsureUploads.length) {
    if (verdict.length) problems.push(`업로드 확인이 어긋난 이미지: ${unsureUploads.join(', ')}번`);
    else notes.push(`이미지 ${unsureUploads.join(', ')}번은 중간 확인이 어긋났으나 화면은 온전합니다`);
  }

  // ⑤-b 이미지 «옆트임» (2026-08-20)
  // @AI:CONSTRAINT 🔴 «검증(⑤) 뒤 · 대표 지정(⑥) 앞»에 둔다.
  //   앞에 두면 그림이 덜 들어간 상태에서 번호를 세게 되고, 뒤에 두면 이미지를 다시 클릭하면서
  //   방금 세운 대표가 흔들릴 수 있다. 대표 지정이 «마지막»이라는 성질을 깨지 말 것.
  // @AI:INTENT 실패해도 글을 막지 않는다 — 폭은 사람이 3초면 고치고, 막으면 다 채운 글이 버려진다.
  //   대신 «몇 번째가 남았는지»를 problems 로 올려 사람이 그 장만 만지게 한다.
  if (opts.extendImages !== false) {
    const ext = await extendAllImages(page, frame);
    if (ext.failed.length) {
      problems.push(`옆트임이 안 된 이미지 ${ext.failed.length}장 — ` +
        ext.failed.map((f) => `${f.index + 1}번(${f.reason})`).join(' / '));
    } else if (ext.total) {
      notes.push(`이미지 ${ext.total}장 옆트임 적용`);
    }
  }

  // ⑥ 대표 이미지 = 썸네일 (2026-08-16)
  // @AI:INTENT 네이버는 대표를 «본문에 있는 그림 중에서만» 고르고, 지정이 없으면 «첫 장»을 쓴다.
  //   그래서 지정을 안 하면 정성껏 만든 얼굴 대신 «본문 첫 도식»이 검색결과에 나갔다.
  //   파서가 썸네일을 맨 끝에 얹고(card-parser), 그 자리를 여기서 대표로 세운다.
  //
  // @AI:CONSTRAINT 🔴 «검증(⑤) 뒤»에 둔다. 앞에 두면 그림이 덜 들어간 상태에서 자리를 세게 되고,
  //   그때 thumbnailIndex 는 «다른 그림»을 가리킬 수 있다 — 얼굴이 엉뚱한 도식이 되어 검색결과에 나간다.
  //   지금은 셈이 맞을 때만 손대므로, 틀릴 바에는 «안 세운다»(네이버 기본 = 첫 장).
  // @AI:CONSTRAINT 🔴 setRepImage 를 직접 클릭으로 대체하지 말 것 — 버튼이 «토글»이라
  //   이미 대표인 것을 또 누르면 풀리고, 네이버가 다시 첫 장을 쓴다. 그 판정은 setRepImage 안에 있다.
  // @AI:CONSTRAINT 썸네일이 «없는» 카드(엔노블·검단가온)는 건드리지 않는다 — 네이버 기본이 맞다.
  let rep = null;
  const hasThumb = parsed.thumbnailIndex !== null && parsed.thumbnailIndex !== undefined;
  // 🔴 게이트는 «이미지가 다 들어갔나»만 본다 (2026-08-20 고침)
  // @AI:INTENT 원래는 verdict 가 «비었을 때»만 세웠는데, 그 뒤로 verdict 에 이미지와 무관한
  //   판정(굵게 번짐·글꼴 섞임)이 들어왔다. 그러자 글꼴 하나가 어긋났다고 «대표 이미지까지»
  //   안 세워져, 검색결과 얼굴이 본문 첫 도식으로 나갈 뻔했다(2026-08-20 실측).
  // @AI:CONSTRAINT 이 조건이 막으려던 것은 «그림이 덜 들어간 상태에서 번호를 세는 것» 하나다.
  //   새 판정을 verdict 에 더할 때 이 게이트가 같이 조여지지 않게, 축을 이미지로 좁혀 둔다.
  const imagesOk = ((end.slots || 0) - ((start && start.slots) || 0)) === parsed.images;
  if (hasThumb && imagesOk) {
    rep = await setRepImage(page, frame, parsed.thumbnailIndex);
    if (rep.ok) {
      notes.push(`대표 이미지 = 썸네일(${parsed.thumbnailIndex + 1}번째)${rep.already ? ' — 이미 지정돼 있었습니다' : ''}`);
    } else {
      // @AI:INTENT 문제로 올린다. 얼굴은 검색결과에 그대로 노출되므로 «아마 됐을 것»으로 넘기면
      //   틀린 얼굴로 발행되고, 발행 뒤에는 알아채기 어렵다.
      problems.push(`대표 이미지를 썸네일로 지정하지 못했습니다 (${rep.reason})`);
    }
    await page.waitForTimeout(400);
  } else if (hasThumb) {
    problems.push('그림이 덜 들어가 대표 이미지를 세우지 않았습니다 (틀린 얼굴로 나가는 것보다 안전합니다)');
  }

  // ⑦ 글꼴 — 🔴 «맨 마지막»에 입힌다 (2026-08-20 실측)
  // @AI:INTENT 채우는 «중»에 전체 선택을 걸면 안 먹는다. 이미지 업로드·옆트임으로 에디터가
  //   바쁜 동안에는 선택이 잡히지 않아, 표와 제목이 나눔고딕으로 남았다(33곳 + 제목).
  //   똑같은 코드를 «정리된 화면»에 돌리면 한 번에 들어간다 — 그래서 순서를 맨 끝으로 옮겼다.
  // @AI:CONSTRAINT 🔴 이 블록을 위로 되돌리지 말 것. 「검증 전에 해야 깔끔하다」는 생각이
  //   자연스럽지만, 그러면 «적용 자체가 안 된다». 판정도 여기서 같이 한다.
  // @AI:CONSTRAINT 미리 고르기(①-c)는 그대로 둔다 — 붙는 동안 화면이 남의 서체로 보이지 않게 한다.
  if (fontCode) {
    await page.waitForTimeout(1200);                   // 에디터가 가라앉기를 기다린다
    const fa = await applyFontToAll(page, frame, fontCode);
    const fonts = await readFonts(frame);
    const wrong = Object.entries(fonts).filter(([k]) => k !== `se-ff-${fontCode}`);
    if (wrong.length) {
      problems.push(`글꼴이 섞였습니다 — ${wrong.map(([k, n]) => `${k} ${n}곳`).join(' / ')} ` +
        `(원하는 것은 se-ff-${fontCode})`);
    } else {
      notes.push(`글꼴 ${fontCode}${fa.rounds ? ` (${fa.rounds}번째에 들어감)` : ''}`);
    }
  }

  const okAll = problems.length === 0;
  return {
    status: okAll ? 'ready_to_register' : 'partial',
    checkpoint: okAll ? 'ready_to_register' : checkpoint,
    filled: { chars: end.chars,
              // 판정에 쓰는 값 — 들어간 이미지 «자리» 수
              images_expected: parsed.images,
              images_placed: end.slots - start.slots,
              images_uploaded: uploaded,
              externalImages: end.externalImages,
              // 참고값 — 화면 표시 상태일 뿐이다(문서에는 이미지가 온전히 들어 있다)
              화면표시: `URL ${end.naverImages}장 · 그림자리 ${end.placeholders}장`,
              대표이미지: rep ? (rep.ok ? `썸네일(${rep.index + 1}번째)` : `실패 — ${rep.code}`) : '지정 안 함 (썸네일 없는 카드)' },
    problems,
    notes,
    // @AI:CONSTRAINT 여기서 끝. 등록은 사람이 누른다.
    next: '화면을 확인하시고 «등록» 버튼을 눌러 주세요.',
  };
}

/**
 * 채운 결과가 「올려도 되는 상태」인가 — 판정은 «화면에 실제로 있는 것»으로만 한다.
 *
 * @AI:CONSTRAINT 내부 카운터(uploaded)로 판정하지 말 것. uploadOnce 는 «네이버 이미지 수가
 *   늘었나»로 성공을 재는데, 앞선 시도가 뒤늦게 도착해도 늘어난다 — 그래서 재시도가 섞이면
 *   uploaded 는 10 인데 화면에는 9 장인 상태가 만들어진다(2026-08-16 마미사 1편 실측).
 *   그때 problems 가 비어 status=ready_to_register 가 되고, 사람이 그대로 등록하면
 *   «그림이 빠진 채 발행된다». 화면 개수를 진실로 삼아야 그 사고가 막힌다.
 * @AI:INTENT 순수 함수로 뽑아 둔 이유 = 브라우저 없이 시험할 수 있게. e2e 로만 덮으면
 *   이 판정은 실전에서만 깨지고, 실전에서 깨지면 이미 발행된 뒤다.
 */
/**
 * 원고가 «굵게로 지정한» 글자 수. 화면 값과 견주려고 센다.
 * @AI:CONSTRAINT 공백을 빼고 센다 — 에디터가 문단을 span 으로 쪼개면서 공백을 다르게 담는다.
 *   readBody 의 boldChars 도 같은 방식으로 세야 두 값이 비교 가능하다.
 */
function countBoldChars(blocks) {
  const re = /<(b|strong)\b[^>]*>([\s\S]*?)<\/\1>/gi;
  let total = 0;
  for (const b of blocks || []) {
    if (b.kind !== 'html') continue;
    let m;
    while ((m = re.exec(b.html)) !== null) {
      total += m[2].replace(/<[^>]+>/g, '').replace(/\s+/g, '').length;
    }
  }
  return total;
}

function verifyFilled({ start, end, expected, uploaded, expectedBoldChars }) {
  const problems = [];
  const before = (start && start.slots) || 0;
  const placed = ((end && end.slots) || 0) - before;

  if (end.externalImages > 0) problems.push(`외부 주소 이미지가 ${end.externalImages}장 남았습니다`);

  // 🔴 서식 오염 (2026-08-16 실사고 — 사장님이 화면에서 발견)
  // @AI:CONSTRAINT 우리 HTML 에 <s>/<del>/<strike> 는 «한 번도» 안 들어간다. 화면에 있으면
  //   에디터가 씌운 것이다 — 취소선 토글이 켜진 채 붙여넣으면 글 «전체»가 먹는다(실측 175개).
  //   숫자가 크든 작든 막는다. 한 군데만 그어져도 고객 블로그에 나가는 글이다.
  if (end.struck > 0) {
    problems.push(`글자에 취소선이 ${end.struck}군데 그어졌습니다 — 붙여넣기 전 서식이 켜져 있었습니다 (지우고 다시 채우세요)`);
  }

  // 🔴 굵게 누출 (2026-08-20) — 끄는 것(clearCaretFormatting)만 두지 않는다. 결과를 «센다».
  // @AI:INTENT 취소선은 「하나라도 있으면 막는다」로 되지만 굵게는 우리도 쓰므로 «양»으로 잰다.
  //   번지면 문단 통째로 굵어져 몇 배가 된다 — 애매한 차이가 아니라서 넉넉한 여유를 둬도 잡힌다.
  // @AI:CONSTRAINT 여유(1.3배 + 40자)를 좁히지 말 것 — 표 셀·링크에서 에디터가 굵게 범위를
  //   조금 넓게 잡는 일이 있어, 딱 맞추면 «멀쩡한 글»이 막힌다. 번짐은 배수로 벌어진다.
  if (expectedBoldChars !== undefined && end.boldChars !== undefined
      && end.boldChars > expectedBoldChars * 1.3 + 40) {
    problems.push(
      `굵게가 번졌습니다 — 원고는 ${expectedBoldChars}자인데 화면은 ${end.boldChars}자입니다 ` +
      '(붙여넣기 직전 굵게가 켜져 있었습니다. 지우고 다시 채우세요)',
    );
  }

  if (placed !== expected) {
    problems.push(
      `이미지가 ${placed}/${expected}장 들어갔습니다` +
      (uploaded !== undefined && uploaded !== placed ? ` (올렸다고 센 것은 ${uploaded}장)` : ''),
    );
  }

  // @AI:CONSTRAINT placeholders 를 문제로 올리지 말 것 — 「업로드 실패」가 아니라 «화면 표시»다.
  //   문서에는 이미지가 온전히 들어 있음을 서버 응답으로 확인했다(2026-08-16, PROVENANCE 참조).
  //   여기서 문제로 올리면 멀쩡한 글이 partial 로 막히고, 사람이 「고치려고」 지우다 진짜로 잃는다.
  return problems;
}

module.exports = { fillCard, handleStartupPopup, pasteHtml, uploadImage, uploadOnce, removePlaceholder,
                   downloadImages, describeImageFailure, readBody, cursorToEnd, getFrame, verifyFilled, withPopupGuard,
                   clearFormatting, FORMAT_TOGGLES, clearCaretFormatting, CARET_TOGGLES, countBoldChars,
                   selectImage, setImageExtend, extendAllImages, ARRANGE, IMAGE_EATS_LINES,
                   setFont, applyFontToAll, readFonts, FONT_BTN, FONT_OPT,
                   readRepImage, setRepImage, REP_BTN, REP_ON, IMG_COMPONENT, BODY, PARA };
