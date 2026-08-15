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

console.log(`\n${fail === 0 ? '✅ ALL PASS' : '❌ FAIL'}  ${pass}/${pass + fail}\n`);
process.exit(fail === 0 ? 0 : 1);
