#!/usr/bin/env node
// claude-team-pack/hooks/hook-doctor.js
// @AI:INTENT 훅 자가치유 — 훅 등록·복사는 install 실행 시점에만 일어나므로, 그 뒤에 추가되거나
//   고쳐진 훅은 기존 PC 에 **영원히 안 닿는다**. 재설치를 요구하지 않고 team-guide-fetch 가 매 세션
//   이 스크립트를 받아 실행해 파일 배포 + 등록을 자가치유한다 (알집式 원격 갱신의 훅 확장판).
//
//   🔴 이 파일의 존재 이유가 곧 정책이다 — **한 번 설치하면 그다음은 전부 자동 갱신.**
//      새 훅을 추가할 때 "재설치하세요"로 끝내지 말고 아래 TARGETS 에 한 줄을 넣을 것.
//
// @AI:CONSTRAINT 멱등 + fail-safe — 어떤 실패도 조용히 exit 0 (직원 세션 절대 차단 X).
//   settings.json 은 백업(.bak-hookdoctor) 후에만 수정. 기존 훅/설정 보존(추가만).
// @AI:CONSTRAINT 🔴 settings.json 은 **한 번 읽고 한 번 쓴다.** 훅마다 읽고 쓰면 뒤엣것이 앞의 변경을
//   덮는다(lost update). TARGETS 를 늘려도 이 구조를 깨지 말 것.
// @AI:DEPENDS 등록 shape 는 install.ps1 §6.6/§6.6b · install.sh 와 동기 필수
//   ({matcher:'', hooks:[{type:'command', command:'node "<경로>"', timeout:N}]}).
//
// 2026-08-08 추가 — response-capture 가 여기 들어온 경위:
//   install.ps1:314 에 CR 1바이트가 박혀 `"hooks\response-capture.js"` 가 `hooks`+CR+`esponse-...`
//   가 돼 있었다(`\r` 이 CR 로 변환). Test-Path 가 항상 false 라 **복사가 안 되는데 등록만 됐고**,
//   도입(#39, 2026-07-23)부터 16일간 무증상이었다. 경로는 고쳤지만 그것만으로는 **이미 설치를 마친
//   PC 가 낫지 않는다** — install.ps1 은 설치 때 한 번 도는 파일이기 때문이다. 그래서 여기에 넣는다.
//
// 2026-08-08 추가 — precompact-handoff 도 같은 클래스였다(겹은 하나):
//   경로 오타는 없었으나 build-staff-zip.js ENTRIES 에 빠져 **zip 에 원본이 없었다.** install.ps1
//   §6.7 은 Test-Path 실패 시 복사만 건너뛰고 등록은 그대로 해서, 윈도우 zip 설치자는 settings.json
//   에 PreCompact 훅이 있는데 실행할 파일이 없다. 맥(install.sh)은 RAW 직접 fetch 라 무사.
//   ENTRIES 를 고쳐도 이미 설치한 PC 는 낫지 않으므로 위와 같은 이유로 TARGETS 에도 넣는다.

const fs = require('fs');
const path = require('path');
const os = require('os');
const https = require('https');

const ZULGAP_DIR = path.join(os.homedir(), '.claude', 'zulgap');
const SETTINGS = path.join(os.homedir(), '.claude', 'settings.json');
const FLAG = path.join(ZULGAP_DIR, '.hook-doctor-v1.done');
const RAW = 'https://raw.githubusercontent.com/zulgap/claude-team-pack/main/hooks/';

// [훅 파일, settings.json 이벤트 키, 훅 timeout(초)] — 새 훅은 여기 한 줄만 추가한다
const TARGETS = [
  { file: 'prompt-capture.js', event: 'UserPromptSubmit', timeout: 8 },
  { file: 'response-capture.js', event: 'Stop', timeout: 8 },
  { file: 'precompact-handoff.js', event: 'PreCompact', timeout: 15 },
];

