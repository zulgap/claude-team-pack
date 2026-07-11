#!/bin/bash
# Zulgap team setup for macOS (Claude Code auto-setup) — v1.19
#
# What this does (macOS port of install.ps1):
#   1) Ensure git / node / uv (via Homebrew if needed)
#   2) Install Claude Code (native installer)
#   3) Auto-register the Zulgap plugin + session hooks (no menu clicking)
#   4) Desktop launcher "Zulgap Claude.command"
#   5) (optional) Jedi (company data) connection — only if you have a personal token
#
# Usage (remote, no local files needed — everything is fetched from GitHub):
#   staff: curl -fsSL https://raw.githubusercontent.com/zulgap/claude-team-pack/main/install.sh | bash
#   dev  : curl -fsSL https://raw.githubusercontent.com/zulgap/claude-team-pack/main/install.sh | bash -s -- --role dev
#
# @AI:CONSTRAINT 원격 curl 실행 전제 — $PSScriptRoot 같은 로컬 동봉 파일 없음. 필요 파일 전부 raw fetch.
# @AI:CONSTRAINT settings.json/.claude.json 병합 로직은 install.ps1과 동일 계약(맵 형태, 멱등, .bak 백업).

set -u

RAW="https://raw.githubusercontent.com/zulgap/claude-team-pack/main"
JURL="https://judgmentos-unified-agent-production.up.railway.app"

# ---- args ----
ROLE="staff"
while [ $# -gt 0 ]; do
  case "$1" in
    --role) ROLE="${2:-staff}"; shift 2 ;;
    --role=*) ROLE="${1#*=}"; shift ;;
    *) shift ;;
  esac
done
if [ "$ROLE" != "staff" ] && [ "$ROLE" != "dev" ]; then
  echo "[ERROR] --role must be 'staff' or 'dev' (got: $ROLE)"; exit 1
fi

if [ "$(uname -s)" != "Darwin" ]; then
  echo "[ERROR] This installer is for macOS. On Windows use install.bat / install-dev.bat."; exit 1
fi

cyan()  { printf '\033[36m%s\033[0m\n' "$*"; }
ok()    { printf '\033[32m[OK] %s\033[0m\n' "$*"; }
warn()  { printf '\033[33m%s\033[0m\n' "$*"; }
fail()  { printf '\033[31m%s\033[0m\n' "$*"; }

fetch() { # fetch <url> <dest> — returns non-zero on failure
  curl -fsSL --retry 2 --connect-timeout 10 "$1" -o "$2"
}

WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT

cyan ""
cyan "=== Zulgap team setup for macOS [role: $ROLE] ==="
cyan ""

# ---- 0. Homebrew (only needed when something is missing) ----
BREW=""
for b in /opt/homebrew/bin/brew /usr/local/bin/brew; do [ -x "$b" ] && BREW="$b" && break; done
command -v brew >/dev/null 2>&1 && BREW="$(command -v brew)"

MISSING=""
command -v git  >/dev/null 2>&1 || MISSING="$MISSING git"
command -v node >/dev/null 2>&1 || MISSING="$MISSING node"
command -v uvx  >/dev/null 2>&1 || MISSING="$MISSING uv"
if [ -n "$MISSING" ]; then
  if [ -z "$BREW" ]; then
    fail "[ERROR] Missing:$MISSING — and Homebrew is not installed."
    echo  "  Install Homebrew first: https://brew.sh  (then re-run this installer)"
    exit 1
  fi
  for pkg in $MISSING; do
    warn "[installing] $pkg ..."
    "$BREW" install "$pkg" || warn "[warn] brew install $pkg failed — continuing (may already exist)"
  done
  # brew 설치분이 현재 세션 PATH에 잡히도록
  eval "$("$BREW" shellenv)" 2>/dev/null || true
fi
command -v git  >/dev/null 2>&1 && ok "git"  || { fail "[ERROR] git unavailable"; exit 1; }
command -v node >/dev/null 2>&1 && ok "node" || { fail "[ERROR] node unavailable"; exit 1; }
command -v uvx  >/dev/null 2>&1 && ok "uv"   || warn "[warn] uv missing — PPT/HWP tools may not work (brew install uv)"

