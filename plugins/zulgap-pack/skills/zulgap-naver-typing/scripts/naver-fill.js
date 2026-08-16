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
  const unsureUploads = [];   // 중간 판정이 「안 늘었다」고 본 것 — 대개 오판이라 ⑤에서 화면으로 가른다
  for (const b of parsed.blocks) {
    if (b.kind === 'html') {
      await pasteHtml(page, frame, b.html);
      checkpoint = 'text_ok';
    } else {
      imgSeq += 1;
      const f = files.find((x) => x.index === imgSeq);
      if (!f || !f.ok) { problems.push(`이미지 ${imgSeq} 건너뜀 (파일 없음)`); continue; }
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
  const verdict = verifyFilled({ start, end, expected: parsed.images, uploaded });
  problems.push(...verdict);
  // 중간에 「안 늘었다」고 본 것들은, 화면이 온전하면 문제가 아니다 — 기록만 남긴다
  if (unsureUploads.length) {
    if (verdict.length) problems.push(`업로드 확인이 어긋난 이미지: ${unsureUploads.join(', ')}번`);
    else notes.push(`이미지 ${unsureUploads.join(', ')}번은 중간 확인이 어긋났으나 화면은 온전합니다`);
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
              화면표시: `URL ${end.naverImages}장 · 그림자리 ${end.placeholders}장` },
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
function verifyFilled({ start, end, expected, uploaded }) {
  const problems = [];
  const before = (start && start.slots) || 0;
  const placed = ((end && end.slots) || 0) - before;

  if (end.externalImages > 0) problems.push(`외부 주소 이미지가 ${end.externalImages}장 남았습니다`);

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
                   downloadImages, readBody, cursorToEnd, getFrame, verifyFilled, BODY, PARA };
