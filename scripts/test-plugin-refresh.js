#!/usr/bin/env node
// hook-doctor-v2.js maybeRefresh 검증 — 실제 파일의 실제 함수 소스를 추출해 vm에서 실행한다.
// (소스 문자열 grep = 가짜 초록불. 여기서는 함수를 진짜로 호출하고 반환·부작용을 본다.)
'use strict';
const fs = require('fs');
const path = require('path');
const os = require('os');
const vm = require('vm');

const SRC = path.join(__dirname, '..', 'hooks', 'hook-doctor-v2.js');
const src = fs.readFileSync(SRC, 'utf8');

// 검증 대상 함수 블록만 잘라낸다 (top-level 실행부는 제외 — require하면 즉시 실행되므로)
const START = '// @AI:INTENT 원격 최신 sha.';
const END = 'function done(';
const si = src.indexOf(START);
const ei = src.indexOf(END, si);
if (si < 0 || ei < 0) { console.error('❌ 함수 블록 추출 실패 — 마커 변경됨'); process.exit(1); }
const block = src.slice(si, ei);
if (!/function maybeRefresh\(keys\)/.test(block)) { console.error('❌ maybeRefresh 미포함'); process.exit(1); }

const TMP = path.join(os.tmpdir(), 'hdv2-test-' + process.pid);
const STAMP = path.join(TMP, '.plugin-refresh.stamp');
const INSTALLED = path.join(TMP, 'installed_plugins.json');
const KEYS = ['jedi-core@zulgap-team-pack', 'zulgap-pack@zulgap-team-pack'];
const HEAD = 'f69d54367d33ea1a9c4f221e51c2ce35246769c4';

let logs = [];
function makeCtx({ head, updateThrows, versions }) {
  logs = [];
  return vm.createContext({
    fs, path, os,
    console: { log: (m) => logs.push(String(m)) },
    // 의존 주입
    execFileSync: (bin, args) => {
      if (bin === 'git' && args.includes('rev-parse')) {
        if (head === null) throw new Error('not a git repo');
        return head + '\n';
      }
      if (updateThrows) throw new Error('boom: command failed');
      return '';
    },
    claudeBin: () => 'claude',
    ensureGitHttps: () => {},
    MARKETPLACES: TMP, MP: 'zulgap-team-pack', INSTALLED, ZULGAP_DIR: TMP,
    REFRESH_STAMP: STAMP,
    REFRESH_EVERY_MS: 24 * 60 * 60 * 1000,
    REFRESH_RETRY_MS: 60 * 60 * 1000,
    REFRESH_MP_TIMEOUT: 60000, REFRESH_PLUGIN_TIMEOUT: 40000,
    __versions: versions,
  });
}

function setup({ stamp, versions }) {
  fs.rmSync(TMP, { recursive: true, force: true });
  fs.mkdirSync(TMP, { recursive: true });
  if (stamp !== undefined) fs.writeFileSync(STAMP, stamp);
  const plugins = {};
  for (const k of KEYS) plugins[k] = [{ version: versions[k] }];
  fs.writeFileSync(INSTALLED, JSON.stringify({ plugins }));
}

function run(opts) {
  setup(opts);
  const ctx = makeCtx(opts);
  vm.runInContext(block + '\nglobalThis.__r = maybeRefresh(' + JSON.stringify(KEYS) + ');', ctx);
  let state = null;
  try { state = JSON.parse(fs.readFileSync(STAMP, 'utf8')); } catch (_) {}
  return { returned: ctx.__r, state, logs: logs.join('\n') };
}

const results = [];
function check(name, cond, detail) {
  results.push({ name, pass: !!cond, detail });
  console.log((cond ? '✅' : '❌') + ' ' + name + (cond ? '' : '  → ' + detail));
}

const V_NEW = { [KEYS[0]]: 'f69d54367d33', [KEYS[1]]: 'f69d54367d33' };
const V_OLD = { [KEYS[0]]: 'f064a5a50287', [KEYS[1]]: 'f064a5a50287' };

