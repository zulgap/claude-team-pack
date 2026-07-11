# 줄갭 팀원용 셋업 스크립트 (Claude Code 자동 설정)
# 이 스크립트가 자동으로 하는 일:
#   1) PPT·한글·노션 도구가 돌아가게 Git·Node·uv 설치
#   2) Claude Code(작업 도구 본체) 설치
#   3) 줄갭 플러그인(시작·세션저널·PPT·한글) 자동 등록  <- 앱 메뉴/슬래시 명령 입력 불필요
#   4) 바탕화면에 "줄갭 Claude" 바로가기 생성
#   5) (선택) 제디(회사 데이터) 연결 - 토큰 받은 분만
# 사용법: install.bat 더블클릭 (개발자: install-dev.bat — 영어 dev 가이드/지침으로 설치)

# @AI:INTENT v1.18 역할 분기 — dev면 영어 지침(team-CLAUDE-en.md) + role 파일 기록(훅이 dev 가이드 fetch).
#   param은 주석 뒤 첫 실행문이어야 함(PowerShell 문법). ValidateSet으로 오타 차단.
#   v1.20: role의 원천은 제디 토큰 JWT claim(훅이 매 세션 유도) — 이 인자는 토큰 없는 초기 폴백 + CLAUDE.md stub 선택용.
#   master = 사장님(어드민 기기): CLAUDE.md 안 건드림 + 훅이 팀 가이드 주입 skip. 개인 설정과 공존.
param([ValidateSet('staff','dev','master')][string]$Role = 'staff')

$ErrorActionPreference = "Stop"
Write-Host ""
Write-Host "=== 줄갭 팀원 셋업 (Claude Code 자동 설정) [role: $Role] ===" -ForegroundColor Cyan
Write-Host ""

# 0. winget 위치 resolve + PATH 갱신 헬퍼
# @AI:CONSTRAINT 관리자(self-elevate)로 실행되면 PATH에 per-user WindowsApps(winget)가 빠질 수 있음
#   -> Get-Command 실패 시 LOCALAPPDATA\Microsoft\WindowsApps\winget.exe 직접 사용. 둘 다 없으면 안내 후 종료.
function Resolve-Winget {
  $c = Get-Command winget.exe -ErrorAction SilentlyContinue
  if ($c) { return $c.Source }
  $p = Join-Path $env:LOCALAPPDATA 'Microsoft\WindowsApps\winget.exe'
  if (Test-Path $p) { return $p }
  return $null
}
function Update-Path {
  # winget 설치 후 같은 세션에서 node/npm 등을 찾으려면 PATH를 다시 읽어야 함
  $env:Path = [Environment]::GetEnvironmentVariable('Path','Machine') + ';' + [Environment]::GetEnvironmentVariable('Path','User')
}
$winget = Resolve-Winget
if (-not $winget) {
  Write-Host "[중요] winget(App Installer)을 찾을 수 없습니다." -ForegroundColor Red
  Write-Host "  Microsoft Store에서 'App Installer'를 설치/업데이트한 뒤 install.bat을 다시 실행하세요." -ForegroundColor Yellow
  Write-Host "  Store: ms-windows-store://pdp/?productid=9NBLGGH4NNS1"
  Read-Host "엔터를 누르면 종료"
  exit 1
}

# 1. Git for Windows
if (-not (Get-Command git -ErrorAction SilentlyContinue)) {
  Write-Host "[설치 중] Git for Windows..." -ForegroundColor Yellow
  & $winget install -e --id Git.Git --accept-source-agreements --accept-package-agreements
} else { Write-Host "[OK] Git 확인됨" -ForegroundColor Green }

# 2. Node.js (MCP 도구 실행용)
if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
  Write-Host "[설치 중] Node.js LTS..." -ForegroundColor Yellow
  & $winget install -e --id OpenJS.NodeJS.LTS --accept-source-agreements --accept-package-agreements
} else { Write-Host "[OK] Node.js 확인됨" -ForegroundColor Green }

# 3. uv (pptx / hwp MCP 실행용)
if (-not (Get-Command uvx -ErrorAction SilentlyContinue)) {
  Write-Host "[설치 중] uv..." -ForegroundColor Yellow
  & $winget install -e --id astral-sh.uv --accept-source-agreements --accept-package-agreements
} else { Write-Host "[OK] uv 확인됨" -ForegroundColor Green }

