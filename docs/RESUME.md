# RESUME HERE — Session Handoff

> **Purpose:** open a fresh chat and continue exactly where this left off.
> **Last updated:** 2026-11-04 16:00 IST
> **Project:** [`ai-interview-helper`](../../../) — Electron + React live-interview overlay

---

## Read These First (in order)

1. **This file** — current state and next actions
2. [`docs/README.md`](./README.md) — hard rules + architecture
3. [`docs/DUAL_ANSWERS_AND_HISTORY.md`](./DUAL_ANSWERS_AND_HISTORY.md) — dual answer pipeline, multi-log background context, deduplication, key-point highlighting, side-by-side layout, sticky scroll, shortcuts, and session runs
4. [`docs/TASKBAR_HIDING.md`](./TASKBAR_HIDING.md) — the active, unresolved problem
5. [`docs/MODEL_STRATEGY.md`](./MODEL_STRATEGY.md) — the model rule
6. Skill: `.agents/skills/ai-interview-helper/SKILL.md` — full engineering protocol
   *(also installed globally at `~/.gemini/config/skills/ai-interview-helper/SKILL.md`)*

---

## Current Status

| Item | State |
|---|---|
| Dual Answer System (Simple + Contextual) | ✅ **Completed & verified** — Simple gets clean isolated question as usual; Contextual gets background 25-log context in API call |
| Force-Send Last Transcript (`Alt+Enter`) | ✅ **Completed & verified** — global hotkey + in-window listener + "Ask Last" UI button |
| Key-Point Highlighting (Contextual) | ✅ **Completed & verified** — soft luminous gold highlights on 2-4 critical anchor terms per paragraph; static simple answer untouched |
| As-Usual Question Detection & Deduplication | ✅ **Completed & verified** — clean questions in UI, growing superset in-place upgrade, follow-ups ("Tell me more") supported |
| Clean UI Transcript Logs | ✅ **Completed & verified** — in-place interim updates, duplicate skipping, memory capped at 100 entries |
| Side-by-Side 50/50 Layout & Width Tuning | ✅ **Completed & verified** — questions panel 18%, answers panel ~82%, side-by-side columns |
| Reliable `Alt+M` Mic Toggle | ✅ **Fixed & verified** — `Menu.setApplicationMenu(null)`, unified `toggleMicAction`, and in-window DOM `keydown` listener |
| Sticky Reading / Scroll fix | ✅ **Completed & verified** — top-pinned, zero auto-scrolling during streaming |
| Accessible Shortcuts & Hover Badges | ✅ **Completed & verified** — `Alt+Enter`, `Alt+C`, `Alt+S`, `Alt+H`, `Alt+R`, `Alt+M` + hover tooltips |
| Clean Toolbar (Timer & Speaker removed) | ✅ **Completed & verified** — bottom timer and unused Speaker toggle completely removed for minimal, distraction-free overlay |
| Session Run History Viewer | ✅ **Completed & verified** — per-run storage + legacy normalization + full UI viewer |
| Single-File Session Timeline Audit & Direct Export | ✅ **Completed & verified** — one clean JSON file per session (`session_<id>.json`) tracking exact timestamps, continuous transcription timeline, full prompt & latency audits for Simple and Contextual pipelines, and 1-click Markdown/JSON export in History UI |
| Model 404 errors | ✅ **Fixed & live-verified** |
| Taskbar icon | 🔴 **STILL BROKEN** — v1 and v2 both failed. Fix **not applied** (documented only). |
| Feature 3: Candidate mic readback question loop | 🟡 **Deferred by user** — to be tackled next |

---

## 1. Simple vs Contextual Separation & `Alt+Enter` — ✅ DONE (2026-11-04)

- **Simple Answer (Static/Instant):** Receives ONLY the clean detected question as usual (e.g. *"Tell me about machine learning model"* or *"Tell me more."*). Fast, concise (2-5 sentences), zero history.
- **Contextual Answer (With 25-Log Background):** Receives the prompt AND the last 20-25 transcription logs in the background API call. Reconstructs in-flight what the interviewer is asking for, personalizes with resume, and highlights 2-4 key anchor terms. The UI displays only the clean question text (no 25-log clutter).
- **`Alt+Enter` Shortcut:** If an interviewer prompt sits in the Transcription Logs without auto-triggering, hitting `Alt+Enter` (or clicking **Ask Last**) immediately sends the latest transcript to trigger both answers.

---

## 2. Taskbar Icon — 🔴 STILL BROKEN (the active stealth issue)

Documented in [`docs/TASKBAR_HIDING.md`](./TASKBAR_HIDING.md). v3 focus/blur watchdog designed but deliberately not applied per user agreement. Diagnostic tool: `powershell -ExecutionPolicy Bypass -File tools/check-taskbar.ps1`.

---

## Quick Reference

```powershell
# Validate (fast)
npx tsc -p tsconfig.electron.json --noEmit    # main process
npx tsc --noEmit                              # renderer

# Apply changes (REQUIRED)
npx tsc -p tsconfig.electron.json             # main process
npx vite build                                # renderer bundle (dist/)

# Run smoke tests
node tools/test-dual-history.js

# Run app
Start.bat
```