# ---- 1. git → GitHub over HTTPS (plugin SSH clone bug #47088, same as install.ps1) ----
git config --global --unset-all 'url.https://github.com/.insteadOf' 2>/dev/null || true
git config --global --add 'url.https://github.com/.insteadOf' 'git@github.com:'
git config --global --add 'url.https://github.com/.insteadOf' 'ssh://git@github.com/'
ok "git GitHub HTTPS rewrite (plugin SSH error prevention)"

# ---- 2. Claude Code ----
CLAUDE_BIN="$HOME/.local/bin"
CLAUDE_EXE="$CLAUDE_BIN/claude"
if ! command -v claude >/dev/null 2>&1 && [ ! -x "$CLAUDE_EXE" ]; then
  warn "[installing] Claude Code ..."
  curl -fsSL https://claude.ai/install.sh | bash || fail "[warn] Claude Code auto-install failed — send a screenshot to the boss."
fi
# PATH: ~/.local/bin 보장 (현재 세션 + zshrc 멱등)
case ":$PATH:" in *":$CLAUDE_BIN:"*) : ;; *) export PATH="$PATH:$CLAUDE_BIN" ;; esac
ZSHRC="$HOME/.zshrc"
if [ -x "$CLAUDE_EXE" ] && ! grep -qs '\.local/bin' "$ZSHRC" 2>/dev/null; then
  printf '\n# zulgap: claude path\nexport PATH="$HOME/.local/bin:$PATH"\n' >> "$ZSHRC"
  ok "claude PATH added to ~/.zshrc"
fi
{ command -v claude >/dev/null 2>&1 || [ -x "$CLAUDE_EXE" ]; } && ok "Claude Code" || warn "[warn] claude not found yet — restart Terminal after install"

# ---- 3. role file + CLAUDE.md stub (fetched — no local files in curl mode) ----
CLAUDE_DIR="$HOME/.claude"
ZULGAP_DIR="$CLAUDE_DIR/zulgap"
mkdir -p "$ZULGAP_DIR"
printf '%s' "$ROLE" > "$ZULGAP_DIR/role"
ok "role file written ($ROLE)"

STUB="team-CLAUDE.md"; [ "$ROLE" = "dev" ] && STUB="team-CLAUDE-en.md"
if fetch "$RAW/$STUB" "$WORK/stub.md"; then
  # @AI:INTENT 사장님 맥 등 기존 CLAUDE.md가 있으면 덮기 전 백업 (install.ps1엔 없던 안전장치 — 맥은 어드민 겸용 가능성)
  if [ -f "$CLAUDE_DIR/CLAUDE.md" ] && ! cmp -s "$WORK/stub.md" "$CLAUDE_DIR/CLAUDE.md"; then
    cp "$CLAUDE_DIR/CLAUDE.md" "$CLAUDE_DIR/CLAUDE.md.bak"
    warn "[note] existing CLAUDE.md backed up to CLAUDE.md.bak"
  fi
  cp "$WORK/stub.md" "$CLAUDE_DIR/CLAUDE.md"
  ok "team CLAUDE.md placed ($STUB)"
else
  warn "[warn] could not fetch $STUB — skipping CLAUDE.md"
fi

# ---- 4. hooks (fetched to fixed location) ----
HOOK_GUIDE="$ZULGAP_DIR/team-guide-fetch.js"
HOOK_PROMPT="$ZULGAP_DIR/prompt-capture.js"
fetch "$RAW/hooks/team-guide-fetch.js" "$HOOK_GUIDE"  && ok "hook: team-guide-fetch.js" || warn "[warn] guide hook fetch failed"
fetch "$RAW/hooks/prompt-capture.js"  "$HOOK_PROMPT" && ok "hook: prompt-capture.js"  || warn "[warn] prompt hook fetch failed"

