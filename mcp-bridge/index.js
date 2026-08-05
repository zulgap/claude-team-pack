#!/usr/bin/env node
// judgmentos-mcp-bridge/index.js
// @AI:INTENT 범용 MCP Bridge — 맥북/고객PC/직원PC → stdio MCP → HTTPS → Railway unified-agent
//   2 인증 모드 (스펙 2026-06-28-zulgap-mcp-sandbox-platform §2-A 인증 2계층):
//   - 서비스 모드(A, 기존): JUDGMENTOS_SECRET → x-service-secret + /mcp/bridge/* (OpenClaw/Forge). byte-identical 보존.
//   - 외부 모드(B, 신규 PR-4): JUDGMENTOS_TOKEN(per-tenant JWT Bearer) → Authorization + /mcp/ext/* (직원/외부 회사).
//   TOOL_FILTER 환경변수: 'openclaw'(기본)/'forge'/미설정=전체 — 서비스 모드만 적용(외부는 서버가 READ∩블록다이얼 자동 필터).
'use strict';

const https = require('https');
const { Server } = require('@modelcontextprotocol/sdk/server/index.js');
const { StdioServerTransport } = require('@modelcontextprotocol/sdk/server/stdio.js');
const { ListToolsRequestSchema, CallToolRequestSchema } = require('@modelcontextprotocol/sdk/types.js');

const JUDGMENTOS_URL = process.env.JUDGMENTOS_URL;
const JUDGMENTOS_SECRET = process.env.JUDGMENTOS_SECRET;
const JUDGMENTOS_TOKEN = process.env.JUDGMENTOS_TOKEN; // @AI:INTENT 외부 모드 트리거 — per-tenant JWT Bearer
const TENANT_ID = process.env.TENANT_ID || '';
const READ_TENANT_ID = process.env.READ_TENANT_ID || '';

// @AI:INTENT 외부 모드 = JUDGMENTOS_TOKEN 존재. 토큰이 권한·테넌트의 단일 출처(서버가 클레임에서 파생).
const EXTERNAL_MODE = !!(JUDGMENTOS_TOKEN && String(JUDGMENTOS_TOKEN).trim());

if (!JUDGMENTOS_URL) {
  console.error('JUDGMENTOS_URL env var required');
  process.exit(1);
}
// @AI:CONSTRAINT 모드별 필수 크레덴셜 — 외부 모드는 TOKEN, 서비스 모드는 SECRET. 혼동 시 인증 실패.
if (!EXTERNAL_MODE && !JUDGMENTOS_SECRET) {
  console.error('JUDGMENTOS_SECRET (service mode) or JUDGMENTOS_TOKEN (external mode) env var required');
  process.exit(1);
}

// @AI:INTENT 엔드포인트 + 인증 헤더를 모드로 결정. 서비스 경로(/mcp/bridge/*, x-service-secret)는 byte-identical.
const ENDPOINTS = EXTERNAL_MODE
  ? { tools: '/mcp/ext/tools', call: '/mcp/ext/call' }
  : { tools: '/mcp/bridge/tools', call: '/mcp/bridge/call' };

function authHeaders() {
  return EXTERNAL_MODE
    ? { 'Authorization': `Bearer ${JUDGMENTOS_TOKEN}` }
    : { 'x-service-secret': JUDGMENTOS_SECRET };
}

