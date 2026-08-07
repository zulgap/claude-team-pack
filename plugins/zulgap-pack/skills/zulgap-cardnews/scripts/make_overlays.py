# -*- coding: utf-8 -*-
"""
cardnews 영상화 1/2 — 텍스트+로고 오버레이(투명 PNG) 생성

레퍼런스(엔노블 PARENTS SECRET, 2026-07-09) 실측 좌표를 그대로 재현한다.
캔버스 1080x1350 (4:5). 산출물: <out_dir>/ov_1.png ~ ov_6.png (RGBA)

사용법:
    python make_overlays.py <slides.json> [out_dir]

    slides.json 형식은 slides.example.json 참고. 슬라이드마다
    title(2줄) / body(2줄) 을 넣는다. 카피만 바꾸면 되고 이 파일은 안 건드린다.

함정 (반드시 유지):
    - 도현체에는 '·'(U+00B7), '→'(U+2192) 글리프가 없다 → □ 로 깨진다.
      '·' 는 '/' 로 대체할 것. 아래 glyph_guard() 가 누락 시 에러를 낸다.
    - ffmpeg drawtext 로는 하지 말 것. PowerShell 인자 이스케이프가 깨지고
      한글 폰트 지정이 어렵다. PIL 로 PNG 를 만들고 overlay 필터로 합성한다.
"""
import json, sys
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")

# ── 경로 ──────────────────────────────────────────────────────────────
SKILL = Path(__file__).resolve().parent.parent
FONT_KR = SKILL / "assets" / "fonts" / "DoHyeon.ttf"

# @AI:DEPENDS N.NOBLE 로고는 시스템 세리프에 의존한다(레포에 번들할 수 없음 — 재배포 불가 폰트).
#   폭 244px 는 draw_tracked() 의 자간 계산이 맞춰 주므로 대체 폰트에서도 레이아웃은 유지되지만
#   글자 모양은 미세하게 달라진다. 그래서 대체본이 쓰이면 조용히 넘기지 않고 경고를 낸다.
SERIF_CANDIDATES = (
    Path("C:/Windows/Fonts/times.ttf"),                                    # Windows
    Path("/System/Library/Fonts/Supplemental/Times New Roman.ttf"),        # macOS
    Path("/Library/Fonts/Times New Roman.ttf"),                            # macOS (구버전)
    Path("/System/Library/Fonts/Supplemental/Georgia.ttf"),                # macOS 폴백
    Path("/usr/share/fonts/truetype/liberation/LiberationSerif-Regular.ttf"),  # Linux
    Path("/usr/share/fonts/truetype/dejavu/DejaVuSerif.ttf"),              # Linux 폴백
)
FONT_SERIF = next((p for p in SERIF_CANDIDATES if p.exists()), None)

# ── 브랜드 규격 (레퍼런스 실측) ────────────────────────────────────────
W, H = 1080, 1350
GOLD = (211, 177, 113)
WHITE = (255, 255, 255)
BOX_TEXT = (38, 30, 18)

LOGO_Y, LOGO_H = 67, 33                 # N.NOBLE 잉크 상단 / 높이
BOX = (376, 124, 705, 157)              # MATCH-MAKING BIBLE 골드 박스
RULE = (96, 866, 176, 872)              # 소제목 위 골드 라인
TEXT_X = 98
TITLE_SIZE, TITLE_Y, TITLE_GAP = 70, 901, 92
BODY_SIZE, BODY_Y, BODY_GAP = 42, 1113, 60
PAGE_RIGHT, PAGE_Y, PAGE_SIZE = 979, 1270, 34

def korean_guard(slides):
    """[필수·비협상] 영상 프롬프트에 한국인 피사체 지정이 없으면 실패시킨다.

    Seedance 는 인종을 안 쓰면 백인을 뽑는다. 2026-07-17 자만추 편에서
    프롬프트 거부를 완화하다 'Korean' 을 빼버려 2번 슬라이드에 백인이 나왔다.
    거부될 때 지워야 하는 건 '거부 트리거'(고유지명 등)지 인종 지정이 아니다.
    """
    bad = [s["n"] for s in slides
           if "korean" not in (s.get("video_prompt") or "").lower()]
    if bad:
        raise SystemExit(
            f"[한국인 미지정] 슬라이드 {bad} 의 video_prompt 에 'Korean' 이 없음.\n"
            f" → 인물은 무조건 한국인. 'Korean man/woman/professional' 을 명시할 것.\n"
            f" → 프롬프트가 거부되면 고유지명·오디오 등 트리거를 빼고 재시도하되,\n"
            f"    'Korean' 은 절대 빼지 말 것 (assets/brand_kit.md 참고).")
    print("한국인 피사체 검사: 통과")


