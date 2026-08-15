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
const MARKETPLACES = path.join(os.homedir(), '.claude', 'plugins', 'marketplaces');
const REFRESH_STAMP = path.join(ZULGAP_DIR, '.plugin-refresh.stamp');
const REFRESH_EVERY_MS = 24 * 60 * 60 * 1000;
// @AI:DEPENDS 실패 후 재시도 창. 24h를 그대로 쓰면 '한 번 실패 = 하루 침묵'이 되어 2026-08-04 사고가 재현된다
//   (실측: 12커밋 뒤처진 채 방치, 그 안에 팀원 신규 스킬 2종 포함). 1h = 세션을 몇 번 더 하면 자연 복구되는 간격.
const REFRESH_RETRY_MS = 60 * 60 * 1000;
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
// @AI:INTENT 원격 최신 sha. marketplace update '직후'에 부르면 이 클론이 곧 원격 최신이라 네트워크 콜 0회로
//   버전 대조가 된다 — 구 주석의 "닭-달걀이라 버전 비교 불가"는 update '전에' 비교하려 할 때만 성립했다.
function marketHeadSha() {
  try {
    return execFileSync('git', ['-C', path.join(MARKETPLACES, MP), 'rev-parse', 'HEAD'],
      { encoding: 'utf8', timeout: 10000 }).trim() || null;
  } catch (_) { return null; }
}

// @AI:DEPENDS installed_plugins.json[key]는 배열([{version,...}]) — 2026-08-04 실측 형태.
//   @AI:CONSTRAINT 판정축은 version이지 gitCommitSha가 아니다(후자는 update 후에도 안 바뀌는 죽은 필드,
//   그걸로 재면 갱신 성공을 '미반영'으로 오판한다 — memory reference_plugin_ledgers_clean_but_clone_stale).
function installedVersions(keys) {
  const out = {};
  try {
    const j = JSON.parse(fs.readFileSync(INSTALLED, 'utf8'));
    const plugins = j.plugins || j;
    for (const k of keys) {
      const e = plugins[k];
      const v = Array.isArray(e) ? e[0] : e;
      if (v && v.version) out[k] = String(v.version);
    }
  } catch (_) { /* 못 읽으면 빈 맵 = 검증 불가로 흘러간다 */ }
  return out;
}

function readRefreshState() {
  try {
    const raw = fs.readFileSync(REFRESH_STAMP, 'utf8').trim();
    // @AI:CONSTRAINT 구 포맷(ISO 문자열)은 '성공'으로 읽는다 — 실패로 읽으면 전 직원 PC가 첫 세션에
    //   일제히 경고를 띄운다(무해한 포맷 전환이 사고처럼 보이는 것을 막는다).
    if (!raw.startsWith('{')) return { ts: Date.parse(raw) || 0, ok: true, mismatch: [] };
    const j = JSON.parse(raw);
    return { ts: Date.parse(j.ts) || 0, ok: j.ok !== false, mismatch: Array.isArray(j.mismatch) ? j.mismatch : [] };
  } catch (_) { return null; }
}

function writeRefreshState(st) {
  try {
    fs.mkdirSync(ZULGAP_DIR, { recursive: true });
    fs.writeFileSync(REFRESH_STAMP, JSON.stringify({ ts: new Date().toISOString(), ...st }));
  } catch (_) {}
}

// @AI:INTENT 실패는 반드시 사람 눈에 닿아야 한다. 2026-08-04 사고의 본질은 "실패했다는 사실이
//   어디에도 남지 않아" 사장님·팀원 모두 며칠씩 구버전을 쓴 것이다. 성공 시엔 아무것도 출력하지 않는다
//   (소음이 게이트를 죽인다 — plugin-update-staleness.js와 같은 규약).
function warnRefreshFailure(st) {
  const lines = ['', '=== 🔌 팀팩 갱신 실패 — 구버전으로 동작 중일 수 있습니다 ==='];
  if (st.mismatch && st.mismatch.length) {
    lines.push('최신이 아닌 팩: ' + st.mismatch.join(', '));
    if (st.head) lines.push('최신 ' + st.head.slice(0, 12) + ' / 설치된 것이 이와 다릅니다.');
  } else if (st.err) {
    lines.push('갱신 명령 실패: ' + st.err);
  } else {
    lines.push('갱신 결과를 확인하지 못했습니다.');
  }
  lines.push('수동 복구 (순서대로):');
  lines.push('  claude plugin marketplace update ' + MP);
  for (const k of (st.keys || [])) lines.push('  claude plugin update ' + k);
  lines.push('  ※ 복구 후 Claude Code를 재시작해야 반영됩니다.');
  try { console.log(lines.join('\n')); } catch (_) {}
}

