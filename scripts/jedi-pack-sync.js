#!/usr/bin/env node
// jedi-pack-sync.js — 공용 팩(jedi-core·dev-pack)이 두 저장소에서 갈리는 것을 막는다.
//
// @AI:INTENT 2026-08-21 실측: jedi-pack 은 2026-08-19 커밋 1개에 멈춰 있는데 claude-team-pack 은
//   그 뒤 #243·#246 으로 공용 팩을 두 번 고쳤다. 결과 10파일이 갈렸고(누락 1 + 내용 9) **경보는 0건**이었다.
//   신규 설치는 jedi-pack 을, 기존 PC 는 claude-team-pack 을 보므로 **서로 다른 코드가 출하되고 있었다.**
//   낡은 짝끼리는 내부 정합이라 에러가 안 나고 «침묵»으로 갈린다 — 그래서 재는 자리가 필요하다.
// @AI:CONSTRAINT 🔴 단방향이다. claude-team-pack 이 원본, jedi-pack 은 배포본.
//   반대로 흘리면 게이트 6종이 없는 쪽(jedi-pack)의 편집이 원본을 덮는다.
// @AI:CONSTRAINT 🔴 marketplace.json 은 **미러하지 않는다** — 두 저장소가 서로 다른 repo 를 가리켜야
//   맞다(jedi-pack 은 자기를, claude-team-pack 은 자기를). 같게 만들면 설치가 엉뚱한 곳을 본다.
// @AI:CONSTRAINT 🔴 zulgap-pack 은 미러 대상이 **아니다** — tenant-only 이고 동료사 자료가 들어 있다.
//   jedi-pack 은 PUBLIC 이라 옮기는 순간 461건이 게이트 0벌 저장소로 나간다(2026-08-21 5인 조사).
//
// 사용:
//   node scripts/jedi-pack-sync.js            # 차이 보고 (exit 1 = 갈림)
//   node scripts/jedi-pack-sync.js --check    # 같음 (CI 가 쓴다 — 인증 불필요, jedi-pack 이 public)
//   node scripts/jedi-pack-sync.js --apply    # 맞춘다 (사람이 로컬에서. gh 인증 + jedi-pack write 필요)

const { execFileSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const SRC_REF = process.env.SYNC_SRC_REF || 'origin/main';
const DST_REPO = 'zulgap/jedi-pack';
const DST_BRANCH = 'main';
// @AI:CONSTRAINT 여기에 zulgap-pack 을 추가하지 말 것 (위 @AI:CONSTRAINT 참조).
const MIRRORED = ['plugins/jedi-core/', 'plugins/dev-pack/'];

const sh = (cmd, args, opts) => execFileSync(cmd, args, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, ...opts });

function srcFiles() {
  const out = sh('git', ['ls-tree', '-r', SRC_REF, '--format=%(objectname) %(path)']);
  const m = new Map();
  for (const line of out.split('\n')) {
    const i = line.indexOf(' ');
    if (i < 0) continue;
    const sha = line.slice(0, i), p = line.slice(i + 1);
    if (MIRRORED.some((d) => p.startsWith(d))) m.set(p, sha);
  }
  return m;
}

function dstFiles() {
  // @AI:CONSTRAINT 🔴 --jq 를 쓰지 말 것. jq 의 "(.sha)" 를 JS 문자열에 담으면 «알 수 없는 이스케이프»라
  //   백슬래시가 조용히 사라져 필터가 리터럴 "(.sha)" 가 된다 — 2026-08-21 실측: 에러 없이 46줄을 뱉고
  //   0파일로 읽혀 「갈림 44건」이라는 틀린 답이 나왔다. 반대로 나왔으면 「갈림 없음」 오판이 됐다.
  //   JSON 을 그대로 받아 JS 가 파면 이 함정이 원리적으로 사라진다.
  const raw = sh('gh', ['api', `repos/${DST_REPO}/git/trees/${DST_BRANCH}?recursive=1`]);
  const j = JSON.parse(raw);
  // @AI:CONSTRAINT 🔴 truncated 를 무시하지 말 것 — 목록이 잘린 채 비교하면 «없는 파일»이 무더기로 잡힌다.
  if (j.truncated) { console.error('🔴 ' + DST_REPO + ' 트리가 잘렸다(truncated) — 비교가 무효다'); process.exit(2); }
  const m = new Map();
  for (const node of j.tree || []) {
    if (node.type !== 'blob') continue;
    if (MIRRORED.some((d) => node.path.startsWith(d))) m.set(node.path, node.sha);
  }
  return m;
}

