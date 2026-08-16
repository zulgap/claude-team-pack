#!/usr/bin/env node
/**
 * 발행 패널 — 카테고리 선택
 *
 * @AI:CONSTRAINT 패널을 열고 «카테고리만» 고른다. 발행·저장 버튼은 누르지 않는다.
 *   등록은 사람이 한다(설계 불가침).
 * @AI:CONSTRAINT 카테고리는 «번호와 이름이 둘 다» 맞을 때만 고른다.
 *   번호만 맞으면 사람이 그 자리에 다른 카테고리를 만들어 둔 것일 수 있고,
 *   이름만 맞으면 같은 이름이 여럿일 수 있다. 한쪽이라도 어긋나면 멈춘다 —
 *   글이 남의 자리에 올라가면 되돌릴 수 없다.
 *
 * 실측으로 확정된 구조 (2026-08-16 · ff1030 발행 패널)
 *   패널 열기   : [data-click-area="tpb.publish"]      (패널 존재 = [class*="layer_publish"])
 *   드롭다운    : [data-click-area="tpb*i.category"]    ← 버튼 텍스트가 «현재 선택값». 누를 때마다 «토글»
 *   목록 항목   : [data-testid="categoryBtn_<번호>"]    ← input. 그 li 안의 label[for] 이 클릭 대상
 *   항목 텍스트 : [data-testid="categoryItemText_<번호>"]
 */

// data-click-area / data-testid 를 쓴다 — 해시 클래스(publish_btn__m9KHH 류)는 빌드마다 바뀐다
const PUBLISH_BTN = '[data-click-area="tpb.publish"], button.publish_btn__m9KHH';
const CATEGORY_BTN = '[data-click-area="tpb*i.category"], button.selectbox_button__jb1Dt';
const PANEL = '[class*="layer_publish"]';
const ITEM = '[data-testid^="categoryBtn_"]';

/**
 * 목록 텍스트 정규화.
 * @AI:FRAGILE 네이버는 카테고리 이름의 공백을 `&nbsp;`(U+00A0)로 넣는다 —
 *   "RPG_수출입&nbsp;어디까지&nbsp;해봤니" (2026-08-16 실측).
 *   눈에는 보통 공백과 똑같아서, 사람이 설정 파일에 친 보통 공백과 «영원히» 안 맞는다.
 *   `\s` 가 U+00A0 를 포함하므로 여기서 함께 흡수된다. 이 치환을 빼지 말 것.
 * @AI:INTENT "하위 카테고리 ○○" 접두사도 뗀다 — 하위 카테고리 항목에 스크린리더용으로 붙는다.
 */
const SUB_PREFIX = /^하위\s*카테고리\s+/;
function normalize(s) {
  return String(s || '').replace(/​/g, '').replace(SUB_PREFIX, '').replace(/\s+/g, ' ').trim();
}

/**
 * 목록에서 원하는 카테고리를 찾는다 — «판정만» 하는 순수 함수.
 *
 * @AI:INTENT 브라우저 없이 검증하려고 DOM 조작과 분리했다.
 *   이 판정이 틀리면 남의 카테고리에 글이 올라가므로 단위 시나리오로 못을 박는다.
 *
 * @param {{no:string, text:string}[]} items 화면에서 읽은 목록
 * @param {{no:string|number, name:string}} want 채널 설정값
 */
