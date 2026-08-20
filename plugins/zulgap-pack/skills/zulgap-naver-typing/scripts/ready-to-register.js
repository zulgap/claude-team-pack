#!/usr/bin/env node
/**
 * 「버튼만 누르면 되는 상태」로 사람에게 넘긴다.
 *
 * @AI:INTENT 등록은 사람이 누른다(설계 불가침). 그러면 **누르기 직전까지는 도구가 다 해야** 한다 —
 *   그러지 않으면 사람이 창마다 카테고리·날짜·그림을 눈으로 훑어야 하고, 그게 이 스킬이
 *   없애려던 바로 그 수고다. 이 스크립트가 그 «마지막 한 뼘»을 맡는다.
 *
 * @AI:CONSTRAINT 🔴 **발행·등록 버튼을 누르지 않는다.** 존재하는지 «확인만» 한다.
 *   네이버가 자동 발행을 막아 둔 지점이고, 계정 하나를 여러 동료사가 함께 쓰기 때문에
 *   그 계정이 막히면 여러 곳이 동시에 멈춘다.
 *
 * 사용:
 *   node ready-to-register.js                                  # 열린 창 전부 점검
 *   node ready-to-register.js --category "마미사_ai로 회사 굴립니다"   # 카테고리까지 대조
 *   node ready-to-register.js --front 1                        # 1번 창을 앞으로 가져온다
 */

const fs = require('fs');
const path = require('path');
const SK = path.join(__dirname, '..');

// ─────────────────────────────────────────────────────────────
// 판정 (순수 함수 — 브라우저 없이 테스트한다)
// ─────────────────────────────────────────────────────────────

/**
 * 예약이 이른 것부터. 예약이 없는 창은 뒤로 민다(사람이 시각을 정해야 하므로).
 * @AI:INTENT 사람이 «누르는 순서»가 곧 발행 순서가 되게 한다. 순서가 뒤섞이면
 *   1편이 2편보다 늦게 나가는 사고가 난다(시리즈 글은 순서가 내용이다).
 */
function sortBySchedule(rows) {
  return [...rows].sort((a, b) => {
    const ka = a.schedule && a.schedule.at ? a.schedule.at : '￿';
    const kb = b.schedule && b.schedule.at ? b.schedule.at : '￿';
    if (ka !== kb) return ka < kb ? -1 : 1;
    return String(a.title || '').localeCompare(String(b.title || ''));
  });
}

/**
 * 이 창을 사람에게 「눌러도 된다」고 넘겨도 되나.
 *
 * @AI:CONSTRAINT 🔴 하나라도 걸리면 «누르지 마세요»다. 등록은 되돌릴 수 없으므로
 *   「아마 괜찮을 것」으로 넘기지 않는다.
 * @param {{title,chars,slots,images_expected,category,schedule,hasPublishBtn}} row
 * @param {{category?:string}} expect
 */
function judgeRow(row, expect = {}) {
  const problems = [];

  if (!row.title) problems.push('제목이 비어 있습니다');
  if (!row.chars) problems.push('본문이 비어 있습니다');
  if (!row.hasPublishBtn && row.panelOpen) problems.push('발행 버튼이 안 보입니다');

  if (row.images_expected != null && row.slots !== row.images_expected) {
    problems.push(`그림 자리 ${row.slots}/${row.images_expected}`);
  }

  // @AI:INTENT 대표 이미지는 검색결과·블로그 목록에 뜨는 «얼굴»이다. 지정을 안 하면
  //   네이버가 첫 장을 쓰므로 대개는 그림이 뜨지만, 그림이 있는데도 «대표가 없는» 상태가
  //   되면 얼굴 없이 나간다. 그건 사람이 알아야 한다.
  if (row.rep && row.rep.total > 0 && row.rep.index === null) {
    problems.push('대표 이미지가 지정돼 있지 않습니다 (검색결과에 얼굴이 안 뜹니다)');
  }

  if (expect.category && row.panelOpen) {
    if (!row.category) problems.push('카테고리를 읽지 못했습니다');
    else if (normalizeName(row.category) !== normalizeName(expect.category)) {
      problems.push(`카테고리가 "${row.category}" 입니다 (원한 것: "${expect.category}")`);
    }
  }

  // 🔴 «못 읽은 것»과 «안 걸린 것»을 구별한다 (2026-08-20 실사고)
  // @AI:INTENT 발행 패널이 닫혀 있으면 예약 입력칸이 DOM 에 없어 전부 빈값으로 읽힌다.
  //   그 상태를 「예약 안 걸림」으로 말하면, 예약이 «멀쩡히 걸린» 글에 대고
  //   「누르면 지금 나갑니다」라고 겁을 준다. 실제로 5편 전부 그렇게 나왔고,
  //   그날의 판정 전체가 거짓 경보였다 — 이런 게 쌓이면 사람이 이 도구를 안 믿게 된다.
  // @AI:CONSTRAINT 그렇다고 «통과»시키지도 않는다. 모르는 것은 모른다고 하고 막는다.
  const s = row.schedule;
  if (!row.panelOpen) {
    problems.push('발행 패널이 닫혀 있어 카테고리·예약을 읽지 못했습니다 (열고 다시 보세요)');
  } else if (!s || !s.reserved) {
    problems.push('예약이 걸려 있지 않습니다 — 누르면 «지금» 나갑니다');
  } else {
    if (!s.date) problems.push('예약 날짜가 비어 있습니다');
    if (!s.hour || !s.minute) problems.push('예약 시각이 비어 있습니다');
  }

  return { ok: problems.length === 0, problems };
}

