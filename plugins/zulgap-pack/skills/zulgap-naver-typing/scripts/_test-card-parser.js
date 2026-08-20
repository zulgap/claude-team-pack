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

console.log('\n[3] 🔴 썸네일은 «맨 끝 한 장»이고 본문 사이에 섞이지 않았다');
// 🔴 2026-08-16 계약 변경 — 그전까지는 썸네일을 «통째로 버렸다»(`images === 2` · amazonaws 미포함).
//   그래서 정성껏 만든 얼굴이 본문에 없었고, 네이버는 «본문에 있는 그림 중에서만» 대표를 고르므로
//   검색결과에는 본문 첫 도식이 나갔다. 사장님 결정(2026-08-16): «본문 맨 끝»에 넣고 대표로 지정한다.
// @AI:CONSTRAINT 원래 [3]의 뜻(=본문 «사이»에 끼지 않는다)은 그대로 지킨다. 아래 3·4번이 그 자리다.
const imgs = P.blocks.filter(b => b.kind === 'image');
ok('본문 2장 + 썸네일 1장 = 3장', P.images === 3, `${P.images}장`);
ok('썸네일이 «맨 끝» 한 장이다', imgs[imgs.length - 1].url.includes('amazonaws'), imgs[imgs.length - 1].url);
ok('🔴 본문 사이 이미지에는 썸네일이 안 섞였다',
   imgs.slice(0, -1).every(b => !b.url.includes('amazonaws')));
ok('thumbnail 을 따로 알려준다', P.thumbnail && P.thumbnail.url.includes('rpg7-thumbnail.png'), JSON.stringify(P.thumbnail));
ok('🔴 대표로 지정할 자리를 알려준다 (0부터)', P.thumbnailIndex === 2, String(P.thumbnailIndex));
ok('썸네일 «카피 메모»는 본문에 안 들어갔다', !plain.includes('서류하자로 / 대금이'));
ok('네이버 업로드 주의문도 안 들어갔다', !plain.includes('내려받기용'));

console.log('\n[4] 조각 교대 순서');
const order = P.blocks.map(b => b.kind).join(',');
ok('text 로 시작', P.blocks[0].kind === 'html');
ok('이미지가 텍스트 사이에 낀다', /html,image,html,image,html/.test(order), order);

console.log('\n[5] 서식 보존');
const allHtml = P.blocks.filter(b => b.kind === 'html').map(b => b.html).join('\n');
// 🔴 2026-08-16 계약 변경 — 포맷을 공용 정본(shared/naver-format)에 맡기면서 바뀐 것.
//   네이버에서 <h2> 는 «컴포넌트가 되지 않고» 앞 문단에 흡수된다. 소제목은 인용구다.
// 🔴 2026-08-20 계약 변경 — 인용구 «안»은 굵게 (담당자가 손으로 칠 때 그렇게 친다)
ok('🔴 소제목이 인용구로 (h2 아님)',
   allHtml.includes('<blockquote><b>은행은 서류만 봅니다</b></blockquote>') && !allHtml.includes('<h2'));
ok('굵게 유지', allHtml.includes('<b>은행이 보는 것이 물건이 아니기 때문</b>'));
ok('표 구조는 유지', allHtml.includes('<table header-row="true">'));
ok('🔴 표 머리 행에 색 (header-row 속성은 네이버가 무시한다)',
   allHtml.includes('background-color:rgb(0,78,130)') && allHtml.includes('color:#ffffff;'));
ok('🔴 표 셀 안 마크다운이 풀린다 (별표가 글자로 안 나간다)',
   allHtml.includes('<b>지급한다</b>') && !allHtml.includes('**지급한다**'));
