#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""네이버 예상 발행일을 요일 정원제로 배치한다 — 사람이 날짜를 지정하지 않았을 때의 기본값.

왜: 홈페이지는 주말 포함 매일 3건씩 나가고(주 21건) 네이버는 평일 5일만 받는다.
    「홈페이지 실 발행일 + 1일」만 쓰면 금·토·일 3일치 9건이 전부 월요일로 몰린다.
    하루 9건은 네이버에서 저품질 신호로 읽힐 수 있고, 무엇보다 한 주가 앞쪽에
    쏠려 뒤가 빈다(2026-08-09 확정).

    그래서 요일마다 정원을 두고, 정원이 차면 다음 발행 가능일로 넘긴다.
    같은 날 홈페이지에 나간 글이어도 정원이 차면 갈라진다 — 이게 의도한 동작이다.

정원 (주 21건 = 홈페이지 주간 생산량):
    월 4 · 화 4 · 수 4 · 목 4 · 금 5 · 토·일 0

🔴 공휴일은 보지 않는다(2026-08-09 확정). 홈페이지가 공휴일에도 발행하므로 네이버만 쉬면
   그만큼 적체가 쌓일 뿐이다. 댕묘 네이버는 공휴일과 무관하게 월~금으로 돈다.

사용:
    python assign-publish-dates.py < plan.json
    python assign-publish-dates.py --selftest

stdin JSON:
    {
      "today": "2026-08-09",                     # 선택. 있으면 그 다음날부터만 배치
      "occupied": {"2026-08-10": 3},             # 선택. 이미 그 날짜에 잡힌 기존 카드 수
      "items": [{"title": "...", "homepage_pub": "2026-08-07"}]
    }

