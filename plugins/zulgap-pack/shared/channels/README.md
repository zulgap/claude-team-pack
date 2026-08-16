# 채널 위키 (줄갭 전용)

썸네일·대본 스킬이 「채널마다 다른 값」을 여기서 받는다. 모태 스킬(`jedi-thumbnail` 등)은
채널을 모르고, 이 파일이 톤·강조색·폰트·인물규칙·금칙과 그 채널의 A/B 실측 규칙을 준다.

## 🔴 왜 공용 팩(jedi-core)이 아니라 여기인가

`jedi-thumbnail`은 `tier: shared`라 **다른 회사 PC에도 통째로 깔린다.** 채널 위키에는 그 채널의
A/B 실측·톤·금칙 같은 **고객사 자산**이 들어가므로, 공용 팩에 동봉하면 남의 회사로 따라간다.
2026-08-16에 `엔노블.md`가 실제로 `jedi-core` 안에 있었고 이 자리로 옮겼다.

**이 디렉토리의 파일을 `jedi-core`로 되돌리지 말 것.**

## 쓰는 법

모태 스킬이 채널 위키를 찾는 1순위는 **`~/.claude/zulgap/channels/<채널>.md`** 다.
플러그인 설치 경로는 커밋 SHA 폴더라 매번 바뀌므로, 쓰기 전에 한 번 복사해 둔다.

```bash
mkdir -p ~/.claude/zulgap/channels
cp "<이 폴더>/엔노블.md" ~/.claude/zulgap/channels/
```

```powershell
New-Item -ItemType Directory -Force ~\.claude\zulgap\channels | Out-Null
Copy-Item "<이 폴더>\엔노블.md" ~\.claude\zulgap\channels\
```

`~/.claude/zulgap/` 은 플러그인 갱신과 무관한 자리라 덮어써지지 않는다.
반대로 **거기서 고친 내용은 이 레포에 자동으로 안 돌아온다** — 팀 전체에 반영하려면 PR로 올릴 것.

## 지금 있는 것

| 파일 | 채널 | 비고 |
|---|---|---|
| `엔노블.md` | 엔노블 (고객사) | A/B 149건 실측 규칙 5개 + 선호 없는 축 1개 |
