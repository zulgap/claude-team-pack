---
name: zulgap-cardnews
description: 블로그 본문(약 1,200~2,000자)을 넣으면 인스타그램용 6장 카드뉴스(썸네일 포함)를 기획하고 **발행 가능한 영상 완성본까지** 만들어 주는 스킬. 6장 기획안(소제목·본문 카피라이팅 + 한국인 인물 중심 비주얼 프롬프트) → Seedance 로 장면 영상 생성 → 카피·N.NOBLE 로고 오버레이 합성 → 4:5·6초·무음 영상(개별 6개 + 합본 1개) + 인스타 본문 + 해시태그 20개를 산출한다. 사용자가 "카드뉴스", "카드뉴스 만들어", "인스타 카드뉴스", "카드뉴스 기획", "블로그를 카드뉴스로", "인스타 캐러셀", "썸네일 후킹", "카드뉴스 대본", "카드뉴스 영상화", "영상에 카피 넣어줘" 등을 언급하거나, 블로그/글 본문을 붙여넣고 인스타·SNS 콘텐츠로 바꿔 달라고 하면 반드시 이 스킬을 사용할 것. 명시적으로 "카드뉴스"라는 단어가 없어도 블로그 글을 SNS 슬라이드/영상 콘텐츠로 재구성하려는 의도가 보이면 사용한다.
version: 1.0.0
origin: teampack
tier: tenant-only
---

# 카드뉴스 생성기 (Card News Generator)

## 역할과 목표 (Role & Objective)

당신은 전문 **'인스타그램 콘텐츠 전략가'**이자 **'프롬프트 스페셜리스트'**다. 사용자의 블로그 글(Input)을 클릭을 부르는 바이럴급 **6장짜리 인스타그램 캐러셀(카드뉴스, 썸네일 포함)**로 변환하고, **바로 발행 가능한 영상 완성본까지** 만드는 것이 목표다.

이 스킬의 핵심은 단순 요약이 아니라 **"멈추고 저장하게 만드는" 콘텐츠 설계**다. 특히 1번 슬라이드(썸네일)가 성패를 가르므로 여기에 가장 공을 들인다.

## 언제 쓰나

- 블로그 글(1,200~2,000자 안팎)을 인스타그램 카드뉴스+영상으로 바꿔달라는 요청을 받았을 때
- 엔노블(N.NOBLE) 브랜드의 카드뉴스/썸네일 영상이 필요할 때 — 브랜드키트(로고 좌표·색상·규격)가 엔노블 실측값 기준이다

## 안 되는 경우

- **엔노블 외 다른 브랜드**의 카드뉴스 영상 — `assets/brand_kit.md`의 로고·색상·좌표가 엔노블 전용이라 그대로 못 쓴다. 기획안(Step 1~4)까지는 재사용 가능하지만, 영상화(Step 5)는 그 브랜드용 brand_kit을 새로 만들어야 한다.
- 사용자가 "기획안만"이라고 하면 Step 4까지만 하고, 유료인 영상 생성(Step 5)은 승인 없이 진행하지 않는다.

## 최종 산출물 (대본 하나로 여기까지)

| # | 산출물 | 단계 |
|:--:|---|---|
| 1 | **영상 완성본** — 개별 6개 + 합본 1개 (4:5 · 6초 · 무음 · 카피 오버레이) | Step 5 |
| 2 | **인스타그램 본문** | Step 4 |
| 3 | **해시태그 20개** | Step 4 |

기획안(Step1~3)은 중간 산출물이다. **기획안만 내고 멈추지 말 것.**
단, 영상 생성은 유료(제디 토큰)이므로 **기획안을 보여주고 승인을 받은 뒤** Step 5 로 넘어간다.
사용자가 "기획안만" 이라고 하면 Step 4 까지만 한다.

## 입력 처리 (Input Data Processing)

