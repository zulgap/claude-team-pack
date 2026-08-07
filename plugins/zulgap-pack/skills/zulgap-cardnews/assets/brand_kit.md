# 엔노블 카드뉴스 영상 브랜드키트

레퍼런스: 엔노블 PARENTS SECRET 카드뉴스 (2026-07-09), 자만추 편 (2026-07-17)
좌표·색상은 최종본 프레임에서 실측해 역산한 값. **임의로 바꾸지 말 것.**

## 규격

| 항목 | 값 |
|---|---|
| 해상도 | 1080 × 1350 (4:5) |
| 장면당 길이 | 6.0초 |
| 합본 | 6장 × 6초 = 36초 |
| 프레임레이트 | 30 fps |
| 오디오 | **무음** (`-an`) |
| 코덱 | libx264 / yuv420p / crf 20 / preset veryfast |
| 페이드 | 개별 in·out 0.4s / 합본 in·out 0.6s |

## 색상

| 요소 | 값 |
|---|---|
| 브랜드 골드 | `#D3B171` = rgb(211, 177, 113) |
| 제목 | 흰색 255,255,255 |
| 본문 | 흰색 alpha 224 |
| 페이지 번호 | 흰색 alpha 200 |
| 골드 박스 내부 텍스트 | rgb(38, 30, 18) |

## 레이아웃 (1080×1350 기준, 잉크 좌상단)

| 요소 | 좌표 |
|---|---|
| N.NOBLE 로고 | 중앙정렬, 잉크 상단 y=67, 높이 33, 폭 244 (자간으로 맞춤) |
| MATCH-MAKING BIBLE 박스 | x 376–705, y 124–157 (골드 채움) |
| 골드 라인 | x 96–176, y 866–872 (두께 6) |
| 제목 | x=98, 1줄 y=901, 2줄 y=993 (간격 92), 도현체 **70** |
| 본문 | x=99, 1줄 y=1113, 2줄 y=1173 (간격 60), 도현체 **42** |
| 페이지 번호 | 우측정렬 x=979, y=1270, 도현체 34 |
| 하단 그라데이션 | y 580→1250, alpha 0→200 (t^1.6 이징) |
| 상단 비네트 | y 0→330, alpha 165→0 (지수 1.3). 로고 잉크 구간 y=67~99 에 alpha 104~123 확보 — 밝은 하늘 배경에서 골드 로고가 죽지 않게 하는 값이므로 낮추지 말 것 |

## 폰트

- **도현체 (Do Hyeon)** — 기본. `assets/fonts/DoHyeon.ttf`
  - 라이선스 **SIL Open Font License 1.1** (Copyright 2018 The Do Hyeon Project Authors).
    OFL 은 재배포 시 라이선스 사본 동봉을 조건으로 하므로 **`assets/fonts/OFL.txt` 를 폰트와
    함께 유지할 것.** 이 레포는 public 이라 커밋 자체가 재배포에 해당한다. 폰트만 옮기고
    OFL.txt 를 빠뜨리지 말 것
- N.NOBLE 로고 — 시스템 세리프. **Times New Roman 이 기준**이고 OS별로 자동 탐색한다
  (`make_overlays.py` 의 `SERIF_CANDIDATES`: Windows `times.ttf` → macOS Times/Georgia →
  Linux Liberation/DejaVu). 재배포 불가 폰트라 레포에 번들하지 않는다.
  - 대체본이 잡히면 스크립트가 **경고를 출력**한다. 자간 계산이 폭 244px 를 맞춰 주므로
    레이아웃은 유지되지만 글자 모양이 미세하게 다르니, 경고가 보이면 최종 프레임에서 로고를 확인할 것
  - 후보가 하나도 없으면 렌더 전에 실패시킨다 (조용히 깨진 로고가 나가지 않게)
- 조달: GitHub·Google Fonts CDN 차단됨 →
  `npm pack @fontsource/do-hyeon` → `package/files/do-hyeon-korean-400-normal.woff2`
  → `fontTools.ttLib.TTFont(...)`, `flavor=None`, `.save()` 로 ttf 변환

## 함정 (매번 반복됨 — 반드시 확인)

