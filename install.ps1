# 줄갭 팀원용 Claude Code 셋업 스크립트
# 사용법: install.bat 더블클릭 (또는 우클릭 → PowerShell로 실행)

$ErrorActionPreference = "Stop"
Write-Host ""
Write-Host "=== 줄갭 팀원 Claude Code 셋업 시작 ===" -ForegroundColor Cyan
Write-Host ""

# 1. Node.js
if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
  Write-Host "[설치 중] Node.js LTS..." -ForegroundColor Yellow
  winget install -e --id OpenJS.NodeJS.LTS --accept-source-agreements --accept-package-agreements
} else { Write-Host "[OK] Node.js 확인됨" -ForegroundColor Green }

# 2. uv (pptx / hwp MCP 실행용)
if (-not (Get-Command uvx -ErrorAction SilentlyContinue)) {
  Write-Host "[설치 중] uv..." -ForegroundColor Yellow
  winget install -e --id astral-sh.uv --accept-source-agreements --accept-package-agreements
} else { Write-Host "[OK] uv 확인됨" -ForegroundColor Green }

# 3. Claude Code
if (-not (Get-Command claude -ErrorAction SilentlyContinue)) {
  Write-Host "[설치 중] Claude Code..." -ForegroundColor Yellow
  npm install -g "@anthropic-ai/claude-code"
} else { Write-Host "[OK] Claude Code 확인됨" -ForegroundColor Green }

# 4. 직원용 팀 지침(CLAUDE.md) 배치 (플러그인은 CLAUDE.md 자동적용이 안 되므로 직접 복사)
$claudeDir = "$env:USERPROFILE\.claude"
New-Item -ItemType Directory -Force -Path $claudeDir | Out-Null
$src = Join-Path $PSScriptRoot "team-CLAUDE.md"
if (Test-Path $src) {
  Copy-Item $src (Join-Path $claudeDir "CLAUDE.md") -Force
  Write-Host "[OK] 팀 지침(CLAUDE.md) 배치됨" -ForegroundColor Green
}

# 5. 다음 단계 안내
Write-Host ""
Write-Host "=== 환경 준비 완료! 이제 아래를 따라하세요 ===" -ForegroundColor Cyan
Write-Host "  1) 터미널에 'claude' 입력 -> 사장님이 알려준 같은 계정으로 로그인"
Write-Host "  2) /plugin marketplace add zulgap/claude-team-pack"
Write-Host "  3) /plugin install zulgap@zulgap-team-pack"
Write-Host "  4) /reload-plugins"
Write-Host "  5) 1Password 금고 초대 수락 (키는 여기서만)"
Write-Host "  6) 한글(hwp) 문서를 쓰려면 한컴오피스 설치 필요"
Write-Host ""
Write-Host "완료 후 'claude' 실행하고 '/시작' 또는 '오늘 뭐부터' 라고 입력해보세요!" -ForegroundColor Green
Write-Host ""
