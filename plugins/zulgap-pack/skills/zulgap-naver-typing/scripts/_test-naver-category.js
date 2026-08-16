#!/usr/bin/env node
/**
 * naver-category 시나리오 — 픽스처는 «실측» 이다
 *   2026-08-16 ff1030 발행 패널 드롭다운에서 읽은 구조 (번호 + li.innerText)
 *   🔴 RPG 항목의 공백은 네이버가 넣은 `&nbsp;`(U+00A0) 를 «그대로» 재현했다
 * 실행: node _test-naver-category.js   (종료코드 0 = ALL PASS)
 */
const { matchCategory, normalize } = require('./naver-category');

let pass = 0, fail = 0;
const ok = (n, c, d = '') => { c ? (pass++, console.log(`  ✅ ${n}`)) : (fail++, console.log(`  ❌ ${n}${d ? '  → ' + d : ''}`)); };

const NB = ' ';   // 네이버가 카테고리 이름 공백에 쓰는 문자
const LIST = [
  { no: '89',  text: '줄갭이 뭐죠?' },
  { no: '109', text: '하위 카테고리 마케터가? 엔지니어를?' },
  { no: '103', text: '하위 카테고리 줄갭소개' },
  { no: '105', text: '하위 카테고리 줄갭의 철학' },
  { no: '94',  text: '더 줄갭 프로젝트 사례' },
  { no: '99',  text: '하위 카테고리 온라인 독립 사례' },
  { no: '102', text: 'The 줄갭 프로젝트 신청하기' },
  { no: '111', text: `RPG_수출입${NB}어디까지${NB}해봤니` },   // ← 실측 그대로
  { no: '112', text: `마미사_ai로${NB}회사${NB}굴립니다` },     // ← 실측 그대로
  { no: '73',  text: '마케팅 인사이트 줄GAP' },
  { no: '75',  text: '하위 카테고리 마케팅 줄GAP' },
  { no: '98',  text: '하위 카테고리 세일즈 줄GAP' },
  { no: '96',  text: '일상 줄GAP' },
  { no: '97',  text: '[블챌] 주간일기 챌린지' },
];

console.log('\n[1] normalize');
ok('하위 접두사 제거', normalize('하위 카테고리 마케팅 줄GAP') === '마케팅 줄GAP');
ok('🔴 nbsp 를 보통 공백으로', normalize(`RPG_수출입${NB}어디까지${NB}해봤니`) === 'RPG_수출입 어디까지 해봤니');
ok('연속 공백 1칸', normalize('마케팅   줄GAP') === '마케팅 줄GAP');
ok('앞뒤 공백 제거', normalize('  마케팅 줄GAP  ') === '마케팅 줄GAP');
ok('제로폭 문자 제거', normalize('마케팅​ 줄GAP') === '마케팅 줄GAP');
ok('빈값은 빈문자', normalize(null) === '' && normalize(undefined) === '');
ok('"하위 카테고리" 만 있는 이름은 안 깎음', normalize('하위 카테고리') === '하위 카테고리');

console.log('\n[2] 세 동료사 — 실제 쓸 값 (번호 + 이름 둘 다 일치)');
const 마미사 = matchCategory(LIST, { no: '112', name: '마미사_ai로 회사 굴립니다' });
ok('마미사(112) 적중', 마미사.ok, JSON.stringify(마미사));
const rpg = matchCategory(LIST, { no: '111', name: 'RPG_수출입 어디까지 해봤니' });
ok('RPG(111) 적중 — nbsp 를 넘어서', rpg.ok, JSON.stringify(rpg));
const 줄갭 = matchCategory(LIST, { no: '75', name: '마케팅 줄GAP' });
ok('줄갭(75) 적중 — 하위 카테고리', 줄갭.ok, JSON.stringify(줄갭));
ok('숫자로 줘도 된다', matchCategory(LIST, { no: 112, name: '마미사_ai로 회사 굴립니다' }).ok);

console.log('\n[3] 🔴 번호와 이름이 어긋나면 «멈춘다»');
const 이름바뀜 = matchCategory(LIST, { no: '112', name: '마미사_AI로 회사를 굴립니다' });
ok('이름이 다르면 NAME_CHANGED', !이름바뀜.ok && 이름바뀜.code === 'NAME_CHANGED', JSON.stringify(이름바뀜));
ok('실제 이름을 알려준다', 이름바뀜.actual === '마미사_ai로 회사 굴립니다');
const 번호바뀜 = matchCategory(LIST, { no: '999', name: '마미사_ai로 회사 굴립니다' });
ok('번호가 없으면 NOT_FOUND', !번호바뀜.ok && 번호바뀜.code === 'NOT_FOUND');
ok('없을 때 후보를 준다', Array.isArray(번호바뀜.candidates) && 번호바뀜.candidates.length === LIST.length);
const 엇갈림 = matchCategory(LIST, { no: '111', name: '마미사_ai로 회사 굴립니다' });
ok('번호 111 + 마미사 이름 → 거부', !엇갈림.ok && 엇갈림.code === 'NAME_CHANGED');

