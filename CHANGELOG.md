# 직원 배포 패키지 변경 이력 (CHANGELOG)

> 직원에게 전달하는 부트스트랩 zip(`claude-team-pack-for-staff_vX.Y.zip`)의 버전·변경 내역 정본.
> 플러그인 본체(스킬 `/시작`·`/저장`·`/블로그` + 노션/PPT/한글 도구)는 GitHub 마켓플레이스로 별도 설치되며, 이 zip은 **직원 PC 부트스트랩**(install.bat → Git/Node/uv + 제디 토큰 등록)만 담는다.

## 파일명 규칙
- 형식: `claude-team-pack-for-staff_vX.Y.zip` (파일명에 버전 표기 — 옛 zip과 한눈에 구분)
- 위치: `C:\Users\admin\claude-team-pack-for-staff_vX.Y.zip`
- 새 버전 배포 시: ① 이 CHANGELOG에 항목 추가 → ② zip 재생성(버전 bump) → ③ 노션 팀원용 페이지 첨부 교체 + 관리자용 빠른 참조 파일명 갱신

---

## v2.3 (2026-07-17) — 맥 더블클릭 설치파일 + 설치 시점 role 토큰 유도 (설치기 전용 · zip 변경 없음)
**"설치파일이 왜 역할별로 나뉘나?" (사장님) → 안 나뉘게 통일. role의 원천 = 토큰(v1.20 독트린)을 설치 시점까지 확장.**
- 🆕 `install.command`: 맥 더블클릭 설치파일 1개 (윈도우 install.bat 대응). install.sh 원격 실행 1줄 래퍼 — 로직 추가 금지. Gatekeeper는 우클릭→열기 1회. `.gitattributes`에 `*.command eol=lf` (CRLF shebang 방지, *.sh와 동일 사유).
- 🔄 `install.sh` §2.5 / `install.ps1` §4.5: **JEDI_TOKEN을 role 분기 전에 선입력** → JWT claim에서 staff/dev/master 자동 유도해 `--role`/`-Role` 인자를 덮어씀 (매핑 = hooks/team-guide-fetch.js와 동일 — admin/master→master·dev/developer/engineer→dev·그 외→staff, **3곳 동기 필수**). 합성 JWT 3종(ADMIN/dev/PM) 양 OS 실측 PASS. 토큰 없으면 인자 폴백(기존 동작 그대로 — 기존 직원 회귀 0).
- 효과: 관리자 맥/윈도우 설치도 별도 파일 불필요 — install.command / install.bat 하나로 전 역할 커버 (master는 CLAUDE.md 보존 자동 적용). `install-dev.bat`은 토큰 없는 원격 개발자용 폴백으로 존치.
- ⚠️ **macOS 15(Sequoia)+ Gatekeeper 실측 (2026-07-17 사장님 맥)**: "우클릭→열기" 우회 폐지 — .command 파일 경로는 시스템 설정→개인정보 보호 및 보안→"그래도 열기" 필요. **맥 1순위 안내 = 터미널 한 줄(curl | bash, 차단 없음)**, zip 파일은 방법 B로 강등 (README·노션 팀원용/관리자용 페이지 동기 완료).
- 📦 zip 변경 없음(신규 설치부터 적용, 기존 설치 PC 무영향). 롤백 = git revert.

