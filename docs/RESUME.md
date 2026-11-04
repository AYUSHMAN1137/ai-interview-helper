# RESUME HERE — Session Handoff

> **Purpose:** open a fresh chat and continue exactly where this left off.
> **Last updated:** 2026-10-14 00:53 IST
> **Project:** [`ai-interview-helper`](../../../) — Electron + React live-interview overlay

---

## Read These First (in order)

1. **This file** — current state and next actions
2. [`docs/README.md`](./README.md) — hard rules + architecture
3. [`docs/TASKBAR_HIDING.md`](./TASKBAR_HIDING.md) — the active, unresolved problem
4. [`docs/MODEL_STRATEGY.md`](./MODEL_STRATEGY.md) — the model rule
5. Skill: `.agents/skills/ai-interview-helper/SKILL.md` — full engineering protocol
   *(also installed globally at `~/.gemini/config/skills/ai-interview-helper/SKILL.md`)*

---

## Current Status

| Item | State |
|---|---|
| Model 404 errors | ✅ **Fixed & live-verified** |
| Taskbar icon | 🔴 **STILL BROKEN** — v1 and v2 both failed. Fix **not applied** (documented only). |
| Duplicate questions | 🟡 **Design agreed — not implemented** |
| Deferred improvements | ⚪ Not started |

---

## 1. Model 404 — ✅ DONE

**Was:** `Error generating answer: 404 The model llama-3.3-70b-versatile does not exist or you do not have access to it.`

**Root cause:** I added a model without checking whether *this* Groq account has access.
Groq access is **per-account**.

**Fixed:** Live-verified all models, replaced with the three that actually work:

| Tier | Model |
|---|---|
| instant | `openai/gpt-oss-20b` |
| balanced | `qwen/qwen3.8-27b` |
| deep | `openai/gpt-oss-120b` |

**Also added:**
- `MODEL_FALLBACKS` + `isVerifiedModel()` in [`electron/modelStrategy.ts`](../../../electron/modelStrategy.ts)
- **Pre-flight guard** — a stale model id in an old `settings.json` is silently swapped for a
  verified one instead of throwing a raw 404
- **Retry-on-rejection** — if Groq rejects the model at request time, retry once on
  `gpt-oss-120b`
- **`reasoning_effort: 'low'`** for gpt-oss models. Measured live: **1170 ms / 590 chars**
  vs **1596 ms / 376 chars** on default. Faster *and* longer output.

**Cleaned up stale references in:** [`src/store/index.ts`](../../../src/store/index.ts),
[`SettingsModal.tsx`](../../../src/components/Settings/SettingsModal.tsx),
[`ModelSwitcher.tsx`](../../../src/components/Toolbar/ModelSwitcher.tsx),
[`AnswerDisplay.tsx`](../../../src/components/AnswerPanel/AnswerDisplay.tsx)

> [!IMPORTANT]
> **Never add a model again without running the live check.** Command is in
> [`docs/MODEL_STRATEGY.md`](./MODEL_STRATEGY.md). The user was explicit and angry about this.

---

## 2. Taskbar Icon — 🔴 STILL BROKEN (the active problem)

**Was:** Electron icon visible in the Windows taskbar despite `skipTaskbar: true`.

**User's verdict after v1 and v2, verbatim:**

> *"abhi bhi work nahi kiya hai"* — it still has not worked.

### Attempt history — read this before trying again

| Attempt | What it did | Result |
|---|---|---|
| v0 | `skipTaskbar: true` + `setSkipTaskbar(true)` + `setAppUserModelId` | ❌ Icon visible |
| v1 | Native strip of `WS_EX_APPWINDOW` + set `WS_EX_TOOLWINDOW` + `SWP_FRAMECHANGED`; `devtools-opened` handler; `browser-window-created` catch-all | ❌ Icon visible |
| v2 | Timing bug found in v1 → `show: false` + apply-styles-then-reveal; style **read-back** assertion | ❌ Icon visible |
| v3 | *(proposed, **NOT applied**)* focus/blur re-assert + read-only watchdog | ⚪ Pending |

### Root cause of the failure (v3 hypothesis)

> **Windows / DWM re-applies `WS_EX_APPWINDOW` on focus and blur transitions.**