function matchCategory(items, want) {
  const no = String(want && want.no != null ? want.no : '').trim();
  const name = normalize(want && want.name);

  if (!no) return { ok: false, code: 'EMPTY', reason: '카테고리 번호가 비어 있습니다 (channels 파일을 확인하세요)' };
  if (!name) return { ok: false, code: 'EMPTY', reason: '카테고리 이름이 비어 있습니다 (channels 파일을 확인하세요)' };
  if (!items || !items.length) return { ok: false, code: 'NO_LIST', reason: '카테고리 목록을 읽지 못했습니다' };

  const hits = items.filter((it) => String(it.no) === no);
  if (hits.length === 0) {
    return {
      ok: false, code: 'NOT_FOUND',
      reason: `카테고리 번호 ${no} 이 이 블로그에 없습니다. 지워졌거나 다른 블로그의 번호입니다.`,
      candidates: items.map((it) => `${it.no} ${normalize(it.text)}`),
    };
  }
  if (hits.length > 1) {
    return { ok: false, code: 'AMBIGUOUS', reason: `카테고리 번호 ${no} 이 ${hits.length}개입니다(비정상).` };
  }

  const found = hits[0];
  const foundName = normalize(found.text);
  if (foundName !== name) {
    // @AI:CONSTRAINT 이름이 바뀌었다고 «그냥 진행»하지 않는다. 그 번호에 다른 카테고리가
    //   들어앉았을 수도 있고, 사람이 이름만 고쳤을 수도 있는데 여기서는 구분할 수 없다.
    return {
      ok: false, code: 'NAME_CHANGED',
      reason: `번호 ${no} 의 이름이 "${foundName}" 입니다 (설정에는 "${want.name}"). ` +
              `네이버에서 이름을 바꾸셨다면 channels 파일도 같이 고쳐 주세요.`,
      actual: foundName,
    };
  }
  return { ok: true, no, name: foundName, index: items.indexOf(found) };
}

async function isPanelOpen(frame) {
  return frame.evaluate((sel) => !!document.querySelector(sel), PANEL);
}

/** 카테고리 목록이 펼쳐져 있나 — 항목이 DOM 에 있으면 열린 것(닫으면 통째로 사라진다). */
async function isDropdownOpen(frame) {
  return frame.evaluate((sel) => !!document.querySelector(sel), ITEM);
}

/**
 * 요소에 직접 click() 을 건다.
 * @AI:FRAGILE 좌표 클릭(locator.click)은 막힌다 — 숨은 `<h1 class="se-help-title">` 이
 *   에디터 전면(1680×871)을 덮고 있어 Playwright 가 「다른 요소가 가로챈다」로 거부한다
 *   (2026-08-16 실측, 10초 타임아웃). HTMLElement.click() 은 좌표를 쓰지 않고 그 요소에만
 *   이벤트를 보내므로 가려져도 동작하고 «엉뚱한 버튼을 누를 위험이 없다» —
 *   발행 버튼 바로 옆이라 이 성질이 결정적이다. 🔴 force:true 좌표 클릭으로 우회하지 말 것.
 */
async function clickBySelector(frame, selector) {
  return frame.evaluate((sel) => {
    const el = document.querySelector(sel);
    if (!el) return false;
    el.click();
    return true;
  }, selector);
}

/** 발행 설정 패널을 연다(이미 열려 있으면 그대로 둔다). */
async function openPublishPanel(page, frame, timeoutMs = 10000) {
  if (await isPanelOpen(frame)) return { opened: false, already: true };

  if (!await clickBySelector(frame, PUBLISH_BTN)) {
    const e = new Error('발행 설정 버튼을 찾지 못했습니다. 네이버 글쓰기 창이 맞는지 확인해 주세요.');
    e.code = 'NO_PUBLISH_BUTTON';
    throw e;
  }
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    await page.waitForTimeout(300);
    if (await isPanelOpen(frame)) return { opened: true };
  }
  const e = new Error('발행 설정 패널이 열리지 않았습니다.');
  e.code = 'PANEL_NOT_OPEN';
  throw e;
}

/** 패널을 닫는다(ESC). 카테고리만 보고 물러날 때 쓴다. */
async function closePublishPanel(page, frame) {
  for (let i = 0; i < 2; i += 1) {
    if (!await isPanelOpen(frame)) return true;
    await page.keyboard.press('Escape');
    await page.waitForTimeout(600);
  }
  return !await isPanelOpen(frame);
}

/** 지금 선택돼 있는 카테고리 이름(= 드롭다운 버튼 텍스트). */
async function currentCategory(frame) {
  return frame.evaluate((sel) => {
    const b = document.querySelector(sel);
    return b ? (b.innerText || '').replace(/\s+/g, ' ').trim() : null;
  }, CATEGORY_BTN);
}

/**
 * 카테고리 목록을 펼쳐 읽는다.
 *
 * @AI:CONSTRAINT 드롭다운은 «토글»이다. 열려 있는데 또 누르면 닫힌다(2026-08-16 실측).
 *   닫힌 상태로 목록을 읽으면 «공개설정 라디오 12건»이 잡혀 카테고리로 오인된다 —
 *   그대로 클릭하면 글을 비공개로 만들어 버린다. 그래서 열림을 «확인하고» 연다.
 * @returns {{no:string, text:string}[]}
 */
