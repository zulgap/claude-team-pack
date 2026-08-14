#!/usr/bin/env node
'use strict';

/**
 * 스킬 소유권 게이트 — "만든 사람이 정본 소유자" (2026-08-04 사장님 확정)
 *
 * 하는 일: PR이 남의 스킬 본체를 건드렸으면 그 소유자의 승인을 요구한다.
 *
 *   1. PR 올린 사람이 레포 주인(사장님)인가?        → 통과 (정책 ③ 비대칭)
 *   2. 이 PR이 건드린 스킬들의 원작성자를 git에서 찾는다
 *   3. 남의 스킬이 있으면 → **레포 주인이 승인했는가?**  → 통과 (2026-08-14 신설, 아래 사유)
 *   4. 아니면 → 그 소유자가 이 PR을 승인했는가?
 *        승인함  → 통과
 *        미승인  → FAIL (막는 게 아니라 "승인이 필요하다"고 알린다)
 *
 * 🔴 3번(레포 주인 승인)을 신설한 이유 — 1번과 비일관이었다:
 *    1번은 "사장님이 **올린** PR은 전 스킬 통과"인데, 승인 경로에는 그 조항이 없어
 *    **"올리면 되고 승인하면 안 되는"** 상태였다. 같은 권한이 경로에 따라 갈렸다.
 *    실사고(PR #184, 2026-08-14): 지연님이 자식 스킬의 `parent-checksum` **한 줄**을 갱신했는데
 *    그 스킬 소유자가 나래님이라, 사장님이 승인해도 풀리지 않았다.
 *    브랜치 보호가 `enforce_admins: true` 라 `--admin` 강제 머지도 막힌다(실측) →
 *    **소유자 한 명이 자리를 비우면 레포 전체가 멈춘다.**
 * 🔑 권한이 새로 생기는 것이 아니다 — 레포 주인은 이미 1번으로 "본인이 올리면" 전부 통과시킬 수 있다.
 *    이 조항은 그 권한을 **기록이 남는 경로(리뷰 승인)** 로도 쓸 수 있게 할 뿐이다.
 *    오히려 우회(강제 머지·본인 이름으로 재작성)보다 추적이 쉬워진다.
 *
 * 🔴 차단이 아니라 승인 요구인 이유:
 *    5인검증 수렴안은 "남의 본체 수정 금지"가 아니라 **"소유자 승인 후 머지"**(허용+승인)다.
 *    PR #63이 "금지" 문장을 삭제한 사유가 *"팀원 PC의 Claude가 정책을 모른 채 거절한다"* 였고,
 *    팀원 커밋 0건의 직접 원인이 그 계열 문장이었다. 기여를 멈추게 하면 안 된다.
 *
 * 🔴 왜 CODEOWNERS가 아니라 이 스크립트인가:
 *    GitHub이 이 레포에서 CODEOWNERS를 읽지 않는다(2026-08-05, 4회 실측 — CHANGELOG v2.28).
 *    리뷰어 자동 지정 0건 + code owner 승인 요구가 머지를 막지 않았다.
 *
 * 🔴 라벨에 Tier 문자를 쓰지 않는다 — `check-plugin-consistency.js` 의 Tier A~G 는 그 파일 전용
 *    체계이고 이 게이트는 별도 파일·별도 워크플로우다. 한때 여기도 "Tier G" 라 불렀다가
 *    2026-08-05 PR #111 이 그 파일에 진짜 Tier G(되돌릴수없음)를 신설해 이름이 겹쳤다.
 *
 * CI 전용이다. 로컬에서는 PR 컨텍스트가 없어 판정이 성립하지 않으므로 안내 후 통과한다.
 * 🔑 그래서 `check-plugin-consistency.js`에 넣지 않고 파일을 분리했다 — 그 파일은
 *    team-guide.md와 zulgap-make-skill이 팀원에게 *"로컬에서 돌려 exit=0이면 통과"*로
 *    공표한 스크립트라, git·네트워크 의존을 섞으면 로컬에서 조용히 skip되어 그 문장이 거짓이 된다.
 */

const { execFileSync } = require('child_process');

// @AI:CONSTRAINT 소유자 판정의 SSOT는 git이다. CODEOWNERS나 frontmatter의 author 필드를
// 읽지 말 것 — 손으로 쓰는 명단을 판정에 쓰면 두 번째 장부가 되어 언젠가 git과 어긋난다.
const SKILL_PATH_RE = /^plugins\/[^/]+\/skills\/([^/]+)\/(.+)$/;

/** 같은 사람이 zulgap / zuglap / ZULGAP 세 이름으로 커밋한다 (2026-08-04 실측). */
function normalizeAuthor(name) {
  const n = String(name || '').trim().toLowerCase();
  return n === 'zuglap' ? 'zulgap' : n;
}

