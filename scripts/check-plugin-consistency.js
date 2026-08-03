#!/usr/bin/env node
// 플러그인·스킬 규격 결정론 체크 — packaging-spec §4 심사 ⑥⑦⑧⑨
// @AI:INTENT 4장부 드리프트 재발 차단 (2026-07-22 정책 헌법 §7 — 구 3중 불일치 사고):
//   ① .claude-plugin/marketplace.json (정의 원본)
//   ② install.ps1 (윈도우 설치기)     ③ install.sh (맥/리눅스 설치기)
//   ④ hooks/hook-doctor-v2.js (기존 PC 자가치유 — install과 동일 매핑 필수)
// 검사 5단 (신설 시 이 목록 + .github/workflows/plugin-consistency.yml + spec §4를 함께 갱신):
//   Tier A — 활성화 집합: ②③④가 활성화(true)하는 이름 집합 == (① − DEPRECATED)   [spec §4⑥]
//   Tier B — 레거시 잔존: DEPRECATED 이름 언급 라인은 비활성화/전환 패턴만 허용     [spec §4⑥]
//            (안내 문구·설치 명령에 구 이름이 남는 드리프트 차단 — install.ps1:297 실사례)
//   Tier C — 스킬 이름 규격(kebab-case·중복·bare 충돌·폴더명 일치)                 [spec §4⑦]
//   Tier D — tier 선언 + shared 스킬 A급 리터럴 0                                  [spec §4⑧]
//   Tier E — 형제 스킬 폴더명 하드코딩 0                                            [spec §4⑨]
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

process.exit(fail);
