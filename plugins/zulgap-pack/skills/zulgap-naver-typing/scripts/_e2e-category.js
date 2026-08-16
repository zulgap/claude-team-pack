#!/usr/bin/env node
/**
 * 카테고리 선택 e2e — 실제 네이버 글쓰기 창에서 «고르는 것까지» 확인한다
 *
 * @AI:CONSTRAINT 등록·발행 버튼을 누르지 않는다. 카테고리만 바꿔 보고 패널을 닫는다.
 * 실행: node _e2e-category.js <포트> [카테고리1] [카테고리2] ...
 *   빈 글쓰기 창이 열려 있어야 한다(빈 창이 아니면 스스로 중단한다).
 */
const path = require('path');
const { chromium } = require(path.join(__dirname, '..', 'node_modules', 'playwright-core'));
const { getFrame, readBody, handleStartupPopup } = require('./naver-fill');
const cat = require('./naver-category');

const PORT = process.argv[2] || '9223';
// 기본 대상 = 한 계정을 공유하는 세 동료사 (채널 파일과 같은 값)
const TARGETS = [
  { who: '마미사', no: '112', name: '마미사_ai로 회사 굴립니다' },
  { who: 'RPG',   no: '111', name: 'RPG_수출입 어디까지 해봤니' },
  { who: '줄갭',   no: '75',  name: '마케팅 줄GAP' },
];

let pass = 0, fail = 0;
const ok = (n, c, d = '') => { c ? (pass++, console.log(`  ✅ ${n}`)) : (fail++, console.log(`  ❌ ${n}${d ? '  → ' + d : ''}`)); };

(async () => {
  const browser = await chromium.connectOverCDP(`http://127.0.0.1:${PORT}`, { timeout: 15000 });
  const page = browser.contexts()[0].pages()[0];
  const frame = getFrame(page);

  // 「작성 중인 글이 있습니다」 팝업이 떠 있으면 dim 이 클릭을 가로챈다 — 먼저 치운다
  const popups = await handleStartupPopup(page, frame, 8000);
  if (popups.length) console.log(`  (팝업 처리: ${popups.join(', ')})`);

  // 안전 게이트 — 남의 원고 위에서 돌리지 않는다
  const body = await readBody(frame);
  if (body.chars > 40 || body.images > 0) {
    console.log(`🔴 빈 글쓰기 창이 아닙니다 (글자 ${body.chars} · 이미지 ${body.images}). 중단합니다.`);
    process.exit(2);
  }

  console.log('\n[1] 발행 패널 열기');
  const opened = await cat.openPublishPanel(page, frame);
  ok('패널이 열렸다', await cat.isPanelOpen(frame), JSON.stringify(opened));

  console.log('\n[2] 목록 읽기');
  const items = await cat.listCategories(page, frame);
  ok(`목록 ${items.length}건을 읽었다`, items.length > 0);
  ok('항목마다 번호가 붙어 있다', items.every((i) => /^\d+$/.test(String(i.no))));
  ok('하위 카테고리 접두사가 실재한다', items.some((i) => /^하위\s*카테고리\s/.test(i.text)));
  // 드롭다운이 열린 채로 다시 불러도 «닫히지 않아야» 한다(토글 사고 재발 방지)
  const again = await cat.listCategories(page, frame);
  ok('연달아 읽어도 목록이 유지된다(토글 방어)', again.length === items.length, `${items.length} → ${again.length}`);

  console.log('\n[3] 실제 선택 — 동료사별');
  for (const t of TARGETS) {
    const r = await cat.selectCategory(page, frame, { no: t.no, name: t.name });
    ok(`${t.who} — ${t.no} "${t.name}"`, r.ok, r.reason || '');
    if (r.ok) {
      const now = cat.normalize(await cat.currentCategory(frame));
      ok(`  └ 화면 반영 확인 ("${now}")`, now === cat.normalize(t.name));
    }
  }

  console.log('\n[4] fail-closed — 어긋나면 «고르지 않는다»');
  const before = cat.normalize(await cat.currentCategory(frame));
  const bad = await cat.selectCategory(page, frame, { no: '999999', name: '있을리없는카테고리' });
  ok('없는 번호는 실패로 돌아온다', !bad.ok && bad.code === 'NOT_FOUND', JSON.stringify(bad).slice(0, 100));
  const wrongName = await cat.selectCategory(page, frame, { no: '111', name: '엉뚱한이름' });
  ok('번호는 맞고 이름이 다르면 NAME_CHANGED', !wrongName.ok && wrongName.code === 'NAME_CHANGED', JSON.stringify(wrongName).slice(0, 130));
  const after = cat.normalize(await cat.currentCategory(frame));
  ok('실패해도 기존 선택이 안 바뀐다', before === after, `${before} → ${after}`);

  console.log('\n[5] 정리');
  ok('패널을 닫았다', await cat.closePublishPanel(page, frame));
  const end = await readBody(frame);
  ok('본문은 여전히 비어 있다(아무것도 안 썼다)', end.chars === 0 && end.images === 0, JSON.stringify(end));

  console.log(`\n${fail === 0 ? '✅ ALL PASS' : '❌ FAIL'}  ${pass}/${pass + fail}`);
  console.log('🔴 등록 버튼은 누르지 않았습니다 — 등록은 사람이 합니다.\n');
  process.exit(fail === 0 ? 0 : 1);
})().catch((e) => { console.error('실패:', e.message); process.exit(1); });
