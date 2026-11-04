---
name: ai-interview-helper
description: >-
  Master engineering protocol, navigation guide, and working agreement for the
  AI Interview Helper project (owner: Ayush) — an Electron + React desktop overlay
  that listens to a live interview via Deepgram STT, detects questions, and streams
  Groq LLM answers invisibly over the screen. Activate whenever modifying, debugging,
  extending, refactoring, auditing, deploying, or navigating ANY part of this codebase
  — including model strategy, taskbar/screen-capture hiding, the STT→detect→answer
  pipeline, screenshot question extraction, storage/settings, hotkeys, docs, or
  git/deploy workflow. Also activate when the user references model 404 errors,
  the taskbar icon problem, duplicate questions, or the docs/ folder.
---

# AI Interview Helper — Engineering Protocol

> **Owner:** Ayush · **Platform:** Windows only · **Purpose:** personal live-interview copilot
> **Repo:** `c:\Users\ayush_lr8ru2y\Desktop\ai-interview-helper`

---

## 0. Read This First — The Two Rules That Have Already Been Broken

### Rule 1 — NEVER add a Groq model without live-verifying it against THIS account

Groq model access is **per-account**. A model in Groq's public docs, or one that works
for someone else, can still 404 here. This mistake has already happened **twice**
(`llama-3.1-8b-instant`, then `llama-3.3-70b-versatile`) and the user was rightly angry:

> *"Why you are adding model which are not accessible to me first check it then tell me
> then add that model OK"*

**Before touching [`electron/modelStrategy.ts`](../../../../../Desktop/ai-interview-helper/electron/modelStrategy.ts):**

