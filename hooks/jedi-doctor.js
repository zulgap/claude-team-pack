#!/usr/bin/env node
'use strict';
/**
 * jedi-doctor — 제디(jedi) MCP 연결 자가진단 (의존성 0, node 내장 모듈만)
 * @AI:INTENT "제디 -32000 / 연결 안됨" 발생 시 각 계층을 점검해 실패 지점을 콕 집어 출력.
 *   ~/.claude.json 설정 → 브리지 파일/의존성 → 토큰 형식·만료 → 백엔드 실제 호출(200/401).
 * 실행: node jedi-doctor.js   (또는 curl 로 받아 실행)
 * 안전: 읽기 전용 + 백엔드 GET-성격 호출뿐. 아무 것도 수정하지 않음.
 */
const fs = require('fs');
const path = require('path');
const os = require('os');
const https = require('https');

function line() { console.log('────────────────────────────────────────────────'); }
function ok(m) { console.log('  [OK]   ' + m); }
function bad(m) { console.log('  [문제] ' + m); }
function warn(m) { console.log('  [주의] ' + m); }

console.log('');
console.log('제디(jedi) MCP 연결 진단');
line();

// 1) ~/.claude.json 의 jedi 설정
const cfgPath = path.join(os.homedir(), '.claude.json');
let jedi = null;
try {
  const cfg = JSON.parse(fs.readFileSync(cfgPath, 'utf8'));
  jedi = cfg && cfg.mcpServers && cfg.mcpServers.jedi;
  if (jedi) ok('~/.claude.json 에서 jedi 설정 발견');
  else bad('~/.claude.json 에 mcpServers.jedi 없음 → install.bat 재실행하여 토큰 입력');
} catch (e) {
  bad('~/.claude.json 읽기/파싱 실패: ' + e.message + ' → install.bat 재실행');
}
if (!jedi) { line(); console.log(''); process.exit(1); }

const bridgePath = Array.isArray(jedi.args) ? jedi.args[0] : null;
const url = jedi.env && jedi.env.JUDGMENTOS_URL;
const token = jedi.env && jedi.env.JUDGMENTOS_TOKEN;

console.log('');
jedi.command ? ok('command: ' + jedi.command) : bad('command 없음 (설정 형태 이상)');
bridgePath ? ok('bridge 경로: ' + bridgePath) : bad('args(브리지 경로) 없음');
url ? ok('URL: ' + url) : bad('JUDGMENTOS_URL 없음');
token ? ok('토큰: 있음 (' + token.length + '자)') : bad('JUDGMENTOS_TOKEN 없음 → install.bat 재실행');

// 2) node + 브리지 파일 + 의존성
console.log('');
ok('node 실행 가능: ' + process.version);
if (bridgePath) {
  fs.existsSync(bridgePath)
    ? ok('브리지 파일 존재')
    : bad('브리지 파일 없음: ' + bridgePath + ' → claude-team-pack 폴더 이동/삭제됨. install.bat 다시 실행');
  const sdk = path.join(path.dirname(bridgePath), 'node_modules', '@modelcontextprotocol', 'sdk', 'package.json');
  fs.existsSync(sdk)
    ? ok('브리지 의존성(@modelcontextprotocol/sdk) 설치됨')
    : bad('브리지 의존성 미설치 → install.bat 재실행(자동 npm install) 또는 인터넷 확인');
}

// 3) 토큰 형식·만료 (서명 검증 X, 디코드만)
if (token) {
  console.log('');
  const parts = token.split('.');
  if (parts.length !== 3) {
    bad('토큰이 JWT 형식 아님(3파트 아님) = 붙여넣기 잘림 의심 → 새 토큰 한 줄 통째로 재입력');
  } else {
    try {
      const p = JSON.parse(Buffer.from(parts[1].replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8'));
      const now = Math.floor(Date.now() / 1000);
      if (p.exp && p.exp < now) bad('토큰 만료됨 (' + new Date(p.exp * 1000).toISOString().slice(0, 10) + ') → 사장님께 새 토큰 요청');
      else if (p.exp) ok('토큰 유효: ' + new Date(p.exp * 1000).toISOString().slice(0, 10) + ' 까지');
      if (p.tenant_id) ok('tenant: ' + p.tenant_id + (p.role ? '  role: ' + p.role : ''));
    } catch (e) { bad('토큰 payload 디코드 실패(잘림 의심): ' + e.message); }
  }
}

// 4) 백엔드 실제 호출
line();
console.log('  백엔드 실제 연결 테스트 중...');
if (!url || !token) { bad('URL 또는 토큰이 없어 백엔드 테스트 skip'); line(); console.log(''); process.exit(1); }
const u = new URL('/mcp/ext/tools', url);
const body = '{}';
const req = https.request({
  method: 'POST', hostname: u.hostname, path: u.pathname,
  headers: { 'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) },
  timeout: 20000,
}, (res) => {
  let b = ''; res.on('data', c => b += c); res.on('end', () => {
    console.log('');
    if (res.statusCode === 200) {
      let n = 0; try { n = (JSON.parse(b).tools || []).length; } catch (_) {}
      ok('백엔드 200 OK — 도구 ' + n + '개 응답. 토큰·연결 정상!');
      console.log('');
      console.log('  → 위가 전부 정상인데도 Claude Code에서 -32000 이면:');
      console.log('     Claude Code(줄갭 Claude)를 완전히 종료 후 재시작 (설정 재로딩).');
    } else if (res.statusCode === 401) {
      bad('백엔드 401 (토큰 무효/만료): ' + b.slice(0, 120));
      console.log('     → 사장님께 새 토큰 요청 후 install.bat 재실행하여 한 줄 통째로 재입력');
    } else {
      bad('백엔드 HTTP ' + res.statusCode + ': ' + b.slice(0, 160));
    }
    line(); console.log('');
  });
});
req.on('timeout', () => { req.destroy(); console.log(''); bad('백엔드 응답 timeout(20초) → 인터넷/방화벽 확인'); line(); console.log(''); });
req.on('error', (e) => { console.log(''); bad('백엔드 연결 에러: ' + e.message + ' → 인터넷/URL 확인'); line(); console.log(''); });
req.write(body); req.end();
