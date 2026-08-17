#!/usr/bin/env node
// @AI:INTENT 줄갭 팀 안내문을 매 세션 시작 시 GitHub에서 받아 주입.
//   → 안내문을 바꾸면 직원은 zip 재설치 없이 다음 세션에 자동 반영 (알집式 원격 갱신).
//   v1.20: 역할(role)의 원천 = 제디 토큰 JWT claim (사장님 mandate "관리 SSOT = 토큰").
//     매핑: admin/master→master(주입 skip, 개인 컨텍스트 보존) · dev/developer/engineer→dev(영어 가이드) · 그 외(PM/MEMBER/USER)→staff.
//     토큰 없거나 해석 실패 → role 파일(~/.claude/zulgap/role) 폴백 → staff 기본.
//     역할 변경 = 토큰 재발급 1곳 (role 파일 drift 원천 제거 — 매 세션 라이브 유도).
//   v1.21: 축이 하나 더 붙었다 — **tenant**. role 만 보면 외부 고객사 직원도 staff 로 떨어져
//     남의 회사 안내문을 매 세션 읽는다(2026-08-16 실측). 아래 INTERNAL_TENANTS 참조.
//   v1.22 (2026-08-17, A3-2b): **안내문은 전부 인증 경로로 받는다.** 그전에는 내부만 공개 raw 였다.
//     갈림의 기준이 「어느 회사인가」에서 **「토큰이 있는가」**로 바뀌었고, tenant·role 판정은
//     서버로 넘어갔다(`GET /mcp/ext/team-guide`). 여기 남은 tenant·role 은 **캐시 파일명을 고르는
//     로컬 힌트**일 뿐이라 자칭해도 자기 캐시만 갈린다.
//     ⚠️ 캐시 이름이 바뀌었다 — 기존 PC 는 첫 세션에 미스 1회(서버에서 다시 받는다).
// @AI:CONSTRAINT 반드시 standalone 훅(settings.json)으로 등록. 플러그인 번들 훅은 additionalContext
//   미주입 버그(#16538)로 동작 안 함. 출력은 SessionStart additionalContext 계약을 정확히 따른다.
// @AI:CONSTRAINT staff 경로(team-guide.md + 캐시 team-guide.cache.md)는 기존 설치 PC와 동일 유지 — 기존 직원 회귀 0.
//   기존 직원 토큰 role=PM/MEMBER → staff 매핑 (2026-07-12 실측: 발급 role은 --role 인자 > 배정 role > 'USER').
const https = require('https');
const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');

const ZULGAP_DIR = path.join(os.homedir(), '.claude', 'zulgap');

