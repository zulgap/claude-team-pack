#!/usr/bin/env node
/**
 * 네이버 블로그 전용 크롬 세션 — 열기 · 붙기 · 로그인 확인
 *
 * @AI:INTENT 팀원 각자 PC에서 「자기가 맡은 동료사」 크롬만 띄운다.
 *   평소 쓰는 크롬은 건드리지 않는다(--user-data-dir 분리).
 * @AI:CONSTRAINT 이 파일은 «열고 붙는» 것까지만 한다.
 *   글을 쓰거나 등록 버튼을 누르지 않는다 — 등록은 사람이 누른다(설계 불가침).
 *
 * 사용:
 *   node chrome-session.js open <프로필키>     크롬 실행 + 연결 확인
 *   node chrome-session.js status <프로필키>   로그인·연결 상태만
 *   node chrome-session.js release <프로필키>  락 해제(창을 닫은 뒤)
 */

const fs = require('fs');
const path = require('path');
const net = require('net');
const os = require('os');
const { execFileSync, spawn } = require('child_process');

const SKILL_DIR = path.resolve(__dirname, '..');

// 🔴 크롬 프로필(=로그인)은 «스킬 폴더 밖»에 둔다 (2026-08-20)
// @AI:INTENT 스킬 폴더는 `~/.claude/plugins/cache/<팩>/<커밋해시>/…` 안이라,
//   팀팩이 갱신될 때마다 «해시가 바뀐 새 폴더»로 통째로 내려온다. 프로필을 그 안에 두면
//   갱신 = 로그아웃이다. 담당자는 이유를 모른 채 며칠에 한 번씩 다시 로그인하게 된다.
// @AI:CONSTRAINT `~/.claude/zulgap/` 아래를 쓴다 — 채널 설정이 이미 사는 자리이고
//   갱신이 건드리지 않는다(channels/README 와 같은 이유). 새 인프라가 아니다.
// @AI:CONSTRAINT 옛 자리(.profiles)가 남아 있으면 «그것을 계속 쓴다» — 로그인해 둔 것을
//   버리지 않기 위해서다. 옮기는 것은 사람이 정할 일이고, 도구가 말없이 지우면 안 된다.
const HOME_PROFILES = path.join(os.homedir(), '.claude', 'zulgap', 'naver-profiles');
const LEGACY_PROFILES = path.join(SKILL_DIR, '.profiles');
const PROFILES_DIR = fs.existsSync(LEGACY_PROFILES) ? LEGACY_PROFILES : HOME_PROFILES;
const PORT_BASE = 9222;
const PORT_MAX = 9260;

// ─────────────────────────────────────────────────────────────
// 1. 크롬 실행 파일 — OS별 후보 배열
//    @AI:CONSTRAINT 단독 절대경로 금지. 하나도 없으면 «안내와 함께» 실패한다.
//    (조용히 넘어가면 팀원은 왜 안 되는지 모른다)
// ─────────────────────────────────────────────────────────────
function chromeCandidates() {
  const LOCAL = process.env.LOCALAPPDATA || '';
  const PF = process.env['ProgramFiles'] || 'C:/Program Files';
  const PF86 = process.env['ProgramFiles(x86)'] || 'C:/Program Files (x86)';
  return [
    // Windows
    path.join(PF, 'Google/Chrome/Application/chrome.exe'),
    path.join(PF86, 'Google/Chrome/Application/chrome.exe'),
    LOCAL && path.join(LOCAL, 'Google/Chrome/Application/chrome.exe'),
    // macOS
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    `${os.homedir()}/Applications/Google Chrome.app/Contents/MacOS/Google Chrome`,
    // Linux
    '/usr/bin/google-chrome',
    '/usr/bin/google-chrome-stable',
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
  ].filter(Boolean);
}

