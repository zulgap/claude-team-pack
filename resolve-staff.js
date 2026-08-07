#!/usr/bin/env node
// @AI:INTENT 현재 직원 신원 해석 — 세션저널 '작성자'용.
//   공유 Claude 계정이라 Claude 자체는 누가인지 모름. 개인 제디 토큰의 actor로 식별.
// 사용법: node resolve-staff.js        -> 이름 (기본, '저장' 스킬용)
//        node resolve-staff.js email   -> 빈 문자열 (email 경로 폐기, 아래 참조)
// 출력: 해당 값만 stdout (모르면 빈 문자열). 종료코드 항상 0.
//
// @AI:INTENT 🔄 2026-07-29 PR-3 — **이름 소스가 파일에서 백엔드로 이동**했다.
//   name → teampack-config.js (GET /mcp/ext/teampack-config → actor.name, tenant-scoped)
//   이 파일은 하위 호환 진입점으로 남는다: 팀원 PC의 플러그인 캐시(sha 핀 고정)에 있는
//   옛 SKILL.md들이 이 경로를 계속 부르기 때문에 삭제하면 그 캐시들이 조용히 죽는다.
//
// @AI:CONSTRAINT 🔴 name에 파일 폴백을 두지 않는다.
//   백엔드가 평소 답해버리면 파일이 썩은 사실 자체가 은폐되고, 두 소스 불일치를 감지할 게이트가 0개다.
//   가용성 폴백은 teampack-config.js 안의 **직전 서버 응답 캐시**가 담당한다(다른 장부가 아님).
//
// @AI:INTENT ❌ email 경로 폐기 (2026-07-29 사장님 결정 · PR-1).
//   근거: git author는 이미 공유 계정으로 폴백 중이라 실질 변화가 0이고,
//   "누가 썼는지"는 노션 `작성자` + 벡터 `person_id`로 이미 두 겹 남는다.
//   유일한 소비처였던 `zulgap-blog`는 v2.11에서 노션 카드 파이프라인으로 전환되며 git 커밋 자체를 하지 않는다.
//   → 개인 이메일이 담겨 public 레포에 노출되던 `staff-map.json`을 함께 삭제했다.
// @AI:CONSTRAINT 🔴 여기에 email 소스를 되살리지 말 것. 필요해지면 파일이 아니라
//   서버 카드(`loadTeampackConfig`)에 필드를 추가한다 — public 레포에 개인정보를 두지 않는다.

'use strict';
const path = require('path');
const { execFileSync } = require('child_process');

function out(v) { process.stdout.write(v == null ? '' : String(v)); process.exit(0); }

// email로 불린 경우 — 폐기된 경로. 빈 출력으로 하위 호환만 유지한다
// (옛 캐시의 SKILL.md가 이걸 부르면 공유 계정 커밋으로 폴백된다 = 기존 명시 경로).
if (process.argv[2] === 'email') out('');

// ── name: 백엔드 SSOT (teampack-config.js 위임) ──────────────────────────────
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
