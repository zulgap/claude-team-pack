#!/usr/bin/env node
'use strict';

/**
 * 공유 영향 게이트 — "여러 곳이 쓰는 것을 고치면, 어디가 바뀌는지 적는다" (2026-08-20 사장님 확정)
 *
 * 하는 일: PR이 «여러 곳이 함께 쓰는 것»을 건드렸으면 영향 범위를 PR 본문에 적게 한다.
 *
 *   축 ①  공유 부품 (plugins/<팩>/shared/<모듈>/)
 *         → 그 모듈을 쓰는 스킬을 grep 으로 세어, PR 본문에 그 이름들이 있는지 본다
 *   축 ②  여러 동료사가 쓰는 스킬 (frontmatter 에 preset_slots 가 있는 스킬)
 *         → 본체를 고쳤으면 PR 본문에 「영향 범위」 서술이 있는지 본다
 *
 * 🔴 왜 만들었나 — 문서 규칙으로는 안 지켜지는 것이 실측으로 증명됐다.
 *    2026-08-20 실측: 최근 3개월 `shared/` 변경 **9건 중 영향 범위를 적은 것 0건**.
 *    작성자는 레포 주인 8건 + 팀원 1건 — 즉 **규칙을 만든 쪽도 안 적었다.**
 *    실사고(PR #239): 한 채널 글의 서식을 고치려고 `shared/naver-format/` 의 여백·인용구 규칙을
 *    바꿨는데 **그 규칙을 쓰는 스킬 5개가 함께 바뀌었다.** 자동검사는 전부 초록이었다 —
 *    `check-plugin-consistency.js` 는 `SKILL.md` 만 보고 `shared/` 아래는 스캔조차 하지 않는다.
 *    영향 범위가 알려진 것은 올린 사람이 스스로 적었기 때문이지 기계가 잡은 것이 아니다.
 *
 * 🔴 축이 둘인 이유 — 「여러 곳이 쓴다」가 한 종류가 아니다(2026-08-20 실측):
 *    ① 공유 부품 3개 — 스킬이 아니라 부품. 사람이 부를 수 없다
 *    ② preset_slots 스킬 6개 — 여러 동료사가 값만 바꿔 쓰는 스킬. **아무도 선언하지 않는다**
 *    ③ extends 부모 1개 — 자식이 물려받겠다고 **선언**한 것 → 이미 Tier I-3 이 잡는다(여기 대상 아님)
 *    PR #239 는 ①과 ②를 동시에 건드렸다. ①만 보면 파일 10개 중 3개만 걸리고,
 *    정작 전 동료사 글을 바꾸는 7개를 놓친다.
 *
 * 🔴 판정에 쓸 명단을 «파일로 만들지 않는다». 모듈↔스킬 관계는 매번 grep 으로 다시 센다.
 *    적어 두면 그것도 손으로 유지하는 장부가 되어 언젠가 어긋나고, 어긋난 것을 아무도 모른다.
 *
 * 🔴 동료사 «이름»은 요구하지 않는다 — 이 레포는 PUBLIC 이고 Tier K 가 고객사명을 막는다.
 *    ②는 「몇 곳이 쓰는지」까지만 세고, 이름은 작성자가 자기 PC 설정을 보고 적게 안내한다.
 *
 * 🔴 라벨에 Tier 문자를 쓰지 않는다 — `check-plugin-consistency.js` 의 Tier A~L 은 그 파일 전용
 *    체계다. `check-skill-ownership.js` 가 같은 이유로 「소유권」이라는 제 이름을 쓴다.
 *
 * CI 전용이다. 로컬에서는 PR 본문을 알 수 없어 판정이 성립하지 않으므로 안내 후 통과한다.
 * 🔑 그래서 `check-plugin-consistency.js` 에 넣지 않고 파일을 분리했다 — 그 파일은
 *    team-guide.md 와 zulgap-make-skill 이 팀원에게 *"로컬에서 돌려 exit=0 이면 통과"* 로
 *    공표한 스크립트라, git·네트워크 의존을 섞으면 로컬에서 조용히 skip 되어 그 문장이 거짓이 된다.
 */

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');

// @AI:CONSTRAINT 축 ① 대상에서 `channels` 는 뺀다. 값 파일(동료사 설정)이라 자주 바뀌는데
//   11개 스킬이 걸려 있어, 매번 11개를 적으라 하면 사람이 대충 붙여넣게 되고
//   그 순간 이 게이트는 형식만 남고 뜻이 죽는다(2026-08-20 사장님 확정).
//   채널 때문에 실제로 사고가 나면 그때 넣는다.
const SHARED_EXCLUDE = new Set(['channels']);