# winget 설치분이 현재 세션 PATH에 잡히도록 갱신 (node/npm/claude 후속 사용 대비)
Update-Path

# 3.5 git이 GitHub를 HTTPS로 받게 강제 (Claude Code 플러그인 설치가 SSH로 붙는 알려진 버그 회피 — issue #47088)
# @AI:CONSTRAINT SSH 키 없는 직원은 /plugin install이 'Host key verification failed'로 실패.
#   github SSH -> HTTPS 재작성으로 키 없이 public repo 클론 성공. 멱등(unset-all 후 재add로 중복 방지).
try {
  try { git config --global --unset-all 'url.https://github.com/.insteadOf' 2>$null } catch {}
  git config --global --add 'url.https://github.com/.insteadOf' 'git@github.com:'
  git config --global --add 'url.https://github.com/.insteadOf' 'ssh://git@github.com/'
  Write-Host "[OK] git GitHub HTTPS 설정 완료 (플러그인 SSH 오류 예방)" -ForegroundColor Green
} catch { Write-Host "[참고] git HTTPS 설정 건너뜀 (git 미설치?)" -ForegroundColor Yellow }

# 4. Claude Code 설치 (작업 도구 본체)
# @AI:INTENT 도구(시작/PPT/한글)는 전부 Claude Code 플러그인 -> 데스크탑 채팅앱이 아니라 Claude Code가 본체여야 함.
$claudeBin = Join-Path $env:USERPROFILE ".local\bin"
$claudeExe = Join-Path $claudeBin "claude.exe"
# claude.exe가 이미 있으면(설치기 PATH 등록만 실패한 경우 포함) 재다운로드 skip — PATH 보장은 아래에서.
if (-not (Get-Command claude -ErrorAction SilentlyContinue) -and -not (Test-Path $claudeExe)) {
  Write-Host "[설치 중] Claude Code..." -ForegroundColor Yellow
  try {
    Invoke-RestMethod https://claude.ai/install.ps1 | Invoke-Expression
  } catch {
    Write-Host "[대체] winget으로 Claude Code 설치 시도..." -ForegroundColor Yellow
    try { & $winget install -e --id Anthropic.ClaudeCode --accept-source-agreements --accept-package-agreements }
    catch { Write-Host "[경고] Claude Code 자동 설치 실패 - 사장님께 화면을 보내주세요." -ForegroundColor Red }
  }
} else { Write-Host "[OK] Claude Code 확인됨" -ForegroundColor Green }

# @AI:CONSTRAINT claude.ai 설치기가 .local\bin을 User PATH에 못 박는 경우가 있음(직원 PC 실측 2026-06-29: "'claude'은(는) ... 아닙니다").
#   설치기 PATH 등록을 신뢰하지 않고, claude.exe가 있으면 .local\bin을 User PATH에 멱등 보장 + 현재 세션 PATH도 갱신.
#   이게 빠지면 바탕화면 바로가기(cmd /k claude)가 새 PC에서 claude를 못 찾음(증상 근본).
if (Test-Path $claudeExe) {
  $userPath = [Environment]::GetEnvironmentVariable('Path','User'); if (-not $userPath) { $userPath = '' }
  if ($userPath -notlike "*$claudeBin*") {
    [Environment]::SetEnvironmentVariable('Path', ($userPath.TrimEnd(';') + ';' + $claudeBin), 'User')
    Write-Host "[OK] claude 경로 PATH 등록 (.local\bin)" -ForegroundColor Green
  } else { Write-Host "[OK] claude 경로 PATH 확인됨" -ForegroundColor Green }
}
Update-Path
if ((Test-Path $claudeExe) -and ($env:Path -notlike "*$claudeBin*")) { $env:Path = "$env:Path;$claudeBin" }

