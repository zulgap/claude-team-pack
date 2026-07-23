---
name: 노블냥
description: 노블냥(엔노블) 숏폼 영상 자동 제작 (줄갭 전용) — 노션 카드 링크 하나로 후킹 인트로 + 본편(한국어 음성·자막) + 1.2배속을 만들어 엔노블 공유폴더에 저장. "/노블냥", "노블냥 영상 만들어", "노블냥 카드 <링크>" 등에 호출. (줄갭 제디 토큰 필요)
version: 1.0.0
origin: teampack
---

# 노블냥 숏폼 자동 제작 (팀원용 · 줄갭 전용)

노션 카드 링크 1개 → 줄갭 백엔드가 이미지·영상을 만들고, 네 PC에서 자막·후킹·배속을 입혀 완성. 키 입력·judgmentos 설치 불필요 — **네 줄갭 제디 토큰**으로 회사 작업공간에 자동 저장·생성된다.

> **줄갭 제디 도구가 활성일 때만 동작** — 개인 `JEDI_TOKEN`(줄갭 배정) 필요. 없으면 `/시작`의 도구 안내 참고 또는 사장님께 토큰 요청.
> **결정론 우선**: 자막·후킹·배속은 고정 스크립트(로컬 ffmpeg). LLM은 창작만(후킹 카피·이미지 프롬프트·자막 분할).

## 전제조건 (없으면 안 돌아감)
1. **줄갭 JEDI_TOKEN 활성** — 이게 진짜 관문. 이 토큰이 줄갭이 아니면 아래 🔒 가드가 중단시킨다.
2. **Windows PC** — 맑은 고딕(자막·후킹 폰트). 없으면 자막이 깨질 수 있다.
3. **노션 접근** — 카드 페이지 읽기용(`notion-fetch`). 없으면 카드 내용(주제·대본)을 붙여넣어 달라고 요청.
4. **엔노블 공유폴더**(`\\zulgap\…`) 접근 — 되면 거기 저장, 안 되면 자동 로컬 폴백(바탕화면).

## 🔒 줄갭 전용 가드 (반드시)
첫 이미지 생성 직후, 반환된 `image_url` 경로에 **줄갭 tenant `a0000000-0000-0000-0000-000000000002`** 가 들어있는지 확인한다.
- 있으면 → 계속.
- **없으면 → 즉시 중단**: "이 스킬은 줄갭 토큰 전용입니다. 현재 토큰의 tenant가 줄갭이 아니라 중단합니다 (엉뚱한 회사에 노블냥이 생성되는 것 방지)." 이후 단계(영상 생성 등) 진행 금지.