// @AI:CONSTRAINT throttle은 '직전 결과'로 갈린다 — 성공 24h / 실패 1h. 구현은 성공 전에 스탬프를 찍어
//   네트워크 실패 시 매 세션 180s 지연을 막던 설계였는데, 그 대가로 실패 사실이 소멸했다.
//   결과를 스탬프에 담으면 지연 방지와 실패 가시화가 양립한다(둘 중 하나를 포기하지 말 것).
// @AI:FRAGILE 검증은 update '뒤'에 온다 — 순서를 바꾸면 낡은 카탈로그와 비교해 항상 "최신"으로 오판한다.
function maybeRefresh(keys) {
  const prev = readRefreshState();
  if (prev) {
    const window = prev.ok ? REFRESH_EVERY_MS : REFRESH_RETRY_MS;
    if (Date.now() - prev.ts < window) {
      if (!prev.ok) warnRefreshFailure({ ...prev, keys });  // 창 안이어도 실패는 매 세션 알린다
      return false;
    }
  }
  // 시도 시각을 먼저 남긴다 — 이 프로세스가 중간에 죽어도 다음 세션이 무한 재시도하지 않게.
  writeRefreshState({ ok: false, mismatch: [], err: 'interrupted', keys });
  ensureGitHttps();

  let err = null;
  // 카탈로그 먼저 — 이게 낡으면 새 sha를 '볼 수조차' 없어서 plugin update가 no-op이 된다.
  try {
    execFileSync(claudeBin(), ['plugin', 'marketplace', 'update', MP], { stdio: 'ignore', timeout: REFRESH_MP_TIMEOUT });
  } catch (e) { err = 'marketplace update: ' + String((e && e.message) || e).slice(0, 120); }
  for (const k of keys) {
    try {
      execFileSync(claudeBin(), ['plugin', 'update', k], { stdio: 'ignore', timeout: REFRESH_PLUGIN_TIMEOUT });
    } catch (e) { err = err || (k + ': ' + String((e && e.message) || e).slice(0, 120)); }
  }

  // 결과 검증 — 명령이 0을 리턴해도 실제로 최신이 됐는지는 별개다(2026-08-04 사고의 무증상 실패 지점).
  const head = marketHeadSha();
  const inst = installedVersions(keys);
  let mismatch = [];
  let verified = false;
  if (head) {
    verified = true;
    mismatch = keys.filter((k) => !inst[k] || !head.startsWith(inst[k]));
  }
  const ok = !err && verified && mismatch.length === 0;
  writeRefreshState({ ok, mismatch, err, head, verified, keys });
  // @AI:INTENT 검증 자체를 못 했을 때(head 없음)는 실패로 떠들지 않는다 — 판정 불가를 사고로 오인하면
  //   경고가 상시화되고, 상시 경고는 아무도 안 읽는다. 대신 상태에 verified:false를 남겨 추적은 가능하게.
  if (!ok && (err || mismatch.length)) warnRefreshFailure({ mismatch, err, head, keys });
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

// @AI:INTENT 팩 활성화 판정은 **여기서 하지 않는다** — `resolve-packs.js`(3장부 공용 SSOT)에 위임한다.
//   2026-08-16 이전에는 install.ps1 / install.sh / 이 파일이 같은 규칙을 각자 구현했고, 카드 `packs: []`
//   하나로 **정반대 판정**이 났다(설치기 둘은 활성, 이 파일은 비활성). 언어마다 `[]` 의 진릿값이 달라서다.
//   증상은 「설치하면 켜지고 24시간 뒤 이 훅이 꺼버린다」였고 에러가 안 나 아무도 몰랐다.
// @AI:CONSTRAINT 🔴 판정 규칙(allow-list·confident·캐시)을 이 파일에 되살리지 말 것. 되살리는 순간 3벌이 된다.
//   새 팩이 생기면 고칠 곳은 `resolve-packs.js` **한 곳**이다.
// @AI:CONSTRAINT 🔴 스크립트가 없으면(옛 PC 첫 실행) **판정 불가로 떨어진다 = 아무것도 끄지 않는다.**
//   여기서 옛 인라인 로직으로 폴백하면 그게 곧 3벌이므로 폴백하지 않는다. 다음 세션에 파일이 도착한다
//   (team-guide-fetch 의 launchDoctor 가 이 파일보다 **먼저** 받도록 목록 선두에 있다).
function resolvePluginsViaSsot(role, roleConfident) {
  const rp = path.join(ZULGAP_DIR, 'resolve-packs.js');
  try {
    const out = execFileSync(process.execPath,
      [rp, '--role', role, '--role-confident', roleConfident ? '1' : '0'],
      { encoding: 'utf8', timeout: 20000 });
    const j = JSON.parse(out);
    if (j && j.plugins && j.canDisable) return j;
  } catch (_) { /* 파일 없음·실행 실패·파싱 실패 → 아래 현상 유지 */ }
  return null;
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
// @AI:INTENT 켤 것·끌 것을 SSOT 한 곳에서 받는다. 이 파일은 **판정하지 않고 적용만** 한다.
//   판정 불가(스크립트 부재·네트워크 실패 등)면 want 는 「지금 기준 켜져 있어야 할 것」으로만 채우고
//   끄는 행위는 **하나도 하지 않는다** — 현상 유지가 항상 안전한 쪽이다.
const rp = resolvePluginsViaSsot(role, confident);
const want = {};
const canDisable = (rp && rp.canDisable) || {};
if (rp) {
  for (const name of Object.keys(rp.plugins)) if (rp.plugins[name]) want[name + '@' + MP] = true;
} else {
  // 스크립트 미도달 — 공용 팩만 보장하고 나머지는 손대지 않는다(옛 PC 첫 실행 1회에 해당).
  want['jedi-core@' + MP] = true;
}
const flippedNames = [];
for (const name of Object.keys(canDisable)) {
  if (!canDisable[name]) continue;
  const key = name + '@' + MP;
  if (ep[key] !== false) { ep[key] = false; flippedNames.push(name); }
}
const anyFlipped = flippedNames.length > 0;

// @AI:CONSTRAINT 🔴 dev-pack은 **명시적 false**를 써야 꺼진다 — 키를 안 쓰면 켜진다.
//   2026-07-29 실측(팀원 PC): enabledPlugins에 dev-pack 키가 **없는데도** start-dev/wrapup-dev가
//   로드돼 `/스킬` 목록에 떴고 실행까지 됐다. 마켓플레이스가 3팩을 통째로 설치하므로 실물은 늘 존재하고,
//   활성화 장부에 키가 없으면 Claude Code가 로드한다(opt-out). 우리는 opt-in인 줄 알고 `if(dev) = true`만
//   써서 staff PC에 키가 아예 생기지 않았다.
//   ⚠️ 이 전제 위에 `jedi-skills/SKILL.md:92`의 "목록이 곧 권한 — role 분기 코드 불필요"가 서 있다.
// @AI:FRAGILE confident일 때만 끈다. 판정 불가 PC는 손대지 않는다.
//   🔴 이 규칙은 위 `canDisable` 루프가 이미 이행한다 — `resolve-packs.js` 가 role 축으로 false 가 된 팩은
//   `--role-confident 0` 일 때 canDisable=false 로 돌려준다. **여기에 dev-pack 전용 분기를 되살리지 말 것**
//   (되살리면 같은 규칙이 두 곳에 생기고, 그게 2026-08-16 에 봉합한 사고의 형태다).

const wantKeys = Object.keys(want);
// @AI:INTENT '전환 완료' 판정에 실물 설치까지 포함 — 활성화만 보면 미설치 상태를 완료로 오독해 영구히 스킬 0개가 된다.
const alreadyNew = wantKeys.every((k) => ep[k] === true && isInstalled(k)) && ep['zulgap@' + MP] !== true;
if (alreadyNew) {
  // @AI:FRAGILE 이 조기 return 뒤에 갱신 로직을 두면 영구 미도달이다 — isInstalled()는 '키가 있나'만 보고
  //   버전을 안 보므로, 전환이 성공한 순간 alreadyNew가 영구 true가 되어 뒤쪽이 한 번도 실행되지 않는다.
  //   갱신은 반드시 return '앞에' 있어야 한다.
  // @AI:INTENT dev-pack/zulgap-pack 비활성은 전환 완료 PC에도 필요하다(전환은 끝났는데 팩만 켜진 상태가 실재).
  //   그래서 이 조기 return 안에서도 저장한다 — 아래 전환 경로의 write에 의존하면 영구 미도달이다.
  if (anyFlipped) {
    try { fs.copyFileSync(SETTINGS, SETTINGS + '.bak-hookdoctor2'); } catch (_) { /* 백업 실패해도 진행 */ }
    try { fs.writeFileSync(SETTINGS, JSON.stringify(s, null, 2)); } catch (e) {
      console.log('[hook-doctor-v2] settings 쓰기 실패 — skip: ' + e.message);
      process.exit(0);
    }
  }
  const flips = flippedNames.map((n) => n + ' 비활성화');
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
