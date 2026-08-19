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
const { verifyFilled, describeImageFailure } = require(path.join(__dirname, 'naver-fill.js'));

let pass = 0, fail = 0;
const ok = (name, cond, detail = '') => {
  if (cond) { pass += 1; console.log(`  ✅ ${name}`); }
  else { fail += 1; console.log(`  ❌ ${name}${detail ? '  → ' + detail : ''}`); }
};
/** slots = 이미지 자리 수(플레이스홀더 포함), naverImages = 화면에 URL 이 붙은 수 */
const body = (o = {}) => ({ chars: 100, slots: 0, images: 0, naverImages: 0, externalImages: 0, placeholders: 0, struck: 0, ...o });
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

console.log('\n[9] 🔴 썸네일 주소는 «5분»이면 죽는다 — 실패 이유가 사람 말로 나와야 한다');
{
  // 2026-08-16 실측: 노션 첨부는 `X-Amz-Expires=300` 서명 URL. 카드를 받아 두고 몇 분 뒤
  // 파싱하면 «썸네일만» 403 이 되는데, 그전엔 「이미지 1장 실패」로만 떠서 원인이 안 보였다.
  const S3 = 'https://prod-files-secure.s3.us-west-2.amazonaws.com/63008774/thumb.png?X-Amz-Expires=300&X-Amz-Signature=abc';
  const SUPA = 'https://ex.supabase.co/storage/v1/object/public/media-assets/a/generated/1.png';

  ok('만료를 만료라고 말한다', /만료/.test(describeImageFailure(S3, 403)), describeImageFailure(S3, 403));
  ok('🔴 회수 방법까지 알려준다 (카드를 다시 받기)', /다시 받아/.test(describeImageFailure(S3, 403)));
  ok('400 도 만료로 본다', /만료/.test(describeImageFailure(S3, 400)));
  ok('지워진 것은 «만료»라고 하지 않는다', /지워졌/.test(describeImageFailure(S3, 404)), describeImageFailure(S3, 404));
  ok('영구 주소의 403 은 만료라고 하지 않는다', !/만료/.test(describeImageFailure(SUPA, 403)), describeImageFailure(SUPA, 403));
  ok('모르는 코드는 숫자를 그대로 보여준다', /HTTP 500/.test(describeImageFailure(SUPA, 500)));
  // @AI:CONSTRAINT 도메인만으로도 잡는다 — 서명 파라미터 이름이 바뀌어도 노션 첨부는 걸린다
  ok('서명 파라미터가 없어도 노션 첨부면 잡는다',
     /만료/.test(describeImageFailure('https://prod-files-secure.s3.amazonaws.com/x/thumb.png', 403)));
}

console.log('\n[10] 🔴 대표 지정은 «검증 뒤»에 온다 — 그림이 덜 들어가면 세우지 않는다');
{
  // 2026-08-16 사슬 분석에서 나온 위험 — 파서는 썸네일을 «맨 끝»에 얹으므로 앞의 그림이 하나라도
  // 빠지면 thumbnailIndex 가 «다른 그림»을 가리킨다. 그때 세우면 엉뚱한 도식이 검색결과 얼굴이 된다.
  // 그래서 fillCard 는 verifyFilled 가 깨끗할 때만 손댄다. 여기서는 그 «전제»(자리 수 판정)를 잠근다.
  const p = verifyFilled({ start: EMPTY, end: body({ slots: 5, naverImages: 5 }), expected: 6, uploaded: 5 });
  ok('🔴 6장 중 5장만 들어가면 «문제»로 잡힌다 = 대표를 세우지 않는 조건', p.length > 0, JSON.stringify(p));
  const clean = verifyFilled({ start: EMPTY, end: body({ slots: 6, naverImages: 6 }), expected: 6, uploaded: 6 });
  ok('  6/6 이면 깨끗하다 = 대표를 세우는 조건', clean.length === 0, JSON.stringify(clean));

  // @AI:CONSTRAINT 소스 배치 자체를 잠근다 — 주석 규칙만으로는 다시 앞으로 옮겨진다.
  const src = require('fs').readFileSync(path.join(__dirname, 'naver-fill.js'), 'utf8');
  const iVerify = src.indexOf('const verdict = verifyFilled(');
  const iRep = src.indexOf('await setRepImage(page, frame, parsed.thumbnailIndex)');
  ok('🔴 setRepImage 호출이 verifyFilled «뒤»에 있다', iVerify > 0 && iRep > iVerify, `verify@${iVerify} rep@${iRep}`);
  ok('🔴 verdict 가 깨끗할 때만 세운다', /verdict\.length === 0/.test(src.slice(iVerify, iRep + 200)));
}