```powershell
# 1. What does THIS account actually have?
$raw = Get-Content '.env' -Raw
$key = (($raw -split "`n" | Where-Object { $_ -match '^\s*GROQ_API_KEY=' }) -replace '^\s*GROQ_API_KEY=','').Trim()
$h = @{ Authorization = "Bearer $key"; 'Content-Type' = 'application/json' }
(Invoke-RestMethod -Uri 'https://api.groq.com/openai/v1/models' -Headers $h).data.id
```

```powershell
# 2. Does it actually ANSWER? (listed != usable). max_tokens MUST be >= 200.
$body = @{ model='openai/gpt-oss-20b'; messages=@(@{role='user';content='Reply with exactly: OK'}); max_tokens=200 } | ConvertTo-Json -Depth 5
(Invoke-RestMethod -Uri 'https://api.groq.com/openai/v1/chat/completions' -Headers $h -Method Post -Body $body -TimeoutSec 45).choices[0].message.content
```

**Verified available (2026-10-14):** `openai/gpt-oss-120b` · `openai/gpt-oss-20b` · `qwen/qwen3.8-27b`

**Confirmed 404 — never use:** `llama-3.3-70b-versatile` · `llama-3.1-8b-instant`

Full detail: [`docs/MODEL_STRATEGY.md`](../../../../../Desktop/ai-interview-helper/docs/MODEL_STRATEGY.md)

### Rule 2 — "Fixed" is not "verified"

The taskbar fix was declared done **twice** and the icon was still visible both times.
The lesson: **measure, do not assume.** Use the diagnostic:

```powershell
powershell -ExecutionPolicy Bypass -File tools/check-taskbar.ps1
```

It reads the real `WS_EX_APPWINDOW` / `WS_EX_TOOLWINDOW` bits off every Electron window,
so you know whether the fix actually landed instead of guessing.

---

## 1. What This App Is

A **transparent, frameless, always-on-top overlay** that sits on top of the user's screen
during a live job interview. It:

1. Captures **microphone** (user's voice) and **system loopback** (interviewer's voice)
2. Streams audio to **Deepgram** for real-time STT
3. **Detects questions** from the transcript locally
4. Streams an answer from **Groq** that the user can speak out loud
5. Is **invisible to screen sharing** (`WDA_EXCLUDEFROMCAPTURE`) and **absent from the
   taskbar**

**Use case is personal and stealth-focused.** The user is the candidate. Answers must be
first-person, concise (3–7 sentences), and sound natural when spoken.

---

## 2. Hard Constraints

| Constraint | Reason |
|---|---|
| **Windows only** | Relies on Win32 `SetWindowDisplayAffinity`, `SetWindowLongW` via `koffi` |
| **Latency is sacred** | Live interview — every ms counts. Never add a network round-trip to the answer path. Tier selection is deliberately local-only. |
| **Never run `npm run build:electron` for validation** | It runs `electron-builder` and is very slow. Use targeted `tsc` instead. |
| **Secrets in `.env`** | `GROQ_API_KEY`, `DEEPGRAM_API_KEY`. Never commit (already gitignored). |
| **Settings live OUTSIDE the repo** | `~/Documents/Softwares/Interview/Chrome Background Services/` — deliberately disguised. |
| **Communicate in Hindi-English mix** | User's preference. Concise, bullet points for plans. |
| **Keep `docs/` updated** | Explicit standing instruction: *"docs hamesha update karte chalo"* |

---

## 3. Navigation Map

```
ai-interview-helper/
├── electron/                    ← MAIN PROCESS (TypeScript → dist-electron/)
│   ├── main.ts                  ← entry: app lifecycle, tray, IPC wiring, question pipeline
│   ├── windowManager.ts         ← ★ hideFromTaskbar() + applyWdaInvisibility()
│   ├── modelStrategy.ts         ← ★ model tiers + MODEL_FALLBACKS + selectTier()
│   ├── llmEngine.ts             ← Groq streaming, fallback retry, reasoning_effort
│   ├── screenshotCapture.ts     ← vision extraction (VISION_MODEL = qwen3.8-27b)
│   ├── sttEngine.ts             ← Deepgram WebSocket, on-demand mic/speaker
│   ├── questionDetector.ts      ← local question detection
│   ├── audioCapture.ts          ← mic + system loopback
│   ├── ipcHandlers.ts           ← renderer↔main IPC surface
│   ├── hotkeys.ts               ← global shortcuts
│   ├── storageManager.ts        ← settings/answers/logs + launcher .vbs generation
│   └── usageTracker.ts          ← session minutes
├── src/                         ← RENDERER (React + Vite)
│   ├── store/index.ts           ← Zustand store
│   └── components/
│       ├── Toolbar/ModelSwitcher.tsx      ← Auto/Instant/Balanced/Deep chips
│       ├── Settings/SettingsModal.tsx     ← ★ AVAILABLE_MODELS list
│       ├── AnswerPanel/AnswerDisplay.tsx  ← markdown + regenerate buttons
│       └── ...
├── docs/                        ← ★ living documentation (keep updated!)
│   ├── README.md                ← index + hard rules + architecture
│   ├── MODEL_STRATEGY.md        ← verified models + live-check command
│   └── TASKBAR_HIDING.md        ← Win32 explanation + troubleshooting
├── tools/
│   └── check-taskbar.ps1        ← ★ read-only Win32 window-style diagnostic
├── assets/                      ← icon.ico / icon.png / icon-source.png
├── electron-main.js             ← bootstrap: deletes ELECTRON_RUN_AS_NODE, loads dist-electron/main.js
├── Start.bat / Start.vbs        ← dev launchers (raw electron.exe)
└── .env                         ← API keys (gitignored)
```

★ = files that have caused real bugs; treat with care.

---

## 4. Build & Validate

```powershell
# Fast typecheck (~4s) — use this for validation
npx tsc -p tsconfig.electron.json --noEmit     # main process
npx tsc --noEmit                               # renderer

# Apply main-process changes (REQUIRED — the app loads compiled JS, not .ts)
npx tsc -p tsconfig.electron.json              # emits dist-electron/*.js

