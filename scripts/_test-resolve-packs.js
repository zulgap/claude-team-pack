#!/usr/bin/env node
// _test-resolve-packs.js — 팩 판정 SSOT 결정론 검사
//
// @AI:INTENT 이 테스트가 지키는 것은 두 사고다.
//   #1 새 팩을 만들면 제외 코드가 없어 **전원에게 켜졌다**(deny-check → allow-list 로 봉합)
//   #2 `packs: []` 에서 3장부가 **정반대 판정**을 냈다(빈 목록 ≠ 판정 불가 구분으로 봉합)
//   둘 다 「에러가 안 나서 아무도 모르는」 종류라 게이트가 없으면 조용히 되돌아간다.
// @AI:CONSTRAINT decide() 를 **직접** 부른다 — 규칙을 여기서 다시 구현하지 않는다.

const assert = require('assert');
const path = require('path');
const fs = require('fs');
const { decide, PLUGIN_RULES, BASE_PLUGINS } = require(path.join(__dirname, '..', 'resolve-packs.js'));

let pass = 0;
const cases = [];
function t(name, fn) { cases.push([name, fn]); }
const eq = (a, b, m) => assert.deepStrictEqual(a, b, m);

// ── 회귀: 줄갭 (카드 = core,zulgap,dev) ──────────────────────────────────────
t('줄갭 staff — zulgap-pack 켜짐 / dev-pack 꺼짐', () => {
  eq(decide(['core', 'zulgap', 'dev'], 'staff', true, true).plugins,
    { 'jedi-core': true, 'zulgap-pack': true, 'dev-pack': false });
});
t('줄갭 dev — 셋 다 켜짐', () => {
  eq(decide(['core', 'zulgap', 'dev'], 'dev', true, true).plugins,
    { 'jedi-core': true, 'zulgap-pack': true, 'dev-pack': true });
});
t('줄갭 master — 셋 다 켜짐', () => {
  eq(decide(['core', 'zulgap', 'dev'], 'master', true, true).plugins,
    { 'jedi-core': true, 'zulgap-pack': true, 'dev-pack': true });
});

// ── 사고 #2: 빈 목록 ≠ 판정 불가 ────────────────────────────────────────────
t('🔴 packs:[] — 선택 팩 전부 꺼짐 (3장부가 같은 답)', () => {
  eq(decide([], 'master', true, true).plugins,
    { 'jedi-core': true, 'zulgap-pack': false, 'dev-pack': false },
    'packs:[] 는 「팩 없음」이지 「판정 불가」가 아니다');
});
t('🔴 판정 불가 — 아무것도 안 끈다 (현상 유지)', () => {
  eq(decide([], 'staff', false, true).plugins,
    { 'jedi-core': true, 'zulgap-pack': true, 'dev-pack': false },
    'confident=false 는 팩 축을 통과시킨다 (role 축은 그대로)');
});
t('🔴 빈 목록과 판정 불가가 다른 답을 낸다', () => {
  assert.notDeepStrictEqual(decide([], 'master', true, true).plugins, decide([], 'master', false, true).plugins,
    '두 상태가 같은 답이면 사고 #2 가 되돌아온 것이다');
});

// ── 외부 테넌트 (교수님 카드 = core) ────────────────────────────────────────
t('외부 core-only — 선택 팩 전부 명시적 false', () => {
  eq(decide(['core'], 'staff', true, true).plugins,
    { 'jedi-core': true, 'zulgap-pack': false, 'dev-pack': false });
});
t('🔴 외부 ADMIN 이어도 dev-pack 안 켜짐 (카드에 dev 없음)', () => {
  eq(decide(['core'], 'master', true, true).plugins,
    { 'jedi-core': true, 'zulgap-pack': false, 'dev-pack': false },
    'role 이 master 라도 카드에 dev 가 없으면 꺼져야 한다');
});

// ── 사고 #1: 새 팩이 전원에게 켜지지 않는가 ─────────────────────────────────
t('🔴 모든 규칙 플러그인이 결과에 **명시적으로** 나온다 (키 누락 = opt-out 로드)', () => {
  const got = decide(['core'], 'staff', true, true).plugins;
  for (const name of [...BASE_PLUGINS, ...Object.keys(PLUGIN_RULES)]) {
    assert.ok(Object.prototype.hasOwnProperty.call(got, name),
      `${name} 키가 없다 — 키가 없으면 Claude Code 가 로드한다(opt-out)`);
  }
});
t('🔴 새 팩을 추가해도 카드에 없는 테넌트는 꺼진다 (mutation)', () => {
  // 규칙표에 임시로 팩을 하나 더 넣어 「새 팩이 생긴 날」을 재현한다
  PLUGIN_RULES['ahn-pack'] = { pack: 'ahn' };
  try {
    const zulgap = decide(['core', 'zulgap', 'dev'], 'master', true, true).plugins;
    assert.strictEqual(zulgap['ahn-pack'], false,
      '줄갭 카드에 ahn 이 없으므로 꺼져야 한다 — deny-check 였다면 켜졌다');
    const ahn = decide(['core', 'ahn'], 'staff', true, true).plugins;
    assert.strictEqual(ahn['ahn-pack'], true, '카드에 있으면 켜져야 한다');
    assert.strictEqual(ahn['zulgap-pack'], false, '남의 팩은 꺼져야 한다');
  } finally { delete PLUGIN_RULES['ahn-pack']; }
});

