// resolve-font.js — 자막용 한글 볼드 폰트를 시스템에서 조달한다.
//
// @AI:DEPENDS 이 폰트는 레포에 번들할 수 없다(맑은 고딕·Apple SD Gothic 모두 재배포 불가).
//   그래서 경로를 하드코딩하는 대신 OS별 후보를 순서대로 찾는다. 기준은 Windows 맑은 고딕 Bold 이고,
//   대체본은 굵기·자폭이 달라 자막 줄바꿈 위치가 미세하게 달라질 수 있다.
// @AI:CONSTRAINT ffmpeg drawtext 는 fontfile 을 상대경로로 받아야 한다(Windows 드라이브 콜론
//   이스케이프 회피 — overlay-subtitles.js 상단 주석 참고). 호출부는 이 함수가 돌려준 경로를
//   작업 디렉토리에 `malgunbd.ttf` 라는 이름으로 복사해서 쓴다. 파일명은 그 규약이라 바꾸지 말 것.
const fs = require('fs');

const FONT_CANDIDATES = [
  'C:/Windows/Fonts/malgunbd.ttf',                          // Windows 맑은 고딕 Bold (기준)
  'C:/Windows/Fonts/malgun.ttf',                            // Windows 맑은 고딕 (볼드 부재 시)
  '/System/Library/Fonts/AppleSDGothicNeo.ttc',             // macOS
  '/Library/Fonts/AppleGothic.ttf',                         // macOS (구버전)
  '/usr/share/fonts/truetype/nanum/NanumGothicBold.ttf',    // Linux (나눔)
  '/usr/share/fonts/opentype/noto/NotoSansCJK-Bold.ttc',    // Linux (Noto)
];

/** 존재하는 첫 후보 경로. 하나도 없으면 null. */
function resolveFont() {
  return FONT_CANDIDATES.find((p) => fs.existsSync(p)) || null;
}

/**
 * 현재 작업 디렉토리에 `malgunbd.ttf` 를 보장한다(이미 있으면 그대로 둔다).
 * 폰트를 못 찾으면 자막이 통째로 깨진 채 인코딩되므로, 조용히 넘기지 않고 즉시 실패시킨다.
 */
function ensureFontHere(fileName = 'malgunbd.ttf') {
  if (fs.existsSync(fileName)) return fileName;
  const src = resolveFont();
  if (!src) {
    throw new Error(
      '[폰트 없음] 자막용 한글 폰트를 찾지 못했다.\n확인한 경로:\n' +
        FONT_CANDIDATES.map((p) => '  ' + p).join('\n') +
        '\n→ 한글 폰트를 설치하거나 scripts/resolve-font.js 의 FONT_CANDIDATES 에 경로를 추가할 것.'
    );
  }
  fs.copyFileSync(src, fileName);
  if (src !== FONT_CANDIDATES[0]) {
    console.warn(
      `[알림] 자막 폰트 대체본 사용: ${src}\n` +
        '       기준은 맑은 고딕 Bold 다. 자폭이 달라 줄바꿈 위치가 다를 수 있으니 결과 영상을 확인할 것.'
    );
  }
  return fileName;
}

module.exports = { FONT_CANDIDATES, resolveFont, ensureFontHere };
