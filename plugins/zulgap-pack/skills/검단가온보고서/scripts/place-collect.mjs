// 스마트플레이스 월간 통계 수집 (검단가온치과) — 4개 화면 텍스트 덤프
// 사용: node place-collect.mjs [출력폴더] [YYYY-MM]  (기본: 지난달)
// 로그인: .naver-mr-profile 영구 프로필 (네이버 SSO 자동)
import { createRequire } from 'module';
import { writeFileSync, mkdirSync } from 'fs';
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
mkdirSync(OUT, { recursive: true });

// 대상 월 계산 (기본: 지난달)
let ym = process.argv[3];
if (!ym) {
  const d = new Date(); d.setDate(1); d.setMonth(d.getMonth() - 1);
  ym = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}
const [Y, M] = ym.split('-').map(Number);
const lastDay = new Date(Y, M, 0).getDate();
const start = `${ym}-01`, end = `${ym}-${String(lastDay).padStart(2, '0')}`;
console.log(`[대상 월] ${start} ~ ${end}`);

const BASE = 'https://new.smartplace.naver.com/bizes/place/7708222/statistics?bookingBusinessId=786232';
const SCREENS = [
  ['reports',  `${BASE}&menu=reports&startDate=${start}&endDate=${end}&term=monthly`],
  ['inflow',   `${BASE}&menu=place&placeTab=inflow&startDate=${start}&endDate=${end}&term=monthly`],
  ['review',   `${BASE}&menu=review&startDate=${start}&endDate=${end}&term=monthly`],
  ['booking',  `${BASE}&menu=booking&startDate=${start}&endDate=${end}&term=monthly`],
];

const ctx = await chromium.launchPersistentContext(PROFILE, {
  headless: false, viewport: { width: 1500, height: 950 },
});
const page = ctx.pages()[0] ?? (await ctx.newPage());

// 첫 화면 접속 + 로그인 확인 (주의: 스마트플레이스는 비로그인에도 셸이 뜨므로 URL 아닌 본문으로 판정)
await page.goto(SCREENS[0][1], { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(5000);
const needLogin = async () => {
  const t = await page.evaluate(() => document.body.innerText).catch(() => '');
  return t.includes('로그인이 필요한') || !t.includes('검단가온치과');
};
if (await needLogin()) {
  console.log('[!] 로그인 필요 — 로그인 페이지로 이동 ("로그인 상태 유지" 자동 체크)');
  await page.goto('https://nid.naver.com/nidlogin.login?url=https%3A%2F%2Fnew.smartplace.naver.com%2F', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2000);
  // 세션 영속화 핵심: "로그인 상태 유지" 체크 → 다음 실행부터 무로그인
  await page.locator('#keep').check({ force: true }).catch(() => {});
  console.log('[!] 열린 창에서 로그인해 주세요 (최대 10분 대기)');
  await page.waitForURL((u) => !new URL(u).hostname.includes('nid.naver.com'), { timeout: 600000 });
  console.log('[OK] 로그인 감지');
  await page.goto(SCREENS[0][1], { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(5000);
  if (await needLogin()) { console.error('[FAIL] 로그인 후에도 접근 불가'); await ctx.close(); process.exit(1); }
}

for (const [name, url] of SCREENS) {
  await page.goto(url, { waitUntil: 'domcontentloaded' });
  // 데이터 로딩 대기: '데이터가 없습니다' 문구가 사라지거나 8초 경과까지 폴링
  let text = '';
  for (let i = 0; i < 8; i++) {
    await page.waitForTimeout(2000);
    text = await page.evaluate(() => document.body.innerText);
    if (!text.includes('조회 기간에 수집된 데이터가 없습니다') && text.length > 1500) break;
  }
  writeFileSync(`${OUT}/place-${name}-${ym}.txt`, text, 'utf-8');
  console.log(`[SAVED] place-${name}-${ym}.txt (${text.length} chars)`);
}

console.log('[DONE] 4개 화면 저장 →', OUT);
await ctx.close();