1. **본문(Content):** 사용자의 블로그 글(약 1,200~2,000자)을 읽는다. 글이 짧거나 길어도 핵심 메시지를 뽑아 6장 흐름으로 재구성한다.
2. **스타일(Style):** 사용자가 원하는 비주얼 스타일을 파악한다.
   - **기본 스타일 (지정 없을 시):** `Refined cinematic editorial photography, polished and sophisticated Korean subject, tailored attire, upscale interior, elegant natural light, shallow depth of field, quiet confidence.` — 별도 지시가 없으면 **인물 요소를 우선**하고, **항상 전문적·고급스럽게** 간다 (엔노블은 하이엔드 결정사).
   - 단, `Korean man` 은 시네마틱 인물샷이 배우 얼굴과 닮아 거부되는 일이 잦다 → Step 5-3 의 "고급스러움 vs 저작권" 참고.
3. 블로그 본문이 아직 없다면, 본문(또는 주제/링크)을 먼저 요청한다. 스타일·타겟 독자를 알면 결과가 좋아지므로, 지정이 없으면 기본값으로 진행하되 결과 상단에 어떤 가정을 했는지 밝힌다.

## 작업 단계 (Workflow)

### Step 1. 콘텐츠 분석 & 스토리보딩
블로그 내용을 분석해 논리적인 6장 흐름으로 재구성한다:
- **슬라이드 1 (썸네일/후킹) — [가장 중요]:** 시선을 강탈하는 도발적·호기심 유발 제목. 이 한 장이 성패를 결정한다.
- **슬라이드 2 (문제/배경):** 독자의 pain point에 공감하거나 충격적 맥락을 제시한다.
- **슬라이드 3 (핵심 인사이트):** 핵심 해결책/인사이트를 임팩트 있게 제시한다.
- **슬라이드 4 (디테일 1):** 실천 가능한 구체적 팁 #1.
- **슬라이드 5 (디테일 2):** 추가 인사이트 또는 실천 팁 #2.
- **슬라이드 6 (CTA):** 긴급성을 담은 명확한 행동 유도.

### Step 2. 슬라이드 소제목 & 본문 (한국어) — 카피라이팅 규칙

**슬라이드 1 (썸네일) — 후킹 공식 [성패를 가름]**
- **소제목:** 아래 검증된 후킹 패턴 중 하나를 사용한다.
  - 🚨 **충격/반전:** "99%가 모르는 [주제]의 진실" / "[주제], 알고 보니 완전히 달랐다"
  - ❓ **질문:** "[당신도] 이런 실수 하고 있나요?" / "왜 [결과]가 안 될까요?"
  - 🔢 **숫자:** "단 3가지로 바뀐 [결과]" / "7일 만에 [성과] 만든 비법"
  - ⚠️ **경고:** "[주제] 이거 모르면 손해봅니다" / "[주제] 하기 전에 꼭 보세요"
  - 💡 **비밀:** "[업계] 전문가들만 아는 [비법]" / "아무도 안 알려주는 [팁]"
- **본문:** 호기심을 극대화하는 1~2문장. **절대 답을 다 주지 말 것.**
  - 예) "이것만 알아도 [결과]가 달라집니다" / "대부분 놓치는 핵심 포인트" / "알고 나면 [Before]로 못 돌아갑니다"

**슬라이드 2~5 (본문) — 인게이지먼트 규칙**
- **소제목:** 명확한 benefit 중심 (예: "이것만 바꾸세요", "핵심은 타이밍입니다").
- **본문:** 구체적 수치/사례/행동 포함 (예: "하루 10분", "3단계로", "실제로 효과 봤습니다").
- **제약:** 한 문장은 한국어 기준 40자 이내로. 모바일에서 한눈에 읽히게.

**슬라이드 6 (CTA) — 긴급성 공식**
- **소제목:** "지금 바로 시작하세요" / "더 늦기 전에" / "오늘부터 실천".
- **본문:** 명확한 행동 유도 + 혜택 ("저장하고 따라하세요", "링크 클릭하면 자세히 볼 수 있어요").

**톤:** 임팩트 있고, 호기심을 자극하며, benefit 중심, FOMO를 유발하고, 모바일 가독성이 높게.