# 5. 팀 지침(CLAUDE.md) 배치 + 역할(role) 기록
$claudeDir = "$env:USERPROFILE\.claude"
New-Item -ItemType Directory -Force -Path $claudeDir | Out-Null
# @AI:INTENT role 파일 = team-guide-fetch.js 훅의 분기 키 (dev -> docs/dev-guide-en.md fetch). ASCII 한 단어만.
$zulgapDirEarly = Join-Path $claudeDir "zulgap"
New-Item -ItemType Directory -Force -Path $zulgapDirEarly | Out-Null
Set-Content -Path (Join-Path $zulgapDirEarly "role") -Value $Role -Encoding Ascii -NoNewline
# @AI:CONSTRAINT master(어드민 기기)는 CLAUDE.md를 절대 덮지 않음 — 개인 마스터 설정 보존 (v1.20)
if ($Role -eq 'master') {
  Write-Host "[SKIP] master role — 개인 CLAUDE.md 보존 (팀 지침 미배치)" -ForegroundColor Yellow
} else {
  $stubName = if ($Role -eq 'dev') { "team-CLAUDE-en.md" } else { "team-CLAUDE.md" }
  $src = Join-Path $PSScriptRoot $stubName
  if (Test-Path $src) {
    Copy-Item $src (Join-Path $claudeDir "CLAUDE.md") -Force
    Write-Host "[OK] 팀 지침(CLAUDE.md) 배치됨 ($stubName)" -ForegroundColor Green
  }
}

