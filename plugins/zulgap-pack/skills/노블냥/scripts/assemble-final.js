// assemble-final.js — 본편 배속(1.2) + 인트로 이어붙이기 (로컬 ffmpeg, railway 불필요)
// 실행: node <이 파일> <params.json>
// params: { intro: 인트로 경로, content: 자막본(본편) 경로, out: 출력 경로(절대), speed?(기본 1.2) }
//   → RESULT_JSON={ success, out }
// @AI:INTENT 자막이 이미 구워진 본편을 배속하면 영상·음성·자막 함께 빨라져 싱크 유지
const fs = require('fs'), path = require('path');
const { execFileSync } = require('child_process');
const FFMPEG = require('ffmpeg-static');

const p = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
const outAbs = path.resolve(p.out);
const outDir = path.dirname(outAbs);
fs.mkdirSync(outDir, { recursive: true });
const speed = p.speed || 1.2;
const contentFast = path.join(outDir, '_content_fast.mp4');

try {
  // 1) 본편 배속 (setpts=영상 / atempo=음성, 둘 다 1/speed·speed)
  execFileSync(FFMPEG, [
    '-i', path.resolve(p.content),
    '-filter_complex', `[0:v]setpts=PTS/${speed}[v];[0:a]atempo=${speed}[a]`,
    '-map', '[v]', '-map', '[a]',
    '-c:v', 'libx264', '-preset', 'medium', '-crf', '20', '-c:a', 'aac', '-r', '24',
    '-movflags', '+faststart', '-y', contentFast,
  ], { stdio: ['ignore', 'ignore', 'pipe'], maxBuffer: 1024 * 1024 * 20 });

  // 2) 인트로 + 배속본편 concat (양쪽 오디오 존재해야 함 — 인트로는 build-hook에서 무음 트랙 부여됨)
  execFileSync(FFMPEG, [
    '-i', path.resolve(p.intro), '-i', contentFast,
    '-filter_complex', '[0:v][0:a][1:v][1:a]concat=n=2:v=1:a=1[v][a]',
    '-map', '[v]', '-map', '[a]',
    '-c:v', 'libx264', '-preset', 'medium', '-crf', '20', '-c:a', 'aac', '-r', '24',
    '-movflags', '+faststart', '-y', outAbs,
  ], { stdio: ['ignore', 'ignore', 'pipe'], maxBuffer: 1024 * 1024 * 20 });

  console.log('RESULT_JSON=' + JSON.stringify({ success: true, out: outAbs }));
} catch (e) {
  console.error('ERR ' + (e.stderr ? e.stderr.toString().slice(-700) : e.message));
  process.exit(1);
}
