// save-final.mjs — 최종본을 엔노블 공유폴더(또는 로컬 폴백)에 저장 (railway/업로드 불필요)
// 실행: node <스킬>/scripts/save-final.mjs <params.json>
// params: { src: 최종본 경로, dest: 저장 경로(파일까지), fallback_dir?: 접근 실패 시 로컬 폴더 }
//   → RESULT_JSON={ saved, path, fallback_used }
import { readFileSync, copyFileSync, mkdirSync, existsSync } from 'fs';
import path from 'path';

const p = JSON.parse(readFileSync(process.argv[2], 'utf8'));
const src = path.resolve(p.src);
if (!existsSync(src)) { console.log('RESULT_JSON=' + JSON.stringify({ error: 'src 없음: ' + src })); process.exit(1); }

function tryCopy(dest) {
  mkdirSync(path.dirname(dest), { recursive: true });
  copyFileSync(src, dest);
  return existsSync(dest);
}

let saved = false, savedPath = null, fallbackUsed = false, err = null;
try { if (tryCopy(p.dest)) { saved = true; savedPath = p.dest; } }
catch (e) {
  err = e.message; // 공유폴더 접근 실패 → 로컬 폴백
  if (p.fallback_dir) {
    try {
      const fb = path.join(p.fallback_dir, path.basename(p.dest));
      if (tryCopy(fb)) { saved = true; savedPath = fb; fallbackUsed = true; }
    } catch (e2) { err = e.message + ' | fallback: ' + e2.message; }
  }
}

console.log('RESULT_JSON=' + JSON.stringify({ saved, path: savedPath, fallback_used: fallbackUsed, error: saved ? null : err }));
process.exit(saved ? 0 : 1);
