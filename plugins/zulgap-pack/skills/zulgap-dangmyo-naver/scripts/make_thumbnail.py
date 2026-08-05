# -*- coding: utf-8 -*-
"""댕묘 네이버 블로그 썸네일 생성 — 고정 배경 + 한글 제목 픽셀 오버레이.

바뀌는 것은 제목 텍스트뿐이다. 배경·색·서체·레이아웃은 브랜드 고정값이므로 건드리지 말 것.

한글을 이미지 생성 모델에 맡기지 않는다. 모델이 그린 한글은 오탈자가 나고 재시도 비용이 크다.
배경(글자 없음)만 미리 만들어 두고 제목은 PIL로 직접 그린다.

에셋(배경 PNG·폰트 TTF)은 저장소에 넣지 않고 첫 실행 때 내려받아 캐시한다.
팀팩에 2MB 바이너리를 싣지 않기 위한 것이고, 캐시는 플러그인 갱신에도 지워지지 않는다.

사용:
  python make_thumbnail.py --title "고양이 모래|종량제 봉투에|버리면 안 됩니다" --out out.png

  줄바꿈은 | 로 직접 지정한다. 생략하면 어절 단위로 자동 분할하지만,
  의미 단위로 끊는 편이 훨씬 읽히므로 되도록 직접 지정할 것.
"""
import argparse
import os
import sys
import urllib.request
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

# --- 에셋 (회사 자산 URL · 공개 배포처) -----------------------------------
CACHE_DIR = Path.home() / ".cache" / "zulgap-dangmyo-naver"

# 댕묘 썸네일 기준 배경. 크림 바탕 + 다이컷 스티커 프레임, 가운데는 비어 있다.
# 줄갭 미디어 자산 버킷에 올라간 고정본이며 글마다 새로 생성하지 않는다.
BG_URL = ("https://mtnfymojdahnceusnsjh.supabase.co/storage/v1/object/public/"
          "media-assets/a0000000-0000-0000-0000-000000000002/generated/1785922612903-oxe1gw.png")
BG_FILE = CACHE_DIR / "dangmyo_bg_v1.png"

# 나눔스퀘어라운드 ExtraBold — 획 끝이 둥근 굵은 고딕. 대문 로고 「댕.묘해」와 같은 계열.
# 네이버 배포, 무료 상업 이용·임베딩 허용. 한글 11,172자 전부 커버 확인(2026-08-05).
# 윈도우 번들 서체(HYGothic-Extra 등)가 로고에 더 가깝지만 상업 이미지 라이선스가
# 불명확해 쓰지 않는다. 댕묘는 애드센스를 목표로 하는 수익 사이트다.
FONT_URL = "https://hangeul.naver.com/hangeul_static/webfont/NanumSquareRound/NanumSquareRoundEB.ttf"
FONT_FILE = CACHE_DIR / "NanumSquareRoundEB.ttf"

# --- 고정 사양 (브랜드 값, 임의로 바꾸지 말 것) ---------------------------
CANVAS = 1080                    # 네이버 목록·모바일에서 안 잘리는 정사각
BROWN = (0x3E, 0x2B, 0x1D)       # 대문 로고 글자색 실측값
ORANGE = (0xEB, 0x9E, 0x44)      # 「댕.묘해」 가운뎃점 색 실측값

# 스티커 프레임 안쪽 빈 영역. 실측 박스는 오른쪽이 더 넓지만 캔버스 중앙 기준으로
# 좌우 대칭으로 잘라 쓴다 — 비대칭으로 두면 글자가 오른쪽 돋보기 스티커에 닿는다.
SAFE = {"left": 265, "right": CANVAS - 265, "top": 275, "bottom": 875}
MAX_LINES = 4
LINE_SPACING = 1.22
FOOTER_TEXT = "dangmyo.com"