function git(args) {
  return execFileSync('git', args, { encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 }).trim();
}

/**
 * 스킬을 처음 만든 사람. 없으면 null(= 이 PR이 새로 만드는 스킬이라 소유자가 아직 없다).
 *
 * 🔴 반드시 baseSha 기준으로 본다. HEAD 기준으로 조회하면 이 PR 자신의 커밋이 "최초 작성"으로
 *    잡혀 ① 신규 스킬이 남의 것으로 오판되고 ② 파일을 지웠다 다시 만들어 소유권을 가로채는
 *    경로가 열린다(2026-08-05 실측으로 발견).
 * 🔴 --follow 없이 디렉토리로 조회하면 과거 rename 때문에 오귀속된다 — 파일 경로 + --follow 고정.
 */
function originalAuthor(skillDir, baseSha) {
  let out;
  try {
    out = git(['log', baseSha, '--follow', '--diff-filter=A', '--format=%an', '--', `${skillDir}/SKILL.md`]);
  } catch {
    return null;
  }
  const lines = out.split('\n').map((s) => s.trim()).filter(Boolean);
  return lines.length ? normalizeAuthor(lines[lines.length - 1]) : null;
}

async function approvedLogins({ repo, prNumber, token }) {
  const res = await fetch(
    `https://api.github.com/repos/${repo}/pulls/${prNumber}/reviews?per_page=100`,
    { headers: { authorization: `Bearer ${token}`, accept: 'application/vnd.github+json' } },
  );
  if (!res.ok) throw new Error(`reviews API ${res.status}`);
  const reviews = await res.json();

  // 같은 사람이 여러 번 리뷰하면 마지막 상태만 유효하다 (APPROVED 후 CHANGES_REQUESTED면 승인 아님).
  const last = new Map();
  for (const r of reviews) {
    const login = normalizeAuthor(r.user && r.user.login);
    if (!login || r.state === 'COMMENTED') continue; // 코멘트는 승인 상태를 바꾸지 않는다
    last.set(login, r.state);
  }
  return new Set([...last].filter(([, state]) => state === 'APPROVED').map(([login]) => login));
}

