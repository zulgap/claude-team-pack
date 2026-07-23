#!/usr/bin/env node
// claude-team-pack/hooks/response-capture.js
// @AI:INTENT Stop 훅 — 어시스턴트 응답 텍스트를 judgmentos prompt_log의 turn_uuid 짝으로 전송
//   (prompt-capture.js의 대칭 — 지시-응답 학습쌍 완성). transcript JSONL에서 마지막 user 프롬프트 +
//   그 이후 assistant 텍스트 블록만 추출(도구 호출/도구 결과 제외 = 시크릿 노출면 최소화).
// @AI:CONSTRAINT 절대 차단 X — 토큰 없음/transcript 파싱 실패/네트워크 실패 전부 조용히 exit(0).
//   서버가 scrubPrompt(secret/PII 마스킹) 수행. 훅은 로컬 마스킹 없음(이중 구현 드리프트 방지).
// @AI:DEPENDS turn_uuid 시드 = sha256(`${session_id}:${prompt}`) — prompt-capture.js와 동일해야
//   서버 ON CONFLICT (turn_uuid) upsert로 쌍이 성립한다. 한쪽만 바꾸면 쌍 영구 분리.

const fs = require('fs');
const path = require('path');
const os = require('os');
const https = require('https');
const http = require('http');
const crypto = require('crypto');

// 안전 타임아웃 — 5초 내 무조건 종료 (턴 종료 절대 지연 X)
setTimeout(() => process.exit(0), 5000);

// @AI:INTENT 스킬/커맨드 턴 재구성 — transcript엔 <command-name>/<command-args> 태그 문자열이 기록되지만
//   UserPromptSubmit 훅(prompt-capture)은 원발화("/시작 <args>")를 받는다. 같은 원문으로 재구성해야
//   sha256(session:prompt) turn_uuid가 일치해 쌍이 성립 (2026-07-23 실측: 재구성 해시 = 지시 행 uuid 정확 일치).
function reconstructCommand(s) {
  if (s.includes('<local-command-stdout>')) return null; // 커맨드 출력 엔트리 — 프롬프트 아님
  const name = (s.match(/<command-name>([\s\S]*?)<\/command-name>/) || [])[1];
  if (!name) return s;
  const args = (s.match(/<command-args>([\s\S]*?)<\/command-args>/) || [])[1];
  return args && args.trim() ? `${name} ${args}` : name;
}

function textOfContent(content) {
  if (typeof content === 'string') return reconstructCommand(content);
  if (Array.isArray(content)) {
    if (content.some((c) => c && c.type === 'tool_result')) return null; // 도구 결과 턴 — 프롬프트 아님
    const parts = content.filter((c) => c && c.type === 'text' && typeof c.text === 'string').map((c) => c.text);
    return parts.length ? parts.join('\n') : null;
  }
  return null;
}

let data = '';
process.stdin.on('data', (c) => { data += c; });
process.stdin.on('end', () => {
  try {
    const input = JSON.parse(data || '{}');
    const transcriptPath = input.transcript_path;
    if (!transcriptPath || !fs.existsSync(transcriptPath)) return process.exit(0);

    // transcript JSONL 파싱 (라인 단위, 깨진 라인 skip)
    const lines = fs.readFileSync(transcriptPath, 'utf8').split('\n');
    const entries = [];
    for (const line of lines) {
      if (!line.trim()) continue;
      try { entries.push(JSON.parse(line)); } catch (_) { /* skip */ }
    }

    // 마지막 실 user 프롬프트 (sidechain/도구결과/meta 제외)
    // @AI:DEPENDS isMeta 스킵 필수 — 스킬 턴은 원발화(#N) 뒤에 전개문(isMeta=true)이 별도 user 엔트리로
    //   붙는다. meta를 프롬프트로 집으면 지시 훅과 다른 turn_uuid가 되어 쌍이 영구 분리 (7f5846e0 사고).
    let userIdx = -1;
    let promptText = '';
    for (let i = entries.length - 1; i >= 0; i--) {
      const e = entries[i];
      if (e && e.type === 'user' && e.isSidechain !== true && e.isMeta !== true && e.message) {
        const t = textOfContent(e.message.content);
        if (t && t.trim().length >= 2) { userIdx = i; promptText = t; break; }
      }
    }
    if (userIdx < 0) return process.exit(0);

    // 그 이후 assistant 텍스트 블록만 수집 (tool_use/thinking 제외)
    const respParts = [];
    for (let i = userIdx + 1; i < entries.length; i++) {
      const e = entries[i];
      if (e && e.type === 'assistant' && e.isSidechain !== true && e.message && Array.isArray(e.message.content)) {
        for (const c of e.message.content) {
          if (c && c.type === 'text' && typeof c.text === 'string' && c.text.trim()) respParts.push(c.text);
        }
      }
    }
    const responseText = respParts.join('\n\n').trim();
    if (!responseText) return process.exit(0); // 응답 없는 턴(중단 등) — 보낼 것 없음

    // 토큰/URL — prompt-capture.js 동일 패턴 (~/.claude.json mcpServers.jedi.env)
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
    if (!token || !url) return process.exit(0);

    // 결정론 turn_uuid — prompt-capture.js와 동일 시드(전체 prompt 기준, slice 전) → 쌍 자동 성립
    const seed = `${input.session_id || ''}:${promptText}`;
    const h = crypto.createHash('sha256').update(seed).digest('hex');
    const turn_uuid = `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20, 32)}`;

    const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    const body = JSON.stringify({
      prompt_text: promptText.slice(0, 99000),      // 서버 100KB cap 마진
      response_text: responseText.slice(0, 190000), // 서버 200KB cap 마진
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
