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
// @AI:INTENT 2026-08-19 A3-4b — 저장소를 비공개로 돌리면(A4) 위 raw 가 죽는다. 서버가 자기 토큰으로
//   대신 읽어 배달하는 창구를 **먼저** 두드리고, 안 되면 raw 로 떨어진다. 이 경로는 curl-pipe 계열이라
//   토큰을 실을 자리가 원리적으로 없어서 창구도 무인증이다(서버가 «배관»만 열어 둔다 — 스킬은 안 연다).
// @AI:CONSTRAINT 🔴 raw 폴백을 지금 지우지 말 것 — 새 주소를 아는 훅이 퍼지기 «전»에 지우면 그 사이
//   자가치유가 통째로 멈춘다. 게다가 이 경로는 실패해도 증상이 안 나서 아무도 모른다(무증상 고장).
const PACK = (process.env.JUDGMENTOS_URL || 'https://judgmentos-unified-agent-production.up.railway.app')
  .replace(/[/]+$/, '') + '/pack/hooks/';

// [훅 파일, settings.json 이벤트 키, 훅 timeout(초)] — 새 훅은 여기 한 줄만 추가한다
const TARGETS = [
  { file: 'prompt-capture.js', event: 'UserPromptSubmit', timeout: 8 },
  { file: 'response-capture.js', event: 'Stop', timeout: 8 },
  { file: 'precompact-handoff.js', event: 'PreCompact', timeout: 15 },
];

// @AI:CONSTRAINT 워치독은 TARGETS 개수 × **시도 횟수** × 다운로드 timeout 보다 커야 한다.
//   2026-08-19 A3-4b 로 시도가 2회(창구 → raw)가 되어 최악이 3 × 2 × 4s = 24s 로 두 배가 됐다.
//   그래서 16s → 26s. 상위(team-guide-fetch items)가 준 실행 timeout 30s 보다는 여전히 작다(마진 4s).
//   🔴 TARGETS 를 늘리거나 시도를 하나 더 붙이면 이 값도 같이 올릴 것 — 안 올리면 마지막 훅이
//   워치독에 잘려 **조용히** 누락된다. 26s 를 넘겨야 할 땐 상위 30s 도 함께 올릴 것.
setTimeout(() => { try { console.log('[hook-doctor] timeout — skip'); } catch (_) {} process.exit(0); }, 26000);

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
  // @AI:INTENT 2026-08-19 A3-4b — 창구 → raw 순으로 한 번씩 두드린다. next() 는 «다음 주소로»,
  //   cb(false) 는 «둘 다 실패». 쓰기 실패는 next 로 보내지 않는다 — 그건 네트워크 문제가 아니라
  //   디스크 문제라 주소를 바꿔도 같은 결과이고, 재시도하면 실패 시간만 두 배가 된다.
  const attempt = (base, next) => {
    const req = https.get(base + target.file, { timeout: 4000 }, (res) => {
      if (res.statusCode !== 200) { res.resume(); return next('HTTP ' + res.statusCode); }
      let data = '';
      res.on('data', (d) => { data += d; });
      res.on('end', () => {
        try { fs.writeFileSync(dst, data); cb(true); }
        catch (e) { console.log('[hook-doctor] ' + target.file + ' 쓰기 실패 — skip: ' + e.message); cb(false); }
      });
    });
    req.on('error', (e) => next((e && e.message) || 'network'));
    req.on('timeout', () => { req.destroy(); next('timeout'); });
  };
  // @AI:CONSTRAINT 🔴 폴백을 조용히 하지 말 것 — 안 알리면 「다 넘어간 줄 알았는데 실은 전부
  //   예비길」인 상태가 무증상이 되고, 그 상태로 저장소를 닫으면(A4) 자가치유가 한꺼번에 죽는다.
  attempt(PACK, (why) => {
    console.log('[hook-doctor] ' + target.file + ' 창구 실패(' + why + ') — 예비 주소로 재시도');
    attempt(RAW, (why2) => { console.log('[hook-doctor] ' + target.file + ' 다운로드 실패(' + why2 + ') — skip'); cb(false); });
  });
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
