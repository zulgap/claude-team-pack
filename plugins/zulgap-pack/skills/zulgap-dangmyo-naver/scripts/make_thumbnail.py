# -*- coding: utf-8 -*-
"""댕묘 네이버 블로그 썸네일 생성 — 고정 배경 + 흰 카드 + 한글 제목 픽셀 오버레이.

바뀌는 것은 제목 텍스트뿐이다. 배경·색·서체·레이아웃은 브랜드 고정값이므로 건드리지 말 것.

한글을 이미지 생성 모델에 맡기지 않는다. 모델이 그린 한글은 오탈자가 나고 재시도 비용이 크다.
배경(글자 없음)만 미리 만들어 두고 제목은 PIL로 직접 그린다.

에셋(배경 PNG·폰트 TTF)은 저장소에 넣지 않고 첫 실행 때 내려받아 캐시한다.
팀팩에 2MB 바이너리를 싣지 않기 위한 것이고, 캐시는 플러그인 갱신에도 지워지지 않는다.

🔴 **v2 (2026-08-05) — 흰 카드 레이아웃.** v1은 스티커 프레임이 사방 265px을 먹어 글자가
72px까지 작아졌다. **네이버 검색결과는 썸네일을 약 110px로 줄여 보여주므로** 글자 높이가
7px이 되어 검색결과에서 아예 안 읽혔다(실측 확인). v2는 배경 위에 다이컷 흰 카드를 얹어
같은 3줄을 166px로 키운다. 카드 좌우로 스티커 프레임이 남아 브랜드는 그대로 유지된다.

  **글자 크기 하한 147px** (= 110px 축소 시 15px). 미달이면 `[TOO-SMALL]` 로 경고한다.
  경고가 뜨면 레이아웃이 아니라 **카피를 줄여야 한다** — 3줄 × 줄당 6자가 진짜 제약이다.

사용:
  python make_thumbnail.py --title "고양이 모래|종량제 봉투|안 됩니다" --out out.png

  줄바꿈은 | 로 직접 지정한다. 생략하면 어절 단위로 자동 분할하지만,
  의미 단위로 끊는 편이 훨씬 읽히므로 되도록 직접 지정할 것.
"""
import argparse
import os
import sys
import urllib.request
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter, ImageFont

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

# 흰 카드 — 좌우 여백 48px은 스티커 프레임이 양옆에 보이도록 일부러 남긴 것이다.
# 이 값을 줄이면 글자는 조금 커지지만 배경이 가려져 어느 채널 글인지 알아볼 수 없게 된다.
CARD_MARGIN_X = 48
CARD_HEIGHT = 660
CARD_RADIUS = 56
CARD_OUTLINE = 9
CARD_PAD_X = 46
CARD_PAD_Y = 40

