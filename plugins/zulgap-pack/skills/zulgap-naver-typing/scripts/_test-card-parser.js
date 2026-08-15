#!/usr/bin/env node
/**
 * card-parser 시나리오 — 실제 카드(RPG 신용장편) 구조를 그대로 축약한 픽스처
 * 실행: node _test-card-parser.js   (종료코드 0 = ALL PASS)
 */
const { parseCard, validateCard } = require('./card-parser');

let pass = 0, fail = 0;
const ok = (n, c, d = '') => { c ? (pass++, console.log(`  ✅ ${n}`)) : (fail++, console.log(`  ❌ ${n}${d ? '  → ' + d : ''}`)); };

// 실제 카드 구조 (2026-08-15 `3b9efa2f…d636f` 에서 요소를 그대로 가져옴)
const CARD = `> 네이버 블로그에 그대로 붙여넣는 원고입니다.
# 신용장 서류하자, 물건은 갔는데 대금이 멈춥니다
배는 떠났고 서류도 다 넣었습니다. 그런데 은행에서 지급을 못 하겠다는 연락이 옵니다.
바이어에게 물어보면 물건은 잘 받았다고 합니다. **은행이 보는 것이 물건이 아니기 때문**입니다.
![물건은 도착했는데 서류 하자로 지급이 멈췄다](https://ex.supabase.co/storage/v1/object/public/media-assets/a/generated/1.png)
## 은행은 서류만 봅니다
국제상업회의소가 정한 UCP 600 제5조는 은행이 다루는 대상은 서류라고 못 박아 두었습니다.
<table header-row="true">
<tr>
<td>상황</td>
<td>은행의 판단</td>
</tr>
<tr>
<td>물건에 문제, 서류는 완벽</td>
<td>**지급한다**</td>
</tr>
</table>
그래서 승부가 나는 곳은 창고가 아니라 서류철입니다.
![은행은 서류를 다루는 것이지 물품을 다루지 않는다](https://ex.supabase.co/storage/v1/object/public/media-assets/a/generated/2.png)
## 막을 수 있는 자리는 받은 날 하루입니다
통지받은 날 여섯 가지만 확인하십시오.
- 선적기일이 생산 일정 안쪽에 들어오나
- 요구된 서류를 하나도 빠짐없이 확보할 수 있나
원문 보기 : [redpassportglobal.com](http://redpassportglobal.com/blog/7-lc-payment)
#신용장서류하자 #신용장 #LC거래 #UCP600 #무역실무
---
## 재가공 내역 (홈페이지 원문과 달라진 것)
<table header-row="true">
<tr><td>항목</td><td>홈페이지 원문</td></tr>
</table>
### 키워드를 바꾼 이유 (네이버 축 실측 · 2026-08-11)
누적 건수까지 본 이유는 발행량이 0건이라고 좋은 게 아니기 때문입니다.
### 검수 결과 (결정론 도구)
원문 문장 재사용 0건 · 표 최대 2열 — **위반 0**
---
## 썸네일 (1080 x 1080)
![](https://prod-files-secure.s3.amazonaws.com/xxx/rpg7-thumbnail.png)
카피 : 서류하자로 / 대금이 / 멈춥니다
## 발행 전 체크
- [ ] 제목에 「신용장 서류하자」가 맨 앞에 있는지
- [ ] 본문 이미지 6장 + 썸네일을 내려받아 에디터에 직접 업로드했는지`;

const P = parseCard(CARD);
const V = validateCard(P);

console.log('\n[1] 제목·본문 분리');
ok('제목을 뽑았다', P.title === '신용장 서류하자, 물건은 갔는데 대금이 멈춥니다', P.title);
ok('제목이 본문 조각에 안 남았다',
   !P.blocks.some(b => b.kind === 'html' && b.html.includes('물건은 갔는데 대금이 멈춥니다')));

console.log('\n[2] 🔴 내부 메모 경계 (가장 위험한 지점)');
const plain = P.blocks.filter(b => b.kind === 'html').map(b => b.html).join(' ').replace(/<[^>]+>/g, ' ');
ok('「재가공 내역」이 본문에 없다', !plain.includes('재가공 내역'));
ok('「검수 결과」가 본문에 없다', !plain.includes('검수 결과'));
ok('「발행 전 체크」가 본문에 없다', !plain.includes('발행 전 체크'));
ok('「키워드를 바꾼 이유」가 본문에 없다', !plain.includes('키워드를 바꾼 이유'));
ok('내부 표(항목/홈페이지 원문)가 본문에 없다', !plain.includes('홈페이지 원문'));
ok('버려진 줄이 실제로 있다 (경계가 작동했다)', P.dropped > 10, `dropped=${P.dropped}`);

console.log('\n[3] 🔴 썸네일 이미지가 본문 이미지로 섞이지 않았다');
ok('본문 이미지 2장만 (썸네일 제외)', P.images === 2, `${P.images}장`);
ok('S3 썸네일 URL 미포함', !P.blocks.some(b => b.kind === 'image' && b.url.includes('amazonaws')));

console.log('\n[4] 조각 교대 순서');
const order = P.blocks.map(b => b.kind).join(',');
ok('text 로 시작', P.blocks[0].kind === 'html');
ok('이미지가 텍스트 사이에 낀다', /html,image,html,image,html/.test(order), order);

console.log('\n[5] 서식 보존');
const allHtml = P.blocks.filter(b => b.kind === 'html').map(b => b.html).join('\n');
ok('소제목이 h2 로', allHtml.includes('<h2>은행은 서류만 봅니다</h2>'));
ok('굵게 유지', allHtml.includes('<b>은행이 보는 것이 물건이 아니기 때문</b>'));
ok('표가 원본 그대로', allHtml.includes('<table header-row="true">') && allHtml.includes('<td>상황</td>'));
ok('리스트가 ul/li 로', allHtml.includes('<ul>') && allHtml.includes('<li>선적기일'));
ok('링크가 a 태그로', /<a href="http:\/\/redpassportglobal\.com/.test(allHtml));
ok('해시태그 줄 보존', allHtml.includes('#신용장서류하자'));
ok('인용구 유지', allHtml.includes('<blockquote>'));

console.log('\n[6] 검증 함수');
ok('정상 카드는 통과', V.ok === true, JSON.stringify(V.problems));
const bad = validateCard(parseCard('# 제목만\n짧음'));
ok('짧은 본문을 잡는다', bad.ok === false && bad.problems.some(p => p.includes('짧')));
const noTitle = validateCard(parseCard('본문만 있고 제목이 없습니다. '.repeat(30)));
ok('제목 없음을 잡는다', noTitle.problems.some(p => p.includes('제목')));

console.log(`\n${'─'.repeat(46)}\nPASS ${pass} / FAIL ${fail}`);
process.exit(fail === 0 ? 0 : 1);
