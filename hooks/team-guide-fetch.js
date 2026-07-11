#!/usr/bin/env node
// @AI:INTENT 줄갭 팀 안내문을 매 세션 시작 시 GitHub에서 받아 주입.
//   → 안내문을 바꾸면 직원은 zip 재설치 없이 다음 세션에 자동 반영 (알집式 원격 갱신).
//   v1.20: 역할(role)의 원천 = 제디 토큰 JWT claim (사장님 mandate "관리 SSOT = 토큰").
//     매핑: admin/master→master(주입 skip, 개인 컨텍스트 보존) · dev/developer/engineer→dev(영어 가이드) · 그 외(PM/MEMBER/USER)→staff.
//     토큰 없거나 해석 실패 → role 파일(~/.claude/zulgap/role) 폴백 → staff 기본.
//     역할 변경 = 토큰 재발급 1곳 (role 파일 drift 원천 제거 — 매 세션 라이브 유도).
// @AI:CONSTRAINT 반드시 standalone 훅(settings.json)으로 등록. 플러그인 번들 훅은 additionalContext
//   미주입 버그(#16538)로 동작 안 함. 출력은 SessionStart additionalContext 계약을 정확히 따른다.
// @AI:CONSTRAINT staff 경로(team-guide.md + 캐시 team-guide.cache.md)는 기존 설치 PC와 동일 유지 — 기존 직원 회귀 0.
//   기존 직원 토큰 role=PM/MEMBER → staff 매핑 (2026-07-12 실측: 발급 role은 --role 인자 > 배정 role > 'USER').
const https = require('https');
const fs = require('fs');
const path = require('path');
const os = require('os');

const ZULGAP_DIR = path.join(os.homedir(), '.claude', 'zulgap');

function b64urlJson(seg) {
  return JSON.parse(Buffer.from(String(seg).replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8'));
}

function roleFromToken() {
  // 제디 토큰 위치: Claude Code(~/.claude.json) 우선, 데스크탑앱 config 폴백 (Windows/macOS 양쪽)
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
      return 'staff'; // 알 수 없는/직무 role(PM·MEMBER·USER 등) = 안전측
    } catch (_) { /* 파일 없음/파싱 실패 → 다음 후보 */ }
  }
  return ''; // 토큰 기반 판정 불가 → 폴백으로
}

function resolveRole() {
  const fromToken = roleFromToken();
  if (fromToken) return fromToken; // 토큰 = SSOT (role 파일과 불일치 시 토큰 우선)
  try {
    const r = fs.readFileSync(path.join(ZULGAP_DIR, 'role'), 'utf8').trim();
    if (r === 'dev' || r === 'master') return r; // 토큰 없는 설치 초기(발급 전) 폴백
  } catch (_) {}
  return 'staff';
}

const role = resolveRole();
if (role === 'master') process.exit(0); // 사장님(admin) — 팀 가이드 주입 안 함 (개인 CLAUDE.md/메모리 보존)

const RAW = 'https://raw.githubusercontent.com/zulgap/claude-team-pack/main/';
const URL = role === 'dev' ? RAW + 'docs/dev-guide-en.md' : RAW + 'team-guide.md';
const CACHE = path.join(ZULGAP_DIR, role === 'dev' ? 'dev-guide.cache.md' : 'team-guide.cache.md');
const MAX = 9500; // additionalContext 약 10k자 한도 안전선

function emit(text) {
  if (!text) { process.exit(0); } // 줄 게 없으면 조용히 종료 (CLAUDE.md stub가 최소 보장)
  process.stdout.write(JSON.stringify({
    hookSpecificOutput: { hookEventName: 'SessionStart', additionalContext: String(text).slice(0, MAX) }
  }));
  process.exit(0);
}
function cache() { try { return fs.readFileSync(CACHE, 'utf8'); } catch { return ''; } }

const req = https.get(URL, { timeout: 4000 }, (res) => {
  if (res.statusCode !== 200) { res.resume(); return emit(cache()); }
  let data = '';
  res.on('data', (d) => { data += d; });
  res.on('end', () => {
    try { fs.mkdirSync(path.dirname(CACHE), { recursive: true }); fs.writeFileSync(CACHE, data); } catch {}
    emit(data);
  });
});
req.on('error', () => emit(cache()));
req.on('timeout', () => { req.destroy(); emit(cache()); });