v1 and v2 both applied the styles **once**, at startup. A one-shot fix survives only until
the user **clicks the overlay** or **clicks away** from it — Windows re-adds `APPWINDOW` on
that transition and the taskbar button returns. That matches the observed behaviour exactly.

If correct, **no startup-only enforcement can ever work** — the style must be re-asserted
continuously for the whole window lifetime.

### The v3 fix (designed, deliberately NOT applied)

The user asked for this to be **documented only**, not implemented. Full code is in
[`docs/TASKBAR_HIDING.md`](./TASKBAR_HIDING.md#the-v3-fix--proposed-not-applied).

Shape of it:

```ts
export function enforceTaskbarHiding(win: BrowserWindow, label = 'main'): void {
  const reassert = () => { /* setSkipTaskbar + hideFromTaskbar */ }
  win.on('focus', reassert)     // ← the transition Windows abuses
  win.on('blur', reassert)      // ← and the other one
  win.on('restore', reassert)
  win.on('show', reassert)
  const timer = setInterval(() => {          // 2 s watchdog
    if (!isToolWindow(win)) hideFromTaskbar(win, `${label}(watchdog)`)
  }, 2000)
  win.on('closed', () => clearInterval(timer))
}
```

Plus a **read-only** `isToolWindow(win)` probe. The watchdog only *reads* `GWL_EXSTYLE` and
writes **only when the style has drifted** — one integer read per 2 s when healthy, so it is
free in practice. **Latency on the answer path is untouched.**

Wire it in `createMainWindow()` right after the existing `hideFromTaskbar(win, 'main')`.

### ★ THE CRITICAL GAP — nobody has ever run the diagnostic with the app live

The single diagnostic attempt returned:

```
RESULT: NO electron.exe process is running.
```

The app was not running, so **zero real Win32 style data has ever been captured.** Every
conclusion so far is inference from reading code — and code inspection is exactly what
produced the two false "fixed" claims.

### Next actions — do these in order

```powershell
# 1. Rebuild (required — the app loads dist-electron/*.js, NOT the .ts sources)
npx tsc -p tsconfig.electron.json

# 2. Start the app
Start.bat

# 3. WHILE it is running, in a second terminal — capture the real style bits
powershell -ExecutionPolicy Bypass -File tools/check-taskbar.ps1
```

**4. Then do the focus/blur test** — this is the decisive experiment:

| Step | Action | Icon present? |
|---|---|---|
| a | App just started | ? |
| b | **Click the overlay** (focus it) | ? |
| c | **Click another app** (blur it) | ? |

If the icon **appears only after clicking**, the focus/blur root cause is confirmed and v3 is
the correct fix. Write down all three answers.

**5. Report back:** the `=>` lines from the diagnostic, the `[taskbar]` console lines, and
the three answers from the focus/blur test.

### Interpretation table

| Diagnostic output | Meaning | Next step |
|---|---|---|
| `*** TASKBAR BUTTON - WS_EX_APPWINDOW IS SET ***` | Fix not landing | Check `koffi` load errors; verify fresh build |
| `hidden from taskbar (WS_EX_TOOLWINDOW)` **but icon still visible** | Fix worked — icon belongs to **another** window or is a **stale shell entry** | Unpin the taskbar entry; `Stop-Process -Name explorer -Force` |
| `top-level with no TOOLWINDOW -> MAY show a button` | Neither bit set | Report it — should not happen |

### If the diagnostic is inconclusive, remaining candidates (in order)

1. **DevTools window** — a separate native top-level window; needs its own handler (already
   added). Verify it fires by looking for `✓ [taskbar] devtools is a tool window`.
2. **Stale Windows shell cache** — Windows caches pinned taskbar buttons. Unpin + restart
   Explorer.
3. **Raw `electron.exe`** — dev mode runs the unbranded binary. A packaged build
   (`electron-builder`) would carry the app's own identity and icon.
4. **Last resort** — consider `win.setSkipTaskbar` on an interval only (v3 watchdog alone),
   or an owned-window trick (create the overlay as an owned child of a hidden 0×0 parent,
   since owned windows never get taskbar buttons).

---

## 3. Duplicate Questions — 🟡 DESIGN AGREED, NOT BUILT

**Symptom:** Deepgram emits growing partial transcripts:

```
1. "hello can you please"
2. "tell me about machine learning"
3. "hello can you please tell me about machine learning"
```

Each final triggers `processNewQuestion` → the user gets 2–3 answers for **one** question.

**User's explicit constraints (do not violate):**

- ❌ **Rejected:** an extra LLM call to judge similarity —
  *"latency bahut zyada badh jayega… mujhe ye risk nahi chahiye"*
- ✅ **Required:** **zero** added API calls on the answer path
- ✅ **Required:** high accuracy — must not **miss** a genuine new question
- ✅ Must handle the **growing-partial** case specifically (each transcript is a superset of
  the previous one)

**Agreed approach — purely local, synchronous, target < 1 ms:**

1. Normalise text — lowercase, strip punctuation and filler words
   (`hello`, `please`, `can you`, `could you`, `tell me`, …)
2. Compare against the last **N ≈ 5** asked questions within a **≈ 30–45 s** window
3. **Token-subset check** — if the new question's tokens are a **superset** of a recent one,
   it is the same question growing → **duplicate**
4. **Token-set Jaccard / Dice similarity** above threshold (**≈ 0.75–0.85**) → duplicate
5. Skip if the previous answer is **still streaming** (`isStreaming === true`)

**Where:** new `electron/questionDeduper.ts`, called from
[`electron/main.ts`](../../../electron/main.ts) `processNewQuestion()` before creating the
question — or inside [`questionDetector.ts`](../../../electron/questionDetector.ts).
Make it unit-testable (pure function, no side effects).

> [!TIP]
> Step 3 (token-subset) is the key one — it directly solves the growing-partial case the
> user described, and it is cheap: a Set membership test.

---

## 4. Deferred / Not Started

- Improvements listed in the `improvement_plan` artifact from the earlier deep-research
  session (screenshot flow, latency, UI polish) — revisit after the taskbar issue closes.
- **Screenshot question extraction** — user asked to fix this; not yet investigated in depth.

---

## Repo State

**New files created this session:**

| File | Purpose |
|---|---|
| `docs/README.md` | Docs index + hard rules + architecture |
| `docs/MODEL_STRATEGY.md` | Verified models + the live-check command |
| `docs/TASKBAR_HIDING.md` | Win32 explanation + root cause + troubleshooting |
| `docs/RESUME.md` | This file |
| `.agents/skills/ai-interview-helper/SKILL.md` | Full engineering protocol (project-scoped) |
| `.agents/rules/project-rules.md` | Always-on hard rules |
| `tools/check-taskbar.ps1` | Read-only Win32 window-style diagnostic |
| `~/.gemini/config/skills/ai-interview-helper/SKILL.md` | **Global** Antigravity skill (mirrors the above) |

**Modified:** `electron/modelStrategy.ts`, `electron/llmEngine.ts`,
`electron/windowManager.ts`, `electron/main.ts`, `src/store/index.ts`,
`src/components/Settings/SettingsModal.tsx`,
`src/components/Toolbar/ModelSwitcher.tsx`,
`src/components/AnswerPanel/AnswerDisplay.tsx`

**Build state:** ✅ `npx tsc -p tsconfig.electron.json` → exit 0, `dist-electron/` freshly
emitted and verified to contain `show: false`, the read-back assertions, and the
apply-then-reveal ordering.

**Taskbar code state:** ⚠️ **unchanged from v2.** The v3 `enforceTaskbarHiding()` was
designed and documented but **deliberately not applied** — the user asked for docs only.

---

## Quick Reference

```powershell
# Validate (fast)
npx tsc -p tsconfig.electron.json --noEmit    # main process
npx tsc --noEmit                              # renderer

# Apply main-process changes (REQUIRED)
npx tsc -p tsconfig.electron.json

# Run
Start.bat
npm run dev

# Diagnose taskbar (run WHILE the app is running)
powershell -ExecutionPolicy Bypass -File tools/check-taskbar.ps1
```

**Settings location** (outside repo, deliberately disguised):
`~/Documents/Softwares/Interview/Chrome Background Services/settings.json`

**Hotkeys:** `Ctrl+Shift+M` mic · `+S` speaker · `+P` screenshot · `+C` clipboard ·
`+R` refresh · `+H` hide/show · `Ctrl+↑/↓` opacity
