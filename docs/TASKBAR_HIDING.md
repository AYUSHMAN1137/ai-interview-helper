# Taskbar Icon — Root Cause, Fix, and Verification

> **Status:** 🔴 **STILL BROKEN** — confirmed by the user on 2026-10-14 after v1 **and** v2.
> The icon is **still visible in the Windows taskbar**. This issue is **OPEN**.
> **Files:** [`electron/windowManager.ts`](../electron/windowManager.ts), [`electron/main.ts`](../electron/main.ts)
> **Diagnostic:** [`tools/check-taskbar.ps1`](../tools/check-taskbar.ps1)

> [!CAUTION]
> **Do not claim this is fixed until the diagnostic has been run with the app live and the
> user confirms the icon is gone.**
> This problem has now been declared "fixed" **twice** and the icon was still visible both
> times. Code inspection is **not** evidence. See [Verification](#verification).

---

## TL;DR — current honest state

| Attempt | What it did | Result |
|---|---|---|
| **v0** | `skipTaskbar: true`, `setSkipTaskbar(true)`, `app.setAppUserModelId(...)` | ❌ Icon visible |
| **v1** | Native strip of `WS_EX_APPWINDOW` + set `WS_EX_TOOLWINDOW` + `SWP_FRAMECHANGED`; `devtools-opened` handler; `browser-window-created` catch-all | ❌ Icon visible |
| **v2** | Found a **timing bug** in v1 → `show: false` + apply-styles-then-reveal; style **read-back** assertion | ❌ Icon visible |
| **v3** | *(proposed, NOT applied)* — focus/blur re-assert + read-only watchdog | ⚪ Not implemented |

**The diagnostic has never actually been run while the app was running.** Every conclusion so
far is inference from code. The very first thing to do is capture real Win32 style data.

---

## Why `skipTaskbar: true` Fails

Windows decides whether a window gets a taskbar button with this rule:

```
has WS_EX_APPWINDOW        ──► SHOW taskbar button   (wins over TOOLWINDOW)
has WS_EX_TOOLWINDOW only  ──► hide taskbar button
neither                    ──► show only if top-level AND unowned
```

These are **extended window styles** (`GWL_EXSTYLE` = −20) on the native `HWND`.

Electron's `skipTaskbar` sets `WS_EX_TOOLWINDOW` but **never clears `WS_EX_APPWINDOW`**.
Frameless / transparent / always-on-top windows frequently already have `APPWINDOW` set by
Windows. Since `APPWINDOW` wins, the button stays.

---

## ★ The Newly-Identified Root Cause (v3 hypothesis)

> **Windows / DWM re-applies `WS_EX_APPWINDOW` on focus and blur transitions.**

This is the leading explanation for why **both** v1 and v2 failed:

- v1 and v2 both applied the styles **once**, at startup.
- A one-shot fix survives only until the user **clicks the overlay** or **clicks away** from
  it. Windows re-adds `APPWINDOW` on that transition, and the taskbar button comes back.
- This matches the observed behaviour exactly: it looks fixed for a moment, then it is not.

If this is right, then **no amount of startup-only enforcement can ever work.** The style has
to be re-asserted continuously, for the whole lifetime of the window.

### Corroborating research

| Finding | Source type |
|---|---|
| Re-apply `setSkipTaskbar(true)` on `focus` and `blur` events | Electron issue threads / Stack Overflow |
| `focusable: false` forces `skipTaskbar` on Windows — **not usable here** (the user must be able to interact with the overlay) | Electron docs / issue threads |
| Fullscreen / kiosk modes conflict with transparency + taskbar flags | Electron docs |
| Native `WS_EX_TOOLWINDOW` re-assertion is the reliable belt-and-braces layer | Win32 docs |

---

## The v3 Fix — PROPOSED, NOT APPLIED

> [!NOTE]
> The user explicitly said **not to apply this yet** — only to record it as pending work.
> The code in `windowManager.ts` is unchanged from v2.

Planned addition to [`electron/windowManager.ts`](../electron/windowManager.ts):

```ts
export function enforceTaskbarHiding(win: BrowserWindow, label = 'main'): void {
  const reassert = () => {
    if (!win || win.isDestroyed()) return
    try { win.setSkipTaskbar(true) } catch { }
    hideFromTaskbar(win, `${label}(re-assert)`)
  }

  win.on('focus', reassert)      // ← the transition Windows abuses
  win.on('blur', reassert)       // ← and the other one
  win.on('restore', reassert)
  win.on('show', reassert)

  const timer = setInterval(() => {
    if (!win || win.isDestroyed()) { clearInterval(timer); return }
    try {
      if (!isToolWindow(win)) hideFromTaskbar(win, `${label}(watchdog)`)
    } catch { clearInterval(timer) }
  }, 2000)

  win.on('closed', () => clearInterval(timer))
}
```

Plus a **read-only** helper `isToolWindow(win)` that returns the current
`WS_EX_TOOLWINDOW` / `WS_EX_APPWINDOW` state without writing anything.

**Why the watchdog is safe for latency:** it only performs a `GetWindowLongW` **read** once
every 2 s, and writes **only when the style has actually drifted**. When the style is correct
the cost is a single integer read — no `SetWindowPos`, no flicker, no measurable impact. The
answer path is untouched; this runs on the main process event loop, not the LLM path.

**Wiring:** call `enforceTaskbarHiding(win, 'main')` inside `createMainWindow()`, right after
the existing `hideFromTaskbar(win, 'main')`.

---

## What Has Been Applied So Far (v1 + v2)

### Step 1 — Native style manipulation ([`windowManager.ts`](../electron/windowManager.ts))

```ts
const GWL_EXSTYLE      = -20
const WS_EX_TOOLWINDOW = 0x00000080
const WS_EX_APPWINDOW  = 0x00040000
const SWP_FRAMECHANGED = 0x0020
```

`hideFromTaskbar(win, label)`:

| # | Step | Why |
|---|---|---|
| 1 | `SetWindowLongW(hwnd, GWL_EXSTYLE, (exStyle \| TOOLWINDOW) & ~APPWINDOW)` | Removes the bit Windows prioritises |
| 2 | `SetWindowPos(..., SWP_FRAMECHANGED)` | Forces the shell to re-read the style immediately |
| 3 | **Reads the style back** and returns `false` if `APPWINDOW` is still set | Turns a silent failure into a visible warning |

Uses the existing **`koffi`** dependency — same pattern already proven by
`applyWdaInvisibility()`. No new packages.

> [!WARNING]
> Step 3 was added because v1 *assumed* the write landed. If you see
> `WS_EX_APPWINDOW is STILL SET after write` in the console, the fix is **not** working and
> the icon **will** remain — that message is the signal, not a cosmetic log.

### Step 2 — Create hidden, style first, show last ([`main.ts`](../electron/main.ts))

**This is the v2 fix.** The window is constructed with `show: false`:

```ts
mainWindow = createMainWindow()          // show: false

mainWindow.once('ready-to-show', () => {
  hideFromTaskbar(mainWindow, 'main(ready-to-show)')   // styles FIRST
  mainWindow.show()                                     // reveal SECOND
})
```

**Why ordering matters:** if the window is visible when styles are applied, Windows has
already registered a taskbar button. A button that already exists is far harder to remove
than one that was never created. v1 applied styles to an already-visible window — that was
the v1 bug.

> [!NOTE]
> **Reveal safety net.** `show: false` means a missed `ready-to-show` would leave the window
> permanently hidden and the app looking completely broken. `did-finish-load` therefore
> checks `if (!mainWindow.isVisible())` and reveals the window via fallback — still applying
> `hideFromTaskbar()` **before** `show()`, so the ordering guarantee is preserved. Look for
> `[taskbar] ready-to-show did not fire — revealing via fallback` in the console; it is a
> warning, not an error.

### Step 3 — DevTools handler

```ts
mainWindow.webContents.on('devtools-opened', () => {
  const wc = mainWindow?.webContents?.devToolsWebContents
  if (!wc) return
  const dt = BrowserWindow.fromWebContents(wc)
  if (!dt) return
  dt.setSkipTaskbar(true)
  hideFromTaskbar(dt, 'devtools')
})
```

### Step 4 — Catch-all for every window

```ts
app.on('browser-window-created', (_event, win) => {
  win.setSkipTaskbar(true)
  hideFromTaskbar(win, 'auto')
  win.once('ready-to-show', () => {
    if (!win.isDestroyed()) hideFromTaskbar(win, 'auto(ready)')
  })
})
```

> [!NOTE]
> `browser-window-created` fires **before** the native window exists, so
> `getNativeWindowHandle()` can return an empty buffer. `hideFromTaskbar()` guards against
> this (`hwndBuf.length < 4` → return `false`) and the `ready-to-show` pass does the real
> work.

---

## Enforcement Layers (current, v2)

| Layer | Where | When |
|---|---|---|
| 1 | `createMainWindow()` → `hideFromTaskbar(win, 'main')` | At construction (window hidden) |
| 2 | `ready-to-show` → `hideFromTaskbar(...)` then `show()` | **The critical one** |
| 3 | `did-finish-load` → `hideFromTaskbar(..., 'main(post-load)')` | HWND fully realised (~500 ms) |
| 4 | `win.on('show')` → `hideFromTaskbar(..., 'main(re-show)')` | Every show — re-showing can restore `APPWINDOW` |
| 5 | `app.on('browser-window-created')` | **Every** window incl. DevTools |
| **6** | ***(v3, not applied)* focus/blur re-assert + 2 s watchdog** | **Continuous** |

Layers 1–5 are all **event-driven at startup**. None of them covers the **focus/blur**
transition, which is the suspected root cause. That is exactly the gap v3 fills.

---

## Verification

### ⚠️ This has NEVER been run with the app live

The one diagnostic attempt returned `RESULT: NO electron.exe process is running.` — the app
was not up, so **zero real Win32 style data has ever been captured.** Fix this first.

### Run the diagnostic

```powershell
# Terminal 1
Start.bat

# Terminal 2 — WHILE the app is running
powershell -ExecutionPolicy Bypass -File tools/check-taskbar.ps1
```

Read-only. It reads the real `WS_EX_APPWINDOW` / `WS_EX_TOOLWINDOW` bits off every
top-level window of every `electron.exe` process.

### Interpreting the result

| Output | Meaning | Action |
|---|---|---|
| `*** TASKBAR BUTTON - WS_EX_APPWINDOW IS SET ***` | The native fix did **not** land | Check `koffi` load errors; confirm `dist-electron/` is freshly emitted |
| `hidden from taskbar (WS_EX_TOOLWINDOW)` **but an icon is still visible** | The fix worked on that window — the icon belongs to **another** window (DevTools) or is a **stale shell entry** | Unpin the stale taskbar entry; restart Explorer |
| `top-level with no TOOLWINDOW -> MAY show a button` | Neither bit set | Should not happen — report it |

### The critical extra test (do this too)

Because the suspected cause is a **focus/blur** regression:

1. Start the app, confirm whether the icon is present.
2. **Click the overlay** (focus it), then look at the taskbar again.
3. **Click away** to another app (blur it), then look again.

If the icon **appears only after clicking**, that confirms the focus/blur root cause and
v3 is the correct fix. **Write down what you see at each of the three steps** — that is the
data that has been missing.

### Console output on a successful run

```
✓ [taskbar] main is a tool window (exStyle 0x... → 0x..., WS_EX_APPWINDOW stripped)
✓ [taskbar] main(ready-to-show) is a tool window (exStyle 0x... → 0x...)
✓ [taskbar] window revealed AFTER tool-window styles were applied
✓ [taskbar] devtools is a tool window (exStyle 0x... → 0x...)
```

`WS_EX_APPWINDOW stripped` confirms the root cause was present and was removed.

---

## Troubleshooting Checklist

Work through these **in order**:

1. **Confirm `dist-electron/` is fresh.**
   ```powershell
   npx tsc -p tsconfig.electron.json
   ```
   `electron-main.js` loads `dist-electron/main.js`, not the `.ts` sources.

2. **Run the diagnostic with the app live.** (See above.) Capture the actual `=>` lines.

3. **Do the focus/blur test.** Click the overlay, click away, watch the taskbar each time.

4. **Look for the `[taskbar]` console lines.** Missing entirely → stale build.
   `STILL SET` → the write is not landing.

5. **Task Manager ≠ taskbar.** The *process* legitimately appears in Task Manager. Only the
   taskbar button is suppressed. Task Manager cannot be hidden.

6. **Unpin stale entries.** Windows caches pinned buttons. Right-click the icon →
   *Unpin from taskbar*, then relaunch.

7. **Restart Explorer** to clear a stuck shell cache:
   ```powershell
   Stop-Process -Name explorer -Force   # Windows restarts it automatically
   ```

8. **Count the windows.** If `hideFromTaskbar` logs success but an icon remains, log
   `BrowserWindow.getAllWindows().length` — a window is being created outside the
   `browser-window-created` hook.

9. **Consider packaging.** A packaged build gets its own app identity and icon instead of
   the stock Electron one, removing the "Electron" entry the raw binary produces.
   `npm run build:electron` (slow — not for validation).

---

## Changelog

| Date | Change |
|---|---|
| 2026-10-14 (v3) | **Root cause hypothesis: Windows/DWM re-applies `WS_EX_APPWINDOW` on focus/blur**, so startup-only enforcement can never hold. Proposed `enforceTaskbarHiding()` (focus/blur/restore/show re-assert + 2 s read-only watchdog). **NOT APPLIED** — user asked for documentation only. Status set to 🔴 **STILL BROKEN**. |
| 2026-10-14 (v2) | **Found the v1 timing bug.** Window was `show()`n before styles were applied, so Windows registered the button first. Added `show: false` + `ready-to-show` → apply-then-reveal. Added style **read-back** assertion so failures are loud. Added `tools/check-taskbar.ps1` diagnostic. **User reported: still visible.** ❌ |
| 2026-10-14 (v1) | Native `WS_EX_TOOLWINDOW` / `WS_EX_APPWINDOW` + `SWP_FRAMECHANGED`. Added `devtools-opened` handler and `browser-window-created` catch-all. Re-enforced on `show`. **Insufficient.** ❌ |
| earlier | `skipTaskbar: true`, `win.setSkipTaskbar(true)`, `app.setAppUserModelId(...)`, `openDevTools({ mode: 'undocked' })` — all **insufficient** alone, kept as extra layers. ❌ |
