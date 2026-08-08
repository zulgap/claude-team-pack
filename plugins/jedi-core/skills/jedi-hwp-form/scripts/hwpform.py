# -*- coding: utf-8 -*-
"""한글 양식 작업 CLI — 조사 · 변환 · 검수.

  python hwpform.py inspect  <파일.hwpx>            양식 구조를 본다 (칸 주소·글자·빈칸)
  python hwpform.py to-hwpx  <입력.hwp>  <출력.hwpx>   한컴 필요
  python hwpform.py to-hwp   <입력.hwpx> <출력.hwp> [출력.pdf]   한컴 필요
  python hwpform.py verify   <결과.pdf> [--expect-pages N] [--baseline 기존.pdf]

채우는 일 자체는 hwpx_lib 을 불러 쓰는 짧은 파이썬 스크립트로 한다
(칸마다 넣는 방식이 달라서 하나의 명령으로 묶이지 않는다).
"""
import os
import re
import sys
import subprocess
import time

sys.stdout.reconfigure(encoding='utf-8', line_buffering=True)
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import hwpx_lib as H


# ────────────────────────────────────────────────────────────
# 한컴 (변환에만 필요 — Windows + 한컴오피스)
# ────────────────────────────────────────────────────────────

def _hwp():
    if sys.platform != 'win32':
        sys.exit('이 명령은 한컴오피스가 깔린 Windows 에서만 됩니다.\n'
                 '  · 조사(inspect)와 검수(verify)는 어디서나 됩니다.\n'
                 '  · .hwpx 로 주고받으면 변환 자체가 필요 없습니다.')
    try:
        import win32com.client as w
    except ImportError:
        sys.exit('pywin32 가 필요합니다:  pip install pywin32')
    subprocess.run('taskkill /F /IM Hwp.exe /T', shell=True,
                   stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    time.sleep(1.2)
    try:
        h = w.Dispatch('HWPFrame.HwpObject')
    except Exception as e:
        sys.exit('한글을 띄우지 못했습니다. 한컴오피스가 설치돼 있는지 확인해주세요.\n  %s' % e)
    h.SetMessageBoxMode(0xFFFFFF)
    h.RegisterModule('FilePathCheckDLL', 'FilePathChecker')
    return h


def cmd_to_hwpx(src, dst):
    h = _hwp()
    h.Open(os.path.abspath(src), 'HWP', 'forceopen:true')
    print('원본 %d쪽' % h.PageCount)
    h.SaveAs(os.path.abspath(dst), 'HWPX', '')
    h.Quit()
    if not os.path.exists(dst):
        sys.exit('변환 실패 — 파일이 만들어지지 않았습니다')
    print('%s (%d KB)' % (dst, os.path.getsize(dst) // 1024))


def cmd_to_hwp(src, dst, pdf=None):
    h = _hwp()
    ok = h.Open(os.path.abspath(src), 'HWPX', 'forceopen:true')
    pages = h.PageCount
    print('열기 %s / %d쪽' % (ok, pages))
    # 🔴 반환값만 믿지 말 것 — 내용이 깨졌을 때 한글은 조용히 빈 문서를 연다
    if ok and pages >= 1:
        h.SaveAs(os.path.abspath(dst), 'HWP', '')
        if pdf:
            h.SaveAs(os.path.abspath(pdf), 'PDF', '')
    h.Quit()
    if not ok or pages < 1:
        sys.exit('한글이 이 파일을 제대로 열지 못했습니다.\n'
                 'XML 이 깨졌을 가능성이 큽니다 — 저장 전에 check_wellformed 를 부르세요.')
    print('%s%s' % (dst, (' + ' + pdf) if pdf else ''))


# ────────────────────────────────────────────────────────────
# 조사
# ────────────────────────────────────────────────────────────

def cmd_inspect(path):
    if not path.lower().endswith('.hwpx'):
        sys.exit('.hwpx 를 넣어주세요. .hwp 라면 먼저:  hwpform.py to-hwpx <입력> <출력>\n'
                 '(구조만 훑을 거라면 hwp-mcp 의 read_hwp / read_hwp_tables 가 더 빠릅니다)')
    secs = H.sections(path)
    print('구역 %d개: %s\n' % (len(secs), ', '.join(os.path.basename(s) for s in secs)))
    for sec in secs:
        xml = H.read(path, sec)
        cells = H.dump_cells(xml)
        empt = sum(1 for c in cells if c[4])
        print('=== %s — 칸 %d개 (빈칸 %d) ===' % (os.path.basename(sec), len(cells), empt))
        for idx, r, c, t, empty in cells:
            print('  #%3d (r%-2d,c%-2d) %s %r' % (idx, r, c, '[빈칸]' if empty else '      ', t[:52]))
        pics = len(re.findall(r'<hp:pic ', xml))
        paras = len(re.findall(r'<hp:p ', xml))
        print('  -- 문단 %d / 그림 %d\n' % (paras, pics))

    hdr = H.read(path, 'Contents/header.xml')
    props = H.char_props(hdr)
    body = {k: v for k, v in props.items() if v['color'] == '#000000'}
    print('=== 본문에 쓸 만한 글꼴 서식 (검정) ===')
    for cid, v in sorted(body.items(), key=lambda x: int(x[0]))[:14]:
        print('  charPr %-3s  %4.1fpt  자간 %s' % (cid, v['height'] / 100, v['spacing']))
    print('\n  🔴 서식 번호는 반드시 이 양식에서 고를 것 (다른 파일의 같은 번호는 다른 서식)')
    print('=== 여백 (mm) ===')
    print('  ' + '  '.join('%s=%.1f' % (k, v) for k, v in H.get_margins(
        H.read(path, H.SEC0)).items()))


# ────────────────────────────────────────────────────────────
# 검수
# ────────────────────────────────────────────────────────────

def cmd_verify(pdf, expect_pages=None, baseline=None):
    try:
        import fitz
    except ImportError:
        sys.exit('PyMuPDF 가 필요합니다:  pip install pymupdf')

    d = fitz.open(pdf)
    print('쪽수 %d%s' % (len(d), '' if expect_pages is None else
                       ('  (기대 %d — %s)' % (expect_pages,
                        'OK' if len(d) == expect_pages else '!! 불일치'))))

    imgs = []
    for i, p in enumerate(d):
        for x in p.get_images():
            for r in p.get_image_rects(x[0]):
                imgs.append((i + 1, r.width / 72 * 25.4, r.height / 72 * 25.4,
                             r.x0 / 72 * 25.4, r.y0 / 72 * 25.4))
    print('그림 %d개' % len(imgs))
    for pg, w, h, x, y in imgs:
        print('  p%d  %5.1f x %5.1f mm  @ (%5.1f, %5.1f) mm' % (pg, w, h, x, y))

    xs = [l['bbox'] for b in d[0].get_text('dict')['blocks'] for l in b.get('lines', [])]
    if xs:
        print('1쪽 본문 범위: 좌 %.1f  상 %.1f  우끝 %.1f  하 %.1f mm  (종이 %.0f x %.0f)'
              % (min(x[0] for x in xs) / 72 * 25.4, min(x[1] for x in xs) / 72 * 25.4,
                 max(x[2] for x in xs) / 72 * 25.4, max(x[3] for x in xs) / 72 * 25.4,
                 d[0].rect.width / 72 * 25.4, d[0].rect.height / 72 * 25.4))
        over = [x for x in xs if x[2] > d[0].rect.width - 5]
        print('종이 밖으로 넘친 줄: %d' % len(over) + ('  !! 확인 필요' if over else ''))

    txt = '\n'.join(p.get_text() for p in d)
    print('글자수 %d' % len(txt))

    leftover = re.findall(r'(20\d\s*년\s+월|\(\s*우편\s*:\s+\)|년\s+월\s+일)', txt)
    if leftover:
        print('!! 안 채운 자리로 보이는 곳 %d건: %r' % (len(leftover), leftover[:5]))
    else:
        print('안 채운 자리(연월일·우편번호 빈칸) 없음')

    if baseline and os.path.exists(baseline):
        import difflib
        b = fitz.open(baseline)
        bt = '\n'.join(p.get_text() for p in b)
        same = re.sub(r'\s+', '', bt) == re.sub(r'\s+', '', txt)
        print('\n기준 파일과 대조: 쪽수 %d -> %d / 글자 %d -> %d / 공백무시 일치 %s'
              % (len(b), len(d), len(bt), len(txt), same))
        if not same:
            diff = [l for l in difflib.unified_diff(
                bt.split('\n'), txt.split('\n'), lineterm='', n=0)
                if not l.startswith(('+++', '---', '@@'))]
            for l in diff[:20]:
                print('  ' + l)

    print('\n🔴 마지막 판정은 사람이 한다 — 한글로 열어 눈으로 볼 것.')


def main():
    if len(sys.argv) < 3:
        print(__doc__)
        sys.exit(1)
    cmd, args = sys.argv[1], sys.argv[2:]
    if cmd == 'inspect':
        cmd_inspect(args[0])
    elif cmd == 'to-hwpx':
        cmd_to_hwpx(args[0], args[1])
    elif cmd == 'to-hwp':
        cmd_to_hwp(args[0], args[1], args[2] if len(args) > 2 else None)
    elif cmd == 'verify':
        ep = None
        bl = None
        if '--expect-pages' in args:
            ep = int(args[args.index('--expect-pages') + 1])
        if '--baseline' in args:
            bl = args[args.index('--baseline') + 1]
        cmd_verify(args[0], ep, bl)
    else:
        print(__doc__)
        sys.exit(1)


if __name__ == '__main__':
    main()