items 는 homepage_pub 오름차순으로 정렬해 처리하며, **홈페이지 발행 순서를 뒤집지 않는다**
(뒤 글이 앞 글보다 먼저 나가면 원본성 신호가 어긋난다).
"""
import json
import sys
from datetime import date, timedelta

for _s in (sys.stdout, sys.stderr):
    try:
        _s.reconfigure(encoding="utf-8", errors="replace")
    except Exception:
        pass

# 월=0 … 일=6. 합계 21 = 홈페이지 주간 생산량(하루 3건 × 7일).
CAPACITY = {0: 4, 1: 4, 2: 4, 3: 4, 4: 5, 5: 0, 6: 0}

# 한 건이 이 이상 밀리면 배치가 아니라 적체다 — 조용히 넘기지 않고 경고한다.
PUSH_WARN_DAYS = 14


def d(s):
    y, m, dd = (int(x) for x in s.split("-")[:3])
    return date(y, m, dd)


def is_open(day):
    return CAPACITY[day.weekday()] > 0


def assign(items, occupied=None, today=None):
    """(배치결과, 경고목록) 을 돌려준다. items 는 [{title, homepage_pub}]."""
    occ = dict(occupied or {})
    warns = []

    ordered = sorted(enumerate(items), key=lambda p: (d(p[1]["homepage_pub"]), p[0]))

    out = []
    cursor = None                      # 직전 배정일 — 순서 역전 방지
    for _, it in ordered:
        pub = d(it["homepage_pub"])
        start = pub + timedelta(days=1)

        # 계산한 날이 이미 지났거나 오늘이면 다음 발행 가능일로 당겨 올린다.
        if today and start <= today:
            start = today + timedelta(days=1)
        if cursor and start < cursor:
            start = cursor

        day = start
        while not (is_open(day) and occ.get(day, 0) < CAPACITY[day.weekday()]):
            day += timedelta(days=1)

        occ[day] = occ.get(day, 0) + 1
        cursor = day
        pushed = (day - (pub + timedelta(days=1))).days
        if pushed >= PUSH_WARN_DAYS:
            warns.append("%s — 홈페이지 발행 +1일 기준에서 %d일 밀렸습니다. 적체를 확인하세요."
                         % (it.get("title", "(제목 없음)"), pushed))
        out.append({"title": it.get("title", ""),
                    "homepage_pub": pub.isoformat(),
                    "naver_due": day.isoformat(),
                    "pushed_days": pushed})
    return out, warns


WD = "월화수목금토일"


def render(rows, warns):
    print("배치 결과")
    print("-" * 72)
    for r in rows:
        day = d(r["naver_due"])
        print("  %s (%s)  <- 홈 %s  %s"
              % (r["naver_due"], WD[day.weekday()], r["homepage_pub"], r["title"][:34]))
    print("-" * 72)
    per = {}
    for r in rows:
        per[r["naver_due"]] = per.get(r["naver_due"], 0) + 1
    for k in sorted(per):
        day = d(k)
        print("  %s (%s) %d/%d" % (k, WD[day.weekday()], per[k], CAPACITY[day.weekday()]))
    for w in warns:
        print("[PUSHED] " + w)


def selftest():
    bad = 0

    def eq(name, got, want):
        nonlocal bad
        ok = got == want
        if not ok:
            bad += 1
        print("  %s %s\n      got =%s\n      want=%s" % ("ok " if ok else "BAD", name, got, want))

    # 1) 8/10(월) 정원 4가 차면 같은 홈페이지 발행일이어도 8/11로 넘어간다 — 사장님 예시.
    items = [{"title": "a%d" % i, "homepage_pub": "2026-08-09"} for i in range(5)]
    rows, _ = assign(items)
    eq("정원 초과 시 다음날로",
       [r["naver_due"] for r in rows],
       ["2026-08-10"] * 4 + ["2026-08-11"])

    # 2) 이미 3건이 잡힌 월요일에는 1자리만 남는다.
    items = [{"title": "b%d" % i, "homepage_pub": "2026-08-09"} for i in range(3)]
    rows, _ = assign(items, occupied={date(2026, 8, 10): 3})
    eq("기존 점유 반영",
       [r["naver_due"] for r in rows],
       ["2026-08-10", "2026-08-11", "2026-08-11"])

    # 3) 금요일 정원은 5다.
    items = [{"title": "c%d" % i, "homepage_pub": "2026-08-13"} for i in range(6)]  # 목 → 금부터
    rows, _ = assign(items)
    eq("금요일 정원 5",
       [r["naver_due"] for r in rows],
       ["2026-08-14"] * 5 + ["2026-08-17"])       # 6번째는 토·일 건너뛰고 월요일

    # 4) 토요일 발행분(+1일=일요일)은 월요일로 밀린다.
    rows, _ = assign([{"title": "d", "homepage_pub": "2026-08-15"}])
    eq("주말은 건너뛴다", rows[0]["naver_due"], "2026-08-17")

    # 5) 공휴일이어도 넘기지 않는다 — 8/17은 광복절 대체공휴일이지만 평일 정원으로 쓴다.
    rows, _ = assign([{"title": "e", "homepage_pub": "2026-08-16"}])
    eq("공휴일 무시", rows[0]["naver_due"], "2026-08-17")

    # 6) 홈페이지 발행 순서를 뒤집지 않는다.
    items = [{"title": "old", "homepage_pub": "2026-08-03"},
             {"title": "new", "homepage_pub": "2026-08-09"}]
    rows, _ = assign(items, occupied={date(2026, 8, 4): 4})
    eq("순서 역전 없음",
       [r["naver_due"] for r in rows] == sorted(r["naver_due"] for r in rows), True)

    # 7) 지난 날짜는 오늘 다음날로 당겨 올린다.
    rows, _ = assign([{"title": "f", "homepage_pub": "2026-08-01"}], today=date(2026, 8, 9))
    eq("과거분 당겨 올림", rows[0]["naver_due"], "2026-08-10")

    print("selftest: %d/7" % (7 - bad))
    return 0 if bad == 0 else 1


def main():
    if "--selftest" in sys.argv:
        return selftest()

    # sys.stdin.read() 는 Windows 기본 로캘(cp949)로 디코드해 한글 제목을 깨뜨린다.
    # 로캘을 타지 않도록 바이트로 읽어 UTF-8로 직접 디코드한다(2026-08-09 실측).
    raw = sys.stdin.buffer.read().decode("utf-8", errors="replace").strip()
    if not raw:
        print("stdin 으로 JSON 을 넘기세요. 형식은 파일 상단 docstring 참고.", file=sys.stderr)
        return 2
    cfg = json.loads(raw)
    if not cfg.get("items"):
        print("items 가 비어 있습니다.", file=sys.stderr)
        return 2

    rows, warns = assign(
        cfg["items"],
        occupied={d(k): v for k, v in (cfg.get("occupied") or {}).items()},
        today=d(cfg["today"]) if cfg.get("today") else None,
    )
    render(rows, warns)
    print("\nJSON:")
    print(json.dumps(rows, ensure_ascii=False, indent=1))
    return 0


if __name__ == "__main__":
    sys.exit(main())
