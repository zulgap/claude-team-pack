#!/usr/bin/env node
/**
 * ready-to-register 판정 — 브라우저 없이 «순수 함수»만 본다.
 *
 * @AI:INTENT 이 판정이 무르면 사람이 «누르면 안 되는 창»을 누른다. 등록은 되돌릴 수 없으므로
 *   「하나라도 걸리면 거부」를 시나리오로 못 박는다.
 * 실행: node _test-ready-to-register.js   (종료코드 0 = ALL PASS)
 */
const { sortBySchedule, judgeRow, normalizeName } = require('./ready-to-register');

let pass = 0, fail = 0;
const ok = (n, c, d = '') => { c ? (pass++, console.log(`  ✅ ${n}`)) : (fail++, console.log(`  ❌ ${n}${d ? '  → ' + d : ''}`)); };

/** 정상 창 한 벌 — 여기서 하나씩 망가뜨려 본다. */
const 정상 = () => ({
  title: 'UTM 파라미터 붙이기 전에 표기 규칙부터 정하세요',
  chars: 2580,
  slots: 11,
  images_expected: 11,
  category: '마미사_ai로 회사 굴립니다',
  schedule: { reserved: true, date: '2026. 08. 17', hour: '19', minute: '20', at: '2026. 08. 17 19:20' },
  hasPublishBtn: true,
  rep: { index: 0, total: 11 },
  panelOpen: true,   // 카테고리·예약은 발행 패널 «안»에서만 읽힌다
});
const 기대 = { category: '마미사_ai로 회사 굴립니다' };

console.log('\n[1] 순서 — 사람이 누르는 순서가 곧 발행 순서다');
{
  const rows = [
    { title: '3편', schedule: { at: '2026. 08. 17 22:30' } },
    { title: '1편', schedule: { at: '2026. 08. 17 19:20' } },
    { title: '2편', schedule: { at: '2026. 08. 17 20:50' } },
  ];
  const s = sortBySchedule(rows).map((r) => r.title);
  ok('예약이 이른 것부터', JSON.stringify(s) === JSON.stringify(['1편', '2편', '3편']), JSON.stringify(s));

  const 섞임 = sortBySchedule([
    { title: '예약없음', schedule: { at: '' } },
    { title: '예약있음', schedule: { at: '2026. 08. 17 19:20' } },
  ]).map((r) => r.title);
  ok('예약 없는 창은 뒤로 민다', 섞임[0] === '예약있음', JSON.stringify(섞임));

  ok('원본 배열을 건드리지 않는다', (() => {
    const orig = [{ title: 'b', schedule: { at: '2' } }, { title: 'a', schedule: { at: '1' } }];
    sortBySchedule(orig);
    return orig[0].title === 'b';
  })());
}

console.log('\n[2] 정상이면 통과');
{
  const v = judgeRow(정상(), 기대);
  ok('전부 갖춰지면 ok', v.ok, JSON.stringify(v.problems));
  ok('기대 카테고리를 안 주면 카테고리는 안 본다', judgeRow(정상(), {}).ok);
}

console.log('\n[3] 🔴 하나라도 걸리면 «누르지 마세요»');
{
  const 사례 = [
    ['예약이 안 걸렸다 (누르면 지금 나간다)', (r) => { r.schedule = { reserved: false, at: '' }; }],
    ['예약 날짜가 비었다', (r) => { r.schedule.date = ''; }],
    ['예약 시각이 비었다', (r) => { r.schedule.hour = ''; }],
    ['카테고리가 다르다', (r) => { r.category = '줄갭이 뭐죠?'; }],
    ['카테고리를 못 읽었다', (r) => { r.category = null; }],
    ['그림 자리가 모자라다', (r) => { r.slots = 9; }],
    ['발행 버튼이 안 보인다', (r) => { r.hasPublishBtn = false; }],
    ['제목이 비었다', (r) => { r.title = ''; }],
    ['본문이 비었다', (r) => { r.chars = 0; }],
  ];
  for (const [name, 망가뜨림] of 사례) {
    const r = 정상(); 망가뜨림(r);
    const v = judgeRow(r, 기대);
    ok(name, !v.ok && v.problems.length > 0, JSON.stringify(v));
  }
}

// @AI:CONSTRAINT 🔴 예약 미설정을 «경고»로 낮추지 말 것 — 그 상태로 누르면 그 자리에서 발행된다.
console.log('\n[4] 🔴 예약 미설정은 특히 위험하다 (지금 나간다)');
{
  const r = 정상(); r.schedule = { reserved: false, date: '', hour: '', minute: '', at: '' };
  const v = judgeRow(r, 기대);
  ok('사유에 «지금»이라고 적어 준다', !v.ok && v.problems.some((p) => p.includes('지금')), JSON.stringify(v.problems));
}