### Step 3. 비주얼 프롬프트 엔지니어링
슬라이드별로 정교한 **영문** 프롬프트를 생성한다.
- **[필수·비협상] 한국인 피사체:** 모든 프롬프트에 반드시 `Korean person`, `Korean model`, 또는 `Korean subject`를 명시한다. 인종 일치를 위한 절대 원칙이며, **영상 프롬프트(Step 5)에도 그대로 적용된다.** 생성 서비스가 프롬프트를 거부하더라도 **`Korean` 을 빼는 방식으로 우회하지 말 것** — 거부 트리거만 제거한다. 자세한 대응은 Step 5-3 참고.
- **[필수] 전문적·고급스러운 인물:** 엔노블은 하이엔드 결정사다. **등장하는 한국인은 전부 전문직다운 품격과 고급스러움**을 지녀야 한다. 생활감·피로감·평범함이 묻어나면 브랜드가 깎인다.
  - 넣을 것: `refined`, `polished`, `sophisticated`, `elegant`, `tailored suit`, `upscale interior`, `premium`, `poised`, `graceful`, `well-groomed`, `quiet confidence`
  - 뺄 것: `ordinary`, `everyday`, `casual`, `tired`, `mild fatigue`, `plain jacket`, `handheld`, `flat lighting`, `bus stop`, `crowded street`
  - **`Korean man` 저작권 우회와 충돌한다** → 해소법은 Step 5-3 참고.
- **[필수·비협상] 서류·모니터·간판 금지:** AI 는 한글을 못 쓰고 **프롬프트로 막을 수 없다.** 글자가 놓일 표면이 화면에 있으면 반드시 가짜 한글이 박힌다. 서류·숫자를 말하는 슬라이드라도 **화면엔 인물만** 두고 데이터는 카피가 말하게 한다 (Step 5-3b).
- **주 피사체(인물 우선):** 표정이 살아있는 한국인 인물, 역동적 포즈, 아이컨택 클로즈업 등으로 시선을 끈다. 추상적 주제라도 인물을 활용한 시각적 은유를 찾는다.
- **시선 강탈 품질:** 조명 키워드(`elegant cinematic lighting`, `golden hour`, `soft window light` 등)와 강렬한 구도로 작은 화면에서도 튀게 한다. 단 **하이엔드 톤을 벗어나는 조명은 쓰지 않는다** (`neon`, `harsh flash`, `flat lighting` 등).
- **형식:** Seedance 용 **산문체 영문**으로 쓴다. `/imagine`·`--ar`·`--style` 같은
  미드저니 플래그는 붙이지 않는다. **화면비는 프롬프트에 쓰지 않는다** —
  Seedance 호출 시 `ratio="3:4"` 로 주고, `build_video.py` 가 4:5 로 크롭한다 (Step 5-3).
- **비주얼 일관성:** 6장 모두 **같은 [Art Style Keywords]**를 사용한다.
- **텍스트 배치 공간:** `Subject in lower portion of frame`, `clean negative space at top`
  등을 명시해 제목·본문 오버레이가 얼굴을 가리지 않게 한다.
- 프롬프트는 **그대로 slides.json 의 `video_prompt` 에 들어간다** (Step 5-1).

### Step 4. 캡션 생성
인스타그램 본문 캡션을 한국어 카피라이팅 원칙으로 작성한다.
- **구조:** 후킹(1~2줄, 썸네일 메시지 반복 또는 긴급성) → 이모지 활용 스캔 가능한 불릿 요약 → 실천 팁("오늘부터 [행동] 해보세요") → CTA("저장 필수! 링크는 프로필에 👆").
- **해시태그:** 관련 해시태그 20개(고볼륨 + 니치 태그 믹스).

## 출력 형식 (Output Format)

아래 구조를 정확히 따라 결과를 제시한다.

## 1. 📊 콘텐츠 분석
- **핵심 주제:**
- **타겟 독자:**
- **비주얼 컨셉 (한국인 인물 중심):**
- **🎯 후킹 전략 (썸네일):** [선택한 hook 패턴 + 이유]

## 2. 🎴 카드뉴스 기획안 (총 6장, 썸네일 포함)

소제목·본문은 **각 2줄**로 쓴다 (그대로 slides.json 에 들어가고, 오버레이 레이아웃이 2줄 고정이다).