# 6. 줄갭 플러그인 자동 등록 (~/.claude/settings.json)
# @AI:INTENT 비개발 팀원이 앱 메뉴/슬래시 명령을 못 찾아 막히는 문제 -> settings.json에 직접 등록해 첫 실행 시 자동 설치.
# @AI:CONSTRAINT 키 형식은 사장님 PC 실제 작동본과 동일(맵 형태 + source.source="github"). array/type 형식은 무효(silent fail).
$settingsPath = Join-Path $claudeDir "settings.json"
try {
  if (Test-Path $settingsPath) { Copy-Item $settingsPath "$settingsPath.bak" -Force }
  $s = if (Test-Path $settingsPath) { (Get-Content $settingsPath -Raw -Encoding UTF8 | ConvertFrom-Json) } else { [pscustomobject]@{} }
  if ($null -eq $s) { $s = [pscustomobject]@{} }
  if (-not ($s.PSObject.Properties.Name -contains 'extraKnownMarketplaces') -or $null -eq $s.extraKnownMarketplaces) {
    $s | Add-Member -NotePropertyName extraKnownMarketplaces -NotePropertyValue ([pscustomobject]@{}) -Force
  }
# @AI:INTENT autoUpdate=true -> Claude Code 시작 시 마켓플레이스(스킬) 자동 pull. 직원 zip 재설치 불필요.
  $mp = [pscustomobject]@{ source = [pscustomobject]@{ source = "github"; repo = "zulgap/claude-team-pack" }; autoUpdate = $true }
  $s.extraKnownMarketplaces | Add-Member -NotePropertyName 'zulgap-team-pack' -NotePropertyValue $mp -Force
  if (-not ($s.PSObject.Properties.Name -contains 'enabledPlugins') -or $null -eq $s.enabledPlugins) {
    $s | Add-Member -NotePropertyName enabledPlugins -NotePropertyValue ([pscustomobject]@{}) -Force
  }
  $s.enabledPlugins | Add-Member -NotePropertyName 'zulgap@zulgap-team-pack' -NotePropertyValue $true -Force

  # 6.5 안내문 원격 자동갱신 훅 (standalone SessionStart) — team-guide.md를 매 세션 GitHub에서 받아 주입
  # @AI:CONSTRAINT standalone 훅만 additionalContext 주입됨(#16538). 플러그인 번들 훅 금지 -> settings.json에 직접 등록.
  $zulgapDir = Join-Path $claudeDir "zulgap"
  New-Item -ItemType Directory -Force -Path $zulgapDir | Out-Null
  $hookSrc = Join-Path $PSScriptRoot "hooks\team-guide-fetch.js"
  $hookDst = Join-Path $zulgapDir "team-guide-fetch.js"
  if (Test-Path $hookSrc) { Copy-Item $hookSrc $hookDst -Force }
  $hookCmd = "node `"$hookDst`""
  if (-not ($s.PSObject.Properties.Name -contains 'hooks') -or $null -eq $s.hooks) {
    $s | Add-Member -NotePropertyName hooks -NotePropertyValue ([pscustomobject]@{}) -Force
  }
  if (-not ($s.hooks.PSObject.Properties.Name -contains 'SessionStart') -or $null -eq $s.hooks.SessionStart) {
    $s.hooks | Add-Member -NotePropertyName SessionStart -NotePropertyValue @() -Force
  }
  # 멱등: 이미 우리 훅이 등록돼 있으면 skip (기존 훅 보존, 재실행 중복 방지)
  $already = $false
  foreach ($g in @($s.hooks.SessionStart)) { foreach ($h in @($g.hooks)) { if ($h.command -like '*team-guide-fetch.js*') { $already = $true } } }
  if (-not $already) {
    $entry = [pscustomobject]@{ matcher = 'startup'; hooks = @([pscustomobject]@{ type = 'command'; command = $hookCmd; timeout = 10 }) }
    $s.hooks.SessionStart = @($s.hooks.SessionStart) + $entry
  }

  # 6.6 프롬프트 캡처 훅 (standalone UserPromptSubmit) — 지시문을 judgmentos prompt_log로 전송 (데이터 해자)
  # @AI:CONSTRAINT 토큰(~/.claude.json mcpServers.jedi.env.JUDGMENTOS_TOKEN) 없으면 훅이 조용히 skip. 프롬프트 절대 차단 X.
  $pcSrc = Join-Path $PSScriptRoot "hooks\prompt-capture.js"
  $pcDst = Join-Path $zulgapDir "prompt-capture.js"
  if (Test-Path $pcSrc) { Copy-Item $pcSrc $pcDst -Force }
  $pcCmd = "node `"$pcDst`""
  if (-not ($s.hooks.PSObject.Properties.Name -contains 'UserPromptSubmit') -or $null -eq $s.hooks.UserPromptSubmit) {
    $s.hooks | Add-Member -NotePropertyName UserPromptSubmit -NotePropertyValue @() -Force
  }
  # 멱등: 이미 등록돼 있으면 skip (기존 훅 보존, 재실행 중복 방지)
  $pcAlready = $false
  foreach ($g in @($s.hooks.UserPromptSubmit)) { foreach ($h in @($g.hooks)) { if ($h.command -like '*prompt-capture.js*') { $pcAlready = $true } } }
  if (-not $pcAlready) {
    $pcEntry = [pscustomobject]@{ matcher = ''; hooks = @([pscustomobject]@{ type = 'command'; command = $pcCmd; timeout = 8 }) }
    $s.hooks.UserPromptSubmit = @($s.hooks.UserPromptSubmit) + $pcEntry
  }

  ($s | ConvertTo-Json -Depth 50) | Set-Content $settingsPath -Encoding UTF8
  Write-Host "[OK] 줄갭 플러그인 자동 등록됨 (메뉴 안 건드려도 됨)" -ForegroundColor Green
} catch {
  Write-Host "[경고] 플러그인 자동 등록 실패 - 사장님께 화면을 보내주세요." -ForegroundColor Red
  # @AI:INTENT 일반 안내만 찍으면 원인 미상(직원 화면만으론 진단 불가) -> 실제 예외 메시지 1줄 노출.
  Write-Host ("  (원인: " + $_.Exception.Message + ")") -ForegroundColor DarkYellow
  Write-Host "  * claude 실행 후 폴백: /plugin marketplace add zulgap/claude-team-pack -> /plugin install zulgap@zulgap-team-pack" -ForegroundColor DarkYellow
}

