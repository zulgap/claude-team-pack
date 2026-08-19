#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""원고(.md) ↔ 노션 카드 본문 대조 — 「만든 것」과 「실제로 올라간 것」이 같은지 코드가 센다.

왜: 2026-08-09 RPG 네이버 재가공에서 노션 카드 본문에 한글 오타가 11개 생겼다
    (12편 단독 0개 / 13편 8개 / 14편 3개). 로컬 원고에는 오타가 없었다 —
    「원고 → 노션」 구간에서 생겼는데 그 구간을 보는 검사가 없었다.
    사람 눈으로는 이미 실패했다(12편을 훑고 "정상"이라 판단한 뒤 13편에서야 발견).

사용:
    python check-notion-card.py <원고.md> <카드본문.txt>
    python check-notion-card.py --selftest

카드 본문은 AI가 notion-fetch 결과의 <content> 부분을 그대로 파일로 저장한 것.
"""
import sys, re, difflib

# 윈도우 콘솔(cp949)에서 이 파일의 이모지를 못 찍어 **첫 출력에서 죽는다** — PASS든 FAIL이든 같다.
# 팀원 PC가 전부 윈도우라 이걸 안 걸면 스크립트가 원리적으로 못 돈다(실측 2026-08-14).
if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8', errors='replace')

# 오타 의심 하한 — 이보다 비슷하면 「같은 문장인데 글자가 틀어졌다」로 본다.
# 0.80 미만은 다른 문장(정상적 추가/삭제)일 가능성이 커서 별도 항목으로 뺀다.
NL = '\n'   # 셀프테스트에서 줄바꿈을 리터럴로 조립할 때 쓴다
TYPO_MIN = 0.80
TYPO_MAX = 0.999


def normalize(text: str) -> str:
    """대조에 방해되는 것만 걷어낸다 — 글자 자체는 절대 건드리지 않는다."""
    t = text
    # 🔴 이미지는 URL만 버리고 **캡션(alt)은 남긴다** — 실사고의 오타 `나뉜니다`가 바로 캡션에 있었다.
    #    캡션을 지우면 그 오타를 원리적으로 못 잡는다(2026-08-09 실전 검증에서 7곳 중 2곳을 놓쳤다).
    t = re.sub(r'!\[([^\]]*)\]\([^)]*\)', r' \1 ', t)
    t = re.sub(r'\[([^\]]*)\]\([^)]*\)', r'\1', t)   # 링크 → 표시 텍스트만
    t = re.sub(r'<[^>]+>', ' ', t)                   # HTML/노션 표 태그
    # 🔴 이스케이프 해제는 «기호를 지우기 전»에 해야 한다 — 순서가 곧 버그였다.
    #    notion-fetch 는 본문을 마크다운으로 직렬화하면서 `|` `~` 같은 글자 앞에 `\` 를 붙인다.
    #    (저장된 내용에는 `\` 가 없다. 라이브 발행물에도 없다 — 2026-08-19 실측: 8/11 발행분 역슬래시 0개)
    #    그런데 해제가 «아래쪽»에 있어서 `\~` 는 위 기호 제거가 `~` 만 지우고 `\` 를 남겼고,
    #    `|` 는 애초에 해제 대상에 없어 `\` 가 통째로 남았다.
    #    결과: **본문에 `|` 나 `~` 가 있으면 그 문장이 항상 「글자가 틀어졌다」로 잡혔다.**
    #    실측 2026-08-19 — 검단가온 홈페이지 글에서 FAIL 3건이 전부 이것(`∅ → \`)이었다.
    #    ⚠️ 오탐은 「불편」이 아니라 **검사 자체를 무력화한다** — 이 검사가 막으려던 것이
    #    「카드 본문 오타 11건」인데, 매번 FAIL 이 뜨면 사람이 결과를 안 보게 된다.
    #    범위는 마크다운 이스케이프 전체(`\` + 비영숫자)로 잡는다. 노션이 무엇을 이스케이프할지
    #    목록으로 좇으면 하나 빠질 때마다 같은 오탐이 되살아난다.
    t = re.sub(r'\\([^\w\s])', r'\1', t)
    # 🔴 표 셀 경계(`|`)는 «줄바꿈»으로 바꾼다 — 공백으로 뭉개면 원고의 표 «한 행»이
    #    한 덩어리가 되는데, 노션 <table>은 셀마다 줄이라 «셀» 단위로 잘린다.
    #    같은 표인데 자르는 축이 달라 **표가 든 글은 항상 FAIL** 이었다(2026-08-19 재현).
    #    짧은 셀은 아래 sentences()의 8자 필터가 양쪽에서 똑같이 걸러 대칭이 유지된다.
    t = t.replace('|', '\n')
    t = re.sub(r'[#>*`~\-—–]+', ' ', t)             # 마크다운 기호
    # 🔴 줄바꿈을 살려 둔다. 여기서 `\s+`로 뭉개면 아래 sentences()의 `\n+` 경계가 죽어
    #    마침표로 안 끝나는 줄(제목·이미지 자리·목록)이 **다음 문장에 들러붙는다.**
    #    그러면 이미지 자리의 차이(원고=마커 `img 1` / 카드=캡션)가 옆 문장을 오염시켜
    #    멀쩡한 문장이 「글자가 틀어졌다」로 잡힌다 — 실측 2026-08-14, 오탐 7건.
    t = re.sub(r'[^\S\n]+', ' ', t)
    t = re.sub(r'\n[ \n]*', '\n', t)
    return t.strip()


def sentences(text: str):
    """문장 단위로 자른다. 한국어 종결(다./요.)과 줄바꿈을 경계로 쓴다."""
    out = []
    for chunk in re.split(r'(?<=[.!?])\s+|\n+', normalize(text)):
        s = chunk.strip()
        if len(s) >= 8:   # 표 셀·짧은 라벨은 대조 대상에서 뺀다(오탐 원인)
            out.append(s)
    return out


def count_images(text: str) -> int:
    return len(re.findall(r'!\[[^\]]*\]\([^)]*\)', text))


def count_hashtags(text: str) -> int:
    return len(re.findall(r'(?:^|\s)#[^\s#]+', text))


def compare(draft: str, card: str):
    d_sents = sentences(draft)
    c_sents = sentences(card)
    d_set = set(d_sents)

    typos, extras = [], []
    for cs in c_sents:
        if cs in d_set:
            continue
        best, score = None, 0.0
        for ds in d_sents:
            r = difflib.SequenceMatcher(None, cs, ds).ratio()
            if r > score:
                best, score = ds, r
        if TYPO_MIN <= score <= TYPO_MAX:
            typos.append((cs, best, score))
        elif score < TYPO_MIN:
            extras.append(cs)

    return {
        'typos': typos,
        'extras': extras,
        'draft_images': count_images(draft), 'card_images': count_images(card),
        'draft_tags': count_hashtags(draft), 'card_tags': count_hashtags(card),
    }


def char_diff(a: str, b: str) -> str:
    """틀어진 글자만 뽑아 보여준다 — 어디를 고칠지 바로 보이게."""
    marks = []
    for op, i1, i2, j1, j2 in difflib.SequenceMatcher(None, b, a).get_opcodes():
        if op != 'equal':
            marks.append(f"「{b[i1:i2] or '∅'}」→「{a[j1:j2] or '∅'}」")
    return ' '.join(marks[:6])


def report(res) -> int:
    fails = 0
    print('=== 카드 대조 (원고 ↔ 실제 올라간 것) ===')

    if res['typos']:
        fails += len(res['typos'])
        print(f"\n🔴 FAIL 글자가 틀어진 문장 {len(res['typos'])}건")
        for card_s, draft_s, score in res['typos']:
            print(f"  · 유사도 {score:.3f}  {char_diff(card_s, draft_s)}")
            print(f"    원고: {draft_s}")
            print(f"    카드: {card_s}")
    else:
        print('\n✅ 글자 틀어짐 0건')

    if res['extras']:
        print(f"\n⚠️  카드에만 있는 문장 {len(res['extras'])}건 (재가공 내역·검수 결과 등은 정상)")
        for s in res['extras'][:5]:
            print(f"  · {s[:70]}")

    for label, d, c in (('이미지', res['draft_images'], res['card_images']),
                        ('해시태그', res['draft_tags'], res['card_tags'])):
        if d != c:
            fails += 1
            print(f"\n🔴 FAIL {label} 수 불일치 — 원고 {d} / 카드 {c}")
        else:
            print(f"✅ {label} {d}개 일치")

    print(f"\n결과: {'FAIL ' + str(fails) + '건' if fails else 'PASS'}")
    if fails:
        print('🔴 고칠 때는 update_content 부분 교체만 쓴다 — replace_content로 통째로 갈면 이미지·표 블록이 재생성되며 다른 사고가 난다.')
    return 1 if fails else 0


def selftest() -> int:
    """양방향 검증 — 정상은 PASS, 글자를 틀면 그 문장을 인용하며 FAIL."""
    base = ('# 제목\n컨테이너는 우리 물건이 아닙니다. 선사 자산을 빌려 쓰는 것이라 기간 안에 반납해야 합니다.\n'
            '항구를 경계로 해상 구간과 내륙 구간이 나뉩니다.\n'
            '화주별로 갈라낸 뒤 옮겨 싣습니다.\n#태그하나 #태그둘\n')
    ok = compare(base, base)
    a = len(ok['typos']) == 0
    print(('✅' if a else '❌') + ' T1 같은 글은 PASS (오탐 0)')

    broken = base.replace('나뉩니다', '나뉜니다').replace('옮겨 싣습니다', '옮겨 십니다')
    bad = compare(base, broken)
    b = len(bad['typos']) == 2
    print(('✅' if b else '❌') + f" T2 오타 2개를 2건으로 잡는다 (실제 {len(bad['typos'])}건)")

    c = all(any(x in char_diff(cs, ds) for x in ('뉜', '십')) for cs, ds, _ in bad['typos'])
    print(('✅' if c else '❌') + ' T3 틀어진 글자를 짚어 준다')

    missing_img = compare(base + '![그림](http://x/y.png)\n', base)
    d = missing_img['draft_images'] == 1 and missing_img['card_images'] == 0
    print(('✅' if d else '❌') + ' T4 이미지 누락을 센다')

    # T5 회귀 — 원고의 이미지 마커가 카드에서 캡션으로 바뀌는 것은 **정상 흐름**이다.
    #    줄바꿈을 뭉개던 시절엔 이 차이가 옆 문장에 들러붙어 오탐을 냈다(실측 7건).
    m_draft = '## 제목\n![img 1](img-1)\n' + base
    m_card = '## 제목\n![두 나라의 계산서. 도식: 줄갭](http://x/y.png)\n' + base
    marker = compare(m_draft, m_card)
    e = len(marker['typos']) == 0
    print(('✅' if e else '❌') + f" T5 마커→캡션 교체를 오타로 세지 않는다 (실제 {len(marker['typos'])}건)")


    # T6 회귀 — 원고의 마크다운 표(한 행 = 한 줄)와 카드의 노션 <table>(셀마다 줄)은
    #    «같은 표»인데 자르는 축이 다르다. `|` 를 공백으로 뭉개던 시절엔 이 차이만으로
    #    **표가 든 글이 항상 FAIL** 이었다(2026-08-19 재현). 셀 경계를 줄바꿈으로 맞춰 해소.
    t_draft = '| 구분 | 내용 |' + NL + '|---|---|' + NL + '| 해상운송 | 부산에서 상해까지 통상 사흘 걸립니다 |'
    t_card = ('<table>' + NL + '<tr>' + NL + '<td>구분</td>' + NL + '<td>내용</td>' + NL + '</tr>' + NL +
              '<tr>' + NL + '<td>해상운송</td>' + NL + '<td>부산에서 상해까지 통상 사흘 걸립니다</td>' + NL +
              '</tr>' + NL + '</table>')
    tbl = compare(t_draft, t_card)
    f = len(tbl['typos']) == 0
    print(('✅' if f else '❌') + f" T6 같은 표를 오타로 세지 않는다 (실제 {len(tbl['typos'])}건)")

    # T7 — 오탐을 없애면서 «검출력»까지 죽이면 더 나쁘다. 표 «안»의 오타는 여전히 잡혀야 한다.
    tbl_bad = compare(t_draft, t_card.replace('사흘 걸립니다', '사흘 걸림니다'))
    g = len(tbl_bad['typos']) == 1
    print(('✅' if g else '❌') + f" T7 표 «안»의 오타는 그대로 잡는다 (실제 {len(tbl_bad['typos'])}건)")

    # T8 회귀 — notion-fetch 가 붙이는 마크다운 이스케이프(`\|` `\~`)를 오타로 세면 안 된다.
    #    저장된 내용에도 라이브 발행물에도 `\` 는 없다(2026-08-19 실측: 8/11 발행분 역슬래시 0개).
    #    이걸 안 풀면 제목에 `|` 를 쓰는 글·물결표 기간 표기가 든 글이 **전부** FAIL 이었다.
    e_draft = ('# 반대교합에서 실제로 바뀌는 것 | 검단가온치과' + NL +
               '치열 교정만 하는 경우는 보통 18~30개월 걸린다고 설명합니다.' + NL +
               '4시간 무료주차 | 일요일·공휴일 진료 가능')
    e_card = ('# 반대교합에서 실제로 바뀌는 것 \\| 검단가온치과' + NL +
              '치열 교정만 하는 경우는 보통 18\\~30개월 걸린다고 설명합니다.' + NL +
              '4시간 무료주차 \\| 일요일·공휴일 진료 가능')
    esc = compare(e_draft, e_card)
    h = len(esc['typos']) == 0
    print(('✅' if h else '❌') + f" T8 노션 이스케이프(\\| \\~)를 오타로 세지 않는다 (실제 {len(esc['typos'])}건)")

    # T9 — T8 로 검출력이 죽지 않았나. 이스케이프가 든 «같은 줄»의 진짜 오타는 여전히 잡혀야 한다.
    esc_bad = compare(e_draft, e_card.replace('걸린다고', '걸린타고'))
    i = len(esc_bad['typos']) == 1
    print(('✅' if i else '❌') + f" T9 이스케이프가 있어도 «진짜» 오타는 잡는다 (실제 {len(esc_bad['typos'])}건)")

    passed = all([a, b, c, d, e, f, g, h, i])
    print('\n셀프테스트: ' + ('PASS' if passed else 'FAIL'))
    return 0 if passed else 1


if __name__ == '__main__':
    if '--selftest' in sys.argv:
        sys.exit(selftest())
    if len(sys.argv) < 3:
        print(__doc__)
        sys.exit(2)
    with open(sys.argv[1], encoding='utf-8') as f:
        draft = f.read()
    with open(sys.argv[2], encoding='utf-8') as f:
        card = f.read()
    sys.exit(report(compare(draft, card)))
