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

// 예약발행 (2026-08-16 실측)
const TIME_NOW = '[data-testid=nowTimeRadioBtn]';
const TIME_PRE = '[data-testid=preTimeRadioBtn]';
const DATE_INPUT = '[class*=input_date]';
const HOUR_SEL = 'select[class*=hour_option]';
const MINUTE_SEL = 'select[class*=minute_option]';
// @AI:CONSTRAINT 분은 «10분 단위»만 받는다 — 실측: minute select 의 option 이 6개(00/10/…/50).
//   어긋난 값을 조용히 반올림하지 말 것. 노션에 적힌 시각과 발행 시각이 달라지면 아무도 모른다.
const MINUTE_STEP = 10;
// @AI:CONSTRAINT 노션은 UTC 로 준다 — 네이버 예약칸은 KST. 이 값을 빼면 9시간 어긋난다.
const KST_OFFSET_HOURS = 9;

// 예약 «날짜» 달력 (2026-08-16 실측 — 그 전까지 「미실측」이라 사람이 눌렀다)
// 날짜칸을 클릭하면 표준 jQuery UI datepicker 가 열린다.
const CAL_ROOT = '.ui-datepicker';
const CAL_YEAR = '.ui-datepicker-year';
const CAL_MONTH = '.ui-datepicker-month';
const CAL_PREV = '.ui-datepicker-prev';
const CAL_NEXT = '.ui-datepicker-next';
// @AI:FRAGILE 🔴 `.ui-datepicker-month` 의 텍스트는 `"8"` 이 아니라 **`"8월"`** 이다.
//   `Number("8월")` 은 NaN 이고, NaN 비교는 무조건 거짓이라 «목표 월에 도달했는지» 판정이
//   영원히 실패한다 → «다음 달»만 계속 눌린다(실측 2026-08-16: 8월에서 11월까지 밀려갔다).
//   반드시 `parseInt` 로 읽을 것. 연도는 `"2026"` 이라 문제없지만 같이 parseInt 로 통일한다.
const CAL_MONTH_MAX_MOVE = 6;   // 이보다 멀면 사람이 본다(월 이동을 무한히 누르지 않는다)

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
 * 「예상 발행일」 값을 네이버 예약 입력에 맞는 조각으로 바꾼다 — 브라우저 없이 시험할 수 있게 분리.
 *
 * @AI:CONSTRAINT 10분 단위가 아니면 «고치지 않고 거부»한다. 반올림해 버리면
 *   노션에 적힌 시각과 실제 발행 시각이 달라지고, 그 차이는 아무도 안 본다.
 * @param {string} iso `2026-08-16T19:20:00` 또는 `2026-08-16 19:20` (노션 date 속성의 start)
 */
function parseScheduleAt(iso) {
  const s = String(iso || '').trim();
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})/);
  if (!m) return { ok: false, code: 'NO_TIME', reason: `발행 시각을 읽지 못했습니다: "${iso}" (날짜만 있으면 시각을 넣어 주세요)` };
  let [, y, mo, d, hh, mm] = m;

  // @AI:CONSTRAINT 🔴 노션은 시각을 «UTC»로 돌려준다 — SQL 조회에서 `2026-08-16 10:20:00Z` 로 나온
  //   값이 화면에는 19:20(KST) 이다(2026-08-16 실측). 네이버 예약칸은 KST 다.
  //   이 변환을 빼면 **9시간 어긋난 시각에 발행되고**, 노션과 대조해도 둘 다 「맞다」고 보인다.
  if (/(Z|\+00:?00)$/i.test(s)) {
    // Date.UTC 로 계산하면 이 서버의 타임존과 무관하게 같은 답이 나온다
    const t = new Date(Date.UTC(+y, +mo - 1, +d, +hh, +mm));
    t.setUTCHours(t.getUTCHours() + KST_OFFSET_HOURS);
    const p2 = (n) => String(n).padStart(2, '0');
    y = String(t.getUTCFullYear()); mo = p2(t.getUTCMonth() + 1); d = p2(t.getUTCDate());
    hh = p2(t.getUTCHours()); mm = p2(t.getUTCMinutes());
  }
  if (Number(mm) % MINUTE_STEP !== 0) {
    return { ok: false, code: 'MINUTE_STEP', reason: `네이버는 ${MINUTE_STEP}분 단위만 받습니다 (${hh}:${mm}). 노션의 발행 시각을 고쳐 주세요.` };
  }
  return { ok: true, date: `${y}. ${mo}. ${d}`, hour: hh, minute: mm, ymd: `${y}-${mo}-${d}` };
}

