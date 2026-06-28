# 직원 배포 패키지 변경 이력 (CHANGELOG)

> 직원에게 전달하는 부트스트랩 zip(`claude-team-pack-for-staff_vX.Y.zip`)의 버전·변경 내역 정본.
> 플러그인 본체(스킬 `/시작`·`/세션저널`·blog-publish + 노션/PPT/한글 도구)는 GitHub 마켓플레이스로 별도 설치되며, 이 zip은 **직원 PC 부트스트랩**(install.bat → Git/Node/uv + 제디 토큰 등록)만 담는다.

## 파일명 규칙
- 형식: `claude-team-pack-for-staff_vX.Y.zip` (파일명에 버전 표기 — 옛 zip과 한눈에 구분)
- 위치: `C:\Users\admin\claude-team-pack-for-staff_vX.Y.zip`
- 새 버전 배포 시: ① 이 CHANGELOG에 항목 추가 → ② zip 재생성(버전 bump) → ③ 노션 팀원용 페이지 첨부 교체 + 관리자용 빠른 참조 파일명 갱신

---

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
