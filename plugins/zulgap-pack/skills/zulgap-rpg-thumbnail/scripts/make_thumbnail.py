# -*- coding: utf-8 -*-
"""
RPG(RED PASSPORT GLOBAL) 네이버 블로그 썸네일 — 1080x1080

배경을 코드로 그린다(에셋 다운로드 없음). 브랜드 정본 색만 쓴다.
  Passport Navy #1C2951 / Santa Red #DC143C / Gold Star #FFD700

usage: python rpg_thumbnail.py --title "컨테이너|반납 지연료" --out t.png
"""
import argparse, math, sys
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

SIZE = 1080
NAVY_TOP = (0x1C, 0x29, 0x51)     # Passport Navy
NAVY_BOT = (0x0E, 0x16, 0x2E)     # 하단 (더 어둡게 — 글자 대비 확보)
RED      = (0xDC, 0x14, 0x3C)     # Santa Red
GOLD     = (0xFF, 0xD7, 0x00)     # Gold Star
WHITE    = (0xFF, 0xFF, 0xFF)

# @AI:CONSTRAINT 네이버 검색결과는 썸네일을 약 110px로 줄인다. 1080 기준 글자가
# 147px 이상이어야 거기서 15px이 되어 읽힌다(댕묘 v2 실측). 미달이면 만들지 않는다.
MIN_GLYPH = 147
MAX_LINES = 3

FONT_CANDIDATES = [
    "C:/Windows/Fonts/malgunbd.ttf",
    "C:/Windows/Fonts/malgun.ttf",
    "/System/Library/Fonts/AppleSDGothicNeo.ttc",
    "/usr/share/fonts/truetype/nanum/NanumGothicBold.ttf",
    "/usr/share/fonts/opentype/noto/NotoSansCJK-Bold.ttc",
]

def resolve_font():
    for p in FONT_CANDIDATES:
        if Path(p).exists():
            return p
    sys.exit("[NO-FONT] 한글 볼드 폰트를 찾지 못했습니다. FONT_CANDIDATES에 경로를 추가하세요.")

def draw_background(img):
    """세로 그라데이션 + Gold 별 + Red 점선 궤적(Star Trail)."""
    d = ImageDraw.Draw(img)
    for y in range(SIZE):
        t = y / SIZE
        d.line([(0, y), (SIZE, y)], fill=tuple(
            int(NAVY_TOP[i] + (NAVY_BOT[i] - NAVY_TOP[i]) * t) for i in range(3)))

    # Red 점선 궤적 — 좌하단에서 우상단으로 호를 그린다 (정본: Star Trail)
    layer = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))
    ld = ImageDraw.Draw(layer)
    for i in range(46):
        t = i / 45
        x = 60 + t * (SIZE - 200)
        y = SIZE - 150 - math.sin(t * math.pi * 0.85) * 520
        r = 5 + t * 4
        ld.ellipse([x - r, y - r, x + r, y + r], fill=RED + (150,))
    img.alpha_composite(layer)

    # 궤적 끝의 Gold 별
    star(d, SIZE - 150, SIZE - 150 - math.sin(math.pi * 0.85) * 520, 34, GOLD)

def star(d, cx, cy, r, color):
    pts = []
    for i in range(10):
        a = math.pi / 2 + i * math.pi / 5
        rad = r if i % 2 == 0 else r * 0.42
        pts.append((cx + rad * math.cos(a), cy - rad * math.sin(a)))
    d.polygon(pts, fill=color)

def fit_font(lines, font_path):
    """가로 여백 안에 들어가는 최대 크기를 찾되 하한 미달이면 실패시킨다."""
    max_w = SIZE - 160
    size = 190
    while size >= MIN_GLYPH:
        f = ImageFont.truetype(font_path, size)
        if all(f.getbbox(ln)[2] - f.getbbox(ln)[0] <= max_w for ln in lines):
            return f, size
        size -= 2
    return None, size

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--title", required=True, help="줄바꿈은 | 로 지정 (최대 3줄)")
    ap.add_argument("--out", required=True)
    ap.add_argument("--font", default=None)
    a = ap.parse_args()

    lines = [s.strip() for s in a.title.split("|") if s.strip()]
    if not lines:
        sys.exit("[EMPTY-TITLE] 제목이 비었습니다.")
    if len(lines) > MAX_LINES:
        sys.exit(f"[TOO-MANY-LINES] {len(lines)}줄 — 최대 {MAX_LINES}줄입니다. | 를 줄이세요.")

    font_path = a.font or resolve_font()
    font, size = fit_font(lines, font_path)
    if font is None:
        sys.exit(f"[TOO-SMALL] 글자가 {size}px까지 작아집니다(하한 {MIN_GLYPH}). "
                 f"카피를 줄이세요 — 레이아웃을 넓히면 브랜드 여백이 깨집니다.")

    img = Image.new("RGBA", (SIZE, SIZE), NAVY_TOP)
    draw_background(img)
    d = ImageDraw.Draw(img)

    # 텍스트 블록 — 좌측 정렬, 세로 중앙
    lh = int(size * 1.28)
    total = lh * len(lines)
    y = (SIZE - total) // 2 - 30
    x = 80
    for ln in lines:
        d.text((x, y), ln, font=font, fill=WHITE)
        y += lh

    # 제목 아래 Red 구분선 (브랜드 시그니처)
    d.rectangle([x, y + 18, x + 190, y + 30], fill=RED)

    img.convert("RGB").save(a.out, "PNG")
    print(f"OK  {a.out}  글자 {size}px (하한 {MIN_GLYPH}) · {len(lines)}줄")

main()
