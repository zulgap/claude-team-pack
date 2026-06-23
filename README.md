# 줄갭 팀원용 Claude Code 패키지 (claude-team-pack)

줄갭 팀원이 각자 윈도우 PC에서 **사장님처럼 콘텐츠 작업**을 할 수 있게 해주는 Claude Code 플러그인입니다.

## 포함된 것
- **스킬**
  - `시작` — 노션 마스터 허브를 열어 "오늘 무엇부터" 현황 보기
  - `세션저널` — 작업 끝에 노션 팀 세션저널 DB에 5섹션으로 기록
- **MCP 도구**
  - 노션 (자료·정본 불러오기 — 직원이 각자 로그인)
  - PPT (pptx — 발표자료 생성)
  - 한글 (hwp — 한글 문서, ※ 한컴오피스 설치 필요)

---

## 🧑‍💻 직원 설치 (`install.bat` 더블클릭)

1. Claude Code 설치 + **같은 계정으로 로그인**
2. 마켓플레이스 추가: `/plugin marketplace add zulgap/claude-team-pack`
3. 설치: `/plugin install zulgap@zulgap-team-pack`
4. 새로고침: `/reload-plugins`
5. `/시작` 입력 → 노션 허브가 뜨면 **완료** 🎉

> 노션이 안 열리면 = 권한 문제. 사장님께 **노션 워크스페이스 초대**를 요청하세요. (노션은 직원이 각자 본인 계정으로 로그인합니다)

---

## 🛠 사장님 업데이트 (= 직원 PC에 자동 반영)

1. 이 repo 파일 수정 → `git push`
2. 직원: `/plugin marketplace update zulgap-team-pack` → `/reload-plugins`

새 스킬을 추가하려면 `skills/<이름>/SKILL.md` 폴더를 더하고 push 하면 됩니다.

---

## ⚠️ 주의 (보안)
- **production 키(Railway·Supabase·Cloudflare)는 포함하지 않습니다** — 사장님 전용.
- 같은 Claude 계정을 3명이 쓰면 사용 한도를 공유하니, 자주 막히면 계정 분리를 검토하세요.

## 🔐 키 공유 — 지금은 불필요 (나중에)
지금 직원 도구(노션·PPT·한글)는 **공유할 비밀번호가 없습니다** (노션은 각자 로그인). 나중에 직원과 **유료 API 키**(예: 이미지·영상 생성)를 공유하게 되면 → `docs/1password-setup.md` 참고.
