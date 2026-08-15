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
#   staff : curl -fsSL https://raw.githubusercontent.com/zulgap/claude-team-pack/main/install.sh | bash
#   dev   : curl -fsSL https://raw.githubusercontent.com/zulgap/claude-team-pack/main/install.sh | bash -s -- --role dev
#   master: curl -fsSL https://raw.githubusercontent.com/zulgap/claude-team-pack/main/install.sh | bash -s -- --role master  (어드민 기기 — CLAUDE.md 보존)
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
# v1.20: role의 원천은 제디 토큰 JWT claim(훅이 매 세션 유도) — 이 인자는 토큰 없는 초기 폴백 + CLAUDE.md stub 선택용.
# master = 사장님(어드민 기기): CLAUDE.md 안 건드림 + 훅이 팀 가이드 주입 skip.
if [ "$ROLE" != "staff" ] && [ "$ROLE" != "dev" ] && [ "$ROLE" != "master" ]; then
  echo "[ERROR] --role must be 'staff', 'dev' or 'master' (got: $ROLE)"; exit 1
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

# GitHub CLI — 팀팩에 스킬을 올릴 때 쓰는 PR 제출 통로 (gh pr create).
# 위 MISSING 목록에 넣지 않는 이유: 그러면 gh 하나 없다고 brew 미설치 PC가 exit 1로 죽는다(필수 아닌 것이 필수가 됨).
# gh auth login은 브라우저 로그인이라 자동화 불가 — 설치까지만 하고 로그인은 안내로 넘긴다.
if command -v gh >/dev/null 2>&1; then
  ok "gh"
elif [ -n "$BREW" ]; then
  warn "[installing] gh (GitHub CLI, for team-pack PRs) ..."
  "$BREW" install gh || warn "[warn] brew install gh failed — install manually: https://cli.github.com/"
  command -v gh >/dev/null 2>&1 && ok "gh" || warn "[warn] gh missing — skill PRs will need manual setup"
else
  warn "[warn] gh missing and no Homebrew — install manually if you plan to submit skills: https://cli.github.com/"
fi

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

# ---- 2.5. Jedi token (asked EARLY — role은 토큰 claim이 SSOT라 role 분기 전에 받는다, v2.3) ----
# @AI:INTENT v1.20 "role의 원천 = 토큰"을 설치 시점까지 확장 — 토큰 있으면 --role 인자를 덮어써
#   설치파일 1개로 staff/dev/master 전부 커버 (훅 team-guide-fetch.js와 동일 매핑, 동기 필수).
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
  TOKEN_ROLE="$(JEDI_TOKEN="$JEDI_TOKEN" node -e '
