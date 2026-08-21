#!/usr/bin/env node
// resolve-packs.js — 「어느 팩을 켤 것인가」 판정 SSOT (3장부 공용)
//
// @AI:INTENT 이 파일이 생긴 이유 = 같은 규칙을 **세 언어로 세 번 짰다가 갈렸기 때문**이다.
//   2026-08-16 실측: 카드 `packs: []` 하나로 3장부가 정반대 답을 냈다.
//     · install.ps1     → PowerShell 에서 `@()` 가 falsy → `$null`(판정 불가)로 접힘 → **켠다**
//     · install.sh      → `[].join(" ")` = `""` → 빈값(판정 불가)으로 접힘 → **켠다**
//     · hook-doctor-v2  → JS 에서 `[]` 는 truthy → 「팩 없음」으로 정확히 읽음 → **끈다**
//   실사용 증상: 설치하면 켜지고 **24시간 뒤 점검기가 꺼버린다**(「어제 되던 게 오늘 사라졌다」).
//   → 판정을 한 벌로 합친다. 3장부는 이 스크립트를 호출해 **결과만 소비**한다.
//
// @AI:CONSTRAINT 🔴 「빈 목록」과 「판정 불가」는 **다른 것**이다. 이 구분이 이 파일의 존재 이유다.
//     packs = []    → 서버가 확실히 답했고 선택 팩이 하나도 없다  → confident=true, 전부 끔
//     packs = null  → 못 물어봤다(토큰 없음·네트워크·404·파싱실패) → confident=false, 현상 유지
//   두 값을 같은 곳에 접지 말 것. 접는 순간 위 사고가 그대로 재발한다.
//
// @AI:CONSTRAINT 🔴 confident 원칙 — **확실할 때만 끈다.** 판정 불가면 아무것도 끄지 않는다.
//   줄갭 직원 fail-open 은 2026-07-21 「스킬 0개」 사고 대응으로 **의도된 설계**다(5인토론 Q2 수렴).
//   404 를 「제외」로 접으면 줄갭 카드 행이 실수로 지워진 날 전 팀원이 스킬을 잃는다.
//
// 사용:
//   node resolve-packs.js --role staff              → JSON (기본)
//   node resolve-packs.js --role dev --format sh    → sh eval 용 라인
//
// 출력 계약 (3장부가 이 모양에 의존한다 — 키를 지우거나 이름을 바꾸지 말 것):
//   { ok, confident, reason, packs, plugins: { "<플러그인명>": true|false } }
//   · plugins 는 **rules 의 모든 플러그인**을 담는다(켜는 것만 담지 않는다) — 아래 참조.

const fs = require('fs');
const os = require('os');
const path = require('path');
const https = require('https');

const JURL = 'https://judgmentos-unified-agent-production.up.railway.app';
const ZULGAP_DIR = path.join(os.homedir(), '.claude', 'zulgap');
const PACKS_CACHE = path.join(ZULGAP_DIR, '.teampack-packs.json');
const PACKS_CACHE_MS = 24 * 60 * 60 * 1000;

// @AI:CONSTRAINT 🔴 `jedi-core` 는 **판정 대상이 아니다 — 항상 켠다.**
//   카드에 'core' 를 빠뜨린 오타 하나로 전 직원이 스킬 0개가 되는 것을 막는 안전판이다.
//   격리는 **선택 팩**에서 서고, 공용 팩까지 게이트에 걸면 사고 반경만 커진다.
const BASE_PLUGINS = ['jedi-core'];

// @AI:CONSTRAINT 🔴 **allow-list 다.** 이전에는 `packs.includes('zulgap')` 하나만 보는 deny-check 였고,
//   그래서 **새 팩을 만들면 아무 장부도 그 이름을 몰라 키를 안 쓰고 → opt-out 로드로 전원에게 켜졌다.**
//   (키가 없으면 Claude Code 가 로드한다 — 2026-07-29 실측: dev-pack 키 없는 staff PC 에서 실행까지 됨)
//   여기에 팩을 추가하면 「카드에 그 팩이 있는 테넌트만」 켜지고 나머지는 **명시적 false** 가 나간다.
// @AI:FRAGILE marketplace.json 의 플러그인과 1:1 이어야 한다 — CI(check-plugin-consistency) 가 대조한다.
//   deprecated 플러그인(`zulgap`)은 여기 넣지 않는다. 그 비활성은 hook-doctor 의 verify-then-flip 소관.
const PLUGIN_RULES = {
  // @AI:CONSTRAINT 🔴 tenantOnly = «남의 회사 자료가 든» 팩. 2026-08-21 실측: zulgap-pack 안에
  //   동료사 운영 계정(플레이스·광고·GA4 ID)·법인 사업자번호·사내 공유폴더 경로가 들어 있다.
  //   이 표시가 붙은 팩은 «새 PC 에 처음 켤 때» 판정이 확실해야만 켠다 (decide 의 enableOk).
  'zulgap-pack': { pack: 'zulgap', tenantOnly: true },
  'dev-pack': { pack: 'dev', roles: ['dev', 'master'] },
};

