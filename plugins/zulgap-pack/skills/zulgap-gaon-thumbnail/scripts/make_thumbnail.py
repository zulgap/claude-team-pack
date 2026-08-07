#!/usr/bin/env python3
"""
검단가온치과 1080x1080 썸네일 생성기.

기준 템플릿(짙은 네이비 + 비네팅 + 그레인 + 로고) 위에
민트(#5FE1C8) → 화이트 세로 그라데이션 텍스트를 얹는다.
글로우는 최소화(blur 4 / opacity ~25%)하여 글씨는 또렷하게 유지한다.

사용법:
    python make_thumbnail.py --lines "1줄|2줄|3줄|4줄" [옵션]
    python make_thumbnail.py --lines "임플란트가|보내는|이상 신호 4가지"

옵션:
    --template   배경 템플릿 경로 (기본: ../assets/template.png)
                 * 세션마다 사용자가 새 템플릿을 업로드하면 그 경로를 지정할 것
    --out        출력 경로 (기본: ./검단가온치과_썸네일.png)
    --font       폰트 경로 (기본: Noto Sans CJK KR Black)
    --font-size  글자 크기 강제 지정(미지정 시 줄 수/폭에 맞춰 자동 산정)

주의:
- 줄바꿈은 파이프(|)로 구분. 제목1을 4줄 이내 짧은 후킹 톤으로 압축해 전달.
- 업로드된 파일은 세션 간 유지되지 않으므로, 새 세션에서는 템플릿을 다시 업로드받아 --template로 넘길 것.
"""
import argparse
import os
from PIL import Image, ImageDraw, ImageFont, ImageFilter

MINT = (95, 225, 200)          # #5FE1C8  (그라데이션 상단)
WHITE = (232, 255, 250)        # 그라데이션 하단 (살짝 민트 기 도는 화이트)
GLOW_RGBA = (95, 225, 200, 64) # 최소 글로우 (opacity ~25%)
GLOW_BLUR = 4

def _resolve_default_font():
    """번들 Black 폰트를 1순위로, 없으면 시스템 경로를 차례로 탐색.

    환경마다 시스템 폰트가 달라 결과물(굵기/그라데이션)이 달라지는 것을 막기 위해
    스킬에 함께 번들된 assets/NotoSansCJK-Black.ttc 를 우선 사용한다.
    """
    here = os.path.dirname(os.path.abspath(__file__))
    windir = os.environ.get("WINDIR", r"C:\Windows")
    candidates = [
        os.path.join(here, "..", "assets", "NotoSansCJK-Black.ttc"),  # 번들 (1순위)
        "/usr/share/fonts/opentype/noto/NotoSansCJK-Black.ttc",
        "/usr/share/fonts/truetype/noto/NotoSansCJK-Black.ttc",
        "/usr/share/fonts/noto-cjk/NotoSansCJK-Black.ttc",
        "/Library/Fonts/NotoSansCJK-Black.ttc",
        os.path.expanduser("~/Library/Fonts/NotoSansCJK-Black.ttc"),
        # Windows 폴백 — 번들이 유실된 경우에만. 굵기가 Black보다 얇아
        # 브랜드 기준과 미세하게 달라지므로 결과물을 눈으로 확인할 것.
        os.path.join(windir, "Fonts", "malgunbd.ttf"),
    ]
    for p in candidates:
        if os.path.exists(p):
            return os.path.normpath(p)
    # 최후: 첫 후보(번들 경로)를 반환 — 존재하지 않으면 명확한 에러로 이어진다.
    return os.path.normpath(candidates[0])


DEFAULT_FONT = _resolve_default_font()


# 표준 글자 크기 — 폭이 부족할 때만 이보다 작게 축소.
# 130 은 실사용 피드백으로 확정된 값(100 은 1080 캔버스에서 작아 보였다).
STANDARD_FONT_SIZE = 130