try {
  const seg = (process.env.JEDI_TOKEN || "").split(".")[1] || "";
  const b = Buffer.from(seg.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8");
  const r = String((JSON.parse(b) || {}).role || "").toLowerCase();
  if (r === "admin" || r === "master") console.log("master");
  else if (r === "dev" || r === "developer" || r === "engineer") console.log("dev");
  else if (r) console.log("staff");
} catch (e) {}
' 2>/dev/null)"
  if [ -n "$TOKEN_ROLE" ] && [ "$TOKEN_ROLE" != "$ROLE" ]; then
    warn "[role] token claim → $TOKEN_ROLE (overrides --role $ROLE)"
    ROLE="$TOKEN_ROLE"
  fi
fi

# ---- 2.6. 팩 판정 (SSOT = resolve-packs.js — 3장부 공용) ----
# @AI:INTENT 판정 규칙을 여기서 구현하지 않는다. 2026-08-16 이전에는 install.ps1 / 이 파일 /
#   hook-doctor-v2.js 가 같은 규칙을 각자 짰고, 카드 `packs: []` 하나로 **정반대 답**이 났다
#   (설치기 둘은 켜고 hook-doctor 는 껐다 — 언어마다 `[]` 의 진릿값이 다르다).
#   증상은 「설치하면 켜지고 24시간 뒤 꺼진다」였고 에러가 안 나 아무도 몰랐다.
# @AI:CONSTRAINT 🔴 `case ... in " zulgap "` 같은 판정을 여기 되살리지 말 것 — 되살리면 다시 3벌이 된다.
#   새 팩이 생기면 고칠 곳은 resolve-packs.js 한 곳이다.
# @AI:CONSTRAINT 🔴 받기 실패·실행 실패면 RP_* 가 비고 아래 분기가 「판정 불가 = 현상 유지(줄갭 기본)」로
#   떨어진다. confident 원칙(확실할 때만 끈다)은 resolve-packs.js 안에 있다.
RESOLVER="$HOME/.claude/zulgap/resolve-packs.js"
mkdir -p "$HOME/.claude/zulgap"
fetch "$RAW/resolve-packs.js" "$RESOLVER" || warn "[warn] resolve-packs.js fetch failed"
RP_CONFIDENT=0; RP_REASON="unavailable"; RP_PACKS=""; RP_ON=""; RP_OFF=""; RP_CAN_OFF=""
if [ -f "$RESOLVER" ]; then
  RP_EVAL="$(node "$RESOLVER" --role "$ROLE" --format sh 2>/dev/null || true)"
  [ -n "$RP_EVAL" ] && eval "$RP_EVAL"
fi
if [ "$RP_CONFIDENT" = "1" ]; then
  ok "tenant packs: $RP_PACKS  (on: $RP_ON / off: $RP_OFF)"
else
  warn "[note] 팩 판정 불가($RP_REASON) — 현상 유지(줄갭 기본)"
fi

# ---- 3. role file + CLAUDE.md stub (fetched — no local files in curl mode) ----
CLAUDE_DIR="$HOME/.claude"
ZULGAP_DIR="$CLAUDE_DIR/zulgap"
mkdir -p "$ZULGAP_DIR"
printf '%s' "$ROLE" > "$ZULGAP_DIR/role"
ok "role file written ($ROLE)"

if [ "$ROLE" = "master" ]; then
  # @AI:CONSTRAINT master(어드민 기기)는 CLAUDE.md를 절대 덮지 않음 — 개인 마스터 설정 보존 (v1.20)
  warn "[skip] master role — personal CLAUDE.md preserved (no team stub)"
else
  STUB="team-CLAUDE.md"; [ "$ROLE" = "dev" ] && STUB="team-CLAUDE-en.md"
  if fetch "$RAW/$STUB" "$WORK/stub.md"; then
    # @AI:INTENT 기존 CLAUDE.md가 있으면 덮기 전 백업 (어드민 겸용 기기 안전장치)
    if [ -f "$CLAUDE_DIR/CLAUDE.md" ] && ! cmp -s "$WORK/stub.md" "$CLAUDE_DIR/CLAUDE.md"; then
      cp "$CLAUDE_DIR/CLAUDE.md" "$CLAUDE_DIR/CLAUDE.md.bak"
      warn "[note] existing CLAUDE.md backed up to CLAUDE.md.bak"
    fi
    cp "$WORK/stub.md" "$CLAUDE_DIR/CLAUDE.md"
    ok "team CLAUDE.md placed ($STUB)"
  else
    warn "[warn] could not fetch $STUB — skipping CLAUDE.md"
  fi
fi

# ---- 4. hooks (fetched to fixed location) ----
HOOK_GUIDE="$ZULGAP_DIR/team-guide-fetch.js"
HOOK_PROMPT="$ZULGAP_DIR/prompt-capture.js"
HOOK_HANDOFF="$ZULGAP_DIR/precompact-handoff.js"
HOOK_RESPONSE="$ZULGAP_DIR/response-capture.js"
fetch "$RAW/hooks/team-guide-fetch.js" "$HOOK_GUIDE"  && ok "hook: team-guide-fetch.js" || warn "[warn] guide hook fetch failed"
fetch "$RAW/hooks/prompt-capture.js"  "$HOOK_PROMPT" && ok "hook: prompt-capture.js"  || warn "[warn] prompt hook fetch failed"
fetch "$RAW/hooks/response-capture.js" "$HOOK_RESPONSE" && ok "hook: response-capture.js" || warn "[warn] response hook fetch failed"
fetch "$RAW/hooks/precompact-handoff.js" "$HOOK_HANDOFF" && ok "hook: precompact-handoff.js" || warn "[warn] handoff hook fetch failed"

# ---- 5. settings.json merge (plugin auto-register + hooks, idempotent) ----
cat > "$WORK/merge-settings.js" <<'NODE_SETTINGS_EOF'
// settings.json 병합 — install.ps1 §6/6.5/6.6과 동일 계약 (맵 형태 + 멱등 + .bak)
const fs = require('fs');
const p = process.env.SETTINGS_PATH;
const hookGuide = process.env.HOOK_GUIDE;
const hookPrompt = process.env.HOOK_PROMPT;
const hookHandoff = process.env.HOOK_HANDOFF;
const hookResponse = process.env.HOOK_RESPONSE;
let s = {};
if (fs.existsSync(p)) {
  fs.copyFileSync(p, p + '.bak');
  try { s = JSON.parse(fs.readFileSync(p, 'utf8')) || {}; } catch (e) { console.error('settings.json parse failed: ' + e.message); process.exit(1); }
}
s.extraKnownMarketplaces = s.extraKnownMarketplaces || {};
s.extraKnownMarketplaces['zulgap-team-pack'] = { source: { source: 'github', repo: 'zulgap/claude-team-pack' }, autoUpdate: true };
s.enabledPlugins = s.enabledPlugins || {};
// v2.0 플러그인 3분리 — 신규 설치는 신 플러그인만 활성 (role 분기 = hook-doctor-v2.js와 동기 필수)
// @AI:INTENT 켤 것·끌 것은 resolve-packs.js(3장부 공용 SSOT)가 정한다. 여기서는 **쓰기만** 한다.
//   판정 규칙(allow-list·confident)을 이 블록에 되살리지 말 것 — 되살리면 다시 3벌이 되고,
//   그게 2026-08-16 에 봉합한 `packs: []` 정반대 판정 사고의 형태다.
// @AI:CONSTRAINT 🔴 끄는 것도 **명시적 false 로** 써야 한다 — 키가 없으면 Claude Code 가 로드한다(opt-out).
//   2026-07-29 실측: dev-pack 키가 없는 staff PC 에서 개발자 스킬이 로드돼 실행까지 됐다.
// @AI:CONSTRAINT RP_ON 이 비면(판정 불가·스크립트 부재) 공용 팩만 보장하고 나머지는 손대지 않는다.
const rpOn = String(process.env.RP_ON || '').trim().split(/\s+/).filter(Boolean);
const rpOff = String(process.env.RP_OFF || '').trim().split(/\s+/).filter(Boolean);
if (rpOn.length) {
  for (const n of rpOn) s.enabledPlugins[n + '@zulgap-team-pack'] = true;
  for (const n of rpOff) s.enabledPlugins[n + '@zulgap-team-pack'] = false;
} else {
  s.enabledPlugins['jedi-core@zulgap-team-pack'] = true;
}
const role = String(process.env.ZULGAP_ROLE || 'staff');
// @AI:CONSTRAINT 🔴 dev-pack은 명시적 false를 써야 꺼진다 — 키를 안 쓰면 켜진다(opt-out).
//   2026-07-29 실측: staff PC에 dev-pack 키가 없는데도 start-dev/wrapup-dev가 로드돼 실행까지 됐다.
//   마켓플레이스가 3팩을 통째로 설치하므로 실물은 늘 존재한다. else 없이 두면 staff PC에 키가 안 생긴다.
//   설치 시점의 ROLE은 --role 인자 또는 토큰 claim으로 확정된 값이라 여기선 바로 false를 쓴다
//   (판정이 불확실할 수 있는 hook-doctor-v2 쪽은 confident일 때만 끈다 — 양쪽 동기 필수).
// @AI:CONSTRAINT 🔴 dev-pack role 분기를 여기 되살리지 말 것 — resolve-packs.js 의 PLUGIN_RULES 가
//   role 축을 이미 반영해 RP_ON/RP_OFF 로 내려준다. 두 곳에 두면 어긋나는 날이 온다.
if (!rpOn.length && role !== 'dev' && role !== 'master') s.enabledPlugins['dev-pack@zulgap-team-pack'] = false;
// @AI:FRAGILE 구 zulgap 비활성은 여기서 하지 않는다 — 신 플러그인 '실물 설치' 성공 후에만 (verify-then-flip, 아래 5.8).
//   먼저 끄고 나중에 설치하면 설치 실패 PC는 구·신이 동시에 죽어 스킬 0개가 된다 (2026-07-21 실사고 클래스).
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
// Stop 훅 — 어시스턴트 응답을 prompt_log의 turn_uuid 짝으로 전송 (지시-응답 학습쌍, fail-open)
s.hooks.Stop = [].concat(s.hooks.Stop || []);
if (hookResponse && !hasCmd(s.hooks.Stop, 'response-capture.js')) {
  s.hooks.Stop.push({ matcher: '', hooks: [{ type: 'command', command: 'node "' + hookResponse + '"', timeout: 8 }] });
}
// PreCompact 훅 — 압축 직전 핸드오프 스냅샷 (Desktop Code탭은 #27527로 미발화, CLI/터미널만 작동)
s.hooks.PreCompact = [].concat(s.hooks.PreCompact || []);
if (hookHandoff && !hasCmd(s.hooks.PreCompact, 'precompact-handoff.js')) {
  s.hooks.PreCompact.push({ matcher: '', hooks: [{ type: 'command', command: 'node "' + hookHandoff + '"', timeout: 15 }] });
}
fs.writeFileSync(p, JSON.stringify(s, null, 2) + '\n');
console.log('settings-merged');
NODE_SETTINGS_EOF

if SETTINGS_PATH="$CLAUDE_DIR/settings.json" HOOK_GUIDE="$HOOK_GUIDE" HOOK_PROMPT="$HOOK_PROMPT" HOOK_HANDOFF="$HOOK_HANDOFF" HOOK_RESPONSE="$HOOK_RESPONSE" ZULGAP_ROLE="$ROLE" RP_ON="$RP_ON" RP_OFF="$RP_OFF" node "$WORK/merge-settings.js"; then
  ok "Zulgap plugin auto-registered (settings.json)"

  # ---- 5.8 plugin '실물' 설치 (★ 이게 빠지면 스킬이 안 뜬다) ----
  # @AI:CONSTRAINT Claude Code 플러그인은 대장이 둘이고 서로를 안 채운다:
  #   ① 활성화 = settings.json enabledPlugins (위 merge-settings.js까지)
  #   ② 설치   = ~/.claude/plugins/installed_plugins.json + plugins/cache/  <- `claude plugin install`만 채움
  #   enabledPlugins에 true를 써도 자동 설치되지 않고, 미설치 플러그인은 '조용히 무시'된다(에러 0).
  # @AI:DEPENDS SSH 클론 버그(#47088) 예방은 위 git insteadOf 블록 — 선행 필수.
  CLAUDE_BIN="$(command -v claude || true)"
  [ -z "$CLAUDE_BIN" ] && [ -x "$HOME/.local/bin/claude" ] && CLAUDE_BIN="$HOME/.local/bin/claude"
  # 설치 목록 = SSOT 가 켜라고 한 것 그대로 (판정 불가면 공용 팩만)
  if [ -n "$RP_ON" ]; then
    WANT_PLUGINS="$RP_ON"
    [ -n "$RP_OFF" ] && warn "[note] skipped (not in tenant packs): $RP_OFF"
  else
    WANT_PLUGINS="jedi-core"
    if [ "$ROLE" = "dev" ] || [ "$ROLE" = "master" ]; then WANT_PLUGINS="$WANT_PLUGINS dev-pack"; fi
  fi
  INSTALL_OK=1
  if [ -z "$CLAUDE_BIN" ]; then
    INSTALL_OK=0
    warn "[warn] claude not found on PATH — plugin install skipped"
  else
    echo "Installing Zulgap plugins (may take a while)..."
    "$CLAUDE_BIN" plugin marketplace add zulgap/claude-team-pack >/dev/null 2>&1 || true
    # @AI:INTENT add는 이미 등록된 마켓의 카탈로그를 새로 받지 않는다 — 낡은 카탈로그로 install하면 구 sha가 박힌다.
    "$CLAUDE_BIN" plugin marketplace update zulgap-team-pack >/dev/null 2>&1 || true
    for P in $WANT_PLUGINS; do
      if "$CLAUDE_BIN" plugin install "$P@zulgap-team-pack" --scope user >/dev/null 2>&1; then
        # @AI:INTENT install은 '이미 설치됨'이면 갱신하지 않는다. 이 스크립트 재실행이 기존 직원의 수동 복구
        #   경로이므로 설치 성공 뒤 update를 한 번 더 때린다(최신이면 no-op). 실패해도 설치는 유효 -> INSTALL_OK 불변.
        "$CLAUDE_BIN" plugin update "$P@zulgap-team-pack" >/dev/null 2>&1 || true
        ok "  $P"
      else
        INSTALL_OK=0
        warn "  [fail] $P"
      fi
    done
  fi

  # ---- 5.9 verify-then-flip — 신 플러그인 실물 확인 후에만 구 플러그인을 끈다 ----
  # @AI:FRAGILE 이 조건을 없애면 설치 실패 PC에서 구·신이 동시에 죽는다(스킬 0개). 순서가 곧 fail-safe.
  if [ "$INSTALL_OK" = "1" ]; then
    SETTINGS_PATH="$CLAUDE_DIR/settings.json" node -e '
      const fs = require("fs"); const p = process.env.SETTINGS_PATH;
      try {
        const s = JSON.parse(fs.readFileSync(p, "utf8"));
        if (s.enabledPlugins && Object.prototype.hasOwnProperty.call(s.enabledPlugins, "zulgap@zulgap-team-pack")) {
          s.enabledPlugins["zulgap@zulgap-team-pack"] = false;
          fs.writeFileSync(p, JSON.stringify(s, null, 2) + "\n");
        }
      } catch (_) { /* 실패해도 구 플러그인이 켜진 채 = 스킬 정상 */ }
    ' 2>/dev/null || true
    # 설치기가 신 플러그인 구성을 완결 — hook-doctor v2 재실행 불필요
    printf '%s' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" > "$ZULGAP_DIR/.hook-doctor-v2.done"
  else
    # @AI:INTENT 플래그를 쓰지 않는다 -> hook-doctor v2가 다음 세션에 재시도. 구 플러그인은 켜진 채 = 스킬 계속 작동.
    warn "[warn] plugin install incomplete — existing skills keep working."
    echo  "  manual fallback: claude plugin install jedi-core@zulgap-team-pack --scope user"
  fi
else
  fail "[warn] plugin auto-register failed — after launching claude run:"
  echo  "  /plugin marketplace add zulgap/claude-team-pack"
  echo  "  /plugin install jedi-core@zulgap-team-pack"
fi

# ---- 6. Jedi (company data) — optional, token was collected at step 2.5 ----
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
if [ "$ROLE" = "master" ]; then
  cyan "=== 준비 완료 (master — 개인 설정 보존됨) ==="
  echo "  플러그인·훅·제디만 등록됐습니다. CLAUDE.md는 건드리지 않았습니다."
  echo "  터미널에서 claude 실행 → 팀 스킬(/jedi-start·/start-dev 등) 사용 가능."
elif [ "$ROLE" = "dev" ]; then
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
  printf '\033[32m  4) 화면에 /jedi-start 입력 후 Enter -> 줄갭 작업 현황이 뜨면 성공! (마무리: /jedi-save)\033[0m\n'
  echo ""
  printf '\033[32m* 막히면 그 화면을 캡처해서 사장님께 보내세요.\033[0m\n'
fi
cyan ""
