#!/usr/bin/env node
// claude-team-pack/hooks/hook-doctor-v2.js
// @AI:INTENT 플러그인 3분리 전환 자가치유 — 기존 직원 PC의 enabledPlugins를 구 단일 플러그인(zulgap)에서
//   신 3플러그인(jedi-core/zulgap-pack/dev-pack)으로 재설치 없이 전환한다 (v1 = 훅 등록, v2 = 플러그인 전환).
//   role 판정은 team-guide-fetch.js와 동일 (토큰 JWT claim > role 파일 > staff) — dev/master만 dev-pack 활성.
// @AI:CONSTRAINT 멱등 + fail-safe — 어떤 실패도 조용히 exit 0 (직원 세션 절대 차단 X).
//   settings.json은 백업(.bak-hookdoctor2) 후 단일 write. 전환 실패 PC는 구 플러그인 그대로 = 스킬 계속 작동
//   (구 zulgap manifest가 신 skills 경로를 가리키는 병존 설계 — .claude-plugin/plugin.json skills 필드).
// @AI:DEPENDS role 매핑은 hooks/team-guide-fetch.js roleFromToken()과 동기 필수 (admin|master→master / dev|developer|engineer→dev / 그외→staff).

const fs = require('fs');
const path = require('path');
const os = require('os');
const { execFileSync } = require('child_process');

const ZULGAP_DIR = path.join(os.homedir(), '.claude', 'zulgap');
const SETTINGS = path.join(os.homedir(), '.claude', 'settings.json');
const INSTALLED = path.join(os.homedir(), '.claude', 'plugins', 'installed_plugins.json');
const FLAG = path.join(ZULGAP_DIR, '.hook-doctor-v2.done');
const MP = 'zulgap-team-pack';
const JURL = 'https://judgmentos-unified-agent-production.up.railway.app';
const PACKS_CACHE = path.join(ZULGAP_DIR, '.teampack-packs.json');
const PACKS_CACHE_MS = 24 * 60 * 60 * 1000;
const REFRESH_STAMP = path.join(ZULGAP_DIR, '.plugin-refresh.stamp');
const REFRESH_EVERY_MS = 24 * 60 * 60 * 1000;
// @AI:CONSTRAINT 갱신 예산은 아래 워치독(210s)보다 작아야 한다 — marketplace 60s + plugin 40s×3 = 180s.
//   숫자를 올릴 땐 워치독도 같이 올릴 것(안 올리면 마지막 팩이 조용히 잘린다).
const REFRESH_MP_TIMEOUT = 60000;
const REFRESH_PLUGIN_TIMEOUT = 40000;

// @AI:CONSTRAINT 실물 설치(clone)가 포함되므로 8초로는 부족 — 개별 install 60초 × 최대 3개 + 여유.
setTimeout(() => { try { console.log('[hook-doctor-v2] timeout — skip'); } catch (_) {} process.exit(0); }, 210000);

// @AI:CONSTRAINT Claude Code 플러그인은 대장이 둘이고 서로를 안 채운다 —
//   ① 활성화 = settings.json enabledPlugins / ② 설치 = installed_plugins.json + plugins/cache/
//   enabledPlugins에 true만 쓰면 '조용히 무시'되고 스킬이 안 뜬다 (2026-07-21 사장님 PC 실사고).
function isInstalled(key) {
  try {
    const j = JSON.parse(fs.readFileSync(INSTALLED, 'utf8'));
    const arr = j && j.plugins && j.plugins[key];
    return Array.isArray(arr) && arr.length > 0;
  } catch (_) { return false; }
}