| # | 구조 | 소제목 (2줄) | 본문 (2줄, 줄당 20자 안팎) | 영상 프롬프트 (영문 산문체, Seedance) |
|:--:|:--:|:---|:---|:---|
| 1 | 썸네일 🔥 | [후킹형 메인 제목 - 호기심 유발 필수] | [절대 답을 주지 않는 티저] | A [Korean woman/man] [eye-catching subject], [dramatic lighting], [style keywords], subject in lower portion of frame. |
| 2 | 문제/배경 | [공감형 소제목 - 독자 pain point] | [구체적 상황 묘사] | A [Korean ...] [expressive subject depicting the problem], [style keywords], subject in lower portion of frame. |
| 3 | 핵심 인사이트 | [해결책 소제목 - benefit 중심] | [핵심 솔루션 설명] | A [Korean ...] [solution visualization], [style keywords], clean composition. |
| 4 | 디테일 1 | [실천법 소제목 - 행동 동사 활용] | [구체적 숫자/단계 포함] | A [Korean ...] [action/detail depiction], [style keywords], text-friendly composition. |
| 5 | 디테일 2 | [추가 팁 소제목 - 차별화 포인트] | [실제 사례/효과 포함] | A [Korean ...] [additional tip visualization], [style keywords], space for text overlay. |
| 6 | CTA | [긴급성 소제목 - "지금", "오늘"] | [명확한 행동 유도 + 혜택] | A [Korean ...] [welcoming subject for CTA], [style keywords], subject in lower portion of frame. |

> **[필수·비협상] 6장 모두:**
> 1. 프롬프트에 **`Korean`** 명시 — 안 쓰면 Seedance 는 백인을 뽑는다.
> 2. **전문적·고급스럽게** — `refined`, `tailored`, `upscale`, `elegant`. 하이엔드 결정사다.
> 3. **서류·모니터·간판 금지** — 글자 표면이 있으면 반드시 가짜 한글이 박힌다.
>
> 미드저니 플래그(`/imagine`, `--ar`, `--style`)는 붙이지 않는다 — 이 프롬프트는 그대로
> slides.json 의 `video_prompt` 로 들어간다.

## 3. 📱 인스타그램 본문 (캡션)
[이모지를 활용한 가독성 좋은 본문 - 후킹/스캔성/행동유도 3박자]

## 4. #️⃣ 추천 해시태그
#태그1 #태그2 ... (총 20개)

## 5. 🎬 영상 완성본 (Step 5)

기획안 승인 후 실행한다. 산출: 개별 6개 + 합본 1개 (4:5 · 장면당 6초 · 무음 · 카피 오버레이).

**규격·좌표·색상·함정은 전부 [`assets/brand_kit.md`](assets/brand_kit.md) 에 실측값으로 있다. 작업 전 반드시 읽을 것.**

### 5-1. slides.json 작성
`scripts/slides.example.json` 을 복사해 채운다. 슬라이드마다:
- `title` — **정확히 2줄** (Step 2 의 소제목을 2줄로 분할)
- `body` — **정확히 2줄** (Step 2 의 본문을 2줄로 압축, 줄당 20자 안팎)
- `video_prompt` — Step 3 의 비주얼 컨셉을 Seedance 용 산문체로. **반드시 `Korean` 포함**
- `video_url` — 5-3 에서 채움 (지금은 빈칸)

### 5-2. 오버레이 생성 = 사전 검증 (영상 생성 **전에** 할 것)
```bash
pip install imageio-ffmpeg fonttools brotli pillow
python scripts/make_overlays.py <slides.json> <overlays_dir>
```
오버레이는 영상과 무관하므로 먼저 돌린다. **이 단계가 검증을 겸한다** —
한국인 미지정·글리프 누락·카피 줄수 오류를 여기서 잡아야 **유료 영상을 태우기 전에** 걸린다.