async function main() {
  const prAuthor = normalizeAuthor(process.env.PR_AUTHOR);
  // @AI:DEPENDS 사장님 예외의 유일한 근거가 이 값이다. 계정 이름을 파일에 적지 않는 이유 —
  // 적는 순간 그것도 손으로 유지하는 장부가 되어 소유권이 바뀌면 어긋난다.
  const repoOwner = normalizeAuthor(process.env.REPO_OWNER);
  const baseSha = process.env.BASE_SHA;
  const headSha = process.env.HEAD_SHA;
  const prNumber = process.env.PR_NUMBER;
  const repo = process.env.GH_REPO;
  const token = process.env.GH_TOKEN;

  if (!prAuthor || !repoOwner || !baseSha || !headSha || !prNumber || !repo || !token) {
    console.log('ℹ [소유권] CI 전용 게이트입니다 — PR 컨텍스트가 없어 건너뜁니다.');
    console.log('  이 검사는 GitHub Actions의 pull_request 이벤트에서만 판정할 수 있습니다.');
    return 0;
  }

  if (prAuthor === repoOwner) {
    console.log(`PASS [소유권] PR 작성자가 레포 주인(${repoOwner})입니다 — 전 스킬 수정 허용.`);
    console.log('  단 남의 스킬을 고쳤다면 PROVENANCE.md에 사유 1줄을 남겨 주세요 (정책 ③).');
    return 0;
  }

  const changed = git(['diff', '--name-only', `${baseSha}...${headSha}`])
    .split('\n').map((s) => s.trim()).filter(Boolean);

  // 스킬 폴더별로 묶는다. channels/ 는 값 파일 경로라 본체가 아니므로 제외한다.
  const touched = new Map();
  for (const file of changed) {
    const m = SKILL_PATH_RE.exec(file);
    if (!m) continue;
    if (m[2].startsWith('channels/')) continue;
    const dir = file.slice(0, file.indexOf(`/${m[2]}`));
    if (!touched.has(dir)) touched.set(dir, []);
    touched.get(dir).push(file);
  }

  if (touched.size === 0) {
    console.log('PASS [소유권] 스킬 본체 변경 없음.');
    return 0;
  }

  const foreign = [];
  for (const [dir, files] of touched) {
    const owner = originalAuthor(dir, baseSha);
    if (!owner) {
      console.log(`PASS [소유권] ${dir} — 이 PR이 새로 만드는 스킬입니다.`);
      continue;
    }
    if (owner === prAuthor) {
      console.log(`PASS [소유권] ${dir} — 본인 스킬입니다.`);
      continue;
    }
    foreign.push({ dir, owner, files });
  }

  if (foreign.length === 0) return 0;

  const approved = await approvedLogins({ repo, prNumber, token });

  // @AI:CONSTRAINT 레포 주인의 승인은 모든 소유자 승인을 대신한다. 판정 근거는 위 1번과 **같은 값**
  //   (`REPO_OWNER` env)이다 — 계정 이름을 파일에 적지 않는 이유가 여기도 그대로 적용된다.
  //   🔴 이 분기를 지우면 소유자 한 명이 자리를 비울 때 레포 전체가 멈춘다(enforce_admins=true라
  //   강제 머지도 안 된다). 되살리려면 1번(작성자 예외)도 함께 지워야 일관된다.
  if (approved.has(repoOwner)) {
    console.log(`PASS [소유권] 레포 주인(@${repoOwner})이 승인했습니다 — 전 스킬 통과.`);
    for (const f of foreign) console.log(`  · ${f.dir} (만든 사람 @${f.owner})`);
    console.log('  ⚠️ 승인이 통보를 대신하지는 않습니다 — 소유자에게 변경 사실을 알려 주세요.');
    return 0;
  }

  const pending = foreign.filter((f) => !approved.has(f.owner));

  for (const f of foreign.filter((x) => approved.has(x.owner))) {
    console.log(`PASS [소유권] ${f.dir} — 소유자 @${f.owner} 승인 확인.`);
  }
  if (pending.length === 0) return 0;

  console.log('');
  for (const f of pending) {
    console.log(`FAIL [소유권] ${f.dir}`);
    console.log(`  이 스킬을 만든 사람: @${f.owner} / 이 PR을 올린 사람: @${prAuthor}`);
    console.log(`  변경된 파일: ${f.files.join(', ')}`);
  }
  console.log('');
  console.log('이 PR을 막는 것이 아니라 소유자 승인이 필요하다는 뜻입니다. 다음 중 하나로 진행하세요:');
  console.log(`  1) 소유자에게 리뷰를 요청하세요 — ${[...new Set(pending.map((f) => `@${f.owner}`))].join(' ')}`);
  console.log('     승인이 등록되면 이 검사는 자동으로 다시 돌아 통과합니다.');
  console.log('  2) 버그 수정이라면 그 사실을 PR 본문에 적고 소유자 승인을 받으세요 (정책 ②).');
  console.log('     버그가 원본에 남으면 그걸 복사해 간 쪽까지 같은 버그를 물려받습니다.');
  console.log('  3) 회사·브랜드별 값만 바꾸는 거라면 그 스킬의 channels/ 값 파일을 고치세요');
  console.log('     (channels/ 경로는 이 검사에서 제외됩니다).');

  // @AI:INTENT 워크플로우가 팀챗 알림에 쓸 소유자 목록을 **구조화해서** 넘긴다.
  //   🔴 stdout 을 grep 하지 않는 이유 — 위 안내 문구를 한 글자만 바꿔도 알림이 조용히 죽는다.
  //   실사고(2026-08-14): 게이트가 @naraeng2 승인을 요구했는데 그 사실이 어디에도 도달하지 않아
  //   PR #183·#184 가 반나절 멈춰 있었다. 소유자는 자기 차례인 줄 몰랐다.
  if (process.env.GITHUB_OUTPUT) {
    const owners = [...new Set(pending.map((f) => `@${f.owner}`))].join(' ');
    require('fs').appendFileSync(process.env.GITHUB_OUTPUT, `pending_owners=${owners}\n`);
  }
  return 1;
}

// 🔴 process.exit() 를 쓰지 말 것 — fetch 가 연 핸들이 정리되기 전에 강제 종료되어
//    Windows 에서 libuv assertion 으로 죽고 **종료 코드가 127 이 된다**(2026-08-05 실측).
//    FAIL 은 우연히 non-zero 라 맞아 보이지만, 승인받아 통과해야 할 PR 도 127 로 막힌다.
//    exitCode 만 설정하고 이벤트 루프가 비면 자연 종료시킨다.
main()
  .then((code) => {
    process.exitCode = code;
  })
  .catch((err) => {
    // @AI:CONSTRAINT 판정 불가를 통과로 처리하지 말 것. 읽기 실패를 조용히 skip 하면
    // fail-open 이 되어 게이트가 있는 채로 아무것도 막지 않는다(2026-08-04 pre-commit 실사고 클래스).
    console.log(`FAIL [소유권] 판정에 실패했습니다: ${err.message}`);
    console.log('  판정 불가는 통과로 처리하지 않습니다. 위 오류를 해결한 뒤 다시 실행하세요.');
    process.exitCode = 1;
  });
