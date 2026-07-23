---
name: wrapup-dev
description: Developer session wrap-up for Zulgap dev team. Logs today's work to the Notion team session journal (with author attribution) and generates the written standup message (Yesterday/Today/Blockers) to paste into Telegram. Use at the end of every work session — "/wrapup-dev", "wrap up", "end of day", "finish work", "log my work".
version: 1.0.0
origin: teampack
---

# wrapup-dev — Developer Session Wrap-up (Zulgap Dev Team)

Log today's work to the **Notion team session journal** and produce the **written standup message** the developer pastes into the Telegram standup room. English is fine for both.

## Step 1 — Resolve author (run once, right before logging)

The Claude account is shared, so authorship comes from the developer's personal Jedi token:

```
node "$HOME/.claude/plugins/marketplaces/zulgap-team-pack/resolve-staff.js"
```
- If that path does not exist, find `resolve-staff.js` under `~/.claude/plugins` and run it (plugin cache paths vary).
- Use the printed name as the `작성자` property below. If output is empty (no token / unmapped), omit `작성자` — the journal entry is still valid. Script failure never blocks logging.

## Step 2 — Append one row to the team session journal

Call `notion-create-pages`:
- **parent**: `{"type":"data_source_id","data_source_id":"67bf5daa-64e2-4745-85b6-c67e4a231b44"}` (Zulgap "팀 세션 저널" DB)
- **properties**:
  - `세션` (title): one-line English title of today's work (e.g. "RPGlobal: keyword list page skeleton")
  - `작성자`: name from Step 1 (omit if empty)
  - `date:날짜:start`: today (YYYY-MM-DD), `date:날짜:is_datetime`: 0
  - `유형`: `개발`
  - `한줄 요약`: the single most important outcome, one line (English OK)
- **content** (English, keep it short and factual):

  ```
  ## What I did
  - {task} — {result} (PR: {link or "draft"})

  ## Decisions / things learned
  - {non-obvious things only; skip routine work}

  ## Blockers / questions for the boss
  - {explicit; write "None" if none}

  ## Next
  - {what I will do next session}
  ```

## Step 3 — Generate the standup message (for Telegram)

Print this block for the developer to copy-paste into the Telegram standup room:

```
📋 Standup — {name}, {YYYY-MM-DD}
Yesterday/Today: {1–3 bullets of what was done}
Next: {what's next}
Blockers: {explicit — write "None" if none}
PR: {open PR links}
```

Rule: **"Blockers:" must never be omitted.** If there are none, write "None" explicitly.

## Step 4 — End-of-day checklist (remind, don't skip)

- [ ] Branch pushed (`git push`) — never leave work only on your machine overnight
- [ ] Draft PR opened or updated (so the boss can see WIP)
- [ ] Task card `Status` updated on the Dev Task Board (In Progress / In Review / Done)
- [ ] If a PR is ready for review: move card to `In Review` and mention it in the standup message

## Notes

- Skip logging only if the session had zero output (pure reading/questions) — say "Nothing to log today" instead.
- Do not paste secrets, tokens, or customer data into the journal or standup.
