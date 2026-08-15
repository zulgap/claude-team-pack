#!/usr/bin/env node
// 플러그인·스킬 규격 결정론 체크 — packaging-spec §4 심사 ⑥⑦⑧⑨
// @AI:INTENT 4장부 드리프트 재발 차단 (2026-07-22 정책 헌법 §7 — 구 3중 불일치 사고):
//   ① .claude-plugin/marketplace.json (정의 원본)
//   ② install.ps1 (윈도우 설치기)     ③ install.sh (맥/리눅스 설치기)
//   ④ hooks/hook-doctor-v2.js (기존 PC 자가치유 — install과 동일 매핑 필수)
// 검사 목록 (신설 시 이 목록 + .github/workflows/plugin-consistency.yml + spec §4를 함께 갱신):
//   Tier A — 활성화 집합: ②③④가 활성화(true)하는 이름 집합 == (① − DEPRECATED)   [spec §4⑥]
//   Tier B — 레거시 잔존: DEPRECATED 이름 언급 라인은 비활성화/전환 패턴만 허용     [spec §4⑥]
//            (안내 문구·설치 명령에 구 이름이 남는 드리프트 차단 — install.ps1:297 실사례)
//   Tier C — 스킬 이름 규격(kebab-case·중복·bare 충돌·폴더명 일치)                 [spec §4⑦]
//   Tier D — tier 선언 + shared 스킬 A급 리터럴 0                                  [spec §4⑧]
//   Tier E — 형제 스킬 폴더명 하드코딩 0                                            [spec §4⑨]
//   Tier F — 실행 이식성: OS 종속 경로 · 번들 폰트 라이선스
//   Tier G — 되돌릴 수 없는 외부 행위를 스킬이 직접 호출하지 않는다
//   Tier H — 설치 stub 신선도: 갱신 안 가는 문서에 낡을 값(주기·간격 숫자) 0
//   Tier I — 스킬 상속: extends 실재성 · 본문만으로 따르는 선언 0 · 부모 변경 미반영 0 [spec §4⑩]
//   Tier J — 게이트↔문서 커버리지: 이 목록이 문서 3벌에 실렸나 (아래 «함께 갱신» 을 코드가 강제) [spec §4⑪]
// 🔴 개수("검사 N단")를 쓰지 않는다 — F·G 가 추가될 때 이 목록이 함께 갱신되지 않아
//    "5단"이 오래 거짓이었다(그 규칙을 적어둔 줄 바로 위에서 벌어졌다).
//    개수·범위 표기는 항목이 늘 때마다 낡으므로 목록만 유지한다.
// 불일치 = exit 1 (CI/심사 게이트용). usage: node scripts/check-plugin-consistency.js
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT = path.join(__dirname, '..');
// @AI:CONSTRAINT 전환기 병존 플러그인 — marketplace에만 존재 허용. 제거 릴리스 때 이 목록에서도 삭제할 것
const DEPRECATED = ['zulgap'];
// 레거시 이름이 등장해도 되는 라인 패턴 (비활성화·존재확인·전환 코드)
const LEGACY_OK = /=\s*\$?false|!==?\s*true|hasOwnProperty|-contains|PSObject/;

