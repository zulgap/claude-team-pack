# 직원 배포 패키지 변경 이력 (CHANGELOG)

> 직원에게 전달하는 부트스트랩 zip(`claude-team-pack-for-staff_vX.Y.zip`)의 버전·변경 내역 정본.
> 플러그인 본체(스킬 `/시작`·`/저장`·`/블로그` + 노션/PPT/한글 도구)는 GitHub 마켓플레이스로 별도 설치되며, 이 zip은 **직원 PC 부트스트랩**(install.bat → Git/Node/uv + 제디 토큰 등록)만 담는다.

## 파일명 규칙
- 형식: `claude-team-pack-for-staff_vX.Y.zip` (파일명에 버전 표기 — 옛 zip과 한눈에 구분)
- 위치: `C:\Users\admin\claude-team-pack-for-staff_vX.Y.zip`
- 새 버전 배포 시: ① 이 CHANGELOG에 항목 추가 → ② zip 재생성(버전 bump) → ③ 노션 팀원용 페이지 첨부 교체 + 관리자용 빠른 참조 파일명 갱신

---

## v1.8 (2026-06-29) — 플러그인 전용 (zip 변경 없음 · 재설치 불필요)
**블로그 글 작성자 귀속 + gh CLI 의존 제거**
- 🐛 기존: 블로그 커밋이 전부 공유 이메일(`zulgap0327`) → 누가 쓴 글인지 GitHub에 안 남음.
- 🔄 `블로그` 스킬: 커밋 직전 resolve-staff로 이름·이메일 조회 → **그 직원으로 커밋**(`-c user.name -c user.email`). 이메일 미등록이면 공유 계정 폴백.
- 🔄 `staff-map.json`: `{actor: {name, email}}` 객체로 확장(신나래 이메일 추가, 이지연 이메일 미정).
- 🔄 `resolve-staff.js`: `email` 인자 지원(`node resolve-staff.js email`), 구버전 문자열 호환. 기본 출력=이름(저장 스킬 무변경).
- 🔄 `블로그` 스킬: `gh repo clone` → `git clone https://...`(gh CLI 불필요, Git Credential Manager로 본인 GitHub 첫 로그인 캐시).
- ⚡ 전부 자동갱신 플러그인 파일 → install.ps1·zip 무변경, 기존 직원 앱 재시작 시 자동.
- 👤 신규 직원: staff-map에 `{name, email}` 1줄 + repo Collaborator(Write) 초대.
- 검증: resolve-staff 이름/이메일/미등록/토큰없음 PASS.

## v1.7 (2026-06-29) — 플러그인 전용 (zip 변경 없음 · 재설치 불필요)
**세션저널 작성자 자동 기록 (공유 계정 누가-무엇 추적)**
- 🧭 공유 Claude 계정이라 Claude 자체는 작업자를 모름 → 개인 **제디 토큰의 actor_id**로 식별.
- ➕ `resolve-staff.js`(토큰 actor_id 디코드 → `staff-map.json` 이름 해석, 토큰 없으면 빈 출력) + `staff-map.json`(actor_id→이름; 신나래·이지연).
- 🔄 `저장` 스킬: 적재 직전 resolve-staff.js 1회 실행 → 노션 세션저널 **`작성자`** 속성에 기록(비면 생략, 실패 무시).
- ➕ 노션 "팀 세션 저널" DB에 `작성자`(텍스트) 속성 추가 → 사장님이 직원별 필터.
- ⚡ **전부 자동갱신 플러그인 파일** → install.ps1·zip 무변경, **기존 직원은 앱 재시작 시 자동 반영**.
- 👤 신규 직원 추가 시: 토큰 발급 + `staff-map.json`에 `"<actor_id>":"이름"` 1줄 추가(push) = 끝.
- 검증: resolve-staff.js 4케이스 PASS(신나래/이지연/토큰없음→빈칸/미매핑→빈칸).
- 🔭 더 강한 per-user 관리(사용량·보안 직원별)는 Claude Team 플랜(per-seat) — 인원 늘면 검토.