function resolveChromePath() {
  if (process.env.NAVER_TYPING_CHROME) {
    const p = process.env.NAVER_TYPING_CHROME;
    if (fs.existsSync(p)) return p;
    throw new Error(`NAVER_TYPING_CHROME 이 가리키는 파일이 없습니다: ${p}`);
  }
  const found = chromeCandidates().find((p) => { try { return fs.existsSync(p); } catch { return false; } });
  if (found) return found;
  throw new Error(
    '크롬을 찾지 못했습니다. 아래 중 한 곳에 설치돼 있어야 합니다:\n' +
    chromeCandidates().map((p) => `  · ${p}`).join('\n') +
    '\n다른 곳에 있으면 환경변수로 알려주세요:  NAVER_TYPING_CHROME=<경로>'
  );
}

// ─────────────────────────────────────────────────────────────
// 2. 프로세스 생존 확인 — PID «재사용» 방어
//    @AI:FRAGILE PID만 보면 안 된다. 죽은 크롬의 PID를 다른 프로그램이 물려받으면
//    「살아 있다」로 오판해 프로필이 영구히 잠긴다. 실행 경로까지 대조한다.
// ─────────────────────────────────────────────────────────────
function processInfo(pid) {
  if (!pid || !Number.isInteger(pid)) return null;
  try {
    if (process.platform === 'win32') {
      const out = execFileSync('powershell', ['-NoProfile', '-Command',
        `$p=Get-Process -Id ${pid} -ErrorAction SilentlyContinue; ` +
        `if($p){ "$($p.Path)|$($p.StartTime.ToString('o'))" }`,
      ], { encoding: 'utf8', timeout: 10000 }).trim();
      if (!out) return null;
      const [execPath, startedAt] = out.split('|');
      return { execPath: (execPath || '').replace(/\\/g, '/'), startedAt };
    }
    const out = execFileSync('ps', ['-p', String(pid), '-o', 'comm=,lstart='], {
      encoding: 'utf8', timeout: 10000,
    }).trim();
    if (!out) return null;
    return { execPath: out.split(/\s+/)[0], startedAt: out.slice(out.indexOf(' ') + 1).trim() };
  } catch {
    return null; // 프로세스 없음
  }
}

function isOurChromeAlive(owner) {
  const info = processInfo(owner.pid);
  if (!info) return false;
  const looksLikeChrome = /chrome|chromium/i.test(info.execPath || '');
  if (!looksLikeChrome) return false;                       // PID 재사용 — 남의 프로세스
  if (owner.started_at && info.startedAt &&
      owner.started_at !== info.startedAt) return false;    // 같은 PID, 다른 실행
  return true;
}

// ─────────────────────────────────────────────────────────────
// 3. 프로필 락 — 원자적 생성
//    @AI:CONSTRAINT 'wx' 를 쓴다. exists() 검사 후 write 는 레이스다 —
//    거의 동시에 두 번 띄우면 둘 다 「비어 있음」을 보고 둘 다 선점한다.
// ─────────────────────────────────────────────────────────────
function ownerPath(key) { return path.join(PROFILES_DIR, key, '.owner.json'); }

function readOwner(key) {
  try { return JSON.parse(fs.readFileSync(ownerPath(key), 'utf8')); } catch { return null; }
}

function acquireLock(key, payload) {
  const dir = path.join(PROFILES_DIR, key);
  fs.mkdirSync(dir, { recursive: true });
  const p = ownerPath(key);
  try {
    const fd = fs.openSync(p, 'wx');                  // ← 원자적. 이미 있으면 EEXIST
    fs.writeSync(fd, JSON.stringify(payload, null, 2));
    fs.closeSync(fd);
    return { ok: true };
  } catch (e) {
    if (e.code !== 'EEXIST') throw e;
    const prev = readOwner(key);
    if (prev && isOurChromeAlive(prev)) {
      return { ok: false, reason: 'alive', owner: prev };  // 진짜로 쓰는 중
    }
    // 죽은 락 — 회수 후 재시도 1회
    try { fs.unlinkSync(p); } catch {}
    try {
      const fd = fs.openSync(p, 'wx');
      fs.writeSync(fd, JSON.stringify(payload, null, 2));
      fs.closeSync(fd);
      return { ok: true, recovered: true };
    } catch (e2) {
      if (e2.code === 'EEXIST') return { ok: false, reason: 'race', owner: readOwner(key) };
      throw e2;
    }
  }
}

