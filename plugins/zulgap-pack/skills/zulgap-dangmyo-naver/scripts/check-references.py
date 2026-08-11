#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""네이버 원고에 홈페이지 원문의 참고 자료가 옮겨졌는지 코드가 판정한다.

왜: 댕묘는 공적 출처(법령·정부 고시·수의 가이드라인) 위에 서 있는 채널이라
    출처가 빠지면 글의 근거가 통째로 사라진다. 그런데 재가공 절차에 이 단계가
    없었다 — 2026-08-09 e2e 로 만든 카드 3장이 전부 참고 자료 없이 나갔고
    (고양이 화장실 · 고양이 습식 사료 · 강아지 스케일링), 부모 검사기는
    FAIL 0 을 찍었다. 부모 검사기는 「원문을 베꼈나」를 보지 「빠뜨렸나」를
    보지 않기 때문이다.

    같은 이유로 이 검사는 **부모 검사기와 따로, 참고 자료를 넣은 뒤에** 돌려야 한다.
    사람은 부모 검사기가 PASS 하면 다 됐다고 여기고 손을 뗀다.

사용:
    python check-references.py <홈페이지원문.md> <네이버원고.md>
    python check-references.py --selftest

종료코드 0 = PASS. 그 외는 FAIL이며, **FAIL이면 카드를 만들지 않는다.**
"""
import argparse
import re
import sys
import unicodedata

# Windows 기본 콘솔은 cp949 라 `—` 같은 글자에서 UnicodeEncodeError 로 죽는다.
# 판정 결과를 못 보고 트레이스백만 남으면 검사기가 없는 것과 같으므로 출력을 UTF-8로 고정한다.
for _s in (sys.stdout, sys.stderr):
    try:
        _s.reconfigure(encoding="utf-8", errors="replace")
    except Exception:
        pass

# 「참고 자료」·「참고한 자료」 두 표기가 실제로 섞여 있다. 헤딩(`### `)으로도
# 굵게(`**...**`)로도 쓰여 있어 둘 다 받는다.
HEAD_RE = re.compile(r"^\s*(?:#{1,6}\s*)?\*{0,2}\s*참고(?:한)?\s*자료\s*\*{0,2}\s*$")

# 섹션의 끝 — 다음 헤딩, 해시태그 줄, 굵은 소제목, 구분선.
END_RE = re.compile(r"^\s*(?:#|\*\*|---|___)")

ITEM_RE = re.compile(r"^\s*[-*+]\s+(.*\S)\s*$")

# 주소가 한 글자라도 있으면 노션이 자동으로 마크다운 링크로 바꾼다.
# `law.go.kr` 처럼 점이 두 번 들어가는 국내 주소를 놓치지 않도록 중간 마디를 허용한다.
URL_RE = re.compile(
    r"https?://"
    r"|(?<![A-Za-z0-9.-])[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*"
    r"\.(?:com|net|org|kr|io|edu|gov|info)(?![A-Za-z])"
)

# 댕묘 자기 글은 「본문 말미 홈페이지 안내 한 줄」로 합치는 처리가 허용돼 있다
# (실제로 그렇게 처리한 카드가 있고, 재가공 내역에 근거가 적혀 있다).
# 그래서 이것만 빠진 경우는 FAIL 이 아니라 알림이다.
INTERNAL_RE = re.compile(r"dangmyo\.com|^댕묘\s")

NEAR_RATIO = 0.90   # 부모 검사기 ① 과 같은 부분일치 임계
MIN_LEN = 12        # 이보다 짧은 조각은 상투구라 비교 제외


def _norm(s):
    """마크다운을 걷어내고 비교용으로 다듬는다. 부모 검사기와 같은 규칙을 쓴다."""
    s = re.sub(r"\[([^\]]*)\]\([^)]*\)", r"\1", s)   # 링크 → 텍스트만
    s = re.sub(r"<[^>]+>", "", s)
    s = re.sub(r"[*_~`]", "", s)
    s = unicodedata.normalize("NFC", s)
    return re.sub(r"\s+", " ", s).strip()


def _cmp(s):
    """복사 여부를 견줄 때 쓰는 형태 — 주소와 꼬리 기호를 걷어낸다.

    네이버판은 주소를 일부러 빼므로, 주소를 붙인 채 견주면 원문 쪽만 길어져
    부분일치 비율이 0.90 아래로 떨어진다. 「그대로 복사」인데 통과하게 된다.
    """
    s = URL_RE.sub("", s)
    s = re.sub(r"[\s—–\-·,.:;/]+$", "", s)
    return re.sub(r"\s+", " ", s).strip()


def parse_refs(text):
    """참고 자료 섹션의 항목 리스트를 돌려준다. 섹션이 없으면 None."""
    lines = text.split("\n")
    for i, line in enumerate(lines):
        if not HEAD_RE.match(line):
            continue
        items = []
        for rest in lines[i + 1:]:
            if not rest.strip():
                # 빈 줄 하나로는 끊지 않는다 — 항목 사이가 비어 있는 문서가 있다.
                continue
            if END_RE.match(rest):
                break
            m = ITEM_RE.match(rest)
            if m:
                items.append(_norm(m.group(1)))
            else:
                # 목록이 아닌 문단이 나오면 섹션이 끝난 것으로 본다.
                break
        return items
    return None


def check(orig_text, nav_text):
    """(ok, [메시지]) 를 돌려준다. 메시지는 사람이 그대로 읽을 수 있게 쓴다."""
    orig = parse_refs(orig_text)
    nav = parse_refs(nav_text)

    if not orig:
        # 원문에 출처가 없으면 옮길 것이 없다. 없는 것을 지어내면 안 되므로 여기서 끝낸다.
        return True, ["[NO-SOURCE-REFS] 홈페이지 원문에 참고 자료가 없습니다 — 옮길 것이 없어 통과합니다.",
                      "  출처가 필요한 글인데 원문에도 없다면, 네이버판에 지어 넣지 말고 원문부터 고치세요."]

    external = [x for x in orig if not INTERNAL_RE.search(x)]
    internal = [x for x in orig if INTERNAL_RE.search(x)]

    if nav is None:
        msgs = ["[NO-REFS] 네이버 원고에 참고 자료 섹션이 없습니다. "
                f"홈페이지 원문에는 {len(orig)}건 있습니다.",
                "  본문 맨 끝(해시태그 바로 앞)에 `### 참고 자료` 로 넣으세요. 원문 목록:"]
        msgs += ["    - " + x for x in orig]
        return False, msgs

    msgs = []
    ok = True

    # ① 외부 출처가 줄어들면 근거가 사라진 것이다.
    if len(nav) < len(external):
        ok = False
        msgs.append(f"[MISSING-REFS] 참고 자료가 모자랍니다 — 네이버 {len(nav)}건 / "
                    f"원문 외부 출처 {len(external)}건.")
        msgs += ["    원문: " + x for x in external]
    else:
        msgs.append(f"[PASS] 참고 자료 {len(nav)}건 (원문 외부 출처 {len(external)}건)")

    if internal and len(nav) < len(orig):
        # FAIL 은 아니다. 다만 「합쳤다」는 근거가 재가공 내역에 적혀 있어야 한다.
        msgs.append(f"[NOTE] 원문의 댕묘 내부 글 {len(internal)}건은 빠져 있습니다. "
                    "본문 말미 홈페이지 안내로 합쳤다면 정상이며, 그 사실을 재가공 내역에 적으세요.")

    # ② 주소가 있으면 노션이 자동으로 링크를 건다 → 「링크 금지」 위반 + 부모 검사기 ③ FAIL.
    with_url = [x for x in nav if URL_RE.search(x)]
    if with_url:
        ok = False
        msgs.append("[URL-IN-REFS] 참고 자료 줄에 주소가 있습니다. 노션이 자동으로 링크를 걸어 "
                    "「주소는 텍스트로 두고 링크를 걸지 않는다」 규칙과 부모 검사기 ③ 를 어깁니다.")
        msgs += ["    - " + x for x in with_url]
        msgs.append("    기관명·법령명만 적고, 필요하면 「국가법령정보센터에서 조회」 처럼 끝내세요.")

    # ③ 원문 줄을 그대로 옮기면 중복 콘텐츠가 된다. 부모 검사기 ① 과 같은 판정이지만,
    #    참고 자료는 부모 검사기를 통과시킨 **뒤에** 넣는 일이 잦아 여기서 다시 본다.
    copied = []
    orig_cmp = [_cmp(o) for o in orig]
    for s in nav:
        c = _cmp(s)
        if len(c) < MIN_LEN:
            continue
        if c in orig_cmp:
            copied.append(s)
            continue
        for o in orig_cmp:
            a, b = (c, o) if len(c) <= len(o) else (o, c)
            if len(b) and a in b and len(a) / len(b) >= NEAR_RATIO:
                copied.append(s)
                break
    if copied:
        ok = False
        msgs.append("[COPIED-REFS] 원문 줄을 그대로 옮겼습니다. 법령명·기관명은 못 바꾸니 "
                    "표기 형식만 바꾸세요(「」 씌우기, 학술지명 괄호로 묶기, 설명 문구 다시 쓰기).")
        msgs += ["    - " + x for x in copied]

    # ④ 위치 — 해시태그보다 뒤에 있으면 붙여넣을 때 태그 아래로 밀린다.
    nav_head = None
    nav_tags = None
    for i, line in enumerate(nav_text.split("\n")):
        if nav_head is None and HEAD_RE.match(line):
            nav_head = i
        if nav_tags is None and line.strip().startswith("#") and " #" in line:
            nav_tags = i
    if nav_head is not None and nav_tags is not None and nav_head > nav_tags:
        ok = False
        msgs.append("[REFS-AFTER-TAGS] 참고 자료가 해시태그보다 뒤에 있습니다. "
                    "해시태그 바로 앞으로 올리세요.")

    return ok, msgs


# ---------------------------------------------------------------- selftest

_ORIG = """## 참고 자료

