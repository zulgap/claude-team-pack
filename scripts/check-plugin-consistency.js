#!/usr/bin/env node
// 플러그인 이름 집합 일치 결정론 체크 — packaging-spec §4 심사 ⑥
// @AI:INTENT 4장부 드리프트 재발 차단 (2026-07-22 정책 헌법 §7 — 구 3중 불일치 사고):
//   ① .claude-plugin/marketplace.json (정의 원본)
//   ② install.ps1 (윈도우 설치기)     ③ install.sh (맥/리눅스 설치기)
//   ④ hooks/hook-doctor-v2.js (기존 PC 자가치유 — install과 동일 매핑 필수)
// 검사 2단:
//   Tier A — 활성화 집합: ②③④가 활성화(true)하는 이름 집합 == (① − DEPRECATED)
//   Tier B — 레거시 잔존: DEPRECATED 이름 언급 라인은 비활성화/전환 패턴만 허용
//            (안내 문구·설치 명령에 구 이름이 남는 드리프트 차단 — install.ps1:297 실사례)
// 불일치 = exit 1 (CI/심사 게이트용). usage: node scripts/check-plugin-consistency.js
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
// @AI:CONSTRAINT 전환기 병존 플러그인 — marketplace에만 존재 허용. 제거 릴리스 때 이 목록에서도 삭제할 것
const DEPRECATED = ['zulgap'];
// 레거시 이름이 등장해도 되는 라인 패턴 (비활성화·존재확인·전환 코드)
const LEGACY_OK = /=\s*\$?false|!==?\s*true|hasOwnProperty|-contains|PSObject/;

const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');
// @AI:INTENT regex 1개 또는 배열 — 같은 파일이 활성화를 2가지 표현으로 쓸 수 있다(아래 hook-doctor-v2 주석)
const extract = (text, regexes) => {
  const out = new Set();
  for (const regex of [].concat(regexes)) {
    regex.lastIndex = 0; // @AI:FRAGILE /g 정규식 재사용 시 lastIndex가 남아 첫 매치를 건너뛴다
    let m;
    while ((m = regex.exec(text)) !== null) out.add(m[1]);
  }
  return out;
};

const marketplace = new Set(
  JSON.parse(read('.claude-plugin/marketplace.json')).plugins.map((p) => p.name)
);
const expected = new Set([...marketplace].filter((n) => !DEPRECATED.includes(n)));

