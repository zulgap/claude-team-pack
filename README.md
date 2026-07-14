# 줄갭 팀원용 Claude Code 패키지 (claude-team-pack)

줄갭 팀원이 각자 윈도우 PC에서 **사장님처럼 콘텐츠 작업**을 할 수 있게 해주는 Claude 플러그인입니다.
직원은 **Claude Code**로 사용합니다(아래 `install.bat`이 자동 설치). 데스크탑 앱은 선택입니다.

## 포함된 것
- **스킬(직원)**: `시작`(노션 허브 현황 보기), `저장`(작업 기록), `블로그`·`키워드`(황금키워드·황금질문 조사)·`인입`·`이미지`·`썸네일`(유튜브 썸네일 — 한글 텍스트 픽셀 정확)·`검단가온보고서`·`노블냥`
- **스킬(개발자, 영어)**: `start-dev`(업무 보드 로드 + 오늘 플랜), `wrapup-dev`(저널 기록 + 스탠드업 생성)
- **MCP 도구**: 노션(자료 불러오기, 각자 로그인) · PPT(pptx) · 한글(hwp, ※ 한컴오피스 필요) · **제디(jedi, 회사 데이터 조회 — 개인 토큰 필요)**

---

## 🧑‍💻 직원 설치 (자동 — 메뉴 조작 불필요)

1. **`install.bat` 더블클릭** → 자동으로 전부 설치: Git·Node·uv + **Claude Code** + 줄갭 플러그인 자동 등록(`~/.claude/settings.json`) + 바탕화면 **"줄갭 Claude"** 바로가기
   - 중간에 `JEDI_TOKEN`을 물어보면 → 토큰 받은 직원만 붙여넣기, 없으면 Enter
2. 바탕화면 **"줄갭 Claude"** 더블클릭 → **같은 계정으로 로그인**(처음 한 번) → 줄갭 도구 자동 설치
3. `/시작` 입력 → 노션 허브가 뜨면 **완료** 🎉

> 노션이 안 열리면 = 노션 워크스페이스 초대 필요 (노션은 직원이 각자 본인 계정으로 로그인).
> (선택) 데스크탑 앱 **Code 탭**에서도 동일하게 동작(앱 최신 버전일 때). 안 되면 "줄갭 Claude" 아이콘이 가장 확실.

### 🤖 제디(회사 데이터) 연결 — 선택 (토큰 받은 직원만)
회사 데이터(판단·도구)를 제디로 조회하려면 **개인 토큰(JEDI_TOKEN)**이 필요합니다.
1. 사장님께 토큰 요청 → 사장님이 `railway run node scripts/issue-mcp-token.js --actor <당신ID> --tenant <테넌트ID>`로 발급해 한 줄을 줍니다.
2. **`install.bat` 실행** → `JEDI_TOKEN` 물어볼 때 받은 한 줄 붙여넣기 (이미 설치했으면 install.bat **다시 실행**).
3. **"줄갭 Claude"(또는 데스크탑 앱) 재시작** → 제디 도구 활성화.

> **안전 설계**: 제디는 공용 도구목록(`.mcp.json`)에 **없습니다.** 토큰을 입력한 직원의 개인 설정(`~/.claude.json` + 데스크탑 앱)에만 등록되므로, 토큰이 없는 직원은 제디 항목 자체가 안 생겨 **노션·PPT·한글에 어떤 영향도 없습니다.**
> 토큰은 **본인 권한·테넌트 안에서만** 동작하고 **읽기 위주**입니다. 토큰을 남에게 주지 마세요.

### (참고) 자동 등록이 안 됐을 때 — 수동 등록
```
/plugin marketplace add zulgap/claude-team-pack
/plugin install jedi-core@zulgap-team-pack
/plugin install zulgap-pack@zulgap-team-pack
/plugin install dev-pack@zulgap-team-pack   (개발자만)
/reload-plugins
```

---

## 🌏 개발자(dev) 설치 — 원격 개발팀·인턴용 (v1.18~)

같은 패키지를 **영어 개발자 모드**로 설치합니다. 차이는 3가지뿐:
- `install-dev.bat` 더블클릭 (내부적으로 `install.ps1 -Role dev`)
- 팀 지침 = **영어판**(`team-CLAUDE-en.md` → `~/.claude/CLAUDE.md`) — production 인프라·시크릿·migration·master push 금지 규칙 포함
- 세션 안내문 = **영어 dev 가이드**(`docs/dev-guide-en.md`, 원격 자동갱신) — `~/.claude/zulgap/role` 파일이 `dev`면 훅이 이걸 fetch

개발자 워크플로우: `/start-dev`(노션 Dev Task Board 로드 + 오늘 플랜) → 작업 → `/wrapup-dev`(팀 세션 저널 기록 + 텔레그램 스탠드업 메시지 생성).

