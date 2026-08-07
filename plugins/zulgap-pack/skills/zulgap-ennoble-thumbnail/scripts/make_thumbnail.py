#!/usr/bin/env python3
"""
엔노블(N.NOBLE) 1080x1080 블로그/인스타 썸네일 생성기.

기준 배경(짙은 브라운 그라데이션 + 좌상단 N.NOBLE 로고 + 커플 사진 +
중앙 흰 구분선) 위에, 흰색 굵은 고딕(Pretendard Black) 텍스트를
좌측 정렬로 흰 구분선 위에 얹는다.

사용법:
    python make_thumbnail.py --lines "1줄|2줄" [옵션]
    python make_thumbnail.py --lines "노블레스 결혼정보회사가 본|예능과 현실 매칭 차이"

옵션:
    --template   배경 템플릿 경로 (기본: ../assets/template.png)
    --out        출력 경로 (기본: ./엔노블_썸네일.png)
    --font       폰트 경로 (기본: 번들된 Pretendard Black)
    --font-size  글자 크기 강제 지정 (미지정 시 줄 수/폭에 맞춰 자동 산정)
    --line-spacing  줄 간격 배수 (기본 1.14, 좁게 붙는 스타일)

주의:
- 줄바꿈은 파이프(|)로 구분. 글자 수에 맞춰 2줄 또는 3줄로 나눠 전달.
- 텍스트는 흰 구분선 바로 위, 좌측 정렬로 배치된다. (좌측 여백 = 구분선 시작점)
"""
import argparse
import os
from PIL import Image, ImageDraw, ImageFont

HERE = os.path.dirname(os.path.abspath(__file__))
DEFAULT_TEMPLATE = os.path.join(HERE, "..", "assets", "template.png")
DEFAULT_FONT = os.path.join(HERE, "..", "assets", "Pretendard-Black.otf")

# 고정 레이아웃 사양 (1080x1080 기준)
LEFT = 38            # 좌측 여백 (흰 구분선 시작 x와 동일)
LINE_Y = 690         # 흰 구분선 상단 y
RIGHT = 914          # 흰 구분선 끝 x → 텍스트 최대 우측
GAP_ABOVE_LINE = 34  # 텍스트 블록 하단과 구분선 사이 간격
TEXT_COLOR = (255, 255, 255)


def _require(path, what):
    """번들 자산이 없으면 원인을 말하고 죽는다 — PIL 의 모호한 에러로 넘기지 않는다."""
    if not os.path.exists(path):
        # @AI:CONSTRAINT 태그는 ASCII 로 시작한다 — Windows 콘솔(cp949)에서 한글 본문이 깨져도
        #   팀원이 SKILL.md「막혔을 때」와 대조할 수 있어야 한다(실측: 깨짐 확인).
        raise SystemExit(
            f"[ASSET-MISSING] {what} 을 찾을 수 없습니다: {path}\n"
            f"                스킬 폴더의 assets/ 가 온전한지 확인하세요. 없으면 팀팩 갱신이 덜 된 것입니다."
        )
    return path


def fit_font_size(lines, font_path, max_w, n_lines, given=None):
    """가장 긴 줄이 max_w 안에 들어오는 폰트 크기를 산정."""
    if given:
        return given
    size = 84 if n_lines <= 2 else 74
    tmp = Image.new("L", (10, 10))
    d = ImageDraw.Draw(tmp)
    while size > 40:
        font = ImageFont.truetype(font_path, size)
        widest = max(d.textlength(ln, font=font) for ln in lines)
        if widest <= max_w:
            return size
        size -= 2
    return size


def make_thumbnail(lines, template_path, out_path, font_path=DEFAULT_FONT,
                   font_size=None, line_spacing=1.14):
    _require(template_path, "배경 템플릿")
    _require(font_path, "번들 폰트(Pretendard Black)")
    im = Image.open(template_path).convert("RGB")
    W, H = im.size
    draw = ImageDraw.Draw(im)

    max_w = RIGHT - LEFT
    n = len(lines)
    fs = fit_font_size(lines, font_path, max_w, n, font_size)
    font = ImageFont.truetype(font_path, fs)

    asc, desc = font.getmetrics()
    lh = int((asc + desc) * line_spacing)
    block_h = lh * n
    # 텍스트 블록 하단이 구분선 위 GAP 만큼 떨어지도록 배치
    y = LINE_Y - GAP_ABOVE_LINE - block_h

    for i, ln in enumerate(lines):
        draw.text((LEFT, y + i * lh), ln, font=font, fill=TEXT_COLOR)

    if (W, H) != (1080, 1080):
        im = im.resize((1080, 1080), Image.LANCZOS)
    im.save(out_path, quality=95)
    return out_path


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--lines", required=True,
                    help="썸네일 텍스트. 줄바꿈은 | 로 구분 (2~3줄 권장)")
    ap.add_argument("--template", default=DEFAULT_TEMPLATE)
    ap.add_argument("--out", default="./엔노블_썸네일.png")
    ap.add_argument("--font", default=DEFAULT_FONT)
    ap.add_argument("--font-size", type=int, default=None)
    ap.add_argument("--line-spacing", type=float, default=1.14)
    args = ap.parse_args()

    lines = [s.strip() for s in args.lines.split("|") if s.strip()]
    out = make_thumbnail(lines, args.template, args.out, args.font,
                         args.font_size, args.line_spacing)
    print("saved", out)


if __name__ == "__main__":
    main()
