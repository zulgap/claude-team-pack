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
      timeout: 60000,
    }, (res) => {
      let result = '';
      res.on('data', chunk => result += chunk);
      res.on('end', () => {
        try { resolve(JSON.parse(result)); } catch { resolve(result); }
      });
    });
    req.on('error', reject);
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
