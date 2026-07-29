#!/usr/bin/env node
// @AI:INTENT 현재 직원 신원 해석 — 세션저널 '작성자' + 블로그 커밋 author용.
//   공유 Claude 계정이라 Claude 자체는 누가인지 모름. 개인 제디 토큰의 actor로 식별.
// 사용법: node resolve-staff.js        -> 이름 (기본, '저장' 스킬용)
//        node resolve-staff.js email   -> 이메일 (블로그 커밋 author용)
// 출력: 해당 값만 stdout (모르면 빈 문자열). 종료코드 항상 0.
//
// @AI:INTENT 🔄 2026-07-29 PR-3 — **이름 소스가 파일에서 백엔드로 이동**했다.
//   name  → teampack-config.js (GET /mcp/ext/teampack-config → actor.name, tenant-scoped)
//   email → staff-map.json (**백엔드에 email 필드가 아직 없다** — 아래 참조)
//   이 파일은 하위 호환 진입점으로 남는다: 팀원 PC의 플러그인 캐시(sha 핀 고정)에 있는
//   옛 SKILL.md들이 이 경로를 계속 부르기 때문에 삭제하면 그 캐시들이 조용히 죽는다.
//
// @AI:CONSTRAINT 🔴 name에 staff-map.json 폴백을 두지 않는다.
//   백엔드가 평소 답해버리면 파일이 썩은 사실 자체가 은폐되고, 두 소스 불일치를 감지할 게이트가 0개다.
//   가용성 폴백은 teampack-config.js 안의 **직전 서버 응답 캐시**가 담당한다(다른 장부가 아님).
//
// @AI:DEPENDS email이 아직 파일에 남은 이유 — 서버 카드(`loadTeampackConfig`)가 `actor.name`만
//   반환하고 email 필드가 없다. `person.primary_email`은 존재하나 채움이 불완전(이지연 미등록).
//   → **staff-map.json 삭제(PR-1) 전에 email 경로를 먼저 해결해야 한다.** 지금 지우면
//   `zulgap-blog`의 git author가 전원 공유 계정으로 폴백된다(SKILL.md의 명시적 폴백 경로).
//   spec: ~/.claude/specs/2026-07-29-teampack-identity-ssot-and-journal-backfill.md §8

'use strict';
const fs = require('fs');
const path = require('path');
const os = require('os');
const { execFileSync } = require('child_process');

function out(v) { process.stdout.write(v == null ? '' : String(v)); process.exit(0); }
function b64urlToJson(seg) {
  const b = Buffer.from(String(seg).replace(/-/g, '+').replace(/_/g, '/'), 'base64');
  return JSON.parse(b.toString('utf8'));
}

const field = process.argv[2] === 'email' ? 'email' : 'name';

// ── name: 백엔드 SSOT (teampack-config.js 위임) ──────────────────────────────
if (field === 'name') {
  try {
    // @AI:FRAGILE stderr는 흘려보낸다(stdio 'inherit') — teampack-config의 stale 경고가
    //   사용자에게 도달해야 "옛 이름이 조용히 쓰이는" 실패 모드를 볼 수 있다.
    const r = execFileSync(process.execPath, [path.join(__dirname, 'teampack-config.js'), 'name'], {
      encoding: 'utf8', timeout: 8000, stdio: ['ignore', 'pipe', 'inherit'],
    });
    out((r || '').trim());
  } catch (_) {
    out(''); // 어떤 실패든 조용히 빈 출력 → 작성자 생략(저널 자체는 정상 적재)
  }
}

// ── email: staff-map.json (백엔드 미보유 — 위 @AI:DEPENDS 참조) ──────────────
try {
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
  if (!token) out('');

  const payload = b64urlToJson(token.split('.')[1]);
  const actor = payload && payload.actor_id;
  if (!actor) out('');

  const map = JSON.parse(fs.readFileSync(path.join(__dirname, 'staff-map.json'), 'utf8'));
  const entry = map[actor];
  if (!entry) out('');
  if (typeof entry === 'string') out(''); // 구버전(문자열=이름만) → email 없음
  out(entry.email || '');
} catch (_) {
  out(''); // 실패 시 빈 출력 → zulgap-blog가 공유 계정으로 폴백
}