console.log('\n[11] 🔴 취소선이 그어졌으면 «막는다» (2026-08-16 실사고 — 사장님이 화면에서 발견)');
{
  // 창을 연 직후부터 취소선 토글이 켜져 있었고(네이버가 계정에 서식 상태를 기억한다),
  // 그 상태로 붙여넣자 글 «전체»가 취소선이 됐다(실측 175개). 그런데 도구는 ready_to_register 였다.
  // @AI:CONSTRAINT 우리 HTML 에 <s>/<del>/<strike> 는 «한 번도» 안 들어간다 —
  //   화면에 있으면 그건 에디터가 씌운 것이다. 개수와 무관하게 막는다.
  const ok0 = verifyFilled({ start: EMPTY, end: body({ slots: 8, naverImages: 8, struck: 0 }), expected: 8, uploaded: 8 });
  ok('취소선 0이면 통과', ok0.length === 0, JSON.stringify(ok0));

  const many = verifyFilled({ start: EMPTY, end: body({ slots: 8, naverImages: 8, struck: 175 }), expected: 8, uploaded: 8 });
  ok('🔴 175군데면 막는다', many.some((x) => /취소선/.test(x)), JSON.stringify(many));

  const one = verifyFilled({ start: EMPTY, end: body({ slots: 8, naverImages: 8, struck: 1 }), expected: 8, uploaded: 8 });
  ok('🔴 «한 군데»만 그어져도 막는다', one.some((x) => /취소선/.test(x)), JSON.stringify(one));
  ok('  왜 그런지·어떻게 할지 알려준다', one.some((x) => /서식이 켜져|다시 채우/.test(x)), JSON.stringify(one));

  // @AI:CONSTRAINT 끄는 것만으로는 부족했다는 것이 이 사고의 교훈이다 — 두 겹을 소스로 잠근다.
  const src = require('fs').readFileSync(path.join(__dirname, 'naver-fill.js'), 'utf8');
  ok('🔴 채우기 «전»에 서식을 끈다', /clearFormatting\(page, frame\)/.test(src) &&
     src.indexOf('clearFormatting(page, frame)') < src.indexOf('downloadImages(parsed.blocks'),
     '순서 어긋남');
  ok('🔴 결과도 «센다» (readBody 가 struck 를 돌려준다)', /struck:\s*c\.querySelectorAll\('s, del, strike'\)/.test(src));
}