def glyph_guard(slides):
    """도현체에 없는 글리프가 카피에 섞이면 즉시 실패시킨다 (□ 방지)."""
    from fontTools.ttLib import TTFont
    cmap = TTFont(str(FONT_KR)).getBestCmap()
    bad = {}
    for s in slides:
        for line in s["title"] + s["body"]:
            for ch in line:
                if ch != " " and ord(ch) not in cmap:
                    bad.setdefault(ch, []).append(s["n"])
    if bad:
        detail = ", ".join(f"'{c}'(U+{ord(c):04X}) → 슬라이드 {sorted(set(v))}"
                           for c, v in bad.items())
        raise SystemExit(f"[글리프 누락] 도현체에 없는 문자: {detail}\n"
                         f" → '·'는 '/'로 바꾸고, '→'는 도형으로 그릴 것.")
    print("글리프 검사: 통과")


def ink_bbox(text, font):
    """텍스트의 실제 잉크 bbox (좌상단 기준 오프셋 포함)."""
    img = Image.new("L", (2000, 400), 0)
    ImageDraw.Draw(img).text((100, 150), text, font=font, fill=255)
    bb = img.getbbox()
    return (bb[0] - 100, bb[1] - 150, bb[2] - bb[0], bb[3] - bb[1])


def draw_ink(d, x, y, text, font, fill):
    """잉크 좌상단이 정확히 (x, y)에 오도록 그린다."""
    ox, oy, _, _ = ink_bbox(text, font)
    d.text((x - ox, y - oy), text, font=font, fill=fill)


def draw_tracked(d, cx, y, text, font, fill, tracking):
    """자간(tracking)을 준 중앙정렬 텍스트. 잉크 상단을 y에 맞춘다."""
    widths = [d.textlength(c, font=font) for c in text]
    total = sum(widths) + tracking * (len(text) - 1)
    _, oy, _, _ = ink_bbox(text, font)
    x = cx - total / 2
    for c, w in zip(text, widths):
        d.text((x, y - oy), c, font=font, fill=fill)
        x += w + tracking


def gradient_layer():
    """하단 어둡게 + 상단 살짝 (로고/카피 가독성). 레퍼런스 밝기 프로파일 근사."""
    g = Image.new("L", (1, H), 0)
    px = g.load()
    for y in range(H):
        a = 0
        if y >= 580:                       # 하단: 이징 램프 0 → 200
            t = min(1.0, (y - 580) / (1250 - 580))
            a = int(200 * (t ** 1.6))
        if y < 330:                        # 상단: 로고 가독성 비네트 165 → 0
            # 밝은 하늘 배경에서도 골드 로고가 살도록. 지수 1.3 = 밴딩 없는 완만한 감쇠.
            # 로고 잉크 구간(y=67~99)에 alpha 104~123 확보.
            a = max(a, int(165 * (1 - y / 330) ** 1.3))
        px[0, y] = a
    mask = g.resize((W, H))
    layer = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    layer.putalpha(mask)
    return layer


