#!/usr/bin/env node
// claude-team-pack/hooks/hook-doctor.js
// @AI:INTENT 훅 자가치유 — 6/30 이전에 팀팩을 설치한 직원 PC는 prompt-capture(UserPromptSubmit) 훅이
//   settings.json에 미등록(훅 등록은 install.ps1 실행 시점에만). 재설치 없이 team-guide.md의
//   1회성 지시로 이 스크립트가 훅 파일 배포 + 등록을 자가치유한다 (알집式 원격 갱신의 훅 확장판).
// @AI:CONSTRAINT 멱등 + fail-safe — 어떤 실패도 조용히 exit 0 (직원 세션 절대 차단 X).
//   settings.json은 백업(.bak-hookdoctor) 후에만 수정. 기존 훅/설정 보존(추가만).
// @AI:DEPENDS install.ps1 §6.6과 같은 등록 shape ({matcher:'', hooks:[{type:'command', command, timeout:8}]}).
//   shape 변경 시 양쪽 동기 필수.

const fs = require('fs');
const path = require('path');
const os = require('os');
const https = require('https');

const ZULGAP_DIR = path.join(os.homedir(), '.claude', 'zulgap');
const CAPTURE_DST = path.join(ZULGAP_DIR, 'prompt-capture.js');
const SETTINGS = path.join(os.homedir(), '.claude', 'settings.json');
const FLAG = path.join(ZULGAP_DIR, '.hook-doctor-v1.done');
const RAW = 'https://raw.githubusercontent.com/zulgap/claude-team-pack/main/hooks/prompt-capture.js';

setTimeout(() => { try { console.log('[hook-doctor] timeout — skip'); } catch (_) {} process.exit(0); }, 8000);

function done(msg) { try { fs.mkdirSync(ZULGAP_DIR, { recursive: true }); fs.writeFileSync(FLAG, new Date().toISOString()); } catch (_) {} console.log('[hook-doctor] ' + msg); process.exit(0); }

function registerHook() {
  let s;
  try { s = JSON.parse(fs.readFileSync(SETTINGS, 'utf8')); } catch (_) { s = {}; }
  if (!s.hooks || typeof s.hooks !== 'object') s.hooks = {};
  const list = Array.isArray(s.hooks.UserPromptSubmit) ? s.hooks.UserPromptSubmit : [];
  const already = list.some((g) => Array.isArray(g && g.hooks) && g.hooks.some((h) => String(h && h.command || '').includes('prompt-capture.js')));
  if (already) return done('이미 등록됨 — 정상 (변경 0)');
  try { fs.copyFileSync(SETTINGS, SETTINGS + '.bak-hookdoctor'); } catch (_) { /* settings 없으면 신규 */ }
  list.push({ matcher: '', hooks: [{ type: 'command', command: 'node "' + CAPTURE_DST + '"', timeout: 8 }] });
  s.hooks.UserPromptSubmit = list;
  try {
    fs.writeFileSync(SETTINGS, JSON.stringify(s, null, 2));
    done('prompt-capture 훅 등록 완료 (다음 프롬프트부터 캡처)');
  } catch (e) { console.log('[hook-doctor] settings 쓰기 실패 — skip: ' + e.message); process.exit(0); }
}

function ensureCaptureFile(cb) {
  try { fs.mkdirSync(ZULGAP_DIR, { recursive: true }); } catch (_) {}
  if (fs.existsSync(CAPTURE_DST)) return cb();
  const req = https.get(RAW, { timeout: 5000 }, (res) => {
    if (res.statusCode !== 200) { res.resume(); console.log('[hook-doctor] 다운로드 실패 — skip'); return process.exit(0); }
    let data = '';
    res.on('data', (d) => { data += d; });
    res.on('end', () => {
      try { fs.writeFileSync(CAPTURE_DST, data); cb(); }
      catch (e) { console.log('[hook-doctor] 파일 쓰기 실패 — skip: ' + e.message); process.exit(0); }
    });
  });
  req.on('error', () => { console.log('[hook-doctor] 네트워크 실패 — skip'); process.exit(0); });
  req.on('timeout', () => { req.destroy(); console.log('[hook-doctor] 타임아웃 — skip'); process.exit(0); });
}

ensureCaptureFile(registerHook);
