#!/usr/bin/env node
// raw-ref-scan.js — 팀팩 저장소의 «공개 raw 주소» 참조를 세는 스캐너 (Tier L 의 스캔부)
//
// @AI:INTENT 2026-08-19 유료화 A3-4c — 저장소를 비공개로 돌리면(A4) raw.githubusercontent 주소가 통째로
//   죽는다. A3-4b 가 실행 경로 4곳을 서버 창구(/pack/*)로 옮겼고 raw 는 «폴백»으로만 남았다.
//   이 스캐너는 「누가 raw 참조를 «새로» 넣었나」를 잡는다 — 지금 남은 것은 동결하고, 늘면 FAIL.
//   폴백을 지금 지우지 않는 이유는 A3-4b 참조: 새 주소를 아는 훅이 퍼지는 통로가 바로 그 raw 다.
// @AI:CONSTRAINT 🔴 ratchet 이다 — 늘면 FAIL, 줄면 --update-baseline 으로 조인다. 넓히기 금지.
//   leak-scan.js 와 같은 형태이며 판정·출력은 check-plugin-consistency.js Tier L 이 한다(J-0 3자 일치).
// @AI:DEPENDS 스캔 대상 확장자는 아래 EXTS. CHANGELOG.md 는 «이력»이라 뺀다 — 옛 주소가 적혀 있는 것이 정상이다.
'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const BASELINE = path.join(__dirname, '_raw-ref-baseline.json');
const RAW_RE = /raw\.githubusercontent\.com\/zulgap\/claude-team-pack/g;
const EXTS = new Set(['.js', '.sh', '.ps1', '.bat', '.md', '.json', '.yml', '.yaml', '.txt']);
const SKIP_DIRS = new Set(['node_modules', '.git', '.githooks']);
const SKIP_FILES = new Set(['CHANGELOG.md', 'raw-ref-scan.js', '_raw-ref-baseline.json']); // 이력 · 스캐너 자신 · 기준선 — 주소 «문자열»이 있는 것이 정상

function walk(dir, out) {
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    if (ent.isDirectory()) { if (!SKIP_DIRS.has(ent.name)) walk(path.join(dir, ent.name), out); continue; }
    if (!EXTS.has(path.extname(ent.name))) continue;
    if (SKIP_FILES.has(ent.name)) continue;
    out.push(path.join(dir, ent.name));
  }
  return out;
}

/** @returns {Record<string, number>} 파일(레포 상대경로, /) → raw 참조 건수 */
function scan() {
  const counts = {};
  for (const f of walk(ROOT, [])) {
    let text; try { text = fs.readFileSync(f, 'utf8'); } catch (_) { continue; }
    const n = (text.match(RAW_RE) || []).length;
    if (n > 0) counts[path.relative(ROOT, f).split(path.sep).join('/')] = n;
  }
  return counts;
}

function loadBaseline() {
  try { return JSON.parse(fs.readFileSync(BASELINE, 'utf8')).frozen || {}; } catch (_) { return {}; }
}

/** @returns {{ violations: {file,was,now}[], cleared: {file,was,now}[] }} */
function diff(now, frozen) {
  const violations = []; const cleared = [];
  for (const [file, n] of Object.entries(now)) {
    const was = frozen[file] || 0;
    if (n > was) violations.push({ file, was, now: n });
    else if (n < was) cleared.push({ file, was, now: n });
  }
  for (const [file, was] of Object.entries(frozen)) if (!(file in now)) cleared.push({ file, was, now: 0 });
  return { violations, cleared };
}

function writeBaseline(now) {
  const doc = {
    note: [
      '팀팩 저장소의 공개 raw 주소(raw.githubusercontent.com/zulgap/claude-team-pack) 참조 동결분 — Tier L.',
      'A3-4b(2026-08-19) 로 실행 경로는 서버 창구(/pack/*)를 먼저 쓰고 raw 는 폴백이다. 늘면 FAIL, 줄면 --update-baseline 으로 조인다.',
      '⟳ 2026-08-21 (A4-a) — 「0 이 되어야 한다」는 부정확했다. 성격이 둘로 갈린다:',
    '  ① 사람이 보고 치는 설치 안내(부트스트랩) = 폴백이 원리적으로 없어 닫으면 «진짜 죽는다» → 8건을 zulgap.kr 로 옮겨 0 이 됐다.',
    '  ② 실행 경로의 raw = 창구를 먼저 두드리고 실패할 때만 쓰는 폴백이라 닫아도 주경로가 산다.',
    '     남은 4건(hook-doctor·team-guide-fetch·install.ps1·install.sh RAW=)이 전부 여기다 — 0 을 목표로 하지 말 것.',
    '     A4 로 저장소를 닫는 날 raw 가 저절로 죽어 폴백도 함께 사라진다(install.sh fetch() 의 @AI:CONSTRAINT).',
    ],
    frozen: now,
    updated_at: new Date().toISOString().slice(0, 10),
  };
  fs.writeFileSync(BASELINE, JSON.stringify(doc, null, 2) + '\n');
}

module.exports = { scan, loadBaseline, diff, writeBaseline };

if (require.main === module) {
  const now = scan();
  if (process.argv.includes('--update-baseline')) { writeBaseline(now); console.log('baseline 갱신:', JSON.stringify(now)); process.exit(0); }
  const { violations, cleared } = diff(now, loadBaseline());
  console.log(JSON.stringify({ now, violations, cleared }, null, 2));
  process.exit(violations.length ? 1 : 0);
}
