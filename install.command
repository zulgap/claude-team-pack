#!/bin/bash
# 줄갭 Claude 맥 설치 — 더블클릭용 (역할 무관 공용: staff/dev/master는 입력한 제디 토큰이 자동 결정)
# ⚠️ macOS 15(Sequoia)+는 우클릭→열기 우회 폐지 — 차단되면: 시스템 설정 → 개인정보 보호 및 보안 → "그래도 열기"
#    가장 확실한 경로는 터미널 한 줄: curl -fsSL https://raw.githubusercontent.com/zulgap/claude-team-pack/main/install.sh | bash
# 이 파일은 install.sh(원격 SSOT) 실행 1줄 래퍼 — 로직 추가 금지
clear
echo "=== 줄갭 Claude 설치 (macOS) ==="
echo "필요 파일을 GitHub에서 받아 설치합니다. 몇 분 걸릴 수 있어요."
echo "역할(직원/개발자/관리자)은 설치 중 붙여넣는 제디 토큰이 자동으로 결정합니다."
echo "  - 관리자: 기존 기기 토큰을 그대로 복사 (재발급 금지 — 기존 기기 토큰이 폐기됨)"
echo "  - 토큰이 없으면 Enter → 직원(staff) 기본 설치"
echo
TMP="$(mktemp)" && curl -fsSL "https://raw.githubusercontent.com/zulgap/claude-team-pack/main/install.sh" -o "$TMP" && bash "$TMP"
STATUS=$?
rm -f "$TMP"
echo
if [ $STATUS -eq 0 ]; then
  echo "✅ 완료! 바탕화면의 'Zulgap Claude'를 더블클릭해 시작하세요."
else
  echo "❌ 문제가 있었습니다. 위 메시지를 캡처해 사장님께 보내주세요."
fi
read -p "Enter 키를 누르면 창이 닫힙니다..."
