#!/usr/bin/env node
// _test-team-guide-fetch.js — 외부 테넌트 안내문 배달 결정론 검사 (A3-1)
//
// @AI:INTENT 이 테스트가 지키는 것은 세 가지다.
//   #1 회사별 안내문이 **인증 경로로만** 나간다 — 주소에 회사 식별자를 두지 않는다
//   #2 실패가 **화면에 뜬다** — 응답을 캐시로 덮으면 아무 일도 없던 것처럼 보인다
//   #3 캐시가 **영구히 살아 있지 않다** — 구독이 끝나면 안내문도 끝나야 한다
//   셋 다 「에러가 안 나서 아무도 모르는」 종류라 게이트가 없으면 조용히 되돌아간다.
// @AI:CONSTRAINT 훅을 **자식 프로세스로 실제 실행**한다 — 규칙을 여기서 다시 구현하지 않는다.
//   임시 HOME 을 주고 로컬 서버로 응답을 만들어, 실제 요청·헤더·출력을 그대로 본다.

const assert = require('assert');
const path = require('path');
const fs = require('fs');
const os = require('os');
const http = require('http');
const { execFile } = require('child_process');

const HOOK = path.join(__dirname, '..', 'hooks', 'team-guide-fetch.js');
// @AI:CONSTRAINT 실제 회사 식별자를 여기 적지 말 것 — 형태만 맞으면 되고, 공개 파일이다.
const EXT = '11111111-2222-3333-4444-555555555555';    // 외부 tenant (형태만)
const INT = 'a0000000-0000-0000-0000-000000000002';    // 내부 (INTERNAL_TENANTS 와 일치해야 의미가 있다)
const MARKER = 'ZZ_SERVER_MARKER_ZZ';

let pass = 0;
const cases = [];
function t(name, fn) { cases.push([name, fn]); }

// ── 임시 HOME + 가짜 토큰 ───────────────────────────────────────────────────
// @AI:CONSTRAINT 서명 없는 토큰이면 충분하다 — 훅은 payload 를 힌트로만 읽고
//   진짜 검증은 서버가 한다. 여기서 서명을 흉내 내면 「클라가 검증한다」는 오해를 남긴다.
function fakeToken(tenantId, role) {
  const b64 = (o) => Buffer.from(JSON.stringify(o), 'utf8').toString('base64')
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  return 'x.' + b64({ actor_id: 'a1', tenant_id: tenantId, role }) + '.y';
}

function mkHome(tenantId, role, serverUrl) {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'tgf-'));
  fs.writeFileSync(path.join(home, '.claude.json'), JSON.stringify({
    mcpServers: { jedi: { env: { JUDGMENTOS_TOKEN: fakeToken(tenantId, role), JUDGMENTOS_URL: serverUrl } } },
  }));
  fs.mkdirSync(path.join(home, '.claude', 'zulgap'), { recursive: true });
  return home;
}

// @AI:DEPENDS 캐시 이름은 테넌트«와» 역할로 갈린다(A3-2b) — 내부가 같은 통로에 합류하면서
//   한 PC 안에서 개발자본과 일반본이 같은 파일을 쓰면 섞이기 때문이다.
//   ⚠️ 이름이 바뀌었으므로 기존 PC 는 첫 세션에 캐시 미스가 1회 난다(서버에서 다시 받는다).
const cachePath = (home, tenantId, variant = 'staff') =>
  path.join(home, '.claude', 'zulgap', 'guide.' + tenantId + '.' + variant + '.cache.md');