// @AI:DEPENDS Claude Code 플러그인 설치가 SSH로 붙는 버그(#47088) — 키 없는 PC는 Permission denied로 실패.
//   install.ps1 §3.5 / install.sh와 동일한 멱등 재작성. 이미 HTTPS인 remote엔 영향 0.
function ensureGitHttps() {
  try { execFileSync('git', ['config', '--global', '--unset-all', 'url.https://github.com/.insteadOf'], { stdio: 'ignore', timeout: 10000 }); } catch (_) {}
  for (const from of ['git@github.com:', 'ssh://git@github.com/']) {
    try { execFileSync('git', ['config', '--global', '--add', 'url.https://github.com/.insteadOf', from], { stdio: 'ignore', timeout: 10000 }); } catch (_) {}
  }
}

function claudeBin() {
  const local = path.join(os.homedir(), '.local', 'bin', process.platform === 'win32' ? 'claude.exe' : 'claude');
  try { if (fs.existsSync(local)) return local; } catch (_) {}
  return 'claude';
}

function installPlugin(key) {
  try {
    execFileSync(claudeBin(), ['plugin', 'install', key, '--scope', 'user'], { stdio: 'ignore', timeout: 60000 });
    return true;
  } catch (_) { return false; }
}

// @AI:INTENT 전환이 끝나도 '갱신'은 계속 필요하다. 서드파티 마켓플레이스는 Claude Code 자동 갱신 대상이
//   아니다 — 2026-07-26 실측: known_marketplaces.json lastUpdated가 내장 claude-plugins-official만 계속
//   갱신되고 서드파티 3개(zulgap-team-pack 7/19 · superpowers 7/22 · openai-codex 7/22)는 전부 정지.
//   아무도 update를 안 부르면 팀원 PC는 설치 시점 sha에 영구히 묶인다(사장님 PC가 7/21 f6dca84로 고정돼
//   스킬 ASCII 리네임 #44가 5일간 미도달 — install/enabled 2장부는 그동안 계속 PASS였다).
// @AI:CONSTRAINT 버전 비교로 판정하지 않는다 — 원격 sha를 알려면 marketplace update가 선행돼야 하는
//   닭-달걀이다. 그래서 throttle된 주기로 update를 무조건 때린다. 이미 최신이면 no-op이라 안전.
// @AI:FRAGILE 스탬프를 update '앞에' 찍는다 — 네트워크 실패 시 매 세션 재시도하면 직원 세션 시작이
//   매번 최대 180s 느려진다. 실패해도 스킬은 계속 작동하므로 다음 창(24h)에 다시 시도하는 편이 낫다.
function maybeRefresh(keys) {
  try {
    if (Date.now() - fs.statSync(REFRESH_STAMP).mtimeMs < REFRESH_EVERY_MS) return false;
  } catch (_) { /* 스탬프 없음 = 첫 실행 → 진행 */ }
  try { fs.mkdirSync(ZULGAP_DIR, { recursive: true }); fs.writeFileSync(REFRESH_STAMP, new Date().toISOString()); } catch (_) {}
  ensureGitHttps();
  // 카탈로그 먼저 — 이게 낡으면 새 sha를 '볼 수조차' 없어서 plugin update가 no-op이 된다.
  try { execFileSync(claudeBin(), ['plugin', 'marketplace', 'update', MP], { stdio: 'ignore', timeout: REFRESH_MP_TIMEOUT }); } catch (_) {}
  for (const k of keys) {
    try { execFileSync(claudeBin(), ['plugin', 'update', k], { stdio: 'ignore', timeout: REFRESH_PLUGIN_TIMEOUT }); } catch (_) {}
  }
  return true;
}

function done(msg) {
  try { fs.mkdirSync(ZULGAP_DIR, { recursive: true }); fs.writeFileSync(FLAG, new Date().toISOString()); } catch (_) {}
  console.log('[hook-doctor-v2] ' + msg);
  process.exit(0);
}

