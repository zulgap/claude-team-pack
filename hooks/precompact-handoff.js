#!/usr/bin/env node
// PreCompact 훅 — 컨텍스트 압축(자동/수동) 직전 발화.
//   ① 터미널 배너: "곧 압축됨 — 저장/핸드오프 아직이면 지금"
//   ② 자동 핸드오프 스냅샷 파일(결정론): 최근 user 발화 + repo 상태 + /저장 안내 → ~/.claude/specs/
//   결정론만 — LLM 호출 0(API키 의존 0·재귀 0). 5섹션 큐레이션은 /저장(사람/Claude)이 담당.
// 등록: ~/.claude/settings.json hooks.PreCompact
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execSync } = require('child_process');

function readStdin() {
  try { return fs.readFileSync(0, 'utf8'); } catch { return ''; }
}

function main() {
  let input = {};
  try { input = JSON.parse(readStdin() || '{}'); } catch { input = {}; }
  const transcriptPath = input.transcript_path || '';
  const sessionId = input.session_id || 'unknown';
  const trigger = input.trigger || 'auto'; // "manual" | "auto"
  const cwd = input.cwd || process.cwd();

  // 최근 실제 user 발화 추출 (content=string=타이핑 프롬프트 / array=tool_result 제외)
  const userTurns = [];
  let gitBranch = '';
  try {
    if (transcriptPath && fs.existsSync(transcriptPath)) {
      const lines = fs.readFileSync(transcriptPath, 'utf8').split('\n');
      for (const line of lines) {
        if (!line.trim()) continue;
        let ev;
        try { ev = JSON.parse(line); } catch { continue; }
        if (ev.gitBranch) gitBranch = ev.gitBranch;
        if (ev.type === 'user' && ev.message && typeof ev.message.content === 'string') {
          const t = ev.message.content.trim();
          // 로컬 커맨드/시스템 잡음 skip (컴팩션 요약·caveat·interrupt는 사장님 발화 아님)
          if (!t || t.startsWith('<') || t.startsWith('[Request interrupted')
            || t.startsWith('This session is being continued')
            || t.startsWith('Caveat:')) continue;
          userTurns.push({ ts: ev.timestamp || '', text: t });
        }
      }
    }
  } catch { /* transcript 파싱 실패해도 배너는 나감 */ }

  const recent = userTurns.slice(-12);

  // repo 상태 (best-effort). stdio로 stderr 무조건 무시(git Korean 에러 모지바케 누출 차단)
  const gitOpts = { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] };
  let repoInfo = '';
  try {
    const branch = execSync('git rev-parse --abbrev-ref HEAD', gitOpts).trim();
    const dirty = execSync('git status --short', gitOpts)
      .split('\n').filter(l => l.trim() && !l.includes('node_modules')).slice(0, 15);
    repoInfo = `- cwd: \`${cwd}\`\n- branch: \`${branch || gitBranch || '?'}\`\n`;
    if (dirty.length) repoInfo += `- 미커밋 변경 ${dirty.length}건:\n\`\`\`\n${dirty.join('\n')}\n\`\`\`\n`;
    else repoInfo += `- 미커밋 변경: 없음(clean)\n`;
  } catch { repoInfo = `- cwd: \`${cwd}\`\n- branch: \`${gitBranch || '?'}\`\n`; }

  // 핸드오프 파일 작성 (결정론 스냅샷 — /저장의 큐레이션 대체 아님, 안전망)
  const specsDir = path.join(os.homedir(), '.claude', 'specs');
  let handoffPath = '';
  try {
    fs.mkdirSync(specsDir, { recursive: true });
    const dstr = new Date().toISOString().slice(0, 10);
    handoffPath = path.join(specsDir, `${dstr}-autohandoff-${sessionId.slice(0, 8)}.md`);
    const body = `# 자동 핸드오프 스냅샷 (PreCompact ${trigger})

> ⚠️ 이건 **결정론 스냅샷**이지 큐레이션된 핸드오프가 아니다.
> 제대로 이어가려면 이전 세션에서 \`/저장\`이 돌았는지 먼저 확인 —
> 안 돌았으면 이 스냅샷 + transcript로 맥락 복구 후 진행.
> 생성: ${new Date().toISOString()} / session ${sessionId}

## repo 상태
${repoInfo}
## 최근 사장님 발화 (최대 12개, 오래된→최신)
${recent.length ? recent.map((u, i) => `${i + 1}. ${u.text.replace(/\n+/g, ' ').slice(0, 300)}`).join('\n') : '(추출된 발화 없음)'}

## 다음 세션 진입
1. 이 파일 + \`~/.claude/specs/\`의 최신 수동 핸드오프(있으면) 읽기
2. \`git -C <cwd> status\` + \`git log --oneline -5\`로 실제 상태 확인
3. 위 발화 흐름으로 "어디까지 했나" 재구성 후 이어가기

## 원본
- transcript: \`${transcriptPath || '(없음)'}\`
`;
    fs.writeFileSync(handoffPath, body, 'utf8');
  } catch { handoffPath = ''; }

  // 터미널 배너 (systemMessage = UI 표시)
  const savedHint = handoffPath ? `\n자동 스냅샷 저장됨: ${handoffPath}` : '';
  const banner = `⚠️ 컨텍스트 압축 임박(${trigger}). 이번 세션 저널·핸드오프 아직이면 지금 /저장 하세요.${savedHint}`;

  process.stdout.write(JSON.stringify({ systemMessage: banner, suppressOutput: true }));
}

try { main(); } catch (e) {
  // 훅 실패가 압축을 막지 않도록 — 조용히 통과
  process.stdout.write(JSON.stringify({ suppressOutput: true }));
}
