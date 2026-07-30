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

### 🔴 하드리밋 — 고객사 정보 4등급 (2026-07-30 확정)

| 등급 | 무엇 | `shared` | `tenant-only` |
|---|---|---|---|
| **A 절대금지** | 테넌트 UUID · 노션 page/DB ID(32-hex) · 공유폴더 UNC 경로(`\\…`) · 개인 PC 절대경로(`C:\Users\…`) · 토큰·키 | ❌ **0건** | ⚠️ 허용하되 **그 회사에만 활성화**가 전제 |
| **B 본체금지** | 회사·브랜드·채널명 · 담당자명 · 브랜드 색상 지정 · 특정 회사 인물/운영 규칙 | ❌ **0건** → 값 파일로 | ✅ 허용 |
| **C 위치제한** | 자사(줄갭)명 · 근거·출처·실측 이력 | `PROVENANCE.md`에만 | 동일 |
| **D 무해** | 기술 용어 · 도구 이름 · 공개 URL | ✅ | ✅ |

**위반 = 심사 REJECT.** 판정은 사람 눈이 아니라 **`check-plugin-consistency.js` Tier D**가 한다(§4⑧).

> 🔴 **A급이 특별한 이유**: B급은 새어도 "누구 것인지 보이는" 수준이지만, A급은 **남의 회사 폴더에 파일이 써지거나 남의 계정으로 유료 API가 호출되는** 경로다. 그래서 `shared`에서는 예외가 없다.
> ⚠️ **`tenant-only`의 A급을 지우면 안 되는 경우가 있다** — 테넌트 가드(`image_url`에 자사 tenant UUID가 있는지 확인하는 류)는 **격리 장치 자체가 A급**이다. 해법은 리터럴 제거가 아니라 **그 팩을 해당 회사에만 활성화**하는 것(§5).
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
| ① | 본체 테넌트 리터럴 0 | §1 **4등급** 기준. `shared`는 A·B급 0건 (PROVENANCE.md·값 파일 제외). 자동 검사 = 아래 ⑧ |
| ② | preset_slots 선언 완비 | frontmatter에 `tier` + `preset_slots` 존재, required 슬롯 ≥1. `version` + `origin`(personal/teampack)도 필수 (mtime 추측 제거 — 2026-07-22 정책 헌법 §7) |
| ③ | 예시 값 파일 ≥1 동봉 | 값 파일 폴더(`presets/` 또는 `channels/`)에 실사용 검증된 것 1개+ |
| ④ | requires 선언 | 제디 도구·endpoint·config 의존 전부 명시 |
| ⑤ | 프롬프트 3종 패턴 준수 | 지시문이 수치 하드리밋 / 금지 리터럴 열거 / 예시쌍+셀프체크 중 ≥1 사용 (`prompt-authoring-protocol.md`) |
| ⑥ | 플러그인 이름 집합 일치 | `node scripts/check-plugin-consistency.js` → exit 0 (marketplace.json ↔ install.ps1 ↔ install.sh ↔ hook-doctor-v2.js, 활성화 집합 + 레거시 잔존 2단 검사. 2026-07-22 정책 헌법 §7 드리프트 봉합) |
| ⑦ | **스킬 이름 ASCII kebab-case** | 같은 스크립트의 **Tier C**. `name`은 `^[a-z][a-z0-9]*(-[a-z0-9]+)*$` — **한글·비-ASCII 금지**(명령 식별자에서 문자당 `-`로 소실 → 같은 글자수끼리 전부 겹쳐 엉뚱한 스킬이 실행됨. 2026-07-26 실사고). 플러그인 내 중복 0 + **플러그인 간 bare 이름 충돌 0**(접두 없는 `/name` 호출이 불확정해지므로). 팩 접두 권장: jedi-core → `jedi-*`, zulgap-pack → `zulgap-*`. 🔴 **폴더명도 `name`과 동일한 ASCII 필수**(C-4) — 스킬 중복 판정(dedup)은 frontmatter 치환 **전** 폴더명 기반 ID에서 일어나 한글 폴더는 같은 글자수끼리 겹쳐 하나만 생존한다(2026-07-28 실사고: name만 ASCII로 바꾼 v2.5가 무효였음) |

