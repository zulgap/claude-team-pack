#!/usr/bin/env node
/**
 * naver-fill 결과 검증 단위 시험 — 브라우저 없이 «판정»만 시험한다.
 *
 * 왜 필요한가 (2026-08-16 실전에서 두 번 데었다):
 *   ① 도구가 「10장 다 올라갔다」고 보고했는데 화면엔 9장이었다 — 내부 카운터를 보고 있어서다.
 *   ② 그래서 화면 개수(naverImages)로 바꿨더니, 이번엔 «글을 붙이면 이미 올라간 이미지가
 *      화면에서 플레이스홀더로 바뀐다»는 사실 때문에 멀쩡한 글이 실패로 잡혔다.
 *      임시저장분을 서버에서 받아 보니 이미지 URL 이 10개 온전했다 — 표시만 바뀐 것이었다.
 *   → 판정축은 «이미지 자리 수(slots)»다. 표시 상태와 무관하게 늘기만 하므로 흔들리지 않는다.
 */
const path = require('path');
const { verifyFilled } = require(path.join(__dirname, 'naver-fill.js'));

let pass = 0, fail = 0;
const ok = (name, cond, detail = '') => {
  if (cond) { pass += 1; console.log(`  ✅ ${name}`); }
  else { fail += 1; console.log(`  ❌ ${name}${detail ? '  → ' + detail : ''}`); }
};
/** slots = 이미지 자리 수(플레이스홀더 포함), naverImages = 화면에 URL 이 붙은 수 */
const body = (o = {}) => ({ chars: 100, slots: 0, images: 0, naverImages: 0, externalImages: 0, placeholders: 0, ...o });
const EMPTY = body();

console.log('\n[1] 정상 — 자리가 원고 수와 같다');
{
  const p = verifyFilled({ start: EMPTY, end: body({ slots: 10, naverImages: 10 }), expected: 10, uploaded: 10 });
  ok('문제 없음', p.length === 0, JSON.stringify(p));
}

console.log('\n[2] 🔴 회귀 방어 — 자리는 10인데 화면엔 6장만 URL 이 붙었다(글 붙이며 표시가 바뀐 상태)');
{
  const p = verifyFilled({ start: EMPTY, end: body({ slots: 10, naverImages: 6, placeholders: 4 }), expected: 10, uploaded: 8 });
  ok('문제 없음 — 표시일 뿐이다', p.length === 0, JSON.stringify(p));
  ok('플레이스홀더를 문제로 올리지 않는다', !p.some((x) => /실패 자리|깨진/.test(x)), JSON.stringify(p));
}

console.log('\n[3] 🔴 회귀 방어 — 자리가 진짜로 모자란다');
{
  const p = verifyFilled({ start: EMPTY, end: body({ slots: 9, naverImages: 9 }), expected: 10, uploaded: 10 });
  ok('문제로 잡는다', p.some((x) => /9\/10/.test(x)), JSON.stringify(p));
  ok('카운터와 어긋났음을 알린다', p.some((x) => /올렸다고 센 것은 10장/.test(x)), JSON.stringify(p));
}

console.log('\n[4] 이미지가 아예 덜 들어간 경우');
{
  const p = verifyFilled({ start: EMPTY, end: body({ slots: 7, naverImages: 7 }), expected: 10, uploaded: 7 });
  ok('문제로 잡는다', p.some((x) => /7\/10/.test(x)), JSON.stringify(p));
  ok('어긋남 문구는 «안» 붙는다(카운터와 자리 수가 같으니)', !p.some((x) => /올렸다고 센 것은/.test(x)));
}

console.log('\n[5] 외부 주소 이미지가 남았다');
{
  const p = verifyFilled({ start: EMPTY, end: body({ slots: 10, naverImages: 9, externalImages: 1 }), expected: 10, uploaded: 10 });
  ok('문제로 잡는다', p.some((x) => /외부 주소/.test(x)), JSON.stringify(p));
}

console.log('\n[6] 이미지가 없는 카드');
{
  const p = verifyFilled({ start: EMPTY, end: body({ slots: 0 }), expected: 0, uploaded: 0 });
  ok('문제 없음', p.length === 0, JSON.stringify(p));
}

console.log('\n[7] 시작 창에 이미 이미지가 있던 경우 — 「차이」로 센다');
{
  const p = verifyFilled({ start: body({ slots: 2, naverImages: 2 }), end: body({ slots: 12, naverImages: 12 }), expected: 10, uploaded: 10 });
  ok('남의 이미지를 우리 것으로 세지 않는다', p.length === 0, JSON.stringify(p));
}

console.log('\n[8] uploaded 를 안 넘겨도 판정한다(호출부가 늘어도 안 깨지게)');
{
  const p = verifyFilled({ start: EMPTY, end: body({ slots: 9 }), expected: 10 });
  ok('자리 수로 잡는다', p.some((x) => /9\/10/.test(x)), JSON.stringify(p));
}

console.log('\n──────────────────────────────────────────────');
console.log(fail === 0 ? `✅ ALL PASS  ${pass}/${pass + fail}` : `❌ FAIL  ${pass}/${pass + fail}`);
process.exit(fail === 0 ? 0 : 1);