# ---- 5. settings.json merge (plugin auto-register + hooks, idempotent) ----
cat > "$WORK/merge-settings.js" <<'NODE_SETTINGS_EOF'
// settings.json 병합 — install.ps1 §6/6.5/6.6과 동일 계약 (맵 형태 + 멱등 + .bak)
const fs = require('fs');
const p = process.env.SETTINGS_PATH;
const hookGuide = process.env.HOOK_GUIDE;
const hookPrompt = process.env.HOOK_PROMPT;
let s = {};
if (fs.existsSync(p)) {
  fs.copyFileSync(p, p + '.bak');
  try { s = JSON.parse(fs.readFileSync(p, 'utf8')) || {}; } catch (e) { console.error('settings.json parse failed: ' + e.message); process.exit(1); }
}
s.extraKnownMarketplaces = s.extraKnownMarketplaces || {};
s.extraKnownMarketplaces['zulgap-team-pack'] = { source: { source: 'github', repo: 'zulgap/claude-team-pack' }, autoUpdate: true };
s.enabledPlugins = s.enabledPlugins || {};
s.enabledPlugins['zulgap@zulgap-team-pack'] = true;
s.hooks = s.hooks || {};
function hasCmd(groups, needle) {
  for (const g of [].concat(groups || [])) for (const h of [].concat((g && g.hooks) || [])) {
    if (h && typeof h.command === 'string' && h.command.includes(needle)) return true;
  }
  return false;
}
s.hooks.SessionStart = [].concat(s.hooks.SessionStart || []);
if (hookGuide && !hasCmd(s.hooks.SessionStart, 'team-guide-fetch.js')) {
  s.hooks.SessionStart.push({ matcher: 'startup', hooks: [{ type: 'command', command: 'node "' + hookGuide + '"', timeout: 10 }] });
}
s.hooks.UserPromptSubmit = [].concat(s.hooks.UserPromptSubmit || []);
if (hookPrompt && !hasCmd(s.hooks.UserPromptSubmit, 'prompt-capture.js')) {
  s.hooks.UserPromptSubmit.push({ matcher: '', hooks: [{ type: 'command', command: 'node "' + hookPrompt + '"', timeout: 8 }] });
}
fs.writeFileSync(p, JSON.stringify(s, null, 2) + '\n');
console.log('settings-merged');
NODE_SETTINGS_EOF

if SETTINGS_PATH="$CLAUDE_DIR/settings.json" HOOK_GUIDE="$HOOK_GUIDE" HOOK_PROMPT="$HOOK_PROMPT" node "$WORK/merge-settings.js"; then
  ok "Zulgap plugin auto-registered (settings.json)"
else
  fail "[warn] plugin auto-register failed — after launching claude run:"
  echo  "  /plugin marketplace add zulgap/claude-team-pack"
  echo  "  /plugin install zulgap@zulgap-team-pack"
fi

# ---- 6. Jedi (company data) — optional, personal token only ----
cyan ""
cyan "Do you have a personal Jedi token (JEDI_TOKEN)?"
echo  "  - Paste the one-line token from the boss. No token? Just press Enter (re-run installer later)."
JEDI_TOKEN=""
if [ -t 0 ]; then
  printf 'JEDI_TOKEN: '; IFS= read -r JEDI_TOKEN || JEDI_TOKEN=""
elif [ -r /dev/tty ]; then
  printf 'JEDI_TOKEN: ' > /dev/tty; IFS= read -r JEDI_TOKEN < /dev/tty || JEDI_TOKEN=""
else
  warn "[skip] no interactive terminal — Jedi setup skipped (re-run installer in Terminal to add it)"
fi
JEDI_TOKEN="$(printf '%s' "$JEDI_TOKEN" | tr -d '[:space:]')"

if [ -n "$JEDI_TOKEN" ]; then
  # bridge를 고정 위치에 설치 (zip 폴더 이동으로 경로 깨짐 방지 — Windows판과 동일 설계)
  BRIDGE_DIR="$ZULGAP_DIR/mcp-bridge"
  BRIDGE_INDEX="$BRIDGE_DIR/index.js"
  mkdir -p "$BRIDGE_DIR"
  fetch "$RAW/mcp-bridge/index.js" "$BRIDGE_INDEX" || warn "[warn] bridge index fetch failed"
  fetch "$RAW/mcp-bridge/package.json" "$BRIDGE_DIR/package.json" || warn "[warn] bridge package.json fetch failed"
  if [ -f "$BRIDGE_DIR/package.json" ]; then
    warn "[installing] Jedi bridge dependencies ..."
    ( cd "$BRIDGE_DIR" && npm install --omit=dev --silent ) && ok "Jedi bridge ready (~/.claude/zulgap/mcp-bridge)" || fail "[warn] npm install failed — re-run after installing Node"
  fi

  cat > "$WORK/merge-claudejson.js" <<'NODE_CLAUDEJSON_EOF'