const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');
// @AI:FRAGILE frontmatter 값은 **맨 앞 `---` 블록 안에서만** 읽는다. `/^tier:/m` 처럼 파일 전체를
//   훑으면 **본문 코드블록의 예시가 실제 선언으로 잡힌다.** 2026-08-05 실측 2건:
//   ① extends — zulgap-make-skill 이 작성법 예시를 실었더니 그 스킬 자신이 FAIL 났다(오탐)
//   ② tier    — 같은 파일에서 frontmatter 의 tier 를 지워도 **D-1 이 못 잡았다**(미탐).
//               본문 예시 `tier: tenant-only` 가 대신 읽혔다 = §4⑧ 심사가 우회된다
//   그동안 무증상이었던 건 frontmatter 가 항상 파일 앞이라 **첫 매치가 우연히 진짜 값**이었기
//   때문이다. 그 필드가 frontmatter 에서 빠지는 순간 우연이 깨진다.
// @AI:CONSTRAINT YAML 인라인 주석을 반드시 벗긴다 — `extends: zulgap-blog  # 설명` 의 값은
//   `zulgap-blog` 다. 안 벗기면 주석까지 값으로 대조한다.
const fmValue = (raw, key) => {
  const block = (raw.match(/^---\r?\n([\s\S]*?)\r?\n---/) || [])[1];
  if (!block) return null;
  const m = block.match(new RegExp(`^${key}:[ \\t]*(.+?)[ \\t]*$`, 'm'));
  return m ? m[1].replace(/\s+#.*$/, '').trim() : null;
};
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

// Tier A — 「누가 팩 판정을 하는가」 검사 (2026-08-16 개편)
// @AI:INTENT 예전에는 3장부에서 **플러그인 이름 리터럴**을 정규식으로 뽑아 marketplace 와 대조했다.
//   그 설계 자체가 사고를 낳았다: 판정을 3벌로 유지하도록 게이트가 **강제**했고, 실제로 카드
//   `packs: []` 에서 3장부가 정반대 답을 내는 동안에도 10 Tier 가 전부 PASS 였다(P1 실측).
//   그리고 리터럴을 걷어내는 리팩터를 하면 게이트가 **빈 집합**을 보고 FAIL 했다(사고 #10).
// @AI:CONSTRAINT 🔴 이제 판정 SSOT 는 `resolve-packs.js` 하나다. 게이트가 볼 것은 두 가지다:
//   ① SSOT 의 규칙표가 marketplace 를 빠짐없이 덮는가 — 새 팩을 만들고 규칙에 안 넣으면
//      아무 장부도 그 팩을 몰라 키가 안 생기고 → opt-out 로드로 **전원에게 켜진다**
//   ② 3장부가 판정을 **다시 구현하고 있지 않은가** — 되살아나면 같은 사고가 재발한다
const RESOLVER = 'resolve-packs.js';
const resolver = require(path.join(ROOT, RESOLVER));
const resolverCovered = new Set([...resolver.BASE_PLUGINS, ...Object.keys(resolver.PLUGIN_RULES)]);

const LEDGERS = {
  'install.ps1': { revived: /-contains\s+'zulgap'|-notcontains\s+'zulgap'/ },
  'install.sh': { revived: /case\s+"\s*\$TENANT_PACKS|indexOf\('zulgap'\)/ },
  'hooks/hook-doctor-v2.js': { revived: /packs\.includes\('zulgap'\)|tenantPacksWithConfidence/ },
};
// @AI:CONSTRAINT 🔴 **주석은 빼고 본다.** 2026-08-16 mutation 에서 이 검사가 통과해버렸다 —
//   위임 코드를 지워도 주석에 적힌 'resolve-packs.js' 만 보고 PASS 했다. 게이트가 문서를 읽으면
//   코드가 사라진 것을 못 잡는다.
const CALLS_RESOLVER = /resolve-packs\.js/;
const stripComments = (text) => text.split(/\r?\n/).filter((l) => !/^\s*(#|\/\/)/.test(l)).join('\n');

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

// ① SSOT 규칙표 ↔ marketplace 1:1
if (same(resolverCovered, expected)) {
  console.log(`  PASS [A 판정SSOT] ${RESOLVER}: {${fmt(resolverCovered)}}`);
} else {
  console.error(`  FAIL [A 판정SSOT] ${RESOLVER}: {${fmt(resolverCovered)}} ≠ {${fmt(expected)}}`);
  console.error('       → marketplace 에 팩을 추가했으면 resolve-packs.js 의 PLUGIN_RULES 에도 넣을 것.');
  console.error('       → 안 넣으면 그 팩은 아무 장부도 몰라 키가 안 생기고 **전원에게 켜진다**(opt-out 로드).');
  fail = 1;
}

// ② 3장부가 SSOT 를 부르는가 / 옛 판정이 되살아났는가
for (const [name, rule] of Object.entries(LEDGERS)) {
  const text = read(name);
  if (CALLS_RESOLVER.test(stripComments(text))) console.log(`  PASS [A 위임] ${name}: 판정을 ${RESOLVER} 에 위임`);
  else { console.error(`  FAIL [A 위임] ${name}: ${RESOLVER} 를 부르지 않음 — 판정이 이 파일에 되살아났는지 확인`); fail = 1; }

  const revived = text.split(/\r?\n/)
    .map((line, i) => ({ line, no: i + 1 }))
    .filter(({ line }) => rule.revived.test(line) && !/^\s*(#|\/\/)/.test(line));
  for (const { line, no } of revived) {
    console.error(`  FAIL [A 판정중복] ${name}:${no} — 팩 판정이 되살아났다: ${line.trim().slice(0, 80)}`);
    fail = 1;
  }
  if (!revived.length) console.log(`  PASS [A 판정중복] ${name}: 자체 팩 판정 0`);

  for (const dep of DEPRECATED) {
    const badLines = text.split(/\r?\n/)
      .map((line, i) => ({ line, no: i + 1 }))
      .filter(({ line }) => new RegExp(`'${dep}@' \+ MP|${dep}@zulgap-team-pack`).test(line) && !LEGACY_OK.test(line));
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
// C-5 팩 접두사 — packaging-spec §4⑦ "권장"을 강제로 승격 (2026-08-02).
// @AI:INTENT 직원은 `/jedi`·`/zulgap` 까지 쳤을 때 뜨는 **목록에서 스킬을 찾는다**(team-guide.md).
//   접두사가 없으면 그 목록에 안 떠서, 게이트·CI가 전부 초록인데 **아무도 못 찾는 스킬**이 된다
//   (루트 `skills/` 사고와 같은 클래스 — 기술적으로 존재하나 실질 도달 0).
//   실사고: 2026-08-02 팀원 첫 PR #71이 `naver-rank-check` 로 올라왔고 CI는 통과했다.
//   규칙이 spec에 "권장"으로만 있어 아무도 못 잡았다 → 게이트로 승격.
// @AI:CONSTRAINT 화이트리스트 방식 — 맵에 **없는 팩은 면제**다. `dev-pack`(`start-dev`·`wrapup-dev`)은
//   접미사형이 의도이므로 등록하지 않는다. 전 팩 강제로 바꾸면 기존 2개가 즉시 FAIL 난다.
const PACK_PREFIX = {
  'jedi-core': 'jedi-',
  'zulgap-pack': 'zulgap-',
};
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
    const name = fmValue(raw, 'name') || d.name;
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
    // C-5 팩 접두사 (맵에 등록된 팩만 — 위 PACK_PREFIX 주석 참조)
    const wantPrefix = PACK_PREFIX[plug];
    if (wantPrefix && !name.startsWith(wantPrefix)) {
      console.error(`  FAIL [C-5 팩접두] ${where}: name='${name}' — '${plug}' 스킬은 '${wantPrefix}*' 로 시작해야 한다. 직원은 '/${wantPrefix.slice(0, -1)}' 까지 쳤을 때 뜨는 목록에서 스킬을 찾으므로, 접두사가 없으면 아무도 못 찾는다. 폴더명도 함께 바꿀 것(C-4)`);
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
  const tierVal = fmValue(raw, 'tier');
  const tm = tierVal ? [null, tierVal] : null;
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

// ─────────────────────────────────────────────────────────────────────────────
// Tier E — 형제 스킬 폴더명 하드코딩 금지 (2026-07-30 신설)
// @AI:INTENT v2.20(#62)이 고친 실사고: 썸네일 SKILL.md가 업로드 도구를 `../이미지/`로
//   가리켰다. 같은 스킬의 폴더명이 팀팩='jedi-image' / 개인='이미지'로 달라서, 관리자
//   PC에선 동작하고 **직원 PC에선 파일을 못 찾아 실패**했다. 증상이 "인물 사진을 올리면
//   안 된다"였고 게이트·테스트·CI 어디에도 걸리지 않아 사람이 발견할 때까지 남아 있었다.
// @AI:CONSTRAINT 판정은 "참조한 파일이 존재하나"가 아니라 **"폴더명이 고정으로 박혔나"**다.
//   전자는 형제 폴더를 정당하게 가리키는 문장(#62의 수정 결과)까지 위반으로 잡는다
//   — 실측 오탐 1/12. 후자는 구조 판정이라 결정론 100%·오탐 0이다.
// @AI:DEPENDS `<...>` 플레이스홀더는 통과시킨다 — #62가 제시한 올바른 작성법이
//   `../<이미지 스킬 폴더>/scripts/upload-image.mjs` 형태이므로, 이걸 막으면 정답이 FAIL된다.
// @AI:FRAGILE `(?<!\.\.\/)` 룩비하인드가 **필수**다 (v2.24 추가). 없으면 정규식이 `../..`를
//   한 덩어리로 삼켜 **`..` 개수의 홀짝에 따라 결과가 뒤집힌다** — 실측: 2단 `../../docs/` PASS /
//   3단 `../../../docs/` FAIL / 4단 PASS / 5단 FAIL. 게다가 3단에서 FAIL 메시지가
//   **파일에 존재하지 않는 `../docs/`** 를 보고해 개발자가 grep해도 못 찾았다(자력 해결 불가).
// @AI:CONSTRAINT 대안 `(?<![.\/])` 를 쓰면 **안 된다** — 실사고 원문
//   `node <이 스킬 폴더>/../<이미지 스킬 폴더>/…` 의 `../`는 `/`에 선행되므로 그 룩비하인드가
//   실패해 **역사적 사고 자체를 놓친다**(실측 7/7 → 6/7). 배제 대상은 `../` 앞의 `../` 뿐이다.
// @AI:DEPENDS ALLOW = 형제 '스킬'이 아닌 **일반 디렉토리** 이름. 코드 예시(`require('../shared/x')`)·
//   문서 링크(`../docs/`)·이미지(`../assets/`)가 SKILL.md에 정당하게 등장한다(실측 오탐 6종).
//   🔴 스킬 폴더 이름이 이 목록과 같아지면 **그 스킬은 조용히 면제된다** — 그때는 목록에서 지울 것.
//   현행 12개(`jedi-*`·`zulgap-*`·`start-dev`·`wrapup-dev`)와 충돌 0.
const SIBLING_HARDCODE_RE = /(?<!\.\.\/)\.\.\/([^/\s`)"'<>|]+)\//g;
const SIBLING_ALLOW = new Set(['docs', 'assets', 'scripts', 'lib', 'shared', 'channels',
  'templates', 'references', 'src', 'test', 'tests', 'img', 'images', 'dist', 'build', 'node_modules']);
let failE = 0;
for (const { where, raw } of skillFiles) {
  // @AI:INTENT 줄 단위로 도는 이유 = FAIL에 **줄번호와 원문**을 실어야 한다. 전체 문자열로 돌리면
  //   재구성한 `../X/` 만 보여주게 되고, 그 문자열이 파일에 없는 경우(위 홀짝 사고) 추적이 끊긴다.
  const bad = [];
  raw.split(/\r?\n/).forEach((line, i) => {
    SIBLING_HARDCODE_RE.lastIndex = 0;
    let m;
    while ((m = SIBLING_HARDCODE_RE.exec(line)) !== null) {
      const name = m[1];
      if (name === '.' || name === '..') continue;            // ../../ = 형제 아님(2단 이상)
      if (SIBLING_ALLOW.has(name.toLowerCase())) continue;    // 일반 디렉토리
      bad.push({ no: i + 1, name, line: line.trim().slice(0, 80) });
    }
  });
  if (bad.length) {
    for (const { no, name, line } of bad) {
      console.error(`  FAIL [E 형제폴더하드코딩] ${where}:${no} — \`../${name}/\` : ${line}`);
    }
    console.error(`       스킬 폴더명은 설치 형태마다 다르다(팀팩 'jedi-image' vs 개인 '이미지'). 고정 이름을 박으면 한쪽에서 깨진다 — \`../<이미지 스킬 폴더>/\` 처럼 플레이스홀더를 쓰고 "형제 폴더를 확인하고 실제 이름을 쓸 것"을 함께 적을 것`);
    failE = 1;
  }
}
if (failE === 0) {
  console.log(`  PASS [E 형제폴더] ${skillFiles.length}개 — 폴더명 하드코딩 0`);
}
if (failE) fail = 1;

// ─────────────────────────────────────────────────────────────────────────────
// Tier F — 실행 이식성: OS 종속 경로 · 번들 폰트 라이선스 (2026-08-03 신설)
// @AI:INTENT Tier A~E는 전부 SKILL.md만 본다(skillFiles = SKILL.md 수집). 그런데 팀원 PC에서
//   실제로 죽는 코드는 scripts/ 안에 있다. 2026-08-03 실측 — 아래 3건이 CI(A~E)·node --check·
//   문서 리뷰를 **전부 통과한 뒤** e2e 실행에서야 드러났다:
//     · noblenyang  'C:/Windows/Fonts/malgunbd.ttf' 를 copyFileSync → macOS/Linux 는 그 줄에서 즉사
//     · cardnews    로고 세리프 'C:/Windows/Fonts/times.ttf' 를 존재확인 없이 open → 동일
//     · cardnews    폰트 759KB 번들 + OFL 사본 0건 (레포가 public 이라 커밋 자체가 재배포)
//   §1 4등급표로는 안 잡힌다 — 'A급 개인 PC 절대경로'는 `C:\Users\` 패턴이고, `C:/Windows/` 는
//   개인 경로가 아니다. 즉 **규정에 없던 실패 클래스**다.
// @AI:CONSTRAINT 판정은 "Windows 경로를 썼나"가 아니라 **"대안 경로를 갖췄나"** 다.
//   전자는 정당한 후보 배열(resolve-font.js 의 SERIF/FONT_CANDIDATES)까지 FAIL 시켜 정답이 막힌다.
//   후자는 구조 판정이라 오탐이 없고, 고치는 방향("후보를 추가하라")이 메시지 자체에 들어 있다.
// @AI:DEPENDS 따옴표로 시작하는 리터럴만 본다 — 주석 산문에 등장하는 경로 설명까지 잡으면
//   이 파일의 @AI 주석들이 스스로 FAIL 을 낸다.
const OS_PATH_FAMILIES = [
  { os: 'Windows', re: /['"`][A-Za-z]:[\\/](?:Windows|Program Files(?: \(x86\))?)[\\/]/g },
  { os: 'macOS', re: /['"`]\/(?:System|Library|Applications)\//g },
  { os: 'Linux', re: /['"`]\/(?:usr|etc|opt)\//g },
];
const PORTABLE_EXEMPT = /@AI:ALLOW[ \t]+os-specific-path/;
const CODE_EXT = /\.(js|mjs|cjs|py|ps1|sh)$/i;
const FONT_EXT = /\.(ttf|otf|ttc|woff2?)$/i;
const LICENSE_NAME = /^(ofl|license|licence|copying|notice)(\.(txt|md))?$/i;

function walkFiles(dir, out = []) {
  for (const d of fs.readdirSync(dir, { withFileTypes: true })) {
    if (d.name === 'node_modules' || d.name === '__pycache__' || d.name.startsWith('.')) continue;
    const p = path.join(dir, d.name);
    if (d.isDirectory()) walkFiles(p, out);
    else out.push(p);
  }
  return out;
}

let failF = 0;
for (const plug of pluginDirs) {
  const skillsDir = path.join(ROOT, 'plugins', plug, 'skills');
  if (!fs.existsSync(skillsDir)) continue;
  for (const d of fs.readdirSync(skillsDir, { withFileTypes: true })) {
    if (!d.isDirectory()) continue;
    const skillDir = path.join(skillsDir, d.name);
    const where = `${plug}/${d.name}`;
    const files = walkFiles(skillDir);

    // F-1 OS 종속 경로가 단일 계열뿐 = 그 OS 밖에서는 반드시 죽는다
    for (const f of files.filter((f) => CODE_EXT.test(f))) {
      const src = fs.readFileSync(f, 'utf8');
      if (PORTABLE_EXEMPT.test(src)) continue;
      const found = OS_PATH_FAMILIES.filter(({ re }) => {
        re.lastIndex = 0;
        return re.test(src);
      }).map(({ os }) => os);
      if (found.length !== 1) continue; // 0 = 무관 / 2+ = 후보 탐색 구조
      const rel = path.relative(skillDir, f).split(path.sep).join('/');
      const lines = [];
      src.split(/\r?\n/).forEach((line, i) => {
        for (const { re } of OS_PATH_FAMILIES) {
          re.lastIndex = 0;
          if (re.test(line)) lines.push(`${i + 1}: ${line.trim().slice(0, 88)}`);
        }
      });
      console.error(`  FAIL [F-1 OS종속경로] ${where}/${rel} — ${found[0]} 경로만 있고 대안이 없다`);
      lines.slice(0, 3).forEach((l) => console.error(`         ${l}`));
      console.error(`       다른 OS 에서는 이 줄에서 죽는다. 후보 배열로 바꿔 존재하는 첫 경로를 고르고,`);
      console.error(`       하나도 없으면 안내와 함께 실패시킬 것 (예: zulgap-noblenyang/scripts/resolve-font.js).`);
      console.error(`       의도적으로 그 OS 전용이면 주석에 '@AI:ALLOW os-specific-path' 를 남길 것`);
      failF = 1;
    }

    // F-2 폰트 번들에는 라이선스 사본이 따라와야 한다 (레포 public = 커밋이 곧 재배포)
    const fonts = files.filter((f) => FONT_EXT.test(f));
    for (const f of fonts) {
      const dir = path.dirname(f);
      const hasLicense = fs
        .readdirSync(dir)
        .some((n) => LICENSE_NAME.test(n));
      if (hasLicense) continue;
      const rel = path.relative(skillDir, f).split(path.sep).join('/');
      console.error(`  FAIL [F-2 폰트라이선스] ${where}/${rel} — 같은 폴더에 라이선스 사본이 없다`);
      console.error(`       이 레포는 public 이라 커밋이 곧 재배포다. OFL·Apache 등 대부분의 무료 폰트가`);
      console.error(`       라이선스 사본 동봉을 재배포 조건으로 요구한다. 배포처의 OFL.txt 원문을 같은 폴더에 넣을 것`);
      console.error(`       (저작권 표기 대조: TTFont(f)['name'].getDebugName(0) / getDebugName(14))`);
      failF = 1;
    }
  }
}
if (failF === 0) {
  console.log(`  PASS [F 이식성] OS 종속 단일경로 0 / 라이선스 없는 번들 폰트 0`);
}
if (failF) fail = 1;

// ─────────────────────────────────────────────────────────────────────────────
// Tier G — 되돌릴 수 없는 외부 행위는 스킬이 직접 호출하지 않는다 (2026-08-05 신설)
// @AI:INTENT 국세청에 도달한 세금계산서는 팝빌이 아니라 **국세청 제도상** 취소가 없다
//   (수정세금계산서 마이너스 상계만 가능하고 거래처에도 이력이 보인다). 그래서 그 4종은
//   백엔드에서 MCP 표면·파사드·비대화 경로를 전부 봉인하고 **텔레그램 인라인버튼(사람 클릭)**
//   하나만 남겼다. 스킬이 그 도구를 부르라고 적으면 봉인을 문서로 우회하는 셈이 된다.
// @AI:CONSTRAINT 🔴 게이트 문형을 "zulgap-tax-invoice 가 부르지 마"(이번 병만)가 아니라
//   **"어떤 팀팩 스킬도 되돌릴 수 없는 도구를 호출 지시하지 않는다"**(다음 병까지)로 둔다.
//   비용은 같고 수명이 다르다 — 미래에 다른 스킬이 같은 실수를 해도 여기서 걸린다.
// @AI:DEPENDS 판정은 **호출 형태**만 본다(`도구명(` 또는 `도구명({`). 산문 언급까지 잡으면
//   "이 스킬은 발행하지 않는다"고 설명하는 정직한 문서가 스스로 FAIL 한다(Tier F 가 같은
//   이유로 따옴표 리터럴만 보는 것과 동형). 옳은 문서를 신고하는 게이트는 다음 사람이 우회한다.
const IRREVERSIBLE_TOOLS = [
  'issue_tax_invoice',
  'send_tax_invoice_to_nts',
  'cancel_tax_invoice',
  'issue_modified_tax_invoice',
];
// 경계를 명시해야 하는 스킬 — 값은 "그 스킬이 반드시 담아야 할 리터럴"
const BOUNDARY_REQUIRED = {
  'zulgap-tax-invoice': '발행하지 않는다',
};

let failG = 0;
for (const { where, raw } of skillFiles) {
  for (const tool of IRREVERSIBLE_TOOLS) {
    // 호출 형태: `foo(` / `foo({` / `mcp__jedi__foo(` — 공백 허용
    const callRe = new RegExp(`(?:mcp__[a-z_]+__)?${tool}\\s*\\(`, 'g');
    const hits = raw.match(callRe);
    if (!hits) continue;
    console.error(`  FAIL [G-1 되돌릴수없음] ${where} — '${tool}' 호출 지시 ${hits.length}건`);
    console.error(`       국세청 도달은 되돌릴 수 없어 **텔레그램 인라인버튼(사람 클릭)** 전용이다.`);
    console.error(`       스킬은 발행 직전까지만 준비하고 멈춘다. 산문으로 언급하는 것은 허용되나`);
    console.error(`       호출 형태(도구명 + 괄호)로 적으면 봉인을 문서가 우회하는 셈이 된다.`);
    failG = 1;
  }
}
// G-2 경계를 다루는 스킬은 그 경계를 문서에 명시해야 한다 — 다음 사람이 지우면 여기서 걸린다
for (const [skillName, literal] of Object.entries(BOUNDARY_REQUIRED)) {
  const hit = skillFiles.find(({ where }) => where.endsWith(`/${skillName}`));
  if (!hit) continue; // 스킬이 없으면 검사 대상 아님(삭제는 정당할 수 있다)
  if (hit.raw.includes(literal)) continue;
  console.error(`  FAIL [G-2 경계명시] ${hit.where} — '${literal}' 문구가 없다`);
  console.error(`       이 스킬의 존재 이유가 "준비까지만 하고 발행하지 않는다"는 경계다.`);
  console.error(`       문구가 사라지면 다음 사람이 경계를 모른 채 발행 절차를 덧붙인다.`);
  failG = 1;
}
if (failG === 0) {
  console.log(`  PASS [G 되돌릴수없음] ${skillFiles.length}개 — 호출 지시 0 / 경계 명시 ${Object.keys(BOUNDARY_REQUIRED).length}건 충족`);
}
if (failG) fail = 1;

// ── Tier H: 설치 stub 신선도 ────────────────────────────────────────────────
// @AI:INTENT team-CLAUDE*.md 는 설치 때 팀원 PC 로 한 번 복사되고 **그 뒤로 갱신되지 않는다**
//   (원격 fetch 대상은 team-guide.md 뿐이고, stub 은 신규 설치자만 새로 받는다).
//   그래서 여기에 "24시간마다 자동" 같은 구현 세부 숫자를 쓰면, 그 주기가 바뀌는 순간
//   기존 직원 PC 에 **고칠 방법이 없는 거짓말**로 영구히 남는다.
//   실제로 갱신 판정축을 시계(24h) → 원격 SHA 비교로 바꾸는 작업이 예정돼 있었다.
// @AI:CONSTRAINT 정확한 주기·간격이 필요하면 team-guide.md(매 세션 원격 최신본)에 쓸 것.
//   stub 에는 "자동입니다" 처럼 값이 바뀌어도 안 낡는 표현만 남긴다.
const STUB_FILES = ['team-CLAUDE.md', 'team-CLAUDE-en.md'];
// 날짜(2026-08-05)·버전(v2.29)·개수(3개)는 잡지 않는다 — "N단위 마다/뒤/후" 주기 표현만 본다
const STALE_VALUE_RE = /[0-9]+\s*(?:시간|분|초|일|주)\s*(?:마다|뒤|후|간격)|every\s+[0-9]+\s*(?:h\b|hours?|min\b|minutes?|days?)|after\s+[0-9]+\s*(?:hours?|minutes?|days?)/i;
let failH = 0;
for (const f of STUB_FILES) {
  const p = path.join(ROOT, f);
  if (!fs.existsSync(p)) continue;
  const lines = fs.readFileSync(p, 'utf8').split(/\r?\n/);
  lines.forEach((line, i) => {
    const m = line.match(STALE_VALUE_RE);
    if (!m) return;
    console.error(`  FAIL [H stub신선도] ${f}:${i + 1} — '${m[0].trim()}' 는 언젠가 바뀔 값이다`);
    console.error(`       이 파일은 설치 후 갱신되지 않아, 값이 바뀌면 기존 직원 PC 에 거짓말로 남는다.`);
    console.error(`       주기·간격은 team-guide.md(매 세션 원격 최신본)에 쓰고, 여기엔 "자동입니다" 처럼 안 낡는 표현만 남길 것`);
    console.error(`       줄: ${line.trim().slice(0, 90)}`);
    failH = 1;
  });
}
if (failH === 0) {
  console.log(`  PASS [H stub신선도] ${STUB_FILES.length}개 — 낡을 값(주기·간격 숫자) 0`);
}
if (failH) fail = 1;

// ── Tier I: 스킬 상속 선언 ──────────────────────────────────────────────────
// @AI:INTENT 2026-08-04 실사고: `zulgap-blog`에 이미지 기준(최소5·권장10~14·도식40%)을
//   넣었는데 그 규칙을 따르는 `zulgap-gaon-blog`가 안 따라왔다. **우연히 발견됐고 게이트가
//   잡은 게 아니다.** 원인은 상속 관계가 본문 자연어("범용 블로그 스킬의 시각물 단계를
//   따른다")로만 있어 기계가 관계를 몰랐던 것. frontmatter `extends:`로 구조화해 선언하게
//   하면 "이 정본을 고치면 누가 영향받나"가 결정론으로 답해진다.
// @AI:CONSTRAINT I-2 판정식을 넓히지 말 것. 2026-08-05 전수 실측에서 넓은 판정
//   (`/스킬명` + 따른다|그대로)은 `jedi-skills` L19 *"그 목록 … 그대로 쓰면"* 을 오탐했다.
//   상속은 **무엇을** 따르는지가 있고(단계·규칙·기준), 일반 서술에는 없다 — 그래서
//   목적어를 요구한다. 자기참조 제외와 함께 두 조건일 때 23스킬 오탐 0 / 정탐 1(gaon).
//   🔴 오탐이 1건이라도 실제 보고되면 차단을 경고로 강등하고 판정식을 재산정할 것.
// @AI:DEPENDS 스킬 이름 = 폴더명이라는 전제는 Tier C-4가 강제한다. C-4가 사라지면
//   여기 `where.split('/').pop()`도 같이 깨진다.
// @AI:INTENT I-3의 판정값 — **사람이 지어낼 수 없는 값**이어야 한다. 초안은 `parent-reviewed: 날짜`
//   였는데 그건 아무 값이나 쓸 수 있어 "확인했다"는 자기 서명일 뿐이고, 게이트는 시간이 지나면
//   습관적으로 통과된다(이 레포 실측: 규칙을 주석으로만 두면 9곳 중 1곳만 지킨다).
//   git blob sha 를 쓰면 정확한 값을 넣어야만 통과하고, 그 값은 부모 파일을 봐야 얻는다.
// @AI:CONSTRAINT LF 정규화가 **필수**다. 워킹트리가 CRLF 로 체크아웃되면 바이트 수가 달라져
//   git 이 계산한 값과 어긋난다(실측: 19,285 vs 19,003 바이트 → 완전히 다른 sha).
//   정규화하면 `git hash-object <파일>` 앞 8자와 정확히 일치하므로 사람이 독립 검증할 수 있다.
const blobSha8 = (text) => {
  const lf = Buffer.from(String(text).replace(/\r\n/g, '\n'), 'utf8');
  return crypto.createHash('sha1').update(`blob ${lf.length}\0`).update(lf).digest('hex').slice(0, 8);
};
const skillNames = new Set(skillFiles.map(({ where }) => where.split('/').pop()));
// 상속 선언 문형 — 목적어(무엇을) 필수. 이게 오탐 차단의 핵심이다.
const INHERIT_RE = /(단계|규칙|기준|규격|절차|방식)를?\s*(그대로\s*)?(따른다|준수)/;
const SKILL_REF_RE = /\/((?:zulgap|jedi)-[a-z0-9-]+)/g;
let failI = 0;
let inheritPairs = 0;
for (const { where, raw } of skillFiles) {
  const self = where.split('/').pop();
  const parent = fmValue(raw, 'extends');

  if (parent) {
    inheritPairs += 1;
    if (parent === self) {
      console.error(`  FAIL [I-1 상속대상] ${where}: extends='${parent}' — 자기 자신은 부모가 될 수 없다`);
      failI = 1;
      continue;
    }
    const parentEntry = skillFiles.find(({ where: w }) => w.endsWith(`/${parent}`));
    if (!parentEntry) {
      console.error(`  FAIL [I-1 상속대상] ${where}: extends='${parent}' — 그런 스킬이 없다`);
      console.error(`       오타이거나, 부모가 이름이 바뀌었거나 삭제됐다.`);
      console.error(`       확인: git log --follow -- plugins/*/skills/${parent}/SKILL.md`);
      console.error(`       해소 = ①올바른 이름으로 수정 ②extends 제거(독립 선언) ③이 스킬도 삭제`);
      failI = 1;
      continue;
    }
    // I-3 — 부모가 확인 이후 바뀌었나
    const want = blobSha8(parentEntry.raw);
    const gotRaw = fmValue(raw, 'parent-checksum');
    const got = /^[0-9a-f]{8}$/.test(gotRaw || '') ? gotRaw : undefined;
    if (got !== want) {
      console.error(`  FAIL [I-3 부모변경] ${where}: ${parent}가 마지막 확인 이후 바뀌었다`);
      console.error(`       기록된 값 ${got || '(없음)'} → 현재 값 ${want}`);
      console.error(`       ${parent}의 변경이 이 스킬에도 반영돼야 하는지 확인한 뒤,`);
      console.error(`       frontmatter를 'parent-checksum: ${want}' 로 갱신할 것`);
      console.error(`       (부모 원문: plugins/${parentEntry.where}/SKILL.md · 대조: git hash-object 그 파일)`);
      failI = 1;
    }
    continue; // 선언이 있으면 I-2는 볼 필요가 없다
  }

  // I-2 — 본문만으로 따르는 선언 (frontmatter 미선언)
  for (const line of raw.split(/\r?\n/)) {
    if (!INHERIT_RE.test(line)) continue;
    SKILL_REF_RE.lastIndex = 0; // @AI:FRAGILE /g 재사용 시 lastIndex가 남아 첫 매치를 건너뛴다
    let r;
    while ((r = SKILL_REF_RE.exec(line)) !== null) {
      const ref = r[1];
      if (ref === self) continue;          // 자기 이름을 본문에 쓰는 것은 일반적이다
      if (!skillNames.has(ref)) continue;  // 실재하는 스킬만 상속 후보
      console.error(`  FAIL [I-2 선언누락] ${where}: 본문이 '/${ref}'의 규칙을 따른다고 하는데 frontmatter에 extends가 없다`);
      console.error(`       frontmatter에 'extends: ${ref}' 를 추가할 것 — 그래야 ${ref}를 고칠 때 이 스킬이 함께 검토된다`);
      console.error(`       줄: ${line.trim().slice(0, 90)}`);
      failI = 1;
    }
  }
}
if (failI === 0) {
  // 쌍 수를 항상 출력한다 — 조용히 0이 되거나 급증하는 것을 사람이 볼 수 있게(dead gate 방지)
  console.log(`  PASS [I 상속] ${skillFiles.length}개 — 선언 ${inheritPairs}쌍 / 고아 0 / 미선언 0`);
}
if (failI) fail = 1;

// ── Tier J: 게이트↔문서 커버리지 ────────────────────────────────────────────
// @AI:INTENT 2026-08-05 실사고: Tier F(08-03)·G·H·I(08-05)가 신설됐는데 그것을 **설명하는
//   문서 3벌**이 따라오지 않았다. 실측 — 정본은 B·G·H 누락, 만드는 쪽은 A·B·F·G·H 누락,
//   검토하는 쪽은 F·G·H·I 누락. 셋이 서로 다르게 빠져 있었다.
//   이 파일 상단 주석이 *"신설 시 이 목록 + workflow + spec §4를 함께 갱신"* 이라고 **이미
//   적어 뒀는데도** 벌어졌다. 규칙을 글로만 두면 이 레포 실측으로 8%만 지켜진다(spec §4).
//   그래서 «검사가 늘면 안내도 함께 는다»를 사람 기억이 아니라 여기서 강제한다.
// @AI:CONSTRAINT TIERS 가 Tier 목록의 SSOT다. 새 Tier 를 구현하면 **여기 먼저** 추가한다.
//   J-0 이 이 표를 ①실제 출력 라벨 ②파일 상단 주석 목록 과 3자 대조하므로 어느 하나만
//   고치면 그 자리에서 걸린다. 손으로 유지하는 두 번째 장부가 되지 않는 이유가 이 대조다.
// @AI:CONSTRAINT 🔴 판정에 `\b` 를 쓰지 말 것. 문서가 한국어라 `Tier C·D·E`(중점)·`Tier H가`
//   (조사) 처럼 **멀티바이트가 뒤에 붙는다**. 2026-08-05 실측에서 `grep -E "Tier C\b"` 가
//   그 둘을 통째로 미탐했다. 그래서 「영숫자가 아닌 것」으로 경계를 잡는다.
// @AI:INTENT 이 검사가 재는 것은 **«완전 누락»뿐이고 설명 품질이 아니다.** 한 번만 적고
//   부실하게 쓴 것은 사람이 리뷰에서 본다. 기계가 품질까지 재려 들면 판정식이 복잡해지고
//   오탐이 늘어 다음 사람이 게이트를 우회한다(Tier E·F·G 가 전부 구조 판정으로 수렴한 이유).
const TIERS = {
  A: '활성화집합', B: '레거시잔존', C: '스킬이름', D: 'tier·A급', E: '형제폴더명',
  F: '이식성', G: '되돌릴수없음', H: 'stub신선도', I: '상속', J: '문서커버리지',
};
// 이 게이트를 «설명하는» 문서. 늘어나면 여기 1줄 추가한다(부재 = FAIL 이라 조용히 빠지지 않는다).
const TIER_DOCS = [
  { path: 'docs/skill-packaging-spec.md', role: '심사 정본', group: 'canon' },
  { path: 'plugins/zulgap-pack/skills/zulgap-make-skill/SKILL.md', role: '만드는 쪽', group: 'delivery' },
  { path: 'plugins/zulgap-pack/skills/zulgap-pr-review/SKILL.md', role: '검토하는 쪽', group: 'delivery' },
];
const mentionsTier = (text, t) =>
  new RegExp(`Tier ${t}(?![A-Za-z0-9])`).test(text) ||
  new RegExp(`(?<![A-Za-z0-9])${t}-[0-9]`).test(text);

let failJ = 0;
const tierKeys = Object.keys(TIERS);
const selfSrc = fs.readFileSync(__filename, 'utf8');

// J-0 — SSOT 무결성: TIERS == 실제 출력 라벨 == 상단 주석 목록
{
  const uniq = (re) => [...new Set([...selfSrc.matchAll(re)].map((m) => m[1]))].sort();
  const fromLabels = uniq(/(?:PASS|FAIL) \[([A-Z])[ -]/g);
  const fromComment = uniq(/^\/\/ {3}Tier ([A-Z]) — /gm);
  const eq = (a, b) => a.join('') === b.join('');
  if (fromLabels.length === 0 || fromComment.length === 0) {
    // fail-closed — 추출이 0이면 «깨끗함»이 아니라 «판정 불가»다
    console.error(`  FAIL [J-0 목록무결성] Tier 추출 0건 (라벨 ${fromLabels.length} / 주석 ${fromComment.length})`);
    console.error(`       출력 라벨이나 상단 주석의 형식이 바뀌었다. 이 검사가 조용히 통과하지 않도록 FAIL 한다`);
    failJ = 1;
  } else if (!eq(tierKeys, fromLabels) || !eq(tierKeys, fromComment)) {
    console.error(`  FAIL [J-0 목록무결성] TIERS 와 실제가 어긋난다`);
    console.error(`       TIERS  : ${tierKeys.join(' ')}`);
    console.error(`       출력라벨: ${fromLabels.join(' ')}`);
    console.error(`       상단주석: ${fromComment.join(' ')}`);
    console.error(`       Tier 를 구현했으면 TIERS·라벨·주석 목록 셋을 모두 맞출 것`);
    failJ = 1;
  }
}

// J-1 / J-2 — 문서가 각 Tier 를 «언급이라도» 하는가
if (failJ === 0) {
  const read = (p) => {
    const abs = path.join(ROOT, p);
    return fs.existsSync(abs) ? fs.readFileSync(abs, 'utf8') : null;
  };
  const missingIn = (texts) => tierKeys.filter((t) => !texts.some((x) => mentionsTier(x, t)));

  for (const doc of TIER_DOCS.filter((d) => d.group === 'canon')) {
    const body = read(doc.path);
    if (body === null) {
      console.error(`  FAIL [J-1 정본커버리지] ${doc.path} 가 없다 — 파일 부재는 통과가 아니다`);
      failJ = 1;
      continue;
    }
    const miss = missingIn([body]);
    if (miss.length) {
      console.error(`  FAIL [J-1 정본커버리지] ${doc.path}(${doc.role}) — 누락: ${miss.join(' ')}`);
      console.error(`       심사 정본은 게이트가 검사하는 Tier 를 **전부** 실어야 한다.`);
      console.error(`       각 Tier 를 'Tier X' 또는 'X-1' 형태로 §4 표에 추가할 것`);
      failJ = 1;
    }
  }

  const delivery = TIER_DOCS.filter((d) => d.group === 'delivery');
  const bodies = delivery.map((d) => ({ ...d, body: read(d.path) }));
  const gone = bodies.filter((d) => d.body === null);
  if (gone.length) {
    console.error(`  FAIL [J-2 전달커버리지] 파일 없음: ${gone.map((d) => d.path).join(', ')}`);
    console.error(`       스킬이 팀팩 밖으로 나가면 게이트 갱신이 그 문서에 도달할 길이 사라진다`);
    failJ = 1;
  } else {
    const miss = missingIn(bodies.map((d) => d.body));
    if (miss.length) {
      console.error(`  FAIL [J-2 전달커버리지] 만드는 쪽·검토하는 쪽 어디에도 없음 — 누락: ${miss.join(' ')}`);
      bodies.forEach((d) => {
        const own = tierKeys.filter((t) => mentionsTier(d.body, t));
        console.error(`         ${d.role}(${d.path.split('/').pop()}): ${own.join(' ') || '(없음)'}`);
      });
      console.error(`       검사가 늘었는데 안내가 안 늘면, 팀원은 CI 가 왜 막는지 알 수 없다.`);
      console.error(`       두 문서 중 알맞은 쪽에 그 Tier 설명을 1줄 추가할 것`);
      failJ = 1;
    }
  }
}
if (failJ === 0) {
  console.log(`  PASS [J 문서커버리지] Tier ${tierKeys.length}종 — 목록 3자 일치 / 정본·전달 누락 0`);
}
if (failJ) fail = 1;

process.exit(fail);