async function listCategories(page, frame, timeoutMs = 6000) {
  if (!await isDropdownOpen(frame)) {
    await clickBySelector(frame, CATEGORY_BTN);
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      await page.waitForTimeout(300);
      if (await isDropdownOpen(frame)) break;
    }
  }
  return frame.evaluate((sel) => [...document.querySelectorAll(sel)].map((inp) => {
    const li = inp.closest('li');
    const m = (inp.getAttribute('data-testid') || '').match(/categoryBtn_(\d+)/);
    return {
      no: m ? m[1] : null,
      text: li ? (li.innerText || '').replace(/\s+/g, ' ').trim() : '',
    };
  }).filter((x) => x.no), ITEM);
}

/**
 * 카테고리를 고른다. 번호·이름이 «둘 다» 맞을 때만.
 * @param {{no:string|number, name:string}} want
 * @returns {{ok:boolean, no?:string, name?:string, code?:string, reason?:string}}
 */
async function selectCategory(page, frame, want) {
  await openPublishPanel(page, frame);
  const items = await listCategories(page, frame);

  const m = matchCategory(items, want);
  if (!m.ok) return m;

  // @AI:CONSTRAINT 클릭 대상은 label 이다. li 안 첫 자식은 <span> 인데 핸들러가 없어
  //   눌러도 «아무 일도 일어나지 않는다»(2026-08-16 실측: 선택이 반영되지 않음).
  const clicked = await frame.evaluate((no) => {
    const inp = document.querySelector(`[data-testid="categoryBtn_${no}"]`);
    if (!inp) return false;
    const li = inp.closest('li');
    const label = li && li.querySelector('label[for]');
    (label || inp).click();
    return true;
  }, m.no);
  if (!clicked) return { ok: false, code: 'CLICK_FAILED', reason: '목록 항목을 누르지 못했습니다' };
  await page.waitForTimeout(1200);

  // @AI:CONSTRAINT 눌렀다고 믿지 않는다 — 버튼 텍스트가 «실제로» 바뀌었는지 확인한다.
  //   확인 없이 넘어가면 엉뚱한 카테고리로 사람이 등록하게 된다.
  const now = normalize(await currentCategory(frame));
  if (now !== m.name) {
    return { ok: false, code: 'NOT_APPLIED', reason: `선택이 반영되지 않았습니다 (현재: "${now}" · 원한 것: "${m.name}")` };
  }
  return { ok: true, no: m.no, name: m.name };
}

/**
 * 등록 «직전»에 카테고리가 아직 맞는지 다시 본다.
 *
 * 🔴 **고른 뒤에도 바뀐다.** 2026-08-16 실측: 마미사 3편을 연달아 채운 뒤 확인했더니
 *   세 창 중 둘이 「줄갭이 뭐죠?」로 돌아가 있었다 — 고를 때는 분명 ok 였고 화면 반영까지 봤다.
 *   창을 여러 개 열어 두면 네이버가 계정 단위로 기억하는 «직전 카테고리»가 되살아난다.
 *   그대로 등록하면 **마미사 글이 줄갭 자리에 발행된다**(되돌릴 수 없다).
 * @AI:CONSTRAINT 그래서 «고르는 것»과 «등록 직전 확인»은 다른 일이다. 둘 다 해야 한다.
 *   여러 편을 연달아 채웠다면 사람에게 넘기기 전에 편마다 이걸 부른다.
 * @returns {{ok:boolean, actual:string|null, expected:string}}
 */
async function assertCategory(frame, { name }) {
  const actual = await currentCategory(frame).catch(() => null);
  const ok = actual != null && normalize(actual) === normalize(name);
  return { ok, actual, expected: name };
}

module.exports = {
  openPublishPanel, closePublishPanel, isPanelOpen, isDropdownOpen,
  listCategories, selectCategory, currentCategory, assertCategory,
  matchCategory, normalize, PUBLISH_BTN, CATEGORY_BTN, PANEL, ITEM,
};
