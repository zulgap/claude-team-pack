#!/usr/bin/env node
/** typing-state 시나리오 — 「등록했는데 기록이 없는」 사고를 막는지 검증 */
const fs = require('fs');
const S = require('./typing-state');

let pass = 0, fail = 0;
const ok = (n, c, d = '') => { c ? (pass++, console.log(`  ✅ ${n}`)) : (fail++, console.log(`  ❌ ${n}${d ? '  → ' + d : ''}`)); };
const reset = () => { try { fs.unlinkSync(S.FILE); } catch {} };

console.log('\n[1] 등록 «전» 선기록 (write-ahead)');
{
  reset();
  S.markBeforeRegister({ card_id: 'c1', card_title: '신용장 서류하자', blog_key: 'rpg', operator: 'me' });
  const p = S.pending();
  ok('등록 전에 이미 기록돼 있다', p.open.length === 1 && p.open[0].state === 'pending_register');
  ok('카드 제목이 남는다 (id 만 남으면 사람이 못 알아본다)', p.open[0].card_title === '신용장 서류하자');

  // 여기서 프로세스가 죽었다고 가정 → 다음 실행이 읽는다
  const after = S.pending();
  ok('죽어도 다음 실행이 「확인 안 된 것」으로 본다', after.open.length === 1);
}

console.log('\n[2] 정상 완료 → 정리됨');
{
  S.markPosted('c1', { stage: '9. 타이핑 완료' });
  const p = S.pending();
  ok('확인되면 open 에서 빠진다', p.open.length === 0);
  ok('settled 로 옮겨진다', p.settled.length === 1 && p.settled[0].state === 'posted');
}

console.log('\n[3] 🔴 unknown 을 not_posted 로 뭉개지 않는다');
{
  reset();
  S.markBeforeRegister({ card_id: 'c2', card_title: '관세 부가세' });
  S.markUnknown('c2', '등록은 눌렀는데 노션 갱신 실패');
  const p = S.pending();
  ok('unknown 은 «열린 것»으로 남는다 (사람이 봐야 함)', p.open.length === 1 && p.open[0].state === 'unknown');
  ok('사유가 남는다', /노션 갱신 실패/.test(p.open[0].reason));

  S.markNotPosted('c3', '선점만 하고 중단');
  const p2 = S.pending();
  ok('not_posted 는 열린 것이 아니다', p2.open.filter(r => r.card_id === 'c3').length === 0);
  ok('unknown 과 not_posted 가 섞이지 않는다', p2.open.length === 1 && p2.open[0].card_id === 'c2');
}

console.log('\n[4] 여러 창이 같이 써도 줄이 안 섞인다');
{
  reset();
  for (let i = 0; i < 40; i++) S.markBeforeRegister({ card_id: 'x' + i, card_title: '카드' + i });
  const { rows, malformed } = S.readAll();
  ok('40줄 전부 파싱된다', rows.length === 40, `${rows.length}줄`);
  ok('깨진 줄 0', malformed === 0);
}

console.log('\n[5] 깨진 줄이 있어도 나머지를 읽는다');
{
  fs.appendFileSync(S.FILE, '{"card_id":"broken"\n');   // 일부러 깨뜨림
  const { rows, malformed } = S.readAll();
  ok('깨진 줄을 세어서 알려준다', malformed === 1, `malformed=${malformed}`);
  ok('나머지는 그대로 읽힌다', rows.length === 40);
}

console.log('\n[6] compact — 확인된 것만 걷어낸다');
{
  reset();
  S.markBeforeRegister({ card_id: 'a', card_title: 'A' });
  S.markPosted('a');
  S.markBeforeRegister({ card_id: 'b', card_title: 'B' });   // 미확인
  const r = S.compact();
  ok('확인 안 된 것만 남는다', r.kept === 1, `kept=${r.kept}`);
  const p = S.pending();
  ok('남은 것이 B 다', p.open.length === 1 && p.open[0].card_id === 'b');
  ok('파일이 여전히 읽힌다', S.readAll().malformed === 0);
}

console.log('\n[7] 방어');
{
  let threw = false;
  try { S.markBeforeRegister({ card_title: 'id 없음' }); } catch { threw = true; }
  ok('card_id 없으면 거부한다', threw);
}

reset();
console.log(`\n${'─'.repeat(46)}\nPASS ${pass} / FAIL ${fail}`);
process.exit(fail === 0 ? 0 : 1);
