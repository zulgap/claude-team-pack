// 네이버 블로그 지표 다운로드 자동화 (검단가온 gdgodental)
// - 영구 프로필: 최초 1회 로그인하면 이후 매월 무인 실행 가능
// - iframe 내부(지표 다운로드 폼)는 Playwright라서 제어 가능 (browsermcp 불가 영역)
import { createRequire } from 'module';
import { mkdirSync } from 'fs';
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
const OUT_DIR = process.argv[2] || homedir() + '/Downloads/gaon-report-out';
const BLOG_ID = 'gdgodental';
const METRICS = ['조회수', '순방문자수', '평균 사용 시간', '유입분석'];

mkdirSync(OUT_DIR, { recursive: true });

const ctx = await chromium.launchPersistentContext(PROFILE, {
  headless: false,
  viewport: { width: 1400, height: 900 },
  acceptDownloads: true,
});
const page = ctx.pages()[0] ?? (await ctx.newPage());

console.log('[1] 다운로드 페이지 접속...');
await page.goto(`https://admin.blog.naver.com/${BLOG_ID}/stat/download`, { waitUntil: 'domcontentloaded' });

// 로그인 필요 시 사용자가 창에서 직접 로그인할 때까지 대기 (최대 10분)
// 주의: 로그인 페이지 URL의 리다이렉트 파라미터에 admin.blog.naver.com이 들어있으므로 hostname으로 판정
if (new URL(page.url()).hostname.includes('nid.naver.com')) {
  console.log('[!] 로그인 필요 — 열린 브라우저 창에서 네이버 로그인해 주세요 (최대 10분 대기)');
  await page.locator('#keep').check({ force: true }).catch(() => {});
  await page.waitForURL((u) => new URL(u).hostname === 'admin.blog.naver.com', { timeout: 600000 });
  console.log('[OK] 로그인 감지');
  await page.waitForTimeout(2000);
  await page.goto(`https://admin.blog.naver.com/${BLOG_ID}/stat/download`, { waitUntil: 'domcontentloaded' });
}

// 통계 iframe 찾기: '데이터 종류' 텍스트를 가진 프레임
console.log('[2] 통계 iframe 탐색...');
let frame = null;
for (let i = 0; i < 60 && !frame; i++) {
  for (const f of page.frames()) {
    try {
      if ((await f.locator('text=데이터 종류').count()) > 0) { frame = f; break; }
    } catch {}
  }
  if (!frame) await page.waitForTimeout(1000);
}
if (!frame) {
  console.error('[FAIL] 지표 다운로드 iframe을 찾지 못함 — 스크린샷 저장');
  await page.screenshot({ path: OUT_DIR + '/fail.png', fullPage: true });
  await ctx.close();
  process.exit(1);
}
console.log('[OK] iframe URL:', frame.url().slice(0, 100));

async function selectRadio(name) {
  const radio = frame.getByRole('radio', { name, exact: true });
  try {
    await radio.check({ timeout: 5000 });
  } catch {
    // 시각적으로 숨긴 라디오면 라벨/텍스트 클릭
    await frame.locator(`li:has(input[type=radio]) >> text="${name}"`).first().click({ timeout: 5000 });
  }
}

for (const metric of METRICS) {
  console.log(`[3] ${metric} 선택...`);
  await selectRadio(metric);
  await frame.getByRole('menuitemradio', { name: '월간' }).click().catch(() => {});
  await page.waitForTimeout(500);

  const [download] = await Promise.all([
    page.waitForEvent('download', { timeout: 30000 }),
    frame.getByRole('link', { name: '지표 다운로드' }).click(),
  ]);
  const fname = download.suggestedFilename();
  await download.saveAs(`${OUT_DIR}/${fname}`);
  console.log(`[SAVED] ${fname}`);
  await page.waitForTimeout(800);
}

console.log('[DONE] 4개 파일 저장 완료 →', OUT_DIR);
await ctx.close();
