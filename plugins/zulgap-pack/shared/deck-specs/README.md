# 슬라이드 제작 규격 (공개해도 되는 것만)

화면녹화 + 얼굴 PiP 로 찍는 채널의 **슬라이드를 그릴 때** 필요한 값을 둔다.
`/유튜브대본` 의 § 발표자료가 이 값을 읽어 덱을 만들고, 렌더로 재서 세이프존 침범 0을 확인한다.

## 🔴 담는 것 / 담지 않는 것

| 담는다 | 담지 않는다 |
|---|---|
| 색 (`palette`) | 채널 정체성·포지셔닝 |
| 무대 크기 · PiP 크기·위치 | 타깃·톤·금칙 |
| 세이프존 · 페이지번호 자리 | `entry_path`(어느 키워드를 잡을지) |
| 폰트·높이 상한(렌더로 맞춘 값) | 제목 공식 실측 · A/B 편성 전략 |
| | `persona` · `적` · `약속` · `story_arc` |

**판정 기준 한 줄**: *경쟁사가 이 파일을 읽어도 우리 전략을 못 베끼는가?*

🔴 **이 레포는 PUBLIC 이다.** 색과 화면 규격은 완성된 영상을 보면 어차피 드러나므로 공개해도
잃을 것이 없지만, **전략은 다르다.** 그건 `../channels/README.md` 를 읽을 것.

## 이 파일로 할 수 있는 일 / 없는 일

- ✅ **슬라이드 만들기** — 대본을 받은 사람이 규격에 맞는 덱을 그린다
- ❌ **대본 쓰기** — 톤·금칙·`voice` 가 필요하고, 그건 채널 정본에 있다(각자 PC)

## 쓰는 법

담당자 PC로 복사한 뒤 쓴다. 플러그인 폴더는 커밋마다 새로 받아 경로가 바뀌므로 고정 참조가 안 된다.

```bash
mkdir -p ~/.claude/zulgap/deck-specs
cp "<이 폴더>"/*.md ~/.claude/zulgap/deck-specs/
rm -f ~/.claude/zulgap/deck-specs/README.md
```

```powershell
New-Item -ItemType Directory -Force ~\.claude\zulgap\deck-specs | Out-Null
Copy-Item "<이 폴더>\*.md" ~\.claude\zulgap\deck-specs\
Remove-Item ~\.claude\zulgap\deck-specs\README.md -ErrorAction SilentlyContinue
```

⚠️ 그 PC에서만 고쳐 둔 값이 있으면 덮기 전에 확인할 것.

## 지금 있는 것

| 파일 | 채널 | 촬영 형식 |
|---|---|---|
| `마미사.md` | 마미사 (고객사) | 화면녹화 + 우하단 얼굴 PiP · 세이프존 하단 360px |