console.log('\n[5] 카테고리 이름 비교 — 네이버 nbsp 를 흡수한다');
{
  const NB = ' ';
  ok('nbsp 가 섞여도 같게 본다', normalizeName(`마미사_ai로${NB}회사${NB}굴립니다`) === '마미사_ai로 회사 굴립니다');
  ok('하위 카테고리 접두사를 뗀다', normalizeName('하위 카테고리 마케팅 줄GAP') === '마케팅 줄GAP');
  const r = 정상(); r.category = `마미사_ai로${NB}회사${NB}굴립니다`;
  ok('🔴 그래서 실제 화면값으로도 통과한다', judgeRow(r, 기대).ok, JSON.stringify(judgeRow(r, 기대).problems));
}

// @AI:INTENT 대표 이미지 = 검색결과·블로그 목록에 뜨는 «얼굴». 지정을 안 하면 네이버가 첫 장을
//   쓰므로 대개는 뜨지만, 그림이 있는데 «대표가 없는» 상태면 얼굴 없이 나간다.
//   2026-08-16 실측으로 열린 축이다 — 그 전에는 스킬에 이 개념 자체가 없었다.
console.log('\n[6] 대표 이미지');
{
  const r1 = 정상(); r1.rep = { index: null, total: 11 };
  const v1 = judgeRow(r1, 기대);
  ok('🔴 그림이 있는데 대표가 없으면 거부', !v1.ok && v1.problems.some((p) => p.includes('대표')), JSON.stringify(v1.problems));

  const r2 = 정상(); r2.rep = { index: 3, total: 11 };
  ok('  첫 장이 아니어도 지정만 돼 있으면 통과', judgeRow(r2, 기대).ok);

  const r3 = 정상(); r3.rep = { index: null, total: 0 };
  ok('  그림이 아예 없으면 대표를 묻지 않는다', judgeRow(r3, 기대).ok);

  const r4 = 정상(); delete r4.rep;
  ok('  rep 를 못 읽었으면(구버전 모듈) 막지 않는다', judgeRow(r4, 기대).ok);
}

console.log('\n[7] 🔴 «못 읽은 것»과 «안 걸린 것»은 다르다 (2026-08-20 실사고)');
{
  // 후처리(캡션·태그·AI 표시)가 발행 패널을 닫아 두면 카테고리·예약 입력칸이 DOM 에서
  // 사라진다. 그걸 「예약 안 걸림」으로 말하는 바람에, 예약이 «멀쩡히 걸린» 5편 전부가
  // 「누르면 지금 나갑니다」로 나왔다. 사람이 패널을 열자 그대로 5편 전부 통과했다.
  const 닫힘 = { ...정상(), panelOpen: false, hasPublishBtn: false, category: null,
                 schedule: { reserved: false, date: '', hour: '', minute: '', at: '' } };
  const v = judgeRow(닫힘, 기대);

  ok('🔴 그래도 통과시키지는 «않는다»', !v.ok);
  ok('🔴 «예약이 없다»고 말하지 않는다',
     !v.problems.some((p) => /예약이 걸려 있지 않습니다/.test(p)), JSON.stringify(v.problems));
  ok('패널이 닫혔다고 «정확히» 말한다',
     v.problems.some((p) => /발행 패널이 닫혀 있어/.test(p)), JSON.stringify(v.problems));
  ok('사유를 한 줄로 모은다 (겹쳐 쌓지 않는다)', v.problems.length === 1, JSON.stringify(v.problems));

  // 패널이 열려 있는데 «진짜로» 예약이 없으면 예전 문구가 그대로 나와야 한다
  const 진짜없음 = { ...정상(), schedule: { reserved: false, date: '', hour: '', minute: '', at: '' } };
  const v2 = judgeRow(진짜없음, 기대);
  ok('🔴 패널이 열렸는데 예약이 없으면 «지금 나갑니다»로 막는다',
     !v2.ok && v2.problems.some((p) => /누르면 «지금» 나갑니다/.test(p)), JSON.stringify(v2.problems));
}

console.log(`\n${fail === 0 ? '✅ ALL PASS' : '❌ FAIL'}  ${pass}/${pass + fail}\n`);
process.exit(fail === 0 ? 0 : 1);