function diff(src, dst) {
  const missing = [], changed = [], extra = [];
  for (const [p, sha] of src) {
    if (!dst.has(p)) missing.push(p);
    else if (dst.get(p) !== sha) changed.push(p);
  }
  for (const p of dst.keys()) if (!src.has(p)) extra.push(p);
  return { missing, changed, extra };
}

const args = process.argv.slice(2);
const isCheck = args.includes('--check');
const isApply = args.includes('--apply');

let src, dst;
try { src = srcFiles(); } catch (e) { console.error('🔴 원본을 읽지 못했다 (' + SRC_REF + '): ' + e.message); process.exit(2); }
try { dst = dstFiles(); } catch (e) {
  // @AI:CONSTRAINT 🔴 «못 읽음»을 «같음»으로 접지 말 것 — 그러면 갈려도 초록불이 된다.
  console.error('🔴 ' + DST_REPO + ' 를 읽지 못했다 (gh 인증·네트워크): ' + e.message);
  process.exit(2);
}

// @AI:CONSTRAINT 🔴 어느 한쪽이 0파일이면 «갈림»이 아니라 «측정 실패»다. 공용 팩이 통째로 사라지는 일은
//   정상 운영에서 일어나지 않으므로, 0 을 그대로 비교하면 44건 전량 이동이라는 위험한 답이 나온다.
if (!src.size) { console.error('🔴 원본에서 공용 팩을 하나도 못 찾았다 (' + SRC_REF + ') — 측정 실패다'); process.exit(2); }
if (!dst.size) { console.error('🔴 배포본에서 공용 팩을 하나도 못 찾았다 (' + DST_REPO + ') — 측정 실패이거나 실제 사고다. 손으로 확인할 것'); process.exit(2); }

const d = diff(src, dst);
const total = d.missing.length + d.changed.length + d.extra.length;

console.log(`원본 ${SRC_REF} ${src.size}파일 ↔ ${DST_REPO}@${DST_BRANCH} ${dst.size}파일`);
if (!total) { console.log('✅ 갈림 없음'); process.exit(0); }

console.log(`🔴 갈림 ${total}건`);
for (const p of d.missing) console.log('  [배포본에 없음] ' + p);
for (const p of d.changed) console.log('  [내용 다름]     ' + p);
for (const p of d.extra) console.log('  [배포본에만]    ' + p);

if (isCheck || !isApply) {
  if (!isApply) console.log('\n맞추려면: node scripts/jedi-pack-sync.js --apply   (gh 인증 + ' + DST_REPO + ' write 필요)');
  process.exit(1);
}

// ── --apply ────────────────────────────────────────────────────────────────
// @AI:CONSTRAINT 🔴 배포본을 clone 해서 «미러 대상 경로만» 통째로 갈아끼운다.
//   부분 복사로는 «배포본에만 있는 파일»(삭제분)이 남아 갈림이 안 닫힌다.
const work = fs.mkdtempSync(path.join(os.tmpdir(), 'jpsync-'));
try {
  sh('gh', ['repo', 'clone', DST_REPO, work, '--', '--depth', '1', '--branch', DST_BRANCH], { stdio: 'pipe' });
  for (const dir of MIRRORED) {
    const target = path.join(work, dir);
    fs.rmSync(target, { recursive: true, force: true });
    fs.mkdirSync(target, { recursive: true });
  }
  for (const p of src.keys()) {
    const blob = execFileSync('git', ['show', `${SRC_REF}:${p}`], { maxBuffer: 64 * 1024 * 1024 });
    const out = path.join(work, p);
    fs.mkdirSync(path.dirname(out), { recursive: true });
    fs.writeFileSync(out, blob);
  }
  const srcSha = sh('git', ['rev-parse', '--short', SRC_REF]).trim();
  sh('git', ['-C', work, 'add', '-A']);
  const st = sh('git', ['-C', work, 'status', '--porcelain']).trim();
  if (!st) { console.log('\n적용할 변경이 없다 (이미 같다)'); process.exit(0); }
  sh('git', ['-C', work, 'commit', '-m',
    `chore(sync): 공용 팩을 claude-team-pack@${srcSha} 와 맞춘다\n\n` +
    `scripts/jedi-pack-sync.js --apply 로 생성. 단방향(원본=claude-team-pack).\n` +
    `갈림 ${total}건 해소: 없음 ${d.missing.length} · 다름 ${d.changed.length} · 잔여 ${d.extra.length}`]);
  sh('git', ['-C', work, 'push', 'origin', DST_BRANCH]);
  console.log('\n✅ ' + DST_REPO + ' 에 반영했다');
} finally {
  fs.rmSync(work, { recursive: true, force: true });
}