/** 카테고리 이름 비교용 — 네이버가 넣는 &nbsp; 를 흡수한다(naver-category 와 같은 규칙). */
function normalizeName(s) {
  return String(s || '').replace(/​/g, '').replace(/^하위\s*카테고리\s+/, '').replace(/\s+/g, ' ').trim();
}

// ─────────────────────────────────────────────────────────────
// 화면 읽기 (여기서부터 브라우저)
// ─────────────────────────────────────────────────────────────

async function readWindow(page, mod) {
  const { getFrame, readBody } = mod.fill;
  const f = getFrame(page);
  const body = await readBody(f);

  const title = await f.evaluate(() => {
    const t = document.querySelector('.se-documentTitle');
    return t ? (t.innerText || '').replace(/\s+/g, ' ').trim() : '';
  });

  // 🔴 닫힌 패널은 «열고» 읽는다 (2026-08-20)
  // @AI:INTENT 카테고리·예약 입력칸은 발행 패널 «안»에 있어서, 패널이 닫혀 있으면
  //   DOM 에 아예 없다. 앞선 후처리(캡션·태그 등)가 패널을 닫아 두는 일이 흔하고,
  //   그러면 멀쩡한 글 5편이 전부 「누르지 마세요」로 나왔다. 사람이 매번 손으로
  //   5개 창을 열고 다시 돌리는 것은 이 도구가 없애려던 바로 그 수고다.
  // @AI:CONSTRAINT 🔴 여는 것은 «패널»이지 «발행»이 아니다. openPublishPanel 은 글을
  //   내보내지 않는다. 이 파일에서 눌러도 되는 버튼은 이것 하나뿐이다 —
  //   패널 «안»의 발행 버튼은 절대 누르지 않는다(되돌릴 수 없다).
  let panelOpenedByUs = false;
  try {
    if (!(await mod.cat.isPanelOpen(f))) {
      await mod.cat.openPublishPanel(page, f);
      await page.waitForTimeout(700);
      panelOpenedByUs = await mod.cat.isPanelOpen(f);
    }
  } catch { /* 못 열면 아래 판정이 «닫혀 있다»로 막는다 */ }

  const panel = await f.evaluate(() => {
    const p = document.querySelector('[class*="layer_publish"]');
    if (!p) return { open: false };
    const btn = [...p.querySelectorAll('button')]
      .find((b) => b.getAttribute('data-testid') === 'seOnePublishBtn' && b.offsetParent !== null);
    return { open: true, hasPublishBtn: !!btn, publishText: btn ? (btn.innerText || '').trim() : null };
  });

  let category = null;
  try { category = await mod.cat.currentCategory(f); } catch { /* 패널이 닫혔을 수 있다 */ }

  let rep = null;
  try { rep = await mod.fill.readRepImage(f); } catch { /* 구버전 모듈 */ }

  const schedule = await f.evaluate(() => {
    const g = (s) => document.querySelector(s);
    const pre = g('[data-testid=preTimeRadioBtn]');
    return {
      reserved: !!(pre && pre.checked),
      date: ((g('[class*=input_date]') || {}).value || '').trim(),
      hour: (g('select[class*=hour_option]') || {}).value || '',
      minute: (g('select[class*=minute_option]') || {}).value || '',
    };
  });
  schedule.at = schedule.reserved ? `${schedule.date} ${schedule.hour}:${schedule.minute}` : '';

  return {
    page, title, chars: body.chars, slots: body.slots,
    category, schedule, rep,
    panelOpen: panel.open, hasPublishBtn: !!panel.hasPublishBtn, publishText: panel.publishText,
    panelOpenedByUs,
  };
}

// ─────────────────────────────────────────────────────────────
// 실행
// ─────────────────────────────────────────────────────────────

/**
 * 열려 있는 세션의 CDP 포트를 잠금파일에서 읽는다.
 * @AI:CONSTRAINT 프로필키를 안 주면 «살아 있는 것이 하나뿐일 때만» 답한다 —
 *   여러 계정 창이 떠 있는데 아무거나 고르면 «남의 블로그»를 검사하고 통과시킨다.
 */