function b64urlJson(seg) {
  return JSON.parse(Buffer.from(String(seg).replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8'));
}

function rawTokenFromConfigs() {
  const candidates = [path.join(os.homedir(), '.claude.json')];
  if (process.env.APPDATA) candidates.push(path.join(process.env.APPDATA, 'Claude', 'claude_desktop_config.json'));
  candidates.push(path.join(os.homedir(), 'Library', 'Application Support', 'Claude', 'claude_desktop_config.json'));
  for (const f of candidates) {
    try {
      const j = JSON.parse(fs.readFileSync(f, 'utf8'));
      const t = j && j.mcpServers && j.mcpServers.jedi && j.mcpServers.jedi.env && j.mcpServers.jedi.env.JUDGMENTOS_TOKEN;
      if (t) return String(t);
    } catch (_) { /* 다음 후보 */ }
  }
  return '';
}

function roleFromToken() {
  const t = rawTokenFromConfigs();
  if (!t) return '';
  try {
    const r = String((b64urlJson(t.split('.')[1]) || {}).role || '').toLowerCase();
    if (!r) return '';
    if (r === 'admin' || r === 'master') return 'master';
    if (r === 'dev' || r === 'developer' || r === 'engineer') return 'dev';
    return 'staff';
  } catch (_) { return ''; }
}

// @AI:INTENT tenant-only 팩(zulgap-pack)의 활성화 판정 — packaging-spec §5 "그 회사에만 활성화" 이행.
//   판정축 = GET /mcp/ext/teampack-config 의 packs 배열(토큰 tenant 기준, spec §1이 처방한 통로).
//   줄갭 카드 = ['core','zulgap','dev'] (Migration 437). 'zulgap' 포함 → zulgap-pack 활성.
// @AI:CONSTRAINT 🔴 confident 원칙 (dev-pack과 동일 클래스) — 판정이 확실할 때만 끈다.
//   토큰 없음·네트워크 실패·404(카드 미등록)·curl 부재 = 전부 '판정 불가' → 현상 유지.
//   404를 exclude로 접으면 줄갭 카드 행이 실수로 지워진 날 전 팀원이 스킬을 잃는다('스킬 0개' 클래스).
//   고객사는 온보딩(카드 등록 → 토큰 발급) 순서라 토큰이 있으면 카드도 있다 — 그때만 confident.
// @AI:FRAGILE 24h 캐시 — 매 세션 네트워크 콜을 피한다(직원 세션 시작 지연 방지, maybeRefresh와 같은 설계).
function tenantPacksWithConfidence() {
  const token = rawTokenFromConfigs();
  if (!token) return { packs: null, confident: false };
  try {
    const c = JSON.parse(fs.readFileSync(PACKS_CACHE, 'utf8'));
    if (Date.now() - c.ts < PACKS_CACHE_MS && Array.isArray(c.packs)) return { packs: c.packs, confident: true };
  } catch (_) { /* 캐시 없음/만료 → 라이브 조회 */ }
  try {
    // curl 사용 — Windows 10 1803+/macOS 기본 탑재. 없으면 catch → 판정 불가(현상 유지).
    const out = execFileSync('curl', ['-fsS', '--max-time', '8',
      '-H', 'Authorization: Bearer ' + token, JURL + '/mcp/ext/teampack-config'],
      { encoding: 'utf8', timeout: 12000 });
    const j = JSON.parse(out);
    const packs = j && j.success && j.data && Array.isArray(j.data.packs) ? j.data.packs : null;
    if (!packs) return { packs: null, confident: false };
    try { fs.mkdirSync(ZULGAP_DIR, { recursive: true }); fs.writeFileSync(PACKS_CACHE, JSON.stringify({ ts: Date.now(), packs })); } catch (_) {}
    return { packs, confident: true };
  } catch (_) { return { packs: null, confident: false }; }
}

// @AI:CONSTRAINT 🔴 'staff로 확인됨'과 '몰라서 staff'를 반드시 구분한다.
//   dev-pack을 끄는 판단이 여기 달려 있는데, 둘을 같은 값으로 뭉개면 토큰·role 파일을 못 읽은
//   개발자 PC가 staff로 오판돼 자기 스킬을 잃는다(2026-07-21 '스킬 0개' 사고와 같은 클래스).
//   confident=false면 **아무것도 끄지 않는다** — 현상 유지가 항상 안전한 쪽이다.
function resolveRoleWithConfidence() {
  const fromToken = roleFromToken();
  if (fromToken) return { role: fromToken, confident: true };
  try {
    const r = fs.readFileSync(path.join(ZULGAP_DIR, 'role'), 'utf8').trim();
    if (r === 'dev' || r === 'master' || r === 'staff') return { role: r, confident: true };
  } catch (_) { /* 파일 없음 = 판정 불가 (구버전 설치 PC) */ }
  return { role: 'staff', confident: false };
}

let s;
try { s = JSON.parse(fs.readFileSync(SETTINGS, 'utf8')); } catch (e) {
  // settings.json 없음/파손 — 전환 불가. 플래그를 쓰지 않아 다음 세션 재시도 (구 플러그인 그대로 = fail-safe).
  console.log('[hook-doctor-v2] settings.json 읽기 실패 — skip (다음 세션 재시도)');
  process.exit(0);
}
if (!s || typeof s !== 'object') { console.log('[hook-doctor-v2] settings 형식 이상 — skip'); process.exit(0); }
if (!s.enabledPlugins || typeof s.enabledPlugins !== 'object') s.enabledPlugins = {};

const ep = s.enabledPlugins;
const { role, confident } = resolveRoleWithConfidence();
const want = { ['jedi-core@' + MP]: true };
const DEV_KEY = 'dev-pack@' + MP;
const ZP_KEY = 'zulgap-pack@' + MP;
if (role === 'dev' || role === 'master') want[DEV_KEY] = true;
// tenant-only 팩: packs 판정이 확실히 '아님'일 때만 제외 — 판정 불가면 현상 유지(활성)
const { packs, confident: packsConfident } = tenantPacksWithConfidence();
const shouldDisableZulgap = packsConfident && !packs.includes('zulgap');
if (!shouldDisableZulgap) want[ZP_KEY] = true;
let zpFlipped = false;
if (shouldDisableZulgap && ep[ZP_KEY] !== false) { ep[ZP_KEY] = false; zpFlipped = true; }

// @AI:CONSTRAINT 🔴 dev-pack은 **명시적 false**를 써야 꺼진다 — 키를 안 쓰면 켜진다.
//   2026-07-29 실측(팀원 PC): enabledPlugins에 dev-pack 키가 **없는데도** start-dev/wrapup-dev가
//   로드돼 `/스킬` 목록에 떴고 실행까지 됐다. 마켓플레이스가 3팩을 통째로 설치하므로 실물은 늘 존재하고,
//   활성화 장부에 키가 없으면 Claude Code가 로드한다(opt-out). 우리는 opt-in인 줄 알고 `if(dev) = true`만
//   써서 staff PC에 키가 아예 생기지 않았다.
//   ⚠️ 이 전제 위에 `jedi-skills/SKILL.md:92`의 "목록이 곧 권한 — role 분기 코드 불필요"가 서 있다.
// @AI:FRAGILE confident일 때만 끈다. 판정 불가 PC는 손대지 않는다(위 resolveRoleWithConfidence 참조).
const shouldDisableDev = confident && role !== 'dev' && role !== 'master';
let devFlipped = false;
if (shouldDisableDev && ep[DEV_KEY] !== false) { ep[DEV_KEY] = false; devFlipped = true; }

const wantKeys = Object.keys(want);
// @AI:INTENT '전환 완료' 판정에 실물 설치까지 포함 — 활성화만 보면 미설치 상태를 완료로 오독해 영구히 스킬 0개가 된다.
const alreadyNew = wantKeys.every((k) => ep[k] === true && isInstalled(k)) && ep['zulgap@' + MP] !== true;
if (alreadyNew) {
  // @AI:FRAGILE 이 조기 return 뒤에 갱신 로직을 두면 영구 미도달이다 — isInstalled()는 '키가 있나'만 보고
  //   버전을 안 보므로, 전환이 성공한 순간 alreadyNew가 영구 true가 되어 뒤쪽이 한 번도 실행되지 않는다.
  //   갱신은 반드시 return '앞에' 있어야 한다.
  // @AI:INTENT dev-pack/zulgap-pack 비활성은 전환 완료 PC에도 필요하다(전환은 끝났는데 팩만 켜진 상태가 실재).
  //   그래서 이 조기 return 안에서도 저장한다 — 아래 전환 경로의 write에 의존하면 영구 미도달이다.
  if (devFlipped || zpFlipped) {
    try { fs.copyFileSync(SETTINGS, SETTINGS + '.bak-hookdoctor2'); } catch (_) { /* 백업 실패해도 진행 */ }
    try { fs.writeFileSync(SETTINGS, JSON.stringify(s, null, 2)); } catch (e) {
      console.log('[hook-doctor-v2] settings 쓰기 실패 — skip: ' + e.message);
      process.exit(0);
    }
  }
  const flips = [devFlipped && 'dev-pack 비활성화', zpFlipped && 'zulgap-pack 비활성화(타 테넌트)'].filter(Boolean);
  const refreshed = maybeRefresh(wantKeys);
  return done('이미 전환됨 — 정상 (변경 ' + (flips.length ? flips.join('+') + ' — 다음 재시작부터 적용' : '0')
    + ', role=' + role + (refreshed ? ', 갱신 확인' : '') + ')');
}

try { fs.copyFileSync(SETTINGS, SETTINGS + '.bak-hookdoctor2'); } catch (_) { /* 백업 실패해도 진행 — 원본은 단일 write */ }
for (const k of wantKeys) ep[k] = true;

// 신 플러그인 '실물' 설치 — 이게 성공해야만 구 플러그인을 끌 수 있다.
ensureGitHttps();
try { execFileSync(claudeBin(), ['plugin', 'marketplace', 'add', 'zulgap/claude-team-pack'], { stdio: 'ignore', timeout: 60000 }); } catch (_) {}
// @AI:INTENT add는 '이미 등록됨'이면 카탈로그를 새로 안 받는다 — 낡은 카탈로그로 install하면 구 sha가 박힌다.
try { execFileSync(claudeBin(), ['plugin', 'marketplace', 'update', MP], { stdio: 'ignore', timeout: REFRESH_MP_TIMEOUT }); } catch (_) {}
let installOk = true;
for (const k of wantKeys) {
  if (isInstalled(k)) continue;
  if (!installPlugin(k)) installOk = false;
}

// @AI:FRAGILE verify-then-flip — 이 조건을 없애면 설치 실패 PC에서 구·신이 동시에 죽는다(스킬 0개).
//   구 zulgap manifest의 skills 필드가 신 3경로를 가리키는 병존 설계라, 구가 켜져 있는 한 스킬은 계속 뜬다.
//   즉 '구를 끄는 행위' 자체가 유일한 비가역 지점 — 실물 설치 확인 전에는 절대 하지 않는다.
if (installOk) ep['zulgap@' + MP] = false; // 키 유지 = 전환 이력 가시화, 롤백 = true 1줄

try {
  fs.writeFileSync(SETTINGS, JSON.stringify(s, null, 2));
} catch (e) {
  console.log('[hook-doctor-v2] settings 쓰기 실패 — skip: ' + e.message);
  process.exit(0);
}

if (installOk) {
  done('플러그인 전환 완료 (' + wantKeys.map((k) => k.split('@')[0]).join('/') + ', role=' + role + ') — 다음 재시작부터 적용');
}
// @AI:INTENT 플래그를 쓰지 않고 종료 -> 다음 세션 재시도. 구 플러그인은 켜진 채라 스킬은 계속 작동(회귀 0).
console.log('[hook-doctor-v2] 실물 설치 미완 — 구 플러그인 유지(스킬 정상), 다음 세션 재시도');
process.exit(0);
