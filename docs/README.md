# Documentation Index

Living docs for the **AI Interview Helper** Electron overlay. Kept up to date as the code changes.

> [!TIP]
> **Opening a fresh chat?** Start with [RESUME.md](./RESUME.md) — it has the current state
> and the exact next actions.

| Doc | Covers |
|---|---|
| [RESUME.md](./RESUME.md) | ⭐ **Session handoff** — current status, next actions, open issues |
| [DUAL_ANSWERS_AND_HISTORY.md](./DUAL_ANSWERS_AND_HISTORY.md) | ✅ **Dual Answers, Sticky Reading & Session History** — architecture and usage |
| [MODEL_STRATEGY.md](./MODEL_STRATEGY.md) | ⚠️ **Read before adding any model.** Live-verified Groq models, the 30-second re-check, tier selection, reasoning tuning |
| [TASKBAR_HIDING.md](./TASKBAR_HIDING.md) | 🔴 **Unresolved.** Why `skipTaskbar: true` fails, the v1/v2 attempts, the focus/blur root cause, verification, troubleshooting |

**Tooling**

| Tool | Purpose |
|---|---|
| [`tools/test-dual-history.js`](../tools/test-dual-history.js) | Automated smoke test for dual answers, history snapshots, and session runs |
| [`tools/check-taskbar.ps1`](../tools/check-taskbar.ps1) | Read-only diagnostic — reads real Win32 window styles off every Electron window |

**Agent customizations**

| Path | Scope | Purpose |
|---|---|---|
| [`.agents/skills/ai-interview-helper/SKILL.md`](../.agents/skills/ai-interview-helper/SKILL.md) | This project only | Full engineering protocol, architecture, pipeline, working agreement |
| [`.agents/rules/project-rules.md`](../.agents/rules/project-rules.md) | This project only | Always-on hard rules |
| `~/.gemini/config/skills/ai-interview-helper/SKILL.md` | **Global — every workspace** | Same protocol, available in any chat even outside this repo |

---

## Hard Rules

### 1. Never add a model without live-testing it first

Groq model access is **per-account**. A model in Groq's public docs can still 404 here.
This has already gone wrong twice.

**Confirmed unavailable:** `llama-3.3-70b-versatile`, `llama-3.1-8b-instant`
**Confirmed available:** `openai/gpt-oss-120b`, `openai/gpt-oss-20b`, `qwen/qwen3.8-27b`

Run the check in [MODEL_STRATEGY.md](./MODEL_STRATEGY.md) **before** editing
[`electron/modelStrategy.ts`](../electron/modelStrategy.ts).

### 2. "Fixed" is not "verified" — measure, don't assume

The taskbar fix was declared done **twice** while the icon was still visible. It is **still
visible now**. Before reporting any stealth/invisibility change as complete:

```powershell
# Run WHILE the app is running — otherwise it reports "NO electron.exe process"
powershell -ExecutionPolicy Bypass -File tools/check-taskbar.ps1
```

### 3. Re-emit compiled JS after editing the main process

`electron-main.js` loads **`dist-electron/main.js`**, not the `.ts` sources.

```powershell
npx tsc -p tsconfig.electron.json
```

### 4. Don't run the slow package build for validation

`npm run build:electron` runs `electron-builder` and is slow. Use:

```powershell
npx tsc -p tsconfig.electron.json --noEmit   # main process (~4s)
npx tsc --noEmit                             # renderer
```

### 5. Latency is sacred

This runs during a live interview. Never add a network round-trip to the answer path.
Tier selection is deliberately local regex matching. The user has explicitly rejected
LLM-based duplicate detection because of the latency risk.

---

## Architecture Quick Reference