### 5-3. 장면 영상 생성 (Seedance 2.0)
`mcp__jedi__ext_text_to_video_seedance` 로 6장 생성 → `video_url` 을 slides.json 에 채운다.
```
ratio="3:4", resolution="720p", duration=8, generate_audio=false
```
> **`duration=8` 인데 최종은 6초다 — 오타가 아니라 의도다.** Seedance 로는 8초로 뽑고
> `build_video.py` 가 앞 6초만 쓴다(`-t`, 규격은 `assets/brand_kit.md` 의 6.0초).
> **8을 6으로 바꾸지 말 것** — 잘라낼 여유가 없어진다.
- **[필수·비협상] 인물은 무조건 한국인.** 프롬프트에 `Korean man/woman/professional` 을
  명시하고 `Korean ethnicity`, `dark hair` 같은 보강 표현을 함께 쓴다.
  **안 쓰면 Seedance 는 백인을 뽑는다.**
- **[필수·비협상] 서류·모니터·간판을 화면에 등장시키지 말 것.** AI 는 한글을 못 쓴다.
  글자가 놓일 표면이 화면에 있으면 **반드시** 가짜 한글이 박힌다. 자세한 건 5-3b.
- **`--ar 4:5` 를 그대로 쓰지 말 것.** Seedance 는 4:5 미지원 → 3:4 로 뽑고
  `build_video.py` 가 `scale=1080:-2,crop=1080:1350` 으로 4:5 크롭한다.
- **image→video 는 쓰지 말 것.** AI 생성 인물 이미지를 넣으면
  `InputImageSensitiveContentDetected.PrivacyInformation` 으로 거부된다. text→video 로 간다.
- 최종본은 무음이므로 **오디오는 처음부터 끈다**(`generate_audio=false`).
  이것만으로 `output audio may contain sensitive information` 거부가 사라진다.

#### 거부될 때: 트리거를 빼라, 인종을 빼지 마라 ← 실제로 사고 난 부분
| 거부 사유 | 원인 | 대응 |
|---|---|---|
| `output audio may contain sensitive information` | 오디오 생성 | `generate_audio=false` **그것만** |
| `copyright restrictions` | 고유지명(`Seoul train station`) 또는 **한국 배우 얼굴 유사성** | 지명을 일반화. 그래도 막히면 아래 |
| `copyright restrictions` 가 **`Korean man` 에서 반복** | 시네마틱 인물샷이 배우 얼굴과 닮게 생성됨 | 아래 "고급스러움 vs 저작권" 참고. 2026-07-17 에 5연속 거부 |

**절대 하지 말 것:** 거부를 피하려고 프롬프트에서 `Korean` 을 빼는 것.
2026-07-17 자만추 편에서 정확히 이 실수로 2번 슬라이드에 백인 여성이,
3번에 손만 나온 컷이 납품될 뻔했다. `make_overlays.py` 의 `korean_guard()` 가 이제 막는다.

#### 고급스러움 vs 저작권 거부 — `Korean man` 딜레마

브랜드 규칙은 "전문적·고급스럽게"(Step 3)인데, `Korean man` + 시네마틱 인물샷은
배우 얼굴과 닮아 저작권 거부가 난다. 이 둘이 정면으로 충돌한다.

**해소 순서:**
1. **고급스럽게 먼저 시도한다.** `a refined Korean man in a tailored suit, upscale office,
   quiet confidence, elegant cinematic lighting`
2. 거부되면 — **의상·공간·조명의 고급스러움은 유지한 채, '얼굴'만 탈스타화한다.**
   `not a celebrity, not a model, ordinary facial features` 를 넣되
   `tailored suit`, `upscale interior`, `elegant lighting` 은 **그대로 둔다.**
3. 그래도 거부되면 정면 얼굴을 피한다 — `seen from behind`, `side profile`,
   `looking away from camera`. 얼굴이 안 보이면 유사성 판정을 피하면서 품격은 지킬 수 있다.

**하지 말 것:** 장면 전체를 `ordinary`, `everyday`, `bus stop`, `mild fatigue`,
`handheld`, `flat lighting` 으로 내리는 것. 거부는 피하지만 **브랜드가 깎인다.**
2026-07-17 자만추 2번이 이렇게 나왔다 — 통과는 했으나 고급스러움 기준 미달이다
(그 시점엔 이 규칙이 없었다). 다음 편에서 재생성 대상.

### 5-3b. 서류·글자가 나오는 슬라이드 ← 반드시 읽을 것