## v1.6 (2026-06-29)
**플러그인 설치 SSH 오류 해결 — SSH 키 없는 직원 막힘 (실제 발생)**
- 🐛 **증상**: `/plugin install` 시 `Host key verification failed` / `Could not read from remote repository`. Claude Code 플러그인 설치가 `source:"github"`를 **SSH(git@github.com)로 클론**하는데 SSH 키 없으면 실패 — **Claude Code 알려진 버그**(이슈 #47088·#52234·#29722 등 8건 전부 open, HTTPS 폴백 없음). 마켓플레이스 메타·스킬 파일은 HTTPS라 받아짐 → `/시작` 안내는 뜨는데 스킬 로드만 실패.
- 🛡 **수정**: install.ps1이 git에 **GitHub SSH→HTTPS 재작성** 설정(`insteadOf`)을 멱등 적용 → 키 없이 public repo 클론 성공. 실측: 적용 후 `git ls-remote git@github.com:...`가 키 없이 실제 HEAD 반환.
  ```
  git config --global --add url."https://github.com/".insteadOf "git@github.com:"
  git config --global --add url."https://github.com/".insteadOf "ssh://git@github.com/"
  ```
- ℹ️ **이미 막힌 직원**: 새 파일 불필요 — 위 2줄을 "줄갭 Claude"에 붙여넣고 `/plugin install zulgap@zulgap-team-pack` 재실행이면 즉시 해결.
- ℹ️ 더 깔끔한 대안(마켓플레이스 source를 `url`+HTTPS로 고정)은 우리 버전 미검증 + 포맷 오류 시 등록 silent-fail 위험이라 보류. 검증된 insteadOf만 채택.
- 📦 zip 구성: v1.5와 동일 6파일 (install.ps1만 갱신).
- ⚠️ **신규 배포는 v1.6으로** (v1.3~v1.5 폐기).

## v1.5 (2026-06-29)
**설치 안정성 강화 — '관리자 권한으로 실행' 안 해서 막히던 문제 근본 해결 + 엣지케이스 방어**
- 🛡 **install.bat self-elevation**: `net session`으로 관리자 감지 → 아니면 **UAC로 자가 재실행**. 직원은 더블클릭 → "예" 클릭이면 끝(우클릭 '관리자 권한으로 실행' 불필요). 실측: 비관리자 컨텍스트에서 elevation 분기 발동 확인.
- 🛡 **winget 경로 직접 resolve**: 관리자(self-elevate) 컨텍스트에서 per-user WindowsApps(winget)가 PATH에서 빠지는 함정 → `Get-Command` 실패 시 `LOCALAPPDATA\Microsoft\WindowsApps\winget.exe` 직접 사용. 없으면 App Installer 안내 후 종료. 실측: resolve→`winget --version` v1.28 실행 OK.
- 🛡 **PATH 갱신(Update-Path)**: winget로 Node 갓 설치 후 같은 세션에서 `npm`을 못 찾던 문제 → 머신+유저 PATH 재로딩. 실측: node 경로 검출 OK.
- 검증: install.ps1 구문 0에러 + install.bat CRLF 13줄·비ASCII 0·`>nul` 정상 + admin감지/winget/PATH 4종 PASS.
- 📦 zip 구성: v1.4와 동일 6파일 (install.bat·install.ps1만 갱신).
- ⚠️ v1.4는 배포 전 단계 — **신규 배포는 v1.5로** (v1.4의 자동갱신·CRLF 포함).

## v1.4 (2026-06-29)
**원격 자동갱신(알집式) + install.bat CRLF 버그 수정**
- 🐛 **install.bat CRLF 버그**: v1.3까지 `.bat`이 LF 줄바꿈 + 한글 echo → cmd.exe UTF-8 파서가 줄 첫 글자 먹음(`'ode'`/`'xecutionPolicy'`/한글깨짐). → **CRLF + ASCII 전용**으로 재작성(한글 안내는 BOM 있는 install.ps1 담당). `.gitattributes`(`*.bat eol=crlf`) 신설로 재발 영구 차단.
- ✨ **스킬 자동갱신**: install.ps1이 마켓플레이스 등록에 `autoUpdate:true` → Claude Code 시작 시 스킬 자동 pull(zip 재설치 불필요).
- ✨ **안내문 원격 자동갱신**: standalone SessionStart 훅(`hooks/team-guide-fetch.js`) 설치 → 매 세션 GitHub `team-guide.md`를 fetch해 주입. 안내문(명령·도구) 수정 = GitHub 파일 1개 수정 → 직원은 다음 세션에 자동(재설치/zip 불필요). 오프라인이면 캐시.
- 🔀 안내 분리: `team-guide.md`(휘발성=명령·도구, 원격 자동) / `team-CLAUDE.md`(불변=안전수칙 stub).
- ⚠️ 한계: 첫 설치 1회는 불가피(알집도 설치파일 받음). 훅 *로직* 변경 시만 재설치(드묾). standalone 훅 채택 사유=플러그인 번들 훅 additionalContext 미주입 버그(#16538).
- 📦 zip 구성: **6개** — `install.bat`, `install.ps1`, `team-CLAUDE.md`, `team-guide.md` 제외(원격이라 zip 불필요), `hooks/team-guide-fetch.js`, `mcp-bridge/{index.js,package.json}`. → 실제: install.bat·install.ps1·team-CLAUDE.md·hooks/team-guide-fetch.js·mcp-bridge/index.js·mcp-bridge/package.json (6).
- 검증: install.ps1 구문 0에러 + 훅주입 멱등/기존보존 3케이스 PASS + 훅 node 구문·JSON계약 PASS.

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