function releaseLock(key) {
  try { fs.unlinkSync(ownerPath(key)); return true; } catch { return false; }
}

// ─────────────────────────────────────────────────────────────
// 4. 포트 — 실제로 bind 해서 선점
//    @AI:FRAGILE 「빈 포트를 찾아 기록」은 탐색과 사용 사이에 남이 가져간다.
//    bind 한 소켓을 들고 있다가 크롬 실행 직전에 놓는다.
// ─────────────────────────────────────────────────────────────
function reservePort(from = PORT_BASE, to = PORT_MAX) {
  return new Promise((resolve, reject) => {
    let port = from;
    const tryOne = () => {
      if (port > to) return reject(new Error(`빈 포트가 없습니다 (${from}~${to})`));
      const srv = net.createServer();
      srv.once('error', () => { port += 1; tryOne(); });
      srv.once('listening', () => resolve({ port, release: () => new Promise((r) => srv.close(r)) }));
      srv.listen(port, '127.0.0.1');
    };
    tryOne();
  });
}

async function cdpAlive(port, ms = 1500) {
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), ms);
    const res = await fetch(`http://127.0.0.1:${port}/json/version`, { signal: ctrl.signal });
    clearTimeout(t);
    return res.ok;
  } catch { return false; }
}

// ─────────────────────────────────────────────────────────────
// 5. 열기
// ─────────────────────────────────────────────────────────────
async function open(key, startUrl) {
  const prev = readOwner(key);
  if (prev && isOurChromeAlive(prev) && await cdpAlive(prev.port)) {
    return { reused: true, port: prev.port, profile: path.join(PROFILES_DIR, key) };
  }

  const chrome = resolveChromePath();
  const reserved = await reservePort();
  const profileDir = path.join(PROFILES_DIR, key);
  fs.mkdirSync(profileDir, { recursive: true });

  const lock = acquireLock(key, {
    pid: null, port: reserved.port, host: os.hostname(),
    user: os.userInfo().username, started_at: null, claimed_at: new Date().toISOString(),
  });
  if (!lock.ok && lock.reason === 'alive') {
    await reserved.release();
    const e = new Error(
      `프로필 "${key}" 를 이미 다른 창이 쓰고 있습니다 ` +
      `(PID ${lock.owner.pid} · ${lock.owner.user}@${lock.owner.host}).\n` +
      `그 창을 쓰시거나, 닫으신 뒤 다시 실행하세요.`
    );
    e.code = 'PROFILE_BUSY';
    throw e;
  }

  await reserved.release();   // 크롬에게 넘긴다

  const args = [
    `--remote-debugging-port=${reserved.port}`,
    `--user-data-dir=${profileDir}`,
    '--no-first-run',
    '--no-default-browser-check',
  ];
  if (startUrl) args.push(startUrl);

  const child = spawn(chrome, args, { detached: true, stdio: 'ignore' });
  child.unref();

  // CDP 가 뜰 때까지 대기 (최대 20초)
  const deadline = Date.now() + 20000;
  while (Date.now() < deadline) {
    if (await cdpAlive(reserved.port)) break;
    await new Promise((r) => setTimeout(r, 400));
  }
  if (!await cdpAlive(reserved.port)) {
    releaseLock(key);
    throw new Error(`크롬은 실행했지만 연결 포트(${reserved.port})가 열리지 않았습니다.`);
  }

  // 실제 크롬 PID 로 락 갱신 (spawn PID 가 런처면 실제와 다를 수 있어 생존 정보를 다시 읽는다)
  const info = processInfo(child.pid);
  fs.writeFileSync(ownerPath(key), JSON.stringify({
    pid: child.pid, port: reserved.port, host: os.hostname(), user: os.userInfo().username,
    started_at: info ? info.startedAt : null, claimed_at: new Date().toISOString(),
  }, null, 2));

  return { reused: false, port: reserved.port, profile: profileDir, recovered: !!lock.recovered };
}