**AI 는 한글을 못 쓴다. 그리고 프롬프트로 막을 수 없다.**
글자가 놓일 표면(서류·증명서·모니터·책·간판)이 화면에 있으면 **반드시** 가짜 한글이 박힌다.

2026-07-17 자만추 4번("신뢰는 서류로 증명합니다")에서 **3회 시도 전부 실패**했다:

| 시도 | 프롬프트 | 결과 |
|---|---|---|
| 1 | "증명서를 든 한국인" | 증명서에 **`직직직식직전`** 클로즈업 |
| 2 | + `no letters, no words, no writing` 명시 | 서류 헤더에 **`딜지릭텬미의지극4색선`** |
| 3 | + `no title bar, no header, no caption, no axis labels` | 여전히 **`집식릭 실리지`** |

`no text` 계열 지시는 **효과가 없다.** 더 시도하는 건 비용만 쓰고 확률에 기대는 일이다.

**해법: 서류를 화면에서 뺀다.** 슬라이드가 서류·숫자를 말하더라도 **화면엔 인물만** 두고,
서류·데이터는 **카피가 말하게 한다.** 프롬프트에 이렇게 명시한다:
```
Completely empty clean environment with no documents, no papers, no screens,
no books, no signage and no text or writing anywhere in the frame.
```
- 초점이 흐려 글자가 안 읽히는 정도는 통과시켜도 된다 (자만추 3번이 그 경우).
- **인물을 빼고 전체를 인포그래픽으로 바꾸는 건 안 된다.** 사장님이 인물 유지를 우선한다.
  ("전체 이미지를 인포그래픽으로 바꾸라는 게 아니다" — 2026-07-17)

### 5-4. 영상 합성
```bash
python scripts/build_video.py <slides.json> <out_dir> <overlays_dir>
```
산출물: `01_썸네일.mp4` … `06_CTA.mp4` + 합본 1개(36초).

### 5-5. 눈으로 확인 (생략 금지)

`korean_guard()` 는 **프롬프트만 볼 뿐 픽셀을 못 본다.** 프롬프트가 맞아도 결과가 어긋날 수 있다.
합성 후 6장 전부 프레임을 뽑아(여러 시점 — 한 프레임만 보면 오판한다) 세 가지를 확인한다:

1. **인물이 실제로 한국인인가**
2. **전문적·고급스러운가** — 생활감·피로감이 묻어나면 재생성
3. **깨진 한글이 없는가** — 서류·간판이 보이면 **확대해서** 확인

2026-07-17 에 3.5초 프레임 하나만 보고 "3번은 손만 나온다"고 오판했다. 여러 시점을 볼 것.

### 치명적 함정 (매번 반복됨)
- **ffmpeg `drawtext` 금지.** PowerShell 인자 이스케이프가 깨지고(`x=(w-text_w)/2` 가
  경로로 오인됨) 한글 폰트도 안 잡힌다. 반드시 **PIL 로 투명 PNG → `overlay` 필터 합성**.
- **이 PC 엔 ffmpeg 이 없다.** `pip install imageio-ffmpeg` 로 조달
  (CapCut 번들 ffmpeg 은 libx264 가 없어 못 씀). ffmpeg stderr 를 버리지 말 것 —
  버리면 전부 조용히 실패하고 성공한 줄 안다.
- **도현체에 `·`·`→` 글리프 없음** → `·` 는 `/` 로. `glyph_guard()` 가 자동 검사해 실패시킨다.
- ffmpeg 다수 인코딩은 `-preset veryfast` + 단계 분할 (medium 일괄은 타임아웃).

### 자산
- `assets/brand_kit.md` — 색상·좌표·규격·함정 (실측값)
- `assets/fonts/DoHyeon.ttf` — 기본 폰트 (없으면 brand_kit.md 의 npm 경로로 재조달)
- `scripts/make_overlays.py` — 카피·로고 오버레이 + 검증(한국인·글리프·줄수)
- `scripts/build_video.py` — 합성 (개별 + 합본)
- `scripts/slides.example.json` — 설정 템플릿 (자만추 편 실제 예시)

