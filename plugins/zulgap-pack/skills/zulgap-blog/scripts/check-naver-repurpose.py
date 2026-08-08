# -*- coding: utf-8 -*-
"""
STEP 8 네이버 재가공 셀프체크 (결정론)

usage: python check-naver-repurpose.py <홈페이지원문.md> <네이버원고.md>
exit  : 0 = FAIL 없음 / 1 = 위반 있음

@AI:INTENT 이 검사를 사람이나 즉석 bash로 대신하지 말 것.
실측(2026-08-09) 손으로 짠 bash 검사의 결함 3종:
  ① 같은 파일에서 위반을 8건 → 5건으로 다르게 셌다 (awk 문자수 임계가 흔들림)
  ② 해시태그 10개를 17개로 봤다 (`##` 헤딩을 태그로 오인)
  ③ 원문 재사용 1건을 놓쳤다 — 위반인데 PASS가 나오는 방향이라 제일 위험
"""
import re, sys, unicodedata

MIN_LEN = 12          # 이보다 짧은 조각은 상투구라 비교 제외
NEAR_RATIO = 0.90     # 부분일치 판정 (짧은 쪽 / 긴 쪽)

def strip_md(t):
    t = re.sub(r'!\[[^\]]*\]\([^)]*\)', '', t)      # 이미지
    t = re.sub(r'\[이미지[^\]]*\]', '', t)            # 마커형 이미지
    t = re.sub(r'\[([^\]]*)\]\([^)]*\)', r'\1', t)  # 링크 → 텍스트만
    t = re.sub(r'<[^>]+>', '', t)                    # HTML 태그
    # @AI:FRAGILE 강조 기호 제거는 반드시 문장 분리 '앞'에서 — `보세요.**` 처럼
    # 마침표 뒤에 붙으면 문장 경계 정규식이 안 걸려 두 문장이 한 덩어리가 되고,
    # 그 덩어리는 원문과 완전일치하지 않아 재사용이 조용히 빠져나간다.
    t = re.sub(r'[*_~`]', '', t)
    return t

def sentences(path):
    raw = strip_md(open(path, encoding='utf-8').read())
    out = []
    for line in raw.split('\n'):
        line = line.strip()
        if not line or line.startswith('#') or line.startswith('|'):
            continue
        for s in re.split(r'(?<=[.!?])\s+', line):
            s = re.sub(r'[>\-]', '', s)
            s = unicodedata.normalize('NFC', s)
            s = re.sub(r'\s+', ' ', s).strip().rstrip('.')
            if len(s) >= MIN_LEN:
                out.append(s)
    return out

def main():
    if len(sys.argv) < 3:
        print('usage: python check-naver-repurpose.py <홈페이지원문.md> <네이버원고.md>')
        sys.exit(2)
    orig_p, nav_p = sys.argv[1], sys.argv[2]
    orig, nav = sentences(orig_p), sentences(nav_p)
    oset = set(orig)
    nav_raw = open(nav_p, encoding='utf-8').read()

    # ① 원문 문장 재사용 (완전일치 + 부분일치)
    dup = []
    for s in nav:
        if s in oset:
            dup.append(('완전일치', s))
            continue
        for o in orig:
            a, b = (s, o) if len(s) <= len(o) else (o, s)
            if a in b and len(a) / len(b) >= NEAR_RATIO:
                dup.append(('부분일치', s))
                break

    # ② 표 최대 열 수 — 네이버 모바일은 4열 이상 잘린다
    cols = [ln.count('|') - 1 for ln in nav_raw.split('\n')
            if ln.strip().startswith('|') and not re.match(r'^\|[\s:|-]+\|$', ln.strip())]
    max_col = max(cols) if cols else 0

    # ③ 마크다운 링크 (이미지 제외) — 네이버 붙여넣기에서 깨진다
    links = re.findall(r'(?<!!)\[[^\]]+\]\([^)]+\)', nav_raw)

    # ④ 이미지 수
    n_img = len(re.findall(r'!\[[^\]]*\]\([^)]*\)', nav_raw))
    o_img = len(re.findall(r'!\[[^\]]*\]\([^)]*\)|\[이미지\s*\d+',
                           open(orig_p, encoding='utf-8').read()))

    # ⑤ 해시태그 — 헤딩(`## `)과 구분: 한 줄에 ` #` 가 함께 있는 줄만 태그 줄
    tags = re.findall(r'#[^\s#]+', '\n'.join(
        ln for ln in nav_raw.split('\n') if ln.strip().startswith('#') and ' #' in ln))

    # ⑥ 본문 글자수 (공백·이미지 제외)
    n_char = len(re.sub(r'\s', '', re.sub(r'!\[[^\]]*\]\([^)]*\)', '', nav_raw)))

    rows = [
        ('① 원문 문장 재사용', f'{len(dup)}건', len(dup) == 0, '0건'),
        ('② 표 최대 열 수',    f'{max_col}열',  max_col <= 3,  '3열 이하'),
        ('③ 마크다운 링크',    f'{len(links)}개', len(links) == 0, '0개'),
        ('④ 이미지 수',        f'원문 {o_img} / 네이버 {n_img}', n_img > 0, '1장 이상'),
        ('⑤ 해시태그',         f'{len(tags)}개', len(tags) == 10, '정확히 10개'),
        ('⑥ 본문 글자수',      f'{n_char}자',   1500 <= n_char <= 8000, '1500~8000자'),
    ]
    fails = 0
    print('=' * 58)
    for name, got, ok, want in rows:
        if not ok:
            fails += 1
        print(f'  [{"PASS" if ok else "FAIL"}] {name:<18} {got:<22} (기준 {want})')
    print('=' * 58)
    if dup:
        print(f'\n[!] ① 위반 문장 전체 ({len(dup)}건) — 재작성 대상\n')
        for i, (kind, s) in enumerate(dup, 1):
            print(f'  {i}. [{kind}] {s}')
    print(f'\n총 FAIL {fails}건')
    sys.exit(1 if fails else 0)

main()
