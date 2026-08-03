# -*- coding: utf-8 -*-
"""
cardnews 영상화 2/2 — 4:5 · 장면당 6초 · 무음 영상 합성 (합본 + 개별)

make_overlays.py 로 만든 ov_1..6.png 를 장면 영상 위에 얹는다.

사용법:
    python build_video.py <slides.json> <out_dir> [overlays_dir]

    slides.json 의 각 슬라이드에 video_url (로컬 경로 또는 URL) 이 있어야 한다.
    형식은 slides.example.json 참고.

함정 (반드시 유지):
    - ffmpeg 다수 인코딩은 -preset veryfast + 단계 분할 (medium 일괄은 타임아웃).
    - PowerShell 로 ffmpeg 인자를 넘기지 말 것 (필터 문자열 이스케이프가 깨짐).
      subprocess 리스트 인자로 직접 호출한다.
"""
import json, subprocess, sys, urllib.request
from pathlib import Path
import imageio_ffmpeg

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")

FF = imageio_ffmpeg.get_ffmpeg_exe()
W, H, FPS = 1080, 1350, 30


def run(args, what):
    r = subprocess.run([FF, "-hide_banner", "-loglevel", "error", "-y"] + args,
                       capture_output=True, encoding="utf-8", errors="replace")
    if r.returncode != 0:
        raise SystemExit(f"[ffmpeg 실패] {what}\n{(r.stderr or '')[:900]}")


def fetch(src, dst):
    if str(src).startswith("http"):
        urllib.request.urlretrieve(src, dst)
        return dst
    return Path(src)


def main():
    if len(sys.argv) < 3:
        raise SystemExit("사용법: python build_video.py <slides.json> <out_dir> [overlays_dir]")
    cfg_path = Path(sys.argv[1])
    cfg = json.loads(cfg_path.read_text(encoding="utf-8"))
    slides = cfg["slides"]
    out_dir = Path(sys.argv[2])
    ov_dir = Path(sys.argv[3]) if len(sys.argv) > 3 else cfg_path.parent / "overlays"
    dur = float(cfg.get("duration", 6.0))
    tmp = out_dir / "_tmp"

    missing = [s["n"] for s in slides if not s.get("video_url")]
    if missing:
        raise SystemExit(f"[영상 없음] 슬라이드 {missing} 에 video_url 이 비어 있음.\n"
                         f" → Seedance 로 생성한 뒤 slides.json 에 채울 것.")

    for d in (out_dir, tmp):
        d.mkdir(parents=True, exist_ok=True)
    n_total = len(slides)

    # 1단계: 장면별 clean 세그먼트 (스케일 → 크롭 → 오버레이 → 컷 → 무음)
    segs = []
    for i, s in enumerate(slides, start=1):
        ov = ov_dir / f"ov_{s['n']}.png"
        if not ov.exists():
            raise SystemExit(f"[오버레이 없음] {ov} — make_overlays.py 먼저 실행")
        print(f"[{i}/{n_total}] {s['name']}  내려받는 중...", end=" ", flush=True)
        raw = fetch(s["video_url"], tmp / f"raw_{s['n']}.mp4")
        print("합성 중...", end=" ", flush=True)
        seg = tmp / f"seg_{s['n']}.mp4"
        vf = (f"scale={W}:-2,crop={W}:{H},fps={FPS},"
              f"format=rgba[bg];[1:v]format=rgba[ov];[bg][ov]overlay=0:0,format=yuv420p")
        run(["-i", str(raw), "-i", str(ov),
             "-filter_complex", f"[0:v]{vf}",
             "-t", str(dur), "-an", "-c:v", "libx264", "-preset", "veryfast",
             "-crf", "20", "-pix_fmt", "yuv420p", str(seg)], f"세그먼트 {s['n']}")
        segs.append(seg)
        print("완료")

    # 2단계: 개별 파일 (각 페이드 인/아웃)
    print("\n개별 파일 내보내는 중...")
    for s, seg in zip(slides, segs):
        out = out_dir / f"{s['name']}.mp4"
        run(["-i", str(seg), "-vf",
             f"fade=t=in:st=0:d=0.4,fade=t=out:st={dur-0.4}:d=0.4",
             "-an", "-c:v", "libx264", "-preset", "veryfast", "-crf", "20",
             "-pix_fmt", "yuv420p", str(out)], f"개별 {s['n']}")
        print(f"  {out.name}")

    # 3단계: 합본 (전체 페이드)
    print("\n합본 만드는 중...")
    lst = tmp / "concat.txt"
    lst.write_text("".join(f"file '{s.as_posix()}'\n" for s in segs), encoding="utf-8")
    joined = tmp / "joined.mp4"
    run(["-f", "concat", "-safe", "0", "-i", str(lst), "-c", "copy", str(joined)], "concat")
    total = dur * len(segs)
    final = out_dir / cfg.get("master_name", "카드뉴스_합본.mp4")
    run(["-i", str(joined), "-vf",
         f"fade=t=in:st=0:d=0.6,fade=t=out:st={total-0.6}:d=0.6",
         "-an", "-c:v", "libx264", "-preset", "veryfast", "-crf", "20",
         "-pix_fmt", "yuv420p", str(final)], "합본")
    print(f"  {final.name}  ({total:.0f}초)")

    import shutil
    shutil.rmtree(tmp, ignore_errors=True)
    print(f"\n완료 → {out_dir}")


if __name__ == "__main__":
    main()