/**
 * 달력 헤더에서 목표 연·월까지 몇 달 떨어졌나. 양수면 다음 달 쪽, 음수면 이전 달 쪽.
 *
 * @AI:FRAGILE 🔴 **`parseInt` 를 `Number` 로 바꾸지 말 것.** 헤더 월은 `"8"` 이 아니라 `"8월"` 이라
 *   `Number("8월") === NaN` 이 되고, NaN 이 섞이면 «도달했나» 비교가 영원히 거짓이라 달력이
 *   한 방향으로만 계속 넘어간다(실측 2026-08-16: 8월 → 11월). 이 함수가 그 함정의 유일한 자리다.
 * @returns {number|null} 읽지 못하면 null — 호출자는 «모른다»로 다뤄 멈춘다
 */
function monthDistance(head, y, mo) {
  const cur = parseInt(head && head.y, 10) * 12 + parseInt(head && head.m, 10);
  if (!Number.isFinite(cur)) return null;
  return (Number(y) * 12 + Number(mo)) - cur;
}

/**
 * 예약 «날짜»를 달력에서 고른다.
 *
 * @AI:INTENT 2026-08-16 이전에는 이 자리가 「미실측」이라 사람이 창마다 달력을 눌렀다.
 *   3편이면 3번, 남은 23편이면 23번이다. 실측해 보니 표준 jQuery UI datepicker 였다.
 * @AI:CONSTRAINT 🔴 **못 고르면 거짓을 돌려주고 멈춘다.** 모르는 UI 를 더듬어 누르는 것이
 *   이 스킬에서 가장 위험한 동작이라는 원칙은 그대로다 — 달라진 것은 «이제 안다»는 것뿐이다.
 *   달이 멀거나(6개월 초과) 이동이 막히거나 그 날짜 칸이 없으면 사람에게 넘긴다.
 */
async function pickDate(page, frame, { y, mo, d }) {
  await frame.evaluate((sel) => { const el = document.querySelector(sel); if (el) el.click(); }, DATE_INPUT);
  await page.waitForTimeout(900);

  let head = null;
  for (let i = 0; i <= CAL_MONTH_MAX_MOVE; i += 1) {
    head = await frame.evaluate((s) => {
      const root = [...document.querySelectorAll(s.root)].find((e) => e.offsetParent !== null);
      if (!root) return null;
      return {
        y: (root.querySelector(s.year) || {}).textContent || '',
        m: (root.querySelector(s.month) || {}).textContent || '',
      };
    }, { root: CAL_ROOT, year: CAL_YEAR, month: CAL_MONTH });
    if (!head) return { ok: false, code: 'CAL_NOT_OPEN', reason: '날짜 달력이 열리지 않았습니다' };

    const diff = monthDistance(head, y, mo);
    if (diff === null) {
      return { ok: false, code: 'CAL_HEAD_UNREADABLE',
               reason: `달력 헤더를 읽지 못했습니다 (${JSON.stringify(head)})`, shown: head };
    }
    if (diff === 0) break;
    if (i === CAL_MONTH_MAX_MOVE) {
      return { ok: false, code: 'CAL_MONTH_FAR',
               reason: `달력이 ${head.y}년 ${head.m} 에 있는데 예약일은 ${y}-${mo} 입니다 (${CAL_MONTH_MAX_MOVE}달 넘게 떨어져 있어 멈춥니다)`, shown: head };
    }
    const moved = await frame.evaluate((s) => {
      const root = [...document.querySelectorAll(s.root)].find((e) => e.offsetParent !== null);
      const btn = root && root.querySelector(s.fwd ? s.next : s.prev);
      if (!btn || btn.classList.contains('ui-state-disabled')) return false;
      btn.click();
      return true;
    }, { root: CAL_ROOT, next: CAL_NEXT, prev: CAL_PREV, fwd: diff > 0 });
    if (!moved) {
      return { ok: false, code: 'CAL_MOVE_BLOCKED',
               reason: `달력을 ${diff > 0 ? '다음' : '이전'} 달로 옮길 수 없습니다 (${head.y}년 ${head.m})`, shown: head };
    }
    await page.waitForTimeout(600);
  }

  // 그 달의 해당 일. 앞뒤 달에서 넘어온 칸(other-month)과 못 고르는 칸은 건너뛴다.
  const picked = await frame.evaluate((s) => {
    const root = [...document.querySelectorAll(s.root)].find((e) => e.offsetParent !== null);
    if (!root) return false;
    for (const td of root.querySelectorAll('td')) {
      if (/other-month|unselectable/.test(td.className)) continue;
      const el = td.querySelector('button, a');
      if (!el || el.offsetParent === null || el.disabled) continue;
      if ((el.textContent || '').trim() !== s.d) continue;
      el.click();
      return true;
    }
    return false;
  }, { root: CAL_ROOT, d: String(Number(d)) });
  if (!picked) return { ok: false, code: 'CAL_DAY_NOT_FOUND', reason: `달력에서 ${Number(d)}일 칸을 찾지 못했습니다` };

  await page.waitForTimeout(700);
  return { ok: true, head };
}