// @AI:CONSTRAINT 🔴 execFileSync 를 쓰지 말 것 — 동기 실행은 **이 프로세스의 이벤트 루프를 막아**
//   같은 프로세스에 띄운 테스트 서버가 연결을 못 받는다. 그러면 훅은 4초 타임아웃 뒤 캐시로
//   폴백하고, 겉보기엔 「서버가 응답을 안 준다」로 보여 원인 판별이 불가능하다(2026-08-17 실측).
function runHook(home) {
  const env = { ...process.env, HOME: home, USERPROFILE: home };
  delete env.APPDATA; // 데스크탑앱 config 폴백이 실제 사용자 파일을 읽지 않게
  return new Promise((resolve) => {
    execFile(process.execPath, [HOOK], { env, encoding: 'utf8', timeout: 20000 }, (_e, stdout) => {
      const out = String(stdout || '');
      if (!out.trim()) return resolve({ text: '', raw: out });
      try { resolve({ text: JSON.parse(out).hookSpecificOutput.additionalContext || '', raw: out }); }
      catch (_) { resolve({ text: '', raw: out }); }
    });
  });
}

// status/body 를 정해 주는 1회용 서버. 받은 요청도 기록한다.
async function withServer(handler, fn) {
  const seen = [];
  const srv = http.createServer((req, res) => {
    seen.push({ url: req.url, auth: req.headers.authorization || '', method: req.method });
    handler(req, res);
  });
  await new Promise((r) => srv.listen(0, '127.0.0.1', r));
  const url = 'http://127.0.0.1:' + srv.address().port;
  try { return await fn(url, seen); } finally { srv.close(); }
}

const reply = (status, body) => (_req, res) => {
  res.writeHead(status, { 'Content-Type': 'text/markdown; charset=utf-8' });
  res.end(body);
};

// ── #1 인증 경로로만 나간다 ─────────────────────────────────────────────────
t('A1 외부 테넌트 — 인증 엔드포인트로 요청 (URL 에 고객 UUID 없음)', () =>
  withServer(reply(200, '# 안내\n' + MARKER), async (url, seen) => {
    const r = await runHook(mkHome(EXT, 'USER', url));
    assert.ok(r.text.includes(MARKER), '서버 본문이 주입되지 않았다: ' + JSON.stringify(r.raw.slice(0, 200)));
    assert.strictEqual(seen.length, 1, '요청이 1회여야 한다 (실제 ' + seen.length + ')');
    assert.strictEqual(seen[0].url, '/mcp/ext/team-guide', '요청 경로: ' + seen[0].url);
    assert.ok(!seen[0].url.includes(EXT), '🔴 URL 에 고객 UUID 가 들어갔다 — 옛 경로로 되돌아갔다');
  }));

t('A2 Bearer 토큰을 실제로 보낸다', () =>
  withServer(reply(200, MARKER), async (url, seen) => {
    await runHook(mkHome(EXT, 'USER', url));
    assert.ok(/^Bearer .+/.test(seen[0].auth), '🔴 Authorization 헤더가 없다: "' + seen[0].auth + '"');
  }));

t('A3 외부 테넌트의 ADMIN 도 안내문을 받는다 (master 조기종료에 안 걸림)', () =>
  withServer(reply(200, MARKER), async (url) => {
    const r = await runHook(mkHome(EXT, 'ADMIN', url));
    assert.ok(r.text.includes(MARKER), '외부 ADMIN 이 안내문을 못 받았다');
  }));

// @AI:INTENT A3-2b 에서 계약이 **뒤집혔다** — 그전에는 「내부는 서버로 가지 않는다」가
//   지켜야 할 것이었고(A3-1 의 범위 한정), 이제는 내부도 같은 통로로 간다.
//   갈림의 기준이 「어느 회사인가」에서 「토큰이 있는가」로 바뀐 것이 이 단계의 요점이다.
t('🔴 A4 내부 테넌트도 인증 경로로 간다 (A3-2b — 공개 raw 를 안 쓴다)', () =>
  withServer(reply(200, MARKER), async (url, seen) => {
    const r = await runHook(mkHome(INT, 'USER', url));
    assert.strictEqual(seen.length, 1, '🔴 내부가 서버를 안 불렀다 — 공개 raw 로 되돌아갔다');
    assert.strictEqual(seen[0].url, '/mcp/ext/team-guide', '요청 경로: ' + seen[0].url);
    assert.ok(/^Bearer .+/.test(seen[0].auth), '🔴 내부 요청에 Bearer 가 없다');
    assert.ok(r.text.includes(MARKER), '내부에 서버 본문이 주입되지 않았다');
  }));

