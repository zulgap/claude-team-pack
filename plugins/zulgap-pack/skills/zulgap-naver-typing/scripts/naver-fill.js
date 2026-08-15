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
    const imgs = bodyComps.flatMap((comp) => [...comp.querySelectorAll('img')])
      .filter((i) => !/^data:/.test(srcOf(i)));

    return {
      chars,
      images: imgs.length,
      naverImages: imgs.filter((i) => /pstatic|naver/.test(srcOf(i))).length,
      externalImages: imgs.filter((i) => !/pstatic|naver/.test(srcOf(i))).length,
    };
  }, BODY);
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

/** 클립보드를 쓰지 않는 붙여넣기 */
async function pasteHtml(page, frame, html) {
  await cursorToEnd(page, frame);
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

/** 이미지 1장 업로드 — 「사진」 버튼 → 파일선택창 가로채기 */
async function uploadImage(page, frame, filePath, timeoutMs = 30000) {
  const before = await readBody(frame);
  const btn = frame.locator('button.se-image-toolbar-button, [data-name="image"], button:has-text("사진")').first();
  const [chooser] = await Promise.all([
    page.waitForEvent('filechooser', { timeout: 15000 }),
    btn.click({ timeout: 10000 }),
  ]);
  await chooser.setFiles(filePath);

  // 네이버 서버로 올라갈 때까지 대기 (개수 증가로 판정)
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    await page.waitForTimeout(1000);
    const now = await readBody(frame);
    if (now.naverImages > before.naverImages) return { ok: true, naverImages: now.naverImages };
  }
  return { ok: false, reason: '업로드 후 네이버 서버 이미지가 늘지 않았습니다', before: before.naverImages };
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
    if (!res.ok) { out.push({ index: i, url: b.url, ok: false, status: res.status }); continue; }
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

  // ② 이미지 미리 받기 — 중간에 받으면 실패 시 반쪽 글이 남는다
  const files = await downloadImages(parsed.blocks, imageDir);
  const failed = files.filter((f) => !f.ok);
  if (failed.length) problems.push(`이미지 ${failed.length}장 다운로드 실패 (${failed.map((f) => f.index).join(',')})`);
  if (files.length && failed.length === files.length) {
    return { status: 'failed', checkpoint, reason: '이미지를 하나도 받지 못했습니다', problems };
  }

  // ③ 제목
  if (parsed.title) {
    const t = frame.locator('.se-documentTitle .se-text-paragraph, .se-title-text .se-text-paragraph').first();
    await t.click({ timeout: 10000 });
    await page.keyboard.type(parsed.title, { delay: 12 });
    await page.waitForTimeout(300);
  }

  // ④ 조각 순서대로
  let imgSeq = 0, uploaded = 0;
  for (const b of parsed.blocks) {
    if (b.kind === 'html') {
      await pasteHtml(page, frame, b.html);
      checkpoint = 'text_ok';
    } else {
      imgSeq += 1;
      const f = files.find((x) => x.index === imgSeq);
      if (!f || !f.ok) { problems.push(`이미지 ${imgSeq} 건너뜀 (파일 없음)`); continue; }
      const r = await uploadImage(page, frame, f.file);
      if (!r.ok) { problems.push(`이미지 ${imgSeq} 업로드 확인 실패: ${r.reason}`); continue; }
      uploaded += 1;
      checkpoint = `image_ok(${uploaded}/${parsed.images})`;
    }
    // 사람처럼 — 조각 사이에 쉼
    await page.waitForTimeout(opts.gapMs ?? 700);
  }

  // ⑤ 결과 검증
  const end = await readBody(frame);
  if (end.externalImages > 0) problems.push(`외부 주소 이미지가 ${end.externalImages}장 남았습니다`);
  if (uploaded !== parsed.images) problems.push(`이미지 ${uploaded}/${parsed.images}장만 올라갔습니다`);

  const okAll = problems.length === 0;
  return {
    status: okAll ? 'ready_to_register' : 'partial',
    checkpoint: okAll ? 'ready_to_register' : checkpoint,
    filled: { chars: end.chars, naverImages: end.naverImages, externalImages: end.externalImages,
              images_expected: parsed.images, images_uploaded: uploaded },
    problems,
    notes,
    // @AI:CONSTRAINT 여기서 끝. 등록은 사람이 누른다.
    next: '화면을 확인하시고 «등록» 버튼을 눌러 주세요.',
  };
}

module.exports = { fillCard, handleStartupPopup, pasteHtml, uploadImage, downloadImages, readBody, cursorToEnd, getFrame, BODY, PARA };