/**
 * 예약발행 시각을 넣는다. 🔴 발행 버튼은 누르지 않는다 — 넣기만 하고 멈춘다.
 *
 * @AI:INTENT 시각의 정본은 **노션 「예상 발행일」**이다. 여기서 정하지 않는다 — 옮길 뿐이다.
 * @AI:FRAGILE 예약 라디오는 요소에 직접 이벤트를 보낸다. 좌표 클릭은 쓰지 말 것 —
 *   발행 버튼 바로 옆이라 빗나가면 그대로 게시된다(selectCategory 와 같은 이유).
 * @AI:CONSTRAINT 날짜가 화면 값과 다르면 **달력에서 고른다**(2026-08-16 실측 — 그 전에는
 *   「미실측」이라 사람이 창마다 눌렀다). 고르지 못하면 여전히 «멈춘다» — 모르는 UI 를 더듬어
 *   누르지 않는다는 원칙은 그대로고, 달라진 것은 이제 그 UI 를 안다는 것뿐이다. → pickDate()
 */
async function setSchedule(page, frame, { at }) {
  const p = parseScheduleAt(at);
  if (!p.ok) return p;

  if (!await isPanelOpen(frame)) await openPublishPanel(page, frame);
  await page.waitForTimeout(1000);

  await frame.evaluate((sel) => { const r = document.querySelector(sel); if (r) r.click(); }, TIME_PRE);
  await page.waitForTimeout(1000);

  const same = (a, b) => String(a).replace(/\s/g, '') === String(b).replace(/\s/g, '');
  const shownDate = await frame.evaluate((sel) => (document.querySelector(sel) || {}).value || '', DATE_INPUT);
  if (!same(shownDate, p.date)) {
    // 화면은 «오늘»을 기본으로 연다 — 내일 이후로 미루면 항상 여기로 온다(실측 2026-08-16).
    const [py, pmo, pd] = p.ymd.split('-');
    const r = await pickDate(page, frame, { y: py, mo: pmo, d: pd });
    const after = r.ok
      ? await frame.evaluate((sel) => (document.querySelector(sel) || {}).value || '', DATE_INPUT)
      : shownDate;
    if (!r.ok || !same(after, p.date)) {
      return { ok: false, code: 'DATE_MISMATCH',
               reason: `${r.ok ? `날짜를 골랐는데 화면이 ${after} 입니다` : r.reason} (예약일 ${p.date}). 날짜는 사람이 골라 주세요.`,
               shown: after, wanted: p.date, cause: r.code || 'NOT_APPLIED' };
    }
  }

  await frame.locator(HOUR_SEL).selectOption(p.hour);
  await page.waitForTimeout(300);
  await frame.locator(MINUTE_SEL).selectOption(p.minute);
  await page.waitForTimeout(700);

  // 「넣었다」고 믿지 않는다 — 화면에서 다시 읽는다
  const now = await frame.evaluate((s) => ({
    pre: !!document.querySelector(s.pre)?.checked,
    date: (document.querySelector(s.date) || {}).value || '',
    hour: (document.querySelector(s.hour) || {}).value,
    minute: (document.querySelector(s.min) || {}).value,
  }), { pre: TIME_PRE, date: DATE_INPUT, hour: HOUR_SEL, min: MINUTE_SEL });

  if (!now.pre) return { ok: false, code: 'NOT_RESERVED', reason: '예약 선택이 반영되지 않았습니다', actual: now };
  if (now.hour !== p.hour || now.minute !== p.minute) {
    return { ok: false, code: 'NOT_APPLIED', reason: `시각이 반영되지 않았습니다 (화면 ${now.hour}:${now.minute} · 요청 ${p.hour}:${p.minute})`, actual: now };
  }
  return { ok: true, at: `${now.date} ${now.hour}:${now.minute}`, hour: now.hour, minute: now.minute };
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
  setSchedule, parseScheduleAt, pickDate, monthDistance,
  matchCategory, normalize, PUBLISH_BTN, CATEGORY_BTN, PANEL, ITEM,
  TIME_NOW, TIME_PRE, DATE_INPUT, HOUR_SEL, MINUTE_SEL, MINUTE_STEP,
  CAL_ROOT, CAL_YEAR, CAL_MONTH, CAL_PREV, CAL_NEXT, CAL_MONTH_MAX_MOVE,
};