const SHARED_RE = /^plugins\/[^/]+\/shared\/([^/]+)\//;
const SKILL_RE = /^plugins\/[^/]+\/skills\/([^/]+)\/(.+)$/;

function git(args) {
  return execFileSync('git', args, { encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 }).trim();
}

function read(p) {
  try { return fs.readFileSync(p, 'utf8'); } catch { return ''; }
}

/** 스킬 폴더 전수 — plugins/<팩>/skills/<이름> */
function allSkills() {
  const out = [];
  const plugins = path.join(ROOT, 'plugins');
  for (const pack of fs.readdirSync(plugins, { withFileTypes: true })) {
    if (!pack.isDirectory()) continue;
    const dir = path.join(plugins, pack.name, 'skills');
    if (!fs.existsSync(dir)) continue;
    for (const s of fs.readdirSync(dir, { withFileTypes: true })) {
      if (!s.isDirectory()) continue;
      out.push({ name: s.name, dir: path.join(dir, s.name) });
    }
  }
  return out;
}

/**
 * 이 공유 모듈을 «쓴다»고 볼 참조 형태 두 가지.
 *
 * @AI:FRAGILE 모듈 이름을 그냥 찾으면 «설명문»이 사용자로 잡힌다. 2026-08-20 실측:
 *   `zulgap-make-skill` 이 이 게이트를 설명하며 `shared/naver-format/` 를 예시로 적었는데
 *   사용자 5명 중 하나로 세어졌다(오탐). **게이트를 설명하는 문서가 게이트에 걸리는** 클래스로,
 *   같은 레포의 Tier I 가 이미 겪었다(그쪽 해법은 "frontmatter 안에서만 읽기" — 위치로 가름).
 * @AI:CONSTRAINT 여기서는 «형태»로 가른다 — 실사용은 둘 중 하나로 나타난다:
 *   ① 문서가 파일을 가리킬 때는 «저장소 기준 전체 경로»를 쓴다 (plugins/<팩>/shared/<모듈>)
 *   ② 코드가 부를 때는 require 의 상대경로에 shared/<모듈> 이 들어간다
 *   설명문은 `shared/<모듈>/` 처럼 «중간 토막»만 쓴다 → 둘 다 아니므로 빠진다.
 *   🔴 넓히지 말 것 — 중간 토막까지 세면 이 게이트를 문서로 설명하는 순간 그 문서가 사용자가 된다.
 */
function usesModule(text, moduleName) {
  const esc = moduleName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const fullPath = new RegExp(`plugins/[^/\\s]+/shared/${esc}\\b`);
  const requireRel = new RegExp(`require\\([^)]*shared/${esc}[^)]*\\)`);
  return fullPath.test(text) || requireRel.test(text);
}

/**
 * 이 공유 모듈을 쓰는 스킬을 «지금» 센다.
 * @AI:CONSTRAINT 명단 파일을 만들지 않는 것이 요지다 — 매번 다시 세야 낡지 않는다.
 */
function skillsUsing(moduleName, skills) {
  const hits = [];
  for (const { name, dir } of skills) {
    if (walkUses(dir, moduleName)) hits.push(name);
  }
  return hits.sort();
}

function walkUses(dir, moduleName) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (e.name === 'node_modules' || e.name.startsWith('.')) continue;
      if (walkUses(p, moduleName)) return true;
      continue;
    }
    // 바이너리·대용량은 건너뛴다 (판정은 텍스트 참조만 본다)
    if (!/\.(md|js|mjs|cjs|json|ya?ml|py|sh|txt)$/i.test(e.name)) continue;
    if (usesModule(read(p), moduleName)) return true;
  }
  return false;
}

/** frontmatter 에 preset_slots 가 있으면 «여러 동료사가 값만 바꿔 쓰는» 스킬이다. */
function hasPresetSlots(skillDir) {
  const raw = read(path.join(skillDir, 'SKILL.md'));
  const m = /^---\r?\n([\s\S]*?)\r?\n---/.exec(raw);
  if (!m) return false;
  return /^preset_slots:/m.test(m[1]);
}

/**
 * 본체인가 — channels/ 와 PROVENANCE.md 는 본체가 아니다.
 * @AI:DEPENDS check-skill-ownership.js 가 같은 기준(channels/ 제외)을 쓴다. 어긋나면
 *   같은 PR이 한 게이트엔 걸리고 다른 게이트엔 안 걸려 사람이 규칙을 못 배운다.
 */
