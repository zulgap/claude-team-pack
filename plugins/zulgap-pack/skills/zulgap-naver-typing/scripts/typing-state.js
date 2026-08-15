#!/usr/bin/env node
/**
 * 타이핑 진행 상태 기록 — «등록했는데 기록이 없는» 사고를 막는다.
 *
 * @AI:INTENT 노션 갱신은 SKILL.md 가 MCP 로 한다. 이 파일은 그 «사이»를 지킨다 —
 *   등록(불가역)을 하기 «전»에 먼저 적어 두고, 노션 갱신이 확인되면 지운다.
 *   남아 있는 줄 = 「확인 안 된 것」이다.
 *
 * @AI:CONSTRAINT 실패한 «뒤»에 적으면 안 된다. 그 적는 행위 자체가 실패하거나
 *   그 전에 죽으면 흔적이 0이 되고, 다음 실행이 같은 카드를 다시 올려 «중복 게시»가 된다.
 *
 * 상태 3갈래 — unknown 을 not_posted 로 뭉개면 재발행 사고가 난다.
 *   posted      등록 + 노션 갱신 확인
 *   not_posted  등록 안 함 (선점만 하고 중단 등)
 *   unknown     등록은 했는데 확인 못 함  ← 사람이 봐야 한다
 */

const fs = require('fs');
const path = require('path');

const FILE = path.join(path.resolve(__dirname, '..'), '.outbox.jsonl');
const STATES = ['pending_register', 'posted', 'not_posted', 'unknown'];

function nowIso() { return new Date().toISOString(); }

/** 원자적 append — 여러 창이 같은 파일에 써도 줄이 안 섞인다 */
function append(entry) {
  const row = { ...entry, at: nowIso() };
  fs.appendFileSync(FILE, JSON.stringify(row) + '\n', 'utf8');
  return row;
}

/**
 * 🔴 등록 «전»에 부른다. 여기서 죽어도 「등록했을 수 있음」이 남는다.
 */
function markBeforeRegister({ card_id, card_title, target_stage, blog_key, operator }) {
  if (!card_id) throw new Error('card_id 필수');
  return append({ card_id, card_title, target_stage: target_stage || '9. 타이핑 완료',
                  blog_key, operator, state: 'pending_register' });
}

/** 노션 갱신까지 확인된 뒤에 부른다 */
function markPosted(card_id, extra = {}) {
  return append({ card_id, state: 'posted', ...extra });
}

/** 등록은 했는데 노션 갱신을 확인 못 했을 때 — 사람이 봐야 하는 상태 */
function markUnknown(card_id, reason) {
  return append({ card_id, state: 'unknown', reason });
}

/** 등록하지 않고 끝냈을 때 (선점만 하고 중단 등) */
function markNotPosted(card_id, reason) {
  return append({ card_id, state: 'not_posted', reason });
}

function readAll() {
  if (!fs.existsSync(FILE)) return { rows: [], malformed: 0 };
  const rows = []; let malformed = 0;
  for (const line of fs.readFileSync(FILE, 'utf8').split('\n')) {
    const t = line.trim();
    if (!t) continue;
    try { rows.push(JSON.parse(t)); } catch { malformed += 1; }
  }
  return { rows, malformed };
}

/**
 * 카드별 «마지막» 상태로 접는다.
 * @returns {{open: [], settled: [], malformed: number}}
 *   open = 아직 확인 안 된 것 (pending_register / unknown) ← 다음 실행이 먼저 처리해야 한다
 */
function pending() {
  const { rows, malformed } = readAll();
  const last = new Map();
  for (const r of rows) if (r.card_id) last.set(r.card_id, r);
  const all = [...last.values()];
  return {
    open: all.filter((r) => r.state === 'pending_register' || r.state === 'unknown'),
    settled: all.filter((r) => r.state === 'posted' || r.state === 'not_posted'),
    malformed,
  };
}

/** 확인이 끝난 줄을 걷어낸다 (open 만 남긴다) — 파일이 무한히 자라지 않게 */
function compact() {
  const { open, malformed } = pending();
  const tmp = FILE + '.tmp';
  fs.writeFileSync(tmp, open.map((r) => JSON.stringify(r)).join('\n') + (open.length ? '\n' : ''), 'utf8');
  fs.renameSync(tmp, FILE);      // 원자적 교체
  return { kept: open.length, malformed };
}

module.exports = { FILE, STATES, markBeforeRegister, markPosted, markUnknown, markNotPosted,
                   readAll, pending, compact, append };

if (require.main === module) {
  const cmd = process.argv[2];
  if (cmd === 'pending') {
    const p = pending();
    console.log(JSON.stringify({
      확인안된것: p.open.length,
      목록: p.open.map((r) => ({ 카드: r.card_title || r.card_id, 상태: r.state, 시각: r.at, 사유: r.reason })),
      정리된것: p.settled.length,
      깨진줄: p.malformed,
    }, null, 2));
  } else if (cmd === 'compact') {
    console.log(JSON.stringify(compact(), null, 2));
  } else {
    console.log('사용: node typing-state.js pending | compact');
  }
}