## 설정 SSOT
| 키 | 값 |
|---|---|
| 줄갭 tenant (가드용) | `a0000000-0000-0000-0000-000000000002` |
| 노블냥 마스터 노션 | `2b5efa2f2c3b807782a0fda45fb05539` (identity·톤 참조) |
| 캐릭터 시그니처(불변) | 화이트 페르시안 친칠라 · 사파이어 블루 눈 · **대형 진주 목걸이** |
| 의상 규칙 | **한 영상 내 후킹↔본편 동일 아웃핏** (카드마다 가변 OK) |
| 후킹 규칙 | 2초 + **움직임 필수**(i2v) + **bait-and-switch 방지**(카피=본편 페이로드 일치) |
| 후킹 씬 | 카드 주제마다 다르게 |
| 길이 | 본편 15초(음성). 후킹 4초 생성→2초 트림. 최종 **1.2배속** ≈14.5초 |
| 공유폴더 | `\\zulgap\zulgap 공유폴더\0010 더줄갭프로젝트\PJ.36 엔노블\0008 AI 숏츠\02. 월별 콘텐츠\<월>\<카드번호>\03.완성본\` |
| 스크립트 | `<이 스킬 폴더>/scripts/` |

## 준비 (1회)
```bash
node "<이 스킬 폴더>/scripts/ensure-tools.mjs"
```
→ ffmpeg-static 자동 설치 + 폰트 확인. `font_warning` 뜨면 자막 깨질 수 있으니 사용자에게 고지.
작업폴더: 바탕화면 등에 `노블냥-run-<카드번호>/` (중간 파일).

## 워크플로우 (순서대로, 각 단계 검수)

### Phase 1 — 노션 카드 읽기
- 인자에서 **page id** 추출(URL `p=` 우선, 없으면 마지막 32-hex) → `notion-fetch`.
- 추출: 주제 · 코너형식 · 영상길이 · **음성 대본** · 자막 흐름 · **월/카드번호**(예 "26년 7월 카드 2/10" → 월=26년 7월, 번호=2).
- 노션 도구 없으면 사용자에게 카드 내용 붙여넣기 요청.

### Phase 2 — 창작 (LLM)
- **후킹 카피**: 카드 주제 기반 2줄(8자 내외). **본편이 즉시 증명**하는 내용(bait-and-switch 금지).
- **이 카드 아웃핏 1개**: 코너/무드에 맞게. **진주 목걸이 항상**. → 후킹·본편 프롬프트 양쪽에 동일 문구.
- **본편 이미지 프롬프트**(9:16, 시그니처+아웃핏+코너 배경). **한글 텍스트 금지**(깨짐).
- **후킹 씬 이미지 프롬프트**(9:16, 시그니처+**동일 아웃핏**+카드 주제 후킹 씬, 상단 여백).
- **자막 구간** 3~5개(줄당 ~14자, 넘으면 2줄), 0~15초 연속 커버.
- **본편 음성 대사**(자막과 일치, 한국어).

### Phase 3 — 프리뷰 + 확인 게이트 (필수)
후킹 카피 / 아웃핏 / 이미지 프롬프트 / 자막 / 저장경로를 1회 제시 → "진행" 후 Phase 4.
⚠️ 유료: 이미지 2 + 씨댄스 영상 2 생성.

### Phase 4 — 파이프라인 (MCP 도구 + 로컬 ffmpeg)
1. **본편 이미지** — `ext_generate_image` 호출(`prompt`, `aspect_ratio:"9:16"`. **`tenant_id` 절대 넘기지 말 것** — 토큰이 강제). → `image_url`.
   **→ 🔒 줄갭 가드: image_url에 `a0000000-0000-0000-0000-000000000002` 없으면 중단.**
2. **본편 영상** — `ext_image_to_video_seedance` 호출(`image_url`, `prompt`(음성대사 포함), `duration:15`, `ratio:"9:16"`, `resolution:"720p"`, `generate_audio:true`). → `video_url`.
3. **자막** — `node scripts/overlay-subtitles.js <params.json>` (input=본편 video_url, segments=자막구간). → content_sub.mp4. 몽타주 검수.
4. **후킹 이미지** — `ext_generate_image`(후킹 프롬프트, 동일 아웃핏). → image_url (가드 재확인).
5. **후킹 영상** — `ext_image_to_video_seedance`(`duration:4`, `generate_audio:false`). → clip_url.
6. **후킹 인트로** — `node scripts/build-hook.js <params.json>`(clip=clip_url, copy_text=후킹카피, trim_sec:2). → intro.mp4.
7. **합성** — `node scripts/assemble-final.js <params.json>`(intro + content_sub, speed:1.2). → final.mp4. 몽타주 검수.

### Phase 5 — 저장
```
node scripts/save-final.mjs <params.json>
```
params: `{ src:"…/final.mp4", dest:"<공유폴더 루트 월/카드 적용>\\노블냥_카드<N>_<주제>_후킹.mp4", fallback_dir:"<바탕화면>/노블냥_완성본" }`
→ 공유폴더 저장, 실패 시 바탕화면 폴백. 저장 경로를 사용자에게 보고.

## 함정/규칙
- **`tenant_id` 인자 절대 금지** — MCP WRITE 도구는 토큰 tenant로 강제(넘기면 무시되나 습관 방지).
- **씨댄스 최소 duration 4초** — 후킹 2초는 4초 생성 후 build-hook가 트림.
- **이미지에 한글 텍스트 금지**(깨짐). 자막·후킹 카피는 로컬 ffmpeg가 맑은 고딕으로 렌더.
- **자막 `%`** → 스크립트가 자동 처리(expansion=none). **오디오**: 본편 generate_audio:true / 후킹 false.
- **영상 도구가 5분 폴링** — `status:"processing"` + task_id로 반환되면(미완) 사용자에게 알리고 잠시 후 재시도.
- 검수는 프레임을 실제로 확인(Read) + 길이/오디오 확인. "생성됨 ≠ 정상".

## params JSON 예시 (작업폴더 WD 기준, Write 도구로 파일 작성)
- overlay-subtitles: `{ "input":"<본편 video_url>", "out":"WD/content_sub.mp4", "segments":[{"text":"요즘 결혼, 공식이 바뀌고 있어요","from":0,"to":3},{"text":"여성 연상 커플 20.2%\n사상 첫 20% 돌파","from":3,"to":7}] }`
- build-hook: `{ "clip":"<후킹 clip_url>", "copy_text":"'남자가 연상'\n공식이 깨졌다", "out":"WD/intro.mp4", "trim_sec":2 }`
- assemble-final: `{ "intro":"WD/intro.mp4", "content":"WD/content_sub.mp4", "out":"WD/final.mp4", "speed":1.2 }`
- save-final: `{ "src":"WD/final.mp4", "dest":"\\\\zulgap\\zulgap 공유폴더\\…\\26년 7월\\2\\03.완성본\\노블냥_카드2_결혼트렌드반전_후킹.mp4", "fallback_dir":"C:/Users/<나>/Desktop/노블냥_완성본" }`

## 안 되는 경우
- "`ext_generate_image` / `ext_image_to_video_seedance` 없음" → 줄갭 JEDI_TOKEN 미등록/미로드. 팀팩 최신 받고 Claude Code 새 세션. 그래도 없으면 사장님께 토큰 요청.
- 🔒 가드 중단 → 현재 토큰이 줄갭 아님. 줄갭 토큰으로 교체 필요.
- 폰트 경고 → Windows 아니거나 맑은 고딕 없음.
- 공유폴더 저장 실패 → 자동 바탕화면 폴백(save-final).