// ─────────────────────────────────────────────────────────────
// 6. 붙기 + 로그인 확인
//    playwright-core 는 스킬 폴더에 설치한다 (--prefix 명시 — 상위로 새면
//    남의 프로젝트에 설치되고 require 가 실패한다)
// ─────────────────────────────────────────────────────────────
function requirePlaywright() {
  try { return require('playwright-core'); } catch {
    throw new Error(
      'playwright-core 가 없습니다. 스킬 폴더에 설치해 주세요:\n' +
      `  npm install playwright-core --prefix "${SKILL_DIR}"`
    );
  }
}

async function status(key) {
  const owner = readOwner(key);
  if (!owner) return { open: false, reason: '아직 연 적이 없습니다' };
  if (!isOurChromeAlive(owner)) return { open: false, reason: '창이 닫혀 있습니다', stale_lock: true };
  if (!await cdpAlive(owner.port)) return { open: false, reason: '연결 포트가 응답하지 않습니다', port: owner.port };

  const { chromium } = requirePlaywright();
  // @AI:FRAGILE connectOverCDP 연결은 이벤트 루프를 잡는다. 이 함수를 CLI 에서 쓰면
  //   결과를 찍고도 프로세스가 안 죽어 「매달린 것」처럼 보인다(2026-08-15 실측 — 실제로는
  //   1.1초에 끝나 있었다). 그래서 CLI 는 마지막에 반드시 process.exit 로 끊는다.
  //   browser.close() 를 쓰면 «사람이 보고 있는 크롬 창»이 닫히므로 절대 쓰지 않는다.
  const browser = await chromium.connectOverCDP(`http://127.0.0.1:${owner.port}`, { timeout: 15000 });
  const ctx = browser.contexts()[0];
  if (!ctx) return { open: true, port: owner.port, logged_in: false, tabs: [], reason: '탭이 없습니다' };
  const cookies = await ctx.cookies();
  const names = new Set(cookies.map((c) => c.name));
  const loggedIn = names.has('NID_AUT') && names.has('NID_SES');
  const tabs = ctx.pages().map((p) => p.url());
  return { open: true, port: owner.port, logged_in: loggedIn, tabs, cookie_count: cookies.length };
}

// ─────────────────────────────────────────────────────────────
// CLI
// ─────────────────────────────────────────────────────────────
async function main() {
  const [cmd, key, ...rest] = process.argv.slice(2);
  if (!cmd || !key) {
    console.log('사용:\n  node chrome-session.js open <프로필키> [시작URL]\n' +
                '  node chrome-session.js status <프로필키>\n' +
                '  node chrome-session.js release <프로필키>');
    process.exit(2);
  }
  if (!/^[a-z0-9_-]{1,32}$/.test(key)) {
    console.error('프로필키는 영문 소문자·숫자·-·_ 만 (예: rpg)');
    process.exit(2);
  }

  if (cmd === 'open') {
    const r = await open(key, rest[0]);
    console.log(JSON.stringify({ ...r, hint: r.reused ? '이미 열린 창을 재사용했습니다' : '새 창을 열었습니다' }, null, 2));
  } else if (cmd === 'status') {
    console.log(JSON.stringify(await status(key), null, 2));
  } else if (cmd === 'release') {
    console.log(JSON.stringify({ released: releaseLock(key) }, null, 2));
  } else {
    console.error(`모르는 명령: ${cmd}`);
    process.exit(2);
  }
  // @AI:CONSTRAINT 반드시 명시 종료. 크롬에 붙은 CDP 연결이 이벤트 루프를 잡고 있어
  //   이 줄이 없으면 결과를 찍고도 프로세스가 안 끝난다(= 매달린 것처럼 보인다).
  process.exit(0);
}

if (require.main === module) {
  main().catch((e) => {
    console.error(e.code === 'PROFILE_BUSY' ? e.message : `실패: ${e.message}`);
    process.exit(1);
  });
}

module.exports = { resolveChromePath, chromeCandidates, acquireLock, releaseLock, readOwner,
                   isOurChromeAlive, processInfo, reservePort, cdpAlive, open, status,
                   PROFILES_DIR, HOME_PROFILES, LEGACY_PROFILES };