// ─────────────────────────────────────────────────────────────
// 🔴 굵게 누출 (2026-08-20 실사고 — 담당자가 화면에서 발견)
//   앞 조각이 굵게로 «끝나면» 커서가 <b> 안에 남고, 다음 조각이 통째로 굵어진다.
//   실측: RPG 9편에서 「성수기 항공 건은…」 뒤로 «글 전체»가 굵어졌는데
//   도구는 그대로 ready_to_register 를 냈다. 끄는 것과 «세는 것» 둘 다 필요하다.
// ─────────────────────────────────────────────────────────────
console.log('\n[굵게] 조각 경계에서 번지는 것을 막는다');
{
  const F = require('./naver-fill.js');

  ok('🔴 커서용 토글 목록에 «굵게»가 있다',
     F.CARET_TOGGLES.some(([n]) => n === '굵게'),
     JSON.stringify(F.CARET_TOGGLES.map(([n]) => n)));
  // @AI:CONSTRAINT ①-b 의 FORMAT_TOGGLES 와 «다른 목록»이다 — 합치면 글 전체 굵게가 꺼진다
  ok('🔴 글 전체용 목록에는 굵게가 «없다»',
     !F.FORMAT_TOGGLES.some(([n]) => n === '굵게'),
     JSON.stringify(F.FORMAT_TOGGLES.map(([n]) => n)));

  const blocks = (h) => [{ kind: 'html', html: h }];
  ok('원고의 굵게 글자를 센다', F.countBoldChars(blocks('가<b>나다</b>라')) === 2);
  ok('strong 도 센다', F.countBoldChars(blocks('<strong>가나</strong>')) === 2);
  ok('공백은 빼고 센다', F.countBoldChars(blocks('<b>가 나</b>')) === 2);
  ok('중첩 태그 안 글자만 센다', F.countBoldChars(blocks('<b>가<span>나</span></b>')) === 2);
  ok('이미지 조각은 안 센다', F.countBoldChars([{ kind: 'image', url: 'x' }]) === 0);
  ok('빈 입력 안전', F.countBoldChars(null) === 0 && F.countBoldChars([]) === 0);

  const V = (expectedBoldChars, boldChars) => F.verifyFilled({
    start: { slots: 0 }, end: { slots: 2, externalImages: 0, struck: 0, boldChars },
    expected: 2, uploaded: 2, expectedBoldChars,
  });
  ok('🔴 문단이 통째로 굵어지면 막는다', V(400, 2500).some((m) => /굵게가 번졌/.test(m)),
     JSON.stringify(V(400, 2500)));
  ok('원고대로면 통과', V(400, 400).length === 0, JSON.stringify(V(400, 400)));
  // @AI:CONSTRAINT 여유를 좁히지 말 것 — 표 셀·링크에서 에디터가 범위를 조금 넓게 잡는다.
  //   번짐은 «배수»로 벌어지므로 넉넉해도 잡힌다.
  ok('약간 넓게 잡힌 것은 «막지 않는다»', V(400, 500).length === 0, JSON.stringify(V(400, 500)));
  ok('기대값이 없으면 판정하지 않는다',
     F.verifyFilled({ start: { slots: 0 }, end: { slots: 2, externalImages: 0, struck: 0, boldChars: 9999 },
                      expected: 2, uploaded: 2 }).length === 0);
  ok('취소선 판정은 그대로 산다',
     F.verifyFilled({ start: { slots: 0 }, end: { slots: 2, externalImages: 0, struck: 1, boldChars: 0 },
                      expected: 2, uploaded: 2, expectedBoldChars: 0 }).some((m) => /취소선/.test(m)));
}

// ─────────────────────────────────────────────────────────────
// 🔴 이미지 옆트임 (2026-08-20)
//   판정축은 «선택 상태의 토글 + 폭». 컴포넌트 클래스는 세 설정 모두 se-l-default 로 같다.
// ─────────────────────────────────────────────────────────────
console.log('\n[옆트임] 이미지 폭');
{
  const F = require('./naver-fill.js');
  ok('옆트임 선택자가 extend 다', /object-arrangement-extend/.test(F.ARRANGE.옆트임));
  ok('문서너비 선택자가 fit 다', /object-arrangement-fit/.test(F.ARRANGE.문서너비));
  ok('작게 선택자가 normal 이다', /object-arrangement-normal/.test(F.ARRANGE.작게));
  // @AI:CONSTRAINT 🔴 se-l-* 로 판정하면 세 설정이 구별되지 않는다. 선택자에 들어오면 안 된다.
  ok('🔴 클래스(se-l-)로 판정하지 않는다',
     !Object.values(F.ARRANGE).some((v) => /se-l-/.test(v)));
  ok('전부 «보이는» 컨텍스트 툴바를 쓴다',
     Object.values(F.ARRANGE).every((v) => v.startsWith('.se-context-toolbar-group-toggle-button')));
  ok('extendAllImages 가 있다', typeof F.extendAllImages === 'function');
  ok('setImageExtend 가 있다', typeof F.setImageExtend === 'function');
}


console.log('\n──────────────────────────────────────────────');
console.log(fail === 0 ? `✅ ALL PASS  ${pass}/${pass + fail}` : `❌ FAIL  ${pass}/${pass + fail}`);
process.exit(fail === 0 ? 0 : 1);
