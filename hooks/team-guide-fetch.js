#!/usr/bin/env node
// @AI:INTENT 줄갭 팀 안내문을 매 세션 시작 시 GitHub에서 받아 주입.
//   → 안내문을 바꾸면 직원은 zip 재설치 없이 다음 세션에 자동 반영 (알집式 원격 갱신).
//   v1.18: 역할(role) 분기 — ~/.claude/zulgap/role 이 'dev'면 영어 dev 가이드, 그 외(파일 없음 포함)는 기존 team-guide.md.
// @AI:CONSTRAINT 반드시 standalone 훅(settings.json)으로 등록. 플러그인 번들 훅은 additionalContext
//   미주입 버그(#16538)로 동작 안 함. 출력은 SessionStart additionalContext 계약을 정확히 따른다.
// @AI:CONSTRAINT staff 경로(캐시 파일명 team-guide.cache.md 포함)는 기존 설치 PC와 동일하게 유지 — 기존 직원 회귀 0.
const https = require('https');
const fs = require('fs');
const path = require('path');
const os = require('os');

const ZULGAP_DIR = path.join(os.homedir(), '.claude', 'zulgap');
let role = 'staff';
try { role = (fs.readFileSync(path.join(ZULGAP_DIR, 'role'), 'utf8').trim() || 'staff'); } catch {}
if (role !== 'dev') role = 'staff'; // 알 수 없는 값은 안전측(staff)으로

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