function b64urlJson(seg) {
  return JSON.parse(Buffer.from(String(seg).replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8'));
}

// 제디 토큰 위치: Claude Code(~/.claude.json) 우선, 데스크탑앱 config 폴백 (Windows/macOS 양쪽)
// @AI:INTENT 2026-08-17 — 클레임뿐 아니라 **원본 토큰과 서버 주소**도 함께 돌려준다.
//   회사별 안내문을 인증 경로(GET /mcp/ext/team-guide)로 받으려면 Bearer 가 필요하고,
//   같은 파일을 두 번 읽지 않으려고 여기서 한 번에 꺼낸다(teampack-config.js 와 같은 탐색 순서).
// @AI:CONSTRAINT 🔴 여기의 base64 디코드는 **서명 검증이 아니다.** 검증은 서버가 한다
//   (`shared/mcp-ext-auth.js` — Bearer 검증 + tenant 강제 + IDOR 차단). 그래서 클레임은
//   「어느 캐시 파일을 쓸까」를 정하는 **로컬 힌트**로만 쓰고, 무엇을 받을지는 서버가 정한다.
//   토큰을 위조해도 서버가 그 토큰의 tenant 안내문만 주므로 남의 것을 못 받는다.
function readCreds() {
  const candidates = [path.join(os.homedir(), '.claude.json')];
  if (process.env.APPDATA) candidates.push(path.join(process.env.APPDATA, 'Claude', 'claude_desktop_config.json'));
  candidates.push(path.join(os.homedir(), 'Library', 'Application Support', 'Claude', 'claude_desktop_config.json'));
  for (const f of candidates) {
    try {
      const j = JSON.parse(fs.readFileSync(f, 'utf8'));
      const env = j && j.mcpServers && j.mcpServers.jedi && j.mcpServers.jedi.env;
      const t = env && env.JUDGMENTOS_TOKEN;
      if (!t) continue;
      const c = b64urlJson(String(t).split('.')[1]) || {};
      if (!c.role && !c.tenant_id) continue;
      return {
        claims: c,
        token: String(t),
        url: (env.JUDGMENTOS_URL || 'https://judgmentos-unified-agent-production.up.railway.app').replace(/\/+$/, ''),
      };
    } catch (_) { /* 파일 없음/파싱 실패 → 다음 후보 */ }
  }
  return null; // 토큰 기반 판정 불가 → 폴백으로
}

function roleFromClaims(claims) {
  const r = String((claims && claims.role) || '').toLowerCase();
  if (!r) return '';
  if (r === 'admin' || r === 'master') return 'master';
  if (r === 'dev' || r === 'developer' || r === 'engineer') return 'dev';
  return 'staff'; // 알 수 없는/직무 role(PM·MEMBER·USER 등) = 안전측
}

function resolveRole(claims) {
  const fromToken = roleFromClaims(claims);
  if (fromToken) return fromToken; // 토큰 = SSOT (role 파일과 불일치 시 토큰 우선)
  try {
    const r = fs.readFileSync(path.join(ZULGAP_DIR, 'role'), 'utf8').trim();
    if (r === 'dev' || r === 'master') return r; // 토큰 없는 설치 초기(발급 전) 폴백
  } catch (_) {}
  return 'staff';
}

// ── 외부 테넌트 안내문 격리 ────────────────────────────────────────────────
// @AI:CONSTRAINT 🔴 내부용 `team-guide.md` 에는 **밖에 나가면 안 되는 내용**이 들어 있다.
//   이 훅은 그전까지 role 만 분기해서, 외부 회사 직원도 role=staff 로 떨어져 **같은 파일을
//   매 세션 읽었다.** 팩·저장소를 나눠도 이 경로는 남으므로 격리는 여기서 한 번 더 서야 한다.
//   ⚠️ 이 주석에 구체적인 회사 이름을 다시 적지 말 것 — 이 파일은 공개된다.
// @AI:TENANT 판정축 = JWT `tenant_id` 클레임. role 과 같은 토큰에서 나온다
//   (`unified-agent/scripts/issue-mcp-token.js` payload = {actor_id, tenant_id, role}).
// @AI:CONSTRAINT 🔴 **fail-closed** — 줄갭이 아닌 테넌트는 전용 안내문을 못 받으면
//   주입을 포기한다(`team-guide.md` 로 폴백하지 않는다). 폴백을 열면 「guides/ 파일을
//   만드는 것을 사람이 잊었다」가 곧 유출이 되고, 에러가 안 나므로 아무도 모른다.
//   줄갭 직원 경로(토큰 없음 포함)는 byte-identical 로 보존 — 회귀 0.
// @AI:FRAGILE 🔴 마스터 테넌트를 목록에서 빼지 말 것 — 사장님 토큰의 tenant_id 는 `…-0000` 이라
//   줄갭(`…-0002`)만 넣으면 **사장님 PC가 외부로 분류된다.** 주입은 어차피 0이라 증상이 안 나고
//   404 요청만 조용히 하나 늘어난다(2026-08-16 검증 D 케이스에서 실제로 걸렸다).
const INTERNAL_TENANTS = new Set([
  'a0000000-0000-0000-0000-000000000002', // ZULGAP (줄갭)
  'a0000000-0000-0000-0000-000000000000', // Master (admin)
]);

function tenantFromClaims(claims) {
  const t = String((claims && claims.tenant_id) || '').trim().toLowerCase();
  // UUID 형태만 신뢰 — 파일명에 그대로 들어가므로 경로 조작 여지를 없앤다
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(t) ? t : '';
}

const RAW = 'https://raw.githubusercontent.com/zulgap/claude-team-pack/main/';

// ── Claude Code 설치 경로 점검 ──────────────────────────────────────────────
// @AI:INTENT 2026-08-03 — install.ps1은 공식 설치기가 실패하면 winget으로 **조용히 폴백**하는데
//   (install.ps1 § "[대체] winget으로 Claude Code 설치 시도"), winget 설치분은 자동 갱신이 안 된다.
//   실측: 직원 PC가 2026-06-29 19:03 설치 후 **65일간 2.1.195**에 멈춰 있었고 본인도 몰랐다.
//   에러가 안 나므로 무증상이고, 구버전은 모델과 기능이 통째로 뒤처진다.
// @AI:CONSTRAINT 판정은 **경로 목록만** 본다 — `claude --version`(버전 확인)은 프로세스가 무거워
//   세션 시작을 늦춘다. `where`는 ~50ms이고 이 훅은 이미 네트워크 4초를 쓰므로 무시할 수준.
//   그리고 **자동 제거는 하지 않는다**: 팀팩 push 권한 = 전 직원 PC 코드 실행 권한이고,
//   오판 시 멀쩡한 설치를 지운다. 사람이 한 줄 실행하도록 안내만 한다(AI는 초안까지).
// @AI:DEPENDS macOS(install.sh)는 폴백 구조가 없어(실패 시 중단) 이 사고가 불가 → win32만 검사.
// @AI:INTENT `where`를 1순위로 쓰는 이유 — 팀원마다 설치 위치가 다르다(npm prefix 커스텀,
//   Program Files 등). 표준 경로 3개만 보면 그런 PC를 놓친다. `where`는 PATH 전체를 훑어
//   **실제로 실행되는 것**을 그대로 준다. 실패 시에만 표준 경로 존재 확인으로 폴백한다.
function classifyClaudePath(p) {
  const low = String(p).toLowerCase();
  if (low.includes('\\winget\\')) return 'winget';
  if (low.includes('\\.local\\bin')) return '공식설치기';
  if (low.includes('\\npm\\')) return 'npm전역';
  return '기타';
}
function checkClaudeInstall() {
  if (process.platform !== 'win32') return '';
  const found = [];
  const seen = new Set();
  const add = (p) => {
    const k = String(p).toLowerCase();
    // .cmd/.ps1 shim은 같은 설치의 중복 표기 → 확장자 뗀 것으로 중복 제거
    const base = k.replace(/\.(exe|cmd|bat|ps1)$/, '');
    if (seen.has(base)) return;
    seen.add(base);
    found.push({ kind: classifyClaudePath(p), p: String(p) });
  };
  try {
    const out = require('child_process')
      .execFileSync('where', ['claude'], { encoding: 'utf8', timeout: 3000, stdio: ['ignore', 'pipe', 'ignore'] });
    String(out).split(/\r?\n/).map((s) => s.trim()).filter(Boolean).forEach(add);
  } catch (_) {
    // `where` 실패(미설치·PATH 밖·권한) → 표준 경로 존재 확인으로 폴백
    const LA = process.env.LOCALAPPDATA || '';
    const AD = process.env.APPDATA || '';
    const cands = [
      LA && path.join(LA, 'Microsoft', 'WinGet', 'Links', 'claude.exe'),
      path.join(os.homedir(), '.local', 'bin', 'claude.exe'),
      AD && path.join(AD, 'npm', 'claude'),
    ];
    for (const p of cands) {
      if (!p) continue;
      try { if (fs.existsSync(p)) add(p); } catch (_) {}
    }
  }
  // winget 흔적이 없으면 정상 — 조용히 통과(소음은 게이트를 죽인다).
  if (!found.some((f) => f.kind === 'winget')) return '';

  const others = found.filter((f) => f.kind !== 'winget');
  const lines = [
    '🔴 [팀팩 점검] Claude Code가 winget으로 설치돼 있습니다 — 자동 갱신이 되지 않습니다.',
    '',
    '발견된 설치 경로:',
    ...found.map((f) => '  · ' + f.kind + ': ' + f.p),
    '',
    '실측: 한 직원 PC가 2026-06-29 설치 후 65일간 구버전(2.1.195)에 멈춰 있었고,',
    '에러가 안 나서 본인도 몰랐습니다. 구버전은 쓰는 모델과 기능이 통째로 뒤처집니다.',
    '',
    '정리 — 아래 한 줄을 실행하세요:',
    '  winget uninstall Anthropic.ClaudeCode',
  ];
  if (others.length) {
    lines.push('', '다른 경로(' + others.map((f) => f.kind).join(', ') + ')에도 설치돼 있어 재설치는 필요 없습니다.');
  } else {
    lines.push('', '그 뒤 공식 설치기로 다시 설치하세요:', '  irm https://claude.ai/install.ps1 | iex');
  }
  lines.push('', '확인: claude --version   (정리 후에도 버전이 나오면 정상입니다)');
  return lines.join('\n');
}

// ── 갱신·전환 심부름꾼(hook-doctor-v2) 기동 ─────────────────────────────────
// @AI:INTENT 🔴 2026-07-29 — **이 훅이 doctor를 깨우는 유일한 경로다.**
//   그전까지 doctor는 team-guide.md의 "Claude 전용 지시"(curl+node)로만 불렸는데, 그건 클로드가
//   임의 명령을 못 돌리게 하는 권한 정책에 **차단**된다(팀원 PC 실측: "auto 모드 차단").
//   결과로 doctor가 몇 달째 안 돌았고, 그 하나가 오늘 발견된 증상 전부의 뿌리였다:
//     구 zulgap 미비활성 / dev-pack이 staff에 노출 / 스킬 갱신 미도달 / 사장님 PC 5일 버전 고정(v2.6).
//   훅은 권한 프롬프트 없이 실행되므로 여기로 옮긴다. team-guide-fetch는 install.sh:207로
//   **모든 기존 PC에 이미 등록돼 있어** 재설치·수동 실행 없이 즉시 전파된다.
// @AI:CONSTRAINT detached + unref — 세션 시작을 막지 않는다. doctor 워치독이 210초라 동기로 부르면
//   갱신 창에 걸린 날 팀원 세션이 그만큼 멈춘다.
// @AI:FRAGILE 다운로드를 **자식에게** 맡긴다. 이 훅은 emit()에서 process.exit(0)을 부르므로
//   부모가 시작한 비동기 요청은 완료 전에 죽는다(= 조용한 미갱신). 자식은 부모 종료와 무관하다.
// @AI:INTENT master도 기동한다 — 아래 master 조기 종료보다 **앞에** 둔 이유. 사장님 PC가 7/21 버전에
//   5일간 묶였던 게 정확히 이 자리를 지나쳤기 때문이다.
// @AI:CONSTRAINT 🔴 v1·v2를 **순차** 실행한다 — 둘 다 settings.json을 읽고 쓰므로 병렬로 돌리면
//   나중에 쓴 쪽이 앞의 변경을 통째로 덮는다(lost update). 순서를 지키는 실체는 **execFileSync의 동기성**이다
//   — step(i+1)을 exec 앞으로 옮겨도 https.get은 콜백만 등록하고 반환하므로 v1이 끝난 뒤에야 v2가 돈다
//   (mutation으로 확인). 진짜 위험은 둘을 각각 spawn해 **동시에** 띄우는 구조 변경이니 그것만 하지 말 것.
//   v1 먼저: 가볍고(8s 워치독) prompt-capture 훅만 등록한다. v2는 최대 210s라 뒤에 둔다.
(function launchDoctor() {
  const boot = [
    "const https=require('https'),fs=require('fs'),os=require('os'),path=require('path');",
    "const {execFileSync}=require('child_process');",
    "const dir=path.join(os.homedir(),'.claude','zulgap');",
    // [파일명, 워치독보다 넉넉한 실행 timeout] — 순서가 곧 실행 순서다
    // @AI:CONSTRAINT 🔴 [파일명, 실행 timeout] — **timeout 0 = 받기만 하고 실행하지 않음**.
    //   `team-guide-fetch.js`(자기 자신)가 목록에 있는 이유: 이 파일을 갱신하는 경로가 그전까지
    //   **어디에도 없었다**(install이 1회 복사하고 끝). 그래서 훅 파일에 무엇을 넣어도 기존 PC엔
    //   영원히 안 닿았다 — 2026-07-30 실측: 팀원 PC의 훅이 설치 시점 버전이라 launchDoctor 자체가 없었다.
    //   자기 갱신은 **다음 세션부터** 반영된다(이번 세션은 이미 옛 파일이 메모리에 로드됨).
    // @AI:CONSTRAINT 🔴 `resolve-packs.js` 는 **hook-doctor-v2 보다 앞**이어야 한다 — v2 가 이 스크립트를
    //   실행해 팩 판정을 받기 때문이다. 뒤에 두면 첫 세션엔 파일이 없어 v2 가 판정 불가로 떨어진다
    //   (안전하긴 하나 전환이 하루 늦는다). timeout 0 = 받기만 하고 실행하지 않음.
    // [파일명, 실행 timeout, 레포 내 경로] — 경로 생략 시 'hooks/'.
    //   🔴 resolve-packs.js 는 레포 **루트**에 있다(설치기 3장부가 공유하는 SSOT라 hooks/ 소속이 아니다).
    //   경로 인자가 없으면 'hooks/resolve-packs.js' 를 받으러 가 404 로 조용히 실패한다.
    "const items=[['resolve-packs.js',0,''],['hook-doctor.js',30000],['hook-doctor-v2.js',210000],['team-guide-fetch.js',0]];",
    "function step(i){",
    "  if(i>=items.length)return;",
    "  const [name,tmo,sub]=items[i];const d=path.join(dir,name);const rel=(sub===undefined?'hooks/':sub)+name;",
    // 받기 실패해도 로컬 기존본으로 실행 — 네트워크가 갱신을 막을 뿐 실행까지 막지는 않게 한다
    "  const go=()=>{if(tmo>0){try{execFileSync(process.execPath,[d],{stdio:'ignore',timeout:tmo});}catch(_){}}step(i+1);};",
    "  const r=https.get('" + RAW + "'+rel,{timeout:8000},(res)=>{",
    "    if(res.statusCode!==200){res.resume();return go();}",
    "    let s='';res.on('data',(c)=>{s+=c;});",
    "    res.on('end',()=>{try{fs.mkdirSync(dir,{recursive:true});fs.writeFileSync(d,s);}catch(_){}go();});",
    "  });",
    "  r.on('error',go);r.on('timeout',()=>{r.destroy();go();});",
    "}",
    "step(0);",
  ].join('\n');
  try {
    const { spawn } = require('child_process');
    spawn(process.execPath, ['-e', boot], { detached: true, stdio: 'ignore' }).unref();
  } catch (_) { /* 기동 실패해도 안내문 주입은 계속 — 세션 절대 차단 X */ }
})();

const CREDS = readCreds();
const CLAIMS = CREDS && CREDS.claims;
const role = resolveRole(CLAIMS);
const tenant = tenantFromClaims(CLAIMS);

// @AI:INTENT 2026-08-17 — 안내문은 **인증 경로**로 받는다. A3-1 은 외부 테넌트만 옮겼고
//   여기서 **내부까지 전부** 옮긴다(A3-2b). 갈림의 기준이 「어느 회사인가」에서
//   「토큰이 있는가」로 바뀌었다 — 무엇을 받을지는 이제 전적으로 서버가 정한다.
// @AI:CONSTRAINT 🔴 주소에 회사 식별자를 넣지 말 것. 받을 대상은 **서버가 토큰에서 정한다**
//   (`shared/mcp-ext-auth.js` 가 Bearer 검증 + tenant·role 강제 + IDOR 차단). 식별자를 URL 에
//   두면 그 주소를 아는 것만으로 접근이 되고, 우리 저장소 밖의 자산 주소와도 모양이 겹친다.
// @AI:TENANT 🔴 그전에는 내부/외부 갈림을 **검증 안 된 클레임**으로 해서 클라가 내부를
//   자칭할 수 있었다. 이제 판정이 서버에 있어 그 여지가 없다 — 아래 tenant·role 은
//   「어느 캐시 파일을 쓸까」를 정하는 **로컬 힌트**일 뿐이고, 자칭해도 자기 캐시만 갈린다.
// @AI:FRAGILE 캐시 파일명은 테넌트·역할별로 갈라야 한다 — 이름을 공유하면 한 PC에서
//   네트워크 실패 시 남의 캐시를 읽어 격리가 캐시로 새어나간다.
const useServer = !!CREDS;
const variantHint = role === 'dev' ? 'dev' : 'staff';

// @AI:CONSTRAINT 🔴 이 판정은 **배달 통로와 무관**해졌다 — 남은 쓰임은 아래 「사장님 조기 종료」
//   하나뿐이다. 지우지 말 것: 빼면 외부 고객사의 ADMIN 도 master 로 접혀 안내문을 한 줄도
//   못 받는다(에러 없이 조용히). 토큰이 없는 경우까지 포함해 그전과 같은 값을 유지한다.
const isOurAdminSeat = !tenant || INTERNAL_TENANTS.has(tenant);

// @AI:CONSTRAINT 🔴 토큰이 없으면 **공개본으로 폴백하되 그 사실을 화면에 띄운다.**
//   조용히 폴백하면 「나는 왜 남과 다른 안내를 보는가」를 아무도 모르고, 저장소가
//   비공개로 바뀌는 날 그 PC 들이 **한꺼번에 소리 없이** 안내문을 잃는다.
//   폴백 자체를 지금 없애지 않는 이유는 회귀 0 — 토큰 발급 전 PC 가 몇 대인지
//   셀 방법이 없다(그 PC 는 서버에 아무 흔적을 안 남긴다).
const NO_TOKEN_WARN = useServer ? '' : [
  '🔴 제디 토큰이 없어 **공개본**을 받았습니다 — 이 회사 전용 안내가 아닙니다.',
  '담당자에게 토큰 발급을 요청하세요. (등록하면 다음 세션부터 자동으로 전용 안내를 받습니다)',
].join('\n');

const URL = useServer
  ? CREDS.url + '/mcp/ext/team-guide'
  : (role === 'dev' ? RAW + 'docs/dev-guide-en.md' : RAW + 'team-guide.md');
const CACHE = path.join(
  ZULGAP_DIR,
  useServer
    ? 'guide.' + (tenant || 'unknown') + '.' + variantHint + '.cache.md'
    : (role === 'dev' ? 'dev-guide.cache.md' : 'team-guide.cache.md')
);
const MAX = 9500; // additionalContext 약 10k자 한도 안전선
const INSTALL_WARN = checkClaudeInstall(); // '' 이면 정상 — 아래 emit이 알아서 생략

function emit(text) {
  // 경고는 안내문보다 **앞에** 붙인다(뒤에 두면 MAX 9500 절단에 잘려 나간다).
  // @AI:CONSTRAINT 토큰 없음 경고는 **본문이 있을 때만** 붙인다 — 아래 사장님 조기 종료가
  //   emit('') 로 들어오므로, 무조건 붙이면 개인 컨텍스트 보존이 깨지고 매 세션 경고가 뜬다.
  const head = [INSTALL_WARN, (text && NO_TOKEN_WARN) || ''].filter(Boolean).join('\n\n---\n\n');
  const body = head ? (head + (text ? '\n\n---\n\n' + text : '')) : text;
  if (!body) { process.exit(0); } // 줄 게 없으면 조용히 종료 (CLAUDE.md stub가 최소 보장)
  process.stdout.write(JSON.stringify({
    hookSpecificOutput: { hookEventName: 'SessionStart', additionalContext: String(body).slice(0, MAX) }
  }));
  process.exit(0);
}

// 사장님(admin) — 팀 가이드는 주입 안 함(개인 CLAUDE.md/메모리 보존).
// 단 설치 경로 문제는 역할과 무관하므로 경고만은 전달한다. emit('')이 경고 유무를 알아서 처리.
// @AI:FRAGILE 이 분기는 MAX/emit 선언 **뒤에** 있어야 한다 — 앞으로 옮기면 const TDZ로 즉사.
// @AI:TENANT 🔴 `isOurAdminSeat` 를 빼지 말 것 — 이 훅의 role 매핑은 서버보다 거칠어서
//   **어느 테넌트든** ADMIN 이면 'master' 로 접힌다. 외부 고객사의 관리자도 ADMIN 이라
//   조건이 없으면 그분들은 안내문을 **한 줄도** 못 받는다(에러 없이 조용히).
//   서버 SSOT 는 `shared/mcp-permission-resolver.js` — isMaster = **마스터 테넌트의** ADMIN 뿐이다.
//   여기서는 그 정의에 맞춰 「내 테넌트가 아닌 곳의 ADMIN」만 조기 종료에서 뺀다.
//   조기 종료의 의도(사장님 개인 컨텍스트 보존)는 외부 테넌트에 해당하지 않는다.
if (role === 'master' && isOurAdminSeat) { emit(''); }

// ── 캐시 신선도 ────────────────────────────────────────────────────────────
// @AI:CONSTRAINT 🔴 캐시에 나이 제한이 없으면 **구독이 끝난 뒤에도 마지막 안내문이 영구히 남는다.**
//   서버가 「이제 주지 않는다」고 답해도 화면은 옛 내용을 계속 띄우게 된다.
// @AI:INTENT 2026-08-17 A3-2b — 제한을 **인증 경로 전체**로 넓혔다(그전에는 외부만).
//   내부도 같은 통로가 됐으므로 같은 규칙을 받는다. 공개본 폴백(무토큰)만 `Infinity` 로
//   남는데, 그쪽은 어차피 매 세션 「토큰이 없다」는 경고를 함께 보고 있다.
const STALE_DAYS = useServer ? 7 : Infinity;
function cache() {
  try {
    const txt = fs.readFileSync(CACHE, 'utf8');
    const ageDays = (Date.now() - fs.statSync(CACHE).mtimeMs) / 86400000;
    if (ageDays > STALE_DAYS) {
      // fail-loud — 옛 안내문을 조용히 쓰지 않고, 대신 사람이 볼 수 있게 사유를 띄운다.
      return '🔴 팀 안내문을 ' + Math.floor(ageDays) + '일째 받지 못했습니다 (허용 ' + STALE_DAYS + '일).\n'
        + '옛 안내문은 쓰지 않습니다 — 인터넷 연결과 제디 토큰을 확인하시거나 담당자에게 문의하세요.';
    }
    return txt;
  } catch { return ''; }
}

// @AI:CONSTRAINT 🔴 인증 실패·미등록을 **조용히 넘기지 않는다** (A2 「조용한 실패 제거」의 연장).
//   private 전환 후 첫 실패 지점이 여기라, 화면에 안 뜨면 「설치는 됐는데 안내가 없다」로만 보인다.
function authHint(status) {
  if (status === 404) {
    return '🔴 이 회사(테넌트)의 팀 안내문이 서버에 등록돼 있지 않습니다.\n담당자에게 안내문 등록을 요청하세요.';
  }
  if (status === 401 || status === 403) {
    return '🔴 제디 토큰이 만료되었거나 거부되었습니다 (HTTP ' + status + ').\n담당자에게 토큰 재발급을 요청하세요.';
  }
  return '';
}

// @AI:INTENT 인증 경로에만 Bearer 를 붙인다. 공개본 폴백(무토큰)은 헤더가 없어야 한다
//   (GitHub raw 에 Authorization 을 보내면 요청이 거부될 수 있다).
const REQ_OPTS = useServer
  ? { timeout: 4000, headers: { Authorization: 'Bearer ' + CREDS.token } }
  : { timeout: 4000 };

// @AI:INTENT 프로토콜로 모듈을 고른다 — 형제 파일 `teampack-config.js` 와 같은 형태.
//   운영은 언제나 https 이고, 이 분기는 **로컬 테스트가 실제 요청을 받아볼 수 있게** 한다
//   (그전에는 https 고정이라 훅의 실패 표시를 사람 눈으로만 확인할 수 있었다).
const get = (u, o, cb) => (String(u).startsWith('http://') ? http : https).get(u, o, cb);

const req = get(URL, REQ_OPTS, (res) => {
  if (res.statusCode !== 200) {
    res.resume();
    // 404 는 서버의 **확정 답변**이라 캐시로 덮지 않는다 — 해지가 곧 배달 중단이 되게.
    if (useServer && res.statusCode === 404) return emit(authHint(404));
    const hint = useServer ? authHint(res.statusCode) : '';
    const body = cache();
    return emit(hint ? (hint + (body ? '\n\n---\n\n' + body : '')) : body);
  }
  let data = '';
  res.on('data', (d) => { data += d; });
  res.on('end', () => {
    try { fs.mkdirSync(path.dirname(CACHE), { recursive: true }); fs.writeFileSync(CACHE, data); } catch {}
    emit(data);
  });
});
req.on('error', () => emit(cache()));
req.on('timeout', () => { req.destroy(); emit(cache()); });