// ~/.claude.json (Claude Code) + 데스크탑 앱 config에 jedi MCP 등록 — install.ps1 §8(a)/(b) 계약 동일
const fs = require('fs');
const path = require('path');
const targets = [
  { p: process.env.CC_JSON, withType: true },
  { p: process.env.DESKTOP_JSON, withType: false },
];
for (const t of targets) {
  if (!t.p) continue;
  try {
    fs.mkdirSync(path.dirname(t.p), { recursive: true });
    let c = {};
    if (fs.existsSync(t.p)) {
      fs.copyFileSync(t.p, t.p + '.bak');
      c = JSON.parse(fs.readFileSync(t.p, 'utf8')) || {};
    }
    c.mcpServers = c.mcpServers || {};
    const jedi = {
      command: 'node',
      args: [process.env.BRIDGE_INDEX],
      env: { JUDGMENTOS_URL: process.env.JURL, JUDGMENTOS_TOKEN: process.env.JEDI_TOKEN },
    };
    if (t.withType) jedi.type = 'stdio';
    c.mcpServers.jedi = jedi;
    fs.writeFileSync(t.p, JSON.stringify(c, null, 2) + '\n');
    console.log('jedi-registered: ' + t.p);
  } catch (e) { console.error('jedi register failed (' + t.p + '): ' + e.message); }
}
NODE_CLAUDEJSON_EOF

  CC_JSON="$HOME/.claude.json" \
  DESKTOP_JSON="$HOME/Library/Application Support/Claude/claude_desktop_config.json" \
  BRIDGE_INDEX="$BRIDGE_INDEX" JURL="$JURL" JEDI_TOKEN="$JEDI_TOKEN" \
  node "$WORK/merge-claudejson.js" && ok "Jedi connected (Claude Code + Desktop app) — restart to apply" || fail "[warn] Jedi config write failed"
else
  warn "[skip] no Jedi token — Notion/PPT tools work fine without it."
fi

# ---- 7. Desktop launcher ----
LAUNCHER="$HOME/Desktop/Zulgap Claude.command"
{
  printf '#!/bin/zsh\n'
  printf 'export PATH="$HOME/.local/bin:$PATH"\n'
  printf 'cd "$HOME/Documents" 2>/dev/null\n'
  printf 'exec claude\n'
} > "$LAUNCHER" && chmod +x "$LAUNCHER" && ok "Desktop launcher: Zulgap Claude.command" || warn "[note] launcher skipped — just run 'claude' in Terminal"

# ---- 8. Done ----
cyan ""
if [ "$ROLE" = "dev" ]; then
  cyan "=== Setup complete! How to start ==="
  echo "  1) Double-click 'Zulgap Claude.command' on your Desktop (or run 'claude' in Terminal)"
  echo "  2) First run: log in with the account the boss gave you"
  echo "  3) Zulgap tools auto-install on first launch (wait a moment)"
  printf '\033[32m  4) Type /start-dev and press Enter -> your task board appears = success! (End of day: /wrapup-dev)\033[0m\n'
  echo ""
  printf '\033[32m* If anything fails, screenshot the screen and send it to the boss.\033[0m\n'
else
  cyan "=== 준비 완료! 이제 이렇게 쓰면 됩니다 ==="
  echo "  1) 바탕화면 'Zulgap Claude.command' 더블클릭 (또는 터미널에서 claude 입력)"
  echo "  2) 처음 한 번 로그인 창이 뜨면 -> 사장님이 알려준 같은 계정으로 로그인"
  echo "  3) 처음 열 때 줄갭 도구가 자동으로 설치돼요 (잠깐 기다리기)"
  printf '\033[32m  4) 화면에 /시작 입력 후 Enter -> 줄갭 작업 현황이 뜨면 성공! (마무리: /저장)\033[0m\n'
  echo ""
  printf '\033[32m* 막히면 그 화면을 캡처해서 사장님께 보내세요.\033[0m\n'
fi
cyan ""