| ⑧ | **`tier` 선언 + A급 리터럴 0** | 같은 스크립트의 **Tier D** (2026-07-30 신설). **D-1** `tier` 미선언 = FAIL / **D-2** `tier: shared` + A급 리터럴 = FAIL. `tenant-only`의 A급은 정보성 출력(FAIL 아님 — §1 단서 참조) |

이 표가 그대로 **미래 마켓플레이스의 등록 심사 기준**이다.

> 🔴 **심사는 사람이 아니라 CI가 한다** (2026-07-30 실측 근거).
> 게이트가 검사하는 규칙 = **12/12 = 100% 준수** / 사람 눈으로만 보는 규칙 = **8%**.
> 같은 repo·같은 사람·같은 문서인데 갈린 유일한 차이가 **검사 코드의 유무**였다.
> 그리고 이 체커는 2026-07-22부터 있었으나 **CI에 안 걸려 있어** PR #53 이후 자기 자신이 6개 PR 동안 적색 방치됐다.
> → **게이트를 만드는 것보다 자동으로 돌게 하는 것이 결정적이다.** 배선: `.github/workflows/plugin-consistency.yml`

## §5 등급 분류

- `tier: shared` — core 팩 배치 가능, 이 프로토콜 전체 준수
- `tier: tenant-only` — **전용 팩(`<tenant>-pack/`)에만 배치**. core 팩 배치 금지. 본체에 회사 문맥 하드코딩 허용(어차피 그 회사만 씀)
- 판정 기준 1줄: "본체 알고리즘을 다른 회사가 그대로 쓸 수 있나?" YES → shared / NO → tenant-only
- tenant-only → shared 승격 = 본체에서 테넌트 값을 preset_slots로 빼내는 리팩터링 + §4 심사 통과

### 🔴 미선언 = `shared` 간주 (fail-closed, 2026-07-30)

`tier`를 안 적으면 **"전용이라 §1~§4 면제"인지 "공용인데 미준수"인지 구분이 불가능**하다 — §0의 면제 판정 자체가 성립하지 않는다.
그래서 **미선언은 안전한 쪽(`shared`)으로 간주**하고 Tier D가 FAIL을 낸다. **전용 스킬은 한 줄 적어야 면제된다.**
> 실측: 2026-07-30 이전 12개 스킬 중 `tier` 선언은 **1개(8%)**뿐이었다. 나머지 11개는 면제 대상인지 아닌지를 파일에서 증명할 수 없었다.

### ⚠️ `tenant-only`의 전제 — 아직 미이행 (2026-07-30 기준)

`tenant-only`는 **그 회사에만 활성화**되는 것이 전제다. 그래야 §1이 A급을 허용하는 근거가 선다.
그런데 현재 `install.sh` / `install.ps1`은 `zulgap-pack`을 **role 분기 없이 무조건 활성화**한다 — 즉 타사 PC에도 전용 스킬 본문이 내려간다.
데이터는 토큰이 막지만 **파일에 적힌 거래처 문맥은 노출**된다. **첫 고객사 배포 전에 반드시 조건부로 바꿀 것.**

## 인증 이력

| 스킬 | tier | 인증일 | 비고 |
|---|---|---|---|
| ~~썸네일~~ → `jedi-thumbnail` | shared | 2026-07-14 → **2026-07-30 재인증** | 1호 인증. ⚠️ **인증이 시간에 따라 조용히 실효됐던 사례** — 인증 시점엔 리터럴 0이었으나 이후 관리자 PC 절대경로·노션 DB ID가 본체에 유입됐고 `presets/`→`channels/` 개명으로 §4③ 근거 경로도 어긋났는데 **재검사 주체가 없어 아무도 몰랐다**. 2026-07-30에 A급 제거 + Tier D 자동 검사 배선으로 해소 |

> 🔴 **인증은 시점의 상태일 뿐 지속 보증이 아니다.** 위 사례가 그 증거다 — 그래서 §4⑧(Tier D)을 CI에 걸어 **매 PR마다 재검사**되게 했다. 인증 표는 이력이고, **판정 SSOT는 CI**다.

## 관련

- jedi-forge SKILL.md Phase 0-D (5) "팀팩/Claude Code 배포 스킬" 케이스 + Phase 2 체크리스트 게이트
- 백엔드 런타임 스킬 규격(층 다름): `~/.claude/skills/jedi-forge/references/skill-spec.md`
- 팀팩 거버넌스: main = PR 경유 + AI 셀프머지 금지 (push 권한 = 전 직원 PC 코드 실행 권한)
