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
  if (!row.hasPublishBtn) problems.push('발행 버튼이 안 보입니다 (발행 패널이 닫혔을 수 있습니다)');

  if (row.images_expected != null && row.slots !== row.images_expected) {
    problems.push(`그림 자리 ${row.slots}/${row.images_expected}`);
  }

  if (expect.category) {
    if (!row.category) problems.push('카테고리를 읽지 못했습니다');
    else if (normalizeName(row.category) !== normalizeName(expect.category)) {
      problems.push(`카테고리가 "${row.category}" 입니다 (원한 것: "${expect.category}")`);
    }
  }

  const s = row.schedule;
  if (!s || !s.reserved) {
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

  const panel = await f.evaluate(() => {
    const p = document.querySelector('[class*="layer_publish"]');
    if (!p) return { open: false };
    const btn = [...p.querySelectorAll('button')]
      .find((b) => b.getAttribute('data-testid') === 'seOnePublishBtn' && b.offsetParent !== null);
    return { open: true, hasPublishBtn: !!btn, publishText: btn ? (btn.innerText || '').trim() : null };
  });

  let category = null;
  try { category = await mod.cat.currentCategory(f); } catch { /* 패널이 닫혔을 수 있다 */ }

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
    category, schedule,
    panelOpen: panel.open, hasPublishBtn: !!panel.hasPublishBtn, publishText: panel.publishText,
  };
}

// ─────────────────────────────────────────────────────────────
// 실행
// ─────────────────────────────────────────────────────────────

async function main() {
  const argv = process.argv.slice(2);
  const argOf = (k) => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : null; };
  const expectCategory = argOf('--category');
  const front = argOf('--front');
  const port = argOf('--port') || '9223';

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
    console.log(`     본문 ${r.chars}자 · 그림 ${r.slots}자리 · ${r.category || '카테고리 못 읽음'}`);
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

  console.log('\n🔴 아무 버튼도 누르지 않았습니다.');
  process.exit(bad === 0 ? 0 : 1);
}

module.exports = { sortBySchedule, judgeRow, normalizeName };

if (require.main === module) {
  main().catch((e) => { console.error('실패:', e.message); process.exit(1); });
}