// S1 — 정상: update 성공 + 버전 일치 → ok:true, 경고 0
{
  const r = run({ stamp: undefined, versions: V_NEW, head: HEAD, updateThrows: false });
  check('S1 정상: ok=true', r.state && r.state.ok === true, JSON.stringify(r.state));
  check('S1 정상: 경고 출력 0 (소음 억제)', r.logs === '', r.logs);
}

// S2 — 명령 실패 → ok:false + 경고
{
  const r = run({ stamp: undefined, versions: V_NEW, head: HEAD, updateThrows: true });
  check('S2 명령실패: ok=false', r.state && r.state.ok === false, JSON.stringify(r.state));
  check('S2 명령실패: 경고 출력됨', /갱신 실패/.test(r.logs), r.logs);
  check('S2 명령실패: err 기록됨', r.state && /boom/.test(r.state.err || ''), JSON.stringify(r.state));
}

// S3 — 🔴 이번 사고 재현: 명령은 0 리턴인데 버전이 안 바뀜 (무증상 실패)
{
  const r = run({ stamp: undefined, versions: V_OLD, head: HEAD, updateThrows: false });
  check('S3 무증상실패: ok=false', r.state && r.state.ok === false, JSON.stringify(r.state));
  check('S3 무증상실패: mismatch 2팩 검출', r.state && r.state.mismatch && r.state.mismatch.length === 2, JSON.stringify(r.state && r.state.mismatch));
  check('S3 무증상실패: 경고에 팩 이름', /jedi-core/.test(r.logs), r.logs);
}

// S4 — 구 포맷(ISO 문자열) 하위호환: 성공 간주 → 24h throttle, 경고 0
{
  const recent = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(); // 2시간 전
  const r = run({ stamp: recent, versions: V_OLD, head: HEAD, updateThrows: false });
  check('S4 구포맷: throttle로 skip (return false)', r.returned === false, String(r.returned));
  check('S4 구포맷: 경고 0 (일제 경고 폭주 차단)', r.logs === '', r.logs);
}

// S5 — 실패 상태 + 30분 경과: 재시도 안 하되 경고는 낸다
{
  const st = JSON.stringify({ ts: new Date(Date.now() - 30 * 60 * 1000).toISOString(), ok: false, mismatch: [KEYS[0]] });
  const r = run({ stamp: st, versions: V_OLD, head: HEAD, updateThrows: false });
  check('S5 실패30분: 재시도 안 함 (return false)', r.returned === false, String(r.returned));
  check('S5 실패30분: 경고는 매 세션 출력', /갱신 실패/.test(r.logs), r.logs);
}

// S6 — 실패 상태 + 2시간 경과: 재시도 창(1h) 넘김 → 재시도
{
  const st = JSON.stringify({ ts: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(), ok: false, mismatch: [KEYS[0]] });
  const r = run({ stamp: st, versions: V_NEW, head: HEAD, updateThrows: false });
  check('S6 실패2시간: 재시도함 (return true)', r.returned === true, String(r.returned));
  check('S6 실패2시간: 복구되어 ok=true', r.state && r.state.ok === true, JSON.stringify(r.state));
}

// S7 — 성공 상태 + 2시간 경과: 24h 창 안이라 skip
{
  const st = JSON.stringify({ ts: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(), ok: true, mismatch: [] });
  const r = run({ stamp: st, versions: V_NEW, head: HEAD, updateThrows: false });
  check('S7 성공2시간: 24h throttle로 skip', r.returned === false, String(r.returned));
}

// S8 — 검증 불가(git 못 읽음): 실패로 떠들지 않되 verified:false 기록
{
  const r = run({ stamp: undefined, versions: V_OLD, head: null, updateThrows: false });
  check('S8 검증불가: verified=false 기록', r.state && r.state.verified === false, JSON.stringify(r.state));
  check('S8 검증불가: 경고 폭주 안 함', r.logs === '', r.logs);
}

fs.rmSync(TMP, { recursive: true, force: true });
const failed = results.filter((r) => !r.pass);
console.log('\n' + (failed.length ? '❌ FAIL ' + failed.length + '/' + results.length : '✅ ALL PASS ' + results.length + '/' + results.length));
process.exit(failed.length ? 1 : 0);
