// ensure-tools.mjs — 노블냥 스킬 첫 실행 준비: ffmpeg-static 설치 확인 + 한글 폰트 확인
// 실행: node <스킬>/scripts/ensure-tools.mjs   → RESULT_JSON={ ffmpeg, font, installed }
import { createRequire } from 'module';
import { execSync } from 'child_process';
import { existsSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const skillDir = path.resolve(__dirname, '..');   // skills/노블냥
const require = createRequire(import.meta.url);

let ffmpeg = null, installed = false;
try {
  ffmpeg = require('ffmpeg-static');
} catch {
  // 스킬 폴더에 ffmpeg-static 설치 (1회, 세션 넘어 영속)
  try {
    execSync('npm install ffmpeg-static', { cwd: skillDir, stdio: 'ignore' });
    ffmpeg = require(path.join(skillDir, 'node_modules', 'ffmpeg-static'));
    installed = true;
  } catch (e) {
    console.log('RESULT_JSON=' + JSON.stringify({ error: 'ffmpeg-static 설치 실패: ' + e.message + ' (npm/네트워크 확인)' }));
    process.exit(1);
  }
}

// 한글 폰트 (Windows 맑은 고딕 볼드)
const FONT = 'C:/Windows/Fonts/malgunbd.ttf';
const fontOk = existsSync(FONT);

console.log('RESULT_JSON=' + JSON.stringify({
  ffmpeg, ffmpeg_exists: ffmpeg ? existsSync(ffmpeg) : false,
  font: FONT, font_exists: fontOk, installed,
  ...(fontOk ? {} : { font_warning: '맑은 고딕(malgunbd.ttf)이 없습니다. Windows가 아니거나 폰트 미설치 — 자막이 깨질 수 있습니다.' }),
}));