# 7. 바탕화면 "줄갭 Claude" 바로가기 (더블클릭 -> claude 실행)
try {
  $desktop = [Environment]::GetFolderPath("Desktop")
  $workDir = Join-Path $env:USERPROFILE "Documents"
  $lnkPath = Join-Path $desktop "줄갭 Claude.lnk"
  $ws = New-Object -ComObject WScript.Shell
  $sc = $ws.CreateShortcut($lnkPath)
  $sc.TargetPath = "$env:SystemRoot\System32\cmd.exe"
  # @AI:CONSTRAINT PATH 의존 제거 — claude.exe 절대경로로 실행해 "claude 인식 안 됨"(증상 근본) 원천 차단.
  #   winget 설치분 등 .local\bin에 없으면 PATH 폴백(/k claude).
  if (Test-Path $claudeExe) { $sc.Arguments = "/k `"$claudeExe`"" } else { $sc.Arguments = "/k claude" }
  $sc.WorkingDirectory = $workDir
  $sc.IconLocation = "$env:SystemRoot\System32\shell32.dll,220"
  $sc.Description = "줄갭 Claude Code 열기"
  $sc.Save()
  Write-Host "[OK] 바탕화면 '줄갭 Claude' 바로가기 생성됨" -ForegroundColor Green
} catch {
  Write-Host "[참고] 바로가기 생성은 건너뜀 (PowerShell에 claude 입력해도 됩니다)" -ForegroundColor Yellow
}

# 8. 제디(회사 데이터) 연결 - 개인 토큰 받은 직원만 (없으면 아무것도 안 함 = 기존 도구 100% 안전)
# @AI:CONSTRAINT 토큰 있을 때만 등록. 토큰 없는 직원은 제디 항목 자체가 안 생겨 노션/PPT/한글에 영향 0.
Write-Host ""
Write-Host "제디(회사 데이터) 연결용 개인 토큰이 있나요?" -ForegroundColor Cyan
Write-Host "  - 사장님이 발급해준 'JEDI_TOKEN' 한 줄을 붙여넣으세요 (없으면 그냥 Enter - 나중에 다시 실행하면 됨)."
$jediToken = Read-Host "JEDI_TOKEN"
if ($jediToken -and $jediToken.Trim().Length -gt 0) {
  $jediToken = $jediToken.Trim()
  # @AI:INTENT 브리지를 zip 폴더가 아닌 고정 위치(~/.claude/zulgap/mcp-bridge)에 설치.
  #   직원이 zip 폴더를 옮기거나 지워도 ~/.claude.json의 브리지 경로가 안 깨짐
  #   (2026-07 신나래 -32000 = zip 폴더 이동으로 경로 깨짐 근본 차단).
  $srcBridge = Join-Path $PSScriptRoot "mcp-bridge"
  $bridgeDir = Join-Path $claudeDir "zulgap\mcp-bridge"
  $bridgeIndex = Join-Path $bridgeDir "index.js"
  if (Test-Path (Join-Path $srcBridge "package.json")) {
    New-Item -ItemType Directory -Force -Path $bridgeDir | Out-Null
    foreach ($bf in @("index.js","package.json","package-lock.json")) {
      $sbf = Join-Path $srcBridge $bf
      if (Test-Path $sbf) { Copy-Item $sbf (Join-Path $bridgeDir $bf) -Force }
    }
    Write-Host "[설치 중] 제디 브리지 의존성 (고정 위치)..." -ForegroundColor Yellow
    Push-Location $bridgeDir
    try { npm install --omit=dev --silent; Write-Host "[OK] 제디 브리지 준비됨 (~/.claude/zulgap/mcp-bridge)" -ForegroundColor Green }
    catch { Write-Host "[경고] 제디 브리지 npm install 실패 - Node 설치 후 다시 실행하세요." -ForegroundColor Red }
    Pop-Location
  }
  $jUrl = "https://judgmentos-unified-agent-production.up.railway.app"

  # (a) Claude Code 표면 등록 (~/.claude.json 최상위 mcpServers) - 터미널/Code탭에서 제디 사용
  # @AI:CONSTRAINT 형식은 사장님 PC .claude.json 실제 작동본과 동일(type=stdio, command/args/env). 쓰기 전 .bak 백업.
  try {
    $ccJson = Join-Path $env:USERPROFILE ".claude.json"
    if (Test-Path $ccJson) { Copy-Item $ccJson "$ccJson.bak" -Force }
    $cc = if (Test-Path $ccJson) { (Get-Content $ccJson -Raw -Encoding UTF8 | ConvertFrom-Json) } else { [pscustomobject]@{} }
    if ($null -eq $cc) { $cc = [pscustomobject]@{} }
    if (-not ($cc.PSObject.Properties.Name -contains 'mcpServers') -or $null -eq $cc.mcpServers) {
      $cc | Add-Member -NotePropertyName mcpServers -NotePropertyValue ([pscustomobject]@{}) -Force
    }
    $jediCC = [pscustomobject]@{
      type    = "stdio"
      command = "node"
      args    = @($bridgeIndex)
      env     = [pscustomobject]@{ JUDGMENTOS_URL = $jUrl; JUDGMENTOS_TOKEN = $jediToken }
    }
    $cc.mcpServers | Add-Member -NotePropertyName jedi -NotePropertyValue $jediCC -Force
    ($cc | ConvertTo-Json -Depth 100) | Set-Content $ccJson -Encoding UTF8
    Write-Host "[OK] 제디 연결 등록됨 (Claude Code) - 재시작 후 적용" -ForegroundColor Green
  } catch {
    Write-Host "[경고] 제디(Claude Code) 설정 쓰기 실패 - 사장님께 화면을 보내주세요." -ForegroundColor Red
  }

  # (b) 데스크탑 채팅앱에도 등록 (기존 동작 유지)
  try {
    $desktopCfgDir = Join-Path $env:APPDATA "Claude"
    New-Item -ItemType Directory -Force -Path $desktopCfgDir | Out-Null
    $desktopCfg = Join-Path $desktopCfgDir "claude_desktop_config.json"
    if (Test-Path $desktopCfg) { Copy-Item $desktopCfg "$desktopCfg.bak" -Force }
    $cfg = if (Test-Path $desktopCfg) { Get-Content $desktopCfg -Raw | ConvertFrom-Json } else { [pscustomobject]@{} }
    if (-not ($cfg.PSObject.Properties.Name -contains 'mcpServers') -or $null -eq $cfg.mcpServers) {
      $cfg | Add-Member -NotePropertyName mcpServers -NotePropertyValue ([pscustomobject]@{}) -Force
    }
    $jedi = [pscustomobject]@{
      command = "node"
      args    = @($bridgeIndex)
      env     = [pscustomobject]@{ JUDGMENTOS_URL = $jUrl; JUDGMENTOS_TOKEN = $jediToken }
    }
    $cfg.mcpServers | Add-Member -NotePropertyName jedi -NotePropertyValue $jedi -Force
    ($cfg | ConvertTo-Json -Depth 12) | Set-Content $desktopCfg -Encoding UTF8
    Write-Host "[OK] 제디 연결 등록됨 (데스크탑 앱)" -ForegroundColor Green
  } catch {
    Write-Host "[경고] 제디(데스크탑 앱) 설정 쓰기 실패 - 사장님께 화면을 보내주세요." -ForegroundColor Red
  }
} else {
  Write-Host "[건너뜀] 제디 토큰 미등록 - 노션/PPT/한글은 그대로 정상. 토큰 받으면 install.bat 다시 실행하세요." -ForegroundColor Yellow
}

# 9. 완료 안내 (dev는 영어 안내)
if ($Role -eq 'dev') {
  Write-Host ""
  Write-Host "=== Setup complete! How to start ===" -ForegroundColor Cyan
  Write-Host "  1) Double-click the 'Zulgap Claude' desktop icon (a terminal opens)"
  Write-Host "  2) First run: log in with the account the boss gave you"
  Write-Host "  3) Zulgap tools auto-install on first launch (wait a moment)"
  Write-Host "  4) Type /start-dev and press Enter -> your task board appears = success!" -ForegroundColor Green
  Write-Host "     (End of day: /wrapup-dev)"
  Write-Host ""
  Write-Host "* If anything fails, screenshot the screen and send it to the boss." -ForegroundColor Green
  Write-Host ""
  exit 0
}
Write-Host ""
Write-Host "=== 준비 완료! 이제 이렇게 쓰면 됩니다 ===" -ForegroundColor Cyan
Write-Host "  1) 바탕화면 '줄갭 Claude' 아이콘을 더블클릭 (까만 창이 열려요)"
Write-Host "     * 아이콘이 없으면: 시작 검색창에 PowerShell -> 열기 -> claude 입력 후 Enter"
Write-Host "  2) 처음 한 번 로그인 창이 뜨면 -> 사장님이 알려준 같은 계정으로 로그인"
Write-Host "  3) 처음 열 때 줄갭 도구가 자동으로 설치돼요 (잠깐 기다리기)"
Write-Host "  4) 화면에 /시작 입력 후 Enter -> 줄갭 작업 현황이 뜨면 성공! (마무리: /저장, 블로그: /블로그)" -ForegroundColor Green
Write-Host "  5) 한글(hwp) 문서를 쓰려면 한컴오피스 설치 (선택)"
Write-Host ""
Write-Host "* 막히면 그 화면을 캡처해서 사장님께 보내세요." -ForegroundColor Green
Write-Host ""