function args(argv) {
  // roleConfident 기본 true — 설치기는 --role 을 확정값으로 준다.
  // hook-doctor 처럼 「몰라서 staff」인 경우만 `--role-confident 0` 을 붙인다.
  const out = { role: '', format: 'json', roleConfident: true, newPc: false };
  for (let i = 2; i < argv.length; i++) {
    if (argv[i] === '--role') out.role = String(argv[++i] || '').trim().toLowerCase();
    else if (argv[i] === '--format') out.format = String(argv[++i] || 'json').trim().toLowerCase();
    else if (argv[i] === '--role-confident') out.roleConfident = String(argv[++i] || '1').trim() !== '0';
    // @AI:INTENT 설치기(새 PC)만 준다. hook-doctor 는 «기존» PC 를 건드리므로 주지 않는다.
    else if (argv[i] === '--new-pc') out.newPc = true;
  }
  return out;
}

function b64urlJson(seg) {
  return JSON.parse(Buffer.from(String(seg).replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8'));
}

// 제디 토큰 위치 — team-guide-fetch.js 와 같은 후보 순서 (Claude Code 우선, 데스크탑앱 폴백)
function rawToken() {
  const cands = [path.join(os.homedir(), '.claude.json')];
  if (process.env.APPDATA) cands.push(path.join(process.env.APPDATA, 'Claude', 'claude_desktop_config.json'));
  cands.push(path.join(os.homedir(), 'Library', 'Application Support', 'Claude', 'claude_desktop_config.json'));
  for (const f of cands) {
    try {
      const j = JSON.parse(fs.readFileSync(f, 'utf8'));
      const t = j && j.mcpServers && j.mcpServers.jedi && j.mcpServers.jedi.env && j.mcpServers.jedi.env.JUDGMENTOS_TOKEN;
      if (t) return String(t);
    } catch (_) { /* 다음 후보 */ }
  }
  return '';
}

function roleFromToken(tok) {
  try {
    const r = String((b64urlJson(String(tok).split('.')[1]) || {}).role || '').toLowerCase();
    if (r === 'admin' || r === 'master') return 'master';
    if (r === 'dev' || r === 'developer' || r === 'engineer') return 'dev';
    if (r) return 'staff';
  } catch (_) {}
  return '';
}

function readCache() {
  try {
    const c = JSON.parse(fs.readFileSync(PACKS_CACHE, 'utf8'));
    // @AI:CONSTRAINT Array.isArray 로 본다 — `[]` 도 유효한 캐시다(빈 목록 ≠ 캐시 없음).
    if (Date.now() - c.ts < PACKS_CACHE_MS && Array.isArray(c.packs)) return c.packs;
  } catch (_) {}
  return null;
}

function writeCache(packs) {
  try { fs.mkdirSync(ZULGAP_DIR, { recursive: true }); fs.writeFileSync(PACKS_CACHE, JSON.stringify({ ts: Date.now(), packs })); } catch (_) {}
}

function fetchPacks(token) {
  return new Promise((resolve) => {
    const req = https.get(JURL + '/mcp/ext/teampack-config',
      { headers: { Authorization: 'Bearer ' + token }, timeout: 8000 }, (res) => {
        if (res.statusCode !== 200) { res.resume(); return resolve({ packs: null, reason: 'http-' + res.statusCode }); }
        let body = '';
        res.on('data', (d) => { body += d; });
        res.on('end', () => {
          try {
            const j = JSON.parse(body);
            // @AI:CONSTRAINT 🔴 `Array.isArray` 로만 판정한다. truthy 검사(`j.data.packs`)를 쓰면
            //   `[]` 가 falsy 인 언어에서 「판정 불가」로 접혀 이 파일이 생긴 사고가 재발한다.
            const packs = j && j.success && j.data && Array.isArray(j.data.packs) ? j.data.packs : null;
            resolve(packs === null ? { packs: null, reason: 'parse' } : { packs, reason: 'card' });
          } catch (_) { resolve({ packs: null, reason: 'parse' }); }
        });
      });
    req.on('error', () => resolve({ packs: null, reason: 'network' }));
    req.on('timeout', () => { req.destroy(); resolve({ packs: null, reason: 'timeout' }); });
  });
}

/**
 * 팩 목록 + role → { plugins, why, canDisable }.
 *
 * @AI:INTENT plugins 는 **rules 의 모든 플러그인**을 담는다 — 켤 것만 담으면 나머지는 키가 안 생기고,
 *   키가 없으면 Claude Code 가 로드한다(opt-out). 「끈다」는 명시적 false 로만 표현된다.
 *
 * @AI:CONSTRAINT 🔴 confidence 축이 **둘**이다(role · packs). 이걸 호출자에 남기면 또 3벌이 되므로
 *   여기서 합친다. `canDisable` = 「이미 켜져 있는 것을 **꺼도 되는가**」.
 *     · role 때문에 false  → roleConfident 일 때만 꺼도 된다
 *     · packs 때문에 false → confident(카드를 읽었다) 일 때만 꺼도 된다
 *   설치기는 새 PC라 둘 다 확실하지만, hook-doctor 는 **기존 PC를 건드리므로** 이 구분이 필요하다.
 *   구분을 없애면 「몰라서 staff」인 PC의 dev-pack 을 꺼버린다(2026-07-29 사고 클래스).
 */
function decide(packs, role, confident, roleConfident, newPc) {
  const plugins = {};
  const why = {};
  const canDisable = {};
  for (const p of BASE_PLUGINS) { plugins[p] = true; why[p] = null; canDisable[p] = false; }
  for (const [name, rule] of Object.entries(PLUGIN_RULES)) {
    const roleOk = !rule.roles || rule.roles.indexOf(role) !== -1;
    // 판정 불가면 팩 축은 통과시킨다(현상 유지) — 끄는 판단은 confident 일 때만.
    const packOk = confident ? packs.indexOf(rule.pack) !== -1 : true;
    // @AI:CONSTRAINT 🔴 «켜는 것도» 확실할 때만 — canDisable(끄기 권한)의 대칭이다 (2026-08-21).
    //   판정 불가(토큰 없음·네트워크·파싱실패)인데 새 PC 면 tenantOnly 팩을 켜지 않는다.
    //   그 전에는 fail-open 이라, 토큰 없이 깐 «남의 회사» PC 에 우리 테넌트 자료가 그대로 깔렸다
    //   (README 가 "없으면 Enter" 를 권하므로 그것이 첫 설치의 정상 경로였다).
    //   🔑 hook-doctor 는 --new-pc 를 주지 않는다 — 기존 PC 를 끄면 2026-07-29 사고가 재발한다.
    const enableOk = !(newPc && rule.tenantOnly && !confident);
    plugins[name] = roleOk && packOk && enableOk;
    why[name] = !roleOk ? 'role' : (!packOk ? 'pack' : (!enableOk ? 'unverified' : null));
    canDisable[name] = !plugins[name] && (why[name] === 'role' ? !!roleConfident : confident);
  }
  return { plugins, why, canDisable };
}

// @AI:FRAGILE 인자 파싱은 **모듈 스코프**에 둔다 — 아래 catch(크래시 폴백)가 role 을 써야 하는데
//   async 블록 안에 두면 catch 에서 안 보여 role 을 모른 채 dev-pack 을 켜게 된다(2026-07-29 사고 클래스).
const A = args(process.argv);

// @AI:CONSTRAINT require.main 가드 — 테스트가 이 파일을 require 해서 decide() 를 직접 검사한다.
//   가드가 없으면 require 만으로 네트워크를 타고 stdout 을 오염시킨다.
if (require.main !== module) { module.exports = { PLUGIN_RULES, BASE_PLUGINS, decide }; return; }

(async () => {
  const a = A;
  const token = rawToken();
  const role = a.role || roleFromToken(token) || 'staff';

  let packs = null;
  let reason = 'no-token';
  if (token) {
    packs = readCache();
    if (packs) reason = 'cache';
    else {
      const r = await fetchPacks(token);
      packs = r.packs;
      reason = r.reason;
      if (packs) writeCache(packs);
    }
  }

  const confident = packs !== null;
  const d = decide(packs || [], role, confident, a.roleConfident, a.newPc);
  const out = { ok: true, confident, reason, role, packs, ...d };

  if (a.format === 'sh') {
    const on = Object.keys(out.plugins).filter((k) => out.plugins[k]);
    const off = Object.keys(out.plugins).filter((k) => !out.plugins[k]);
    const canOff = Object.keys(out.canDisable).filter((k) => out.canDisable[k]);
    process.stdout.write(
      'RP_CONFIDENT=' + (confident ? '1' : '0') + '\n' +
      'RP_REASON=' + reason + '\n' +
      'RP_ROLE=' + role + '\n' +
      'RP_PACKS="' + (packs || []).join(' ') + '"\n' +
      'RP_ON="' + on.join(' ') + '"\n' +
      'RP_OFF="' + off.join(' ') + '"\n' +
      'RP_CAN_OFF="' + canOff.join(' ') + '"\n');
  } else {
    process.stdout.write(JSON.stringify(out));
  }
})().catch(() => {
  // @AI:CONSTRAINT 어떤 예외에도 「판정 불가」를 내보낸다 — 호출자가 현상 유지로 안전하게 떨어진다.
  //   여기서 죽으면 호출자가 빈 출력을 받고 각자 다르게 해석한다(= 이 파일이 없앤 바로 그 사고).
  // @AI:FRAGILE 🔴 plugins 를 전부 true 로 채우지 말 것 — dev-pack 은 role 게이트가 있어
  //   staff PC 에 개발자 스킬이 켜진다(2026-07-29 실측 사고). decide(confident=false) 를 그대로 쓴다.
  const role = A.role || 'staff';
  process.stdout.write(JSON.stringify(Object.assign(
    { ok: false, confident: false, reason: 'crash', role, packs: null },
    decide([], role, false, A.roleConfident))));
});
