// overlay-subtitles.js — 본편 영상에 한글 자막 N구간 오버레이 (로컬 ffmpeg, railway 불필요)
// 실행: node <이 파일> <params.json>
// params: {
//   input: 영상 URL 또는 로컬 경로,
//   out: 출력 경로(절대),
//   segments: [{ text:"...", from:0, to:3 }, ...]  (text에 \n 있으면 2줄로 처리),
//   font_size?(기본 40), y_1line?(기본 'h-290'), y_2line?(기본 'h-345')
// }  → RESULT_JSON={ success, out }
// @AI:CONSTRAINT drawtext는 '%' 를 %{} 확장으로 해석 → expansion=none 필수 (20.2% 등 미렌더 방지)
// @AI:CONSTRAINT fontfile은 상대경로여야 함(Windows 드라이브 콜론 이스케이프 회피) → out 디렉토리로 chdir 후 malgunbd.ttf 복사
const fs = require('fs'), path = require('path'), https = require('https');
const { execFileSync } = require('child_process');
const FFMPEG = require('ffmpeg-static'); // 스킬 node_modules에서 해소 (scripts/ 상위 탐색)

function dl(url, dest) {
  return new Promise((res, rej) => {
    https.get(url, r => {
      if (r.statusCode >= 300 && r.statusCode < 400 && r.headers.location) {
        return dl(r.headers.location, dest).then(res).catch(rej);
      }
      const f = fs.createWriteStream(dest);
      r.pipe(f); f.on('finish', () => { f.close(); res(dest); }); f.on('error', rej);
    }).on('error', rej);
  });
}

(async () => {
  const p = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
  const outAbs = path.resolve(p.out);
  const outDir = path.dirname(outAbs);
  const isUrl = /^https?:/i.test(p.input);
  const localInputAbs = isUrl ? null : path.resolve(p.input); // @AI:FRAGILE chdir 전에 절대경로 고정
  fs.mkdirSync(outDir, { recursive: true });
  process.chdir(outDir);
  if (!fs.existsSync('malgunbd.ttf')) fs.copyFileSync('C:/Windows/Fonts/malgunbd.ttf', 'malgunbd.ttf');

  let input;
  if (isUrl) { input = path.join(outDir, '_sub_in.mp4'); await dl(p.input, input); }
  else input = localInputAbs;

  const fontSize = p.font_size || 40;
  const y1 = p.y_1line || 'h-290', y2 = p.y_2line || 'h-345';
  const drawParts = p.segments.map((s, i) => {
    const tf = `_seg${i}.txt`;
    fs.writeFileSync(tf, String(s.text), 'utf8'); // \n은 실제 개행 → 2줄
    const y = String(s.text).includes('\n') ? y2 : y1;
    return `drawtext=fontfile=malgunbd.ttf:textfile=${tf}:expansion=none:text_align=C:` +
      `fontcolor=white:fontsize=${fontSize}:line_spacing=10:box=1:boxcolor=black@0.62:boxborderw=20:` +
      `x=(w-text_w)/2:y=${y}:enable='between(t,${s.from},${s.to})'`;
  }).join(',');

  execFileSync(FFMPEG, [
    '-i', input, '-vf', drawParts,
    '-c:v', 'libx264', '-preset', 'medium', '-crf', '20', '-c:a', 'copy',
    '-movflags', '+faststart', '-y', outAbs,
  ], { stdio: ['ignore', 'ignore', 'pipe'], maxBuffer: 1024 * 1024 * 20 });

  console.log('RESULT_JSON=' + JSON.stringify({ success: true, out: outAbs }));
})().catch(e => { console.error('ERR ' + (e.stderr ? e.stderr.toString().slice(-700) : e.message)); process.exit(1); });
