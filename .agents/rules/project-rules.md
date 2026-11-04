---
trigger: always_on
description: >-
  Enforces the two rules that have already been broken in this project: never add a
  Groq model without live-verifying it against this account, and never claim a fix is
  done without measuring. Applies to every change in the AI Interview Helper codebase.
---

# AI Interview Helper — Non-Negotiable Rules

## 1. Never add a Groq model without live-verifying it first

Groq model access is **per-account**. A model in Groq's public docs, or one that works for
someone else, can still 404 here.

This mistake has already happened **twice** (`llama-3.1-8b-instant`, then
`llama-3.3-70b-versatile`). The user's instruction was explicit:

> *"Why you are adding model which are not accessible to me first check it then tell me
> then add that model OK"*

**Before editing `electron/modelStrategy.ts`, run BOTH steps and report the result:**

```powershell
$raw = Get-Content '.env' -Raw
$key = (($raw -split "`n" | Where-Object { $_ -match '^\s*GROQ_API_KEY=' }) -replace '^\s*GROQ_API_KEY=','').Trim()
$h = @{ Authorization = "Bearer $key"; 'Content-Type' = 'application/json' }

# Step 1 — what does THIS account have?
(Invoke-RestMethod -Uri 'https://api.groq.com/openai/v1/models' -Headers $h).data.id

# Step 2 — does it actually ANSWER? max_tokens MUST be >= 200 (reasoning-token trap)
$body = @{ model='openai/gpt-oss-20b'; messages=@(@{role='user';content='Reply with exactly: OK'}); max_tokens=200 } | ConvertTo-Json -Depth 5
(Invoke-RestMethod -Uri 'https://api.groq.com/openai/v1/chat/completions' -Headers $h -Method Post -Body $body -TimeoutSec 45).choices[0].message.content
```

**Verified available:** `openai/gpt-oss-120b` · `openai/gpt-oss-20b` · `qwen/qwen3.8-27b`

**Confirmed 404 — never use:** `llama-3.3-70b-versatile` · `llama-3.1-8b-instant`

## 2. "Fixed" is not "verified" — measure, don't assume

The taskbar fix was declared complete **twice** and the icon was still visible both times.
**It is still visible now** — the issue is 🔴 **OPEN**, not resolved. Before reporting any
invisibility/stealth change as done:

```powershell
# Must be run WHILE the app is running, or it prints "NO electron.exe process"
powershell -ExecutionPolicy Bypass -File tools/check-taskbar.ps1
```

It reads the real `WS_EX_APPWINDOW` / `WS_EX_TOOLWINDOW` bits off every Electron window.
Report the actual values — do not claim success from code inspection alone.

**The leading hypothesis for why it keeps failing:** Windows/DWM re-applies
`WS_EX_APPWINDOW` on **focus/blur** transitions, so a startup-only fix cannot hold. The
planned v3 countermeasure (focus/blur re-assert + 2 s read-only watchdog) is designed and
documented but **deliberately not applied** — see `docs/TASKBAR_HIDING.md`.

## 3. Re-emit compiled JS after editing the main process

`electron-main.js` loads **`dist-electron/main.js`**, not the `.ts` sources.

```powershell
npx tsc -p tsconfig.electron.json      # REQUIRED after editing electron/*.ts
```

## 4. Never run the slow package build for validation

`npm run build:electron` runs `electron-builder` and takes minutes. For validation use:

```powershell
npx tsc -p tsconfig.electron.json --noEmit   # main process (~4s)
npx tsc --noEmit                             # renderer
```

## 5. Latency is sacred

This runs during a live interview. Never add a network round-trip to the answer path.
Tier selection is deliberately local regex matching for exactly this reason. The user has
explicitly rejected LLM-based duplicate detection for latency risk.

## 6. Keep `docs/` updated in the same change

Standing instruction: *"docs hamesha update karte chalo"*. The user resumes work in fresh
chats and depends on `docs/` plus this skill for context. Update:
`docs/README.md`, `docs/MODEL_STRATEGY.md`, `docs/TASKBAR_HIDING.md`, `docs/RESUME.md` as
relevant.

## 7. The project is documented in TWO skill locations — keep both in sync

| Location | Scope |
|---|---|
| `.agents/skills/ai-interview-helper/SKILL.md` | This project only (workspace customization root) |
| `~/.gemini/config/skills/ai-interview-helper/SKILL.md` | **Global** — loads in every workspace, so the protocol is available even when the repo is not open |

The user asked specifically for the **global** one to exist. When you change the protocol,
architecture, or open-issue list, update **both**. The global copy must use absolute
`file:///` links because it resolves relative to `~/.gemini/config`, not the repo.

## 8. When the user says they are leaving / going to sleep

Finish the work **autonomously** and leave a clear written report. Do **not** ask questions
or wait for confirmation. If a requested fix was intentionally not applied, make that
explicit in the docs (status + what remains) so the next session can pick it up.