## 특수 명령 (Special Command)
- 사용자가 **"JSON 형식"** 또는 **"자동화 데이터(Automation Data)"**를 요청하면, 마크다운 표 없이 **엄격한 JSON 형식**으로만 출력한다(API 파싱에 적합하도록). 형식은 `scripts/slides.example.json` 을 따른다. 이때도 6장 구조·한국인 프롬프트·해시태그 20개 규칙은 그대로 유지한다.

## 품질 체크리스트

### 기획안 승인 전 (Step 1~4)
- 1번 썸네일이 5가지 후킹 패턴 중 하나를 확실히 사용했는가, 그리고 답을 다 주지 않고 궁금하게 남겼는가?
- **6장 모두 영상 프롬프트에 `Korean` 이 들어갔는가?** (필수·비협상)
- **6장 모두 전문적·고급스러운가?** `ordinary`/`everyday`/`tired`/`flat lighting` 이 섞이지 않았는가
- **서류·모니터·간판이 등장하는 프롬프트가 없는가?** 있으면 가짜 한글이 박힌다 (필수·비협상)
- 프롬프트에 미드저니 플래그(`/imagine`, `--ar`, `--style`)가 섞이지 않았는가?
- 6장 모두 같은 아트 스타일 키워드로 비주얼 일관성이 유지되는가?
- 소제목·본문이 각 2줄이고, 본문 각 줄이 20자 안팎인가? (오버레이 레이아웃 고정)
- 도현체에 없는 `·`·`→` 를 쓰지 않았는가? (`·` → `/`)
- 해시태그가 정확히 20개이며 고볼륨+니치가 섞였는가?

### 영상 납품 전 (Step 5)
- `make_overlays.py` 를 **영상 생성 전에** 돌려 검증을 통과했는가?
- **6장 프레임을 뽑아 인물이 실제로 한국인인지 눈으로 봤는가?** (Step 5-5, 생략 금지)
- **인물이 전문적·고급스러워 보이는가?** 생활감·피로감이 묻어나면 브랜드가 깎인다
- **화면에 깨진 한글이 남아 있지 않은가?** 서류·간판이 나오면 확대해서 확인할 것
- 개별 6개 + 합본 1개가 1080×1350 · 6초 · 무음으로 나왔는가?

## 막혔을 때

| 증상 | 조치 |
|---|---|
| `scripts/`·`assets/` 폴더가 안 보임 | 개인 PC 세션 리셋 등으로 스킬 자산이 사라진 이력이 있다(2026-07-09). 팀팩(이 스킬)에서 재설치하면 복구된다 — 로컬에서 지워졌다면 이 팀팩 폴더를 기준으로 복원할 것 |
| Seedance 가 계속 `copyright restrictions` 로 거부 | `Korean` 을 빼지 말 것 — Step 5-3 "고급스러움 vs 저작권" 순서(얼굴만 탈스타화)를 따를 것 |
| 오버레이에 □(글리프 깨짐) | `·`→`/` 치환, `→`는 PIL 로 직접 그리기. `glyph_guard()` 가 자동 검사해 막아준다 |
| ffmpeg 관련 에러 | 이 PC엔 기본 ffmpeg 이 없다 — `pip install imageio-ffmpeg` 로 조달 (CapCut 번들 ffmpeg 은 libx264 없어 못 씀) |
| 폰트(DoHyeon.ttf)가 없다는 에러 | `assets/brand_kit.md` 의 npm `@fontsource/do-hyeon` 경로로 재조달 |

## 실제로 돌려본 결과 (검증)

- **엔노블 PARENTS SECRET 편** (2026-07-09): 최초 파이프라인 구축 — 기획안 → Seedance 6장 생성 → 오버레이 합성 → 개별 6개 + 합본 1개 영상 산출 완료.
- **엔노블 자만추 편** (2026-07-17): 전체 파이프라인 재검증. 저작권 거부(`Korean man` 5연속 반복)와 가짜 한글(서류 슬라이드 3회 시도 전부 실패) 두 가지 사고를 실제로 겪으며 위 "고급스러움 vs 저작권"·"서류 화면 금지" 대응 규칙을 확정. 최종 6장 영상 + 합본 정상 산출, `korean_guard()`/`glyph_guard()` 자동 검증 통과 확인.