### 인물 규칙 (1~3) — 전부 실제로 사고 난 항목

1. **[필수] 인물은 전문적·고급스럽게.** 엔노블은 하이엔드 결정사다.
   등장하는 한국인에게 생활감·피로감·평범함이 묻어나면 브랜드가 깎인다.
   - 넣을 것: `refined`, `polished`, `sophisticated`, `elegant`, `tailored suit`,
     `upscale interior`, `premium`, `poised`, `well-groomed`, `quiet confidence`
   - 뺄 것: `ordinary`, `everyday`, `casual`, `tired`, `mild fatigue`, `plain jacket`,
     `handheld`, `flat lighting`, `bus stop`, `crowded street`
   - **`Korean man` 저작권 우회와 충돌한다.** 고급스럽게 먼저 시도하고, 거부되면
     **의상·공간·조명의 고급스러움은 유지한 채 '얼굴'만** `not a celebrity, not a model,
     ordinary facial features` 로 낮춘다. 그래도 안 되면 `side profile`·`seen from behind`.
     **장면 전체를 평범하게 내리지 말 것** — 거부는 피하지만 브랜드가 깎인다.
   - 2026-07-17 자만추 2번(버스정류장·피로한 표정·플랫 조명)이 이 기준 미달 → 다음 편 재생성 대상.

2. **[필수·비협상] 인물은 무조건 한국인.** 영상 프롬프트에 `Korean` 을 안 쓰면
   Seedance 는 **백인을 뽑는다.** `korean_guard()` 가 검사하지만 프롬프트만 볼 뿐이므로
   **합성 후 프레임을 뽑아 눈으로 확인할 것.**
   - 프롬프트 거부 시 **빼야 하는 건 거부 트리거지 인종 지정이 아니다.**
     2026-07-17 자만추 편에서 거부를 완화하다 `Korean` 을 지워 2번에 백인 여성이 나왔다.
   - `Korean man` + 시네마틱 인물샷은 **배우 얼굴 유사성으로 `copyright restrictions` 5연속 거부.**
     (`Korean woman` 은 이 문제가 거의 없음)
     → 대응은 **위 1번의 3단계 순서**를 따른다. 얼굴만 탈스타화하고 고급스러움은 지킬 것.
     **장면 전체를 `plain`/`documentary`/`flat lighting` 으로 내리지 말 것** — 통과는 하지만
     브랜드가 깎인다 (자만추 2번이 그렇게 나왔다).
   - `output audio may contain sensitive information` 은 `generate_audio=false` 만으로 해결.
     프롬프트를 건드릴 필요 없다.
   - **거부되지 않아도 배우를 닮을 수 있다 — 저작권 필터 통과 ≠ 초상 유사성 없음.**
     2026-08-04 크리스찬 4번은 고급스러운 `Korean man` 프롬프트(테일러드 차콜 수트/고급 로비/
     자연광)가 **1회에 통과**했으나, 결과 인물이 실제 한국 배우와 상당히 닮았다.
     `korean_guard()` 는 프롬프트만 보고 Seedance 필터도 안 걸렀다 — **사람이 봐야 잡힌다.**
     → 5-5 눈검사 항목에 **배우 유사성**을 포함할 것. 닮았다면 의상·공간·조명은 그대로 두고
     `not a celebrity, not a model, ordinary facial features` 를 넣어 재생성한다.
     발행 여부는 사장님 판단 사항이므로 **임의로 재생성하지 말고 보고할 것.**

3. **[필수·비협상] 서류·모니터·간판을 AI 영상에 등장시키지 말 것.**
   AI 는 한글을 못 쓰고 **프롬프트로 막을 수 없다.** 글자가 놓일 표면이 화면에 있으면
   반드시 가짜 한글이 박힌다. 2026-07-17 자만추 4번에서 **3회 시도 전부 실패**:
   `직직직식직전` → (`no letters` 명시) `딜지릭텬미의지극4색선` → (`no header` 추가) `집식릭 실리지`.
   - **해법은 서류를 화면에서 빼는 것.** 서류·숫자를 말하는 슬라이드라도 화면엔 인물만 두고
     데이터는 카피가 말하게 한다:
     `Completely empty clean environment with no documents, no papers, no screens,`
     `no books, no signage and no text or writing anywhere in the frame.`
   - 초점이 흐려 글자가 안 읽히는 정도는 통과 (자만추 3번).
   - **인물을 빼고 전체를 인포그래픽으로 바꾸지 말 것.** 사장님이 인물 유지를 우선한다.