t('🔴 A5 개발자도 같은 인증 경로 — 역할별 주소를 만들지 않는다 (판정은 서버)', () =>
  withServer(reply(200, MARKER), async (url, seen) => {
    const r = await runHook(mkHome(INT, 'DEV', url));
    assert.strictEqual(seen.length, 1, '개발자 경로가 서버를 안 불렀다');
    assert.strictEqual(seen[0].url, '/mcp/ext/team-guide',
      '🔴 역할이 주소에 드러났다: ' + seen[0].url);
    assert.ok(r.text.includes(MARKER), '개발자에게 본문이 주입되지 않았다');
  }));

t('🔴 A6 개발자와 일반의 캐시 파일이 갈린다 (한 PC 에서 섞이지 않게)', () =>
  withServer(reply(200, MARKER), async (url) => {
    const home = mkHome(INT, 'DEV', url);
    await runHook(home);
    assert.ok(fs.existsSync(cachePath(home, INT, 'dev')),
      '개발자 캐시가 없다: ' + cachePath(home, INT, 'dev'));
    assert.ok(!fs.existsSync(cachePath(home, INT, 'staff')),
      '🔴 개발자가 일반본 캐시 자리에 썼다 — 이름이 안 갈렸다');
  }));

// @AI:CONSTRAINT 🔴 통로를 바꾸면서 이 분기를 놓치면 사장님 PC 에 팀 안내가 매 세션 주입되고
//   개인 컨텍스트가 밀린다. 증상이 「조금 길어졌다」뿐이라 아무도 원인을 못 찾는다.
t('🔴 A8 내부 관리자는 주입 자체를 건너뛴다 (개인 컨텍스트 보존)', () =>
  withServer(reply(200, MARKER), async (url, seen) => {
    const r = await runHook(mkHome(INT, 'ADMIN', url));
    assert.ok(!r.text.includes(MARKER), '🔴 내부 관리자에게 팀 안내문이 주입됐다');
    assert.strictEqual(seen.length, 0, '조기 종료인데 서버를 불렀다 (불필요한 요청)');
  }));

t('🔴 A7 토큰이 없으면 공개본으로 폴백하되 그 사실을 화면에 띄운다', () =>
  withServer(reply(200, MARKER), async (url, seen) => {
    // 토큰 없는 HOME — .claude.json 자체를 두지 않는다
    const home = fs.mkdtempSync(path.join(os.tmpdir(), 'tgf-'));
    fs.mkdirSync(path.join(home, '.claude', 'zulgap'), { recursive: true });
    const r = await runHook(home);
    assert.strictEqual(seen.length, 0, '토큰이 없는데 인증 서버를 불렀다');
    assert.ok(/토큰이 없어/.test(r.text),
      '🔴 토큰 없음이 화면에 안 떴다 (조용한 폴백): ' + JSON.stringify(r.text.slice(0, 120)));
  }));

// ── #2 실패가 화면에 뜬다 ───────────────────────────────────────────────────
t('🔴 B1 404 — 캐시로 덮지 않고 「등록 안 됨」을 띄운다 (구독 종료 = 배달 중단)', () =>
  withServer(reply(404, '{"error":"team_guide_not_found"}'), async (url) => {
    const home = mkHome(EXT, 'USER', url);
    fs.writeFileSync(cachePath(home, EXT), '옛안내문' + MARKER);
    const r = await runHook(home);
    assert.ok(!r.text.includes(MARKER), '🔴 404 인데 캐시가 쓰였다 — 끝난 뒤에도 계속 읽힌다');
    assert.ok(r.text.includes('등록'), '등록 안 됨 안내가 없다: ' + r.text.slice(0, 120));
  }));

