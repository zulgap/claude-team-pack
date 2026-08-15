#!/usr/bin/env node
/**
 * chrome-session 단위 시나리오 — 크롬을 띄우지 않고 락·경로·포트 로직만 검증
 * 실행: node _test-chrome-session.js
 * 종료코드 0 = ALL PASS
 */
const fs = require('fs');
const path = require('path');
const os = require('os');
const S = require('./chrome-session');

const KEY = '_t_' + process.pid;             // 실제 프로필과 절대 안 겹치게
const DIR = path.join(S.PROFILES_DIR, KEY);
let pass = 0, fail = 0;

function ok(name, cond, detail = '') {
  if (cond) { pass++; console.log(`  ✅ ${name}`); }
  else { fail++; console.log(`  ❌ ${name}${detail ? '  → ' + detail : ''}`); }
}
function cleanup() { try { fs.rmSync(DIR, { recursive: true, force: true }); } catch {} }

console.log('\n[1] 크롬 경로 탐지');
{
  const cands = S.chromeCandidates();
  ok('후보가 여러 OS를 덮는다', cands.length >= 5, `${cands.length}개`);
  // 후보가 실제로 «여러 OS 계열»을 덮는지 — 경로 끝까지 정확히 본다.
  // (끝 슬래시를 빼면 실제 후보 `/Applications/Google Chrome.app/...` 와 어긋나 검사가 헐거워진다)
  ok('Windows 단독 절대경로가 아니다',
     cands.some(p => p.startsWith('/Applications/')) && cands.some(p => p.startsWith('/usr/bin/')));
  let resolved = null, err = null;
  try { resolved = S.resolveChromePath(); } catch (e) { err = e; }
  if (resolved) ok('이 PC에서 크롬을 찾았다', fs.existsSync(resolved), resolved);
  else ok('못 찾으면 «안내와 함께» 실패한다', /NAVER_TYPING_CHROME/.test(err.message));
}

console.log('\n[2] 프로필 락 — 원자적 선점');
{
  cleanup();
  const a = S.acquireLock(KEY, { pid: process.pid, port: 9999, started_at: null, user: 'a', host: 'h' });
  ok('첫 선점 성공', a.ok === true);

  // 살아 있는 소유자(= 이 node 프로세스)를 흉내내기 위해 실행경로를 chrome 으로 위장하지 않는다
  // → isOurChromeAlive 는 «크롬이 아니면» false 여야 한다 (PID 재사용 방어)
  const alive = S.isOurChromeAlive({ pid: process.pid, started_at: null });
  ok('PID 는 살아 있어도 크롬이 아니면 소유자로 안 친다 (PID 재사용 방어)', alive === false);

  const b = S.acquireLock(KEY, { pid: 1, port: 8888, started_at: null, user: 'b', host: 'h' });
  ok('죽은 락은 회수하고 재선점한다', b.ok === true && b.recovered === true);

  const owner = S.readOwner(KEY);
  ok('갱신된 소유자가 읽힌다', owner && owner.port === 8888);
  ok('release 로 해제된다', S.releaseLock(KEY) === true && S.readOwner(KEY) === null);
}

console.log('\n[3] 락 파일이 «원자적으로» 만들어지는가');
{
  cleanup();
  fs.mkdirSync(DIR, { recursive: true });
  const p = path.join(DIR, '.owner.json');
  fs.writeFileSync(p, JSON.stringify({ pid: 999999, started_at: null }));   // 죽은 PID
  const r = S.acquireLock(KEY, { pid: process.pid, port: 7777, started_at: null });
  ok('죽은 소유자면 회수 후 성공', r.ok === true);

  // 진짜 살아있는 크롬으로 위장 — 실행경로에 chrome 이 들어간 프로세스가 아니면 회수돼야 정상
  fs.writeFileSync(p, JSON.stringify({ pid: process.pid, started_at: 'x', user: 'u', host: 'h' }));
  const r2 = S.acquireLock(KEY, { pid: process.pid, port: 7778, started_at: null });
  ok('node 프로세스를 크롬으로 오인하지 않는다', r2.ok === true);
  S.releaseLock(KEY);
}

console.log('\n[4] 포트 — 실제 bind 선점');
{
  (async () => {
    const a = await S.reservePort(9300, 9320);
    ok('포트를 잡았다', typeof a.port === 'number' && a.port >= 9300);
    const b = await S.reservePort(9300, 9320);
    ok('같은 포트를 두 번 안 준다 (탐색-사용 간극 없음)', b.port !== a.port, `${a.port} vs ${b.port}`);
    await a.release(); await b.release();

    const dead = await S.cdpAlive(9319, 300);
    ok('안 열린 포트는 alive=false', dead === false);

    cleanup();
    console.log(`\n${'─'.repeat(46)}`);
    console.log(`PASS ${pass} / FAIL ${fail}`);
    process.exit(fail === 0 ? 0 : 1);
  })();
}
