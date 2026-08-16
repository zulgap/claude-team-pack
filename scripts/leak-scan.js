#!/usr/bin/env node
'use strict';

// @AI:INTENT 이 레포는 **PUBLIC** 이다. 커밋하는 순간 인터넷에 공개된다.
//   D-3 게이트는 「고객사 **이름**」만 보는데, 2026-08-16 하루에 같은 클래스가 **세 번** 났다
//   (#205 공용 팩 → #208 옆 폴더 → #214 형제 폴더 + 스킬 본문 6곳). 새어 나간 것은 이름이 아니라
//   **계좌번호·계정 ID·사업자번호·공유폴더 경로** 였고, 이름 목록으로는 하나도 못 잡았다.
//
// @AI:CONSTRAINT 그래서 이 스캐너는 **「모양」으로 잡는다** — 목록에 없는 새 고객사·새 계정이
//   생겨도 형식만 맞으면 걸린다. 목록 관리에 의존하지 않는 것이 요점이다.
//
// @AI:INTENT 🔴 **baseline 은 「값」을 적지 않는다.** 파일 경로 + 패턴 이름 + 건수만 적는다.
//   동결 목록에 실제 값을 적으면 그 목록이 또 유출이 된다(#205 가 게이트용 고객 명부를 만들어
//   공개한 것과 같은 실패). 값 없이도 「늘었나」는 셀 수 있다.
//
// @AI:DEPENDS 두 곳에서 부른다 — CI(`check-plugin-consistency.js` Tier K) · 로컬 수동 실행.
//   단독 실행: `node scripts/leak-scan.js` (위반 요약) / `--update-baseline` (동결 갱신)

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const BASELINE = path.join(__dirname, '_leak-baseline.json');

// 🔴 바이너리는 오탐 공장이다 — 폰트·이미지·pyc 안의 우연한 바이트열이 UNC·경로 패턴에 걸린다.
//   실측(2026-08-16): UNC 15건 중 5건, 개인경로 9건 중 2건이 바이너리 오탐이었다.
const SKIP_EXT = /\.(ttf|otf|ttc|woff2?|png|jpe?g|gif|webp|svg|ico|pdf|zip|mp4|mp3|wav|exe|dll|pyc|so|dylib)$/i;
const SKIP_DIR = /(^|[\\/])(\.git|node_modules|__pycache__|\.venv)([\\/]|$)/;
// 확장자로 못 거른 바이너리 — 제어문자가 있으면 텍스트가 아니다.
const CONTROL_BYTES = /[\x00-\x08\x0e-\x1f]/;