ok('머리 행 셀은 색을 입는다', allHtml.includes('<span style="color:#ffffff;">상황</span>'));
// 본문 셀은 «선은 있고 배경색은 없다» (선은 2026-08-16 사장님 결정으로 추가)
// 🔴 2026-08-20 — 셀에 «가운데 정렬 · 16px» 이 앞에 붙는다. 선은 그대로 있어야 한다.
ok('본문 행 셀에 선이 있다', /<td style="[^"]*border:[^";]*"[^>]*>물건에 문제, 서류는 완벽<\/td>/.test(allHtml));
ok('본문 행 셀은 가운데 정렬 · 16px', /<td style="text-align:center;font-size:16px;/.test(allHtml));
ok('본문 행 셀에는 배경색이 없다', !/<td[^>]*background-color[^>]*>물건에 문제/.test(allHtml));
ok('리스트가 ul/li 로', allHtml.includes('<ul>') && allHtml.includes('<li>선적기일'));
ok('링크가 a 태그로', /<a href="http:\/\/redpassportglobal\.com/.test(allHtml));
// 🔴 2026-08-20 — 해시태그는 본문에서 «빠지고» 태그칸으로 간다. 사라지는 것이 아니라 옮겨간다.
ok('🔴 해시태그는 본문에서 빠진다', !allHtml.includes('#신용장서류하자'));
ok('🔴 대신 tags 로 돌아온다 (사라지면 검색 유입을 잃는다)',
   (P.tags || []).includes('신용장서류하자'));
ok('인용구 유지', allHtml.includes('<blockquote>'));

console.log('\n[5-1] 🔴 네이버 포맷 — 여백과 구분선 (기존 글은 빈 문단이 56~61%)');
ok('문단 뒤에 여백이 붙는다', allHtml.includes('<p><br></p>'));
const spacerCount = (allHtml.match(/<p><br><\/p>/g) || []).length;
ok(`여백이 충분하다 (${spacerCount}개)`, spacerCount >= 5, `문단 대비 부족하면 빽빽해 보인다`);
ok('구분선이 살아 있다 (버리지 않는다)', allHtml.includes('<hr>'));

console.log('\n[5-2] 🔴 «줄 전체 볼드» = 소제목 (카드마다 ## 또는 **볼드** 로 쓴다)');
const BOLD = parseCard(`# 제목
${'앞 문단입니다. '.repeat(10)}
**실제 숫자를 열어봤습니다**
${'그 아래 본문입니다. '.repeat(10)}
문장 중간에 **강조**가 있는 줄은 소제목이 아닙니다.
**은행이 보는 것이 물건이 아니기 때문**입니다. 뒤에 말이 더 붙습니다.
**마무리**
${'끝 문단입니다. '.repeat(10)}`);
const bHtml = BOLD.blocks.filter(b => b.kind === 'html').map(b => b.html).join('\n');
ok('줄 전체 볼드 → 인용구', bHtml.includes('<blockquote><b>실제 숫자를 열어봤습니다</b></blockquote>'));
ok('짧은 것도 인용구', bHtml.includes('<blockquote><b>마무리</b></blockquote>'));
// @AI:CONSTRAINT 인용구가 굵어진 뒤로는 «굵게가 있나»로 가르면 안 된다 — 판정축은 blockquote 다
ok('🔴 문장 «일부» 볼드는 소제목이 아니다',
   !/<blockquote>(<b>)?강조/.test(bHtml) && bHtml.includes('<b>강조</b>'));
ok('🔴 볼드로 시작해도 뒤에 말이 붙으면 문단',
   !/<blockquote>(<b>)?은행이 보는 것이 물건이 아니기 때문/.test(bHtml));
ok('  └ 그 줄은 굵게로 남는다', bHtml.includes('<b>은행이 보는 것이 물건이 아니기 때문</b>'));
const bq = (bHtml.match(/<blockquote>/g) || []).length;
ok(`인용구가 정확히 2개 (${bq})`, bq === 2);

console.log('\n[6] 검증 함수');
ok('정상 카드는 통과', V.ok === true, JSON.stringify(V.problems));
const bad = validateCard(parseCard('# 제목만\n짧음'));
ok('짧은 본문을 잡는다', bad.ok === false && bad.problems.some(p => p.includes('짧')));
const noTitle = validateCard(parseCard('본문만 있고 제목이 없습니다. '.repeat(30)));
ok('제목 없음을 잡는다', noTitle.problems.some(p => p.includes('제목')));

// ─────────────────────────────────────────────────────────────
// [7] 동료사별 카드 구조 4종 — 2026-08-16 실측. 셋이 잘못 다뤄지고 있었다.
//     🔴 새 동료사를 붙이면 «실제 카드»를 여기에 축약해 넣을 것.
// ─────────────────────────────────────────────────────────────
console.log('\n[7] 마미사형 — 내부 메모가 «앞»에 있고 원고는 「네이버 게시용 원고」 아래');
const MAMISA = `## 황금키워드 분석
- 구글 검색량 22200 · 구글 KD 11
---
## 재가공 안내
아래 「네이버 게시용 원고」를 그대로 옮기시면 됩니다
### 원문
https://mamisa.vercel.app/blog/2-ga4-direct-traffic-check
### 검수 결과 (결정론 검사기 통과)
- 원문 문장 재사용 **0건**
### 옮길 때 챙길 것
- 이미지는 아래 순서 그대로 넣어 주세요
---
## 네이버 게시용 원고
### 제목
구글 애널리틱스에서 「직접」이 제일 크면 확인해야 할 네 가지
### 본문
먼저 결론입니다. 직접 유입이 크다고 브랜드가 알려진 게 아닙니다. ${'대개는 우리가 뿌린 링크에서 출처가 떨어져 나간 것입니다. '.repeat(8)}
![어떻게 읽느냐에 따라 할 일이 갈립니다](https://ex.supabase.co/a/fig-01.png)
**실제 숫자를 열어봤습니다**
${'저희가 관리하는 사이트 90일치를 꺼냈습니다. '.repeat(6)}
### 해시태그 (정확히 10개)
#구글애널리틱스 #GA4 #직접유입`;
const M = parseCard(MAMISA), MV = validateCard(M, /* 썸네일 축은 [14]에서 따로 — 여기선 경계 판정만 본다 */ { requireThumbnail: false });
ok('제목을 「### 제목」 다음 줄에서 집는다', M.title === '구글 애널리틱스에서 「직접」이 제일 크면 확인해야 할 네 가지', String(M.title));
ok('앞쪽 내부 메모를 버린다', M.dropped > 10, `dropped=${M.dropped}`);
ok('원고를 살린다(이미지 1장)', M.images === 1);
ok('검증 통과', MV.ok === true, JSON.stringify(MV.problems));
const mPlain = M.blocks.filter(b => b.kind === 'html').map(b => b.html).join('\n').replace(/<[^>]+>/g, '');
ok('「검수 결과」가 본문에 안 남는다', !mPlain.includes('검수 결과'));
ok('「황금키워드」가 본문에 안 남는다', !mPlain.includes('황금키워드'));
ok('🔴 해시태그는 tags 로 옮겨간다 (본문에서는 빠진다)',
   (M.tags || []).includes('구글애널리틱스') && !mPlain.includes('#구글애널리틱스'));

console.log('\n[8] 엔노블형 — 내부 메모가 «이모지 인용문»으로 본문 뒤에');
const ENNOBLE = `> 📌 발행 제목: 결혼정보회사 등급표, 그대로 믿어도 될까요 (수정 가능)
${'결혼정보회사를 알아보다 보면 한 번쯤 검색해 보게 되는 말이 있습니다. '.repeat(6)}
🖼️ **이미지1 (AI)**: 도입 이미지
\`\`\`javascript
A Korean adult in their early 30s sitting on a sofa --ar 16:9 --style raw
\`\`\`
![도입 이미지 (AI 생성)](https://ex.supabase.co/a/generated/1.png)
> 🗂️ [프로필 표 삽입 위치]
## 문의보다 표를 먼저 찾게 되는 이유
${'상담을 받아보기 전에 등급표부터 찾는 데는 이유가 있습니다. '.repeat(8)}
---
> 🔁 **2026-08-07 구조 수정 (담당자 피드백 반영)**: 결론이 첫 H2에서 너무 빨리 나온다는 지적을 받아 재배치함.
> ✅ **도구 검수(validate_blog_draft · naver)**: 키워드 4회 · 시각물 5장. ⚠️ FAQ 미검출은 도구 오검출.
> 📌 원문 문장을 옮기면 자사 글끼리 유사문서로 잡힐 수 있어서임.
> ⚠️ 톤: 타사 등급표 비하 ❌ · 경쟁사 실명 ❌.`;
const E = parseCard(ENNOBLE);
const ePlain = E.blocks.filter(b => b.kind === 'html').map(b => b.html).join('\n').replace(/<[^>]+>/g, '');
ok('🔁 구조 수정 메모 제거', !ePlain.includes('구조 수정'));
ok('✅ 도구 검수 메모 제거', !ePlain.includes('도구 검수') && !ePlain.includes('validate_blog_draft'));
ok('📌 SEO 전략 메모 제거', !ePlain.includes('유사문서'));
ok('⚠️ 톤 지침 제거', !ePlain.includes('경쟁사 실명'));
ok('🗂️ 삽입 위치 지시 제거', !ePlain.includes('삽입 위치'));
ok('AI 프롬프트 코드블록 제거', !ePlain.includes('--ar 16:9') && !ePlain.includes('javascript'));
ok('🖼️ 이미지 지시줄 제거', !ePlain.includes('이미지1'));
ok('실제 이미지는 살린다', E.images === 1);
ok('본문 소제목은 살린다', ePlain.includes('문의보다 표를 먼저 찾게 되는 이유'));
ok('카드에 제목이 없으면 문제로 잡는다', validateCard(E, { requireThumbnail: false }).ok === false);
ok('노션 제목을 넘기면 통과', validateCard(E, { title: '결혼정보회사 등급표, 그대로 믿어도 될까요', requireThumbnail: false }).ok === true,
   JSON.stringify(validateCard(E, { title: 'x', requireThumbnail: false }).problems));

console.log('\n[9] 검단가온형 — 「SEO 제목」·「메타 설명」 머리말이 앞에');
const GAON = `## SEO 제목
검단신도시 임플란트, 잇몸 절개는 얼마나 할까요? | 검단가온치과
## 메타 설명
임플란트할 때 잇몸을 얼마나 절개하는지 궁금하신가요? 절개 범위를 정하는 기준을 정리했습니다.
---
# 검단신도시 임플란트, 잇몸 절개는 얼마나 할까요?
![임플란트 치료 전후 정면 구강 내 사진](https://ex.s3.amazonaws.com/gaon-front.png)
${'땅에 기둥을 세울 때 얼마나 파야 하는지는 땅의 단단함이 정합니다. '.repeat(7)}
> **의료 안내**: 치료 결과·기간은 개인차가 있으며, 정확한 계획은 정밀진단 후 안내됩니다.
## 임플란트 절개, 얼마나 하나요
> 1. 국소 마취를 합니다. 2. 잇몸을 절개하고 연조직을 박리합니다.
출처 : [서울아산병원 의료정보](https://www.amc.seoul.kr/asan/healthinfo/management/managementDetail.do?managementId=365)
${'즉 임플란트 절개는 과정의 일부입니다. '.repeat(6)}
> "블로그 보고 예약합니다."`;
const G = parseCard(GAON), GV = validateCard(G, /* 썸네일 축은 [14]에서 따로 — 여기선 경계 판정만 본다 */ { requireThumbnail: false });
const gPlain = G.blocks.filter(b => b.kind === 'html').map(b => b.html).join('\n').replace(/<[^>]+>/g, '');
ok('H1 을 제목으로', G.title === '검단신도시 임플란트, 잇몸 절개는 얼마나 할까요?', String(G.title));
ok('🔴 「SEO 제목」 머리말 제거', !gPlain.includes('SEO 제목') && !gPlain.includes('검단가온치과 |') );
ok('🔴 「메타 설명」 머리말 제거', !gPlain.includes('메타 설명') && !gPlain.includes('궁금하신가요'));
ok('검증 통과', GV.ok === true, JSON.stringify(GV.problems));
ok('✅ 의료 안내 인용문은 «남는다»', gPlain.includes('의료 안내'));
ok('✅ 기관 인용문은 «남는다»', gPlain.includes('국소 마취'));
ok('✅ 예약 멘트 인용문은 «남는다»', gPlain.includes('블로그 보고 예약합니다'));

console.log('\n[10] 유출 지문 — 경계가 또 뚫려도 여기서 잡는다');
const leaked = validateCard(parseCard(`# 제목\n${'정상 본문입니다. '.repeat(40)}\n일반 문단인데 validate_blog_draft 라고 적혀 있다`));
ok('도구 이름이 본문에 있으면 실패', leaked.ok === false && leaked.problems.some(p => p.includes('validate_blog_draft')));
const leaked2 = validateCard(parseCard(`# 제목\n${'정상 본문입니다. '.repeat(40)}\n메타 설명 이라는 말이 본문에`));
ok('머리말 이름이 본문에 있으면 실패', leaked2.ok === false);

console.log('\n[11] 강조 밀도 — «세기만» 한다 (넣지 않는다)');
{
  const IMG_LINE = '![설명](https://example.com/a.png)';          // 이미지 0장은 «다른 이유»로 막히므로 넣는다
  const long = '충분히 긴 본문 문장입니다. '.repeat(40);          // 500자 이상
  // 썸네일 축은 [14]에서 따로 — 여기선 «강조 밀도가 막지 않는다»만 본다
  const bare = validateCard(parseCard(`# 제목\n${long}\n${IMG_LINE}`), { requireThumbnail: false });
  ok('강조가 없으면 알린다', bare.warnings.some((w) => w.includes('강조가 0개')));
  ok('🔴 그래도 «막지는» 않는다', bare.ok === true);
  ok('몇 개가 어울리는지 숫자로 알려준다', /\d+개 안팎/.test(bare.warnings[0] || ''));

  // 문장 «일부» 볼드를 촘촘히 — 기존 글 밀도(73자당 1개)를 넘어서면 조용해야 한다
  const dense = '이것은 **핵심**이고 저것도 **중요**합니다. '.repeat(30);
  const rich = validateCard(parseCard(`# 제목\n${dense}`));
  ok('강조가 충분하면 알림이 없다', rich.warnings.length === 0, JSON.stringify(rich.warnings).slice(0, 90));
  ok('볼드 개수를 센다', rich.bolds === 60, String(rich.bolds));
  ok('밀도(자/볼드)를 준다', typeof rich.chars_per_bold === 'number');

  // @AI:CONSTRAINT 파서가 볼드를 «넣지» 않는다 — 세기만 한다
  const untouched = parseCard(`# 제목\n${long}`).blocks.map((b) => b.html || '').join('');
  ok('🔴 파서가 볼드를 만들어 넣지 않는다', !untouched.includes('<b>'));
}

// ─────────────────────────────────────────────────────────────
// [12] 썸네일 회수 — 🔴 «자리가 동료사마다 다르다» (2026-08-16 카드 4장 실측)
//   댕묘  해시태그 → `### 썸네일` → 그림 → `---` → `## 재가공 내역`   ← 이 헤딩이 «경계를 켠다»
//   RPG   … → `## 재가공 내역` → `## 썸네일` → 그림 → `## 발행 전 체크`  ← «경계 너머»에 있다
//   엔노블·검단가온  썸네일 섹션 자체가 «없다»
// @AI:CONSTRAINT 두 방향 다 잡아야 한다. [3]이 RPG(너머)를, 여기가 댕묘(경계선)를 덮는다.
// ─────────────────────────────────────────────────────────────
console.log('\n[12] 🔴 썸네일 회수 — 댕묘형(썸네일 헤딩이 «경계를 켠다»)');
{
  const DANGMYO = `> **붙여넣기 안내**
> 1. 제목 끝 괄호 **(8/13)은 떼고** 붙여넣으세요.
---
## 본문
## 고양이 빗질 주기, 단모종도 주 1~2회는 해주셔야 합니다
${'빗에 딸려 나온 털 뭉텅이를 보고 놀라셨다면 절반만 맞습니다. '.repeat(8)}
![그루밍으로 삼킨 털이 지나는 경로 (댕묘 작성)](https://ex.supabase.co/a/generated/1786544657332.png)
### 왜 청소가 아니라 소화기 관리인가
${'고양이 혀 표면에는 뒤쪽으로 누운 딱딱한 돌기가 있습니다. '.repeat(6)}
### 참고 자료
- 「Cornell Feline Health Center」 코넬대학교 고양이건강센터
#고양이빗질주기 #고양이빗질 #댕묘
### 썸네일 (1080 x 1080)
![](https://prod-files-secure.s3.us-west-2.amazonaws.com/63008774/dangmyo-cat-brushing-thumb.png?X-Amz-Expires=300&X-Amz-Signature=abc)
---
## 재가공 내역 (홈페이지 원문과 달라진 것)
- **문장 전면 재작성** — 검사기 판정 원문 재사용 0건.
## 발행 전 체크
- [ ] 썸네일 PNG 내려받아 대표 이미지로 지정`;
  const D = parseCard(DANGMYO);
  const dPlain = D.blocks.filter(b => b.kind === 'html').map(b => b.html).join('\n').replace(/<[^>]+>/g, '');
  const dImgs = D.blocks.filter(b => b.kind === 'image');

  ok('🔴 썸네일을 회수했다 (경계를 켜는 헤딩이어도)', !!D.thumbnail, JSON.stringify(D.thumbnail));
  ok('회수한 것이 S3 썸네일이다', D.thumbnail && D.thumbnail.url.includes('dangmyo-cat-brushing-thumb'));
  ok('본문 1장 + 썸네일 1장 = 2장', D.images === 2, `${D.images}장`);
  ok('썸네일이 «맨 끝»이다', dImgs[dImgs.length - 1].url.includes('amazonaws'));
  ok('🔴 대표 지정 자리 = 마지막', D.thumbnailIndex === D.images - 1, String(D.thumbnailIndex));
  // 경계는 여전히 살아 있어야 한다 — 썸네일을 살린다고 내부 메모까지 딸려오면 최악이다
  ok('🔴 「재가공 내역」은 그대로 버린다', !dPlain.includes('재가공 내역') && !dPlain.includes('재사용 0건'));
  ok('🔴 「발행 전 체크」도 그대로 버린다', !dPlain.includes('발행 전 체크'));
  ok('🔴 「썸네일」 헤딩 글자가 본문에 안 남는다', !dPlain.includes('썸네일'));
  ok('본문 소제목은 살아 있다', dPlain.includes('왜 청소가 아니라 소화기 관리인가'));

  // 🔴 2026-08-16 실측 결함 — 「참고 자료」가 끝 경계에 들어 있어 «출처와 해시태그가 함께» 잘렸다.
  //   원 목록(PR #191)이 RPG 카드 한 장만 보고 지어진 탓이고, 잘린 뒤라 «유출 지문에도 안 걸려»
  //   검증은 초록이었다. 출처 표기는 저작권법상 필수라 조용한 손실 중 가장 나쁜 쪽이다.
  ok('🔴 「참고 자료」 절이 살아 있다 (출처 표기 — 저작권)', dPlain.includes('Cornell Feline Health Center'));
  ok('🔴 그 뒤 해시태그 10개도 «살아 있다» — 이제는 tags 로',
     (D.tags || []).length >= 2 && !dPlain.includes('#고양이빗질주기'));
  // 🔴 2026-08-20 — 「참고 자료」는 1열 2행 «표»가 된다. 소제목이 아니라 표 안의 1행이다.
  ok('  「참고자료」가 표 안에 있다', dPlain.includes('참고자료'));

  console.log('\n[12-1] 썸네일이 «없는» 카드는 없다고 말한다');
  // @AI:CONSTRAINT 🔴 URL 로 판정하지 말 것 — 검단가온 본문 «첫» 사진이 amazonaws 다.
  //   URL 을 축으로 삼으면 본문 사진이 대표로 둔갑한다. 축은 «썸네일 헤딩»이다.
  ok('🔴 검단가온: amazonaws 본문 사진이 있어도 썸네일은 없음', G.thumbnail === null, JSON.stringify(G.thumbnail));
  ok('  자리도 null 이다', G.thumbnailIndex === null, String(G.thumbnailIndex));
  ok('  본문 사진은 그대로 살아 있다', G.images === 1, `${G.images}장`);
  ok('엔노블: 썸네일 없음', E.thumbnail === null && E.thumbnailIndex === null);
  ok('마미사: 썸네일 없음', M.thumbnail === null && M.thumbnailIndex === null);
}

// ─────────────────────────────────────────────────────────────
// [13] 🔴 맨 앞 「붙여넣기 안내」 — 타이피스트에게 하는 말이 «고객 블로그 첫 줄»로 나갔다
//   2026-08-16 실제 카드 사전점검에서 발견. 이모지로 시작하지 않아 메모 걸러내기를 통과하고,
//   유출 지문에도 없어 «검증까지 초록»이었다. RPG 16편이 전부 이 구조다.
// @AI:CONSTRAINT 판정축은 «자리»다 — 「첫 헤딩·첫 본문 줄보다 앞에 있는 인용문」.
//   문구 목록으로 잡지 말 것: 동료사마다 다르게 쓰고 새 문구가 계속 생긴다.
//   본문 «안»의 인용문은 건드리지 않는다(검단가온 의료 안내·기관 인용은 발행돼야 한다).
// ─────────────────────────────────────────────────────────────
console.log('\n[13] 🔴 맨 앞 붙여넣기 안내는 버린다 (본문 안 인용문은 그대로)');
{
  const BODY = '본문 문장입니다. '.repeat(40);
  const txt = (md) => parseCard(md).blocks.filter(b => b.kind === 'html').map(b => b.html).join('').replace(/<[^>]+>/g, ' ');

  // RPG형 — 인용문 한 줄이 H1 앞에
  const R = `> 네이버 블로그에 그대로 붙여넣는 원고입니다. 홈페이지 원문과 문장이 겹치지 않게 전면 재작성했습니다.
# 진짜 제목입니다
${BODY}
![그림](https://ex.supabase.co/a/1.png)`;
  ok('🔴 RPG형 안내문이 본문에 없다', !/붙여넣는 원고/.test(txt(R)), txt(R).trim().slice(0, 50));
  ok('  제목은 그대로 잡힌다', parseCard(R).title === '진짜 제목입니다');
  ok('  본문은 살아 있다', txt(R).includes('본문 문장입니다'));

  // 댕묘형 — 여러 줄 인용문 + 구분선 + `## 본문`
  const D = `> **붙여넣기 안내**
> 1. 제목 끝 괄호 **(8/13)은 떼고** 붙여넣으세요.
> 5. 이미지는 **내려받아 네이버 에디터에 직접 업로드**해야 합니다.
---
## 본문
## 진짜 제목입니다
${BODY}
![그림](https://ex.supabase.co/a/1.png)`;
  ok('🔴 댕묘형 안내문이 본문에 없다', !/붙여넣기 안내|떼고/.test(txt(D)), txt(D).trim().slice(0, 50));
  ok('  안내문 뒤 구분선도 함께 버린다 (본문이 선으로 시작하지 않는다)',
     !txt(D).trim().startsWith('─') && !parseCard(D).blocks[0].html.startsWith('<hr'), parseCard(D).blocks[0].html.slice(0, 40));
  ok('  본문 소제목은 살아 있다', txt(D).includes('진짜 제목입니다'));

  // ✅ 안 건드려야 하는 것 — 본문 «안»의 인용문 (검단가온 의료 안내·기관 인용)
  const G = `# 제목입니다
${BODY}
> **의료 안내**: 치료 결과·기간은 개인차가 있습니다.
> 1. 국소 마취를 합니다.
![그림](https://ex.supabase.co/a/1.png)`;
  ok('✅ 본문 안 의료 안내 인용문은 «남는다»', txt(G).includes('의료 안내'));
  ok('✅ 본문 안 기관 인용문도 «남는다»', txt(G).includes('국소 마취'));

  // ✅ 맨 앞이 인용문이 «아니면» 아무것도 안 자른다
  const N = `# 제목입니다
${BODY}
![그림](https://ex.supabase.co/a/1.png)`;
  ok('✅ 안내문 없는 카드는 그대로', txt(N).includes('본문 문장입니다') && parseCard(N).title === '제목입니다');

  // 2차 방어선 — 새 모양이 자리 판정을 뚫어도 검증이 잡는다
  const leaked = validateCard(parseCard(`# 제목\n${BODY}\n문단 안에 붙여넣기 안내 라고 적혀 있다`));
  ok('🔴 자리 판정을 뚫어도 검증이 잡는다', leaked.ok === false && leaked.problems.some(p => p.includes('붙여넣기 안내')),
     JSON.stringify(leaked.problems));
}

// ─────────────────────────────────────────────────────────────
// [14] 🔴 썸네일이 없으면 «막는다» (2026-08-16 사장님 확정 — 「블로그는 전부 썸네일을 넣는다」)
//
//   그전까지 나는 카드 4장을 열어 보고 「엔노블·검단가온은 썸네일을 안 만든다」고 보고했다.
//   그건 **관측을 정책으로 오독**한 것이었다 — 카드가 빠뜨린 것이지 방침이 아니었다.
//   실제로 썸네일 생성기는 동료사마다 이미 있고(`zulgap-*-thumbnail`), **부르는 자리만 없었다.**
//
// @AI:CONSTRAINT 네이버는 대표를 «본문에 있는 그림 중에서만» 고른다 — 카드에 없으면
//   파서가 만들어낼 수 없다. 그래서 「경고」로는 부족하고 «차단»이 맞다(사장님 확정).
// @AI:CONSTRAINT 이 검사는 «전 동료사»에 걸린다. 지금 걸리는 것: 엔노블 4 · 검단가온 1 · 마미사.
//   그게 의도다 — 빠뜨린 것을 조용히 통과시키지 않는다.
// ─────────────────────────────────────────────────────────────
console.log('\n[14] 🔴 썸네일이 없으면 막는다');
{
  const BODY = '본문 문장입니다. '.repeat(40);
  const IMG = '![도식](https://ex.supabase.co/a/1.png)';
  const THUMB = '![](https://prod-files-secure.s3.amazonaws.com/x/thumb.png)';

  const withThumb = validateCard(parseCard(`# 제목\n${BODY}\n${IMG}\n## 썸네일 (1080 x 1080)\n${THUMB}`));
  ok('썸네일 있으면 통과', withThumb.ok === true, JSON.stringify(withThumb.problems));

  const noThumb = validateCard(parseCard(`# 제목\n${BODY}\n${IMG}`));
  ok('🔴 썸네일 없으면 막는다', noThumb.ok === false && noThumb.problems.some((p) => /썸네일/.test(p)),
     JSON.stringify(noThumb.problems));
  ok('  «왜»와 «어떻게»를 알려준다', noThumb.problems.some((p) => /검색결과|얼굴/.test(p) && /thumbnail|만들/.test(p)),
     JSON.stringify(noThumb.problems.filter((p) => /썸네일/.test(p))));

  // 🔴 「미제작」 — 헤딩은 있는데 그림이 없는 RPG 실측 구조. 헤딩만 보고 통과시키면 안 된다.
  const notMade = validateCard(parseCard(
    `# 제목\n${BODY}\n${IMG}\n## 썸네일 (1080 x 1080)\n⬜ **미제작** — 카드 본문 확정 후 일괄 제작 예정`));
  ok('🔴 헤딩만 있고 «미제작»이면 막는다', notMade.ok === false && notMade.problems.some((p) => /썸네일/.test(p)),
     JSON.stringify(notMade.problems));

  // @AI:CONSTRAINT 끄는 문(opts)을 열어 둔다 — 「썸네일 없이 급히 내보내야 한다」는 판단은
  //   사람 것이지 도구 것이 아니다. 다만 «명시»해야 열린다(기본값은 막는 쪽).
  const skipped = validateCard(parseCard(`# 제목\n${BODY}\n${IMG}`), { requireThumbnail: false });
  ok('사람이 명시로 끄면 통과한다', skipped.ok === true, JSON.stringify(skipped.problems));
  ok('  기본값은 «막는 쪽»이다', validateCard(parseCard(`# 제목\n${BODY}\n${IMG}`), {}).ok === false);

  // 이미지가 아예 0장인 카드는 «이미지 0장»으로 이미 막힌다 — 메시지가 겹쳐도 둘 다 나온다
  const noImg = validateCard(parseCard(`# 제목\n${BODY}`));
  ok('이미지 0장 + 썸네일 없음 = 둘 다 알려준다',
     noImg.problems.some((p) => /이미지가 0장/.test(p)) && noImg.problems.some((p) => /썸네일/.test(p)),
     JSON.stringify(noImg.problems));
}

// ─────────────────────────────────────────────────────────────
// 🔴 여백 정규화 — 이웃이 이미지면 2칸, 아니면 3칸 (2026-08-20)
//   규칙 자체는 naver-format 이 시험한다. 여기서는 «파서가 이웃을 제대로 보는가»를 본다.
// ─────────────────────────────────────────────────────────────
console.log('\n[여백] 조각 양 끝은 이웃이 정한다');
{
  const NF = require('../../../shared/naver-format/naver-format.js');
  const S = NF.SPACER;
  const CARD = [
    '# 제목입니다',
    '첫 문단입니다.',
    '둘째 문단입니다.',
    '![설명](https://example.com/a.png)',
    '셋째 문단입니다.',
  ].join('\n');
  const p = parseCard(CARD);
  const html = p.blocks.filter((b) => b.kind === 'html').map((b) => b.html);
  const head = (h) => { const L = h.split('\n'); let n = 0;
    for (let i = 0; i < L.length && L[i].trim() === S; i += 1) n += 1; return n; };
  const tail = (h) => { const L = h.split('\n'); let n = 0;
    for (let i = L.length - 1; i >= 0 && L[i].trim() === S; i -= 1) n += 1; return n; };
  const runAt = (h, from) => { const L = h.split('\n'); let n = 0;
    for (let i = from; i < L.length && L[i].trim() === S; i += 1) n += 1; return n; };

  ok('조각이 이미지로 갈렸다', html.length === 2 && p.images === 1, `${html.length}/${p.images}`);
  ok('글 «처음»에는 여백이 없다', head(html[0]) === 0, `${head(html[0])}칸`);
  ok('🔴 이미지 «앞»은 2칸', tail(html[0]) === 2, `${tail(html[0])}칸`);
  ok('🔴 이미지 «뒤»는 2칸', head(html[1]) === 2, `${head(html[1])}칸`);
  ok('문단 «사이»는 3칸', runAt(html[0], 1) === 3, `${runAt(html[0], 1)}칸`);
  ok('글 «끝»에는 여백이 없다', tail(html[1]) === 0, `${tail(html[1])}칸`);
  ok('결정론 — 두 번 파싱해도 같다',
     JSON.stringify(parseCard(CARD).blocks) === JSON.stringify(p.blocks));
}


console.log(`\n${'─'.repeat(46)}\nPASS ${pass} / FAIL ${fail}`);
process.exit(fail === 0 ? 0 : 1);