function callJudgmentOS(path, body) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, JUDGMENTOS_URL);
    const data = JSON.stringify(body);
    const req = https.request({
      method: 'POST',
      hostname: url.hostname,
      path: url.pathname,
      headers: {
        'Content-Type': 'application/json',
        ...authHeaders(),
        'Content-Length': Buffer.byteLength(data),
      },
      // @AI:CONSTRAINT 소켓 무통신 허용치 — 서버 영상 폴링 상한(모델별 5~10분)보다 길어야 한다.
      //   60초였을 때 Seedance 호출이 폴링 도중 끊겼고, 서버는 클라 절단을 감지하지 않아 생성을 끝까지
      //   진행했다. 그래서 재호출 = 같은 영상 2회 생성 = 2회 과금이 됐다(이슈 #132, 실측 초과 5건).
      timeout: 720000,
    }, (res) => {
      // @AI:CONSTRAINT 청크 경계 한글 손상 차단. 이 줄이 없으면 Buffer 가 청크마다 따로 디코드돼
      //   3바이트 한글이 경계에 걸릴 때 깨진다 → JSON.parse 실패 → 아래 catch → 「빈 응답」.
      //   응답이 클수록(base64 동봉 시 약 1.9MB) 청크가 늘어 확률이 올라갔다. judgmentos 레포는
      //   34194321c 에서 전역 수리됐으나 이 사본에 전파되지 않아 두 달간 남아 있었다.
      res.setEncoding('utf8');
      let result = '';
      res.on('data', chunk => result += chunk);
      res.on('end', () => {
        // @AI:INTENT 실패를 삼키지 않는다 — 구버전은 상태코드를 읽지 않고, 파싱 실패 시 원문을 그대로
        //   resolve 했다. 그러면 MCP 클라이언트에 content 없는 응답이 가서 「성공했는데 빈 응답」으로
        //   보이고, 호출자는 실패인지 알 수 없어 재호출한다. 여기서 확실히 던져야 재시도를 판단할 수 있다.
        if (res.statusCode < 200 || res.statusCode >= 300) {
          reject(new Error(`JudgmentOS HTTP ${res.statusCode}: ${String(result).slice(0, 300)}`));
          return;
        }
        try {
          resolve(JSON.parse(result));
        } catch {
          reject(new Error(
            `JudgmentOS 응답 파싱 실패 (${Buffer.byteLength(result)}바이트): ${String(result).slice(0, 300)}`
          ));
        }
      });
    });
    req.on('error', reject);
    // @AI:INTENT timeout 옵션만 두면 소켓이 조용히 닫히기만 하고 아무도 알려주지 않는다.
    //   핸들러를 붙여야 destroy + reject 로 이어진다(같은 패턴: unified-agent video-tools-v2.js).
    req.on('timeout', () => {
      req.destroy();
      reject(new Error('JudgmentOS 요청 타임아웃 (720초 무응답)'));
    });
    req.write(data);
    req.end();
  });
}

async function main() {
  // Fetch tool list from JudgmentOS
  // @AI:INTENT 서비스 모드는 TOOL_FILTER로 범위 제어. 외부 모드는 빈 body — 서버(buildToolList external tier)가
  //   READ 화이트리스트 ∩ tenant.allowed_blocks로 자동 축소(클라 filter 무시 = 스펙 §2-B 블록 다이얼).
  const toolsBody = EXTERNAL_MODE ? {} : { filter: process.env.TOOL_FILTER || 'openclaw' };
  const toolsResponse = await callJudgmentOS(ENDPOINTS.tools, toolsBody);
  const tools = toolsResponse.tools || [];

  const server = new Server({ name: 'judgmentos-bridge', version: '0.2.0' }, { capabilities: { tools: {} } });

  server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools }));

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;
    if (EXTERNAL_MODE) {
      // @AI:CONSTRAINT 외부 모드 — tenant_id 절대 주입 금지. 서버 resolveCallContext가 토큰 클레임에서만 파생하고
      //   클라 자칭 tenant_id는 tenant_mismatch로 거부됨(스펙 §2-A B계층). args 원본 그대로 전달.
      const result = await callJudgmentOS(ENDPOINTS.call, { name, args: args || {} });
      return result;
    }
    // 서비스 모드(기존) — TENANT_ID 주입, byte-identical 보존
    const enrichedArgs = {
      ...args,
      tenant_id: args.tenant_id || TENANT_ID,
      read_tenant_id: args.read_tenant_id || READ_TENANT_ID || undefined,
    };
    const result = await callJudgmentOS(ENDPOINTS.call, { name, args: enrichedArgs });
    return result;
  });

  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch(err => { console.error(err); process.exit(1); });
