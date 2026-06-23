# 줄갭 팀원용 셋업 스크립트 (Claude 데스크탑 앱 버전)
# 이 스크립트는 PPT·한글 도구가 돌아가게 Git·Node·uv를 설치합니다.
# Claude 자체는 데스크탑 앱(https://claude.ai/download)으로 설치하세요.
# 사용법: install.bat 더블클릭

$ErrorActionPreference = "Stop"
Write-Host ""
Write-Host "=== 줄갭 팀원 셋업 (데스크탑 앱용 도구 설치) ===" -ForegroundColor Cyan
Write-Host ""

# 1. Git for Windows (Claude 데스크탑 앱 필수)
if (-not (Get-Command git -ErrorAction SilentlyContinue)) {
  Write-Host "[설치 중] Git for Windows..." -ForegroundColor Yellow
  winget install -e --id Git.Git --accept-source-agreements --accept-package-agreements
} else { Write-Host "[OK] Git 확인됨" -ForegroundColor Green }

# 2. Node.js (MCP 도구 실행용)
if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
  Write-Host "[설치 중] Node.js LTS..." -ForegroundColor Yellow
  winget install -e --id OpenJS.NodeJS.LTS --accept-source-agreements --accept-package-agreements
} else { Write-Host "[OK] Node.js 확인됨" -ForegroundColor Green }

# 3. uv (pptx / hwp MCP 실행용)
if (-not (Get-Command uvx -ErrorAction SilentlyContinue)) {
  Write-Host "[설치 중] uv..." -ForegroundColor Yellow
  winget install -e --id astral-sh.uv --accept-source-agreements --accept-package-agreements
} else { Write-Host "[OK] uv 확인됨" -ForegroundColor Green }

# 4. 직원용 팀 지침(CLAUDE.md) 배치
$claudeDir = "$env:USERPROFILE\.claude"
New-Item -ItemType Directory -Force -Path $claudeDir | Out-Null
$src = Join-Path $PSScriptRoot "team-CLAUDE.md"
if (Test-Path $src) {
  Copy-Item $src (Join-Path $claudeDir "CLAUDE.md") -Force
  Write-Host "[OK] 팀 지침(CLAUDE.md) 배치됨" -ForegroundColor Green
}

# 5. 다음 단계 안내 (데스크탑 앱)
Write-Host ""
Write-Host "=== 도구 준비 완료! 이제 Claude 데스크탑 앱에서 ===" -ForegroundColor Cyan
Write-Host "  1) https://claude.ai/download 에서 Claude 데스크탑 앱 설치 (아직 안 했다면)"
Write-Host "  2) 앱 실행 -> 사장님이 알려준 같은 계정으로 로그인"
Write-Host "  3) 앱 설정/+ 메뉴 -> Plugins -> Add marketplace"
Write-Host "     -> GitHub 저장소: zulgap/claude-team-pack 입력"
Write-Host "  4) Plugins 목록에서 'zulgap' 플러그인 -> Install"
Write-Host "  5) Reload plugins (또는 앱 재시작)"
Write-Host "  6) 채팅창에 /시작 입력 -> 노션 허브가 뜨면 성공!"
Write-Host "  7) 한글(hwp) 문서를 쓰려면 한컴오피스 설치 (선택)"
Write-Host ""
Write-Host "* 메뉴 위치는 앱 버전마다 조금 다를 수 있어요. 안 보이면 화면을 캡처해서 사장님께 보내세요." -ForegroundColor Green
Write-Host ""
