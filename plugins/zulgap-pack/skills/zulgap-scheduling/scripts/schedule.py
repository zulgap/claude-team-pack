# -*- coding: utf-8 -*-
"""
schedule.py — 콘텐츠 발행일 결정론 계산기 (zulgap-scheduling v1.6~)

날짜 계산(평일 추출·공휴일 제외·우선순위·에피소드 정렬·균등 배치·멀티채널)을
전부 코드가 한다. AI가 머릿속으로 세지 않는다 — 근거: zulgap-blog SKILL.md의
실사고 "직접 세면 틀린다(키워드 5회라 보고했으나 실제 12회)".

사용법:
    python schedule.py <input.json>          # 결과 JSON을 stdout으로
    python schedule.py <input.json> <out.json>

input.json 형식은 scripts/schedule.example.json 참고. 이 스크립트는 계산만 한다 —
노션 조회·반영은 스킬(클로드)이 담당하고, 반영 전 사용자 확인(드라이런)을 거친다.
"""
import json
import re
import sys
from datetime import date, timedelta

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")

# ── 한국 공휴일 ────────────────────────────────────────────────────────────────
# SSOT: judgmentos unified-agent/shared/kr-holidays.js (2026-07-30 두 소스 교차 확인:
#   계산 gyesan.co.kr + 다우오피스HR). 그쪽이 갱신되면 이 표도 함께 갱신할 것.
# @AI:CONSTRAINT 공휴일은 연초 법정 확정 → 상수. 외부 API 실시간 의존 금지.
# @AI:CONSTRAINT 제헌절(07-17)은 2026년부터 공휴일 재지정 — "2008년 이후 공휴일 아님"으로
#   고치면 안 된다(2026-08-03 실사고: 이 스킬 문서를 그렇게 잘못 "정정"했다가 되돌림).
# 🔴 이 방식의 유일한 약점 = 사람이 안 넣으면 조용히 틀림. 그래서 데이터 없는 연도는
#   주말만 보정한 뒤 holiday_data_missing 을 결과에 함께 반환한다 (kr-holidays.js와 동일 설계).
KR_HOLIDAYS = {
    2026: frozenset([
        "2026-01-01",                                            # 신정
        "2026-02-16", "2026-02-17", "2026-02-18",                # 설날 연휴
        "2026-03-01", "2026-03-02",                              # 삼일절 + 대체
        "2026-05-05",                                            # 어린이날
        "2026-05-24", "2026-05-25",                              # 부처님오신날 + 대체
        "2026-06-03",                                            # 지방선거
        "2026-06-06",                                            # 현충일 (토 — 대체 없음)
        "2026-07-17",                                            # 제헌절 (2026 재지정)
        "2026-08-15", "2026-08-17",                              # 광복절 + 대체
        "2026-09-24", "2026-09-25", "2026-09-26", "2026-09-27",  # 추석 연휴
        "2026-10-03", "2026-10-05",                              # 개천절 + 대체
        "2026-10-09",                                            # 한글날
        "2026-12-25",                                            # 성탄절
    ]),
    # 2027은 의도적으로 비워 둔다 — kr-holidays.js와 동일 (제헌절·노동절 대체공휴일 적용이
    # 조사 시점에 미확정). 추측값을 넣으면 배치가 조용히 하루씩 어긋난다. 관보 확정본으로 채울 것.
}

# 네이버블로그 채널만 월요일 제외 (v1.4 규칙, 2026-08-02) — 채널명에 이 문자열이 들어가면 적용
NAVER_CHANNEL_MARKER = "네이버"
# 우선순위 단계 (v1.5 규칙) — 공백·마침표를 걷어낸 뒤 이 문자열을 포함하면 최우선 배치
PRIORITY_STAGE_MARKER = "타이핑요청"
EPISODE_RE = re.compile(r"(\d+)\s*/\s*(\d+)")


def _d(s):
    y, m, dd = map(int, str(s).split("-"))
    return date(y, m, dd)


def _s(d):
    return d.isoformat()


def is_weekend(d):
    return d.weekday() >= 5  # 5=토, 6=일


def is_holiday(d):
    return _s(d) in KR_HOLIDAYS.get(d.year, frozenset())


def month_end(yyyymm):
    y, m = map(int, yyyymm.split("-"))
    nxt = date(y + 1, 1, 1) if m == 12 else date(y, m + 1, 1)
    return nxt - timedelta(days=1)


def available_days(start, end, extra_exclude, exclude_monday):
    """start~end 사이 발행 가능일. 토/일 + 공휴일 + 추가 제외일 (+ 채널별 월요일) 제외."""
    out, d = [], start
    while d <= end:
        if (not is_weekend(d) and not is_holiday(d)
                and _s(d) not in extra_exclude
                and not (exclude_monday and d.weekday() == 0)):
            out.append(d)
        d += timedelta(days=1)
    return out


def next_business_day(after, extra_exclude, exclude_monday):
    """after 다음의 첫 발행 가능일 (멀티채널 보조 채널 = 메인 +1 규칙). 최대 14일 가드."""
    d = after + timedelta(days=1)
    for _ in range(14):
        if (not is_weekend(d) and not is_holiday(d)
                and _s(d) not in extra_exclude
                and not (exclude_monday and d.weekday() == 0)):
            return d
        d += timedelta(days=1)
    return None


