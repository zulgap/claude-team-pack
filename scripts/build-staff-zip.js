#!/usr/bin/env node
// 직원 부트스트랩 zip 빌더 — `claude-team-pack-for-staff_vX.Y.zip`
//
// 왜 스크립트인가: 절차를 문서로만 적으면 지켜지지 않는다는 것이 이 레포의 실측 학습이다
//   (v2.29 "결정론 게이트 100% vs 사람 눈 8%"). 실제로 2026-08-05 v2.26 배포 때 PowerShell
//   `Compress-Archive`가 엔트리명을 `hooks\...`(백슬래시)로 써서 v2.25(`hooks/...`)와 달라지는
//   회귀를 냈다 — 윈도우 탐색기에서는 정상으로 보이지만 맥·리눅스에서는 디렉토리가 아니라
//   이름에 `\`가 든 파일 하나로 풀린다. 눈으로는 안 보이는 종류의 사고라 도구로 막는다.
//
// 사용: node scripts/build-staff-zip.js 2.26 [--out <경로>] [--allow-dirty]
//   기본 출력 = ~/claude-team-pack-for-staff_v<버전>.zip (§파일명 규칙의 위치)
'use strict';
const fs = require('fs');
const path = require('path');
const os = require('os');
const zlib = require('zlib');
const crypto = require('crypto');
const { execFileSync } = require('child_process');

// @AI:CONSTRAINT zip에 담기는 파일의 SSOT. 부트스트랩(첫 설치 1회)에 필요한 것만 넣는다 —
//   스킬·안내문은 마켓플레이스로 원격 자동갱신되므로 zip에 넣으면 두 번째 장부가 된다.
//   ⚠️ install.sh / install.command 는 여기 없다: 맥은 별도 zip(zulgap-claude-mac-installer)과
//   방법 A(`curl` GitHub raw)로 나가며, 후자는 항상 최신이라 재배포 자체가 불필요하다.
//   파일을 추가·삭제할 땐 이 배열만 고치면 된다.
const ENTRIES = [
  'hooks/prompt-capture.js',
  // @AI:CONSTRAINT install.ps1/install.sh 가 hooks/ 에서 복사하는 파일은 **전부 여기 있어야 한다.**
  //   2026-08-08 실측: response-capture.js 가 빠져 있어 install 이 복사할 원본이 아예 없었다
  //   (install.ps1 의 경로 오타와 겹쳐 두 겹으로 막혀 있었다). 훅을 새로 추가하면 이 목록도 볼 것.
  'hooks/response-capture.js',
  'hooks/team-guide-fetch.js',
  'mcp-bridge/index.js',
  'mcp-bridge/package.json',
  'install-dev.bat',
  'install.bat',
  'install.ps1',
  'team-CLAUDE-en.md',
  'team-CLAUDE.md',
];

// @AI:INTENT 고정 타임스탬프(1980-01-01) — 같은 커밋에서 빌드하면 바이트 동일한 zip이 나온다.
//   파일 mtime을 쓰면 clone·checkout마다 값이 달라져 "이 zip이 그 커밋에서 나온 게 맞나"를
//   해시로 확인할 수 없다. 기존 맥 installer zip도 같은 규약(1980-01-01 00:00).
const DOS_TIME = 0;
const DOS_DATE = 0x0021;

const CRC_TABLE = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c;
  }
  return t;
})();

function crc32(buf) {
  let c = -1;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}

// @AI:FRAGILE 워킹트리에서 읽는다 — `git show <ref>:<path>`로 blob을 직접 읽으면 안 된다.
//   .gitattributes가 `*.bat text eol=crlf`를 강제하는데(v1.4 재발방지: cmd.exe의 UTF-8 chcp
//   파서가 LF일 때 첫 바이트를 먹는다) blob은 정규화 전 LF라서, git에서 바로 읽으면 그 방어가
//   통째로 무효가 된다. 대신 워킹트리가 오염되지 않았음을 아래 assertCleanEntries로 보장한다.
function assertCleanEntries(rootDir, entries, allowDirty) {
  let out;
  try {
    out = execFileSync('git', ['status', '--porcelain', '--', ...entries], {
      cwd: rootDir, encoding: 'utf8',
    }).trim();
  } catch (_) {
    // git이 없거나 레포가 아니면 판정 불가 — 막지는 않되 사실을 알린다(조용한 통과 금지).
    console.warn('⚠️  git 상태를 확인하지 못했습니다 — 워킹트리 오염 여부 미판정');
    return null;
  }
  if (out && !allowDirty) {
    // @AI:INTENT 2026-08-05 실사고: 같은 클론에서 다른 세션이 team-CLAUDE.md를 편집 중이었고,
    //   그 미커밋 상태가 zip에 실릴 뻔했다. 머지되지 않은 문구가 전 직원에게 나가는 경로다.
    throw new Error(
      'zip 대상 파일에 미커밋 변경이 있습니다 — 머지 안 된 내용이 배포될 수 있습니다:\n' +
      out.split('\n').map((l) => '   ' + l).join('\n') +
      '\n   커밋·stash 후 다시 실행하거나, 의도한 것이면 --allow-dirty 를 붙이세요.'
    );
  }
  try {
    return execFileSync('git', ['rev-parse', 'HEAD'], { cwd: rootDir, encoding: 'utf8' }).trim();
  } catch (_) { return null; }
}