MAX_LINES = 3                    # v1은 4줄이었다. 4줄이면 글자가 하한 아래로 떨어진다
LINE_SPACING = 1.16
MIN_READABLE = 147               # 110px 축소 시 15px — 검색결과에서 읽히는 하한


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
        parts = [s.strip() for s in title.split("|") if s.strip()]
        # @AI:INTENT 넘치는 줄을 잘라내지 않고 중단한다. 예전엔 [:max_lines] 로 잘랐는데,
        #   그러면 4번째 줄이 사라진 채 [OK] 로 끝나 호출자가 성공으로 받는다.
        #   제목 일부가 빠진 썸네일은 발행돼도 아무도 모른다 — 조용한 손실이 가장 나쁘다.
        if len(parts) > max_lines:
            raise SystemExit(
                "[TOO-MANY-LINES] got %d lines, max is %d. (file not written)\n"
                "  줄이 %d개입니다. 이 썸네일은 %d줄까지입니다 — 잘라내면 제목 일부가\n"
                "  조용히 사라지므로 만들지 않았습니다. | 를 %d개 이하로 쓰세요."
                % (len(parts), max_lines, len(parts), max_lines, max_lines - 1))
        return parts
    words = title.split()
    if len(words) <= 1:
        return [title]
    n = min(max_lines, max(2, round(len(title) / 7)))
    per = max(1, -(-len(words) // n))
    return [" ".join(words[i:i + per]) for i in range(0, len(words), per)]


def fit_size(lines, draw, box_w, box_h):
    """카드 안에 들어가는 가장 큰 글자 크기를 찾는다."""
    for size in range(280, 59, -2):
        font = load_font(size)
        widest = max(draw.textlength(ln, font=font) for ln in lines)
        if widest <= box_w and len(lines) * size * LINE_SPACING <= box_h:
            return size, font
    return 60, load_font(60)


def build(title, out_path):
    # 빈 제목이면 글자 없는 배경만 나온다. 그것도 «성공»으로 끝나면 배경뿐인
    # 썸네일이 카드에 붙는다. 에셋을 내려받기 전에 먼저 막는다.
    if not title.strip():
        raise SystemExit(
            "[EMPTY-TITLE] title is empty. (file not written)\n"
            "  제목이 비어 있습니다. --title 에 문구를 넣어 주세요.")
    ensure_assets()
    bg = Image.open(BG_FILE).convert("RGB").resize((CANVAS, CANVAS), Image.LANCZOS)
    lines = wrap(title)

    box = (CARD_MARGIN_X, (CANVAS - CARD_HEIGHT) // 2,
           CANVAS - CARD_MARGIN_X, (CANVAS + CARD_HEIGHT) // 2)

    # 그림자 — 다이컷 스티커가 배경 위에 얹힌 느낌. 배경과 카드가 붙어 보이지 않게 한다
    shadow = Image.new("RGBA", (CANVAS, CANVAS), (0, 0, 0, 0))
    ImageDraw.Draw(shadow).rounded_rectangle(
        [box[0], box[1] + 14, box[2], box[3] + 14], radius=CARD_RADIUS, fill=(62, 43, 29, 70))
    bg = Image.alpha_composite(
        bg.convert("RGBA"), shadow.filter(ImageFilter.GaussianBlur(16))).convert("RGB")

    draw = ImageDraw.Draw(bg)
    draw.rounded_rectangle(list(box), radius=CARD_RADIUS, fill=(255, 255, 255),
                           outline=BROWN, width=CARD_OUTLINE)

    inner = (box[0] + CARD_PAD_X, box[1] + CARD_PAD_Y, box[2] - CARD_PAD_X, box[3] - CARD_PAD_Y)
    size, font = fit_size(lines, draw, inner[2] - inner[0], inner[3] - inner[1])

    # @AI:CONSTRAINT 하한 미달이면 «그리지도 저장하지도 않는다».
    #   예전엔 저장을 끝낸 뒤에 exit 2 를 냈다. 이 스크립트를 부르는 쪽은 사람이 아니라
    #   Claude 라, 종료코드보다 «파일이 생겼나»를 먼저 본다 — 그러면 v1 사고
    #   (검색결과에서 글자 7px)가 «경고는 떴는데 그 파일이 그대로 쓰인» 경로로 재발한다.
    #   실패는 산출물을 남기지 않는다.
    if size < MIN_READABLE:
        return None, size, lines

    line_h = size * LINE_SPACING
    cx = (inner[0] + inner[2]) / 2
    y = inner[1] + ((inner[3] - inner[1]) - len(lines) * line_h) / 2

    # 흰 카드 위 브라운 단색. 한글에 stroke_width 를 주면 자소 사이가 메워져 오히려
    # 안 읽힌다 — 굵기는 서체(ExtraBold)로만 낸다.
    for ln in lines:
        draw.text((cx, y), ln, font=font, fill=BROWN, anchor="ma")
        y += line_h

    os.makedirs(os.path.dirname(os.path.abspath(out_path)) or ".", exist_ok=True)
    bg.save(out_path)
    return out_path, size, lines


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--title", required=True, help="제목. | 로 줄바꿈 지정. 3줄 x 6자 이내")
    ap.add_argument("--out", required=True)
    a = ap.parse_args()
    p, s, ls = build(a.title, a.out)
    if p is None:
        # 아래 영문 줄은 순수 ASCII 로 유지할 것. em-dash 같은 문자는 Windows cp949
        # 콘솔에서 UnicodeEncodeError 로 죽어, 경고를 보여주려던 자리에서
        # 스택트레이스가 뜬다(실측).
        print("[TOO-SMALL] font size: %d (min %d) | lines: %d" % (s, MIN_READABLE, len(ls)))
        print("[TOO-SMALL] copy is too long - cut to 3 lines x 6 chars. (file not written)")
        print("[TOO-SMALL] 카피가 깁니다. 3줄 x 줄당 6자 이내로 줄이세요. (파일을 만들지 않았습니다)")
        sys.exit(2)
    print("[OK] saved: %s" % p)
    print("[OK] font size: %d (%.1f%% of canvas) | lines: %d" % (s, s / CANVAS * 100, len(ls)))
