#!/usr/bin/env node
/**
 * naver-fill 결과 검증 단위 시험 — 브라우저 없이 «판정»만 시험한다.
 *
 * 왜 필요한가: 2026-08-16 마미사 1편 실전에서 도구가 「10장 다 올라갔다」고 보고했는데
 * 화면에는 9장뿐이었다. 판정이 내부 카운터를 보고 있어서다. 그 상태가 ready_to_register 로
 * 나갔고, 사람이 그대로 눌렀으면 그림 한 장이 빠진 채 발행됐다.
 * e2e 로만 덮으면 이 판정은 실전에서만 깨진다 — 그때는 이미 늦다.
 */
const path = require('path');
const { verifyFilled } = require(path.join(__dirname, 'naver-fill.js'));

let pass = 0, fail = 0;
const ok = (name, cond, detail = '') => {
  if (cond) { pass += 1; console.log(`  ✅ ${name}`); }
  else { fail += 1; console.log(`  ❌ ${name}${detail ? '  → ' + detail : ''}`); }
};
const body = (o = {}) => ({ chars: 100, naverImages: 0, externalImages: 0, placeholders: 0, ...o });
const EMPTY = body();

console.log('\n[1] 정상 — 화면 개수가 원고와 같다');
{
  const p = verifyFilled({ start: EMPTY, end: body({ naverImages: 10 }), expected: 10, uploaded: 10 });
  ok('문제 없음', p.length === 0, JSON.stringify(p));
}

console.log('\n[2] 🔴 회귀 방어 — 카운터는 10인데 화면은 9 (마미사 1편 실제 상황)');
{
  const p = verifyFilled({ start: EMPTY, end: body({ naverImages: 9 }), expected: 10, uploaded: 10 });
  ok('문제로 잡는다', p.length > 0, '못 잡으면 그림 빠진 글이 발행된다');
  ok('화면 개수를 말한다', p.some((x) => /9\/10/.test(x)), JSON.stringify(p));
  ok('카운터와 어긋났음을 알린다', p.some((x) => /재시도가 겹쳐/.test(x)), JSON.stringify(p));
}

console.log('\n[3] 이미지가 아예 덜 올라간 경우');
{
  const p = verifyFilled({ start: EMPTY, end: body({ naverImages: 7 }), expected: 10, uploaded: 7 });
  ok('문제로 잡는다', p.some((x) => /7\/10/.test(x)), JSON.stringify(p));
  ok('어긋남 문구는 «안» 붙는다(카운터와 화면이 같으니)', !p.some((x) => /재시도가 겹쳐/.test(x)));
}

console.log('\n[4] 실패 자리(placeholder)가 남았다');
{
  const p = verifyFilled({ start: EMPTY, end: body({ naverImages: 10, placeholders: 1 }), expected: 10, uploaded: 10 });
  ok('문제로 잡는다', p.some((x) => /깨진 채 발행/.test(x)), JSON.stringify(p));
}

console.log('\n[5] 외부 주소 이미지가 남았다');
{
  const p = verifyFilled({ start: EMPTY, end: body({ naverImages: 9, externalImages: 1 }), expected: 10, uploaded: 10 });
  ok('문제로 잡는다', p.some((x) => /외부 주소/.test(x)), JSON.stringify(p));
}

console.log('\n[6] 이미지가 없는 카드');
{
  const p = verifyFilled({ start: EMPTY, end: body({ naverImages: 0 }), expected: 0, uploaded: 0 });
  ok('문제 없음', p.length === 0, JSON.stringify(p));
}

console.log('\n[7] 시작 창에 이미 네이버 이미지가 있던 경우 — 「차이」로 센다');
{
  const p = verifyFilled({ start: body({ naverImages: 2 }), end: body({ naverImages: 12 }), expected: 10, uploaded: 10 });
  ok('남의 이미지를 우리 것으로 세지 않는다', p.length === 0, JSON.stringify(p));
}

console.log('\n[8] uploaded 를 안 넘겨도 판정한다(호출부가 늘어도 안 깨지게)');
{
  const p = verifyFilled({ start: EMPTY, end: body({ naverImages: 9 }), expected: 10 });
  ok('화면 기준으로 잡는다', p.some((x) => /9\/10/.test(x)), JSON.stringify(p));
}

console.log('\n──────────────────────────────────────────────');
console.log(fail === 0 ? `✅ ALL PASS  ${pass}/${pass + fail}` : `❌ FAIL  ${pass}/${pass + fail}`);
process.exit(fail === 0 ? 0 : 1);