console.log('\n[4] fail-closed — 빈값·빈목록');
ok('번호 없음 → EMPTY', matchCategory(LIST, { name: '마케팅 줄GAP' }).code === 'EMPTY');
ok('이름 없음 → EMPTY', matchCategory(LIST, { no: '75' }).code === 'EMPTY');
ok('공백뿐인 이름 → EMPTY', matchCategory(LIST, { no: '75', name: '   ' }).code === 'EMPTY');
ok('want 자체가 없으면 EMPTY', matchCategory(LIST, undefined).code === 'EMPTY');
ok('목록 없음 → NO_LIST', matchCategory([], { no: '75', name: '마케팅 줄GAP' }).code === 'NO_LIST');
ok('목록 null → NO_LIST', matchCategory(null, { no: '75', name: '마케팅 줄GAP' }).code === 'NO_LIST');

console.log('\n[5] 이름만으로는 못 고른다 — 번호가 주 키다');
ok('이름이 맞아도 번호가 틀리면 거부', !matchCategory(LIST, { no: '75', name: '일상 줄GAP' }).ok);
ok('설정에 접두사째 적어도 통한다', matchCategory(LIST, { no: '75', name: '하위 카테고리 마케팅 줄GAP' }).ok);

console.log('\n[6] 예약 시각 — 노션 「예상 발행일」을 그대로 옮긴다');
{
  const { parseScheduleAt } = require('./naver-category');
  const okCase = parseScheduleAt('2026-08-16T19:20:00');
  ok('ISO 시각을 읽는다', okCase.ok && okCase.hour === '19' && okCase.minute === '20', JSON.stringify(okCase));
  ok('네이버 날짜 표기로 바꾼다', okCase.date === '2026. 08. 16', okCase.date);
  ok('공백형도 받는다', parseScheduleAt('2026-08-16 19:20').ok);

  // 🔴 조용히 고치지 않는다 — 노션에 적힌 시각과 실제 발행 시각이 어긋나면 아무도 못 본다
  const odd = parseScheduleAt('2026-08-16T19:23:00');
  ok('🔴 10분 단위가 아니면 «반올림하지 않고» 거부한다', !odd.ok && odd.code === 'MINUTE_STEP', JSON.stringify(odd));
  ok('무엇을 고쳐야 하는지 알려준다', /노션의 발행 시각을 고쳐/.test(odd.reason || ''), odd.reason);

  const noTime = parseScheduleAt('2026-08-16');
  ok('날짜만 있으면 거부한다(시각이 정본이다)', !noTime.ok && noTime.code === 'NO_TIME');
  ok('빈 값도 거부한다', !parseScheduleAt('').ok && !parseScheduleAt(null).ok);

  ['00', '10', '20', '30', '40', '50'].forEach((mm) => {
    ok(`  ${mm}분은 통과`, parseScheduleAt(`2026-08-16T09:${mm}:00`).ok);
  });

  // 🔴 회귀 방어 — 노션은 UTC 로 준다. 이 변환이 빠지면 9시간 어긋난 시각에 발행된다.
  const utc = parseScheduleAt('2026-08-16 10:20:00Z');
  ok('🔴 노션 UTC 를 KST 로 옮긴다 (10:20Z → 19:20)', utc.ok && utc.hour === '19' && utc.minute === '20', JSON.stringify(utc));
  const cross = parseScheduleAt('2026-08-16T15:30:00Z');
  ok('  자정을 넘기면 날짜도 넘어간다 (15:30Z → 17일 00:30)',
     cross.ok && cross.date === '2026. 08. 17' && cross.hour === '00', JSON.stringify(cross));
  const plus = parseScheduleAt('2026-08-16T10:20:00+00:00');
  ok('  +00:00 표기도 같게 본다', plus.ok && plus.hour === '19', JSON.stringify(plus));
  const local = parseScheduleAt('2026-08-16T19:20:00');
  ok('  오프셋이 없으면 «이미 현지시각»으로 그대로 둔다', local.ok && local.hour === '19', JSON.stringify(local));
}

console.log(`\n${fail === 0 ? '✅ ALL PASS' : '❌ FAIL'}  ${pass}/${pass + fail}\n`);
process.exit(fail === 0 ? 0 : 1);