function sessionPort(profileKey) {
  try {
    const cs = require(path.join(SK, 'scripts/chrome-session.js'));
    if (profileKey) {
      const o = cs.readOwner(profileKey);
      return o && o.port ? String(o.port) : null;
    }
    const dirs = fs.readdirSync(cs.PROFILES_DIR, { withFileTypes: true })
      .filter((d) => d.isDirectory()).map((d) => d.name);
    const live = dirs.map((k) => cs.readOwner(k)).filter((o) => o && o.port);
    return live.length === 1 ? String(live[0].port) : null;
  } catch { return null; }
}

async function main() {
  const argv = process.argv.slice(2);
  const argOf = (k) => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : null; };
  const expectCategory = argOf('--category');
  const front = argOf('--front');
  // 🔴 포트를 «고정값으로 짐작하지 않는다» (2026-08-20)
  // @AI:INTENT chrome-session 은 9222 부터 «빈 포트를 찾아» 쓰고 그 번호를 잠금파일에 적어 둔다.
  //   여기 기본값이 9223 으로 박혀 있어, 정상적으로 9222 를 잡은 세션에는 붙지 못하고
  //   ECONNREFUSED 로 죽었다 — 사람이 매번 `--port` 를 손으로 붙여야 했다.
  // @AI:CONSTRAINT 잠금파일이 정본이다. 못 읽었을 때만 9222(=PORT_BASE)로 떨어진다.
  const port = argOf('--port') || sessionPort(argOf('--profile')) || '9222';

  const { chromium } = require(path.join(SK, 'node_modules', 'playwright-core'));
  const mod = {
    fill: require(path.join(SK, 'scripts/naver-fill.js')),
    cat: require(path.join(SK, 'scripts/naver-category.js')),
  };

  const browser = await chromium.connectOverCDP(`http://127.0.0.1:${port}`, { timeout: 15000 });
  const rows = [];
  for (const p of browser.contexts()[0].pages()) {
    let url = '';
    try { url = p.url(); } catch { continue; }
    if (!/blog\.naver\.com\/.+Redirect=Write/.test(url)) continue;
    try { rows.push(await readWindow(p, mod)); } catch (e) { rows.push({ page: p, readError: e.message }); }
  }

  if (!rows.length) {
    console.log('열린 네이버 글쓰기 창이 없습니다.');
    process.exit(1);
  }

  const sorted = sortBySchedule(rows);
  console.log(`\n글쓰기 창 ${sorted.length}개 — 예약이 이른 순서입니다\n${'─'.repeat(76)}`);

  let bad = 0;
  sorted.forEach((r, i) => {
    if (r.readError) { bad += 1; console.log(`${i + 1}. 🔴 창을 읽지 못했습니다 — ${r.readError}`); return; }
    const v = judgeRow(r, { category: expectCategory });
    if (!v.ok) bad += 1;
    console.log(`${i + 1}. ${v.ok ? '✅ 눌러도 됩니다' : '🔴 누르지 마세요'}  ${String(r.title).slice(0, 34)}`);
    const repTxt = !r.rep || !r.rep.total ? '그림 없음'
      : r.rep.index === null ? '🔴 대표 미지정'
      : `대표 ${r.rep.index + 1}번째`;
    console.log(`     본문 ${r.chars}자 · 그림 ${r.slots}자리(${repTxt}) · ${r.category || '카테고리 못 읽음'}`);
    console.log(`     예약 ${r.schedule.at || '(안 걸림)'}${r.publishText ? ` · 버튼 "${r.publishText}"` : ''}`);
    v.problems.forEach((p) => console.log(`     🔴 ${p}`));
  });

  console.log('─'.repeat(76));
  if (bad === 0) {
    console.log(`✅ ${sorted.length}편 전부 준비됐습니다 — 각 창에서 «발행» 버튼만 누르시면 됩니다.`);
    console.log('   (예약이 걸려 있어 지금 나가지 않고 그 시각에 나갑니다)');
  } else {
    console.log(`🔴 ${bad}편은 아직 누르시면 안 됩니다. 위 사유를 먼저 처리하세요.`);
  }

  if (front) {
    const n = Number(front);
    const target = sorted[n - 1];
    if (target && target.page) {
      await target.page.bringToFront();
      console.log(`\n👉 ${n}번 창을 앞으로 가져왔습니다: ${String(target.title).slice(0, 34)}`);
    } else {
      console.log(`\n🔴 ${front} 번 창이 없습니다 (1~${sorted.length})`);
    }
  }

  // 🔴 마지막 줄은 «사실»이어야 한다 — 이 한 줄을 보고 사람이 안심한다.
  //   패널을 연 것은 버튼을 누른 것이므로, 눌렀으면 눌렀다고 말한다.
  const opened = sorted.filter((r) => r.panelOpenedByUs).length;
  console.log(opened
    ? `\n🔴 발행 버튼은 누르지 않았습니다. (읽으려고 발행 패널만 ${opened}개 열었습니다)`
    : '\n🔴 아무 버튼도 누르지 않았습니다.');
  process.exit(bad === 0 ? 0 : 1);
}

module.exports = { sortBySchedule, judgeRow, normalizeName };

if (require.main === module) {
  main().catch((e) => { console.error('실패:', e.message); process.exit(1); });
}