# Run
npm run dev        # vite + electron with hot reload
# or
Start.bat          # production-ish run via raw electron.exe
```

> [!IMPORTANT]
> `electron-main.js` loads **`dist-electron/main.js`**. Editing `electron/*.ts` has **zero
> effect** until you run `npx tsc -p tsconfig.electron.json`. This has caused confusion.

---

## 5. The Answer Pipeline

```
mic/speaker audio
      │
      ▼
 AudioCaptureService ──► STTEngine (Deepgram WS)
                              │  'transcript' event (isFinal)
                              ▼
                      QuestionDetector.isQuestion(text)
                              │  true
                              ▼
                    processNewQuestion(text, source)   [main.ts]
                              │
                              ├─► webContents.send('new-question')      → UI shows placeholder
                              │
                              ▼
                    LLMEngine.generateAnswerStream(text, {source})
                              │
                              ├─ resolveTier(answerMode, question, source)   ← LOCAL, 0 ms
                              ├─ isVerifiedModel() guard → MODEL_FALLBACKS[0] if stale
                              ├─ reasoning_effort:'low' for gpt-oss models
                              └─ openai.chat.completions.create({ stream: true })
                                        │
                                        ▼
                              for await (chunk) → send('answer-stream-chunk')
                                        │
                                        ▼
                              storageManager.saveAnswer()
```

### Tier selection ([`modelStrategy.ts`](../../../../../Desktop/ai-interview-helper/electron/modelStrategy.ts))

```
source == 'screenshot'  ──► deep        (qwen vision already read the image)
source == 'clipboard'   ──► balanced
question matches TECHNICAL_PATTERNS ──► balanced
otherwise               ──► instant
```

`TECHNICAL_PATTERNS` is a broad `RegExp[]` (code, algorithm, sql, react, docker, …).
False positives only cost a little latency; false negatives cost answer quality.

### Model fallback safety nets ([`llmEngine.ts`](../../../../../Desktop/ai-interview-helper/electron/llmEngine.ts))

1. **Pre-flight** — `isVerifiedModel()` fails → swap to `MODEL_FALLBACKS[0]`
2. **Retry** — `isUnusableModelError(err)` (404 / "does not exist" / "do not have access"
   / `model_not_found` / `decommissioned` / "no longer supported") → retry once on
   `MODEL_FALLBACKS[0]`

---

## 6. The Invisibility Stack (two independent systems)

| System | Function | Effect |
|---|---|---|
| **Screen capture** | `applyWdaInvisibility()` in [`windowManager.ts`](../../../../../Desktop/ai-interview-helper/electron/windowManager.ts) | `SetWindowDisplayAffinity(hwnd, WDA_EXCLUDEFROMCAPTURE)` → window is **truly absent** from any capture, not a black box. Temporarily drops `WS_EX_LAYERED` because the call fails on layered windows. Re-applied on every `show`. |
| **Taskbar** | `hideFromTaskbar()` in [`windowManager.ts`](../../../../../Desktop/ai-interview-helper/electron/windowManager.ts) | Strips `WS_EX_APPWINDOW` (0x00040000), sets `WS_EX_TOOLWINDOW` (0x00000080), then `SetWindowPos(..., SWP_FRAMECHANGED)` to force the shell to re-read. **Reads the style back** and returns `false` if it did not stick. |

### Why `skipTaskbar: true` alone is not enough

Windows shows a taskbar button when `WS_EX_APPWINDOW` is set, and that bit **wins over**
`WS_EX_TOOLWINDOW`. Electron's `skipTaskbar` only *sets* `TOOLWINDOW` — it never *clears*
`APPWINDOW`. So the button survives. See
[`docs/TASKBAR_HIDING.md`](../../../../../Desktop/ai-interview-helper/docs/TASKBAR_HIDING.md).

### Enforcement layers (all startup-only — none covers focus/blur)

1. `createMainWindow()` → `hideFromTaskbar(win, 'main')`
2. `ready-to-show` → `hideFromTaskbar(...)` **then** `show()` — ordering matters
3. `win.on('show')` → re-apply (Windows can restore styles on re-show)
4. `app.on('browser-window-created')` → catch-all for **every** window incl. DevTools

**DevTools is a separate native top-level window** and is *not* covered by the main
window's `skipTaskbar`. It needs its own `devtools-opened` handler.

> [!WARNING]
> All four layers are **event-driven at startup**. None of them covers the **focus/blur**
> transition — which is the suspected root cause. That is exactly the gap v3 fills.

### 🔴 Open problem — THE ICON IS STILL VISIBLE (unresolved)

> [!CAUTION]
> **Do not claim this is fixed.** It has been declared fixed **twice** and the icon was still
> visible both times. The user's verdict: *"abhi bhi work nahi kiya hai"*.

| Attempt | What it did | Result |
|---|---|---|
| v0 | `skipTaskbar: true` + `setSkipTaskbar(true)` + `setAppUserModelId` | ❌ Icon visible |
| v1 | Native strip of `WS_EX_APPWINDOW` + set `WS_EX_TOOLWINDOW` + `SWP_FRAMECHANGED`; `devtools-opened` handler; `browser-window-created` catch-all | ❌ Icon visible |
| v2 | Timing bug found in v1 → `show: false` + apply-styles-then-reveal; style **read-back** assertion | ❌ Icon visible |
| v3 | *(designed, **NOT applied**)* focus/blur re-assert + 2 s read-only watchdog | ⚪ Pending |

**Root cause of the failure (v3 hypothesis):**

> **Windows / DWM re-applies `WS_EX_APPWINDOW` on focus and blur transitions.**

v1 and v2 both applied the styles **once**, at startup. A one-shot fix survives only until
Windows re-adds `APPWINDOW` on the first click, and the taskbar button returns. If correct,
**no startup-only enforcement can ever work** — the style must be re-asserted continuously.

**The v3 design (documented, deliberately not applied):** add `enforceTaskbarHiding(win, label)`
to [`windowManager.ts`](../../../../../Desktop/ai-interview-helper/electron/windowManager.ts) —
`focus` / `blur` / `restore` / `show` listeners that call `setSkipTaskbar(true)` +
`hideFromTaskbar()`, plus a **2 s watchdog** that uses a read-only `isToolWindow(win)` probe
and writes **only when the style has drifted**. One integer read per 2 s when healthy → no
flicker, no measurable cost, and it runs on the main-process event loop, **not** the LLM
answer path. Wire it in `createMainWindow()` after the existing `hideFromTaskbar(win, 'main')`.
Full code: [`docs/TASKBAR_HIDING.md`](../../../../../Desktop/ai-interview-helper/docs/TASKBAR_HIDING.md).

**★ The critical gap — the diagnostic has never run with the app live.** The one attempt
returned `RESULT: NO electron.exe process is running.`, so **zero real Win32 style data has
ever been captured.** Every conclusion so far is inference from reading code — the same
method that produced the two false "fixed" claims.

**Next actions:**

```powershell
npx tsc -p tsconfig.electron.json   # 1. rebuild (app loads dist-electron/*.js)
Start.bat                           # 2. start the app
# 3. WHILE it runs, second terminal:
powershell -ExecutionPolicy Bypass -File tools/check-taskbar.ps1
```

**4. The decisive focus/blur test** — record the answer at each step:

| Step | Action | Icon present? |
|---|---|---|
| a | App just started | ? |
| b | **Click the overlay** (focus it) | ? |
| c | **Click another app** (blur it) | ? |

If the icon **appears only after clicking**, the focus/blur cause is confirmed and v3 is the
right fix.

**Interpretation:**

- `WS_EX_APPWINDOW is SET` → the native fix is not landing → check `koffi` load / HWND
- `hidden (WS_EX_TOOLWINDOW)` but icon visible → the icon belongs to **another window**
  (DevTools, or a stale shell cache) → unpin the stale entry / restart Explorer
- Neither bit set → add `WS_EX_TOOLWINDOW` explicitly

**Remaining candidates, in order:** (1) DevTools window — verify the `devtools-opened` handler
fires via `✓ [taskbar] devtools is a tool window`; (2) stale Windows shell cache — unpin +
`Stop-Process -Name explorer -Force`; (3) raw `electron.exe` in dev carries the stock Electron
identity, a packaged build would use the app's own icon; (4) **owned-window trick** — make the
overlay an owned child of a hidden 0×0 parent, since owned windows never get taskbar buttons.

---

## 7. Known Open Issues / TODO

| # | Issue | Status |
|---|---|---|
| 1 | **Taskbar icon still visible** | 🔴 **OPEN** — v1 + v2 failed. v3 designed, **not applied**. Diagnostic never run live. |
| 2 | Candidate mic readback question loop (Feature 3) | 🟡 Deferred by user — to be tackled next |
| 3 | Duplicate questions & multi-chunk stitching | ✅ Completed & verified |
| 4 | Screenshot question extraction | ⚪ Not started — user asked for it |
| 5 | Deferred improvements from `improvement_plan` artifact | ⚪ Not started |

### Issue 2 — Duplicate question detection (discussed, not built)

**Symptom:** Deepgram emits partial transcripts that grow:
`"hello can you please"` → `"tell me about machine learning"` → `"hello can you please tell me about machine learning"`.
Each final triggers `processNewQuestion`, so the user gets 2–3 answers for one question.

**User's explicit constraints:**
- ❌ **Rejected:** an extra LLM call to judge similarity — *"latency bahut zyada badh jayega… mujhe ye risk nahi chahiye"*
- ✅ **Required:** zero added API calls on the answer path
- ✅ **Required:** high accuracy — must not *miss* a genuine new question

**Agreed direction:** purely local, synchronous dedupe before `processNewQuestion`:
1. Normalise text (lowercase, strip punctuation/filler words)
2. Compare against the last N (≈5) asked questions within a time window (≈30–45 s)
3. **Token-subset check** — if the new question's tokens are a superset of a recent one
   (the growing-partial case), treat as duplicate
4. **Token-set Jaccard / Dice similarity** above a threshold (~0.75–0.85)
5. Also compare against the in-flight question id and skip if the previous answer is still
   streaming

Target: < 1 ms, no network, no new dependency. Must live in `questionDetector.ts` or a new
`questionDeduper.ts`, and be unit-testable.

---

## 8. Working Agreement

1. **Verify before claiming.** Live-test models, read back window styles, run typecheck.
2. **Never add a model without the live check** (Rule 1).
3. **Update `docs/` in the same change** as the code. The user relies on this to resume in
   fresh chats.
4. **Don't run the slow package build** for validation.
5. **Hindi-English, concise, bullet points** for plans. Discuss before big changes.
6. **Latency is sacred** — no extra network calls on the answer path.
7. **`dist-electron/` must be re-emitted** after editing `electron/*.ts`.
8. **Don't write project code outside the workspace.**

---

## 9. Reference Index

| Topic | Where |
|---|---|
| Verified models + live check | [`docs/MODEL_STRATEGY.md`](../../../../../Desktop/ai-interview-helper/docs/MODEL_STRATEGY.md) |
| Taskbar Win32 explanation | [`docs/TASKBAR_HIDING.md`](../../../../../Desktop/ai-interview-helper/docs/TASKBAR_HIDING.md) |
| Docs index + architecture | [`docs/README.md`](../../../../../Desktop/ai-interview-helper/docs/README.md) |
| Taskbar diagnostic | [`tools/check-taskbar.ps1`](../../../../../Desktop/ai-interview-helper/tools/check-taskbar.ps1) |
| Model tiers | [`electron/modelStrategy.ts`](../../../../../Desktop/ai-interview-helper/electron/modelStrategy.ts) |
| Answer streaming (dual simple + contextual) | [`electron/llmEngine.ts`](../../../../../Desktop/ai-interview-helper/electron/llmEngine.ts) |
| Dual answers & session history | [`docs/DUAL_ANSWERS_AND_HISTORY.md`](../../../../../Desktop/ai-interview-helper/docs/DUAL_ANSWERS_AND_HISTORY.md) |
| Window hiding | [`electron/windowManager.ts`](../../../../../Desktop/ai-interview-helper/electron/windowManager.ts) |
