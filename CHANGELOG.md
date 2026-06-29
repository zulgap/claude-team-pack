# 직원 배포 패키지 변경 이력 (CHANGELOG)

> 직원에게 전달하는 부트스트랩 zip(`claude-team-pack-for-staff_vX.Y.zip`)의 버전·변경 내역 정본.
> 플러그인 본체(스킬 `/시작`·`/저장`·`/블로그` + 노션/PPT/한글 도구)는 GitHub 마켓플레이스로 별도 설치되며, 이 zip은 **직원 PC 부트스트랩**(install.bat → Git/Node/uv + 제디 토큰 등록)만 담는다.

## 파일명 규칙
- 형식: `claude-team-pack-for-staff_vX.Y.zip` (파일명에 버전 표기 — 옛 zip과 한눈에 구분)
- 위치: `C:\Users\admin\claude-team-pack-for-staff_vX.Y.zip`
- 새 버전 배포 시: ① 이 CHANGELOG에 항목 추가 → ② zip 재생성(버전 bump) → ③ 노션 팀원용 페이지 첨부 교체 + 관리자용 빠른 참조 파일명 갱신

---

## v1.3 (2026-06-29)
**스킬 명령어 한글화 — 직원 직관성 ★**
- 🔤 스킬 3종 한글 리네임 (영문명이라 직원이 `/시작` 쳐도 "Unknown skill" 떴던 근본원인 해소):
  - `start` → **`/시작`**, `session-journal` → **`/저장`**, `blog-publish` → **`/블로그`** (frontmatter `name` 포함)
- 🔄 `team-CLAUDE.md`: 안내 문구 `/세션저널` → `/저장` + `/블로그` 줄 추가.
- 🔄 `install.ps1`: 성공 안내에 `/저장`·`/블로그` 병기.
- ⚠️ **스킬 리네임은 GitHub 마켓플레이스 pull로 기존 직원에게도 닿음** (zip 불필요) — 직원은 `/plugin marketplace update` 또는 앱 재시작으로 갱신.
- 📦 zip 재생성 필요 사유: `team-CLAUDE.md` 변경(신규 직원용). **③ 노션 첨부 교체는 사장님 수동.**

## v1.2 (2026-06-29)
**Claude Code 자동 설치 + 플러그인 자동 등록 + 바탕화면 바로가기 (데스크탑앱 Plugins 메뉴 의존 제거)**
- 🐛 근본 수정: 직원이 데스크탑 앱 "Plugins → Add marketplace" 메뉴를 못 찾아 막히던 문제. team-pack은 **Claude Code 플러그인**이라 데스크탑 채팅앱이 아니라 **Claude Code가 본체**.
- ✨ `install.ps1` 자동화: Claude Code CLI 설치(`claude.ai/install.ps1`, winget 폴백) + `~/.claude/settings.json`에 마켓플레이스+플러그인 자동 등록(메뉴/명령 입력 불필요) + 바탕화면 **"줄갭 Claude"** 바로가기.
- 🔄 제디: Claude Code(`~/.claude.json` 최상위 `mcpServers`)에도 등록 — 터미널/Code탭에서 제디 사용 가능(기존 데스크탑앱 `claude_desktop_config.json` 등록 유지).
- 🛡 `settings.json` / `.claude.json` / `claude_desktop_config.json` 쓰기 전 `.bak` 백업.
- 📦 zip 구성: 5개 (v1.1과 동일) — `install.bat`, `install.ps1`, `team-CLAUDE.md`, `mcp-bridge/index.js`, `mcp-bridge/package.json`
- ✅ 검증: PowerShell 구문 0 에러 + `settings.json`/`.claude.json` 병합 신규·기존 케이스 실측 PASS(기존 설정 보존).
- 연계: claude-team-pack PR #3(install.ps1) + #4(README 정합).

## v1.1 (2026-06-28)
**제디(회사 데이터) MCP 연결 추가**
- ✨ install.bat 실행 중 `JEDI_TOKEN` 입력 단계 추가 — 토큰 받은 직원만 데스크탑 설정(`claude_desktop_config.json`)에 제디 등록. 토큰 없으면 그냥 Enter(노션·PPT·한글만 설치, 영향 0).
- ➕ `mcp-bridge/`(index.js + package.json) 번들 포함 — 설치 시 `npm install`로 의존성 자동 설치.
- 🔄 `install.ps1`: 토큰 입력 섹션(4.5) 추가 + UTF-8 BOM(한글 깨짐 방지).
- 🔄 `team-CLAUDE.md`: 제디 도구 안내 1줄 추가.
- 📦 zip 구성: 5개 — `install.bat`, `install.ps1`, `team-CLAUDE.md`, `mcp-bridge/index.js`, `mcp-bridge/package.json`
- 연계: judgmentos PR #1892(브리지 외부 토큰 모드) + claude-team-pack PR #1.
- 토큰 발급(마스터): `railway run node scripts/issue-mcp-token.js --actor <직원ID> --tenant <테넌트ID>`

## v1.0 (2026-06-24)
**최초 배포**
- install.bat(Git/Node/uv 자동 설치) + install.ps1 + team-CLAUDE.md(직원 지침 배치).
- 플러그인(스킬 `/시작`·`/세션저널`·blog-publish + 노션/PPT/한글)은 마켓플레이스 설치.
- 📦 zip 구성: 3개 — `install.bat`, `install.ps1`, `team-CLAUDE.md`