def sort_items(items):
    """1차: 단계 '8.타이핑 요청' 우선(v1.5) / 2차: 제목의 N/M 에피소드 번호(없으면 입력 순서)."""
    def norm(s):
        return re.sub(r"[\s.]", "", str(s or ""))

    def key(pair):
        idx, it = pair
        pri = 0 if PRIORITY_STAGE_MARKER in norm(it.get("stage")) else 1
        m = EPISODE_RE.search(str(it.get("title") or ""))
        ep = int(m.group(1)) if m else 10**9  # 에피소드 없으면 뒤로, 입력 순서 유지
        return (pri, ep, idx)

    return [it for _, it in sorted(enumerate(items), key=key)]


def spread_evenly(days, n):
    """가용일 days 위에 n건을 균등 배치 (결정론 — 인덱스 등간격)."""
    if n > len(days):
        raise SystemExit(
            f"[배치 불가] 콘텐츠 {n}건 > 가용일 {len(days)}일. "
            f"기간을 늘리거나 건수를 줄일지 사람이 정할 일이다 — 임의로 겹쳐 배치하지 않는다.")
    if n == 1:
        return [days[0]]
    last = len(days) - 1
    picked = [days[round(i * last / (n - 1))] for i in range(n)]
    # round 충돌(가용일이 빠듯할 때) 방지 — 겹치면 다음 미사용 인덱스로 민다
    used, out = set(), []
    for d in picked:
        i = days.index(d)
        while i in used:
            i += 1
        used.add(i)
        out.append(days[i])
    return out


def compute(cfg):
    month = cfg["month"]
    channels = cfg.get("channels") or ["네이버블로그"]
    extra = set(cfg.get("extra_exclude") or [])
    items = sort_items(cfg.get("items") or [])
    if not items:
        raise SystemExit("[입력 오류] items 가 비어 있음")

    # 시작일: 커스텀 start_date > 표준(요청일 다음날). 커스텀은 스킬이 사용자 확인 후 넘긴다.
    if cfg.get("start_date"):
        start, start_rule = _d(cfg["start_date"]), "custom"
    else:
        start, start_rule = _d(cfg["request_date"]) + timedelta(days=1), "request_date+1"
    end = month_end(month)
    if start > end:
        raise SystemExit(f"[기간 오류] 시작일 {start} 이 대상 월({month}) 말일 {end} 이후")

    years = {start.year, end.year}
    missing_years = sorted(y for y in years if y not in KR_HOLIDAYS)

    main_ch = channels[0]
    main_days = available_days(start, end, extra, NAVER_CHANNEL_MARKER in main_ch)
    main_dates = spread_evenly(main_days, len(items))

    warnings = []
    if missing_years:
        warnings.append(f"공휴일 데이터 없는 연도 {missing_years} — 주말만 제외하고 계산됨. "
                        f"KR_HOLIDAYS 에 관보 확정본을 채운 뒤 재실행할 것")
    for a, b in zip(main_dates, main_dates[1:]):
        gap = (b - a).days
        if gap < 2 or gap > 7:
            warnings.append(f"{main_ch} 간격 {gap}일 ({_s(a)}→{_s(b)}) — 표준 2~7일 벗어남")

    result = []
    for it, d0 in zip(items, main_dates):
        row = {"title": it.get("title"), "stage": it.get("stage"),
               "priority": PRIORITY_STAGE_MARKER in re.sub(r"[\s.]", "", str(it.get("stage") or "")),
               "dates": {main_ch: _s(d0)}}
        prev = d0
        for ch in channels[1:]:  # 보조 채널 = 직전 채널 다음 발행 가능일 (v1.2 멀티채널 규칙)
            nb = next_business_day(prev, extra, NAVER_CHANNEL_MARKER in ch)
            if nb is None:
                warnings.append(f"'{it.get('title')}' {ch} 배치 실패 — {_s(prev)} 뒤 14일 내 가용일 없음")
                row["dates"][ch] = None
            else:
                row["dates"][ch] = _s(nb)
                if nb > end:  # +1 영업일 규칙상 정당하지만, 대상 월을 벗어나면 사람이 알아야 한다
                    warnings.append(f"'{it.get('title')}' {ch} {_s(nb)} — 대상 월({month}) 경계 초과")
                prev = nb
        result.append(row)

    return {
        "month": month, "start": _s(start), "end": _s(end), "start_rule": start_rule,
        "channels": channels, "items": result,
        "available_days": {main_ch: [_s(d) for d in main_days]},
        "holiday_data_missing": bool(missing_years), "warnings": warnings,
    }


def main():
    if len(sys.argv) < 2:
        raise SystemExit("사용법: python schedule.py <input.json> [out.json]")
    with open(sys.argv[1], encoding="utf-8") as f:
        cfg = json.load(f)
    out = compute(cfg)
    text = json.dumps(out, ensure_ascii=False, indent=2)
    if len(sys.argv) > 2:
        with open(sys.argv[2], "w", encoding="utf-8") as f:
            f.write(text + "\n")
        print(f"완료 → {sys.argv[2]}  (항목 {len(out['items'])}건, 경고 {len(out['warnings'])}건)")
    else:
        print(text)


if __name__ == "__main__":
    main()