## v2.2 (2026-07-16) — /저장 프롬프트 수집 + 핸드오프 (데이터 해자 팀원 개통 · 플러그인 전용 · zip 변경 없음)
**진단: 팀원 프롬프트가 `prompt_log`에 0건 = 표면 문제.** 팀원 주력 = Claude Code 데스크탑(Code탭)인데 [GitHub #27527](https://github.com/anthropics/claude-code/issues/27527)로 settings.json 훅이 전부 미발화 → `prompt-capture.js`(UserPromptSubmit 훅)가 안 돎. 스킬·bash는 그 탭에서도 정상 작동하므로 **캡처를 훅 → /저장 스킬로 이동해 우회**.
- 🆕 `plugins/jedi-core/skills/저장/collect-prompts.js`: /저장 실행 시 세션 프롬프트를 결정론 추출(`CLAUDE_CODE_SESSION_ID` env → transcript jsonl) → `prompt_log`로 전송(기존 `/mcp/ext/prompt-log` 재사용). turn_uuid 멱등 = 훅과 중복 0(실측: 훅 잡은 것과 turn_uuid 정확히 일치 → 재적재 0). 실행자 토큰 → 그 팀원 테넌트 + `is_owner=false`. 토큰없음/실패 시 조용히 skip.
- 🔄 `plugins/jedi-core/skills/저장/SKILL.md`: ① **0단계 프롬프트 수집**(저널 여부 무관 항상 실행) ② **핸드오프 프롬퍼 섹션**(작업 미완료 시 `~/.claude/specs/`에 다음 세션 진입점 5블록 작성) 추가.
- 🆕 `hooks/precompact-handoff.js` + install.ps1 §6.7 / install.sh PreCompact 등록: 컨텍스트 압축 직전 자동 핸드오프 스냅샷 + 터미널 배너. ⚠️ **Desktop Code탭은 #27527로 미발화** — CLI/터미널 사용분에만 작동(버그 픽스되면 자동 개통). Desktop 핸드오프의 실질 담당은 /저장 스킬 핸드오프 섹션(스킬이라 그 탭에서도 돎).
- **한계(운영 지침 필요)**: 수집은 팀원이 /저장을 돌려야 발화(Desktop은 자동 훅이 다 죽어 자동 발화 불가). "세션 끝 /저장"을 지침화 권장.
- 📦 zip 변경 없음(플러그인·훅은 원격 pull 자동). PreCompact 훅만 재설치 필요(단 Desktop 미발화라 급하지 않음). 롤백 = git revert.

## v2.1 (2026-07-15) — `/스킬` 명령 신설 (플러그인 전용 · zip 변경 없음)
**팀원이 지금 쓸 수 있는 스킬을 한눈에 + 즉시 실행 (jedi-core 코어 메타 스킬)**
- 🆕 `plugins/jedi-core/skills/스킬`: `/스킬` 또는 "무슨 스킬 있어" → 이 PC에 설치된 줄갭 스킬 목록을 설명과 함께 카테고리로 보여주고, 이름·번호를 말하면 그 자리에서 바로 실행. 파일 스캔 없이 Claude Code가 주입하는 "사용 가능 스킬 목록"을 렌더 → **설치된 것 = 이 팀원 보유분**이라 테넌트·역할 자동 정합, 새 스킬이 배포되면 목록에 자동 표시.
- 설명은 각 스킬 자체 description(SSOT)에서 → 본문 하드코딩 0(드리프트 방지). 본체 테넌트 리터럴 0(스킬 패키징 프로토콜 §1 준수) — 회사 전용 스킬은 실행 시점 목록에서 동적 배치.
- 📦 zip 변경 없음(부트스트랩 5파일 무변경) — 원격 pull로 전 직원 자동 반영. spec `2026-07-15-teampack-skill-list-command`.

## v2.0 (2026-07-15) — 플러그인 3분리 (멀티테넌트 제품화 PR-3 · ★ zip 재생성·노션 첨부 교체 필요)
**단일 플러그인 → jedi-core / zulgap-pack / dev-pack 분리 (JEDI Business OS 1단계, spec 2026-07-14-teampack-productization)**
- 🆕 `plugins/jedi-core/` (공유 코어 — 시작·저장·이미지·키워드·인입·썸네일 + 노션·PPT·한글 MCP) / `plugins/zulgap-pack/` (줄갭 전용 — 검단가온보고서·노블냥·블로그*) / `plugins/dev-pack/` (start-dev·wrapup-dev). *블로그는 레포명 하드코딩 정화 후 core 승격 예정.
- 🔄 구 `zulgap` 플러그인 = **전환기 병존** (manifest `skills` 필드가 신 경로 3곳을 가리킴 — 전환 안 된 PC도 스킬 계속 작동, fail-safe). 플러그인 스킬은 `플러그인명:스킬명` namespace라 이름 충돌 원천 불가(공식 문서 확인). 전원 전환 확인 후 다음 릴리스에서 구 정의 제거.
- 🆕 `hooks/hook-doctor-v2.js`: 기존 직원 무재설치 전환 — enabledPlugins를 신 3플러그인으로 flip(role 분기: dev/master만 dev-pack, 토큰 JWT claim > role 파일 > staff — team-guide-fetch.js와 동일 매핑). 멱등 + fail-safe(실패 시 구 플러그인 그대로 = 스킬 정상). 채널 = team-guide.md·dev-guide-en.md 자가점검 v2 섹션(`.hook-doctor-v2.done` 플래그). ⚠️ master(사장님) PC는 가이드 주입 skip이라 수동 전환(설정 1줄 또는 install 재실행).
- 🔄 `install.ps1`·`install.sh`: 신규 설치 = 신 플러그인만 활성 + role 분기(dev/master→dev-pack 추가) + 재실행 시 구 플러그인 비활성(hook-doctor 실패 PC 폴백 경로) + `.hook-doctor-v2.done` 선기록.
- 롤백 = 이 repo git revert (플러그인 콘텐츠는 원격 pull — revert 커밋이 곧 전 직원 롤백). settings 롤백 = `zulgap@zulgap-team-pack: true` 1줄.
- 📦 zip v2.0 재생성 필요 (install.ps1 변경). **③ 노션 첨부 교체는 사장님 수동.**

## v1.21 (2026-07-14) — 스킬 패키징 프로토콜 v1 + 썸네일 1호 인증 (플러그인 전용 · zip 변경 없음)
**멀티테넌트 제품화 PR-1 — 공유 스킬 표준 규격 신설 (JEDI Business OS 1단계)**
- 🆕 `docs/skill-packaging-spec.md`: 스킬 3층 분리(본체/프리셋/연결) 정본 — 본체 테넌트 리터럴 0 하드리밋, frontmatter `tier`/`preset_slots`/`requires` 선언, 설치 인터뷰 규약(§3), 마켓 등록 심사 5항목(§4), shared/tenant-only 등급(§5). 앞으로 팀팩·마켓에 올라가는 공유 스킬은 이 규격 준수.
- ✅ `skills/썸네일` **1호 인증** (스킬 자체는 PR #29에서 추가됨): 본체에서 채널·회사 리터럴 전부 제거(프리셋 참조로 치환) + frontmatter 3필드 선언 + 근거·실측 출처를 `PROVENANCE.md`로 분리. 동작 변경 0 — 프리셋(`presets/`) 값이 동일하게 주입됨.
- 근거 spec: `2026-07-14-teampack-productization-skill-packaging.md` (PR-1/4). 직원 반영 = 앱 재시작 시 autoUpdate 자동.

## v1.20 (2026-07-12) — role SSOT = 제디 토큰 (원격+installer · zip 변경 있음)
**역할(master/dev/staff)의 단일 원천을 토큰 JWT claim으로 통일 (사장님 mandate "관리 SSOT = 토큰별 구분")**
- 🔄 `hooks/team-guide-fetch.js`: 매 세션 제디 토큰(`~/.claude.json` → 데스크탑 config 폴백, Win/mac 양쪽) role claim 라이브 유도 — `admin|master`→master(**가이드 주입 skip**, 개인 컨텍스트 보존) / `dev|developer|engineer`→dev / 그 외(PM·MEMBER·USER)→staff. 토큰 없으면 role 파일 폴백 → staff. **토큰↔파일 불일치 시 토큰 우선** (역할 변경 = 토큰 재발급 1곳, drift 원천 제거).
- 🔄 `install.ps1`·`install.sh`: `--role master` 추가 — **CLAUDE.md를 절대 덮지 않음**(개인 마스터 설정 보존, 어드민 기기용).
- 실측 근거: 사장님 토큰 role=`ADMIN` / 발급 스크립트 role = `--role 인자 > 배정 role > 'USER'` → 기존 직원(PM/MEMBER) 자동 staff 매핑 = 회귀 0. 기존 설치 PC는 옛 훅 그대로라 이중 안전.
- ⚠️ 운영 규칙: 개발자 토큰은 반드시 `issue-mcp-token.js --role dev`로 발급.
- 📦 zip v1.20 재생성 필요 (install.ps1 + hooks/team-guide-fetch.js 변경분).

## v1.19 (2026-07-12) — macOS 설치기 (원격 전용 · zip 변경 없음)
**`install.sh` — 맥 한 줄 설치 (Wave 1.5, 사장님 맥 어드민 겸용 + 인턴 맥 대비)**
- 🆕 `install.sh`: `curl -fsSL .../install.sh | bash -s -- [--role dev]` — **로컬 파일 의존 0** (스텁·훅·브리지 전부 raw fetch, zip 불필요). install.ps1과 동일 계약: HTTPS insteadOf·플러그인 자동 등록(맵 형태)·훅 2종 멱등 등록·제디 토큰(브리지 고정 위치)·role 파일. 추가 안전장치: 기존 `~/.claude/CLAUDE.md` 덮기 전 `.bak` 백업(어드민 맥), 데스크탑 런처 `Zulgap Claude.command`.
- 🔄 `.gitattributes`: `*.sh eol=lf` (CRLF shebang = 맥 bad interpreter 차단 — bat CRLF 규칙의 역방향).
- ✅ 검증 2회 연속: bash -n + LF-only + JSON 병합 시뮬 11종(신규/보존/멱등/jedi 2표면/CLAUDE.md 백업) + raw fetch 6 URL 200.
- ⚠️ 실기기 dogfood = 사장님 맥 (머지 후). Homebrew 부재+git/node 부재 새 맥은 brew 선설치 안내 후 종료(자동 설치 안 함 — sudo/Xcode CLT 상호작용 회피).
- 👤 대상: 맥 사용자 신규 설치만. Windows·기존 직원 조치 없음.

## v1.18 (2026-07-12) — dev 에디션 (zip 변경 있음 · 개발자 신규 설치용, 기존 직원 재설치 불필요)
**개발자(원격 인턴)용 영어 모드 추가 — 인도네시아 개발 인턴 온보딩 (spec `2026-07-12-teampack-dev-edition.md`)**
- 🆕 `skills/start-dev/`·`skills/wrapup-dev/` (영어명 스킬): 노션 **Dev Task Board**(`985ecf48-6810-4a4c-9fc3-79b2889dc79f`) 로드 + 오늘 플랜 / 팀 세션 저널 기록(작성자 귀속 재사용) + 텔레그램 스탠드업 메시지 생성. literal `/명령` = 이름 정확 매칭이라 영어명 신설 (v1.2 한글화 사고의 역방향 재발 방지).
- 🆕 `docs/dev-guide-en.md`: 영어 dev 가이드 (브랜치·small PR·daily rebase·DoD·스탠드업 양식·금지영역) — team-guide와 같은 원격 자동갱신 채널.
- 🔄 `hooks/team-guide-fetch.js`: 역할 분기 — `~/.claude/zulgap/role`이 `dev`면 dev-guide-en.md fetch(캐시 `dev-guide.cache.md`), **staff 경로·캐시 파일명은 기존과 동일(회귀 0)**. 훅은 설치 시점 심기라 기존 직원 PC는 옛 훅 그대로 = 영향 없음.
- 🔄 `install.ps1`: `param -Role staff|dev` + role 파일 기록 + dev면 `team-CLAUDE-en.md`를 CLAUDE.md로 배치 + dev 완료 안내 영어.
- 🆕 `install-dev.bat` (CRLF·ASCII 검증): 개발자 더블클릭 진입점 (`install.ps1 -Role dev`).
- 🆕 `team-CLAUDE-en.md`: 영어 안전 지침 stub (production 인프라·시크릿·migration·master push 금지).
- 📦 zip: `claude-team-pack-for-staff_v1.18.zip` 재생성 필요 (install.ps1/install-dev.bat/team-CLAUDE-en.md 추가 — 부트스트랩 7파일). 기존 직원은 재설치 불필요(스킬·가이드는 원격 자동).
- 👤 대상: 신규 개발자 설치만 `install-dev.bat` 사용. 기존 직원 조치 없음.

## v1.17 (2026-07-05) — 플러그인 전용 (원격 배포만 → 재설치 불필요) — 자동 갱신 정상화
**`version` 필드 제거 — 팀원이 재설치 없이 최신 스킬을 자동으로 받게 (사장님 mandate "배포만 하면 재설치 없이")**
- 🐛 근본: `plugin.json`·`marketplace.json`의 `version`이 `0.1.0`에 동결 → Claude Code가 "버전 그대로 = 갱신 없음"으로 보고 옛 캐시 유지 → 블로그·이미지·인입·검단가온·노블냥 5개 스킬이 기존 직원 PC에 영영 안 내려감(신나래 실측: 3개짜리 구버전 로드, `/노블냥` 미노출).
- ✅ fix: 두 매니페스트에서 `version` 필드 제거 → 커밋 SHA 기반 versioning → 커밋마다 새 버전으로 인식. `autoUpdate=true`(install.ps1 기설정)와 합쳐져 **세션 시작 시 자동 pull → 재시작 = 최신**. 공식 문서 확인: version 고정 시 "same version → keeps cached copy".
- ⚠️ 기존 직원 1회 전환: "줄갭 Claude" 재시작 → 그래도 안 보이면 `/plugin marketplace update zulgap-team-pack` 1줄(또는 install.bat 재실행). 이후로는 영구 자동(재설치 불필요).
- 🚫 앞으로 매니페스트에 `version` 다시 넣지 말 것 — 넣으면 그 값에 고정돼 갱신 차단(이번 사고 원인). CHANGELOG vX.Y는 사람용 변경 이력으로 계속 유지(플러그인 갱신 트리거는 이제 커밋 SHA).
- 👤 대상 직원: 위 1회 전환 후 조치 없음. jedi `-32000` 재연결 실패는 별개(개인 토큰/설정 — install.bat 재실행 시 JEDI_TOKEN 재입력).

## v1.16 (2026-07-05) — 플러그인 전용 (zip 변경 없음 · 재설치 불필요)
**`/노블냥` 스킬 추가 — 노션 카드로 노블냥(엔노블) 숏폼 영상 자동 제작 (줄갭 담당 전용)**
- 🆕 `skills/노블냥/`: 노션 카드 링크 1개 → 후킹 인트로 + 본편(한국어 음성·자막) + 1.2배속을 자동 제작해 엔노블 공유폴더에 저장. 이미지·영상은 제디 `ext_generate_image`/`ext_image_to_video_seedance`(씨댄스 2.0), 자막·후킹·배속은 로컬 ffmpeg(첫 실행 시 ffmpeg-static 자동 설치).
- 🔒 줄갭 전용: 첫 이미지 URL의 tenant가 줄갭이 아니면 즉시 중단(다른 회사에 노블냥이 생성되는 것 방지). 신나래·이지연(줄갭 토큰) 대상.
- 🔄 `team-guide.md`: 명령 목록에 `/노블냥` 추가(원격 자동 갱신).
- 👤 대상 직원: 추가 조치 없음(줄갭 JEDI_TOKEN 등록돼 있으면 `/노블냥` 자동 노출). **Windows + 맑은 고딕 필요**(자막). 유료(이미지 2 + 씨댄스 영상 2/편).

## v1.15 (2026-07-04) — 원격 전용 (zip 변경 없음 · 재설치 불필요) — 훅 자가치유
**hook-doctor 자가치유 — 6/30 이전 설치 PC에 지시문 캡처 훅(prompt-capture) 원격 등록 (사장님 승인 2026-07-04)**
- 🆕 `hooks/hook-doctor.js`: prompt-capture.js 배포 + settings.json UserPromptSubmit 멱등 등록 (백업 후 수정, fail-safe exit 0, 8s 타임아웃, 완료 플래그 `.hook-doctor-v1.done`)
- `team-guide.md` "시스템 자가점검" 섹션: 직원 Claude가 플래그 없을 때 1회만 hook-doctor 실행 → **재설치 없이 다음 세션에 자동 복구** (알집式 원격 갱신의 훅 확장판)
- 배경: prompt-capture 훅(v1.13, 6/30 #14)은 install.ps1 실행 시점에만 등록 → 6/29 설치 직원 PC 전원 미등록 → prompt_log 직원 데이터 0건 (production 실측 2026-07-04). 서버측(인입 endpoint·색인 크론 전 테넌트·recall 토큰 격리)은 기완성 — 훅 도달이 마지막 조각
- ⚠️ 거버넌스: team-guide → 코드 실행 채널이므로 **팀팩 repo push 권한 = 전 직원 PC 실행 권한** — main 머지는 PR 경유 유지

## v1.12 (2026-07-03) — 플러그인 전용 (zip 변경 없음 · 재설치 불필요)
**`/검단가온보고서` 스킬 추가 — 검단가온치과 월간 성과 보고서 자동화 (담당자 전용)**
- 🆕 `skills/검단가온보고서/`: 5채널(플레이스·검색광고·블로그·홈페이지 GA4·AVI) 수집→노션 6페이지 발행 워크플로우. 26년 6월 보고서에서 전 구간 실증.
- 🤖 Playwright 무인 수집 스크립트 4종 동봉(scripts/): 스마트플레이스 4화면 덤프 / 블로그 지표 xlsx 4종(교차출처 iframe 관통) / 검색광고 일별 CSV+캠페인 xlsx("지난달" 프리셋 자동). 네이버 로그인 세션은 "로그인 상태 유지"로 영속화 — 최초 1회 로그인 후 무인.
- 🔐 로그인 정책: ID/PW 자동입력 금지(캡차 위험). 로그인 필요 시 초보자용 표준 안내문으로 요청.
- ⚙️ 사전 준비(직원 PC 1회): 임의 폴더에 `npm i playwright && npx playwright install chromium`(또는 PLAYWRIGHT_DIR 지정). AVI 측정은 Railway 권한자 전용(스크립트 동봉).
- 📊 26-06 신설 "원단위 광고비 원가 관리"(예약당/통화당/유입당) 섹션이 종합 보고서 필수 항목으로 템플릿 KB에 등록됨.

## v1.11 (2026-06-30) — 플러그인 전용 (zip 변경 없음 · 재설치 불필요)
**`/이미지` 스킬 추가 — 텍스트로 이미지 생성(BYOC 표준 사례)**
- 🆕 `skills/이미지/SKILL.md`: 원하는 그림을 한국어로 말하면 제디 `ext_generate_image` 도구로 줄갭 백엔드(GPT Image 2 → 실패 시 Gemini 자동 폴백) 생성. 비율(`1:1`/`9:16`/`3:4`/`16:9`/`4:3`)만 정하면 됨 — 한국어→영문 자동 번역.
- 🔄 `team-guide.md`: 명령 목록에 `/이미지` 추가 + 제디 도구 설명에 "이미지 생성" 반영(원격 자동 갱신).
- 🔒 회사(tenant)는 개인 JEDI_TOKEN으로 자동 고정 — `tenant_id` 인자 미주입(서버 강제). 생성물은 본인 회사 Storage(`{tenant}/generated/`)에 격리 저장 + content_asset 자동 등록.
- ⚙️ 백엔드: 제디 MCP 외부 tier에 `ext_generate_image`(+`generate_image` 별칭) 노출(judgmentos PR #1944, v7.355.0). 브릿지·install.ps1 무변경 — 토큰 등록한 직원은 앱 재시작 시 자동 활성.
- 🧱 옛 방식 제거: `railway run python gen-image.py`·OPENAI_KEY·python·openai 의존 0 → 직원 PC에서 그대로 사용. 영어 프롬프트 수동 변환도 불필요(백엔드 내장).
- 🖼 v1 범위: 텍스트→이미지 생성 중심. 참조 이미지(얼굴·스타일 유지)는 **웹 URL** 있을 때만(`mode:edit`+`preserve_fidelity`). 한글 텍스트는 1차 시안→디자인 재식자 권장.
- 👤 신규 직원: 추가 조치 없음(JEDI_TOKEN만 등록되어 있으면 `/이미지` 자동 노출).

---

## v1.10 (2026-06-29) — ★ zip 재생성·재설치 필요 (install.ps1 변경)
**새 PC "claude 인식 안 됨" + 플러그인 등록 실패 진단 강화 (실제 직원 발생)**
- 🐛 **증상①** `'claude'은(는) 내부 또는 외부 명령... 아닙니다`: claude.ai 설치기가 `~/.local/bin`을 **User PATH에 등록 못 하는** 경우가 있음(직원 PC 실측) → 바탕화면 "줄갭 Claude"(`cmd /k claude`)가 claude를 못 찾음. 사장님 PC는 이미 등록돼 있어 안 보이던 갭(설치 검증은 직원 환경 기준).
- 🛡 **수정①**: 설치기 PATH 등록을 신뢰하지 않고, `claude.exe` 존재 시 `.local\bin`을 **User PATH에 멱등 등록 + 세션 PATH 갱신**. 재실행 시 재다운로드 방지(설치 조건에 `claude.exe` 존재 추가).
- 🛡 **수정②**: 바탕화면 바로가기를 **claude 절대경로**(`cmd /k "%USERPROFILE%\.local\bin\claude.exe"`)로 — PATH 의존 원천 제거(winget 설치분은 `/k claude` 폴백).
- 🐛 **증상②** `[경고] 플러그인 자동 등록 실패`: catch가 실제 예외를 안 찍어 원인 미상이었음 → **`$_.Exception.Message` 1줄 노출** + claude 실행 후 폴백 명령(`/plugin marketplace add ... → install`) 안내 추가.
- 📦 zip 구성: v1.6과 동일 6파일 (install.ps1만 갱신).
- ℹ️ **이미 막힌 직원**: PowerShell에 `.local\bin` PATH 보장 1블록 붙여넣기로 즉시 해결(재설치 전). 신규/재배포는 **v1.10**.
- 🧭 메타: 새 PC 첫 설치 관문 버그 4번째 — CRLF(v1.4)·winget/관리자(v1.5)·SSH(v1.6)·**PATH(v1.10)**. 전부 1회성.
- 검증: install.ps1 PowerShell parse 0에러.

## v1.9 (2026-06-29) — 플러그인 전용 (zip 변경 없음 · 재설치 불필요)
**`/인입` 스킬 추가 — 자료를 디지털 트윈에 자동 적재**
- 🆕 `skills/인입/SKILL.md`: 자료(강의·문서·작업·종목/키워드)를 주면 제디 `ingest_data` 도구로 자동 분류 → 객체 매핑 → 3종 DB(기록·검색·관계) 탑재.
- 🔄 `team-guide.md`: 명령 목록에 `/인입` 추가 + 제디 도구 설명에 "자료 인입" 반영(원격 자동 갱신).
- 🔒 회사(tenant)는 개인 JEDI_TOKEN으로 자동 고정 — 인입은 본인 회사로만(서버가 토큰 클레임에서 강제). 매핑 모호 시 검수 큐 → 미니앱 검토탭에서 확정(AI는 초안까지).
- ⚙️ 백엔드: 제디 MCP 외부 tier에 `ingest_data` 노출(judgmentos PR #1935). 브릿지·install.ps1 무변경 — 토큰 등록한 직원은 앱 재시작 시 자동 활성.
- ⚡ 전부 자동갱신 플러그인 파일 → install.ps1·zip 무변경, 기존 직원 앱 재시작 시 자동.
- 👤 신규 직원: 추가 조치 없음(JEDI_TOKEN만 등록되어 있으면 `/인입` 자동 노출).

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