def ensure_assets():
    """배경·폰트를 캐시에 준비한다. 이미 있으면 건너뛴다."""
    CACHE_DIR.mkdir(parents=True, exist_ok=True)
    for url, path in ((BG_URL, BG_FILE), (FONT_URL, FONT_FILE)):
        if path.exists() and path.stat().st_size > 0:
            continue
        # 앞의 ASCII 태그는 장식이 아니다. Windows 콘솔(cp949)에서 한글이 깨져도
        # 무슨 일이 났는지 읽히게 하는 장치다(엔노블 썸네일 스킬에서 실측된 문제).
        sys.stderr.write("[ASSET-FETCH] downloading %s ... (에셋 내려받는 중)\n" % path.name)
        try:
            urllib.request.urlretrieve(url, path)
        except Exception as e:
            raise SystemExit(
                "[ASSET-MISSING] cannot download %s\n  %s\n"
                "  에셋을 못 받았습니다. 사내망·방화벽 문제일 수 있습니다.\n"
                "  계속 실패하면 사장님께 문의하세요." % (path.name, e)
            )


def load_font(size):
    return ImageFont.truetype(str(FONT_FILE), size)


def wrap(title, max_lines=MAX_LINES):
    """| 가 있으면 그대로 쓰고, 없으면 어절 단위로 균등 분할한다."""
    if "|" in title:
        return [s.strip() for s in title.split("|") if s.strip()][:max_lines]
    words = title.split()
    if len(words) <= 1:
        return [title]
    n = min(max_lines, max(2, round(len(title) / 9)))
    per = max(1, -(-len(words) // n))
    return [" ".join(words[i:i + per]) for i in range(0, len(words), per)]


def fit_size(lines, draw, box_w, box_h):
    """안전 영역에 들어가는 가장 큰 글자 크기를 찾는다."""
    for size in range(130, 39, -2):
        font = load_font(size)
        widest = max(draw.textlength(ln, font=font) for ln in lines)
        if widest <= box_w and len(lines) * size * LINE_SPACING <= box_h:
            return size, font
    return 40, load_font(40)


def build(title, out_path, footer=True):
    ensure_assets()
    bg = Image.open(BG_FILE).convert("RGB").resize((CANVAS, CANVAS), Image.LANCZOS)
    draw = ImageDraw.Draw(bg)

    lines = wrap(title)
    box_w = SAFE["right"] - SAFE["left"]
    box_h = SAFE["bottom"] - SAFE["top"] - (70 if footer else 0)

    size, font = fit_size(lines, draw, box_w, box_h)
    line_h = size * LINE_SPACING
    cx = (SAFE["left"] + SAFE["right"]) / 2
    y = SAFE["top"] + (box_h - len(lines) * line_h) / 2

    for ln in lines:
        draw.text((cx, y), ln, font=font, fill=BROWN, anchor="ma")
        y += line_h

    if footer:
        fsize = max(26, int(size * 0.30))
        ffont = load_font(fsize)
        dot_r = max(5, int(fsize * 0.17))
        fy = y + fsize * 0.80
        gap = dot_r * 1.8
        tw = draw.textlength(FOOTER_TEXT, font=ffont)
        # 「점 + 여백 + dangmyo.com」을 한 덩어리로 보고 통째로 가운데 정렬한다.
        x0 = cx - (dot_r * 2 + gap + tw) / 2
        draw.ellipse([x0, fy - dot_r, x0 + dot_r * 2, fy + dot_r], fill=ORANGE)
        draw.text((x0 + dot_r * 2 + gap, fy), FOOTER_TEXT, font=ffont, fill=BROWN, anchor="lm")

    os.makedirs(os.path.dirname(os.path.abspath(out_path)) or ".", exist_ok=True)
    bg.save(out_path)
    return out_path, size, lines


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--title", required=True, help="제목. | 로 줄바꿈 지정")
    ap.add_argument("--out", required=True)
    ap.add_argument("--no-footer", action="store_true")
    a = ap.parse_args()
    p, s, ls = build(a.title, a.out, footer=not a.no_footer)
    print("saved: %s" % p)
    print("font size: %d | lines: %d" % (s, len(ls)))
