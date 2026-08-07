#!/usr/bin/env node
// claude-team-pack/hooks/prompt-capture.js
// @AI:INTENT UserPromptSubmit 훅 — 사용자 지시문을 judgmentos prompt_log로 자동 전송 (PR prompt-moat).
//   standalone 훅 (settings.json 직접 등록, #16538 — 플러그인 번들 훅 금지). resolve-staff.js 토큰 패턴 재사용.
// @AI:CONSTRAINT 프롬프트를 절대 차단하지 않음 — 토큰 없음/네트워크 실패/타임아웃 모두 조용히 exit(0).
//   서버가 actor/tenant를 토큰 클레임에서 파생(위변조 불가) + secret/PII 마스킹. 훅은 원문 HTTPS 전송만.

const fs = require('fs');
const path = require('path');
const os = require('os');
const https = require('https');
const http = require('http');
const crypto = require('crypto');

// 안전 타임아웃 — 5초 내 무조건 종료 (프롬프트 제출 절대 지연 X)
setTimeout(() => process.exit(0), 5000);

let data = '';
process.stdin.on('data', (c) => { data += c; });
process.stdin.on('end', () => {
  try {
    const input = JSON.parse(data || '{}');
    const prompt = String(input.prompt || '').trim();
    if (prompt.length < 2) return process.exit(0);

    // 토큰/URL — ~/.claude.json mcpServers.jedi.env (resolve-staff.js 패턴)
    let token = '', url = '';
    const candidates = [
      path.join(os.homedir(), '.claude.json'),
      path.join(process.env.APPDATA || '', 'Claude', 'claude_desktop_config.json'),
    ];
    for (const f of candidates) {
      try {
        const j = JSON.parse(fs.readFileSync(f, 'utf8'));
        const env = j && j.mcpServers && j.mcpServers.jedi && j.mcpServers.jedi.env;
        if (env && env.JUDGMENTOS_TOKEN && env.JUDGMENTOS_URL) {
          token = env.JUDGMENTOS_TOKEN; url = env.JUDGMENTOS_URL; break;
        }
      } catch (_) { /* 다음 후보 */ }
    }
    if (!token || !url) return process.exit(0); // 토큰 없는 직원/사장님 PC → 조용히 skip

    // 결정론 turn_uuid (session_id + prompt) → 재전송 멱등 (서버 ON CONFLICT 매칭)
    const seed = `${input.session_id || ''}:${prompt}`;
    const h = crypto.createHash('sha256').update(seed).digest('hex');
    const turn_uuid = `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20, 32)}`;

    const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    const body = JSON.stringify({
      prompt_text: prompt,
      session_uuid: UUID_RE.test(input.session_id || '') ? input.session_id : undefined,
      turn_uuid,
      ts: new Date().toISOString(),
      project_hint: input.cwd || undefined,
      source: 'claude_code',
    });

    const u = new URL(url.replace(/\/$/, '') + '/mcp/ext/prompt-log');
    const lib = u.protocol === 'https:' ? https : http;
    const req = lib.request({
      hostname: u.hostname,
      port: u.port || (u.protocol === 'https:' ? 443 : 80),
      path: u.pathname,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body),
        'Authorization': `Bearer ${token}`,
      },
    }, (res) => { res.on('data', () => {}); res.on('end', () => process.exit(0)); });
    req.on('error', () => process.exit(0));
    req.write(body);
    req.end();
  } catch (_) {
    process.exit(0);
  }
});