function isSkillBody(rest) {
  if (rest.startsWith('channels/')) return false;
  if (rest === 'PROVENANCE.md') return false;
  return true;
}

function main() {
  const baseSha = process.env.BASE_SHA;
  const headSha = process.env.HEAD_SHA;
  const prBody = process.env.PR_BODY;

  if (!baseSha || !headSha || prBody === undefined) {
    console.log('ℹ [공유영향] CI 전용 게이트입니다 — PR 컨텍스트가 없어 건너뜁니다.');
    console.log('  이 검사는 GitHub Actions의 pull_request 이벤트에서만 판정할 수 있습니다.');
    return 0;
  }

  const changed = git(['diff', '--name-only', `${baseSha}...${headSha}`])
    .split('\n').map((s) => s.trim()).filter(Boolean);

  const body = String(prBody);
  const skills = allSkills();
  let fail = 0;

  // ── 축 ① 공유 부품 ────────────────────────────────────────────
  const touchedModules = new Set();
  for (const f of changed) {
    const m = SHARED_RE.exec(f);
    if (m && !SHARED_EXCLUDE.has(m[1])) touchedModules.add(m[1]);
  }

  for (const mod of [...touchedModules].sort()) {
    const users = skillsUsing(mod, skills);
    const missing = users.filter((u) => !body.includes(u));
    if (missing.length === 0) {
      console.log(`PASS [공유영향] shared/${mod} — 쓰는 스킬 ${users.length}개가 PR 본문에 있습니다.`);
      continue;
    }
    fail = 1;
    console.error(`  FAIL [공유영향] shared/${mod} 를 고쳤는데 영향 스킬이 PR 본문에 없습니다.`);
    console.error(`       이 ${users.length}개가 이 규칙을 씁니다 — 아래를 「영향 범위」에 붙여넣고`);
    console.error('       각각 어떻게 바뀌는지 한 줄씩 적어 주세요:');
    for (const u of users) console.error(`         - ${u}${body.includes(u) ? '  (이미 적혀 있음)' : ''}`);
    console.error(`       ※ 목록은 매번 다시 셉니다 — 어딘가 적어 두는 명단이 아닙니다.`);
  }

  // ── 축 ② 여러 동료사가 쓰는 스킬 ──────────────────────────────
  const touchedShared = new Set();
  for (const f of changed) {
    const m = SKILL_RE.exec(f);
    if (!m || !isSkillBody(m[2])) continue;
    const s = skills.find((x) => x.name === m[1]);
    if (s && hasPresetSlots(s.dir)) touchedShared.add(m[1]);
  }

  if (touchedShared.size > 0) {
    // @AI:INTENT 여기서는 「목록」을 못 요구한다 — 쓰는 주체가 동료사고, 그 이름은
    //   PUBLIC 레포에 적으면 안 된다(Tier K). 그래서 「영향 범위를 적었나」까지만 본다.
    //   섹션 하나를 쓰게 하는 것만으로도 사람이 「전부 바뀐다」를 인지하게 된다 — 실측 0/9가 근거다.
    const hasImpact = /영향\s*범위/.test(body);
    if (hasImpact) {
      console.log(`PASS [공유영향] 여러 동료사가 쓰는 스킬 ${touchedShared.size}개 — 「영향 범위」 서술이 있습니다.`);
    } else {
      fail = 1;
      console.error('  FAIL [공유영향] 여러 동료사가 «함께 쓰는» 스킬의 본체를 고쳤습니다:');
      for (const n of [...touchedShared].sort()) console.error(`         - ${n}`);
      console.error('       이 스킬들은 동료사마다 값만 바꿔 쓰므로, 본체를 고치면 «그 전부»가 바뀝니다.');
      console.error('       PR 본문에 「영향 범위」 항목을 만들어 무엇이 달라지는지 적어 주세요.');
      console.error('       🔴 동료사 «이름»은 적지 마세요 — 이 레포는 공개입니다(Tier K가 막습니다).');
      console.error('          "이 스킬을 쓰는 전 채널" 처럼 성격으로 쓰면 됩니다.');
    }
  }

  if (!fail && touchedModules.size === 0 && touchedShared.size === 0) {
    console.log('PASS [공유영향] 여러 곳이 함께 쓰는 것을 건드리지 않았습니다.');
  }
  return fail;
}

process.exit(main());
