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
const M = parseCard(MAMISA), MV = validateCard(M);
ok('제목을 「### 제목」 다음 줄에서 집는다', M.title === '구글 애널리틱스에서 「직접」이 제일 크면 확인해야 할 네 가지', String(M.title));
ok('앞쪽 내부 메모를 버린다', M.dropped > 10, `dropped=${M.dropped}`);
ok('원고를 살린다(이미지 1장)', M.images === 1);
ok('검증 통과', MV.ok === true, JSON.stringify(MV.problems));
const mPlain = M.blocks.filter(b => b.kind === 'html').map(b => b.html).join('\n').replace(/<[^>]+>/g, '');
ok('「검수 결과」가 본문에 안 남는다', !mPlain.includes('검수 결과'));
ok('「황금키워드」가 본문에 안 남는다', !mPlain.includes('황금키워드'));
ok('해시태그 내용은 남는다', mPlain.includes('#구글애널리틱스'));

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
ok('카드에 제목이 없으면 문제로 잡는다', validateCard(E).ok === false);
ok('노션 제목을 넘기면 통과', validateCard(E, { title: '결혼정보회사 등급표, 그대로 믿어도 될까요' }).ok === true,
   JSON.stringify(validateCard(E, { title: 'x' }).problems));

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
const G = parseCard(GAON), GV = validateCard(G);
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

console.log(`\n${'─'.repeat(46)}\nPASS ${pass} / FAIL ${fail}`);
process.exit(fail === 0 ? 0 : 1);
