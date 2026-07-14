// 검색광고 4단계: "전체 캠페인" 링크 클릭 → 기간 6월 → 테이블 덤프 + 다운로드
import { createRequire } from 'module';
import { writeFileSync } from 'fs';
import { homedir } from 'os';
import { pathToFileURL } from 'url';
// playwright 로딩: env PLAYWRIGHT_DIR > 사장님 PC 기본 > 현재 폴더 (직원 PC = 아무 폴더에서 npm i playwright 후 그 폴더에서 실행)
function loadChromium() {
  const dirs = [process.env.PLAYWRIGHT_DIR, 'C:/Users/admin/Documents/marketing-report', process.cwd()].filter(Boolean);
  for (const d of dirs) {
    try { return createRequire(pathToFileURL(d + '/package.json').href)('playwright').chromium; } catch {}
  }
  throw new Error('playwright 미설치 — 임의 폴더에서 [npm i playwright && npx playwright install chromium] 실행 후, 그 폴더에서 이 스크립트를 실행하거나 PLAYWRIGHT_DIR 환경변수로 지정');
}
const chromium = loadChromium();

const PROFILE = homedir() + '/.naver-mr-profile';
const OUT = process.argv[2] || homedir() + '/Downloads/gaon-report-out';
import { mkdirSync as _mk } from 'fs'; _mk(OUT, { recursive: true });

const ctx = await chromium.launchPersistentContext(PROFILE, {
  headless: false, viewport: { width: 1600, height: 950 }, acceptDownloads: true,
});
const page = ctx.pages()[0] ?? (await ctx.newPage());

await page.goto('https://ads.naver.com/manage/ad-accounts/1790170/dashboard', { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(6000);
for (let i = 0; i < 120; i++) {
  if (page.url().startsWith('https://ads.naver.com/manage')) break;
  if (i === 0) console.log('[!] 로그인 대기');
  if (page.url().includes('nid.naver.com')) await page.locator('#keep').check({ force: true }).catch(() => {});
  if (i === 3 && page.url().includes('nid.naver.com')) {
    const btn = page.locator('.btn_login, #log\\.login').first();
    if (await btn.count() > 0) await btn.click().catch(() => {});
  }
  await page.waitForTimeout(5000);
}
await page.waitForTimeout(3000);
console.log('[1] URL:', page.url());

// 사이드바 "전체 캠페인" 클릭
const campLink = page.locator('a:has-text("전체 캠페인")').first();
if (await campLink.count() === 0) { console.error('[FAIL] 전체 캠페인 링크 없음'); await ctx.close(); process.exit(1); }
await campLink.click();
await page.waitForTimeout(7000);
console.log('[2] URL:', page.url());

// 기간을 "지난달"로 설정
const dateBtn = page.locator('button', { hasText: /20\d\d\./ }).first();
if (await dateBtn.count() > 0) {
  const cur = ((await dateBtn.textContent()) || '').trim();
  console.log('[3] 현재 기간:', cur);
  // 지난달 1일(YYYY.MM.01.)이 이미 설정돼 있지 않으면 "지난달" 프리셋 적용
  const lm = new Date(); lm.setDate(1); lm.setMonth(lm.getMonth() - 1);
  const lmStart = `${lm.getFullYear()}.${String(lm.getMonth() + 1).padStart(2, '0')}.01`;
  if (!cur.includes(lmStart)) {
    await dateBtn.click();
    await page.waitForTimeout(1500);
    const preset = page.locator('text="지난달"').first();
    if (await preset.count() > 0) { await preset.click(); await page.waitForTimeout(1000); }
    for (const t of ['확인', '적용']) {
      const btn = page.locator(`button:has-text("${t}")`).last();
      if (await btn.count() > 0 && await btn.isVisible().catch(() => false)) { await btn.click(); break; }
    }
    await page.waitForTimeout(5000);
  }
}

// 테이블 덤프
const table = await page.evaluate(() => {
  const tables = Array.from(document.querySelectorAll('table'));
  return tables.map(t => Array.from(t.querySelectorAll('tr')).slice(0, 25).map(tr =>
    Array.from(tr.querySelectorAll('th,td')).map(c => (c.textContent || '').trim().replace(/\s+/g, ' ')).join(' || ')
  ).join('\n')).join('\n===TABLE===\n');
});
writeFileSync(OUT + '/searchad-step4-table.txt', table);
await page.screenshot({ path: OUT + '/searchad-step4.png', fullPage: false });
console.log('[4] 테이블 덤프 길이:', table.length);

// 다운로드 버튼 시도 (캠페인 목록 다운로드)
const dlBtn = page.locator('button:has-text("다운로드")').first();
if (await dlBtn.count() > 0) {
  try {
    const [download] = await Promise.all([
      page.waitForEvent('download', { timeout: 30000 }),
      dlBtn.click(),
    ]);
    const fname = download.suggestedFilename();
    await download.saveAs(`${OUT}/campaigns_${fname}`);
    console.log('[SAVED] campaigns_' + fname);
  } catch {
    console.log('[!] 다운로드 이벤트 없음 — 모달 확인');
    await page.waitForTimeout(1500);
    await page.screenshot({ path: OUT + '/searchad-step4-dl.png' });
    const btns = await page.evaluate(() => Array.from(document.querySelectorAll('button')).map(b => (b.textContent||'').trim()).filter(Boolean).slice(-25));
    console.log('버튼들:', btns.join(' | '));
  }
} else console.log('[!] 다운로드 버튼 없음');
console.log('[DONE]');
await ctx.close();