// @AI:CONSTRAINT 워치독은 TARGETS 개수 × 다운로드 timeout 보다 커야 한다. 지금 3 × 4s = 12s < 16s.
//   상위(team-guide-fetch items)가 이 스크립트에 준 실행 timeout 30s 보다는 작아야 한다.
//   🔴 TARGETS 를 늘리면 이 값도 같이 올릴 것 — 안 올리면 마지막 훅이 워치독에 잘려 조용히 누락된다.
setTimeout(() => { try { console.log('[hook-doctor] timeout — skip'); } catch (_) {} process.exit(0); }, 16000);

function done(msg) {
  try { fs.mkdirSync(ZULGAP_DIR, { recursive: true }); fs.writeFileSync(FLAG, new Date().toISOString()); } catch (_) {}
  console.log('[hook-doctor] ' + msg);
  process.exit(0);
}

// 파일이 없을 때만 받는다 (내용 갱신은 team-guide-fetch 소관 — 여기서 매번 받으면 세션마다 네트워크)
function ensureFile(target, cb) {
  const dst = path.join(ZULGAP_DIR, target.file);
  try { fs.mkdirSync(ZULGAP_DIR, { recursive: true }); } catch (_) {}
  if (fs.existsSync(dst)) return cb(true);
  const req = https.get(RAW + target.file, { timeout: 4000 }, (res) => {
    if (res.statusCode !== 200) { res.resume(); console.log('[hook-doctor] ' + target.file + ' 다운로드 실패 — skip'); return cb(false); }
    let data = '';
    res.on('data', (d) => { data += d; });
    res.on('end', () => {
      try { fs.writeFileSync(dst, data); cb(true); }
      catch (e) { console.log('[hook-doctor] ' + target.file + ' 쓰기 실패 — skip: ' + e.message); cb(false); }
    });
  });
  req.on('error', () => { console.log('[hook-doctor] ' + target.file + ' 네트워크 실패 — skip'); cb(false); });
  req.on('timeout', () => { req.destroy(); console.log('[hook-doctor] ' + target.file + ' 타임아웃 — skip'); cb(false); });
}

// 확보된 훅들을 settings.json 에 한 번에 등록한다
function registerAll(ready) {
  if (!ready.length) return done('확보된 훅 0 — 변경 없음');
  let s;
  try { s = JSON.parse(fs.readFileSync(SETTINGS, 'utf8')); } catch (_) { s = {}; }
  if (!s.hooks || typeof s.hooks !== 'object') s.hooks = {};

  const added = [];
  for (const t of ready) {
    const list = Array.isArray(s.hooks[t.event]) ? s.hooks[t.event] : [];
    const already = list.some((g) => Array.isArray(g && g.hooks)
      && g.hooks.some((h) => String((h && h.command) || '').includes(t.file)));
    if (already) { s.hooks[t.event] = list; continue; }
    list.push({
      matcher: '',
      hooks: [{ type: 'command', command: 'node "' + path.join(ZULGAP_DIR, t.file) + '"', timeout: t.timeout }],
    });
    s.hooks[t.event] = list;
    added.push(t.file);
  }

  if (!added.length) return done('이미 등록됨 — 정상 (변경 0)');
  try { fs.copyFileSync(SETTINGS, SETTINGS + '.bak-hookdoctor'); } catch (_) { /* settings 없으면 신규 */ }
  try {
    fs.writeFileSync(SETTINGS, JSON.stringify(s, null, 2));
    done(added.join(' + ') + ' 훅 등록 완료 (다음 세션부터 작동)');
  } catch (e) { console.log('[hook-doctor] settings 쓰기 실패 — skip: ' + e.message); process.exit(0); }
}

(function run(i, ready) {
  if (i >= TARGETS.length) return registerAll(ready);
  ensureFile(TARGETS[i], (ok) => run(i + 1, ok ? ready.concat(TARGETS[i]) : ready));
})(0, []);