// @AI:INTENT 패턴은 **형식이 분명한 것만** 넣는다. 넓은 패턴(전화번호·숫자열)은 오탐이 폭발해
//   게이트를 꺼 버리게 만든다 — 꺼진 게이트는 없는 게이트보다 나쁘다(있다고 믿기 때문).
const PATTERNS = [
  // 은행 계좌 (6-2-6). 2026-08-16 법인 통장이 11일간 공개돼 있었다.
  { name: 'account_no', re: /\b\d{6}-\d{2}-\d{6}\b/g, why: '은행 계좌번호 형식' },
  // 사업자등록번호 (3-2-5)
  { name: 'biz_no', re: /\b\d{3}-\d{2}-\d{5}\b/g, why: '사업자등록번호 형식' },
  // 텔레그램 그룹 chat_id (10자리 이상 음수)
  { name: 'telegram_chat_id', re: /(?<![\w.-])-\d{10,}(?![\w.-])/g, why: '텔레그램 chat_id 형식' },
  // 회사 공유폴더 UNC 경로
  // 🔴 **문서에서만 본다.** 코드에서는 정규식 이스케이프(`\\bTODO\\`·`\\winget\\`)가 같은 모양이라
  //   오탐이 40%였다(2026-08-16 실측 15건 중 6건). 반면 실제 유출 3건은 **전부 .md** 였다 —
  //   공유폴더 경로는 「사람에게 알려주는 자리」에 적히지 코드에 박히지 않는다.
  { name: 'unc_path', re: /\\\\[가-힣A-Za-z0-9_-]+\\/g, why: '사내 공유폴더(UNC) 경로', only: /\.(md|txt)$/i },
  // 개인 PC 절대경로 — 실제 사용자명. `USERNAME`·`<user>` 같은 자리표시자는 통과시킨다.
  {
    name: 'personal_path',
    re: /[Cc]:[\\/]Users[\\/](?!USERNAME|<|\{|%|\$)[A-Za-z0-9._-]+/g,
    why: '개인 PC 절대경로(사용자명 노출)',
  },
];

// @AI:INTENT 문서의 **예시 번호**를 유출로 세지 않는다 — `123-45-67890`(순차) · `000-00-00000`(반복).
//   실측: tax-invoice SKILL.md 의 사업자번호 5건이 전부 이 더미였다. 이걸 안 거르면
//   「설명하려고 적은 예시」 때문에 게이트가 울고, 그러면 사람이 게이트를 끈다.
function isDummy(s) {
  const d = s.replace(/\D/g, '');
  if (d.length < 6) return false;
  if (/^(\d)\1+$/.test(d)) return true;             // 0000000000 · 1111111111
  return '01234567890123456789'.includes(d);        // 1234567890 · 234567890 …
}

function walk(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, e.name);
    if (SKIP_DIR.test(full)) continue;
    if (e.isDirectory()) { walk(full, out); continue; }
    if (SKIP_EXT.test(e.name)) continue;
    out.push(full);
  }
  return out;
}

/**
 * 레포 전체를 훑어 { '<rel>': { '<pattern>': n } } 를 만든다. 값은 담지 않는다.
 * @param {string[]} [only] 이 파일들만 본다(커밋 전 훅 — 전체 스캔은 느려서 사람이 훅을 끈다).
 */
function scan(only) {
  const found = {};
  const targets = only
    ? only.map((f) => path.join(ROOT, f)).filter((f) => fs.existsSync(f) && !SKIP_EXT.test(f) && !SKIP_DIR.test(f))
    : walk(ROOT);
  for (const full of targets) {
    let raw;
    try { raw = fs.readFileSync(full, 'utf8'); } catch { continue; }
    if (CONTROL_BYTES.test(raw)) continue;
    const rel = path.relative(ROOT, full).replace(/\\/g, '/');
    for (const p of PATTERNS) {
      if (p.only && !p.only.test(rel)) continue;
      const n = (raw.match(p.re) || []).filter((m) => !isDummy(m)).length;
      if (!n) continue;
      (found[rel] ||= {})[p.name] = n;
    }
  }
  return found;
}

function loadBaseline() {
  if (!fs.existsSync(BASELINE)) return {};
  try { return JSON.parse(fs.readFileSync(BASELINE, 'utf8')).frozen || {}; }
  catch { return {}; }
}

/**
 * 동결분 대비 **늘어난 것만** 위반으로 본다 (ratchet).
 * @returns {{violations: Array, cleared: Array}}
 */
function diff(found, frozen) {
  const violations = [];
  const cleared = [];
  for (const [file, pats] of Object.entries(found)) {
    for (const [name, n] of Object.entries(pats)) {
      const was = (frozen[file] || {})[name] || 0;
      if (n > was) violations.push({ file, name, was, now: n });
    }
  }
  // 줄어든 것 = 잘한 것. 동결을 조여야 다시 못 는다.
  for (const [file, pats] of Object.entries(frozen)) {
    for (const [name, was] of Object.entries(pats)) {
      const now = (found[file] || {})[name] || 0;
      if (now < was) cleared.push({ file, name, was, now });
    }
  }
  return { violations, cleared };
}

function totalOf(map) {
  return Object.values(map).reduce((s, p) => s + Object.values(p).reduce((a, b) => a + b, 0), 0);
}

