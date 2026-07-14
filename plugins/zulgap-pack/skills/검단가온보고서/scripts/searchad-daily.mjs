// 검색광고 2단계: 기간 6월 설정 + 다운로드
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
  headless: false, viewport: { width: 1500, height: 950 }, acceptDownloads: true,
});
const page = ctx.pages()[0] ?? (await ctx.newPage());

await page.goto('https://ads.naver.com/manage/ad-accounts/1790170/dashboard', { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(6000);
console.log('[1] URL:', page.url());

// 로그인 페이지로 떨어지면 대기 (네이버 세션 자동 통과 또는 사용자 로그인, 최대 10분)
for (let i = 0; i < 120; i++) {
  if (page.url().startsWith('https://ads.naver.com/manage')) break;
  if (i === 0) console.log('[!] 로그인 대기 — 자동 통과 안 되면 열린 창에서 로그인해 주세요');
  if (page.url().includes('nid.naver.com')) await page.locator('#keep').check({ force: true }).catch(() => {});
  if (i === 3 && page.url().includes('nid.naver.com')) {
    // 네이버 세션이 있으면 로그인 버튼만 눌러도 통과되는 경우가 있음
    const btn = page.locator('.btn_login, #log\\.login').first();
    if (await btn.count() > 0) await btn.click().catch(() => {});
  }
  await page.waitForTimeout(5000);
}
console.log('[1b] 통과 후 URL:', page.url());
if (!page.url().startsWith('https://ads.naver.com/manage')) {
  await page.goto('https://ads.naver.com/manage/ad-accounts/1790170/dashboard', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(5000);
}

// 날짜 범위 버튼 클릭 (예: "2026.06.26.2026.07.02." 형태)
const dateBtn = page.locator('button', { hasText: /20\d\d\./ }).first();
if (await dateBtn.count() === 0) { console.error('[FAIL] 날짜 버튼 없음'); await page.screenshot({ path: OUT + '/searchad-step2-fail.png' }); await ctx.close(); process.exit(1); }
await dateBtn.click();
await page.waitForTimeout(2000);

// 팝업 내용 덤프
const popupDump = await page.evaluate(() => {
  const grab = (sel) => Array.from(document.querySelectorAll(sel))
    .map(e => (e.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 50))
    .filter(t => t);
  return { buttons: grab('button'), labels: grab('label, li, [role=option], [role=menuitem]').slice(0, 80) };
});
writeFileSync(OUT + '/searchad-step2-popup.json', JSON.stringify(popupDump, null, 2));
await page.screenshot({ path: OUT + '/searchad-step2-popup.png' });
console.log('[2] 날짜 팝업 덤프 저장');

// "지난 달"/"지난달" 프리셋 클릭 시도
let preset = null;
for (const t of ['지난 달', '지난달', '전월', '지난 월']) {
  const loc = page.locator(`text="${t}"`).first();
  if (await loc.count() > 0) { preset = t; await loc.click(); break; }
}
console.log('[3] 프리셋:', preset ?? '못 찾음');
await page.waitForTimeout(1500);

// 적용/확인 버튼
for (const t of ['적용', '확인', '조회']) {
  const btn = page.locator(`button:has-text("${t}")`).first();
  if (await btn.count() > 0 && await btn.isVisible().catch(() => false)) {
    await btn.click(); console.log(`[4] "${t}" 클릭`); break;
  }
}
await page.waitForTimeout(4000);
await page.screenshot({ path: OUT + '/searchad-step2-after-date.png' });

// 날짜 버튼 텍스트 재확인
const newDateText = await page.locator('button', { hasText: /20\d\d\./ }).first().textContent().catch(() => 'unknown');
console.log('[5] 설정된 기간:', (newDateText || '').trim());

// 다운로드 버튼 클릭
const dlBtn = page.locator('button:has-text("다운로드")').first();
if (await dlBtn.count() === 0) { console.error('[FAIL] 다운로드 버튼 없음'); await ctx.close(); process.exit(1); }
try {
  const [download] = await Promise.all([
    page.waitForEvent('download', { timeout: 60000 }),
    dlBtn.click(),
  ]);
  const fname = download.suggestedFilename();
  await download.saveAs(`${OUT}/${fname}`);
  console.log('[SAVED]', fname);
} catch (e) {
  // 다운로드 전 확인 팝업이 있을 수 있음 — 팝업 덤프 후 재시도
  console.log('[!] 다운로드 이벤트 미발생 — 팝업 확인 시도:', String(e).slice(0, 80));
  await page.screenshot({ path: OUT + '/searchad-step2-dlpopup.png' });
  const p2 = await page.evaluate(() => Array.from(document.querySelectorAll('button')).map(b => (b.textContent || '').trim()).filter(Boolean));
  console.log('현재 버튼들:', p2.join(' | ').slice(0, 400));
  for (const t of ['다운로드', '확인', '내려받기']) {
    const btn = page.locator(`[role=dialog] button:has-text("${t}"), .modal button:has-text("${t}")`).first();
    if (await btn.count() > 0) {
      const [download] = await Promise.all([
        page.waitForEvent('download', { timeout: 30000 }),
        btn.click(),
      ]).catch(() => [null]);
      if (download) {
        const fname = download.suggestedFilename();
        await download.saveAs(`${OUT}/${fname}`);
        console.log('[SAVED-2]', fname);
        break;
      }
    }
  }
}
console.log('[DONE]');
await ctx.close();
