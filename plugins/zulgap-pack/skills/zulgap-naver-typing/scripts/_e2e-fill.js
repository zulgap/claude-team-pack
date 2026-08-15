#!/usr/bin/env node
// PR-3 통합 검증 — 실제 네이버 글쓰기 창에 카드 1편을 끝까지 채운다 (등록 안 함)
const path = require('path');
const SK = path.resolve(__dirname, '..');
const { chromium } = require('playwright-core');
const { parseCard, validateCard } = require(path.join(SK, 'scripts/card-parser.js'));
const { fillCard, readBody, getFrame } = require(path.join(SK, 'scripts/naver-fill.js'));

const IMG = 'https://mtnfymojdahnceusnsjh.supabase.co/storage/v1/object/public/media-assets/a0000000-0000-0000-0000-000000000002/generated';

// 실제 카드 축약본 (이미지는 실제 살아있는 Storage URL 2장)
const CARD = `# [시험] 신용장 서류하자, 물건은 갔는데 대금이 멈춥니다
배는 떠났고 서류도 다 넣었습니다. 그런데 은행에서 지급을 못 하겠다는 연락이 옵니다.
바이어에게 물어보면 물건은 잘 받았다고 합니다. **은행이 보는 것이 물건이 아니기 때문**입니다.
![어디까지 갔는지를 보면 원인이 절반으로 좁혀집니다](${IMG}/1786772817601-is20ut.png)
## 은행은 서류만 봅니다
국제상업회의소가 정한 UCP 600 제5조는 은행이 다루는 대상은 서류이지 물품이 아니라고 못 박아 두었습니다.
<table header-row="true">
<tr>
<td>상황</td>
<td>은행의 판단</td>
</tr>
<tr>
<td>물건에 문제, 서류는 완벽</td>
<td>지급한다</td>
</tr>
</table>
그래서 승부가 나는 곳은 창고가 아니라 서류철입니다. 아무리 잘 만들어 보냈어도 종이 한 장이 어긋나면 대금이 멈춥니다.
![멈추는 자리마다 따라붙는 원인이 다릅니다](${IMG}/1786772848476-8v8k6f.png)
## 막을 수 있는 자리는 받은 날 하루입니다
통지받은 날 아래를 확인하십시오.
- 선적기일이 생산 일정 안쪽에 들어오나
- 요구된 서류를 하나도 빠짐없이 확보할 수 있나
#신용장서류하자 #신용장 #무역실무
---
## 재가공 내역 (내부 메모 — 절대 올라가면 안 됨)
이 줄이 네이버에 보이면 경계 판정 실패다.`;

const BLOG_ID = process.argv[2] || process.env.NAVER_BLOG_ID;
const PORT = process.argv[3] || process.env.NAVER_CDP_PORT || '9222';
if (!BLOG_ID) {
  console.error('사용: node _e2e-fill.js <블로그ID> [CDP포트]
' +
                '  (열려 있는 크롬에 붙어 «빈 글쓰기 창»에 시험 카드 1편을 채운다. 등록은 하지 않는다)');
  process.exit(2);
}

(async () => {
  const parsed = parseCard(CARD);
  const v = validateCard(parsed);
  console.log(`파싱: 제목="${parsed.title}" 조각 ${parsed.blocks.length} 이미지 ${parsed.images} 검증=${v.ok ? 'OK' : v.problems}`);

  const browser = await chromium.connectOverCDP(`http://127.0.0.1:${PORT}`);
  const ctx = browser.contexts()[0];

  // 빈 글쓰기 창을 새로 연다
  const page = await ctx.newPage();
  await page.goto(`https://blog.naver.com/${BLOG_ID}?Redirect=Write`, { waitUntil: 'domcontentloaded', timeout: 45000 });
  await page.waitForTimeout(6000);

  // 「작성 중 글이 있습니다」 팝업이 뜨면 «취소»(새로 쓰기)
  try {
    const cancel = page.frameLocator('#mainFrame').locator('button:has-text("취소")').first();
    if (await cancel.isVisible({ timeout: 4000 })) { await cancel.click(); await page.waitForTimeout(1500); }
  } catch {}

  const frame = getFrame(page);
  console.log('시작 상태:', JSON.stringify(await readBody(frame)));

  const t0 = Date.now();
  const r = await fillCard(page, parsed, path.join(SK, 'tmp-img'), { gapMs: 600 });
  console.log(`\n=== 결과 (${((Date.now()-t0)/1000).toFixed(1)}초) ===`);
  console.log(JSON.stringify(r, null, 2));

  // 🔴 내부 메모가 새어 들어갔나 — 최종 확인
  const leak = await frame.evaluate(() => {
    const t = document.querySelector('.se-content')?.innerText || '';
    return { 재가공내역: t.includes('재가공 내역'), 내부메모: t.includes('내부 메모') };
  });
  console.log('내부 메모 유입:', JSON.stringify(leak),
              (!leak.재가공내역 && !leak.내부메모) ? '✅ 없음' : '🔴 새어 들어감');
  console.log('\n🔴 저장·등록하지 않았습니다. 화면을 확인해 주세요.');
  process.exit(0);
})().catch(e => { console.error('실패:', e.message); process.exit(1); });