function buildZip(rootDir, entries) {
  const chunks = [];
  const central = [];
  let offset = 0;

  for (const name of entries) {
    const abs = path.join(rootDir, name);
    // @AI:CONSTRAINT fail-closed — 목록에 있는데 파일이 없으면 "9개 중 8개만 든 zip"이 조용히 나간다.
    if (!fs.existsSync(abs)) throw new Error(`대상 파일 없음: ${name} (ENTRIES 목록과 레포가 어긋났습니다)`);
    const raw = fs.readFileSync(abs);
    const deflated = zlib.deflateRawSync(raw, { level: 9 });
    // 압축이 오히려 커지는 작은 파일은 store(method 0)로 — 표준 zip 동작.
    const useDeflate = deflated.length < raw.length;
    const body = useDeflate ? deflated : raw;
    const method = useDeflate ? 8 : 0;
    const crc = crc32(raw);
    // @AI:CONSTRAINT 엔트리명은 항상 forward slash. zip 스펙(APPNOTE 4.4.17.1)이 요구하고,
    //   백슬래시로 쓰면 맥·리눅스에서 디렉토리로 안 풀린다. path.join 결과를 그대로 쓰지 말 것.
    const nameBuf = Buffer.from(name.replace(/\\/g, '/'), 'utf8');

    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);      // version needed
    local.writeUInt16LE(0x0800, 6);  // UTF-8 파일명
    local.writeUInt16LE(method, 8);
    local.writeUInt16LE(DOS_TIME, 10);
    local.writeUInt16LE(DOS_DATE, 12);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(body.length, 18);
    local.writeUInt32LE(raw.length, 22);
    local.writeUInt16LE(nameBuf.length, 26);
    local.writeUInt16LE(0, 28);      // extra
    chunks.push(local, nameBuf, body);

    const cd = Buffer.alloc(46);
    cd.writeUInt32LE(0x02014b50, 0);
    cd.writeUInt16LE(0x0314, 4);     // made by: unix + spec 2.0
    cd.writeUInt16LE(20, 6);
    cd.writeUInt16LE(0x0800, 8);
    cd.writeUInt16LE(method, 10);
    cd.writeUInt16LE(DOS_TIME, 12);
    cd.writeUInt16LE(DOS_DATE, 14);
    cd.writeUInt32LE(crc, 16);
    cd.writeUInt32LE(body.length, 20);
    cd.writeUInt32LE(raw.length, 24);
    cd.writeUInt16LE(nameBuf.length, 28);
    cd.writeUInt16LE(0, 30);         // extra
    cd.writeUInt16LE(0, 32);         // comment
    cd.writeUInt16LE(0, 34);         // disk start
    cd.writeUInt16LE(0, 36);         // internal attrs
    // external attrs: 유닉스 0644 (맥 해제 시 권한 보존).
    // @AI:FRAGILE `<<`는 32비트 signed라 0o100644<<16이 음수가 된다(실측 RangeError). 곱셈으로 쓸 것.
    cd.writeUInt32LE(0o100644 * 0x10000, 38);
    cd.writeUInt32LE(offset, 42);
    central.push(cd, nameBuf);

    offset += local.length + nameBuf.length + body.length;
  }

  const cdBuf = Buffer.concat(central);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(entries.length, 8);
  eocd.writeUInt16LE(entries.length, 10);
  eocd.writeUInt32LE(cdBuf.length, 12);
  eocd.writeUInt32LE(offset, 16);
  return Buffer.concat([...chunks, cdBuf, eocd]);
}

function main() {
  const args = process.argv.slice(2);
  const version = args.find((a) => !a.startsWith('--'));
  if (!version || !/^\d+\.\d+$/.test(version)) {
    console.error('사용: node scripts/build-staff-zip.js <버전>   예) node scripts/build-staff-zip.js 2.26');
    console.error('  버전은 CHANGELOG.md 최상단에서 "zip 재생성"으로 표시된 항목의 번호를 쓸 것.');
    process.exitCode = 1;
    return;
  }
  const outIdx = args.indexOf('--out');
  const root = path.join(__dirname, '..');
  const out = outIdx >= 0 && args[outIdx + 1]
    ? args[outIdx + 1]
    : path.join(os.homedir(), `claude-team-pack-for-staff_v${version}.zip`);

  let buf;
  let head;
  try {
    head = assertCleanEntries(root, ENTRIES, args.includes('--allow-dirty'));
    buf = buildZip(root, ENTRIES);
  } catch (e) {
    console.error('❌ ' + e.message);
    process.exitCode = 1;
    return;
  }
  fs.writeFileSync(out, buf);

  console.log(`✅ ${out}`);
  console.log(`   ${ENTRIES.length}개 파일 / ${buf.length.toLocaleString()}B`);
  if (head) console.log(`   기준 커밋 ${head.slice(0, 12)} — Release --target 에 이 full sha를 쓰세요:\n   ${head}`);
  console.log('');
  console.log('   엔트리 (sha256 앞 12자리):');
  for (const name of ENTRIES) {
    const h = crypto.createHash('sha256').update(fs.readFileSync(path.join(root, name))).digest('hex').slice(0, 12);
    console.log(`   ${h}  ${name}`);
  }
  console.log('');
  console.log('   다음: CHANGELOG.md § 파일명 규칙 ③④ (Release 생성 → 노션 첨부 교체)');
}

if (require.main === module) main();
module.exports = { ENTRIES, buildZip, crc32, assertCleanEntries };