t('B2 401 — 토큰 문제를 화면에 띄운다 (조용한 실패 금지)', () =>
  withServer(reply(401, '{"error":"invalid_token"}'), async (url) => {
    const r = await runHook(mkHome(EXT, 'USER', url));
    assert.ok(/토큰/.test(r.text), '토큰 안내가 없다: ' + r.text.slice(0, 120));
  }));

t('B3 서버 불통 — 신선한 캐시로 버틴다 (네트워크가 세션을 막지 않게)', async () => {
  const home = mkHome(EXT, 'USER', 'http://127.0.0.1:1');  // 닫힌 포트
  fs.writeFileSync(cachePath(home, EXT), '캐시본문' + MARKER);
  const r = await runHook(home);
  assert.ok(r.text.includes(MARKER), '신선한 캐시가 안 쓰였다: ' + r.text.slice(0, 120));
});

// ── #3 캐시가 영구히 살지 않는다 ────────────────────────────────────────────
t('🔴 C1 캐시 8일 경과 — 옛 안내문을 쓰지 않고 경고를 띄운다', async () => {
  const home = mkHome(EXT, 'USER', 'http://127.0.0.1:1');
  const f = cachePath(home, EXT);
  fs.writeFileSync(f, '아주오래된안내문' + MARKER);
  const old = new Date(Date.now() - 8 * 86400000);
  fs.utimesSync(f, old, old);
  const r = await runHook(home);
  assert.ok(!r.text.includes(MARKER), '🔴 8일 지난 캐시가 그대로 쓰였다 (TTL 무효)');
  assert.ok(/일째 받지 못했습니다/.test(r.text), '경고 문구가 없다: ' + r.text.slice(0, 160));
});

t('C2 캐시 6일 — 아직 쓴다 (경계 아래)', async () => {
  const home = mkHome(EXT, 'USER', 'http://127.0.0.1:1');
  const f = cachePath(home, EXT);
  fs.writeFileSync(f, '엿새전안내문' + MARKER);
  const six = new Date(Date.now() - 6 * 86400000);
  fs.utimesSync(f, six, six);
  const r = await runHook(home);
  assert.ok(r.text.includes(MARKER), '6일 캐시가 버려졌다 — 경계가 잘못됐다');
});

t('C3 성공하면 캐시가 갱신된다 (다음 실패를 대비)', () =>
  withServer(reply(200, '새본문' + MARKER), async (url) => {
    const home = mkHome(EXT, 'USER', url);
    await runHook(home);
    assert.ok(fs.readFileSync(cachePath(home, EXT), 'utf8').includes(MARKER), '캐시가 안 써졌다');
  }));

// ── 소스 잠금: 옛 공개 경로가 되살아나지 않게 ───────────────────────────────
t('🔴 D1 guides/ 공개 raw 조립이 소스에서 사라졌다', () => {
  const src = fs.readFileSync(HOOK, 'utf8');
  const live = src.split('\n').filter((l) => !/^\s*(\/\/|\*)/.test(l)).join('\n'); // 주석 제외
  assert.ok(!/RAW\s*\+\s*['"]guides\//.test(live), '🔴 공개 guides/ 조립이 코드에 남아 있다');
});

t('D2 팀팩 레포에 guides/ 디렉토리가 없다', () => {
  assert.ok(!fs.existsSync(path.join(__dirname, '..', 'guides')),
    '🔴 guides/ 가 아직 공개 레포에 있다 — 옮겼으면 지워야 한다');
});

// ── 실행 ────────────────────────────────────────────────────────────────────
(async () => {
  let failed = 0;
  for (const [name, fn] of cases) {
    try { await fn(); pass++; console.log(`  ✅ ${name}`); }
    catch (e) { failed++; console.log(`  ❌ ${name}\n     ${e.message}`); }
  }
  console.log(`\n결과: ${pass} PASS / ${failed} FAIL`);
  process.exit(failed === 0 ? 0 : 1);
})();
