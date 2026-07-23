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
const extract = (text, regex) => {
  const out = new Set();
  let m;
  while ((m = regex.exec(text)) !== null) out.add(m[1]);
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
    activation: /\['([\w-]+)@' \+ MP\]\s*(?::|=)\s*true/g,
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

process.exit(fail);
