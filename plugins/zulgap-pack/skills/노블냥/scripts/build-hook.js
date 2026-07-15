// build-hook.js — 럭셔리/후킹 클립을 앞 N초 트림 + 큰 볼드 카피(흰글씨+검정테두리) + 무음 오디오 → 인트로
// 실행: node <이 파일> <params.json>
// params: {
//   clip: 후킹 i2v 클립 URL 또는 경로,
//   copy_text: 후킹 카피(2줄이면 \n 포함),
//   out: 출력 경로(절대),
//   trim_sec?(기본 2), font_size?(기본 82), y?(기본 200), borderw?(기본 9)
// } → RESULT_JSON={ success, out }
// @AI:CONSTRAINT expansion=none + 상대경로 fontfile (overlay-subtitles와 동일 트랩)
const fs = require('fs'), path = require('path'), https = require('https');
const { execFileSync } = require('child_process');
const FFMPEG = require('ffmpeg-static');

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
  const isUrl = /^https?:/i.test(p.clip);
  const localClipAbs = isUrl ? null : path.resolve(p.clip); // @AI:FRAGILE chdir 전에 절대경로 고정
  fs.mkdirSync(outDir, { recursive: true });
  process.chdir(outDir);
  if (!fs.existsSync('malgunbd.ttf')) fs.copyFileSync('C:/Windows/Fonts/malgunbd.ttf', 'malgunbd.ttf');

  let clip;
  if (isUrl) { clip = path.join(outDir, '_hook_in.mp4'); await dl(p.clip, clip); }
  else clip = localClipAbs;

  fs.writeFileSync('_hookcopy.txt', String(p.copy_text), 'utf8');
  const trim = p.trim_sec || 2, fontSize = p.font_size || 82, y = p.y || 200, bw = p.borderw || 9;
  const vf = `drawtext=fontfile=malgunbd.ttf:textfile=_hookcopy.txt:expansion=none:text_align=C:` +
    `fontcolor=white:fontsize=${fontSize}:borderw=${bw}:bordercolor=black:line_spacing=16:` +
    `x=(w-text_w)/2:y=${y}`;

  execFileSync(FFMPEG, [
    '-t', String(trim), '-i', clip,
    '-f', 'lavfi', '-t', String(trim), '-i', 'anullsrc=r=44100:cl=stereo',
    '-vf', vf, '-map', '0:v', '-map', '1:a',
    '-c:v', 'libx264', '-preset', 'medium', '-crf', '20', '-c:a', 'aac', '-r', '24',
    '-shortest', '-movflags', '+faststart', '-y', outAbs,
  ], { stdio: ['ignore', 'ignore', 'pipe'], maxBuffer: 1024 * 1024 * 20 });

  console.log('RESULT_JSON=' + JSON.stringify({ success: true, out: outAbs }));
})().catch(e => { console.error('ERR ' + (e.stderr ? e.stderr.toString().slice(-700) : e.message)); process.exit(1); });