// ── 끄기 권한 (canDisable) — 기존 PC를 건드리는 hook-doctor 전용 축 ──────────
t('🔴 판정 불가면 아무것도 끌 수 없다 (현상 유지)', () => {
  const d = decide([], 'staff', false, false);
  eq(Object.values(d.canDisable).filter(Boolean).length, 0,
    'confident=false + roleConfident=false 인데 끌 수 있다고 답하면 「몰라서 staff」인 PC의 스킬이 사라진다');
});
t('🔴 「몰라서 staff」면 dev-pack 을 끄지 않는다', () => {
  const d = decide(['core', 'zulgap', 'dev'], 'staff', true, false);
  assert.strictEqual(d.plugins['dev-pack'], false, 'staff 이므로 꺼진 상태가 맞고');
  assert.strictEqual(d.canDisable['dev-pack'], false, '단 role 을 몰라서 staff 인 것이라 끄지는 않는다');
  assert.strictEqual(d.why['dev-pack'], 'role');
});
t('카드를 읽었으면 pack 축은 꺼도 된다', () => {
  const d = decide(['core'], 'staff', true, true);
  assert.strictEqual(d.canDisable['zulgap-pack'], true);
  assert.strictEqual(d.why['zulgap-pack'], 'pack');
});

// ── marketplace 와의 1:1 (게이트가 자산 추가를 놓치지 않게) ──────────────────
t('규칙표가 marketplace 플러그인을 빠짐없이 덮는다', () => {
  const mp = JSON.parse(fs.readFileSync(path.join(__dirname, '..', '.claude-plugin', 'marketplace.json'), 'utf8'));
  const DEPRECATED = ['zulgap']; // 전환기 병존 — verify-then-flip 소관이라 규칙표 밖
  const expected = mp.plugins.map((p) => p.name).filter((n) => !DEPRECATED.includes(n)).sort();
  const covered = [...BASE_PLUGINS, ...Object.keys(PLUGIN_RULES)].sort();
  eq(covered, expected,
    'marketplace 에 팩을 추가했으면 resolve-packs.js PLUGIN_RULES 에도 넣어야 한다 — ' +
    '안 넣으면 그 팩은 아무 장부도 몰라 키가 안 생기고 전원에게 켜진다');
});

// ── 켜기 권한 (newPc) — «새 PC 에 처음 켤 때» 축. 2026-08-21 뒷문 봉합 ──────────
// @AI:INTENT 판정 불가(토큰 없음)인데 tenant 팩을 켜서, 남의 회사 PC 에 우리 동료사
//   운영 계정·사업자번호가 깔리고 있었다. README 가 "없으면 Enter" 를 권해 그것이 정상 경로였다.
t('새 PC + 판정 불가 — tenant 팩을 켜지 않는다 (뒷문)', () => {
  const d = decide([], 'staff', false, true, true);
  assert.strictEqual(d.plugins['zulgap-pack'], false,
    '토큰 없이 깐 남의 회사 PC 에 우리 테넌트 자료가 깔리면 안 된다');
  assert.strictEqual(d.plugins['jedi-core'], true, '공용 팩은 그대로 켠다');
  assert.strictEqual(d.why['zulgap-pack'], 'unverified',
    '사유가 pack/role 이 아니라 unverified 여야 «왜 안 켰는지» 사람이 안다');
});

t('새 PC + 판정 불가 — role 축 팩은 이 규칙에 안 걸린다', () => {
  const d = decide([], 'master', false, true, true);
  assert.strictEqual(d.plugins['dev-pack'], true,
    'dev-pack 은 tenantOnly 가 아니라 role 축이다 — 여기서 함께 꺼지면 개발자 PC 가 반쪽이 된다');
});

t('🔴 기존 PC(hook-doctor) — 판정 불가여도 현상 유지 (2026-07-29 사고 방지)', () => {
  const d = decide([], 'staff', false, true);          // newPc 없음 = hook-doctor 경로
  assert.strictEqual(d.plugins['zulgap-pack'], true,
    'hook-doctor 가 기존 PC 의 팩을 끄면 「몰라서」 스킬이 사라진다');
  assert.strictEqual(d.canDisable['zulgap-pack'], false, '끌 권한도 없어야 한다');
});

t('새 PC + 판정 됨 — 무회귀 (카드에 있으면 켠다)', () => {
  eq(decide(['core', 'zulgap', 'dev'], 'staff', true, true, true).plugins,
    { 'jedi-core': true, 'zulgap-pack': true, 'dev-pack': false },
    '토큰이 정상이면 종전과 똑같이 켜져야 한다');
});

t('새 PC + 남의 회사 카드 — 무회귀 (명시적 false 유지)', () => {
  assert.strictEqual(decide(['core'], 'staff', true, true, true).plugins['zulgap-pack'], false,
    '카드에 없으면 확실히 끈다 — 이 축은 newPc 와 무관하게 그대로다');
});

// @AI:CONSTRAINT 🔴 배선 검사 — 판정만 고치고 설치기가 플래그를 안 주면 «코드는 맞는데 안 도는» 상태가 된다.
t('install.sh 가 --new-pc 를 실제로 넘긴다 (배선)', () => {
  const sh = fs.readFileSync(path.join(__dirname, '..', 'install.sh'), 'utf8');
  assert.ok(/--format sh --new-pc|--new-pc[sS]{0,40}--format sh/.test(sh),
    '설치기가 --new-pc 를 안 주면 뒷문이 그대로 열려 있다');
  const hd = fs.readFileSync(path.join(__dirname, '..', 'hooks', 'hook-doctor-v2.js'), 'utf8');
  assert.ok(!hd.includes('--new-pc'),
    'hook-doctor 는 «기존» PC 를 건드리므로 이 플래그를 주면 안 된다 (2026-07-29 사고)');
});

for (const [name, fn] of cases) {
  try { fn(); console.log('  PASS  ' + name); pass++; }
  catch (e) { console.log('  FAIL  ' + name + '\n        ' + e.message); }
}
console.log(`\n${pass}/${cases.length} PASS`);
process.exit(pass === cases.length ? 0 : 1);
