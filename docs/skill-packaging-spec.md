# 스킬 패키징 프로토콜 (Skill Packaging Spec) v1

> **정본(SSOT)** — 팀팩/마켓에 배포되는 모든 **공유(shared) 스킬**의 규격.
> 목적: 좋은 스킬 1개를 여러 회사가 "설치하면 자기 회사에 맞게 조정된 상태"로 쓸 수 있게 한다.
> 근거 spec: `~/.claude/specs/2026-07-14-teampack-productization-skill-packaging.md` (JEDI Business OS 1단계)
> 짝 게이트: jedi-forge SKILL.md Phase 0-D (5) + Phase 2 매핑 체크리스트

## §0 적용 범위

| 대상 | 적용 |
|---|---|
| `tier: shared` 스킬 (마켓/타 테넌트 배포 후보) | **전체 필수** (§1~§4) |
| `tier: tenant-only` 스킬 (특정 회사 전용 — 예: 검단가온보고서, 노블냥) | §5만 (전용 팩 격리). §1~§4 면제 |
| 백엔드 런타임 스킬 (`unified-agent/skills/`, agent_skill DB) | **해당 없음** — 층이 다름. 그쪽 정본 = `jedi-forge/references/skill-spec.md` |

## §1 3층 구조 (파일 레이아웃)

```
skills/<스킬명>/
├── SKILL.md          ← 본체 (모든 회사 공용 알고리즘·지시문)
├── presets/          ← 치수 카드 (회사·채널당 1파일 — 테넌트 값은 전부 여기)
│   └── <회사·채널>.md
├── templates/ scripts/ ← 공유 부품 (선택)
└── PROVENANCE.md     ← 근거·출처·실측 이력 (선택 — 심사 grep 제외 영역)
```

**🔴 하드리밋 — 본체(SKILL.md) 테넌트 리터럴 0건.** 금지 리터럴: 회사명·채널명·브랜드 색상 지정·노션 page/DB ID·특정 회사 인물 규칙. 위반 = 심사 REJECT.
- 회사별 **값** → `presets/<회사>.md`
- 회사별 **인프라 설정**(노션 허브 ID 등) → 하드코딩 금지, `GET /mcp/ext/teampack-config`(토큰 tenant 기준) 소비
- 근거·출처·실측 이력(정본 링크·측정 표본 등) → `PROVENANCE.md` (심사 grep **제외** — 단, 여기에 동작 분기를 넣는 것은 금지. 출처 기록 전용)
- `templates/` 주석의 실측 출처 표기는 허용 (동작 분기 금지 — 동작을 정하는 값은 preset이 인자로 주입)

## §2 빈칸 선언 (frontmatter)

본체 SKILL.md frontmatter에 "나를 회사에 맞추려면 무엇이 필요한가"를 선언한다:

```yaml
---
name: <스킬명>
description: <표준 description — 회사명 예시 금지, "<채널명>" 플레이스홀더 사용>
tier: shared                    # shared | tenant-only
preset_slots:                   # 프리셋 빈칸 (치수 카드 양식)
  타깃페르소나: { required: true,  source: interview }
  강조색:       { required: false, source: company_memory.brand.color }
  금칙어:       { required: false, source: interview }
requires:                       # 필요한 연결 (설치 시 충족 확인)
  jedi_tools: [ext_generate_image]          # 제디 도구
  endpoints: ["/mcp/ext/render-thumbnail"]  # 백엔드 endpoint
  config: []                                # teampack-config 계약 키 (예: notion.master_hub_id)
---
```

- `source` enum: `company_memory.*`(3DB에서 자동 채움 시도) / `tenant_config.*`(회사 카드에서 자동) / `interview`(설치 시 질문)
- `required: true` 슬롯이 미충족이면 스킬은 **명시 안내 후 범용 기본값** 또는 중단 — silent 진행 금지
- 슬롯 이름은 프리셋 파일의 섹션과 1:1 대응 (설치 인터뷰가 기계적으로 채울 수 있게)

## §3 설치 인터뷰 규약 (설치측 Claude 행동 규칙)

새 회사에 shared 스킬을 설치할 때, 설치를 진행하는 Claude는:

1. **`preset_slots` 읽기** — 빈칸 목록 파악
2. **자동 채움 시도** — `source`가 `company_memory.*`/`tenant_config.*`인 슬롯은 회사 메모리(3DB)·회사 카드에서 먼저 조회
3. **미충족 required만 질문** — 이미 채워진 슬롯 재질문 금지. 질문은 슬롯당 1개, 예시 포함
4. **`presets/<회사>.md` 생성** — 동봉 예시 프리셋의 섹션 구조를 그대로 따라 작성
5. **`requires` 충족 확인** — 제디 도구/endpoint 미가용이면 **명시 안내** (silent 진행 금지)

## §4 마켓 등록 심사 6항목 (품질 게이트)

| # | 항목 | 검증 방법 |
|---|---|---|
| ① | 본체 테넌트 리터럴 0 | `grep -E "<회사명들\|노션ID들>" skills/<스킬>/SKILL.md` → 0건 (PROVENANCE.md·presets/ 제외) |
| ② | preset_slots 선언 완비 | frontmatter에 `tier` + `preset_slots` 존재, required 슬롯 ≥1. `version` + `origin`(personal/teampack)도 필수 (mtime 추측 제거 — 2026-07-22 정책 헌법 §7) |
| ③ | 예시 프리셋 ≥1 동봉 | `presets/` 폴더에 실사용 검증된 프리셋 1개+ |
| ④ | requires 선언 | 제디 도구·endpoint·config 의존 전부 명시 |
| ⑤ | 프롬프트 3종 패턴 준수 | 지시문이 수치 하드리밋 / 금지 리터럴 열거 / 예시쌍+셀프체크 중 ≥1 사용 (`prompt-authoring-protocol.md`) |
| ⑥ | 플러그인 이름 집합 일치 | `node scripts/check-plugin-consistency.js` → exit 0 (marketplace.json ↔ install.ps1 ↔ install.sh ↔ hook-doctor-v2.js, 활성화 집합 + 레거시 잔존 2단 검사. 2026-07-22 정책 헌법 §7 드리프트 봉합) |

이 표가 그대로 **미래 마켓플레이스의 등록 심사 기준**이다.

## §5 등급 분류

- `tier: shared` — core 팩 배치 가능, 이 프로토콜 전체 준수
- `tier: tenant-only` — **전용 팩(`<tenant>-pack/`)에만 배치**. core 팩 배치 금지. 본체에 회사 문맥 하드코딩 허용(어차피 그 회사만 씀)
- 판정 기준 1줄: "본체 알고리즘을 다른 회사가 그대로 쓸 수 있나?" YES → shared / NO → tenant-only
- tenant-only → shared 승격 = 본체에서 테넌트 값을 preset_slots로 빼내는 리팩터링 + §4 심사 통과

## 인증 이력

| 스킬 | tier | 인증일 | 비고 |
|---|---|---|---|
| 썸네일 | shared | 2026-07-14 | **1호 인증** — 본체 리터럴 0, presets/엔노블.md 예시 동봉 |

## 관련

- jedi-forge SKILL.md Phase 0-D (5) "팀팩/Claude Code 배포 스킬" 케이스 + Phase 2 체크리스트 게이트
- 백엔드 런타임 스킬 규격(층 다름): `~/.claude/skills/jedi-forge/references/skill-spec.md`
- 팀팩 거버넌스: main = PR 경유 + AI 셀프머지 금지 (push 권한 = 전 직원 PC 코드 실행 권한)
