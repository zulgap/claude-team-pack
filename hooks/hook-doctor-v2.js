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

const ZULGAP_DIR = path.join(os.homedir(), '.claude', 'zulgap');
const SETTINGS = path.join(os.homedir(), '.claude', 'settings.json');
const FLAG = path.join(ZULGAP_DIR, '.hook-doctor-v2.done');
const MP = 'zulgap-team-pack';

setTimeout(() => { try { console.log('[hook-doctor-v2] timeout — skip'); } catch (_) {} process.exit(0); }, 8000);

function done(msg) {
  try { fs.mkdirSync(ZULGAP_DIR, { recursive: true }); fs.writeFileSync(FLAG, new Date().toISOString()); } catch (_) {}
  console.log('[hook-doctor-v2] ' + msg);
  process.exit(0);
}

function b64urlJson(seg) {
  return JSON.parse(Buffer.from(String(seg).replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8'));
}

function roleFromToken() {
  const candidates = [path.join(os.homedir(), '.claude.json')];
  if (process.env.APPDATA) candidates.push(path.join(process.env.APPDATA, 'Claude', 'claude_desktop_config.json'));
  candidates.push(path.join(os.homedir(), 'Library', 'Application Support', 'Claude', 'claude_desktop_config.json'));
  for (const f of candidates) {
    try {
      const j = JSON.parse(fs.readFileSync(f, 'utf8'));
      const t = j && j.mcpServers && j.mcpServers.jedi && j.mcpServers.jedi.env && j.mcpServers.jedi.env.JUDGMENTOS_TOKEN;
      if (!t) continue;
      const r = String((b64urlJson(String(t).split('.')[1]) || {}).role || '').toLowerCase();
      if (!r) continue;
      if (r === 'admin' || r === 'master') return 'master';
      if (r === 'dev' || r === 'developer' || r === 'engineer') return 'dev';
      return 'staff';
    } catch (_) { /* 다음 후보 */ }
  }
  return '';
}

function resolveRole() {
  const fromToken = roleFromToken();
  if (fromToken) return fromToken;
  try {
    const r = fs.readFileSync(path.join(ZULGAP_DIR, 'role'), 'utf8').trim();
    if (r === 'dev' || r === 'master') return r;
  } catch (_) {}
  return 'staff';
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
const role = resolveRole();
const want = { ['jedi-core@' + MP]: true, ['zulgap-pack@' + MP]: true };
if (role === 'dev' || role === 'master') want['dev-pack@' + MP] = true;

const alreadyNew = Object.keys(want).every((k) => ep[k] === true) && ep['zulgap@' + MP] !== true;
if (alreadyNew) return done('이미 전환됨 — 정상 (변경 0, role=' + role + ')');

try { fs.copyFileSync(SETTINGS, SETTINGS + '.bak-hookdoctor2'); } catch (_) { /* 백업 실패해도 진행 — 원본은 단일 write */ }
for (const k of Object.keys(want)) ep[k] = true;
ep['zulgap@' + MP] = false; // 구 플러그인 비활성 (키 유지 = 전환 이력 가시화, 롤백 = true 1줄)

try {
  fs.writeFileSync(SETTINGS, JSON.stringify(s, null, 2));
  done('플러그인 전환 완료 (jedi-core/zulgap-pack' + (want['dev-pack@' + MP] ? '/dev-pack' : '') + ', role=' + role + ') — 다음 재시작부터 적용');
} catch (e) {
  console.log('[hook-doctor-v2] settings 쓰기 실패 — skip: ' + e.message);
  process.exit(0);
}