### 기술 함정 (4~8)

4. **도현체에 `·`(U+00B7), `→`(U+2192) 글리프 없음** → □ 로 깨짐.
   `·` → `/` 로 대체. `→` 는 PIL 로 직접 그림.
   `make_overlays.py` 의 `glyph_guard()` 가 누락 시 실패시킴.
5. **ffmpeg `drawtext` 를 쓰지 말 것.** PowerShell 인자 이스케이프가 깨지고
   (`x=(w-text_w)/2` 가 경로로 오인됨) 한글 폰트도 안 잡힌다.
   → PIL 로 투명 PNG 를 만들고 `overlay` 필터로 합성한다.
6. **이 PC 엔 Python 도 ffmpeg 도 설치돼 있지 않다.** (Cowork 세션엔 있었음)
   - `python`/`python3` 은 `AppData\Local\Microsoft\WindowsApps` 의 **Microsoft Store 스텁**이라
     실행하면 **exit 49** 로 죽고, `pip` 은 PATH 에 아예 없다.
     레지스트리(`HKLM/HKCU\SOFTWARE\Python\PythonCore`)에도 CPython 항목이 없다.
     **`pip install ...` 을 그대로 치면 첫 줄부터 막힌다.**
   - **`uv` 로 조달한다** (`AppData\Local\Microsoft\WinGet\Links\uv.exe`, 관리 CPython 3.14 포함):
     ```bash
     uv venv <venv> --python 3.14
     uv pip install --python <venv>/Scripts/python.exe imageio-ffmpeg fonttools brotli pillow
     ```
     이후 스크립트는 `<venv>/Scripts/python.exe` 로 **직접 호출**한다(activate 불필요).
     venv 는 OneDrive 동기화 폴더 밖(스크래치패드)에 만든다 — 프로젝트 폴더가 OneDrive 아래다.
   - ffmpeg 은 `imageio-ffmpeg` 패키지가 번들해 오므로 **별도 설치가 필요 없다**
     (`imageio_ffmpeg.get_ffmpeg_exe()`). CapCut 번들 ffmpeg 은 **libx264 가 없어** 못 쓴다.
   - ffmpeg stderr 를 버리지 말 것 — 버리면 전부 조용히 실패하고 성공한 줄 안다.
7. ffmpeg 다수 인코딩은 `-preset veryfast` + 단계 분할 (medium 일괄은 타임아웃).
8. 화면 캡처(붙여넣기) 이미지는 파일로 저장 안 됨 → 실제 파일 첨부/폴더 연결 필요.

## 파이프라인

```bash
# 0) 이 PC 엔 Python/pip 이 없다 (함정 6) — uv 로 venv 를 만든다. PY=<venv>/Scripts/python.exe
uv venv <venv> --python 3.14
uv pip install --python <venv>/Scripts/python.exe imageio-ffmpeg fonttools brotli pillow

# 1) slides.example.json 을 복사해 카피(title/body 각 2줄)와 video_prompt 를 채운다
# 2) 오버레이 생성 = 사전 검증. 영상 생성 '전에' 돌려야 유료 낭비를 막는다
$PY scripts/make_overlays.py <slides.json> <overlays_dir>
# 3) Seedance 로 6장 생성 → slides.json 의 video_url 을 채운다
# 4) 합성
$PY scripts/build_video.py <slides.json> <out_dir> <overlays_dir>
```
카피·영상 URL 은 전부 `slides.json` 에 있다. **스크립트는 건드리지 않는다.**

## 소스 영상 규격 변환

Seedance 2.0 은 4:5 를 지원하지 않음 → **3:4 로 생성** 후
`scale=1080:-2,crop=1080:1350` 으로 4:5 크롭 (세로 90px 중앙 절삭).