- 수의사법 시행규칙 제18조의3 진료비용의 게시 대상 및 방법 — https://www.law.go.kr/
- 농림축산식품부, 전국 동물병원 진료비 현황조사 결과 — https://www.mafra.go.kr/
- 댕묘 [강아지 목욕 주기와 모질별 기준](https://dangmyo.com/blog/7-dog-bath) — 관리 주기
"""

_GOOD = """### 참고 자료
- 수의사법 제20조(진찰 등의 진료비용 게시)와 같은 법 시행규칙 제18조의3 — 국가법령정보센터에서 조회
- 전국 동물병원 진료비 현황조사 결과 — 농림축산식품부 자료실

**해시태그 10개**
#강아지스케일링비용 #강아지스케일링 #댕묘
"""

CASES = [
    # (이름, 원문, 네이버원고, 기대)
    ("정상 — 외부 2건 이식, 내부 글은 합침", _ORIG, _GOOD, True),
    ("섹션 통째 누락", _ORIG, "## 본문\n내용\n\n#강아지 #댕묘\n", False),
    ("외부 출처가 모자람", _ORIG,
     "### 참고 자료\n- 수의사법 제20조와 시행규칙 제18조의3 — 국가법령정보센터\n\n#가 #나\n", False),
    ("주소가 들어감", _ORIG,
     "### 참고 자료\n- 수의사법 시행규칙 제18조의3 — law.go.kr 에서 조회\n"
     "- 전국 동물병원 진료비 현황조사 결과 — 농림축산식품부\n\n#가 #나\n", False),
    ("원문 줄을 그대로 복사", _ORIG,
     "### 참고 자료\n- 수의사법 시행규칙 제18조의3 진료비용의 게시 대상 및 방법\n"
     "- 전국 동물병원 진료비 현황조사 결과 — 농림축산식품부 자료실\n\n#가 #나\n", False),
    ("해시태그보다 뒤에 있음", _ORIG,
     "## 본문\n내용\n\n#가 #나\n\n### 참고 자료\n"
     "- 수의사법 제20조와 시행규칙 제18조의3 — 국가법령정보센터에서 조회\n"
     "- 전국 동물병원 진료비 현황조사 결과 — 농림축산식품부 자료실\n", False),
    ("「참고한 자료」 굵게 표기도 인식", _ORIG,
     "**참고한 자료**\n- 수의사법 제20조와 시행규칙 제18조의3 — 국가법령정보센터에서 조회\n"
     "- 전국 동물병원 진료비 현황조사 결과 — 농림축산식품부 자료실\n\n#가 #나\n", True),
    ("원문에 참고 자료가 없으면 면제", "## 본문\n내용만 있음\n", "## 본문\n내용\n\n#가 #나\n", True),
]


def selftest():
    bad = 0
    for i, (name, orig, nav, want) in enumerate(CASES, 1):
        ok, msgs = check(orig, nav)
        if ok != want:
            bad += 1
        print("  %s #%-2d expected=%-5s got=%-5s | %s | %s"
              % ("ok " if ok == want else "BAD", i, want, ok, name, msgs[0]))
    print("selftest: %d/%d" % (len(CASES) - bad, len(CASES)))
    return 0 if bad == 0 else 1


def main():
    ap = argparse.ArgumentParser(
        description="네이버 원고에 홈페이지 원문의 참고 자료가 옮겨졌는지 판정한다.")
    ap.add_argument("orig", nargs="?", help="홈페이지 원문 .md")
    ap.add_argument("nav", nargs="?", help="네이버 원고 .md")
    ap.add_argument("--selftest", action="store_true")
    a = ap.parse_args()

    if a.selftest:
        return selftest()
    if not a.orig or not a.nav:
        ap.error("홈페이지 원문과 네이버 원고 두 파일이 필요합니다 (또는 --selftest)")

    with open(a.orig, encoding="utf-8") as f:
        orig = f.read()
    with open(a.nav, encoding="utf-8") as f:
        nav = f.read()

    ok, msgs = check(orig, nav)
    for m in msgs:
        print(m)
    if not ok:
        print("\n참고 자료를 고치기 전에는 카드를 만들지 마세요.")
    return 0 if ok else 2


if __name__ == "__main__":
    sys.exit(main())
