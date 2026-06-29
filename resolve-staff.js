#!/usr/bin/env node
// @AI:INTENT 현재 직원 이름을 JEDI_TOKEN(actor_id)에서 자동 해석 → 세션저널 '작성자' 자동 기록용.
//   공유 Claude 계정이라 Claude 자체는 누가인지 모름. 직원별 제디 토큰의 actor로 식별.
// 출력: 이름만 stdout으로 (모르면 빈 문자열). '저장' 스킬이 이 출력을 작성자로 박는다.
// 위치: 플러그인 루트(자동갱신). staff-map.json은 같은 폴더(sibling).
const fs = require('fs');
const path = require('path');
const os = require('os');

function out(name) { process.stdout.write(name || ''); process.exit(0); }
function b64urlToJson(seg) {
  const b = Buffer.from(String(seg).replace(/-/g, '+').replace(/_/g, '/'), 'base64');
  return JSON.parse(b.toString('utf8'));
}

try {
  // 1) 제디 토큰 찾기 (Claude Code 표면 ~/.claude.json 우선, 데스크탑앱 config 폴백)
  let token = '';
  const candidates = [
    path.join(os.homedir(), '.claude.json'),
    path.join(process.env.APPDATA || '', 'Claude', 'claude_desktop_config.json'),
  ];
  for (const f of candidates) {
    try {
      const j = JSON.parse(fs.readFileSync(f, 'utf8'));
      const t = j && j.mcpServers && j.mcpServers.jedi && j.mcpServers.jedi.env && j.mcpServers.jedi.env.JUDGMENTOS_TOKEN;
      if (t) { token = t; break; }
    } catch (_) { /* 파일 없거나 파싱 실패 → 다음 후보 */ }
  }
  if (!token) out(''); // 토큰 없는 직원(노션·PPT·한글만) → 작성자 생략

  // 2) JWT payload에서 actor_id
  const payload = b64urlToJson(token.split('.')[1]);
  const actor = payload && payload.actor_id;
  if (!actor) out('');

  // 3) staff-map.json(sibling, 자동갱신)에서 이름
  const map = JSON.parse(fs.readFileSync(path.join(__dirname, 'staff-map.json'), 'utf8'));
  out(map[actor] || '');
} catch (_) {
  out(''); // 어떤 실패든 조용히 빈 출력 → 작성자 생략(저널 자체는 정상 적재)
}