def fit_font_size(lines, font_path, max_w, given=None):
    """표준 크기(100)가 max_w 안에 들어오면 그대로, 안 들어오면 줄여서 산정."""
    if given:
        return given
    size = STANDARD_FONT_SIZE
    while size > 40:
        font = ImageFont.truetype(font_path, size, index=0)
        tmp = Image.new("L", (10, 10))
        d = ImageDraw.Draw(tmp)
        widest = max((d.textbbox((0, 0), ln, font=font)[2] -
                      d.textbbox((0, 0), ln, font=font)[0]) for ln in lines)
        if widest <= max_w:
            return size
        size -= 4
    return size


def make_thumbnail(lines, template_path, out_path, font_path=DEFAULT_FONT,
                   font_size=None):
    base = Image.open(template_path).convert("RGBA")
    W, H = base.size

    # 좌우 여백 6% 확보한 폭 안에 맞춤 (표준 크기 100이 대부분의 4줄 카피에서 그대로 들어가도록)
    max_w = int(W * 0.88)
    fs = fit_font_size(lines, font_path, max_w, font_size)
    font = ImageFont.truetype(font_path, fs, index=0)

    line_h = int(fs * 1.22)
    total_h = line_h * len(lines)
    start_y = (H - total_h) // 2 + int(H * 0.035)  # 중앙에서 살짝 아래

    d0 = ImageDraw.Draw(base)
    positions = []
    for i, ln in enumerate(lines):
        bbox = d0.textbbox((0, 0), ln, font=font)
        tw = bbox[2] - bbox[0]
        x = (W - tw) // 2 - bbox[0]
        y = start_y + i * line_h
        positions.append((x, y, ln))

    # 텍스트 마스크
    mask = Image.new("L", (W, H), 0)
    md = ImageDraw.Draw(mask)
    for (x, y, ln) in positions:
        md.text((x, y), ln, font=font, fill=255)

    # 세로 그라데이션 (텍스트 블록 범위에 걸침): 위=민트, 아래=화이트
    block_top = start_y
    block_bot = start_y + total_h
    grad = Image.new("RGBA", (W, H))
    gp = grad.load()
    span = max(1, block_bot - block_top)
    for y in range(H):
        t = min(1.0, max(0.0, (y - block_top) / span))
        r = int(MINT[0] + (WHITE[0] - MINT[0]) * t)
        g = int(MINT[1] + (WHITE[1] - MINT[1]) * t)
        b = int(MINT[2] + (WHITE[2] - MINT[2]) * t)
        row = (r, g, b, 255)
        for x in range(W):
            gp[x, y] = row

    # 최소 글로우 (가장자리에만 미세한 민트 빛)
    glow = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    gd = ImageDraw.Draw(glow)
    for (x, y, ln) in positions:
        gd.text((x, y), ln, font=font, fill=GLOW_RGBA)
    glow = glow.filter(ImageFilter.GaussianBlur(GLOW_BLUR))
    base.alpha_composite(glow)

    # 그라데이션을 텍스트 마스크로 합성 (선명한 본문)
    base.paste(grad, (0, 0), mask)

    # 1080x1080 출력
    base = base.convert("RGB")
    if (W, H) != (1080, 1080):
        base = base.resize((1080, 1080), Image.LANCZOS)
    base.save(out_path, quality=95)
    return out_path


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--lines", required=True,
                    help="썸네일 텍스트. 줄바꿈은 | 로 구분 (최대 4줄 권장)")
    here = os.path.dirname(os.path.abspath(__file__))
    ap.add_argument("--template",
                    default=os.path.join(here, "..", "assets", "template.png"))
    ap.add_argument("--out", default="./검단가온치과_썸네일.png")
    ap.add_argument("--font", default=DEFAULT_FONT)
    ap.add_argument("--font-size", type=int, default=None)
    args = ap.parse_args()

    lines = [s.strip() for s in args.lines.split("|") if s.strip()]
    out = make_thumbnail(lines, args.template, args.out, args.font, args.font_size)
    print("saved", out)


if __name__ == "__main__":
    main()
