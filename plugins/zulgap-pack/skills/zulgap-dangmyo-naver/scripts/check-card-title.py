#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""네이버 카드 제목에 홈페이지 발행일이 붙었는지 코드가 판정한다.

왜: 홈페이지가 하루 3건씩 매일 나가면서 두 채널의 글 수가 빠르게 벌어졌다.
    네이버용은 제목을 재작성하므로 홈페이지 제목과 글자가 달라, 노션 리스트에서
    「이 네이버 카드가 어느 홈페이지 글의 짝인가」를 눈으로 못 찾는다.
    2026-08-09 실제로 카드 19장에서 대조가 막혀 19장을 손으로 되짚어야 했다.

    제목 끝에 `(M/D)` 를 붙이면 리스트 한 줄로 짝이 보인다. 다만 이건 사람이
    매번 기억해서 붙여야 하는 종류의 규칙이라 문서로는 샌다 — 그래서 코드가 센다.

사용:
    python check-card-title.py --title "제목 (8/7)" --homepage-pub 2026-08-07
    python check-card-title.py --title "제목 (홈 미발행)" --homepage-pub ""
    python check-card-title.py --title "댕묘 소개 — ..." --naver-only
    python check-card-title.py --selftest

종료코드 0 = PASS. 그 외는 FAIL이며, **FAIL이면 create_blog_card 를 호출하지 않는다.**
"""
import argparse
import re
import sys

# Windows 기본 콘솔은 cp949 라 `—` 같은 글자에서 UnicodeEncodeError 로 죽는다.
# 판정 결과를 못 보고 트레이스백만 남으면 검사기가 없는 것과 같으므로 출력을 UTF-8로 고정한다.
for _s in (sys.stdout, sys.stderr):
    try:
        _s.reconfigure(encoding="utf-8", errors="replace")
    except Exception:
        pass

UNPUBLISHED = "(홈 미발행)"

# 제목 끝의 날짜 접미사. 월·일에 앞자리 0을 붙이지 않는다(8/7 이지 08/07 이 아니다).
SUFFIX_RE = re.compile(r"\s\((\d{1,2})/(\d{1,2})\)$")

# 접미사가 아닌 자리에 섞여 있는 날짜 — 이중 부착·오붙임 탐지용.
STRAY_RE = re.compile(r"\(\s*\d{1,2}\s*/\s*\d{1,2}\s*\)")


def check(title, homepage_pub, naver_only):
    """(ok, [메시지]) 를 돌려준다. 메시지는 사람이 그대로 읽을 수 있게 쓴다."""
    msgs = []
    t = (title or "").strip()

    if not t:
        return False, ["[EMPTY-TITLE] 제목이 비어 있습니다."]

    if naver_only:
        # 네이버 전용 글(소개글·공지글)은 홈페이지 원문이 없다. 날짜가 없는 것이 정상이고,
        # 붙어 있으면 없는 원문을 가리키게 되므로 그쪽이 오류다.
        if SUFFIX_RE.search(t) or t.endswith(UNPUBLISHED):
            return False, ["[SUFFIX-ON-NAVER-ONLY] 네이버 전용 글에는 날짜를 붙이지 않습니다. "
                           "홈페이지에 대응 원문이 없어 가리킬 날짜가 없습니다."]
        return True, ["[PASS] 네이버 전용 글 — 접미사 없음이 정상"]

    pub = (homepage_pub or "").strip()

    if not pub:
        # 홈페이지가 아직 안 나갔다. 표기 자체가 「네이버가 원본보다 먼저 나가려 한다」는 경고다.
        if not t.endswith(UNPUBLISHED):
            return False, ["[MISSING-SUFFIX] 홈페이지 발행일이 없으므로 제목 끝에 "
                           f"`{UNPUBLISHED}` 를 붙여야 합니다.",
                           f"  받은 제목: {t}"]
        return True, [f"[PASS] {UNPUBLISHED} — 홈페이지 발행 전"]

    m = re.match(r"^(\d{4})-(\d{2})-(\d{2})", pub)
    if not m:
        return False, [f"[BAD-DATE] 홈페이지 발행일 형식이 YYYY-MM-DD 가 아닙니다: {pub}"]
    want = (int(m.group(2)), int(m.group(3)))

    got = SUFFIX_RE.search(t)
    if not got:
        return False, ["[MISSING-SUFFIX] 제목 끝에 홈페이지 발행일이 없습니다. "
                       f"`{t} ({want[0]}/{want[1]})` 형태여야 합니다."]

    if (int(got.group(1)), int(got.group(2))) != want:
        return False, [f"[DATE-MISMATCH] 제목의 날짜가 홈페이지 실 발행일과 다릅니다.",
                       f"  제목: ({got.group(1)}/{got.group(2)}) / 홈페이지: ({want[0]}/{want[1]})"]

    # 접미사를 뗀 나머지에 또 날짜가 있으면 두 번 붙인 것이다(재실행 사고).
    body = t[: got.start()]
    if STRAY_RE.search(body):
        return False, ["[DUPLICATE-SUFFIX] 제목 안에 날짜가 두 번 들어 있습니다. "
                       "이미 붙은 카드에 다시 붙이지 않았는지 확인하세요.",
                       f"  받은 제목: {t}"]

    return True, [f"[PASS] ({got.group(1)}/{got.group(2)}) — 홈페이지 실 발행일과 일치"]


CASES = [
    # (제목, 홈페이지발행일, 네이버전용, 기대)
    ("고양이 모래 버리는법, 종량제 봉투에 담으면 수거가 거부됩니다 (8/3)", "2026-08-03", False, True),
    ("강아지 건강검진 비용, 항목 수를 보세요 (8/7)", "2026-08-07", False, True),
    ("강아지 건강검진 비용, 항목 수를 보세요", "2026-08-07", False, False),      # 접미사 누락
    ("강아지 건강검진 비용, 항목 수를 보세요 (8/6)", "2026-08-07", False, False),  # 날짜 불일치
    ("강아지 건강검진 비용 (8/7) 추가본 (8/7)", "2026-08-07", False, False),      # 이중 부착
    ("강아지 슬개골 탈구 수술 비용 (홈 미발행)", "", False, True),
    ("강아지 슬개골 탈구 수술 비용", "", False, False),                            # 미발행 표기 누락
    ("댕묘 소개 — 광고가 아니라 데이터로 고릅니다", None, True, True),
    ("댕묘가 쓰는 출처 (8/9)", None, True, False),                                # 전용 글에 날짜
    ("", "2026-08-07", False, False),                                             # 빈 제목
    # 한 자리 월·일도 앞자리 0 없이 통과해야 한다.
    ("반려동물 등록, 이사한 뒤입니다 (9/1)", "2026-09-01", False, True),
]


def selftest():
    bad = 0
    for i, (title, pub, only, want) in enumerate(CASES, 1):
        ok, msgs = check(title, pub, only)
        mark = "ok " if ok == want else "BAD"
        if ok != want:
            bad += 1
        print("  %s #%-2d expected=%-5s got=%-5s | %s"
              % (mark, i, want, ok, msgs[0]))
    print("selftest: %d/%d" % (len(CASES) - bad, len(CASES)))
    return 0 if bad == 0 else 1


def main():
    ap = argparse.ArgumentParser(description="네이버 카드 제목의 홈페이지 발행일 표기를 판정한다.")
    ap.add_argument("--title", help="검사할 카드 제목(접미사 포함)")
    ap.add_argument("--homepage-pub", default=None,
                    help="대응 홈페이지 글의 실 발행일 YYYY-MM-DD. 미발행이면 빈 문자열")
    ap.add_argument("--naver-only", action="store_true",
                    help="홈페이지 원문이 없는 네이버 전용 글(소개글·공지글)")
    ap.add_argument("--selftest", action="store_true")
    a = ap.parse_args()

    if a.selftest:
        return selftest()

    if a.title is None:
        ap.error("--title 이 필요합니다 (또는 --selftest)")
    if not a.naver_only and a.homepage_pub is None:
        ap.error("--homepage-pub 이 필요합니다. 홈페이지 미발행이면 빈 문자열(\"\")을 넘기세요.")

    ok, msgs = check(a.title, a.homepage_pub, a.naver_only)
    for m in msgs:
        print(m)
    if not ok:
        print("\n제목을 고치기 전에는 카드를 만들지 마세요.")
    return 0 if ok else 2


if __name__ == "__main__":
    sys.exit(main())