// Tier A — 활성화 패턴만 추출
const sources = {
  'install.ps1': {
    text: read('install.ps1'),
    activation: /-NotePropertyName '([\w-]+)@zulgap-team-pack' -NotePropertyValue \$true/g,
    legacyMention: (dep) => new RegExp(`${dep}@zulgap-team-pack`),
  },
  'install.sh': {
    text: read('install.sh'),
    activation: /enabledPlugins\[["']([\w-]+)@zulgap-team-pack["']\]\s*=\s*true/g,
    legacyMention: (dep) => new RegExp(`${dep}@zulgap-team-pack`),
  },
  'hooks/hook-doctor-v2.js': {
    text: read('hooks/hook-doctor-v2.js'),
    // @AI:INTENT 활성화 표현이 2가지다 — 리터럴 키와 **변수 경유**.
    //   role 조건부(dev-pack)는 `const DEV_KEY = 'dev-pack@' + MP;` … `want[DEV_KEY] = true`
    //   형태라 리터럴 정규식에 안 걸린다. 2026-07-29 PR #53이 dev-pack을 조건부로 바꾼 뒤
    //   게이트가 이 표현을 못 읽어 [A 활성화]가 6개 PR 동안 적색 방치됐다(5인검증 P1 발견).
    //   → 코드가 아니라 게이트가 틀렸던 사례. 새 표현을 쓸 땐 여기 패턴도 같이 늘릴 것.
    activation: [
      /\['([\w-]+)@' \+ MP\]\s*(?::|=)\s*true/g,
      /const\s+\w+\s*=\s*'([\w-]+)@'\s*\+\s*MP\s*;/g,
    ],
    legacyMention: (dep) => new RegExp(`'${dep}@' \\+ MP|${dep}@zulgap-team-pack`),
  },
};

const fmt = (s) => [...s].sort().join(', ') || '(빈 집합)';
const same = (a, b) => a.size === b.size && [...a].every((x) => b.has(x));

let fail = 0;
console.log(`marketplace.json: {${fmt(marketplace)}} / 기대 활성화 집합(deprecated 제외): {${fmt(expected)}}`);

for (const d of DEPRECATED) {
  if (!marketplace.has(d)) {
    console.error(`  FAIL DEPRECATED '${d}'가 marketplace.json에 없음 — 제거 완료면 이 스크립트 DEPRECATED 목록에서도 삭제할 것`);
    fail = 1;
  }
}
if (expected.size === 0) {
  console.error('  FAIL 기대 집합이 비어 있음 — marketplace.json 파싱 실패 의심');
  fail = 1;
}

for (const [name, src] of Object.entries(sources)) {
  const act = extract(src.text, src.activation);
  if (same(act, expected)) console.log(`  PASS [A 활성화] ${name}: {${fmt(act)}}`);
  else { console.error(`  FAIL [A 활성화] ${name}: {${fmt(act)}} ≠ {${fmt(expected)}}`); fail = 1; }

  for (const dep of DEPRECATED) {
    const badLines = src.text.split(/\r?\n/)
      .map((line, i) => ({ line, no: i + 1 }))
      .filter(({ line }) => src.legacyMention(dep).test(line) && !LEGACY_OK.test(line));
    for (const { line, no } of badLines) {
      console.error(`  FAIL [B 레거시잔존] ${name}:${no} — '${dep}' 언급이 비활성화 패턴 아님: ${line.trim().slice(0, 80)}`);
      fail = 1;
    }
    if (badLines.length === 0) console.log(`  PASS [B 레거시잔존] ${name}: '${dep}' 잔존 드리프트 0`);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Tier C — 스킬 이름 규격 + 명령 충돌 (2026-07-26 신설)
// @AI:INTENT 한글 스킬 이름이 Claude Code 식별자에서 문자당 '-'로 붕괴해
//   `jedi-core:--` 4개가 겹치고 엉뚱한 스킬이 실행된 사고(팀원 실측). Tier A/B는
//   '플러그인' 이름만 봤고 '스킬' 이름은 아무도 안 봐서 그대로 통과했다.
// @AI:CONSTRAINT Agent Skills 표준 = kebab-case(소문자·숫자·하이픈, 문자로 시작).
//   비-ASCII는 명령 이름에서 소실되므로 여기서 fail-closed로 막는다.
// C-3(bare 충돌)은 사용자가 `/이름`을 접두 없이 칠 때 어느 스킬이 잡힐지가
//   플러그인 경계를 넘어 결정되기 때문에 — 플러그인별 검사만으론 못 잡는다.
const SKILL_NAME_RE = /^[a-z][a-z0-9]*(-[a-z0-9]+)*$/;
const pluginDirs = fs.readdirSync(path.join(ROOT, 'plugins'), { withFileTypes: true })
  .filter((d) => d.isDirectory())
  .map((d) => d.name);

// @AI:FRAGILE Tier C 전용 실패 플래그 — 전역 `fail`을 재사용하면 Tier A/B 실패까지 삼켜
//   'C-3 FAIL'과 'C PASS'가 동시에 찍힌다(자기검증에서 실제로 관측). 분리 유지할 것.
let failC = 0;
let skillCount = 0;
const allNames = new Map(); // bare name -> [plugin/dir, ...]
const skillFiles = []; // Tier D 재사용 — {where, raw}
for (const plug of pluginDirs) {
  const skillsDir = path.join(ROOT, 'plugins', plug, 'skills');
  if (!fs.existsSync(skillsDir)) continue;
  const perPlugin = new Map(); // bare name -> dir (플러그인 내 중복)
  for (const d of fs.readdirSync(skillsDir, { withFileTypes: true })) {
    if (!d.isDirectory()) continue;
    const md = path.join(skillsDir, d.name, 'SKILL.md');
    if (!fs.existsSync(md)) continue;
    // frontmatter name (없으면 디렉토리명이 명령이 된다 — 그 경우도 규격 대상)
    const raw = fs.readFileSync(md, 'utf8');
    const m = raw.match(/^name:[ \t]*(.+?)[ \t]*$/m);
    const name = m ? m[1] : d.name;
    const where = `${plug}/${d.name}`;
    skillCount += 1;
    skillFiles.push({ where, raw });

    // C-1 이름 규격
    if (!SKILL_NAME_RE.test(name)) {
      console.error(`  FAIL [C-1 이름규격] ${where}: name='${name}' — kebab-case(소문자·숫자·하이픈, 문자로 시작)만 허용. 비-ASCII는 명령에서 '-'로 소실된다`);
      failC = 1;
    }
    // C-4 폴더명 = name 일치 (2026-07-28 실사고: 스킬 중복 판정(dedup)은 frontmatter 치환 전
    //   폴더명 기반 ID에서 일어난다 — 한글 폴더는 문자당 '-'로 뭉개져 같은 글자수끼리 충돌, 하나만 생존)
    if (d.name !== name) {
      console.error(`  FAIL [C-4 폴더명불일치] ${where}: 폴더='${d.name}' vs name='${name}' — 폴더명을 name과 동일하게 바꿀 것`);
      failC = 1;
    }
    // C-2 플러그인 내 중복 (같은 plugin:name 이 둘)
    if (perPlugin.has(name)) {
      console.error(`  FAIL [C-2 플러그인내중복] ${plug}: name='${name}' 중복 — ${perPlugin.get(name)} vs ${d.name}`);
      failC = 1;
    }
    perPlugin.set(name, d.name);
    allNames.set(name, [...(allNames.get(name) || []), where]);
  }
}
// C-3 플러그인 간 bare 충돌 (`/name` 을 접두 없이 쳤을 때 어느 쪽이 잡힐지 불확정)
for (const [name, wheres] of allNames) {
  if (wheres.length > 1) {
    console.error(`  FAIL [C-3 bare충돌] name='${name}' 이 ${wheres.length}곳: ${wheres.join(', ')} — 접두 없는 /${name} 호출이 불확정`);
    failC = 1;
  }
}
if (skillCount === 0) {
  console.error('  FAIL [C] 스킬을 하나도 못 찾음 — plugins/*/skills 경로 파싱 실패 의심');
  failC = 1;
} else if (failC === 0) {
  console.log(`  PASS [C 스킬이름] ${skillCount}개 — 규격 위반 0 / 중복 0 / bare 충돌 0`);
}
if (failC) fail = 1;

// ─────────────────────────────────────────────────────────────────────────────
// Tier D — tier 선언 + shared 스킬 테넌트 리터럴(A급) 0건 (2026-07-30 신설)
// @AI:INTENT 5인검증 실측: 게이트가 보는 규칙은 12/12=100%, 사람 눈만 보는 규칙은 8%.
//   같은 repo·같은 사람·같은 문서인데 갈린 유일한 차이가 결정론 게이트였다.
//   packaging-spec §4①(본체 테넌트 리터럴 0)·§0(tier 면제 판정)은 그동안 검사 코드가
//   0줄이라 "1호 인증" 스킬 본인이 자기 인증 기준을 위반한 채 방치됐다.
// @AI:CONSTRAINT PROVENANCE.md는 §1이 지정한 **심사 grep 제외 구역**이라 검사 대상이 아니다
//   (skillFiles는 SKILL.md만 수집하므로 자동 제외). 근거·출처는 거기 두는 것이 정책이다.
const A_GRADE = [
  { label: '노션 page/DB ID', re: /\b[0-9a-f]{32}\b/g },
  { label: '테넌트 UUID', re: /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi },
  { label: 'UNC 공유폴더 경로', re: /\\\\[A-Za-z0-9._-]+\\/g },
  { label: '개인 PC 절대경로', re: /[A-Za-z]:\\Users\\/g },
];

let failD = 0;
let tenantOnlyHits = 0;
for (const { where, raw } of skillFiles) {
  const tm = raw.match(/^tier:[ \t]*(\S+)[ \t]*$/m);
  // D-1 tier 선언 필수 — 미선언은 "전용이라 면제"인지 "공용인데 미준수"인지 구분 불가(§0 판정 불능)
  if (!tm) {
    console.error(`  FAIL [D-1 tier미선언] ${where}: frontmatter에 'tier: shared' 또는 'tier: tenant-only' 한 줄 추가. 미선언 = shared 간주(fail-closed)`);
    failD = 1;
    continue;
  }
  const tier = tm[1];
  const hits = A_GRADE.flatMap(({ label, re }) => {
    re.lastIndex = 0;
    return (raw.match(re) || []).map(() => label);
  });
  if (!hits.length) continue;
  const summary = [...new Set(hits)].join(' · ');
  if (tier === 'shared') {
    // D-2 shared는 타사 배포 후보 — A급이 그대로 따라간다
    console.error(`  FAIL [D-2 A급리터럴] ${where} (tier: shared): ${hits.length}건 — ${summary}. 값은 채널 파일로, 인프라 설정은 teampack-config 경유, 근거는 PROVENANCE.md로`);
    failD = 1;
  } else {
    // @AI:INTENT tenant-only의 A급은 FAIL로 막지 않는다 — 노블냥 tenant 가드처럼 **격리 장치 자체**가
    //   A급인 경우가 있어 지우면 안 된다. 해법은 리터럴 제거가 아니라 "그 팩을 그 회사에만 활성화"다.
    //   지금 FAIL로 만들면 CI가 빨간불로 시작해 아무도 안 보게 된다(경보 피로).
    tenantOnlyHits += hits.length;
  }
}
if (failD === 0) {
  console.log(`  PASS [D tier·A급] ${skillFiles.length}개 — tier 미선언 0 / shared A급 리터럴 0`);
  if (tenantOnlyHits) {
    console.log(`       ℹ tenant-only 스킬의 A급 ${tenantOnlyHits}건은 정보성(FAIL 아님) — 해법은 리터럴 제거가 아니라 해당 테넌트 전용 활성화`);
  }
}
if (failD) fail = 1;

process.exit(fail);
