// ensure-tools.mjs — 노블냥 스킬 첫 실행 준비: ffmpeg-static 설치 확인 + 한글 폰트 확인
// 실행: node <스킬>/scripts/ensure-tools.mjs   → RESULT_JSON={ ffmpeg, font, installed }
import { createRequire } from 'module';
import { execSync } from 'child_process';
import { existsSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const skillDir = path.resolve(__dirname, '..');   // skills/zulgap-noblenyang
const require = createRequire(import.meta.url);

let ffmpeg = null, installed = false;
try {
  ffmpeg = require('ffmpeg-static');
} catch {
  // 스킬 폴더에 ffmpeg-static 설치 (1회, 세션 넘어 영속)
  // @AI:CONSTRAINT --prefix 필수. 스킬 폴더엔 package.json 이 없어서, cwd 만 지정하면 npm 이
  //   상위로 올라가 처음 만나는 package.json 의 프로젝트(최악의 경우 사용자 홈)에 설치한다.
  //   그러면 바로 아래 skillDir/node_modules 조회가 실패해 "설치 실패" 로 오인된다.
  //   --prefix 는 package.json 유무와 무관하게 그 폴더의 node_modules 에 설치한다.
  try {
    execSync(`npm install ffmpeg-static --prefix "${skillDir}"`, { cwd: skillDir, stdio: 'ignore' });
    ffmpeg = require(path.join(skillDir, 'node_modules', 'ffmpeg-static'));
    installed = true;
  } catch (e) {
    console.log('RESULT_JSON=' + JSON.stringify({ error: 'ffmpeg-static 설치 실패: ' + e.message + ' (npm/네트워크 확인)' }));
    process.exit(1);
  }
}

// 한글 폰트 — 기준은 Windows 맑은 고딕 Bold, 없으면 OS별 대체본 탐색 (scripts/resolve-font.js)
const { resolveFont, FONT_CANDIDATES } = require('./resolve-font.js');
const FONT = resolveFont();
const fontOk = !!FONT;

console.log('RESULT_JSON=' + JSON.stringify({
  ffmpeg, ffmpeg_exists: ffmpeg ? existsSync(ffmpeg) : false,
  font: FONT, font_exists: fontOk, installed,
  ...(fontOk && FONT !== FONT_CANDIDATES[0]
    ? { font_note: `대체 폰트 사용(${FONT}) — 기준인 맑은 고딕 Bold 와 자폭이 달라 자막 줄바꿈 위치가 다를 수 있습니다.` }
    : {}),
  ...(fontOk ? {} : { font_warning: '한글 폰트를 찾지 못했습니다. 확인한 경로: ' + FONT_CANDIDATES.join(', ') + ' — 자막 생성 시 실패합니다.' }),
}));