function main() {
  // 커밋 전 훅 — 스테이징된 파일만. @AI:INTENT 전체 스캔(수백 파일)을 매 커밋마다 돌리면
  //   사람이 훅을 꺼 버린다. 꺼진 훅은 없는 훅보다 나쁘다(있다고 믿기 때문).
  const stagedAt = process.argv.indexOf('--staged');
  if (stagedAt !== -1) {
    const files = process.argv.slice(stagedAt + 1).filter((a) => !a.startsWith('--'));
    if (!files.length) return;
    const { violations } = diff(scan(files), loadBaseline());
    if (!violations.length) return;
    console.error('');
    console.error('🔴 커밋을 멈췄다 — 이 레포는 PUBLIC 이다. 올리면 인터넷에 공개되고 이력에 영구히 남는다.');
    for (const v of violations) {
      const why = (PATTERNS.find((p) => p.name === v.name) || {}).why || v.name;
      console.error(`   ${v.file} [${v.name}] ${v.was} → ${v.now}  (${why})`);
    }
    console.error('');
    console.error('   고치는 법: 값을 ~/.claude/zulgap/ 로 옮기고 문서에는 「그 파일의 어느 값」이라고만 적을 것');
    console.error('   예시로 적어야 하면 123-45-67890 · USERNAME 처럼 실값이 아님이 드러나는 형태로');
    console.error('   정말 올려야 한다면(공개돼도 되는 값이라면): git commit --no-verify');
    console.error('');
    process.exit(1);
  }

  const found = scan();
  const frozen = loadBaseline();

  if (process.argv.includes('--update-baseline')) {
    fs.writeFileSync(BASELINE, `${JSON.stringify({
      note: [
        '이 레포는 PUBLIC 이다. leak-scan.js 가 「값이 아니라 모양」으로 잡은 기존 위반의 동결분.',
        '🔴 값은 적지 않는다 — 파일·패턴이름·건수만. 값을 적으면 이 파일이 또 유출이 된다.',
        '늘면 FAIL, 줄면 --update-baseline 으로 조인다. 넓히기 금지 ratchet.',
      ],
      frozen: found,
    }, null, 2)}\n`);
    console.log(`baseline 갱신: ${Object.keys(found).length}파일 / ${totalOf(found)}건`);
    return;
  }

  const { violations, cleared } = diff(found, frozen);

  if (cleared.length) {
    console.log(`  ℹ [K 유출패턴] 줄어든 것 ${cleared.length}건 — \`node scripts/leak-scan.js --update-baseline\` 로 동결을 조일 것`);
    for (const c of cleared.slice(0, 5)) console.log(`      ${c.file} [${c.name}] ${c.was} → ${c.now}`);
  }

  if (!violations.length) {
    console.log(`  PASS [K 유출패턴] 신규 0건 (동결 ${totalOf(frozen)}건은 기존 부채 — 해소 시 --update-baseline)`);
    return;
  }

  console.error(`  FAIL [K 유출패턴] 신규 ${violations.length}건 — 이 레포는 **PUBLIC** 이다. 커밋하면 인터넷에 공개된다.`);
  for (const v of violations) {
    const why = (PATTERNS.find((p) => p.name === v.name) || {}).why || v.name;
    console.error(`      ${v.file} [${v.name}] ${v.was} → ${v.now}  (${why})`);
  }
  console.error('    고치는 법: 값을 ~/.claude/zulgap/ 로 옮기고 문서에는 「그 파일의 어느 값」이라고만 적을 것');
  console.error('    (선례: scripts/_tenant-names.README.md · plugins/zulgap-pack/skills/zulgap-naver-typing/channels/README.md)');
  console.error('    🔴 자리표시자로 바꾼 것이라면 USERNAME · <블로그ID> 처럼 **실값이 아님이 드러나는** 형태로 쓸 것');
  process.exit(1);
}

if (require.main === module) main();
module.exports = { scan, loadBaseline, diff, PATTERNS };