> 기존 직원(staff)은 영향 없음 — role 파일이 없으면 훅은 기존 team-guide.md를 그대로 fetch.
> 개발자에게도 제디 토큰은 동일 절차(위 섹션)로 발급. **이 repo의 write 권한은 개발자에게 주지 않습니다** (원격 갱신 채널 = 전 직원 PC 코드 실행 권한).

### 🔑 역할(role)의 원천 = 제디 토큰 (v1.20~, 관리 SSOT)

역할은 **제디 토큰 JWT의 role claim**에서 매 세션 자동 유도됩니다 (훅이 라이브 해석):

| 토큰 role | 팀팩 역할 | 동작 |
|---|---|---|
| `ADMIN` / `master` | **master** | 팀 가이드 주입 skip, CLAUDE.md 안 건드림 (사장님 어드민 기기) |
| `dev` / `developer` | **dev** | 영어 dev 가이드 + start-dev 워크플로우 |
| 그 외 (`PM`/`MEMBER`/`USER`…) | **staff** | 기존 한국어 가이드 (기존 직원 자동 매핑) |

- **역할 변경 = 토큰 재발급 1곳** (`issue-mcp-token.js --role dev`) — 다음 세션부터 자동 반영. role 파일은 토큰 없는 설치 초기의 폴백일 뿐.
- ⚠️ 개발자 토큰은 반드시 `--role dev`로 발급할 것 (안 주면 배정 role(PM/MEMBER)이 박혀 staff로 매핑됨).
- 이 매핑은 안내문/워크플로우 선택용 — 데이터 권한은 종전대로 서버가 토큰을 검증해 집행.

---

## 🍎 macOS 설치 (v1.19~) — zip 불필요, 터미널 한 줄

필요 파일을 전부 GitHub에서 받아오므로 zip이 필요 없습니다. 터미널(Terminal)에 한 줄:

```bash
# 직원(staff)
curl -fsSL https://raw.githubusercontent.com/zulgap/claude-team-pack/main/install.sh | bash

# 개발자(dev, 영어 모드)
curl -fsSL https://raw.githubusercontent.com/zulgap/claude-team-pack/main/install.sh | bash -s -- --role dev
```

하는 일은 Windows판과 동일: git/node/uv(Homebrew 필요 시) + Claude Code + 플러그인 자동 등록 + 훅 2종 + 제디 토큰(선택) + 바탕화면 `Zulgap Claude.command`. 기존 `~/.claude/CLAUDE.md`가 있으면 덮기 전 `.bak` 백업(어드민 맥 안전장치).

> Homebrew가 없고 git/node도 없는 새 맥이면 먼저 https://brew.sh 한 줄 설치 후 재실행.

---

## 🛠 사장님 업데이트 (= 직원 PC에 반영)

1. 이 repo 파일 수정 → `git push` (사장님이 원격 배포만 하면 끝)
2. 직원: **"줄갭 Claude" 재시작하면 자동으로 최신** — 재설치 불필요.
   - 원리: 매니페스트에 `version`을 두지 않아(커밋 SHA 기반) 커밋마다 새 버전으로 인식 + `autoUpdate=true`(install이 설정) → 세션 시작 시 자동 pull.

새 스킬을 추가하려면 해당 팩의 `plugins/<팩>/skills/<이름>/SKILL.md` 폴더를 더하고 push 하면 됩니다 (공유 스킬=jedi-core·프로토콜 준수 / 줄갭 전용=zulgap-pack / 개발자=dev-pack). **`version` 필드는 다시 넣지 마세요** — 넣으면 그 값에 고정돼 직원 PC가 갱신을 못 받습니다(2026-07 사고 원인).

> **기존 직원(이 fix 이전 설치)은 딱 1번 전환 스텝**: "줄갭 Claude" 재시작 → 그래도 새 스킬이 안 보이면 `/plugin marketplace update zulgap-team-pack` 한 줄 실행(또는 `install.bat` 재실행). 이 1회 이후로는 재시작만으로 항상 최신.

---

## ⚠️ 주의 (보안)
- **production 키(Railway·Supabase·Cloudflare)는 포함하지 않습니다** — 사장님 전용.
- 같은 Claude 계정을 3명이 쓰면 사용 한도를 공유하니, 자주 막히면 계정 분리를 검토하세요.
- PPT·한글 도구가 안 되면 PC를 한번 재시작하거나(PATH 갱신) 사장님께 알려주세요.

## 🔐 키 공유 — 지금은 불필요 (나중에)
지금 직원 도구(노션·PPT·한글)는 **공유할 비밀번호가 없습니다** (노션은 각자 로그인). 나중에 직원과 **유료 API 키**(예: 이미지·영상 생성)를 공유하게 되면 → `docs/1password-setup.md` 참고.