```
Start.bat / Start.vbs / "Chrome Background Services.vbs"
        │
        ▼
  electron.exe .  ──►  electron-main.js  ──►  dist-electron/main.js
                                                     │
                        ┌────────────────────────────┼────────────────────────────┐
                        ▼                            ▼                            ▼
                 windowManager.ts              llmEngine.ts              screenshotCapture.ts
                 • hideFromTaskbar()      • modelStrategy tiers      • VISION_MODEL
                   WS_EX_TOOLWINDOW       • MODEL_FALLBACKS            (qwen3.8-27b)
                 • applyWdaInvisibility() • reasoning_effort: low
                   WDA_EXCLUDEFROMCAPTURE • dual answer streams
                        │
                        ▼
              Deepgram STT ──► QuestionDetector ──► processNewQuestion ──► streamed dual answers
```

### Answer pipeline

```
mic/speaker ──► AudioCapture ──► STTEngine (Deepgram)
                                      │ 'transcript' (isFinal)
                                      ▼
                              QuestionDetector.isQuestion()
                                      │ true
                                      ▼
                        processNewQuestion(text, source)   [main.ts]
                                      │
                                      ├─► send('new-question')        → UI placeholder
                                      ▼
                        LLMEngine (Parallel streams for Both / Simple / Contextual)
                          ├─ Simple: direct gpt-oss-20b, 0 context, fast
                          └─ Contextual: in-flight classification + last 4 msgs
                                      │
                                      ▼
                          for await (chunk) → send('answer-stream-chunk', {kind})
                                      │
                                      ▼
                          storageManager.updateQuestionAnswer()
```

### Data location

Settings, answers, and logs live in a disguised folder **outside the repo**:

```
~/Documents/Softwares/Interview/Chrome Background Services/
├── settings.json
├── answers/
│   ├── run_<timestamp>_<id>.json   ← per-launch session runs
│   └── session_YYYY-MM-DD.json     ← legacy daily sessions (preserved)
├── logs/
└── Chrome Background Services.vbs   ← launcher, regenerated on every start
```

### Hotkeys

| Shortcut | Action |
|---|---|
| `Ctrl+Shift+M` | Toggle mic |
| `Ctrl+Shift+S` | Toggle speaker |
| `Ctrl+Shift+P` | Screenshot → question |
| `Ctrl+Shift+C` | Clipboard → question |
| `Ctrl+Shift+R` | Refresh session |
| `Ctrl+Shift+H` | Hide / show window |
| `Ctrl+↑` / `Ctrl+↓` | Window opacity |

---

## Open Issues

| # | Issue | Status |
|---|---|---|
| 1 | **Taskbar icon still visible** | 🔴 **STILL BROKEN** — v1 and v2 both failed. v3 designed but **not applied**. See [TASKBAR_HIDING.md](./TASKBAR_HIDING.md) |
| 2 | Candidate mic readback question loop | 🟡 Deferred by user — to be tackled next |
| 3 | Screenshot question extraction | ⚪ Not started |

---

## Changelog

| Date | Change |
|---|---|
| 2026-11-04 | Implemented Dual Answers (Simple + Contextual with in-flight classification of last 4 messages), Sticky scroll fix (single scroller, no autoscroll during chunk streaming), and Session Run History Viewer (per-run storage + legacy normalization). Added `tools/test-dual-history.js` and `docs/DUAL_ANSWERS_AND_HISTORY.md`. |
| 2026-10-14 | Taskbar marked 🔴 **STILL BROKEN** (v1 + v2 both failed). Documented the focus/blur re-application root cause and the v3 design (**not applied**). Noted the diagnostic has never run with the app live. Added the **global** skill at `~/.gemini/config/skills/ai-interview-helper/`. |
| 2026-10-14 | Model 404 fixed (live-verified + fallback chain + `reasoning_effort`). Taskbar v2 (timing bug found: show-then-style → now hide-style-reveal; style read-back added). Added `tools/check-taskbar.ps1`, `.agents/` skill + rule, `docs/RESUME.md`. |
| 2026-10-14 | Created `docs/` folder. Taskbar v1 (native `WS_EX_TOOLWINDOW`). |