def build(n, slide, total=6):
    img = Image.alpha_composite(Image.new("RGBA", (W, H), (0, 0, 0, 0)), gradient_layer())
    d = ImageDraw.Draw(img)

    f_title = ImageFont.truetype(str(FONT_KR), TITLE_SIZE)
    f_body = ImageFont.truetype(str(FONT_KR), BODY_SIZE)
    f_page = ImageFont.truetype(str(FONT_KR), PAGE_SIZE)

    # ── N.NOBLE 로고 (세리프 + 넓은 자간, 골드) : 목표 잉크 244x33 ──
    size = 44
    f_logo = ImageFont.truetype(str(FONT_SERIF), size)
    while ink_bbox("N.NOBLE", f_logo)[3] > LOGO_H and size > 20:
        size -= 1
        f_logo = ImageFont.truetype(str(FONT_SERIF), size)
    base_w = sum(d.textlength(c, font=f_logo) for c in "N.NOBLE")
    tracking = (244 - base_w) / (len("N.NOBLE") - 1)
    draw_tracked(d, W // 2, LOGO_Y, "N.NOBLE", f_logo, GOLD, tracking)

    # ── MATCH-MAKING BIBLE 골드 박스 ──
    d.rectangle(BOX, fill=GOLD)
    bx0, by0, bx1, by1 = BOX
    fs = 17
    f_box = ImageFont.truetype(str(FONT_SERIF), fs)
    label = "MATCH-MAKING BIBLE"
    base_w = sum(d.textlength(c, font=f_box) for c in label)
    tr = ((bx1 - bx0) * 0.86 - base_w) / (len(label) - 1)
    _, _, _, ih = ink_bbox(label, f_box)
    draw_tracked(d, (bx0 + bx1) // 2, (by0 + by1) // 2 - ih // 2, label, f_box, BOX_TEXT, tr)

    # ── 골드 라인 ──
    d.rectangle(RULE, fill=GOLD)

    # ── 제목 2줄 ──
    for i, line in enumerate(slide["title"]):
        draw_ink(d, TEXT_X, TITLE_Y + i * TITLE_GAP, line, f_title, WHITE)

    # ── 본문 2줄 ──
    for i, line in enumerate(slide["body"]):
        draw_ink(d, TEXT_X + 1, BODY_Y + i * BODY_GAP, line, f_body, WHITE + (224,))

    # ── 페이지 번호 (우측 정렬) ──
    page = f"{n:02d} / {total:02d}"
    ox, oy, iw, _ = ink_bbox(page, f_page)
    d.text((PAGE_RIGHT - iw - ox, PAGE_Y - oy), page, font=f_page, fill=WHITE + (200,))

    return img


def main():
    if len(sys.argv) < 2:
        raise SystemExit("사용법: python make_overlays.py <slides.json> [out_dir]")
    cfg_path = Path(sys.argv[1])
    cfg = json.loads(cfg_path.read_text(encoding="utf-8"))
    slides = cfg["slides"]
    out_dir = Path(sys.argv[2]) if len(sys.argv) > 2 else cfg_path.parent / "overlays"

    if not FONT_KR.exists():
        raise SystemExit(f"[폰트 없음] {FONT_KR}\n"
                         f" → assets/brand_kit.md 의 npm @fontsource/do-hyeon 경로로 재조달할 것.")
    if FONT_SERIF is None:
        raise SystemExit("[세리프 폰트 없음] N.NOBLE 로고에 쓸 세리프 폰트를 찾지 못했다.\n"
                         " → 확인한 경로:\n"
                         + "".join(f"     {p}\n" for p in SERIF_CANDIDATES)
                         + " → Times New Roman 계열을 설치하거나 SERIF_CANDIDATES 에 경로를 추가할 것.")
    if FONT_SERIF != SERIF_CANDIDATES[0]:
        print(f"[알림] 로고 세리프 대체본 사용: {FONT_SERIF}\n"
              f"       레퍼런스는 Times New Roman 기준이다. 자간 계산으로 폭 244px 는 유지되지만\n"
              f"       글자 모양이 미세하게 다를 수 있으니 최종 프레임에서 로고를 확인할 것.")
    for s in slides:
        for k in ("title", "body"):
            if len(s[k]) != 2:
                raise SystemExit(f"[카피 형식] 슬라이드 {s['n']} 의 {k} 는 2줄이어야 함 "
                                 f"(현재 {len(s[k])}줄)")
    korean_guard(slides)
    glyph_guard(slides)

    out_dir.mkdir(parents=True, exist_ok=True)
    total = len(slides)
    for s in slides:
        build(s["n"], s, total).save(out_dir / f"ov_{s['n']}.png")
        print(f"  생성 ov_{s['n']}.png  {' '.join(s['title'])}")
    print(f"\n완료: {total}장 → {out_dir}")


if __name__ == "__main__":
    main()
